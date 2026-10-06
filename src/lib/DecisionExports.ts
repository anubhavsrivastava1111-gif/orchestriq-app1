// DECISION EXPORTS - one context, four purposes.
//   cockpitContext()  computes everything ONCE; the cockpit UI and every export use it,
//                     so the same canonical numbers appear everywhere.
//   PDF  = complete business report (plain language first, technical appendix last)
//   PPT  = executive decision deck (~14 slides, minimal text)
//   XLSX = auditable decision model with LIVE formulas (change an input, see the impact)
//   MD   = complete technical / audit record (nothing simplified away)
import { analyseStage, buildFullThreadMarkdown, renderDecisionMarkdown, executivePosition, type StageAnalysis } from "./BoardroomIntegrity";
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
}
export function cockpitContext(cur: any, si: number, opts: { location?: string } = {}): CockpitContext | null {
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
    alternatives: resp.alternatives.map((x) => ({ name: x.name, decision: displayDecision(x.decision), note: x.note })), readingDecisions: readingDisplays, wouldChange, keyNumber: keyNum };
}

// ── PDF: complete business report ───────────────────────────────────────────
export function businessReportMarkdown(cur: any, si: number, ctx: CockpitContext, company = ""): string {
  const L: string[] = [];
  const sec = (t: string) => L.push("", "## " + t, "");
  L.push("# Decision Report", "", "**" + (company ? company + " \u2014 " : "") + ctx.question + "**", "", "_Prepared " + new Date().toLocaleDateString("en-IN") + ". A decision aid, not a guarantee: figures marked as assumptions or simulations are not facts._");
  sec("1. Executive decision"); L.push("**" + ctx.display + "** (confidence: " + ctx.confidence.level + ")", "", ctx.oneSentence, "", "_What this decision means:_ " + ctx.meaning);
  if (!ctx.validation.ok) L.push("", "> **Model validation required:** " + ctx.validation.checks.filter((c) => !c.pass).map((c) => c.name + (c.detail ? " (" + c.detail + ")" : "")).join("; "));
  sec("2. One-page summary"); L.push("**Why**", ...(ctx.issues.length ? ctx.issues.map((x) => "- " + x.issue) : ctx.map.why.map((w) => "- " + stripIds(w))), "",
    "**Biggest decision driver:** " + (ctx.driver ? ctx.driver.label + " \u2014 now " + fmt(ctx.driver.current, ctx.driver.unit) + (ctx.driver.required !== null ? ", needs " + fmt(ctx.driver.required, ctx.driver.unit) + " (" + ctx.driver.gap + ")" : "") : "not calculable from current inputs"), "",
    "**What to do now**", ...ctx.actions.slice(0, 5).map((x, i) => (i + 1) + ". " + x.action), "", "**What would change the answer:** " + (ctx.wouldChange[0] || "\u2014"));
  if (ctx.provisional && ctx.readings.length) {
    sec("3. Input that needs your confirmation");
    L.push("Your revenue figure can be read two ways, and the two readings give different results:", "", "| Reading | Revenue / month | Profit / month | Decision |", "|---|---|---|---|",
      ...ctx.readings.map((r) => "| " + r.label + " | " + fmt(r.outputs.revenue, "INR") + " | " + fmt(r.outputs.profit, "INR") + " | " + ((ctx.readingDecisions.find((x) => x.key === r.key) || { display: displayDecision(r.decision) }).display) + " |"), "", "Figures elsewhere in this report use the more cautious reading until you confirm.");
  }
  sec("4. What this means for the business"); for (const f of ctx.findings) L.push("**" + f.finding + "**  ", "_So what?_ " + f.soWhat + "  ", "_Business impact:_ " + f.impact + "  ", "_What to do:_ " + f.whatToDo, "");
  sec("5. Key numbers"); L.push("| Number | Value | What it means | Compared with | Impact |", "|---|---|---|---|---|", ...ctx.numbers.map((n) => "| " + n.label + " | " + n.value + " | " + n.meaning + " | " + n.comparison + " | " + n.impact + " |"));
  sec("6. What the executives think"); for (const e of ctx.executives) L.push("**" + e.name + "** \u2014 " + e.view.view, ...(e.view.worried.length ? ["_Worried about:_ " + e.view.worried.join("; ")] : []), ...(e.view.wantsVerified.length ? ["_Wants verified:_ " + e.view.wantsVerified.join("; ")] : []), "_Impact on your decision:_ " + (e.view.impact || "\u2014"), "");
  sec("7. Where the executives disagree"); L.push(...(ctx.analysis.clusters.length ? ctx.analysis.clusters.map((c) => "- **" + c.label + "** (" + c.status + "): " + c.parties.join(", ") + " \u2014 " + c.whyDisagree + " _Resolved by:_ " + c.whatResolves) : ["No material disagreements."]));
  sec("8. Decision gates"); for (const g of ctx.gates) L.push("**" + g.plain.title + "** \u2014 " + g.gate.status, "- What we need: " + g.plain.need, "- Why: " + g.plain.why, "- Pass: " + g.gate.threshold + " \u00b7 Now: " + g.gate.current, "- If it passes: " + g.gate.ifPass + " \u00b7 If it fails: " + g.gate.ifFail, "");
  sec("9. What we don't know yet"); for (const u of ctx.unknowns) L.push("**" + u.missing + "**  ", "Why it matters: " + u.whyMatters + "  ", "How to verify: " + u.howToVerify + "  ", "Decision impact: " + u.decisionImpact, "");
  sec("10. Scenarios tested (simulations, not forecasts)");
  if (ctx.scenarios.length) { const cmp = compareScenarios(ctx.scenarios.slice(-4)); L.push("| Metric | " + ctx.scenarios.slice(-4).map((s) => s.name).join(" | ") + " |", "|---|" + ctx.scenarios.slice(-4).map(() => "---|").join(""), ...cmp.map((r) => "| " + r.metric + " | " + r.values.join(" | ") + " |")); }
  else L.push("No scenarios have been run yet.");
  sec("11. Next actions"); L.push("| Action | Owner | Deadline | Success | If it fails | Escalation |", "|---|---|---|---|---|---|", ...ctx.actions.map((x) => "| " + x.action + " | " + x.owner + " | " + x.deadline + " | " + x.success + " | " + x.fail + " | " + x.escalation + " |"));
  sec("12. Confidence"); L.push("**" + ctx.confidence.level + "** \u2014 " + ctx.confidence.why, "", "_What would increase it:_ " + ctx.confidence.increase, "", "_What would reduce it:_ " + ctx.confidence.decrease);
  sec("Technical appendix"); L.push("### Canonical model (your inputs and how each number was produced)", "", "| Input | Value | Source | Status |", "|---|---|---|---|",
    ...Object.entries(ctx.inputs).map(([k, v]) => "| " + (INPUT_LABEL as any)[k]?.label + " | " + fmt(v!.value, (INPUT_LABEL as any)[k]?.unit) + " | " + v!.source + " | " + v!.label + " |"), "",
    "### Validation checks", "", ...ctx.validation.checks.map((c) => "- " + (c.pass ? "PASS" : "FAIL") + " \u2014 " + c.name + (c.detail ? " (" + c.detail + ")" : "")), "",
    "### Decision rules used", "", "- Revenue below " + DECISION_RULES.doNotProceedBelowBreakEvenRatio * 100 + "% of break-even, or funding short: plan does not work as described (REWORK if a changed plan works, otherwise STOP).",
    "- Revenue below break-even, operating cash below " + DECISION_RULES.minDSCR + "\u00d7 loan payments, or under " + DECISION_RULES.minimumRunwayMonths + " months of cash while losing money: WAIT.",
    "- Less than " + DECISION_RULES.proceedMarginOfSafety * 100 + "% headroom above break-even, or open conditions: CONDITIONAL PROCEED.", "");
  try { L.push(renderDecisionMarkdown(ctx.analysis)); } catch { /* appendix is best-effort */ }
  return L.join("\n");
}

