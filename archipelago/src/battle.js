import { ArchipelagoClient, cachedSlotDataForCurrentConnection, formatLocation } from './ap-client.js';
import {
  compileChallengeSource,
  compileFinalChallengeSource,
  ITEM_NAMES_BY_ID,
  locationId
} from '../shared/challenge-spec/index.js';

const query = new URLSearchParams(location.search);
const trialId = query.get('trial') || '1';
const slotData = cachedSlotDataForCurrentConnection();
const alert = document.getElementById('battle-alert');
const roomStatus = document.getElementById('battle-room-status');
const drawer = document.getElementById('check-drawer');
const drawerBackdrop = document.getElementById('check-drawer-backdrop');
const drawerSummary = document.getElementById('check-drawer-summary');
const logicList = document.getElementById('check-logic-list');
const locationList = document.getElementById('check-location-list');
const eventLog = document.getElementById('check-event-log');
let currentSpec = null;
let currentStructureEvaluation = null;
let currentPixelScore = null;
let goalSent = false;
let currentClientState = { checkedLocations: new Set(), pendingLocations: new Set() };
const checkEvents = [];

initializeBattle();

function initializeBattle() {
  if (!slotData) {
    showFatal('No generated room data is available. Return to the trial dashboard and connect first.');
    return;
  }
  const spec = trialId === 'final'
    ? slotData.final
    : slotData.trials.find(value => String(value.trialId) === trialId);
  if (!spec) {
    showFatal(`Trial ${trialId} does not exist in this seed.`);
    return;
  }
    currentSpec = spec;
    setupCheckDrawer();
    const receivedNames = ArchipelagoClient.savedItems()
      .map(item => ITEM_NAMES_BY_ID[item.item])
      .filter(Boolean);
    receivedNames.push(slotData.opening_technique);
    const missingRequirements = trialId === 'final'
      ? finalMissingRequirements(receivedNames)
      : spec.requiredItems.filter(item => !receivedNames.includes(item));
    if (missingRequirements.length) {
      showFatal(`This trial is still locked. Missing: ${missingRequirements.join(', ')}.`);
      return;
    }
    applyUtilityGates(receivedNames);
    const hasStarterScaffold = receivedNames.includes('Starter Scaffold');
    const hintLevel = receivedNames.filter(item => item === 'Hint Book').length;
    window.ggplotBattleChallengeProvider = {
      getChallengeId: () => `ap-${trialId}`,
      loadChallengeSource: () => {
        const source = trialId === 'final'
          ? compileFinalChallengeSource(spec)
          : compileChallengeSource(spec);
        const hintedSource = decorateSourceWithHints(source, spec, hintLevel);
        return hasStarterScaffold
          ? hintedSource
          : hintedSource.replace(/^#\| stub:.*$/m, '#| stub: "library(ggplot2)\\\\nggplot()"');
      },
      evaluateStructure: features => {
        const predicates = trialId === 'final'
          ? [{ match: 'regex', value: '^grob:.*:panel', minimum: 2 }]
          : spec.predicates;
        return window.GgplotBattleCore.evaluatePredicates(features, predicates);
      }
    };
    document.title = `${spec.brief.title} — ggplot Battles`;
    startEditor();
    connectAndScore(spec);
}

async function connectAndScore(spec) {
  const saved = ArchipelagoClient.savedConnection();
  const client = new ArchipelagoClient();
  client.addEventListener('connected', () => {
    roomStatus.textContent = 'Connected';
    roomStatus.className = 'status-pill is-online';
    addCheckEvent('Connected and synchronized with the Archipelago server.');
  });
  client.addEventListener('status', event => {
    if (event.detail.connected === false && !client.connected) {
      roomStatus.textContent = 'Reconnecting…';
      roomStatus.className = 'status-pill';
    }
  });
  client.addEventListener('items', event => {
    applyUtilityGates(event.detail.items.map(item => ITEM_NAMES_BY_ID[item.item]).filter(Boolean));
  });
  client.addEventListener('state', event => {
    currentClientState = event.detail;
    renderCheckDrawer();
  });
  client.addEventListener('locations-sent', event => {
    const verb = event.detail.connected ? 'Sent' : 'Queued';
    event.detail.locations.forEach(id => addCheckEvent(`${verb}: ${formatLocation(id)}.`));
  });
  client.addEventListener('locations-confirmed', event => {
    event.detail.locations.forEach(id => addCheckEvent(`Confirmed: ${formatLocation(id)}.`));
  });
  client.addEventListener('error', event => {
    roomStatus.textContent = 'Offline scoring';
    roomStatus.className = 'status-pill is-error';
    showNotice(event.detail.error.message);
  });
  document.addEventListener('battle-score-updated', event => {
    currentPixelScore = Number(event.detail.pixelScore);
    currentStructureEvaluation = event.detail.structureEvaluation || {
      satisfied: Boolean(event.detail.structureSatisfied), results: []
    };
    addCheckEvent(`${currentPixelScore.toFixed(2)}% visual match; structure ${event.detail.structureSatisfied ? 'satisfied' : 'not satisfied'}.`);
    renderCheckDrawer();
    if (!event.detail.structureSatisfied) return;
    if (trialId === 'final') {
      if (event.detail.pixelScore >= spec.thresholds.match) {
        try {
          client.completeGoal();
          if (!goalSent) addCheckEvent('Sent: final exhibition goal.');
          goalSent = true;
          renderCheckDrawer();
        } catch (error) { showNotice(error.message); }
      }
      return;
    }
    const numericTrial = Number(spec.trialId);
    const checks = [locationId(numericTrial, 'Structure')];
    slotData.score_thresholds.forEach(score => {
      if (event.detail.pixelScore >= score) checks.push(locationId(numericTrial, score));
    });
    try { client.checkLocations(checks); } catch (error) { showNotice(error.message); }
  });
  try {
    await client.connect({ ...saved, password: ArchipelagoClient.savedPassword() });
  } catch (error) {
    roomStatus.textContent = 'Offline scoring';
    roomStatus.className = 'status-pill is-error';
    showNotice(`${error.message} You may keep working, but checks require a connection.`);
  }

}

function setupCheckDrawer() {
  document.getElementById('check-drawer-toggle')?.addEventListener('click', openCheckDrawer);
  document.getElementById('check-drawer-close')?.addEventListener('click', closeCheckDrawer);
  drawerBackdrop?.addEventListener('click', closeCheckDrawer);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer?.classList.contains('is-open')) closeCheckDrawer();
  });
  renderCheckDrawer();
}

