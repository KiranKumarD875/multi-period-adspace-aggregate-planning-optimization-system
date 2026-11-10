import { useEffect, useState } from 'react';
import { Check, Database, Layers, Package, Gauge, ShieldCheck, Table2, RefreshCw } from 'lucide-react';
import { Badge, Button } from './primitives.jsx';
import { changedSelections, describeValue } from '../lib/state.js';
import { num, objectiveName } from '../lib/format.js';

export const STEPS = [
  { id: 'data', label: 'Data', hint: 'Choose the observations' },
  { id: 'model', label: 'Model', hint: 'Set the selections' },
  { id: 'run', label: 'Solve', hint: 'Run both models' },
  { id: 'results', label: 'Results', hint: 'Read the answers' },
  { id: 'workbook', label: 'Workbook', hint: 'Download the Excel file' },
];

// Process stepper across the top. Steps needing a result are disabled until one exists.
export function Stepper({ current, onGo, hasResult }) {
  const index = STEPS.findIndex((s) => s.id === current);
  const fill = index / (STEPS.length - 1);
  return (
    <nav className="stepper" aria-label="Process steps">
      <div className="stepper-track" aria-hidden="true" />
      <div className="stepper-fill" aria-hidden="true" style={{ transform: `scaleX(${fill})` }} />
      {STEPS.map((s, i) => {
        const needsResult = s.id === 'results' || s.id === 'workbook';
        const disabled = needsResult && !hasResult;
        const state = i < index ? 'done' : i === index ? 'current' : '';
        return (
          <button
            key={s.id}
            type="button"
            className={`step ${state}`}
            disabled={disabled}
            onClick={() => onGo(s.id)}
            aria-current={i === index ? 'step' : undefined}
            title={disabled ? 'Run the analysis first' : s.hint}
          >
            <span className="step-dot">{i < index ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
            <span className="step-label">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Live summary of the selections, with changes since the last run highlighted.
export function PlanRail({ config, source, result, onRun, running, offline, dataName }) {
  const changes = changedSelections(result, config, source);
  const changedKeys = new Set(changes.map((c) => c.key));
  const cells = result ? result.inputs.cells.length : (config.category === 'campaign' ? 39 : 65);
  const budget = result ? result.inputs.budget : null;
  const rows = [
    { key: 'objective', label: 'Objective', value: objectiveName(config.objective) },
    { key: 'category', label: 'Planning category', value: config.category === 'campaign' ? 'Campaign' : 'Placement' },
    { key: 'budget_fraction', label: 'Budget share', value: `${Math.round(config.budget_fraction * 100)}%` },
    { key: 'capacity_factor', label: 'Capacity factor', value: `${config.capacity_factor.toFixed(2)}×` },
    { key: 'minimum_fraction', label: 'Minimum commitment', value: `${Math.round(config.minimum_fraction * 100)}%` },
    { key: 'pacing', label: 'Weekly caps', value: describeValue('pacing', config.pacing) },
    { key: 'package_sizes', label: 'Package sizes', value: `${config.package_sizes.length} sizes` },
  ];
  return (
    <aside className="rail" aria-label="Current plan">
      <div className="card rail-card" style={{ '--delay': '0ms' }}>
        <div className="rail-title">
          <span>Current plan</span>
          {result ? (
            changes.length ? <Badge tone="accent">{changes.length} changed</Badge> : <Badge tone="ok">In sync</Badge>
          ) : <Badge tone="neutral">Not run</Badge>}
        </div>
        <dl className="rail-list">
          <div className={changedKeys.has('source') ? 'changed' : ''}>
            <dt>Dataset</dt>
            <dd title={dataName} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{dataName}</dd>
          </div>
          {rows.map((r) => (
            <div key={r.key} className={changedKeys.has(r.key) ? 'changed' : ''}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
          <div>
            <dt>Planning cells</dt>
            <dd>{num(cells)}</dd>
          </div>
          {budget != null && (
            <div>
              <dt>Budget B</dt>
              <dd>${num(budget, 0)}</dd>
            </div>
          )}
        </dl>

        {changes.length > 0 && (
          <div className="banner banner-warn mt-sm" style={{ padding: '10px 12px', fontSize: 13 }}>
            <RefreshCw size={15} aria-hidden="true" />
            <div className="grow">
              The results and the workbook still show the previous selections. Run again to update them.
            </div>
          </div>
        )}

        <div className="mt">
          <Button variant="primary" size="md" icon={Layers} onClick={onRun} loading={running} disabled={offline} style={{ width: '100%' }}>
            {running ? 'Solving…' : result ? 'Run with these selections' : 'Run analysis'}
          </Button>
          {offline && <p className="xs muted mt-sm">The solver service must be running to run new selections.</p>}
        </div>
      </div>
    </aside>
  );
}

const PIPE = [
  { id: 'data', label: 'Read and validate the data', icon: Database },
  { id: 'cells', label: 'Aggregate into category-week cells', icon: Table2 },
  { id: 'lp', label: 'Model 1 · continuous LP (PuLP + CBC)', icon: Layers },
  { id: 'ip', label: 'Model 2 · 0/1 package selection', icon: Package },
  { id: 'duals', label: 'Shadow prices from the LP duals', icon: Gauge },
  { id: 'checks', label: 'Verify every constraint and answer', icon: ShieldCheck },
];

function detailFor(id, r) {
  if (!r) return null;
  switch (id) {
    case 'data': return `${num(r.dataset.usable_rows)} usable rows of ${num(r.dataset.rows)} · ${r.dataset.date_range}`;
    case 'cells': return `${r.inputs.cells.length} cells · ${r.inputs.categories.length} ${r.config.category === 'campaign' ? 'campaigns' : 'placements'} × ${r.dataset.weeks} weeks`;
    case 'lp': return `${num(r.model1.variables)} variables · ${num(r.model1.explicit_constraints)} constraints · ${r.model1.seconds != null ? r.model1.seconds.toFixed(2) + ' s' : 'solved'}`;
    case 'ip': return `${num(r.model2.selected_count)} of ${num(r.model2.variables)} packages bought · ${r.model2.status.toLowerCase()}`;
    case 'duals': {
      const rows = r.q4?.rows || [];
      const ok = rows.filter((x) => x.verified).length;
      return `${rows.length} binding rows · ${ok} re-checked by re-solving`;
    }
    case 'checks': return `${r.checks.passed} of ${r.checks.total} constraints pass`;
    default: return null;
  }
}

// The solve, shown stage by stage. The server call is a single request, so the stages
// advance on a timer while it runs; the figures under each stage are the real results,
// shown only when the response arrives.
export function Pipeline({ running, result, error }) {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!running) return undefined;
    setActive(0);
    const t = setInterval(() => setActive((a) => Math.min(a + 1, PIPE.length - 1)), 780);
    return () => clearInterval(t);
  }, [running]);

  const finished = !running && result && !error;
  const doneCount = finished ? PIPE.length : error ? 0 : running ? active : 0;
  const progress = finished ? 1 : PIPE.length ? Math.max(0, doneCount) / PIPE.length : 0;

  return (
    <div className="pipe-wrap">
      <div className="pipe-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <ol className="pipeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {PIPE.map((stage, i) => {
          const state = finished || i < doneCount ? 'done' : (running && i === active) ? 'active' : '';
          const Icon = stage.icon;
          const detail = finished ? detailFor(stage.id, result) : null;
          return (
            <li key={stage.id} className={`pipe-stage ${state}`} style={{ '--i': i }}>
              <span className="pipe-icon">
                {state === 'done' ? <Check size={18} strokeWidth={2.6} /> : <Icon size={18} />}
              </span>
              <div>
                <div className="pipe-title">{stage.label}</div>
                <div className={`pipe-detail ${detail ? '' : 'muted'}`}>
                  {detail || (state === 'active' ? 'Working…' : state === 'done' ? 'Done' : 'Waiting')}
                </div>
              </div>
              <span className="pipe-time">{state === 'done' ? 'done' : state === 'active' ? '…' : ''}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
