import React from 'react';
import { formatPercent } from '../utils/formatters';
import { INK, INK_2, MUTED } from '../utils/viz';

export default function Categories({ insights }) {
  const cats = insights?.categories;
  if (!cats?.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>categories</h3>
        <p style={{ color: MUTED }}>no category data available yet.</p>
      </div>
    );
  }
  const max = Math.max(...cats.map(c => c.share), 0.0001);

  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>demand by category</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}% of postings mentioning ≥1 skill in each taxonomy category
      </p>
      <div className="space-y-2.5">
        {cats.map(c => (
          <div key={c.category} className="flex items-center gap-3">
            <span className="text-sm w-28 truncate" style={{ color: INK }}>{c.category}</span>
            <div className="flex-1 h-1.5" style={{ background: '#0f1826', borderRadius: '0 3px 3px 0' }}>
              <div className="h-1.5" style={{
                width: `${Math.min(100, (c.share / max) * 100)}%`,
                background: 'linear-gradient(90deg, #12568f, #22d3ee)',
                borderRadius: '0 3px 3px 0',
                boxShadow: '0 0 8px rgba(34,211,238,0.35)',
              }} />
            </div>
            <span className="text-sm tnum w-14 text-right" style={{ color: 'var(--accent-2)' }}>{formatPercent(c.share)}</span>
            <span className="text-xs tnum w-16 text-right" style={{ color: MUTED }}>{c.distinct_skills} sk</span>
          </div>
        ))}
      </div>
    </div>
  );
}