function openCheckDrawer() {
  drawerBackdrop.hidden = false;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.removeAttribute('inert');
  document.getElementById('check-drawer-toggle')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  document.getElementById('check-drawer-close')?.focus();
}

function closeCheckDrawer() {
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('inert', '');
  drawerBackdrop.hidden = true;
  document.getElementById('check-drawer-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');
}

function renderCheckDrawer() {
  if (!currentSpec || !logicList || !locationList) return;
  const predicates = trialId === 'final'
    ? [{ match: 'regex', value: '^grob:.*:panel', minimum: 2 }]
    : currentSpec.predicates;
  const results = currentStructureEvaluation?.results || [];
  logicList.replaceChildren(...predicates.map((predicate, index) => {
    const item = document.createElement('li');
    const result = results[index];
    item.className = `check-logic-item${result ? (result.satisfied ? ' is-met' : ' is-missing') : ''}`;
    item.textContent = describePredicate(predicate);
    item.title = `${predicate.match}: ${predicate.value}`;
    return item;
  }));

  if (trialId === 'final') {
    const row = makeCheckRow(`Final goal (${currentSpec.thresholds.match}% + structure)`, goalSent ? 'Sent' : checkLocalStatus(currentSpec.thresholds.match));
    if (goalSent) row.classList.add('is-confirmed');
    locationList.replaceChildren(row);
    drawerSummary.textContent = goalSent ? '1/1' : '0/1';
    renderCheckEvents();
    return;
  }

  const numericTrial = Number(currentSpec.trialId);
  const definitions = [
    { name: 'Structure', id: locationId(numericTrial, 'Structure'), threshold: null },
    ...slotData.score_thresholds.map(score => ({ name: `${score}% Match`, id: locationId(numericTrial, score), threshold: score }))
  ];
  const checked = currentClientState.checkedLocations || new Set();
  const pending = currentClientState.pendingLocations || new Set();
  locationList.replaceChildren(...definitions.map(definition => {
    let status = checkLocalStatus(definition.threshold);
    if (pending.has(definition.id)) status = 'Sending';
    if (checked.has(definition.id)) status = 'Confirmed';
    const row = makeCheckRow(definition.name, status);
    if (checked.has(definition.id)) row.classList.add('is-confirmed');
    else if (pending.has(definition.id)) row.classList.add('is-pending');
    return row;
  }));
  drawerSummary.textContent = `${definitions.filter(definition => checked.has(definition.id)).length}/${definitions.length}`;
  renderCheckEvents();
}

