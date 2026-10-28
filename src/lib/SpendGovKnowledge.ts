// SPEND GOVERNANCE & FINANCIAL CONTROL - KNOWLEDGE BASE
// The "teacher" layer: what each part of the job is, why it exists, its impact on
// the organisation, who matters, how to do it and how it goes wrong. Practitioner
// guidance for governing third-party (corporate services) spend. Not a description
// of any specific firm's internal procedures.

export type FamilyId = "invoice" | "accrual" | "allocation" | "vendor" | "operational" | "governance";
export interface SGControl { id: string; family: FamilyId; text: string; owner: string; frequency: string; threshold: string; evidence: string; test: string; kpi: string }
export interface Stakeholder { who: string; youNeed: string; theyNeed: string; howToWork: string }
export interface Family { id: FamilyId; name: string; oneLine: string; why: string; impact: string[]; stakeholders: string[]; controls: SGControl[]; mistakes: string[]; redFlags: string[] }

const C = (family: FamilyId, id: string, text: string, owner: string, frequency: string, threshold: string, evidence: string, test: string, kpi: string): SGControl => ({ id, family, text, owner, frequency, threshold, evidence, test, kpi });

export const FAMILIES: Family[] = [
  { id: "invoice", name: "Invoice controls", oneLine: "Pay only what was contracted, delivered and approved, once.",
    why: "Invoices are where money leaves the firm. Every invoice should match a contract or purchase order, a delivered service and an authorised approval. Without this, overbilling, duplicate payments and payments for services never received go unnoticed.",
    impact: ["Direct cash leakage from overbilling and duplicates", "Audit findings if approvals or evidence are missing", "Vendor disputes and late-payment penalties when invoices stall", "Inaccurate cost reporting to business units"],
    stakeholders: ["Accounts Payable", "Service Owners", "Sourcing / Procurement", "Vendors"],
    controls: [
      C("invoice", "INV-1", "Every invoice is matched to a valid contract or purchase order and to the contracted rate card before approval.", "Service Owner", "Every invoice", "Rate variance above 2% or any non-contract item is an exception", "Matched invoice pack: contract/PO reference, rate-card comparison", "Select a sample of paid invoices; re-perform the rate-card match; confirm exceptions were logged and resolved.", "% invoices with PO or contract (target ≥ 98%)"),
      C("invoice", "INV-2", "Proof of service delivery (timesheets, service reports, delivery notes) is attached before approval.", "Service Owner", "Every invoice", "No approval without delivery evidence", "Delivery evidence attached to the invoice record", "For the sample, trace each invoice to delivery evidence dated within the billing period.", "% invoices with delivery evidence (target 100%)"),
      C("invoice", "INV-3", "Duplicate invoice check on vendor, invoice number (normalised), amount and date before payment.", "Accounts Payable", "Every invoice; monthly analytics", "Any potential duplicate blocks payment until cleared", "Duplicate check log; monthly duplicate analytics", "Run duplicate analytics on the full year; investigate every hit; confirm no duplicate was paid.", "Duplicate payments (target 0)"),
      C("invoice", "INV-4", "Invoices are approved only by people with decision rights for that amount and cost centre.", "Governance team (you)", "Every invoice", "Approval above the approver's limit is a breach", "Approval trail versus the decision-rights matrix", "Compare approvers and amounts with the decision-rights matrix for a sample.", "Approvals outside decision rights (target 0)"),
      C("invoice", "INV-5", "Disputed invoices are logged with owner, reason and target date, and tracked to resolution.", "Service Owner", "Weekly review", "Disputes older than 30 days escalate", "Dispute log with ageing", "Check the log is complete against AP's on-hold report; review ageing and closure evidence.", "Disputes > 30 days (target 0)"),
    ],
    mistakes: ["Approving because 'the vendor always bills this'", "Checking the total, not the line rates", "Letting invoices sit unapproved, then paying late with penalties", "Treating a PO as proof of delivery"],
    redFlags: ["Round-number invoices for services billed by usage", "New line items not in the contract", "Invoices just below an approval threshold", "Invoice dates outside the service period"] },

  { id: "accrual", name: "Accrual controls", oneLine: "Record costs in the month the service was received, not when the invoice arrives.",
    why: "If services are received but not invoiced by month end, the cost must still be recorded (accrued). Missing accruals understate costs; stale or excessive accruals overstate them. Either way, the financial results reported to leadership, OpCos and regulators are wrong.",
    impact: ["Misstated monthly and quarterly results", "Budget-versus-actual reporting that misleads decision-makers", "Year-end audit adjustments", "Surprise costs hitting a later period"],
    stakeholders: ["Finance / Controllers", "Service Owners", "Accounts Payable"],
    controls: [
      C("accrual", "ACR-1", "Service owners confirm, every month end, services received but not yet invoiced, with supporting evidence.", "Service Owner", "Monthly", "All material services covered; nil confirmations recorded", "Accrual confirmations with evidence", "Compare confirmations with the list of active contracts; test a sample to delivery evidence.", "% contracts with month-end confirmation (target 100%)"),
      C("accrual", "ACR-2", "Accruals are reversed when the invoice arrives or released when no longer needed, with approval.", "Finance", "Monthly", "Accruals older than 90 days need re-justification", "Accrual ageing report; release approvals", "Review ageing; for items over 90 days, verify justification or release.", "Accruals > 90 days without support (target 0)"),
      C("accrual", "ACR-3", "Accrual estimates are compared with actual invoices received later (true-up analysis).", "Governance team (you)", "Monthly", "Variance above 10% per vendor investigated", "True-up analysis", "Recompute accrual vs actual for the last three months; investigate large variances.", "Accrual accuracy (target within ±10%)"),
      C("accrual", "ACR-4", "Manual accruals above threshold are reviewed and approved by someone other than the preparer.", "Finance Controller", "Monthly", "Above the materiality threshold set by Finance", "Approval trail on manual journals", "Select manual accruals; confirm independent approval and support.", "Manual accruals without independent approval (target 0)"),
    ],
    mistakes: ["Rolling the same accrual forward every month without evidence", "Accruing the budget instead of the actual service received", "Forgetting to reverse an accrual when the invoice is booked (double counting)"],
    redFlags: ["Accrual equals budget every month", "Large accrual releases at quarter end that flatter results", "Accruals for vendors with no active contract"] },

  { id: "allocation", name: "Allocation controls", oneLine: "Charge each business unit its fair share of shared costs, using drivers everyone accepts.",
    why: "Corporate services costs are shared and then allocated (charged back) to business units and entities using drivers such as headcount, floor space or usage. Wrong drivers or stale data distort every business unit's profitability, create disputes, and can create tax and legal-entity issues.",
    impact: ["Distorted business-unit profitability and pricing decisions", "Disputes and loss of trust from OpCos", "Legal-entity and transfer-pricing exposure", "Audit questions on methodology"],
    stakeholders: ["Finance / Cost Allocation team", "OpCos / business units", "Tax", "Service Owners"],
    controls: [
      C("allocation", "ALC-1", "A documented allocation methodology states each cost pool, its driver and its rationale, approved by Finance.", "Finance", "Annual review", "Methodology older than 12 months is re-approved", "Approved methodology document", "Confirm approval date; compare the system set-up with the document.", "Methodology reviewed in last 12 months (target yes)"),
      C("allocation", "ALC-2", "Driver data (headcount, floor space, usage) is refreshed on schedule and reconciled to its source.", "Finance", "Quarterly", "Driver data older than one quarter is an exception", "Driver extracts with source reconciliation", "Re-perform the driver reconciliation to HR, real-estate or usage systems.", "Driver data age (target ≤ 1 quarter)"),
      C("allocation", "ALC-3", "Total allocated cost reconciles to total source cost every run (nothing lost or double-allocated).", "Governance team (you)", "Every allocation run", "Any difference above rounding is a break", "Allocation reconciliation", "Re-perform: sum allocated by unit = source pool total.", "Allocation breaks (target 0)"),
      C("allocation", "ALC-4", "OpCos receive allocation statements and can dispute within a set window; disputes are logged and resolved.", "Finance", "Monthly / quarterly", "Disputes resolved within 30 days", "Statements; dispute log", "Check disputes log completeness and resolution evidence.", "Open allocation disputes > 30 days (target 0)"),
    ],
    mistakes: ["Using last year's headcount for this year's allocations", "Changing a driver without telling the OpCos", "Allocating to entities without checking legal-entity or tax implications"],
    redFlags: ["One unit's share changes sharply with no business change", "Allocations that don't add back to the source cost", "Frequent manual overrides of allocation results"] },

  { id: "vendor", name: "Vendor governance", oneLine: "Make vendors deliver what the contract promises, and claim what is owed when they don't.",
    why: "Contracts define service levels (SLAs), pricing and remedies such as service credits. Without active governance, poor service is tolerated, credits go unclaimed and commercial terms drift. Vendor performance also carries third-party risk for the firm.",
    impact: ["Money left on the table (unclaimed service credits)", "Poor employee and client experience", "Third-party and concentration risk", "Weak negotiating position at renewal"],
    stakeholders: ["Sourcing / Procurement", "Service Owners", "Vendors", "Third-party risk team"],
    controls: [
      C("vendor", "VEN-1", "Vendors are tiered by spend and risk; top-tier vendors have a monthly SLA scorecard.", "Service Owner", "Monthly", "All top-tier vendors scored every month", "Vendor tiering list; scorecards", "Confirm every top-tier vendor has a current scorecard built from source data, not the vendor's own summary alone.", "Top-tier vendors with current scorecard (target 100%)"),
      C("vendor", "VEN-2", "Service credits due for missed SLAs are calculated and claimed; waivers need documented approval.", "Service Owner", "Monthly", "Any unclaimed credit due is an exception", "Credit calculations; credit notes; waiver approvals", "Recompute credits from SLA data; agree to credit notes received; review waivers.", "Credits claimed vs due (target 100%)"),
      C("vendor", "VEN-3", "Quarterly business reviews with top vendors cover performance, billing accuracy, risks and improvement actions.", "Sourcing", "Quarterly", "Every top-tier vendor reviewed each quarter", "QBR minutes and action log", "Inspect minutes; check prior actions were completed.", "QBR actions overdue (target 0)"),
      C("vendor", "VEN-4", "Spend occurs only with approved vendors under valid contracts; expiring contracts are flagged 90 days ahead.", "Sourcing", "Monthly", "Off-contract spend above 1% of category is an exception", "Spend-to-contract match; renewal calendar", "Compare paid vendors with the approved list and contract dates.", "Off-contract spend % (target ≤ 1%)"),
    ],
    mistakes: ["Relying on the vendor's self-reported SLA results", "Waiving credits informally to 'keep the relationship good'", "Letting contracts auto-renew without review"],
    redFlags: ["SLA always reported at exactly 100%", "Credits due but never on any invoice", "Spend continuing after contract expiry"] },

  { id: "operational", name: "Operational controls", oneLine: "Stop leakage: recover what's owed, use what you pay for, pay on time, fix every exception.",
    why: "This is where governance turns into measurable value: billing recovery (money owed back to the firm), utilisation (paying only for capacity used), payment ageing (no late fees or vendor disputes) and exception remediation (every breach fixed at the root).",
    impact: ["Quantified savings and recoveries that leadership can see", "Lower cost through better utilisation", "Healthier vendor relationships through on-time payment", "Fewer repeat issues"],
    stakeholders: ["Accounts Payable", "Service Owners", "Finance", "Sourcing"],
    controls: [
      C("operational", "OPS-1", "A billing-recovery register records amounts owed back to the firm (overbilling, credits, recharges) with owner and status.", "Governance team (you)", "Weekly", "Recoveries open over 60 days escalate", "Recovery register; evidence of cash or credit received", "Trace recoveries marked 'closed' to credit notes or receipts.", "Recoveries achieved (amount, monthly)"),
      C("operational", "OPS-2", "Utilisation of committed capacity (minimum volumes, licences, space, retainers) is measured against contract.", "Service Owner", "Monthly", "Utilisation below 75% of committed capacity is reviewed", "Utilisation reports from source systems", "Re-perform utilisation from source data for a sample of contracts.", "Committed spend under-utilised (amount)"),
      C("operational", "OPS-3", "Payment ageing is monitored; invoices beyond terms have a reason and an owner.", "Accounts Payable", "Weekly", "Invoices beyond terms + 15 days escalate", "Ageing report with reasons", "Review ageing buckets; confirm reasons for overdue items.", "% invoices paid within terms (target ≥ 95%)"),
      C("operational", "OPS-4", "Every control exception is logged centrally with owner, root cause, due date and closure evidence.", "Governance team (you)", "Continuous; weekly review", "Overdue exceptions escalate; repeats trigger root-cause review", "Central exception log", "Sample closed exceptions; confirm closure evidence and root-cause fix.", "Overdue exceptions (target 0); repeat exceptions (trend down)"),
    ],
    mistakes: ["Counting a recovery as achieved before the money or credit arrives", "Measuring utilisation from vendor reports only", "Closing exceptions without fixing the cause"],
    redFlags: ["The same exception reappearing every month", "Recoveries 'agreed' but never received", "Late payments concentrated with one approver"] },

  { id: "governance", name: "Governance framework", oneLine: "Clear rules, clear authority, clear evidence: always ready for audit.",
    why: "Policies, standards, decision rights and evidence requirements are what make the other five families work consistently. They define who can decide what, what proof must exist, and how the firm demonstrates control to auditors and regulators.",
    impact: ["Consistent decisions across teams and regions", "Audit readiness with no scramble", "Clear accountability when something goes wrong", "Ability to scale and automate"],
    stakeholders: ["Your leadership (Business Unit Management / CAO)", "Internal Audit", "Finance", "Technology"],
    controls: [
      C("governance", "GOV-1", "Policies and standards for corporate-services spend are documented, approved and reviewed at least annually.", "Governance team (you)", "Annual", "Overdue review is an exception", "Policy library with version history", "Inspect approval and review dates.", "Policies past review date (target 0)"),
      C("governance", "GOV-2", "A decision-rights matrix defines who approves what, by type and amount, and matches system workflows.", "Governance team (you)", "Annual; on change", "Mismatch between matrix and system is an exception", "Decision-rights matrix; workflow configuration", "Compare matrix with system approval limits.", "Matrix-to-system mismatches (target 0)"),
      C("governance", "GOV-3", "Evidence standards state what must be retained for each control, where and for how long.", "Governance team (you)", "Annual", "Every control has an evidence standard", "Evidence standard document", "For a sample of controls, check evidence exists as the standard requires.", "Controls with evidence gaps (target 0)"),
      C("governance", "GOV-4", "A control-testing calendar is run; results and issues are reported to leadership.", "Governance team (you)", "Monthly / quarterly", "Tests completed on schedule", "Testing calendar; results", "Check planned vs completed tests.", "Tests completed on schedule (target 100%)"),
      C("governance", "GOV-5", "An audit-readiness checklist is maintained; previous audit findings are tracked to closure.", "Governance team (you)", "Quarterly", "Overdue audit actions escalate", "Checklist; issue tracker", "Inspect closure evidence for past findings.", "Overdue audit actions (target 0); repeat findings (target 0)"),
    ],
    mistakes: ["Policies that nobody can find or understand", "A decision-rights matrix that differs from what the system allows", "Evidence kept in personal inboxes"],
    redFlags: ["'We've always done it this way' as the only explanation", "Approvals happening outside the system", "Audit findings that repeat"] },
];
export const ALL_SG_CONTROLS: SGControl[] = FAMILIES.flatMap((f) => f.controls);

