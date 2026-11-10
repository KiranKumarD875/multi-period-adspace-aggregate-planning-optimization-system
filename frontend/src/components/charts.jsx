import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { compact, money, num, pct } from '../lib/format.js';

const C = {
  grid: '#ece7dc',
  axis: '#7a808c',
  accent: '#ff6b35',
  accentSoft: '#ffb799',
  lp: '#2f6fed',
  ip: '#7b5cf5',
  base: '#9aa1ad',
  ok: '#12a06b',
  warn: '#c77700',
  bad: '#d92d20',
  ink: '#434956',
};

const tick = { fill: C.axis, fontSize: 12, fontFamily: 'IBM Plex Sans, sans-serif' };

function Tip({ active, payload, label, rows }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="ctip">
      <div className="ctip-title">{label}</div>
      {rows(payload)}
    </div>
  );
}

export function WeeklyChart({ weekly, unit, showCap }) {
  const data = weekly.map((w) => ({ name: w.label.replace('Week ', 'W'), spend: w.spend, objective: w.conversions, cap: w.cap ?? null }));
  return (
    <ResponsiveContainer width="100%" height={310}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} />
        <YAxis yAxisId="s" tick={tick} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => compact(v)} />
        <YAxis yAxisId="o" orientation="right" tick={tick} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => compact(v)} />
        <Tooltip
          cursor={{ fill: 'rgba(255, 107, 53, 0.06)' }}
          content={(p) => (
            <Tip {...p} rows={(pl) => pl.map((x) => (
              <div key={x.dataKey} className="ctip-row">
                <span>{x.dataKey === 'spend' ? 'Spend' : x.dataKey === 'objective' ? `Objective (${unit})` : 'Weekly cap'}</span>
                <b>{x.dataKey === 'objective' ? num(x.value, 1) : money(x.value)}</b>
              </div>
            ))} />
          )}
        />
        <Bar yAxisId="s" dataKey="spend" fill={C.accent} radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={900} />
        <Line yAxisId="o" dataKey="objective" stroke={C.ip} strokeWidth={2.5} dot={{ r: 3.5, fill: '#fff', stroke: C.ip, strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={1100} />
        {showCap && <Line yAxisId="s" dataKey="cap" stroke={C.bad} strokeDasharray="5 4" dot={false} strokeWidth={1.5} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ComparisonChart({ baseline, lp, ip, unit }) {
  const data = [
    { name: 'Proportional split', value: baseline, color: C.base },
    { name: 'Model 1 · LP', value: lp, color: C.lp },
    { name: 'Model 2 · IP', value: ip, color: C.ip },
  ].filter((d) => Number.isFinite(d.value));
  const floor = data.length ? Math.floor(Math.min(...data.map((d) => d.value)) * 0.985) : 0;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" domain={[floor, 'auto']} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => compact(v)} />
        <YAxis type="category" dataKey="name" width={150} tick={{ ...tick, fill: C.ink, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(47, 111, 237, 0.05)' }} content={(p) => (
          <Tip {...p} rows={(pl) => pl.map((x) => <div key="v" className="ctip-row"><span>{unit}</span><b>{num(x.value, 1)}</b></div>)} />
        )} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={26} animationDuration={900}
          label={{ position: 'right', formatter: (v) => num(v, 0), fill: C.ink, fontSize: 12.5, fontFamily: 'IBM Plex Mono, monospace' }}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ShadowChart({ rows, unit }) {
  const data = rows.slice(0, 10).map((r, i) => ({
    name: r.label.split('  ')[0],
    value: r.shadow_price,
    rank: i + 1,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(230, data.length * 38 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 74, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => v.toFixed(3)} />
        <YAxis type="category" dataKey="name" width={230} tick={{ ...tick, fill: C.ink }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(255, 107, 53, 0.06)' }} content={(p) => (
          <Tip {...p} rows={(pl) => pl.map((x) => <div key="v" className="ctip-row"><span>+1 unit adds</span><b>{x.value.toFixed(6)} {unit}</b></div>)} />
        )} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18} animationDuration={900}
          label={{ position: 'right', formatter: (v) => v.toFixed(5), fill: C.ink, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
          {data.map((d) => <Cell key={d.rank} fill={d.rank === 1 ? C.accent : C.accentSoft} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UtilisationChart({ categories }) {
  const data = categories.map((c) => ({ name: c.category, value: c.utilisation_pct, label: c.label }));
  const colour = (v) => (v >= 99 ? C.lp : v < 1 ? C.base : C.warn);
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 52 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 64, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => v + '%'} />
        <YAxis type="category" dataKey="name" width={90} tick={{ ...tick, fill: C.ink, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={99} stroke={C.ok} strokeDasharray="4 4" label={{ value: '99%', position: 'top', fill: C.ok, fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'rgba(47, 111, 237, 0.05)' }} content={(p) => (
          <Tip {...p} rows={(pl) => pl.map((x) => <div key="v" className="ctip-row"><span>{x.payload.label}</span><b>{pct(x.value, 1)}</b></div>)} />
        )} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22} animationDuration={900}
          label={{ position: 'right', formatter: (v) => pct(v, 1), fill: C.ink, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
          {data.map((d) => <Cell key={d.name} fill={colour(d.value)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
