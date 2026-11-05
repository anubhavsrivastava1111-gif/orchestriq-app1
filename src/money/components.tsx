// Lifeline — design-system components.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import { inr } from "./engine";

// ─── Layout ─────────────────────────────────────────────────────────────────
export function Screen({ title, subtitle, action, children }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <div className="screen-titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, action, children, hint }: { title?: string; action?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || action) && (
        <div className="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = "", onClick, tone }: { children: ReactNode; className?: string; onClick?: () => void; tone?: "danger" | "warn" | "good" | "brand" }) {
  const cls = `card ${tone ? "tone-" + tone : ""} ${onClick ? "tappable" : ""} ${className}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick}>{children}</button>
    : <div className={cls}>{children}</div>;
}

/** List row: icon · title/subtitle · value · chevron. */
export function Row({ icon, iconTone, title, subtitle, value, valueTone, onClick, trailing }: {
  icon?: string; iconTone?: string; title: ReactNode; subtitle?: ReactNode; value?: ReactNode; valueTone?: "pos" | "neg" | "muted";
  onClick?: () => void; trailing?: ReactNode;
}) {
  const inner = (
    <>
      {icon && <span className={"row-icon " + (iconTone || "")}><Icon name={icon} /></span>}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {value !== undefined && <span className={"row-value " + (valueTone || "")}>{value}</span>}
      {trailing}
      {onClick && !trailing && <Icon name="chevron" size={18} className="row-chev" />}
    </>
  );
  return onClick
    ? <button type="button" className="row" onClick={onClick}>{inner}</button>
    : <div className="row">{inner}</div>;
}

export const List = ({ children }: { children: ReactNode }) => <div className="list">{children}</div>;

export function Empty({ icon = "info", title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "danger" | "brand"; children: ReactNode }) {
  return <span className={"pill pill-" + tone}>{children}</span>;
}

export function Button({ variant = "secondary", icon, children, size, full, ...rest }:
  { variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: string; size?: "sm"; full?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${full ? "btn-full" : ""} ${rest.className || ""}`}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}{children}
    </button>
  );
}

