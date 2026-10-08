(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GgplotBattleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function scoreFromMismatch(value) {
    const mismatch = Number(value);
    return Number.isFinite(mismatch)
      ? Number(Math.max(0, Math.min(100, 100 - mismatch)).toFixed(2))
      : null;
  }

  function scoreFeatureOverlap(userFeatures, targetFeatures) {
    if (!Array.isArray(userFeatures) || !Array.isArray(targetFeatures)
        || !userFeatures.length || !targetFeatures.length) return null;
    const counts = values => values.reduce((map, value) => {
      map.set(value, (map.get(value) || 0) + 1);
      return map;
    }, new Map());
    const userCounts = counts(userFeatures);
    const targetCounts = counts(targetFeatures);
    let overlap = 0;
    userCounts.forEach((count, feature) => {
      overlap += Math.min(count, targetCounts.get(feature) || 0);
    });
    return Number((200 * overlap / (userFeatures.length + targetFeatures.length)).toFixed(2));
  }

  function evaluatePredicates(features, predicates) {
    const values = Array.isArray(features) ? features : [];
    const requirements = Array.isArray(predicates) ? predicates : [];
    const results = requirements.map(predicate => {
      const count = values.filter(value => {
        if (predicate.match === 'exact') return value === predicate.value;
        if (predicate.match === 'regex') return new RegExp(predicate.value).test(value);
        return value.includes(predicate.value);
      }).length;
      return { ...predicate, count, satisfied: count >= (predicate.minimum || 1) };
    });
    const matched = results.filter(result => result.satisfied).length;
    return {
      satisfied: results.length > 0 && matched === results.length,
      score: results.length ? Number((100 * matched / results.length).toFixed(2)) : 0,
      matched,
      required: results.length,
      results
    };
  }

  return { scoreFromMismatch, scoreFeatureOverlap, evaluatePredicates };
});
