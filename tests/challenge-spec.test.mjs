import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StableRandom, compileChallengeSource, compileFinalChallengeSource, compilePlotR, locationId, locationName,
  materializeDataset, validateChallengeSpec
} from '../packages/challenge-spec/index.js';

const SPEC = {
  schemaVersion: 1,
  generatorVersion: 2,
  trialId: 1,
  seed: 123456,
  technique: 'Points',
  dataset: {
    kind: 'correlated', name: 'trial_1_data', rows: 48, groups: ['A', 'B'],
    slope: 1.2, trend: 0.1, seasonality: 2, grouped: true
  },
  plot: {
    mapping: { x: 'x', y: 'y', colour: 'group' },
    layers: [{ geom: 'point', params: { size: 2.1, alpha: 0.8, shape: 16 } }],
    facet: null, scale: null, coordinate: null, annotation: null,
    theme: 'theme_minimal', themeParams: { baseSize: 11 }, palette: ['#0dcaf0', '#ff6b6b', '#ffd166'],
    title: 'Generated points', xLabel: 'Predictor', yLabel: 'Response'
  },
  requiredItems: ['Points'],
  predicates: [{ match: 'contains', value: ':geom:GeomPoint', minimum: 1 }],
  thresholds: { match: 90, mastery: 97 },
  brief: { title: 'Generated points', description: 'Test', schema: 'x/y numeric', colours: ['#0dcaf0', '#ff6b6b', '#ffd166'] }
};

test('stable PRNG has a fixed sequence', () => {
  const random = new StableRandom(123456);
  assert.deepEqual([random.nextUint32(), random.nextUint32(), random.nextUint32()], [3044438244, 372467569, 561134079]);
});

test('score location ids are stable for every percentage', () => {
  assert.equal(locationName(3, 'Structure'), 'Level 3: Structure');
  assert.equal(locationName(3, 95), 'Level 3: 95% Match');
  assert.equal(locationId(3, 'Structure'), 4971301);
  assert.equal(locationId(3, 95), 4971395);
});

test('materialization is deterministic and finite', () => {
  const first = materializeDataset(SPEC);
  const second = materializeDataset(SPEC);
  assert.deepEqual(first, second);
  assert.equal(first.length, 48);
  assert.ok(first.every(row => Number.isFinite(row.x) && Number.isFinite(row.y)));
});

test('valid spec compiles to a self-contained R challenge', () => {
  assert.deepEqual(validateChallengeSpec(SPEC), { valid: true, errors: [] });
  const source = compileChallengeSource(SPEC);
  assert.match(source, /trial_1_data <- data\.frame/);
  assert.match(source, /geom_point/);
  assert.match(source, /#\| colours: 'c\("#0dcaf0", "#ff6b6b", "#ffd166"\)'/);
  assert.match(source, /print\(p\)/);
});

test('spec validation rejects values outside the bounded domains', () => {
  const invalid = structuredClone(SPEC);
  invalid.plot.layers[0].params.size = 99;
  assert.equal(validateChallengeSpec(invalid).valid, false);
  assert.match(validateChallengeSpec(invalid).errors.join(' '), /outside its supported domain/);
});

test('spec validation rejects unsafe R identifiers and incompatible registries', () => {
  const unsafe = structuredClone(SPEC);
  unsafe.dataset.name = 'trial-final-data';
  assert.match(validateChallengeSpec(unsafe).errors.join(' '), /safe R identifier/);

  const incompatible = structuredClone(SPEC);
  incompatible.plot.layers = [{ geom: 'line', params: { linewidth: 0.85, linetype: 'solid' } }];
  assert.match(validateChallengeSpec(incompatible).errors.join(' '), /incompatible with technique Points/);
});

test('spec validation rejects weakened predicates and item requirements', () => {
  const weakened = structuredClone(SPEC);
  weakened.predicates = [{ match: 'contains', value: ':geom:GeomLine', minimum: 1 }];
  assert.match(validateChallengeSpec(weakened).errors.join(' '), /predicates do not match/);

  const unlocked = structuredClone(SPEC);
  unlocked.requiredItems = [];
  assert.match(validateChallengeSpec(unlocked).errors.join(' '), /Required items do not match/);
});

test('all five synthetic dataset generators are deterministic and finite', () => {
  const variants = [
    { kind: 'correlated', rows: 20, slope: 1.1 },
    { kind: 'distributions', rows: 20 },
    { kind: 'categorical', rows: 8 },
    { kind: 'timeseries', rows: 20, trend: 0.1, seasonality: 2, grouped: true },
    { kind: 'intervals', rows: 8 }
  ];
  for (const dataset of variants) {
    const spec = {
      ...SPEC,
      dataset: { ...dataset, name: `${dataset.kind}_data`, groups: ['A', 'B', 'C'] }
    };
    const rows = materializeDataset(spec);
    assert.equal(rows.length, dataset.kind === 'timeseries' ? dataset.rows * 2 : dataset.rows);
    assert.deepEqual(rows, materializeDataset(spec));
    assert.ok(rows.every(row => Object.values(row).every(value => (
      typeof value !== 'number' || Number.isFinite(value)
    ))));
  }
});

test('bounded layer, facet, and theme parameters compile to R', () => {
  const spec = {
    ...SPEC,
    plot: {
      ...SPEC.plot,
      layers: [
        { geom: 'point', params: { size: 2.7, alpha: 0.8, shape: 17 } },
        { geom: 'smooth', params: { method: 'loess', se: true, linewidth: 1 } }
      ],
      facet: 'group',
      facetParams: { ncol: 2, scales: 'free_y' },
      themeParams: { baseSize: 13 }
    }
  };
  const source = compilePlotR(spec);
  assert.match(source, /geom_point\(size = 2\.7, alpha = 0\.8, shape = 17\)/);
  assert.match(source, /geom_smooth\(method = "loess", se = TRUE, linewidth = 1\)/);
  assert.match(source, /facet_wrap\(~group, ncol = 2, scales = "free_y"\)/);
  assert.match(source, /theme_minimal\(base_size = 13\)/);
});

test('lineranges compile with generated interval parameters', () => {
  const spec = {
    ...SPEC,
    plot: {
      ...SPEC.plot,
      layers: [{ geom: 'linerange', params: { linewidth: 0.85 } }]
    }
  };
  assert.match(compilePlotR(spec), /geom_linerange\(aes\(ymin = lower, ymax = upper\), linewidth = 0\.85\)/);
});

test('final exhibition compiles with valid R dataset identifiers', () => {
  const left = structuredClone(SPEC);
  left.trialId = 'final-a';
  left.dataset.name = 'trial_final_a_data';
  const right = structuredClone(SPEC);
  right.trialId = 'final-b';
  right.dataset.name = 'trial_final_b_data';
  const source = compileFinalChallengeSource({
    technique: 'Composition',
    panels: [left, right],
    brief: {
      title: 'Final Exhibition', description: 'Test final.', schema: 'two panels',
      colours: [...left.plot.palette, ...right.plot.palette]
    }
  });
  assert.match(source, /trial_final_a_data <- data\.frame/);
  assert.match(source, /trial_final_b_data <- data\.frame/);
  assert.doesNotMatch(source, /trial_final-[ab]_data/);
  assert.match(source, /p <- p1 \+ p2/);
});
