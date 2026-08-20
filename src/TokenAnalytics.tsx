import { useState, useEffect, useCallback } from "react";

// ─── CENTRAL PRICING CONFIG ─────────────────────────────────────────────────
// Single source of truth. Add new provider here only.
export const PROVIDER_PRICING: Record<string, {
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  currency: string;
  kind?: "llm" | "search";
  perQueryUsd?: number;   // search services bill per query, not per token
  note?: string;
}> = {
  // ── LLM providers (billed per million tokens) ──────────────────────────────
  nvidia:    { label: "NVIDIA (free tier)", inputPer1M: 0,    outputPer1M: 0,    currency: "USD", kind: "llm", note: "Free NIM tier" },
  groq:      { label: "Groq",               inputPer1M: 0.59, outputPer1M: 0.79, currency: "USD", kind: "llm" },
  gemini:    { label: "Gemini Flash",       inputPer1M: 0.38, outputPer1M: 1.88, currency: "USD", kind: "llm" },
  claude:    { label: "Claude (Haiku)",     inputPer1M: 1.00, outputPer1M: 5.00, currency: "USD", kind: "llm" },
  claude_sonnet: { label: "Claude Sonnet",  inputPer1M: 2.00, outputPer1M: 10.0, currency: "USD", kind: "llm" },
  claude_opus:   { label: "Claude Opus",    inputPer1M: 5.00, outputPer1M: 25.0, currency: "USD", kind: "llm" },
  openai:    { label: "OpenAI GPT-4o",      inputPer1M: 2.50, outputPer1M: 10.0, currency: "USD", kind: "llm" },
  deepseek:  { label: "DeepSeek Flash",     inputPer1M: 0.22, outputPer1M: 0.66, currency: "USD", kind: "llm", note: "Half price off-peak" },
  deepseek_pro: { label: "DeepSeek Pro",    inputPer1M: 0.55, outputPer1M: 2.19, currency: "USD", kind: "llm" },
  kimi:      { label: "Kimi (Moonshot)",    inputPer1M: 0.95, outputPer1M: 4.00, currency: "USD", kind: "llm" },
  stability: { label: "Stability AI",       inputPer1M: 0,    outputPer1M: 0,    currency: "USD", kind: "llm", note: "Per image, not per token" },
  fal:       { label: "fal.ai",             inputPer1M: 0,    outputPer1M: 0,    currency: "USD", kind: "llm", note: "Per image/video, not per token" },

  // ── Web search services (billed per query) ────────────────────────────────
  serper:      { label: "Serper (search)",     inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.001,  note: "~$1 per 1,000 searches" },
  dataforseo:  { label: "DataForSEO (search)", inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.0006, note: "~$0.60 per 1,000" },
  brave:       { label: "Brave (search)",      inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.005,  note: "~$5 per 1,000" },
  tavily:      { label: "Tavily (search)",     inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.008,  note: "~$8 per 1,000, 1k/mo free" },
  claude_search: { label: "Claude web search", inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.010,  note: "$10 per 1,000, PLUS tokens" },
  gemini_search: { label: "Gemini grounding",  inputPer1M: 0, outputPer1M: 0, currency: "USD", kind: "search", perQueryUsd: 0.014,  note: "$14 per 1,000 after free tier" },
};

// Maps the model string actually used back to its correct pricing tier, so a
// Sonnet call is not billed at Haiku rates. Falls back to the base provider.
export function resolvePricingKey(provider: string, model?: string): string {
  const m = (model || "").toLowerCase();
  if (provider === "claude") {
    if (m.includes("opus")) return "claude_opus";
    if (m.includes("sonnet")) return "claude_sonnet";
    return "claude";
  }
  if (provider === "deepseek") {
    if (m.includes("pro")) return "deepseek_pro";
    return "deepseek";
  }
  return provider;
}

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
  // Added so per-query services (Serper, Tavily, Brave, native web search) can be
  // recorded alongside token-billed LLM calls in the same ledger.
  units?: number;          // number of queries/images when not token-billed
  unitLabel?: string;      // "queries", "images", "videos"
  kind?: "llm" | "search"; // how this line was billed
  // Populated so a super-admin can see spend per user, not just per browser.
  userEmail?: string;
  userRole?: string;
  estimated?: boolean;     // true when token counts were guessed, not returned by the API
}

export function estimateCost(provider: string, inputTokens: number, outputTokens: number, model?: string, units?: number): number {
  const key = resolvePricingKey(provider, model);
  // Unknown provider now costs 0 and is visible as "unpriced" rather than being
  // silently billed at Groq rates, which quietly understated real spend.
  const p = PROVIDER_PRICING[key] ?? PROVIDER_PRICING[provider];
  if (!p) return 0;
  if (p.kind === "search") {
    return (units ?? 1) * (p.perQueryUsd ?? 0);
  }
  const cost = ((inputTokens ?? 0) / 1_000_000 * p.inputPer1M) + ((outputTokens ?? 0) / 1_000_000 * p.outputPer1M);
  return isNaN(cost) ? 0 : cost;
}

