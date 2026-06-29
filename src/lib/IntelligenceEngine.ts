// ─────────────────────────────────────────────────────────────────────────────
// src/lib/IntelligenceEngine.ts
// OrchestrIQ Intelligence Engine — Session 2
//
// PURPOSE
// Single reasoning pipeline for all modules. Every function has one job.
// No module is wired to this yet — ENGINE_ENABLED stays false until Session 6.
// Live traffic continues through the existing ask() pipeline unchanged.
//
// PIPELINE ORDER (when enabled)
//   planning() → classifyIntent() → classifyDomain() → buildContext()
//   → selectFramework() → executeReasoning() → classifyEvidence()
//   → selfReview() → formatResponse() → generateTrace()
//
// TO WIRE A MODULE (Session 6+):
//   Replace: const reply = await ask(sys, msgs, maxT)
//   With:    const reply = await runPipeline(question, context, ask)
// ─────────────────────────────────────────────────────────────────────────────

// ─── FEATURE FLAG ────────────────────────────────────────────────────────────
// Keep false until Session 6. Changing to true has no effect until
// individual modules are updated to call runPipeline() instead of ask().
export const ENGINE_ENABLED = false;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface CompanyContext {
  name: string;
  industry: string;
  stage: string;
  location: string;
  markets: string;
  currency: string;
  currencySymbol: string;
}

export interface ModuleContext {
  companyData: Record<string, string>;
  ledgerEntries: unknown[];
  boardroomSessions: unknown[];
  workflows: unknown[];
  taskQueue: unknown[];
  timeMachineResult: string;
  autopilotResult: string;
  liveRates: string;
}

