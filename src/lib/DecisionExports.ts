// DECISION EXPORTS - one context, four purposes.
//   cockpitContext()  computes everything ONCE; the cockpit UI and every export use it,
//                     so the same canonical numbers appear everywhere.
//   PDF  = complete business report (plain language first, technical appendix last)
//   PPT  = executive decision deck (~14 slides, minimal text)
//   XLSX = auditable decision model with LIVE formulas (change an input, see the impact)
//   MD   = complete technical / audit record (nothing simplified away)
import { analyseStage, buildFullThreadMarkdown, renderDecisionMarkdown, executivePosition, type StageAnalysis } from "./BoardroomIntegrity";
import { parseResearchEvidence } from "./ContextIntelligence";
import { sourceTier } from "./DecisionIntegrity";
import { runScenario, externalFactorsFromEvidence, explainDecisionChange, planVsActual, type Actuals, type ExternalFactor } from "./DecisionCockpit";
import { explainId } from "./DecisionExperience";
import { inputsFromRegistry, compute, buildDecisionMap, decisionResponse, sensitivity, diagnose, fmt, INPUT_LABEL, DECISION_RULES, compareScenarios,
  type Inputs, type Outputs, type DecisionMap, type ScenarioState, type InputKey } from "./DecisionCockpit";
import { computeReadings, validateModel, keyNumbers, findings, whatWeDontKnow, biggestDriver, educationalGate, displayDecision, DECISION_MEANING,
  explainConfidence, actionPlan, stripIds, decisionBrief, executiveView, GLOSSARY, actionPlanFromIssues, keyNumberLine, plainThresholds, plainDecision, type Reading, type DisplayDecision, type ActionItemPlan, type ExecutiveView } from "./DecisionExperience";

