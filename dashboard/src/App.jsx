import React, { useState } from 'react';
import { useData } from './hooks/useData';
import TrendChart from './components/TrendChart';
import TopSkillsChart from './components/TopSkillsChart';
import Heatmap from './components/Heatmap';
import FilterPanel from './components/FilterPanel';
import PipelineHealth from './components/PipelineHealth';

const REPO_URL = 'https://github.com/same-as-usual/Visualization-project';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#2a78d6" />
      <polyline
        points="6,19 11,13 15,16 22,8"
        fill="none"
        stroke="#fcfcfb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="text-right">
      <p className="text-xs" style={{ color: '#898781' }}>{label}</p>
      <p className="text-2xl font-semibold leading-tight" style={{ color: accent || '#0b0b0b' }}>
        {value ?? '—'}
      </p>
    </div>
  );
}

export default function App() {
  const { trends, topSkills, taxonomy, health, loading, error } = useData();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [activeTab, setActiveTab] = useState('trends');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: '#2a78d6' }} />
          <p style={{ color: '#898781' }}>Loading dashboard data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--bad)' }}>Error loading data</h2>
          <p style={{ color: '#52514e' }}>{error}</p>
          <p className="text-sm mt-2" style={{ color: '#898781' }}>
            Make sure the data files exist in public/data/
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'trends', label: 'Trends' },
    { id: 'top', label: 'Top skills' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'health', label: 'Pipeline health' },
  ];

  const postings = health?.extraction?.unique_postings;
  const updated = trends?.generated_at ? trends.generated_at.slice(0, 10) : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--hairline)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Logo />
              <div>
                <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#0b0b0b' }}>
                  Skill Trends
                </h1>
                <p className="text-sm" style={{ color: '#52514e' }}>
                  Job-market skill demand, measured honestly
                </p>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <StatTile label="Postings analyzed" value={postings?.toLocaleString()} />
              <StatTile label="Skills tracked" value={trends?.summary?.total_skills} />
              <StatTile label="Rising" value={trends?.summary?.rising != null ? `↑ ${trends.summary.rising}` : null} accent="var(--good)" />
              <StatTile label="Falling" value={trends?.summary?.falling != null ? `↓ ${trends.summary.falling}` : null} accent="var(--bad)" />
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--hairline)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-7">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="py-3.5 px-0.5 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === tab.id ? '#0b0b0b' : '#898781',
                  boxShadow: activeTab === tab.id ? 'inset 0 -2px 0 #2a78d6' : 'none',
                }}
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <aside className="lg:col-span-1">
              <FilterPanel
                taxonomy={taxonomy}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedSkills={selectedSkills}
                setSelectedSkills={setSelectedSkills}
              />
            </aside>
            <div className="lg:col-span-3 space-y-6">
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
                <Heatmap data={trends} selectedCategory={selectedCategory} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-10" style={{ background: 'var(--surface)', borderTop: '1px solid var(--hairline)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: '#898781' }}>
            <p>
              Data: Adzuna (IN · US · GB) + Remotive. Extraction: spaCy PhraseMatcher
              against a versioned taxonomy. Shares carry 95% Wilson intervals.
            </p>
            <div className="flex items-center gap-4">
              {updated && <span>Updated {updated}</span>}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
                style={{ color: '#52514e' }}
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
