// ═══════════════════════════════════════════════════════════════════════════════
// WorkflowTemplates.ts — 10 industry-agnostic workflow definitions
// Adding a new workflow = add one object to WORKFLOW_REGISTRY.
// No UI or engine code lives here.
// ═══════════════════════════════════════════════════════════════════════════════

import type { WorkflowDef, WorkflowConfig } from "./WorkflowEngine";

const DEFAULT_SLA_CONFIG: WorkflowConfig = {
  system: "Generic",
  slaDefs: [
    { priority: "P1 - Critical", hours: 4,  color: "#EF4444" },
    { priority: "P2 - High",     hours: 8,  color: "#F97316" },
    { priority: "P3 - Medium",   hours: 24, color: "#F59E0B" },
    { priority: "P4 - Low",      hours: 72, color: "#10B981" },
  ],
  columnMappings: {
    "ticket_id": "Ticket ID", "created_date": "Created Date",
    "priority": "Priority", "status": "Status",
    "assigned_to": "Assigned To", "category": "Category",
  },
  filters: ["Status != Closed", "Status != Cancelled"],
  namingConventions: { dateFormat: "YYYY-MM-DD", snapshotPrefix: "SNAP" },
  reportNames: ["tickets.xlsx", "ticket_report.csv"],
  customRules: [],
};

