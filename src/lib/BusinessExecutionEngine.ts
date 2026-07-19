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

// ExcelStyleEngine removed — workbook built directly via SheetJS 

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
  return (
    `You are a world-class expert who adapts to ANY field \u2014 finance, HR, healthcare, ` +
    `education, construction, event planning, logistics, science, retail, law, sports, ` +
    `personal projects, or anything else. Before any workbook is built, decide its architecture.\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `STATED PURPOSE: ${deliverable.purpose}\n` +
    `STATED AUDIENCE: ${deliverable.audience}\n` +
    `DATA AVAILABLE: ${data ? "Yes \u2014 real data provided below" : "No \u2014 generate representative data for this specific field"}\n` +
    `${data ? "DATA SAMPLE:\n" + data.slice(0, 800) : ""}\n\n` +
    `Reason through, in order:\n` +
    `1. WHAT FIELD IS THIS IN? Do not assume finance/business by default. It could be a wedding ` +
    `budget, a class gradebook, a construction schedule, a research dataset, a fitness log, a ` +
    `non-profit donor tracker, a recipe cost calculator \u2014 identify the actual field from the ` +
    `objective, not from a fixed list.\n` +
    `2. What business or personal problem is this workbook actually solving?\n` +
    `3. Who precisely will use it, and what does THAT PERSON \u2014 in that field \u2014 need to see first? ` +
    `(A wedding planner and a CFO need completely different dashboards.)\n\n` +
    `4. IF \u2014 AND ONLY IF \u2014 this workbook is financial or business-analytical in nature, identify ` +
    `which proven modeling PATTERN(S) it matches. These are not a menu to pick one from \u2014 combine ` +
    `patterns freely when a request needs more than one, and use judgment for anything that doesn't ` +
    `fit cleanly. This step does not apply to non-financial workbooks (a wedding budget or a class ` +
    `gradebook does not need a "pattern" \u2014 skip straight to step 5 for those).\n\n` +
    `  PATTERN A \u2014 Time-Series Projection (cash flow forecasts, revenue/income forecasts, budget ` +
    `projections): rows are time periods (months/quarters). Needs a running/cumulative balance ` +
    `column, and projections driven by growth-rate assumptions living in a separate Assumptions tab ` +
    `\u2014 never hardcode a projected number, always derive it from a rate applied period over period.\n` +
    `  PATTERN B \u2014 Categorisation & Tracking (expense trackers, income-source tracking, spend ` +
    `analysis): rows are individual transactions/line items with an amount and a category. Needs a ` +
    `category master list, SUMIFS/COUNTIFS rollups by category, and a category breakdown view \u2014 ` +
    `the dashboard's job is to answer "where is the money actually going/coming from."\n` +
    `  PATTERN C \u2014 Resource & Headcount Modeling (FTE/effort calculation, staffing cost, capacity ` +
    `planning): rows are roles or people, with hours/cost/allocation percentage columns. Needs a ` +
    `per-role cost formula and a total FTE/utilisation rollup \u2014 the dashboard's job is to answer ` +
    `"how many people, doing what, costing how much."\n` +
    `  PATTERN D \u2014 Comparison & Variance (budget vs actual, plan vs actual, period-over-period): two ` +
    `parallel data sets that must be DIFFERENCED against each other. Needs a variance formula, a ` +
    `variance percentage, and RAG (red/amber/green) conditional formatting on the gap \u2014 never just ` +
    `show two numbers side by side without computing the difference.\n` +
    `  PATTERN E \u2014 Reconciliation & Matching (bank reconciliation, account/ledger matching): two data ` +
    `sets that must be MATCHED against each other, not just differenced. Needs matching logic and an ` +
    `explicit "unreconciled/exceptions" view \u2014 the dashboard's job is to answer "what still doesn't ` +
    `match, and by how much."\n` +
    `  PATTERN F \u2014 Ratio & Health-Check Analysis (financial ratio analysis, business-health ` +
    `dashboards, general "help me understand my business"): one dataset, multiple DERIVED ratios ` +
    `computed from the raw inputs (margins, liquidity, efficiency), each benchmarked against a ` +
    `sensible threshold \u2014 the dashboard's job is to flag which ratios are healthy vs. concerning.\n\n` +
    `5. What sheets does THIS SPECIFIC objective require, given the pattern(s) identified above? Do ` +
    `not force a generic finance template onto a non-financial request, and do not force a single ` +
    `pattern's structure onto a request that genuinely needs two combined (e.g. a cash flow forecast ` +
    `WITH variance vs. budget is Pattern A + Pattern D together).\n` +
    `6. What is the ONE most important number or view this audience needs first on the dashboard?\n` +
    `7. What assumptions, if any, must be documented so someone else can understand and maintain it?\n\n` +
    `Return ONLY this JSON, no prose:\n` +
    `{\n` +
    `  "fieldOrDomain": "the specific field identified in step 1 \u2014 be precise, not generic",\n` +
    `  "financialArchetype": "which PATTERN(S) apply (e.g. \\"A\\", \\"A+D\\", \\"C\\") \u2014 or \\"N/A\\" if this is not a financial/analytical workbook",\n` +
    `  "businessProblem": "one sentence, specific to this objective",\n` +
    `  "primaryAudience": "specific role or person type, not a generic tier",\n` +
    `  "sheetPlan": [{"name": "sheet name", "purpose": "what this sheet does and why it is needed"}],\n` +
    `  "keyMetric": "the single most important number/view for the dashboard",\n` +
    `  "assumptionsNeeded": ["assumption 1", "assumption 2"]\n` +
    `}`
  );
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
    `You are a world-class practitioner in whatever field this workbook belongs to \u2014 not ` +
    `necessarily finance. Adopt the expertise, terminology, and structure a genuine expert in ` +
    `THAT field would use (a wedding planner for a wedding budget, a teacher for a gradebook, ` +
    `a site manager for a construction tracker, a scientist for a research log, a Big4 partner ` +
    `only if this genuinely is a financial/audit workbook). Build a production-grade workbook ` +
    `the intended person can use immediately, with no manual editing.\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `WORKBOOK PURPOSE: ${deliverable.purpose}\n` +
    `AUDIENCE: ${deliverable.audience}\n` +
    `CURRENCY (only relevant if the workbook involves money): ${currencySymbol} (${currency})\n` +
    `COMPANY/PROJECT CONTEXT:\n${companyContext}\n` +
    `INPUT DATA:\n${noData ? "No data provided. Generate realistic sample data appropriate to the identified field \u2014 see DATA RULES." : data}\n\n` +
    `=== THE MOST IMPORTANT RULE \u2014 APPLIES TO EVERY FIELD ===\n` +
    `A PLACEHOLDER VALUE IS NEVER ACCEPTABLE. Whatever the unit of measurement in this field \u2014 ` +
    `money, hours, guests, students, tasks, samples, points \u2014 every quantitative cell must contain ` +
    `a real, usable value. A workbook full of zeros or blanks is worthless regardless of domain.\n` +
    `If no data is provided, INVENT realistic figures appropriate to the specific field identified. ` +
    `That is your job.\n` +
    `=== END MOST IMPORTANT RULE ===\n\n` +
    `DATA RULES (apply to any field):\n` +
    `1. ALL quantitative cells must contain real values, never a fake zero or blank placeholder.\n` +
    `2. Data must be internally consistent (if a total is derived from parts, the parts must sum to it).\n` +
    `3. Every formula must reference cells that actually contain populated data in this workbook.\n` +
    `4. Dashboard/summary metrics must be formula-driven from the data sheets, never hardcoded.\n` +
    `5. Any recurring series (dates, periods, categories) should cover enough points to show a real pattern.\n` +
    `6. Sample data must be realistic and specific to the field identified \u2014 not generic filler.\n\n` +
    `MANY-ROW RULE \u2014 if this workbook naturally needs many repeating rows (a multi-year\n` +
    `monthly/weekly projection, or a transaction log meant to hold hundreds or thousands of real\n` +
    `entries): DO NOT type out every row yourself. Instead:\n` +
    `  1. Write the header row, plus ONE fully-worked example row (this becomes the template).\n` +
    `  2. In that template row, use standard Excel fill-down convention: a cell reference WITHOUT\n` +
    `     a $ (like B2, C2) is treated as relative and will shift down automatically for every\n` +
    `     stamped row \u2014 exactly like dragging Excel's fill handle. A reference WITH $ (like\n` +
    `     Assumptions!$B$2) is treated as fixed and will NEVER shift \u2014 use $ for anything that\n` +
    `     should stay pointed at the same assumptions cell across every row.\n` +
    `  3. Add "rowTemplate": {"fromRowIndex": N, "repeatCount": M} to that sheet, where N is the\n` +
    `     zero-based position of your template row within "rows", and M is how many ADDITIONAL\n` +
    `     rows to stamp below it (the platform generates them mechanically \u2014 you never write them).\n` +
    `  4. If the first column of your template row is a recognisable month ("Jan 2024") or a\n` +
    `     numbered label ("Month 1", "Week 3"), it will auto-increment correctly for every stamped\n` +
    `     row. Any other label is left as-is, so only use this pattern for labels that should count up.\n` +
    `  5. Do NOT use rowTemplate for a handful of rows (under ~15) \u2014 just write them directly; this\n` +
    `     exists specifically so you are never forced to invent hundreds of fake data points by hand.\n\n` +
    `DROPDOWN RULE \u2014 whenever a column should only ever contain one of a fixed set of choices\n` +
    `(a category, a status, a yes/no-style flag, a department name), add a\n` +
    `"dataValidations": [{"col": N, "options": ["Choice A", "Choice B", ...]}] entry to that sheet,\n` +
    `where N is the zero-based column index. The platform writes this as a real Excel dropdown \u2014\n` +
    `the user clicks the cell and picks from your list rather than typing free text, which is the\n` +
    `single biggest thing that makes a workbook feel professional rather than improvised.\n\n` +
    `CATEGORY RULE \u2014 whenever rows have a free-text description that should be automatically\n` +
    `classified into a category (an expense description, an income source, a ticket type): do NOT\n` +
    `categorise each row yourself. Instead add ONE "categoryRules" object to that sheet:\n` +
    `"categoryRules": {"sourceCol": N, "targetCol": M, "fallback": "Uncategorized",\n` +
    `"rules": [{"keywords": ["rent","lease"], "category": "Facilities"}, ...]}. The platform reads\n` +
    `the free text in column N, matches it against your keyword rules, and writes the matched\n` +
    `category into column M for every row automatically \u2014 including any rows produced by a\n` +
    `rowTemplate above. It also builds the column M dropdown for you from your category list, so you\n` +
    `do not need to also add a separate dataValidations entry for that same column. Write enough\n` +
    `keywords per category (3-6) to catch realistic real-world wording, and always end with a\n` +
    `sensible fallback category for anything that matches nothing.\n\n` +
    `FORMULA RULES (universal \u2014 Excel formulas work the same regardless of domain):\n` +
    `- Write real Excel formula strings ONLY: =SUM(B2:B13), =IFERROR(C5/B5-1,"N/A"), =IF(D2>E2,"Over","OK")\n` +
    `- Cross-sheet references: =Data!C2, ='Guest List'!B15\n` +
    `- NEVER write a formula referencing an empty cell \u2014 populate the source cell first.\n` +
    `- A formula cell must start with "=" \u2014 it will be promoted to a real Excel formula.\n\n` +
    `WORKED EXAMPLE OF THE MECHANIC (adapt the actual content to this workbook's real field \u2014 ` +
    `this is a structural example only, not a template to copy literally):\n` +
    `A data row: ["Item A", 42, 18, "=B2-C2", "=D2/B2"]  \u2014 category, quantity in, quantity out, formula, formula\n` +
    `An assumptions row: ["Growth or usage rate", 0.08, "One-line note on where this number comes from \u2014 edit here only"]\n` +
    `A dashboard KPI row: ["Total for the period", "=SUM(Data!B2:B13)", "number|currency|percentage", "context note"]\n\n` +
    `NEVER DO THIS (produces a broken workbook regardless of field):\n` +
    `["Total", 0, null, "currency"]        \u2190 fake zero is wrong\n` +
    `["Total", null, null, "currency"]     \u2190 blank is wrong\n` +
    `["Total", "TBD", null]                \u2190 text placeholder is wrong\n\n` +
    `COLUMN WIDTH: do not specify colWidths unless you have a specific reason \u2014 the platform ` +
    `automatically sizes every column to fit its actual content, so omit this field and let it ` +
    `auto-fit unless a fixed narrow or wide column is genuinely required.\n\n` +
    `SHEET BUILD ORDER (build Assumptions/inputs first, reference them from later sheets):\n` +
    `1. Assumptions/inputs \u2014 all input variables for this specific field, with real values. Later sheets reference these.\n` +
    `2. Data sheet(s) \u2014 populated rows with real values, structured for this field.\n` +
    `3. Calculations \u2014 derived metrics, all formula-driven from the data sheet.\n` +
    `4. Dashboard \u2014 the summary/KPI view formula-driven from Calculations. Charts from Data.\n` +
    `5. Instructions \u2014 how to use the workbook, what to update, what each formula does.\n\n` +
    `CHART RULES:\n` +
    `- Include 2-4 charts visualising the most decision-relevant data.\n` +
    `- Limit each chart to a readable number of categories (roughly 12 or fewer). If the underlying ` +
    `data has more points than that, aggregate (e.g. daily \u2192 weekly, or show the most recent N) ` +
    `rather than cramming every point in \u2014 an unreadable chart is worse than a simplified one.\n` +
    `- Values must be plain numbers (no currency symbols embedded); labels short enough to display fully.\n\n` +
    `OUTPUT FORMAT (JSON only, no fences, no preamble):\n` +
    `{\n` +
    `  "filename": "descriptive-filename.xlsx",\n` +
    `  "title": "Workbook title",\n` +
    `  "sheets": [\n` +
    `    {\n` +
    `      "name": "Tab name max 31 chars",\n` +
    `      "type": "assumptions|data|calculations|dashboard|instructions",\n` +
    `      "rows": [["Header","Value","Notes"],["Example item",0.08,"Real note"]],\n` +
    `      "frozenRows": 1,\n` +
    `      "headerRow": 0,\n` +
    `      "autoFilter": "A1:D1",\n` +
    `      "conditionalCols": [2],\n` +
    `      "conditionalType": "positive_green|rag|negative_red",\n` +
    `      "namedRanges": {"KeyRate": "B2"},\n` +
    `      "merges": ["A1:D1"],\n` +
    `      "summaryKPIs": [{"label":"Key total","value":"=SUM(Data!C2:C13)","format":"currency|number|percentage"}],\n` +
    `      "rowTemplate": {"fromRowIndex": 2, "repeatCount": 22, "__comment": "OPTIONAL \u2014 see MANY-ROW RULE"},\n` +
    `      "dataValidations": [{"col": 2, "options": ["Rent","Utilities","Marketing","Other"], "__comment": "OPTIONAL \u2014 see DROPDOWN RULE"}],\n` +
    `      "categoryRules": {"sourceCol": 0, "targetCol": 2, "fallback": "Uncategorized", "rules": [{"keywords":["rent","lease"],"category":"Rent"}], "__comment": "OPTIONAL \u2014 see CATEGORY RULE"}\n` +
    `    }\n` +
    `  ],\n` +
    `  "charts": [\n` +
    `    {"type":"bar","title":"Descriptive chart title","seriesName":"Series name","labels":["A","B","C","D","E","F"],"values":[10,14,12,18,16,20]}\n` +
    `  ],\n` +
    `  "vbaCode": "Sub RefreshAll()\\nActiveWorkbook.RefreshAll\\nMsgBox \\"Done!\\"\\nEnd Sub",\n` +
    `  "instructions": "Update the inputs sheet to change the workbook. Other sheets auto-update."\n` +
    `}`
  );
}


function buildPPTXPlanningPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
): string {
  return (
    `You are a world-class presentation expert who adapts to ANY field \u2014 business, academic, ` +
    `medical, legal, event planning, education, non-profit, personal projects, or anything else. ` +
    `Before any slide is designed, decide the presentation's purpose. Do not write slide content yet.\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `STATED PURPOSE: ${deliverable.purpose}\n` +
    `STATED AUDIENCE: ${deliverable.audience}\n` +
    `DATA AVAILABLE: ${data ? "Yes" : "No \u2014 use realistic content appropriate to the identified field"}\n` +
    `${data ? "DATA SAMPLE:\n" + data.slice(0, 800) : ""}\n\n` +
    `Reason through, in order:\n` +
    `1. WHAT FIELD AND WHAT PRESENTATION TYPE IS THIS, SPECIFICALLY? Do not default to a business ` +
    `template. Business examples: Board Meeting, Investor Pitch, QBR, Financial Results. Equally ` +
    `valid non-business examples: academic lecture, wedding proposal, medical case review, class ` +
    `curriculum overview, construction project update, non-profit grant application, research ` +
    `findings, travel itinerary, personal project plan, product demo for consumers, training ` +
    `workshop. Identify the actual type freely \u2014 this list is illustrative, not exhaustive.\n` +
    `2. THE CENTRAL QUESTION: after this presentation, what should the audience know, decide, or be ` +
    `ready to do? For a business deck this is often a decision; for a lecture it may be understanding; ` +
    `for a proposal it may be agreement; for a report it may be awareness of findings. State it plainly ` +
    `for what this specific presentation actually is.\n` +
    `3. What is the narrative arc that gets them there, adapted to this presentation type? (A business ` +
    `deck might use Problem\u2192Evidence\u2192Analysis\u2192Recommendation. An academic talk might use ` +
    `Background\u2192Method\u2192Findings\u2192Discussion. A wedding deck might use Story\u2192Details\u2192Logistics\u2192` +
    `Excitement. Use whichever arc genuinely fits.)\n` +
    `4. For each planned slide, it must visibly serve the goal in step 2. If a slide does not move the ` +
    `audience toward it, do not include it.\n\n` +
    `Return ONLY this JSON, no prose:\n` +
    `{\n` +
    `  "fieldOrDomain": "the specific field identified in step 1",\n` +
    `  "businessProblem": "one sentence, specific to this objective \u2014 use whatever framing fits the field",\n` +
    `  "presentationType": "the specific type identified in step 1",\n` +
    `  "decisionNeeded": "what the audience should know/decide/do after this deck, per step 2",\n` +
    `  "narrativeArc": "the sequence of story beats, adapted to this presentation type",\n` +
    `  "slidePlan": [{"title": "so-what headline, not a topic label", "servesDecisionBy": "how this slide serves step 2"}]\n` +
    `}`
  );
}


function buildPPTXGenPrompt(
  objective: string,
  deliverable: DeliverableSpec,
  companyContext: string,
  data: string,
  domain: Domain,
): string {
  return (
    `You are a world-class presentation expert in whatever field this deck belongs to \u2014 a McKinsey ` +
    `Senior Partner only if this genuinely is a strategy/consulting deck; otherwise adopt the ` +
    `expertise a real expert in that field would bring (a professor for a lecture, an event planner ` +
    `for a wedding deck, a physician for a case review, a teacher for a curriculum overview).\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `PURPOSE: ${deliverable.purpose}\n` +
    `AUDIENCE: ${deliverable.audience}\n` +
    `COMPANY/PROJECT CONTEXT: ${companyContext}\n` +
    `SUPPORTING DATA: ${data || "Use realistic content appropriate to the identified field."}\n\n` +
    `=== SLIDE COUNT RULE \u2014 NON-NEGOTIABLE, APPLIES TO ANY FIELD ===\n` +
    `A board-level or formal deck MUST have 12-16 slides. An operational or casual deck up to 20.\n` +
    `A deck with fewer than 10 slides is REJECTED and regenerated.\n` +
    `EVERY slide must have a "so what" title, real content, and speaker notes.\n` +
    `=== END SLIDE COUNT RULE ===\n\n` +
    `NARRATIVE STRUCTURE \u2014 ADAPT TO WHAT THIS PRESENTATION ACTUALLY IS. The sequence below is a ` +
    `business-deck default; if the field/type identified upstream is different, use the equivalent ` +
    `structure for that field instead (see examples in brackets):\n` +
    `1. Title slide \u2014 always first\n` +
    `2. Executive Summary / Key Takeaways (3 headline points, whatever field this is)\n` +
    `3. Agenda \u2014 list the major sections\n` +
    `4-5. Situation / Context / Background [academic: literature context; wedding: the couple's story]\n` +
    `6-7. Analysis / Method / Details [academic: methodology; event: the plan itself]\n` +
    `8-9. Implications / Findings / So What [academic: results; event: what this means logistically]\n` +
    `10-11. Recommendations / Conclusions / Decisions [academic: conclusions; event: choices to confirm]\n` +
    `12. Implementation / Next Steps \u2014 who does what by when\n` +
    `13. Impact \u2014 quantify it if the field has a natural metric (financial, time, guests, outcomes)\n` +
    `14. Risks / Open Questions / Considerations \u2014 top 3-5, whatever \\"risk\\" means in this field\n` +
    `15. Closing / Call to Action\n` +
    `A1, A2... Appendix slides (supporting detail)\n\n` +
    `CONTENT RULES (universal \u2014 apply regardless of field):\n` +
    `- Titles must be "so what" headlines with a concrete point: not "Budget" but "Venue costs run ` +
    `12% over initial estimate \u2014 three ways to close the gap"\n` +
    `- Content must have 4-6 substantive bullets per slide, not 1-2 vague ones\n` +
    `- Every chart/table must use realistic data appropriate to the field (no zeros, no placeholders)\n` +
    `- Speaker notes must be 3-5 sentences of what a real presenter in this field would actually say\n` +
    `- NO slide may contain [PLACEHOLDER], [TBD], [INSERT], or similar\n\n` +
    `CHART AND TABLE OVERFLOW RULE \u2014 a slide is a fixed physical size, content must fit it:\n` +
    `- Charts: limit to a readable number of categories (roughly 8, at most 12). If the underlying ` +
    `data has more points, aggregate rather than cramming every point onto one axis.\n` +
    `- Tables: limit to 6 columns and 8 data rows per slide. If more detail exists, summarise on the ` +
    `slide and move the full detail to an appendix slide.\n` +
    `- Never let a bullet list exceed 6 items \u2014 group or summarise instead.\n\n` +
    `JSON FORMAT:\n` +
    `{\n` +
    `  "title": "Deck title",\n` +
    `  "narrativeArc": "One paragraph describing the story and why in this sequence, for this field",\n` +
    `  "slides": [\n` +
    `    {\n` +
    `      "layout": "title|exec_summary|agenda|section_divider|chart_narrative|two_column|data_table|full_text|closing",\n` +
    `      "title": "So-what headline with a concrete point",\n` +
    `      "content": "Bullet 1\\nBullet 2\\nBullet 3\\nBullet 4",\n` +
    `      "speakerNotes": "3-5 sentences a real presenter in this field would say",\n` +
    `      "chartType": "bar|line|pie (only for chart_narrative layout)",\n` +
    `      "chartData": {"labels":["A","B","C","D"],"series":[{"name":"Series name","values":[10,14,12,18]}]}\n` +
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
  return (
    `You are a world-class writer in whatever field this document belongs to \u2014 a Big4 Senior ` +
    `Manager only if this genuinely is a financial/audit document; otherwise adopt the voice a real ` +
    `expert in that field would use (an academic for a research paper, an event planner for a wedding ` +
    `guide, a physician for a case summary, a teacher for a course handbook).\n\n` +
    `OBJECTIVE: ${objective}\n` +
    `DOCUMENT PURPOSE: ${deliverable.purpose}\n` +
    `AUDIENCE: ${deliverable.audience}\n` +
    `FORMAT: ${deliverable.type.toUpperCase()}\n` +
    `COMPANY/PROJECT CONTEXT:\n${companyContext}\n` +
    `DATA / INPUTS:\n${data || "Generate realistic, well-informed content appropriate to the identified field."}\n\n` +
    `Produce a JSON object:\n` +
    `{\n` +
    `  "title": "Document title",\n` +
    `  "classification": "Confidential|Internal|Client-Facing|Public (omit or use \\"N/A\\" if not applicable to this field)",\n` +
    `  "executiveSummary": "3-5 sentence opening summary \u2014 adapt the label mentally to \\"Overview\\" or \\"Abstract\\" if that fits the field better, but always open with a summary",\n` +
    `  "sections": [\n` +
    `    {"level": 1, "title": "Section title", "content": "Full section content in markdown \u2014 use ## for subsections, **bold** for key terms, tables with | syntax"}\n` +
    `  ],\n` +
    `  "appendices": [{"title": "Appendix title", "content": "Supporting detail that does not belong in the main body"}],\n` +
    `  "keyFindings": ["Finding 1", "Finding 2"],\n` +
    `  "recommendations": ["Recommendation or conclusion 1", "Recommendation or conclusion 2"]\n` +
    `}\n\n` +
    `DOCUMENT QUALITY RULES (universal, apply to any field):\n` +
    `1. Begin with a summary \u2014 always, whatever it is called for this field.\n` +
    `2. Use numbered or clearly titled sections that follow logically for this specific document type.\n` +
    `3. Every section must advance the document. No padding, no filler paragraphs.\n` +
    `4. Findings/claims must be specific and grounded, not generic statements that could apply to anything.\n` +
    `5. Recommendations or conclusions must be concrete \u2014 a reader should know exactly what to do or ` +
    `understand with the information given, not receive vague generalities.\n` +
    `6. Tables must have proper headers and aligned data \u2014 no more than 6-7 columns per table; split ` +
    `wide tables into multiple smaller ones rather than cramming, since an overly wide table will not ` +
    `fit the printed page.\n` +
    `7. Appendices contain supporting detail that would clutter the main body.\n` +
    `8. The document must be usable directly by the stated audience without further editing.\n\n` +
    `TEXT FORMATTING (critical \u2014 this becomes a real Word/PDF document, not a chat message):\n` +
    `- Write clean, natural paragraphs. Do not manually insert extra spaces to align or justify text \u2014 ` +
    `the document renderer handles spacing and alignment automatically.\n` +
    `- Do not pad or stretch sentences with unnecessary words merely to fill a line or column.\n` +
    `- Keep paragraphs a natural length (roughly 3-6 sentences) \u2014 avoid single giant blocks of text.\n` +
    `- Use "## Heading" syntax for real section breaks only, not for emphasis within a paragraph.\n\n` +
    `Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`
  );
}


// ─── ROW TEMPLATE ENGINE (Excel Intelligence Engine, Phase 3) ────────────────
// The mechanism that makes "thousands of rows" both possible and cheap: the
// AI is never asked to type out every row. It writes ONE template row using
// standard Excel relative/absolute reference conventions, and this code
// mechanically stamps it down N times — exactly what a human does by
// dragging the fill handle. This is not an approximation of that behaviour;
// it is the same rule Excel itself uses (relative refs shift, $-marked
// absolute refs don't), applied programmatically, at zero AI cost per row
// and zero risk of drift across thousands of rows.

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fillDownFormula(formula: any, rowOffset: number): any {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  return formula.replace(
    /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_. ]*)!)?(\$?)([A-Z]{1,3})(\$)?(\d+)/g,
    (match, sheetPrefix, colDollar, col, rowDollar, rowNum) => {
      if (rowDollar === "$") return match; // absolute row reference — never shifts
      const newRow = parseInt(rowNum, 10) + rowOffset;
      return (sheetPrefix || "") + colDollar + col + newRow;
    }
  );
}

