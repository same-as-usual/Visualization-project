import React from 'react';

export default function PipelineHealth({ health }) {
  if (!health) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Pipeline Health</h3>
        <p className="text-gray-500">No pipeline health data available.</p>
      </div>
    );
  }

  const latest = health.latest_run;
  const extraction = health.extraction;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Pipeline Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Collection Runs"
          value={health.total_runs}
        />
        <Stat
          label="Postings Collected"
          value={health.total_landed?.toLocaleString()}
        />
        <Stat
          label="Skills Extracted"
          value={extraction?.unique_skills}
        />
        <Stat
          label="Unique Postings"
          value={extraction?.unique_postings?.toLocaleString()}
        />
      </div>

      {latest && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Latest Run</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Source:</span>{' '}
              <span className="font-medium">{latest.source}</span>
            </div>
            <div>
              <span className="text-gray-500">Landed:</span>{' '}
              <span className="font-medium">{latest.records_landed}</span>
            </div>
            <div>
              <span className="text-gray-500">API Calls:</span>{' '}
              <span className="font-medium">{latest.api_calls}</span>
            </div>
            <div>
              <span className="text-gray-500">Errors:</span>{' '}
              <span className={`font-medium ${latest.http_errors > 0 ? 'text-red-600' : ''}`}>
                {latest.http_errors}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          Generated: {health.generated_at || 'Unknown'}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
    </div>
  );
}
