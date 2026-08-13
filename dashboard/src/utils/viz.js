// Shared visualization tokens + helpers.
// Dark "terminal" theme — categorical palette is the dataviz reference DARK
// set, validated against the terminal surface #0a0e17 (lightness band + 3:1
// contrast PASS; CVD in the 8–12 floor band, legal because every chart ships a
// legend + direct labels as secondary encoding).

export const SERIES = [
  '#3b9dff', // 1 blue   (accent-forward for the blue theme)
  '#22d3ee', // 2 cyan
  '#c98500', // 3 amber
  '#2ee6a6', // 4 green
  '#9085e9', // 5 violet
  '#e66767', // 6 red
  '#d55181', // 7 magenta
  '#d95926', // 8 orange
];

// Ink tokens for chart chrome on the dark surface.
export const INK = '#d7e3f4';
export const INK_2 = '#8aa0c0';
export const MUTED = '#5a6b85';
export const GRID = '#16202f';
export const BASELINE = '#243247';
export const SURFACE = '#0b111c';
export const ACCENT = '#3b9dff';

// Sequential cyan→blue ramp (light→dark reversed for a dark bg: brighter =
// higher magnitude) for the heatmap.
export const SEQ = ['#0f1e33', '#123a5e', '#12568f', '#1b73bf', '#2a90e0', '#4fb0ff'];
// Steps bright enough to carry dark text instead of light.
export const SEQ_DARK_TEXT_FROM = 5;

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
