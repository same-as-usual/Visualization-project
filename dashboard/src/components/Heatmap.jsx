import React, { useMemo } from 'react';
import { formatPercent } from '../utils/formatters';

export default function Heatmap({ data, selectedCategory }) {
  const heatmapData = useMemo(() => {
    if (!data?.groups) return { skills: [], locations: [], cells: {} };

    let groups = data.groups.filter(g => !g.suppressed);

    if (selectedCategory && selectedCategory !== 'all') {
      groups = groups.filter(g => g.category === selectedCategory);
    }

    // Get unique skills and locations
    const skillSet = new Set();
    const locationSet = new Set();
    const cells = {};

    for (const g of groups) {
      if (!g.location) continue;
      skillSet.add(g.skill);
      locationSet.add(g.location);
      const key = `${g.skill}|${g.location}`;
      cells[key] = g.current_share;
    }

    // Sort skills by average share
    const skills = [...skillSet].sort((a, b) => {
      const avgA = groups.filter(g => g.skill === a).reduce((s, g) => s + g.current_share, 0);
      const avgB = groups.filter(g => g.skill === b).reduce((s, g) => s + g.current_share, 0);
      return avgB - avgA;
    });

    return { skills: skills.slice(0, 20), locations: [...locationSet].slice(0, 10), cells };
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
    if (value == null) return 'bg-gray-50';
    if (value >= 0.5) return 'bg-blue-700 text-white';
    if (value >= 0.3) return 'bg-blue-500 text-white';
    if (value >= 0.15) return 'bg-blue-300';
    if (value >= 0.05) return 'bg-blue-100';
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
