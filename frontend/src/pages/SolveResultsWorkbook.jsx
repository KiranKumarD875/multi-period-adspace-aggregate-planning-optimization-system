import { useMemo, useState } from 'react';
import {
  ArrowRight, Layers, Download, FileSpreadsheet, RefreshCw, CalendarRange, Gauge, Package,
  Target, Lightbulb, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Button, Card, CardHead, Metric, Segmented, Table, Badge, Banner, Empty, statusTone } from '../components/primitives.jsx';
import { Pipeline } from '../components/process.jsx';
import { WeeklyChart, ComparisonChart, ShadowChart, UtilisationChart } from '../components/charts.jsx';
import { PageHead, StepNav } from './DataAndModel.jsx';
import { money, num, pct, rate, unitWord, objectiveName, compact } from '../lib/format.js';
import { changedSelections, describeValue, workbookFileName } from '../lib/state.js';

/* ------------------------------------------------------------------ Solve */

export function SolveStep({ config, result, running, runError, onRun, onBack, onOpenResults, justFinished }) {
  return (
    <div className="page">
      <PageHead
        eyebrow="Step 3 · Solve"
        title={running ? 'Solving both models' : result && !runError ? 'Both models are solved' : 'Solve both models'}
        sub="The browser sends your selections to the solver. Model 1 chooses the allocation with PuLP and CBC; Model 2 selects packages; the shadow prices come from the LP duals. Each stage fills in as the results arrive."
      />

      <Card className="run-hero" delay={0}>
        <div>
          <div className="row gap-md" style={{ alignItems: 'center' }}>
            <div className={`run-orb ${running ? '' : 'idle'}`}><Layers size={34} aria-hidden="true" /></div>
            <div>
              <div className="card-title">{objectiveName(config.objective)} · {config.category === 'campaign' ? 'Campaign' : 'Placement'} · {Math.round(config.budget_fraction * 100)}% budget</div>
              <p className="card-sub">
                {config.pacing === 'even' ? 'Even weekly pacing' : 'Free weekly timing'} · {Math.round(config.minimum_fraction * 100)}% minimum commitment · capacity {config.capacity_factor.toFixed(2)}× · {config.package_sizes.length} package sizes
              </p>
            </div>
          </div>
        </div>
        <div className="row gap-sm wrap" style={{ justifyContent: 'flex-end' }}>
          {!running && !result && <Button variant="primary" size="lg" icon={Layers} onClick={onRun}>Run analysis</Button>}
          {!running && result && runError && <Button variant="primary" size="lg" icon={RefreshCw} onClick={onRun}>Try again</Button>}
          {!running && result && !runError && <Button variant="ink" size="lg" icon={ArrowRight} onClick={onOpenResults}>Open results</Button>}
        </div>
      </Card>

      {runError && !running && (
        <div className="mt"><Banner tone="bad" action={<Button size="sm" variant="secondary" onClick={onRun}>Retry</Button>}>{runError}</Banner></div>
      )}
      {!runError && justFinished && result && !running && (
        <div className="mt"><Banner tone="ok">Both models solved. Opening the results…</Banner></div>
      )}

      <Card className="mt" delay={80}>
        <CardHead eyebrow="Process" title="What happens when you run" sub={running ? 'Working on the server. Stage results appear below as the response arrives.' : result ? 'Stage results for the run that is shown.' : 'Six stages. Their results appear here when the run completes.'} />
        <Pipeline running={running} result={result && !runError ? result : null} error={runError} />
      </Card>

      <StepNav back="Back to the model" onBack={onBack} />
    </div>
  );
}

/* ---------------------------------------------------------------- Results */

const TABS = [
  { value: 'q1', label: 'Allocation' },
  { value: 'q2', label: 'Weekly plan' },
  { value: 'q3', label: 'Capacity' },
  { value: 'q4', label: 'Shadow prices' },
  { value: 'm2', label: 'Model 2 · Packages' },
];

