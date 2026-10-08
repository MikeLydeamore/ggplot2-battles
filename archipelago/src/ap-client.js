import {
  GAME_NAME,
  ITEM_NAMES_BY_ID,
  LOCATION_NAMES_BY_ID,
  SCHEMA_VERSION,
  GENERATOR_VERSION,
  SLOT_DATA_VERSION,
  WEB_APP_VERSION,
  validateChallengeSpec
} from '../shared/challenge-spec/index.js';

const CONNECTION_KEY = 'ggplot-ap-connection-v1';
const PASSWORD_KEY = 'ggplot-ap-password-v1';
const UUID_KEY = 'ggplot-ap-uuid-v1';
const SLOT_DATA_KEY = 'ggplot-ap-slot-data-v1';
const PENDING_GOAL_KEY = 'ggplot-ap-pending-goal-v2';

export class ArchipelagoClient extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.connected = false;
    this.endpoint = '';
    this.slot = '';
    this.password = '';
    this.slotData = null;
    this.items = [];
    this.checkedLocations = new Set();
    this.pendingLocations = new Set();
    this.connectPromise = null;
    this.connectionConfig = null;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.roomIdentity = '';
    this.goalPending = false;
  }

  static savedConnection() {
    try { return JSON.parse(localStorage.getItem(CONNECTION_KEY) || '{}'); } catch { return {}; }
  }

  static savedSlotData() {
    try { return JSON.parse(localStorage.getItem(SLOT_DATA_KEY) || 'null'); } catch { return null; }
  }

  static savedPassword() {
    return sessionStorage.getItem(PASSWORD_KEY) || '';
  }

  static savedItems() {
    const connection = this.savedConnection();
    const cached = this.savedSlotData();
    const endpoint = normalizeEndpoint(connection.server);
    const slot = connection.slot || '';
    if (!cached || cached.endpoint !== endpoint || cached.slot !== slot || !cached.roomIdentity) return [];
    return readStoredItems(endpoint, slot, cached.roomIdentity);
  }

  async connect({ server, slot, password = '' }) {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.endpoint = normalizeEndpoint(server);
    this.slot = String(slot || '').trim();
    this.password = password;
    if (!this.endpoint || !this.slot) throw new Error('Server and slot name are required.');
    this.roomIdentity = '';
    this.slotData = null;
    this.items = [];
    this.checkedLocations = new Set();
    this.pendingLocations = new Set();
    this.goalPending = false;
    this.connectionConfig = { server, slot: this.slot, password };
    this.shouldReconnect = true;
    localStorage.setItem(CONNECTION_KEY, JSON.stringify({ server, slot: this.slot }));
    sessionStorage.setItem(PASSWORD_KEY, password);

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      const timeout = window.setTimeout(() => reject(new Error('Connection timed out.')), 15000);
      socket.addEventListener('open', () => this.emit('status', { message: 'Socket open; waiting for room information.' }));
      socket.addEventListener('message', event => {
        try {
          const packets = JSON.parse(event.data);
          (Array.isArray(packets) ? packets : [packets]).forEach(packet => this.handlePacket(packet, resolve, reject));
        } catch (error) {
          this.emit('error', { error });
        }
      });
      socket.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error('Unable to reach the Archipelago server.'));
      }, { once: true });
      socket.addEventListener('close', () => {
        window.clearTimeout(timeout);
        this.connected = false;
        this.emit('status', { message: 'Disconnected.', connected: false });
        this.emit('state', this.state());
        if (this.socket === socket) {
          this.socket = null;
          this.scheduleReconnect();
        }
      });
      this.addEventListener('connected', () => window.clearTimeout(timeout), { once: true });
    });
    return this.connectPromise;
  }

  disconnect() {
    this.shouldReconnect = false;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  handlePacket(packet, resolve, reject) {
    if (packet.cmd === 'RoomInfo') {
      this.roomIdentity = String(packet.seed_name || '').trim();
      if (!this.roomIdentity) {
        const error = new Error('The Archipelago server did not provide a room seed identity.');
        this.shouldReconnect = false;
        reject(error);
        this.emit('error', { error });
        this.socket?.close();
        return;
      }
      const cached = ArchipelagoClient.savedSlotData();
      if (cached && cached.endpoint === this.endpoint && cached.slot === this.slot &&
          cached.roomIdentity && cached.roomIdentity !== this.roomIdentity) {
        localStorage.removeItem(SLOT_DATA_KEY);
      }
      this.items = readStoredItems(this.endpoint, this.slot, this.roomIdentity);
      this.pendingLocations = new Set(readStoredPending(this.endpoint, this.slot, this.roomIdentity));
      this.goalPending = localStorage.getItem(goalStorageKey(this.endpoint, this.slot, this.roomIdentity)) === 'true';
      this.send({
        cmd: 'Connect', game: GAME_NAME, name: this.slot, password: this.password,
        uuid: getUuid(), items_handling: 7, slot_data: true, tags: ['AP'],
        version: { major: 0, minor: 6, build: 0, class: 'Version' }
      });
      return;
    }
    if (packet.cmd === 'ConnectionRefused') {
      const error = new Error(`Connection refused: ${(packet.errors || []).join(', ') || 'unknown reason'}`);
      this.shouldReconnect = false;
      reject(error);
      this.emit('error', { error });
      this.socket?.close();
      return;
    }
    if (packet.cmd === 'Connected') {
      try {
        assertCompatibleSlotData(packet.slot_data);
      } catch (error) {
        this.shouldReconnect = false;
        reject(error);
        this.emit('error', { error });
        this.socket?.close();
        return;
      }
      this.connected = true;
      this.reconnectAttempts = 0;
      this.slotData = packet.slot_data;
      this.checkedLocations = new Set(packet.checked_locations || []);
      this.removeConfirmedPending();
      localStorage.setItem(SLOT_DATA_KEY, JSON.stringify({
        endpoint: this.endpoint, slot: this.slot, roomIdentity: this.roomIdentity, data: this.slotData
      }));
      this.emit('connected', { slotData: this.slotData });
      this.emit('state', this.state());
      this.flushPending();
      resolve(this.state());
      return;
    }
    if (packet.cmd === 'ReceivedItems') {
      const index = Number(packet.index) || 0;
      if (index > this.items.length) {
        this.emit('status', { message: 'Received an out-of-sequence item packet; requesting synchronization.' });
        this.send({ cmd: 'Sync' });
        return;
      }
      this.items.splice(index, this.items.length - index, ...(packet.items || []));
      storeItems(this.endpoint, this.slot, this.roomIdentity, this.items);
      this.emit('items', { items: this.items, received: packet.items || [] });
      this.emit('state', this.state());
      return;
    }
    if (packet.cmd === 'RoomUpdate' && Array.isArray(packet.checked_locations)) {
      const confirmed = packet.checked_locations.filter(id => !this.checkedLocations.has(id));
      packet.checked_locations.forEach(id => this.checkedLocations.add(id));
      this.removeConfirmedPending();
      if (confirmed.length) this.emit('locations-confirmed', { locations: confirmed });
      this.emit('state', this.state());
      return;
    }
    if (packet.cmd === 'PrintJSON') this.emit('message', { data: packet.data || [] });
  }

  send(packet) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify([packet]));
    return true;
  }

  checkLocations(ids) {
    const fresh = ids.filter(id => !this.checkedLocations.has(id) && !this.pendingLocations.has(id));
    if (!fresh.length) return [];
    fresh.forEach(id => this.pendingLocations.add(id));
    storePending(this.endpoint, this.slot, this.roomIdentity, this.pendingLocations);
    this.flushPending();
    this.emit('locations-sent', { locations: fresh, connected: this.connected });
    this.emit('state', this.state());
    return fresh;
  }

  completeGoal() {
    this.goalPending = true;
    if (this.roomIdentity) {
      localStorage.setItem(goalStorageKey(this.endpoint, this.slot, this.roomIdentity), 'true');
    }
    if (this.connected) this.send({ cmd: 'StatusUpdate', status: 30 });
  }

  ownedItemNames() {
    const names = this.items.map(item => ITEM_NAMES_BY_ID[item.item]).filter(Boolean);
    if (this.slotData?.opening_technique && !names.includes(this.slotData.opening_technique)) {
      names.push(this.slotData.opening_technique);
    }
    return names;
  }

  state() {
    return {
      connected: this.connected,
      slotData: this.slotData,
      items: this.items,
      itemNames: this.ownedItemNames(),
      checkedLocations: new Set(this.checkedLocations),
      pendingLocations: new Set(this.pendingLocations)
    };
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  flushPending() {
    if (!this.connected) return;
    if (this.pendingLocations.size) {
      this.send({ cmd: 'LocationChecks', locations: [...this.pendingLocations] });
    }
    if (this.goalPending) {
      this.send({ cmd: 'StatusUpdate', status: 30 });
    }
  }

  removeConfirmedPending() {
    this.checkedLocations.forEach(id => this.pendingLocations.delete(id));
    storePending(this.endpoint, this.slot, this.roomIdentity, this.pendingLocations);
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || !this.connectionConfig || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * (2 ** this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.emit('status', { message: `Reconnecting in ${Math.ceil(delay / 1000)}s…`, connected: false });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.connectionConfig).catch(error => {
        this.emit('error', { error });
        this.scheduleReconnect();
      });
    }, delay);
  }
}

