import { useState, useEffect } from 'react';
import {
  loadTrends, loadTopSkills, loadTaxonomy, loadPipelineHealth, loadInsights,
} from '../utils/api';

export function useData() {
  const [trends, setTrends] = useState(null);
  const [topSkills, setTopSkills] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [health, setHealth] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [t, ts, tax, h, ins] = await Promise.all([
          loadTrends(),
          loadTopSkills(),
          loadTaxonomy(),
          loadPipelineHealth(),
          loadInsights(),
        ]);
        setTrends(t);
        setTopSkills(ts);
        setTaxonomy(tax);
        setHealth(h);
        setInsights(ins);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return { trends, topSkills, taxonomy, health, insights, loading, error };
}
