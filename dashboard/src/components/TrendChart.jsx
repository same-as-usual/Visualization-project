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

  const chartData = useMemo(() => {
    if (!data?.groups) return [];

    let groups = data.groups;

    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      groups = groups.filter(g => g.category === selectedCategory);
    }

    // Filter by selected skills
    if (selectedSkills?.length > 0) {
      groups = groups.filter(g => selectedSkills.includes(g.skill));
    }

    // Group by week
    const byWeek = {};
    for (const g of groups) {
      if (!byWeek[g.week]) byWeek[g.week] = { week: g.week };
      byWeek[g.week][g.skill] = g.current_share;
    }

    return Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week));
  }, [data, selectedSkills, selectedCategory]);

  const skills = useMemo(() => {
    if (!chartData.length) return [];
    const keys = Object.keys(chartData[0]).filter(k => k !== 'week');
    return keys;
  }, [chartData]);

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
        % of postings mentioning each skill, by week
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => [formatPercent(value), name]}
            labelFormatter={(label) => `Week: ${label}`}
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
