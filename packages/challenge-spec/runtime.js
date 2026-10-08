import { GENERATOR_VERSION, SCHEMA_VERSION } from './constants.js';
import { StableRandom } from './prng.js';

const escapeR = value => JSON.stringify(String(value));
const numberR = value => Number(value.toFixed(6)).toString();
const vectorR = values => `c(${values.map(value => typeof value === 'number' ? numberR(value) : escapeR(value)).join(', ')})`;

export function validateChallengeSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') errors.push('Specification must be an object.');
  if (spec?.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schema version ${spec?.schemaVersion}.`);
  if (spec?.generatorVersion !== GENERATOR_VERSION) errors.push(`Unsupported generator version ${spec?.generatorVersion}.`);
  if (!spec?.dataset?.kind || !spec?.dataset?.name) errors.push('Dataset kind and name are required.');
  if (!Array.isArray(spec?.plot?.layers) || !spec.plot.layers.length) errors.push('At least one plot layer is required.');
  if (!Array.isArray(spec?.predicates) || !spec.predicates.length) errors.push('Structural predicates are required.');
  if (!(spec?.thresholds?.match < spec?.thresholds?.mastery)) errors.push('Mastery threshold must exceed match threshold.');
  return { valid: errors.length === 0, errors };
}

export function materializeDataset(spec) {
  const random = new StableRandom(spec.seed);
  const rows = [];
  const count = spec.dataset.rows;
  const groups = spec.dataset.groups || ['A', 'B', 'C'];

  if (spec.dataset.kind === 'correlated') {
    for (let index = 0; index < count; index++) {
      const group = groups[index % groups.length];
      const x = random.normal(0, 1);
      const shift = groups.indexOf(group) * 0.65;
      rows.push({ x, y: spec.dataset.slope * x + shift + random.normal(0, 0.7), group });
    }
  } else if (spec.dataset.kind === 'distributions') {
    for (let index = 0; index < count; index++) {
      const group = groups[index % groups.length];
      rows.push({ value: random.normal(groups.indexOf(group) * 1.1, 0.7 + groups.indexOf(group) * 0.15), group });
    }
  } else if (spec.dataset.kind === 'categorical') {
    for (let index = 0; index < count; index++) {
      const group = groups[index % groups.length];
      rows.push({ category: `Category ${index + 1}`, value: random.integer(8, 40), group });
    }
  } else if (spec.dataset.kind === 'timeseries') {
    const seriesCount = spec.dataset.grouped ? 2 : 1;
    for (let series = 0; series < seriesCount; series++) {
      for (let index = 0; index < count; index++) {
        const value = 12 + series * 4 + spec.dataset.trend * index
          + Math.sin(index / 3) * spec.dataset.seasonality + random.normal(0, 0.6);
        rows.push({ time: index + 1, value, lower: value - 1.5, upper: value + 1.5, group: groups[series] });
      }
    }
  } else if (spec.dataset.kind === 'intervals') {
    for (let index = 0; index < count; index++) {
      const estimate = random.normal(0, 0.75);
      const width = 0.25 + random.next() * 0.65;
      rows.push({ label: `Estimate ${index + 1}`, estimate, lower: estimate - width, upper: estimate + width, group: groups[index % groups.length] });
    }
  } else {
    throw new Error(`Unknown dataset generator: ${spec.dataset.kind}`);
  }
  return rows;
}

export function datasetToR(name, rows) {
  const columns = Object.keys(rows[0] || {});
  const expressions = columns.map(column => `${column} = ${vectorR(rows.map(row => row[column]))}`);
  return `${name} <- data.frame(${expressions.join(', ')}, check.names = FALSE)`;
}

function aestheticsR(mapping) {
  return Object.entries(mapping || {}).map(([key, value]) => `${key} = ${value}`).join(', ');
}

function layerR(layer, palette) {
  const params = layer.params || {};
  if (layer.geom === 'point') return `geom_point(${params.size ? `size = ${params.size}` : ''})`;
  if (layer.geom === 'smooth') return 'geom_smooth(method = "lm", se = FALSE, linewidth = 0.7)';
  if (layer.geom === 'histogram') return `geom_histogram(bins = ${params.bins || 18}, colour = "white", alpha = 0.78)`;
  if (layer.geom === 'density') return 'geom_density(alpha = 0.35, linewidth = 0.8)';
  if (layer.geom === 'col') return 'geom_col()';
  if (layer.geom === 'line') return 'geom_line(linewidth = 0.8)';
  if (layer.geom === 'ribbon') return 'geom_ribbon(aes(ymin = lower, ymax = upper), alpha = 0.18, colour = NA)';
  if (layer.geom === 'errorbar') return 'geom_errorbar(aes(ymin = lower, ymax = upper), width = 0.15)';
  throw new Error(`Unsupported geom: ${layer.geom}`);
}

export function compilePlotR(spec, variable = 'p') {
  const plot = spec.plot;
  const parts = [`ggplot(${spec.dataset.name}, aes(${aestheticsR(plot.mapping)}))`];
  plot.layers.forEach(layer => parts.push(layerR(layer, plot.palette)));
  if (plot.mapping?.colour || plot.mapping?.fill) {
    if (plot.mapping.colour) parts.push(`scale_colour_manual(values = ${vectorR(plot.palette)})`);
    if (plot.mapping.fill) parts.push(`scale_fill_manual(values = ${vectorR(plot.palette)})`);
  }
  if (plot.facet) parts.push(`facet_wrap(~${plot.facet})`);
  if (plot.scale === 'log10') parts.push(`scale_y_log10()`);
  if (plot.scale === 'reverse') parts.push(`scale_y_reverse()`);
  if (plot.coordinate === 'flip') parts.push('coord_flip()');
  if (plot.coordinate === 'polar') parts.push('coord_polar()');
  if (plot.annotation) parts.push(`annotate("text", x = Inf, y = Inf, label = ${escapeR(plot.annotation)}, hjust = 1.1, vjust = 1.5)`);
  parts.push(`${plot.theme}()`);
  parts.push(`labs(title = ${escapeR(plot.title)}, x = ${escapeR(plot.xLabel)}, y = ${escapeR(plot.yLabel)})`);
  return `${variable} <- ${parts.join(' +\n  ')}`;
}

export function compileChallengeSource(spec) {
  const validation = validateChallengeSpec(spec);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const rows = materializeDataset(spec);
  const colours = vectorR(spec.plot.palette);
  return [
    `#| title: ${JSON.stringify(spec.brief.title)}`,
    `#| dataset-name: ${JSON.stringify(spec.dataset.name)}`,
    `#| description: ${JSON.stringify(spec.brief.description + ` Schema: ${spec.brief.schema}`)}`,
    `#| colours: '${colours}'`,
    '#| plot-variable: "p"',
    `#| stub: ${JSON.stringify(starterCode(spec).replace(/\n/g, '\\n'))}`,
    spec.plot.layers.some(layer => layer.geom === 'smooth') ? '#| prerun-code: "set.seed(1)"' : '',
    'library(ggplot2)',
    datasetToR(spec.dataset.name, rows),
    compilePlotR(spec),
    'print(p)'
  ].filter(Boolean).join('\n');
}

