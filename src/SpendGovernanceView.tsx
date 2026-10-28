import React, { useEffect, useMemo, useState } from "react";
import { FAMILIES, LESSONS, KPIS, CALENDAR, STAKEHOLDERS, ALL_SG_CONTROLS, type FamilyId } from "./lib/SpendGovKnowledge";
import { DECISIONS, TIERS, DEFAULT_RIGHTS, evaluateDecision, requiredTier, testData, type Answer, type Tier, type Rights, type DataTestInput } from "./lib/SpendGovDecisions";

// SPEND GOVERNANCE & FINANCIAL CONTROL - teacher, executor, error checker and guide
// for a VP governing third-party (corporate-services) spend. Knowledge, rules and
// checks only: real company data stays in the company's own approved systems.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const card: React.CSSProperties = { border: "1px solid " + V.border, borderRadius: 12, background: V.surface, padding: "16px 18px", marginBottom: 14 };
const inp: React.CSSProperties = { minHeight: 38, padding: "0 10px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 13.5, width: "100%", boxSizing: "border-box" };
const btn = (on = false): React.CSSProperties => ({ minHeight: 38, padding: "0 14px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 13, cursor: "pointer" });
const chip = (t: string, c: string) => <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: "#fff", background: c, whiteSpace: "nowrap" }}>{t}</span>;
function H({ children }: { children: React.ReactNode }) { return <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: V.text }}>{children}</div>; }
function P({ children, small }: { children: React.ReactNode; small?: boolean }) { return <p style={{ margin: "4px 0 8px", fontSize: small ? 12.5 : 14, color: small ? V.text3 : V.text2, lineHeight: 1.55 }}>{children}</p>; }
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: V.text2, minWidth: 0 }}>{label}{children}</label>; }
function Num({ value, onChange, testid }: { value: number; onChange: (n: number) => void; testid?: string }) {
  return <input data-testid={testid} inputMode="decimal" style={inp} value={value ? String(value) : ""} onChange={(e) => { const n = parseFloat(e.target.value.replace(/,/g, "")); onChange(isFinite(n) ? n : 0); }} />;
}
const STATUS = ["Not assessed", "Designed", "Operating", "Exception"] as const;
const STATUS_COLOR: Record<string, string> = { "Not assessed": "#94A3B8", Designed: "#2563EB", Operating: "#16A34A", Exception: "#DC2626" };
const KEY = "oiq-spendgov-v1";
interface Store { done: string[]; quiz: Record<string, number>; status: Record<string, string>; notes: Record<string, string>; rights: Rights; log: { at: string; type: string; amount: number; verdict: string; tier: string; note: string }[] }
const load = (): Store => { try { const v = localStorage.getItem(KEY); if (v) return { done: [], quiz: {}, status: {}, notes: {}, rights: DEFAULT_RIGHTS, log: [], ...JSON.parse(v) }; } catch {} return { done: [], quiz: {}, status: {}, notes: {}, rights: DEFAULT_RIGHTS, log: [] }; };
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function SpendGovernanceView() {
  const [S, setS] = useState<Store>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, [S]);
  const [tab, setTab] = useState<"start" | "learn" | "rules" | "decide" | "data" | "kpi" | "people">("start");
  const [lesson, setLesson] = useState<string | null>(null);
  const [fam, setFam] = useState<FamilyId>("invoice");
  const quizTotal = LESSONS.reduce((a, l) => a + l.quiz.length, 0);
  const quizRight = LESSONS.reduce((a, l) => a + l.quiz.filter((q, i) => S.quiz[l.id + ":" + i] === q.answer).length, 0);
  const statusCounts = STATUS.map((s) => ({ s, n: ALL_SG_CONTROLS.filter((c) => (S.status[c.id] || "Not assessed") === s).length }));

  return <div data-testid="spendgov" style={{ padding: "18px 20px", maxWidth: 1240, margin: "0 auto", color: V.text }}>
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>Spend Governance & Financial Control</div>
      <div style={{ fontSize: 13, color: V.text3 }}>Your teacher, executor, error checker and guide for governing third-party spend: invoices, accruals, allocations, vendors, recoveries and reporting.</div>
    </div>
    <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {([["start", "Start here"], ["learn", "Learn (" + S.done.length + "/" + LESSONS.length + ")"], ["rules", "Rulebook & controls"], ["decide", "Decide & verify"], ["data", "Test the data"], ["kpi", "KPIs"], ["people", "People & calendar"]] as const).map(([k, l]) =>
        <button key={k} role="tab" aria-selected={tab === k} data-testid={"sg-tab-" + k} onClick={() => { setTab(k); setLesson(null); }} style={btn(tab === k)}>{l}</button>)}
    </div>

    {tab === "start" && <div data-testid="sg-start">
      <div style={{ ...card, borderLeft: "5px solid " + V.accent }}>
        <H>What this role is, in one paragraph</H>
        <P>You govern how the organisation spends money with third-party vendors for shared services. You set the rules (policies, decision rights, evidence standards), make sure controls over <b>invoices, accruals, cost allocations and vendors</b> work, recover money owed, track service levels and utilisation, manage exceptions, and give leadership a trusted view of control health, savings and risks. You are <b>independent</b>: you govern Sourcing, Finance and Service Owners without being one of them.</P>
      </div>
      <div style={card}>
        <H>How this system works with you</H>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
          {[["Teacher", "Learn", "12 short lessons explain every part of the job: why it exists, its impact, worked examples with numbers, common mistakes, and quizzes that explain each answer."],
            ["Executor", "Rulebook & controls", "Six control families with every control's owner, frequency, threshold, evidence and test. Track each control's status as you assess it."],
            ["Error checker", "Decide & verify / Test the data", "Before you decide, the checker blocks you if evidence is missing, you aren't independent, or the amount exceeds your authority. The data test tells you whether the numbers can be trusted."],
            ["Guide", "KPIs / People & calendar", "Who to work with and what to ask, the KPIs leadership needs (and how each can mislead), and what to do every day, week, month and quarter."]].map(([t, where, d]) =>
            <div key={t} style={{ background: V.surface2, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontWeight: 800, color: V.text }}>{t} <span style={{ color: V.text3, fontWeight: 600, fontSize: 12 }}>→ {where}</span></div><div style={{ fontSize: 13, color: V.text2 }}>{d}</div></div>)}
        </div>
      </div>
      <div style={card}>
        <H>Your progress</H>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[["Lessons completed", S.done.length + " of " + LESSONS.length], ["Quiz answers correct", quizRight + " of " + quizTotal], ["Controls assessed", (ALL_SG_CONTROLS.length - statusCounts[0].n) + " of " + ALL_SG_CONTROLS.length], ["Controls with exceptions", String(statusCounts[3].n)], ["Decisions checked", String(S.log.length)]].map(([k, v]) =>
            <div key={k}><div style={{ fontSize: 11.5, color: V.text3 }}>{k}</div><div style={{ fontWeight: 800, fontSize: 17, color: k.includes("exceptions") && v !== "0" ? V.bad : V.text }}>{v}</div></div>)}
        </div>
        <P small>Suggested start: complete lessons L1 and L12 first (the role, and how to test decisions), then work through the control families one by one.</P>
        <button data-testid="sg-begin" onClick={() => { setTab("learn"); setLesson("L1"); }} style={btn(true)}>Start lesson 1</button>
      </div>
      <div style={{ ...card, background: V.surface2 }}>
        <H>Important: where real data belongs</H>
        <P>This module holds knowledge, rules, checklists and your own notes. <b>Do not enter confidential employer or client data here</b> (vendor invoices, contracts, employee or payment details). Apply these checks inside your organisation's approved systems; use this module to know what to check, why, and how to prove it.</P>
      </div>
    </div>}

    {tab === "learn" && !lesson && <div data-testid="sg-learn">
      <div style={card}><H>Learning path</H><P small>About {LESSONS.reduce((a, l) => a + l.minutes, 0)} minutes in total. Each lesson ends with a quiz that explains the right answer.</P></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {LESSONS.map((l) => <button key={l.id} data-testid={"sg-lesson-" + l.id} onClick={() => setLesson(l.id)} style={{ ...card, marginBottom: 0, textAlign: "left", cursor: "pointer", color: V.text }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{l.id}. {l.title}</b>{S.done.includes(l.id) ? chip("DONE", "#16A34A") : chip(l.minutes + " MIN", "#64748B")}</div>
          <div style={{ fontSize: 13, color: V.text2, marginTop: 4 }}>{l.summary.slice(0, 140)}…</div></button>)}
      </div>
    </div>}
    {tab === "learn" && lesson && (() => { const l = LESSONS.find((x) => x.id === lesson)!; const idx = LESSONS.indexOf(l);
      return <div data-testid="sg-lesson">
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><H>{l.id}. {l.title}</H><button onClick={() => setLesson(null)} style={btn()}>All lessons</button></div>
          <P>{l.summary}</P>
          <div style={{ background: V.surface2, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}><b style={{ color: V.text }}>Why it matters to the organisation:</b> <span style={{ color: V.text2, fontSize: 14 }}>{l.whyItMatters}</span></div>
          <b style={{ color: V.text }}>Key ideas</b><ul style={{ margin: "4px 0 10px", paddingLeft: 18, color: V.text2, fontSize: 14 }}>{l.concepts.map((c) => <li key={c}>{c}</li>)}</ul>
          <div style={{ borderLeft: "4px solid " + V.accent, padding: "6px 12px", marginBottom: 10 }}><b style={{ color: V.text }}>Worked example:</b> <span style={{ color: V.text2, fontSize: 14 }}>{l.example}</span></div>
          <b style={{ color: V.bad }}>Common mistakes</b><ul style={{ margin: "4px 0 0", paddingLeft: 18, color: V.text2, fontSize: 14 }}>{l.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
        <div style={card} data-testid="sg-quiz">
          <H>Check your understanding</H>
          {l.quiz.map((q, qi) => { const k = l.id + ":" + qi; const picked = S.quiz[k];
            return <div key={k} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: V.text, fontSize: 14 }}>{q.q}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>{q.options.map((o, oi) => { const on = picked === oi; const right = picked !== undefined && oi === q.answer;
                return <button key={oi} data-testid={"sg-q-" + qi + "-" + oi} onClick={() => setS((s) => ({ ...s, quiz: { ...s.quiz, [k]: oi } }))} style={{ ...btn(false), textAlign: "left", fontWeight: 600, borderColor: right ? V.ok : on ? V.bad : V.border }}>{o}{right ? " ✔" : on ? " ✘" : ""}</button>; })}</div>
              {picked !== undefined && <div data-testid={"sg-why-" + qi} style={{ marginTop: 6, fontSize: 13.5, color: picked === q.answer ? V.ok : V.bad }}><b>{picked === q.answer ? "Correct." : "Not quite."}</b> <span style={{ color: V.text2 }}>{q.why}</span></div>}
            </div>; })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button data-testid="sg-complete" onClick={() => setS((s) => ({ ...s, done: s.done.includes(l.id) ? s.done : [...s.done, l.id] }))} style={btn(true)}>{S.done.includes(l.id) ? "Completed ✔" : "Mark lesson complete"}</button>
            {idx < LESSONS.length - 1 && <button data-testid="sg-next-lesson" onClick={() => setLesson(LESSONS[idx + 1].id)} style={btn()}>Next: {LESSONS[idx + 1].title} →</button>}
          </div>
        </div>
      </div>; })()}

    {tab === "rules" && (() => { const f = FAMILIES.find((x) => x.id === fam)!;
      return <div data-testid="sg-rules">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{FAMILIES.map((x) => <button key={x.id} data-testid={"sg-fam-" + x.id} onClick={() => setFam(x.id)} style={btn(fam === x.id)}>{x.name}</button>)}</div>
        <div style={card}>
          <H>{f.name}: {f.oneLine}</H>
          <P><b>Why it exists:</b> {f.why}</P>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, fontSize: 13.5, color: V.text2 }}>
            <div><b style={{ color: V.text }}>Impact on the organisation</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{f.impact.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><b style={{ color: V.bad }}>Red flags</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{f.redFlags.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><b style={{ color: V.warn }}>Common mistakes</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{f.mistakes.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <P small>Key stakeholders: {f.stakeholders.join(" · ")}</P>
        </div>
        {f.controls.map((c) => { const st = S.status[c.id] || "Not assessed";
          return <div key={c.id} data-testid={"sg-control-" + c.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b style={{ color: V.text }}>{c.id}</b>{chip(st.toUpperCase(), STATUS_COLOR[st])}</div>
            <div style={{ fontSize: 14, color: V.text, margin: "6px 0" }}>{c.text}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13, color: V.text2 }}>
              <div><b style={{ color: V.text }}>Owner:</b> {c.owner}</div><div><b style={{ color: V.text }}>Frequency:</b> {c.frequency}</div>
              <div><b style={{ color: V.text }}>Threshold:</b> {c.threshold}</div><div><b style={{ color: V.text }}>KPI:</b> {c.kpi}</div>
              <div style={{ gridColumn: "1 / -1" }}><b style={{ color: V.text }}>Evidence:</b> {c.evidence}</div>
              <div style={{ gridColumn: "1 / -1" }}><b style={{ color: V.text }}>How to test it:</b> {c.test}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) 1fr", gap: 8, marginTop: 8 }}>
              <select aria-label={"Status of " + c.id} data-testid={"sg-status-" + c.id} value={st} onChange={(e) => setS((s) => ({ ...s, status: { ...s.status, [c.id]: e.target.value } }))} style={inp}>{STATUS.map((x) => <option key={x}>{x}</option>)}</select>
              <input aria-label={"Notes for " + c.id} placeholder="Your notes: what you saw, who owns the fix" value={S.notes[c.id] || ""} onChange={(e) => setS((s) => ({ ...s, notes: { ...s.notes, [c.id]: e.target.value } }))} style={inp} />
            </div>
          </div>; })}
      </div>; })()}

    {tab === "decide" && <DecideTab rights={S.rights} setRights={(r) => setS((s) => ({ ...s, rights: r }))} log={S.log} addLog={(e) => setS((s) => ({ ...s, log: [e, ...s.log].slice(0, 100) }))} />}
    {tab === "data" && <DataTab />}

    {tab === "kpi" && <div data-testid="sg-kpi">
      <div style={card}><H>KPI catalogue: what leadership should see</H><P>Each KPI has a formula, thresholds and a source. The last two columns teach you to test the KPI itself: how it can mislead, and which KPI to pair it with so neither can be gamed.</P></div>
      <div style={{ ...card, overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}><thead><tr>{["KPI", "Formula", "Green", "Amber", "Red", "Source", "Misleads when…", "Pair with"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text3, fontSize: 12 }}>{h}</th>)}</tr></thead>
        <tbody>{KPIS.map((k) => <tr key={k.name}>{[k.name, k.formula, k.green, k.amber, k.red, k.source, k.misleadsWhen, k.pairWith].map((v, i) => <td key={i} style={{ padding: "6px 8px", borderBottom: "1px solid " + V.border, fontSize: 12.5, color: i === 0 ? V.text : i === 2 ? V.ok : i === 4 ? V.bad : V.text2, fontWeight: i === 0 ? 700 : 400, verticalAlign: "top" }}>{v}</td>)}</tr>)}</tbody></table></div>
    </div>}

    {tab === "people" && <div data-testid="sg-people">
      <div style={card}><H>Stakeholders: what you need, what they need, how to work with them</H>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
          {STAKEHOLDERS.map((s) => <div key={s.who} style={{ background: V.surface2, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: V.text2 }}>
            <div style={{ fontWeight: 800, color: V.text, marginBottom: 4 }}>{s.who}</div>
            <div><b style={{ color: V.text }}>You need:</b> {s.youNeed}</div><div><b style={{ color: V.text }}>They need:</b> {s.theyNeed}</div><div><b style={{ color: V.text }}>How to work:</b> {s.howToWork}</div></div>)}
        </div></div>
      <div style={card}><H>Operating calendar</H>
        {CALENDAR.map((c) => <div key={c.when} style={{ borderLeft: "4px solid " + V.accent, padding: "6px 12px", marginBottom: 8 }}><b style={{ color: V.text }}>{c.when}:</b> <span style={{ color: V.text2, fontSize: 14 }}>{c.what}</span><div style={{ fontSize: 12.5, color: V.text3 }}>Why: {c.why}</div></div>)}
      </div>
    </div>}
  </div>;
}

