// ═══════════════════════════════════════════════════════════════════════════════
// AgenticWorkflows.tsx  — Self-contained. All types, engine, templates, and UI in one file.
// No external dependencies beyond TokenAnalytics.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef, useEffect } from "react";
import { saveRecord, estimateCost, estimateTokens } from "./TokenAnalytics";

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 1 — WORKFLOW ENGINE  (types, memory, executor, resolver)
// ───────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// WorkflowEngine.tsx  — Step executor, memory manager, dependency resolver
// Self-contained: no imports from App.tsx directly.
// All platform functions injected via EngineProps.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type WorkflowMode = "auto" | "guided" | "manual";
export type StepStatus = "pending" | "running" | "done" | "blocked" | "skipped" | "waiting_input";
export type StepType = "input" | "validate" | "analyse" | "generate" | "decide" | "output" | "archive";

export interface SLADef { priority: string; hours: number; color: string; }

export interface WorkflowConfig {
  system: string;
  slaDefs: SLADef[];
  columnMappings: Record<string, string>;
  filters: string[];
  namingConventions: Record<string, string>;
  reportNames: string[];
  customRules: string[];
}

export interface WorkflowMemory {
  workflowId: string;
  config: Partial<WorkflowConfig>;
  lastRun?: string;
  uploadedData: Record<string, string>;
  snapshots: { date: string; summary: string }[];
  preferences: Record<string, string>;
}

export interface StepInput {
  id: string;
  label: string;
  description: string;
  required: boolean;
  accepts: string[];         // file types or "text"
  memoryKey?: string;        // if set, load from memory if available
}

export interface StepOutput {
  id: string;
  label: string;
  format: "text" | "xlsx" | "pdf" | "pptx" | "docx" | "email" | "actions";
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  type: StepType;
  requires: string[];
  inputs: StepInput[];
  outputs: StepOutput[];
  canAuto: boolean;
  icon: string;
  aiPrompt?: (ctx: StepContext) => string;
  validate?: (data: Record<string, string>) => { ok: boolean; reason?: string };
}

export interface WorkflowDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  businessObjective: string;
  industries: string[];
  estimatedTime: string;
  steps: WorkflowStep[];
  defaultConfig: WorkflowConfig;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  inputData: Record<string, string>;
  output: string;
  generatedFiles: string[];
  blockedReason?: string;
  startedAt?: string;
  completedAt?: string;
  aiTokens?: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  mode: WorkflowMode;
  startedAt: string;
  completedAt?: string;
  status: "running" | "waiting_input" | "complete" | "blocked" | "cancelled";
  currentStepId: string;
  steps: Record<string, StepResult>;
  outputs: Record<string, string>;
  config: WorkflowConfig;
}

export interface StepContext {
  company: any;
  compData: any;
  config: WorkflowConfig;
  memory: WorkflowMemory;
  inputData: Record<string, string>;
  previousOutputs: Record<string, string>;
  mode: WorkflowMode;
}

// ─── MEMORY MANAGER ───────────────────────────────────────────────────────────

export class WorkflowMemoryManager {
  private key(workflowId: string) { return `oiq-wf-memory-${workflowId}`; }

  load(workflowId: string): WorkflowMemory {
    try {
      const raw = localStorage.getItem(this.key(workflowId));
      if (raw) return JSON.parse(raw);
    } catch {}
    return { workflowId, config: {}, uploadedData: {}, snapshots: [], preferences: {} };
  }

  save(mem: WorkflowMemory): void {
    try { localStorage.setItem(this.key(mem.workflowId), JSON.stringify(mem)); } catch {}
  }

  saveUpload(workflowId: string, stepId: string, data: string): void {
    const mem = this.load(workflowId);
    mem.uploadedData[stepId] = data;
    this.save(mem);
  }

  saveConfig(workflowId: string, config: Partial<WorkflowConfig>): void {
    const mem = this.load(workflowId);
    mem.config = { ...mem.config, ...config };
    this.save(mem);
  }

  addSnapshot(workflowId: string, summary: string): void {
    const mem = this.load(workflowId);
    mem.snapshots = [{ date: new Date().toISOString(), summary }, ...mem.snapshots].slice(0, 30);
    mem.lastRun = new Date().toISOString();
    this.save(mem);
  }

  clearUploads(workflowId: string): void {
    const mem = this.load(workflowId);
    mem.uploadedData = {};
    this.save(mem);
  }
}

export const memoryManager = new WorkflowMemoryManager();

// ─── RUN STORE ────────────────────────────────────────────────────────────────

export function saveRun(run: WorkflowRun): void {
  try {
    const runs: WorkflowRun[] = JSON.parse(localStorage.getItem("oiq-wf-runs") || "[]");
    const updated = [run, ...runs.filter(r => r.id !== run.id)].slice(0, 50);
    localStorage.setItem("oiq-wf-runs", JSON.stringify(updated));
  } catch {}
}

