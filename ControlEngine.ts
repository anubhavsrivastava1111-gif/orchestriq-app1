// CONTROL TESTING & PROGRAMME ENGINE - deterministic. Effectiveness is judged by documented
// rules (sample sizes, exceptions, deficiency severity per PCAOB AS 2201 and the ICAI Guidance
// Note on IFC), never by AI. Sample sizes are typical practice; the auditor's methodology prevails.
import { PROCESSES, ALL_CONTROLS, type Control, type Freq, type Process } from "./ControlLibrary";
import { applicability, bindingRegimes, COSO_PRINCIPLES, FRAMEWORKS, type Entity } from "./Frameworks";

export const TOD_QUESTIONS = [
  "The control addresses the risk and the assertions it is mapped to",
  "The performer has the competence and authority, and is independent of the activity being checked",
  "It is precise: there is a defined threshold or criterion that would catch a material error",
  "It is timely: it operates before payment / posting / close, at a frequency that fits the risk",
  "Evidence is retained that proves it was performed and reviewed",
  "A walkthrough traced one real transaction end to end and the control operated as described",
];
export type Likelihood = "Remote" | "Reasonably possible" | "Probable";
export type Magnitude = "Inconsequential" | "More than inconsequential" | "Material";
export const MW_INDICATORS = ["Fraud of any size by senior management", "Restatement of previously issued financial statements", "Auditor found a material misstatement the controls did not catch", "Ineffective oversight by the Audit Committee"];
export interface ControlState {
  applicable?: boolean; owner?: string; performer?: string; reviewer?: string;
  tod?: boolean[]; todDate?: string; population?: number; risk?: "Lower" | "Higher"; itgcReliance?: boolean;
  sample?: number; exceptions?: number; expSample?: number; expExceptions?: number; testDate?: string; tester?: string;
  deficiency?: { likelihood: Likelihood; magnitude: Magnitude; compensating: boolean; indicators: string[] };
  remediation?: { action: string; owner: string; due: string; status: "Open" | "In progress" | "Closed" }; notes?: string;
}
export type States = Record<string, ControlState>;     // key: entityId + ":" + controlId

