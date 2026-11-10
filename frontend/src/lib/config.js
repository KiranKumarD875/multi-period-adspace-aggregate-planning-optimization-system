// Default selections. Mirrors DEFAULT_CONFIG in backend/engine.py.
export const DEFAULT_CONFIG = {
  category: 'placement',
  objective: 'conversions',
  budget_fraction: 0.85,
  total_budget: null,
  capacity_factor: 1,
  minimum_fraction: 0,
  pacing: 'none',
  custom_pacing: null,
  package_sizes: [0.25, 0.5, 1],
  cell_spend_cap: null,
  mapping: {},
};

export const PACKAGE_SETS = {
  halves: { label: 'Halves', sizes: [0.5, 1] },
  quarters: { label: 'Quarters', sizes: [0.25, 0.5, 1] },
  fifths: { label: 'Fifths', sizes: [0.2, 0.4, 0.6, 0.8, 1] },
};

// Selections that change the numbers. Used to decide whether results are stale.
export const RESULT_KEYS = [
  'category', 'objective', 'budget_fraction', 'total_budget', 'capacity_factor',
  'minimum_fraction', 'pacing', 'package_sizes',
];