export interface CockpitContext {
  analysis: StageAnalysis; question: string; inputs: Inputs; outputs: Outputs; provisional: boolean; readings: Reading[];
  map: DecisionMap; display: DisplayDecision; meaning: string; issues: ReturnType<typeof diagnose>; driver: ReturnType<typeof biggestDriver>;
  unknowns: ReturnType<typeof whatWeDontKnow>; numbers: ReturnType<typeof keyNumbers>; findings: ReturnType<typeof findings>;
  confidence: { level: string; why: string; increase: string; decrease: string }; actions: ActionItemPlan[]; validation: ReturnType<typeof validateModel>;
  gates: { gate: DecisionMap["gates"][number]; plain: ReturnType<typeof educationalGate> }[]; executives: { name: string; status: string; view: ExecutiveView }[];
  scenarios: ScenarioState[]; oneSentence: string; brief: string; alternatives: { name: string; decision: string; note: string }[];
  readingDecisions: { key: string; display: string }[]; wouldChange: string[]; keyNumber: string;
  biggestBlocker: string;
  outcomes: { kind: "bad" | "stress" | "good"; name: string; decision: string; profit: string; cash: string; failureMonth: number | null; explanation: string; because: string[] }[];
  externalFactors: ExternalFactor[]; actuals: Actuals | null; planVsActual: ReturnType<typeof planVsActual>;
  analysisIncomplete: { executives: string[]; message: string } | null;
  idNotes: Record<string, ReturnType<typeof explainId>>;
}
function applyFor(base: Inputs, s: ScenarioState): Inputs { return applyChallengesFromScenarioLocal(base, s); }
import { applyChallengesFromScenario as applyChallengesFromScenarioLocal } from "./DecisionCockpit";
export function cockpitContext(cur: any, si: number, opts: { location?: string; actuals?: Actuals | null } = {}): CockpitContext | null {
  let a: StageAnalysis; try { a = analyseStage(cur, si, { location: opts.location || "" }); } catch { return null; }
  const rs = cur?.researchState || {}; const intel = rs.intelligence || {}; const st = (cur?.stages || [])[si] || {};
  const gatesOpen = (a.userQuestions || []).filter((u) => u.status === "open").length;
  // Unconfirmed ambiguity: use the MORE CAUTIOUS reading, and say so.
  const rd = computeReadings(a.registry, a.userInputs, a.ambiguities, gatesOpen);
  const provisional = !!rd.cautious;
  const inputs = provisional ? rd.cautious!.inputs : inputsFromRegistry(a.registry);
  const outputs = compute(inputs);
  const scenarios: ScenarioState[] = Array.isArray(rs.scenarios) ? rs.scenarios : [];
  const map = buildDecisionMap({ analysis: a, inputs, intel, scenarios });
  const resp = decisionResponse({ map, base: inputs, scenario: null, priorDecision: rs.cockpitDecision || null });
  let display = displayDecision(map.decision, resp.alternatives);
  if (a.decision.confidence === "INSUFFICIENT" && display !== "STOP" && display !== "REWORK" && !provisional) display = "INSUFFICIENT EVIDENCE";

  // An UNCONFIRMED input must not drive a final verdict: if the two readings of the
  // ambiguous input lead to different decisions, the honest answer is WAIT (confirm first).
  const readingDisplays = rd.readings.map((r) => {
    const m = buildDecisionMap({ analysis: a, inputs: r.inputs, intel, scenarios });
    return { key: r.key, display: displayDecision(m.decision, decisionResponse({ map: m, base: r.inputs, scenario: null, priorDecision: null }).alternatives) };
  });
  const readingsDisagree = readingDisplays.length > 1 && new Set(readingDisplays.map((x) => x.display)).size > 1;
  if (readingsDisagree) display = "WAIT";
  const issues = diagnose(outputs);
  const driver = biggestDriver(inputs, gatesOpen);
  const unknowns = whatWeDontKnow({ ambiguities: a.ambiguities, userQuestions: a.userQuestions, gaps: intel.gaps || [], inputs, driver });
  const confidenceLevel = provisional && a.decision.confidence === "HIGH" ? "MEDIUM" : provisional && a.decision.confidence === "MEDIUM" ? "LOW" : a.decision.confidence;
  const ce = explainConfidence({ confidence: confidenceLevel, ambiguities: a.ambiguities, driver, unknowns, clusters: a.clusters });
  const actions = actionPlanFromIssues({ inputs, outputs, ambiguities: a.ambiguities, userQuestions: a.userQuestions, unknowns, clusters: a.clusters });
  if (!actions.length) actions.push(...actionPlan(map, driver, unknowns));
  // Only statements that would move the decision the user SEES are shown.
  const DRANK: Record<string, number> = { "STOP": 0, "REWORK": 0.5, "INSUFFICIENT EVIDENCE": 0.5, "WAIT": 1, "CONDITIONAL PROCEED": 2, "PROCEED": 3 };
  const wouldChange = plainThresholds(inputs, gatesOpen).filter((x) => { const m = x.match(/(improves to|drops to) ([A-Z ]+)\.$/); return !m || m[2].trim() !== display && (m[1] === "drops to" || (DRANK[m[2].trim()] ?? 0) > (DRANK[display] ?? 0)); });
  if (readingsDisagree) wouldChange.unshift("Confirming what your revenue figure means changes the answer: " + readingDisplays.map((x) => "reading " + x.key + " \u2192 " + x.display).join(", ") + ".");
  if (!wouldChange.length) wouldChange.push(outputs.missing.length ? "This cannot be calculated from current evidence (missing: " + outputs.missing.join("; ") + ")." : "No single figure changes the recommendation within \u00b150% of its current value.");
  const validation = validateModel({ user: a.userInputs, ambiguities: a.ambiguities, ambiguityChoice: a.ambiguityChoice, inputs, outputs, conflicts: a.modelConflicts,
    clusters: a.clusters.length, rawContradictions: a.contradictions.length, decision: map.decision, why: map.why, oneSentence: map.oneSentence });
  const executives = (st.debate || []).filter((d: any) => { const r = a.rows.find((x) => x.executiveId === d?.ag?.id); return r && r.included !== "excluded"; })
    .map((d: any) => ({ name: d?.ag?.t || "Executive", status: (a.rows.find((x) => x.executiveId === d?.ag?.id) || { status: "" }).status, view: executiveView(d.fullText || d.text || "") }));
  const first = issues[0] ? issues[0].issue : stripIds(map.oneSentence.replace(/^[A-Z ]+:\s*/, ""));
  const oneSentence = readingsDisagree
    ? "WAIT \u2014 do not commit money yet. Your revenue figure can be read two ways, and the answer depends on which is right: " + readingDisplays.map((x) => "reading " + x.key + " gives " + x.display).join(", ") + ". Confirm it first; meanwhile, " + first.charAt(0).toLowerCase() + first.slice(1)
    : display + " \u2014 " + DECISION_MEANING[display].replace(/\.$/, "") + ". " + first + (provisional ? " (Calculated on the more cautious reading of your revenue figure until you confirm it.)" : "");
  const keyNum = keyNumberLine(outputs) || (driver ? driver.label + ": now " + fmt(driver.current, driver.unit) : "\u2014");
  const brief = decisionBrief({ display, confidence: confidenceLevel, why: (issues.length ? issues.map((x) => x.issue) : map.why.map(stripIds)).slice(0, 3),
    risk: issues.find((x) => x.severity === "blocking")?.issue || unknowns[0]?.missing || "\u2014", keyNumber: keyNum, actions: actions.slice(0, 3).map((x) => x.action), wouldChange: wouldChange[0] });
  return { analysis: a, question: st.question || cur?.q || "", inputs, outputs, provisional, readings: rd.readings, map, display, meaning: DECISION_MEANING[display], issues, driver, unknowns,
    numbers: keyNumbers(inputs, outputs), findings: findings(inputs, outputs), confidence: { level: confidenceLevel, ...ce }, actions, validation,
    gates: map.gates.map((g) => ({ gate: g, plain: educationalGate(g, true) })), executives, scenarios, oneSentence, brief,
    alternatives: resp.alternatives.map((x) => ({ name: x.name, decision: displayDecision(x.decision), note: x.note })), readingDecisions: readingDisplays, wouldChange, keyNumber: keyNum,
    biggestBlocker: (issues.find((x) => x.severity === "blocking") || issues[0])?.issue || (unknowns[0] ? unknowns[0].missing + " \u2014 " + unknowns[0].whyMatters : "Nothing material is blocking the decision."),
    // "What happens if things go badly / well" - calculated presets, labelled simulations.
    outcomes: (outputs.revenue === null ? [] : (["downside", "stress", "upside"] as const).map((k) => {
      const r = runScenario(inputs, k, [], { parentDecisionId: String(cur?.sessionId || ""), horizonMonths: 12, openCriticalGates: gatesOpen });
      const why = explainDecisionChange(inputs, applyFor(inputs, r), r.baseDecision, r.decisionResult);
      return { kind: (k === "downside" ? "bad" : k === "stress" ? "stress" : "good") as "bad" | "stress" | "good", name: r.name, decision: plainDecision(r.decisionResult), profit: fmt(r.simulationOutputs.profit, "INR"),
        cash: fmt(r.simulationOutputs.cashStart, "INR"), failureMonth: r.projection.failureMonth, explanation: why.headline.replace(r.baseDecision, plainDecision(r.baseDecision)).replace(r.decisionResult, plainDecision(r.decisionResult)), because: why.because.slice(0, 3) };
    })),
    externalFactors: externalFactorsFromEvidence(parseResearchEvidence(String(cur?.researchBrief || "")) as any, sourceTier),
    actuals: opts.actuals || null, planVsActual: planVsActual(outputs, null, opts.actuals || null),
    // Provider failures never become business conclusions: one plain sentence; details stay in Advanced.
    analysisIncomplete: (() => { const bad = (st.debate || []).filter((d: any) => ["FAILED", "PROVIDER_LIMIT", "CONTEXT_LIMIT"].includes(d?.status)).map((d: any) => d?.ag?.t || "Executive");
      return bad.length ? { executives: bad, message: "Some analysis could not be completed (" + bad.join(", ") + "). The decision uses the executives who did complete; open Advanced for diagnostics." } : null; })(),
    idNotes: Object.fromEntries([...(intel.gaps || []).map((g: any) => g.id), ...(a.userQuestions || []).map((u: any) => u.id)].filter(Boolean).map((id: string) => [id, explainId(id, { gaps: intel.gaps || [], userQuestions: a.userQuestions || [] })])) };
}

