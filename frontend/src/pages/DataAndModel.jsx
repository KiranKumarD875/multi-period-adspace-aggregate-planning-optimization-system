import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, UploadCloud, FileText, CheckCircle2, Database, Info } from 'lucide-react';
import { Button, Card, CardHead, Field, Metric, Range, Segmented, Table, Banner, Tip } from '../components/primitives.jsx';
import { num, money, share, rate, pct } from '../lib/format.js';
import { PACKAGE_SETS } from '../lib/config.js';

const FIELD_NAMES = {
  month: 'Month', day: 'Day', placement: 'Placement', campaign: 'Campaign', category: 'Planning category',
  displays: 'Displays (capacity proxy)', cost: 'Cost ($)', conversions: 'Post-click conversions',
  revenue: 'Revenue ($)', clicks: 'Clicks',
};

export function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <header className="page-head row between wrap gap-md" style={{ alignItems: 'flex-end' }}>
      <div style={{ maxWidth: 760 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="row gap-sm wrap">{actions}</div>}
    </header>
  );
}

export function StepNav({ back, next, nextLabel = 'Continue', nextDisabled, onBack, onNext }) {
  return (
    <div className="row between mt-lg wrap gap-md">
      {back ? <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>{back}</Button> : <span />}
      {next && <Button variant="primary" size="lg" onClick={onNext} disabled={nextDisabled}>{nextLabel} <ArrowRight size={18} aria-hidden="true" /></Button>}
    </div>
  );
}

