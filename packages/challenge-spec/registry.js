export const DATASET_REGISTRY = {
  correlated: { roles: ['x', 'y', 'group'], rows: [48, 96] },
  distributions: { roles: ['value', 'group'], rows: [80, 160] },
  categorical: { roles: ['category', 'value', 'group'], rows: [6, 18] },
  timeseries: { roles: ['time', 'value', 'group', 'lower', 'upper'], rows: [24, 72] },
  intervals: { roles: ['label', 'estimate', 'lower', 'upper', 'group'], rows: [7, 14] }
};

export const TECHNIQUE_REGISTRY = {
  Points: { datasets: ['correlated'], layers: ['point', 'smooth'] },
  Distributions: { datasets: ['distributions'], layers: ['histogram', 'density'] },
  Categorical: { datasets: ['categorical'], layers: ['col'] },
  Lines: { datasets: ['timeseries'], layers: ['line', 'ribbon'] },
  Intervals: { datasets: ['intervals'], layers: ['point', 'errorbar'] }
};

export const PALETTES = [
  ['#0dcaf0', '#ff6b6b', '#ffd166'],
  ['#20c997', '#845ef7', '#ff922b'],
  ['#3a86ff', '#ff006e', '#ffbe0b'],
  ['#2a9d8f', '#e76f51', '#e9c46a']
];

export const THEMES = ['theme_minimal', 'theme_bw', 'theme_classic'];