// ── PDF: complete decision report (spec order; plain language, audit appendix last) ──
export function businessReportMarkdown(cur: any, si: number, ctx: CockpitContext, company = ""): string {
  const L: string[] = []; const sec = (t: string) => L.push("", "## " + t, "");
  const g = (k: string) => (GLOSSARY as any)[k];
  L.push("# Decision Report", "", "**" + (company ? company + " \u2014 " : "") + ctx.question + "**", "", "_Prepared " + new Date().toLocaleDateString("en-IN") + ". A decision aid, not a guarantee. Labels: FACT (retrieved evidence), USER INPUT, ASSUMPTION, CALCULATION, SIMULATION, ACTUAL RESULT._");
  sec("1. Executive decision"); L.push("**" + ctx.display + "** \u2014 confidence " + ctx.confidence.level, "", ctx.oneSentence, "", "_Confidence:_ " + ctx.confidence.why + " _What would increase it:_ " + ctx.confidence.increase);
  if (!ctx.validation.ok) L.push("", "> **Model validation required:** " + ctx.validation.checks.filter((c) => !c.pass).map((c) => c.name).join("; "));
  if (ctx.analysisIncomplete) L.push("", "> " + ctx.analysisIncomplete.message);
  sec("2. Plain-English summary"); L.push("**Why:**", ...(ctx.issues.length ? ctx.issues.map((x) => "- " + x.issue) : ctx.map.why.map((w) => "- " + stripIds(w))), "", "**The biggest thing holding you back:** " + ctx.biggestBlocker, "", "_What this decision means:_ " + ctx.meaning);
  if (ctx.provisional && ctx.readings.length) { L.push("", "**Input that needs your confirmation** \u2014 your revenue figure can be read two ways:", "", "| Reading | Revenue / month | Profit / month | Decision |", "|---|---|---|---|",
    ...ctx.readings.map((r) => "| " + r.label + " | " + fmt(r.outputs.revenue, "INR") + " | " + fmt(r.outputs.profit, "INR") + " | " + ((ctx.readingDecisions.find((x) => x.key === r.key) || { display: "" }).display) + " |")); }
  sec("3. Decision map"); L.push("Question \u2192 **" + ctx.display + "** \u2192 gates: " + ctx.gates.map((x, i) => "Gate " + (i + 1) + " " + x.gate.status).join(", ") + " \u2192 what must be proven \u2192 Time Machine \u2192 Autopilot \u2192 " + (ctx.display === "PROCEED" ? "SCALE" : ctx.display === "CONDITIONAL PROCEED" ? "PILOT" : ctx.display === "STOP" ? "STOP" : "WAIT / REWORK"));
  sec("4. Key numbers"); L.push("| Number | Value | What it means | Compared with | Impact |", "|---|---|---|---|---|", ...ctx.numbers.map((n) => "| " + n.label + " | " + n.value + " | " + n.meaning + " | " + n.comparison + " | " + n.impact + " |"));
  for (const f of ctx.findings) L.push("", "**" + f.finding + "** \u2014 _So what?_ " + f.soWhat + " _Impact:_ " + f.impact + " _What to do:_ " + f.whatToDo);
  sec("5. Decision gates"); for (const x of ctx.gates) L.push("**" + x.plain.title + "** \u2014 " + x.gate.status, "- What we need: " + x.plain.need + (x.plain.why ? " \u00b7 Why: " + x.plain.why : ""), "- Pass: " + x.gate.threshold + " \u00b7 Now: " + x.gate.current + " \u00b7 Owner: " + x.gate.owner, "- If it passes: " + x.gate.ifPass + " \u00b7 If it fails: " + x.gate.ifFail, "");
  sec("6. Key risks"); L.push(...ctx.issues.map((x) => "- [" + x.severity + "] " + x.issue), ...ctx.analysis.clusters.map((c) => "- Executive disagreement \u2014 " + c.label + ": " + c.whyDisagree + " _Resolved by:_ " + c.whatResolves), ...ctx.unknowns.slice(0, 5).map((u) => "- Unknown: " + u.missing + " \u2014 " + u.whyMatters));
  sec("7. Scenario analysis (SIMULATION \u2014 NOT A FORECAST)");
  if (ctx.outcomes.length) L.push("| Scenario | Decision | Profit / month | Cash at start | Cash runs out | What changed |", "|---|---|---|---|---|---|", ...ctx.outcomes.map((o) => "| " + o.name + " | " + o.decision + " | " + o.profit + " | " + o.cash + " | " + (o.failureMonth === null ? "not within 12 months" : "month " + o.failureMonth) + " | " + o.explanation + " |"));
  if (ctx.scenarios.length) { const cmp = compareScenarios(ctx.scenarios.slice(-4)); L.push("", "Scenarios you tested:", "", "| Metric | " + ctx.scenarios.slice(-4).map((x) => x.name).join(" | ") + " |", "|---|" + ctx.scenarios.slice(-4).map(() => "---|").join(""), ...cmp.map((r) => "| " + r.metric + " | " + r.values.join(" | ") + " |")); }
  if (!ctx.outcomes.length && !ctx.scenarios.length) L.push("Scenarios need revenue and cost figures; they cannot be calculated yet.");
  sec("8. External factors"); L.push(...(ctx.externalFactors.length ? ctx.externalFactors.map((e) => "- **" + e.category + "** (" + (e.verified ? "FACT \u2014 retrieved source" : "ASSUMPTION \u2014 not verified") + "): " + e.text + " \u2014 affects " + (e.affectedVariable || "context") + ", direction " + e.direction + "; magnitude " + e.impactRange + ".") : ["No external factors were identified in the research."]));
  sec("9. What could change the decision"); L.push(...ctx.wouldChange.map((w) => "- " + w));
  sec("10. Recommended actions"); L.push("| Action | Owner | Deadline | Success | If it fails | Escalation |", "|---|---|---|---|---|---|", ...ctx.actions.map((x) => "| " + x.action + " | " + x.owner + " | " + x.deadline + " | " + x.success + " | " + x.fail + " | " + x.escalation + " |"));
  if (ctx.actuals) { L.push("", "**Plan vs actual** (ACTUAL RESULT from your General Ledger, " + ctx.actuals.from + " to " + ctx.actuals.to + "):", "", "| Metric | Expected | Actual |", "|---|---|---|", ...ctx.planVsActual.map((r) => "| " + r.metric + " | " + r.expected + " | " + r.actual + " |")); }
  sec("11. Evidence summary"); { const s = ctx.analysis.support; L.push("- Confirmed by a retrieved source: " + s.SUPPORTED, "- Partly supported: " + s.PARTIALLY_SUPPORTED, "- Disputed by research: " + s.CONTRADICTED, "- Assumptions / estimates: " + (s.ASSUMED + s.ESTIMATED), "- Unverified: " + s.UNVERIFIED + (s.modelAsserted ? " (" + s.modelAsserted + " labelled 'verified' by a model without evidence)" : "")); }
  sec("12. Technical / audit appendix");
  L.push("### Glossary of terms used", "", ...["breakEven", "contributionMargin", "ebitda", "capex", "opex", "workingCapital", "dso", "utilisation", "interestCoverage", "dscr", "runway", "payback", "evidenceGap", "decisionGate"].filter((k) => g(k)).map((k) => "- **" + g(k).term + "** \u2014 " + g(k).what + " " + g(k).why + (g(k).healthy ? " _Healthy:_ " + g(k).healthy : "")), "");
  if (Object.keys(ctx.idNotes).length) L.push("### Internal references", "", ...Object.values(ctx.idNotes).map((n) => "- **" + n.id + "** (" + n.kind + "): " + (n.missing ? n.missing + " " : "") + (n.ifUnresolved || n.why)), "");
  L.push("### Canonical model", "", "| Input | Value | Label | Source |", "|---|---|---|---|", ...Object.entries(ctx.inputs).map(([k, v]) => "| " + (INPUT_LABEL as any)[k]?.label + " | " + fmt(v!.value, (INPUT_LABEL as any)[k]?.unit) + " | " + v!.label + " | " + v!.source + " |"), "",
    "### Validation checks", "", ...ctx.validation.checks.map((c) => "- " + (c.pass ? "PASS" : "FAIL") + " \u2014 " + c.name + (c.detail ? " (" + c.detail + ")" : "")), "",
    "### Decision rules", "", "- Revenue below " + DECISION_RULES.doNotProceedBelowBreakEvenRatio * 100 + "% of break-even, or funding short: REWORK if a changed plan works, otherwise STOP.", "- Below break-even, operating cash under " + DECISION_RULES.minDSCR + "\u00d7 loan payments, or under " + DECISION_RULES.minimumRunwayMonths + " months of cash while losing money: WAIT.", "- Under " + DECISION_RULES.proceedMarginOfSafety * 100 + "% headroom, or open conditions: CONDITIONAL PROCEED.", "");
  try { L.push(renderDecisionMarkdown(ctx.analysis)); } catch { /* best-effort */ }
  return L.join("\n");
}