// Typical sample sizes by frequency (lower / higher risk).
const TABLE: Record<Exclude<Freq, "As needed">, [number, number]> = { Annual: [1, 1], Quarterly: [2, 2], Monthly: [2, 5], Weekly: [5, 15], Daily: [20, 40], "Multiple times a day": [25, 60] };
export function sampleSize(c: Control, s: ControlState = {}): { size: number; basis: string } {
  const hi = (s.risk || "Higher") === "Higher" ? 1 : 0;
  if (c.nature === "Automated") return s.itgcReliance === false ? { size: TABLE["Multiple times a day"][hi], basis: "Automated, but IT general controls are not relied on: test like a frequent manual control" } : { size: 1, basis: "Automated control: test of one, relying on effective IT general controls (and a baseline in later years)" };
  if (c.freq === "As needed") { const p = s.population || 0; const row = p <= 0 ? null : p <= 12 ? TABLE.Monthly : p <= 52 ? TABLE.Weekly : p <= 250 ? TABLE.Daily : TABLE["Multiple times a day"];
    return row ? { size: Math.min(p, row[hi]), basis: "Event-driven control with a population of " + p + " in the period" } : { size: 0, basis: "Enter how many times it occurred in the period to size the sample" }; }
  const [lo, h] = TABLE[c.freq]; return { size: hi ? h : lo, basis: c.freq + " control, " + (hi ? "higher" : "lower") + " risk" };
}
export type TestResult = "Not tested" | "Effective" | "Expand sample" | "Not effective";
export function evaluateTest(s: ControlState, required: number): { result: TestResult; why: string } {
  if (s.sample === undefined || s.sample === null || s.sample <= 0) return { result: "Not tested", why: "No test recorded yet." };
  const ex = s.exceptions || 0;
  if (s.sample < required) return { result: "Not tested", why: "Sample of " + s.sample + " is below the required " + required + "." };
  if (ex === 0) return { result: "Effective", why: "No exceptions in " + s.sample + " items." };
  if (ex === 1 && s.sample >= 20) {
    if (!s.expSample) return { result: "Expand sample", why: "One exception in a large sample: test " + s.sample + " more items. If none fail, the control can still be concluded effective." };
    return (s.expExceptions || 0) === 0 ? { result: "Effective", why: "One exception, isolated: the expanded sample of " + s.expSample + " had none (document root cause)." } : { result: "Not effective", why: "Exceptions also found in the expanded sample." };
  }
  return { result: "Not effective", why: ex + " exception" + (ex > 1 ? "s" : "") + " in " + s.sample + " items." };
}
export type Severity = "Control deficiency" | "Significant deficiency" | "Material weakness";
export function classifyDeficiency(d: NonNullable<ControlState["deficiency"]>): { severity: Severity; why: string; reportTo: string } {
  const R = (severity: Severity, why: string) => ({ severity, why, reportTo: severity === "Material weakness" ? "Audit Committee and Board; disclosed in the ICFR / IFC report (adverse opinion likely); CEO/CFO certifications must reflect it" : severity === "Significant deficiency" ? "Audit Committee in writing (SA 265 / AS 2201); remediate before year end" : "Management; track to closure" });
  if (d.indicators && d.indicators.length) return R("Material weakness", "Strong indicator present: " + d.indicators.join("; ") + ".");
  if (d.likelihood === "Remote") return R("Control deficiency", "A misstatement is only a remote possibility.");
  const order: Magnitude[] = ["Inconsequential", "More than inconsequential", "Material"];
  let m = order.indexOf(d.magnitude); if (d.compensating && m > 0) m -= 1;
  if (m === 2) return R("Material weakness", "A material misstatement is reasonably possible and would not be prevented or detected in time" + (d.compensating ? "" : " (no effective compensating control)") + ".");
  if (m === 1) return R("Significant deficiency", "Less severe than a material weakness but important enough to merit the Audit Committee's attention" + (d.compensating && d.magnitude === "Material" ? " (a compensating control reduces the potential misstatement)" : "") + ".");
  return R("Control deficiency", d.compensating ? "Effective compensating control limits any misstatement to an inconsequential amount." : "Any misstatement would be inconsequential.");
}
export type Overall = "Not applicable" | "Not started" | "Design gap" | "Designed" | "Effective" | "Deficient" | "Remediating";
export function controlStatus(c: Control, s: ControlState = {}) {
  if (s.applicable === false) return { overall: "Not applicable" as Overall, design: "\u2014", test: { result: "Not tested" as TestResult, why: "" }, severity: null as null | ReturnType<typeof classifyDeficiency>, required: sampleSize(c, s) };
  const required = sampleSize(c, s); const tod = s.tod && s.tod.length === TOD_QUESTIONS.length ? (s.tod.every(Boolean) ? "Effective" : "Ineffective") : "Not assessed";
  const test = tod === "Effective" ? evaluateTest(s, required.size) : { result: "Not tested" as TestResult, why: tod === "Ineffective" ? "Fix the design before testing operation." : "Assess design first." };
  const failed = tod === "Ineffective" || test.result === "Not effective";
  const severity = failed && s.deficiency ? classifyDeficiency(s.deficiency) : null;
  const remediating = !!(s.remediation && s.remediation.status !== "Open");
  const overall: Overall = tod === "Ineffective" ? (remediating ? "Remediating" : "Design gap") : test.result === "Not effective" ? (remediating ? "Remediating" : "Deficient") : test.result === "Effective" ? "Effective" : tod === "Effective" ? "Designed" : "Not started";
  return { overall, design: tod, test, severity, required };
}

