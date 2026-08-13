import React from 'react';
import { formatPercent } from '../utils/formatters';
import { INK, INK_2, MUTED, ACCENT } from '../utils/viz';

export default function Markets({ insights }) {
  const markets = insights?.market_specialization;
  if (!markets?.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>markets</h3>
        <p style={{ color: MUTED }}>need more per-market volume to compute specialization.</p>
      </div>
    );
  }

  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>market specialization</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}skills each market demands disproportionately · lift = ×vs the global average
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {markets.map(m => {
          const maxLift = Math.max(...m.skills.map(s => s.lift), 1);
          return (
            <div key={m.market} style={{ border: '1px solid var(--line)', borderRadius: 6 }} className="p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: ACCENT }}>{m.market}</span>
                <span className="text-xs tnum" style={{ color: MUTED }}>n={m.market_postings.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {m.skills.map(s => (
                  <div key={s.skill} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate" style={{ color: INK }}>{s.skill}</span>
                      <span className="tnum shrink-0" style={{ color: 'var(--accent-2)' }}>{s.lift}×</span>
                    </div>
                    <div className="mt-1 h-1" style={{ background: '#0f1826', borderRadius: 2 }}>
                      <div className="h-1" style={{
                        width: `${(s.lift / maxLift) * 100}%`,
                        background: 'linear-gradient(90deg, #12568f, #22d3ee)',
                        borderRadius: 2,
                      }} />
                    </div>
                    <div className="text-[11px] tnum mt-0.5" style={{ color: MUTED }}>
                      {formatPercent(s.local_share)} of {m.market} postings
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