// ── PPT: executive decision deck (~14 slides) ───────────────────────────────
export function deckMarkdown(ctx: CockpitContext, company = ""): string {
  const S: string[] = []; let n = 0; const slide = (t: string, ...b: string[]) => S.push("## Slide " + (++n) + " \u2014 " + t, ...b.filter(Boolean).slice(0, 5).map((x) => "- " + x), "");
  S.push("FORMAT INSTRUCTION: one slide per '## Slide' heading; keep the bullets short; use EXACTLY these numbers (they come from the canonical model) - do not recalculate, round differently or invent figures.", "");
  slide("Title", (company ? company + ": " : "") + ctx.question, "Decision recommendation");
  slide("The decision", ctx.display + " (confidence " + ctx.confidence.level + ")", ctx.meaning);
  slide("Why", ...(ctx.issues.length ? ctx.issues.map((x) => x.issue) : ctx.map.why.map(stripIds)));
  slide("The business economics", ...ctx.numbers.slice(0, 5).map((k) => k.label + ": " + k.value + " \u2014 " + k.meaning));
  slide("Customers and demand", ...(ctx.driver ? [ctx.driver.label + " now " + fmt(ctx.driver.current, ctx.driver.unit) + (ctx.driver.required !== null ? "; needs " + fmt(ctx.driver.required, ctx.driver.unit) : "")] : []), ...ctx.unknowns.filter((u) => /customer|demand|occupan|utili/i.test(u.missing)).map((u) => u.missing + ": " + u.howToVerify));
  slide("Where the executives agree", ...ctx.executives.filter((e) => /wait|not ready|prove|validate/i.test(e.view.impact)).map((e) => e.name + ": " + e.view.impact));
  slide("Where they disagree", ...(ctx.analysis.clusters.length ? ctx.analysis.clusters.slice(0, 4).map((c) => c.label + ": " + c.whyDisagree) : ["No material disagreements"]));
  slide("Biggest risks", ...ctx.issues.filter((x) => x.severity !== "watch").map((x) => x.issue), ...ctx.unknowns.slice(0, 2).map((u) => u.missing));
  slide("Decision gates", ...ctx.gates.slice(0, 5).map((g) => g.plain.title + " \u2014 " + g.gate.status));
  slide("Scenario outcomes", ...(ctx.scenarios.length ? ctx.scenarios.slice(-4).map((s) => s.name + ": " + s.decisionResult + " (profit " + fmt(s.simulationOutputs.profit, "INR") + "/month)") : ["Run scenarios in the Decision Cockpit to populate this slide"]));
  slide("What happens if conditions change", ...ctx.wouldChange.slice(0, 4));
  slide("Required actions", ...ctx.actions.slice(0, 5).map((x) => x.action + " \u2014 " + x.owner + ", " + x.deadline));
  slide("What would change the decision", ...ctx.wouldChange.slice(0, 3), ctx.confidence.increase);
  slide("Recommendation", ctx.oneSentence);
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
  const dash = wb.addWorksheet("Executive Dashboard");
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
    L.push("", "## Glossary", "", ...Object.values(GLOSSARY).map((g) => "- **" + g.term + "**: " + g.what + " " + g.why));
  }
  return L.join("\n");
}