// Convenience wrapper for per-query services (search, images, video).
export function saveUnitRecord(rec: {
  feature: string; featureIcon?: string; provider: string; model?: string;
  units: number; unitLabel?: string; userEmail?: string; userRole?: string;
}) {
  return saveRecord({
    feature: rec.feature,
    featureIcon: rec.featureIcon || "🔍",
    provider: rec.provider,
    model: rec.model || rec.provider,
    inputTokens: 0,
    outputTokens: 0,
    units: rec.units,
    unitLabel: rec.unitLabel || "queries",
    kind: "search",
    userEmail: rec.userEmail,
    userRole: rec.userRole,
  } as any);
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
  const cost = estimateCost(rec.provider, rec.inputTokens ?? 0, rec.outputTokens ?? 0, (rec as any).model, (rec as any).units);
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
  groq: "#F97316", gemini: "#4285F4", claude: "#D97757", claude_sonnet: "#D97757", claude_opus: "#B45309",
  openai: "#10A37F", deepseek: "#2563EB", deepseek_pro: "#1D4ED8", kimi: "#8B5CF6",
  stability: "#EC4899", fal: "#7C3AED", nvidia: "#76B900",
  serper: "#0EA5E9", tavily: "#14B8A6", brave: "#FB542B", dataforseo: "#6366F1",
  claude_search: "#D97757", gemini_search: "#4285F4",
};
const FEATURE_COLORS: Record<string, string> = {
  "AI Boardroom": "var(--oiq-accent)", "Time Machine": "#8B5CF6",
  "Decision Autopilot": "#F59E0B", "Flow": "#3B82F6",
  "Chat": "#10B981", "Queue": "#F97316", "Research": "#EC4899",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TokenAnalytics({ defP, keys, me }: { defP: string; keys: Record<string, string>; me?: { email: string; role: string } }) {
  const [records, setRecords] = useState<TokenRecord[]>([]);
  const [view, setView] = useState<"session" | "today" | "all" | "project" | "provider" | "feature" | "user">("session");

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

  // Per-user breakdown. Records carry userEmail from Session 13 onward; anything
  // recorded before that is grouped as "Unattributed" rather than silently dropped.
  const byUser: Record<string, { in: number; out: number; cost: number; calls: number; role: string }> = {};
  records.forEach(r => {
    const key = (r.userEmail || "").trim() || "Unattributed (pre-tracking)";
    if (!byUser[key]) byUser[key] = { in: 0, out: 0, cost: 0, calls: 0, role: r.userRole || "" };
    byUser[key].in += r.inputTokens ?? 0;
    byUser[key].out += r.outputTokens ?? 0;
    byUser[key].cost += r.costUsd ?? 0;
    byUser[key].calls++;
  });

  // Search spend is billed per query, not per token, so it is summarised separately.
  const searchRec = records.filter(r => r.kind === "search");
  const searchSpend = searchRec.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const searchQueries = searchRec.reduce((s, r) => s + (r.units ?? 0), 0);
  const estimatedShare = records.length
    ? Math.round(records.filter(r => r.estimated).length / records.length * 100)
    : 0;

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
    const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["User,Role,Feature,Provider,Model,Billing,Input,Output,Queries,Cost USD,Estimated,Time",
      ...records.map(r => [q(r.userEmail || "Unattributed"), q(r.userRole || ""), q(r.feature), q(r.provider), q(r.model),
        q(r.kind || "llm"), r.inputTokens ?? 0, r.outputTokens ?? 0, r.units ?? 0,
        (r.costUsd ?? 0).toFixed(6), r.estimated ? "yes" : "no", q(r.ts)].join(","))
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
    page: { flex: 1 as const, overflowY: "auto" as const, background: "var(--oiq-bg)", fontFamily: "'Inter',-apple-system,sans-serif", color: "var(--oiq-ink)" },
    card: { background: "var(--oiq-surface)", border: "1px solid var(--oiq-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 12 },
    metric: { background: "var(--oiq-surface2)", border: "1px solid var(--oiq-border)", borderRadius: 8, padding: "12px 10px", textAlign: "center" as const },
    label: { fontSize: 9, fontWeight: 700 as const, color: "var(--oiq-muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, display: "block" as const, marginBottom: 4 },
    val: { fontSize: 20, fontWeight: 800 as const, color: "var(--oiq-ink)" },
    sub: { fontSize: 10, color: "var(--oiq-muted)", marginTop: 2 },
    hBtn: { background: "none", border: "1px solid var(--oiq-border)", borderRadius: 5, padding: "4px 10px", color: "var(--oiq-body)", fontSize: 11, cursor: "pointer" as const, fontFamily: "inherit" },
    tab: (active: boolean) => ({ padding: "5px 14px", borderRadius: 6, fontSize: 10, fontWeight: 600 as const, border: "1px solid " + (active ? "var(--oiq-accent)" : "var(--oiq-border)"), background: active ? "rgba(20,184,166,0.1)" : "transparent", color: active ? "var(--oiq-accent)" : "var(--oiq-muted)", cursor: "pointer" as const, fontFamily: "inherit" }),
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--oiq-border)", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--oiq-ink)", marginBottom: 2 }}>🔢 Token Analytics</div>
            <div style={{ fontSize: 11, color: "var(--oiq-muted)" }}>Auto-tracked · all providers · cost estimates</div>
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
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--oiq-ink)", marginBottom: 6 }}>No token records yet</div>
            <div style={{ fontSize: 12, color: "var(--oiq-muted)", lineHeight: 1.7 }}>
              Use any AI feature — Boardroom, Time Machine, Autopilot, Chat, Workflow — and usage appears here automatically.
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                ["Current Session", fmt(sData.in + sData.out), fmtCost(sData.cost), sData.calls + " calls", "var(--oiq-accent)"],
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
              {(["session", "today", "all", "provider", "feature", "user"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={S.tab(view === v)}>
                  {v === "session" ? "Session" : v === "today" ? "Today" : v === "all" ? "All Calls" : v === "provider" ? "By API Key" : v === "feature" ? "By Module" : "By User"}
                </button>
              ))}
            </div>

            {/* Search spend + data-quality strip */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" as const }}>
              <div style={{ ...S.metric, flex: 1, minWidth: 150 }}>
                <span style={S.label}>Web Search Spend</span>
                <div style={S.val}>{fmtCost(searchSpend)}</div>
                <div style={S.sub}>{searchQueries} queries billed</div>
              </div>
              <div style={{ ...S.metric, flex: 1, minWidth: 150 }}>
                <span style={S.label}>Token Accuracy</span>
                <div style={S.val}>{100 - estimatedShare}%</div>
                <div style={S.sub}>{estimatedShare}% estimated, rest reported by provider</div>
              </div>
            </div>

            {/* Per-user breakdown */}
            {view === "user" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--oiq-ink)", marginBottom: 4 }}>Spend by User</div>
                <div style={{ fontSize: 10, color: "var(--oiq-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                  This shows activity recorded in <strong>this browser</strong> only. Cross-device, all-account reporting needs the Supabase sync.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, fontSize: 9, fontWeight: 700, color: "var(--oiq-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
                  <span>User</span><span style={{ textAlign: "right" as const }}>Input</span><span style={{ textAlign: "right" as const }}>Output</span><span style={{ textAlign: "right" as const }}>Calls</span><span style={{ textAlign: "right" as const }}>Cost</span>
                </div>
                {Object.entries(byUser).sort((a, b) => b[1].cost - a[1].cost).map(([user, d]) => (
                  <div key={user} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--oiq-border)", fontSize: 11, alignItems: "center" }}>
                    <div>
                      <div style={{ color: "var(--oiq-ink)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{user === (me?.email || "") && user ? user + " (you)" : user}</div>
                      <div style={{ fontSize: 9, color: "var(--oiq-muted)" }}>{d.role || "—"}</div>
                    </div>
                    <div style={{ textAlign: "right" as const, color: "#3B82F6" }}>{fmt(d.in)}</div>
                    <div style={{ textAlign: "right" as const, color: "var(--oiq-accent)" }}>{fmt(d.out)}</div>
                    <div style={{ textAlign: "right" as const, color: "var(--oiq-muted)" }}>{d.calls}</div>
                    <div style={{ textAlign: "right" as const, color: "var(--oiq-ink)", fontWeight: 700 }}>{fmtCost(d.cost)}</div>
                  </div>
                ))}
                {!Object.keys(byUser).length && <div style={{ fontSize: 11, color: "var(--oiq-muted)", padding: "10px 0" }}>No usage recorded yet.</div>}
              </div>
            )}

            {/* Provider breakdown */}
            {view === "provider" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--oiq-ink)", marginBottom: 12 }}>Provider Breakdown</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, fontSize: 9, fontWeight: 700, color: "var(--oiq-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
                  <span>Provider</span><span style={{ textAlign: "right" as const }}>Input</span><span style={{ textAlign: "right" as const }}>Output</span><span style={{ textAlign: "right" as const }}>Calls</span><span style={{ textAlign: "right" as const }}>Cost</span>
                </div>
                {Object.entries(byProv).sort((a, b) => b[1].cost - a[1].cost).map(([prov, d]) => {
                  const pricing = PROVIDER_PRICING[prov];
                  return (
                    <div key={prov} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--oiq-border)", fontSize: 11, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PROVIDER_COLORS[prov] || "var(--oiq-muted)", flexShrink: 0 }} />
                        <div>
                          <div style={{ color: "var(--oiq-ink)", fontWeight: 600, textTransform: "capitalize" as const }}>{prov}</div>
                          <div style={{ fontSize: 9, color: "var(--oiq-muted)" }}>{pricing?.label || prov}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" as const, color: "#3B82F6" }}>{fmt(d.in)}</div>
                      <div style={{ textAlign: "right" as const, color: "var(--oiq-accent)" }}>{fmt(d.out)}</div>
                      <div style={{ textAlign: "right" as const, color: "var(--oiq-body)" }}>{d.calls}</div>
                      <div style={{ textAlign: "right" as const, color: d.cost === 0 ? "#10B981" : "var(--oiq-ink)", fontWeight: 600 }}>{fmtCost(d.cost)}</div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--oiq-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Pricing Reference</div>
                  {Object.entries(PROVIDER_PRICING).map(([prov, p]) => (
                    <div key={prov} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", color: "var(--oiq-muted)" }}>
                      <span style={{ textTransform: "capitalize" as const, color: "var(--oiq-body)" }}>{prov}</span>
                      <span>{p.inputPer1M === 0 ? "Free" : "$" + p.inputPer1M + " / $" + p.outputPer1M + " per 1M tokens"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature breakdown */}
            {view === "feature" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--oiq-ink)", marginBottom: 12 }}>Usage by Feature</div>
                {Object.entries(byFeat).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).map(([feat, d]) => (
                  <div key={feat} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "var(--oiq-ink)", fontWeight: 600 }}>{d.icon} {feat}</span>
                      <span style={{ color: "var(--oiq-body)" }}>{fmt(d.in + d.out)} · {fmtCost(d.cost)} · {d.calls} calls</span>
                    </div>
                    <div style={{ background: "var(--oiq-border)", borderRadius: 9999, height: 5 }}>
                      <div style={{ width: ((d.in + d.out) / maxFeatTok * 100) + "%", height: "100%", borderRadius: 9999, background: FEATURE_COLORS[feat] || "var(--oiq-accent)", transition: "width 0.4s" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Call history — session / today / all */}
            {(view === "session" || view === "today" || view === "all") && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--oiq-ink)", marginBottom: 12 }}>
                  {view === "session" ? "Current Session" : view === "today" ? "Today" : "All Calls"}
                  {" "}
                  <span style={{ fontSize: 10, color: "var(--oiq-muted)", fontWeight: 400 }}>
                    ({(view === "session" ? sessionRec : view === "today" ? todayRec : records).length} calls)
                  </span>
                </div>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 4, fontSize: 9, fontWeight: 700, color: "var(--oiq-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
                  <span>Feature</span><span>Provider</span><span style={{ textAlign: "right" as const }}>Input</span><span style={{ textAlign: "right" as const }}>Output</span><span style={{ textAlign: "right" as const }}>Total</span><span style={{ textAlign: "right" as const }}>Cost</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {(view === "session" ? sessionRec : view === "today" ? todayRec : records).slice(0, 100).map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--oiq-surface)", fontSize: 10, alignItems: "center" }}>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ color: FEATURE_COLORS[r.feature?.split(" — ")[0]] || "var(--oiq-accent)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.feature?.slice(0, 22)}</div>
                        <div style={{ fontSize: 8, color: "var(--oiq-faint)" }}>{new Date(r.ts).toLocaleTimeString()}</div>
                      </div>
                      <div style={{ color: "var(--oiq-muted)", textTransform: "capitalize" as const }}>{r.provider}</div>
                      <div style={{ textAlign: "right" as const, color: "#3B82F6" }}>{fmt(r.inputTokens ?? 0)}</div>
                      <div style={{ textAlign: "right" as const, color: "var(--oiq-accent)" }}>{fmt(r.outputTokens ?? 0)}</div>
                      <div style={{ textAlign: "right" as const, color: "var(--oiq-body)" }}>{fmt((r.inputTokens ?? 0) + (r.outputTokens ?? 0))}</div>
                      <div style={{ textAlign: "right" as const, color: (r.costUsd ?? 0) === 0 ? "#10B981" : "var(--oiq-ink)", fontWeight: 600 }}>{fmtCost(r.costUsd ?? 0)}</div>
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