export const STAKEHOLDERS: Stakeholder[] = [
  { who: "Your leadership (Business Unit Management / CAO)", youNeed: "Risk appetite, thresholds, savings targets, reporting format, escalation rules.", theyNeed: "A clear view of control health, savings and exceptions; no surprises.", howToWork: "Agree the dashboard and thresholds early; escalate early with facts and a proposed fix." },
  { who: "Accounts Payable / Finance", youNeed: "Invoice register, payment ageing, accrual listings, GL extracts, allocation outputs.", theyNeed: "Clear control requirements and fast resolution of exceptions.", howToWork: "Fix data definitions together; share exception trends so they can fix root causes." },
  { who: "Sourcing / Procurement", youNeed: "Contracts, rate cards, SLAs, vendor master, renewal dates.", theyNeed: "Evidence of vendor performance and billing accuracy before negotiations.", howToWork: "Bring them recoveries and SLA evidence; they gain leverage at renewal." },
  { who: "Service Owners", youNeed: "Delivery evidence, SLA data, utilisation data, accrual confirmations.", theyNeed: "Simple templates and clear deadlines; recognition when their vendors improve.", howToWork: "Make compliance easy; show them their scorecard before anyone else sees it." },
  { who: "Technology / data teams", youNeed: "Data pipelines, dashboards, automation of controls.", theyNeed: "Precise requirements: fields, rules, thresholds, outputs, test cases.", howToWork: "Write requirements as testable rules; join user-acceptance testing." },
  { who: "OpCos / business units", youNeed: "Agreement on allocation drivers; their reporting needs.", theyNeed: "Fair, explainable allocations and timely statements.", howToWork: "Explain methodology before changes; resolve disputes quickly." },
  { who: "Internal Audit / risk", youNeed: "Past findings, upcoming reviews.", theyNeed: "Evidence that controls are designed and operating.", howToWork: "Share your testing results; agree remediation dates you can meet." },
  { who: "Your control team", youNeed: "Timely, accurate submissions and honest escalation.", theyNeed: "Clear tasks, deadlines, training and feedback.", howToWork: "Run a fixed calendar; review work with them; document know-how in SOPs." },
];

