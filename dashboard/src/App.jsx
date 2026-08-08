import React, { useState } from 'react';
import { useData } from './hooks/useData';
import TrendChart from './components/TrendChart';
import TopSkillsChart from './components/TopSkillsChart';
import Heatmap from './components/Heatmap';
import FilterPanel from './components/FilterPanel';
import PipelineHealth from './components/PipelineHealth';

export default function App() {
  const { trends, topSkills, taxonomy, health, loading, error } = useData();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [activeTab, setActiveTab] = useState('trends');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-md text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error Loading Data</h2>
          <p className="text-gray-600">{error}</p>
          <p className="text-sm text-gray-400 mt-2">
            Make sure the data files exist in public/data/
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'trends', label: 'Trends' },
    { id: 'top', label: 'Top Skills' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'health', label: 'Pipeline Health' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Skill Trends</h1>
              <p className="text-sm text-gray-500 mt-1">
                Job market skill demand, measured honestly
              </p>
            </div>
            {trends?.summary && (
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">Skills Tracked</p>
                  <p className="font-bold text-lg">{trends.summary.total_skills}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Rising</p>
                  <p className="font-bold text-lg text-green-600">{trends.summary.rising}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Falling</p>
                  <p className="font-bold text-lg text-red-600">{trends.summary.falling}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'health' ? (
          <PipelineHealth health={health} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Filters sidebar */}
            <aside className="lg:col-span-1">
              <FilterPanel
                taxonomy={taxonomy}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedSkills={selectedSkills}
                setSelectedSkills={setSelectedSkills}
              />
            </aside>

            {/* Charts */}
            <div className="lg:col-span-3 space-y-8">
              {activeTab === 'trends' && (
                <TrendChart
                  data={trends}
                  selectedSkills={selectedSkills}
                  selectedCategory={selectedCategory}
                />
              )}
              {activeTab === 'top' && (
                <TopSkillsChart data={topSkills} trends={trends} />
              )}
              {activeTab === 'heatmap' && (
                <Heatmap
                  data={trends}
                  selectedCategory={selectedCategory}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <p>
              Data from Adzuna + Remotive APIs. Extraction via spaCy PhraseMatcher.
            </p>
            {trends?.taxonomy_version && (
              <p>Taxonomy: {trends.taxonomy_version}</p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