// ── PPT: executive story (11 slides) ────────────────────────────────────────
export function deckMarkdown(ctx: CockpitContext, company = ""): string {
  const S: string[] = []; let n = 0; const slide = (t: string, ...b: string[]) => S.push("## Slide " + (++n) + " \u2014 " + t, ...b.filter(Boolean).slice(0, 5).map((x) => "- " + x), "");
  S.push("FORMAT INSTRUCTION: one slide per '## Slide' heading; short bullets; use EXACTLY these numbers (canonical model) \u2014 do not recalculate, re-round or invent figures. Label simulations as SIMULATION.", "");
  slide("Executive decision", (company ? company + ": " : "") + ctx.question, ctx.display + " (confidence " + ctx.confidence.level + ")", ctx.meaning);
  slide("The opportunity", ...ctx.executives.slice(0, 3).map((e) => e.name + ": " + e.view.view.slice(0, 160)));
  slide("Why this decision", ...(ctx.issues.length ? ctx.issues.map((x) => x.issue) : ctx.map.why.map(stripIds)));
  slide("Key economics", ...ctx.numbers.slice(0, 5).map((k) => k.label + ": " + k.value));
  slide("Major risks", ctx.biggestBlocker, ...ctx.analysis.clusters.slice(0, 2).map((c) => c.label + ": " + c.whyDisagree), ...ctx.unknowns.slice(0, 2).map((u) => u.missing));
  slide("Decision gates", ...ctx.gates.slice(0, 5).map((x) => x.plain.title + " \u2014 " + x.gate.status));
  slide("Scenario comparison (SIMULATION)", ...(ctx.outcomes.length ? ctx.outcomes.map((o) => o.name + ": " + o.decision + ", profit " + o.profit + "/month") : ["Scenarios need revenue and cost figures"]));
  slide("Downside / stress case (SIMULATION)", ...ctx.outcomes.filter((o) => o.kind !== "good").map((o) => o.explanation), ...ctx.outcomes.filter((o) => o.kind === "stress").flatMap((o) => o.because));
  slide("Recommended action", ctx.oneSentence, ...ctx.alternatives.slice(0, 2).map((a) => "Alternative: " + a.name + " \u2192 " + a.decision));
  slide("Next steps", ...ctx.actions.slice(0, 5).map((x) => x.action + " \u2014 " + x.owner + ", " + x.deadline));
  slide("Appendix: what would change the decision", ...ctx.wouldChange.slice(0, 4), ctx.confidence.increase);
  return S.join("\n");
}

