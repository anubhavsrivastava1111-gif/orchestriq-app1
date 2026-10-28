// SPEND GOVERNANCE - DECISION CHECKER & DATA-TRUST TEST (the "error checker").
// Deterministic. Blocks a decision when critical evidence is missing, a check fails
// or is unknown, the decision-maker is not independent, or the amount exceeds their
// decision rights. Every result explains WHY, so the user learns while deciding.

export type Tier = "Analyst lead" | "AVP" | "VP" | "Executive Director / CAO";
export const TIERS: Tier[] = ["Analyst lead", "AVP", "VP", "Executive Director / CAO"];
export interface Rights { analystLead: number; avp: number; vp: number }   // upper limits; above vp => ED/CAO
export const DEFAULT_RIGHTS: Rights = { analystLead: 100000, avp: 1000000, vp: 5000000 };

export interface EvidenceItem { id: string; text: string; critical: boolean; why: string }
export interface Check { id: string; q: string; critical: boolean; how: string }
export interface DecisionType {
  id: string; name: string; plain: string; minTier?: Tier; involve: string[];
  evidence: EvidenceItem[]; checks: Check[]; dataTests: string[]; impact: string[]; redFlags: string[]; afterwards: string;
}
const E = (id: string, text: string, critical: boolean, why: string): EvidenceItem => ({ id, text, critical, why });
const K = (id: string, q: string, critical: boolean, how: string): Check => ({ id, q, critical, how });

