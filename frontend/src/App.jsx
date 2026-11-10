import { useEffect, useState } from 'react';
import { CheckCircle2, WifiOff, Info } from 'lucide-react';
import { api, bundledResult } from './lib/api.js';
import { DEFAULT_CONFIG } from './lib/config.js';
import { changedSelections, workbookFileName } from './lib/state.js';
import { Stepper, STEPS, PlanRail } from './components/process.jsx';
import { Banner, Toasts } from './components/primitives.jsx';
import { DataStep, ModelStep } from './pages/DataAndModel.jsx';
import { SolveStep, ResultsStep, WorkbookStep } from './pages/SolveResultsWorkbook.jsx';
import { num } from './lib/format.js';

const SIDE_RAIL = ['model', 'results', 'workbook'];

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [step, setStep] = useState('data');
  const [dir, setDir] = useState(1);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [source, setSource] = useState({ mode: 'sample', file: null, inspection: null });
  const [dataError, setDataError] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [backend, setBackend] = useState({ checked: false, online: false, solver: '' });
  const [toasts, setToasts] = useState([]);

  const offline = backend.checked && !backend.online;
  const dataName = source.mode === 'file' ? source.file?.name : 'online_advertising_performance_data.csv';
  const facts = result || bundledResult;

  function push(text) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, text, icon: <CheckCircle2 size={18} aria-hidden="true" /> }]);
  }
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  function go(id) {
    const from = STEPS.findIndex((s) => s.id === step);
    const to = STEPS.findIndex((s) => s.id === id);
    setDir(to >= from ? 1 : -1);
    setAutoAdvance(false);
    setStep(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Runs both models on the server. `navigate` moves to the Solve step; the workbook
  // download uses it without moving the user.
  async function runAnalysis(cfg = config, src = source, { navigate = true } = {}) {
    setRunError('');
    setRunning(true);
    setAutoAdvance(false);
    if (navigate) go('run');
    try {
      const out = await api.run(cfg, src.mode === 'file' ? src.file : null);
      setResult(out);
      push(`Solved · ${num(out.model1.objective)} ${out.config.objective === 'revenue' ? 'revenue' : 'conversions'} in the plan`);
      if (navigate) setAutoAdvance(true);
      return out;
    } catch (e) {
      setRunError(e.message);
      return null;
    } finally {
      setRunning(false);
    }
  }

  // After a successful solve on the Solve step, move to Results once the stages have shown.
  useEffect(() => {
    if (step !== 'run' || running || !autoAdvance || !result || runError) return undefined;
    const t = setTimeout(() => {
      setAutoAdvance(false);
      setDir(1);
      setStep('results');
    }, 1700);
    return () => clearTimeout(t);
  }, [step, running, autoAdvance, result, runError]);

  // Backend status on load. If the solver is reachable, solve the bundled sample.
  useEffect(() => {
    let alive = true;
    api.health().then(async (h) => {
      if (!alive) return;
      const online = !!h.online && h.status === 'ok';
      setBackend({ checked: true, online, solver: h.solver || '' });
      if (online) {
        try {
          const out = await api.run(DEFAULT_CONFIG, null);
          if (alive) setResult(out);
        } catch (e) {
          if (alive) setRunError(e.message);
        }
      } else if (alive) {
        setResult(bundledResult);
      }
    });
    return () => { alive = false; };
  }, []);

  async function chooseFile(file) {
    setDataError('');
    try {
      const inspection = await api.inspect(file);
      setSource({ mode: 'file', file, inspection });
      push(`${file.name} read · ${num(inspection.rows)} rows`);
    } catch (e) {
      setDataError(e.message);
    }
  }

  function useSample() {
    setDataError('');
    setSource({ mode: 'sample', file: null, inspection: null });
  }

  // The workbook is produced from the selections on screen. If they have changed, the
  // analysis is re-run first, so the file always matches what is shown.
  async function downloadWorkbook() {
    setDownloading(true);
    try {
      const stale = !result || changedSelections(result, config, source).length > 0;
      const current = stale ? await runAnalysis(config, source, { navigate: false }) : result;
      if (!current) return;
      const file = source.mode === 'file' ? source.file : null;
      const { blob, filename } = await api.workbook(config, file, workbookFileName(config, current.id));
      saveBlob(blob, filename);
      push(`Workbook downloaded · ${filename}`);
    } catch (e) {
      setRunError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  const statusText = !backend.checked
    ? 'Connecting…'
    : offline
      ? 'Solver offline · showing the bundled result'
      : `Live · ${backend.solver}`;
  const statusClass = !backend.checked ? '' : offline ? 'demo' : 'live';

  const railProps = {
    config, source, result, dataName, offline, running,
    onRun: () => runAnalysis(config, source),
  };

  let content = null;
  if (step === 'data') {
    content = (
      <DataStep facts={facts} source={source} inspection={source.inspection} chooseFile={chooseFile}
        useSample={useSample} dataError={dataError} onNext={() => go('model')} />
    );
  } else if (step === 'model') {
    content = (
      <ModelStep facts={facts} config={config} setConfig={setConfig} onRun={() => runAnalysis(config, source)}
        running={running} offline={offline} onBack={() => go('data')} />
    );
  } else if (step === 'run') {
    content = (
      <SolveStep config={config} result={result} running={running} runError={runError}
        onRun={() => runAnalysis(config, source)} onBack={() => go('model')}
        onOpenResults={() => go('results')} justFinished={autoAdvance} />
    );
  } else if (step === 'results') {
    content = <ResultsStep result={result} config={config} source={source} onRun={() => runAnalysis(config, source)} running={running} onGo={go} />;
  } else if (step === 'workbook') {
    content = (
      <WorkbookStep result={result} config={config} source={source} running={running} downloading={downloading}
        onDownload={downloadWorkbook} onGo={go} onRun={() => runAnalysis(config, source)} />
    );
  }

  const withRail = SIDE_RAIL.includes(step);

  return (
    <div className="frame">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <div className="brand-name">Adspace Planner</div>
              <div className="brand-sub">Aggregate planning · LP and 0/1 packages</div>
            </div>
          </div>
          <Stepper current={step} onGo={go} hasResult={!!result} />
          <div className="topbar-end">
            <span className={`chip-status ${statusClass}`}><span className="dot" />{statusText}</span>
          </div>
        </div>
      </header>

      <main className="main">
        {offline && (
          <div style={{ marginBottom: 18 }}>
            <Banner tone="warn">
              <span className="row" style={{ gap: 8 }}>
                <WifiOff size={15} aria-hidden="true" />
                The solver service is not reachable. You can explore the bundled result; start the backend to run new selections.
              </span>
            </Banner>
          </div>
        )}
        {runError && step !== 'run' && (
          <div style={{ marginBottom: 18 }}>
            <Banner tone="bad">{runError}</Banner>
          </div>
        )}
        {!backend.checked && (
          <div style={{ marginBottom: 18 }}>
            <Banner tone="info">
              <span className="row" style={{ gap: 8 }}><Info size={15} aria-hidden="true" /> Connecting to the solver…</span>
            </Banner>
          </div>
        )}

        <div key={step} className={`layout ${withRail ? '' : 'single'}`} style={{ '--dir': dir }}>
          <div style={{ minWidth: 0 }}>{content}</div>
          {withRail && <PlanRail {...railProps} />}
        </div>
      </main>

      <footer className="main" style={{ paddingTop: 0, paddingBottom: 32 }}>
        <p className="footer-note" style={{ marginTop: 0 }}>
          PuLP with the CBC solver for the LP and the 0/1 model · LP duals for sensitivity · Excel for the workbook.
        </p>
      </footer>

      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}