function DecideTab({ rights, setRights, log, addLog }: { rights: Rights; setRights: (r: Rights) => void; log: Store["log"]; addLog: (e: Store["log"][number]) => void }) {
  const [type, setType] = useState(DECISIONS[0].id); const [amount, setAmount] = useState(0); const [myTier, setMyTier] = useState<Tier>("VP");
  const [independent, setIndependent] = useState(true); const [ev, setEv] = useState<Record<string, boolean>>({}); const [ck, setCk] = useState<Record<string, Answer>>({}); const [note, setNote] = useState("");
  const d = DECISIONS.find((x) => x.id === type)!;
  useEffect(() => { setEv({}); setCk({}); }, [type]);
  const res = useMemo(() => evaluateDecision({ type, amount, evidence: ev, checks: ck, independent, myTier }, rights), [type, amount, ev, ck, independent, myTier, rights]);
  const col = res.verdict === "READY" ? V.ok : res.verdict === "ESCALATE" ? V.warn : V.bad;
  return <div data-testid="sg-decide">
    <div style={card}>
      <H>Decide & verify</H>
      <P>Choose the decision, answer honestly, and the checker tells you whether you can decide, what's missing and who must approve. Nothing here is sent anywhere.</P>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <L label="Decision"><select data-testid="sg-dtype" value={type} onChange={(e) => setType(e.target.value)} style={inp}>{DECISIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></L>
        <L label="Amount involved (₹)"><Num testid="sg-amount" value={amount} onChange={setAmount} /></L>
        <L label="Your level"><select data-testid="sg-tier" value={myTier} onChange={(e) => setMyTier(e.target.value as Tier)} style={inp}>{TIERS.map((t) => <option key={t}>{t}</option>)}</select></L>
        <label style={{ fontSize: 13, color: V.text2, alignSelf: "end" }}><input data-testid="sg-indep" type="checkbox" checked={independent} onChange={(e) => setIndependent(e.target.checked)} /> I did not request this and don't benefit from it</label>
      </div>
      <P small>{d.plain} Needs at least <b>{requiredTier(d, amount, rights)}</b>. Involve: {d.involve.join(", ")}.</P>
    </div>
    <div style={card}>
      <b style={{ color: V.text }}>1. Evidence in hand</b>
      {d.evidence.map((e) => <label key={e.id} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13.5, color: V.text2, borderBottom: "1px solid " + V.border }}>
        <input data-testid={"sg-ev-" + e.id} type="checkbox" checked={!!ev[e.id]} onChange={(x) => setEv({ ...ev, [e.id]: x.target.checked })} />
        <span><b style={{ color: V.text }}>{e.text}</b> {e.critical ? chip("CRITICAL", "#B91C1C") : chip("RECOMMENDED", "#64748B")}<br /><span style={{ fontSize: 12.5, color: V.text3 }}>Why: {e.why}</span></span></label>)}
      <div style={{ marginTop: 12 }}><b style={{ color: V.text }}>2. Verification checks</b></div>
      {d.checks.map((c) => <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid " + V.border }}>
        <div style={{ fontSize: 13.5, color: V.text }}>{c.q} {c.critical && chip("CRITICAL", "#B91C1C")}</div>
        <div style={{ fontSize: 12.5, color: V.text3 }}>How to check: {c.how}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>{(["yes", "no", "unsure"] as Answer[]).map((a) => <button key={a} data-testid={"sg-ck-" + c.id + "-" + a} aria-pressed={ck[c.id] === a} onClick={() => setCk({ ...ck, [c.id]: a })} style={{ ...btn(ck[c.id] === a), minHeight: 32, fontSize: 12 }}>{a === "unsure" ? "Not sure" : a[0].toUpperCase() + a.slice(1)}</button>)}</div>
      </div>)}
      <div style={{ marginTop: 12 }}><b style={{ color: V.text }}>3. Test the test</b> <span style={{ fontSize: 12.5, color: V.text3 }}>Before relying on the data behind this decision, confirm:</span>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: V.text2 }}>{d.dataTests.map((t) => <li key={t}>{t}</li>)}</ul>
        <P small>Use the "Test the data" tab to check completeness, accuracy and independence.</P></div>
    </div>
    <div data-testid="sg-verdict" style={{ ...card, border: "2px solid " + col }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{chip(res.verdict, res.verdict === "READY" ? "#16A34A" : res.verdict === "ESCALATE" ? "#D97706" : "#DC2626")}<b style={{ color: V.text }}>Readiness {res.score}% · required approver: {res.requiredTier}</b></div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5, color: V.text2 }}>{res.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {res.teach.length > 0 && <div style={{ marginTop: 8, background: V.surface2, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: V.text2 }}><b style={{ color: V.text }}>What to do / why:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{res.teach.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      <div style={{ marginTop: 8, fontSize: 13, color: V.text2 }}><b style={{ color: V.text }}>Impact to consider:</b> {d.impact.join(" · ")}</div>
      <div style={{ fontSize: 13, color: V.text2 }}><b style={{ color: V.bad }}>Red flags:</b> {d.redFlags.join(" · ")}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input aria-label="Decision note" placeholder="Note for the record (what you decided and why)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, flex: "1 1 280px" }} />
        <button data-testid="sg-log" onClick={() => { addLog({ at: new Date().toISOString(), type: d.name, amount, verdict: res.verdict, tier: res.requiredTier, note }); setNote(""); }} style={btn(true)}>Save to decision log</button>
      </div>
    </div>
    <div style={card}>
      <H>Decision rights (your organisation's limits)</H>
      <P small>Set these to match your approved decision-rights matrix. The checker uses them for every decision.</P>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <L label="Analyst lead up to (₹)"><Num value={rights.analystLead} onChange={(n) => setRights({ ...rights, analystLead: n })} /></L>
        <L label="AVP up to (₹)"><Num value={rights.avp} onChange={(n) => setRights({ ...rights, avp: n })} /></L>
        <L label="VP up to (₹)"><Num testid="sg-vp-limit" value={rights.vp} onChange={(n) => setRights({ ...rights, vp: n })} /></L>
      </div>
      <P small>Above the VP limit: Executive Director / CAO. Some decisions always need a minimum level (e.g. threshold changes need ED / CAO).</P>
    </div>
    {log.length > 0 && <div style={{ ...card, overflowX: "auto" }} data-testid="sg-logtable"><H>Decision log</H>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}><thead><tr>{["When", "Decision", "Amount", "Verdict", "Approver", "Note"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text3, fontSize: 12 }}>{h}</th>)}</tr></thead>
        <tbody>{log.map((l, i) => <tr key={i}>{[new Date(l.at).toLocaleString("en-IN"), l.type, fmt(l.amount), l.verdict, l.tier, l.note].map((v, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid " + V.border, fontSize: 12.5, color: V.text2 }}>{v}</td>)}</tr>)}</tbody></table></div>}
  </div>;
}

function DataTab() {
  const [x, setX] = useState<DataTestInput>({ sourceCount: 0, extractCount: 0, sourceTotal: 0, extractTotal: 0, periodExpected: "", periodCovered: "", sampleSize: 0, sampleErrors: 0, population: 0, preparedBy: "", testedBy: "" });
  const r = testData(x); const set = (p: Partial<DataTestInput>) => setX({ ...x, ...p });
  return <div data-testid="sg-data">
    <div style={card}><H>Test the data before you trust it</H>
      <P>Every report, dashboard or analysis rests on data. Before you act on it, prove it is <b>complete</b> (nothing missing), <b>covers the right period</b>, is <b>accurate</b> (a sample traces back to source documents) and was <b>checked by someone other than its preparer</b>. This is "testing the test".</P>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <L label="Rows in the source system"><Num testid="sg-d-scount" value={x.sourceCount} onChange={(n) => set({ sourceCount: n })} /></L>
        <L label="Rows in your report / extract"><Num testid="sg-d-ecount" value={x.extractCount} onChange={(n) => set({ extractCount: n })} /></L>
        <L label="Total value in source (₹)"><Num testid="sg-d-stotal" value={x.sourceTotal} onChange={(n) => set({ sourceTotal: n })} /></L>
        <L label="Total value in your report (₹)"><Num testid="sg-d-etotal" value={x.extractTotal} onChange={(n) => set({ extractTotal: n })} /></L>
        <L label="Period it should cover"><input data-testid="sg-d-pexp" style={inp} placeholder="e.g. Oct 2026" value={x.periodExpected} onChange={(e) => set({ periodExpected: e.target.value })} /></L>
        <L label="Period it actually covers"><input data-testid="sg-d-pcov" style={inp} placeholder="e.g. Oct 2026" value={x.periodCovered} onChange={(e) => set({ periodCovered: e.target.value })} /></L>
        <L label="Population (items in scope)"><Num testid="sg-d-pop" value={x.population} onChange={(n) => set({ population: n })} /></L>
        <L label="Items traced to source documents"><Num testid="sg-d-sample" value={x.sampleSize} onChange={(n) => set({ sampleSize: n })} /></L>
        <L label="Errors found in that sample"><Num testid="sg-d-err" value={x.sampleErrors} onChange={(n) => set({ sampleErrors: n })} /></L>
        <L label="Prepared by"><input data-testid="sg-d-prep" style={inp} value={x.preparedBy} onChange={(e) => set({ preparedBy: e.target.value })} /></L>
        <L label="Tested by"><input data-testid="sg-d-test" style={inp} value={x.testedBy} onChange={(e) => set({ testedBy: e.target.value })} /></L>
      </div></div>
    <div data-testid="sg-data-result" style={{ ...card, border: "2px solid " + (r.trusted ? V.ok : V.warn) }}>
      <b style={{ color: r.trusted ? V.ok : V.warn }}>{r.trusted ? "Data can be relied on for this decision." : "Not yet reliable: resolve the items below before acting on this data."}</b>
      {r.checks.map((c) => <div key={c.name} style={{ padding: "6px 0", borderBottom: "1px solid " + V.border }}>
        <div style={{ fontSize: 13.5, color: V.text }}>{c.pass === true ? "✔ " : c.pass === false ? "✘ " : "• "}<b>{c.name}</b>: {c.detail}</div>
        <div style={{ fontSize: 12.5, color: V.text3 }}>Why: {c.why}</div></div>)}
    </div>
  </div>;
}
