import React, { useMemo, useState } from "react";
import { runDecisionExport, latestDecisionStage, EXPORT_PURPOSE, type ExportKind, type ExportDeps } from "./lib/DecisionExportActions";

// JOURNEY SHELL (Increment 1) - one guided path over the EXISTING modules.
// It only navigates, shows progress, sets how much is explained, explains the
// trust labels and offers exports. It computes nothing new and hides nothing:
// every engine (Boardroom, Time Machine, Autopilot) is reached unchanged.
export type ExplainLevel = "new" | "expert";
type StepId = "ask" | "answer" | "numbers" | "whatif" | "run" | "details";
type Status = "done" | "now" | "ready" | "locked";

export const TRUST_LABELS: { label: string; color: string; bg: string; what: string; act: string }[] = [
  { label: "YOUR INPUT", bg: "#DBEAFE", color: "#1E3A8A", what: "A number you gave us. We never replace it with someone else's figure.", act: "Correct it any time if it changes." },
  { label: "FACT", bg: "#D1FAE5", color: "#065F46", what: "Backed by a source the research actually retrieved (with its reference number).", act: "Rely on it; open the source to check." },
  { label: "ASSUMPTION", bg: "#FEF3C7", color: "#78350F", what: "An estimate an executive or the system made because no evidence was found.", act: "Verify it before you spend money on it." },
  { label: "CALCULATION", bg: "#E5E7EB", color: "#1F2937", what: "Worked out from the numbers above, using a formula you can see.", act: "As reliable as the numbers it is built from." },
  { label: "SIMULATION", bg: "#EDE9FE", color: "#4C1D95", what: "What would happen IF something changed. Not a forecast, never a fact.", act: "Use it to prepare, not to plan on." },
  { label: "ACTUAL", bg: "#CCFBF1", color: "#134E4A", what: "Real results from your General Ledger.", act: "Compare it with the plan; it always wins over estimates." },
];