export function cachedSlotDataForCurrentConnection() {
  const connection = ArchipelagoClient.savedConnection();
  const cached = ArchipelagoClient.savedSlotData();
  if (!cached || cached.slot !== connection.slot || cached.endpoint !== normalizeEndpoint(connection.server)) return null;
  return cached.data;
}

export function itemCount(names, item) {
  return names.filter(name => name === item).length;
}

export function formatLocation(id) {
  return LOCATION_NAMES_BY_ID[id] || `Location ${id}`;
}

function normalizeEndpoint(server) {
  let value = String(server || '').trim();
  if (!value) return '';
  if (value.startsWith('https://')) return `wss://${value.slice(8)}`;
  if (value.startsWith('http://')) return `ws://${value.slice(7)}`;
  if (value.startsWith('ws://') || value.startsWith('wss://')) return value;
  return `${/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(value) ? 'ws' : 'wss'}://${value}`;
}

function getUuid() {
  let uuid = localStorage.getItem(UUID_KEY);
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem(UUID_KEY, uuid);
  }
  return uuid;
}

function itemStorageKey(endpoint, slot, roomIdentity) {
  return `ggplot-ap-received-v2:${endpoint}:${slot}:${roomIdentity}`;
}

function readStoredItems(endpoint, slot, roomIdentity) {
  try { return JSON.parse(localStorage.getItem(itemStorageKey(endpoint, slot, roomIdentity)) || '[]'); } catch { return []; }
}

