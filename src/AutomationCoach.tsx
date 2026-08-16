/* ============================================================================
 * OrchestrIQ :: AutomationCoach.tsx
 *
 * Guided, resumable automation build-outs. One phase at a time, verify before
 * advancing, and a first-class "this didn't work" path at every step.
 *
 * Lives inside the Agentic AI tab.
 * ========================================================================== */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./lib/supabase";
import {
  PLAYBOOKS, PLATFORM_OPTIONS, RISK_COPY, matchPlaybook, assessRisk,
  generatePlan, recover, phaseProgress,
  type CoachPlan, type Phase, type Step, type Prereq, type RiskTier,
  type PlanResult, type RecoveryResult, type Confidence,
} from "./lib/AutomationCoach";

/* ------------------------------------------------------------------ styling */

const V = (n: string, f: string) => `var(--oiq-${n}, ${f})`;

const S: Record<string, React.CSSProperties> = {
  wrap:   { padding: "14px 4px 40px", color: V("ink", "#e6edf3"), fontSize: 13 },
  card:   { background: V("surface", "#0d1520"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: V("radius", "8px") as string, padding: 15, marginBottom: 14 },
  h:      { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, color: V("muted", "#8b98a5"), marginBottom: 9 },
  note:   { fontSize: 11.5, color: V("muted", "#8b98a5"), lineHeight: 1.6 },
  inp:    { width: "100%", background: V("bg", "#070c18"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: 6, color: V("ink", "#e6edf3"), padding: "8px 10px", fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  btn:    { background: V("accent", "#4ADE80"), color: V("accentText", "#06210f"), border: "none", borderRadius: 6, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  ghost:  { background: "transparent", color: V("muted", "#8b98a5"), border: `1px solid ${V("border", "#1e2a38")}`, borderRadius: 6, padding: "7px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  chip:   { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 9.5, fontWeight: 700, letterSpacing: .3, textTransform: "uppercase" },
  lbl:    { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5, color: V("muted", "#8b98a5"), marginBottom: 5, display: "block" },
  grid:   { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 11 },
};

const OK   = { bg: "rgba(74,222,128,.12)",  fg: "#4ADE80" };
const WARN = { bg: "rgba(251,191,36,.12)",  fg: "#FBBF24" };
const BAD  = { bg: "rgba(248,113,113,.12)", fg: "#F87171" };
const NEU  = { bg: "rgba(139,152,165,.12)", fg: "#8b98a5" };

const Chip: React.FC<{ tone: { bg: string; fg: string }; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{ ...S.chip, background: tone.bg, color: tone.fg }}>{children}</span>
);

const RISK_TONE: Record<RiskTier, { bg: string; fg: string }> = { green: OK, amber: WARN, red: BAD };
const CONF_TONE: Record<Confidence, { bg: string; fg: string }> = { verified: OK, likely: NEU, unverified: WARN };
const CONF_WORD: Record<Confidence, string> = { verified: "Verified", likely: "Standard", unverified: "Unconfirmed" };

function uid(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0; return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* -------------------------------------------------------------------- props */

export interface AutomationCoachProps {
  callAI?: (prompt: string, useWebSearch: boolean) => Promise<string>;
  showToast?: (msg: string, kind?: string) => void;
  onBack?: () => void;
}

interface SessionRow {
  id: string; title: string | null; goal: string | null; platforms: any;
  playbook_id: string | null; risk_tier: RiskTier; status: string;
  recurrence: string | null; plan: any; phase_index: number;
  completed_steps: any; updated_at: string;
}

/* ============================================================================ */

export default function AutomationCoach({ callAI, showToast, onBack }: AutomationCoachProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [goal, setGoal] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState("Every weekday morning");
  const [busy, setBusy] = useState(false);
  const [phaseText, setPhaseText] = useState("");
  const [res, setRes] = useState<PlanResult | null>(null);

  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [prereqOk, setPrereqOk] = useState<Record<string, boolean>>({});
  const [gateAccepted, setGateAccepted] = useState(false);
  const [problem, setProblem] = useState("");
  const [rec, setRec] = useState<RecoveryResult | null>(null);
  const [showStuck, setShowStuck] = useState(false);

  const toast = useCallback((m: string, k?: string) => { if (showToast) showToast(m, k); }, [showToast]);

  /* ------------------------------------------------------------- load */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const u = auth?.user?.id ?? null;
        if (dead) return;
        setUserId(u);
        if (!u) { setLoading(false); return; }
        const { data } = await supabase.from("ac_sessions").select("*")
          .eq("user_id", u).order("updated_at", { ascending: false }).limit(20);
        if (!dead) setSessions((data as SessionRow[]) ?? []);
      } catch { /* list stays empty */ }
      finally { if (!dead) setLoading(false); }
    })();
    return () => { dead = true; };
  }, []);

  const persist = useCallback(async (patch: Record<string, any>) => {
    if (!userId || !sessionId) return;
    try {
      await supabase.from("ac_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId);
    } catch { /* local state already reflects it */ }
  }, [userId, sessionId]);

  const logEvent = useCallback(async (kind: string, body: string, payload: any = {}) => {
    if (!userId || !sessionId) return;
    try {
      await supabase.from("ac_events").insert([{ id: uid(), user_id: userId, session_id: sessionId, kind, phase_index: phaseIndex, body, payload }]);
    } catch { /* non-critical */ }
  }, [userId, sessionId, phaseIndex]);

  /* --------------------------------------------------------- generate */
  const preview = useMemo(() => {
    const m = matchPlaybook(goal, platforms);
    return { playbook: m.playbook, risk: assessRisk(goal, m.playbook) };
  }, [goal, platforms]);

  const run = async () => {
    if (!callAI) return;
    setBusy(true); setRes(null); setPlan(null); setDone([]); setPhaseIndex(0);
    setGateAccepted(false); setPrereqOk({}); setRec(null); setShowStuck(false);

    const msgs = [
      "Working out what you are trying to automate...",
      "Checking the official documentation for your tools...",
      "Confirming the exact menu paths on current versions...",
      "Working out what could go wrong and how to undo it...",
      "Breaking it into phases you can complete one at a time...",
    ];
    let i = 0; setPhaseText(msgs[0]);
    const t = setInterval(() => { i = Math.min(i + 1, msgs.length - 1); setPhaseText(msgs[i]); }, 6000);

    try {
      const r = await generatePlan(callAI, { goal, platforms, recurrence });
      setRes(r);
      if (r.ok && r.plan && userId) {
        const sid = uid();
        const row = {
          id: sid, user_id: userId, title: r.plan.title, goal,
          platforms, playbook_id: r.plan.playbookId, risk_tier: r.plan.riskTier,
          status: "in_progress", recurrence: r.plan.recurrence,
          plan: r.plan as any, phase_index: 0, completed_steps: [],
          sources: r.plan.docs as any,
        };
        try {
          const { error } = await supabase.from("ac_sessions").insert([row]);
          if (error) throw error;
          setSessionId(sid);
          setSessions((p) => [{ ...row, updated_at: new Date().toISOString() } as any, ...p]);
        } catch (e: any) { toast("Plan built, but could not be saved: " + (e?.message || ""), "warn"); }
        setPlan(r.plan);
      }
    } catch (e: any) {
      setRes({ ok: false, plan: null, stage: "failed", attempts: [], error: e?.message || "Something went wrong. Try again." });
    } finally { clearInterval(t); setBusy(false); setPhaseText(""); }
  };

  const resume = async (row: SessionRow) => {
    setSessionId(row.id);
    setPlan((row.plan as CoachPlan) || null);
    setPhaseIndex(row.phase_index || 0);
    setDone(Array.isArray(row.completed_steps) ? row.completed_steps : []);
    setGoal(row.goal || ""); setRecurrence(row.recurrence || "");
    setPlatforms(Array.isArray(row.platforms) ? row.platforms : []);
    setGateAccepted(true); setRes(null); setRec(null); setShowStuck(false);
    const pr: Record<string, boolean> = {};
    ((row.plan as CoachPlan)?.prerequisites || []).forEach((p) => { pr[p.id] = true; });
    setPrereqOk(pr);
  };

  const toggleStep = (id: string) => {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void persist({ completed_steps: next });
      return next;
    });
  };

  const advance = async () => {
    const next = phaseIndex + 1;
    await logEvent("verify_pass", `Phase ${phaseIndex + 1} verified`);
    if (plan && next >= plan.phases.length) {
      setPhaseIndex(next); await persist({ phase_index: next, status: "done" });
      toast("Automation complete. It will now run on its own.", "success");
    } else {
      setPhaseIndex(next); await persist({ phase_index: next });
      setShowStuck(false); setRec(null); setProblem("");
    }
  };

  const askForHelp = async () => {
    if (!callAI || !plan || !problem.trim()) return;
    setBusy(true); setRec(null);
    const ph = plan.phases[phaseIndex];
    await logEvent("blocked", problem);
    try {
      const r = await recover(callAI, {
        goal, platforms, phaseName: ph?.name || "", stepsIssued: ph?.steps || [],
        problem, playbook: PLAYBOOKS.find((p) => p.id === plan.playbookId) || null,
      });
      setRec(r);
      if (r.ok) await logEvent("note", r.diagnosis);
    } finally { setBusy(false); }
  };

  /* ------------------------------------------------------------ render */

  if (loading) return <div style={{ ...S.wrap, textAlign: "center", padding: 40, color: V("muted", "#8b98a5") }}>Loading...</div>;

  if (!callAI) {
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.h}>Automation Coach</div>
          <div style={S.note}>This needs an AI provider key to work. Add one in Settings.</div>
          {onBack && <button style={{ ...S.ghost, marginTop: 11 }} onClick={onBack}>Back to workflows</button>}
        </div>
      </div>
    );
  }

  const prog = phaseProgress(plan, done);
  const activePhase: Phase | null = plan && phaseIndex < plan.phases.length ? plan.phases[phaseIndex] : null;
  const blockingUnmet = (plan?.prerequisites || []).filter((p) => p.blocksIfMissing && !prereqOk[p.id]);
  const gateNeeded = plan ? !!RISK_COPY[plan.riskTier].gate && !gateAccepted : false;

  return (
    <div style={S.wrap}>
      {/* header */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Automation Coach</div>
          <div style={{ ...S.note, marginTop: 3 }}>
            Tell it what you do by hand every day. It works out how to make your own tools do it, and walks you through building it.
          </div>
        </div>
        {onBack && <button style={S.ghost} onClick={onBack}>&larr; All workflows</button>}
      </div>

      {/* ---------------- setup ---------------- */}
      {!plan && (
        <>
          <div style={S.card}>
            <div style={S.h}>What do you want to automate?</div>
            <div style={{ ...S.note, marginBottom: 10 }}>
              Describe what you do manually today, step by step, in your own words. Include the systems you log into.
              The more ordinary detail you give, the better the plan.
            </div>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={5} disabled={busy}
              placeholder="Every morning I log into ServiceNow, filter tickets by state and assignee, export to Excel, and paste it into a Google Sheet tracker. At the end of the day I email the client a status with SLA and ageing."
              style={{ ...S.inp, resize: "vertical", minHeight: 100, lineHeight: 1.55 }} />

            <div style={{ ...S.grid, marginTop: 12 }}>
              <div>
                <label style={S.lbl}>Which systems are involved?</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {PLATFORM_OPTIONS.map((p) => {
                    const on = platforms.includes(p.v);
                    return (
                      <button key={p.v} disabled={busy}
                        onClick={() => setPlatforms((prev) => on ? prev.filter((x) => x !== p.v) : [...prev, p.v])}
                        style={{ ...S.ghost, fontSize: 10.5, padding: "5px 9px",
                                 borderColor: on ? V("accent", "#4ADE80") : V("border", "#1e2a38"),
                                 color: on ? V("accent", "#4ADE80") : V("muted", "#8b98a5") }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={S.lbl}>How often should it run?</label>
                <select style={{ ...S.inp, cursor: "pointer" }} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                  {["Every weekday morning", "Every day", "Twice daily", "Weekly", "Monthly", "One-off (not recurring)"]
                    .map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div style={{ ...S.note, marginTop: 6, fontSize: 10.5 }}>
                  Real automation repeats. Scheduling is built into the plan, not bolted on afterwards.
                </div>
              </div>
            </div>

            {goal.trim().length > 20 && (
              <div style={{ marginTop: 12, padding: 11, background: V("bg", "#070c18"), borderRadius: 6, border: `1px solid ${V("border", "#1e2a38")}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Chip tone={RISK_TONE[preview.risk]}>{RISK_COPY[preview.risk].label}</Chip>
                  {preview.playbook
                    ? <Chip tone={OK}>Verified playbook available</Chip>
                    : <Chip tone={WARN}>No verified playbook &mdash; extra caution</Chip>}
                </div>
                <div style={{ ...S.note, marginTop: 7 }}>
                  {RISK_COPY[preview.risk].meaning}
                  {preview.playbook && <> This matches <strong style={{ color: V("ink", "#e6edf3") }}>{preview.playbook.title}</strong>, which we have walked through and confirmed.</>}
                </div>
              </div>
            )}

            <button onClick={run} disabled={busy || goal.trim().length < 15}
              style={{ ...S.btn, marginTop: 13, opacity: busy || goal.trim().length < 15 ? .45 : 1, cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Working..." : "Build my automation plan"}
            </button>
            {busy && <div style={{ ...S.note, marginTop: 8, color: V("accent", "#4ADE80") }}>{phaseText}</div>}
          </div>

          {res && !res.ok && (
            <div style={{ ...S.card, borderColor: BAD.fg }}>
              <div style={{ ...S.h, color: BAD.fg }}>That did not work</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>{res.error}</div>
              {res.attempts.length > 0 && (
                <div style={{ ...S.note, marginTop: 9, fontSize: 10.5, fontFamily: "ui-monospace,monospace" }}>
                  {res.attempts.map((a, i) => `${i + 1}. ${a}`).join("\n")}
                </div>
              )}
            </div>
          )}

          {sessions.length > 0 && (
            <div style={S.card}>
              <div style={S.h}>Pick up where you left off</div>
              {sessions.map((sn) => (
                <div key={sn.id} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between",
                                          padding: "9px 0", borderBottom: `1px solid ${V("faint", "#16202c")}`, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{sn.title || "Untitled automation"}</div>
                    <div style={{ ...S.note, fontSize: 10.5 }}>
                      {sn.status === "done" ? "Finished" : `Phase ${(sn.phase_index || 0) + 1}`} &middot; {new Date(sn.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button style={S.ghost} onClick={() => resume(sn)}>{sn.status === "done" ? "Review" : "Resume"}</button>
                </div>
              ))}
            </div>
          )}

          <div style={S.card}>
            <div style={S.h}>Automations we have verified end to end</div>
            {PLAYBOOKS.map((pb) => (
              <div key={pb.id} style={{ padding: "9px 0", borderBottom: `1px solid ${V("faint", "#16202c")}` }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <Chip tone={RISK_TONE[pb.riskTier]}>{RISK_COPY[pb.riskTier].label}</Chip>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{pb.title}</span>
                  <span style={{ fontSize: 10, color: V("muted", "#8b98a5") }}>{pb.timeEstimate}</span>
                </div>
                <div style={S.note}>{pb.summary}</div>
                <button style={{ ...S.ghost, marginTop: 6, fontSize: 10.5 }}
                  onClick={() => { setGoal(pb.summary + " " + pb.outcome); setPlatforms(pb.platforms); }}>
                  Use this as a starting point
                </button>
              </div>
            ))}
            <div style={{ ...S.note, marginTop: 10 }}>
              Anything else, describe it above. Where we have no verified playbook the coach checks the official
              documentation and tells you honestly which steps it could not confirm.
            </div>
          </div>
        </>
      )}

      {/* ---------------- the plan ---------------- */}
      {plan && (
        <>
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 11, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 300px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{plan.title}</div>
                <div style={{ ...S.note, marginTop: 4 }}>{plan.understanding}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <Chip tone={RISK_TONE[plan.riskTier]}>{RISK_COPY[plan.riskTier].label}</Chip>
                {res && <Chip tone={res.stage === "researched" ? OK : res.stage === "playbook_only" ? BAD : WARN}>
                  {res.stage === "researched" ? "Docs checked" : res.stage === "model_knowledge" ? "Not doc-verified" : "Outline only"}
                </Chip>}
              </div>
            </div>

            <div style={{ ...S.grid, marginTop: 13 }}>
              <div><div style={S.lbl}>Outcome</div><div style={{ fontSize: 11.5 }}>{plan.outcome}</div></div>
              <div><div style={S.lbl}>Runs</div><div style={{ fontSize: 11.5 }}>{plan.recurrence}</div></div>
              <div><div style={S.lbl}>Time to build</div><div style={{ fontSize: 11.5 }}>{plan.timeEstimate}</div></div>
            </div>

            <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px solid ${V("faint", "#16202c")}` }}>
              <div style={S.lbl}>What this touches</div>
              <div style={{ ...S.note, marginBottom: 8 }}>{plan.blastRadius}</div>
              {plan.approvalNote && (<><div style={S.lbl}>Before you start</div><div style={S.note}>{plan.approvalNote}</div></>)}
            </div>

            {prog.total > 0 && (
              <div style={{ marginTop: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: V("muted", "#8b98a5"), marginBottom: 4 }}>
                  <span>Phase {Math.min(phaseIndex + 1, plan.phases.length)} of {plan.phases.length}</span>
                  <span>{prog.done} of {prog.total} steps done</span>
                </div>
                <div style={{ height: 5, background: V("faint", "#16202c"), borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: prog.pct + "%", background: V("accent", "#4ADE80"), transition: "width .3s" }} />
                </div>
              </div>
            )}
          </div>

          {plan.unverifiedAreas.length > 0 && (
            <div style={{ ...S.card, borderColor: WARN.fg }}>
              <div style={{ ...S.h, color: WARN.fg, marginBottom: 6 }}>What we could not confirm</div>
              <div style={{ ...S.note, marginBottom: 7 }}>
                Interfaces change. These parts were not verified against current documentation &mdash; read them carefully
                and check your own screen before acting.
              </div>
              {plan.unverifiedAreas.map((u, i) => (
                <div key={i} style={{ fontSize: 11.5, color: WARN.fg, marginBottom: 4, lineHeight: 1.5 }}>&bull; {u}</div>
              ))}
            </div>
          )}

          {/* risk gate */}
          {gateNeeded && (
            <div style={{ ...S.card, borderColor: RISK_TONE[plan.riskTier].fg }}>
              <div style={{ ...S.h, color: RISK_TONE[plan.riskTier].fg, marginBottom: 6 }}>
                {plan.riskTier === "red" ? "Stop - read this first" : "Before you begin"}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>{RISK_COPY[plan.riskTier].gate}</div>
              {plan.cautions.map((c, i) => <div key={i} style={{ ...S.note, marginBottom: 4 }}>&bull; {c}</div>)}
              <button style={{ ...S.btn, marginTop: 11 }} onClick={() => setGateAccepted(true)}>
                {plan.riskTier === "red" ? "I will build this in a sandbox and get approval" : "Understood - I will test safely first"}
              </button>
            </div>
          )}

          {/* prerequisites */}
          {!gateNeeded && blockingUnmet.length > 0 && (
            <div style={S.card}>
              <div style={S.h}>Check these before you start</div>
              <div style={{ ...S.note, marginBottom: 11 }}>
                Finding out at step 9 that you lack a permission wastes an hour. Confirm each one now.
              </div>
              {(plan.prerequisites || []).map((p: Prereq) => (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${V("faint", "#16202c")}` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={!!prereqOk[p.id]} style={{ marginTop: 3 }}
                      onChange={(e) => setPrereqOk((prev) => ({ ...prev, [p.id]: e.target.checked }))} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {p.question} {p.blocksIfMissing && <Chip tone={BAD}>required</Chip>}
                      </div>
                      <div style={{ ...S.note, marginTop: 3 }}>{p.whyItMatters}</div>
                      <div style={{ ...S.note, marginTop: 3, color: V("accent", "#4ADE80") }}>How to check: {p.howToCheck}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* active phase */}
          {!gateNeeded && blockingUnmet.length === 0 && activePhase && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ ...S.h, marginBottom: 3 }}>Phase {phaseIndex + 1} of {plan.phases.length}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{activePhase.name}</div>
                  <div style={{ ...S.note, marginTop: 3 }}>{activePhase.goal}</div>
                </div>
                <Chip tone={NEU}>{activePhase.steps.length} steps</Chip>
              </div>

              <div style={{ marginTop: 14 }}>
                {activePhase.steps.map((st: Step) => {
                  const isDone = done.includes(st.id);
                  return (
                    <div key={st.id} style={{ display: "flex", gap: 10, padding: "11px 0",
                                              borderBottom: `1px solid ${V("faint", "#16202c")}`, opacity: isDone ? .55 : 1 }}>
                      <input type="checkbox" checked={isDone} onChange={() => toggleStep(st.id)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, textDecoration: isDone ? "line-through" : "none" }}>
                            {st.n}. {st.action}
                          </span>
                          {st.confidence !== "verified" && <Chip tone={CONF_TONE[st.confidence]}>{CONF_WORD[st.confidence]}</Chip>}
                        </div>
                        {st.whereExactly && (
                          <div style={{ fontSize: 11, marginTop: 4, fontFamily: "ui-monospace,monospace",
                                        background: V("bg", "#070c18"), padding: "5px 8px", borderRadius: 4,
                                        border: `1px solid ${V("border", "#1e2a38")}`, display: "inline-block" }}>
                            {st.whereExactly}
                          </div>
                        )}
                        {st.whatYouShouldSee && (
                          <div style={{ ...S.note, marginTop: 5 }}>
                            <strong style={{ color: V("ink", "#e6edf3") }}>You should see:</strong> {st.whatYouShouldSee}
                          </div>
                        )}
                        {st.ifYouDontSeeIt && (
                          <div style={{ ...S.note, marginTop: 3, color: WARN.fg }}>
                            <strong>If not:</strong> {st.ifYouDontSeeIt}
                          </div>
                        )}
                        {st.caution && (
                          <div style={{ ...S.note, marginTop: 3, color: BAD.fg }}><strong>Careful:</strong> {st.caution}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* verification gate */}
              <div style={{ marginTop: 14, padding: 12, background: V("bg", "#070c18"),
                            border: `1px solid ${OK.fg}`, borderRadius: 6 }}>
                <div style={{ ...S.h, color: OK.fg, marginBottom: 6 }}>Test it before moving on</div>
                <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>{activePhase.verify.test}</div>
                {activePhase.verify.expected && (
                  <div style={S.note}><strong style={{ color: V("ink", "#e6edf3") }}>Expected:</strong> {activePhase.verify.expected}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                  <button style={S.btn} onClick={advance}>Test passed &mdash; next phase</button>
                  <button style={S.ghost} onClick={() => setShowStuck(!showStuck)}>It did not work / I am stuck</button>
                </div>
                {activePhase.verify.ifItFails && (
                  <div style={{ ...S.note, marginTop: 8 }}>If it fails: {activePhase.verify.ifItFails}</div>
                )}
              </div>

              {activePhase.rollback && (
                <div style={{ ...S.note, marginTop: 10 }}>
                  <strong style={{ color: V("ink", "#e6edf3") }}>To undo this phase:</strong> {activePhase.rollback}
                </div>
              )}
            </div>
          )}

          {/* stuck */}
          {showStuck && activePhase && (
            <div style={{ ...S.card, borderColor: WARN.fg }}>
              <div style={{ ...S.h, color: WARN.fg }}>Tell the coach what happened</div>
              <div style={{ ...S.note, marginBottom: 9 }}>
                Say what you saw, or what you clicked by mistake. It will diagnose it and give you replacement steps.
              </div>
              <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} disabled={busy}
                placeholder="There is no Schedule option in the menu, only Export and Share."
                style={{ ...S.inp, resize: "vertical" }} />
              <button style={{ ...S.btn, marginTop: 9, opacity: busy || !problem.trim() ? .5 : 1 }}
                disabled={busy || !problem.trim()} onClick={askForHelp}>
                {busy ? "Thinking..." : "Get me unstuck"}
              </button>

              {rec && rec.ok && (
                <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px solid ${V("border", "#1e2a38")}` }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>{rec.diagnosis}</div>
                  {rec.undoNeeded && (
                    <div style={{ padding: 10, background: BAD.bg, border: `1px solid ${BAD.fg}`, borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ ...S.h, color: BAD.fg, marginBottom: 4 }}>Undo this first</div>
                      <div style={{ fontSize: 12, lineHeight: 1.55 }}>{rec.undoNeeded}</div>
                    </div>
                  )}
                  {rec.escalation && (
                    <div style={{ padding: 10, background: WARN.bg, border: `1px solid ${WARN.fg}`, borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ ...S.h, color: WARN.fg, marginBottom: 4 }}>You will need help from IT</div>
                      <div style={{ fontSize: 12, lineHeight: 1.55 }}>{rec.escalation}</div>
                    </div>
                  )}
                  {rec.askUser && <div style={{ ...S.note, marginBottom: 10 }}><strong style={{ color: V("ink", "#e6edf3") }}>Question:</strong> {rec.askUser}</div>}
                  {rec.replacementSteps.length > 0 && (
                    <>
                      <div style={S.h}>Try these instead</div>
                      {rec.replacementSteps.map((st) => (
                        <div key={st.id} style={{ padding: "9px 0", borderBottom: `1px solid ${V("faint", "#16202c")}` }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{st.n}. {st.action}</div>
                          {st.whereExactly && <div style={{ fontSize: 11, marginTop: 3, fontFamily: "ui-monospace,monospace", color: V("muted", "#8b98a5") }}>{st.whereExactly}</div>}
                          {st.whatYouShouldSee && <div style={{ ...S.note, marginTop: 3 }}>You should see: {st.whatYouShouldSee}</div>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
              {rec && rec.error && <div style={{ ...S.note, marginTop: 9, color: BAD.fg }}>{rec.error}</div>}
            </div>
          )}

          {/* finished */}
          {!gateNeeded && plan.phases.length > 0 && phaseIndex >= plan.phases.length && (
            <div style={{ ...S.card, borderColor: OK.fg }}>
              <div style={{ ...S.h, color: OK.fg }}>Done &mdash; it runs on its own now</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>
                {plan.outcome} Schedule: <strong>{plan.recurrence}</strong>.
              </div>
              <div style={S.h}>Keep an eye on it</div>
              <div style={S.note}>
                Check it actually ran for the first three days. Automations fail silently when a password expires,
                a report is renamed, or a permission changes. If it stops, come back and use &ldquo;I am stuck&rdquo;.
              </div>
              {plan.rollbackSummary && (
                <div style={{ ...S.note, marginTop: 9 }}>
                  <strong style={{ color: V("ink", "#e6edf3") }}>To remove it entirely:</strong> {plan.rollbackSummary}
                </div>
              )}
            </div>
          )}

          {plan.docs.length > 0 && (
            <div style={S.card}>
              <div style={S.h}>Official documentation</div>
              <div style={{ ...S.note, marginBottom: 8 }}>
                We do not show screenshots of other companies&rsquo; software &mdash; a wrong picture is worse than none.
                These are the vendors&rsquo; own guides, with images that are actually current.
              </div>
              {plan.docs.map((d, i) => (
                <div key={i} style={{ marginBottom: 5 }}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11.5, color: V("accent", "#4ADE80"), textDecoration: "none" }}>{d.label} &rarr;</a>
                </div>
              ))}
            </div>
          )}

          <button style={S.ghost} onClick={() => { setPlan(null); setRes(null); setSessionId(null); setShowStuck(false); setRec(null); }}>
            Start a different automation
          </button>
        </>
      )}
    </div>
  );
}
