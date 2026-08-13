export function formatPercent(value, decimals = 1) {
  if (value == null) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDelta(value, decimals = 1) {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}pp`;
}

export function formatDeltaPct(value, decimals = 1) {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function directionBadge(direction) {
  const classes = {
    rising: 'badge-rising',
    falling: 'badge-falling',
    stable: 'badge-stable',
    insufficient_data: 'badge-suppressed',
  };
  return classes[direction] || 'badge-stable';
}

export function directionLabel(direction) {
  const labels = {
    rising: '▲ rising',
    falling: '▼ falling',
    stable: '→ stable',
    insufficient_data: '? n/a',
  };
  return labels[direction] || direction;
}

export function truncate(str, len = 20) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}