export function DataStep({ facts, source, inspection, chooseFile, useSample, dataError, onNext }) {
  const fileInput = useRef(null);
  const [over, setOver] = useState(false);
  const ds = facts?.dataset;
  const cells = facts?.inputs?.cells || [];
  const example = cells.find((c) => c.historical_displays > 0) || cells[0];
  const uploading = source.mode === 'file';

  function handleFiles(files) {
    const f = files && files[0];
    if (f) chooseFile(f);
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Step 1 · Data"
        title="Choose the observations behind the plan"
        sub="Every number in the plan comes from these records. Use the bundled campaign file, or upload a CSV with the same fields."
      />

      <div className="source-grid">
        <button type="button" className={`source ${!uploading ? 'on' : ''}`} onClick={useSample} aria-pressed={!uploading}
          style={{ '--delay': '0ms', animation: 'rise 480ms var(--ease-out) both' }}>
          <div className="row between" style={{ width: '100%' }}>
            <span className="source-icon"><Database size={20} aria-hidden="true" /></span>
            {!uploading && <span className="badge badge-accent">Selected</span>}
          </div>
          <div className="source-title">Campaign sample</div>
          <div className="source-meta">online_advertising_performance_data.csv · {ds ? `${num(ds.rows)} rows, ${ds.date_range}` : 'loading…'}</div>
        </button>

        <div className={`source ${uploading ? 'on' : ''}`} style={{ cursor: 'default', animation: 'rise 480ms var(--ease-out) both', animationDelay: '60ms' }}>
          <div className="row between" style={{ width: '100%' }}>
            <span className="source-icon"><UploadCloud size={20} aria-hidden="true" /></span>
            {uploading && <span className="badge badge-accent">Selected</span>}
          </div>
          <div className="source-title">Your own CSV</div>
          <div className="source-meta">UTF-8, comma-separated, with a header row. Up to 15 MB.</div>
          <div
            className={`dropzone ${over ? 'over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <span className="dropzone-icon"><UploadCloud size={22} aria-hidden="true" /></span>
            <div style={{ fontWeight: 600 }}>{uploading ? source.file.name : 'Drop a file here, or click to choose'}</div>
            <div className="xs muted">{uploading ? 'Click to choose another file' : 'Only .csv files'}</div>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
      </div>

      {dataError && <div className="mt"><Banner tone="bad">{dataError}</Banner></div>}

      {inspection && (
        <Card className="mt" delay={60}>
          <CardHead eyebrow="Detected" title="Columns and mapping" sub={`${num(inspection.rows)} rows read from ${source.file.name}. Required fields were found.`} />
          <div className="chips" style={{ marginBottom: 16 }}>
            {inspection.columns.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
          <Table
            rowKey={(r) => r.field}
            rows={Object.entries(inspection.mapping).filter(([k]) => k !== 'category').map(([field, col]) => ({ field, col }))}
            columns={[
              { key: 'field', label: 'Model field', render: (r) => FIELD_NAMES[r.field] || r.field },
              { key: 'col', label: 'File column', render: (r) => (r.col ? <span className="mono">{r.col}</span> : <span className="muted">not used</span>) },
            ]}
          />
        </Card>
      )}

      <div className="grid grid-4 mt-lg" style={{ gap: 14 }}>
        <Card delay={80} hoverable><Metric compact label="Rows in file" value={ds?.rows} format={(v) => num(v)} /></Card>
        <Card delay={120} hoverable><Metric compact label="Rows used" value={ds?.usable_rows} format={(v) => num(v)} tone="ok" /></Card>
        <Card delay={160} hoverable>
          <Metric compact label="Rows excluded" value={ds?.excluded?.rows} format={(v) => num(v)}
            sub={ds ? `${ds.excluded.cost_share_pct.toFixed(3)}% of cost` : ''} />
        </Card>
        <Card delay={200} hoverable><Metric compact label="Weeks" value={ds?.weeks} format={(v) => num(v)} sub={ds?.date_range} /></Card>
      </div>

      {ds?.historical_spend_validation && (
        <Card className="mt-md" delay={140}>
          <CardHead
            eyebrow="Step 4"
            title="Budget specification & historical baseline"
            sub={ds.historical_spend_validation.summary}
          />
          <div className="grid grid-3" style={{ gap: 14, marginTop: 12 }}>
            <Metric compact label="Total historical spend" value={ds.historical_spend_validation.historical_spend} format={(v) => money(v)} />
            <Metric compact label="Assumed planning budget B" value={ds.historical_spend_validation.budget} format={(v) => money(v)} tone="accent" />
            <Metric compact label="Budget vs historical expenditure" value={ds.historical_spend_validation.budget_vs_history_pct} format={(v) => pct(v, 1)} tone="ok" />
          </div>
        </Card>
      )}

      {example && (
        <Card className="mt-lg" delay={120}>
          <CardHead
            eyebrow="How the numbers are built"
            title={`One cell, from raw records to model inputs`}
            sub={`${example.category} · week ${example.week}. C and R are rates per display. U, L and B are planning inputs you set on the next step.`}
            right={<Tip text="Rates are averages over the observations in the cell. Capacity is the historical display volume scaled by the capacity factor." />}
          />
          <div className="example">
            <div className="formula">C = cost ÷ displays = {money(example.historical_cost, 2)} ÷ {num(example.historical_displays)} = {rate(example.C)} $/unit</div>
            <div className="formula">R = {facts.config.objective === 'revenue' ? 'revenue' : 'conversions'} ÷ displays = {num(facts.config.objective === 'revenue' ? example.historical_revenue : example.historical_conversions, 2)} ÷ {num(example.historical_displays)} = {rate(example.R)} per unit</div>
            <div className="formula">U = displays × capacity factor = {num(example.historical_displays)} × {facts.config.capacity_factor.toFixed(2)} = {num(example.U, 1)} units</div>
            <div className="formula">L = U × minimum commitment = {num(example.U, 1)} × {pct(facts.config.minimum_fraction * 100, 0)} = {num(example.L, 1)} units</div>
          </div>
          <p className="formula-note">The solver then chooses X, the units to buy in this cell, between L and U, so the total objective is largest within the budget.</p>
        </Card>
      )}

      <StepNav next nextLabel="Continue to the model" onNext={onNext} />
    </div>
  );
}

const OBJECTIVE_NOTE = {
  conversions: 'Maximises expected post-click conversions. The workbook and charts report conversions.',
  revenue: 'Maximises expected revenue. Rates use the revenue column, so every objective, shadow price and workbook heading switches to revenue.',
};

export function ModelStep({ facts, config, setConfig, onRun, running, offline, onBack }) {
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));
  const base = facts ? facts.inputs.full_capacity_cost / facts.config.capacity_factor : 0;
  const full = base * config.capacity_factor;
  const budget = config.budget_fraction * full;
  const packageSet = Object.entries(PACKAGE_SETS).find(([, v]) => JSON.stringify(v.sizes) === JSON.stringify(config.package_sizes))?.[0] || 'quarters';
  const obj = config.objective === 'revenue' ? 'revenue' : 'conversions';

  return (
    <div className="page">
      <PageHead
        eyebrow="Step 2 · Model"
        title="Set the selections"
        sub="These are the choices the models are built on. The plan on the right updates as you change them. Run the analysis when you are ready, and the workbook follows the same selections."
      />

      <div className="option-grid">
        <Card delay={0} className="stack" style={{ gap: 14 }}>
          <Field label="Objective" help="What the models maximise.">
            <Segmented ariaLabel="Objective" value={config.objective} onChange={(v) => set({ objective: v })}
              options={[{ value: 'conversions', label: 'Conversions' }, { value: 'revenue', label: 'Revenue' }]} />
          </Field>
          <div className="option-note"><strong>{obj === 'revenue' ? 'Revenue.' : 'Conversions.'}</strong> {OBJECTIVE_NOTE[obj]}</div>
        </Card>

        <Card delay={40} className="stack" style={{ gap: 14 }}>
          <Field label="Planning category" help="The rows of the allocation. Placements are ad slots; campaigns are the advertiser's campaigns.">
            <Segmented ariaLabel="Planning category" value={config.category} onChange={(v) => set({ category: v })}
              options={[{ value: 'placement', label: 'Placement' }, { value: 'campaign', label: 'Campaign' }]} />
          </Field>
          <div className="option-note">
            <strong>{config.category === 'campaign' ? '3 campaigns' : '5 placements'}</strong> × {facts?.dataset?.weeks ?? 13} weeks =
            {' '}{config.category === 'campaign' ? 39 : 65} planning cells.
          </div>
        </Card>

        <Card delay={80} className="stack" style={{ gap: 14 }}>
          <Field label="Budget B" value={money(budget)} help="B is a share of what the historical activity cost. Below 100% forces trade-offs between cells.">
            <Range ariaLabel="Budget share" value={config.budget_fraction} min={0.5} max={1.2} step={0.01}
              format={(v) => share(v, 0)} onChange={(v) => set({ budget_fraction: v, total_budget: null })} />
          </Field>
          <div>
            <div className="budget-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, config.budget_fraction / 1.2 * 100)}%` }} /></div>
            <div className="xs muted mt-sm">{share(config.budget_fraction, 0)} of {money(full)} historical capacity cost</div>
          </div>
        </Card>

        <Card delay={120} className="stack" style={{ gap: 14 }}>
          <Field label="Capacity factor" value={`${config.capacity_factor.toFixed(2)}×`} help="Capacity U = factor × historical displays. Above 1 allows more volume than was observed.">
            <Range ariaLabel="Capacity factor" value={config.capacity_factor} min={0.5} max={2} step={0.05}
              format={(v) => v.toFixed(2) + '×'} onChange={(v) => set({ capacity_factor: v })} />
          </Field>
          <Field label="Minimum commitment" value={`${Math.round(config.minimum_fraction * 100)}%`} help="The plan must buy at least this share of capacity in every cell. A high value can make the plan infeasible.">
            <Range ariaLabel="Minimum commitment" value={config.minimum_fraction} min={0} max={0.5} step={0.01}
              format={(v) => share(v, 0) + ' of U'} onChange={(v) => set({ minimum_fraction: v })} />
          </Field>
        </Card>

        <Card delay={160} className="stack" style={{ gap: 14 }}>
          <Field label="Weekly caps B_t" help="Model 1 always carries the weekly caps. No binding cap lets the optimiser choose the timing. Even pacing caps every week at B ÷ T.">
            <Segmented ariaLabel="Weekly caps" value={config.pacing === 'custom' ? 'none' : config.pacing}
              onChange={(v) => set({ pacing: v })}
              options={[{ value: 'none', label: 'Free timing' }, { value: 'even', label: 'Even pacing' }]} />
          </Field>
          <div className="option-note">
            {config.pacing === 'even'
              ? <><strong>Even pacing.</strong> Every week may spend at most B ÷ T = {money(budget / (facts?.dataset?.weeks ?? 13))}.</>
              : <><strong>Free timing.</strong> The caps are present but never bind, so the optimiser chooses when to spend.</>}
          </div>
        </Card>

        <Card delay={200} className="stack" style={{ gap: 14 }}>
          <Field label="Model 2 package sizes" help="Model 2 buys whole packages. Each package is a fixed share of a cell's capacity. The dataset has no price list, so package sizes are an assumption.">
            <Segmented ariaLabel="Package sizes" value={packageSet}
              onChange={(v) => set({ package_sizes: PACKAGE_SETS[v].sizes })}
              options={Object.entries(PACKAGE_SETS).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Field>
          <div className="option-note"><strong>{config.package_sizes.length} sizes</strong> · {config.package_sizes.map((s) => Math.round(s * 100) + '%').join(', ')} of each cell's capacity.</div>
        </Card>
      </div>

      <div className="mt"><Banner tone="info" action={<Button variant="secondary" size="sm" onClick={() => setConfig((c) => ({ ...c, budget_fraction: 0.85, capacity_factor: 1, minimum_fraction: 0, pacing: 'none', objective: 'conversions', category: 'placement', package_sizes: [0.25, 0.5, 1] }))}>Reset to defaults</Button>}>
          Selections take effect on the next run. The results on screen keep the selections they were produced with, and the plan panel shows any difference.
        </Banner></div>

      <div className="row between mt-lg wrap gap-md">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Back to data</Button>
        <Button variant="primary" size="lg" icon={ArrowRight} onClick={onRun} loading={running} disabled={offline}>
          Run both models
        </Button>
      </div>
      {offline && <p className="xs muted" style={{ textAlign: 'right', marginTop: 8 }}>The solver service is not reachable.</p>}
    </div>
  );
}
