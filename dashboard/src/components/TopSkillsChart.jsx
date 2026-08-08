import React from 'react';
import { formatPercent, formatDelta, directionBadge, directionLabel } from '../utils/formatters';
import { INK, INK_2, MUTED } from '../utils/viz';

const BAR = '#2a78d6'; // one series → one color (categorical slot 1)
const TRACK = '#f0efec'; // neutral, one step off the surface

export default function TopSkillsChart({ data, trends }) {
  if (!data?.length) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-1">Top skills</h3>
        <p style={{ color: MUTED }}>No skill data available yet.</p>
      </div>
    );
  }

  const partialWeeks = new Set(trends?.partial_weeks || []);
  const withDeltas = data.map(skill => {
    // Momentum from the latest COMPLETE week — a half-collected week would
    // show phantom falls for everything.
    const skillWeeks = (trends?.groups || [])
      .filter(g => g.skill === skill.skill && !g.suppressed && !partialWeeks.has(g.week))
      .sort((a, b) => a.week.localeCompare(b.week));
    const latest = skillWeeks[skillWeeks.length - 1];
    return {
      ...skill,
      delta_pp: skill.delta_pp ?? null,
      direction: latest?.direction || 'insufficient_data',
    };
  });

  const maxShare = Math.max(...withDeltas.map(s => s.share), 0.0001);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold" style={{ color: INK }}>Top skills by demand</h3>
      <p className="text-sm mt-1 mb-5" style={{ color: INK_2 }}>
        % of postings mentioning each skill over the full collection period —
        week-over-week change shown where enough history exists
      </p>
      <div className="space-y-3.5">
        {withDeltas.slice(0, 15).map((skill, i) => (
          <div
            key={skill.skill}
            className="flex items-center gap-3"
            title={`${skill.skill}: ${formatPercent(skill.share)} of ${skill.postings?.toLocaleString()} postings (95% CI ${formatPercent(skill.wilson_lower)}–${formatPercent(skill.wilson_upper)})`}
          >
            <span className="text-xs w-6 text-right tnum" style={{ color: MUTED }}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className="text-sm font-medium truncate" style={{ color: INK }}>
                  {skill.skill}
                </span>
                <div className="flex items-baseline gap-2 shrink-0">
                  {skill.delta_pp != null && skill.delta_pp !== 0 && (
                    <span
                      className="text-xs tnum"
                      style={{ color: skill.delta_pp > 0 ? 'var(--good)' : 'var(--bad)' }}
                    >
                      {formatDelta(skill.delta_pp)} w/w
                    </span>
                  )}
                  {['rising', 'falling', 'stable'].includes(skill.direction) && (
                    <span className={`badge ${directionBadge(skill.direction)}`}>
                      {directionLabel(skill.direction)}
                    </span>
                  )}
                  <span className="text-sm font-semibold tnum w-14 text-right" style={{ color: INK }}>
                    {formatPercent(skill.share)}
                  </span>
                </div>
              </div>
              {/* Bar: rounded data-end, square at the baseline; scaled to the
                  top skill so differences stay readable */}
              <div className="w-full h-2" style={{ background: TRACK, borderRadius: '0 4px 4px 0' }}>
                <div
                  className="h-2 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (skill.share / maxShare) * 100)}%`,
                    background: BAR,
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs mt-5" style={{ color: MUTED }}>
        Bars are scaled to the top skill. Hover a row for the 95% confidence interval.
      </p>
    </div>
  );
}