// ── EXCEL: auditable decision model with LIVE formulas ──────────────────────
// Inputs are values; every derived number is an Excel formula that mirrors
// DecisionCockpit.compute() exactly, so changing an input recalculates everything.
const ORDER: InputKey[] = ["equity", "debt", "funding", "capex", "interestRate", "loanTenure", "utilisation", "revenueFull", "revenue", "price", "volume", "dayRate", "billableDays", "headcount",
  "contributionMargin", "variableCostPct", "fixedCost", "dso", "cac"];
export async function buildExcelModel(ExcelJS: any, ctx: CockpitContext, company = ""): Promise<any> {
  const wb = new ExcelJS.Workbook(); wb.creator = "OrchestrIQ"; wb.created = new Date();
  const INPUT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } }, CALC_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1FF" } };
  const head = (ws: any, cols: string[]) => { const r = ws.addRow(cols); r.font = { bold: true }; ws.columns = cols.map((c, i) => ({ key: "c" + i, width: i === 0 ? 38 : 22 })); return r; };
  const dash = wb.addWorksheet("Executive Summary");
  const inp = wb.addWorksheet("User Inputs"); const canon = wb.addWorksheet("Canonical Model"); const asm = wb.addWorksheet("Assumptions");
  const calc = wb.addWorksheet("Calculations");
  // INPUTS: one row per input; cell refs recorded for formulas.
  head(inp, ["Input", "Value", "Unit", "Type", "Source"]);
  const ref: Partial<Record<InputKey, string>> = {};
  for (const k of ORDER) {
    const v = ctx.inputs[k]; if (!v) continue;
    const isFunding = k === "funding" && ctx.inputs.equity && ctx.inputs.debt;
    const row = inp.addRow([INPUT_LABEL[k].label, isFunding ? null : v.value, INPUT_LABEL[k].unit, isFunding ? "CALCULATED" : v.label === "User Input" ? "INPUT" : v.label === "Retrieved Evidence" ? "EXTERNAL EVIDENCE" : "ASSUMPTION", v.source]);
    ref[k] = "'User Inputs'!$B$" + row.number;
    row.getCell(2).fill = isFunding ? CALC_FILL : INPUT_FILL;
    if (isFunding) row.getCell(2).value = { formula: ref.equity!.replace("'User Inputs'!", "") + "+" + ref.debt!.replace("'User Inputs'!", "") };
  }
  inp.addRow([]); inp.addRow(["Yellow = change me (input or assumption). Blue = calculated. Every sheet recalculates from these cells."]);
  const R = (k: InputKey) => ref[k] || "0"; const has = (k: InputKey) => !!ref[k];
  // CALCULATIONS: formulas mirroring compute()
  head(calc, ["Metric", "Value", "Unit", "Formula (plain)"]);
  const cref: Record<string, string> = {};
  const crow = (key: string, label: string, formula: string, unit: string, plain: string) => {
    const r = calc.addRow([label, { formula }, unit, plain]); r.getCell(2).fill = CALC_FILL; cref[key] = "Calculations!$B$" + r.number; return r; };
  const revenueF = has("price") && has("volume") ? R("price") + "*" + R("volume")
    : has("dayRate") && has("billableDays") && has("headcount") && has("utilisation") ? R("dayRate") + "*" + R("billableDays") + "*" + R("headcount") + "*" + R("utilisation") + "/100"
    : has("revenueFull") && has("utilisation") ? R("revenueFull") + "*" + R("utilisation") + "/100" : has("revenue") ? R("revenue") : "NA()";
  crow("revenue", "Monthly revenue", revenueF, "INR", has("revenueFull") ? "revenue at full capacity \u00d7 occupancy" : "from inputs");
  crow("cm", "Contribution margin %", has("contributionMargin") ? R("contributionMargin") : has("variableCostPct") ? "100-" + R("variableCostPct") : "NA()", "%", "100% \u2212 variable cost %");
  crow("contribution", "Monthly contribution", cref.revenue + "*" + cref.cm + "/100", "INR", "revenue \u00d7 margin");
  crow("fixed", "Monthly fixed cost", has("fixedCost") ? R("fixedCost") : "NA()", "INR", "input");
  crow("ebitda", "Operating cash (EBITDA) / month", cref.contribution + "-" + cref.fixed, "INR", "contribution \u2212 fixed cost");
  crow("interest", "Interest / month", has("debt") && has("interestRate") ? R("debt") + "*" + R("interestRate") + "/100/12" : "0", "INR", "debt \u00d7 rate \u00f7 12");
  crow("principal", "Principal repayment / month", has("debt") && has("loanTenure") ? "IF(" + R("loanTenure") + ">0," + R("debt") + "/" + R("loanTenure") + ",0)" : "0", "INR", "debt \u00f7 tenure (0 if tenure not given)");
  crow("debtService", "Debt service / month", cref.interest + "+" + cref.principal, "INR", "interest + principal");
  crow("profit", "Profit after interest / month", cref.ebitda + "-" + cref.interest, "INR", "EBITDA \u2212 interest");
  crow("cover", "Interest coverage (\u00d7)", "IF(" + cref.interest + ">0," + cref.ebitda + "/" + cref.interest + ",\"n/a\")", "x", "EBITDA \u00f7 interest");
  crow("dscr", "DSCR (\u00d7)", "IF(" + cref.principal + ">0," + cref.ebitda + "/" + cref.debtService + ",\"needs loan tenure\")", "x", "EBITDA \u00f7 debt service");
  crow("breakEven", "Break-even revenue / month", "(" + cref.fixed + "+" + cref.interest + ")/(" + cref.cm + "/100)", "INR", "(fixed + interest) \u00f7 margin");
  crow("mos", "Headroom above break-even", "(" + cref.revenue + "-" + cref.breakEven + ")/" + cref.breakEven, "%", "(revenue \u2212 break-even) \u00f7 break-even");
  crow("wc", "Working capital tied up (receivables)", has("dso") ? cref.revenue + "*" + R("dso") + "/30" : "0", "INR", "revenue \u00d7 DSO \u00f7 30");
  crow("cashStart", "Cash left at start", has("funding") ? R("funding") + "-" + (has("capex") ? R("capex") : "0") + "-" + cref.wc : "NA()", "INR", "funding \u2212 capex \u2212 working capital");
  crow("cashFlow", "Cash flow after debt service / month", cref.ebitda + "-" + cref.debtService, "INR", "EBITDA \u2212 debt service");
  calc.getColumn(2).numFmt = "#,##0.00";
  // CANONICAL MODEL + ASSUMPTIONS
  head(canon, ["Input", "Value", "Unit", "Status", "Source", "Your original words"]);
  for (const u of ctx.analysis.userInputs) canon.addRow([u.label, u.value, u.unit, u.ambiguous ? "AMBIGUOUS" : u.sourceType === "user" ? "INPUT (you)" : "CALCULATED", u.source, u.originalText || ""]);
  for (const c of ctx.analysis.modelConflicts) canon.addRow(["MODEL CONFLICT: " + c.label, fmt(c.otherValue, c.unit), "", "DISPUTED", c.by, "your value kept: " + fmt(c.userValue, c.unit)]);
  head(asm, ["Assumption / estimate", "Made by", "Status"]);
  for (const c of ctx.analysis.claims.filter((x) => x.support === "ASSUMED" || x.support === "ESTIMATED")) asm.addRow([stripIds(c.text), c.executive, c.support === "ASSUMED" ? "ASSUMED" : "ESTIMATED"]);
  if (ctx.provisional) for (const r of ctx.readings) asm.addRow(["Revenue reading " + r.key + ": " + r.label, "You (unconfirmed)", "AMBIGUOUS \u2014 workbook uses the more cautious reading"]);
  // REVENUE / COST / DEBT / WORKING CAPITAL views (formula links, no copies)
  const linkSheet = (name: string, rows: [string, string][]) => { const ws = wb.addWorksheet(name); head(ws, ["Metric", "Value"]); for (const [l, k] of rows) { const r = ws.addRow([l, { formula: cref[k] }]); r.getCell(2).fill = CALC_FILL; r.getCell(2).numFmt = "#,##0.00"; } return ws; };
  linkSheet("Revenue Model", [["Monthly revenue", "revenue"], ["Contribution margin %", "cm"], ["Monthly contribution", "contribution"]]);
  linkSheet("Cost Model", [["Monthly fixed cost", "fixed"], ["Operating cash (EBITDA)", "ebitda"], ["Break-even revenue", "breakEven"]]);
  linkSheet("Debt & DSCR", [["Interest / month", "interest"], ["Principal / month", "principal"], ["Debt service / month", "debtService"], ["Interest coverage", "cover"], ["DSCR", "dscr"], ["Profit after interest", "profit"]]);
  linkSheet("Working Capital", [["Working capital tied up", "wc"], ["Cash left at start", "cashStart"], ["Cash flow after debt service", "cashFlow"]]);
  // SENSITIVITY: the biggest driver swept with live formulas (or occupancy if present)
  const sens = wb.addWorksheet("Sensitivity Analysis");
  const sv: InputKey | null = has("utilisation") && (has("revenueFull") || has("dayRate")) ? "utilisation" : has("volume") ? "volume" : null;
  if (sv) {
    head(sens, [INPUT_LABEL[sv].label, "Revenue / month", "Profit after interest / month", "Interest coverage (\u00d7)"]);
    const base = ctx.inputs[sv]!.value; const steps = sv === "utilisation" ? [30, 40, 50, 60, 65, 70, 80, 90, 100] : [0.5, 0.7, 0.85, 1, 1.15, 1.3].map((f) => Math.round(base * f));
    for (const x of steps) {
      const revX = sv === "utilisation" ? (has("revenueFull") ? R("revenueFull") + "*A{r}/100" : R("dayRate") + "*" + R("billableDays") + "*" + R("headcount") + "*A{r}/100") : R("price") + "*A{r}";
      const r = sens.addRow([x, null, null, null]); const rr = String(r.number);
      r.getCell(2).value = { formula: revX.split("{r}").join(rr) };
      r.getCell(3).value = { formula: "B" + rr + "*" + cref.cm + "/100-" + cref.fixed + "-" + cref.interest };
      r.getCell(4).value = { formula: "IF(" + cref.interest + ">0,(B" + rr + "*" + cref.cm + "/100-" + cref.fixed + ")/" + cref.interest + ",\"n/a\")" };
      [2, 3, 4].forEach((c) => (r.getCell(c).fill = CALC_FILL));
    }
  } else sens.addRow(["No volume or occupancy input to sweep; change values on 'User Inputs' to test sensitivity."]);
  // SCENARIOS (saved simulation results - values, clearly labelled)
  const sc = wb.addWorksheet("Scenario Analysis"); head(sc, ["Metric", ...ctx.scenarios.slice(-4).map((s) => s.name + " (SIMULATION)")]);
  for (const row of compareScenarios(ctx.scenarios.slice(-4))) sc.addRow([row.metric, ...row.values]);
  if (!ctx.scenarios.length) sc.addRow(["No scenarios saved yet \u2014 run them in the Decision Cockpit."]);
  const gt = wb.addWorksheet("Decision Gates"); head(gt, ["Gate", "Status", "What we need", "Pass threshold", "Current", "If pass", "If fail", "Owner"]);
  for (const g of ctx.gates) gt.addRow([g.plain.title, g.gate.status, g.plain.need, g.gate.threshold, g.gate.current, g.gate.ifPass, g.gate.ifFail, g.gate.owner]);
  const ev = wb.addWorksheet("Evidence Register"); head(ev, ["Claim", "Executive", "Status", "Evidence", "Source"]);
  const plainStatus: Record<string, string> = { SUPPORTED: "CONFIRMED", PARTIALLY_SUPPORTED: "PARTLY CONFIRMED", CONTRADICTED: "DISPUTED", UNVERIFIED: "ASSUMED (unverified)", INFERRED: "ASSUMED (inference)", ASSUMED: "ASSUMED", ESTIMATED: "ESTIMATED", UNSUPPORTED: "MISSING" };
  for (const c of ctx.analysis.claims) ev.addRow([stripIds(c.text), c.executive, plainStatus[c.support] || c.support, c.evidenceRefs.join(","), c.sourceUrl]);
  const rk = wb.addWorksheet("Risks"); head(rk, ["Risk / issue", "Severity"]);
  for (const x of ctx.issues) rk.addRow([x.issue, x.severity]); for (const c of ctx.analysis.clusters) rk.addRow(["Executive disagreement \u2014 " + c.label + ": " + c.whyDisagree, c.severity]);
  const ac = wb.addWorksheet("Actions"); head(ac, ["Action", "Owner", "Deadline", "Why", "Success", "If it fails", "Escalation"]);
  for (const x of ctx.actions) ac.addRow([x.action, x.owner, x.deadline, x.why, x.success, x.fail, x.escalation]);
  // ACTUAL vs PLAN: actual results stay in their own column - never mixed with simulations.
  const ava = wb.addWorksheet("Actual vs Plan"); head(ava, ["Metric", "Expected (plan)", "Actual (General Ledger)", "Note"]);
  if (ctx.actuals) for (const r of ctx.planVsActual) ava.addRow([r.metric, r.expected, r.actual, "ACTUAL RESULT " + ctx.actuals.from + " to " + ctx.actuals.to]);
  else ava.addRow(["No General Ledger entries in the last 30 days.", "", "", "Post journal entries in the Ledger to compare plan with actual."]);
  const xf = wb.addWorksheet("External Factors"); head(xf, ["Category", "What changed", "Affects", "Direction", "Magnitude", "Status", "Source"]);
  for (const e of ctx.externalFactors) xf.addRow([e.category, e.text, e.affectedVariable || "context", e.direction, e.impactRange, e.verified ? "FACT (retrieved)" : "ASSUMPTION", e.source]);
  const so = wb.addWorksheet("Sources"); head(so, ["Source", "URL"]);
  for (const c of ctx.analysis.claims.filter((x) => x.sourceUrl)) so.addRow([c.sourceIds.join(","), c.sourceUrl]);
  // DASHBOARD (formula links so it updates with inputs)
  head(dash, ["OrchestrIQ decision model", ""]);
  dash.addRow(["Question", ctx.question]); dash.addRow(["Decision (at export)", ctx.display + " \u2014 confidence " + ctx.confidence.level]); dash.addRow(["One-line answer", ctx.oneSentence]); dash.addRow([]);
  for (const [l, k] of [["Monthly revenue", "revenue"], ["Profit after interest / month", "profit"], ["Break-even revenue / month", "breakEven"], ["Interest coverage (\u00d7)", "cover"], ["Cash left at start", "cashStart"]] as [string, string][]) {
    const r = dash.addRow([l, { formula: cref[k] }]); r.getCell(2).fill = CALC_FILL; r.getCell(2).numFmt = "#,##0.00"; }
  dash.addRow([]); dash.addRow(["Change the yellow cells on 'User Inputs'; these figures recalculate. The decision text above is a snapshot from the Boardroom."]);
  return wb;
}

