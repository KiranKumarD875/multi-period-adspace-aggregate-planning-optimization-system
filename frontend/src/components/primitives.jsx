import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle, Inbox, X } from 'lucide-react';

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading = false, children, className = '', disabled, ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} ${className}`}
      {...rest}
      disabled={disabled || loading}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : Icon ? <Icon size={size === 'lg' ? 18 : 16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Card({ children, delay = 0, className = '', hoverable = false, as: Tag = 'section', ...rest }) {
  return (
    <Tag
      className={`card ${hoverable ? 'hoverable' : ''} ${className}`}
      style={{ '--delay': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHead({ eyebrow, title, sub, right }) {
  return (
    <div className="card-head">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h2 className="card-title">{title}</h2>
        {sub && <p className="card-sub">{sub}</p>}
      </div>
      {right && <div className="row gap-xs">{right}</div>}
    </div>
  );
}

// Animates a number from its previous value to the new one. Respects reduced motion.
export function useCountUp(target, duration = 900) {
  // Numbers count up from zero on first appearance, and from the previous value afterwards.
  const [shown, setShown] = useState(typeof target === 'number' ? 0 : target);
  const fromRef = useRef(typeof target === 'number' ? 0 : target);
  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      setShown(target);
      return undefined;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = fromRef.current;
    if (reduce || typeof start !== 'number' || !Number.isFinite(start) || start === target) {
      setShown(target);
      fromRef.current = target;
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (target - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

export function Metric({ label, value, format = (v) => String(v), unit, sub, tone, compact = false, delay = 0, animate = true }) {
  const animated = useCountUp(animate ? value : null);
  const shown = animate && typeof value === 'number' ? animated : value;
  return (
    <div className={`metric ${tone || ''} ${compact ? 'compact' : ''}`} style={{ animation: `rise 520ms var(--ease-out) both`, animationDelay: `${delay}ms` }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value num">
        {typeof shown === 'number' ? format(shown) : format(value)}
      </div>
      {unit && <div className="metric-unit">{unit}</div>}
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

// Segmented control whose highlight slides between options.
export function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  const refs = useRef({});
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  useEffect(() => {
    const onResize = () => {
      const el = refs.current[value];
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value]);
  return (
    <div className={`seg ${className}`} role="radiogroup" aria-label={ariaLabel}>
      <span className="seg-ind" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          ref={(el) => { refs.current[o.value] = el; }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Range({ value, min, max, step, onChange, format, ariaLabel }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': `${fill}%` }}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      aria-valuetext={format ? format(value) : String(value)}
    />
  );
}

export function Tip({ text }) {
  return (
    <span className="tip" tabIndex={0} aria-label={text}>
      <Info size={14} aria-hidden="true" />
      <span className="tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

export function Field({ label, value, help, hint, children }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {help && <Tip text={help} />}
        {value !== undefined && <span className="field-value">{value}</span>}
      </div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('proven') || s === 'optimal' || s === 'yes' || s.includes('capacity-bound') || s === 'verified') return 'ok';
  if (s.includes('not proven') || s.includes('time limit') || s.includes('under') || s.includes('partly') || s.includes('partial')) return 'warn';
  if (s.includes('infeasible') || s === 'no' || s.includes('failed') || s.includes('unused')) return 'bad';
  return 'neutral';
}

const BANNER_ICON = { info: Info, ok: CheckCircle2, warn: AlertTriangle, bad: XCircle };

export function Banner({ tone = 'info', children, action }) {
  const Icon = BANNER_ICON[tone] || Info;
  return (
    <div className={`banner banner-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className="grow">{children}</div>
      {action && <div className="banner-action">{action}</div>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={24} aria-hidden="true" /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function Table({ columns, rows, rowKey, maxHeight, empty = 'Nothing to show.' }) {
  if (!rows || rows.length === 0) return <div className="table-wrap"><div className="empty-row">{empty}</div></div>;
  return (
    <div className="table-wrap" style={{ '--maxh': maxHeight ? `${maxHeight}px` : undefined }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.num ? 'r' : ''}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i} style={{ '--i': Math.min(i, 24) }}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'r num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Transient notifications. `items` is [{id, text, icon}].
export function Toasts({ items, onDismiss }) {
  useEffect(() => {
    if (!items.length) return undefined;
    const timers = items.map((t) => setTimeout(() => onDismiss(t.id), 3600));
    return () => timers.forEach(clearTimeout);
  }, [items, onDismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.icon}
          <span className="grow">{t.text}</span>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Dismiss" onClick={() => onDismiss(t.id)} style={{ color: '#fff', padding: 4 }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
