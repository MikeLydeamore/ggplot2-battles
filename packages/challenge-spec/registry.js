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
  Intervals: { datasets: ['intervals'], layers: ['point', 'errorbar', 'linerange'] }
};

export const LAYER_PARAMETER_DOMAINS = {
  point: { size: [1.6, 2.1, 2.7, 3.2], alpha: [0.65, 0.8, 1], shape: [16, 17, 19] },
  smooth: { method: ['lm', 'loess'], se: [false, true], linewidth: [0.6, 0.8, 1] },
  histogram: { bins: [12, 18, 24, 30], alpha: [0.58, 0.74, 0.9], boundary: [0, 0.25, 0.5] },
  density: { adjust: [0.7, 1, 1.3], alpha: [0.25, 0.4, 0.55], linewidth: [0.6, 0.8, 1] },
  col: { width: [0.58, 0.72, 0.86], alpha: [0.7, 0.85, 1] },
  line: { linewidth: [0.6, 0.85, 1.1], linetype: ['solid', 'dashed', 'dotdash'] },
  ribbon: { alpha: [0.12, 0.2, 0.3] },
  errorbar: { width: [0.1, 0.18, 0.28], linewidth: [0.5, 0.7, 0.9] },
  linerange: { linewidth: [0.6, 0.85, 1.1] }
};

export const FACET_PARAMETER_DOMAINS = { ncol: [1, 2, 3], scales: ['fixed', 'free_y'] };
export const THEME_PARAMETER_DOMAINS = { baseSize: [10, 11, 12, 13] };

export const PALETTES = [
  ['#0dcaf0', '#ff6b6b', '#ffd166'],
  ['#20c997', '#845ef7', '#ff922b'],
  ['#3a86ff', '#ff006e', '#ffbe0b'],
  ['#2a9d8f', '#e76f51', '#e9c46a']
];

export const THEMES = ['theme_minimal', 'theme_bw', 'theme_classic'];