// ── MD: complete technical / audit record ───────────────────────────────────
export function auditMarkdown(cur: any, ctx: CockpitContext | null): string {
  const L: string[] = [buildFullThreadMarkdown(cur)];
  if (ctx) {
    L.push("", "---", "", "## Canonical input record", "", "| ID | Label | Value | Unit | Source | Type | User-provided | Verified | Ambiguous | Interpretation | Original text |", "|---|---|---|---|---|---|---|---|---|---|---|",
      ...ctx.analysis.userInputs.map((u) => "| " + [u.id, u.label, u.value, u.unit, u.source, u.sourceType, u.userProvided, u.verified, u.ambiguous, u.interpretation, String(u.originalText || "").replace(/\|/g, "/").slice(0, 120)].join(" | ") + " |"));
    if (ctx.readings.length) L.push("", "## Input ambiguity", "", ...ctx.readings.map((r) => "- Reading " + r.key + ": " + r.label + " \u2192 revenue " + fmt(r.outputs.revenue, "INR") + ", profit " + fmt(r.outputs.profit, "INR") + ", decision " + r.decision));
    if (ctx.analysis.modelConflicts.length) L.push("", "## Model conflicts", "", ...ctx.analysis.modelConflicts.map((c) => "- " + c.label + ": your value " + fmt(c.userValue, c.unit) + " kept; " + c.by + " stated " + fmt(c.otherValue, c.unit)));
    L.push("", "## Validation checks", "", ...ctx.validation.checks.map((c) => "- " + (c.pass ? "PASS" : "FAIL") + " " + c.id + ". " + c.name + (c.detail ? " \u2014 " + c.detail : "")));
    L.push("", "## Contradiction clusters (" + ctx.analysis.clusters.length + " from " + ctx.analysis.contradictions.length + " raw records)", "", ...ctx.analysis.clusters.map((c) => "- " + c.label + " [" + c.severity + ", " + c.status + "] " + c.parties.join(" vs ") + " \u2014 " + c.whyDisagree + " | resolves: " + c.whatResolves + " | ids: " + c.ids.join(",")));
    L.push("", "## Diagnosis", "", ...ctx.issues.map((x) => "- [" + x.severity + "] " + x.issue), "", "## Action plan", "", ...ctx.actions.map((x) => "- " + x.action + " | " + x.owner + " | " + x.deadline + " | success: " + x.success + " | fail: " + x.fail + " | escalate: " + x.escalation));
    const rs = cur?.researchState || {};
    L.push("", "## Decision", "", "- Decision: " + ctx.display + " | confidence: " + ctx.confidence.level + " | " + ctx.confidence.why, "- One-line answer: " + ctx.oneSentence, "- Biggest blocker: " + ctx.biggestBlocker);
    if (ctx.analysisIncomplete) L.push("- " + ctx.analysisIncomplete.message);
    L.push("", "## Decision gates", "", ...ctx.gates.map((x) => "- " + x.gate.status + " | " + x.plain.title + " | threshold: " + x.gate.threshold + " | now: " + x.gate.current + " | owner: " + x.gate.owner));
    L.push("", "## Calculated outcomes (SIMULATION)", "", ...ctx.outcomes.map((o) => "- " + o.name + ": " + o.decision + ", profit " + o.profit + ", cash " + o.cash + " | " + o.explanation + (o.because.length ? " | " + o.because.join(" / ") : "")));
    L.push("", "## User challenges", "", ...((rs.challenges || []) as any[]).map((c) => "- " + c.name + " [" + c.category + "; " + (c.change === null ? "magnitude uncertain" : c.change + " " + c.unit) + "]"));
    L.push("", "## External factors", "", ...ctx.externalFactors.map((e) => "- " + e.category + " | " + (e.verified ? "FACT" : "ASSUMPTION") + " | " + e.text + " | affects " + (e.affectedVariable || "context") + " | " + e.direction + " | " + e.source));
    L.push("", "## Autopilot responses", "", ...((rs.decisionResponses || []) as any[]).map((r) => "- " + (r.at || "") + " | " + r.currentState + " | action: " + r.recommendedAction + " | trigger: " + r.trigger + " | stop: " + r.stopCondition + " | escalate: " + r.escalationCondition));
    if (ctx.actuals) L.push("", "## Plan vs actual (ACTUAL RESULT, General Ledger " + ctx.actuals.from + " to " + ctx.actuals.to + ")", "", ...ctx.planVsActual.map((r) => "- " + r.metric + ": expected " + r.expected + " | actual " + r.actual));
    L.push("", "## Internal references explained", "", ...Object.values(ctx.idNotes).map((n) => "- " + n.id + " (" + n.kind + "): " + n.what + (n.missing ? " Missing: " + n.missing : "")));
    L.push("", "## Glossary", "", ...Object.values(GLOSSARY).map((g) => "- **" + g.term + "**: " + g.what + " " + g.why + (g.healthy ? " Healthy: " + g.healthy : "")));
  }
  return L.join("\n");
}
