import React from 'react';

function Tile({ label, value, sub }) {
  return (
    <div className="panel panel-pad">
      <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-3xl font-semibold tnum glow" style={{ color: 'var(--accent)' }}>{value ?? '—'}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </div>
  );
}

export default function PipelineHealth({ health }) {
  if (!health) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: 'var(--ink)' }}>pipeline-status</h3>
        <p style={{ color: 'var(--muted)' }}>no pipeline health data available.</p>
      </div>
    );
  }

  const latest = health.latest_run;
  const ex = health.extraction;
  const coverage = ex?.postings_with_mentions != null && ex?.unique_postings
    ? `${((ex.postings_with_mentions / ex.unique_postings) * 100).toFixed(0)}% have ≥1 skill`
    : null;

  const fields = latest ? [
    ['source', latest.source],
    ['records_landed', latest.records_landed],
    ['api_calls', latest.api_calls],
    ['http_errors', latest.http_errors ?? 0],
  ] : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="collection_runs" value={health.total_runs} />
        <Tile label="records_landed" value={health.total_landed?.toLocaleString()} sub="raw, pre-dedupe" />
        <Tile label="unique_postings" value={ex?.unique_postings?.toLocaleString()} sub={coverage} />
        <Tile label="skills_observed" value={ex?.unique_skills} sub={`${ex?.total_mentions?.toLocaleString() ?? '—'} mentions`} />
      </div>

      <div className="panel panel-pad">
        <h3 className="text-sm font-semibold mb-4 prompt" style={{ color: 'var(--accent)' }}>tail -n1 ingestion_runs.jsonl</h3>
        {latest ? (
          <div className="font-mono text-sm space-y-1.5">
            {fields.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span style={{ color: 'var(--muted)' }} className="w-36">{k}</span>
                <span style={{ color: k === 'http_errors' ? (v > 0 ? 'var(--bad)' : 'var(--good)') : 'var(--ink)' }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        ) : <p style={{ color: 'var(--muted)' }}>no runs recorded yet.</p>}
        <p className="text-[11px] mt-4 pt-4" style={{ color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>
          quarantined: {health.total_quarantined ?? 0} · generated {health.generated_at?.slice(0, 16).replace('T', ' ')} UTC
        </p>
      </div>
    </div>
  );
}