export function compileFinalChallengeSource(spec) {
  if (!Array.isArray(spec?.panels) || spec.panels.length !== 2) {
    throw new Error('The final exhibition requires exactly two panels.');
  }
  const [left, right] = spec.panels;
  for (const panel of spec.panels) {
    const validation = validateChallengeSpec(panel);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
  }
  const leftRows = materializeDataset(left);
  const rightRows = materializeDataset(right);
  return [
    `#| title: ${JSON.stringify(spec.brief.title)}`,
    `#| dataset-name: ${JSON.stringify(`${left.dataset.name}, ${right.dataset.name}`)}`,
    `#| description: ${JSON.stringify(spec.brief.description + ` Schemas: ${spec.brief.schema}`)}`,
    `#| colours: '${vectorR(spec.brief.colours)}'`,
    '#| plot-variable: "p"',
    `#| stub: ${JSON.stringify(starterCode(spec).replace(/\n/g, '\\n'))}`,
    'library(ggplot2)',
    'library(patchwork)',
    datasetToR(left.dataset.name, leftRows),
    datasetToR(right.dataset.name, rightRows),
    compilePlotR(left, 'p1'),
    compilePlotR(right, 'p2'),
    'p <- p1 + p2',
    'print(p)'
  ].join('\n');
}

export function starterCode(spec) {
  if (spec.technique === 'Composition') {
    return `library(ggplot2)\nlibrary(patchwork)\n\n# Build p1 and p2, then combine them\np <- p1 + p2\np`;
  }
  return `library(ggplot2)\n\n${spec.dataset.name} |>\n  ggplot()`;
}
