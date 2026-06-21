import { useState, useEffect, useCallback } from "react";

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
}

const PROVIDER_COSTS: Record<string, { inputPer1M: number; outputPer1M: number; label: string }> = {
  groq:   { inputPer1M: 0,    outputPer1M: 0,     label: "Groq (free)" },
  gemini: { inputPer1M: 0,    outputPer1M: 0,     label: "Gemini (free)" },
  claude: { inputPer1M: 0.25, outputPer1M: 1.25,  label: "Claude Haiku" },
  openai: { inputPer1M: 2.50, outputPer1M: 10,    label: "GPT-4o" },
};

export function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const p = PROVIDER_COSTS[provider] || PROVIDER_COSTS.groq;
  return (inputTokens / 1_000_000 * p.inputPer1M) + (outputTokens / 1_000_000 * p.outputPer1M);
}

export function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 3.8);
}

const STORAGE_KEY = "oiq-token-records";

export function loadRecords(): TokenRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

export function saveRecord(rec: Omit<TokenRecord, "id" | "ts">) {
  const records = loadRecords();
  const full: TokenRecord = { ...rec, id: Date.now() + Math.random().toString(36).slice(2), ts: new Date().toISOString() };
  const updated = [full, ...records].slice(0, 500);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  window.dispatchEvent(new CustomEvent("oiq-token-update", { detail: full }));
  return full;
}

function fmt(n: number): string {
  return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n);
}

function fmtCost(c: number): string {
  if (c === 0) return "Free";
  if (c < 0.001) return "<$0.001";
  return "$" + c.toFixed(3);
}

const FEATURE_COLORS: Record<string, string> = {
  "Boardroom":   "#14B8A6",
  "Time Machine":"#8B5CF6",
  "Autopilot":   "#F59E0B",
  "Workflow":    "#3B82F6",
  "Chat":        "#10B981",
  "Queue":       "#F97316",
  "Research":    "#EC4899",
  "Other":       "#6B7280",
};

export default function TokenAnalytics({ defP, keys }: { defP: string; keys: Record<string, string> }) {
  const [records, setRecords] = useState<TokenRecord[]>([]);
  const [filter, setFilter] = useState("all");

  const reload = useCallback(() => setRecords(loadRecords()), []);

  useEffect(() => {
    reload();
    window.addEventListener("oiq-token-update", reload);
    return () => window.removeEventListener("oiq-token-update", reload);
  }, [reload]);

  const filtered = filter === "all" ? records : records.filter(r => r.feature === filter);
  const features = [...new Set(records.map(r => r.feature))];

  const totalIn  = filtered.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = filtered.reduce((s, r) => s + r.outputTokens, 0);
  const totalCost = filtered.reduce((s, r) => s + r.costUsd, 0);
  const totalTok = totalIn + totalOut;

  const byFeature: Record<string, { tokens: number; cost: number; count: number; icon: string }> = {};
  records.forEach(r => {
    if (!byFeature[r.feature]) byFeature[r.feature] = { tokens: 0, cost: 0, count: 0, icon: r.featureIcon };
    byFeature[r.feature].tokens += r.inputTokens + r.outputTokens;
    byFeature[r.feature].cost += r.costUsd;
    byFeature[r.feature].count++;
  });
  const maxTokens = Object.values(byFeature).length > 0 ? Math.max(...Object.values(byFeature).map(v => v.tokens ?? 0), 1) : 1;

  const exportCSV = () => {
    const csv = ["Feature,Provider,Input Tokens,Output Tokens,Cost USD,Time",
      ...records.map(r => `${r.feature},${r.provider},${r.inputTokens ?? 0},${r.outputTokens ?? 0},${(r.costUsd ?? 0).toFixed(6)},${r.ts}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "OrchestrIQ-tokens-" + Date.now() + ".csv";
    a.click();
  };

  const reset = () => {
    if (!confirm("Reset all token records? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
  };

  const S = {
    page: { flex: 1 as const, overflowY: "auto" as const, background: "#070C18", fontFamily: "'Inter',-apple-system,sans-serif", color: "#F0F4FF" },
    card: { background: "#0F1829", border: "1px solid #1C2A40", borderRadius: 8, padding: 16, marginBottom: 12 },
    metric: { background: "#141F33", border: "1px solid #1C2A40", borderRadius: 8, padding: "12px 14px", textAlign: "center" as const },
    label: { fontSize: 10, fontWeight: 700, color: "#4D6A8A", letterSpacing: "0.1em", textTransform: "uppercase" as const, display: "block" as const, marginBottom: 4 },
    val: { fontSize: 22, fontWeight: 800, color: "#F0F4FF" },
    hBtn: { background: "none", border: "1px solid #1C2A40", borderRadius: 5, padding: "4px 10px", color: "#8FA8CC", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  };

  return (
    <div style={S.page}>
      <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #1C2A40", paddingBottom: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F0F4FF", marginBottom: 3 }}>🔢 Token Analytics</div>
            <div style={{ fontSize: 11, color: "#4D6A8A" }}>Every AI call tracked · session history · cost estimates</div>
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
            <div style={{ fontSize: 12, color: "#4D6A8A", lineHeight: 1.7 }}>Use any AI feature — Boardroom, Time Machine, Autopilot, Chat — and your token usage will appear here automatically.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                ["Total tokens", fmt(totalTok)],
                ["Input tokens", fmt(totalIn)],
                ["Output tokens", fmt(totalOut)],
                ["Est. cost", fmtCost(totalCost)],
              ].map(([lb, val]) => (
                <div key={lb} style={S.metric}>
                  <span style={S.label}>{lb}</span>
                  <div style={S.val}>{val}</div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", marginBottom: 12 }}>Usage by feature</div>
              {Object.entries(byFeature).sort((a, b) => b[1].tokens - a[1].tokens).map(([feat, data]) => (
                <div key={feat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: "#F0F4FF" }}>{data.icon} {feat}</span>
                    <span style={{ color: "#8FA8CC" }}>{fmt(data.tokens)} tokens · {fmtCost(data.cost)} · {data.count} calls</span>
                  </div>
                  <div style={{ background: "#1C2A40", borderRadius: 9999, height: 6 }}>
                    <div style={{ width: (data.tokens / maxTokens * 100) + "%", height: "100%", borderRadius: 9999, background: FEATURE_COLORS[feat] || "#14B8A6", transition: "width 0.4s" }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", flex: 1 }}>Call history</div>
                <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: "#070C18", border: "1px solid #1C2A40", borderRadius: 5, color: "#8FA8CC", fontSize: 11, padding: "3px 6px", fontFamily: "inherit" }}>
                  <option value="all">All features</option>
                  {features.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {filtered.slice(0, 100).map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #1C2A40", fontSize: 11 }}>
                    <span style={{ flexShrink: 0 }}>{r.featureIcon}</span>
                    <span style={{ color: FEATURE_COLORS[r.feature] || "#14B8A6", fontWeight: 600, minWidth: 90 }}>{r.feature}</span>
                    <span style={{ color: "#4D6A8A", minWidth: 80 }}>{r.provider}</span>
                    <span style={{ color: "#8FA8CC", flex: 1 }}>↑{fmt(r.inputTokens)} ↓{fmt(r.outputTokens)}</span>
                    <span style={{ color: r.costUsd === 0 ? "#10B981" : "#F0F4FF", fontWeight: 600 }}>{fmtCost(r.costUsd)}</span>
                    <span style={{ color: "#2D4460", fontSize: 10 }}>{new Date(r.ts).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
