// Number formatting. Every figure on screen goes through these helpers so units and
// precision stay consistent with the Excel workbook.
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export const num = (n, digits = 0) =>
  isNum(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

export const money = (n, digits = 0) =>
  isNum(n) ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

// Takes a percentage value already scaled (8.98 means 8.98%).
export const pct = (n, digits = 1) => (isNum(n) ? n.toFixed(digits) + '%' : '—');

// Takes a fraction (0.85 means 85%).
export const share = (n, digits = 0) => (isNum(n) ? (n * 100).toFixed(digits) + '%' : '—');

export const rate = (n, digits = 6) => (isNum(n) ? (n === 0 ? '0' : n.toFixed(digits)) : '—');

export function compact(n) {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return num(n, a < 10 && a > 0 ? 2 : 0);
}

export const unitWord = (objective) => (objective === 'revenue' ? 'revenue' : 'conversions');
export const objectiveName = (objective) => (objective === 'revenue' ? 'Revenue' : 'Conversions');
