import { ArchipelagoClient, itemCount } from './ap-client.js';
import {
  BASE_TECHNIQUES, ITEM_NAMES_BY_ID, MODIFIER_ITEMS, UTILITY_ITEMS, locationId
} from '../shared/challenge-spec/index.js';

const client = new ArchipelagoClient();
const form = document.getElementById('connection-form');
const serverInput = document.getElementById('server');
const slotInput = document.getElementById('slot');
const passwordInput = document.getElementById('password');
const status = document.getElementById('connection-status');
const message = document.getElementById('connection-message');
const runContent = document.getElementById('run-content');
const trialGrid = document.getElementById('trial-grid');
const inventory = document.getElementById('inventory');
const activity = document.getElementById('activity');
const finalCard = document.getElementById('final-card');
const checkCount = document.getElementById('check-count');
const battleShell = document.getElementById('battle-shell');
const battleFrame = document.getElementById('battle-frame');
let latestState = null;
let activeBattleUrl = '';

const saved = ArchipelagoClient.savedConnection();
serverInput.value = saved.server || '';
slotInput.value = saved.slot || '';
passwordInput.value = ArchipelagoClient.savedPassword();

form.addEventListener('submit', async event => {
  event.preventDefault();
  closeBattle({ updateHistory: false });
  runContent.hidden = true;
  setConnecting(true);
  try {
    await client.connect({
      server: serverInput.value,
      slot: slotInput.value,
      password: passwordInput.value
    });
  } catch (error) {
    setError(error.message);
  } finally {
    setConnecting(false);
  }
});

client.addEventListener('connected', () => {
  status.textContent = 'Connected';
  status.className = 'status-pill is-online';
  message.textContent = `Connected as ${slotInput.value}. Your generated levels are ready.`;
  runContent.hidden = false;
  addActivity('Connected and synchronized with the room.');
  postBridgeState();
});
client.addEventListener('status', event => {
  if (event.detail.connected === false && !client.connected) {
    status.textContent = 'Reconnecting';
    status.className = 'status-pill';
    message.textContent = event.detail.message;
  }
});
client.addEventListener('state', event => {
  latestState = event.detail;
  renderState(event.detail);
  postBridgeState();
});
client.addEventListener('items', event => {
  event.detail.received.forEach(item => addActivity(`Received ${ITEM_NAMES_BY_ID[item.item] || `item ${item.item}`}.`));
});
client.addEventListener('message', event => {
  const text = event.detail.data.map(part => part.text || '').join('');
  if (text) addActivity(text);
});
client.addEventListener('error', event => setError(event.detail.error.message));
client.addEventListener('locations-sent', event => postToBattle({
  type: 'ggplot-ap-locations-sent',
  locations: event.detail.locations,
  connected: event.detail.connected
}));
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href^="/battle/"]');
  if (!link) return;
  event.preventDefault();
  openBattle(link.getAttribute('href'));
});

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin || event.source !== battleFrame.contentWindow) return;
  const message = event.data || {};
  if (message.type === 'ggplot-ap-bridge-ready') {
    postBridgeState();
  } else if (message.type === 'ggplot-ap-check-locations' && Array.isArray(message.locations)) {
    client.checkLocations(message.locations.map(Number).filter(Number.isFinite));
  } else if (message.type === 'ggplot-ap-complete-goal') {
    client.completeGoal();
  } else if (message.type === 'ggplot-ap-close-battle') {
    returnToDashboard();
  }
});

window.addEventListener('popstate', renderRoute);
renderRoute();

function renderState(state) {
  if (!state.slotData) return;
  const owned = state.itemNames;
  const checks = state.checkedLocations;
  const allInventory = [...BASE_TECHNIQUES, ...MODIFIER_ITEMS, ...UTILITY_ITEMS];
  inventory.replaceChildren(...allInventory.map(name => {
    const chip = document.createElement('span');
    const count = itemCount(owned, name);
    chip.className = `inventory-chip${count ? ' is-owned' : ''}`;
    chip.textContent = `${name}${count > 1 ? ` ×${count}` : ''}`;
    return chip;
  }));

  trialGrid.replaceChildren(...state.slotData.trials.map(spec => createTrialCard(spec, owned, checks)));
  const activeLocationIds = state.slotData.trials.flatMap(spec => [
    locationId(Number(spec.trialId), 'Structure'),
    ...state.slotData.score_thresholds.map(score => locationId(Number(spec.trialId), score))
  ]);
  const checkedCount = activeLocationIds.filter(id => checks.has(id)).length;
  checkCount.textContent = `${checkedCount} / ${activeLocationIds.length} checks`;
  renderFinal(state.slotData.final, owned);
}