const C = { bar: "#0c1120", line: "#1E293B", text: "#E2E8F0", muted: "#A3B1C6", accent: "#14B8A6", done: "#34D399", panel: "#111827" };
const chipBtn = (active: boolean): React.CSSProperties => ({ minHeight: 40, padding: "0 12px", borderRadius: 8, border: `1px solid ${active ? C.accent : C.line}`,
  background: active ? "rgba(20,184,166,.16)" : "transparent", color: active ? C.text : C.muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" });

export function journeyStatus(p: { brCur: any; brRun: boolean; nTab: string; tmSims?: any[]; apPlans?: any[] }): Record<StepId, Status> {
  const cur = p.brCur || {}; const si = latestDecisionStage(cur); const decided = si >= 0;
  const sid = String(cur.sessionId || "");
  const scen = ((cur.researchState && cur.researchState.scenarios) || []).length + (p.tmSims || []).filter((r: any) => sid && String(r.parentDecisionId || "").startsWith(sid)).length;
  const planned = ((cur.researchState && cur.researchState.decisionResponses) || []).length + (p.apPlans || []).length;
  const s: Record<StepId, Status> = {
    ask: cur.q ? "done" : "now",
    answer: decided ? "done" : p.brRun ? "now" : cur.q ? "now" : "locked",
    numbers: decided ? "ready" : "locked",
    whatif: decided ? (scen > 0 ? "done" : "ready") : "locked",
    run: decided ? (planned > 0 ? "done" : "ready") : "locked",
    details: decided ? "ready" : "locked",
  };
  if (p.nTab === "timemachine" && s.whatif !== "locked") s.whatif = s.whatif === "done" ? "done" : "now";
  if (p.nTab === "autopilot" && s.run !== "locked") s.run = s.run === "done" ? "done" : "now";
  return s;
}

export default function JourneyShell({ nTab, setNTab, brCur, brRun, tmSims, apPlans, explainLevel, setExplainLevel, exportDeps }:
  { nTab: string; setNTab: (t: string) => void; brCur: any; brRun: boolean; tmSims?: any[]; apPlans?: any[]; explainLevel: ExplainLevel; setExplainLevel: (l: ExplainLevel) => void; exportDeps: ExportDeps }) {
  const [menu, setMenu] = useState<"" | "trust" | "export">("");
  const [busy, setBusy] = useState("");
  const status = useMemo(() => journeyStatus({ brCur, brRun, nTab, tmSims, apPlans }), [brCur, brRun, nTab, tmSims, apPlans]);
  const si = latestDecisionStage(brCur);
  const steps: { id: StepId; label: string; tab: string; anchor?: string }[] = [
    { id: "ask", label: "Ask", tab: "boardroom", anchor: "dj-ask" },
    { id: "answer", label: "Your answer", tab: "boardroom", anchor: "dj-decision" },
    { id: "numbers", label: "Numbers", tab: "boardroom", anchor: "dj-matters" },
    { id: "whatif", label: "What if?", tab: "timemachine" },
    { id: "run", label: "Run it", tab: "autopilot" },
    { id: "details", label: "Explore the details", tab: "boardroom", anchor: "dj-details" },
  ];
  const doneCount = (["ask", "answer", "whatif", "run"] as StepId[]).filter((k) => status[k] === "done").length;
  const go = (s: typeof steps[number]) => {
    if (status[s.id] === "locked") return;
    if (s.id === "details") setExplainLevel("expert");
    setNTab(s.tab);
    if (s.anchor) setTimeout(() => { try { document.getElementById(s.anchor!)?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* element not mounted */ } }, 80);
  };
  const exp = async (k: ExportKind) => {
    if (si < 0) return; setBusy(k);
    try { await runDecisionExport(k, brCur, si, exportDeps); setMenu(""); }
    catch (e: any) { exportDeps.showToast && exportDeps.showToast(EXPORT_PURPOSE[k].label + " export failed: " + String(e?.message || e).slice(0, 160), "error"); }
    finally { setBusy(""); }
  };
  const mark = (st: Status) => (st === "done" ? "\u2713" : st === "now" ? "\u25CF" : st === "ready" ? "\u25CB" : "");
  return (
    <div data-testid="journey-shell" style={{ background: C.bar, borderBottom: `1px solid ${C.line}`, padding: "8px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, position: "relative" }}>
      <nav aria-label="Decision journey" style={{ flex: "999 1 520px", minWidth: 0, display: "flex", gap: 4, overflowX: "auto", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: ".08em", marginRight: 4, whiteSpace: "nowrap" }}>JOURNEY {doneCount}/4</span>
        {steps.map((s, i) => {
          const st = status[s.id]; const current = (s.tab === nTab && (s.id === "whatif" || s.id === "run")) || (nTab === "boardroom" && s.id === (si >= 0 ? "answer" : "ask"));
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span aria-hidden="true" style={{ color: C.line, fontSize: 12 }}>{"\u203A"}</span>}
              <button onClick={() => go(s)} disabled={st === "locked"} aria-current={current ? "step" : undefined}
                title={st === "locked" ? "Available after your first Boardroom answer" : undefined}
                style={{ ...chipBtn(current), opacity: st === "locked" ? 0.45 : 1, cursor: st === "locked" ? "not-allowed" : "pointer", color: st === "done" ? C.done : current ? C.text : C.muted }}>
                {mark(st) && <span aria-hidden="true" style={{ marginRight: 5 }}>{mark(st)}</span>}{s.label}
                <span style={{ position: "absolute", left: -9999 }}>{st === "done" ? " (done)" : st === "locked" ? " (not available yet)" : ""}</span>
              </button>
            </React.Fragment>);
        })}
      </nav>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: C.muted }}>Explain like:</span>
        <div role="group" aria-label="How much to explain" style={{ display: "flex", gap: 4 }}>
          <button aria-pressed={explainLevel === "new"} onClick={() => setExplainLevel("new")} style={chipBtn(explainLevel === "new")}>I'm new</button>
          <button aria-pressed={explainLevel === "expert"} onClick={() => setExplainLevel("expert")} style={chipBtn(explainLevel === "expert")}>I know business</button>
        </div>
        <button aria-expanded={menu === "trust"} onClick={() => setMenu(menu === "trust" ? "" : "trust")} style={chipBtn(menu === "trust")}>How far to trust a number</button>
        <button aria-expanded={menu === "export"} disabled={si < 0} onClick={() => setMenu(menu === "export" ? "" : "export")}
          title={si < 0 ? "Available after your first Boardroom answer" : undefined} style={{ ...chipBtn(menu === "export"), opacity: si < 0 ? 0.45 : 1 }}>Export {"\u25BE"}</button>
      </div>
      {menu === "trust" && (
        <div role="dialog" aria-label="How far to trust a number" style={{ position: "absolute", right: 14, top: "100%", zIndex: 40, boxSizing: "border-box", width: "min(460px, calc(100vw - 28px))", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, boxShadow: "0 12px 32px rgba(0,0,0,.4)" }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 8 }}>Every number carries one label. Simulations never become facts.</div>
          {TRUST_LABELS.map((t) => (
            <div key={t.label} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
              <span style={{ flex: "0 0 auto", padding: "1px 8px", borderRadius: 999, background: t.bg, color: t.color, fontWeight: 700, fontSize: 11.5 }}>{t.label}</span>
              <span style={{ fontSize: 12.5, color: C.text }}>{t.what} <span style={{ color: C.muted }}>{t.act}</span></span>
            </div>))}
        </div>)}
      {menu === "export" && si >= 0 && (
        <div role="menu" aria-label="Export" style={{ position: "absolute", right: 14, top: "100%", zIndex: 40, boxSizing: "border-box", width: "min(340px, calc(100vw - 28px))", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, boxShadow: "0 12px 32px rgba(0,0,0,.4)" }}>
          <div style={{ fontSize: 11.5, color: C.muted, padding: "4px 8px 8px" }}>All exports use the same numbers as the screen.</div>
          {(["pdf", "ppt", "excel", "md", "brief"] as ExportKind[]).map((k) => (
            <button key={k} role="menuitem" disabled={!!busy} onClick={() => exp(k)} style={{ display: "block", width: "100%", textAlign: "left", minHeight: 44, padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: C.text, cursor: busy ? "default" : "pointer" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{busy === k ? "Preparing\u2026" : EXPORT_PURPOSE[k].label}</span><span style={{ display: "block", fontSize: 12, color: C.muted }}>{EXPORT_PURPOSE[k].purpose}</span>
            </button>))}
        </div>)}
    </div>);
}
