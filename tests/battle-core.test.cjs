const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../packages/battle-engine/battle-core.js');

test('scores image mismatch safely', () => {
  assert.equal(core.scoreFromMismatch(4.25), 95.75);
  assert.equal(core.scoreFromMismatch(120), 0);
});

test('evaluates structural predicates', () => {
  const result = core.evaluatePredicates(
    ['layer:1:geom:GeomPoint', 'facet:FacetWrap'],
    [
      { match: 'contains', value: ':geom:GeomPoint' },
      { match: 'exact', value: 'facet:FacetWrap' }
    ]
  );
  assert.equal(result.satisfied, true);
  assert.equal(result.score, 100);
});
