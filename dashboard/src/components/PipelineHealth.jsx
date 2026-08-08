import React from 'react';

function StatTile({ label, value, sub }) {
  return (
    <div className="card">
      <p className="text-xs mb-1" style={{ color: '#898781' }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color: '#0b0b0b' }}>{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#898781' }}>{sub}</p>}
    </div>
  );
}

export default function PipelineHealth({ health }) {
  if (!health) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-1">Pipeline health</h3>
        <p style={{ color: '#898781' }}>No pipeline health data available.</p>
      </div>
    );
  }

  const latest = health.latest_run;
  const extraction = health.extraction;
  const coverage =
    extraction?.postings_with_mentions != null && extraction?.unique_postings
      ? `${((extraction.postings_with_mentions / extraction.unique_postings) * 100).toFixed(0)}% of postings have ≥1 skill`
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Collection runs" value={health.total_runs} />
        <StatTile label="Records landed" value={health.total_landed?.toLocaleString()} sub="raw, before dedupe" />
        <StatTile label="Unique postings" value={extraction?.unique_postings?.toLocaleString()} sub={coverage} />
        <StatTile label="Skills observed" value={extraction?.unique_skills} sub={`${extraction?.total_mentions?.toLocaleString() ?? '—'} mentions`} />
      </div>

      <div className="card">
        <h3 className="text-base font-semibold mb-4" style={{ color: '#0b0b0b' }}>Latest collection run</h3>
        {latest ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#898781' }}>Source</p>
              <p className="font-medium" style={{ color: '#0b0b0b' }}>{latest.source}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#898781' }}>Records landed</p>
              <p className="font-medium tnum" style={{ color: '#0b0b0b' }}>{latest.records_landed}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#898781' }}>API calls</p>
              <p className="font-medium tnum" style={{ color: '#0b0b0b' }}>{latest.api_calls}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#898781' }}>HTTP errors</p>
              <p className="font-medium tnum" style={{ color: latest.http_errors > 0 ? 'var(--bad)' : 'var(--good)' }}>
                {latest.http_errors ?? 0}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ color: '#898781' }}>No runs recorded yet.</p>
        )}
        <p className="text-xs mt-4 pt-4" style={{ color: '#898781', borderTop: '1px solid var(--hairline)' }}>
          Quarantined records: {health.total_quarantined ?? 0} · Generated {health.generated_at?.slice(0, 16).replace('T', ' ')} UTC
        </p>
      </div>
    </div>
  );
}
