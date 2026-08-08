import React from 'react';

const MAX_SKILLS = 8; // matches the trend chart's 8 CVD-safe color slots

export default function FilterPanel({
  taxonomy,
  selectedCategory,
  setSelectedCategory,
  selectedSkills,
  setSelectedSkills,
}) {
  const categories = taxonomy?.categories
    ? ['all', ...Object.keys(taxonomy.categories).sort()]
    : ['all'];

  const skillsInCategory = taxonomy?.categories
    ? (selectedCategory === 'all'
        ? Object.values(taxonomy.categories).flat()
        : taxonomy.categories[selectedCategory] || [])
    : [];
  const sortedSkills = [...skillsInCategory].sort((a, b) => a.name.localeCompare(b.name));

  const toggleSkill = (skillName) => {
    setSelectedSkills(prev => {
      if (prev.includes(skillName)) return prev.filter(s => s !== skillName);
      if (prev.length >= MAX_SKILLS) return prev; // cap reached
      return [...prev, skillName];
    });
  };

  const atCap = selectedSkills.length >= MAX_SKILLS;

  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-4" style={{ color: '#0b0b0b' }}>Filters</h3>

      {/* Category selector */}
      <div className="mb-5">
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#52514e' }}>
          Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setSelectedSkills([]);
          }}
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ border: '1px solid var(--hairline)', background: 'var(--surface)', color: '#0b0b0b' }}
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All categories' : cat}
            </option>
          ))}
        </select>
      </div>

      {/* Skill multi-select */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="text-xs font-medium" style={{ color: '#52514e' }}>
            Skills
          </label>
          <span className="text-xs tnum" style={{ color: atCap ? 'var(--bad)' : '#898781' }}>
            {selectedSkills.length}/{MAX_SKILLS}
          </span>
        </div>
        <div
          className="max-h-72 overflow-y-auto rounded-lg p-1.5 space-y-0.5"
          style={{ border: '1px solid var(--hairline)' }}
        >
          {sortedSkills.map(skill => {
            const checked = selectedSkills.includes(skill.name);
            const disabled = !checked && atCap;
            return (
              <label
                key={skill.name}
                className={`flex items-center gap-2 px-2 py-1 rounded-md ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-black/[0.03]'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleSkill(skill.name)}
                  className="rounded"
                  style={{ accentColor: '#2a78d6' }}
                />
                <span className="text-sm" style={{ color: '#0b0b0b' }}>{skill.name}</span>
              </label>
            );
          })}
          {sortedSkills.length === 0 && (
            <p className="text-sm px-2 py-1" style={{ color: '#898781' }}>No skills in this category</p>
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: '#898781' }}>
          Pick up to {MAX_SKILLS} skills to compare on the trend chart.
        </p>
        {selectedSkills.length > 0 && (
          <button
            onClick={() => setSelectedSkills([])}
            className="mt-1 text-sm font-medium hover:underline"
            style={{ color: '#2a78d6' }}
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}
