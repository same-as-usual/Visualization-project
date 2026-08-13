import React from 'react';
import { formatPercent, formatDelta } from '../utils/formatters';
import { INK, INK_2, MUTED } from '../utils/viz';

function Col({ title, rows, sign }) {
  const color = sign > 0 ? 'var(--good)' : 'var(--bad)';
  const arrow = sign > 0 ? '▲' : '▼';
  return (
    <div>
      <p className="text-xs mb-2" style={{ color }}>{arrow} {title}</p>
      {rows.length === 0 && <p className="text-xs" style={{ color: MUTED }}>none this week</p>}
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.skill} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate" style={{ color: INK }}>{r.skill}</span>
            <div className="flex items-baseline gap-2 shrink-0 tnum">
              <span style={{ color: MUTED }}>{formatPercent(r.share)}</span>
              <span className="w-16 text-right" style={{ color }}>{formatDelta(r.delta_pp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Movers({ insights }) {
  const m = insights?.movers;
  if (!m || (!m.risers?.length && !m.fallers?.length)) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>movers</h3>
        <p style={{ color: MUTED }}>need two complete weeks of data to compute week-over-week movers.</p>
      </div>
    );
  }
  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>weekly movers</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}biggest week-over-week share changes · week {m.latest_week} vs prior
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <Col title="rising fastest" rows={m.risers} sign={1} />
        <Col title="falling fastest" rows={m.fallers} sign={-1} />
      </div>
    </div>
  );
}