export const DECISIONS: DecisionType[] = [
  { id: "invoice-exception", name: "Approve payment of an invoice that failed a control", plain: "An invoice has no PO, a rate above the rate card, or is over tolerance, and someone wants it paid anyway.",
    involve: ["Service Owner (requester)", "Sourcing (contract terms)", "Accounts Payable"],
    evidence: [E("e1", "Contract or written agreement covering the service and rate", true, "Without a contract term, there is no basis to say the rate is owed."),
      E("e2", "Proof the service was delivered in the billing period", true, "Paying for undelivered services is a direct loss."),
      E("e3", "Explanation of why the control failed (e.g. PO not raised in time)", true, "Tells you whether this is a one-off or a broken process."),
      E("e4", "Service Owner's written approval", false, "Shows the budget holder accepts the cost.")],
    checks: [K("c1", "Have you recomputed the invoice from contract rates × delivered quantities?", true, "Rebuild it yourself from the rate card and delivery data; don't rely on the vendor's totals."),
      K("c2", "Have you confirmed this invoice was not already paid (duplicate check on normalised number, amount, date)?", true, "Search the payment file, removing spaces and dashes from invoice numbers."),
      K("c3", "Is this the first exception of this type for this vendor this quarter?", false, "Repeats point to a process fix, not another exception.")],
    dataTests: ["The delivery data comes from the service system, not from the vendor's invoice", "The payment search covered the full vendor history, not just this month"],
    impact: ["Cash: amount paid", "Audit: an approved exception with evidence is acceptable; without evidence it's a finding", "Process: repeated exceptions mean the control needs redesign"],
    redFlags: ["Urgency pressure ('pay today or service stops')", "Round amounts", "Requester is also the approver"],
    afterwards: "Log it in the central exception log with root cause; check next month that the same vendor isn't repeating it." },
  { id: "accrual-release", name: "Release (reverse) an accrual", plain: "An accrual is no longer needed, or was over-estimated, and someone proposes reversing it.",
    involve: ["Finance / Controller", "Service Owner"],
    evidence: [E("e1", "Confirmation the service will not be billed (vendor or service owner) or the actual invoice amount", true, "Releasing an accrual for a cost that later arrives creates a surprise in a later month."),
      E("e2", "Accrual history: when booked, by whom, basis", true, "You need to know what was originally assumed."),
      E("e3", "AP check: no unbooked or on-hold invoice for this vendor and period", true, "An invoice sitting on hold means the cost is real.")],
    checks: [K("c1", "Have you checked AP's on-hold and unposted invoice lists for this vendor?", true, "Ask AP for on-hold items; search by vendor and period."),
      K("c2", "Is the release timed at quarter end, or does it flatter results materially?", true, "Quarter-end releases that improve results need extra scrutiny and disclosure in commentary."),
      K("c3", "Have you decided how you'll confirm next month that no late invoice arrived?", false, "Set a follow-up check before you approve.")],
    dataTests: ["Accrual ageing report reconciles to the ledger balance", "AP's on-hold list is complete (count ties to AP's system total)"],
    impact: ["P&L: improves results in the month released", "Audit: releases without evidence are a classic finding", "Reporting: material releases should be explained in commentary"],
    redFlags: ["Release at quarter end improving results", "Accrual booked and released by the same person", "Vendor has a history of late invoicing"],
    afterwards: "Next month, check no invoice for that service arrived. If it did, record the error as an accrual-accuracy exception." },
  { id: "allocation-change", name: "Change an allocation driver or method", plain: "Someone proposes allocating a cost pool differently, e.g. by usage instead of headcount.",
    minTier: "VP", involve: ["Finance / Cost Allocation", "Affected OpCos", "Tax (legal-entity impact)"],
    evidence: [E("e1", "Written rationale: why the new driver reflects consumption better", true, "Allocations must be fair and explainable to OpCos."),
      E("e2", "Impact analysis: each unit's charge before vs after", true, "Shows winners and losers before anyone is surprised."),
      E("e3", "Driver data source and reconciliation", true, "A better driver with bad data is worse than the old one."),
      E("e4", "Tax / legal-entity review where entities change", false, "Cross-entity charges can have tax consequences.")],
    checks: [K("c1", "Does the total allocated still equal the source pool under the new method?", true, "Run the new method in parallel; sum by unit must equal the pool total."),
      K("c2", "Have affected OpCos been consulted before the change?", true, "Changing without notice destroys trust and triggers disputes."),
      K("c3", "Is the effective date at a period start, not mid-period?", false, "Mid-period changes complicate comparisons and audit trails.")],
    dataTests: ["Driver data reconciled to the source system (HR, real-estate or usage data)", "Parallel run totals tie to the source pool"],
    impact: ["OpCo profitability shifts", "Pricing and budget decisions in each unit", "Audit: methodology must be documented and approved"],
    redFlags: ["Change proposed by a unit that benefits from it", "No parallel run", "Driver data not refreshed"],
    afterwards: "Update the methodology document; send OpCo statements explaining the change; monitor disputes for two cycles." },
  { id: "credit-waiver", name: "Waive or reduce an SLA service credit", plain: "A vendor missed an SLA and someone wants to waive the credit the contract entitles the firm to.",
    minTier: "VP", involve: ["Service Owner", "Sourcing", "Vendor manager"],
    evidence: [E("e1", "SLA calculation from your own source data", true, "You need to know exactly what is owed before giving it up."),
      E("e2", "Contract clause on credits and any waiver provision", true, "Some contracts limit who can waive and how."),
      E("e3", "Written business reason (e.g. firm-caused delay, negotiated trade-off)", true, "A waiver without a reason is a gift."),
      E("e4", "Value received in exchange, if any", false, "Waivers should usually buy something: extra service, a fix, a better rate.")],
    checks: [K("c1", "Did the miss genuinely result from something the firm caused?", true, "Check incident records; vendor claims of 'client-caused' delays need evidence."),
      K("c2", "Is this vendor's first waiver this year?", true, "Repeated waivers mean the SLA isn't really enforced."),
      K("c3", "Has Sourcing agreed, considering the upcoming renewal?", false, "Waivers weaken the firm's position at renewal.")],
    dataTests: ["SLA measured from the firm's ticketing or service system, not the vendor's report", "The measurement period matches the contract period exactly"],
    impact: ["Cash: credit value forgone", "Commercial: weaker renewal leverage", "Precedent: vendors expect future waivers"],
    redFlags: ["Waiver requested by the vendor's relationship owner", "No written reason", "Multiple waivers for the same vendor"],
    afterwards: "Record the waiver and its reason in the vendor file; raise it at the next quarterly business review." },
  { id: "exception-closure", name: "Close an exception", plain: "An exception in the central log is proposed for closure.",
    involve: ["Exception owner", "Control owner"],
    evidence: [E("e1", "Evidence the specific issue was fixed (credit note, corrected entry, approval)", true, "Closure must be based on proof, not a status update."),
      E("e2", "Root cause identified", true, "Without root cause, the same exception returns."),
      E("e3", "Preventive action taken or scheduled (process or system change)", false, "Fixing one instance doesn't stop the next.")],
    checks: [K("c1", "Have you seen the closure evidence yourself?", true, "Open the document; don't accept 'done' in a status column."),
      K("c2", "Has the same exception type occurred in the last 3 months?", false, "If yes, closure should include a process fix."),
      K("c3", "Was the original due date met, or properly extended with approval?", false, "Unapproved extensions hide overdue items.")],
    dataTests: ["The exception log is complete (all control failures were logged, not just some)"],
    impact: ["Accuracy of control-health reporting", "Audit: closed items are sampled for evidence"],
    redFlags: ["Closed by the person who caused it with no review", "Evidence dated after the closure date", "Repeated reopenings"],
    afterwards: "Watch for recurrence over the next two cycles." },
  { id: "threshold-change", name: "Change a KPI or control threshold", plain: "Someone proposes loosening or tightening a threshold (e.g. rate tolerance from 2% to 5%).",
    minTier: "Executive Director / CAO", involve: ["Your leadership", "Control owner", "Finance", "Internal Audit (informed)"],
    evidence: [E("e1", "Analysis of what the change would have flagged in the last 6–12 months", true, "Shows exactly what the change hides or reveals."),
      E("e2", "Written rationale tied to risk appetite", true, "Thresholds express risk appetite; changes need leadership agreement."),
      E("e3", "Who requested it and why", true, "A request to loosen a threshold by the team it measures is a conflict.")],
    checks: [K("c1", "Does loosening the threshold hide any real issues found in the back-test?", true, "Re-run the last year's data with the new threshold; list what would no longer be flagged."),
      K("c2", "Is the requester independent of the area measured?", true, "The governed function shouldn't set its own threshold."),
      K("c3", "Will the change be reflected in both the policy and the system rule?", false, "A mismatch between policy and system is a control gap.")],
    dataTests: ["The back-test used the full population for the period"],
    impact: ["What leadership sees (and no longer sees)", "Volume of exceptions and team workload", "Audit: threshold changes are reviewed"],
    redFlags: ["Loosening proposed after a bad month", "Requested by the measured team", "No back-test"],
    afterwards: "Document the change with its effective date; compare exception volumes before and after." },
  { id: "vendor-escalation", name: "Put a vendor on a performance-remediation plan", plain: "A vendor's performance or billing accuracy is poor and you're deciding whether to escalate formally.",
    involve: ["Service Owner", "Sourcing", "Third-party risk team", "Legal (if contract remedies used)"],
    evidence: [E("e1", "Scorecard trend from source data (at least 3 months)", true, "Escalation must rest on a pattern, not one bad month."),
      E("e2", "Record of issues raised with the vendor and their responses", true, "Shows the vendor had a fair chance to fix it."),
      E("e3", "Contract remedies available (credits, cure periods, termination rights)", false, "Know your levers before you escalate.")],
    checks: [K("c1", "Is the performance data independent of the vendor's own reporting?", true, "Use the firm's systems or sample checks."),
      K("c2", "Is there a realistic alternative if the vendor can't improve?", false, "Escalation without an exit option is weak."),
      K("c3", "Have Sourcing and the Service Owner agreed the plan?", true, "A united front is essential for vendor remediation.")],
    dataTests: ["Scorecard data reconciled to source systems for at least one month"],
    impact: ["Service quality for employees and clients", "Third-party risk profile", "Commercial relationship and renewal"],
    redFlags: ["Escalation driven by one complaint", "No documented prior discussions"],
    afterwards: "Track remediation milestones monthly; decide on exit if milestones are missed." },
];

