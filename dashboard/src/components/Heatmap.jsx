import React, { useMemo } from 'react';
import { formatPercent } from '../utils/formatters';
import { SEQ, SEQ_DARK_TEXT_FROM, INK, INK_2, MUTED } from '../utils/viz';

export default function Heatmap({ data, selectedCategory }) {
  const heatmapData = useMemo(() => {
    if (!data?.locations?.length) return { skills: [], locations: [], cells: {}, max: 0 };
    let rows = data.locations;
    if (selectedCategory && selectedCategory !== 'all') {
      rows = rows.filter(r => r.category === selectedCategory);
    }
    const cells = {}, skillTotals = {}, locPostings = {};
    let max = 0;
    for (const r of rows) {
      cells[`${r.skill}|${r.location}`] = r.share;
      skillTotals[r.skill] = (skillTotals[r.skill] || 0) + r.share;
      locPostings[r.location] = Math.max(locPostings[r.location] || 0, r.postings || 0);
      if (r.share > max) max = r.share;
    }
    const skills = Object.keys(skillTotals).sort((a, b) => skillTotals[b] - skillTotals[a]).slice(0, 20);
    const locations = Object.keys(locPostings).sort((a, b) => locPostings[b] - locPostings[a]).slice(0, 10);
    return { skills, locations, cells, max, locPostings };
  }, [data, selectedCategory]);

  if (!heatmapData.skills.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>skill × market</h3>
        <p style={{ color: MUTED }}>no location data available yet.</p>
      </div>
    );
  }

  const { skills, locations, cells, max, locPostings } = heatmapData;
  const stepFor = (value) => {
    if (value == null || max === 0) return null;
    return Math.min(SEQ.length - 1, Math.floor((value / max) * SEQ.length));
  };

  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>skill × market heatmap</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}% of postings mentioning each skill, by market, over the full period
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 z-10" style={{ color: INK_2, background: 'var(--surface)' }}>skill</th>
              {locations.map(loc => (
                <th key={loc} className="p-2 text-center min-w-[92px]" style={{ color: INK_2 }}>
                  <div>{loc.length > 14 ? loc.slice(0, 14) + '…' : loc}</div>
                  <div className="font-normal tnum" style={{ color: MUTED }}>n={locPostings[loc]?.toLocaleString()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skills.map(skill => (
              <tr key={skill}>
                <td className="p-2 sticky left-0 z-10 whitespace-nowrap" style={{ color: INK, background: 'var(--surface)' }}>{skill}</td>
                {locations.map(loc => {
                  const value = cells[`${skill}|${loc}`];
                  const step = stepFor(value);
                  const bg = step == null ? '#0a1017' : SEQ[step];
                  const fg = step != null && step >= SEQ_DARK_TEXT_FROM ? '#04121f' : INK;
                  return (
                    <td
                      key={loc}
                      className="p-2 text-center tnum rounded"
                      style={{ background: bg, color: value == null ? MUTED : fg }}
                      title={value != null ? `${skill} — ${loc}: ${formatPercent(value)}` : `${skill} — ${loc}: below threshold`}
                    >
                      {value != null ? formatPercent(value, 0) : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs" style={{ color: MUTED }}>
        <span>0%</span>
        <div className="flex" style={{ gap: 2 }}>
          {SEQ.map(hex => <span key={hex} style={{ width: 22, height: 10, background: hex, borderRadius: 2, display: 'inline-block' }} />)}
        </div>
        <span className="tnum">{formatPercent(max, 0)}</span>
        <span className="ml-2">· “·” = too few postings to report</span>
      </div>
    </div>
  );
}