export function loadRuns(): WorkflowRun[] {
  try { return JSON.parse(localStorage.getItem("oiq-wf-runs") || "[]"); } catch { return []; }
}

// ─── STEP EXECUTOR ────────────────────────────────────────────────────────────

export class WorkflowStepExecutor {
  constructor(
    private ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>,
    private ensureXLSX: () => Promise<any>,
    private ensureJsPDF: () => Promise<any>,
    private ensurePptx: () => Promise<any>,
    private dlFile: (name: string, content: any, mime?: string) => void,
    private parseSections: (md: string) => Array<{ title: string; lines: string[] }>,
    private stripMd: (s: string) => string,
  ) {}

  async executeStep(
    step: WorkflowStep,
    ctx: StepContext,
    onProgress: (msg: string) => void,
  ): Promise<StepResult> {
    const result: StepResult = {
      stepId: step.id, status: "running", inputData: ctx.inputData,
      output: "", generatedFiles: [], startedAt: new Date().toISOString(),
    };

    try {
      onProgress(`Running: ${step.name}...`);

      // Validate if required
      if (step.validate) {
        const v = step.validate(ctx.inputData);
        if (!v.ok) {
          result.status = "blocked";
          result.blockedReason = v.reason || "Validation failed";
          return result;
        }
      }

      // Run AI prompt if defined
      if (step.aiPrompt) {
        const sys = step.aiPrompt(ctx);
        const inputText = Object.values(ctx.inputData).join("

");
        const raw = await this.ask(sys, [{ role: "user", content: inputText || "Proceed with available data." }], 3000);
        result.output = typeof raw === "string" ? raw : raw?.text || raw?.content?.[0]?.text || "";
        onProgress(`✓ ${step.name} complete`);
      } else {
        result.output = `Step completed: ${step.name}`;
        onProgress(`✓ ${step.name} complete (no AI required)`);
      }

      result.status = "done";
      result.completedAt = new Date().toISOString();
    } catch (e: any) {
      result.status = "blocked";
      result.blockedReason = `Error: ${e.message || "Unknown"}`;
    }

    return result;
  }

  async generateExcel(
    sheetData: Record<string, string[][]>,
    filename: string,
  ): Promise<void> {
    const XLSX = await this.ensureXLSX();
    const wb = XLSX.utils.book_new();
    Object.entries(sheetData).forEach(([name, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = rows[0]?.map(() => ({ wch: 20 })) || [];
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(u), 200);
  }

  async generateDocx(content: string, title: string, filename: string): Promise<void> {
    const secs = this.parseSections(content);
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:72pt;}h1{font-size:18pt;color:#14B8A6;}h2{font-size:13pt;color:#0D6EFD;}p{line-height:1.5;}table{border-collapse:collapse;width:100%;}th{background:#14B8A6;color:#fff;padding:5pt 8pt;}td{padding:4pt 8pt;border-bottom:1pt solid #ddd;}</style></head><body><h1>${title}</h1>`;
    for (const sec of secs) {
      html += `<h2>${sec.title}</h2>`;
      sec.lines.forEach(ln => { const t = this.stripMd(ln).trim(); if (t) html += `<p>${t}</p>`; });
    }
    html += "</body></html>";
    this.dlFile(filename, html, "application/msword");
  }
}

// ─── DEPENDENCY RESOLVER ──────────────────────────────────────────────────────

export function resolveExecutionOrder(steps: WorkflowStep[]): WorkflowStep[][] {
  // Returns steps grouped by wave (steps in same wave have no dependency on each other)
  const remaining = new Set(steps.map(s => s.id));
  const completed = new Set<string>();
  const waves: WorkflowStep[][] = [];

  let safety = 0;
  while (remaining.size > 0 && safety++ < 20) {
    const wave = steps.filter(s =>
      remaining.has(s.id) &&
      s.requires.every(r => completed.has(r))
    );
    if (!wave.length) break; // Circular dependency guard
    wave.forEach(s => { remaining.delete(s.id); completed.add(s.id); });
    waves.push(wave);
  }
  return waves;
}

export function getMissingInputs(
  step: WorkflowStep,
  inputData: Record<string, string>,
  memory: WorkflowMemory,
): StepInput[] {
  return step.inputs.filter(inp => {
    if (!inp.required) return false;
    const fromMemory = inp.memoryKey ? memory.uploadedData[inp.memoryKey] : undefined;
    const fromInput = inputData[inp.id];
    return !fromMemory && !fromInput;
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 2 — WORKFLOW TEMPLATES  (10 industry-agnostic workflow definitions)
// ───────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// WorkflowTemplates.ts — 10 industry-agnostic workflow definitions
// Adding a new workflow = add one object to WORKFLOW_REGISTRY.
// No UI or engine code lives here.
// ═══════════════════════════════════════════════════════════════════════════════


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

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 3 — UI COMPONENT
// ───────────────────────────────────────────────────────────────────────────────


// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  co: any; compData: any; keys: Record<string, string>; defP: string;
  ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>;
  showToast: (msg: string, type?: string) => void;
  dlFile: (name: string, content: any, mime?: string) => void;
  ensureJsPDF: () => Promise<any>; ensureXLSX: () => Promise<any>;
  ensurePptx: () => Promise<any>; ensureJSZip: () => Promise<any>;
  parseSections: (md: string) => Array<{ title: string; lines: string[] }>;
  stripMd: (s: string) => string;
  actionItems: any[]; setActionItems: (items: any[]) => void;
  brSessions: any[]; setBrSessions: (s: any[]) => void;
  sv: (key: string, val: any) => void;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseExcelJSON(text: string): { sheets: any[] } | null {
  try {
    const c = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const p = JSON.parse(c);
    if (Array.isArray(p?.sheets)) return p;
  } catch {}
  return null;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function AgenticWorkflows({
  co, compData, keys, defP, ask, showToast, dlFile,
  ensureJsPDF, ensureXLSX, ensurePptx, ensureJSZip,
  parseSections, stripMd, actionItems, setActionItems,
  brSessions, setBrSessions, sv
}: Props) {

  const [view, setView] = useState<"library" | "config" | "run" | "result" | "history" | "builder">("library");
  const [selectedWF, setSelectedWF] = useState<WorkflowDef | null>(null);
  const [mode, setMode] = useState<WorkflowMode>("guided");
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [stepInputs, setStepInputs] = useState<Record<string, string>>({});
  const [activeStepId, setActiveStepId] = useState<string>("");
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const executorRef = useRef<WorkflowStepExecutor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentStepRef = useRef<string>("");

  useEffect(() => {
    setRuns(loadRuns());
    executorRef.current = new WorkflowStepExecutor(ask, ensureXLSX, ensureJsPDF, ensurePptx, dlFile, parseSections, stripMd);
  }, [ask, ensureXLSX, ensureJsPDF, ensurePptx, dlFile, parseSections, stripMd]);

  const log = useCallback((msg: string) => setProgressLog(p => [msg, ...p].slice(0, 50)), []);

  // ─── START WORKFLOW ─────────────────────────────────────────────────────────
  const startWorkflow = useCallback((wf: WorkflowDef, wfMode: WorkflowMode) => {
    const mem = memoryManager.load(wf.id);
    const wfConfig: WorkflowConfig = { ...wf.defaultConfig, ...mem.config };
    const runId = Date.now().toString(36);
    const stepResults: Record<string, StepResult> = {};
    wf.steps.forEach(s => {
      stepResults[s.id] = { stepId: s.id, status: "pending", inputData: {}, output: "", generatedFiles: [] };
    });
    const newRun: WorkflowRun = {
      id: runId, workflowId: wf.id, workflowName: wf.name, mode: wfMode,
      startedAt: new Date().toISOString(), status: "running",
      currentStepId: wf.steps[0]?.id || "", steps: stepResults, outputs: {}, config: wfConfig,
    };
    setCurrentRun(newRun);
    setSelectedWF(wf);
    setMode(wfMode);
    setProgressLog([`🚀 Starting: ${wf.name} (${wfMode} mode)`]);
    setStepInputs({});
    setActiveStepId(wf.steps[0]?.id || "");
    setView("run");
    if (wfMode === "auto") {
      setTimeout(() => autoAdvance(newRun, wf, wfConfig, {}), 300);
    }
  }, []);

  // ─── AUTO ADVANCE (Mode 1) ──────────────────────────────────────────────────
  const autoAdvance = useCallback(async (
    run: WorkflowRun, wf: WorkflowDef, cfg: WorkflowConfig, prevOutputs: Record<string, string>
  ) => {
    if (!executorRef.current) return;
    const mem = memoryManager.load(wf.id);
    const waves = resolveExecutionOrder(wf.steps);
    const updatedRun = { ...run };
    const outputs = { ...prevOutputs };

    for (const wave of waves) {
      for (const step of wave) {
        const missing = getMissingInputs(step, stepInputs, mem);
        if (missing.length > 0 && step.type === "input") {
          updatedRun.steps[step.id] = { ...updatedRun.steps[step.id], status: "waiting_input", blockedReason: `Needs: ${missing.map(m => m.label).join(", ")}` };
          updatedRun.status = "waiting_input";
          updatedRun.currentStepId = step.id;
          setCurrentRun({ ...updatedRun });
          setActiveStepId(step.id);
          saveRun(updatedRun);
          log(`⏸ Waiting for input: ${missing.map(m => m.label).join(", ")}`);
          return;
        }

        // Build input data: merge memory + current inputs
        const inputData: Record<string, string> = {};
        step.inputs.forEach(inp => {
          const fromMem = inp.memoryKey ? mem.uploadedData[inp.memoryKey] : undefined;
          inputData[inp.id] = stepInputs[inp.id] || fromMem || "";
        });

        const ctx: StepContext = { company: co, compData, config: cfg, memory: mem, inputData, previousOutputs: outputs, mode: run.mode };
        updatedRun.steps[step.id] = { ...updatedRun.steps[step.id], status: "running" };
        setCurrentRun({ ...updatedRun });
        log(`▶ ${step.name}...`);

        const result = await executorRef.current.executeStep(step, ctx, log);
        updatedRun.steps[step.id] = result;
        if (result.output) outputs[step.id] = result.output;

        // Auto-generate Excel if step produces xlsx and AI output is JSON schema
        if (step.outputs.some(o => o.format === "xlsx") && result.output) {
          const schema = parseExcelJSON(result.output);
          if (schema) {
            try {
              await executorRef.current.generateExcel(
                Object.fromEntries(schema.sheets.map((s: any) => [s.name, [s.headers, ...(s.rows||[])]])),
                `${wf.name.replace(/\s+/g,"-")}-${step.id}-${Date.now()}.xlsx`
              );
              log(`✅ Excel downloaded: ${step.name}`);
              saveRecord({ feature: `Agentic WF — ${wf.name}`, featureIcon: wf.icon, provider: defP, model: defP, inputTokens: estimateTokens(Object.values(inputData).join("")), outputTokens: estimateTokens(result.output), costUsd: estimateCost(defP, estimateTokens(Object.values(inputData).join("")), estimateTokens(result.output)) });
            } catch (e: any) { log(`⚠ Excel generation failed: ${e.message}`); }
          }
        }

        if (result.status === "done") {
          log(`✓ Complete: ${step.name}`);
        } else {
          log(`❌ Blocked: ${step.name} — ${result.blockedReason}`);
        }
        setCurrentRun({ ...updatedRun });
      }
    }

    updatedRun.status = "complete";
    updatedRun.completedAt = new Date().toISOString();
    updatedRun.outputs = outputs;
    setCurrentRun({ ...updatedRun });
    saveRun(updatedRun);
    memoryManager.addSnapshot(wf.id, `Run complete — ${wf.steps.length} steps, ${Object.values(updatedRun.steps).filter(s => s.status === "done").length} succeeded`);
    log(`🎉 Workflow complete: ${wf.name}`);
    showToast(`✅ ${wf.name} complete`, "success");
  }, [co, compData, defP, stepInputs, log, showToast]);

  // ─── PROVIDE INPUT FOR WAITING STEP ────────────────────────────────────────
  const provideInput = useCallback(async () => {
    if (!selectedWF || !currentRun || !config) return;
    setRunning(true);
    const wf = selectedWF;
    const cfg = config;
    const mem = memoryManager.load(wf.id);

    // Persist uploads to memory
    Object.entries(stepInputs).forEach(([key, val]) => {
      if (val) memoryManager.saveUpload(wf.id, key, val);
    });

    try {
      if (mode === "auto") {
        await autoAdvance(currentRun, wf, cfg, currentRun.outputs || {});
      } else {
        // Guided / Manual: execute just the active step
        const step = wf.steps.find(s => s.id === activeStepId);
        if (!step || !executorRef.current) return;
        const inputData: Record<string, string> = {};
        step.inputs.forEach(inp => { inputData[inp.id] = stepInputs[inp.id] || mem.uploadedData[inp.memoryKey||inp.id] || ""; });
        const ctx: StepContext = { company: co, compData, config: cfg, memory: mem, inputData, previousOutputs: currentRun.outputs || {}, mode };
        log(`▶ Running: ${step.name}...`);
        const result = await executorRef.current.executeStep(step, ctx, log);
        const updatedRun: WorkflowRun = { ...currentRun, steps: { ...currentRun.steps, [step.id]: result }, outputs: { ...currentRun.outputs, [step.id]: result.output } };

        // Auto-generate Excel if applicable
        if (step.outputs.some(o => o.format === "xlsx") && result.output) {
          const schema = parseExcelJSON(result.output);
          if (schema && executorRef.current) {
            try { await executorRef.current.generateExcel(Object.fromEntries(schema.sheets.map((s: any) => [s.name, [s.headers, ...(s.rows||[])]])), `${wf.name.replace(/\s+/g,"-")}-${step.id}.xlsx`); log(`✅ Excel downloaded`); } catch {}
          }
        }

        // Advance to next pending step
        const nextStep = wf.steps.find(s => updatedRun.steps[s.id]?.status === "pending" || updatedRun.steps[s.id]?.status === "waiting_input");
        if (nextStep) {
          updatedRun.currentStepId = nextStep.id;
          setActiveStepId(nextStep.id);
          updatedRun.status = "running";
        } else {
          updatedRun.status = "complete";
          updatedRun.completedAt = new Date().toISOString();
          showToast(`✅ ${wf.name} complete`, "success");
        }
        setCurrentRun(updatedRun);
        saveRun(updatedRun);
      }
    } finally { setRunning(false); }
  }, [selectedWF, currentRun, config, stepInputs, mode, activeStepId, co, compData, autoAdvance, log, showToast]);

  // ─── FILE UPLOAD ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File, inputId: string) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["txt","md","csv"].includes(ext||"")) {
      const t = await file.text();
      setStepInputs(p => ({ ...p, [inputId]: t }));
      showToast(`✅ ${file.name} loaded`, "success");
    } else if (["xlsx","xls"].includes(ext||"")) {
      try {
        const XLSX = await ensureXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        let text = "";
        wb.SheetNames.forEach((n: string) => { const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]); if (csv.trim()) text += `
### ${n}
${csv}
`; });
        setStepInputs(p => ({ ...p, [inputId]: text }));
        showToast(`✅ Excel loaded (${wb.SheetNames.length} sheets)`, "success");
      } catch (e: any) { showToast("Excel parse error: " + e.message, "error"); }
    } else { showToast("Use CSV, Excel, or text files.", "warning"); }
  }, [ensureXLSX, showToast]);

  // ─── STYLES ─────────────────────────────────────────────────────────────────
  const S = {
    page:  { flex: 1, overflowY: "auto" as const, background: "#070C18", fontFamily: "'Inter',-apple-system,sans-serif", color: "#F0F4FF" },
    hdr:   { padding: "16px 24px 12px", borderBottom: "1px solid #1C2A40", marginBottom: 14 },
    card:  { background: "#0F1829", border: "1px solid #1C2A40", borderRadius: 8, padding: "14px 16px", marginBottom: 10 },
    inp:   { width: "100%", background: "#141F33", border: "1px solid #1C2A40", borderRadius: 6, padding: "9px 12px", color: "#F0F4FF", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none" },
    btn:   { background: "linear-gradient(135deg,#14B8A6,#6366F1)", border: "none", borderRadius: 6, padding: "10px 18px", color: "#fff", fontSize: 12, fontWeight: 700 as const, cursor: "pointer" as const, fontFamily: "inherit" },
    hBtn:  { background: "none", border: "1px solid #1C2A40", borderRadius: 5, padding: "5px 12px", color: "#8FA8CC", fontSize: 11, cursor: "pointer" as const, fontFamily: "inherit" },
    badge: (c: string) => ({ fontSize: 8, padding: "2px 7px", borderRadius: 10, background: c + "22", color: c, fontWeight: 700 as const }),
    modeBtn: (active: boolean, c: string) => ({ padding: "8px 16px", borderRadius: 7, border: "1px solid " + (active ? c : "#1C2A40"), background: active ? c + "18" : "transparent", color: active ? c : "#4D6A8A", cursor: "pointer" as const, fontFamily: "inherit", fontSize: 11, fontWeight: (active ? 700 : 400) as any }),
    tab: (a: boolean) => ({ padding: "5px 14px", borderRadius: 6, fontSize: 10, fontWeight: 600 as const, border: "1px solid " + (a ? "#14B8A6" : "#1C2A40"), background: a ? "rgba(20,184,166,0.1)" : "transparent", color: a ? "#14B8A6" : "#4D6A8A", cursor: "pointer" as const, fontFamily: "inherit" }),
  };

  const categories = [...new Set(WORKFLOW_REGISTRY.map(w => w.category))];
  const filteredWFs = WORKFLOW_REGISTRY.filter(w => filterCat === "all" || w.category === filterCat);

  // ─── LIBRARY VIEW ───────────────────────────────────────────────────────────
  if (view === "library") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F0F4FF", marginBottom: 2 }}>🔄 Agentic Workflows</div>
            <div style={{ fontSize: 11, color: "#4D6A8A" }}>Complete business process automation · intelligent step-by-step execution · three working modes</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setRuns(loadRuns()); setView("history"); }} style={S.hBtn}>History</button>
            <button onClick={() => setView("builder")} style={{ ...S.hBtn, color: "#A855F7", borderColor: "#A855F744" }}>⚙ Builder</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" as const }}>
          <button onClick={() => setFilterCat("all")} style={S.tab(filterCat === "all")}>All</button>
          {categories.map(c => <button key={c} onClick={() => setFilterCat(c)} style={S.tab(filterCat === c)}>{c}</button>)}
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
          {filteredWFs.map(wf => {
            const mem = memoryManager.load(wf.id);
            const hasMemory = Object.keys(mem.uploadedData).length > 0;
            return (
              <div key={wf.id} style={{ ...S.card, border: `1px solid ${wf.color}44`, cursor: "pointer" }}
                onClick={() => { setSelectedWF(wf); setConfig({ ...wf.defaultConfig, ...memoryManager.load(wf.id).config }); setView("config"); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26 }}>{wf.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F4FF" }}>{wf.name}</div>
                    <div style={{ fontSize: 9, color: "#4D6A8A" }}>{wf.category} · {wf.steps.length} steps · {wf.estimatedTime}</div>
                  </div>
                  {hasMemory && <span style={S.badge("#14B8A6")}>Memory</span>}
                </div>
                <div style={{ fontSize: 10, color: "#8FA8CC", lineHeight: 1.5, marginBottom: 8 }}>{wf.description}</div>
                <div style={{ fontSize: 10, color: "#14B8A6", fontStyle: "italic", marginBottom: 10, lineHeight: 1.4 }}>"{wf.businessObjective}"</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                  {wf.steps.map(s => (
                    <span key={s.id} style={{ fontSize: 7, padding: "2px 5px", borderRadius: 4, background: "#141F33", color: "#4D6A8A" }}>{s.icon} {s.name}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ─── CONFIG VIEW ────────────────────────────────────────────────────────────
  if (view === "config" && selectedWF && config) return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <span style={{ fontSize: 22 }}>{selectedWF.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>{selectedWF.name}</div>
            <div style={{ fontSize: 10, color: "#4D6A8A" }}>{selectedWF.steps.length} steps · {selectedWF.estimatedTime}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#8FA8CC", marginBottom: 14, lineHeight: 1.6, padding: "10px 12px", background: "rgba(20,184,166,0.05)", border: "1px solid rgba(20,184,166,0.15)", borderRadius: 6 }}>
          🎯 <strong style={{ color: "#14B8A6" }}>Objective:</strong> {selectedWF.businessObjective}
        </div>
        {/* Mode selection */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Select Working Mode</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div onClick={() => setMode("auto")} style={{ ...S.modeBtn(mode === "auto", "#14B8A6"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>⚡</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Automatic</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI executes every possible step automatically. Stops only when data is missing.</div>
          </div>
          <div onClick={() => setMode("guided")} style={{ ...S.modeBtn(mode === "guided", "#8B5CF6"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🧭</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Guided</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI explains and assists each step. You confirm before proceeding.</div>
          </div>
          <div onClick={() => setMode("manual")} style={{ ...S.modeBtn(mode === "manual", "#F59E0B"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🔒</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Manual</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI analyses only files you supply. No autonomous requests. Best for confidential data.</div>
          </div>
        </div>
        {/* Configuration */}
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF", marginBottom: 10 }}>⚙ Workflow Configuration</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>System / Platform</label>
              <input value={config.system} onChange={e => setConfig(c => c ? { ...c, system: e.target.value } : c)} style={{ ...S.inp, marginBottom: 0 }} placeholder="SAP / ServiceNow / Jira / Concur..." />
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Expected Report Names</label>
              <input value={config.reportNames.join(", ")} onChange={e => setConfig(c => c ? { ...c, reportNames: e.target.value.split(",").map(s => s.trim()) } : c)} style={{ ...S.inp, marginBottom: 0 }} placeholder="report.xlsx, extract.csv" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>SLA Definitions</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
              {config.slaDefs.map((sla, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: sla.color, minWidth: 100 }}>{sla.priority}</span>
                  <input type="number" value={sla.hours} onChange={e => { const d = [...config.slaDefs]; d[i] = { ...d[i], hours: Number(e.target.value) }; setConfig(c => c ? { ...c, slaDefs: d } : c); }} style={{ ...S.inp, width: 70, marginBottom: 0, padding: "5px 8px" }} />
                  <span style={{ fontSize: 9, color: "#4D6A8A" }}>hrs</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Custom Rules (one per line)</label>
            <textarea value={config.customRules.join("\n")} onChange={e => setConfig(c => c ? { ...c, customRules: e.target.value.split("\n").filter(Boolean) } : c)} rows={3} style={{ ...S.inp, resize: "vertical" as const }} placeholder="e.g. Meal cap: &#8377;500 per person" />
          </div>
          <button onClick={() => { if (config) memoryManager.saveConfig(selectedWF.id, config); showToast("Configuration saved — will be remembered for future runs", "success"); }} style={{ ...S.hBtn, marginTop: 8, color: "#14B8A6", borderColor: "#14B8A633" }}>💾 Save Configuration</button>
        </div>
        {/* Step overview */}
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF", marginBottom: 10 }}>📋 Workflow Steps ({selectedWF.steps.length})</div>
          {selectedWF.steps.map((step, idx) => (
            <div key={step.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #111827", alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#141F33", border: "1px solid #1C2A40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#14B8A6", flexShrink: 0 }}>{idx + 1}</div>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{step.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF" }}>{step.name}</div>
                <div style={{ fontSize: 9, color: "#4D6A8A", lineHeight: 1.4 }}>{step.description}</div>
                {step.inputs.filter(i => i.required).length > 0 && (
                  <div style={{ fontSize: 8, color: "#F59E0B", marginTop: 2 }}>Requires: {step.inputs.filter(i => i.required).map(i => i.label).join(", ")}</div>
                )}
              </div>
              <span style={S.badge(step.canAuto ? "#10B981" : "#F59E0B")}>{step.canAuto ? "Auto" : "Input"}</span>
            </div>
          ))}
        </div>
        <button onClick={() => startWorkflow(selectedWF, mode)} style={{ ...S.btn, width: "100%" }}>▶ Start Workflow — {mode === "auto" ? "⚡ Automatic" : mode === "guided" ? "🧭 Guided" : "🔒 Manual"}</button>
      </div>
    </div>
  );

  // ─── RUN VIEW ───────────────────────────────────────────────────────────────
  if (view === "run" && selectedWF && currentRun && config) {
    const wf = selectedWF;
    const activeStep = wf.steps.find(s => s.id === activeStepId);
    const stepStatuses = currentRun.steps;

    return (
      <div style={S.page}>
        <div style={S.hdr}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => { setCurrentRun(r => r ? { ...r, status: "cancelled" } : null); setView("library"); }} style={{ ...S.hBtn, color: "#EF4444", borderColor: "#EF444433" }}>✕ Cancel</button>
            <span style={{ fontSize: 18 }}>{wf.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F0F4FF" }}>{wf.name}</div>
              <div style={{ fontSize: 9, color: "#4D6A8A" }}>{mode} mode · {new Date(currentRun.startedAt).toLocaleTimeString()}</div>
            </div>
            <span style={S.badge(currentRun.status === "complete" ? "#10B981" : currentRun.status === "waiting_input" ? "#F59E0B" : currentRun.status === "blocked" ? "#EF4444" : "#14B8A6")}>{currentRun.status.replace("_", " ")}</span>
          </div>
          {/* Step progress bar */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
            {wf.steps.map(step => {
              const sr = stepStatuses[step.id];
              const c = sr?.status === "done" ? "#10B981" : sr?.status === "running" ? "#14B8A6" : sr?.status === "blocked" ? "#EF4444" : sr?.status === "waiting_input" ? "#F59E0B" : "#1C2A40";
              return (
                <button key={step.id} onClick={() => setActiveStepId(step.id)} title={step.name}
                  style={{ fontSize: 8, padding: "3px 8px", borderRadius: 4, border: `1px solid ${c}44`, background: c + "18", color: c, cursor: "pointer", fontFamily: "inherit" }}>
                  {step.icon} {step.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "0 24px 24px" }}>
          {/* Progress log */}
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", marginBottom: 6 }}>Activity Log</div>
            <div style={{ maxHeight: 140, overflowY: "auto" as const }}>
              {progressLog.map((entry, i) => (
                <div key={i} style={{ fontSize: 10, color: entry.startsWith("✓") || entry.startsWith("✅") || entry.startsWith("🎉") ? "#10B981" : entry.startsWith("❌") ? "#EF4444" : entry.startsWith("⏸") ? "#F59E0B" : "#8FA8CC", padding: "2px 0", lineHeight: 1.4 }}>{entry}</div>
              ))}
            </div>
          </div>

          {/* Active step input panel */}
          {activeStep && (stepStatuses[activeStep.id]?.status === "waiting_input" || stepStatuses[activeStep.id]?.status === "pending" || mode !== "auto") && currentRun.status !== "complete" && (
            <div style={{ ...S.card, border: `1px solid ${selectedWF.color}44` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{activeStep.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F4FF" }}>{activeStep.name}</div>
                  <div style={{ fontSize: 10, color: "#4D6A8A" }}>{activeStep.description}</div>
                </div>
              </div>
              {mode === "guided" && activeStep.aiPrompt && (
                <div style={{ fontSize: 10, color: "#8B5CF6", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 5, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  🧭 <strong>Guided:</strong> {activeStep.description} — provide the required data below and the AI will execute this step and explain the results.
                </div>
              )}
              {activeStep.inputs.filter(i => i.required || true).map(inp => {
                const mem = memoryManager.load(wf.id);
                const hasMemory = inp.memoryKey && mem.uploadedData[inp.memoryKey];
                return (
                  <div key={inp.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: inp.required ? "#F59E0B" : "#4D6A8A" }}>{inp.label} {inp.required ? "* Required" : "(optional)"}</label>
                      {hasMemory && <span style={{ ...S.badge("#14B8A6"), fontSize: 8 }}>💾 Loaded from memory</span>}
                    </div>
                    <div style={{ fontSize: 9, color: "#4D6A8A", marginBottom: 4 }}>{inp.description}</div>
                    <textarea value={stepInputs[inp.id] || (hasMemory ? mem.uploadedData[inp.memoryKey!] : "")} onChange={e => setStepInputs(p => ({ ...p, [inp.id]: e.target.value }))} placeholder={`Paste ${inp.label} data here, or upload a file below...`} rows={5} style={{ ...S.inp, resize: "vertical" as const, minHeight: 100 }} />
                    {inp.accepts.some(a => a.startsWith(".")) && (
                      <div style={{ marginTop: 4 }}>
                        <input type="file" id={`file-${inp.id}`} style={{ display: "none" }} accept={inp.accepts.join(",")} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, inp.id); e.target.value = ""; }} />
                        <button onClick={() => document.getElementById(`file-${inp.id}`)?.click()} style={{ ...S.hBtn, fontSize: 9, color: "#3B82F6", borderColor: "#3B82F644" }}>📎 Upload {inp.accepts.join("/")}</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button onClick={provideInput} disabled={running} style={{ ...S.btn, width: "100%", opacity: running ? 0.5 : 1 }}>
                {running ? "⏳ Running..." : mode === "auto" ? "▶ Continue Automatic Execution" : `▶ Run: ${activeStep.name}`}
              </button>
            </div>
          )}

          {/* Completed step outputs */}
          {wf.steps.filter(s => stepStatuses[s.id]?.status === "done" && stepStatuses[s.id]?.output).map(step => (
            <div key={step.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>✓ {step.name}</div>
                <div style={{ fontSize: 9, color: "#4D6A8A" }}>{stepStatuses[step.id]?.completedAt ? new Date(stepStatuses[step.id].completedAt!).toLocaleTimeString() : ""}</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => navigator.clipboard.writeText(stepStatuses[step.id]?.output || "")} style={{ ...S.hBtn, fontSize: 9 }}>📋 Copy</button>
                  <button onClick={() => executorRef.current?.generateDocx(stepStatuses[step.id]?.output || "", step.name, step.name.replace(/\s+/g,"-")+".doc")} style={{ ...S.hBtn, fontSize: 9 }}>↓ DOCX</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#8FA8CC", lineHeight: 1.5, maxHeight: 120, overflow: "hidden", cursor: "pointer" }} onClick={() => { setCurrentRun(r => r ? { ...r } : null); }}>{stepStatuses[step.id]?.output?.slice(0, 500)}...</div>
            </div>
          ))}

          {/* Complete banner */}
          {currentRun.status === "complete" && (
            <div style={{ ...S.card, border: "1px solid #10B98144", background: "rgba(16,185,129,0.05)", textAlign: "center" as const, padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981", marginBottom: 4 }}>Workflow Complete</div>
              <div style={{ fontSize: 11, color: "#4D6A8A", marginBottom: 16 }}>{wf.steps.filter(s => stepStatuses[s.id]?.status === "done").length} of {wf.steps.length} steps completed</div>
              <button onClick={() => setView("library")} style={{ ...S.hBtn, marginRight: 8 }}>← Back to Workflows</button>
              <button onClick={() => { setRuns(loadRuns()); setView("history"); }} style={S.hBtn}>View History</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── HISTORY VIEW ───────────────────────────────────────────────────────────
  if (view === "history") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>Workflow History ({runs.length})</div>
          <button onClick={() => { if (confirm("Clear all history?")) { localStorage.removeItem("oiq-wf-runs"); setRuns([]); } }} style={{ ...S.hBtn, color: "#EF4444", borderColor: "#EF444433", marginLeft: "auto" }}>Clear</button>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        {runs.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center" as const, padding: 40, color: "#4D6A8A" }}>No workflow runs yet.</div>
        ) : runs.map(run => {
          const wf = WORKFLOW_REGISTRY.find(w => w.id === run.workflowId);
          const doneSteps = Object.values(run.steps).filter(s => s.status === "done").length;
          return (
            <div key={run.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 18 }}>{wf?.icon || "🔄"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF" }}>{run.workflowName}</div>
                  <div style={{ fontSize: 9, color: "#4D6A8A" }}>{new Date(run.startedAt).toLocaleString()} · {run.mode} · {doneSteps}/{Object.keys(run.steps).length} steps</div>
                </div>
                <span style={S.badge(run.status === "complete" ? "#10B981" : run.status === "cancelled" ? "#EF4444" : "#F59E0B")}>{run.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── BUILDER VIEW (placeholder — full builder is Phase 2) ──────────────────
  if (view === "builder") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>⚙ Workflow Builder</div>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ ...S.card, textAlign: "center" as const, padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF", marginBottom: 8 }}>Custom Workflow Builder</div>
          <div style={{ fontSize: 11, color: "#4D6A8A", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 16px" }}>
            Define your own workflows without writing code.<br />
            Configure: Steps → Inputs → Validations → AI Prompts → Outputs → Dependencies.<br /><br />
            <strong style={{ color: "#14B8A6" }}>Coming in Phase 2.</strong><br />
            For now, use the 10 industry templates above — all are fully configurable.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, maxWidth: 480, margin: "0 auto" }}>
            {["Define Steps","Set Dependencies","Configure Inputs","Add Validations","Write AI Prompts","Set Outputs"].map(f => (
              <div key={f} style={{ background: "#141F33", borderRadius: 6, padding: "8px 10px", fontSize: 9, color: "#4D6A8A" }}>📋 {f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
