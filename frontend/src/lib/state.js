// Pure helpers that decide what has changed since the last run.
import { RESULT_KEYS } from './config.js';
import { num, objectiveName } from './format.js';

const LABELS = {
  category: 'Planning category',
  objective: 'Objective',
  budget_fraction: 'Budget share',
  total_budget: 'Budget in dollars',
  capacity_factor: 'Capacity factor',
  minimum_fraction: 'Minimum commitment',
  pacing: 'Weekly caps',
  package_sizes: 'Package sizes',
  source: 'Dataset',
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Returns the list of selections that differ from the configuration of the shown result.
export function changedSelections(result, config, source) {
  if (!result) return [];
  const out = [];
  for (const key of RESULT_KEYS) {
    const before = result.config?.[key];
    const after = config[key];
    const normalised = key === 'package_sizes' ? [...(after || [])].sort((a, b) => a - b) : after;
    if (!same(before, normalised)) out.push({ key, label: LABELS[key], from: before, to: normalised });
  }
  const shownFile = result.dataset?.filename;
  const chosenFile = source.mode === 'file' ? source.file?.name : 'online_advertising_performance_data.csv';
  if (shownFile && chosenFile && shownFile !== chosenFile) {
    out.push({ key: 'source', label: LABELS.source, from: shownFile, to: chosenFile });
  }
  return out;
}

export function describeValue(key, value, objective) {
  if (value == null) return 'none';
  switch (key) {
    case 'budget_fraction': return `${Math.round(value * 100)}% of historical cost`;
    case 'capacity_factor': return `${value.toFixed(2)}×`;
    case 'minimum_fraction': return `${Math.round(value * 100)}% of capacity`;
    case 'total_budget': return `$${num(value, 0)}`;
    case 'objective': return objectiveName(value);
    case 'pacing': return value === 'none' ? 'No binding cap' : value === 'even' ? 'Even pacing (B ÷ T)' : 'Custom';
    case 'package_sizes': return (value || []).map((s) => Math.round(s * 100) + '%').join(' · ');
    default: return String(value);
  }
}

// File-name for the workbook reflecting the current selections.
export function workbookFileName(config, id) {
  const pct = Math.round(config.budget_fraction * 100);
  const parts = ['adspace', config.objective, config.category, `budget${pct}`];
  if (config.capacity_factor !== 1) parts.push(`cap${config.capacity_factor}`);
  if (config.minimum_fraction > 0) parts.push(`min${Math.round(config.minimum_fraction * 100)}`);
  if (config.pacing !== 'none') parts.push(`pace-${config.pacing}`);
  return `${parts.join('_')}${id ? '_' + id : ''}.xlsx`;
}
