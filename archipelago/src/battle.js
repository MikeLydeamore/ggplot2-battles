import { ArchipelagoClient, cachedSlotDataForCurrentConnection } from './ap-client.js';
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
  client.addEventListener('error', event => {
    roomStatus.textContent = 'Offline scoring';
    roomStatus.className = 'status-pill is-error';
    showNotice(event.detail.error.message);
  });
  document.addEventListener('battle-score-updated', event => {
    if (!event.detail.structureSatisfied) return;
    if (trialId === 'final') {
      if (event.detail.pixelScore >= spec.thresholds.match) {
        try { client.completeGoal(); } catch (error) { showNotice(error.message); }
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
