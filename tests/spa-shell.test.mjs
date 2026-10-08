import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('dashboard owns the persistent AP connection and battle frame', async () => {
  const [html, dashboard] = await Promise.all([
    read('../archipelago/site/index.html'),
    read('../archipelago/src/dashboard.js')
  ]);
  assert.match(html, /id="battle-frame"/);
  assert.equal((dashboard.match(/new ArchipelagoClient\(/g) || []).length, 1);
  assert.match(dashboard, /ggplot-ap-check-locations/);
  assert.match(dashboard, /window\.history\.pushState/);
});

test('embedded battles use the shell bridge before standalone connection code', async () => {
  const battle = await read('../archipelago/src/battle.js');
  const bridgeGuard = battle.indexOf('if (embeddedInShell)');
  const standaloneClient = battle.indexOf('new ArchipelagoClient()');
  assert.ok(bridgeGuard >= 0);
  assert.ok(standaloneClient > bridgeGuard);
  assert.match(battle, /ggplot-ap-bridge-ready/);
  assert.match(battle, /ggplot-ap-complete-goal/);
  assert.match(battle, /querySelectorAll\('a\[href="\/"\]'\)/);
  assert.match(battle, /ggplot-ap-close-battle/);
});
