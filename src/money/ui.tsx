// Lifeline — small shared UI pieces.
import { useState, type ReactNode } from "react";

export type FieldSpec =
  | { key: string; label: string; type: "text"; placeholder?: string; required?: boolean }
  | { key: string; label: string; type: "number"; min?: number; max?: number; step?: number; hint?: string; required?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "checkbox"; hint?: string };

type Values = Record<string, unknown>;

export function FormSheet({ title, fields, initial, onSave, onCancel, onDelete }: {
  title: string; fields: FieldSpec[]; initial: object;
  onSave: (v: Values) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const [v, setV] = useState<Values>(initial as Values);
  const [err, setErr] = useState("");
  const set = (k: string, val: unknown) => setV(p => ({ ...p, [k]: val }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.type === "text" && f.required && !String(v[f.key] ?? "").trim()) return setErr(`${f.label} is required`);
      if (f.type === "number") {
        const n = Number(v[f.key]);
        if (f.required && (v[f.key] === "" || v[f.key] === undefined || Number.isNaN(n))) return setErr(`${f.label} is required`);
        if (f.min !== undefined && n < f.min) return setErr(`${f.label} must be at least ${f.min}`);
        if (f.max !== undefined && n > f.max) return setErr(`${f.label} must be at most ${f.max}`);
      }
    }
    const out: Values = { ...v };
    for (const f of fields) if (f.type === "number") out[f.key] = Number(v[f.key]) || 0;
    onSave(out);
  };
  return (
    <div className="ll-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <form className="ll-sheet" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        {fields.map(f => (
          <label key={f.key} className={f.type === "checkbox" ? "ll-check" : "ll-field"}>
            {f.type === "checkbox" ? (
              <><input type="checkbox" checked={!!v[f.key]} onChange={e => set(f.key, e.target.checked)} /> <span>{f.label}{f.hint && <small> — {f.hint}</small>}</span></>
            ) : (
              <>
                <span>{f.label}</span>
                {f.type === "select" ? (
                  <select value={String(v[f.key] ?? "")} onChange={e => set(f.key, e.target.value)}>
                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : "text"} inputMode={f.type === "number" ? "decimal" : undefined}
                    value={String(v[f.key] ?? "")} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.type === "text" ? f.placeholder : undefined}
                    step={f.type === "number" ? f.step ?? "any" : undefined}
                  />
                )}
                {f.type === "number" && f.hint && <small>{f.hint}</small>}
              </>
            )}
          </label>
        ))}
        {err && <p className="ll-err" role="alert">{err}</p>}
        <div className="ll-row ll-end">
          {onDelete && <button type="button" className="ll-btn ll-danger" onClick={onDelete}>Delete</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="ll-btn ll-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ll-btn ll-primary">Save</button>
        </div>
      </form>
    </div>
  );
}

export function Card({ title, right, children, tone }: { title?: ReactNode; right?: ReactNode; children: ReactNode; tone?: "urgent" | "high" | "ok" }) {
  return (
    <section className={"ll-card" + (tone ? " ll-tone-" + tone : "")}>
      {(title || right) && <div className="ll-card-head"><h2>{title}</h2>{right}</div>}
      {children}
    </section>
  );
}

export function Bar({ label, value, max, tone, right }: { label: string; value: number; max: number; tone?: "in" | "out" | "emi" | "soft"; right: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="ll-bar">
      <div className="ll-bar-label"><span>{label}</span><b>{right}</b></div>
      <div className="ll-bar-track"><div className={"ll-bar-fill ll-" + (tone || "out")} style={{ width: pct + "%" }} /></div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="ll-empty">{children}</p>;
