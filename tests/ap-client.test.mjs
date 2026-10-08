import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchipelagoClient } from '../archipelago/dist/src/ap-client.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function prepareClient(seedName) {
  const sent = [];
  const client = new ArchipelagoClient();
  client.endpoint = 'wss://example.test:38281';
  client.slot = 'Plotter';
  client.shouldReconnect = true;
  client.emit = () => {};
  client.socket = {
    readyState: 1,
    send: value => sent.push(JSON.parse(value)[0]),
    close() { this.closed = true; }
  };
  client.handlePacket({ cmd: 'RoomInfo', seed_name: seedName }, () => {}, () => {});
  return { client, sent };
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.WebSocket = { OPEN: 1 };
});

test('cached items and goals are isolated by room seed identity', () => {
  const first = prepareClient('Seed A');
  first.client.handlePacket({
    cmd: 'ReceivedItems', index: 0, items: [{ item: 4970001, location: 1, player: 1 }]
  }, () => {}, () => {});
  first.client.completeGoal();

  const sameRoom = prepareClient('Seed A');
  assert.equal(sameRoom.client.items.length, 1);
  assert.equal(sameRoom.client.goalPending, true);

  const nextRoom = prepareClient('Seed B');
  assert.deepEqual(nextRoom.client.items, []);
  assert.equal(nextRoom.client.goalPending, false);
});

test('connection refusal disables reconnect and closes the socket', () => {
  const { client } = prepareClient('Seed A');
  let rejected;
  client.handlePacket({ cmd: 'ConnectionRefused', errors: ['InvalidPassword'] }, () => {}, error => { rejected = error; });
  assert.match(rejected.message, /InvalidPassword/);
  assert.equal(client.shouldReconnect, false);
  assert.equal(client.socket.closed, true);
});

test('an item index gap requests an authoritative synchronization', () => {
  const { client, sent } = prepareClient('Seed A');
  client.handlePacket({ cmd: 'ReceivedItems', index: 3, items: [{ item: 4970001 }] }, () => {}, () => {});
  assert.equal(sent.at(-1).cmd, 'Sync');
  assert.deepEqual(client.items, []);
});
