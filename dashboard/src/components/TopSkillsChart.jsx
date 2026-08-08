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

  // Merge delta info from trends
  const withDeltas = data.map(skill => {
    const trend = trends?.groups?.find(
      g => g.skill === skill.skill && !g.suppressed
    );
    return {
      ...skill,
      delta_pp: trend?.delta_pp || 0,
      direction: trend?.direction || 'stable',
    };
  });

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Top Skills by Demand</h3>
      <p className="text-sm text-gray-500 mb-4">
        % of postings mentioning each skill (latest period)
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
                  {skill.delta_pp !== 0 && (
                    <span className={`text-xs ${skill.delta_pp > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatDelta(skill.delta_pp)}
                    </span>
                  )}
                  <span className={`badge ${directionBadge(skill.direction)}`}>
                    {directionLabel(skill.direction)}
                  </span>
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