export type Answer = "yes" | "no" | "unsure";
export interface DecisionInput { type: string; amount: number; evidence: Record<string, boolean>; checks: Record<string, Answer>; independent: boolean; myTier: Tier }
export interface DecisionResult { verdict: "READY" | "NOT READY" | "ESCALATE"; requiredTier: Tier; reasons: string[]; teach: string[]; missingCritical: string[]; missingOther: string[]; score: number }

export function requiredTier(d: DecisionType, amount: number, r: Rights = DEFAULT_RIGHTS): Tier {
  const byAmount: Tier = amount <= r.analystLead ? "Analyst lead" : amount <= r.avp ? "AVP" : amount <= r.vp ? "VP" : "Executive Director / CAO";
  return d.minTier && TIERS.indexOf(d.minTier) > TIERS.indexOf(byAmount) ? d.minTier : byAmount;
}

export function evaluateDecision(inp: DecisionInput, r: Rights = DEFAULT_RIGHTS): DecisionResult {
  const d = DECISIONS.find((x) => x.id === inp.type);
  if (!d) return { verdict: "NOT READY", requiredTier: "VP", reasons: ["Unknown decision type."], teach: [], missingCritical: [], missingOther: [], score: 0 };
  const need = requiredTier(d, Math.max(0, inp.amount || 0), r);
  const missingCritical = d.evidence.filter((e) => e.critical && !inp.evidence[e.id]);
  const missingOther = d.evidence.filter((e) => !e.critical && !inp.evidence[e.id]);
  const failed = d.checks.filter((c) => c.critical && inp.checks[c.id] === "no");
  const unknown = d.checks.filter((c) => inp.checks[c.id] === "unsure" || (c.critical && !inp.checks[c.id]));
  const reasons: string[] = []; const teach: string[] = [];
  missingCritical.forEach((e) => { reasons.push("Missing critical evidence: " + e.text + "."); teach.push(e.text + " \u2014 " + e.why); });
  failed.forEach((c) => { reasons.push("Check failed: " + c.q); teach.push("How to resolve: " + c.how); });
  unknown.forEach((c) => { reasons.push("Not yet known: " + c.q); teach.push("How to find out: " + c.how); });
  const total = d.evidence.length + d.checks.length;
  const got = d.evidence.filter((e) => inp.evidence[e.id]).length + d.checks.filter((c) => inp.checks[c.id] === "yes").length;
  const score = Math.round(got / Math.max(1, total) * 100);
  if (reasons.length) return { verdict: "NOT READY", requiredTier: need, reasons, teach, missingCritical: missingCritical.map((e) => e.text), missingOther: missingOther.map((e) => e.text), score };
  if (!inp.independent) return { verdict: "ESCALATE", requiredTier: need, reasons: ["You requested or benefit from this decision, so you are not independent. Someone else at " + need + " level or above must decide."], teach: ["Independence: a decision-maker must not approve their own request. This is the most common audit finding in approvals."], missingCritical: [], missingOther: missingOther.map((e) => e.text), score };
  if (TIERS.indexOf(inp.myTier) < TIERS.indexOf(need)) return { verdict: "ESCALATE", requiredTier: need, reasons: ["This decision needs " + need + " approval" + (d.minTier && d.minTier === need ? " (this type of decision always needs at least " + d.minTier + ")" : " for this amount") + "; your level is " + inp.myTier + "."], teach: ["Decision rights: approving above your authority is a control breach even if the decision is right. Prepare the evidence pack and route it to " + need + "."], missingCritical: [], missingOther: missingOther.map((e) => e.text), score };
  return { verdict: "READY", requiredTier: need, reasons: ["All critical evidence present, all critical checks passed, you are independent and within your decision rights."].concat(missingOther.length ? ["Recommended but not blocking: " + missingOther.map((e) => e.text).join("; ") + "."] : []),
    teach: ["After deciding: " + d.afterwards], missingCritical: [], missingOther: missingOther.map((e) => e.text), score };
}

