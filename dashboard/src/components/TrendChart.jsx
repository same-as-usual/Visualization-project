import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { formatPercent } from '../utils/formatters';
import { buildSkillColorMap, GRID, BASELINE, MUTED, INK, INK_2, SURFACE } from '../utils/viz';

const MAX_LINES = 8; // hard cap — the palette has 8 CVD-safe slots, never cycle

function VizTooltip({ active, payload, label, partialWeeks }) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div
      className="rounded-md px-3 py-2 text-xs"
      style={{ background: SURFACE, border: '1px solid rgba(59,157,255,0.3)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
    >
      <p className="mb-1.5" style={{ color: INK_2 }}>
        {partialWeeks.has(label) ? `${label} · partial` : label}
      </p>
      {rows.map((r) => (
        <div key={r.dataKey} className="flex items-center gap-2 py-0.5 tnum">
          <span style={{ display: 'inline-block', width: 12, height: 2, background: r.stroke, borderRadius: 1 }} />
          <span className="font-semibold" style={{ color: INK }}>{formatPercent(r.value)}</span>
          <span style={{ color: INK_2 }}>{r.dataKey}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({ data, selectedSkills, selectedCategory }) {
  const partialWeeks = useMemo(() => new Set(data?.partial_weeks || []), [data]);
  const colorMap = useMemo(() => buildSkillColorMap(data?.groups), [data]);

  const { chartData, skills } = useMemo(() => {
    if (!data?.groups) return { chartData: [], skills: [] };
    let groups = data.groups.filter(g => !g.suppressed);
    if (selectedCategory && selectedCategory !== 'all') {
      groups = groups.filter(g => g.category === selectedCategory);
    }
    let skillList;
    if (selectedSkills?.length > 0) {
      skillList = selectedSkills.slice(0, MAX_LINES);
    } else {
      const totals = {}, counts = {};
      for (const g of groups) {
        totals[g.skill] = (totals[g.skill] || 0) + g.current_share;
        counts[g.skill] = (counts[g.skill] || 0) + 1;
      }
      skillList = Object.keys(totals)
        .sort((a, b) => totals[b] / counts[b] - totals[a] / counts[a])
        .slice(0, MAX_LINES);
    }
    const skillSet = new Set(skillList);
    const byWeek = {};
    for (const g of groups) {
      if (!skillSet.has(g.skill)) continue;
      if (!byWeek[g.week]) byWeek[g.week] = { week: g.week };
      byWeek[g.week][g.skill] = g.current_share;
    }
    return {
      chartData: Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)),
      skills: skillList,
    };
  }, [data, selectedSkills, selectedCategory]);

  const { niceMax, yTicks } = useMemo(() => {
    let max = 0;
    for (const row of chartData) {
      for (const k of Object.keys(row)) {
        if (k !== 'week' && row[k] > max) max = row[k];
      }
    }
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2];
    const step = steps.find(s => Math.ceil(max / s) <= 4) || 0.25;
    const nm = step * Math.max(1, Math.ceil(max / step));
    const ticks = [];
    for (let t = 0; t <= nm + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
    return { niceMax: nm, yTicks: ticks };
  }, [chartData]);

  if (!chartData.length) {
    return (
      <div className="panel panel-pad">
        <h3 className="text-base font-semibold mb-1 prompt" style={{ color: INK }}>trends</h3>
        <p style={{ color: MUTED }}>no trend data yet — appears after the first collection run.</p>
      </div>
    );
  }

  return (
    <div className="panel panel-pad">
      <h3 className="text-base font-semibold prompt" style={{ color: INK }}>skill demand over time</h3>
      <p className="text-xs mt-1 mb-5" style={{ color: INK_2 }}>
        {'// '}% of postings mentioning each skill, by week posted
        {(!selectedSkills || selectedSkills.length === 0) && ' — top skills; filter to compare specific ones'}
        {partialWeeks.size > 0 && ' · weeks marked * are partial'}
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={{ stroke: BASELINE }}
            tickFormatter={(w) => partialWeeks.has(w) ? `${w}*` : w}
          />
          <YAxis
            domain={[0, niceMax]}
            ticks={yTicks}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<VizTooltip partialWeeks={partialWeeks} />} cursor={{ stroke: BASELINE, strokeWidth: 1 }} />
          <Legend
            iconType="plainline"
            wrapperStyle={{ paddingTop: 12 }}
            formatter={(value) => <span style={{ color: INK_2, fontSize: 12, marginRight: 4 }}>{value}</span>}
          />
          {skills.map((skill) => (
            <Line
              key={skill}
              type="monotone"
              dataKey={skill}
              stroke={colorMap[skill] || MUTED}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 3, fill: colorMap[skill] || MUTED, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
