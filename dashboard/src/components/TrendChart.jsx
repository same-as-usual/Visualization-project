import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { formatPercent } from '../utils/formatters';

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export default function TrendChart({ data, selectedSkills, selectedCategory }) {
  const [hoveredSkill, setHoveredSkill] = useState(null);
  const partialWeeks = useMemo(
    () => new Set(data?.partial_weeks || []),
    [data]
  );

  const MAX_LINES = 10;
  const DEFAULT_LINES = 8;

  const { chartData, skills } = useMemo(() => {
    if (!data?.groups) return { chartData: [], skills: [] };

    // Drop suppressed cells (weeks with too few postings to be meaningful).
    let groups = data.groups.filter(g => !g.suppressed);

    if (selectedCategory && selectedCategory !== 'all') {
      groups = groups.filter(g => g.category === selectedCategory);
    }

    let skillList;
    if (selectedSkills?.length > 0) {
      skillList = selectedSkills.slice(0, MAX_LINES);
    } else {
      // No explicit selection: default to the top skills by average share —
      // plotting all ~100+ at once is an unreadable rainbow.
      const totals = {};
      const counts = {};
      for (const g of groups) {
        totals[g.skill] = (totals[g.skill] || 0) + g.current_share;
        counts[g.skill] = (counts[g.skill] || 0) + 1;
      }
      skillList = Object.keys(totals)
        .sort((a, b) => totals[b] / counts[b] - totals[a] / counts[a])
        .slice(0, DEFAULT_LINES);
    }

    const skillSet = new Set(skillList);
    const byWeek = {};
    for (const g of groups) {
      if (!skillSet.has(g.skill)) continue;
      if (!byWeek[g.week]) byWeek[g.week] = { week: g.week };
      byWeek[g.week][g.skill] = g.current_share;
    }

    return {
      chartData: Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)),
      skills: skillList,
    };
  }, [data, selectedSkills, selectedCategory]);

  if (!chartData.length) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Skill Demand Over Time</h3>
        <p className="text-gray-500">No trend data available yet. Data will appear after collection runs.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Skill Demand Over Time</h3>
      <p className="text-sm text-gray-500 mb-4">
        % of postings mentioning each skill, by week posted
        {(!selectedSkills || selectedSkills.length === 0) &&
          ' — showing the top skills; pick specific ones in the filter panel'}
        {partialWeeks.size > 0 && '. Weeks marked * are partially collected.'}
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 12 }}
            tickLine={false}
            tickFormatter={(w) => partialWeeks.has(w) ? `${w}*` : w}
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => [formatPercent(value), name]}
            labelFormatter={(label) =>
              partialWeeks.has(label) ? `Week: ${label} (partial)` : `Week: ${label}`}
          />
          <Legend />
          {skills.map((skill, i) => (
            <Line
              key={skill}
              type="monotone"
              dataKey={skill}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={hoveredSkill === skill ? 3 : 1.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              onMouseEnter={() => setHoveredSkill(skill)}
              onMouseLeave={() => setHoveredSkill(null)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
