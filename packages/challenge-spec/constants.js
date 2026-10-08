export const GAME_NAME = 'ggplot Battles';
export const SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = 1;
export const SLOT_DATA_VERSION = 2;
export const WEB_APP_VERSION = '0.3.3';
export const ITEM_BASE_ID = 4970000;
export const LOCATION_BASE_ID = 4971000;

export const BASE_TECHNIQUES = ['Points', 'Distributions', 'Categorical', 'Lines', 'Intervals'];
export const MODIFIER_ITEMS = [
  'Faceting', 'Scale Transformations', 'Coordinate Systems', 'Annotations', 'Composition'
];
export const UTILITY_ITEMS = ['Diff Lens', 'Data Inspector', 'Starter Scaffold', 'Hint Book'];

export const ITEM_NAMES = [
  ...BASE_TECHNIQUES,
  ...MODIFIER_ITEMS,
  'Exhibition Invitation',
  ...UTILITY_ITEMS,
  ...Array.from({ length: 9 }, (_, index) => `Colour Swatch ${index + 1}`)
];

export const ITEM_IDS = Object.fromEntries(ITEM_NAMES.map((name, index) => [name, ITEM_BASE_ID + index]));
export const ITEM_NAMES_BY_ID = Object.fromEntries(Object.entries(ITEM_IDS).map(([name, id]) => [id, name]));

export function locationName(trial, milestone) {
  return milestone === 'Structure'
    ? `Level ${trial}: Structure`
    : `Level ${trial}: ${Number(milestone)}% Match`;
}

export function locationId(trial, milestone) {
  const offset = milestone === 'Structure' ? 1 : Number(milestone);
  return LOCATION_BASE_ID + trial * 100 + offset;
}

export const LOCATION_IDS = Object.fromEntries(
  Array.from({ length: 8 }, (_, index) => index + 1).flatMap(trial =>
    ['Structure', ...Array.from({ length: 21 }, (_, score) => score + 80)].map(milestone => [
      locationName(trial, milestone), locationId(trial, milestone)
    ])
  )
);

export const LOCATION_NAMES_BY_ID = Object.fromEntries(
  Object.entries(LOCATION_IDS).map(([name, id]) => [id, name])
);