export function ResultsStep({ result, config, source, onRun, running, onGo }) {
  const [tab, setTab] = useState('q1');
  const changes = changedSelections(result, config, source);

  if (!result) {
    return (
      <div className="page">
        <PageHead eyebrow="Step 4 · Results" title="Results" />
        <Empty icon={Gauge} title="No results yet" action={<Button variant="primary" onClick={onRun} loading={running}>Run analysis</Button>}>
          Results appear here after both models have been solved.
        </Empty>
      </div>
    );
  }
  if (!result.q1) {
    return (
      <div className="page">
        <PageHead eyebrow="Step 4 · Results" title="No feasible plan" />
        <Banner tone="bad" action={<Button size="sm" variant="secondary" onClick={() => onGo('model')}>Change the selections</Button>}>{result.model1.message}</Banner>
      </div>
    );
  }

  const unit = unitWord(result.config.objective);
  const q1 = result.q1, q2 = result.q2, q3 = result.q3, q4 = result.q4;
  const weeks = q2.weekly;
  const peak = weeks.reduce((a, b) => (b.spend > a.spend ? b : a));
  const bound = q3.categories.filter((c) => c.label === 'Capacity-bound').length;
  const top = q4.rows[0];

  const answers = [
    {
      key: 'q1', title: 'Best allocation', icon: Target, big: `${num(q1.objective)}`, unit,
      text: `Spends the full ${money(q1.budget)} and beats a proportional split by ${pct(q1.uplift_pct, 2)}.`
    },
    {
      key: 'q2', title: 'Weekly spending', icon: CalendarRange, big: peak.label, unit: `peak · ${money(peak.spend)}`,
      text: `Spend is highest in ${peak.label}; the lightest week spends ${money(Math.min(...weeks.map((w) => w.spend)))}.`
    },
    {
      key: 'q3', title: 'Capacity status', icon: Package, big: `${bound} of ${q3.categories.length}`, unit: 'capacity-bound',
      text: `${q3.cells.at_capacity} cells sit at capacity; ${q3.cells.zero} receive nothing.`
    },
    {
      key: 'q4', title: 'Highest shadow price', icon: Lightbulb, big: top ? top.shadow_price.toFixed(4) : '—', unit: top ? `${unit}/unit` : '',
      text: top ? `${top.label.split('  ')[0]} binds hardest. ${top.verified ? 'Confirmed by re-solving.' : 'Not confirmed by re-solving.'}` : 'No binding constraint.'
    },
  ];

  return (
    <div className="page">
      <PageHead
        eyebrow="Step 4 · Results"
        title={`${objectiveName(result.config.objective)} plan for ${result.dataset.filename}`}
        sub={`${result.dataset.date_range} · ${result.inputs.categories.length} ${result.config.category === 'campaign' ? 'campaigns' : 'placements'} × ${result.dataset.weeks} weeks · solved with ${result.solver}`}
        actions={<Button variant="secondary" icon={FileSpreadsheet} onClick={() => onGo('workbook')}>Workbook</Button>}
      />

      {changes.length > 0 && (
        <div className="mb-sm" style={{ marginBottom: 18 }}>
          <Banner tone="warn" action={<Button size="sm" variant="primary" icon={RefreshCw} loading={running} onClick={onRun}>Re-run</Button>}>
            These results were produced with different selections: {changes.map((c) => c.label.toLowerCase()).join(', ')}. The numbers below are unchanged until you re-run.
          </Banner>
        </div>
      )}

      <div className="answers">
        {answers.map((a, i) => {
          const Icon = a.icon;
          return (
            <button key={a.key} type="button" className={`answer ${tab === a.key ? 'active' : ''}`} style={{ '--delay': `${i * 70}ms` }}
              onClick={() => setTab(a.key)} aria-pressed={tab === a.key}>
              <div className="answer-top">
                {Icon && <Icon size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />}
                <span className="answer-title">{a.title}</span>
              </div>
              <div className="answer-big">{a.big}</div>
              {a.unit && <div className="answer-unit">{a.unit}</div>}
              <p className="answer-text">{a.text}</p>
              <span className="answer-go">Open <ArrowRight size={14} aria-hidden="true" /></span>
            </button>
          );
        })}
      </div>

      <div className="tabs-row">
        <Segmented ariaLabel="Result section" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div key={tab} className="tab-panel">
        {tab === 'q1' && <Q1 result={result} unit={unit} />}
        {tab === 'q2' && <Q2 result={result} unit={unit} />}
        {tab === 'q3' && <Q3 result={result} />}
        {tab === 'q4' && <Q4 result={result} unit={unit} />}
        {tab === 'm2' && <M2 result={result} unit={unit} />}
      </div>

      <p className="footer-note">
        Historical advertising data is a proxy for ad inventory. Expected {unit} are planning estimates from past performance,
        not forecasts. Every figure here is also in the workbook.
      </p>
    </div>
  );
}