// ── LEARNING PATH ─────────────────────────────────────────────────────────
export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface Lesson { id: string; title: string; minutes: number; summary: string; whyItMatters: string; concepts: string[]; example: string; mistakes: string[]; quiz: Quiz[] }
export const LESSONS: Lesson[] = [
  { id: "L1", title: "What this role is, and why it exists", minutes: 6,
    summary: "You govern how the firm spends money with third-party vendors for corporate services: invoices, accruals, allocations and vendor performance. You are independent: you set the rules, monitor, challenge and report, but you do not run the spending yourself.",
    whyItMatters: "Corporate-services spend is large, spread across many vendors and easy to leak through overbilling, unclaimed credits and unused capacity. Independent governance protects cost, accuracy of reported results, audit outcomes and the firm's reputation with vendors and regulators.",
    concepts: ["Independence: you govern the functions, you are not one of them", "Control health: are controls designed well and operating?", "Value: savings, recoveries and avoided losses you can quantify", "Visibility: leadership and OpCos see the same trusted numbers"],
    example: "A facilities vendor bills ₹48 lakh a month. A rate-card check finds a 3% uplift applied without contract approval: ₹1.44 lakh a month, ₹17.3 lakh a year. One control, done properly, pays for a governance analyst.",
    mistakes: ["Acting as a second Accounts Payable team instead of governing the process", "Reporting activity (invoices reviewed) instead of outcomes (money recovered, exceptions fixed)"],
    quiz: [{ q: "What does 'independent' governance mean in this role?", options: ["You approve every invoice yourself", "You set rules, monitor and challenge, without being part of the teams that spend", "You report only to vendors", "You run Accounts Payable"], answer: 1, why: "Independence lets you challenge Sourcing, Finance and Service Owners objectively. If you ran the process, you would be checking your own work." },
      { q: "Which is the better measure of your team's value?", options: ["Number of invoices reviewed", "Money recovered and exceptions fixed at root cause", "Hours worked", "Number of emails sent"], answer: 1, why: "Leadership values outcomes. Activity counts show effort, not impact." }] },
  { id: "L2", title: "Independent challenge, done well", minutes: 5,
    summary: "Your job includes challenging people more senior or more expert than you. Effective challenge is fact-based, early, specific and offers a way forward.",
    whyItMatters: "Without challenge, governance becomes paperwork. With badly delivered challenge, people stop cooperating. The skill is to be firm on facts and helpful on solutions.",
    concepts: ["Lead with evidence, not opinion", "Raise issues early, privately first, then formally if unresolved", "Separate the person from the problem", "Always propose a fix and a date"],
    example: "Instead of 'Your invoices are wrong', say: 'Three of five sampled invoices billed the 2025 rate; the contract moved to the 2026 rate in April. That's ₹2.1 lakh over-billed. Can we get a credit note by the 20th and add a rate check to your approval step?'",
    mistakes: ["Escalating before talking to the owner", "Challenging without numbers", "Backing down when a senior person pushes back without new facts"],
    quiz: [{ q: "A senior Service Owner disagrees with your finding but offers no new evidence. What do you do?", options: ["Withdraw the finding", "Keep the finding, offer to review any evidence they provide, and escalate per the agreed path if unresolved", "Escalate immediately without discussion", "Ignore it"], answer: 1, why: "Findings change with evidence, not seniority. Offering to review new evidence keeps the relationship constructive." }] },
  { id: "L3", title: "Invoice controls", minutes: 7,
    summary: "Every invoice should match a contract or PO, a delivered service and an authorised approver, and be paid once.",
    whyItMatters: "This is the last point before cash leaves. Errors here are direct losses.",
    concepts: ["Three-way logic: contract/PO + delivery + invoice", "Rate-card match, not just totals", "Duplicate checks on normalised invoice numbers", "Decision rights by amount and cost centre"],
    example: "Invoice INV-778 and INV778 from the same vendor for ₹1,25,000 on the same date look different to a simple system check but are the same invoice. Normalising the number (removing dashes and spaces) catches it.",
    mistakes: ["Approving on totals", "Accepting a PO as proof of delivery", "Ignoring invoices just under approval limits"],
    quiz: [{ q: "Which check catches 'INV-778' and 'INV778' as duplicates?", options: ["Matching exact invoice numbers", "Normalising invoice numbers before matching", "Checking the vendor name only", "Checking the payment date"], answer: 1, why: "Removing spaces, dashes and case differences reveals duplicates that exact matching misses." }] },
  { id: "L4", title: "Accruals", minutes: 7,
    summary: "Costs belong to the month the service was received. If the invoice hasn't arrived, accrue the cost; reverse it when the invoice is booked.",
    whyItMatters: "Wrong accruals misstate results that leadership and regulators rely on.",
    concepts: ["Accrue actual service received, not the budget", "Reverse on invoice receipt to avoid double counting", "True-up: compare accruals with later invoices", "Age accruals; stale ones need justification or release"],
    example: "October cleaning services worth ₹6 lakh were delivered; the invoice arrives on 12 November. Accrue ₹6 lakh in October; reverse it in November when the ₹6.2 lakh invoice is booked. The ₹0.2 lakh difference is a true-up variance (3.3%): within tolerance, but tracked.",
    mistakes: ["Accruing the budget every month", "Forgetting the reversal", "Releasing large accruals at quarter end to improve results"],
    quiz: [{ q: "An accrual has been rolled forward for five months with no invoice. What should happen?", options: ["Keep rolling it", "Re-justify it with evidence of service received, or release it with approval", "Double it", "Delete it without approval"], answer: 1, why: "Stale accruals usually mean the estimate is wrong. Re-justify with evidence or release with approval." }] },
  { id: "L5", title: "Cost allocations", minutes: 7,
    summary: "Shared costs are charged to business units using drivers like headcount, space or usage. The method must be documented, the data current, and the totals must reconcile.",
    whyItMatters: "Allocations shape every business unit's profitability and pricing. Errors create disputes and wrong decisions.",
    concepts: ["Cost pool → driver → allocation", "Driver data must be current and reconciled to source", "Total allocated = total source cost", "OpCos get statements and a dispute window"],
    example: "A ₹10 crore facilities pool is allocated by floor space: Unit A 40%, Unit B 35%, Unit C 25%. If Unit C moved out of a floor in July but the space data wasn't refreshed, C is over-charged ₹25 lakh a quarter. The driver-refresh control prevents it.",
    mistakes: ["Stale driver data", "Changing drivers without notice", "Allocations that don't reconcile to source"],
    quiz: [{ q: "Allocated totals are ₹9.98 crore against a ₹10 crore source pool. What is this?", options: ["Fine, it's close", "An allocation break that must be explained and fixed", "A saving", "A rounding feature"], answer: 1, why: "Allocated cost must equal source cost. ₹2 lakh unexplained is a break: cost lost or mis-booked somewhere." }] },
  { id: "L6", title: "Vendor governance, SLAs and service credits", minutes: 8,
    summary: "Tier vendors by spend and risk. Score top vendors monthly against SLAs from your own data, claim credits when SLAs are missed, and review them quarterly.",
    whyItMatters: "Unclaimed credits are lost money; tolerated poor service hurts employees and clients; unmanaged vendors are a third-party risk.",
    concepts: ["Tiering by spend and risk", "Scorecards from source data, not just vendor reports", "Service credits: calculate, claim, approve any waiver", "Quarterly business reviews with tracked actions"],
    example: "A help-desk vendor's SLA requires 95% of tickets resolved within 4 hours, with a 5% fee credit for each month below target. September result: 91%. Monthly fee ₹20 lakh, so a ₹1 lakh credit is due. If nobody calculates it, nobody claims it.",
    mistakes: ["Trusting vendor-reported SLAs", "Informal waivers", "Auto-renewals without review"],
    quiz: [{ q: "A vendor reports 100% SLA every month for a year. What do you do?", options: ["Celebrate", "Verify the result from your own source data on a sample", "Increase their contract", "Stop measuring"], answer: 1, why: "Perfect self-reported results are a red flag. Independent verification is the control." }] },
  { id: "L7", title: "Recovery, utilisation, payment ageing and exceptions", minutes: 7,
    summary: "Turn governance into measurable value: recover what's owed, pay only for capacity used, pay on time, and fix every exception at root cause.",
    whyItMatters: "These are the numbers leadership remembers: savings, recoveries and fewer repeat problems.",
    concepts: ["Recovery is counted only when cash or credit is received", "Utilisation measured from source systems", "Ageing buckets with reasons and owners", "Central exception log with root cause and closure evidence"],
    example: "A print contract commits to 2 million pages a year at ₹0.80 per page (₹16 lakh). Actual use: 1.1 million (55%). Renegotiating to a 1.2 million commitment saves ₹6.4 lakh a year.",
    mistakes: ["Reporting 'agreed' recoveries as achieved", "Closing exceptions without fixing the cause"],
    quiz: [{ q: "A vendor has agreed to refund ₹3 lakh but the credit note hasn't arrived. Is it a recovery achieved?", options: ["Yes", "No, it's a recovery in progress until the credit or cash is received", "Only if the vendor is large", "Only at year end"], answer: 1, why: "Counting promises inflates reported value and erodes trust when they don't arrive." }] },
  { id: "L8", title: "The governance framework", minutes: 6,
    summary: "Policies, standards, decision rights and evidence requirements make everything else consistent and auditable.",
    whyItMatters: "Without them, every team improvises, and audits become a scramble.",
    concepts: ["Policy (what and why) vs standard (how, measurably)", "Decision rights: who approves what, by type and amount", "Evidence standard per control", "Audit readiness as a continuous state"],
    example: "Decision-rights matrix extract: invoice exceptions up to ₹1 lakh approved by Control Analyst lead; up to ₹10 lakh by AVP; up to ₹50 lakh by VP; above that by Executive Director / CAO. The system's workflow limits must match exactly.",
    mistakes: ["Matrix and system limits that differ", "Evidence stored in personal mailboxes"],
    quiz: [{ q: "Your decision-rights matrix says ₹10 lakh for AVPs but the system lets AVPs approve ₹25 lakh. What is this?", options: ["Flexibility", "A control gap: fix the system or the matrix, with approval", "Not important", "A vendor issue"], answer: 1, why: "If the system allows more than the matrix, the matrix isn't actually controlling anything." }] },
  { id: "L9", title: "MIS, KPIs and thresholds, and how KPIs mislead", minutes: 8,
    summary: "Define what leadership sees: each KPI needs a definition, formula, data source, owner and green/amber/red thresholds. Then make sure the KPI can't mislead.",
    whyItMatters: "Leaders act on dashboards. A wrong or gamed KPI leads to wrong decisions with your name on them.",
    concepts: ["Definition + formula + source + owner + thresholds", "Leading vs lagging indicators", "Completeness: is the denominator the whole population?", "Gaming: a KPI that can be improved without improving control"],
    example: "'% invoices approved within 5 days' looks great at 98%, but if approvers click 'approve' without checking evidence, speed improved and control got worse. Pair it with '% invoices with delivery evidence' so the two keep each other honest.",
    mistakes: ["KPIs without a written definition", "Denominators that silently exclude problem items", "Thresholds no one acts on"],
    quiz: [{ q: "Why pair a speed KPI with a quality KPI?", options: ["To have more charts", "So one can't be improved by sacrificing the other unnoticed", "Because leadership likes pairs", "It isn't necessary"], answer: 1, why: "Paired KPIs prevent gaming: speed can't rise at the cost of control without the quality KPI falling." }] },
  { id: "L10", title: "Partnering with Technology on reporting and automation", minutes: 6,
    summary: "Turn control requirements into precise, testable specifications; then test what Technology builds before you rely on it.",
    whyItMatters: "Automated controls run thousands of times. A wrong rule fails thousands of times silently.",
    concepts: ["Requirement = data fields + rule + threshold + output + owner", "Test cases with expected results, including edge cases", "Reconcile automated outputs to source before go-live", "Change control: rules can't be edited silently"],
    example: "Requirement: 'Flag invoices where unit rate exceeds contract rate by more than 2%'. Test cases: rate equal (no flag), +1.9% (no flag), +2.1% (flag), contract missing (flag as 'no contract'), currency differs (convert, then compare).",
    mistakes: ["Vague requirements ('flag wrong invoices')", "Going live without edge-case tests", "No owner for rule changes"],
    quiz: [{ q: "Which is a testable requirement?", options: ["Flag bad invoices", "Flag invoices whose unit rate exceeds the contract rate by more than 2%", "Make invoices better", "Use AI on invoices"], answer: 1, why: "A testable requirement has a precise rule and threshold, so you can write test cases with expected results." }] },
  { id: "L11", title: "Leading a small control team", minutes: 5,
    summary: "Run a fixed calendar, separate preparers from reviewers, review a sample of your team's work, and document know-how so knowledge isn't lost.",
    whyItMatters: "Your team's consistency is your credibility. One unreliable report damages trust in all of them.",
    concepts: ["Operating calendar (daily, weekly, monthly, quarterly)", "Maker-checker on every output", "Your own review sample of team work", "SOPs and knowledge transfer"],
    example: "Each month you re-perform 5 items from each analyst's testing. If you find one error in 25 items, that's 4%: discuss root cause, retrain, and expand your review next month.",
    mistakes: ["Reviewing nothing yourself", "Key knowledge sitting with one person"],
    quiz: [{ q: "Why should you re-perform a sample of your team's work?", options: ["To micromanage", "To verify quality independently before reporting it as fact", "It's not needed", "To slow them down"], answer: 1, why: "You sign off what goes to leadership. Sampling your team's work is how you know it's right." }] },
  { id: "L12", title: "Making decisions, and testing that they're right", minutes: 8,
    summary: "A good decision has complete evidence, an independent decision-maker, the right authority level, understood impact and a way to verify the outcome. Then test the test: make sure the data and checks behind the decision are themselves reliable.",
    whyItMatters: "You will be asked 'how do you know?' The answer must be evidence and a repeatable test, not confidence.",
    concepts: ["Evidence complete and dated", "Independence: you didn't request what you're approving", "Authority: within your decision rights", "Impact: cost, OpCos, audit, vendor relationship", "Test the test: completeness, accuracy, timeliness, independence of the data"],
    example: "Before releasing a ₹12 lakh accrual: (1) evidence the service won't be billed (vendor confirmation); (2) completeness: AP shows no unbooked invoice for that vendor; (3) authority: ₹12 lakh is within VP rights; (4) impact: improves this month's P&L by ₹12 lakh, so disclose it in commentary; (5) verify next month: no late invoice arrives.",
    mistakes: ["Deciding on a summary without seeing source data", "Approving something you requested", "Not checking whether the report you rely on is complete"],
    quiz: [{ q: "Your analyst's report shows 0 duplicate invoices. What should you check before trusting it?", options: ["Nothing", "That the report covered the full population (row count and total tie to AP), and that the duplicate logic handles formatting differences", "The font", "Only the vendor names"], answer: 1, why: "A clean result from an incomplete or weak test is false comfort. Testing the test means checking completeness and logic." }] },
];

