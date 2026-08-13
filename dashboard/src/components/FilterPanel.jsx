import React from 'react';

const MAX_SKILLS = 8;

export default function FilterPanel({
  taxonomy, selectedCategory, setSelectedCategory, selectedSkills, setSelectedSkills,
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

  const toggleSkill = (name) => {
    setSelectedSkills(prev => {
      if (prev.includes(name)) return prev.filter(s => s !== name);
      if (prev.length >= MAX_SKILLS) return prev;
      return [...prev, name];
    });
  };
  const atCap = selectedSkills.length >= MAX_SKILLS;

  return (
    <div className="panel panel-pad">
      <h3 className="text-sm font-semibold mb-4 prompt" style={{ color: 'var(--accent)' }}>filter</h3>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>category</label>
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSkills([]); }}
          className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
          style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }}
        >
          {categories.map(cat => <option key={cat} value={cat}>{cat === 'all' ? 'all' : cat}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>skills</label>
          <span className="text-xs tnum" style={{ color: atCap ? 'var(--bad)' : 'var(--muted)' }}>{selectedSkills.length}/{MAX_SKILLS}</span>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md p-1.5 space-y-0.5" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
          {sortedSkills.map(skill => {
            const checked = selectedSkills.includes(skill.name);
            const disabled = !checked && atCap;
            return (
              <label key={skill.name} className={`flex items-center gap-2 px-2 py-1 rounded ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-[rgba(59,157,255,0.06)]'}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSkill(skill.name)} style={{ accentColor: '#3b9dff' }} />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{skill.name}</span>
              </label>
            );
          })}
          {sortedSkills.length === 0 && <p className="text-sm px-2 py-1" style={{ color: 'var(--muted)' }}>no skills in category</p>}
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>up to {MAX_SKILLS} skills on the trend chart</p>
        {selectedSkills.length > 0 && (
          <button onClick={() => setSelectedSkills([])} className="mt-1 text-sm hover:underline" style={{ color: 'var(--accent)' }}>clear</button>
        )}
      </div>
    </div>
  );
}
