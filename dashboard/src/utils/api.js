// Prefix with Vite's base URL so the app works when hosted under a
// subpath (e.g. GitHub Pages /<repo>/) as well as at the domain root.
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

export async function loadTrends() {
  const res = await fetch(`${API_BASE}/trends.json`);
  if (!res.ok) throw new Error('Failed to load trends');
  return res.json();
}

export async function loadTopSkills() {
  const res = await fetch(`${API_BASE}/top_skills.json`);
  if (!res.ok) throw new Error('Failed to load top skills');
  return res.json();
}

export async function loadTaxonomy() {
  const res = await fetch(`${API_BASE}/taxonomy.json`);
  if (!res.ok) throw new Error('Failed to load taxonomy');
  return res.json();
}

export async function loadPipelineHealth() {
  const res = await fetch(`${API_BASE}/pipeline_health.json`);
  if (!res.ok) return null; // optional file
  return res.json();
}

export async function loadInsights() {
  const res = await fetch(`${API_BASE}/insights.json`);
  if (!res.ok) return null; // optional file
  return res.json();
}
