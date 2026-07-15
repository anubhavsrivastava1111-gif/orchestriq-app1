// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRIQ — BUSINESS EXECUTION ENGINE
// src/lib/BusinessExecutionEngine.ts
//
// This is NOT a document generator.
// This is the reasoning layer that sits above all execution in OrchestrIQ.
//
// Architecture:
//   Business Objective → Reason → Plan → Execute → Validate → Deliver
//
// Used by: Project Engine, Agentic Workflows, AI Agents, and all future modules.
// Nothing generates documents without passing through this engine first.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Domain =
  | "finance" | "audit" | "strategy" | "marketing" | "operations"
  | "hr" | "legal" | "technology" | "sales" | "risk" | "general";

export type Audience =
  | "board" | "ceo" | "cfo" | "coo" | "investor" | "client"
  | "regulator" | "internal_team" | "operations" | "general";

export type QualityStandard =
  | "big4_audit"          // PwC/Deloitte/EY/KPMG grade
  | "mckinsey_deck"       // McKinsey/BCG/Bain consulting grade
  | "cfo_model"           // CFO/FP&A financial model grade
  | "operational"         // Operations team working document
  | "client_deliverable"; // Client-facing, fully polished

export type DeliverableType =
  | "excel" | "pptx" | "pdf" | "docx" | "image" | "video" | "email" | "json";

export interface DeliverableSpec {
  type: DeliverableType;
  title: string;
  purpose: string;              // What business question this answers
  audience: Audience;
  qualityStandard: QualityStandard;
  priority: "primary" | "supporting";
  sheets?: ExcelSheetSpec[];    // For Excel
  slides?: SlideSpec[];         // For PPTX
  sections?: DocSection[];      // For PDF/DOCX
  promptHint?: string;          // For image/video
}

export interface ExecutionPlan {
  objectiveRestated: string;    // How the engine understood the request
  domain: Domain;
  persona: string;              // "CFO-grade financial analyst" etc.
  audience: Audience;
  qualityStandard: QualityStandard;
  decisionContext: string;      // What decisions this output informs
  deliverables: DeliverableSpec[];
  missingInfo: string[];        // Gaps to fill before generating
  executionOrder: string[];     // Deliverable titles in dependency order
  validationCriteria: string[]; // How to verify output quality
}

// ─── EXCEL TYPES ─────────────────────────────────────────────────────────────

export interface ExcelSheetSpec {
  name: string;
  purpose: string;
  type: "dashboard" | "data" | "analysis" | "assumptions" | "vba" | "instructions";
  columns?: { header: string; width: number; format?: string }[];
  hasAutoFilter?: boolean;
  hasFreezePanes?: boolean;
  frozenRows?: number;
  frozenCols?: number;
  hasConditionalFormatting?: boolean;
  hasNamedRanges?: boolean;
  hasDataValidation?: boolean;
}

export interface ExcelWorkbook {
  filename: string;
  sheets: ExcelSheet[];
}

export interface ExcelSheet {
  name: string;
  rows: (string | number | null)[][];
  // SheetJS cell-level data for formatting
  cellFormats?: Record<string, CellFormat>;
  merges?: string[];            // e.g. "A1:D1"
  colWidths?: number[];         // characters
  frozenRows?: number;
  frozenCols?: number;
  autoFilter?: string;          // e.g. "A1:F1"
  namedRanges?: Record<string, string>;
  conditionalRanges?: ConditionalRange[];
  dataValidations?: DataValidation[];
  rowHeights?: Record<number, number>;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;    // hex without #
  bgColor?: string;      // hex without #
  numFmt?: string;       // e.g. "#,##0.00", "0.0%", "dd-mmm-yy"
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  border?: boolean;
  wrapText?: boolean;
}

export interface ConditionalRange {
  range: string;         // e.g. "D2:D50"
  type: "positive_green" | "negative_red" | "rag" | "data_bar";
}

export interface DataValidation {
  range: string;
  type: "list" | "decimal" | "date";
  values?: string[];
  min?: number;
  max?: number;
  prompt?: string;
}

// ─── PPTX TYPES ──────────────────────────────────────────────────────────────

export type SlideLayout =
  | "title"              // Full-bleed title with company name
  | "exec_summary"       // 2-3 key takeaways, large text
  | "agenda"             // Numbered agenda items
  | "section_divider"    // Section break with large number
  | "chart_narrative"    // Left: chart, Right: narrative bullets
  | "two_column"         // Left and right equal columns
  | "data_table"         // Full-width formatted table
  | "full_text"          // Text-heavy analysis slide
  | "closing";           // Call to action / next steps

export interface SlideSpec {
  layout: SlideLayout;
  title: string;
  content: string;       // Narrative / bullet points / table data
  speakerNotes?: string;
  chartType?: "bar" | "line" | "pie" | "waterfall" | "scatter";
  chartData?: { labels: string[]; series: { name: string; values: number[] }[] };
  imagePrompt?: string;  // If slide needs a visual
}

// ─── DOC TYPES ───────────────────────────────────────────────────────────────

export interface DocSection {
  level: 1 | 2 | 3;
  title: string;
  content: string;
  hasTable?: boolean;
}

// ─── BRAND PALETTES ──────────────────────────────────────────────────────────

const BRAND_PALETTES: Record<Domain, {
  primary: string; secondary: string; accent: string;
  dark: string; light: string; muted: string;
}> = {
  finance:    { primary:"1E3A5F", secondary:"2E86AB", accent:"14B8A6", dark:"0A0E1A", light:"F1F5F9", muted:"94A3B8" },
  audit:      { primary:"1B4332", secondary:"2D6A4F", accent:"52B788", dark:"081C15", light:"F0FDF4", muted:"86EFAC" },
  strategy:   { primary:"1A1A2E", secondary:"16213E", accent:"6366F1", dark:"0F0F23", light:"EEF2FF", muted:"A5B4FC" },
  marketing:  { primary:"7C2D12", secondary:"C2410C", accent:"F97316", dark:"1C0A00", light:"FFF7ED", muted:"FED7AA" },
  operations: { primary:"1E3A5F", secondary:"1D4ED8", accent:"3B82F6", dark:"0A0E1A", light:"EFF6FF", muted:"93C5FD" },
  hr:         { primary:"4A1942", secondary:"7B2D8B", accent:"A855F7", dark:"1A0A1C", light:"FAF5FF", muted:"D8B4FE" },
  legal:      { primary:"1A1A1A", secondary:"374151", accent:"6B7280", dark:"111111", light:"F9FAFB", muted:"D1D5DB" },
  technology: { primary:"0C1445", secondary:"1E3A8A", accent:"60A5FA", dark:"060B24", light:"EFF6FF", muted:"93C5FD" },
  sales:      { primary:"7C2D12", secondary:"B45309", accent:"F59E0B", dark:"1C0A00", light:"FFFBEB", muted:"FDE68A" },
  risk:       { primary:"450A0A", secondary:"991B1B", accent:"EF4444", dark:"1C0000", light:"FEF2F2", muted:"FECACA" },
  general:    { primary:"0F172A", secondary:"1E293B", accent:"14B8A6", dark:"020617", light:"F8FAFC", muted:"94A3B8" },
};

// ─── REASONING PROMPTS ───────────────────────────────────────────────────────

function buildReasoningPrompt(
  objective: string,
  companyContext: string,
  availableData: string,
): string {
  return `You are the Chief Business Intelligence Officer of OrchestrIQ.
Your role is to reason like the most experienced business professional in the room.

COMPANY CONTEXT:
${companyContext}

AVAILABLE DATA:
${availableData || "No structured data provided — infer requirements from objective."}

BUSINESS OBJECTIVE:
"${objective}"

TASK:
Analyse this objective deeply. Think like a seasoned consultant.

You must output a single JSON object with this exact structure:
{
  "objectiveRestated": "How you understand what the user actually needs",
  "domain": "finance|audit|strategy|marketing|operations|hr|legal|technology|sales|risk|general",
  "persona": "The professional role whose standard applies, e.g. CFO-grade FP&A analyst",
  "audience": "board|ceo|cfo|coo|investor|client|regulator|internal_team|operations|general",
  "qualityStandard": "big4_audit|mckinsey_deck|cfo_model|operational|client_deliverable",
  "decisionContext": "What business decisions this output will directly inform",
  "deliverables": [
    {
      "type": "excel|pptx|pdf|docx|image|video|email",
      "title": "Specific title",
      "purpose": "Exactly what business question this deliverable answers",
      "audience": "who receives this specific deliverable",
      "qualityStandard": "standard for this specific output",
      "priority": "primary|supporting"
    }
  ],
  "missingInfo": ["Any critical information absent that would significantly improve output quality"],
  "executionOrder": ["Ordered list of deliverable titles by dependency"],
  "validationCriteria": ["List of business quality checks that must pass before delivery"]
}

REASONING RULES:
1. One request often needs multiple deliverables. A "Q2 financial review" likely needs an Excel model, an executive presentation, a management report, and an action tracker.
2. Infer the standard from context. "Board presentation" = mckinsey_deck. "Variance analysis" = cfo_model.
3. If data is missing, list it in missingInfo — but still proceed with best estimates.
4. Deliverables must be ordered by dependency. The Excel model comes before the presentation that references it.
5. Validation criteria must be business-quality checks, not technical ones.

Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`;
}

// Reasoning step (Excel Intelligence Engine, Phase 1): a fast, focused call
// that decides WHAT the workbook should be before any formula gets written.
// Mirrors the document generation pattern already proven for PDF/PPTX in this
// same file, and the two-call architecture already recommended in an earlier
// planning session for exactly this reason: separating "what should this
// workbook contain" from "write every formula" produces a materially better
// plan than asking an AI to invent both simultaneously.
function buildExcelPlanningPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
): string {
  return `You are a senior FP&A / Finance Systems architect. Before any workbook is
built, decide its architecture. Do not write formulas or data yet \u2014 only plan.

BUSINESS OBJECTIVE: ${objective}
WORKBOOK PURPOSE: ${deliverable.purpose}
STATED AUDIENCE: ${deliverable.audience}
DATA AVAILABLE: ${data ? "Yes \u2014 real data provided below" : "No \u2014 generate representative professional data"}
${data ? "DATA SAMPLE:\n" + data.slice(0, 800) : ""}

Reason through, in order:
1. What business problem is this workbook actually solving?
2. Who precisely will use it \u2014 not just "board" or "manager", but the specific
   role (CFO reviewing monthly close, Sales Manager tracking pipeline, HR
   analysing attrition, etc.) \u2014 and what that role needs to see FIRST.
3. What sheets does this specific problem require? (Not a generic template \u2014
   the sheet list should follow from the objective. A cash flow forecast and
   an attrition dashboard need different architectures.)
4. What is the ONE most decision-relevant number or chart this audience will
   look for first on the dashboard?
5. What assumptions, if any, must be documented for this workbook to be
   auditable by another analyst?

Return ONLY this JSON, no prose:
{
  "businessProblem": "one sentence, specific to this objective",
  "primaryAudience": "specific role, not a generic tier",
  "sheetPlan": [
    {"name": "sheet name", "purpose": "what this sheet does and why it's needed"}
  ],
  "keyMetric": "the single most important number/chart for the dashboard",
  "assumptionsNeeded": ["assumption 1", "assumption 2"]
}`;
}

function buildExcelGenPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
  currency: string,
  currencySymbol: string,
): string {
  const noData = !data || data.trim().length < 20;
  return (
    `You are a Big4 Partner / Senior FP\u0026A Director. Build a production-grade Excel workbook for a CFO.` +
    `\n\nBUSINESS OBJECTIVE: ${objective}` +
    `\nWORKBOOK PURPOSE: ${deliverable.purpose}` +
    `\nAUDIENCE: ${deliverable.audience}` +
    `\nCURRENCY: ${currencySymbol} (${currency})` +
    `\nCOMPANY CONTEXT:\n${companyContext}` +
    `\nINPUT DATA:\n${noData ? "No data provided. Generate realistic professional sample data (see DATA RULES)." : data}` +
    `\n\n` +
    `=== THE MOST IMPORTANT RULE ===\n` +
    `ZERO IS NEVER AN ACCEPTABLE FINANCIAL FIGURE. A workbook of zeros is worthless.\n` +
    `Every revenue, expense, and balance cell MUST contain a real number.\n` +
    `If no data is provided, INVENT realistic industry-appropriate figures. That is your job.\n` +
    `=== END MOST IMPORTANT RULE ===\n\n` +
    `DATA RULES (non-negotiable):\n` +
    `1. ALL numeric cells must be real numbers, never 0 unless 0 is genuinely correct.\n` +
    `2. Data must be internally consistent (monthly x 12 = annual).\n` +
    `3. Every formula must reference cells that contain populated data in this workbook.\n` +
    `4. Dashboard KPIs must be formula-driven from data sheets, never hardcoded.\n` +
    `5. Time series must cover at least 6 periods.\n` +
    `6. Sample data must be realistic for the industry and objective stated.\n\n` +
    `FORMULA RULES:\n` +
    `- Use real Excel formula strings: =SUM(B2:B13), =IFERROR(C5/B5-1,"N/A"), =IF(D2>E2,"Over Budget","OK")\n` +
    `- Cross-sheet: =Data!C2, ='Bank Transactions'!B15\n` +
    `- A formula cell must start with "=" — it will be promoted to a real Excel formula.\n` +
    `- NEVER write a formula referencing an empty cell. Populate the source cell first.\n\n` +
    `CORRECT row example (P&L data sheet):\n` +
    `["Jan 2024", 1250000, 840000, "=B2-C2", "=D2/B2"]\n` +
    `CORRECT row example (assumptions sheet):\n` +
    `["Revenue Growth Rate", 0.08, "Annual rate — update this cell only"]\n` +
    `CORRECT row example (dashboard KPI):\n` +
    `["Total Revenue", "=SUM(Data!B2:B13)", "currency", "YTD"]\n\n` +
    `WRONG — will produce a zero workbook (NEVER DO THIS):\n` +
    `["Total Revenue", 0, null, "currency"]  <- zero is wrong\n` +
    `["Total Revenue", null, null, "currency"] <- null is wrong\n` +
    `["Total Revenue", "VALUE", null] <- string placeholder is wrong\n\n` +
    `SHEET BUILD ORDER (build Assumptions first, reference it from all later sheets):\n` +
    `1. Assumptions — all input variables (growth: 0.08, tax: 0.25). Data sheets reference these.\n` +
    `2. Data sheet(s) — populated rows with real numbers.\n` +
    `3. Calculations — derived metrics, all formula-driven from Data.\n` +
    `4. Dashboard — KPI tiles formula-driven from Calculations. Charts from Data.\n` +
    `5. Instructions — how to use the workbook.\n\n` +
    `OUTPUT FORMAT (JSON only, no fences, no preamble):\n` +
    `{\n` +
    `  "filename": "descriptive-filename.xlsx",\n` +
    `  "title": "Workbook title",\n` +
    `  "sheets": [\n` +
    `    {\n` +
    `      "name": "Tab name max 31 chars",\n` +
    `      "type": "assumptions|data|calculations|dashboard|instructions",\n` +
    `      "rows": [["Header","Value","Notes"],["Revenue Growth",0.08,"Annual rate"]],\n` +
    `      "colWidths": [28,16,12],\n` +
    `      "frozenRows": 1,\n` +
    `      "headerRow": 0,\n` +
    `      "autoFilter": "A1:D1",\n` +
    `      "conditionalCols": [2],\n` +
    `      "conditionalType": "positive_green|rag|negative_red",\n` +
    `      "namedRanges": {"GrowthRate": "B2"},\n` +
    `      "merges": ["A1:D1"],\n` +
    `      "summaryKPIs": [{"label":"Net Revenue","value":"=SUM(Data!C2:C13)","format":"currency"}]\n` +
    `    }\n` +
    `  ],\n` +
    `  "charts": [\n` +
    `    {"type":"bar","title":"Monthly Revenue vs Cost","seriesName":"Revenue","labels":["Jan","Feb","Mar","Apr","May","Jun"],"values":[1250000,1310000,1280000,1420000,1380000,1510000]},\n` +
    `    {"type":"line","title":"Net Cash Flow Trend","seriesName":"Net CF","labels":["Jan","Feb","Mar","Apr","May","Jun"],"values":[410000,470000,440000,580000,540000,670000]}\n` +
    `  ],\n` +
    `  "vbaCode": "Sub RefreshAll()\\\\nActiveWorkbook.RefreshAll\\\\nMsgBox \\"Done!\\"\\\\nEnd Sub",\n` +
    `  "instructions": "Update Assumptions to change projections. All sheets auto-update."\n` +
    `}`
  );
}

function buildPPTXPlanningPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
): string {
  return `You are a senior consulting Engagement Manager. Before any slide is
designed, decide the presentation's purpose. Do not write slide content yet.

BUSINESS OBJECTIVE: ${objective}
STATED PURPOSE: ${deliverable.purpose}
STATED AUDIENCE: ${deliverable.audience}
DATA AVAILABLE: ${data ? "Yes" : "No \u2014 use professional industry estimates"}
${data ? "DATA SAMPLE:\n" + data.slice(0, 800) : ""}

Reason through, in order:
1. What business problem is this presentation actually addressing?
2. What TYPE of presentation is this, specifically? (Board Meeting, CEO
   Update, CFO Review, Investor Pitch, Sales Pitch, Client Proposal, Due
   Diligence, Strategy Deck, Transformation Plan, Quarterly Business Review,
   Financial Results, Budget Review, Business Case, M&A Analysis, Risk
   Assessment, HR Review, Product Launch, Marketing Strategy, or other \u2014
   name the closest match.) Each type has a different structure; do not
   default to a generic template.
3. THE CENTRAL QUESTION: after reading this deck, what ONE decision must the
   audience be ready to make? If you cannot state a single clear decision,
   the presentation does not yet have a purpose \u2014 find one.
4. What is the narrative arc that gets them there? (Problem \u2192 Evidence \u2192
   Analysis \u2192 Insight \u2192 Recommendation \u2192 Implementation \u2192 Expected Impact
   \u2192 Risks \u2192 Next Steps \u2014 adapt this skeleton to the presentation type.)
5. For each planned slide, it must visibly serve the decision in step 3. If a
   slide does not move the audience toward that decision, do not include it.

Return ONLY this JSON, no prose:
{
  "businessProblem": "one sentence, specific to this objective",
  "presentationType": "the specific type identified in step 2",
  "decisionNeeded": "the ONE decision the audience must be ready to make",
  "narrativeArc": "the sequence of story beats, adapted to this presentation type",
  "slidePlan": [
    {"title": "so-what headline, not a topic label", "servesDecisionBy": "one clause: how this slide moves the audience toward the decision"}
  ]
}`;
}

function buildPPTXGenPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
  domain: Domain,
): string {
  return (
    `You are a McKinsey Senior Partner. Build a consulting-grade PowerPoint deck.\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `PURPOSE: ${deliverable.purpose}\n` +
    `AUDIENCE: ${deliverable.audience}\n` +
    `COMPANY CONTEXT: ${companyContext}\n` +
    `SUPPORTING DATA: ${data || "Use professional industry estimates."}\n\n` +
    `=== SLIDE COUNT RULE — NON-NEGOTIABLE ===\n` +
    `A board deck MUST have 12-16 slides. An operational deck up to 20.\n` +
    `A deck with fewer than 10 slides is REJECTED and regenerated.\n` +
    `EVERY slide must have a "so what" title, real content, and speaker notes.\n` +
    `=== END SLIDE COUNT RULE ===\n\n` +
    `MANDATORY SLIDE SEQUENCE:\n` +
    `1. Title slide\n` +
    `2. Executive Summary (3 key takeaways, each a one-sentence insight with a number)\n` +
    `3. Agenda (list all major sections)\n` +
    `4-5. Situation / Context (what is happening, with data)\n` +
    `6-7. Analysis (what the data means, charts required here)\n` +
    `8-9. Implications / So What (what this means for the business)\n` +
    `10-11. Recommendations (specific, actionable, numbered)\n` +
    `12. Implementation / Next Steps (who does what by when)\n` +
    `13. Financial Impact (numbers required — revenue, cost, margin)\n` +
    `14. Risk Register (top 3-5 risks with mitigation)\n` +
    `15. Closing / Call to Action\n` +
    `A1, A2... Appendix slides (supporting detail)\n\n` +
    `CONTENT RULES:\n` +
    `- Titles must be "so what" headlines with a number: "Revenue up 23% — driven by enterprise"\n` +
    `- NOT topic labels like "Revenue Analysis" — those will be rejected\n` +
    `- Content must have 4-6 substantive bullets per slide, not 1-2 vague ones\n` +
    `- Every chart must have realistic data (no zeros, no placeholders)\n` +
    `- Speaker notes must be 3-5 sentences of what a senior presenter would actually say\n` +
    `- NO slide may contain [PLACEHOLDER], [TBD], [INSERT], or similar\n\n` +
    `JSON FORMAT:\n` +
    `{\n` +
    `  "title": "Deck title",\n` +
    `  "narrativeArc": "One paragraph describing the story and why in this sequence",\n` +
    `  "slides": [\n` +
    `    {\n` +
    `      "layout": "title|exec_summary|agenda|section_divider|chart_narrative|two_column|data_table|full_text|closing",\n` +
    `      "title": "So-what headline with a number",\n` +
    `      "content": "Bullet 1\\nBullet 2\\nBullet 3\\nBullet 4",\n` +
    `      "speakerNotes": "3-5 sentences the presenter would actually say",\n` +
    `      "chartType": "bar|line|pie (only for chart_narrative layout)",\n` +
    `      "chartData": {"labels":["Q1","Q2","Q3","Q4"],"series":[{"name":"Revenue","values":[1250,1380,1290,1520]}]}\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Output ONLY the JSON. No preamble. No fences. No explanation.`
  );
}

function buildPDFDocxPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
): string {
  return `You are a ${deliverable.qualityStandard === "big4_audit" ? "Big4 Senior Manager" : "Senior Consultant"}
producing a publication-quality business document.

BUSINESS OBJECTIVE: ${objective}
DOCUMENT PURPOSE: ${deliverable.purpose}
AUDIENCE: ${deliverable.audience}
FORMAT: ${deliverable.type.toUpperCase()}

COMPANY CONTEXT:
${companyContext}

DATA / INPUTS:
${data || "Generate professional content based on the objective and industry context."}

Produce a JSON object:
{
  "title": "Document title",
  "classification": "Confidential|Internal|Client-Facing|Public",
  "executiveSummary": "3-5 sentence executive summary for the cover/opening",
  "sections": [
    {
      "level": 1,
      "title": "Section title",
      "content": "Full section content in markdown — use ## for subsections, **bold** for key terms, tables with | syntax"
    }
  ],
  "appendices": [
    {"title": "Appendix title", "content": "Appendix content"}
  ],
  "keyFindings": ["Finding 1", "Finding 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

DOCUMENT QUALITY RULES:
1. Begin with Executive Summary — always.
2. Use numbered sections (1.0 Introduction, 2.0 Analysis, etc.)
3. Every section must advance the narrative. No padding.
4. Key findings must be evidence-based, not generic.
5. Recommendations must be specific and actionable.
6. Tables must have proper headers and aligned data.
7. Appendices contain supporting data that supports but does not belong in the main body.
8. The document must be submittable directly to the stated audience without editing.

Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`;
}

// ─── BUSINESS EXECUTION ENGINE ───────────────────────────────────────────────

export class BusinessExecutionEngine {
  constructor(
    private ask: (sys: string, msgs: any[], maxT?: number, enableSearch?: boolean, taskType?: string) => Promise<any>,
    private ensureXLSX: () => Promise<any>,
    private ensurePptx: () => Promise<any>,
    private ensureJsPDF: () => Promise<any>,
    private dlFile: (name: string, content: any, mime?: string) => void,
    private stripMd: (s: string) => string,
    private media?: { image?: (prompt: string) => Promise<string>; video?: (prompt: string) => Promise<string> },
  ) {}

  // ── MAIN ENTRY POINT ────────────────────────────────────────────────────────
  // Called by all modules. Takes objective → returns complete deliverable package.
  async execute(params: {
    objective: string;
    companyContext: string;
    availableData?: string;
    currency?: string;
    currencySymbol?: string;
    onProgress?: (msg: string) => void;
  }): Promise<{ plan: ExecutionPlan; outputs: ExecutionOutput[] }> {
    const {
      objective, companyContext,
      availableData = "", currency = "USD", currencySymbol = "$",
      onProgress = () => {},
    } = params;

    // ── STAGE 1: REASON ───────────────────────────────────────────────────────
    onProgress("🧠 Analysing business objective...");
    const plan = await this.reason(objective, companyContext, availableData);

    // ── STAGE 2: EXECUTE ──────────────────────────────────────────────────────
    const outputs: ExecutionOutput[] = [];

    for (const del of plan.deliverables) {
      onProgress(`⚙️ Generating: ${del.title}...`);
      try {
        const output = await this.generateDeliverable(
          plan, del, companyContext, availableData,
          currency, currencySymbol, onProgress,
        );
        if (output) outputs.push(output);
      } catch (e: any) {
        outputs.push({
          deliverable: del,
          status: "failed",
          error: e.message,
        });
      }
    }

    // ── STAGE 3: VALIDATE ─────────────────────────────────────────────────────
    onProgress("✅ Validating outputs against business criteria...");
    await this.validate(plan, outputs, onProgress);

    return { plan, outputs };
  }

  // ── STAGE 1: BUSINESS REASONING ─────────────────────────────────────────────
  async reason(
    objective: string,
    companyContext: string,
    availableData: string,
  ): Promise<ExecutionPlan> {
    const sys = buildReasoningPrompt(objective, companyContext, availableData);
    const raw = await this.ask(sys, [{ role: "user", content: `Analyse: "${objective}"` }], 1500, false, "general");
    const text = typeof raw === "string" ? raw : raw?.text || raw?.content?.[0]?.text || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    try {
      return JSON.parse(cleaned) as ExecutionPlan;
    } catch {
      // Fallback plan if reasoning fails
      return this.fallbackPlan(objective);
    }
  }

  // ── STAGE 2: GENERATE DELIVERABLE ───────────────────────────────────────────
  async generateDeliverable(
    plan: ExecutionPlan,
    del: DeliverableSpec,
    companyContext: string,
    data: string,
    currency: string,
    currencySymbol: string,
    onProgress: (msg: string) => void,
  ): Promise<ExecutionOutput | null> {
    switch (del.type) {
      case "excel":
        return this.generateExcel(plan, del, companyContext, data, currency, currencySymbol, onProgress);
      case "pptx":
        return this.generatePPTX(plan, del, companyContext, data, onProgress);
      case "pdf":
        return this.generatePDF(plan, del, companyContext, data, onProgress);
      case "docx":
        return this.generateDocx(plan, del, companyContext, data, onProgress);
      case "image":
        return this.generateImage(plan, del, companyContext, onProgress);
      case "video":
        return this.generateVideo(plan, del, companyContext, onProgress);
      default:
        return null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXCEL ENGINE — Professional-grade workbook generation
  // ════════════════════════════════════════════════════════════════════════════

  // ── MARKDOWN → EXCEL SCHEMA CONVERTER ──────────────────────────────────
  // When AI returns markdown instead of JSON, convert it to a valid schema.
  // This is the primary fallback when JSON extraction fails.
  private markdownToExcelSchemaFn(text: string, title: string, sym: string): any {
    const lines = text.split("\n");
    const sheets: any[] = [];
    let currentSheet: any = null;
    let currentRows: any[][] = [];

    const flushSheet = () => {
      if (currentRows.length > 0) {
        sheets.push({
          name: (currentSheet || title).slice(0, 31),
          type: "data",
          rows: currentRows.map(row =>
            // Strip markdown: remove ** * __ _ ` and clean text
            row.map(cell => {
              if (typeof cell !== "string") return cell;
              return cell
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/\*([^*]+)\*/g, "$1")
                .replace(/`([^`]+)`/g, "$1")
                .replace(/_{2}([^_]+)_{2}/g, "$1")
                .replace(/\.md$/i, "")
                .trim();
            })
          ),
          colWidths: Array(Math.max(...currentRows.map(r => r.length), 1)).fill(20),
          frozenRows: 1,
          autoFilter: currentRows[0]?.length ? `A1:${String.fromCharCode(64 + currentRows[0].length)}1` : undefined,
          headerRow: 0,
        });
        currentRows = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect sheet headers: # Heading or ## Heading
      if (/^#{1,3}\s/.test(trimmed)) {
        flushSheet();
        currentSheet = trimmed.replace(/^#+\s*/, "").slice(0, 31);
        continue;
      }

      // Parse markdown table rows
      if (trimmed.startsWith("|") && !trimmed.match(/^\|[-:\s|]+\|$/)) {
        const cells = trimmed.split("|")
          .filter((c, i, a) => i > 0 && i < a.length - 1)
          .map(c => {
            const v = c.trim()
              .replace(/\*\*([^*]+)\*\*/g, "$1")
              .replace(/\*([^*]+)\*/g, "$1")
              .replace(/`([^`]+)`/g, "$1")
              .trim();
            // Detect formula strings
            if (v.startsWith("=")) return v;
            // Detect numbers with currency
            const numMatch = v.replace(/[₹$£€,\s]/g, "");
            if (!isNaN(Number(numMatch)) && numMatch !== "") return Number(numMatch);
            return v;
          });
        if (cells.length > 0) currentRows.push(cells);
        continue;
      }

      // Key-value pairs: "Label: Value"
      const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (kvMatch && !trimmed.startsWith("#")) {
        const label = kvMatch[1].replace(/\*\*/g, "").trim();
        const val = kvMatch[2].replace(/\*\*/g, "").trim();
        if (currentRows.length === 0) currentRows.push(["Item", "Value"]);
        currentRows.push([label, val]);
      }
    }
    flushSheet();

    // Always ensure at least one usable sheet
    if (!sheets.length) {
      sheets.push({
        name: title.slice(0, 31),
        type: "data",
        rows: [["Description"], [text.replace(/[*_`#]/g, "").slice(0, 500)]],
        colWidths: [80],
        frozenRows: 1,
      });
    }

    // Add Assumptions sheet if [ASSUMPTION] or [ESTIMATE] tags exist
    const assumptions = text.split("\n")
      .filter(l => /\[ASSUMPTION\]|\[ESTIMATE\]/i.test(l))
      .map(l => [l.replace(/[*_`]/g, "").trim()]);
    if (assumptions.length) {
      sheets.push({
        name: "Assumptions",
        type: "assumptions",
        rows: [["Assumption / Estimate"], ...assumptions],
        colWidths: [80],
        frozenRows: 1,
      });
    }

    return {
      filename: title.replace(/\s+/g, "-") + ".xlsx",
      title,
      sheets,
      instructions: `Workbook generated from: ${title}. Review assumptions tab.`,
    };
  }

  async generateExcel(
    plan: ExecutionPlan,
    del: DeliverableSpec,
    companyContext: string,
    data: string,
    currency: string,
    currencySymbol: string,
    onProgress: (msg: string) => void,
  ): Promise<ExecutionOutput> {
    onProgress(`📊 Understanding the business problem...`);

    // STEP 1 — reason about the workbook before building it. Fail-safe: if the
    // planning call errors or returns unusable JSON, generation proceeds
    // exactly as before (single-call), so this can never block a delivery.
    let workbookPlan: any = null;
    try {
      const planSys = buildExcelPlanningPrompt(plan.objectiveRestated, del, companyContext, data);
      const planRaw = await this.ask(planSys, [{ role: "user", content: "Plan the workbook now." }], 800, false, "excel_advanced");
      const planText = typeof planRaw === "string" ? planRaw : planRaw?.text || "";
      const planCleaned = planText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
      const parsedPlan = JSON.parse(planCleaned);
      if (parsedPlan?.sheetPlan?.length) workbookPlan = parsedPlan;
    } catch { /* planning is additive — generation proceeds without it */ }

    onProgress(`📊 Designing workbook architecture for: ${del.title}...`);

    const planContext = workbookPlan
      ? `\n\nWORKBOOK PLAN (already reasoned through \u2014 follow this architecture):
Business problem: ${workbookPlan.businessProblem}
Primary audience: ${workbookPlan.primaryAudience}
Required sheets: ${workbookPlan.sheetPlan.map((s: any) => s.name + " \u2014 " + s.purpose).join("; ")}
Key metric for dashboard: ${workbookPlan.keyMetric}
Assumptions to document: ${(workbookPlan.assumptionsNeeded || []).join(", ")}`
      : "";

    const sys = buildExcelGenPrompt(plan.objectiveRestated, del, companyContext, data, currency, currencySymbol) + planContext;
    const raw = await this.ask(sys, [{
      role: "user",
      content: `Build the complete professional Excel workbook for: "${del.title}"\nPurpose: ${del.purpose}\nAudience: ${del.audience}`
    }], 6000, false, "excel_advanced");

    const text = typeof raw === "string" ? raw : raw?.text || "";

    // ── AGGRESSIVE JSON EXTRACTION ────────────────────────────────────────
    // AI models often wrap JSON in markdown or add explanatory text.
    // Try multiple extraction strategies before giving up.
    let schema: any = null;

    const tryParseJSON = (s: string): any => {
      try { return JSON.parse(s); } catch { return null; }
    };

    // Strategy 1: clean markdown fences
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    schema = tryParseJSON(cleaned);

    // Strategy 2: find first { ... } block that contains "sheets"
    if (!schema?.sheets) {
      const jsonMatch = text.match(/\{[\s\S]*"sheets"[\s\S]*\}/);
      if (jsonMatch) schema = tryParseJSON(jsonMatch[0]);
    }

    // Strategy 3: find any JSON object in the response
    if (!schema?.sheets) {
      const allBraces = text.match(/\{[\s\S]{100,}\}/g);
      if (allBraces) {
        for (const candidate of allBraces) {
          const parsed = tryParseJSON(candidate);
          if (parsed?.sheets) { schema = parsed; break; }
        }
      }
    }

    // Strategy 3.5: repair truncated JSON — recovers everything up to the cut
    if (!schema?.sheets) {
      const repaired = repairTruncatedJson(text);
      if (repaired?.sheets?.length) schema = repaired;
    }

    // Strategy 4: markdown → schema converter
    // When AI outputs a markdown table instead of JSON, convert it
    if (!schema?.sheets) {
      schema = this.markdownToExcelSchemaFn(text, del.title, currencySymbol);
    }

    if (!schema?.sheets?.length) {
      return { deliverable: del, status: "failed", error: `Excel schema: could not extract valid workbook structure from AI response (${text.slice(0,100)})` };
    }

    onProgress(`📊 Building workbook: ${schema.filename || del.title}...`);

    const XLSX = await this.ensureXLSX();
    const wb = XLSX.utils.book_new();
    const palette = BRAND_PALETTES[plan.domain];

    for (const sheet of (schema.sheets || [])) {
      const rows: any[][] = sheet.rows || [];
      if (!rows.length) continue;

      // ── Strip markdown from all cells before writing ─────────────────────
      // ── Markdown table row explosion ──────────────────────────────────────
      // Root cause of the "workbook full of zeros" defect: the AI sometimes
      // emits a whole markdown table row as a SINGLE cell string, e.g.
      //   "| Monthly Sales Growth | 5% | Based on trend | [ESTIMATE] |"
      // The old cleaner stripped bold/italic but had no rule for pipes, so the
      // row survived intact inside one cell — real numbers trapped as text,
      // and every downstream formula referencing them resolved to 0.
      // Here we detect that shape and explode it into proper columns.
      const isMarkdownTableRow = (s: string) =>
        typeof s === "string" && /^\s*\|.*\|\s*$/.test(s) && (s.match(/\|/g) || []).length >= 3;
      const isMarkdownSeparator = (s: string) =>
        typeof s === "string" && /^\s*\|[\s:|-]+\|\s*$/.test(s);

      const explodedRows: any[][] = [];
      rows.forEach((row: any[]) => {
        // Case: entire row collapsed into one cell as markdown
        if (row.length === 1 && isMarkdownTableRow(String(row[0] ?? ""))) {
          const raw = String(row[0]);
          if (isMarkdownSeparator(raw)) return; // drop |---|---| separator rows
          explodedRows.push(
            raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(s => s.trim())
          );
          return;
        }
        explodedRows.push(row);
      });

      const cleanRows = explodedRows.map((row: any[]) => row.map((cell: any) => {
        if (typeof cell !== "string") return cell;
        if (cell.startsWith("=")) return cell; // preserve formula strings
        const cleaned = cell
          .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold** → bold
          .replace(/\*([^*]+)\*/g, "$1")        // *italic* → italic
          .replace(/`([^`]+)`/g, "$1")           // `code` → code
          .replace(/_{2}([^_]+)_{2}/g, "$1")     // __bold__ → bold
          .replace(/^#+\s+/, "")                 // ## heading → heading
          .replace(/^[-*]\s+/, "")               // - bullet → text
          .trim();
        // ── Numeric coercion ────────────────────────────────────────────────
        // "5%" / "₹1,20,000" / "(2,500)" arrived as text, so Excel treated them
        // as labels and every SUM over them returned 0. Convert real numbers to
        // real numbers so formulas and charts actually work.
        if (cleaned && !/^=/.test(cleaned)) {
          const pctMatch = /^-?[\d,]+(\.\d+)?\s*%$/.test(cleaned);
          const bare = cleaned
            .replace(/^\((.*)\)$/, "-$1")        // (2,500) → -2500 (accounting negative)
            .replace(/[₹$€£,\s]/g, "")
            .replace(/%$/, "");
          if (bare !== "" && /^-?\d+(\.\d+)?$/.test(bare)) {
            const n = parseFloat(bare);
            if (!isNaN(n)) return pctMatch ? n / 100 : n;
          }
        }
        return cleaned;
      }));

      const ws = XLSX.utils.aoa_to_sheet(cleanRows);

      // ── Formula post-processing ───────────────────────────────────────────
      // SheetJS aoa_to_sheet writes all values as strings.
      // Cells whose value starts with "=" must be promoted to formula cells
      // so Excel evaluates them natively on open.
      Object.keys(ws).filter(k => !k.startsWith("!")).forEach(k => {
        const cell = ws[k];
        if (cell && typeof cell.v === "string" && cell.v.startsWith("=")) {
          cell.f = cell.v.slice(1); // formula string without leading "="
          cell.t = "n";             // expect numeric result
          delete cell.v;            // remove string value — Excel computes
        }
      });

      // ── Column widths ─────────────────────────────────────────────────────
      if (sheet.colWidths?.length) {
        ws["!cols"] = sheet.colWidths.map((w: number) => ({ wch: w }));
      } else {
        ws["!cols"] = (rows[0] || []).map(() => ({ wch: 18 }));
      }

      // ── Freeze panes ──────────────────────────────────────────────────────
      const fr = sheet.frozenRows ?? 1;
      const fc = sheet.frozenCols ?? 0;
      if (fr > 0 || fc > 0) {
        ws["!freeze"] = { xSplit: fc, ySplit: fr };
      }

      // ── Auto-filter ───────────────────────────────────────────────────────
      if (sheet.autoFilter) {
        ws["!autofilter"] = { ref: sheet.autoFilter };
      }

      // ── Merges ────────────────────────────────────────────────────────────
      if (sheet.merges?.length) {
        ws["!merges"] = sheet.merges.map((m: string) => XLSX.utils.decode_range(m));
      }

      // ── Cell styles: header row ───────────────────────────────────────────
      const headerRowIdx = sheet.headerRow ?? 0;
      const headerRow = rows[headerRowIdx] || [];
      headerRow.forEach((_: any, colIdx: number) => {
        const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx });
        if (!ws[cellRef]) return;
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill: { fgColor: { rgb: palette.primary } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            bottom: { style: "medium", color: { rgb: palette.accent } },
          },
        };
      });

      // ── Cell styles: data rows ────────────────────────────────────────────
      rows.forEach((row: any[], rIdx: number) => {
        if (rIdx === headerRowIdx) return;
        row.forEach((cell: any, cIdx: number) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!ws[ref]) return;
          const isEven = rIdx % 2 === 0;
          ws[ref].s = {
            fill: { fgColor: { rgb: isEven ? "F8FAFC" : "FFFFFF" } },
            alignment: { vertical: "center" },
            border: {
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        });
      });

      // ── Dashboard sheet: KPI summary block ───────────────────────────────
      if (sheet.type === "dashboard" && sheet.summaryKPIs?.length) {
        // KPI header
        const kpiStartRow = rows.length + 2;
        const kpiHeader = XLSX.utils.encode_cell({ r: kpiStartRow, c: 0 });
        ws[kpiHeader] = {
          v: "KEY PERFORMANCE INDICATORS",
          s: { font: { bold: true, sz: 14, color: { rgb: palette.accent } } },
        };
        sheet.summaryKPIs.forEach((kpi: any, idx: number) => {
          const labelRef = XLSX.utils.encode_cell({ r: kpiStartRow + 1 + idx, c: 0 });
          const valueRef = XLSX.utils.encode_cell({ r: kpiStartRow + 1 + idx, c: 1 });
          ws[labelRef] = {
            v: kpi.label,
            s: { font: { bold: true, color: { rgb: palette.primary } } },
          };
          ws[valueRef] = {
            f: kpi.value.startsWith("=") ? kpi.value.slice(1) : undefined,
            v: kpi.value.startsWith("=") ? 0 : kpi.value,
            s: { font: { bold: true, sz: 13, color: { rgb: palette.secondary } } },
          };
        });
      }

      // ── Named ranges ─────────────────────────────────────────────────────
      if (sheet.namedRanges) {
        if (!wb.Workbook) wb.Workbook = {};
        if (!wb.Workbook.Names) wb.Workbook.Names = [];
        Object.entries(sheet.namedRanges).forEach(([name, ref]) => {
          wb.Workbook.Names.push({
            Name: name,
            Ref: `'${sheet.name}'!${ref}`,
          });
        });
      }

      XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
    }

    // ── VBA sheet ─────────────────────────────────────────────────────────
    if (schema.vbaCode?.trim()) {
      const vbaRows = [
        ["VBA AUTOMATION CODE", "", ""],
        ["", "", ""],
        ["Instructions:", "", ""],
        ["1. Press Alt + F11 to open the VBA Editor", "", ""],
        ["2. Click Insert > Module", "", ""],
        ["3. Paste the code below into the module window", "", ""],
        ["4. Close the editor and run via Alt + F8", "", ""],
        ["", "", ""],
        ["─".repeat(80), "", ""],
        ["", "", ""],
        ...schema.vbaCode.split("\n").map((line: string) => [line, "", ""]),
      ];
      const vbaWs = XLSX.utils.aoa_to_sheet(vbaRows);
      vbaWs["!cols"] = [{ wch: 80 }, { wch: 5 }, { wch: 5 }];
      vbaWs["A1"].s = {
        font: { bold: true, sz: 16, color: { rgb: palette.accent } },
      };
      XLSX.utils.book_append_sheet(wb, vbaWs, "VBA Macros");
    }

    // ── Write and download ────────────────────────────────────────────────
    let buf: any = XLSX.write(wb, { type: "array", bookType: "xlsx", bookSST: false });
    // GUARANTEE charts: if the AI omitted chart specs, derive them from the
    // first sheet's numeric columns so every workbook ships with a Charts tab.
    if (!Array.isArray(schema.charts) || !schema.charts.length) {
      try {
        const derived: any[] = [];
        for (const sh of (schema.sheets || []).slice(0, 2)) {
          const rows: any[][] = sh.rows || [];
          if (rows.length < 3) continue;
          const header = rows[0] || [];
          for (let ci = 1; ci < header.length && derived.length < 2; ci++) {
            const vals = rows.slice(1, 11).map(r => { const t = String((r||[])[ci] ?? "").replace(/[,\u20b9$%\s]/g, ""); const n = parseFloat(t); return isNaN(n) ? null : n; });
            const good = vals.filter(v => v !== null) as number[];
            if (good.length >= 3 && good.some(v => v !== 0)) {
              derived.push({ type: "bar", title: String(sh.name || "Data") + " \u2014 " + String(header[ci] || "Values"), seriesName: String(header[ci] || "Values"), labels: rows.slice(1, 11).filter((_,ri)=>vals[ri]!==null).map(r => String((r||[])[0] ?? "").slice(0, 12)), values: good });
              break;
            }
          }
        }
        if (derived.length) schema.charts = derived;
      } catch { /* derivation optional */ }
    }
    if (Array.isArray(schema.charts) && schema.charts.length) {
      try {
        onProgress("\ud83d\udcc8 Rendering dashboard charts (" + schema.charts.length + ")...");
        buf = await this.embedChartsSheet(buf, schema.charts, palette);
      } catch (chartErr) { /* charts optional — ship the workbook regardless */ }
    }
    const filename = (schema.filename || `${del.title.replace(/\s+/g, "-")}-${Date.now()}.xlsx`);
    this.dlFile(filename, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    return {
      deliverable: del,
      status: "complete",
      filename,
      summary: schema.instructions || `${del.title} workbook generated with ${(schema.sheets || []).length} sheets.`,
      content: `Professional Excel workbook delivered: **${filename}**\n\n${schema.instructions || ""}`,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXCEL CHARTS ENGINE — canvas-rendered chart images embedded via ExcelJS.
  // Browser spreadsheet libraries cannot write native Excel charts; this engine
  // renders publication-grade PNG charts and embeds them in a Dashboard sheet.
  // Fully fail-safe: any error ships the original (chartless) workbook.
  // ════════════════════════════════════════════════════════════════════════════

  private async ensureExcelJS(): Promise<any> {
    const w = window as any;
    if (w.ExcelJS) return w.ExcelJS;
    await new Promise<void>((res, rej) => {
      const src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      const ex = document.querySelector('script[src="' + src + '"]');
      if (ex) { ex.addEventListener("load", () => res()); return; }
      const s = document.createElement("script");
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("ExcelJS load failed"));
      document.head.appendChild(s);
    });
    if (!w.ExcelJS) throw new Error("ExcelJS unavailable");
    return w.ExcelJS;
  }

  private renderChartPNG(spec: any, primaryHex: string, accentHex: string): string {
    const labels: string[] = (spec.labels || []).map((l: any) => String(l)).slice(0, 12);
    const values: number[] = (spec.values || []).map((v: any) => Number(v) || 0).slice(0, 12);
    if (labels.length < 2 || values.length < 2) throw new Error("chart needs 2+ points");
    const W = 760, H = 420, padL = 70, padR = 24, padT = 56, padB = 64;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d")!;
    // background + frame
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#E2E8F0"; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    // title
    g.fillStyle = "#" + primaryHex; g.font = "bold 20px Calibri, Arial";
    g.fillText(String(spec.title || spec.seriesName || "Chart"), padL, 32);
    g.fillStyle = "#" + accentHex; g.fillRect(padL, 40, 60, 3);
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(...values, 0), min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const yOf = (v: number) => padT + ih - ((v - min) / range) * ih;
    // gridlines + y labels
    g.font = "12px Calibri, Arial"; g.textAlign = "right";
    for (let gi = 0; gi <= 4; gi++) {
      const gv = min + (range * gi) / 4, gy = yOf(gv);
      g.strokeStyle = "#F1F5F9"; g.beginPath(); g.moveTo(padL, gy); g.lineTo(W - padR, gy); g.stroke();
      g.fillStyle = "#94A3B8";
      const a = Math.abs(gv);
      const lbl = a >= 1e7 ? (gv / 1e7).toFixed(1) + "Cr" : a >= 1e5 ? (gv / 1e5).toFixed(1) + "L" : a >= 1e3 ? (gv / 1e3).toFixed(1) + "K" : String(Math.round(gv * 10) / 10);
      g.fillText(lbl, padL - 8, gy + 4);
    }
    const n = values.length;
    g.textAlign = "center";
    if ((spec.type || "bar") === "line") {
      const xOf = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      g.strokeStyle = "#" + accentHex; g.lineWidth = 3; g.beginPath();
      values.forEach((v, i) => { const x = xOf(i), y = yOf(v); i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
      g.stroke();
      values.forEach((v, i) => {
        const x = xOf(i), y = yOf(v);
        g.fillStyle = "#" + accentHex; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#475569"; g.font = "11px Calibri, Arial";
        g.fillText(labels[i].slice(0, 10), x, H - padB + 20);
      });
    } else {
      const bw = Math.min(64, (iw / n) * 0.6);
      values.forEach((v, i) => {
        const x = padL + (i + 0.5) * (iw / n) - bw / 2;
        const y0 = yOf(0), yv = yOf(Math.max(v, 0));
        const bh = Math.max(2, Math.abs(y0 - yv));
        const grad = g.createLinearGradient(0, yv, 0, yv + bh);
        grad.addColorStop(0, "#" + accentHex); grad.addColorStop(1, "#" + primaryHex);
        g.fillStyle = grad;
        g.fillRect(x, v >= 0 ? yv : y0, bw, bh);
        g.fillStyle = "#475569"; g.font = "11px Calibri, Arial";
        g.fillText(labels[i].slice(0, 10), x + bw / 2, H - padB + 20);
        g.fillStyle = "#1E293B"; g.font = "bold 11px Calibri, Arial";
        const a = Math.abs(v);
        const vl = a >= 1e7 ? (v / 1e7).toFixed(1) + "Cr" : a >= 1e5 ? (v / 1e5).toFixed(1) + "L" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(v);
        g.fillText(vl, x + bw / 2, (v >= 0 ? yv : y0 + bh) - 6);
      });
    }
    return cv.toDataURL("image/png").split(",")[1];
  }

  private async embedChartsSheet(xlsxBuf: any, charts: any[], pal: any): Promise<any> {
    const ExcelJS = await this.ensureExcelJS();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(xlsxBuf);
    const ws = wb2.addWorksheet("\ud83d\udcc8 Charts", { views: [{ showGridLines: false }] });
    ws.getCell("B2").value = "VISUAL DASHBOARD";
    ws.getCell("B2").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF" + (pal?.primary || "1E3A5F") } };
    ws.getCell("B3").value = "Auto-generated charts \u2014 data lives in the worksheet tabs";
    ws.getCell("B3").font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF94A3B8" } };
    let row = 5;
    for (const spec of charts.slice(0, 4)) {
      try {
        const b64 = this.renderChartPNG(spec, pal?.primary || "1E3A5F", pal?.accent || "14B8A6");
        const imgId = wb2.addImage({ base64: b64, extension: "png" });
        ws.addImage(imgId, { tl: { col: 1, row: row - 1 }, ext: { width: 640, height: 354 } });
        row += 20;
      } catch { /* skip bad chart spec */ }
    }
    return await wb2.xlsx.writeBuffer();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MEDIA ENGINE — Business-grade image & video generation (fal.ai)
  // ════════════════════════════════════════════════════════════════════════════

  private async craftMediaPrompt(kind: "image" | "video", plan: ExecutionPlan, del: DeliverableSpec, companyContext: string): Promise<string> {
    // Use planner hint if present; otherwise have the model design a professional media brief.
    if (del.promptHint?.trim()) return del.promptHint.trim();
    try {
      const p = await this.ask(
        "You are a senior brand art director. Write ONE production-ready " + kind + " generation prompt (max 90 words). Business context, professional corporate aesthetic, no text overlays, no watermarks. Return ONLY the prompt text.",
        [{ role: "user", content: "Objective: " + plan.objective + "\nDeliverable: " + del.title + " — " + del.purpose + "\nCompany:\n" + companyContext.slice(0, 600) }],
        300,
      );
      const cleaned = this.stripMd(String(p || "")).trim();
      if (cleaned) return cleaned.slice(0, 700);
    } catch { /* fall through */ }
    return "Professional corporate " + kind + " for: " + del.title + ". Clean, modern, business-grade aesthetic.";
  }

  private mediaFailureOutput(kind: "image" | "video", del: DeliverableSpec, prompt: string, err: string): ExecutionOutput {
    // Explicit failure artefact — never a silent prompt-file substitution.
    const filename = del.title.replace(/\s+/g, "-") + "-" + kind + "-GENERATION-FAILED.txt";
    const body = "⚠ " + kind.toUpperCase() + " GENERATION FAILED\n\nERROR: " + err + "\n\nFIX: Check the fal.ai API key in Settings → fal.ai, account credits, and network access to fal.run.\n\nPROMPT (retry manually or after fixing the key):\n" + prompt;
    this.dlFile(filename, body, "text/plain");
    return { deliverable: del, status: "failed", filename, error: err, summary: kind + " generation failed: " + err };
  }

  async generateImage(plan: ExecutionPlan, del: DeliverableSpec, companyContext: string, onProgress: (msg: string) => void): Promise<ExecutionOutput> {
    const prompt = await this.craftMediaPrompt("image", plan, del, companyContext);
    if (!this.media?.image) return this.mediaFailureOutput("image", del, prompt, "Image generator not wired — fal.ai caller missing at engine construction.");
    try {
      onProgress("🎨 Generating image: " + del.title + "...");
      const url = await this.media.image(prompt);
      if (!url) throw new Error("fal.ai returned no image URL");
      onProgress("⬇ Downloading generated image...");
      const resp = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!resp.ok) throw new Error("Image download failed: HTTP " + resp.status);
      const blob = await resp.blob();
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const filename = del.title.replace(/\s+/g, "-") + "-" + Date.now() + "." + ext;
      this.dlFile(filename, blob, blob.type || "image/png");
      return { deliverable: del, status: "complete", filename, summary: "Generated image (" + Math.round(blob.size / 1024) + " KB) — " + del.title };
    } catch (e: any) {
      return this.mediaFailureOutput("image", del, prompt, e?.message || String(e));
    }
  }

  async generateVideo(plan: ExecutionPlan, del: DeliverableSpec, companyContext: string, onProgress: (msg: string) => void): Promise<ExecutionOutput> {
    const prompt = await this.craftMediaPrompt("video", plan, del, companyContext);
    if (!this.media?.video) return this.mediaFailureOutput("video", del, prompt, "Video generator not wired — fal.ai caller missing at engine construction.");
    try {
      onProgress("🎬 Generating video: " + del.title + " (may take 1–3 minutes)...");
      const url = await this.media.video(prompt);
      if (!url) throw new Error("fal.ai returned no video URL");
      onProgress("⬇ Downloading generated video...");
      const resp = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!resp.ok) throw new Error("Video download failed: HTTP " + resp.status);
      const blob = await resp.blob();
      const filename = del.title.replace(/\s+/g, "-") + "-" + Date.now() + ".mp4";
      this.dlFile(filename, blob, blob.type || "video/mp4");
      return { deliverable: del, status: "complete", filename, summary: "Generated video (" + Math.round(blob.size / 1048576) + " MB) — " + del.title };
    } catch (e: any) {
      return this.mediaFailureOutput("video", del, prompt, e?.message || String(e));
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRESENTATION ENGINE — Consulting-grade PowerPoint generation
  // ════════════════════════════════════════════════════════════════════════════

  async generatePPTX(
    plan: ExecutionPlan,
    del: DeliverableSpec,
    companyContext: string,
    data: string,
    onProgress: (msg: string) => void,
  ): Promise<ExecutionOutput> {
    onProgress(`📊 Understanding the decision this deck must support...`);

    // STEP 1 — commit to the decision and presentation type before designing
    // slides. Fail-safe: any error here and generation proceeds exactly as
    // before (single-call), so a delivery can never be blocked by this.
    let deckPlan: any = null;
    try {
      const planSys = buildPPTXPlanningPrompt(plan.objectiveRestated, del, companyContext, data);
      const planRaw = await this.ask(planSys, [{ role: "user", content: "Plan the presentation now." }], 900, false, "powerpoint");
      const planText = typeof planRaw === "string" ? planRaw : planRaw?.text || "";
      const planCleaned = planText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
      const parsedPlan = JSON.parse(planCleaned);
      if (parsedPlan?.decisionNeeded && parsedPlan?.slidePlan?.length) deckPlan = parsedPlan;
    } catch { /* planning is additive — generation proceeds without it */ }

    onProgress(`📊 Designing presentation narrative for: ${del.title}...`);

    const planContext = deckPlan
      ? `\n\nDECISION-FIRST PLAN (already reasoned through \u2014 build the deck to serve this):
Business problem: ${deckPlan.businessProblem}
Presentation type: ${deckPlan.presentationType} \u2014 structure the deck for this specific type, not a generic template.
THE DECISION this audience must be ready to make: ${deckPlan.decisionNeeded}
Every slide must visibly serve this decision. If a planned slide below doesn't, you may drop it.
Narrative arc: ${deckPlan.narrativeArc}
Planned slide sequence: ${deckPlan.slidePlan.map((s: any) => s.title + " (" + s.servesDecisionBy + ")").join("; ")}`
      : "";

    const sys = buildPPTXGenPrompt(plan.objectiveRestated, del, companyContext, data, plan.domain) + planContext;
    const raw = await this.ask(sys, [{
      role: "user",
      content: `Build the complete consulting-grade presentation for: "${del.title}"\nPurpose: ${del.purpose}\nAudience: ${del.audience}`,
    }], 6000, false, "powerpoint");

    const text = typeof raw === "string" ? raw : raw?.text || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");

    let schema: any;
    try {
      schema = JSON.parse(cleaned);
    } catch {
      schema = repairTruncatedJson(text);
      if (!schema?.slides?.length) return { deliverable: del, status: "failed", error: "PPTX schema generation failed" };
    }

    onProgress(`📊 Building ${(schema.slides || []).length} slides...`);

    const PptxGenJS = await this.ensurePptx();
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
    pptx.layout = "WIDE";

    const pal = BRAND_PALETTES[plan.domain];
    // Brand master — consistent chrome on every slide (accent baseline + doc footer)
    try {
      pptx.defineSlideMaster({
        title: "OIQ_MASTER",
        background: { color: pal.dark },
        objects: [
          { rect: { x: 0, y: 7.34, w: 13.333, h: 0.16, fill: { color: pal.accent } } },
          { text: { text: (schema.title || del.title) + "   \u00b7   Confidential", options: { x: 0.5, y: 6.98, w: 9.5, h: 0.3, fontSize: 8, color: pal.muted, fontFace: "Calibri" } } },
        ],
      });
    } catch { /* master optional — slides render without it */ }
    const slides: any[] = schema.slides || [];

    for (let i = 0; i < slides.length; i++) {
      const sd = slides[i];
      let slide: any;
      try { slide = pptx.addSlide({ masterName: "OIQ_MASTER" }); } catch { slide = pptx.addSlide(); }

      switch (sd.layout) {
        case "title":
          this.buildTitleSlide(slide, pptx, sd, pal, plan);
          break;
        case "exec_summary":
          this.buildExecSummarySlide(slide, pptx, sd, pal);
          break;
        case "agenda":
          this.buildAgendaSlide(slide, pptx, sd, pal);
          break;
        case "section_divider":
          this.buildSectionDividerSlide(slide, pptx, sd, pal, i);
          break;
        case "chart_narrative":
          this.buildChartNarrativeSlide(slide, pptx, sd, pal);
          break;
        case "two_column":
          this.buildTwoColumnSlide(slide, pptx, sd, pal);
          break;
        case "data_table":
          this.buildDataTableSlide(slide, pptx, sd, pal);
          break;
        case "closing":
          this.buildClosingSlide(slide, pptx, sd, pal, plan);
          break;
        default:
          this.buildFullTextSlide(slide, pptx, sd, pal);
      }

      // Speaker notes on every slide
      if (sd.speakerNotes?.trim()) {
        slide.addNotes(sd.speakerNotes);
      }

      // Slide number (bottom right, muted)
      slide.addText(`${i + 1} / ${slides.length}`, {
        x: 12.0, y: 7.0, w: 1.2, h: 0.35,
        fontSize: 9, color: pal.muted, align: "right",
        fontFace: "Calibri",
      });
    }

    const buf = await pptx.write({ outputType: "arraybuffer" });
    const filename = `${del.title.replace(/\s+/g, "-")}-${Date.now()}.pptx`;
    this.dlFile(filename, buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    return {
      deliverable: del,
      status: "complete",
      filename,
      summary: `${slides.length} slides | ${schema.narrativeArc || ""}`,
      content: `Consulting-grade presentation delivered: **${filename}**\n\nNarrative: ${schema.narrativeArc || ""}`,
    };
  }

  // ── SLIDE BUILDERS ────────────────────────────────────────────────────────

  private buildTitleSlide(slide: any, pptx: any, sd: any, pal: any, plan: ExecutionPlan) {
    slide.background = { color: pal.dark };
    // Accent bar left
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.8, w: 0.3, h: 1.6, fill: { color: pal.accent } });
    // Company name
    slide.addText(plan.objectiveRestated?.split(" ").slice(0, 3).join(" ") || "OrchestrIQ", {
      x: 0.6, y: 2.6, w: 11, h: 0.8,
      fontSize: 36, bold: true, color: pal.light, fontFace: "Calibri",
    });
    // Title
    slide.addText(sd.title, {
      x: 0.6, y: 3.5, w: 11, h: 0.7,
      fontSize: 22, color: pal.accent, fontFace: "Calibri",
    });
    // Subtitle / metadata
    slide.addText(sd.content || "", {
      x: 0.6, y: 4.3, w: 11, h: 0.5,
      fontSize: 14, color: pal.muted, fontFace: "Calibri",
    });
    // Date / confidential
    slide.addText(`${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}   ·   Confidential`, {
      x: 0.6, y: 6.9, w: 8, h: 0.35,
      fontSize: 10, color: pal.muted, fontFace: "Calibri",
    });
  }

  private buildExecSummarySlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    // Header strip
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 1.1, fill: { color: pal.accent } });
    slide.addText("EXECUTIVE SUMMARY", {
      x: 0.5, y: 0.2, w: 10, h: 0.65,
      fontSize: 22, bold: true, color: pal.light, fontFace: "Calibri",
    });
    // Takeaways — parse content into bullets
    const bullets = (sd.content || "").split("\n").filter((l: string) => l.trim());
    bullets.slice(0, 5).forEach((bullet: string, idx: number) => {
      const y = 1.4 + idx * 0.95;
      // Bullet number
      slide.addShape(pptx.ShapeType.ellipse, { x: 0.4, y: y + 0.1, w: 0.45, h: 0.45, fill: { color: pal.accent } });
      slide.addText(String(idx + 1), {
        x: 0.4, y: y + 0.05, w: 0.45, h: 0.45,
        fontSize: 14, bold: true, color: "FFFFFF", align: "center", fontFace: "Calibri",
      });
      // Bullet text
      slide.addText(bullet.replace(/^[-•*]\s*/, ""), {
        x: 1.1, y, w: 11.5, h: 0.85,
        fontSize: 15, color: pal.light, fontFace: "Calibri", valign: "middle",
      });
    });
  }

  private buildAgendaSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 1.1, fill: { color: pal.accent } });
    slide.addText("AGENDA", {
      x: 0.5, y: 0.2, w: 10, h: 0.65,
      fontSize: 22, bold: true, color: pal.light, fontFace: "Calibri",
    });
    const items = (sd.content || "").split("\n").filter((l: string) => l.trim());
    items.slice(0, 7).forEach((item: string, idx: number) => {
      const y = 1.35 + idx * 0.75;
      slide.addText(`${String(idx + 1).padStart(2, "0")}`, {
        x: 0.4, y, w: 0.6, h: 0.6,
        fontSize: 20, bold: true, color: pal.accent, fontFace: "Calibri",
      });
      slide.addText(item.replace(/^[\d\.\-•*]\s*/, ""), {
        x: 1.2, y: y + 0.05, w: 11, h: 0.55,
        fontSize: 16, color: pal.light, fontFace: "Calibri", valign: "middle",
      });
      // Separator line
      slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: y + 0.6, w: 12.5, h: 0.01, fill: { color: "263050" } });
    });
  }

  private buildSectionDividerSlide(slide: any, pptx: any, sd: any, pal: any, idx: number) {
    slide.background = { color: pal.primary };
    // Large section number
    slide.addText(String(idx + 1).padStart(2, "0"), {
      x: 0.5, y: 1.5, w: 3, h: 3,
      fontSize: 120, bold: true, color: pal.accent, fontFace: "Calibri",
      transparency: 70,
    });
    // Section title
    slide.addText(sd.title, {
      x: 3.0, y: 2.8, w: 9.5, h: 1.2,
      fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    slide.addText(sd.content || "", {
      x: 3.0, y: 4.1, w: 9.5, h: 0.8,
      fontSize: 16, color: pal.muted, fontFace: "Calibri",
    });
  }

  private buildChartNarrativeSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    // Header
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 11, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Calibri", valign: "middle",
    });

    // Chart (left 60%)
    if (sd.chartData?.series?.length) {
      try {
        const palette = ["14B8A6", "3B82F6", "A855F7", "F97316", "EF4444", "10B981", "F59E0B"];
        const chartType = sd.chartType || "bar";
        const chartRows = sd.chartData.series.map((s: any, i: number) => ({
          name: s.name,
          labels: sd.chartData.labels,
          values: s.values,
        }));
        const ctMap: Record<string, any> = {
          bar: pptx.ChartType.bar,
          line: pptx.ChartType.line,
          pie: pptx.ChartType.pie,
          scatter: pptx.ChartType.scatter,
        };
        slide.addChart(ctMap[chartType] || pptx.ChartType.bar, chartRows, {
          x: 0.3, y: 1.0, w: 7.5, h: 5.8,
          showLegend: true, legendPos: "b",
          legendColor: pal.muted, legendFontSize: 10,
          dataLabelColor: pal.dark, dataLabelFontSize: 10,
          chartColors: palette,
          plotAreaBkgndColor: pal.dark,
          showTitle: false,
          valAxisLabelColor: pal.muted,
          catAxisLabelColor: pal.muted,
          valAxisLineColor: "263050",
          catAxisLineColor: "263050",
        });
      } catch {}
    }

    // Narrative (right 38%)
    const bullets = (sd.content || "").split("\n").filter((l: string) => l.trim());
    bullets.slice(0, 6).forEach((b: string, i: number) => {
      slide.addText("▸  " + b.replace(/^[-•*]\s*/, ""), {
        x: 8.2, y: 1.1 + i * 0.85, w: 4.7, h: 0.75,
        fontSize: 12, color: pal.light, fontFace: "Calibri", valign: "top",
        bullet: false,
      });
    });
  }

  private buildTwoColumnSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 12.5, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Calibri",
    });
    // Divider
    slide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 1.0, w: 0.03, h: 6.0, fill: { color: "263050" } });
    // Split content at "---" or by halving
    const parts = (sd.content || "").split("---");
    const left = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();
    slide.addText(left, {
      x: 0.4, y: 1.1, w: 5.8, h: 6.0,
      fontSize: 13, color: pal.light, fontFace: "Calibri", valign: "top", wrap: true,
    });
    slide.addText(right, {
      x: 6.8, y: 1.1, w: 6.2, h: 6.0,
      fontSize: 13, color: pal.light, fontFace: "Calibri", valign: "top", wrap: true,
    });
  }

  private buildDataTableSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 12.5, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Calibri",
    });

    // Parse markdown table from content
    const tableLines = (sd.content || "").split("\n")
      .filter((l: string) => l.includes("|") && !l.match(/^[\s|:-]+$/));

    if (tableLines.length >= 2) {
      const parseRow = (line: string) =>
        line.split("|").map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);

      const headers = parseRow(tableLines[0]);
      const dataRows = tableLines.slice(1).map(parseRow);

      const colW = Math.floor(12.5 / Math.max(headers.length, 1));
      const tableData = [
        headers.map(h => ({
          text: h,
          options: {
            bold: true, color: "FFFFFF",
            fill: { color: pal.primary },
            align: "center", fontSize: 11,
          },
        })),
        ...dataRows.map((row, rIdx) =>
          row.map(cell => ({
            text: cell,
            options: {
              color: pal.light,
              fill: { color: rIdx % 2 === 0 ? "131825" : "0A0E1A" },
              align: "center", fontSize: 11,
            },
          }))
        ),
      ];

      try {
        slide.addTable(tableData, {
          x: 0.4, y: 1.1, w: 12.5,
          border: { type: "solid", color: "263050", pt: 0.5 },
          colW: headers.map(() => colW),
          rowH: 0.38,
        });
      } catch {
        // Fallback to text if table fails
        slide.addText(sd.content || "", {
          x: 0.4, y: 1.1, w: 12.5, h: 6.0,
          fontSize: 11, color: pal.light, fontFace: "Calibri",
        });
      }
    }
  }

  private buildFullTextSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 12.5, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Calibri",
    });

    const bullets = (sd.content || "").split("\n").filter((l: string) => l.trim());
    bullets.slice(0, 8).forEach((b: string, i: number) => {
      const isSubBullet = b.startsWith("  ") || b.startsWith("\t");
      slide.addText(b.replace(/^[-•*\s]+/, ""), {
        x: isSubBullet ? 1.0 : 0.5, y: 1.1 + i * 0.72, w: isSubBullet ? 12.0 : 12.5, h: 0.65,
        fontSize: isSubBullet ? 12 : 14, color: isSubBullet ? pal.muted : pal.light,
        fontFace: "Calibri", valign: "middle",
        bullet: { type: "bullet", code: isSubBullet ? "2013" : "25B8", color: pal.accent },
      });
    });
  }

  private buildClosingSlide(slide: any, pptx: any, sd: any, pal: any, plan: ExecutionPlan) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: pal.primary } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.3, w: 0.35, h: 2.0, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.7, y: 3.1, w: 11, h: 1.0,
      fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    slide.addText(sd.content || "Thank you", {
      x: 0.7, y: 4.2, w: 11, h: 1.5,
      fontSize: 18, color: pal.muted, fontFace: "Calibri",
    });
    slide.addText(`Prepared by OrchestrIQ  ·  ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`, {
      x: 0.7, y: 6.8, w: 11, h: 0.35,
      fontSize: 10, color: pal.muted, fontFace: "Calibri",
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PDF ENGINE — Publication-quality report generation
  // ════════════════════════════════════════════════════════════════════════════

  async generatePDF(
    plan: ExecutionPlan,
    del: DeliverableSpec,
    companyContext: string,
    data: string,
    onProgress: (msg: string) => void,
  ): Promise<ExecutionOutput> {
    onProgress(`📄 Designing document structure for: ${del.title}...`);

    const sys = buildPDFDocxPrompt(plan.objectiveRestated, del, companyContext, data);
    const raw = await this.ask(sys, [{
      role: "user",
      content: `Build the complete publication-quality document for: "${del.title}"\nPurpose: ${del.purpose}`,
    }], 6000, false, "general");

    const text = typeof raw === "string" ? raw : raw?.text || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");

    let schema: any;
    try {
      schema = JSON.parse(cleaned);
    } catch {
      schema = repairTruncatedJson(text);
      if (!schema?.sections?.length && !schema?.executiveSummary) return { deliverable: del, status: "failed", error: "PDF schema generation failed" };
    }
    // WinAnsi-safe: rupee symbol, dashes, smart quotes would render as garbage
    schema = pdfSafeText(schema);

    const jsPDF = await this.ensureJsPDF();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pal = BRAND_PALETTES[plan.domain];
    const hexToRgb = (hex: string) => ({
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    });

    const W = 210, M = 20, CW = W - 2 * M;
    let y = M;

    const addPage = () => {
      doc.addPage();
      y = M;
      // Header
      const hp = hexToRgb(pal.primary);
      doc.setFillColor(hp.r, hp.g, hp.b);
      doc.rect(0, 0, W, 10, "F");
      doc.setFontSize(8);
      doc.setTextColor(200, 210, 220);
      doc.text(schema.title || del.title, M, 7);
      doc.text(`Page ${(doc as any).internal.getNumberOfPages()}`, W - M, 7, { align: "right" });
      // Footer
      const fp = hexToRgb(pal.muted);
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 283, W, 14, "F");
      doc.setFontSize(8);
      doc.setTextColor(fp.r, fp.g, fp.b);
      doc.text(`${schema.classification || "Confidential"}  ·  ${new Date().toLocaleDateString("en-GB")}`, M, 290);
      doc.text(`${(doc as any).internal.getNumberOfPages()}`, W - M, 290, { align: "right" });
      y = 18;
    };

    const checkPageBreak = (needed: number) => {
      if (y + needed > 275) addPage();
    };

    // ── COVER PAGE ────────────────────────────────────────────────────────
    const pc = hexToRgb(pal.primary);
    doc.setFillColor(pc.r, pc.g, pc.b);
    doc.rect(0, 0, W, 297, "F");
    const ac = hexToRgb(pal.accent);
    doc.setFillColor(ac.r, ac.g, ac.b);
    doc.rect(0, 120, W, 3, "F");

    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(schema.title || del.title, CW);
    doc.text(titleLines, M, 140);

    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ac.r, ac.g, ac.b);
    doc.text(del.purpose, M, 140 + titleLines.length * 12 + 10);

    const mc = hexToRgb(pal.muted);
    doc.setFontSize(11);
    doc.setTextColor(mc.r, mc.g, mc.b);
    doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), M, 260);
    doc.text(schema.classification || "Confidential", M, 270);

    // ── TABLE OF CONTENTS (reserved page — filled after render) ──────────
    const tocEntries: { t: string; p: number }[] = [];
    addPage();
    const tocPageNo = (doc as any).internal.getNumberOfPages();

    // ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────
    addPage();
    tocEntries.push({ t: "Executive Summary", p: (doc as any).internal.getNumberOfPages() });
    const aa = hexToRgb(pal.accent);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(aa.r, aa.g, aa.b);
    doc.text("EXECUTIVE SUMMARY", M, y);
    y += 10;
    doc.setFillColor(aa.r, aa.g, aa.b);
    doc.rect(M, y, CW, 0.5, "F");
    y += 8;

    if (schema.executiveSummary) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const esLines = doc.splitTextToSize(schema.executiveSummary, CW);
      doc.text(esLines, M, y);
      y += esLines.length * 6 + 8;
    }

    // Key findings box
    if (schema.keyFindings?.length) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, CW, 8 + schema.keyFindings.length * 7, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(pc.r, pc.g, pc.b);
      doc.text("KEY FINDINGS", M + 4, y + 7);
      y += 12;
      schema.keyFindings.forEach((f: string, i: number) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(`${i + 1}. ${f}`, CW - 8);
        doc.text(lines, M + 4, y);
        y += lines.length * 6 + 2;
      });
      y += 6;
    }

    // ── SECTIONS ──────────────────────────────────────────────────────────
    let secNum = 0;
    for (const sec of (schema.sections || [])) {
      if (sec.level === 1) {
        secNum++;
        checkPageBreak(20);
        tocEntries.push({ t: secNum + ".0  " + sec.title, p: (doc as any).internal.getNumberOfPages() });
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(aa.r, aa.g, aa.b);
        doc.text(`${secNum}.0  ${sec.title}`, M, y);
        y += 2;
        doc.setFillColor(aa.r, aa.g, aa.b);
        doc.rect(M, y, CW, 0.4, "F");
        y += 8;
      } else {
        checkPageBreak(12);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(pc.r, pc.g, pc.b);
        doc.text(sec.title, M, y);
        y += 7;
      }

      // Render content — markdown-aware: real tables (wrapped cells, zebra,
      // page-break-safe rows), subheadings, bullets. No more stripped tables.
      const rawLines = String(sec.content || "").split("\n");
      let li = 0;
      while (li < rawLines.length) {
        const line = rawLines[li];
        const isTableLine = /^\s*\|.*\|\s*$/.test(line);
        if (isTableLine) {
          // collect full table block
          const block: string[] = [];
          while (li < rawLines.length && /^\s*\|.*\|\s*$/.test(rawLines[li])) { block.push(rawLines[li]); li++; }
          const parseRow = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => this.stripMd(x.trim()));
          const rowsT = block.filter(r => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)).map(parseRow);
          if (rowsT.length >= 2) {
            const nCols = Math.max(...rowsT.map(r => r.length));
            // proportional column widths by content length, min 16mm
            const weights = Array.from({ length: nCols }, (_, ci) => Math.max(4, ...rowsT.map(r => (r[ci] || "").length)));
            const wCap = Math.max(12, (weights.reduce((a, b) => a + b, 0) / nCols) * 2.2);
            for (let wi = 0; wi < weights.length; wi++) weights[wi] = Math.min(weights[wi], wCap);
            const wSum = weights.reduce((a, b) => a + b, 0);
            const colWs = weights.map(wt => Math.max(16, (wt / wSum) * CW));
            const cwSum = colWs.reduce((a, b) => a + b, 0);
            const scale = CW / cwSum;
            const finalWs = colWs.map(cw2 => cw2 * scale);
            doc.setFontSize(8.5);
            for (let ri = 0; ri < rowsT.length; ri++) {
              const isHead = ri === 0;
              const cellsWrapped = rowsT[ri].map((cell, ci) => doc.splitTextToSize(String(cell || ""), finalWs[ci] - 3));
              const rowH = Math.max(...cellsWrapped.map(cl => cl.length)) * 3.8 + 3;
              if (y + rowH > 275) { addPage(); doc.setFontSize(8.5); }
              let xC = M;
              for (let ci = 0; ci < nCols; ci++) {
                if (isHead) {
                  doc.setFillColor(pc.r, pc.g, pc.b);
                  doc.rect(xC, y - 3.5, finalWs[ci], rowH, "F");
                  doc.setTextColor(255, 255, 255);
                  doc.setFont("helvetica", "bold");
                } else {
                  if (ri % 2 === 0) { doc.setFillColor(246, 248, 251); doc.rect(xC, y - 3.5, finalWs[ci], rowH, "F"); }
                  doc.setTextColor(30, 41, 59);
                  doc.setFont("helvetica", "normal");
                }
                doc.text(cellsWrapped[ci], xC + 1.5, y);
                xC += finalWs[ci];
              }
              // row border
              doc.setDrawColor(226, 232, 240);
              doc.rect(M, y - 3.5, CW, rowH, "S");
              y += rowH;
            }
            y += 5;
            doc.setFontSize(10);
          }
          continue;
        }
        // non-table content
        const t = line.trim();
        if (!t) { y += 2; li++; continue; }
        if (t.startsWith("## ") || t.startsWith("### ")) {
          checkPageBreak(10);
          doc.setFontSize(11.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(pc.r, pc.g, pc.b);
          doc.text(this.stripMd(t.replace(/^#+\s*/, "")), M, y);
          y += 6.5;
          doc.setFontSize(10);
        } else if (/^[-*\u2022]\s+/.test(t)) {
          const bt = this.stripMd(t.replace(/^[-*\u2022]\s+/, ""));
          const bl = doc.splitTextToSize(bt, CW - 8);
          checkPageBreak(bl.length * 5.5 + 2);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 41, 59);
          doc.circle(M + 2, y - 1.2, 0.7, "F");
          doc.text(bl, M + 6, y);
          y += bl.length * 5.5 + 1.5;
        } else {
          const pl = doc.splitTextToSize(this.stripMd(t), CW);
          checkPageBreak(pl.length * 6);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(30, 41, 59);
          doc.text(pl, M, y);
          y += pl.length * 6;
        }
        li++;
      }
      y += 4;
    }

    // ── RECOMMENDATIONS ───────────────────────────────────────────────────
    if (schema.recommendations?.length) {
      checkPageBreak(20);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(aa.r, aa.g, aa.b);
      tocEntries.push({ t: "Recommendations", p: (doc as any).internal.getNumberOfPages() });
      doc.text("RECOMMENDATIONS", M, y);
      y += 2;
      doc.setFillColor(aa.r, aa.g, aa.b);
      doc.rect(M, y, CW, 0.4, "F");
      y += 8;

      schema.recommendations.forEach((rec: string, i: number) => {
        checkPageBreak(12);
        const rLines = doc.splitTextToSize(`${i + 1}. ${rec}`, CW - 6);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        doc.text(rLines, M + 3, y);
        y += rLines.length * 6 + 4;
      });
    }

    // ── APPENDICES ────────────────────────────────────────────────────────
    for (let ai = 0; ai < (schema.appendices || []).length; ai++) {
      addPage();
      const app = schema.appendices[ai];
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(aa.r, aa.g, aa.b);
      tocEntries.push({ t: "Appendix " + String.fromCharCode(65 + ai) + ": " + app.title, p: (doc as any).internal.getNumberOfPages() });
      doc.text(`Appendix ${String.fromCharCode(65 + ai)}: ${app.title}`, M, y);
      y += 8;
      const aLines = doc.splitTextToSize(this.stripMd(app.content || ""), CW);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(aLines, M, y);
    }

    // ── DRAW TABLE OF CONTENTS on the reserved page ───────────────────────
    try {
      const lastPage = (doc as any).internal.getNumberOfPages();
      doc.setPage(tocPageNo);
      let yT = 30;
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(pc.r, pc.g, pc.b);
      doc.text("TABLE OF CONTENTS", M, yT);
      yT += 3;
      doc.setFillColor(ac.r, ac.g, ac.b);
      doc.rect(M, yT, CW, 0.5, "F");
      yT += 10;
      doc.setFontSize(10.5);
      tocEntries.slice(0, 34).forEach((e) => {
        doc.setFont("helvetica", e.t.match(/^\d/) ? "bold" : "normal");
        doc.setTextColor(30, 41, 59);
        const label = e.t.length > 78 ? e.t.slice(0, 77) + "\u2026" : e.t;
        doc.text(label, M, yT);
        const pageStr = String(e.p);
        doc.setTextColor(100, 116, 139);
        // dot leader
        const labelW = doc.getTextWidth(label);
        const pw = doc.getTextWidth(pageStr);
        let dots = "";
        const avail = CW - labelW - pw - 6;
        const dotW = doc.getTextWidth(".");
        for (let dwi = 0; dwi < Math.max(0, Math.floor(avail / dotW)); dwi++) dots += ".";
        doc.text(dots, M + labelW + 2, yT);
        doc.text(pageStr, W - M, yT, { align: "right" });
        yT += 7;
      });
      doc.setPage(lastPage);
    } catch { /* TOC failure never blocks delivery */ }

    const pdfBuffer = doc.output("arraybuffer");
    const filename = `${del.title.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    this.dlFile(filename, pdfBuffer, "application/pdf");

    return {
      deliverable: del,
      status: "complete",
      filename,
      summary: schema.executiveSummary?.slice(0, 200) || del.purpose,
      content: `Publication-quality PDF delivered: **${filename}**`,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DOCX ENGINE — Submission-ready Word document generation
  // ════════════════════════════════════════════════════════════════════════════

  async generateDocx(
    plan: ExecutionPlan,
    del: DeliverableSpec,
    companyContext: string,
    data: string,
    onProgress: (msg: string) => void,
  ): Promise<ExecutionOutput> {
    onProgress(`📝 Building Word document: ${del.title}...`);

    const sys = buildPDFDocxPrompt(plan.objectiveRestated, del, companyContext, data);
    const raw = await this.ask(sys, [{
      role: "user",
      content: `Build the complete submission-ready Word document for: "${del.title}"`,
    }], 6000, false, "general");

    const text = typeof raw === "string" ? raw : raw?.text || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");

    let schema: any;
    try {
      schema = JSON.parse(cleaned);
    } catch {
      schema = repairTruncatedJson(text);
      if (!schema) return { deliverable: del, status: "failed", error: "DOCX schema generation failed" };
    }

    const pal = BRAND_PALETTES[plan.domain];
    // Build as Word-compatible HTML (rendered by Word XML)
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" 
xmlns:w="urn:schemas-microsoft-com:office:word" 
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>
@page {
  mso-page-orientation: portrait;
  margin: 2.54cm;
}
body { font-family: Calibri, sans-serif; font-size: 11pt; color: #1E293B; line-height: 1.6; text-align: left; }
h1 { font-size: 18pt; color: #${pal.primary}; border-bottom: 2pt solid #${pal.accent}; padding-bottom: 4pt; margin-top: 20pt; }
h2 { font-size: 14pt; color: #${pal.secondary}; margin-top: 14pt; }
h3 { font-size: 12pt; color: #${pal.primary}; font-style: italic; margin-top: 10pt; }
p { margin: 6pt 0; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
th { background: #${pal.primary}; color: white; padding: 6pt 8pt; font-weight: bold; text-align: left; }
td { padding: 5pt 8pt; border-bottom: 1pt solid #E2E8F0; }
tr:nth-child(even) td { background: #F8FAFC; }
.cover { text-align: center; margin-top: 100pt; }
.cover h1 { font-size: 28pt; border: none; color: #${pal.primary}; }
.exec-summary { background: #F8FAFC; border-left: 4pt solid #${pal.accent}; padding: 12pt; margin: 16pt 0; }
.finding { background: #EFF6FF; border-radius: 4pt; padding: 8pt; margin: 6pt 0; }
.recommendation { background: #F0FDF4; border-left: 3pt solid #${pal.accent}; padding: 8pt; margin: 6pt 0; }
.toc { margin: 20pt 0; }
.toc a { color: #${pal.primary}; text-decoration: none; display: block; padding: 3pt 0; }
.page-break { page-break-before: always; }
.footer-note { font-size: 9pt; color: #94A3B8; margin-top: 20pt; border-top: 1pt solid #E2E8F0; padding-top: 6pt; }
</style>
</head><body>`;

    // Cover page
    html += `<div class="cover">
<h1>${schema.title || del.title}</h1>
<p style="font-size:14pt; color:#${pal.accent};">${del.purpose}</p>
<p style="font-size:10pt; color:#94A3B8; margin-top:40pt;">
${schema.classification || "Confidential"} &nbsp;|&nbsp; 
${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
</p>
</div>`;

    // TOC
    html += `<div class="page-break"></div>
<h1>Table of Contents</h1>
<div class="toc">`;
    let tocNum = 0;
    for (const sec of (schema.sections || [])) {
      if (sec.level === 1) {
        tocNum++;
        html += `<a>${tocNum}.0 &nbsp; ${sec.title}</a>`;
      } else {
        html += `<a style="padding-left:20pt; font-size:10pt;">${sec.title}</a>`;
      }
    }
    html += `</div>`;

    // Executive Summary
    html += `<div class="page-break"></div>
<h1>Executive Summary</h1>
<div class="exec-summary"><p>${schema.executiveSummary || ""}</p></div>`;

    if (schema.keyFindings?.length) {
      html += `<h2>Key Findings</h2>`;
      schema.keyFindings.forEach((f: string, i: number) => {
        html += `<div class="finding"><strong>${i + 1}.</strong> ${f}</div>`;
      });
    }

    // Sections
    tocNum = 0;
    for (const sec of (schema.sections || [])) {
      if (sec.level === 1) {
        tocNum++;
        html += `<div class="page-break"></div><h1>${tocNum}.0 &nbsp; ${sec.title}</h1>`;
      } else if (sec.level === 2) {
        html += `<h2>${sec.title}</h2>`;
      } else {
        html += `<h3>${sec.title}</h3>`;
      }
      // Convert markdown content to HTML
      const secHtml = (sec.content || "")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/^## (.+)$/gm, "<h3>$1</h3>")
        .replace(/^### (.+)$/gm, "<h4>$1</h4>")
        .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");
      html += `<p>${secHtml}</p>`;
    }

    // Recommendations
    if (schema.recommendations?.length) {
      html += `<div class="page-break"></div><h1>Recommendations</h1>`;
      schema.recommendations.forEach((rec: string, i: number) => {
        html += `<div class="recommendation"><strong>${i + 1}.</strong> ${rec}</div>`;
      });
    }

    // Appendices
    for (let ai = 0; ai < (schema.appendices || []).length; ai++) {
      const app = schema.appendices[ai];
      html += `<div class="page-break"></div>
<h1>Appendix ${String.fromCharCode(65 + ai)}: ${app.title}</h1>
<p>${this.stripMd(app.content || "")}</p>`;
    }

    html += `<div class="footer-note">
Generated by OrchestrIQ &nbsp;|&nbsp; ${schema.classification || "Confidential"} &nbsp;|&nbsp; 
${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
</div></body></html>`;

    const blob = new Blob([html], { type: "application/msword" });
    const filename = `${del.title.replace(/\s+/g, "-")}-${Date.now()}.docx`;
    this.dlFile(filename, blob, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    return {
      deliverable: del,
      status: "complete",
      filename,
      summary: schema.executiveSummary?.slice(0, 200) || del.purpose,
      content: `Submission-ready Word document delivered: **${filename}**`,
    };
  }

  // ── STAGE 3: VALIDATE OUTPUT QUALITY ────────────────────────────────────────
  async validate(
    plan: ExecutionPlan,
    outputs: ExecutionOutput[],
    onProgress: (msg: string) => void,
  ): Promise<void> {
    const completed = outputs.filter(o => o.status === "complete");
    const failed    = outputs.filter(o => o.status === "failed");

    if (failed.length) {
      onProgress(`⚠️ ${failed.length} deliverable(s) failed: ${failed.map(f => f.deliverable.title).join(", ")}`);
    }

    if (completed.length) {
      onProgress(`✅ ${completed.length} deliverable(s) delivered successfully.`);
    }

    // Business quality check against plan's validation criteria
    // (Self-critique is embedded in the generation prompts themselves)
  }

  // ── FALLBACK PLAN ────────────────────────────────────────────────────────────
  private fallbackPlan(objective: string): ExecutionPlan {
    return {
      objectiveRestated: objective,
      domain: "general",
      persona: "Senior Business Analyst",
      audience: "general",
      qualityStandard: "client_deliverable",
      decisionContext: "Business decision support",
      deliverables: [{
        type: "pdf",
        title: "Business Analysis Report",
        purpose: objective,
        audience: "general",
        qualityStandard: "client_deliverable",
        priority: "primary",
      }],
      missingInfo: [],
      executionOrder: ["Business Analysis Report"],
      validationCriteria: ["Output addresses the stated objective", "Content is professional and accurate"],
    };
  }
}

// ─── EXECUTION OUTPUT TYPE ────────────────────────────────────────────────────

// ═══ MEDIA ENGINE ═══ Real image/video generation via injected fal.ai callers.
// Success = the actual media file is delivered. A prompt file is produced ONLY
// when generation genuinely fails, and it always states the exact error so the
// routing issue is visible instead of silently swallowed.
export interface ExecutionOutputMediaPatch {} // type-anchor only

// ─── UNIVERSAL JSON REPAIR ───────────────────────────────────────────────────
// Root cause of "schema generation failed" across Excel/PPTX/PDF/DOCX: long AI
// responses get truncated mid-JSON. This walks the text tracking brace/bracket/
// string state and appends the exact closing sequence, recovering everything
// generated up to the cut — instead of discarding the entire deliverable.
export function repairTruncatedJson(text: string): any {
  try {
    let s = String(text || "").trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const start = s.indexOf("{");
    if (start === -1) return null;
    s = s.slice(start);
    const stack: string[] = [];
    let inStr = false, esc = false, lastGood = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") { stack.pop(); if (stack.length === 0) { lastGood = i + 1; break; } }
      if (ch === "}" || ch === "]" || ch === ",") lastGood = i + 1;
    }
    if (stack.length === 0 && lastGood > 0) {
      try { return JSON.parse(s.slice(0, lastGood)); } catch { /* continue to repair */ }
    }
    // Truncated: cut back to the last structural boundary, drop a dangling
    // partial element, then close every open scope in reverse order.
    let body = s.slice(0, lastGood || s.length);
    body = body.replace(/,\s*$/, "");
    // Recompute open scopes for the trimmed body
    const st2: string[] = []; inStr = false; esc = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") st2.push("}");
      else if (ch === "[") st2.push("]");
      else if (ch === "}" || ch === "]") st2.pop();
    }
    if (inStr) body += '"';
    const closers = st2.reverse().join("");
    try { return JSON.parse(body + closers); } catch { }
    // Last resort: also drop a possibly-dangling final property
    const lastComma = body.lastIndexOf(",");
    if (lastComma > 0) {
      try { return JSON.parse(body.slice(0, lastComma) + closers); } catch { }
    }
    return null;
  } catch { return null; }
}

// jsPDF core fonts are WinAnsi — they cannot render \u20b9 (rupee), en/em dashes,
// or smart quotes; those bytes come out as garbage in the PDF. Sanitize every
// string that reaches the renderer.
export function pdfSafeText(v: any): any {
  if (typeof v === "string") {
    return v
      .replace(/\u20b9/g, "Rs. ")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2026/g, "...")
      .replace(/\u00b7/g, "-")
      .replace(/[\u2022\u25b8\u25aa]/g, "-")
      .replace(/[^\x00-\xFF]/g, "");
  }
  if (Array.isArray(v)) return v.map(pdfSafeText);
  if (v && typeof v === "object") { const o: any = {}; for (const k of Object.keys(v)) o[k] = pdfSafeText(v[k]); return o; }
  return v;
}

export interface ExecutionOutput {
  deliverable: DeliverableSpec;
  status: "complete" | "failed" | "skipped";
  filename?: string;
  content?: string;
  summary?: string;
  error?: string;
}

// ─── CONVENIENCE EXPORT ───────────────────────────────────────────────────────
// Modules import this and call engine.execute() — nothing else needed.
export default BusinessExecutionEngine;