function createTrialCard(spec, owned, checked) {
  const missing = spec.requiredItems.filter(item => !owned.includes(item));
  const card = document.createElement('article');
  card.className = `trial-card${missing.length ? ' is-locked' : ''}`;
  const heading = document.createElement('div');
  heading.className = 'trial-meta';
  heading.innerHTML = `<div><p class="eyebrow">Level ${spec.trialId}</p><h3>${escapeHtml(levelTitle(spec.brief.title))}</h3></div><span class="inventory-chip">${escapeHtml(spec.technique)}</span>`;
  const description = document.createElement('p');
  const observationCount = spec.dataset.kind === 'timeseries' && spec.dataset.grouped
    ? spec.dataset.rows * 2
    : spec.dataset.rows;
  description.textContent = `${observationCount} synthetic observations · ${spec.plot.theme.replace('theme_', '')} theme`;
  const milestones = document.createElement('div');
  milestones.className = 'checks';
  ['Structure', ...client.slotData.score_thresholds].forEach(milestone => {
    const chip = document.createElement('span');
    chip.className = `check-chip${checked.has(locationId(Number(spec.trialId), milestone)) ? ' is-done' : ''}`;
    chip.textContent = milestone === 'Structure' ? milestone : `${milestone}%`;
    milestones.appendChild(chip);
  });
  card.append(heading, description, milestones);
  if (missing.length) {
    const lock = document.createElement('span');
    lock.className = 'trial-lock';
    lock.textContent = `Requires ${missing.join(' + ')}`;
    card.appendChild(lock);
  } else {
    const link = document.createElement('a');
    link.className = 'trial-link';
    link.href = `/battle/?trial=${spec.trialId}`;
    link.textContent = 'Open level';
    card.appendChild(link);
  }
  return card;
}

function renderFinal(spec, owned) {
  const baseOwned = BASE_TECHNIQUES.filter(item => owned.includes(item)).length;
  const modifierOwned = MODIFIER_ITEMS.slice(0, -1).filter(item => owned.includes(item)).length;
  const missing = [];
  if (!owned.includes('Exhibition Invitation')) missing.push('Exhibition Invitation');
  if (!owned.includes('Composition')) missing.push('Composition');
  if (baseOwned < 4) missing.push(`${4 - baseOwned} more base technique${baseOwned === 3 ? '' : 's'}`);
  if (modifierOwned < 3) missing.push(`${3 - modifierOwned} more modifier${modifierOwned === 2 ? '' : 's'}`);
  finalCard.innerHTML = `<p class="eyebrow">Goal</p><h3>${escapeHtml(spec.brief.title)}</h3><p>${escapeHtml(spec.brief.description)}</p>`;
  if (missing.length) {
    const lock = document.createElement('p');
    lock.className = 'trial-lock';
    lock.textContent = `Locked: ${missing.join(', ')}`;
    finalCard.appendChild(lock);
  } else {
    const link = document.createElement('a');
    link.className = 'final-link';
    link.href = '/battle/?trial=final';
    link.textContent = 'Enter final exhibition';
    finalCard.appendChild(link);
  }
}

function setConnecting(value) {
  document.getElementById('connect-button').disabled = value;
  status.textContent = value ? 'Connecting…' : (client.connected ? 'Connected' : 'Offline');
  if (value) status.className = 'status-pill';
}

function setError(text) {
  status.textContent = 'Connection error';
  status.className = 'status-pill is-error';
  message.textContent = text;
}

function addActivity(text) {
  const item = document.createElement('li');
  item.textContent = text;
  activity.prepend(item);
  while (activity.children.length > 12) activity.lastElementChild.remove();
}

function openBattle(href, { updateHistory = true } = {}) {
  const url = new URL(href, window.location.origin);
  const route = `${url.pathname}${url.search}`;
  if (activeBattleUrl !== route) {
    activeBattleUrl = route;
    battleFrame.src = route;
  }
  battleShell.hidden = false;
  document.body.classList.add('is-battle-route');
  if (updateHistory && `${window.location.pathname}${window.location.search}` !== route) {
    window.history.pushState({ battle: route }, '', route);
  }
}

function closeBattle({ updateHistory = true } = {}) {
  battleShell.hidden = true;
  document.body.classList.remove('is-battle-route');
  if (updateHistory && window.location.pathname.startsWith('/battle')) {
    window.history.pushState({}, '', '/');
  }
}

function returnToDashboard() {
  if (window.history.state?.battle) {
    window.history.back();
  } else {
    closeBattle();
  }
}

function renderRoute() {
  if (window.location.pathname.startsWith('/battle')) {
    openBattle(`${window.location.pathname}${window.location.search}`, { updateHistory: false });
  } else {
    closeBattle({ updateHistory: false });
  }
}

function postBridgeState() {
  if (!latestState) return;
  postToBattle({
    type: 'ggplot-ap-state',
    state: {
      connected: latestState.connected,
      itemNames: latestState.itemNames,
      checkedLocations: [...latestState.checkedLocations],
      pendingLocations: [...latestState.pendingLocations]
    }
  });
}

function postToBattle(message) {
  if (!battleFrame.contentWindow || !activeBattleUrl) return;
  battleFrame.contentWindow.postMessage(message, window.location.origin);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function levelTitle(value) {
  return String(value).replace(/^Trial\b/, 'Level');
}
