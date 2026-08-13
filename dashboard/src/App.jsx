import React, { useState } from 'react';
import { useData } from './hooks/useData';
import TrendChart from './components/TrendChart';
import TopSkillsChart from './components/TopSkillsChart';
import Heatmap from './components/Heatmap';
import FilterPanel from './components/FilterPanel';
import PipelineHealth from './components/PipelineHealth';
import Movers from './components/Movers';
import Categories from './components/Categories';
import SkillPairs from './components/SkillPairs';
import Markets from './components/Markets';

const REPO_URL = 'https://github.com/same-as-usual/Visualization-project';

const TABS = [
  { id: 'trends', cmd: 'trends', sidebar: true },
  { id: 'top', cmd: 'top-skills', sidebar: true },
  { id: 'pairs', cmd: 'skill-pairs', sidebar: false },
  { id: 'markets', cmd: 'markets', sidebar: true },
  { id: 'status', cmd: 'pipeline-status', sidebar: false },
];

function TermHeader() {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      <span className="term-dot" style={{ background: '#e66767' }} />
      <span className="term-dot" style={{ background: '#c98500' }} />
      <span className="term-dot" style={{ background: '#2ee6a6' }} />
      <span className="ml-3 text-xs" style={{ color: 'var(--muted)' }}>
        visitor@skill-trends:~ — job-market intelligence
      </span>
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="text-lg font-semibold tnum" style={{ color: accent || 'var(--ink)' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function App() {
  const { trends, topSkills, taxonomy, health, insights, loading, error } = useData();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [activeTab, setActiveTab] = useState('trends');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="prompt cursor" style={{ color: 'var(--accent)' }}>booting skill-trends</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="panel panel-pad max-w-lg">
          <p style={{ color: 'var(--bad)' }} className="prompt mb-2">error: data load failed</p>
          <p style={{ color: 'var(--ink-2)' }} className="text-sm">{error}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            expected JSON in public/data/ (run scripts/export.py)
          </p>
        </div>
      </div>
    );
  }

  const tab = TABS.find(t => t.id === activeTab);
  const postings = health?.extraction?.unique_postings;
  const updated = trends?.generated_at ? trends.generated_at.slice(0, 10) : null;
  const avgSkills = insights?.totals?.avg_skills_per_posting;

  return (
    <div className="min-h-screen">
      {/* Header — terminal window */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="panel">
          <TermHeader />
          <div className="px-5 py-5 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight glow" style={{ color: 'var(--accent)' }}>
                SKILL_TRENDS
              </h1>
              <p className="text-sm mt-1 prompt" style={{ color: 'var(--ink-2)' }}>
                <span style={{ color: 'var(--ink)' }}>analyze --market=global --honest</span>
              </p>
            </div>
            <div className="flex items-center gap-7 flex-wrap">
              <Metric label="postings" value={postings?.toLocaleString()} />
              <Metric label="skills" value={trends?.summary?.total_skills} />
              <Metric label="avg/posting" value={avgSkills} />
              <Metric label="rising" value={trends?.summary?.rising != null ? `▲${trends.summary.rising}` : null} accent="var(--good)" />
              <Metric label="falling" value={trends?.summary?.falling != null ? `▼${trends.summary.falling}` : null} accent="var(--bad)" />
            </div>
          </div>
        </div>
      </header>

      {/* Command nav */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(t => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--ink-2)',
                  background: active ? 'rgba(59,157,255,0.10)' : 'transparent',
                  border: `1px solid ${active ? 'var(--line-2)' : 'transparent'}`,
                }}
              >
                <span style={{ color: 'var(--muted)' }}>./</span>{t.cmd}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {tab.sidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <aside className="lg:col-span-1">
              <FilterPanel
                taxonomy={taxonomy}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedSkills={selectedSkills}
                setSelectedSkills={setSelectedSkills}
              />
            </aside>
            <div className="lg:col-span-3 space-y-5">
              {activeTab === 'trends' && (
                <>
                  <TrendChart data={trends} selectedSkills={selectedSkills} selectedCategory={selectedCategory} />
                  <Movers insights={insights} />
                </>
              )}
              {activeTab === 'top' && (
                <>
                  <TopSkillsChart data={topSkills} trends={trends} />
                  <Categories insights={insights} />
                </>
              )}
              {activeTab === 'markets' && (
                <>
                  <Markets insights={insights} />
                  <Heatmap data={trends} selectedCategory={selectedCategory} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {activeTab === 'pairs' && <SkillPairs insights={insights} />}
            {activeTab === 'status' && <PipelineHealth health={health} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="panel panel-pad flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: 'var(--muted)' }}>
          <p>
            <span style={{ color: 'var(--accent-2)' }}>{'>'}</span> data: adzuna(in·us·gb) + remotive ·
            nlp: spaCy PhraseMatcher · stats: wilson 95% CI, complete-week deltas
          </p>
          <div className="flex items-center gap-4">
            {updated && <span>last_sync: {updated}</span>}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--accent)' }}>
              [github]
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