// ── KPI CATALOGUE ─────────────────────────────────────────────────────────
export interface KPI { name: string; family: FamilyId; formula: string; green: string; amber: string; red: string; source: string; misleadsWhen: string; pairWith: string }
export const KPIS: KPI[] = [
  { name: "Invoices with contract or PO", family: "invoice", formula: "Invoices with valid contract/PO ÷ all invoices paid", green: "≥ 98%", amber: "95–98%", red: "< 95%", source: "AP invoice register + contract register", misleadsWhen: "The denominator excludes invoices still on hold", pairWith: "Off-contract spend %" },
  { name: "Duplicate payments", family: "invoice", formula: "Count and value of confirmed duplicate payments", green: "0", amber: "1 (recovered)", red: "≥ 1 unrecovered", source: "Duplicate analytics on full payment file", misleadsWhen: "The test uses exact matching only", pairWith: "Recoveries achieved" },
  { name: "Accrual accuracy", family: "accrual", formula: "|Accrual − actual invoice| ÷ actual, by vendor", green: "≤ 10%", amber: "10–20%", red: "> 20%", source: "Accrual ledger + later invoices", misleadsWhen: "Only vendors with invoices are included (missing ones never measured)", pairWith: "Accruals > 90 days" },
  { name: "Accruals over 90 days without support", family: "accrual", formula: "Count/value of accruals aged > 90 days lacking current evidence", green: "0", amber: "1–3", red: "> 3", source: "Accrual ageing report", misleadsWhen: "Items are reversed and re-booked to reset the age", pairWith: "Accrual accuracy" },
  { name: "Allocation breaks", family: "allocation", formula: "Source pool total − total allocated", green: "0", amber: "Rounding only", red: "Any unexplained difference", source: "Allocation run outputs", misleadsWhen: "Reconciliation uses the allocation system's own totals as 'source'", pairWith: "Driver data age" },
  { name: "Driver data age", family: "allocation", formula: "Days since driver data last refreshed and reconciled", green: "≤ 90", amber: "91–120", red: "> 120", source: "Driver extracts", misleadsWhen: "The date refreshed is recorded, but no reconciliation was done", pairWith: "Allocation disputes" },
  { name: "SLA credits claimed vs due", family: "vendor", formula: "Credits received ÷ credits due per SLA calculation", green: "100%", amber: "90–99%", red: "< 90%", source: "SLA data + credit notes", misleadsWhen: "'Due' is calculated from vendor-reported SLAs", pairWith: "Scorecards from source data" },
  { name: "Off-contract spend", family: "vendor", formula: "Spend with no valid contract ÷ category spend", green: "≤ 1%", amber: "1–3%", red: "> 3%", source: "Payments + contract register", misleadsWhen: "Expired contracts are still marked active", pairWith: "Invoices with contract or PO" },
  { name: "Recoveries achieved", family: "operational", formula: "Value of cash/credits actually received in period", green: "On or above target", amber: "80–99% of target", red: "< 80%", source: "Recovery register + credit notes", misleadsWhen: "'Agreed' recoveries are counted", pairWith: "Recoveries open > 60 days" },
  { name: "Paid within terms", family: "operational", formula: "Invoices paid within agreed terms ÷ invoices paid", green: "≥ 95%", amber: "90–95%", red: "< 90%", source: "AP payment data", misleadsWhen: "Invoice receipt date is recorded late, hiding delays", pairWith: "Invoices with delivery evidence" },
  { name: "Overdue exceptions", family: "operational", formula: "Exceptions past due date", green: "0", amber: "1–5", red: "> 5", source: "Central exception log", misleadsWhen: "Due dates are extended without approval", pairWith: "Repeat exceptions" },
  { name: "Controls tested on schedule", family: "governance", formula: "Tests completed ÷ tests planned in period", green: "100%", amber: "90–99%", red: "< 90%", source: "Testing calendar", misleadsWhen: "Tests are marked complete without evidence", pairWith: "Repeat audit findings" },
];