const key = (e: Entity, c: Control) => e.id + ":" + c.id;
export function inScope(e: Entity, processIds: string[], custom: Control[] = []): Control[] { return [...ALL_CONTROLS, ...custom].filter((c) => processIds.includes(c.process)); }
export function programme(e: Entity, processIds: string[], states: States, custom: Control[] = [], today = new Date().toISOString().slice(0, 10)) {
  const ctl = inScope(e, processIds, custom).filter((c) => states[key(e, c)]?.applicable !== false);
  const st = ctl.map((c) => ({ c, s: states[key(e, c)] || {}, r: controlStatus(c, states[key(e, c)] || {}) }));
  const keyC = st.filter((x) => x.c.key);
  const pct = (n: number, d: number) => (d ? Math.round(n / d * 100) : 0);
  const sev = (k: Severity) => st.filter((x) => x.r.severity?.severity === k).length;
  const overdue = st.filter((x) => x.s.remediation && x.s.remediation.status !== "Closed" && x.s.remediation.due && x.s.remediation.due < today);
  const binding = bindingRegimes(e);
  const cosoCovered = COSO_PRINCIPLES.map((p) => ({ ...p, controls: ctl.filter((c) => c.coso === p.n).length }));
  return {
    total: ctl.length, key: keyC.length,
    assigned: pct(st.filter((x) => x.s.performer && x.s.owner).length, st.length),
    designed: pct(st.filter((x) => x.r.design === "Effective").length, st.length),
    keyEffective: pct(keyC.filter((x) => x.r.overall === "Effective").length, keyC.length),
    effective: pct(st.filter((x) => x.r.overall === "Effective").length, st.length),
    deficient: st.filter((x) => x.r.overall === "Deficient" || x.r.overall === "Remediating" || x.r.overall === "Design gap").length,
    mw: sev("Material weakness"), sd: sev("Significant deficiency"), cd: sev("Control deficiency"), overdue: overdue.length,
    unassessedFailures: st.filter((x) => (x.r.overall === "Deficient" || x.r.overall === "Remediating") && !x.r.severity).length,
    cosoCovered, cosoGaps: cosoCovered.filter((p) => p.controls === 0).map((p) => "P" + p.n + " " + p.text),
    bindingTagged: FRAMEWORKS.filter((f) => binding.includes(f.id)).map((f) => ({ fw: f, controls: ctl.filter((c) => c.regs.includes(f.id)).length })),
    opinion: sev("Material weakness") ? "NOT EFFECTIVE \u2014 material weakness exists" : keyC.length && keyC.every((x) => x.r.overall === "Effective") ? "EFFECTIVE (all key controls tested without unremediated deficiencies)" : "NOT YET CONCLUDED \u2014 testing incomplete",
    rows: st,
  };
}
export function ownerScorecard(e: Entity, processIds: string[], states: States, custom: Control[] = [], today = new Date().toISOString().slice(0, 10)) {
  const m: Record<string, { person: string; controls: number; effective: number; deficient: number; overdue: number; untested: number }> = {};
  for (const c of inScope(e, processIds, custom)) { const s = states[key(e, c)] || {}; if (s.applicable === false) continue; const r = controlStatus(c, s);
    const who = s.owner || "(unassigned: " + c.owner + ")"; const x = m[who] || (m[who] = { person: who, controls: 0, effective: 0, deficient: 0, overdue: 0, untested: 0 });
    x.controls++; if (r.overall === "Effective") x.effective++; if (["Deficient", "Remediating", "Design gap"].includes(r.overall)) x.deficient++; if (["Not started", "Designed"].includes(r.overall)) x.untested++;
    if (s.remediation && s.remediation.status !== "Closed" && s.remediation.due && s.remediation.due < today) x.overdue++; }
  return Object.values(m).map((x) => ({ ...x, score: x.controls ? Math.max(0, Math.round((x.effective / x.controls) * 100 - x.overdue * 10)) : 0 })).sort((a, b) => a.score - b.score);
}
export function raci(p: Process, custom: Control[] = []): { roles: string[]; rows: { control: string; cells: Record<string, string> }[] } {
  const ctl = [...p.controls, ...custom.filter((c) => c.process === p.id)]; const roles = Array.from(new Set(ctl.flatMap((c) => [c.owner, c.performer, c.reviewer]).filter((r) => r && r !== "System")));
  return { roles, rows: ctl.map((c) => { const cells: Record<string, string> = {}; const add = (r: string, l: string) => { if (r && r !== "System") cells[r] = cells[r] ? cells[r] + "/" + l : l; };
    add(c.performer, "R"); add(c.owner, "A"); add(c.reviewer, "C"); return { control: c.id, cells }; }) };
}
// SoD: assignments[processId][pairIndex] = [person doing A, person doing B]
export function sodConflicts(assign: Record<string, [string, string][]>) {
  const out: { process: string; a: string; b: string; why: string; person: string }[] = [];
  for (const p of PROCESSES) (assign[p.id] || []).forEach((pair, i) => { const r = p.sod[i]; if (r && pair && pair[0] && pair[1] && pair[0].trim().toLowerCase() === pair[1].trim().toLowerCase()) out.push({ process: p.name, a: r[0], b: r[1], why: r[2], person: pair[0] }); });
  return out;
}
export function materiality(pbtCr: number, revenueCr: number) {
  const base = pbtCr > 0 && pbtCr >= revenueCr * 0.02 ? { b: "5% of profit before tax", v: pbtCr * 0.05 } : { b: "0.5% of revenue (profit is low or negative)", v: revenueCr * 0.005 };
  return { basis: base.b, overall: base.v, performance: base.v * 0.65, trivial: base.v * 0.05 };
}

