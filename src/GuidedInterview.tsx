import React, { useMemo, useState } from "react";
import { planInterview, visibleQuestions, buildEnrichedQuestion, validate, recommendedExecutives, moneySentence, type Answer } from "./lib/GuidedInterview";
import { GLOSSARY } from "./lib/DecisionExperience";
import { fmt } from "./lib/DecisionCockpit";

// GUIDED INTERVIEW SCREEN (Increment 2). Asks only what changes the answer, one
// question at a time, explains why, accepts "I don't know" (recorded as an
// assumption to estimate - never a number), then starts the Boardroom with the
// answers written into the question so the EXISTING engines read them.
const L: Record<string, { bg: string; fg: string; text: string }> = {
  question: { bg: "#DBEAFE", fg: "#1E3A8A", text: "FROM YOUR QUESTION" },
  answer: { bg: "#DBEAFE", fg: "#1E3A8A", text: "YOUR ANSWER" },
  estimate: { bg: "#FEF3C7", fg: "#78350F", text: "TO BE ESTIMATED" },
};
const pill = (k: keyof typeof L) => <span style={{ padding: "1px 8px", borderRadius: 999, background: L[k].bg, color: L[k].fg, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{L[k].text}</span>;
const show = (kind: string, v: any) => kind === "money" ? fmt(v, "INR") : kind === "percent" ? v + "%" : kind === "days" ? v + " days" : kind === "years" ? v + " years" : String(v);

export default function GuidedInterview({ question, tok, availableExecutives, onFinish, onCancel }:
  { question: string; tok: any; availableExecutives: string[]; onFinish: (enriched: string, executives: string[]) => void; onCancel: () => void }) {
  const plan = useMemo(() => planInterview(question), [question]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [openWhy, setOpenWhy] = useState(false);
  const [openLearn, setOpenLearn] = useState(false);
  const qs = visibleQuestions(plan, answers, question);
  const reviewing = step >= qs.length;
  const q = reviewing ? null : qs[step];
  const g: any = q && q.learn ? (GLOSSARY as any)[q.learn] : null;
  const preview = q && q.kind === "money" ? validate(q, draft) : null;
  const answeredCount = qs.filter((x) => answers[x.id]).length;

  const goTo = (i: number) => { setStep(i); const nq = qs[i]; const a = nq ? answers[nq.id] : undefined; setDraft(a && !a.unknown && a.value !== undefined ? String(a.value) : ""); setErr(""); setOpenWhy(false); setOpenLearn(false); };
  const next = (ans: Answer) => { if (!q) return; const na = { ...answers, [q.id]: ans }; setAnswers(na); const nqs = visibleQuestions(plan, na, question); const i = nqs.findIndex((x) => x.id === q.id) + 1; setStep(i); const nq = nqs[i]; const a = nq ? na[nq.id] : undefined; setDraft(a && !a.unknown && a.value !== undefined ? String(a.value) : ""); setErr(""); setOpenWhy(false); setOpenLearn(false); };
  const submit = () => { if (!q) return; const v = validate(q, draft); if (!v.ok) { setErr(v.message || "Please check this answer."); return; } next({ value: v.value }); };
  const finish = (skipRest = false) => {
    const a = { ...answers };
    if (skipRest) for (const x of qs) if (!a[x.id] && x.key && !x.optional) a[x.id] = { unknown: true };
    onFinish(buildEnrichedQuestion(question, plan, a), recommendedExecutives(plan.archetype, availableExecutives));
  };
  const btn = (primary = false): React.CSSProperties => ({ minHeight: 46, padding: "0 18px", borderRadius: 10, border: `1px solid ${primary ? tok.accent : tok.border}`, background: primary ? tok.accent : tok.surface, color: primary ? "#fff" : tok.text, fontSize: 14.5, fontWeight: 700, cursor: "pointer" });
  const card: React.CSSProperties = { borderRadius: 14, border: `1px solid ${tok.border}`, background: tok.surface, padding: "18px 20px" };

  return (
    <section data-testid="guided-interview" aria-label="Guided interview" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
      <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: tok.text3 }}>{reviewing ? "Ready when you are" : "Question " + (step + 1) + " of " + qs.length} · we treat this as {plan.archetypeLabel}</div>
          <div aria-hidden="true" style={{ height: 8, borderRadius: 99, background: tok.surface2, marginTop: 6 }}><div style={{ width: Math.round((Math.min(step, qs.length) / Math.max(qs.length, 1)) * 100) + "%", height: 8, borderRadius: 99, background: tok.accent, transition: "width .2s" }} /></div>
        </div>
        {!reviewing && q && (
          <div style={{ ...card, border: `2px solid ${tok.accent}` }}>
            <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.3, color: tok.text }}>{q.text}</h2>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
              <button onClick={() => setOpenWhy(!openWhy)} aria-expanded={openWhy} style={{ border: "none", background: "none", color: tok.accent, cursor: "pointer", fontWeight: 700, fontSize: 13.5, padding: 0 }}>Why are we asking?</button>
              {g && <button onClick={() => setOpenLearn(!openLearn)} aria-expanded={openLearn} style={{ border: "none", background: "none", color: tok.accent, cursor: "pointer", fontWeight: 700, fontSize: 13.5, padding: 0 }}>Learn: {g.term.split(" (")[0]}</button>}
            </div>
            {openWhy && <p style={{ margin: "8px 0 0", padding: "10px 12px", borderRadius: 10, background: tok.surface2, color: tok.text2, fontSize: 14 }}>{q.why}</p>}
            {openLearn && g && <div style={{ margin: "8px 0 0", padding: "10px 12px", borderRadius: 10, background: tok.surface2, color: tok.text2, fontSize: 13.5, lineHeight: 1.55 }}>
              <b>1. What is it?</b> {g.what}<br /><b>2. Why does it matter?</b> {g.why}<br /><b>3. How is it calculated?</b> {g.how}{g.healthy ? <><br /><b>What is healthy:</b> {g.healthy}</> : null}</div>}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {q.kind === "choice" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                  {(q.options || []).map((o) => <button key={o} onClick={() => next({ value: o })} aria-pressed={answers[q.id]?.value === o}
                    style={{ ...btn(answers[q.id]?.value === o), justifyContent: "flex-start", textAlign: "left", fontWeight: 600 }}>{o}</button>)}
                </div>
              ) : (<>
                <label htmlFor="gi-input" style={{ fontSize: 13.5, color: tok.text3 }}>{q.label} <span style={{ color: tok.muted }}>({q.example})</span></label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input id="gi-input" autoFocus value={draft} inputMode={q.kind === "money" ? "text" : "decimal"} onChange={(e) => { setDraft(e.target.value); setErr(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={q.example.replace(/^e\.g\.\s*/, "")}
                    aria-invalid={!!err} aria-describedby="gi-help"
                    style={{ flex: "1 1 220px", minHeight: 48, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${err ? tok.danger : tok.border}`, background: tok.inputBg, color: tok.text, fontSize: 17 }} />
                  <button onClick={submit} style={btn(true)}>Next</button>
                </div>
                <div id="gi-help" role={err ? "alert" : undefined} style={{ fontSize: 13, color: err ? tok.danger : tok.text3, minHeight: 18 }}>
                  {err || (preview && preview.ok ? "We read this as " + fmt(preview.value as number, "INR") + (moneySentence(preview.value as number) !== fmt(preview.value as number, "INR") ? " (" + moneySentence(preview.value as number) + ")" : "") + "." : q.kind === "money" ? "You can type 15 lakh, 1.5 crore or 250000." : "")}</div>
              </>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {q.key && <button onClick={() => next({ unknown: true })} style={btn()}>I don't know — estimate it for me</button>}
                {q.optional && <button onClick={() => next({ unknown: true })} style={btn()}>Skip this</button>}
                {step > 0 && <button onClick={() => goTo(step - 1)} style={{ ...btn(), border: "none", background: "transparent", color: tok.text3 }}>Back</button>}
              </div>
              {q.key && <div style={{ fontSize: 12.5, color: tok.text3 }}>If you don't know, the executives estimate it from research and it is shown everywhere as an {pill("estimate")} you can correct later.</div>}
            </div>
          </div>)}
        {reviewing && (
          <div style={{ ...card, border: `2px solid ${tok.accent}` }}>
            <h2 style={{ margin: 0, fontSize: 21, color: tok.text }}>That's everything we need.</h2>
            <p style={{ margin: "6px 0 12px", color: tok.text2, fontSize: 14.5 }}>The board will research your idea, work with these numbers, estimate the ones you didn't know (clearly marked), and give you a decision with the reasons and next steps.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button data-testid="gi-start" onClick={() => finish(false)} style={btn(true)}>Start my Boardroom</button>
              <button onClick={() => goTo(0)} style={btn()}>Review my answers</button>
            </div>
          </div>)}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5 }}>
          {!reviewing && <button onClick={() => finish(true)} style={{ border: "none", background: "none", color: tok.accent, cursor: "pointer", fontWeight: 700, padding: 0 }}>Skip the rest — research it for me</button>}
          <button onClick={onCancel} style={{ border: "none", background: "none", color: tok.text3, cursor: "pointer", padding: 0 }}>Close the interview</button>
        </div>
      </div>
      <aside aria-label="What we know so far" style={{ flex: "1 1 280px", minWidth: 0, ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, color: tok.text }}>What we know so far <span style={{ fontWeight: 400, fontSize: 12.5, color: tok.text3 }}>({plan.alreadyKnown.length + answeredCount})</span></h3>
        {plan.alreadyKnown.map((k) => <div key={"k" + k.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, color: tok.text2 }}><span>{k.label}</span><span style={{ textAlign: "right" }}><b style={{ color: tok.text }}>{fmt(k.value, k.unit)}</b> {pill("question")}</span></div>)}
        {qs.filter((x) => answers[x.id] && x.kind !== "choice").map((x) => (
          <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, color: tok.text2 }}><span>{x.label}</span>
            <span style={{ textAlign: "right" }}>{answers[x.id].unknown ? pill("estimate") : <><b style={{ color: tok.text }}>{show(x.kind, answers[x.id].value)}</b> {pill("answer")}</>}</span></div>))}
        {qs.filter((x) => answers[x.id] && x.kind === "choice" && !answers[x.id].unknown).map((x) => <div key={x.id} style={{ fontSize: 13, color: tok.text3 }}>{x.label}: {String(answers[x.id].value)}</div>)}
        {plan.alreadyKnown.length + answeredCount === 0 && <div style={{ fontSize: 13.5, color: tok.text3 }}>Your answers will appear here as you go.</div>}
      </aside>
    </section>);
}