function storeItems(endpoint, slot, roomIdentity, items) {
  localStorage.setItem(itemStorageKey(endpoint, slot, roomIdentity), JSON.stringify(items));
}

function pendingStorageKey(endpoint, slot, roomIdentity) {
  return `ggplot-ap-pending-locations-v2:${endpoint}:${slot}:${roomIdentity}`;
}

function readStoredPending(endpoint, slot, roomIdentity) {
  try { return JSON.parse(localStorage.getItem(pendingStorageKey(endpoint, slot, roomIdentity)) || '[]'); } catch { return []; }
}

function storePending(endpoint, slot, roomIdentity, locations) {
  if (!roomIdentity) return;
  localStorage.setItem(pendingStorageKey(endpoint, slot, roomIdentity), JSON.stringify([...locations]));
}

function goalStorageKey(endpoint, slot, roomIdentity) {
  return `${PENDING_GOAL_KEY}:${endpoint}:${slot}:${roomIdentity}`;
}

function assertCompatibleSlotData(slotData) {
  if (!slotData || slotData.slot_data_version !== SLOT_DATA_VERSION ||
      slotData.schema_version !== SCHEMA_VERSION || slotData.generator_version !== GENERATOR_VERSION ||
      !Array.isArray(slotData.score_thresholds)) {
    throw new Error(`This room uses an unsupported challenge format. Expected slot data ${SLOT_DATA_VERSION}, schema ${SCHEMA_VERSION}, generator ${GENERATOR_VERSION}.`);
  }
  if (compareVersions(WEB_APP_VERSION, slotData.web_app_min_version || '0.0.0') < 0) {
    throw new Error(`This room requires web app ${slotData.web_app_min_version} or newer; this client is ${WEB_APP_VERSION}.`);
  }
  if (!Array.isArray(slotData.trials) || slotData.trials.length !== 8) {
    throw new Error('This room does not contain exactly eight generated levels.');
  }
  if (!slotData.score_thresholds.every(score => Number.isInteger(score) && score >= 80 && score <= 100)) {
    throw new Error('This room contains invalid score thresholds.');
  }
  for (const spec of slotData.trials) assertValidSpec(spec, `Level ${spec?.trialId ?? '?'}`);
  if (!Array.isArray(slotData.final?.panels) || slotData.final.panels.length !== 2) {
    throw new Error('This room contains an invalid final exhibition.');
  }
  slotData.final.panels.forEach((spec, index) => assertValidSpec(spec, `Final panel ${index + 1}`));
}

function assertValidSpec(spec, label) {
  const validation = validateChallengeSpec(spec);
  if (!validation.valid) throw new Error(`${label} is invalid: ${validation.errors.join(' ')}`);
}

function compareVersions(left, right) {
  const parts = value => String(value).split('.').map(part => Number.parseInt(part, 10) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