// Implementation pathway: phases with owners, outputs and a status derived from the programme.
export function roadmap(e: Entity, prog: ReturnType<typeof programme>, pbtCr = 0, revenueCr = 0) {
  const reg = applicability(e).filter((a) => a.status === "REQUIRED"); const sox = reg.some((a) => a.fw.id === "sox404"); const ifc = reg.some((a) => a.fw.id === "in-ifc-audit" || a.fw.id === "in-ifc-board");
  const mat = materiality(pbtCr, revenueCr); const big = e.turnoverCr >= 500 || e.employees >= 1000; const w = (n: number) => Math.round(n * (big ? 1.6 : 1));
  const S = (done: boolean, started: boolean) => (done ? "Done" : started ? "In progress" : "Not started");
  return [
    { phase: "1. Governance & scope", who: "CFO with the Audit Committee; Chief Compliance Officer", weeks: w(2), status: S(prog.total > 0, prog.total > 0),
      what: "Confirm which regimes bind (" + (Array.from(new Set(reg.map((r) => r.fw.name.split(" (")[0]))).join("; ") || "none mandatory \u2014 voluntary programme") + "). Set materiality" + (revenueCr ? " (overall \u2248 \u20b9" + mat.overall.toFixed(2) + " crore on " + mat.basis + "; performance materiality \u2248 \u20b9" + mat.performance.toFixed(2) + " crore)" : "") + ", pick significant accounts, locations and processes. Approve a control-programme charter.", output: "Scoping memo; charter approved by the Audit Committee" },
    { phase: "2. Document processes", who: "Process owners (AP, AR, Payroll, IT \u2026) facilitated by Internal Controls", weeks: w(4), status: S(prog.assigned === 100, prog.assigned > 0),
      what: "For each in-scope process, confirm the process map, risks and controls (start from this library), name a real owner, performer and reviewer, and record systems and reports used.", output: "Process narratives / maps and a Risk & Control Matrix with named owners" },
    { phase: "3. Test of design & walkthroughs", who: "Internal Controls / Internal Audit, with each control owner", weeks: w(3), status: S(prog.designed === 100, prog.designed > 0),
      what: "Walk one transaction through each process and answer the six design questions for every control. Fix gaps before testing operation.", output: "Walkthrough documentation; design conclusions; design-gap remediation plan" },
    { phase: "4. Remediate design gaps", who: "Control owners; IT for system configuration", weeks: w(4), status: S(prog.designed === 100 && prog.deficient === 0, prog.designed > 0),
      what: "Implement missing or weak controls, configure system controls (workflow, tolerances, access), and allow them to operate long enough to be tested (typically 1 quarter for monthly controls).", output: "Updated RCM; evidence of operation" },
    { phase: "5. Test operating effectiveness", who: sox ? "Management testers independent of the control (often Internal Audit); external auditor for 404(b)" : "Internal Audit or an independent tester; statutory auditor relies on it", weeks: w(6), status: S(prog.keyEffective === 100, prog.effective > 0),
      what: "Test each key control with the sample sizes shown, record exceptions and conclude. Re-test remediated controls after enough operation.", output: "Test sheets with evidence; conclusions per control" },
    { phase: "6. Evaluate deficiencies & remediate", who: "CFO and control owners; report to the Audit Committee", weeks: w(4), status: S(prog.deficient === 0 && prog.total > 0 && prog.effective > 0, prog.deficient > 0),
      what: "Classify each failure (deficiency / significant deficiency / material weakness), aggregate related ones, agree remediation owners and dates, and track to closure.", output: "Deficiency log; Audit Committee communication" },
    { phase: "7. Certify & report", who: sox ? "CEO and CFO (s.302 / s.404 management report)" : ifc ? "Board (s.134 statement), CFO; statutory auditor reports under s.143(3)(i)" : "CEO / CFO to the Board", weeks: w(2), status: S(prog.opinion.startsWith("EFFECTIVE"), prog.effective > 0),
      what: "Sub-certifications from process owners roll up to the " + (sox ? "SOX certifications and management's ICFR report." : ifc ? "directors' IFC statement" + (e.type === "Listed" ? " and LODR Reg 17(8) CEO/CFO certificate." : ".") : "management representation to the Board."), output: "Signed certifications; disclosures" },
    { phase: "8. Monitor continuously", who: "Chief Compliance Officer; Internal Audit; Audit Committee", weeks: 0, status: "Ongoing",
      what: "Quarterly sub-certifications, change assessment (new systems, acquisitions, new countries), compliance calendar, whistle-blower reporting, annual refresh of scope and risk assessment.", output: "Quarterly compliance dashboard to the Audit Committee" },
  ];
}