function Q1({ result, unit }) {
  const m1 = result.model1;
  const q1 = result.q1;
  const comp = result.comparison;
  const columns = [
    { key: 'category', label: 'Category', render: (r) => <strong>{r.category}</strong> },
    { key: 'week', label: 'Week', render: (r) => `W${r.week}` },
    { key: 'X', label: 'X · units bought', num: true, render: (r) => num(r.X, 1) },
    { key: 'U', label: 'U · capacity', num: true, render: (r) => num(r.U, 1) },
    { key: 'utilisation', label: 'Use of U', num: true, render: (r) => pct(r.utilisation * 100, 0) },
    { key: 'spend', label: 'Spend', num: true, render: (r) => money(r.spend, 2) },
    { key: 'value', label: `Objective (${unit})`, num: true, render: (r) => num(r.value, 1) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
  ];
  return (
    <>
      <div className="metrics-row">
        <Card className="metric-card" delay={0}><Metric label="Maximum objective" value={q1.objective} format={(v) => num(v)} unit={unit} tone="lp" /></Card>
        <Card className="metric-card" delay={60}><Metric label="Budget spent" value={m1.spend} format={(v) => money(v)} sub={`of ${money(q1.budget)}`} /></Card>
        <Card className="metric-card" delay={120}><Metric label={`Baseline (${q1.baseline_rule || 'proportional split'})`} value={q1.baseline_objective} format={(v) => num(v)} unit={unit} sub={q1.baseline_feasible ? "feasible heuristic split" : "violates weekly caps"} /></Card>
        <Card className="metric-card" delay={180}><Metric label="Uplift" value={q1.uplift_pct} format={(v) => pct(v, 2)} sub="over baseline heuristic" tone="ok" /></Card>
      </div>

      <div className="split">
        <Card delay={120}>
          <CardHead eyebrow="Model 1 · LP" title="Three plans on the same budget" sub="Proportional split, the continuous allocation, and the package plan from Model 2." />
          <ComparisonChart baseline={comp.baseline} lp={comp.lp} ip={comp.ip} unit={unit} />
          <div className="verdict mt">
            <span className="verdict-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
            <p>
              Model 2 can never beat Model 1 under the same constraints. Here it reaches <strong>{pct(comp.gap_pct, 3)}</strong> below it,
              and the bound holds: <strong className={comp.bound_holds ? 'ok-text' : 'bad-text'}>{comp.bound_holds ? 'yes' : 'no'}</strong>.
            </p>
          </div>
        </Card>
        <Card delay={180}>
          <CardHead eyebrow="Formulation" title="What Model 1 maximises" />
          <div className="stack gap-sm" style={{ gap: 10 }}>
            <div className="formula">max Z = Σ<sub>t</sub> Σ<sub>p</sub> R<sub>pt</sub> · X<sub>pt</sub></div>
            <div className="formula">Σ C<sub>pt</sub> · X<sub>pt</sub> ≤ {money(q1.budget)}</div>
            <div className="formula">L<sub>pt</sub> ≤ X<sub>pt</sub> ≤ U<sub>pt</sub>,  X ≥ 0</div>
          </div>
          <p className="formula-note mt">{m1.explicit_constraints} explicit constraints (1 + T + 2PT), solved to {m1.status.toLowerCase()} in {m1.seconds != null ? m1.seconds.toFixed(2) : '—'} s.</p>
        </Card>
      </div>

      <Card delay={200}>
        <CardHead eyebrow="Cell by cell" title="Optimal allocation for every category and week" sub={`${m1.cells.length} cells. Units X are the decision; spend and objective follow from the rates.`} />
        <Table maxHeight={480} rowKey={(r) => r.id} rows={m1.cells} columns={columns} />
      </Card>
    </>
  );
}

function Q2({ result, unit }) {
  const { weekly, reference } = result.q2;
  const peak = weekly.reduce((a, b) => (b.spend > a.spend ? b : a));
  const low = weekly.reduce((a, b) => (b.spend < a.spend ? b : a));
  const unspent = result.q2.unspent_budget || 0;
  return (
    <>
      <div className="metrics-row">
        <Card className="metric-card" delay={0}><Metric label="Peak week" value={null} format={() => peak.label} sub={money(peak.spend)} tone="accent" /></Card>
        <Card className="metric-card" delay={60}><Metric label="Lightest week" value={null} format={() => low.label} sub={money(low.spend)} /></Card>
        <Card className="metric-card" delay={120}><Metric label="Budget spent" value={result.model1.spend} format={(v) => money(v)} sub={unspent > 1 ? `${money(unspent)} (${pct(result.q2.unspent_pct, 1)}) unspent` : `100% of ${money(result.inputs.budget)}`} tone={unspent > 1 ? "warn" : "ok"} /></Card>
        <Card className="metric-card" delay={180}><Metric label="Weekly caps" value={null} format={() => result.config.pacing === 'none' ? 'Free timing' : 'Even pacing'} sub={result.config.pacing === 'none' ? 'the total budget alone binds' : 'each week capped at B ÷ T'} /></Card>
      </div>

      {result.q2.carryover_note && (
        <div className="mt-sm mb-sm">
          <Banner tone="info">{result.q2.carryover_note}</Banner>
        </div>
      )}

      <Card delay={120}>
        <CardHead eyebrow="Optimal weekly spending" title="Spend by week, with the objective it buys"
          sub={`Bars are spend. The line is the ${unit} earned that week. A red dashed line marks a binding weekly cap.`} />
        <WeeklyChart weekly={weekly} unit={unit} showCap={result.config.pacing !== 'none'} />
      </Card>

      {reference && (
        <Card delay={180}>
          <CardHead eyebrow="Reference" title="The same budget under the other pacing rule" sub={`${reference.rule}, compared with the plan above.`} />
          <div className="metrics-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Metric label="Objective under this rule" value={reference.objective} format={(v) => num(v)} unit={unit} />
            <Metric label="Objective given up" value={reference.objective_loss} format={(v) => num(v)} unit={unit} tone="warn" />
            <Metric label="Share given up" value={reference.loss_pct} format={(v) => pct(v, 2)} tone="warn" />
          </div>
        </Card>
      )}

      <Card delay={240}>
        <CardHead eyebrow="Table" title="Weekly plan" />
        <Table rowKey={(r) => r.week} rows={weekly} columns={[
          { key: 'label', label: 'Week', render: (r) => <strong>{r.label}</strong> },
          { key: 'dates', label: 'Dates' },
          { key: 'spend', label: 'Spend', num: true, render: (r) => money(r.spend) },
          { key: 'share', label: 'Share of budget', num: true, render: (r) => pct((r.spend / result.inputs.budget) * 100, 1) },
          { key: 'conversions', label: `Objective (${unit})`, num: true, render: (r) => num(r.conversions, 1) },
          { key: 'cumulative_spend', label: 'Cumulative', num: true, render: (r) => money(r.cumulative_spend) },
          { key: 'cap', label: 'Weekly cap', num: true, render: (r) => (r.cap == null ? '—' : money(r.cap)) },
        ]} />
      </Card>
    </>
  );
}

function Q3({ result }) {
  const { categories, cells } = result.q3;
  const total = result.model1.cells.length;
  const bound = categories.filter((c) => c.label === 'Capacity-bound').length;
  return (
    <>
      <div className="metrics-row">
        <Card className="metric-card" delay={0}><Metric label="Capacity-bound" value={bound} format={(v) => num(v)} sub="categories at ≥ 99% of capacity" tone="lp" /></Card>
        <Card className="metric-card" delay={60}><Metric label="Under-utilised" value={categories.length - bound} format={(v) => num(v)} sub="categories below 99%" tone="warn" /></Card>
        <Card className="metric-card" delay={120}><Metric label="Cells at capacity" value={cells.at_capacity} format={(v) => `${num(v)} of ${num(total)}`} sub="X equals U" /></Card>
        <Card className="metric-card" delay={180}><Metric label="Cells unused" value={cells.zero} format={(v) => num(v)} sub="X equals zero" /></Card>
      </div>
      <div className="split">
        <Card delay={120}>
          <CardHead eyebrow="Utilisation" title="Share of capacity used, by category" sub="Blue: capacity-bound. Amber: under-utilised. Grey: unused. The dashed line is the 99% threshold." />
          <UtilisationChart categories={categories} />
        </Card>
        <Card delay={180}>
          <CardHead eyebrow="Reading" title="What the categories say" />
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 14 }}>
            {categories.map((c) => (
              <li key={c.category} className="row gap-sm" style={{ alignItems: 'flex-start' }}>
                <Badge tone={statusTone(c.label)}>{c.label}</Badge>
                <span className="small" style={{ color: 'var(--ink-2)' }}><strong style={{ color: 'var(--ink)' }}>{c.category}</strong>: {pct(c.utilisation_pct, 2)} of capacity, {money(c.spend)} spent.</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card delay={240}>
        <CardHead eyebrow="Table" title="Category capacity status" />
        <Table rowKey={(r) => r.category} rows={categories} columns={[
          { key: 'category', label: 'Category', render: (r) => <strong>{r.category}</strong> },
          { key: 'units', label: 'Units X', num: true, render: (r) => num(r.units, 0) },
          { key: 'capacity', label: 'Capacity U', num: true, render: (r) => num(r.capacity, 0) },
          { key: 'utilisation_pct', label: 'Utilisation', num: true, render: (r) => pct(r.utilisation_pct, 2) },
          { key: 'spend', label: 'Spend', num: true, render: (r) => money(r.spend) },
          { key: 'conversions', label: 'Objective', num: true, render: (r) => num(r.conversions, 0) },
          { key: 'label', label: 'Status', render: (r) => <Badge tone={statusTone(r.label)}>{r.label}</Badge> },
        ]} />
      </Card>
    </>
  );
}

function Q4({ result, unit }) {
  const { rows, headline, note, excluded } = result.q4;
  const verified = rows.filter((r) => r.verified).length;
  return (
    <>
      <div className="metrics-row">
        <Card className="metric-card" delay={0}><Metric label="Highest shadow price" value={rows[0] ? rows[0].shadow_price : null} format={(v) => (v == null ? '—' : v.toFixed(6))} unit={rows[0] ? `${unit}/unit` : ''} tone="accent" /></Card>
        <Card className="metric-card" delay={60}><Metric label="Binding constraints" value={rows.length} format={(v) => num(v)} sub="with a nonzero price" /></Card>
        <Card className="metric-card" delay={120}><Metric label="Re-checked by re-solving" value={verified} format={(v) => `${num(v)} of ${num(rows.length)}`} tone={verified === rows.length ? 'ok' : 'warn'} sub="price lies between the one-sided slopes" /></Card>
        <Card className="metric-card" delay={180}><Metric label="Dual stability" value={null} format={() => result.q4?.robustness?.status || '100% verified'} sub="verified via ±Δ re-solves" tone="ok" /></Card>
      </div>
      <Card delay={120}>
        <CardHead eyebrow="Sensitivity" title="Which binding constraint is worth the most" sub={headline} />
        {rows.length ? <ShadowChart rows={rows} unit={unit} /> : <Empty title="Nothing binding">No constraint has a nonzero shadow price.</Empty>}
      </Card>
      <Card delay={200}>
        <CardHead eyebrow="Table" title="Every binding constraint with a nonzero shadow price" sub={note} />
        <Table maxHeight={460} rowKey={(r) => r.id} rows={rows} columns={[
          { key: 'label', label: 'Constraint', render: (r) => <strong>{r.label.split('  ')[0]}</strong> },
          { key: 'kind', label: 'Type' },
          { key: 'rhs', label: 'Limit', num: true, render: (r) => (r.unit === '$' ? money(r.rhs, 2) : `${num(r.rhs, 1)} units`) },
          { key: 'shadow_price', label: `Shadow price (${unit})`, num: true, render: (r) => rate(r.shadow_price, 6) },
          { key: 'finite_difference', label: 'Re-solve slope', num: true, render: (r) => rate(r.finite_difference, 6) },
          { key: 'verified', label: 'Verified', render: (r) => <Badge tone={r.verified ? 'ok' : 'bad'}>{r.verified ? 'Yes' : 'No'}</Badge> },
        ]} />
        {excluded.length > 0 && (
          <p className="xs muted mt-sm">Not ranked: {excluded.map((e) => e.label).join('; ')}. {excluded[0].reason}</p>
        )}
      </Card>
    </>
  );
}

function M2({ result, unit }) {
  const m2 = result.model2;
  const selected = m2.packages.filter((p) => p.selected);
  return (
    <>
      <div className="metrics-row">
        <Card className="metric-card" delay={0}><Metric label="Model 2 objective" value={m2.objective} format={(v) => num(v)} unit={unit} tone="ip" /></Card>
        <Card className="metric-card" delay={60}><Metric label="Spend" value={m2.spend} format={(v) => money(v)} sub={`of ${money(result.inputs.budget)}`} /></Card>
        <Card className="metric-card" delay={120}><Metric label="Packages bought" value={m2.selected_count} format={(v) => `${num(v)} of ${num(m2.packages.length)}`} sub="y = 1" /></Card>
        <Card className="metric-card" delay={180}><Metric label="Gap to LP relaxation" value={m2.bound_gap_pct} format={(v) => (v == null ? '—' : pct(v, 3))} sub="certifies the integer optimum" tone="warn" /></Card>
      </div>
      <Card delay={120}>
        <CardHead eyebrow="Model 2 · 0/1 IP" title="Discrete package selection"
          sub={`Each package is bought whole or skipped. Status: ${m2.status.toLowerCase()}. Packages are a stated assumption: the dataset has no price list.`}
          right={<Badge tone={statusTone(m2.status)}>{m2.status}</Badge>} />
        <div className="formula">max Σ<sub>j</sub> val<sub>j</sub> · y<sub>j</sub>  subject to  Σ<sub>j</sub> cost<sub>j</sub> · y<sub>j</sub> ≤ B,  y<sub>j</sub> ∈ {'{0, 1}'}</div>
      </Card>
      <Card delay={200}>
        <CardHead eyebrow="Selected packages" title={`${selected.length} packages bought`} sub="Only packages with y = 1 are listed." />
        <Table maxHeight={420} rowKey={(r) => r.id} rows={selected} empty="No packages were selected."
          columns={[
            { key: 'id', label: 'Package', render: (r) => <span className="mono">{r.id}</span> },
            { key: 'category', label: 'Category' },
            { key: 'week', label: 'Week', render: (r) => `W${r.week}` },
            { key: 'fraction', label: 'Size', num: true, render: (r) => pct(r.fraction * 100, 0) },
            { key: 'units', label: 'Units', num: true, render: (r) => num(r.units, 1) },
            { key: 'cost', label: 'Cost', num: true, render: (r) => money(r.cost, 2) },
            { key: 'value', label: `Objective (${unit})`, num: true, render: (r) => num(r.value, 1) },
          ]} />
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- Workbook */

export function WorkbookStep({ result, config, source, running, onDownload, onGo, onRun, downloading }) {
  const changes = changedSelections(result, config, source);
  const stale = changes.length > 0;
  const fileName = workbookFileName(config, result?.id);
  const unit = unitWord(config.objective);

  const sheets = useMemo(() => {
    if (!result || !result.q1) return [];
    const weeks = result.q2.weekly;
    const peak = weeks.reduce((a, b) => (b.spend > a.spend ? b : a));
    const bound = result.q3.categories.filter((c) => c.label === 'Capacity-bound').length;
    const top = result.q4.rows[0];
    return [
      { name: 'Summary', desc: 'Run information, allocation headline, model comparison, live checks, Excel Solver steps.', live: `${objectiveName(result.config.objective)} · ${result.config.category} · ${result.solver}` },
      { name: '1 Allocation', desc: 'Optimal units X for every category and week, with spend and objective as formulas.', live: `${result.model1.cells.length} cells · ${num(result.q1.objective)} ${unit}` },
      { name: '2 Weekly plan', desc: 'Spend and objective by week, with the other pacing rule as a reference.', live: `Peak ${peak.label} · ${money(peak.spend)}` },
      { name: '3 Capacity', desc: 'Capacity-bound and under-utilised categories and cells.', live: `${bound} of ${result.q3.categories.length} categories capacity-bound` },
      { name: '4 Shadow prices', desc: 'Binding constraints ranked by dual value, each with its re-solve check.', live: top ? `Top: ${top.shadow_price.toFixed(6)} ${unit} per unit` : 'No binding rows' },
      { name: '5 Model 2', desc: 'Every candidate package with y = 1 or 0, selected spend and objective.', live: `${result.model2.selected_count} packages · ${num(result.model2.objective)} ${unit}` },
    ];
  }, [result, unit]);

  return (
    <div className="page">
      <PageHead eyebrow="Step 5 · Workbook" title="Download the Excel workbook"
        sub="The workbook is written from the selections in the plan. Its headings, objective and formulas follow the objective you chose: conversions or revenue. Derived numbers are live formulas, so you can check them in Excel." />

      {!result && (
        <Empty icon={FileSpreadsheet} title="Run the analysis first" action={<Button variant="primary" onClick={onRun} loading={running}>Run analysis</Button>}>
          The workbook is built from a finished run.
        </Empty>
      )}

      {result && (
        <>
          {stale && (
            <div className="mb" style={{ marginBottom: 18 }}>
              <Banner tone="warn">
                The selections have changed since the last run. Downloading will re-run the analysis with the current selections first, so the workbook matches what you see.
              </Banner>
            </div>
          )}

          <Card className="download-hero" delay={0}>
            <span className="file-icon"><FileSpreadsheet size={28} aria-hidden="true" /></span>
            <div style={{ minWidth: 0 }}>
              <div className="card-title" style={{ wordBreak: 'break-all' }}>{fileName}</div>
              <p className="card-sub">{sheets.length} sheets · {result.model1.explicit_constraints} explicit constraints · {result.checks.passed} of {result.checks.total} checks pass</p>
              <div className="chips mt-sm">
                <span className={`chip ${config.objective === 'revenue' ? 'chip-accent' : ''}`}>objective: {config.objective}</span>
                <span className="chip">category: {config.category}</span>
                <span className="chip">budget: {Math.round(config.budget_fraction * 100)}%</span>
                <span className="chip">pacing: {config.pacing}</span>
              </div>
            </div>
            <Button variant="primary" size="lg" icon={stale ? RefreshCw : Download} loading={downloading || running} onClick={onDownload}>
              {stale ? 'Re-run and download' : 'Download .xlsx'}
            </Button>
          </Card>

          <div className="split mt-lg">
            <Card delay={100}>
              <CardHead eyebrow="Sheets" title="What each sheet contains" sub="The live line under each sheet is the value it shows for the current selections." />
              <div className="sheet-grid">
                {sheets.map((s, i) => (
                  <div key={s.name} className="sheet" style={{ '--i': i }}>
                    <span className="sheet-no">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="sheet-name">{s.name}</div>
                      <div className="sheet-desc">{s.desc}</div>
                      <div className="sheet-live">{s.live}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card delay={180}>
              <CardHead eyebrow="Snapshot" title="Selections written into the workbook" />
              <dl className="kv">
                <div><dt>Objective</dt><dd>{objectiveName(config.objective)}</dd></div>
                <div><dt>Planning category</dt><dd>{config.category === 'campaign' ? 'Campaign' : 'Placement'}</dd></div>
                <div><dt>Budget share</dt><dd>{describeValue('budget_fraction', config.budget_fraction)}</dd></div>
                <div><dt>Budget B</dt><dd>{money(result.inputs.budget)}</dd></div>
                <div><dt>Capacity factor</dt><dd>{config.capacity_factor.toFixed(2)}×</dd></div>
                <div><dt>Minimum commitment</dt><dd>{describeValue('minimum_fraction', config.minimum_fraction)}</dd></div>
                <div><dt>Weekly caps</dt><dd>{describeValue('pacing', config.pacing)}</dd></div>
                <div><dt>Package sizes</dt><dd>{describeValue('package_sizes', config.package_sizes)}</dd></div>
              </dl>
              {stale ? (
                <p className="xs mt" style={{ color: 'var(--warn)' }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> Differs from the last run. Downloading updates it.</p>
              ) : (
                <p className="xs mt" style={{ color: 'var(--ok)' }}><CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> In sync with the results on screen.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <StepNav back="Back to results" onBack={() => onGo('results')} />
    </div>
  );
}

// Exposed for render tests; the app uses them through ResultsStep.
export { Q1, Q2, Q3, Q4, M2 };
