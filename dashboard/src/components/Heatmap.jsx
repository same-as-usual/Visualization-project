import React, { useMemo } from 'react';
import { formatPercent } from '../utils/formatters';

export default function Heatmap({ data, selectedCategory }) {
  const heatmapData = useMemo(() => {
    // data.locations: full-period skill×country aggregates from the export
    // (one row per pair, already suppression-filtered).
    if (!data?.locations?.length) return { skills: [], locations: [], cells: {} };

    let rows = data.locations;
    if (selectedCategory && selectedCategory !== 'all') {
      rows = rows.filter(r => r.category === selectedCategory);
    }

    const cells = {};
    const skillTotals = {};
    const locPostings = {};
    for (const r of rows) {
      cells[`${r.skill}|${r.location}`] = r.share;
      skillTotals[r.skill] = (skillTotals[r.skill] || 0) + r.share;
      locPostings[r.location] = Math.max(locPostings[r.location] || 0, r.postings || 0);
    }

    const skills = Object.keys(skillTotals)
      .sort((a, b) => skillTotals[b] - skillTotals[a])
      .slice(0, 20);
    // Columns ordered by posting volume (biggest markets first).
    const locations = Object.keys(locPostings)
      .sort((a, b) => locPostings[b] - locPostings[a])
      .slice(0, 10);

    return { skills, locations, cells };
  }, [data, selectedCategory]);

  if (!heatmapData.skills.length) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Skill × Location Heatmap</h3>
        <p className="text-gray-500">No location data available yet.</p>
      </div>
    );
  }

  const { skills, locations, cells } = heatmapData;

  const getColor = (value) => {
    // Thresholds tuned to realistic skill shares (top skills sit ~10–30%).
    if (value == null) return 'bg-gray-50';
    if (value >= 0.25) return 'bg-blue-700 text-white';
    if (value >= 0.15) return 'bg-blue-500 text-white';
    if (value >= 0.08) return 'bg-blue-300';
    if (value >= 0.03) return 'bg-blue-100';
    return 'bg-blue-50';
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Skill × Location Heatmap</h3>
      <p className="text-sm text-gray-500 mb-4">
        % of postings mentioning each skill by location
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium text-gray-600 sticky left-0 bg-white z-10">
                Skill
              </th>
              {locations.map(loc => (
                <th key={loc} className="p-2 font-medium text-gray-600 text-center min-w-[80px]">
                  {loc.length > 12 ? loc.slice(0, 12) + '…' : loc}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skills.map(skill => (
              <tr key={skill} className="hover:bg-gray-50">
                <td className="p-2 font-medium text-gray-700 sticky left-0 bg-white z-10">
                  {skill}
                </td>
                {locations.map(loc => {
                  const value = cells[`${skill}|${loc}`];
                  return (
                    <td key={loc} className={`p-2 text-center ${getColor(value)}`}>
                      {value != null ? formatPercent(value, 0) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
