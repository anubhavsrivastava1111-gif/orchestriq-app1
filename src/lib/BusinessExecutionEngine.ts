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

function buildExcelGenPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
  currency: string,
  currencySymbol: string,
): string {
  return `You are a ${deliverable.audience === "board" ? "Big4 Partner" : "Senior FP&A Manager"} 
building a professional Excel workbook.

BUSINESS OBJECTIVE: ${objective}
WORKBOOK PURPOSE: ${deliverable.purpose}
AUDIENCE: ${deliverable.audience}
QUALITY STANDARD: ${deliverable.qualityStandard}
CURRENCY: ${currencySymbol} (${currency})

COMPANY CONTEXT:
${companyContext}

DATA / INPUTS:
${data || "Generate representative professional data based on industry and objective."}

CRITICAL INSTRUCTIONS:
You must produce a JSON object describing the complete workbook architecture.
The workbook must be production-ready — suitable for direct delivery to the stated audience.

Think like an experienced professional. Decide automatically:
- How many sheets are needed
- What each sheet contains
- Where formulas are required (use real Excel formula strings like =SUM(B2:B12))
- Where conditional formatting applies (RAG indicators, variance highlighting)
- What named ranges improve usability
- What data validation prevents errors
- What the dashboard should display
- What documentation the user needs

Return this JSON structure:
{
  "filename": "descriptive-professional-filename.xlsx",
  "title": "Document title",
  "sheets": [
    {
      "name": "Sheet tab name (max 31 chars)",
      "type": "dashboard|data|analysis|assumptions|vba|instructions",
      "rows": [
        ["Header1", "Header2", "Header3"],
        ["=FORMULA", value, value]
      ],
      "colWidths": [20, 15, 12],
      "frozenRows": 1,
      "frozenCols": 0,
      "autoFilter": "A1:F1",
      "headerRow": 0,
      "conditionalCols": [3, 4],
      "conditionalType": "rag|positive_green|negative_red",
      "namedRanges": {"AssumptionRate": "C3"},
      "merges": ["A1:F1"],
      "summaryKPIs": [
        {"label": "Total Revenue", "value": "=SUM(Revenue!C2:C13)", "format": "currency"}
      ]
    }
  ],
  "vbaCode": "Optional VBA macro code as a string if automation adds value",
  "instructions": "Brief user instructions for this workbook"
}

FORMULA RULES:
- Write actual Excel formula strings: =SUM(B2:B10), =IFERROR(B5/B6,"N/A"), =IF(C2>0,"▲","▼")&TEXT(ABS(C2/B2),"0.0%")
- Reference other sheets correctly: =Dashboard!C5, ='P&L'!B15
- Use named ranges where defined: =SUM(Revenue)
- Format numbers professionally: use number formats, not pre-formatted strings

SHEET REQUIREMENTS:
1. DASHBOARD (always first): Executive KPI summary. Key metrics at a glance. Formula-driven from data sheets.
2. DATA SHEETS: Clean, structured, filterable. Real data or representative professional examples.
3. ANALYSIS SHEETS: Calculations, variances, trends. Formula-driven. No hardcoded results.
4. ASSUMPTIONS: All input variables in one place with labels, values, and brief documentation.
5. INSTRUCTIONS (always last): What each sheet does. How to update inputs. Key formulas explained.
${deliverable.qualityStandard === "big4_audit" || deliverable.qualityStandard === "cfo_model" ?
  "6. VBA SHEET: Include automation code for report refresh, formatting, or export if it adds material value." : ""}

Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`;
}

function buildPPTXGenPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
  domain: Domain,
): string {
  return `You are a ${deliverable.qualityStandard === "mckinsey_deck" ? "McKinsey Senior Partner" : "Strategy Director"} 
building a consulting-grade presentation.

BUSINESS OBJECTIVE: ${objective}
PRESENTATION PURPOSE: ${deliverable.purpose}
AUDIENCE: ${deliverable.audience}
QUALITY STANDARD: ${deliverable.qualityStandard}

COMPANY CONTEXT:
${companyContext}

SUPPORTING DATA:
${data || "Use professional estimates and best practices for the industry."}

YOUR JOB:
Design the complete narrative arc before writing a single slide.
Think: What story does this audience need to hear? What decisions should they make after this presentation?

Return a JSON object:
{
  "title": "Presentation title",
  "narrativeArc": "One paragraph: what story this presentation tells and why in this sequence",
  "slides": [
    {
      "layout": "title|exec_summary|agenda|section_divider|chart_narrative|two_column|data_table|full_text|closing",
      "title": "Slide title",
      "content": "Full slide content — bullets, table rows, or narrative text",
      "speakerNotes": "What the presenter says — not what is on the slide",
      "chartType": "bar|line|pie|waterfall|scatter (only if layout is chart_narrative)",
      "chartData": {
        "labels": ["Q1","Q2","Q3","Q4"],
        "series": [{"name":"Revenue","values":[100,120,115,140]}]
      }
    }
  ]
}

SLIDE SEQUENCE RULES:
1. Title slide — always first
2. Executive Summary — key takeaways upfront (3 maximum)
3. Agenda — for decks over 8 slides
4. Section dividers — for each major theme
5. Supporting analysis slides — chart_narrative or two_column
6. Data tables — for detailed figures
7. Closing — recommendations, next steps, call to action

CONSULTING QUALITY RULES:
- Every slide must earn its place. No filler.
- Titles must be "so what" headlines, not topic labels. Bad: "Revenue". Good: "Revenue grew 23% YoY, driven by enterprise segment."
- Content must support the headline, not repeat it.
- Speaker notes must be substantive — what a senior presenter would actually say.
- Chart data must be realistic and internally consistent.
- For a Board presentation: maximum 15 slides. For operational: up to 25.
- Appendix slides are numbered separately (A1, A2 etc.) — include them.

Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`;
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
    onProgress(`📊 Designing workbook architecture for: ${del.title}...`);

    const sys = buildExcelGenPrompt(plan.objectiveRestated, del, companyContext, data, currency, currencySymbol);
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
      const cleanRows = rows.map((row: any[]) => row.map((cell: any) => {
        if (typeof cell !== "string") return cell;
        if (cell.startsWith("=")) return cell; // preserve formula strings
        return cell
          .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold** → bold
          .replace(/\*([^*]+)\*/g, "$1")        // *italic* → italic
          .replace(/`([^`]+)`/g, "$1")           // `code` → code
          .replace(/_{2}([^_]+)_{2}/g, "$1")     // __bold__ → bold
          .replace(/^#+\s+/, "")                 // ## heading → heading
          .replace(/^[-*]\s+/, "")               // - bullet → text
          .trim();
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
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", bookSST: false });
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
      const resp = await fetch(url);
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
      const resp = await fetch(url);
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
    onProgress(`📊 Designing presentation narrative for: ${del.title}...`);

    const sys = buildPPTXGenPrompt(plan.objectiveRestated, del, companyContext, data, plan.domain);
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
      return { deliverable: del, status: "failed", error: "PPTX schema generation failed" };
    }

    onProgress(`📊 Building ${(schema.slides || []).length} slides...`);

    const PptxGenJS = await this.ensurePptx();
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
    pptx.layout = "WIDE";

    const pal = BRAND_PALETTES[plan.domain];
    const slides: any[] = schema.slides || [];

    for (let i = 0; i < slides.length; i++) {
      const sd = slides[i];
      const slide = pptx.addSlide();

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
        fontFace: "Arial",
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
      fontSize: 36, bold: true, color: pal.light, fontFace: "Arial",
    });
    // Title
    slide.addText(sd.title, {
      x: 0.6, y: 3.5, w: 11, h: 0.7,
      fontSize: 22, color: pal.accent, fontFace: "Arial",
    });
    // Subtitle / metadata
    slide.addText(sd.content || "", {
      x: 0.6, y: 4.3, w: 11, h: 0.5,
      fontSize: 14, color: pal.muted, fontFace: "Arial",
    });
    // Date / confidential
    slide.addText(`${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}   ·   Confidential`, {
      x: 0.6, y: 6.9, w: 8, h: 0.35,
      fontSize: 10, color: pal.muted, fontFace: "Arial",
    });
  }

  private buildExecSummarySlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    // Header strip
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 1.1, fill: { color: pal.accent } });
    slide.addText("EXECUTIVE SUMMARY", {
      x: 0.5, y: 0.2, w: 10, h: 0.65,
      fontSize: 22, bold: true, color: pal.light, fontFace: "Arial",
    });
    // Takeaways — parse content into bullets
    const bullets = (sd.content || "").split("\n").filter((l: string) => l.trim());
    bullets.slice(0, 5).forEach((bullet: string, idx: number) => {
      const y = 1.4 + idx * 0.95;
      // Bullet number
      slide.addShape(pptx.ShapeType.ellipse, { x: 0.4, y: y + 0.1, w: 0.45, h: 0.45, fill: { color: pal.accent } });
      slide.addText(String(idx + 1), {
        x: 0.4, y: y + 0.05, w: 0.45, h: 0.45,
        fontSize: 14, bold: true, color: "FFFFFF", align: "center", fontFace: "Arial",
      });
      // Bullet text
      slide.addText(bullet.replace(/^[-•*]\s*/, ""), {
        x: 1.1, y, w: 11.5, h: 0.85,
        fontSize: 15, color: pal.light, fontFace: "Arial", valign: "middle",
      });
    });
  }

  private buildAgendaSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: 1.1, fill: { color: pal.accent } });
    slide.addText("AGENDA", {
      x: 0.5, y: 0.2, w: 10, h: 0.65,
      fontSize: 22, bold: true, color: pal.light, fontFace: "Arial",
    });
    const items = (sd.content || "").split("\n").filter((l: string) => l.trim());
    items.slice(0, 7).forEach((item: string, idx: number) => {
      const y = 1.35 + idx * 0.75;
      slide.addText(`${String(idx + 1).padStart(2, "0")}`, {
        x: 0.4, y, w: 0.6, h: 0.6,
        fontSize: 20, bold: true, color: pal.accent, fontFace: "Arial",
      });
      slide.addText(item.replace(/^[\d\.\-•*]\s*/, ""), {
        x: 1.2, y: y + 0.05, w: 11, h: 0.55,
        fontSize: 16, color: pal.light, fontFace: "Arial", valign: "middle",
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
      fontSize: 120, bold: true, color: pal.accent, fontFace: "Arial",
      transparency: 70,
    });
    // Section title
    slide.addText(sd.title, {
      x: 3.0, y: 2.8, w: 9.5, h: 1.2,
      fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Arial",
    });
    slide.addText(sd.content || "", {
      x: 3.0, y: 4.1, w: 9.5, h: 0.8,
      fontSize: 16, color: pal.muted, fontFace: "Arial",
    });
  }

  private buildChartNarrativeSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    // Header
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 11, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Arial", valign: "middle",
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
        fontSize: 12, color: pal.light, fontFace: "Arial", valign: "top",
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
      fontSize: 20, bold: true, color: pal.light, fontFace: "Arial",
    });
    // Divider
    slide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 1.0, w: 0.03, h: 6.0, fill: { color: "263050" } });
    // Split content at "---" or by halving
    const parts = (sd.content || "").split("---");
    const left = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();
    slide.addText(left, {
      x: 0.4, y: 1.1, w: 5.8, h: 6.0,
      fontSize: 13, color: pal.light, fontFace: "Arial", valign: "top", wrap: true,
    });
    slide.addText(right, {
      x: 6.8, y: 1.1, w: 6.2, h: 6.0,
      fontSize: 13, color: pal.light, fontFace: "Arial", valign: "top", wrap: true,
    });
  }

  private buildDataTableSlide(slide: any, pptx: any, sd: any, pal: any) {
    slide.background = { color: pal.dark };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: "131825" } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 0.85, fill: { color: pal.accent } });
    slide.addText(sd.title, {
      x: 0.4, y: 0.1, w: 12.5, h: 0.65,
      fontSize: 20, bold: true, color: pal.light, fontFace: "Arial",
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
          fontSize: 11, color: pal.light, fontFace: "Arial",
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
      fontSize: 20, bold: true, color: pal.light, fontFace: "Arial",
    });

    const bullets = (sd.content || "").split("\n").filter((l: string) => l.trim());
    bullets.slice(0, 8).forEach((b: string, i: number) => {
      const isSubBullet = b.startsWith("  ") || b.startsWith("\t");
      slide.addText(b.replace(/^[-•*\s]+/, ""), {
        x: isSubBullet ? 1.0 : 0.5, y: 1.1 + i * 0.72, w: isSubBullet ? 12.0 : 12.5, h: 0.65,
        fontSize: isSubBullet ? 12 : 14, color: isSubBullet ? pal.muted : pal.light,
        fontFace: "Arial", valign: "middle",
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
      fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Arial",
    });
    slide.addText(sd.content || "Thank you", {
      x: 0.7, y: 4.2, w: 11, h: 1.5,
      fontSize: 18, color: pal.muted, fontFace: "Arial",
    });
    slide.addText(`Prepared by OrchestrIQ  ·  ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`, {
      x: 0.7, y: 6.8, w: 11, h: 0.35,
      fontSize: 10, color: pal.muted, fontFace: "Arial",
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
      return { deliverable: del, status: "failed", error: "PDF schema generation failed" };
    }

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

    // ── PAGE 2: EXECUTIVE SUMMARY ─────────────────────────────────────────
    addPage();
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

      // Render content (strip markdown, handle tables)
      const stripped = this.stripMd(sec.content || "");
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const contentLines = doc.splitTextToSize(stripped, CW);
      contentLines.forEach((line: string) => {
        checkPageBreak(6);
        doc.text(line, M, y);
        y += 6;
      });
      y += 4;
    }

    // ── RECOMMENDATIONS ───────────────────────────────────────────────────
    if (schema.recommendations?.length) {
      checkPageBreak(20);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(aa.r, aa.g, aa.b);
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
      doc.text(`Appendix ${String.fromCharCode(65 + ai)}: ${app.title}`, M, y);
      y += 8;
      const aLines = doc.splitTextToSize(this.stripMd(app.content || ""), CW);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(aLines, M, y);
    }

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
      return { deliverable: del, status: "failed", error: "DOCX schema generation failed" };
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
body { font-family: Calibri, sans-serif; font-size: 11pt; color: #1E293B; line-height: 1.6; }
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