// The full input package passed into the pipeline
export interface PipelineInput {
  question: string;
  company: CompanyContext;
  module: ModuleContext;
  // The existing ask() function passed in from App.tsx
  // Engine never imports ask() directly — stays decoupled
  askFn: (sys: string, msgs: Message[], maxT: number, search?: boolean) => Promise<string>;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── PLANNING RESULT ─────────────────────────────────────────────────────────

export interface PlanningResult {
  // What the user is actually asking
  coreQuestion: string;
  // Is clarification needed before reasoning?
  needsClarification: boolean;
  clarificationQuestion: string;
  // Which domain owns this question
  domain: Domain;
  // Should live web research run before reasoning?
  requiresResearch: boolean;
  // Should previous boardroom decisions be referenced?
  referencePastDecisions: boolean;
  // What output format is most appropriate
  outputType: "report" | "analysis" | "plan" | "deliverable" | "answer";
  // Should a chart or diagram help?
  suggestVisualization: boolean;
}

// ─── DOMAIN ──────────────────────────────────────────────────────────────────

export type Domain =
  | "finance"
  | "audit"
  | "hr"
  | "legal"
  | "marketing"
  | "sales"
  | "technology"
  | "operations"
  | "strategy"
  | "customer_success"
  | "executive"
  | "general";

// ─── FRAMEWORK ───────────────────────────────────────────────────────────────

export interface SelectedFramework {
  name: string;
  reason: string; // Why this framework was chosen for this specific question
}

// ─── EVIDENCE ────────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | "Verified Fact"       // From cited authoritative source
  | "Retrieved Evidence"  // From live web search this session
  | "Calculation"         // Derived mathematically — formula shown
  | "Assumption"          // Stated assumption — labeled explicitly
  | "Expert Inference"    // Reasoned from domain expertise
  | "Unknown";            // Insufficient information — do not invent

export interface EvidenceTag {
  statement: string;
  category: EvidenceCategory;
  source?: string; // URL or citation if available
}

// ─── OBSERVABILITY TRACE ─────────────────────────────────────────────────────

export interface ExecutionTrace {
  sessionId: string;
  timestamp: string;
  question: string;
  domain: Domain;
  frameworks: string[];
  requiresResearch: boolean;
  selfReviewPerformed: boolean;
  processingMs: number;
  engineVersion: string;
}

// ─── PIPELINE RESULT ─────────────────────────────────────────────────────────

export interface PipelineResult {
  response: string;         // Final formatted response for the user
  trace: ExecutionTrace;    // Internal observability — not shown to user
  plan: PlanningResult;     // What the engine decided before reasoning
  frameworks: SelectedFramework[];
  evidenceTags: EvidenceTag[];
  needsClarification: boolean;
  clarificationQuestion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — PLANNING
// Determines what the question actually needs before any reasoning starts.
// Runs as a lightweight LLM call with a structured JSON response.
// ─────────────────────────────────────────────────────────────────────────────

export async function planning(
  question: string,
  company: CompanyContext,
  module: ModuleContext,
  askFn: PipelineInput["askFn"]
): Promise<PlanningResult> {
  const sys = `You are the Planning Layer of an AI Operating System.
Your job is to analyse the user's question and determine what the reasoning engine needs.
Company: ${company.name} | Industry: ${company.industry} | Location: ${company.location}

Output ONLY valid JSON matching this exact shape:
{
  "coreQuestion": "the essential question stripped of noise",
  "needsClarification": false,
  "clarificationQuestion": "",
  "domain": "finance|audit|hr|legal|marketing|sales|technology|operations|strategy|customer_success|executive|general",
  "requiresResearch": false,
  "referencePastDecisions": false,
  "outputType": "report|analysis|plan|deliverable|answer",
  "suggestVisualization": false
}

Rules:
- needsClarification = true only if missing info would fundamentally change the answer
- requiresResearch = true if current market data, pricing, or regulations are needed
- referencePastDecisions = true if boardroom sessions exist and are relevant
- suggestVisualization = true if a chart, table, or diagram would materially help
- Never add fields. Never add commentary outside the JSON.`;

  try {
    const raw = await askFn(sys, [{ role: "user", content: question }], 400, false);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as PlanningResult;
  } catch {
    // Fallback: safe defaults so the pipeline never breaks
    return {
      coreQuestion: question,
      needsClarification: false,
      clarificationQuestion: "",
      domain: classifyDomain(question),
      requiresResearch: false,
      referencePastDecisions: false,
      outputType: "analysis",
      suggestVisualization: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — CLASSIFY INTENT
// Categorises the user's intent into one of five action types.
// Pure logic — no LLM call needed. Fast and deterministic.
// ─────────────────────────────────────────────────────────────────────────────

export type Intent =
  | "analyse"    // Understand a situation
  | "decide"     // Choose between options
  | "plan"       // Create a roadmap or schedule
  | "create"     // Produce a document, report, or deliverable
  | "monitor"    // Track progress or performance
  | "general";   // Catch-all

export function classifyIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/\bshould i\b|\bwhich option\b|\bbest choice\b|\bcompare\b|\bdecide\b/.test(q))
    return "decide";
  if (/\bcreate\b|\bwrite\b|\bdraft\b|\bbuild\b|\bgenerate\b|\bprepare\b/.test(q))
    return "create";
  if (/\bplan\b|\broadmap\b|\bschedule\b|\bsteps\b|\bhow to\b|\bstrategy\b/.test(q))
    return "plan";
  if (/\btrack\b|\bmonitor\b|\bstatus\b|\bprogress\b|\bkpi\b|\bmetric\b/.test(q))
    return "monitor";
  if (/\banalyse\b|\banalyze\b|\bwhy\b|\bwhat is\b|\bexplain\b|\bunderstand\b/.test(q))
    return "analyse";
  return "general";
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — CLASSIFY DOMAIN
// Maps the question to one of the 12 business domains.
// Matches the CHAINS categories already used in App.tsx.
// Pure keyword logic — no LLM call. Consistent with autoRoute() in App.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export function classifyDomain(question: string): Domain {
  const q = question.toLowerCase();

  const domainKeywords: [Domain, string[]][] = [
    ["finance",          ["p&l","profit","loss","revenue","expense","budget","cash flow","burn","ebitda","invoice","reconcil","mis","financial","balance sheet","forecast","variance"]],
    ["audit",            ["audit","sox","itgc","risk","control","assurance","fraud","workpaper","finding","compliance check"]],
    ["hr",               ["hire","hiring","employee","onboard","payroll","salary","leave","appraisal","headcount","talent","job description","interview","chro","hr"]],
    ["legal",            ["contract","nda","agreement","ip","trademark","patent","legal","compliance","clause","liability","gdpr","fema","regulatory"]],
    ["marketing",        ["marketing","campaign","brand","seo","ads","content","social media","email campaign","acquisition","funnel","go-to-market","launch","pr"]],
    ["sales",            ["sales","pipeline","deal","prospect","proposal","crm","business development","commission","quota","revenue target"]],
    ["technology",       ["tech","architecture","api","database","system design","software","engineering","sprint","product","feature","devops","cloud","infrastructure"]],
    ["operations",       ["operations","process","sop","vendor","supply chain","logistics","project","procurement","efficiency","scaling"]],
    ["strategy",         ["strategy","strategic","market entry","expansion","merger","competitive","pestle","swot","porter","ansoff","market sizing","m&a","business model"]],
    ["customer_success", ["customer","nps","csat","retention","churn","onboarding","renewal","upsell","support","ticket","escalation"]],
    ["executive",        ["board","ceo","chairman","cross-functional","annual plan","investor","fundraising","ipo","strategic decision"]],
  ];

  for (const [domain, keywords] of domainKeywords) {
    if (keywords.some(kw => q.includes(kw))) return domain;
  }
  return "general";
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — BUILD CONTEXT
// Assembles only the information relevant to this specific question.
// Prevents context bloat — only passes what the reasoning engine needs.
// ─────────────────────────────────────────────────────────────────────────────

export function buildContext(
  domain: Domain,
  company: CompanyContext,
  module: ModuleContext
): string {
  const parts: string[] = [];

  // Always include company basics
  parts.push(
    `COMPANY: ${company.name} | INDUSTRY: ${company.industry} | STAGE: ${company.stage}` +
    `\nHQ: ${company.location} | CURRENCY: ${company.currency} (${company.currencySymbol})` +
    `\nMARKETS: ${company.markets || "Not specified"}`
  );

  // Company data points if present
  if (Object.keys(module.companyData).length > 0) {
    parts.push(
      "COMPANY DATA:\n" +
      Object.entries(module.companyData).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    );
  }

  // Finance domains get ledger data
  if (["finance", "audit", "executive"].includes(domain) && module.ledgerEntries.length > 0) {
    parts.push(`LEDGER: ${module.ledgerEntries.length} journal entries recorded.`);
  }

  // Strategy and executive domains get boardroom history
  if (["strategy", "executive"].includes(domain) && module.boardroomSessions.length > 0) {
    const recent = (module.boardroomSessions as Array<{ q?: string; synthesis?: string }>)
      .slice(-2)
      .map(s => `Q: "${s.q || ""}"`)
      .join("\n");
    parts.push(`RECENT BOARDROOM DECISIONS:\n${recent}`);
  }

  // Live exchange rates for finance roles
  if (["finance", "executive"].includes(domain) && module.liveRates) {
    parts.push(module.liveRates);
  }

  // Autopilot results for executive decisions
  if (domain === "executive" && module.autopilotResult) {
    parts.push(
      "LAST DECISION SCAN:\n" + module.autopilotResult.slice(0, 600)
    );
  }

  return parts.join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — SELECT FRAMEWORK
// Chooses consulting frameworks appropriate to this domain and intent.
// Always explains WHY each framework was selected.
// User can override — this is a recommendation, not a mandate.
// ─────────────────────────────────────────────────────────────────────────────

export function selectFramework(
  domain: Domain,
  intent: Intent
): SelectedFramework[] {
  // Framework map: domain → [framework name, reason for selection]
  const frameworkMap: Record<Domain, [string, string][]> = {
    strategy: [
      ["SWOT", "Situational overview — strengths, weaknesses, opportunities, threats"],
      ["Porter's Five Forces", "Industry competitive dynamics"],
      ["Ansoff Matrix", "Growth direction — market penetration vs new markets vs new products"],
    ],
    finance: [
      ["Financial Ratio Analysis", "Quantify performance across liquidity, profitability, leverage"],
      ["Variance Analysis", "Compare actual vs budget to identify drivers"],
    ],
    marketing: [
      ["SWOT", "Situational overview before go-to-market"],
      ["Ansoff Matrix", "Determine the growth vector this campaign targets"],
      ["Business Model Canvas", "Validate the value proposition and channels"],
    ],
    operations: [
      ["Value Chain Analysis", "Identify where the business creates and loses value"],
      ["Lean / Six Sigma", "Eliminate waste and reduce process variation"],
    ],
    hr: [
      ["RACI", "Clarify roles and responsibilities across the org"],
      ["Balanced Scorecard", "Align people metrics to strategic objectives"],
    ],
    technology: [
      ["Value Chain Analysis", "Map where technology creates competitive advantage"],
    ],
    sales: [
      ["Ansoff Matrix", "Revenue growth — existing vs new customers vs new products"],
    ],
    audit: [
      ["Risk Register", "Identify, score, and mitigate risks systematically"],
    ],
    legal: [
      ["Risk Register", "Identify compliance obligations and exposure"],
    ],
    customer_success: [
      ["Balanced Scorecard", "Track retention, NPS, health score, and expansion revenue"],
    ],
    executive: [
      ["SWOT", "Board-level situational overview"],
      ["Balanced Scorecard", "Cross-functional performance scorecard"],
      ["Scenario Planning", "Model best, base, and worst case outcomes"],
    ],
    general: [
      ["SWOT", "Broad situational assessment as a starting point"],
    ],
  };

  // For planning/creation intent, add roadmap-oriented frameworks
  const selected = frameworkMap[domain] ?? frameworkMap.general;
  if (intent === "decide") {
    selected.push([
      "Decision Matrix",
      "Score each option against weighted criteria to make the choice evidence-based",
    ]);
  }
  if (intent === "plan") {
    selected.push([
      "OKRs",
      "Translate strategy into measurable quarterly objectives and key results",
    ]);
  }

  return selected.map(([name, reason]) => ({ name, reason }));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — EXECUTE REASONING
// Builds the final system prompt combining context, frameworks, and evidence rules.
// Calls the existing ask() function — no new API dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export async function executeReasoning(
  question: string,
  context: string,
  frameworks: SelectedFramework[],
  company: CompanyContext,
  askFn: PipelineInput["askFn"]
): Promise<string> {
  const frameworkBlock = frameworks.length > 0
    ? `\n\nFRAMEWORKS APPLIED:\n` +
      frameworks.map(f => `• ${f.name} — ${f.reason}`).join("\n")
    : "";

  const sys =
    `You are the Intelligence Engine for "${company.name}" — an Enterprise AI Operating System.\n` +
    `You reason with the precision of a senior McKinsey partner and the operational depth of a Big 4 consultant.\n\n` +
    `BUSINESS CONTEXT:\n${context}` +
    frameworkBlock +
    `\n\nEVIDENCE RULES (non-negotiable):\n` +
    `• Label every statistic as one of: [Verified Fact] [Retrieved Evidence] [Calculation] [Assumption] [Expert Inference] [Unknown]\n` +
    `• Show the formula or source behind every number\n` +
    `• If data is unavailable, write [Unknown — requires validation] rather than inventing a figure\n` +
    `• Never present an estimate as a fact\n\n` +
    `OUTPUT FORMAT — McKinsey/BCG/Deloitte standard:\n` +
    `# Executive Summary\n(2-4 sentences: core finding, key figure in ${company.currencySymbol}, recommended action)\n` +
    `---\n## Situation Analysis\n(What is happening and why it matters)\n` +
    `---\n## Evidence & Assumptions\n(Every key figure with its evidence label and source)\n` +
    `---\n## Strategic Analysis\n(Framework application with tables for comparative data)\n` +
    `---\n## Financial Impact\n(All figures in ${company.currencySymbol}; formula → assumption → result)\n` +
    `---\n## Risks\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n` +
    `---\n## Recommendations\n| Priority | Action | Impact | Effort | Deadline |\n|----------|--------|--------|--------|----------|\n` +
    `---\n## Confidence Assessment\n(High/Medium/Low — state which assumptions most affect this rating)\n` +
    `---\n## Sources & References\n(Every cited figure: source name, figure, URL or [Assumption] label)\n\n` +
    `RULES: Bold key metrics. Tables for all numbers. Every number carries a unit (${company.currencySymbol} or %). ` +
    `Scannable in 90 seconds by a C-suite executive. Specific to ${company.name} — no generic placeholders.`;

  return askFn(sys, [{ role: "user", content: question }], 4000, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — CLASSIFY EVIDENCE
// Scans the reasoning output and extracts key statements with evidence labels.
// Used for the trace and for future evidence validation features.
// Purely analytical — does not modify the response.
// ─────────────────────────────────────────────────────────────────────────────

export function classifyEvidence(response: string): EvidenceTag[] {
  const tags: EvidenceTag[] = [];
  const lines = response.split("\n");

  const categoryPatterns: [EvidenceCategory, RegExp][] = [
    ["Verified Fact",      /\[Verified Fact\]/i],
    ["Retrieved Evidence", /\[Retrieved Evidence\]/i],
    ["Calculation",        /\[Calculation\]/i],
    ["Assumption",         /\[Assumption\]/i],
    ["Expert Inference",   /\[Expert Inference\]/i],
    ["Unknown",            /\[Unknown/i],
  ];

  for (const line of lines) {
    for (const [category, pattern] of categoryPatterns) {
      if (pattern.test(line)) {
        tags.push({
          statement: line.replace(/\[.*?\]/g, "").trim(),
          category,
        });
        break;
      }
    }
  }

  return tags;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — SELF REVIEW
// Runs an internal critique of the draft response before it reaches the user.
// Identifies weak reasoning, missing evidence, or inconsistencies.
// Only runs on final outputs — not on intermediate chain steps.
// One additional LLM call. Invisible to the user.
// ─────────────────────────────────────────────────────────────────────────────

export async function selfReview(
  draft: string,
  question: string,
  company: CompanyContext,
  askFn: PipelineInput["askFn"]
): Promise<string> {
  const sys =
    `You are the internal quality reviewer for an AI consulting platform.\n` +
    `Review the draft response below against this original question and improve it.\n\n` +
    `ORIGINAL QUESTION: "${question}"\n` +
    `COMPANY: ${company.name} | ${company.industry} | ${company.location}\n\n` +
    `CHECK FOR:\n` +
    `1. Any number presented without an evidence label — add the label\n` +
    `2. Any recommendation without a stated assumption — make the assumption explicit\n` +
    `3. Any section that is generic and not specific to ${company.name} — make it specific\n` +
    `4. Any inconsistency between the Executive Summary and the Recommendations\n` +
    `5. Any missing Confidence Assessment — add it if absent\n\n` +
    `If the draft is already high quality, return it unchanged.\n` +
    `If improvements are needed, return the improved version.\n` +
    `Return ONLY the final response — no commentary, no preamble, no explanation of changes.`;

  try {
    const reviewed = await askFn(
      sys,
      [{ role: "user", content: `DRAFT TO REVIEW:\n\n${draft}` }],
      4000,
      false
    );
    return reviewed || draft;
  } catch {
    // If self-review fails, return the original draft — never block the response
    return draft;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — FORMAT RESPONSE
// Final formatting pass. Ensures the response matches the output type
// determined during planning (report vs analysis vs deliverable vs answer).
// No LLM call — pure string processing.
// ─────────────────────────────────────────────────────────────────────────────

export function formatResponse(
  response: string,
  outputType: PlanningResult["outputType"],
  frameworks: SelectedFramework[]
): string {
  // Prepend framework disclosure for transparency
  const frameworkNote = frameworks.length > 0
    ? `> **Frameworks applied:** ${frameworks.map(f => f.name).join(" · ")}\n\n`
    : "";

  // For short answers, strip the consulting report structure
  if (outputType === "answer") {
    return frameworkNote + response;
  }

  // For all other types, the response already follows the report format
  // from executeReasoning() — just prepend the framework note
  return frameworkNote + response;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — GENERATE TRACE
// Creates the internal observability record for this execution.
// Stored via WorkspaceMemory for debugging and quality review.
// Never shown to the user directly.
// ─────────────────────────────────────────────────────────────────────────────

export function generateTrace(
  question: string,
  plan: PlanningResult,
  frameworks: SelectedFramework[],
  selfReviewPerformed: boolean,
  startTime: number
): ExecutionTrace {
  return {
    sessionId: `ie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    question: question.slice(0, 120),
    domain: plan.domain,
    frameworks: frameworks.map(f => f.name),
    requiresResearch: plan.requiresResearch,
    selfReviewPerformed,
    processingMs: Date.now() - startTime,
    engineVersion: "2.0.0",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE — runPipeline()
// Orchestrates all steps in sequence.
// This is the single function modules will call in Session 6+.
//
// Current usage (Session 2): not called by any module yet.
// Future usage (Session 6+):
//   const result = await runPipeline(input);
//   const reply = result.response;
// ─────────────────────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startTime = Date.now();
  const { question, company, module, askFn } = input;

  // Step 1 — Planning
  const plan = await planning(question, company, module, askFn);

  // If clarification is needed, return immediately with the question
  if (plan.needsClarification) {
    return {
      response: plan.clarificationQuestion,
      trace: generateTrace(question, plan, [], false, startTime),
      plan,
      frameworks: [],
      evidenceTags: [],
      needsClarification: true,
      clarificationQuestion: plan.clarificationQuestion,
    };
  }

  // Step 2 — Classify intent (pure logic, no LLM)
  const intent = classifyIntent(question);

  // Step 3 — Classify domain (pure logic, no LLM — uses plan.domain as primary)
  const domain: Domain = plan.domain || classifyDomain(question);

  // Step 4 — Build context (only relevant data for this domain)
  const context = buildContext(domain, company, module);

  // Step 5 — Select frameworks
  const frameworks = selectFramework(domain, intent);

  // Step 6 — Execute reasoning
  const draft = await executeReasoning(question, context, frameworks, company, askFn);

  // Step 7 — Classify evidence in the draft
  const evidenceTags = classifyEvidence(draft);

  // Step 8 — Self review (only for final report/analysis outputs)
  const needsReview = ["report", "analysis", "plan"].includes(plan.outputType);
  const reviewed = needsReview
    ? await selfReview(draft, question, company, askFn)
    : draft;

  // Step 9 — Format response
  const finalResponse = formatResponse(reviewed, plan.outputType, frameworks);

  // Step 10 — Generate trace
  const trace = generateTrace(question, plan, frameworks, needsReview, startTime);

  return {
    response: finalResponse,
    trace,
    plan,
    frameworks,
    evidenceTags,
    needsClarification: false,
    clarificationQuestion: "",
  };
}

// =============================================================================
// SHARED INTELLIGENCE LAYER — Appended to existing IntelligenceEngine.ts
// 10 reusable services for all AI Agents and Agentic Workflows.
// The pipeline above (runPipeline, classifyDomain, etc.) is unchanged.
// =============================================================================

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface IEContext {
  companyProfile?: Record<string, unknown>;
  boardroomHistory?: string[];
  dataHubRecords?: Record<string, unknown>[];
  previousAgentOutputs?: Record<string, unknown>[];
  previousWorkflowOutputs?: Record<string, unknown>[];
  projectDeliverables?: Record<string, unknown>[];
}

export interface ValidationField {
  field: string;
  required: boolean;
  available: boolean;
  source?: string; // "user" | "context" | "dataHub" | "previous"
}

export interface ValidationResult {
  readinessScore: number;          // 0-100
  ready: boolean;
  available: ValidationField[];
  missing: ValidationField[];
  reusableFromContext: string[];   // field names auto-filled from context
  blockers: string[];              // hard blockers (required + missing)
  warnings: string[];              // soft warnings
}

export interface DataQualityResult {
  qualityScore: number;            // 0-100
  confidenceScore: number;         // 0-100
  issues: DataQualityIssue[];
  warnings: string[];
  suggestedCorrections: SuggestedCorrection[];
  canProceed: boolean;
}

export interface DataQualityIssue {
  type:
    | "missing_column"
    | "duplicate_rows"
    | "invalid_date"
    | "currency_inconsistency"
    | "corrupted_table"
    | "partial_screenshot"
    | "blurry_image"
    | "incomplete_document"
    | "null_values"
    | "schema_mismatch";
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
  rowsAffected?: number;
  columnsAffected?: string[];
}

export interface SuggestedCorrection {
  issue: string;
  suggestion: string;
  autoApplicable: boolean;
}

export interface RecoveryResult {
  merged: boolean;
  pagesDetected: number;
  tablesReconstructed: number;
  readingOrderRestored: boolean;
  uncertainFields: string[];
  requiresManualReview: boolean;
  confidenceScore: number;
  reconstructedData: Record<string, unknown>[];
}

export type BusinessObjective =
  | "reduce_processing_time"
  | "board_meeting_prep"
  | "month_end_close"
  | "audit"
  | "compliance"
  | "investor_presentation"
  | "forecast"
  | "risk_assessment"
  | "operational_review"
  | "cost_optimisation"
  | "general";

export interface ObjectiveDetectionResult {
  primary: BusinessObjective;
  confidence: number;             // 0-100
  secondary: BusinessObjective[];
  outputOptimisations: string[];  // what the engine will tune
}

export interface LearningProfile {
  userId: string;
  preferredLayouts: string[];
  preferredTerminology: Record<string, string>;
  branding: {
    primaryColor?: string;
    fontFamily?: string;
    logoPosition?: string;
  };
  writingStyle: "formal" | "executive" | "concise" | "detailed";
  dashboardStyle: "minimal" | "data-dense" | "visual";
  chartPreferences: string[];
  lastUpdated: string;
}

export interface ExceptionResult {
  detected: boolean;
  exceptions: ExceptionItem[];
}

export interface ExceptionItem {
  description: string;
  rootCause: string;
  recommendedAction: string;
  riskLevel: "critical" | "high" | "medium" | "low";
  escalationRequired: boolean;
  escalateTo?: string;
  nextStep: string;
}

export interface ImprovementSuggestion {
  automationOpportunity: string;
  manualEffortReduction: string;
  estimatedHoursSaved: number;
  tools: {
    powerBI?: string;
    powerQuery?: string;
    powerAutomate?: string;
    officeScripts?: string;
    vba?: string;
    sql?: string;
    python?: string;
    serviceNow?: string;
    sap?: string;
    concur?: string;
  };
}

export interface WorkflowMemoryRecord {
  workflowId: string;
  userId: string;
  columnMappings: Record<string, string>;
  filters: Record<string, unknown>;
  slaRules: Record<string, unknown>;
  companyTerminology: Record<string, string>;
  industry: string;
  preferredOutputs: string[];
  savedConfig: Record<string, unknown>;
  lastRun: string;
  runCount: number;
}

export interface EnterpriseReport {
  executiveSummary: string;
  keyFindings: string[];
  evidenceUsed: string[];
  assumptions: string[];
  riskRating: "Critical" | "High" | "Medium" | "Low" | "None";
  businessImpact: string;
  recommendations: string[];
  quickWins: string[];
  longTermImprovements: string[];
  nextActions: string[];
  confidenceScore: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────

const STORAGE_PREFIX = "orchestriq_ie_";

const KEYS = {
  LEARNING_PROFILE: (uid: string) => `${STORAGE_PREFIX}learning_${uid}`,
  WORKFLOW_MEMORY: (wfId: string, uid: string) =>
    `${STORAGE_PREFIX}wf_${wfId}_${uid}`,
  CONTEXT_CACHE: `${STORAGE_PREFIX}context_cache`,
  OBJECTIVE_HISTORY: `${STORAGE_PREFIX}objective_history`,
  IMPROVEMENT_LOG: `${STORAGE_PREFIX}improvement_log`,
};

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — fail silently
  }
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────
// 1. PRE-EXECUTION VALIDATOR
// ─────────────────────────────────────────────

/**
 * Call before any agent starts.
 * Pass the field manifest (what the agent needs) and the current context.
 * Returns a readiness score and exactly which fields are missing.
 *
 * Usage:
 *   const v = PreExecutionValidator.validate(manifest, userInputs, context);
 *   if (!v.ready) show missing fields only.
 */
export const PreExecutionValidator = {
  /**
   * @param manifest  - Array of field definitions the workflow requires
   * @param userInputs - What the user has provided so far
   * @param context   - Auto-loaded context (company profile, data hub, etc.)
   */
  validate(
    manifest: Array<{
      field: string;
      required: boolean;
      aliases?: string[];
    }>,
    userInputs: Record<string, unknown>,
    context: IEContext = {}
  ): ValidationResult {
    const contextKeys = this._flatContextKeys(context);
    const available: ValidationField[] = [];
    const missing: ValidationField[] = [];
    const reusableFromContext: string[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    for (const item of manifest) {
      const inUser =
        userInputs[item.field] !== undefined &&
        userInputs[item.field] !== null &&
        userInputs[item.field] !== "";

      const alias = item.aliases?.find((a) => userInputs[a]);
      const inContext = contextKeys.has(item.field.toLowerCase());

      if (inUser || alias) {
        available.push({
          field: item.field,
          required: item.required,
          available: true,
          source: "user",
        });
      } else if (inContext) {
        available.push({
          field: item.field,
          required: item.required,
          available: true,
          source: "context",
        });
        reusableFromContext.push(item.field);
      } else {
        missing.push({
          field: item.field,
          required: item.required,
          available: false,
        });
        if (item.required) {
          blockers.push(item.field);
        } else {
          warnings.push(`Optional field missing: ${item.field}`);
        }
      }
    }

    const totalRequired = manifest.filter((m) => m.required).length;
    const metRequired = totalRequired - blockers.length;
    const readinessScore =
      manifest.length === 0
        ? 100
        : Math.round(
            ((available.length + reusableFromContext.length * 0.5) /
              manifest.length) *
              100
          );

    return {
      readinessScore: Math.min(readinessScore, 100),
      ready: blockers.length === 0,
      available,
      missing,
      reusableFromContext,
      blockers,
      warnings,
    };
  },

  _flatContextKeys(context: IEContext): Set<string> {
    const keys = new Set<string>();
    if (context.companyProfile) {
      Object.keys(context.companyProfile).forEach((k) =>
        keys.add(k.toLowerCase())
      );
    }
    if (context.dataHubRecords?.length) {
      context.dataHubRecords.forEach((r) =>
        Object.keys(r).forEach((k) => keys.add(k.toLowerCase()))
      );
    }
    return keys;
  },

  /** Render a readiness badge string for display */
  renderBadge(result: ValidationResult): string {
    const icon = result.readinessScore >= 80 ? "✅" : result.readinessScore >= 50 ? "⚠️" : "🔴";
    return `${icon} Data Readiness: ${result.readinessScore}%`;
  },
};

// ─────────────────────────────────────────────
// 2. DATA QUALITY ASSESSOR
// ─────────────────────────────────────────────

/**
 * Analyse any uploaded data before an agent processes it.
 * Supports tabular data (rows of objects), raw text, and image metadata.
 *
 * Usage:
 *   const q = DataQualityAssessor.assess(rows, expectedColumns);
 *   if (!q.canProceed) show q.issues;
 */
export const DataQualityAssessor = {
  assess(
    data: Record<string, unknown>[],
    expectedColumns: string[] = [],
    options: { isImage?: boolean; isPDF?: boolean; isText?: boolean } = {}
  ): DataQualityResult {
    const issues: DataQualityIssue[] = [];
    const warnings: string[] = [];
    const corrections: SuggestedCorrection[] = [];

    if (options.isImage) {
      // Can only do metadata-level checks without actual image processing
      issues.push({
        type: "partial_screenshot",
        severity: "medium",
        detail: "Image input detected — verify all data is visible and unobstructed.",
      });
      return {
        qualityScore: 70,
        confidenceScore: 60,
        issues,
        warnings: ["Manual verification recommended for image inputs."],
        suggestedCorrections: [],
        canProceed: true,
      };
    }

    if (!data || data.length === 0) {
      return {
        qualityScore: 0,
        confidenceScore: 0,
        issues: [
          {
            type: "incomplete_document",
            severity: "critical",
            detail: "No data rows found.",
          },
        ],
        warnings: ["Dataset is empty."],
        suggestedCorrections: [],
        canProceed: false,
      };
    }

    const actualColumns = Object.keys(data[0] || {});

    // Missing columns
    const missingCols = expectedColumns.filter(
      (c) => !actualColumns.map((a) => a.toLowerCase()).includes(c.toLowerCase())
    );
    if (missingCols.length > 0) {
      issues.push({
        type: "missing_column",
        severity: missingCols.length > 3 ? "critical" : "high",
        detail: `Missing expected columns: ${missingCols.join(", ")}`,
        columnsAffected: missingCols,
      });
      corrections.push({
        issue: "Missing columns",
        suggestion: `Add or map the following columns: ${missingCols.join(", ")}`,
        autoApplicable: false,
      });
    }

    // Duplicate rows
    const serialised = data.map((r) => JSON.stringify(r));
    const dupeCount = serialised.length - new Set(serialised).size;
    if (dupeCount > 0) {
      issues.push({
        type: "duplicate_rows",
        severity: dupeCount > data.length * 0.1 ? "high" : "medium",
        detail: `${dupeCount} duplicate rows detected (${Math.round((dupeCount / data.length) * 100)}% of dataset).`,
        rowsAffected: dupeCount,
      });
      corrections.push({
        issue: "Duplicate rows",
        suggestion: "Remove duplicate rows before processing.",
        autoApplicable: true,
      });
    }

    // Invalid dates
    const dateColumns = actualColumns.filter((c) =>
      /(date|time|period|month|year|dob|created|updated|modified)/i.test(c)
    );
    let invalidDateCount = 0;
    for (const col of dateColumns) {
      for (const row of data) {
        const val = row[col];
        if (val && typeof val === "string" && isNaN(Date.parse(val))) {
          invalidDateCount++;
        }
      }
    }
    if (invalidDateCount > 0) {
      issues.push({
        type: "invalid_date",
        severity: invalidDateCount > 10 ? "high" : "medium",
        detail: `${invalidDateCount} invalid date values detected across date columns.`,
        rowsAffected: invalidDateCount,
        columnsAffected: dateColumns,
      });
    }

    // Currency inconsistencies
    const amountColumns = actualColumns.filter((c) =>
      /(amount|value|price|cost|salary|fee|rate|revenue|budget|spend|tax)/i.test(c)
    );
    const currencies = new Set<string>();
    for (const col of amountColumns) {
      for (const row of data) {
        const val = String(row[col] || "");
        const match = val.match(/^([£$€₹¥]|USD|EUR|GBP|INR|AED|SGD)/);
        if (match) currencies.add(match[1]);
      }
    }
    if (currencies.size > 1) {
      issues.push({
        type: "currency_inconsistency",
        severity: "high",
        detail: `Multiple currencies detected: ${[...currencies].join(", ")}. Normalise to a single base currency.`,
        columnsAffected: amountColumns,
      });
      corrections.push({
        issue: "Currency inconsistency",
        suggestion: "Apply exchange rate conversion to normalise all amounts to base currency (e.g. USD or INR).",
        autoApplicable: false,
      });
    }

    // Null / empty value scan
    let nullCount = 0;
    const nullCols = new Set<string>();
    for (const row of data) {
      for (const col of actualColumns) {
        if (row[col] === null || row[col] === undefined || row[col] === "") {
          nullCount++;
          nullCols.add(col);
        }
      }
    }
    const nullPct = (nullCount / (data.length * actualColumns.length)) * 100;
    if (nullPct > 5) {
      issues.push({
        type: "null_values",
        severity: nullPct > 30 ? "critical" : nullPct > 15 ? "high" : "medium",
        detail: `${nullCount} empty/null values (${nullPct.toFixed(1)}%) across columns: ${[...nullCols].join(", ")}`,
        columnsAffected: [...nullCols],
      });
    }

    // Compute quality score
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const highCount = issues.filter((i) => i.severity === "high").length;
    const medCount = issues.filter((i) => i.severity === "medium").length;
    const penalty = criticalCount * 30 + highCount * 15 + medCount * 5;
    const qualityScore = Math.max(0, 100 - penalty);
    const confidenceScore = Math.max(0, qualityScore - (nullPct > 0 ? 5 : 0));

    return {
      qualityScore,
      confidenceScore,
      issues,
      warnings,
      suggestedCorrections: corrections,
      canProceed: criticalCount === 0,
    };
  },

  /** Render quality badge string */
  renderBadge(result: DataQualityResult): string {
    const icon =
      result.qualityScore >= 80
        ? "🟢"
        : result.qualityScore >= 50
        ? "🟡"
        : "🔴";
    return `${icon} Data Quality: ${result.qualityScore}% | Confidence: ${result.confidenceScore}%`;
  },
};

// ─────────────────────────────────────────────
// 3. INPUT RECOVERY ENGINE
// ─────────────────────────────────────────────

/**
 * Handles multi-photo, multi-page, or partial uploads.
 * Merges pages, restores reading order, reconstructs tables.
 *
 * NOTE: Full OCR reconstruction requires backend support.
 *       This module manages orchestration logic and metadata.
 *
 * Usage:
 *   const r = await InputRecoveryEngine.recover(rawPages, "table");
 */
export const InputRecoveryEngine = {
  async recover(
    rawPages: Array<{
      pageIndex: number;
      content: Record<string, unknown>[];
      hasHeader: boolean;
      isPartial: boolean;
      confidenceScore: number;
    }>,
    mode: "table" | "document" | "form" = "table"
  ): Promise<RecoveryResult> {
    if (!rawPages || rawPages.length === 0) {
      return {
        merged: false,
        pagesDetected: 0,
        tablesReconstructed: 0,
        readingOrderRestored: false,
        uncertainFields: [],
        requiresManualReview: true,
        confidenceScore: 0,
        reconstructedData: [],
      };
    }

    // Sort by page index to restore reading order
    const sorted = [...rawPages].sort((a, b) => a.pageIndex - b.pageIndex);

    // Detect repeated headers (page-continuation pattern)
    const headers =
      sorted[0].hasHeader && sorted[0].content.length > 0
        ? Object.keys(sorted[0].content[0])
        : [];

    // Merge content, stripping repeated header rows
    const merged: Record<string, unknown>[] = [];
    for (const page of sorted) {
      for (const row of page.content) {
        // Skip rows that are just the header repeated
        const isHeaderRepeat =
          headers.length > 0 &&
          headers.every(
            (h) => String(row[h] || "").toLowerCase() === h.toLowerCase()
          );
        if (!isHeaderRepeat) {
          merged.push(row);
        }
      }
    }

    // Identify uncertain fields (from low-confidence pages)
    const uncertainFields: string[] = [];
    for (const page of sorted) {
      if (page.confidenceScore < 70 && page.content.length > 0) {
        Object.keys(page.content[0]).forEach((k) => {
          if (!uncertainFields.includes(k)) uncertainFields.push(k);
        });
      }
    }

    const avgConfidence =
      sorted.reduce((s, p) => s + p.confidenceScore, 0) / sorted.length;
    const partialPages = sorted.filter((p) => p.isPartial);

    return {
      merged: true,
      pagesDetected: sorted.length,
      tablesReconstructed: mode === "table" ? 1 : 0,
      readingOrderRestored: true,
      uncertainFields,
      requiresManualReview:
        uncertainFields.length > 0 || partialPages.length > 0,
      confidenceScore: Math.round(avgConfidence),
      reconstructedData: merged,
    };
  },
};

// ─────────────────────────────────────────────
// 4. CONTEXT AWARENESS ENGINE
// ─────────────────────────────────────────────

/**
 * Auto-loads all available context: company profile, Data Hub,
 * previous agent/workflow/project outputs.
 * Call this at the start of every agent execution.
 *
 * Usage:
 *   const ctx = ContextAwarenessEngine.load(userId);
 */
export const ContextAwarenessEngine = {
  /**
   * Load all available context for a user from localStorage.
   * Extend adapters as Supabase cloud is wired in.
   */
  load(userId: string): IEContext {
    const profile = safeGet<Record<string, unknown>>(
      `orchestriq_company_profile_${userId}`
    );
    const boardroom = safeGet<string[]>(
      `orchestriq_boardroom_history_${userId}`
    );
    const dataHub = safeGet<Record<string, unknown>[]>(
      `orchestriq_datahub_${userId}`
    );
    const agentOutputs = safeGet<Record<string, unknown>[]>(
      `orchestriq_agent_outputs_${userId}`
    );
    const workflowOutputs = safeGet<Record<string, unknown>[]>(
      `orchestriq_workflow_outputs_${userId}`
    );
    const projectDeliverables = safeGet<Record<string, unknown>[]>(
      `orchestriq_project_deliverables_${userId}`
    );

    return {
      companyProfile: profile || undefined,
      boardroomHistory: boardroom || [],
      dataHubRecords: dataHub || [],
      previousAgentOutputs: agentOutputs || [],
      previousWorkflowOutputs: workflowOutputs || [],
      projectDeliverables: projectDeliverables || [],
    };
  },

  /** Persist a new agent output for future context reuse */
  saveAgentOutput(
    userId: string,
    agentId: string,
    output: Record<string, unknown>
  ): void {
    const key = `orchestriq_agent_outputs_${userId}`;
    const existing = safeGet<Record<string, unknown>[]>(key) || [];
    existing.unshift({ agentId, output, savedAt: now() });
    // Keep last 20 outputs
    safeSet(key, existing.slice(0, 20));
  },

  /** Persist a workflow output */
  saveWorkflowOutput(
    userId: string,
    workflowId: string,
    output: Record<string, unknown>
  ): void {
    const key = `orchestriq_workflow_outputs_${userId}`;
    const existing = safeGet<Record<string, unknown>[]>(key) || [];
    existing.unshift({ workflowId, output, savedAt: now() });
    safeSet(key, existing.slice(0, 20));
  },

  /** Build a context summary string for injection into AI prompts */
  buildContextSummary(ctx: IEContext): string {
    const parts: string[] = [];
    if (ctx.companyProfile && Object.keys(ctx.companyProfile).length > 0) {
      parts.push(
        `Company Profile: ${JSON.stringify(ctx.companyProfile).slice(0, 500)}`
      );
    }
    if (ctx.boardroomHistory && ctx.boardroomHistory.length > 0) {
      parts.push(
        `Recent Boardroom Discussions (last ${Math.min(3, ctx.boardroomHistory.length)}): ${ctx.boardroomHistory.slice(0, 3).join(" | ")}`
      );
    }
    if (ctx.dataHubRecords && ctx.dataHubRecords.length > 0) {
      parts.push(
        `Data Hub: ${ctx.dataHubRecords.length} records available.`
      );
    }
    if (ctx.previousAgentOutputs && ctx.previousAgentOutputs.length > 0) {
      parts.push(
        `Previous Agent Outputs: ${ctx.previousAgentOutputs.length} available for reference.`
      );
    }
    return parts.join("\n");
  },
};

// ─────────────────────────────────────────────
// 5. BUSINESS OBJECTIVE DETECTOR
// ─────────────────────────────────────────────

/**
 * Detects the business objective from free-text input.
 * Used to tune AI prompt framing and output sections automatically.
 *
 * Usage:
 *   const obj = BusinessObjectiveDetector.detect("Prepare our Q4 board pack");
 */
export const BusinessObjectiveDetector = {
  _rules: [
    {
      objective: "board_meeting_prep" as BusinessObjective,
      keywords: ["board", "board pack", "board meeting", "directors", "governance"],
    },
    {
      objective: "month_end_close" as BusinessObjective,
      keywords: ["month end", "close", "period close", "financial close", "month-end"],
    },
    {
      objective: "audit" as BusinessObjective,
      keywords: ["audit", "auditor", "review", "internal audit", "external audit", "sox"],
    },
    {
      objective: "compliance" as BusinessObjective,
      keywords: ["compliance", "policy", "regulation", "gdpr", "ifrs", "gaap", "legal"],
    },
    {
      objective: "investor_presentation" as BusinessObjective,
      keywords: ["investor", "fundraise", "pitch", "vcs", "series", "ipo", "due diligence"],
    },
    {
      objective: "forecast" as BusinessObjective,
      keywords: ["forecast", "projection", "budget", "plan", "outlook", "scenario", "model"],
    },
    {
      objective: "risk_assessment" as BusinessObjective,
      keywords: ["risk", "exposure", "mitigation", "contingency", "impact", "likelihood"],
    },
    {
      objective: "reduce_processing_time" as BusinessObjective,
      keywords: ["automate", "speed up", "reduce time", "faster", "efficiency", "streamline"],
    },
    {
      objective: "cost_optimisation" as BusinessObjective,
      keywords: ["cost", "saving", "reduce spend", "optimise", "cut", "lean"],
    },
    {
      objective: "operational_review" as BusinessObjective,
      keywords: ["ops review", "performance review", "kpi", "metrics", "dashboard", "operations"],
    },
  ],

  detect(userInput: string): ObjectiveDetectionResult {
    const lower = userInput.toLowerCase();
    const scores: Record<BusinessObjective, number> = {} as Record<
      BusinessObjective,
      number
    >;

    for (const rule of this._rules) {
      let score = 0;
      for (const kw of rule.keywords) {
        if (lower.includes(kw)) score += 10;
      }
      scores[rule.objective] = score;
    }

    const sorted = Object.entries(scores)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a);

    const primary =
      sorted.length > 0
        ? (sorted[0][0] as BusinessObjective)
        : "general";
    const confidence =
      sorted.length > 0 ? Math.min(sorted[0][1] * 5, 95) : 30;
    const secondary = sorted
      .slice(1, 3)
      .map(([k]) => k as BusinessObjective);

    const optimisations = this._getOptimisations(primary);

    return { primary, confidence, secondary, outputOptimisations: optimisations };
  },

  _getOptimisations(obj: BusinessObjective): string[] {
    const map: Record<BusinessObjective, string[]> = {
      board_meeting_prep: [
        "Executive Summary first",
        "Risk section highlighted",
        "Key decisions called out",
        "Board-ready formatting",
      ],
      month_end_close: [
        "Variance analysis included",
        "Journal entry readiness check",
        "Reconciliation flags surfaced",
        "Period-over-period comparison",
      ],
      audit: [
        "Evidence trail included",
        "Assumptions explicit",
        "Source documents cited",
        "Control gaps flagged",
      ],
      compliance: [
        "Policy references cited",
        "Non-compliance risks flagged",
        "Corrective actions prioritised",
        "Regulatory standard applied",
      ],
      investor_presentation: [
        "Value story first",
        "Market size included",
        "Risks disclosed with mitigations",
        "Financial projections highlighted",
      ],
      forecast: [
        "Scenario analysis (base/bull/bear)",
        "Key driver sensitivity",
        "Assumption transparency",
        "Rolling forecast view",
      ],
      risk_assessment: [
        "Risk matrix generated",
        "Likelihood × Impact scoring",
        "Mitigation roadmap",
        "Owner assignment recommended",
      ],
      reduce_processing_time: [
        "Automation opportunities first",
        "Manual steps quantified",
        "Effort-to-automate ratio shown",
        "Quick wins prioritised",
      ],
      cost_optimisation: [
        "Spend breakdown",
        "Savings potential quantified",
        "Benchmarks used",
        "Implementation cost factored",
      ],
      operational_review: [
        "KPI scorecard",
        "Trend analysis",
        "Outlier investigation",
        "Benchmark comparison",
      ],
      general: [
        "Standard consulting format",
        "MECE structure",
        "Balanced recommendations",
      ],
    };
    return map[obj] || map.general;
  },

  /** Build a prompt prefix from detected objective */
  buildObjectivePromptPrefix(result: ObjectiveDetectionResult): string {
    return `PRIMARY BUSINESS OBJECTIVE: ${result.primary.replace(/_/g, " ").toUpperCase()}
Confidence: ${result.confidence}%
Output Optimisations Active: ${result.outputOptimisations.join(" | ")}
`;
  },
};

// ─────────────────────────────────────────────
// 6. LEARNING ENGINE
// ─────────────────────────────────────────────

/**
 * Stores user preferences from every edit.
 * Never stores business data — only style/preference metadata.
 *
 * Usage:
 *   LearningEngine.recordEdit(userId, "excel", { layout: "dense" });
 *   const profile = LearningEngine.getProfile(userId);
 */
export const LearningEngine = {
  getProfile(userId: string): LearningProfile {
    const key = KEYS.LEARNING_PROFILE(userId);
    const existing = safeGet<LearningProfile>(key);
    if (existing) return existing;
    return {
      userId,
      preferredLayouts: [],
      preferredTerminology: {},
      branding: {},
      writingStyle: "executive",
      dashboardStyle: "data-dense",
      chartPreferences: [],
      lastUpdated: now(),
    };
  },

  recordEdit(
    userId: string,
    editType: "excel" | "powerpoint" | "word" | "email" | "dashboard",
    preferences: Partial<{
      layout: string;
      chartType: string;
      terminology: Record<string, string>;
      primaryColor: string;
      fontFamily: string;
      writingStyle: LearningProfile["writingStyle"];
      dashboardStyle: LearningProfile["dashboardStyle"];
    }>
  ): void {
    const key = KEYS.LEARNING_PROFILE(userId);
    const profile = this.getProfile(userId);

    if (
      preferences.layout &&
      !profile.preferredLayouts.includes(preferences.layout)
    ) {
      profile.preferredLayouts.unshift(preferences.layout);
      profile.preferredLayouts = profile.preferredLayouts.slice(0, 5);
    }
    if (preferences.chartType) {
      if (!profile.chartPreferences.includes(preferences.chartType)) {
        profile.chartPreferences.unshift(preferences.chartType);
        profile.chartPreferences = profile.chartPreferences.slice(0, 5);
      }
    }
    if (preferences.terminology) {
      profile.preferredTerminology = {
        ...profile.preferredTerminology,
        ...preferences.terminology,
      };
    }
    if (preferences.primaryColor)
      profile.branding.primaryColor = preferences.primaryColor;
    if (preferences.fontFamily)
      profile.branding.fontFamily = preferences.fontFamily;
    if (preferences.writingStyle)
      profile.writingStyle = preferences.writingStyle;
    if (preferences.dashboardStyle)
      profile.dashboardStyle = preferences.dashboardStyle;

    profile.lastUpdated = now();
    safeSet(key, profile);
  },

  /** Build a prompt suffix with user preferences for AI calls */
  buildStylePromptSuffix(userId: string): string {
    const profile = this.getProfile(userId);
    const lines: string[] = [];
    if (profile.writingStyle)
      lines.push(`Writing Style: ${profile.writingStyle}`);
    if (profile.preferredLayouts.length > 0)
      lines.push(`Preferred Layout: ${profile.preferredLayouts[0]}`);
    if (profile.chartPreferences.length > 0)
      lines.push(`Preferred Charts: ${profile.chartPreferences.join(", ")}`);
    if (Object.keys(profile.preferredTerminology).length > 0) {
      const terms = Object.entries(profile.preferredTerminology)
        .slice(0, 5)
        .map(([k, v]) => `"${k}" → "${v}"`)
        .join(", ");
      lines.push(`Terminology Preferences: ${terms}`);
    }
    return lines.length > 0 ? `\nUSER STYLE PREFERENCES:\n${lines.join("\n")}` : "";
  },
};

// ─────────────────────────────────────────────
// 7. EXCEPTION ENGINE
// ─────────────────────────────────────────────

/**
 * Wraps any workflow output and detects exceptions.
 * Every workflow must call this before returning results.
 *
 * Usage:
 *   const exceptions = ExceptionEngine.analyse(workflowOutput, domain);
 */
export const ExceptionEngine = {
  analyse(
    output: Record<string, unknown>,
    domain: "finance" | "hr" | "operations" | "procurement" | "general" = "general"
  ): ExceptionResult {
    const exceptions: ExceptionItem[] = [];

    // Generic exception patterns
    const checks: Array<{
      test: (o: Record<string, unknown>) => boolean;
      item: ExceptionItem;
    }> = [
      {
        test: (o) =>
          typeof o.variance === "number" && Math.abs(o.variance as number) > 10,
        item: {
          description: "Variance exceeds 10% threshold",
          rootCause: "Budget vs actuals misalignment or data entry error",
          recommendedAction:
            "Investigate line items driving variance; request supporting documents",
          riskLevel: "high",
          escalationRequired: true,
          escalateTo: "Finance Manager / CFO",
          nextStep: "Schedule variance review meeting within 48 hours",
        },
      },
      {
        test: (o) =>
          typeof o.nullCount === "number" && (o.nullCount as number) > 0,
        item: {
          description: "Missing mandatory fields in submitted data",
          rootCause: "Incomplete data entry or system extraction failure",
          recommendedAction:
            "Return to submitter for completion; do not process incomplete records",
          riskLevel: "medium",
          escalationRequired: false,
          nextStep: "Send data quality rejection notice with field list",
        },
      },
      {
        test: (o) =>
          Array.isArray(o.duplicates) && (o.duplicates as unknown[]).length > 0,
        item: {
          description: "Duplicate transactions or entries detected",
          rootCause: "Double submission, system sync issue, or manual error",
          recommendedAction:
            "Quarantine duplicates; do not post until originals confirmed",
          riskLevel: "high",
          escalationRequired: true,
          escalateTo: "Process Owner",
          nextStep:
            "Run deduplication check; validate against source system records",
        },
      },
      {
        test: (o) =>
          typeof o.slaBreach === "boolean" && o.slaBreach === true,
        item: {
          description: "SLA breach detected",
          rootCause: "Processing delay, resource shortage, or unresolved blocker",
          recommendedAction:
            "Immediate escalation to SLA owner; document breach reason",
          riskLevel: "critical",
          escalationRequired: true,
          escalateTo: "Service Owner / Operations Head",
          nextStep: "Trigger SLA breach workflow; notify customer/stakeholder",
        },
      },
      {
        test: (o) =>
          typeof o.policyViolation === "boolean" && o.policyViolation === true,
        item: {
          description: "Policy violation detected in submitted data",
          rootCause: "Non-compliance with company policy or delegation of authority",
          recommendedAction:
            "Reject transaction; route for exception approval or rejection",
          riskLevel: "critical",
          escalationRequired: true,
          escalateTo: "Compliance / Internal Audit",
          nextStep: "Log violation; initiate corrective action workflow",
        },
      },
    ];

    for (const check of checks) {
      if (check.test(output)) {
        exceptions.push(check.item);
      }
    }

    // Domain-specific checks
    if (domain === "finance") {
      if (
        typeof output.approvalRequired === "boolean" &&
        output.approvalRequired &&
        !output.approvedBy
      ) {
        exceptions.push({
          description: "Transaction requires approval but has no approver assigned",
          rootCause: "Workflow routing failure or approval matrix gap",
          recommendedAction: "Assign approver per delegation of authority matrix",
          riskLevel: "high",
          escalationRequired: true,
          escalateTo: "Finance Controller",
          nextStep: "Update approval matrix; re-route transaction",
        });
      }
    }

    return {
      detected: exceptions.length > 0,
      exceptions,
    };
  },

  /** Format exceptions into a markdown section for reports */
  formatForReport(result: ExceptionResult): string {
    if (!result.detected) return "✅ No exceptions detected.";

    const lines = ["## ⚠️ Exceptions Detected\n"];
    for (const ex of result.exceptions) {
      const riskIcon =
        ex.riskLevel === "critical"
          ? "🔴"
          : ex.riskLevel === "high"
          ? "🟠"
          : ex.riskLevel === "medium"
          ? "🟡"
          : "🟢";
      lines.push(`### ${riskIcon} ${ex.description}`);
      lines.push(`- **Root Cause:** ${ex.rootCause}`);
      lines.push(`- **Recommended Action:** ${ex.recommendedAction}`);
      lines.push(`- **Risk Level:** ${ex.riskLevel.toUpperCase()}`);
      if (ex.escalationRequired) {
        lines.push(`- **Escalate To:** ${ex.escalateTo}`);
      }
      lines.push(`- **Next Step:** ${ex.nextStep}\n`);
    }
    return lines.join("\n");
  },
};

// ─────────────────────────────────────────────
// 8. CONTINUOUS IMPROVEMENT ENGINE
// ─────────────────────────────────────────────

/**
 * After every completed workflow, generate improvement suggestions.
 * This is guidance only — no automatic execution.
 *
 * Usage:
 *   const suggestions = ContinuousImprovementEngine.analyse(workflowMeta);
 */
export const ContinuousImprovementEngine = {
  analyse(workflowMeta: {
    workflowName: string;
    domain: string;
    manualSteps: string[];
    totalRows: number;
    processingTimeMs: number;
    repeatFrequency: "daily" | "weekly" | "monthly" | "ad-hoc";
  }): ImprovementSuggestion {
    const { manualSteps, totalRows, processingTimeMs, repeatFrequency } =
      workflowMeta;

    const hoursPerRun = processingTimeMs / 1000 / 3600;
    const runsPerYear =
      repeatFrequency === "daily"
        ? 250
        : repeatFrequency === "weekly"
        ? 52
        : repeatFrequency === "monthly"
        ? 12
        : 4;
    const estimatedHoursSaved = Math.round(hoursPerRun * runsPerYear * 0.7);

    const tools: ImprovementSuggestion["tools"] = {};

    // Rule-based tool recommendations
    if (totalRows > 1000) {
      tools.sql = "Replace manual filtering with SQL queries for large datasets";
      tools.python = "Use pandas for data transformation at scale";
    }
    if (manualSteps.some((s) => s.toLowerCase().includes("email"))) {
      tools.powerAutomate = "Automate email notifications and approvals";
      tools.officeScripts = "Auto-generate email drafts from Excel data";
    }
    if (manualSteps.some((s) => s.toLowerCase().includes("report"))) {
      tools.powerBI = "Replace manual reports with live Power BI dashboards";
      tools.powerQuery = "Automate data transformation and refresh";
    }
    if (manualSteps.some((s) => s.toLowerCase().includes("concur"))) {
      tools.concur = "Enable Concur Intelligent Audit and policy enforcement";
    }
    if (manualSteps.some((s) => /sap|erp|s4/i.test(s))) {
      tools.sap = "Use SAP BTP automation or Fiori workflow approvals";
    }
    if (manualSteps.some((s) => /ticket|incident|service/i.test(s))) {
      tools.serviceNow = "Implement ServiceNow flow automation for ticket routing";
    }
    if (
      manualSteps.some((s) =>
        s.toLowerCase().includes("excel") && repeatFrequency !== "ad-hoc"
      )
    ) {
      tools.vba = "Automate recurring Excel tasks with VBA macros";
      tools.officeScripts = "Use Office Scripts for cloud-compatible Excel automation";
    }

    return {
      automationOpportunity: `${manualSteps.length} manual steps identified across ${workflowMeta.workflowName}`,
      manualEffortReduction: `Estimated 70% reduction in manual processing through the recommended tools`,
      estimatedHoursSaved,
      tools,
    };
  },

  /** Format improvement suggestions for display */
  formatForReport(suggestion: ImprovementSuggestion): string {
    const lines = ["## 🚀 Continuous Improvement Opportunities\n"];
    lines.push(`**Automation Opportunity:** ${suggestion.automationOpportunity}`);
    lines.push(`**Manual Effort Reduction:** ${suggestion.manualEffortReduction}`);
    lines.push(
      `**Estimated Hours Saved Per Year:** ${suggestion.estimatedHoursSaved} hours\n`
    );
    lines.push("**Recommended Tools:**");
    for (const [tool, desc] of Object.entries(suggestion.tools)) {
      if (desc) lines.push(`- **${tool.toUpperCase()}:** ${desc}`);
    }
    return lines.join("\n");
  },
};

// ─────────────────────────────────────────────
// 9. WORKFLOW MEMORY
// ─────────────────────────────────────────────

/**
 * Remembers workflow configuration so users don't reconfigure every time.
 *
 * Usage:
 *   WorkflowMemory.save("expense_report", userId, config);
 *   const config = WorkflowMemory.load("expense_report", userId);
 */
export const WorkflowMemory = {
  save(
    workflowId: string,
    userId: string,
    config: Partial<WorkflowMemoryRecord>
  ): void {
    const key = KEYS.WORKFLOW_MEMORY(workflowId, userId);
    const existing = this.load(workflowId, userId);
    const updated: WorkflowMemoryRecord = {
      workflowId,
      userId,
      columnMappings: { ...(existing?.columnMappings || {}), ...(config.columnMappings || {}) },
      filters: { ...(existing?.filters || {}), ...(config.filters || {}) },
      slaRules: { ...(existing?.slaRules || {}), ...(config.slaRules || {}) },
      companyTerminology: { ...(existing?.companyTerminology || {}), ...(config.companyTerminology || {}) },
      industry: config.industry || existing?.industry || "general",
      preferredOutputs: config.preferredOutputs || existing?.preferredOutputs || [],
      savedConfig: { ...(existing?.savedConfig || {}), ...(config.savedConfig || {}) },
      lastRun: now(),
      runCount: (existing?.runCount || 0) + 1,
    };
    safeSet(key, updated);
  },

  load(workflowId: string, userId: string): WorkflowMemoryRecord | null {
    return safeGet<WorkflowMemoryRecord>(KEYS.WORKFLOW_MEMORY(workflowId, userId));
  },

  clear(workflowId: string, userId: string): void {
    localStorage.removeItem(KEYS.WORKFLOW_MEMORY(workflowId, userId));
  },

  /** Returns a human-readable summary of saved configuration */
  summarise(workflowId: string, userId: string): string {
    const record = this.load(workflowId, userId);
    if (!record) return "No saved configuration found.";
    const mappingCount = Object.keys(record.columnMappings).length;
    const filterCount = Object.keys(record.filters).length;
    return `Workflow Memory: ${record.runCount} previous runs | ${mappingCount} column mappings | ${filterCount} filters | Last run: ${record.lastRun.slice(0, 10)}`;
  },
};

// ─────────────────────────────────────────────
// 10. ENTERPRISE OUTPUT FORMATTER
// ─────────────────────────────────────────────

/**
 * Wraps any AI output into the standard enterprise consulting report format.
 * All 10 sections populated where data exists.
 *
 * Usage:
 *   const report = EnterpriseOutputFormatter.format(rawAIOutput, meta);
 *   const markdown = EnterpriseOutputFormatter.toMarkdown(report);
 */
export const EnterpriseOutputFormatter = {
  format(
    rawOutput: string,
    meta: {
      domain: string;
      objective: BusinessObjective;
      confidenceScore: number;
      evidenceSources?: string[];
      riskRating?: EnterpriseReport["riskRating"];
    }
  ): EnterpriseReport {
    // Parse structured content from raw AI output where possible
    const lines = rawOutput.split("\n").filter((l) => l.trim());

    const extract = (label: string): string => {
      const idx = lines.findIndex((l) =>
        l.toLowerCase().includes(label.toLowerCase())
      );
      return idx >= 0 && lines[idx + 1] ? lines[idx + 1].trim() : "";
    };

    return {
      executiveSummary:
        extract("executive summary") ||
        lines.slice(0, 3).join(" ") ||
        "Executive summary not generated.",
      keyFindings: lines
        .filter((l) => /^\d+\.|^-|^•|^\*/.test(l.trim()))
        .slice(0, 7)
        .map((l) => l.replace(/^[\d\.\-•\*]+\s*/, "").trim()),
      evidenceUsed:
        meta.evidenceSources ||
        lines
          .filter((l) => /(source|data|evidence|based on)/i.test(l))
          .slice(0, 3)
          .map((l) => l.trim()),
      assumptions: lines
        .filter((l) => /(assume|assuming|estimated|approximately)/i.test(l))
        .slice(0, 3)
        .map((l) => l.trim()),
      riskRating: meta.riskRating || "Medium",
      businessImpact:
        extract("business impact") ||
        extract("impact") ||
        "Business impact assessment pending manual review.",
      recommendations: lines
        .filter((l) => /(recommend|suggest|should|must|action)/i.test(l))
        .slice(0, 5)
        .map((l) => l.trim()),
      quickWins: lines
        .filter((l) => /(quick win|immediate|short.term|within \d+ day)/i.test(l))
        .slice(0, 3)
        .map((l) => l.trim()),
      longTermImprovements: lines
        .filter((l) => /(long.term|strategic|future|roadmap|transform)/i.test(l))
        .slice(0, 3)
        .map((l) => l.trim()),
      nextActions: lines
        .filter((l) => /(next step|action|follow.up|owner|due date)/i.test(l))
        .slice(0, 4)
        .map((l) => l.trim()),
      confidenceScore: meta.confidenceScore,
      generatedAt: now(),
    };
  },

  toMarkdown(report: EnterpriseReport): string {
    const riskIcon =
      report.riskRating === "Critical"
        ? "🔴"
        : report.riskRating === "High"
        ? "🟠"
        : report.riskRating === "Medium"
        ? "🟡"
        : "🟢";

    const list = (items: string[]): string =>
      items.length > 0
        ? items.map((i) => `- ${i}`).join("\n")
        : "- None identified.";

    return `
## 📋 Executive Summary
${report.executiveSummary}

---

## 🔍 Key Findings
${list(report.keyFindings)}

---

## 📂 Evidence Used
${list(report.evidenceUsed)}

---

## 📌 Assumptions
${list(report.assumptions)}

---

## ${riskIcon} Risk Rating: ${report.riskRating}

---

## 💼 Business Impact
${report.businessImpact}

---

## ✅ Recommendations
${list(report.recommendations)}

---

## ⚡ Quick Wins
${list(report.quickWins)}

---

## 🔭 Long-Term Improvements
${list(report.longTermImprovements)}

---

## 📅 Next Actions
${list(report.nextActions)}

---

*Confidence Score: ${report.confidenceScore}% | Generated: ${report.generatedAt}*
`.trim();
  },
};

// ─────────────────────────────────────────────
// MASTER ORCHESTRATOR
// ─────────────────────────────────────────────

/**
 * Single entry point for all agents to call.
 * Runs all pre-flight checks, builds enriched AI prompt context,
 * and post-processes output into enterprise format.
 *
 * Usage:
 *   const ie = await IntelligenceEngine.preRun({ userId, userInput, manifest, rawData });
 *   // → enriched prompt context, validation result, data quality, objective
 *
 *   const postResult = IntelligenceEngine.postRun({ userId, rawOutput, meta });
 *   // → enterprise report markdown
 */
export const IntelligenceEngine = {
  async preRun(params: {
    userId: string;
    userInput: string;
    workflowId?: string;
    manifest?: Array<{ field: string; required: boolean; aliases?: string[] }>;
    userInputValues?: Record<string, unknown>;
    rawData?: Record<string, unknown>[];
    expectedColumns?: string[];
    isImage?: boolean;
  }): Promise<{
    context: IEContext;
    validation: ValidationResult;
    dataQuality: DataQualityResult | null;
    objective: ObjectiveDetectionResult;
    workflowMemory: WorkflowMemoryRecord | null;
    enrichedPromptContext: string;
    readinessBadge: string;
    qualityBadge: string | null;
  }> {
    // 1. Load context
    const context = ContextAwarenessEngine.load(params.userId);

    // 2. Validate inputs
    const validation = params.manifest
      ? PreExecutionValidator.validate(
          params.manifest,
          params.userInputValues || {},
          context
        )
      : {
          readinessScore: 100,
          ready: true,
          available: [],
          missing: [],
          reusableFromContext: [],
          blockers: [],
          warnings: [],
        };

    // 3. Data quality
    const dataQuality =
      params.rawData && params.rawData.length > 0
        ? DataQualityAssessor.assess(
            params.rawData,
            params.expectedColumns || [],
            { isImage: params.isImage }
          )
        : null;

    // 4. Detect objective
    const objective = BusinessObjectiveDetector.detect(params.userInput);

    // 5. Workflow memory
    const workflowMemory = params.workflowId
      ? WorkflowMemory.load(params.workflowId, params.userId)
      : null;

    // 6. Build enriched prompt context
    const contextSummary = ContextAwarenessEngine.buildContextSummary(context);
    const objectivePrefix =
      BusinessObjectiveDetector.buildObjectivePromptPrefix(objective);
    const stylesSuffix = LearningEngine.buildStylePromptSuffix(params.userId);
    const memSummary = workflowMemory
      ? `\nWORKFLOW MEMORY: ${WorkflowMemory.summarise(params.workflowId!, params.userId)}`
      : "";

    const enrichedPromptContext =
      `${objectivePrefix}\n${contextSummary}${memSummary}${stylesSuffix}`.trim();

    return {
      context,
      validation,
      dataQuality,
      objective,
      workflowMemory,
      enrichedPromptContext,
      readinessBadge: PreExecutionValidator.renderBadge(validation),
      qualityBadge: dataQuality ? DataQualityAssessor.renderBadge(dataQuality) : null,
    };
  },

  postRun(params: {
    userId: string;
    workflowId?: string;
    rawOutput: string;
    outputData?: Record<string, unknown>;
    domain: "finance" | "hr" | "operations" | "procurement" | "general";
    objective: BusinessObjective;
    confidenceScore: number;
    workflowMeta?: {
      workflowName: string;
      manualSteps: string[];
      totalRows: number;
      processingTimeMs: number;
      repeatFrequency: "daily" | "weekly" | "monthly" | "ad-hoc";
    };
  }): {
    exceptions: ExceptionResult;
    improvement: ImprovementSuggestion | null;
    enterpriseReport: EnterpriseReport;
    enterpriseMarkdown: string;
    exceptionMarkdown: string;
    improvementMarkdown: string;
  } {
    // 7. Exception detection
    const exceptions = params.outputData
      ? ExceptionEngine.analyse(params.outputData, params.domain)
      : { detected: false, exceptions: [] };

    // 8. Continuous improvement
    const improvement = params.workflowMeta
      ? ContinuousImprovementEngine.analyse({
          ...params.workflowMeta,
          domain: params.domain,
        })
      : null;

    // 9. Enterprise report
    const riskRating = exceptions.exceptions.some(
      (e) => e.riskLevel === "critical"
    )
      ? "Critical"
      : exceptions.exceptions.some((e) => e.riskLevel === "high")
      ? "High"
      : exceptions.exceptions.some((e) => e.riskLevel === "medium")
      ? "Medium"
      : "Low";

    const enterpriseReport = EnterpriseOutputFormatter.format(
      params.rawOutput,
      {
        domain: params.domain,
        objective: params.objective,
        confidenceScore: params.confidenceScore,
        riskRating: riskRating as EnterpriseReport["riskRating"],
      }
    );

    // 10. Save outputs to context
    if (params.workflowId && params.outputData) {
      ContextAwarenessEngine.saveWorkflowOutput(
        params.userId,
        params.workflowId,
        params.outputData
      );
    }

    return {
      exceptions,
      improvement,
      enterpriseReport,
      enterpriseMarkdown: EnterpriseOutputFormatter.toMarkdown(enterpriseReport),
      exceptionMarkdown: ExceptionEngine.formatForReport(exceptions),
      improvementMarkdown: improvement
        ? ContinuousImprovementEngine.formatForReport(improvement)
        : "",
    };
  },
};

export default IntelligenceEngine;