function incrementRowLabel(label: any, offset: number): any {
  if (typeof label !== "string") return label;
  const monthYear = label.match(/^([A-Za-z]{3,9})[\s-]?(\d{4})$/);
  if (monthYear) {
    const mIdx = MONTH_NAMES.findIndex(m => monthYear[1].toLowerCase().startsWith(m.toLowerCase()));
    if (mIdx >= 0) {
      const total = mIdx + offset;
      const year = parseInt(monthYear[2], 10) + Math.floor(total / 12);
      const newIdx = ((total % 12) + 12) % 12;
      return MONTH_NAMES[newIdx] + " " + year;
    }
  }
  const trailingNum = label.match(/^(.*?)(\d+)(\s*\d{0,4})?$/);
  if (trailingNum && trailingNum[2]) {
    return trailingNum[1] + (parseInt(trailingNum[2], 10) + offset) + (trailingNum[3] || "");
  }
  return label; // no recognizable pattern — left unchanged, never corrupted
}

// Expands a sheet's rows using an optional rowTemplate instruction the AI can
// provide instead of writing every row by hand. Fully additive: a sheet with
// no rowTemplate behaves exactly as before (zero behaviour change).
function expandRowTemplate(rows: any[][], rowTemplate: any): any[][] {
  if (!rowTemplate || typeof rowTemplate.fromRowIndex !== "number" || !rowTemplate.repeatCount) return rows;
  const templateIdx = rowTemplate.fromRowIndex;
  if (templateIdx < 0 || templateIdx >= rows.length) return rows;
  const templateRow = rows[templateIdx];
  const repeatCount = Math.max(0, Math.min(rowTemplate.repeatCount, 20000)); // sane ceiling, not a real-world limit
  const expanded = rows.slice();
  for (let i = 1; i <= repeatCount; i++) {
    const newRow = templateRow.map((cell: any, ci: number) =>
      ci === 0 ? incrementRowLabel(cell, i) : fillDownFormula(cell, i)
    );
    expanded.push(newRow);
  }
  return expanded;
}