function checkLocalStatus(threshold) {
  if (!currentStructureEvaluation) return 'Not evaluated';
  if (!currentStructureEvaluation.satisfied) return 'Needs structure';
  if (threshold === null || currentPixelScore >= threshold) return 'Met locally';
  return 'Not met';
}

function makeCheckRow(name, status) {
  const row = document.createElement('div');
  row.className = 'check-location-row';
  if (status === 'Met locally') row.classList.add('is-met');
  if (status === 'Needs structure') row.classList.add('is-blocked');
  const label = document.createElement('span');
  label.textContent = name;
  const value = document.createElement('span');
  value.className = 'check-location-status';
  value.textContent = status;
  row.append(label, value);
  return row;
}

function describePredicate(predicate) {
  const value = predicate.value || '';
  const geom = value.match(/:geom:Geom([A-Za-z]+)/)?.[1];
  if (geom) return `Include ${splitCamelCase(geom).toLowerCase()} layer${(predicate.minimum || 1) > 1 ? 's' : ''}`;
  if (value.includes('FacetWrap')) return 'Use faceting';
  if (value.includes('Coord(Flip|Polar)')) return 'Use flipped or polar coordinates';
  if (value.includes(':transform:')) return 'Use the required scale transformation';
  if (value.startsWith('^grob:.*:panel')) return `Render at least ${predicate.minimum || 1} composed panels`;
  return `Match ${value}`;
}

function splitCamelCase(value) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function addCheckEvent(message) {
  checkEvents.unshift({ message, time: new Date() });
  checkEvents.splice(30);
  renderCheckEvents();
}

function renderCheckEvents() {
  if (!eventLog) return;
  if (!checkEvents.length) {
    const empty = document.createElement('li');
    empty.className = 'check-event-empty';
    empty.textContent = 'No checks have been evaluated in this session.';
    eventLog.replaceChildren(empty);
    return;
  }
  eventLog.replaceChildren(...checkEvents.map(entry => {
    const item = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.append(time, document.createTextNode(entry.message));
    return item;
  }));
}

function applyUtilityGates(items) {
  const style = document.createElement('style');
  const rules = [];
  if (!items.includes('Diff Lens')) rules.push('.diff-toggle{display:none!important}');
  if (!items.includes('Data Inspector')) rules.push('#variables-tab{display:none!important}');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  const swatches = items.filter(item => item.startsWith('Colour Swatch')).length;
  if (swatches) {
    const accents = ['#0dcaf0', '#20c997', '#845ef7', '#ff922b', '#3a86ff', '#ff006e', '#2a9d8f', '#e76f51', '#e9c46a'];
    document.documentElement.style.setProperty('--battle-info', accents[(swatches - 1) % accents.length]);
  }
}

function decorateSourceWithHints(source, spec, level) {
  if (!level) return source;
  const panels = spec.panels || [spec];
  const techniques = [...new Set(panels.map(panel => panel.technique))].join(' and ');
  let hint = ` Hint: this target uses ${techniques}.`;
  if (level > 1) {
    const layers = [...new Set(panels.flatMap(panel => panel.plot.layers.map(layer => layer.geom)))].join(', ');
    const modifiers = [...new Set(panels.flatMap(panel => panel.requiredItems.slice(1)))].join(', ');
    hint += ` Its principal layers are ${layers}${modifiers ? `, with ${modifiers}` : ''}.`;
  }
  const description = `${spec.brief.description}${hint}`;
  return source.replace(/^#\| description:.*$/m, `#| description: ${JSON.stringify(description)}`);
}

function finalMissingRequirements(items) {
  const missing = ['Exhibition Invitation', 'Composition'].filter(item => !items.includes(item));
  const base = ['Points', 'Distributions', 'Categorical', 'Lines', 'Intervals'].filter(item => items.includes(item)).length;
  const modifiers = ['Faceting', 'Scale Transformations', 'Coordinate Systems', 'Annotations'].filter(item => items.includes(item)).length;
  if (base < 4) missing.push(`${4 - base} more base technique${base === 3 ? '' : 's'}`);
  if (modifiers < 3) missing.push(`${3 - modifiers} more modifier${modifiers === 2 ? '' : 's'}`);
  return missing;
}

async function startEditor() {
  for (const source of ['/js/description.js', '/js/comparison.js', '/js/fileextensions.js', '/js/utils.js', '/js/code-editor.js']) {
    await loadScript(source);
  }
}

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${source}`));
    document.body.appendChild(script);
  });
}

function showFatal(message) {
  showNotice(message);
  document.querySelector('editor-viewer')?.remove();
  document.getElementById('spinner')?.remove();
}

function showNotice(message) {
  alert.hidden = false;
  alert.textContent = message;
}