// Excel workbook auditors can use directly.
export async function buildRacmWorkbook(ExcelJS: any, e: Entity, processIds: string[], states: States, custom: Control[] = []) {
  const wb = new ExcelJS.Workbook(); const prog = programme(e, processIds, states, custom);
  const ws = wb.addWorksheet("RACM"); const head = ["Process", "Risk ID", "Risk", "Assertions", "Control ID", "Control description", "Key", "Type", "Nature", "Frequency", "Control owner (role)", "Owner (name)", "Performer", "Reviewer", "Evidence", "Test procedure", "Sample size", "Sample basis", "COSO principle", "Laws / frameworks", "Design", "Operating result", "Deficiency", "Remediation", "Due", "Status"];
  ws.addRow(head); ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11264A" } };
  for (const p of PROCESSES.filter((x) => processIds.includes(x.id))) for (const c of [...p.controls, ...custom.filter((x) => x.process === p.id)]) {
    const s = states[key(e, c)] || {}; if (s.applicable === false) continue; const r = controlStatus(c, s); const risk = p.risks.find((x) => x.id === c.risk);
    ws.addRow([p.name, c.risk, risk?.text || "", (risk?.assertions || []).join(", "), c.id, c.text, c.key ? "Key" : "Non-key", c.type, c.nature, c.freq, c.owner, s.owner || "", s.performer || c.performer, s.reviewer || c.reviewer, c.evidence, c.test,
      r.required.size, r.required.basis, "P" + c.coso, c.regs.join(", "), r.design, r.test.result, r.severity?.severity || "", s.remediation?.action || "", s.remediation?.due || "", r.overall]);
  }
  ws.columns.forEach((col: any, i: number) => { col.width = [16, 9, 40, 10, 10, 60, 8, 11, 16, 14, 18, 16, 16, 16, 34, 50, 8, 30, 8, 22, 12, 14, 20, 30, 11, 12][i] || 14; col.alignment = { wrapText: true, vertical: "top" }; });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 5 }]; ws.autoFilter = { from: "A1", to: "Z1" };
  const L = wb.addWorksheet("Applicable laws"); L.addRow(["Framework / law", "Region", "Status", "Why", "Key obligations", "Reference"]); L.getRow(1).font = { bold: true };
  for (const a of applicability(e)) L.addRow([a.fw.name, a.fw.region, a.status, a.why, a.fw.obligations.join("; "), a.fw.ref]);
  L.columns.forEach((col: any, i: number) => { col.width = [48, 16, 14, 60, 60, 50][i]; col.alignment = { wrapText: true, vertical: "top" }; });
  const D = wb.addWorksheet("Summary"); [["Entity", e.name], ["Country", e.country], ["Controls in scope", prog.total], ["Key controls", prog.key], ["Owners assigned %", prog.assigned], ["Design effective %", prog.designed], ["Key controls effective %", prog.keyEffective],
    ["Material weaknesses", prog.mw], ["Significant deficiencies", prog.sd], ["Control deficiencies", prog.cd], ["Overdue remediation", prog.overdue], ["Conclusion", prog.opinion], ["Note", "Prepared with OrchestrIQ. Indicative; confirm applicability and conclusions with your statutory auditor and legal counsel."]].forEach((r) => D.addRow(r));
  D.getColumn(1).width = 28; D.getColumn(2).width = 70;
  return wb;
}