// ── OPERATING CALENDAR ────────────────────────────────────────────────────
export const CALENDAR: { when: string; what: string; why: string }[] = [
  { when: "Daily", what: "Review new exceptions and items needing your decision; check overnight data feeds loaded.", why: "Small issues fixed today don't become month-end problems." },
  { when: "Weekly", what: "Team stand-up; exception log review; payment ageing; recovery register; disputes over 30 days.", why: "Keeps work flowing and stops items going stale." },
  { when: "Month end (days 1–3)", what: "Accrual confirmations; accrual ageing; allocation run reconciliation.", why: "Results must be right before Finance closes." },
  { when: "Month end (days 4–8)", what: "Vendor scorecards and credit calculations; KPI dashboard refresh; leadership and OpCo reporting.", why: "Leadership sees control health, savings and exceptions every month." },
  { when: "Monthly", what: "Re-perform a sample of your team's work; true-up accruals; utilisation review.", why: "You verify before you report." },
  { when: "Quarterly", what: "Top-vendor business reviews; allocation driver refresh; control testing; audit-readiness check; threshold review.", why: "Deeper checks that don't need monthly frequency." },
  { when: "Annually", what: "Policy and standards review; decision-rights matrix review; methodology re-approval; KPI catalogue refresh.", why: "The framework stays current as the business changes." },
];
