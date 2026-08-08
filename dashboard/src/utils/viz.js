// Shared visualization tokens + helpers (validated palette — see index.css).

export const SERIES = [
  '#2a78d6', // 1 blue
  '#1baf7a', // 2 aqua
  '#eda100', // 3 yellow
  '#008300', // 4 green
  '#4a3aa7', // 5 violet
  '#e34948', // 6 red
  '#e87ba4', // 7 magenta
  '#eb6834', // 8 orange
];

export const INK = '#0b0b0b';
export const INK_2 = '#52514e';
export const MUTED = '#898781';
export const GRID = '#e1e0d9';
export const BASELINE = '#c3c2b7';
export const SURFACE = '#fcfcfb';

// Sequential blue ramp (light → dark) for magnitude (heatmap).
export const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
// Ramp steps dark enough to need white in-cell text.
export const SEQ_WHITE_TEXT_FROM = 3;

/**
 * Stable skill → color assignment. Color follows the ENTITY, not its current
 * rank in a filtered view: the map is built once from the full dataset
 * (skills ordered by overall average share), so toggling filters never
 * repaints a surviving series.
 */
export function buildSkillColorMap(groups) {
  const totals = {};
  const counts = {};
  for (const g of groups || []) {
    totals[g.skill] = (totals[g.skill] || 0) + g.current_share;
    counts[g.skill] = (counts[g.skill] || 0) + 1;
  }
  const ordered = Object.keys(totals).sort(
    (a, b) => totals[b] / counts[b] - totals[a] / counts[a]
  );
  const map = {};
  ordered.forEach((skill, i) => {
    map[skill] = SERIES[i % SERIES.length];
  });
  return map;
}
