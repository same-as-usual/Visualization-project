import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { formatPercent, formatDelta, directionBadge, directionLabel } from '../utils/formatters';

export default function TopSkillsChart({ data, trends }) {
  if (!data?.length) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Top Skills</h3>
        <p className="text-gray-500">No skill data available yet.</p>
      </div>
    );
  }

  // Direction comes from the LATEST week's trend row for this skill (the
  // export emits one row per week; only the latest carries current momentum).
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
      // delta_pp: null when there's no prior period to compare against —
      // show nothing rather than a meaningless "+X pp vs zero".
      delta_pp: skill.delta_pp ?? null,
      direction: latest?.direction || 'insufficient_data',
    };
  });

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Top Skills by Demand</h3>
      <p className="text-sm text-gray-500 mb-4">
        % of postings mentioning each skill (full collection period), with
        week-over-week change where enough history exists
      </p>
      <div className="space-y-3">
        {withDeltas.slice(0, 15).map((skill, i) => (
          <div key={skill.skill} className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 w-8 text-right">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{skill.skill}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {formatPercent(skill.share)}
                  </span>
                  {skill.delta_pp != null && skill.delta_pp !== 0 && (
                    <span className={`text-xs ${skill.delta_pp > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatDelta(skill.delta_pp)} w/w
                    </span>
                  )}
                  {['rising', 'falling', 'stable'].includes(skill.direction) && (
                    <span className={`badge ${directionBadge(skill.direction)}`}>
                      {directionLabel(skill.direction)}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, skill.share * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
