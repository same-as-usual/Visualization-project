import React from 'react';

export default function FilterPanel({
  taxonomy,
  selectedCategory,
  setSelectedCategory,
  selectedSkills,
  setSelectedSkills,
}) {
  const categories = taxonomy?.categories
    ? ['all', ...Object.keys(taxonomy.categories)]
    : ['all'];

  const skillsInCategory = taxonomy?.categories
    ? (selectedCategory === 'all'
        ? Object.values(taxonomy.categories).flat()
        : taxonomy.categories[selectedCategory] || [])
    : [];

  const toggleSkill = (skillName) => {
    setSelectedSkills(prev =>
      prev.includes(skillName)
        ? prev.filter(s => s !== skillName)
        : [...prev, skillName]
    );
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Filters</h3>

      {/* Category selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setSelectedSkills([]);
          }}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
      </div>

      {/* Skill multi-select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Skills {selectedSkills.length > 0 && `(${selectedSkills.length} selected)`}
        </label>
        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
          {skillsInCategory.map(skill => (
            <label
              key={skill.name}
              className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedSkills.includes(skill.name)}
                onChange={() => toggleSkill(skill.name)}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm">{skill.name}</span>
            </label>
          ))}
          {skillsInCategory.length === 0 && (
            <p className="text-sm text-gray-400 px-2">No skills in this category</p>
          )}
        </div>
        {selectedSkills.length > 0 && (
          <button
            onClick={() => setSelectedSkills([])}
            className="mt-2 text-sm text-primary-600 hover:text-primary-700"
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}