export function LinkButton({ href, icon = "external", children, variant = "secondary" }: { href: string; icon?: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const external = /^https?:/.test(href);
  return (
    <a className={`btn btn-${variant} btn-sm`} href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
      {children}<Icon name={icon} size={15} />
    </a>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary>{summary}<Icon name="chevron" size={16} /></summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

// ─── Bottom sheet ───────────────────────────────────────────────────────────
/** Full-height on phones. Header and footer are fixed; only the body scrolls, so Save is never hidden. */
export function Sheet({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add("sheet-open");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { document.body.classList.remove("sheet-open"); window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ─── Form controls ──────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, optional }: { label: string; hint?: ReactNode; error?: string; optional?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>{label}{optional && <span className="optional"> · optional</span>}</label>
      {children(id)}
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, autoFocus, maxLength }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; maxLength?: number }) {
  return <input id={id} className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    maxLength={maxLength ?? 60} enterKeyHint="next" autoComplete="off" {...(autoFocus ? { "data-autofocus": true } : {})} />;
}

/** Large ₹ amount input with Indian digit grouping shown live underneath. */
export function MoneyInput({ id, value, onChange, autoFocus, large, placeholder = "0" }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; large?: boolean; placeholder?: string }) {
  const n = Number(value);
  return (
    <div className={"money-input" + (large ? " large" : "")}>
      <span className="money-prefix">₹</span>
      <input id={id} inputMode="decimal" value={value} placeholder={placeholder} enterKeyHint="done" autoComplete="off"
        onChange={e => onChange(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
        {...(autoFocus ? { "data-autofocus": true } : {})} />
      {value !== "" && n >= 1000 && <span className="money-words">{inrWords(n)}</span>}
    </div>
  );
}

function inrWords(n: number): string {
  if (n >= 1e7) return (n / 1e7).toFixed(n % 1e7 ? 2 : 0) + " crore";
  if (n >= 1e5) return (n / 1e5).toFixed(n % 1e5 ? 2 : 0) + " lakh";
  return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + " thousand";
}

export function NumberInput({ id, value, onChange, suffix, placeholder }: { id: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string }) {
  return (
    <div className="money-input">
      <input id={id} inputMode="decimal" value={value} placeholder={placeholder} autoComplete="off"
        onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
      {suffix && <span className="money-suffix">{suffix}</span>}
    </div>
  );
}

/** 1–31 grid — one tap instead of typing a date. */
export function DayPicker({ value, onChange, allowNone }: { value: number | null; onChange: (d: number | null) => void; allowNone?: boolean }) {
  return (
    <div className="daypicker" role="radiogroup">
      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
        <button key={d} type="button" role="radio" aria-checked={value === d} className={value === d ? "on" : ""} onClick={() => onChange(d)}>{d}</button>
      ))}
      {allowNone && <button type="button" className={"none " + (value === null ? "on" : "")} onClick={() => onChange(null)}>Varies</button>}
    </div>
  );
}

export function ChoiceChips<T extends string>({ value, options, onChange, multi }: { value: T | T[]; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void; multi?: boolean }) {
  const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="chips" role={multi ? "group" : "radiogroup"}>
      {options.map(o => (
        <button key={o.value} type="button" role={multi ? "checkbox" : "radio"} aria-checked={isOn(o.value)} className={"chip" + (isOn(o.value) ? " on" : "")} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function ChoiceCards({ value, options, onChange }: { value: string; options: { value: string; title: string; subtitle?: string; icon?: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="choice-cards" role="radiogroup">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={"choice-card" + (value === o.value ? " on" : "")} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} />}
          <span><b>{o.title}</b>{o.subtitle && <small>{o.subtitle}</small>}</span>
          <span className="radio-dot" aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle-row" onClick={() => onChange(!checked)}>
      <span className="row-main"><span className="row-title">{label}</span>{description && <span className="row-sub">{description}</span>}</span>
      <span className={"toggle" + (checked ? " on" : "")} aria-hidden><span /></span>
    </button>
  );
}

export function Slider({ id, value, min, max, step = 1, onChange }: { id?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return <input id={id} type="range" className="slider" min={min} max={max} step={step} value={value} style={{ ["--pct" as string]: pct + "%" }} onChange={e => onChange(Number(e.target.value))} />;
}

// ─── Data viz ───────────────────────────────────────────────────────────────
export function Ring({ value, label, tone }: { value: number; label: string; tone: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className={"ring tone-" + tone} role="img" aria-label={`Score ${value} of 100, ${label}`}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={r} className="ring-track" />
        <circle cx="32" cy="32" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 32 32)" />
      </svg>
      <b>{value}</b>
    </div>
  );
}

/** Area chart of projected spare balance, with the below-zero zone highlighted. */
export function ForecastChart({ points }: { points: { date: Date; total: number }[] }) {
  if (points.length < 2) return null;
  const W = 320, H = 110, pad = 6;
  const vals = points.map(p => p.total);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + ((max - v) / span) * (H - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1)},${y(min)}L${x(0)},${y(min)}Z`;
  const lowest = points.reduce((a, b) => (b.total < a.total ? b : a));
  const li = points.indexOf(lowest);
  return (
    <figure className="forecast">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Lowest projected balance ${inr(lowest.total)} on ${lowest.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}>
        {min < 0 && <rect x={0} y={y(0)} width={W} height={H - y(0)} className="fc-danger" />}
        <path d={area} className="fc-area" />
        <path d={line} className="fc-line" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="fc-zero" vectorEffect="non-scaling-stroke" />
        <circle cx={x(li)} cy={y(lowest.total)} r={3.5} className={lowest.total < 0 ? "fc-dot bad" : "fc-dot"} />
      </svg>
      <figcaption>
        <span>Today</span>
        <span className={lowest.total < 0 ? "neg" : ""}>Lowest {inr(lowest.total)} · {lowest.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        <span>+30 days</span>
      </figcaption>
    </figure>
  );
}

export function StackBar({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div className="stackbar-wrap">
      <div className="stackbar">{parts.filter(p => p.value > 0).map(p => <span key={p.label} className={p.cls} style={{ width: (p.value / total) * 100 + "%" }} />)}</div>
      <div className="legend">
        {parts.map(p => (
          <div key={p.label} className="legend-item"><span className={"dot " + p.cls} /><span>{p.label}</span><b>{inr(p.value)}</b><small>{Math.round((Math.max(0, p.value) / total) * 100)}%</small></div>
        ))}
      </div>
    </div>
  );
}

export function MeterBar({ value, max, cls = "fill-brand" }: { value: number; max: number; cls?: string }) {
  return <div className="meter"><span className={cls} style={{ width: Math.max(2, Math.min(100, (value / (max || 1)) * 100)) + "%" }} /></div>;
}
