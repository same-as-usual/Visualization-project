import React from 'react';
import { formatPercent, formatDelta, directionBadge, directionLabel } from '../utils/formatters';
import { INK, INK_2, MUTED, ACCENT } from '../utils/viz';

const TRACK = '#0f1826';

export default function TopSkillsChart({ data, trends }) {
  if (!data?.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>top-skills</h3>
        <p style={{ color: MUTED }}>no skill data available yet.</p>
      </div>
    );
  }

  const partialWeeks = new Set(trends?.partial_weeks || []);
  const withDeltas = data.map(skill => {
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
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>top skills by demand</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}% of postings mentioning each skill (full period) · Δ = week-over-week where history allows
      </p>
      <div className="space-y-3">
        {withDeltas.slice(0, 15).map((skill, i) => (
          <div
            key={skill.skill}
            className="flex items-center gap-3"
            title={`${skill.skill}: ${formatPercent(skill.share)} of ${skill.postings?.toLocaleString()} postings · 95% CI ${formatPercent(skill.wilson_lower)}–${formatPercent(skill.wilson_upper)}`}
          >
            <span className="text-xs w-6 text-right tnum" style={{ color: MUTED }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className="text-sm truncate" style={{ color: INK }}>{skill.skill}</span>
                <div className="flex items-baseline gap-2 shrink-0">
                  {skill.delta_pp != null && skill.delta_pp !== 0 && (
                    <span className="text-xs tnum" style={{ color: skill.delta_pp > 0 ? 'var(--good)' : 'var(--bad)' }}>
                      {formatDelta(skill.delta_pp)}
                    </span>
                  )}
                  {['rising', 'falling', 'stable'].includes(skill.direction) && (
                    <span className={`badge ${directionBadge(skill.direction)}`}>
                      {directionLabel(skill.direction)}
                    </span>
                  )}
                  <span className="text-sm font-semibold tnum w-14 text-right" style={{ color: ACCENT }}>
                    {formatPercent(skill.share)}
                  </span>
                </div>
              </div>
              <div className="w-full h-1.5" style={{ background: TRACK, borderRadius: '0 3px 3px 0' }}>
                <div
                  className="h-1.5 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (skill.share / maxShare) * 100)}%`,
                    background: 'linear-gradient(90deg, #1b73bf, #3b9dff)',
                    borderRadius: '0 3px 3px 0',
                    boxShadow: '0 0 8px rgba(59,157,255,0.4)',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] mt-5" style={{ color: MUTED }}>
        bars scaled to the top skill · hover a row for the 95% confidence interval
      </p>
    </div>
  );
}
