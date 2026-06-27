import { useState, useEffect, useCallback } from "react";

// ─── CENTRAL PRICING CONFIG ─────────────────────────────────────────────────
// Single source of truth. Add new provider here only.
export const PROVIDER_PRICING: Record<string, {
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  currency: string;
}> = {
  groq:      { label: "Groq (free)",     inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
  gemini:    { label: "Gemini Flash",    inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
  claude:    { label: "Claude Haiku",    inputPer1M: 0.25,  outputPer1M: 1.25,  currency: "USD" },
  openai:    { label: "GPT-4o",          inputPer1M: 2.50,  outputPer1M: 10.0,  currency: "USD" },
  deepseek:  { label: "DeepSeek Chat",   inputPer1M: 0.14,  outputPer1M: 0.28,  currency: "USD" },
  kimi:      { label: "Kimi Moonshot",   inputPer1M: 0.12,  outputPer1M: 0.12,  currency: "USD" },
  stability: { label: "Stability AI",    inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
};

export interface TokenRecord {
  id: string;
  feature: string;
  featureIcon: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ts: string;
  project?: string;
  session?: string;
}

export function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const p = PROVIDER_PRICING[provider] ?? PROVIDER_PRICING.groq;
  const cost = ((inputTokens ?? 0) / 1_000_000 * p.inputPer1M) + ((outputTokens ?? 0) / 1_000_000 * p.outputPer1M);
  return isNaN(cost) ? 0 : cost;
}

export function estimateTokens(text: string): number {
  return Math.ceil(((text ?? "").length) / 3.8);
}

const STORAGE_KEY = "oiq-token-records";
const SESSION_ID = Date.now().toString(36);

export function loadRecords(): TokenRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

export function saveRecord(rec: Omit<TokenRecord, "id" | "ts" | "session">) {
  const records = loadRecords();
  const cost = estimateCost(rec.provider, rec.inputTokens ?? 0, rec.outputTokens ?? 0);
  const full: TokenRecord = {
    ...rec,
    costUsd: isNaN(cost) ? 0 : cost,
    id: Date.now() + Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
    session: SESSION_ID,
  };
  const updated = [full, ...records].slice(0, 500);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  window.dispatchEvent(new CustomEvent("oiq-token-update", { detail: full }));
  return full;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  const v = n ?? 0;
  return v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M"
       : v >= 1_000     ? (v / 1_000).toFixed(1) + "K"
       : String(v);
}
function fmtCost(c: number): string {
  const v = c ?? 0;
  if (v === 0) return "Free";
  if (v < 0.001) return "<$0.001";
  return "$" + v.toFixed(3);
}

const PROVIDER_COLORS: Record<string, string> = {
  groq: "#F97316", gemini: "#4285F4", claude: "#D97757",
  openai: "#10A37F", deepseek: "#2563EB", kimi: "#8B5CF6", stability: "#EC4899",
};
const FEATURE_COLORS: Record<string, string> = {
  "AI Boardroom": "#14B8A6", "Time Machine": "#8B5CF6",
  "Decision Autopilot": "#F59E0B", "Flow": "#3B82F6",
  "Chat": "#10B981", "Queue": "#F97316", "Research": "#EC4899",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TokenAnalytics({ defP, keys }: { defP: string; keys: Record<string, string> }) {
  const [records, setRecords] = useState<TokenRecord[]>([]);
  const [view, setView] = useState<"session" | "today" | "all" | "project" | "provider" | "feature">("session");

  const reload = useCallback(() => setRecords(loadRecords()), []);
  useEffect(() => {
    reload();
    window.addEventListener("oiq-token-update", reload);
    return () => window.removeEventListener("oiq-token-update", reload);
  }, [reload]);

  const today = new Date().toDateString();
  const sessionRec = records.filter(r => r.session === SESSION_ID);
  const todayRec = records.filter(r => new Date(r.ts).toDateString() === today);

  const sum = (recs: TokenRecord[]) => ({
    in: recs.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
    out: recs.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
    cost: recs.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    calls: recs.length,
  });

  const sData = sum(sessionRec);
  const tData = sum(todayRec);
  const aData = sum(records);

  // Provider breakdown
  const byProv: Record<string, { in: number; out: number; cost: number; calls: number }> = {};
  records.forEach(r => {
    if (!byProv[r.provider]) byProv[r.provider] = { in: 0, out: 0, cost: 0, calls: 0 };
    byProv[r.provider].in += r.inputTokens ?? 0;
    byProv[r.provider].out += r.outputTokens ?? 0;
    byProv[r.provider].cost += r.costUsd ?? 0;
    byProv[r.provider].calls++;
  });

  // Feature breakdown
  const byFeat: Record<string, { in: number; out: number; cost: number; calls: number; icon: string }> = {};
  records.forEach(r => {
    const key = r.feature?.split(" — ")[0] || r.feature || "Other";
    if (!byFeat[key]) byFeat[key] = { in: 0, out: 0, cost: 0, calls: 0, icon: r.featureIcon || "⚡" };
    byFeat[key].in += r.inputTokens ?? 0;
    byFeat[key].out += r.outputTokens ?? 0;
    byFeat[key].cost += r.costUsd ?? 0;
    byFeat[key].calls++;
  });
  const maxFeatTok = Math.max(...Object.values(byFeat).map(v => v.in + v.out), 1);

  const exportCSV = () => {
    const csv = ["Feature,Provider,Model,Input,Output,Total,Cost USD,Time",
      ...records.map(r => `${r.feature},${r.provider},${r.model},${r.inputTokens ?? 0},${r.outputTokens ?? 0},${(r.inputTokens ?? 0) + (r.outputTokens ?? 0)},${(r.costUsd ?? 0).toFixed(6)},${r.ts}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "OrchestrIQ-tokens-" + Date.now() + ".csv";
    a.click();
  };

  const reset = () => {
    if (!confirm("Reset all token records?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
  };

  const S = {
    page: { flex: 1 as const, overflowY: "auto" as const, background: "#070C18", fontFamily: "'Inter',-apple-system,sans-serif", color: "#F0F4FF" },
    card: { background: "#0F1829", border: "1px solid #1C2A40", borderRadius: 8, padding: "14px 16px", marginBottom: 12 },
    metric: { background: "#141F33", border: "1px solid #1C2A40", borderRadius: 8, padding: "12px 10px", textAlign: "center" as const },
    label: { fontSize: 9, fontWeight: 700 as const, color: "#4D6A8A", letterSpacing: "0.1em", textTransform: "uppercase" as const, display: "block" as const, marginBottom: 4 },
    val: { fontSize: 20, fontWeight: 800 as const, color: "#F0F4FF" },
    sub: { fontSize: 10, color: "#4D6A8A", marginTop: 2 },
    hBtn: { background: "none", border: "1px solid #1C2A40", borderRadius: 5, padding: "4px 10px", color: "#8FA8CC", fontSize: 11, cursor: "pointer" as const, fontFamily: "inherit" },
    tab: (active: boolean) => ({ padding: "5px 14px", borderRadius: 6, fontSize: 10, fontWeight: 600 as const, border: "1px solid " + (active ? "#14B8A6" : "#1C2A40"), background: active ? "rgba(20,184,166,0.1)" : "transparent", color: active ? "#14B8A6" : "#4D6A8A", cursor: "pointer" as const, fontFamily: "inherit" }),
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #1C2A40", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#F0F4FF", marginBottom: 2 }}>🔢 Token Analytics</div>
            <div style={{ fontSize: 11, color: "#4D6A8A" }}>Auto-tracked · all providers · cost estimates</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={exportCSV} style={S.hBtn}>Export CSV</button>
            <button onClick={reset} style={{ ...S.hBtn, color: "#EF4444", borderColor: "rgba(239,68,68,0.3)" }}>Reset</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 24px 24px" }}>
        {records.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔢</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F0F4FF", marginBottom: 6 }}>No token records yet</div>
            <div style={{ fontSize: 12, color: "#4D6A8A", lineHeight: 1.7 }}>
              Use any AI feature — Boardroom, Time Machine, Autopilot, Chat, Workflow — and usage appears here automatically.
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                ["Current Session", fmt(sData.in + sData.out), fmtCost(sData.cost), sData.calls + " calls", "#14B8A6"],
                ["Today", fmt(tData.in + tData.out), fmtCost(tData.cost), tData.calls + " calls", "#8B5CF6"],
                ["All Time", fmt(aData.in + aData.out), fmtCost(aData.cost), aData.calls + " calls", "#F59E0B"],
              ].map(([lb, tok, cost, calls, c]) => (
                <div key={lb as string} style={S.metric}>
                  <span style={S.label}>{lb}</span>
                  <div style={{ ...S.val, color: c as string, fontSize: 17 }}>{tok}</div>
                  <div style={S.sub}>{cost} · {calls}</div>
                </div>
              ))}
            </div>

            {/* View tabs */}
            <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" as const }}>
              {(["session", "today", "all", "provider", "feature"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={S.tab(view === v)}>
                  {v === "session" ? "Session" : v === "today" ? "Today" : v === "all" ? "All Calls" : v === "provider" ? "By Provider" : "By Feature"}
                </button>
              ))}
            </div>

            {/* Provider breakdown */}
            {view === "provider" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", marginBottom: 12 }}>Provider Breakdown</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
                  <span>Provider</span><span style={{ textAlign: "right" as const }}>Input</span><span style={{ textAlign: "right" as const }}>Output</span><span style={{ textAlign: "right" as const }}>Calls</span><span style={{ textAlign: "right" as const }}>Cost</span>
                </div>
                {Object.entries(byProv).sort((a, b) => b[1].cost - a[1].cost).map(([prov, d]) => {
                  const pricing = PROVIDER_PRICING[prov];
                  return (
                    <div key={prov} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, padding: "8px 0", borderBottom: "1px solid #1C2A40", fontSize: 11, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PROVIDER_COLORS[prov] || "#6B7280", flexShrink: 0 }} />
                        <div>
                          <div style={{ color: "#F0F4FF", fontWeight: 600, textTransform: "capitalize" as const }}>{prov}</div>
                          <div style={{ fontSize: 9, color: "#4D6A8A" }}>{pricing?.label || prov}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" as const, color: "#3B82F6" }}>{fmt(d.in)}</div>
                      <div style={{ textAlign: "right" as const, color: "#14B8A6" }}>{fmt(d.out)}</div>
                      <div style={{ textAlign: "right" as const, color: "#8FA8CC" }}>{d.calls}</div>
                      <div style={{ textAlign: "right" as const, color: d.cost === 0 ? "#10B981" : "#F0F4FF", fontWeight: 600 }}>{fmtCost(d.cost)}</div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Pricing Reference</div>
                  {Object.entries(PROVIDER_PRICING).map(([prov, p]) => (
                    <div key={prov} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", color: "#4D6A8A" }}>
                      <span style={{ textTransform: "capitalize" as const, color: "#8FA8CC" }}>{prov}</span>
                      <span>{p.inputPer1M === 0 ? "Free" : "$" + p.inputPer1M + " / $" + p.outputPer1M + " per 1M tokens"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature breakdown */}
            {view === "feature" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", marginBottom: 12 }}>Usage by Feature</div>
                {Object.entries(byFeat).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).map(([feat, d]) => (
                  <div key={feat} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "#F0F4FF", fontWeight: 600 }}>{d.icon} {feat}</span>
                      <span style={{ color: "#8FA8CC" }}>{fmt(d.in + d.out)} · {fmtCost(d.cost)} · {d.calls} calls</span>
                    </div>
                    <div style={{ background: "#1C2A40", borderRadius: 9999, height: 5 }}>
                      <div style={{ width: ((d.in + d.out) / maxFeatTok * 100) + "%", height: "100%", borderRadius: 9999, background: FEATURE_COLORS[feat] || "#14B8A6", transition: "width 0.4s" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Call history — session / today / all */}
            {(view === "session" || view === "today" || view === "all") && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", marginBottom: 12 }}>
                  {view === "session" ? "Current Session" : view === "today" ? "Today" : "All Calls"}
                  {" "}
                  <span style={{ fontSize: 10, color: "#4D6A8A", fontWeight: 400 }}>
                    ({(view === "session" ? sessionRec : view === "today" ? todayRec : records).length} calls)
                  </span>
                </div>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 4, fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
                  <span>Feature</span><span>Provider</span><span style={{ textAlign: "right" as const }}>Input</span><span style={{ textAlign: "right" as const }}>Output</span><span style={{ textAlign: "right" as const }}>Total</span><span style={{ textAlign: "right" as const }}>Cost</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {(view === "session" ? sessionRec : view === "today" ? todayRec : records).slice(0, 100).map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 4, padding: "6px 0", borderBottom: "1px solid #111827", fontSize: 10, alignItems: "center" }}>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ color: FEATURE_COLORS[r.feature?.split(" — ")[0]] || "#14B8A6", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.feature?.slice(0, 22)}</div>
                        <div style={{ fontSize: 8, color: "#2D4460" }}>{new Date(r.ts).toLocaleTimeString()}</div>
                      </div>
                      <div style={{ color: "#4D6A8A", textTransform: "capitalize" as const }}>{r.provider}</div>
                      <div style={{ textAlign: "right" as const, color: "#3B82F6" }}>{fmt(r.inputTokens ?? 0)}</div>
                      <div style={{ textAlign: "right" as const, color: "#14B8A6" }}>{fmt(r.outputTokens ?? 0)}</div>
                      <div style={{ textAlign: "right" as const, color: "#8FA8CC" }}>{fmt((r.inputTokens ?? 0) + (r.outputTokens ?? 0))}</div>
                      <div style={{ textAlign: "right" as const, color: (r.costUsd ?? 0) === 0 ? "#10B981" : "#F0F4FF", fontWeight: 600 }}>{fmtCost(r.costUsd ?? 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