// ─── CATEGORY AUTO-MATCHING (Excel Intelligence Engine, Phase 4) ─────────────
// Same principle as the row template engine: the AI designs the RULES once
// (which keywords map to which category), and this code applies them to
// every row deterministically — no AI call per row, no drift, works whether
// there are 5 rows or 5,000. First matching rule wins; anything unmatched
// falls back to a safe, explicit default rather than being left blank.

interface CategoryRule { keywords: string[]; category: string }

function applyCategoryRules(
  rows: any[][],
  sourceCol: number,
  targetCol: number,
  rules: CategoryRule[],
  fallback: string,
): any[][] {
  return rows.map((row, ri) => {
    if (ri === 0) return row; // header row untouched
    const sourceText = String(row[sourceCol] ?? "").toLowerCase();
    const newRow = row.slice();
    while (newRow.length <= targetCol) newRow.push("");
    const matched = rules.find(r => r.keywords.some(kw => sourceText.includes(String(kw).toLowerCase())));
    newRow[targetCol] = matched ? matched.category : fallback;
    return newRow;
  });
}

// ─── DETERMINISTIC CONTENT VALIDATION ────────────────────────────────────────
// Checks facts a computer can verify with certainty — not an AI's opinion of
// its own output. This is the difference between "the AI says it scored 85%"
// (unreliable — this is what got removed) and "62% of the numeric cells in
// this workbook are literally zero" (a fact, counted directly from the parsed
// data before any file is built).
//
// Used by generateExcel and generatePPTX: parse the AI's JSON schema first,
// run this check on the STRUCTURED data (not rendered text), and only then
// decide whether to build the file, retry once with the exact violation
// named, or ship with an honest warning attached.

