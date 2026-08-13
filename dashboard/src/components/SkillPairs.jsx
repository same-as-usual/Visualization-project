import React from 'react';
import { INK, INK_2, MUTED, ACCENT } from '../utils/viz';

export default function SkillPairs({ insights }) {
  const pairs = insights?.cooccurrence;
  if (!pairs?.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>skill-pairs</h3>
        <p style={{ color: MUTED }}>not enough co-occurring skills yet — sharpens as full-text volume grows.</p>
      </div>
    );
  }
  const maxCount = Math.max(...pairs.map(p => p.count), 1);

  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>skills that appear together</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}skill pairs co-occurring in the same posting · ranked by count · lift = ×more than chance
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        {pairs.map((p, i) => (
          <div key={`${p.a}|${p.b}`} className="flex items-center gap-3 text-sm">
            <span className="text-xs w-6 text-right tnum" style={{ color: MUTED }}>{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ color: INK }}>
                  {p.a} <span style={{ color: MUTED }}>+</span> {p.b}
                </span>
                <div className="flex items-baseline gap-2 shrink-0 tnum">
                  <span title="times seen together" style={{ color: ACCENT }}>{p.count}×</span>
                  <span className="w-16 text-right" title="lift: how much more than random chance" style={{ color: 'var(--accent-2)' }}>
                    {p.lift}× lift
                  </span>
                </div>
              </div>
              <div className="mt-1 h-1" style={{ background: '#0f1826', borderRadius: 2 }}>
                <div className="h-1" style={{
                  width: `${(p.count / maxCount) * 100}%`,
                  background: 'linear-gradient(90deg, #1b73bf, #3b9dff)',
                  borderRadius: 2,
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