export const WORKFLOW_REGISTRY: WorkflowDef[] = [

  // ── 1. TICKET MANAGEMENT & SLA MONITORING ─────────────────────────────────
  {
    id: "ticket_sla", name: "Ticket Management & SLA Monitoring",
    category: "Operations", icon: "🎫", color: "#14B8A6",
    description: "Monitor operational tickets end-to-end: ingest → validate → SLA calculation → breach identification → workload summary → dashboard → management report.",
    businessObjective: "Ensure zero SLA breaches go undetected. Every ticket is tracked, every breach is escalated, every manager is informed before it is too late.",
    industries: ["shared_services", "it_operations", "consulting", "government", "banking"],
    estimatedTime: "15–25 minutes (auto) · 45–60 minutes (guided)",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      {
        id: "ingest", name: "Ingest Ticket Report", icon: "📥",
        description: "Load today's ticket export from your ticket system (ServiceNow, Jira, Freshdesk, custom).",
        type: "input", requires: [], canAuto: false,
        inputs: [{ id: "ticket_data", label: "Ticket Report", description: "Export from your ticket system (CSV/Excel/paste)", required: true, accepts: [".xlsx",".csv","text"], memoryKey: "ticket_data" }],
        outputs: [{ id: "raw_tickets", label: "Raw Ticket Data", format: "text" }],
        aiPrompt: (ctx) =>
          `You are a data ingestion specialist. Parse and normalise this ticket data.
`+
          `Apply column mappings: ${JSON.stringify(ctx.config.columnMappings)}
`+
          `Apply filters: ${ctx.config.filters.join(", ")}
`+
          `Output: count of tickets loaded, columns found, any data quality issues.

DATA:
${ctx.inputData.ticket_data||""}`,
      },
      {
        id: "validate", name: "Data Validation", icon: "✅",
        description: "Validate data completeness: required columns, date formats, priority values, assigned owners.",
        type: "validate", requires: ["ingest"], canAuto: true,
        inputs: [{ id: "raw_tickets", label: "Parsed Tickets", description: "Output from ingest step", required: true, accepts: ["text"] }],
        outputs: [{ id: "validation_report", label: "Validation Report", format: "text" }],
        validate: (data) => {
          if (!data.raw_tickets && !data.ticket_data) return { ok: false, reason: "No ticket data loaded. Please complete the Ingest step first." };
          return { ok: true };
        },
        aiPrompt: (ctx) =>
          `Validate this ticket dataset. Check:
1. Required columns present (Ticket ID, Created Date, Priority, Status, Assigned To)
2. No blank Ticket IDs
3. Valid priority values
4. Created dates are parseable
5. Status values are from expected set

Report: pass/fail per check, count of issues, severity.

DATA:
${ctx.inputData.raw_tickets||ctx.previousOutputs.ingest||""}`,
      },
      {
        id: "sla_calc", name: "SLA Calculation", icon: "⏱️",
        description: "Calculate age of every open ticket. Flag breaches per your SLA definitions.",
        type: "analyse", requires: ["validate"], canAuto: true,
        inputs: [{ id: "validated_tickets", label: "Validated Tickets", description: "Clean dataset", required: true, accepts: ["text"] }],
        outputs: [{ id: "sla_analysis", label: "SLA Analysis", format: "text" }],
        aiPrompt: (ctx) =>
          `You are an SLA compliance analyst. Calculate SLA status for every ticket.

`+
          `SLA DEFINITIONS:
${ctx.config.slaDefs.map(s=>`${s.priority}: ${s.hours} hours`).join("
")}

`+
          `Today: ${new Date().toLocaleDateString()}

`+
          `For each ticket determine: age in hours, SLA threshold, breach status, hours overdue (if breached).
`+
          `Output a structured table:
`+
          `| Ticket ID | Priority | Age (hrs) | SLA (hrs) | Status | Overdue By | Owner |
`+
          `|---|---|---|---|---|---|---|

`+
          `Then provide: Total open, Total breached, Breach rate %, By priority breakdown.

`+
          `DATA:
${ctx.previousOutputs.validate||ctx.inputData.validated_tickets||""}`,
      },
      {
        id: "breach_identify", name: "Breach Identification & Categorisation", icon: "🚨",
        description: "Identify all SLA breaches, categorise by severity, assign risk scores.",
        type: "analyse", requires: ["sla_calc"], canAuto: true,
        inputs: [],
        outputs: [{ id: "breach_report", label: "Breach Report", format: "text" }],
        aiPrompt: (ctx) =>
          `You are an SLA breach analyst. From the SLA calculation results, identify and categorise all breaches.

`+
          `Output:
## BREACH SUMMARY
Total breaches, total value at risk (if applicable), worst performing team.

`+
          `## BREACH REGISTER
| Ticket ID | Priority | Owner | Age | Overdue | Root Cause Category | Risk Score | Escalation Required |
|---|---|---|---|---|---|---|---|

`+
          `## BY TEAM/OWNER
| Owner | Open | Breached | Breach Rate | Oldest Ticket |
|---|---|---|---|---|

`+
          `## ROOT CAUSE ANALYSIS
Top 3 reasons tickets are breaching SLA.

`+
          `## IMMEDIATE ACTIONS REQUIRED
Numbered list of what must happen today.

`+
          `SLA DATA:
${ctx.previousOutputs.sla_calc||""}`,
      },
      {
        id: "workload_summary", name: "Workload Summary", icon: "📊",
        description: "Generate workload summary by team, category, and priority for management.",
        type: "generate", requires: ["breach_identify"], canAuto: true,
        inputs: [],
        outputs: [{ id: "workload_report", label: "Workload Report", format: "text" }],
        aiPrompt: (ctx) =>
          `Generate a workload summary report.

`+
          `## WORKLOAD SUMMARY — ${new Date().toLocaleDateString()}

`+
          `## OVERALL SNAPSHOT
| Metric | Value | vs Yesterday | Trend |
|---|---|---|---|

`+
          `## BY CATEGORY
| Category | Open | In Progress | Breached | Avg Age |
|---|---|---|---|---|

`+
          `## BY PRIORITY
| Priority | Count | Breached | Breach Rate | Oldest |
|---|---|---|---|---|

`+
          `## CAPACITY vs DEMAND
Analyse if current team size can clear the backlog.

`+
          `## FORECAST
At current velocity, when will the backlog be cleared?

`+
          `PREVIOUS ANALYSIS:
${ctx.previousOutputs.breach_identify||""}`,
      },
      {
        id: "generate_excel", name: "Generate Excel Workbook", icon: "📋",
        description: "Create multi-sheet Excel workbook: Dashboard, Breach Register, Workload, SLA Tracker, Actions.",
        type: "output", requires: ["workload_summary"], canAuto: true,
        inputs: [],
        outputs: [{ id: "excel_workbook", label: "Excel Workbook", format: "xlsx" }],
        aiPrompt: (ctx) =>
          `Generate structured Excel data as JSON for a ticket management workbook.
`+
          `Output ONLY valid JSON with this structure:
`+
          `{"sheets":[
`+
          `{"name":"Dashboard","headers":["Metric","Value","Status","Trend"],"rows":[]},
`+
          `{"name":"Breach Register","headers":["Ticket ID","Priority","Owner","Age (hrs)","SLA (hrs)","Overdue By","Category","Risk","Action"],"rows":[]},
`+
          `{"name":"Workload by Team","headers":["Owner","Open","In Progress","Breached","Breach Rate%","Avg Age (hrs)","Oldest Ticket"],"rows":[]},
`+
          `{"name":"SLA Tracker","headers":["Priority","Total","On Track","At Risk","Breached","Compliance%","SLA Hours"],"rows":[]},
`+
          `{"name":"Action Tracker","headers":["#","Action","Owner","Deadline","Priority","Status","Notes"],"rows":[]}
`+
          `]}

Extract real values from:
${ctx.previousOutputs.workload_summary||""}
${ctx.previousOutputs.breach_identify||""}`,
      },
      {
        id: "generate_email", name: "Generate Management Email", icon: "📧",
        description: "Draft management email with SLA status, breach summary and actions required.",
        type: "output", requires: ["workload_summary"], canAuto: true,
        inputs: [],
        outputs: [{ id: "email_draft", label: "Email Draft", format: "email" }],
        aiPrompt: (ctx) =>
          `Draft a concise management email for the daily ticket SLA update.

`+
          `Audience: Operations Manager / Service Delivery Manager
`+
          `Tone: Professional, factual, action-oriented
`+
          `Length: Under 250 words

`+
          `Include:
- Subject line
- Overall SLA health (RAG status)
- Number of breaches and worst cases
- 3 actions required from management
- Sign-off

`+
          `SUMMARY DATA:
${ctx.previousOutputs.workload_summary||""}`,
      },
      {
        id: "generate_ppt", name: "Generate PowerPoint Summary", icon: "📑",
        description: "Create executive PowerPoint: one slide per key finding — SLA health, breaches, workload, actions.",
        type: "output", requires: ["generate_excel"], canAuto: true,
        inputs: [],
        outputs: [{ id: "ppt_summary", label: "PowerPoint", format: "pptx" }],
        aiPrompt: (ctx) =>
          `Design a 5-slide executive PowerPoint for the ticket SLA update.

`+
          `Slide 1: Title + Overall SLA Health (RAG dashboard)
`+
          `Slide 2: Breach Summary — table of top 10 breaches
`+
          `Slide 3: Workload by Team — bar chart data
`+
          `Slide 4: Root Causes + Trend
`+
          `Slide 5: Actions Required (3–5 bullets with owners)

`+
          `Output slide content as structured text sections.

`+
          `DATA:
${ctx.previousOutputs.breach_identify||""}
${ctx.previousOutputs.workload_summary||""}`,
      },
      {
        id: "archive", name: "Archive Snapshot", icon: "🗂️",
        description: "Save today's snapshot for tomorrow's comparison. The workflow remembers daily history.",
        type: "archive", requires: ["generate_excel"], canAuto: true,
        inputs: [],
        outputs: [{ id: "snapshot", label: "Daily Snapshot", format: "text" }],
        aiPrompt: (ctx) =>
          `Create a compact daily snapshot summary for archiving.
`+
          `Include: date, total tickets, total breaches, breach rate, top 3 owners with most tickets.
`+
          `Format: JSON for easy comparison tomorrow.

`+
          `DATA:
${ctx.previousOutputs.workload_summary||""}`,
      },
    ],
  },

  // ── 2. ACCOUNTS PAYABLE MONTH-END CLOSE ───────────────────────────────────
  {
    id: "ap_monthend", name: "Accounts Payable Month-End Close",
    category: "Finance & Audit", icon: "📑", color: "#3B82F6",
    description: "Complete AP month-end: invoice validation → 3-way match → duplicate detection → ageing → GR/IR → accruals → journal support → management pack.",
    businessObjective: "Close AP books accurately and on time. Every exception is identified, every accrual is justified, every journal is supported.",
    industries: ["manufacturing", "retail", "banking", "shared_services"],
    estimatedTime: "20–35 minutes",
    defaultConfig: { ...DEFAULT_SLA_CONFIG, system: "SAP S/4HANA", reportNames: ["ap_open_items.xlsx", "gr_ir_report.xlsx", "vendor_ageing.xlsx"] },
    steps: [
      { id: "ingest_invoices", name: "Load AP Open Items", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "ap_data", label: "AP Open Items Report", description: "Export from SAP FBL1N or equivalent", required: true, accepts: [".xlsx",".csv","text"], memoryKey: "ap_data" }], outputs: [{ id: "ap_raw", label: "AP Raw Data", format: "text" }], description: "Load AP open items from your ERP system.",
        aiPrompt: (ctx) => `Parse AP open items report. Identify: invoice numbers, vendors, amounts, dates, PO references, GR references, payment terms, due dates. Report data quality issues.

DATA:
${ctx.inputData.ap_data||""}` },
      { id: "three_way_match", name: "Three-Way Match Exceptions", icon: "🔀", type: "analyse", requires: ["ingest_invoices"], canAuto: true, inputs: [], outputs: [{ id: "match_exceptions", label: "Match Exceptions", format: "text" }], description: "Identify invoices where PO, GR, and invoice amounts do not match within tolerance.",
        aiPrompt: (ctx) => `Perform three-way match analysis.
For each invoice, compare: Invoice Amount vs PO Amount vs GR Amount.
Tolerance: ±${ctx.config.customRules[0]||"5 units or 1%"}.
Output:
## THREE-WAY MATCH EXCEPTIONS
| Invoice # | Vendor | Invoice Amt | PO Amt | GR Amt | Variance | Action |
|---|---|---|---|---|---|---|

## SUMMARY
Total invoices, matched, exceptions, total at risk.

DATA:
${ctx.previousOutputs.ingest_invoices||""}` },
      { id: "duplicate_detect", name: "Duplicate Invoice Detection", icon: "🔍", type: "analyse", requires: ["ingest_invoices"], canAuto: true, inputs: [], outputs: [{ id: "duplicates", label: "Duplicate Report", format: "text" }], description: "Flag invoices with same vendor + amount + approximate date as potential duplicates.",
        aiPrompt: (ctx) => `Detect duplicate invoices. Flag: same vendor + same amount + within 30 days, same invoice number different dates, same PO referenced multiple times.
Output:
## DUPLICATE INVOICE REPORT
| Invoice # | Vendor | Amount | Date | Potential Duplicate | Risk |
|---|---|---|---|---|---|

DATA:
${ctx.previousOutputs.ingest_invoices||""}` },
      { id: "vendor_ageing", name: "Vendor Ageing Analysis", icon: "📅", type: "analyse", requires: ["ingest_invoices"], canAuto: true, inputs: [], outputs: [{ id: "ageing_report", label: "Ageing Report", format: "text" }], description: "Bucket outstanding invoices by age. Identify overdue and at-risk payments.",
        aiPrompt: (ctx) => `Generate vendor ageing analysis.
Buckets: Current | 1-30 Days | 31-60 Days | 61-90 Days | 90+ Days

## VENDOR AGEING SUMMARY
| Vendor | Current | 1-30 | 31-60 | 61-90 | 90+ | Total | Priority Action |
|---|---|---|---|---|---|---|---|

## OVERALL AGEING PROFILE
| Bucket | Count | Amount | % of Total | Action |
|---|---|---|---|---|

DATA:
${ctx.previousOutputs.ingest_invoices||""}` },
      { id: "accruals", name: "Accrual Identification", icon: "📝", type: "generate", requires: ["three_way_match","vendor_ageing"], canAuto: true, inputs: [], outputs: [{ id: "accrual_schedule", label: "Accrual Schedule", format: "text" }], description: "Identify goods and services received but not yet invoiced. Propose month-end accruals.",
        aiPrompt: (ctx) => `Identify required month-end accruals based on: uninvoiced GR amounts, recurring vendor patterns, known fixed costs.
## ACCRUAL SCHEDULE
| Vendor | Description | Estimated Amount | Cost Centre | GL Account | Basis | Confidence |
|---|---|---|---|---|---|---|
## JOURNAL ENTRY SUPPORT
For each accrual provide the DR/CR entry.

DATA:
${ctx.previousOutputs.three_way_match||""}
${ctx.previousOutputs.vendor_ageing||""}` },
      { id: "ap_excel", name: "Generate AP Workbook", icon: "📋", type: "output", requires: ["accruals"], canAuto: true, inputs: [], outputs: [{ id: "ap_workbook", label: "AP Workbook", format: "xlsx" }], description: "Multi-sheet Excel: Invoice Register, Exceptions, Ageing, Accruals, Month-End Checklist.",
        aiPrompt: (ctx) => `Output ONLY JSON for AP month-end workbook:
{"sheets":[{"name":"Invoice Register","headers":["Invoice#","Vendor","Amount","Date","PO#","GR#","Match Status","Days Outstanding","Exception"],"rows":[]},{"name":"Match Exceptions","headers":["Invoice#","Vendor","Invoice Amt","PO Amt","GR Amt","Variance","Action"],"rows":[]},{"name":"Vendor Ageing","headers":["Vendor","Current","1-30 Days","31-60 Days","61-90 Days","90+ Days","Total"],"rows":[]},{"name":"Accrual Schedule","headers":["Vendor","Description","Amount","Cost Centre","GL Account","DR","CR","Basis"],"rows":[]},{"name":"Month-End Checklist","headers":["#","Task","Responsible","Due Date","Status"],"rows":[["1","Clear GR/IR >30 days","AP Lead","","Open"],["2","Post accruals","Finance","","Open"],["3","Vendor statement recon","AP Team","","Open"],["4","Remove duplicates","AP Lead","","Open"],["5","Payment run","Treasury","","Open"]]}]}

DATA:
${ctx.previousOutputs.accruals||""}` },
    ],
  },

  // ── 3. TRAVEL & EXPENSE AUDIT ─────────────────────────────────────────────
  {
    id: "te_audit", name: "Travel & Expense Audit",
    category: "Finance & Audit", icon: "🧾", color: "#EF4444",
    description: "Full T&E cycle: ingest receipts → policy validation → duplicate detection → risk scoring → audit workbook → employee emails → management PPT.",
    businessObjective: "Detect every policy violation, duplicate claim and missing receipt. Eliminate manual audit effort. Generate audit-ready evidence.",
    industries: ["consulting", "banking", "manufacturing", "shared_services", "airlines"],
    estimatedTime: "10–20 minutes",
    defaultConfig: { ...DEFAULT_SLA_CONFIG, system: "SAP Concur", reportNames: ["expense_report.xlsx", "concur_extract.csv"] },
    steps: [
      { id: "ingest_expenses", name: "Load Expense Report", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "expense_data", label: "Expense Report", description: "SAP Concur export, Excel, or CSV", required: true, accepts: [".xlsx",".csv","text"], memoryKey: "expense_data" }], outputs: [{ id: "raw_expenses", label: "Raw Expenses", format: "text" }], description: "Load expense claims from SAP Concur or equivalent system.",
        aiPrompt: (ctx) => `Parse expense report. Extract: employee, date, amount, category, vendor, receipt status, approval status. Flag missing fields. Report: total claims, total amount, unique employees, date range.

DATA:
${ctx.inputData.expense_data||""}` },
      { id: "policy_check", name: "Policy Validation", icon: "📋", type: "analyse", requires: ["ingest_expenses"], canAuto: true, inputs: [], outputs: [{ id: "policy_violations", label: "Policy Violations", format: "text" }], description: "Check every claim against company T&E policy rules.",
        aiPrompt: (ctx) => `Audit expense claims against T&E policy.
Check: per diem limits, meal caps, hotel caps, missing receipts, personal items, alcohol claims, round-number amounts, weekend claims, duplicate vendors.
Custom rules: ${ctx.config.customRules.join(", ") || "none configured"}

## POLICY VIOLATIONS
| # | Employee | Date | Amount | Category | Violation | Risk | Action Required |
|---|---|---|---|---|---|---|---|

## SUMMARY
Total violations, total amount at risk, by category breakdown.

DATA:
${ctx.previousOutputs.ingest_expenses||""}` },
      { id: "duplicate_expense", name: "Duplicate Claim Detection", icon: "🔍", type: "analyse", requires: ["ingest_expenses"], canAuto: true, inputs: [], outputs: [{ id: "expense_duplicates", label: "Duplicates", format: "text" }], description: "Identify duplicate expense claims across employees and periods.",
        aiPrompt: (ctx) => `Detect duplicate expense claims: same employee + same amount + within 7 days, same vendor + same amount + different employees on same date, round number cash claims.
## DUPLICATE CLAIMS
| Employee | Date | Amount | Category | Duplicate of | Risk Score |
|---|---|---|---|---|---|

DATA:
${ctx.previousOutputs.ingest_expenses||""}` },
      { id: "risk_score", name: "Risk Scoring & Prioritisation", icon: "🎯", type: "analyse", requires: ["policy_check","duplicate_expense"], canAuto: true, inputs: [], outputs: [{ id: "risk_report", label: "Risk Report", format: "text" }], description: "Score overall audit risk. Rank employees and claims by risk level.",
        aiPrompt: (ctx) => `Calculate risk scores for the T&E audit.
Score each employee 0-100 based on: violation count, amounts, duplicate claims, missing receipts, policy severity.
## RISK SCORECARD
| Employee | Claims | Violations | Duplicates | Missing Receipts | Risk Score | Priority |
|---|---|---|---|---|---|---|

## OVERALL AUDIT RISK
Score: X/100 — [LOW/MEDIUM/HIGH/CRITICAL]
Key finding in one sentence.

DATA:
${ctx.previousOutputs.policy_check||""}
${ctx.previousOutputs.duplicate_expense||""}` },
      { id: "audit_excel", name: "Generate Audit Workbook", icon: "📋", type: "output", requires: ["risk_score"], canAuto: true, inputs: [], outputs: [{ id: "audit_workbook", label: "Audit Workbook", format: "xlsx" }], description: "Multi-sheet Excel: Exception Register, Employee Summary, Category Analysis, Risk Dashboard.",
        aiPrompt: (ctx) => `Output ONLY JSON for T&E audit workbook:
{"sheets":[{"name":"Exception Register","headers":["#","Employee","Date","Amount","Category","Vendor","Violation","Risk","Status","Action"],"rows":[]},{"name":"Employee Summary","headers":["Employee","Claims","Amount","Violations","Duplicates","Missing Receipts","Risk Score","Status"],"rows":[]},{"name":"Category Analysis","headers":["Category","Count","Total Amount","Violations","% Violation Rate","Avg Claim"],"rows":[]},{"name":"Risk Dashboard","headers":["Metric","Value"],"rows":[["Total Claims",""],["Total Amount",""],["Violations Found",""],["Duplicates Detected",""],["Missing Receipts",""],["Overall Risk Score",""],["Total at Risk",""]]}]}

DATA:
${ctx.previousOutputs.risk_score||""}` },
      { id: "employee_email", name: "Draft Employee Notifications", icon: "📧", type: "output", requires: ["audit_excel"], canAuto: true, inputs: [], outputs: [{ id: "employee_emails", label: "Employee Emails", format: "email" }], description: "Draft notification emails for employees with violations requiring action.",
        aiPrompt: (ctx) => `Draft a professional but firm audit notification email template.
From: Internal Audit Team
To: [Employee Name]
Subject line and body.
Include: what was found, what documentation is required, deadline (5 business days), consequences of non-response.
Tone: Professional, factual, not accusatory.
Under 200 words.

Based on violations found:
${ctx.previousOutputs.risk_score||""}` },
    ],
  },

  // ── 4–10: REMAINING TEMPLATES (lightweight — user can expand) ─────────────
  {
    id: "internal_audit_fieldwork", name: "Internal Audit Fieldwork",
    category: "Compliance & Risk", icon: "🔍", color: "#8B5CF6",
    description: "Structured audit: scope → risk assessment → testing → findings → management letter → action tracker.",
    businessObjective: "Complete a full internal audit cycle from planning to reporting with a complete evidence trail.",
    industries: ["banking","insurance","manufacturing","government","consulting"],
    estimatedTime: "30–60 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "audit_scope", name: "Define Audit Scope", icon: "📋", type: "input", requires: [], canAuto: false, inputs: [{ id: "scope_data", label: "Audit Scope & Objectives", description: "Describe the area, risk, and period under review", required: true, accepts: ["text"], memoryKey: "audit_scope" }], outputs: [{ id: "scope_doc", label: "Audit Scope Document", format: "text" }], description: "Define what is being audited and why.",
        aiPrompt: (ctx) => `You are a Senior Internal Auditor. Structure this audit scope into a formal scope document.
## AUDIT SCOPE DOCUMENT
## OBJECTIVES
## SCOPE (In Scope / Out of Scope)
## KEY RISKS
## APPROACH
## TIMELINE
## TEAM

INPUT:
${ctx.inputData.scope_data||""}` },
      { id: "risk_control_matrix", name: "Risk & Control Matrix", icon: "⚖️", type: "generate", requires: ["audit_scope"], canAuto: true, inputs: [], outputs: [{ id: "racm", label: "RACM", format: "text" }], description: "Generate Risk and Control Matrix for the audit area.",
        aiPrompt: (ctx) => `Generate a Risk and Control Matrix (RACM) for this audit.
## RISK AND CONTROL MATRIX
| Risk ID | Risk Description | Risk Level | Control | Control Type | Control Owner | Frequency | Test Approach | Sample Size |
|---|---|---|---|---|---|---|---|---|

AUDIT SCOPE:
${ctx.previousOutputs.audit_scope||""}` },
      { id: "findings", name: "Document Findings", icon: "📝", type: "input", requires: ["risk_control_matrix"], canAuto: false, inputs: [{ id: "findings_data", label: "Audit Findings", description: "Describe what you found during testing", required: true, accepts: ["text"] }], outputs: [{ id: "findings_doc", label: "Findings Document", format: "text" }], description: "Document audit findings with evidence.",
        aiPrompt: (ctx) => `Structure audit findings into a formal format.
## AUDIT FINDINGS
| Finding # | Risk Area | Finding | Root Cause | Impact | Risk Rating | Recommendation | Management Response | Due Date |
|---|---|---|---|---|---|---|---|---|

RAW FINDINGS:
${ctx.inputData.findings_data||""}` },
      { id: "management_letter", name: "Generate Management Letter", icon: "📄", type: "output", requires: ["findings"], canAuto: true, inputs: [], outputs: [{ id: "mgmt_letter", label: "Management Letter", format: "docx" }], description: "Draft formal management letter with all findings and recommended actions.",
        aiPrompt: (ctx) => `Draft a formal internal audit management letter.
Format: professional audit communication
Include: executive summary, findings (numbered), recommendations, management responses requested, sign-off.

FINDINGS:
${ctx.previousOutputs.findings||""}` },
    ],
  },

  {
    id: "month_end_close", name: "Month-End Financial Close",
    category: "Finance & Audit", icon: "📅", color: "#F59E0B",
    description: "Structured month-end: trial balance → reconciliations → journals → variance analysis → management pack.",
    businessObjective: "Close the books accurately within the agreed timeline. No unreconciled items. No surprises in management reporting.",
    industries: ["banking","manufacturing","retail","consulting"],
    estimatedTime: "25–45 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "trial_balance", name: "Load Trial Balance", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "tb_data", label: "Trial Balance", description: "Current period trial balance", required: true, accepts: [".xlsx",".csv","text"], memoryKey: "trial_balance" }], outputs: [{ id: "tb_parsed", label: "Trial Balance", format: "text" }], description: "Load current period trial balance.",
        aiPrompt: (ctx) => `Parse trial balance. Identify: total debits, total credits, any imbalance, key account groups (Revenue, COGS, OpEx, Assets, Liabilities, Equity). Report data quality issues.

DATA:
${ctx.inputData.tb_data||""}` },
      { id: "variance_analysis", name: "Variance Analysis", icon: "📊", type: "analyse", requires: ["trial_balance"], canAuto: true, inputs: [{ id: "budget_data", label: "Budget / Prior Period (optional)", description: "For variance comparison", required: false, accepts: [".xlsx","text"] }], outputs: [{ id: "variance_report", label: "Variance Analysis", format: "text" }], description: "Compare actuals to budget and prior period.",
        aiPrompt: (ctx) => `Perform variance analysis.
## VARIANCE ANALYSIS
| Line Item | Budget | Actual | Variance | Var% | Prior Period | YoY | Commentary |
|---|---|---|---|---|---|---|---|

## KEY VARIANCES
Top 5 favourable and unfavourable with root cause.

DATA:
${ctx.previousOutputs.trial_balance||""}
BUDGET:
${ctx.inputData.budget_data||"Not provided — use estimates"}` },
      { id: "close_checklist", name: "Month-End Checklist", icon: "✅", type: "output", requires: ["variance_analysis"], canAuto: true, inputs: [], outputs: [{ id: "close_pack", label: "Close Pack", format: "xlsx" }], description: "Generate month-end close workbook and checklist.",
        aiPrompt: (ctx) => `Output ONLY JSON for month-end close workbook:
{"sheets":[{"name":"Trial Balance","headers":["Account Code","Account Name","Debit","Credit","Net","vs Budget","Commentary"],"rows":[]},{"name":"Variance Analysis","headers":["Line Item","Budget","Actual","Variance","Var%","Commentary"],"rows":[]},{"name":"Close Checklist","headers":["#","Task","Owner","Due","Status","Notes"],"rows":[["1","Post all journals","Finance","","Open",""],["2","Reconcile all balance sheet accounts","Finance","","Open",""],["3","Clear AP open items","AP","","Open",""],["4","Accrue uninvoiced costs","Finance","","Open",""],["5","Review P&L for unusual items","CFO","","Open",""],["6","Distribute management accounts","Finance","","Open",""]]}]}

DATA:
${ctx.previousOutputs.variance_analysis||""}` },
    ],
  },

  {
    id: "vendor_recon", name: "Vendor Reconciliation",
    category: "Finance & Audit", icon: "🔄", color: "#10B981",
    description: "Match vendor statements to ledger balances. Identify differences, resolve disputes, close open items.",
    businessObjective: "Every vendor balance is confirmed. Every discrepancy is investigated. Every disputed item has a resolution plan.",
    industries: ["manufacturing","retail","banking"],
    estimatedTime: "15–25 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "load_statement", name: "Load Vendor Statement", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "vendor_statement", label: "Vendor Statement", required: true, accepts: [".xlsx",".csv","text"], description: "Vendor's statement of account", memoryKey: "vendor_statement" }, { id: "ledger_balance", label: "Ledger Balance", required: true, accepts: [".xlsx","text"], description: "Your AP ledger for this vendor" }], outputs: [], description: "Load vendor statement and your ledger.",
        aiPrompt: (ctx) => `Parse vendor statement and ledger. Identify: vendor balance per statement, balance per our ledger, opening balances, transactions in period, closing balances.

STATEMENT:
${ctx.inputData.vendor_statement||""}
LEDGER:
${ctx.inputData.ledger_balance||""}` },
      { id: "reconcile", name: "Reconciliation", icon: "⚖️", type: "analyse", requires: ["load_statement"], canAuto: true, inputs: [], outputs: [{ id: "recon_report", label: "Reconciliation", format: "text" }], description: "Match items, identify breaks, classify differences.",
        aiPrompt: (ctx) => `Perform vendor reconciliation.
## RECONCILIATION STATEMENT
Vendor Balance: XX | Our Balance: XX | Difference: XX

## RECONCILING ITEMS
| Item | Vendor | Ledger | Difference | Type | Age | Resolution |
|---|---|---|---|---|---|---|
Types: In Transit | Timing | Dispute | Error | Unknown

## SUMMARY
Explain each difference with recommended action.

DATA:
${ctx.previousOutputs.load_statement||""}` },
    ],
  },

  {
    id: "procurement_review", name: "Procurement Review",
    category: "Operations", icon: "🛒", color: "#06B6D4",
    description: "Review purchase orders, contracts, supplier performance and maverick spend.",
    businessObjective: "Identify savings opportunities, contract compliance issues and supplier risks before they become problems.",
    industries: ["manufacturing","retail","government"],
    estimatedTime: "20–30 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "load_po", name: "Load PO Data", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "po_data", label: "Purchase Order Data", required: true, accepts: [".xlsx",".csv","text"], description: "PO register or procurement report" }], outputs: [], description: "Load purchase order data.",
        aiPrompt: (ctx) => `Parse PO data. Identify: total spend, by supplier, by category, by department, open POs, overdue POs. Flag: POs without contracts, unusually large single POs, split POs below approval threshold.

DATA:
${ctx.inputData.po_data||""}` },
      { id: "maverick_spend", name: "Maverick Spend Analysis", icon: "🔍", type: "analyse", requires: ["load_po"], canAuto: true, inputs: [], outputs: [{ id: "maverick_report", label: "Maverick Spend Report", format: "text" }], description: "Identify spend outside approved suppliers and contracts.",
        aiPrompt: (ctx) => `Identify maverick spend: purchases from non-approved suppliers, purchases without POs, split POs designed to avoid approval limits, contract leakage.
## MAVERICK SPEND ANALYSIS
| Department | Supplier | Amount | Category | Issue | Saving Opportunity |
|---|---|---|---|---|---|

DATA:
${ctx.previousOutputs.load_po||""}` },
    ],
  },

  {
    id: "compliance_review", name: "Compliance Review",
    category: "Compliance & Risk", icon: "⚖️", color: "#F97316",
    description: "Systematic compliance review: policies → controls → evidence → gaps → remediation plan.",
    businessObjective: "Confirm every required control is operating effectively. Every gap is documented. Every remediation is tracked.",
    industries: ["banking","insurance","government","healthcare"],
    estimatedTime: "20–40 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "load_policy", name: "Load Policy / Regulation", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "policy_text", label: "Policy or Regulatory Requirements", required: true, accepts: ["text"], description: "Paste the policy text or regulation requirements" }], outputs: [], description: "Load the policy or regulation being reviewed.",
        aiPrompt: (ctx) => `Extract all requirements from this policy/regulation. Number each requirement. Identify: mandatory vs recommended, testable vs subjective, owner implied.
## REQUIREMENTS EXTRACT
| Req # | Requirement | Type | Priority | Testable? |
|---|---|---|---|---|

POLICY:
${ctx.inputData.policy_text||""}` },
      { id: "control_testing", name: "Evidence & Control Testing", icon: "🔬", type: "input", requires: ["load_policy"], canAuto: false, inputs: [{ id: "evidence_data", label: "Control Evidence", description: "Describe or paste evidence of controls in operation", required: true, accepts: ["text"] }], outputs: [], description: "Provide evidence of controls for testing.",
        aiPrompt: (ctx) => `Test each requirement against the evidence provided.
## CONTROL TESTING RESULTS
| Req # | Requirement | Evidence | Test Result | Finding | Risk | Remediation |
|---|---|---|---|---|---|---|

REQUIREMENTS:
${ctx.previousOutputs.load_policy||""}
EVIDENCE:
${ctx.inputData.evidence_data||""}` },
    ],
  },

  {
    id: "hr_operations", name: "HR Operations Review",
    category: "Operations", icon: "👥", color: "#84CC16",
    description: "Review HR data: headcount, attrition, hiring pipeline, payroll exceptions, training compliance.",
    businessObjective: "Give HR management a complete picture of workforce health in minutes, not hours.",
    industries: ["consulting","banking","manufacturing","retail"],
    estimatedTime: "15–25 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "load_hr", name: "Load HR Data", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "hr_data", label: "HR Data", required: true, accepts: [".xlsx",".csv","text"], description: "Headcount, attrition, hiring, or payroll report" }], outputs: [], description: "Load HR data for review.",
        aiPrompt: (ctx) => `Parse HR data. Extract: total headcount, by department, by grade, recent joiners, recent leavers, open positions, attrition rate, average tenure.

DATA:
${ctx.inputData.hr_data||""}` },
      { id: "hr_analysis", name: "Workforce Analysis", icon: "📊", type: "analyse", requires: ["load_hr"], canAuto: true, inputs: [], outputs: [{ id: "hr_report", label: "HR Report", format: "text" }], description: "Analyse workforce trends, risks and opportunities.",
        aiPrompt: (ctx) => `Analyse HR data for trends, risks and actionable insights.
## WORKFORCE ANALYSIS
## HEADCOUNT SUMMARY
| Department | Headcount | Budget | Variance | Attrition Rate | Open Roles |
|---|---|---|---|---|---|
## ATTRITION ANALYSIS
## HIRING PIPELINE
## KEY RISKS (flight risk, succession gaps, skill gaps)
## RECOMMENDATIONS

DATA:
${ctx.previousOutputs.load_hr||""}` },
    ],
  },

  {
    id: "customer_support", name: "Customer Support Operations",
    category: "Operations", icon: "🎧", color: "#A855F7",
    description: "Monitor support tickets, CSAT, resolution times, agent performance and escalation trends.",
    businessObjective: "Keep every customer promise. Identify every at-risk relationship before it churns.",
    industries: ["retail","consulting","banking","hospitality"],
    estimatedTime: "15–20 minutes",
    defaultConfig: DEFAULT_SLA_CONFIG,
    steps: [
      { id: "load_support", name: "Load Support Data", icon: "📥", type: "input", requires: [], canAuto: false, inputs: [{ id: "support_data", label: "Support Data", required: true, accepts: [".xlsx",".csv","text"], description: "Ticket export from Zendesk, Freshdesk, ServiceNow, etc." }], outputs: [], description: "Load customer support data.",
        aiPrompt: (ctx) => `Parse support data. Extract: total tickets, by status, by priority, average resolution time, CSAT scores, escalation rate, top issue categories.

DATA:
${ctx.inputData.support_data||""}` },
      { id: "support_analysis", name: "Support Performance Analysis", icon: "📊", type: "analyse", requires: ["load_support"], canAuto: true, inputs: [], outputs: [{ id: "support_report", label: "Support Report", format: "text" }], description: "Analyse support performance against SLAs and CSAT targets.",
        aiPrompt: (ctx) => `Analyse customer support performance.
## SUPPORT PERFORMANCE REPORT
## KPI SCORECARD
| Metric | Target | Actual | RAG | vs Last Period |
|---|---|---|---|---|
## AGENT PERFORMANCE
| Agent | Tickets | Resolved | CSAT | Avg Resolution Time | SLA Compliance |
|---|---|---|---|---|---|
## TOP ISSUES
## ESCALATION ANALYSIS
## RECOMMENDATIONS

DATA:
${ctx.previousOutputs.load_support||""}` },
    ],
  },
];