interface ContentCheck { passed: boolean; violations: string[] }

function validateExcelSchema(schema: any): ContentCheck {
  const violations: string[] = [];
  let numericCells = 0, zeroCells = 0;
  let placeholderHits = 0, markdownLeaks = 0;

  const placeholderRe = /\[INSERT\]|\[TBD\]|PLACEHOLDER|\[ESTIMATE\]|\[ASSUMPTION\]|Lorem ipsum|TODO:/i;
  const markdownRowRe = /^\s*\|.*\|.*\|\s*$/; // a cell that is itself a multi-column markdown row

  (schema?.sheets || []).forEach((sheet: any) => {
    (sheet.rows || []).forEach((row: any[]) => {
      (row || []).forEach((cell: any) => {
        if (typeof cell === "number") {
          numericCells++;
          if (cell === 0) zeroCells++;
        } else if (typeof cell === "string") {
          if (placeholderRe.test(cell)) placeholderHits++;
          if (markdownRowRe.test(cell)) markdownLeaks++;
          // A numeric-looking string (not a formula) is effectively a dead number —
          // it will render as text and break any SUM/chart referencing it.
          if (!cell.startsWith("=")) {
            const bare = cell.replace(/^\((.*)\)$/, "-$1").replace(/[₹$€£,\s%]/g, "");
            if (bare !== "" && /^-?\d+(\.\d+)?$/.test(bare)) {
              numericCells++;
              if (parseFloat(bare) === 0) zeroCells++;
            }
          }
        }
      });
    });
  });

  if (numericCells >= 8 && zeroCells / numericCells > 0.8) {
    violations.push(`${Math.round((zeroCells / numericCells) * 100)}% of all numeric values are zero (${zeroCells} of ${numericCells})`);
  }
  if (placeholderHits > 0) violations.push(`${placeholderHits} placeholder marker(s) found (e.g. [TBD], [ESTIMATE]) in cell content`);
  if (markdownLeaks > 0) violations.push(`${markdownLeaks} cell(s) contain an un-exploded markdown table row`);

  return { passed: violations.length === 0, violations };
}