// ── DATA-TRUST TEST: can the numbers behind a decision be relied on? ──
export interface DataTestInput { sourceCount: number; extractCount: number; sourceTotal: number; extractTotal: number; periodExpected: string; periodCovered: string; sampleSize: number; sampleErrors: number; population: number; preparedBy: string; testedBy: string }
export interface DataTestResult { trusted: boolean; checks: { name: string; pass: boolean | null; detail: string; why: string }[] }
export function minSample(population: number): number { return population <= 0 ? 0 : population <= 50 ? Math.min(population, 10) : population <= 250 ? 25 : population <= 1000 ? 40 : 60; }
export function testData(x: DataTestInput): DataTestResult {
  const checks: DataTestResult["checks"] = [];
  const haveCounts = x.sourceCount > 0 || x.extractCount > 0;
  checks.push({ name: "Completeness: row count", pass: haveCounts ? x.sourceCount === x.extractCount : null, detail: haveCounts ? x.extractCount + " rows in your data vs " + x.sourceCount + " in the source system" + (x.sourceCount !== x.extractCount ? " (" + (x.extractCount - x.sourceCount) + ")" : "") : "Enter both row counts", why: "If rows are missing, problems in those rows are invisible to every test you run." });
  const haveTotals = x.sourceTotal !== 0 || x.extractTotal !== 0;
  const diff = x.extractTotal - x.sourceTotal; const tol = Math.max(1, Math.abs(x.sourceTotal) * 0.0005);
  checks.push({ name: "Completeness: value total", pass: haveTotals ? Math.abs(diff) <= tol : null, detail: haveTotals ? "Difference " + diff.toLocaleString("en-IN") + " (tolerance " + Math.round(tol).toLocaleString("en-IN") + ")" : "Enter both totals", why: "Totals catch partial extracts and filters that count checks can miss." });
  checks.push({ name: "Coverage: period", pass: x.periodExpected && x.periodCovered ? x.periodExpected.trim().toLowerCase() === x.periodCovered.trim().toLowerCase() : null, detail: x.periodExpected && x.periodCovered ? "Expected " + x.periodExpected + ", covered " + x.periodCovered : "Enter both periods", why: "A test on the wrong period answers the wrong question." });
  const need = minSample(x.population);
  checks.push({ name: "Accuracy: sample size", pass: x.population > 0 ? x.sampleSize >= need : null, detail: x.population > 0 ? "Sampled " + x.sampleSize + "; minimum for " + x.population + " items is " + need : "Enter the population size", why: "Too small a sample can miss errors; this is a typical audit-practice minimum." });
  checks.push({ name: "Accuracy: sample traced to source", pass: x.sampleSize > 0 ? x.sampleErrors === 0 : null, detail: x.sampleSize > 0 ? x.sampleErrors + " error(s) found when tracing " + x.sampleSize + " items back to source documents" : "Trace a sample to source documents", why: "Even one error means the data (or the process creating it) can't yet be relied on: find the cause and expand the sample." });
  checks.push({ name: "Independence: preparer vs tester", pass: x.preparedBy && x.testedBy ? x.preparedBy.trim().toLowerCase() !== x.testedBy.trim().toLowerCase() : null, detail: x.preparedBy && x.testedBy ? "Prepared by " + x.preparedBy + ", tested by " + x.testedBy : "Enter both names", why: "People rarely find errors in their own work; independent testing is the control." });
  return { trusted: checks.every((c) => c.pass === true), checks };
}