function validatePptxSchema(schema: any, minSlides: number): ContentCheck {
  const violations: string[] = [];
  const slides = schema?.slides || [];
  const placeholderRe = /\[INSERT\]|\[TBD\]|PLACEHOLDER|\[ESTIMATE\]|\[ASSUMPTION\]|Lorem ipsum|TODO:/i;

  if (slides.length < minSlides) {
    violations.push(`only ${slides.length} slides generated (minimum ${minSlides} required)`);
  }
  let placeholderSlides = 0, thinContentSlides = 0;
  slides.forEach((s: any) => {
    const text = String(s?.content || "") + " " + String(s?.title || "");
    if (placeholderRe.test(text)) placeholderSlides++;
    if (s?.layout !== "title" && s?.layout !== "section_divider" && (s?.content || "").length < 40) thinContentSlides++;
  });
  if (placeholderSlides > 0) violations.push(`${placeholderSlides} slide(s) contain an unfilled placeholder marker`);
  if (thinContentSlides > slides.length * 0.3 && slides.length > 0) {
    violations.push(`${thinContentSlides} of ${slides.length} slides have little to no real content`);
  }

  return { passed: violations.length === 0, violations };
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

    const archetypeGuide: Record<string, string> = {
      A: "Time-series projection: build a running/cumulative balance column; every projected figure must derive from a growth-rate assumption, never a hardcoded guess.",
      B: "Categorisation & tracking: build a category master list and SUMIFS/COUNTIFS rollups by category; the dashboard must show where money is actually going/coming from.",
      C: "Resource & headcount modeling: build a per-role cost formula and a total FTE/utilisation rollup; the dashboard must show headcount, allocation, and total cost.",
      D: "Comparison & variance: compute an explicit variance and variance % between the two data sets, with RAG conditional formatting on the gap \u2014 never show two numbers side by side unstudied.",
      E: "Reconciliation & matching: build explicit matching logic between the two sources and a clear unreconciled/exceptions view.",
      F: "Ratio & health-check: compute multiple derived ratios from the raw inputs, each benchmarked against a sensible threshold, and flag healthy vs. concerning.",
    };
    const archetypeNote = workbookPlan?.financialArchetype && workbookPlan.financialArchetype !== "N/A"
      ? "\nFinancial pattern(s) identified (" + workbookPlan.financialArchetype + "): " +
        String(workbookPlan.financialArchetype).split("+").map((k: string) => archetypeGuide[k.trim()] || "").filter(Boolean).join(" ")
      : "";

    const planContext = workbookPlan
      ? `\n\nWORKBOOK PLAN (already reasoned through \u2014 follow this architecture):
Business problem: ${workbookPlan.businessProblem}
Primary audience: ${workbookPlan.primaryAudience}
Required sheets: ${workbookPlan.sheetPlan.map((s: any) => s.name + " \u2014 " + s.purpose).join("; ")}
Key metric for dashboard: ${workbookPlan.keyMetric}
Assumptions to document: ${(workbookPlan.assumptionsNeeded || []).join(", ")}${archetypeNote}`
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

    // ── DETERMINISTIC CONTENT CHECK ──────────────────────────────────────────
    // Checks facts, not an AI's opinion: what % of numbers are actually zero,
    // are there unfilled placeholders, did a markdown row survive un-exploded.
    let check = validateExcelSchema(schema);
    if (!check.passed) {
      try {
        onProgress(`⚠ Regenerating — ${check.violations[0]}`);
        const retrySys = sys + `

YOUR PREVIOUS ATTEMPT WAS REJECTED for these exact reasons:
- ` +
          check.violations.join("\n- ") +
          `
Fix every one of these specifically. Every numeric cell must be a real, non-zero value ` +
          `unless zero is genuinely correct. Remove all placeholder markers. Never leave a markdown ` +
          `table row un-split across columns.`;
        const retryRaw = await this.ask(retrySys, [{ role: "user", content: `Rebuild the workbook for: "${del.title}", correcting the listed issues.` }], 6000, false, "excel_advanced");
        const retryText = typeof retryRaw === "string" ? retryRaw : retryRaw?.text || "";
        const retryCleaned = retryText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
        let retrySchema = tryParseJSON(retryCleaned);
        if (!retrySchema?.sheets) { const m = retryText.match(/\{[\s\S]*"sheets"[\s\S]*\}/); if (m) retrySchema = tryParseJSON(m[0]); }
        if (!retrySchema?.sheets) retrySchema = repairTruncatedJson(retryText);
        if (retrySchema?.sheets?.length) {
          const retryCheck = validateExcelSchema(retrySchema);
          // Keep the retry if it is strictly better, even if not perfect —
          // a partial improvement is still worth keeping over the original.
          if (retryCheck.violations.length < check.violations.length || retryCheck.passed) {
            schema = retrySchema;
            check = retryCheck;
          }
        }
      } catch { /* keep original schema — a failed retry must never lose the first attempt */ }
    }

    onProgress(`📊 Building workbook: ${schema.filename || del.title}...`);

const styleSpec = ExcelStyleEngine.parseWorkbookSpec(text, del.title); const exportBlob = await ExcelStyleEngine.exportWorkbook(styleSpec); const exportBuf = await exportBlob.arrayBuffer(); const filename = `${del.title.replace(/\s+/g, "-")}-${Date.now()}.xlsx`; this.dlFile(filename, exportBuf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return { deliverable: del, status: "complete", filename, summary: styleSpec.subtitle || `${styleSpec.sheets.length} sheets — benchmark styling applied.`, content: `Professional Excel workbook delivered: **${filename}**`, qualityWarning: check.passed ? undefined : `Note: content check flagged — ${check.violations.join("; ")}`, }; }
  
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

  // Applies dropdown-list data validation to specified columns on specified
  // sheets — proven against a raw-XML inspection before being wired in here
  // (a real <dataValidation type="list"> element, not silently ignored).
  // Same fail-safe round-trip pattern as embedChartsSheet: any error here
  // ships the workbook exactly as it was, dropdown-free but otherwise intact.
  private async applyDataValidations(xlsxBuf: any, sheetValidations: { sheetName: string; col: number; options: string[] }[]): Promise<any> {
    if (!sheetValidations.length) return xlsxBuf;
    try {
      const ExcelJS = await this.ensureExcelJS();
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(xlsxBuf);
      for (const v of sheetValidations) {
        const ws = wb2.getWorksheet(v.sheetName);
        if (!ws) continue;
        const colLetter = String.fromCharCode(65 + v.col); // 0=A, 1=B, ... (26-col ceiling, matches realistic sheet widths)
        const optionList = v.options.slice(0, 200).join(","); // Excel list-validation practical ceiling
        const lastRow = Math.max(ws.rowCount, 2);
        for (let r = 2; r <= lastRow; r++) {
          ws.getCell(colLetter + r).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${optionList}"`],
            showErrorMessage: true,
            errorStyle: "stop",
            errorTitle: "Invalid entry",
            error: "Please choose from the dropdown list.",
          };
        }
      }
      return await wb2.xlsx.writeBuffer();
    } catch { return xlsxBuf; } // dropdowns are additive polish — never block a delivery
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

    // ── DETERMINISTIC CONTENT CHECK ──────────────────────────────────────────
    // Checks facts: actual slide count, actual placeholder markers, actual
    // thin-content slides — counted directly from the parsed schema, not an
    // AI's opinion of its own deck.
    const minSlides = del.audience === "board" ? 12 : 8;
    let pptxCheck = validatePptxSchema(schema, minSlides);
    if (!pptxCheck.passed) {
      try {
        onProgress(`⚠ Regenerating — ${pptxCheck.violations[0]}`);
        const retrySys = sys + `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED for these exact reasons:\n- ` +
          pptxCheck.violations.join("\n- ") +
          `\nFix every one of these specifically. Meet the minimum slide count. Remove all placeholder ` +
          `markers. Give every slide (except title/section-divider layouts) substantive content.`;
        const retryRaw = await this.ask(retrySys, [{ role: "user", content: `Rebuild the presentation for: "${del.title}", correcting the listed issues.` }], 6000, false, "powerpoint");
        const retryText = typeof retryRaw === "string" ? retryRaw : retryRaw?.text || "";
        const retryCleaned = retryText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
        let retrySchema: any = null;
        try { retrySchema = JSON.parse(retryCleaned); } catch { /* fall through */ }
        if (!retrySchema?.slides) { const m = retryText.match(/\{[\s\S]*"slides"[\s\S]*\}/); if (m) { try { retrySchema = JSON.parse(m[0]); } catch { /* skip */ } } }
        if (!retrySchema?.slides) { const repaired = repairTruncatedJson(retryText); if (repaired?.slides?.length) retrySchema = repaired; }
        if (retrySchema?.slides?.length) {
          const retryCheck = validatePptxSchema(retrySchema, minSlides);
          if (retryCheck.violations.length < pptxCheck.violations.length || retryCheck.passed) {
            schema = retrySchema;
            pptxCheck = retryCheck;
          }
        }
      } catch { /* keep original schema — a failed retry must never lose the first attempt */ }
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
      qualityWarning: pptxCheck.passed ? undefined : `Shipped with unresolved issues after one correction attempt: ${pptxCheck.violations.join("; ")}`,
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
  // Set when the deliverable was DELIVERED but failed a deterministic content
  // check after one corrective retry (e.g. still mostly-zero, or fewer slides
  // than mandated). The file ships — silently blocking a "good enough" result
  // is worse than telling the user exactly what to double-check.
  qualityWarning?: string;
}

// ─── CONVENIENCE EXPORT ───────────────────────────────────────────────────────
// Modules import this and call engine.execute() — nothing else needed.
export default BusinessExecutionEngine;
