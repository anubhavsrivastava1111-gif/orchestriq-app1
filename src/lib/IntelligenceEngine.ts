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


// =============================================================================
// ENTERPRISE PRIVACY & RESTRICTED DATA MODE
// Appended to IntelligenceEngine.ts — reusable by all Agents and Workflows.
// Build: Session 3 — 29 Jun 2026
//
// Services added:
//   A. EnterprisePrivacyEngine   — input mode management + minimum data protocol
//   B. PhotoReconstructionEngine — multi-photo merge + table rebuild (enhances InputRecoveryEngine)
//   C. GuidedInternalAutomation — enterprise consultant mode (no data upload required)
//   D. PersistentWorkspace       — incremental dataset building with audit trail
//   E. PrivacyGuard              — wrapper enforcing privacy-first behaviour for all agents
// =============================================================================

// ─────────────────────────────────────────────
// TYPES — Enterprise Privacy & Restricted Mode
// ─────────────────────────────────────────────

export type InputMode = "upload" | "paste" | "photo" | "restricted";

export type EnterpriseToolCategory =
  | "excel"
  | "power_bi"
  | "power_query"
  | "power_automate"
  | "office_scripts"
  | "vba"
  | "sap"
  | "concur"
  | "servicenow"
  | "jira"
  | "sharepoint"
  | "microsoft_365";

export interface MinimumDataRequest {
  field: string;
  prompt: string;           // What to ask the user — phrased as minimal exposure
  example: string;          // Concrete example ("e.g. 3 numbers from the summary row")
  sensitivity: "low" | "medium" | "high";
  canUsePhoto: boolean;     // Can a photo of this field replace typed input?
  canUseSummary: boolean;   // Can a descriptive summary replace raw data?
  required: boolean;
}

export interface RestrictedModeSession {
  sessionId: string;
  userId: string;
  agentId: string;
  workflowId: string;
  inputMode: InputMode;
  collectedFields: Record<string, unknown>;
  pendingFields: MinimumDataRequest[];
  completedFields: string[];
  auditHistory: WorkspaceAuditEntry[];
  readinessPercent: number;
  isComplete: boolean;
  privacyStatement: string;
  createdAt: string;
  lastUpdated: string;
}

export interface PhotoReconstructionSession {
  sessionId: string;
  pages: ReconstructedPage[];
  mergedTable: Record<string, unknown>[];
  detectedHeaders: string[];
  continuationPageIndices: number[];
  uncertainCells: UncertainCell[];
  overallConfidence: number;
  requiresUserConfirmation: boolean;
  reconstructionNotes: string[];
}

export interface ReconstructedPage {
  pageIndex: number;
  imageDescription: string;   // User-provided or AI-inferred
  extractedRows: Record<string, unknown>[];
  hasHeader: boolean;
  isContinuation: boolean;
  confidenceScore: number;
  issues: string[];
}

export interface UncertainCell {
  rowIndex: number;
  column: string;
  inferredValue: unknown;
  confidence: number;         // 0-100
  alternativeValues: unknown[];
  userConfirmed: boolean;
  userCorrectedValue?: unknown;
}

export interface InternalAutomationGuide {
  tool: EnterpriseToolCategory;
  toolDisplayName: string;
  businessObjective: string;
  prerequisites: string[];
  steps: AutomationStep[];
  estimatedSetupMinutes: number;
  estimatedTimeSavedPerRun: string;
  complexity: "beginner" | "intermediate" | "advanced";
  notes: string;
  codeSnippet?: string;       // VBA / M / DAX / Python snippet where applicable
}

export interface AutomationStep {
  stepNumber: number;
  action: string;             // What the user does
  where: string;              // Where in the tool (menu path, cell reference, etc.)
  detail: string;             // Exact instruction
  screenshot?: string;        // Description of what they should see
}

export interface WorkspaceAuditEntry {
  entryId: string;
  timestamp: string;
  action:
    | "field_collected"
    | "field_updated"
    | "field_validated"
    | "duplicate_detected"
    | "photo_merged"
    | "session_resumed"
    | "session_completed";
  field?: string;
  value?: unknown;            // NEVER store raw confidential data — store only metadata
  valueType?: string;         // "number" | "text" | "percentage" | "currency" | "count"
  source: "upload" | "paste" | "photo" | "restricted_manual" | "inferred";
  note?: string;
}

export interface PersistentWorkspaceRecord {
  workspaceId: string;
  userId: string;
  agentId: string;
  projectName: string;
  totalFieldsRequired: number;
  totalFieldsCollected: number;
  fields: Record<string, {
    value: unknown;
    source: WorkspaceAuditEntry["source"];
    collectedAt: string;
    validated: boolean;
  }>;
  auditHistory: WorkspaceAuditEntry[];
  sessions: number;
  createdAt: string;
  lastUpdated: string;
}

export interface PrivacyCheckResult {
  approved: boolean;
  mode: InputMode;
  privacyStatement: string;
  warnings: string[];
  blockedFields: string[];    // Fields that should NOT be uploaded in restricted mode
  allowedFields: string[];    // Fields safe to share in restricted mode
}

// ─────────────────────────────────────────────
// STORAGE KEYS — Privacy Layer
// ─────────────────────────────────────────────

const PRIVACY_PREFIX = "orchestriq_privacy_";
const WORKSPACE_PREFIX = "orchestriq_ws_";

function privKey(userId: string, agentId: string): string {
  return `${PRIVACY_PREFIX}${userId}_${agentId}`;
}
function wsKey(userId: string, agentId: string, projectName: string): string {
  return `${WORKSPACE_PREFIX}${userId}_${agentId}_${projectName.replace(/\s+/g, "_").toLowerCase()}`;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function nowStr(): string {
  return new Date().toISOString();
}

function safeRead<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota — fail silently */ }
}

// ─────────────────────────────────────────────
// A. ENTERPRISE PRIVACY ENGINE
// ─────────────────────────────────────────────

/**
 * Core controller for input mode selection and minimum data protocol.
 * Call at the start of every Agent and Workflow before requesting any input.
 *
 * Usage:
 *   const session = EnterprisePrivacyEngine.startSession(userId, agentId, "restricted", manifest);
 *   const next = EnterprisePrivacyEngine.nextPrompt(session);
 *   EnterprisePrivacyEngine.collectField(session, next.field, userValue, "restricted_manual");
 */
export const EnterprisePrivacyEngine = {

  PRIVACY_STATEMENT:
    "🔒 Restricted Enterprise Mode is active. " +
    "OrchestrIQ will request only the minimum information necessary. " +
    "Do not share complete files, full spreadsheets, or confidential reports. " +
    "Share only specific values, summaries, or non-sensitive metadata.",

  /**
   * Start a new restricted mode session.
   * manifest: the agent's full list of required fields with sensitivity ratings.
   */
  startSession(
    userId: string,
    agentId: string,
    workflowId: string,
    mode: InputMode,
    manifest: MinimumDataRequest[]
  ): RestrictedModeSession {
    const session: RestrictedModeSession = {
      sessionId: genId("rms"),
      userId,
      agentId,
      workflowId,
      inputMode: mode,
      collectedFields: {},
      pendingFields: mode === "restricted"
        ? manifest.filter(f => f.sensitivity !== "high" || f.canUseSummary)
        : manifest,
      completedFields: [],
      auditHistory: [],
      readinessPercent: 0,
      isComplete: false,
      privacyStatement: mode === "restricted" ? this.PRIVACY_STATEMENT : "",
      createdAt: nowStr(),
      lastUpdated: nowStr(),
    };

    // In restricted mode, exclude high-sensitivity required fields
    // that cannot be summarised — route them to GuidedInternalAutomation instead
    if (mode === "restricted") {
      const blocked = manifest.filter(
        f => f.sensitivity === "high" && !f.canUseSummary && !f.canUsePhoto
      );
      if (blocked.length > 0) {
        session.auditHistory.push({
          entryId: genId("audit"),
          timestamp: nowStr(),
          action: "field_validated",
          note: `${blocked.length} high-sensitivity fields will be handled via Guided Internal Automation instead of direct input.`,
          source: "restricted_manual",
        });
      }
    }

    return session;
  },

  /**
   * Returns the next question to ask the user — minimal and non-invasive.
   * Returns null when all fields are collected.
   */
  nextPrompt(session: RestrictedModeSession): MinimumDataRequest | null {
    const next = session.pendingFields.find(
      f => !session.completedFields.includes(f.field)
    );
    return next || null;
  },

  /**
   * Record a field value collected from the user.
   * NEVER stores high-sensitivity raw values — stores only metadata.
   */
  collectField(
    session: RestrictedModeSession,
    field: string,
    value: unknown,
    source: WorkspaceAuditEntry["source"]
  ): RestrictedModeSession {
    const fieldDef = session.pendingFields.find(f => f.field === field);

    // Determine what to store — raw value for low/medium, metadata only for high
    const storeValue =
      fieldDef?.sensitivity === "high"
        ? `[${typeof value}:confirmed]`  // Only store type confirmation — not the value
        : value;

    session.collectedFields[field] = storeValue;
    if (!session.completedFields.includes(field)) {
      session.completedFields.push(field);
    }

    session.auditHistory.push({
      entryId: genId("audit"),
      timestamp: nowStr(),
      action: "field_collected",
      field,
      valueType: typeof value,
      source,
      note: fieldDef?.sensitivity === "high"
        ? "High-sensitivity field — only confirmation stored, not raw value."
        : undefined,
    });

    const total = session.pendingFields.length;
    const done = session.completedFields.length;
    session.readinessPercent = total > 0 ? Math.round((done / total) * 100) : 100;
    session.isComplete = done >= total;
    session.lastUpdated = nowStr();

    return session;
  },

  /**
   * Build a user-facing prompt for a specific field.
   * Phrased to request the minimum possible data.
   */
  buildFieldPrompt(field: MinimumDataRequest, mode: InputMode): string {
    if (mode !== "restricted") return field.prompt;

    // Restricted mode — rephrase to minimise exposure
    const base = field.canUsePhoto
      ? `📸 Take a photo of only the section showing: **${field.field}**`
      : field.canUseSummary
      ? `💬 Describe in your own words: **${field.field}** (no need to share the raw data)`
      : `🔢 Enter only this value: **${field.field}**`;

    return `${base}\n_Example: ${field.example}_`;
  },

  /**
   * Classify a field definition for restricted mode safety.
   */
  classifyFieldSafety(field: MinimumDataRequest): {
    safe: boolean;
    reason: string;
    alternative: string;
  } {
    if (field.sensitivity === "low") {
      return { safe: true, reason: "Low sensitivity — safe to request directly.", alternative: "" };
    }
    if (field.sensitivity === "medium" && field.canUseSummary) {
      return {
        safe: true,
        reason: "Medium sensitivity — summary or aggregate is sufficient.",
        alternative: "Request total or category summary instead of line detail.",
      };
    }
    if (field.sensitivity === "high" && field.canUsePhoto) {
      return {
        safe: true,
        reason: "High sensitivity — photo of summary section acceptable.",
        alternative: "Request a photo of the non-confidential summary header only.",
      };
    }
    return {
      safe: false,
      reason: "High sensitivity — full data should not be shared externally.",
      alternative:
        "Use Guided Internal Automation: generate instructions for the user to run this analysis inside their own environment.",
    };
  },
};

// ─────────────────────────────────────────────
// B. PHOTO RECONSTRUCTION ENGINE
// ─────────────────────────────────────────────

/**
 * Enhanced multi-photo reconstruction.
 * Builds on InputRecoveryEngine with table merge, header detection,
 * continuation page recognition, and uncertain cell highlighting.
 *
 * Usage:
 *   const session = PhotoReconstructionEngine.createSession();
 *   PhotoReconstructionEngine.addPage(session, pageData);
 *   const result = PhotoReconstructionEngine.reconstruct(session);
 */
export const PhotoReconstructionEngine = {

  createSession(): PhotoReconstructionSession {
    return {
      sessionId: genId("photo"),
      pages: [],
      mergedTable: [],
      detectedHeaders: [],
      continuationPageIndices: [],
      uncertainCells: [],
      overallConfidence: 0,
      requiresUserConfirmation: false,
      reconstructionNotes: [],
    };
  },

  addPage(
    session: PhotoReconstructionSession,
    page: {
      pageIndex: number;
      imageDescription: string;
      rawText?: string;       // OCR output if available
      extractedRows: Record<string, unknown>[];
      confidenceScore: number;
    }
  ): PhotoReconstructionSession {
    const hasHeader =
      page.extractedRows.length > 0 &&
      page.pageIndex === 0;

    // Detect if this is a continuation of a previous page
    // Signal: no header row detected + columns match previous page
    const isContinuation =
      page.pageIndex > 0 &&
      session.detectedHeaders.length > 0 &&
      page.extractedRows.length > 0 &&
      Object.keys(page.extractedRows[0]).every(k =>
        session.detectedHeaders.includes(k)
      );

    const reconstructed: ReconstructedPage = {
      pageIndex: page.pageIndex,
      imageDescription: page.imageDescription,
      extractedRows: page.extractedRows,
      hasHeader,
      isContinuation,
      confidenceScore: page.confidenceScore,
      issues: [],
    };

    // Detect issues
    if (page.confidenceScore < 60) {
      reconstructed.issues.push("Low OCR confidence — verify values manually.");
    }
    if (page.extractedRows.length === 0) {
      reconstructed.issues.push("No data rows extracted from this image.");
    }

    session.pages.push(reconstructed);

    // Update header registry from first page
    if (hasHeader && page.extractedRows.length > 0) {
      session.detectedHeaders = Object.keys(page.extractedRows[0]);
    }

    if (isContinuation) {
      session.continuationPageIndices.push(page.pageIndex);
    }

    return session;
  },

  /**
   * Merge all pages into a unified table.
   * Removes header repetitions, sorts by page order, identifies uncertain cells.
   */
  reconstruct(session: PhotoReconstructionSession): PhotoReconstructionSession {
    const sorted = [...session.pages].sort((a, b) => a.pageIndex - b.pageIndex);
    const merged: Record<string, unknown>[] = [];
    const notes: string[] = [];

    for (const page of sorted) {
      for (const row of page.extractedRows) {
        // Skip rows that replicate the header
        const isHeaderRepeat =
          session.detectedHeaders.length > 0 &&
          session.detectedHeaders.every(
            h => String(row[h] || "").trim().toLowerCase() === h.toLowerCase()
          );
        if (!isHeaderRepeat) {
          merged.push({ ...row, _pageSource: page.pageIndex });
        }
      }
    }

    session.mergedTable = merged;

    // Identify uncertain cells from low-confidence pages
    const uncertainCells: UncertainCell[] = [];
    let rowIdx = 0;
    for (const page of sorted) {
      if (page.confidenceScore < 70) {
        for (const row of page.extractedRows) {
          for (const col of Object.keys(row)) {
            const val = row[col];
            // Flag numerics from low-confidence pages
            if (typeof val === "number" || /^\d+[\d,\.]*$/.test(String(val))) {
              uncertainCells.push({
                rowIndex: rowIdx,
                column: col,
                inferredValue: val,
                confidence: page.confidenceScore,
                alternativeValues: [],
                userConfirmed: false,
              });
            }
          }
          rowIdx++;
        }
      } else {
        rowIdx += page.extractedRows.length;
      }
    }

    session.uncertainCells = uncertainCells;
    session.requiresUserConfirmation = uncertainCells.length > 0;

    // Compute overall confidence
    const avgPageConf =
      sorted.length > 0
        ? sorted.reduce((s, p) => s + p.confidenceScore, 0) / sorted.length
        : 0;
    const uncertaintyPenalty = Math.min(uncertainCells.length * 3, 30);
    session.overallConfidence = Math.max(0, Math.round(avgPageConf - uncertaintyPenalty));

    // Build reconstruction notes
    notes.push(`${sorted.length} page(s) merged into ${merged.length} rows.`);
    if (session.continuationPageIndices.length > 0) {
      notes.push(
        `Continuation pages detected at positions: ${session.continuationPageIndices.join(", ")} — headers de-duplicated.`
      );
    }
    if (uncertainCells.length > 0) {
      notes.push(
        `${uncertainCells.length} cell(s) flagged as uncertain — user confirmation required before analysis.`
      );
    }
    if (session.overallConfidence >= 85) {
      notes.push("✅ High confidence reconstruction — ready for analysis.");
    } else if (session.overallConfidence >= 60) {
      notes.push("⚠️ Medium confidence — verify flagged cells before relying on totals.");
    } else {
      notes.push("🔴 Low confidence — significant manual verification required.");
    }

    session.reconstructionNotes = notes;
    return session;
  },

  /** Confirm or correct an uncertain cell — call when user validates */
  confirmCell(
    session: PhotoReconstructionSession,
    rowIndex: number,
    column: string,
    confirmedValue: unknown
  ): PhotoReconstructionSession {
    const cell = session.uncertainCells.find(
      c => c.rowIndex === rowIndex && c.column === column
    );
    if (cell) {
      cell.userConfirmed = true;
      cell.userCorrectedValue = confirmedValue;
      // Update merged table
      const row = session.mergedTable[rowIndex];
      if (row) row[column] = confirmedValue;
    }

    // Re-check if all uncertain cells are now confirmed
    session.requiresUserConfirmation = session.uncertainCells.some(
      c => !c.userConfirmed
    );

    return session;
  },

  /** Returns only the cells still needing user confirmation */
  pendingConfirmations(session: PhotoReconstructionSession): UncertainCell[] {
    return session.uncertainCells.filter(c => !c.userConfirmed);
  },

  /** Build prompt text for user to confirm a specific uncertain cell */
  buildConfirmationPrompt(cell: UncertainCell): string {
    return (
      `⚠️ **Uncertain value detected**\n` +
      `Row ${cell.rowIndex + 1}, Column: **${cell.column}**\n` +
      `Reconstructed value: **${cell.inferredValue}**\n` +
      `Confidence: ${cell.confidence}%\n\n` +
      `Please verify this value from your original document and confirm or correct it.`
    );
  },
};

// ─────────────────────────────────────────────
// C. GUIDED INTERNAL AUTOMATION ENGINE
// ─────────────────────────────────────────────

/**
 * When users cannot share any data externally, OrchestrIQ becomes
 * an enterprise consultant that generates step-by-step instructions
 * for tools ALREADY inside the user's organisation.
 *
 * Usage:
 *   const guide = GuidedInternalAutomation.generate("expense_audit", "reduce_processing_time", context);
 */
export const GuidedInternalAutomation = {

  /** Map agent IDs to the most appropriate internal tools */
  _agentToolMap: {
    expense_audit:      ["excel", "power_query", "power_automate", "concur"] as EnterpriseToolCategory[],
    ap_review:          ["excel", "power_query", "sap", "power_bi"] as EnterpriseToolCategory[],
    business_analyst:   ["excel", "power_bi", "power_query"] as EnterpriseToolCategory[],
    exec_assistant:     ["microsoft_365", "sharepoint", "excel"] as EnterpriseToolCategory[],
    meeting_intel:      ["microsoft_365", "sharepoint"] as EnterpriseToolCategory[],
    monthly_review:     ["excel", "power_bi", "power_query", "sap"] as EnterpriseToolCategory[],
    process_mining:     ["power_automate", "servicenow", "excel"] as EnterpriseToolCategory[],
    sop_compliance:     ["sharepoint", "servicenow", "microsoft_365"] as EnterpriseToolCategory[],
    smart_ocr:          ["excel", "power_query", "office_scripts"] as EnterpriseToolCategory[],
    table_extraction:   ["excel", "power_query", "office_scripts"] as EnterpriseToolCategory[],
    marketing_campaign: ["excel", "microsoft_365", "power_bi"] as EnterpriseToolCategory[],
    financial_analysis: ["excel", "power_bi", "power_query", "sap"] as EnterpriseToolCategory[],
    ticket_mgmt:        ["servicenow", "jira", "power_automate"] as EnterpriseToolCategory[],
    ap_close:           ["sap", "excel", "power_query"] as EnterpriseToolCategory[],
    te_audit:           ["concur", "excel", "power_query"] as EnterpriseToolCategory[],
    audit_fieldwork:    ["excel", "sharepoint", "servicenow"] as EnterpriseToolCategory[],
    vendor_recon:       ["excel", "sap", "power_query"] as EnterpriseToolCategory[],
    compliance_review:  ["servicenow", "sharepoint", "excel"] as EnterpriseToolCategory[],
  } as Record<string, EnterpriseToolCategory[]>,

  _toolNames: {
    excel:           "Microsoft Excel",
    power_bi:        "Power BI",
    power_query:     "Power Query (Excel / Power BI)",
    power_automate:  "Power Automate",
    office_scripts:  "Office Scripts",
    vba:             "Excel VBA",
    sap:             "SAP ECC / S4HANA",
    concur:          "SAP Concur",
    servicenow:      "ServiceNow",
    jira:            "Jira",
    sharepoint:      "SharePoint",
    microsoft_365:   "Microsoft 365",
  } as Record<EnterpriseToolCategory, string>,

  /**
   * Generate automation guides for a given agent and business objective.
   * Returns guides for the top 2-3 most relevant tools — not all.
   */
  generate(
    agentId: string,
    objective: string,
    companyContext: { name: string; industry: string; tools?: string[] }
  ): InternalAutomationGuide[] {
    const tools =
      this._agentToolMap[agentId] ||
      (["excel", "power_bi", "power_query"] as EnterpriseToolCategory[]);

    // Filter to tools the company actually uses if specified
    const relevantTools = companyContext.tools
      ? tools.filter(t =>
          companyContext.tools!.some(ct => ct.toLowerCase().includes(t.replace(/_/g, " ")))
        )
      : tools;

    const finalTools = (relevantTools.length > 0 ? relevantTools : tools).slice(0, 3);

    return finalTools.map(tool => this._buildGuide(tool, agentId, objective, companyContext));
  },

  _buildGuide(
    tool: EnterpriseToolCategory,
    agentId: string,
    objective: string,
    companyContext: { name: string; industry: string }
  ): InternalAutomationGuide {
    const guides: Record<EnterpriseToolCategory, Omit<InternalAutomationGuide, "tool" | "toolDisplayName" | "businessObjective">> = {
      excel: {
        prerequisites: [
          "Microsoft Excel 2016 or later (or Microsoft 365)",
          "Data already exists in an Excel workbook on your device",
          "No external upload required",
        ],
        steps: [
          { stepNumber: 1, action: "Open your data file", where: "Your local drive or SharePoint", detail: "Open the Excel file containing the data you want to analyse. Stay entirely within Excel — do not upload anything externally.", screenshot: "You should see your data in a spreadsheet." },
          { stepNumber: 2, action: "Select your data range", where: "Excel worksheet", detail: "Click any cell inside your data, then press Ctrl+Shift+End to select through the last cell with data.", screenshot: "Your data should be highlighted in blue." },
          { stepNumber: 3, action: "Create a Table", where: "Insert → Table", detail: "With your data selected, go to Insert → Table → check 'My table has headers' → OK. This enables dynamic analysis.", screenshot: "A formatted table appears with filter arrows on each column header." },
          { stepNumber: 4, action: "Insert a PivotTable", where: "Insert → PivotTable", detail: "Click anywhere in the table → Insert → PivotTable → New Worksheet → OK. Drag relevant fields to Rows, Values, Filters.", screenshot: "PivotTable Field List appears on the right side." },
          { stepNumber: 5, action: "Apply conditional formatting", where: "Home → Conditional Formatting", detail: "Select your key metrics column → Home → Conditional Formatting → Data Bars or Color Scales to visually highlight variances.", screenshot: "Colour gradient appears across your values." },
          { stepNumber: 6, action: "Build a summary dashboard", where: "New worksheet", detail: "Insert chart from PivotTable: Insert → PivotChart → choose Bar or Line → OK. Copy to a separate 'Dashboard' sheet.", screenshot: "A chart appears linked to your PivotTable." },
        ],
        estimatedSetupMinutes: 20,
        estimatedTimeSavedPerRun: "2-3 hours per reporting cycle",
        complexity: "beginner",
        notes: "All analysis runs entirely inside Excel on your device. No data leaves your organisation.",
        codeSnippet: `' VBA macro to auto-refresh and summarise — paste into Developer → Visual Basic → Insert Module
Sub RefreshAndSummarise()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Data")
    ws.ListObjects(1).DataBodyRange.Sort _
        Key1:=ws.Range("A2"), Order1:=xlAscending, Header:=xlNo
    ws.Calculate
    MsgBox "Data refreshed and sorted. " & ws.ListObjects(1).DataBodyRange.Rows.Count & " rows processed.", vbInformation
End Sub`,
      },

      power_bi: {
        prerequisites: [
          "Power BI Desktop installed (free download from microsoft.com/power-bi)",
          "Data file saved on your local drive or SharePoint",
          "No Power BI service account required for local analysis",
        ],
        steps: [
          { stepNumber: 1, action: "Open Power BI Desktop", where: "Start menu → Power BI Desktop", detail: "Open Power BI Desktop. This runs entirely on your device — no cloud upload required for local reports.", screenshot: "Power BI Desktop welcome screen." },
          { stepNumber: 2, action: "Get Data", where: "Home → Get Data", detail: "Click Get Data → Excel Workbook (or CSV / SQL Server depending on your source) → navigate to your file → Open → select the table → Load.", screenshot: "Data loads into the Fields pane on the right." },
          { stepNumber: 3, action: "Build your first visual", where: "Report view", detail: "Click a blank area → in Visualizations pane select Bar Chart → drag your Category field to Axis and your Amount field to Values.", screenshot: "A bar chart appears on the canvas." },
          { stepNumber: 4, action: "Add a card visual for key metric", where: "Visualizations pane → Card", detail: "Click blank area → select Card → drag your Total or Count field into Values. This shows the headline KPI.", screenshot: "A single number card appears." },
          { stepNumber: 5, action: "Add a slicer for time filtering", where: "Visualizations pane → Slicer", detail: "Click blank area → Slicer → drag your Date field to Field. Change slicer style to 'Between' for a date range selector.", screenshot: "A date range slider appears." },
          { stepNumber: 6, action: "Save and share internally", where: "File → Save", detail: "Save the .pbix file to SharePoint or Teams. Colleagues can open it without needing external access.", screenshot: "File saved with .pbix extension." },
        ],
        estimatedSetupMinutes: 45,
        estimatedTimeSavedPerRun: "4-6 hours per reporting cycle",
        complexity: "intermediate",
        notes: "Power BI Desktop is fully local. Publishing to Power BI Service requires IT approval but is not required for local analysis.",
      },

      power_query: {
        prerequisites: [
          "Microsoft Excel 2016+ or Power BI Desktop",
          "Source data accessible on your local network or device",
        ],
        steps: [
          { stepNumber: 1, action: "Open Power Query Editor", where: "Data → Get Data → Launch Power Query Editor", detail: "In Excel: Data tab → Get Data → From File → From Workbook → select your file. Click Transform Data to open Power Query Editor.", screenshot: "Power Query Editor opens with your data in a preview window." },
          { stepNumber: 2, action: "Remove unnecessary columns", where: "Right-click column header", detail: "Right-click each column you don't need → Remove. Only keep the columns required for your analysis.", screenshot: "Fewer columns visible in the preview." },
          { stepNumber: 3, action: "Clean data types", where: "Transform → Detect Data Type", detail: "Home → Transform → Detect Data Type. Manually correct any columns showing the wrong type (e.g. dates stored as text).", screenshot: "Type icons visible on each column header." },
          { stepNumber: 4, action: "Filter rows", where: "Column header → Filter arrow", detail: "Click the filter arrow on any column → filter out nulls, test data, or out-of-scope rows.", screenshot: "Filtered row count shown in status bar." },
          { stepNumber: 5, action: "Group and summarise", where: "Transform → Group By", detail: "Home → Group By → select grouping column → add aggregation (Sum, Count, Average) → OK.", screenshot: "Data collapsed to summary rows." },
          { stepNumber: 6, action: "Close and Load", where: "Home → Close & Load", detail: "Home → Close & Load → Close & Load To → Table in new worksheet → OK. Your clean data appears in Excel.", screenshot: "Clean summary table in Excel." },
        ],
        estimatedSetupMinutes: 30,
        estimatedTimeSavedPerRun: "1-2 hours per data refresh",
        complexity: "intermediate",
        notes: "Power Query transformations are recorded as steps — rerun any time with one click. No coding required.",
        codeSnippet: `// Power Query M — filter current month and remove blanks
let
    Source = Excel.CurrentWorkbook(){[Name="DataTable"]}[Content],
    FilteredMonth = Table.SelectRows(Source, each Date.Month([Date]) = Date.Month(DateTime.LocalNow())),
    RemovedBlanks = Table.SelectRows(FilteredMonth, each [Amount] <> null and [Amount] <> 0)
in
    RemovedBlanks`,
      },

      power_automate: {
        prerequisites: [
          "Microsoft 365 account with Power Automate access",
          "Flows run inside your organisation's M365 tenant",
        ],
        steps: [
          { stepNumber: 1, action: "Open Power Automate", where: "flow.microsoft.com or via Microsoft 365 app launcher", detail: "Sign in with your work account. All flows run inside your company's tenant — no external upload.", screenshot: "My Flows dashboard." },
          { stepNumber: 2, action: "Create a new automated flow", where: "+ Create → Automated cloud flow", detail: "Click + Create → Automated cloud flow → choose trigger (e.g. 'When a file is created in SharePoint' or 'Recurrence') → Create.", screenshot: "Flow designer opens." },
          { stepNumber: 3, action: "Add data action", where: "Flow designer → + New step", detail: "Click + New step → search 'Excel Online' or 'SharePoint' → select 'Get rows from a table' → connect to your file.", screenshot: "Data action configured." },
          { stepNumber: 4, action: "Add condition or filter", where: "New step → Condition", detail: "Add a Condition step → set your rule (e.g. Amount > threshold, Status = 'Pending') → configure Yes/No branches.", screenshot: "Condition branching visible." },
          { stepNumber: 5, action: "Add approval or notification", where: "New step → Approvals / Send an email", detail: "In the Yes branch: add 'Start and wait for an approval' or 'Send an email (V2)' to notify the right person.", screenshot: "Approval or email step configured." },
          { stepNumber: 6, action: "Test and activate", where: "Flow designer → Test → Save", detail: "Click Test → Manual → Run to verify the flow. Once confirmed, click Save. The flow runs automatically going forward.", screenshot: "Flow shows as Active." },
        ],
        estimatedSetupMinutes: 60,
        estimatedTimeSavedPerRun: "3-5 hours per week on manual routing",
        complexity: "intermediate",
        notes: "All data remains within your M365 tenant. Power Automate is licensed under most Microsoft 365 enterprise plans.",
      },

      office_scripts: {
        prerequisites: [
          "Microsoft 365 Business Standard or higher (Office Scripts requires this)",
          "Excel for the web (run via office.com)",
        ],
        steps: [
          { stepNumber: 1, action: "Open Excel Online", where: "office.com → Excel → open your file from OneDrive/SharePoint", detail: "Navigate to office.com → sign in → open your Excel file. Office Scripts run in the browser — no desktop install.", screenshot: "Excel in browser with your data." },
          { stepNumber: 2, action: "Open Automate tab", where: "Excel ribbon → Automate", detail: "Click the Automate tab in the ribbon → New Script. A script editor panel opens on the right.", screenshot: "Script editor on the right side." },
          { stepNumber: 3, action: "Write or paste the script", where: "Script editor", detail: "Paste the provided TypeScript script → click Run to execute. Scripts operate entirely on data already in your workbook.", screenshot: "Script runs, data updated." },
          { stepNumber: 4, action: "Save and schedule", where: "Automate → Save Script → Power Automate", detail: "Save the script → connect it to Power Automate via 'Run Excel Script' action for scheduled execution.", screenshot: "Script linked to Power Automate flow." },
        ],
        estimatedSetupMinutes: 25,
        estimatedTimeSavedPerRun: "30-60 minutes per run",
        complexity: "intermediate",
        notes: "Office Scripts are TypeScript-based and run server-side within Microsoft's cloud. No data leaves your tenant.",
        codeSnippet: `// Office Script — flag rows exceeding threshold and highlight
function main(workbook: ExcelScript.Workbook) {
  const sheet = workbook.getActiveWorksheet();
  const range = sheet.getUsedRange();
  const values = range.getValues();
  const THRESHOLD = 5000;
  for (let i = 1; i < values.length; i++) {
    const amount = Number(values[i][3]); // Column D = index 3
    if (amount > THRESHOLD) {
      sheet.getRange(\`A\${i+1}:E\${i+1}\`).getFormat().getFill().setColor("#FFD700");
    }
  }
}`,
      },

      vba: {
        prerequisites: [
          "Microsoft Excel with Developer tab enabled",
          "Macro settings: Tools → Trust Center → Enable macros for this workbook",
        ],
        steps: [
          { stepNumber: 1, action: "Enable Developer tab", where: "File → Options → Customize Ribbon → check Developer", detail: "Enable the Developer tab in Excel if not already visible.", screenshot: "Developer tab appears in ribbon." },
          { stepNumber: 2, action: "Open Visual Basic Editor", where: "Developer → Visual Basic (Alt+F11)", detail: "Press Alt+F11 to open the VBA editor.", screenshot: "VBA editor window opens." },
          { stepNumber: 3, action: "Insert a module", where: "VBA editor → Insert → Module", detail: "Click Insert → Module. A blank code window opens.", screenshot: "Empty module window." },
          { stepNumber: 4, action: "Paste the macro", where: "Code window", detail: "Paste the VBA code provided. Customise any sheet names or column references to match your workbook.", screenshot: "Code visible in editor." },
          { stepNumber: 5, action: "Run the macro", where: "Developer → Macros → Run", detail: "Press F5 or go to Developer → Macros → select the macro → Run.", screenshot: "Macro executes and data is processed." },
        ],
        estimatedSetupMinutes: 15,
        estimatedTimeSavedPerRun: "1-3 hours per run",
        complexity: "beginner",
        notes: "VBA runs entirely within Excel on your device. No network connection or external service required.",
      },

      sap: {
        prerequisites: [
          "SAP GUI or SAP Fiori access with appropriate role",
          "Authorisation for the relevant SAP transaction codes",
        ],
        steps: [
          { stepNumber: 1, action: "Log in to SAP", where: "SAP Logon or Fiori Launchpad", detail: "Open SAP GUI → double-click your system → enter credentials. All data remains within your SAP landscape.", screenshot: "SAP Easy Access menu." },
          { stepNumber: 2, action: "Navigate to the relevant transaction", where: "SAP command field", detail: "Type the transaction code in the command field (top left) and press Enter. Common codes: FB03 (document display), ME23N (purchase order), F-02 (journal entry).", screenshot: "Transaction screen opens." },
          { stepNumber: 3, action: "Set selection criteria", where: "Transaction selection screen", detail: "Enter your selection parameters — company code, fiscal year, date range, document type. Use F4 for value help on any field.", screenshot: "Selection criteria filled." },
          { stepNumber: 4, action: "Execute and export to Excel", where: "Execute button (F8) → List → Export", detail: "Press F8 to run → System → List → Save → Local File → Spreadsheet → save to your local drive.", screenshot: "Excel file saved locally." },
          { stepNumber: 5, action: "Analyse in Excel", where: "Your local Excel file", detail: "Open the exported file in Excel → apply PivotTable and Power Query for analysis. Data never left your internal systems.", screenshot: "Data in Excel for local analysis." },
        ],
        estimatedSetupMinutes: 20,
        estimatedTimeSavedPerRun: "2-4 hours per reporting cycle",
        complexity: "intermediate",
        notes: "SAP exports go to your local machine only. The analysis then happens entirely in Excel — no external tools receive the data.",
      },

      concur: {
        prerequisites: [
          "SAP Concur access with Reporting or Analyst role",
          "Cognos or Concur Intelligence reporting access if available",
        ],
        steps: [
          { stepNumber: 1, action: "Log in to Concur", where: "Your company's Concur URL", detail: "Sign in with SSO or company credentials. All data remains within your Concur instance.", screenshot: "Concur dashboard." },
          { stepNumber: 2, action: "Navigate to Reporting", where: "Reporting → Cognos (or Concur Intelligence)", detail: "Click Reporting in the top navigation → select your reporting tool (Cognos / Concur Intelligence / Analytics).", screenshot: "Report list." },
          { stepNumber: 3, action: "Run a standard report", where: "Report library", detail: "Select a standard report (e.g. Expense by Employee, Policy Violations, Aging Report) → set date range → Run.", screenshot: "Report parameters screen." },
          { stepNumber: 4, action: "Export to Excel", where: "Report output → Export → Excel", detail: "Click Export → Excel Data → save the file locally. Analysis happens in Excel — within your organisation.", screenshot: "Excel file downloaded." },
          { stepNumber: 5, action: "Enable Intelligent Audit", where: "Concur Admin → Audit Rules", detail: "If you have admin access: Concur Admin → Audit Rules → configure automated policy checks so violations are flagged without manual review.", screenshot: "Audit rules configuration." },
        ],
        estimatedSetupMinutes: 30,
        estimatedTimeSavedPerRun: "3-5 hours per audit cycle",
        complexity: "beginner",
        notes: "Concur exports are saved locally. Intelligent Audit runs inside Concur with no external dependency.",
      },

      servicenow: {
        prerequisites: [
          "ServiceNow access with appropriate role (ITIL, Analyst, or Admin)",
          "Access to Reports or Performance Analytics module",
        ],
        steps: [
          { stepNumber: 1, action: "Open ServiceNow Reports", where: "ServiceNow → All → Reports → Create New", detail: "Log in → navigate to Reports module → Create New to build a custom report or open an existing one.", screenshot: "Report builder interface." },
          { stepNumber: 2, action: "Configure data source", where: "Report builder → Table", detail: "Select your table (Incident, Change Request, Problem, Task) → set conditions (e.g. state, priority, assigned group, date range).", screenshot: "Table and conditions set." },
          { stepNumber: 3, action: "Choose report type and grouping", where: "Type → Group By", detail: "Select report type (Bar, List, Pivot) → Group By your key dimension (Category, Priority, Assignment Group).", screenshot: "Grouped report preview." },
          { stepNumber: 4, action: "Add metrics", where: "Aggregation", detail: "Set aggregation: Count, Sum, Average as relevant. Add a secondary grouping if needed (e.g. Priority within Category).", screenshot: "Metrics configured." },
          { stepNumber: 5, action: "Save and schedule", where: "Save → Schedule", detail: "Save the report → Schedule → set frequency (Daily/Weekly) → recipients receive it automatically with no manual effort.", screenshot: "Schedule configured." },
          { stepNumber: 6, action: "Export for deeper analysis", where: "Report → Export → Excel / CSV", detail: "For deeper analysis: Export → Excel → open locally in Excel or Power BI. No external upload needed.", screenshot: "Excel file downloaded." },
        ],
        estimatedSetupMinutes: 45,
        estimatedTimeSavedPerRun: "2-4 hours per reporting cycle",
        complexity: "intermediate",
        notes: "All data remains within your ServiceNow instance. Scheduled reports deliver automatically to internal recipients.",
      },

      jira: {
        prerequisites: [
          "Jira Software or Jira Service Management access",
          "Project role with reporting permissions",
        ],
        steps: [
          { stepNumber: 1, action: "Open Jira Reports", where: "Project → Reports", detail: "Navigate to your project → click Reports in the left panel. Choose from Burndown, Velocity, Control Chart, or Cumulative Flow.", screenshot: "Reports menu." },
          { stepNumber: 2, action: "Use Jira Query Language (JQL)", where: "Issues → Advanced search", detail: "Go to Issues → Advanced → switch to JQL. Example: project = MYPROJ AND status != Done AND created >= -30d ORDER BY priority DESC", screenshot: "JQL results list." },
          { stepNumber: 3, action: "Export to Excel", where: "Issue list → Export → Excel CSV", detail: "From the issue list → click Export → Excel CSV. Open the file in Excel for local analysis.", screenshot: "CSV downloaded." },
          { stepNumber: 4, action: "Create a dashboard", where: "Jira → Dashboards → Create", detail: "Dashboards → Create → Add Gadget → select 'Filter Results', 'Two Dimensional Filter', or 'Pie Chart' → configure with your saved filter.", screenshot: "Dashboard gadgets configured." },
        ],
        estimatedSetupMinutes: 20,
        estimatedTimeSavedPerRun: "1-2 hours per sprint review",
        complexity: "beginner",
        notes: "Jira exports go to your local device. All analysis in Excel remains within your organisation.",
      },

      sharepoint: {
        prerequisites: [
          "SharePoint Online access (Microsoft 365)",
          "Permissions to create lists and views",
        ],
        steps: [
          { stepNumber: 1, action: "Create a SharePoint List", where: "SharePoint site → + New → List", detail: "Navigate to your team site → + New → List → Blank list → name it (e.g. 'Project Tracker') → Create.", screenshot: "Empty list created." },
          { stepNumber: 2, action: "Add columns", where: "List → + Add column", detail: "Click + Add column → choose type (Single line text, Number, Date, Choice) → configure → Save. Repeat for all fields.", screenshot: "Columns added to list." },
          { stepNumber: 3, action: "Create views", where: "List → All Items → + Add view", detail: "Click the view dropdown → Create new view → filter by status, date, owner → Save. Colleagues access the correct view automatically.", screenshot: "Filtered view active." },
          { stepNumber: 4, action: "Connect to Power BI", where: "Power BI Desktop → Get Data → SharePoint Online List", detail: "In Power BI Desktop: Get Data → SharePoint Online List → paste your site URL → select your list → Load. Data stays within your tenant.", screenshot: "List loaded in Power BI." },
          { stepNumber: 5, action: "Set up alerts", where: "List → Alert Me", detail: "Click Alert Me → set conditions (any change / specific column change) → receive internal email alerts without external tools.", screenshot: "Alert configured." },
        ],
        estimatedSetupMinutes: 30,
        estimatedTimeSavedPerRun: "2-3 hours per week on status tracking",
        complexity: "beginner",
        notes: "SharePoint Lists are your company's internal database. All data stays within your Microsoft 365 tenant.",
      },

      microsoft_365: {
        prerequisites: [
          "Microsoft 365 Business or Enterprise subscription",
          "Access to Teams, Outlook, and relevant apps",
        ],
        steps: [
          { stepNumber: 1, action: "Use Microsoft Copilot (if licensed)", where: "Any M365 app → Copilot icon", detail: "If your organisation has Microsoft 365 Copilot: open Word, Excel, or Teams → click the Copilot icon → describe what you need. Copilot analyses data within your tenant only.", screenshot: "Copilot panel opens." },
          { stepNumber: 2, action: "Use Teams for collaboration", where: "Microsoft Teams → your channel", detail: "Share analysis outputs in Teams channels instead of email. Use Teams Planner for task tracking without external project tools.", screenshot: "Teams channel with analysis posted." },
          { stepNumber: 3, action: "Use Loop for collaborative notes", where: "teams.microsoft.com → Loop", detail: "Microsoft Loop allows collaborative, live-updated documents embedded in Teams. Capture meeting decisions without external tools.", screenshot: "Loop component in Teams." },
          { stepNumber: 4, action: "Use Forms for data collection", where: "forms.office.com", detail: "Create a Microsoft Form to collect data from colleagues without external survey tools. Responses feed directly into Excel Online.", screenshot: "Form created, responses in Excel." },
        ],
        estimatedSetupMinutes: 15,
        estimatedTimeSavedPerRun: "Ongoing — replaces external tools",
        complexity: "beginner",
        notes: "All Microsoft 365 services run within your company's tenant. No data leaves your organisation.",
      },
    };

    const guide = guides[tool];

    return {
      tool,
      toolDisplayName: this._toolNames[tool] || tool,
      businessObjective: objective,
      ...guide,
    };
  },

  /**
   * Build the prompt text OrchestrIQ uses when switching to internal automation mode.
   * Called when restricted mode cannot collect required data.
   */
  buildConsultantPrompt(
    agentId: string,
    objective: string,
    companyContext: { name: string; industry: string; tools?: string[] }
  ): string {
    const guides = this.generate(agentId, objective, companyContext);
    if (guides.length === 0) return "";

    const lines: string[] = [
      `## 🏢 Guided Internal Automation Mode`,
      ``,
      `Because ${companyContext.name}'s security policy restricts external data sharing, ` +
      `OrchestrIQ will guide you to achieve **${objective}** entirely within your organisation's existing tools.`,
      ``,
      `No data needs to leave your environment. Follow the steps below inside your company's systems.`,
      ``,
    ];

    for (const guide of guides) {
      lines.push(`---`);
      lines.push(`### 🔧 ${guide.toolDisplayName}`);
      lines.push(`**Setup time:** ~${guide.estimatedSetupMinutes} minutes | **Time saved:** ${guide.estimatedTimeSavedPerRun} | **Complexity:** ${guide.complexity}`);
      lines.push(``);
      lines.push(`**Prerequisites:**`);
      guide.prerequisites.forEach(p => lines.push(`- ${p}`));
      lines.push(``);
      lines.push(`**Steps:**`);
      guide.steps.forEach(s =>
        lines.push(`${s.stepNumber}. **${s.action}** _(${s.where})_ — ${s.detail}`)
      );
      if (guide.codeSnippet) {
        lines.push(``);
        lines.push(`**Code snippet:**`);
        lines.push("```");
        lines.push(guide.codeSnippet);
        lines.push("```");
      }
      lines.push(``);
      lines.push(`> 📌 ${guide.notes}`);
      lines.push(``);
    }

    return lines.join("\n");
  },
};

// ─────────────────────────────────────────────
// D. PERSISTENT WORKSPACE
// ─────────────────────────────────────────────

/**
 * Allows users to progressively build datasets across multiple sessions.
 * No single large upload required — collect fields incrementally.
 * Audit history preserved. Duplicate detection built in.
 * Confidential values are NOT stored — only metadata and confirmed summaries.
 *
 * Usage:
 *   PersistentWorkspace.initialise(userId, agentId, "Q3 Expense Audit", 12);
 *   PersistentWorkspace.addField(userId, agentId, "Q3 Expense Audit", "total_expenses", 125000, "restricted_manual");
 *   const ws = PersistentWorkspace.load(userId, agentId, "Q3 Expense Audit");
 */
export const PersistentWorkspace = {

  /**
   * Create or resume a workspace.
   */
  initialise(
    userId: string,
    agentId: string,
    projectName: string,
    totalFieldsRequired: number
  ): PersistentWorkspaceRecord {
    const key = wsKey(userId, agentId, projectName);
    const existing = safeRead<PersistentWorkspaceRecord>(key);

    if (existing) {
      // Resume existing workspace
      existing.auditHistory.push({
        entryId: genId("audit"),
        timestamp: nowStr(),
        action: "session_resumed",
        source: "restricted_manual",
        note: `Session resumed. ${existing.totalFieldsCollected}/${existing.totalFieldsRequired} fields already collected.`,
      });
      existing.sessions += 1;
      existing.lastUpdated = nowStr();
      safeWrite(key, existing);
      return existing;
    }

    // New workspace
    const record: PersistentWorkspaceRecord = {
      workspaceId: genId("ws"),
      userId,
      agentId,
      projectName,
      totalFieldsRequired,
      totalFieldsCollected: 0,
      fields: {},
      auditHistory: [
        {
          entryId: genId("audit"),
          timestamp: nowStr(),
          action: "session_resumed",
          source: "restricted_manual",
          note: "New workspace created.",
        },
      ],
      sessions: 1,
      createdAt: nowStr(),
      lastUpdated: nowStr(),
    };

    safeWrite(key, record);
    return record;
  },

  /**
   * Add or update a field in the workspace.
   * Detects duplicates — does not overwrite without explicit force flag.
   * Never stores raw high-sensitivity values.
   */
  addField(
    userId: string,
    agentId: string,
    projectName: string,
    field: string,
    value: unknown,
    source: WorkspaceAuditEntry["source"],
    sensitivity: "low" | "medium" | "high" = "low",
    force: boolean = false
  ): { record: PersistentWorkspaceRecord; isDuplicate: boolean; wasUpdated: boolean } {
    const key = wsKey(userId, agentId, projectName);
    const record = safeRead<PersistentWorkspaceRecord>(key);
    if (!record) {
      throw new Error(`Workspace "${projectName}" not initialised. Call PersistentWorkspace.initialise() first.`);
    }

    const isDuplicate = field in record.fields;
    const existingValue = isDuplicate ? record.fields[field].value : undefined;

    // Duplicate with same value — skip
    if (isDuplicate && existingValue === value && !force) {
      record.auditHistory.push({
        entryId: genId("audit"),
        timestamp: nowStr(),
        action: "duplicate_detected",
        field,
        valueType: typeof value,
        source,
        note: "Duplicate value — no update applied.",
      });
      safeWrite(key, record);
      return { record, isDuplicate: true, wasUpdated: false };
    }

    // Store value — strip raw content for high sensitivity
    const storeValue =
      sensitivity === "high"
        ? `[${typeof value} confirmed at ${nowStr().slice(0, 10)}]`
        : value;

    record.fields[field] = {
      value: storeValue,
      source,
      collectedAt: nowStr(),
      validated: sensitivity !== "high", // High sensitivity requires explicit validation
    };

    if (!isDuplicate) {
      record.totalFieldsCollected = Object.keys(record.fields).length;
    }

    record.auditHistory.push({
      entryId: genId("audit"),
      timestamp: nowStr(),
      action: isDuplicate ? "field_updated" : "field_collected",
      field,
      valueType: typeof value,
      source,
      note: isDuplicate ? "Field updated (previous value overwritten)." : undefined,
    });

    record.lastUpdated = nowStr();
    safeWrite(key, record);

    return { record, isDuplicate, wasUpdated: true };
  },

  /** Mark a field as validated (after user confirms or cross-references) */
  validateField(
    userId: string,
    agentId: string,
    projectName: string,
    field: string
  ): PersistentWorkspaceRecord | null {
    const key = wsKey(userId, agentId, projectName);
    const record = safeRead<PersistentWorkspaceRecord>(key);
    if (!record || !(field in record.fields)) return null;

    record.fields[field].validated = true;
    record.auditHistory.push({
      entryId: genId("audit"),
      timestamp: nowStr(),
      action: "field_validated",
      field,
      source: record.fields[field].source,
    });
    record.lastUpdated = nowStr();
    safeWrite(key, record);
    return record;
  },

  load(
    userId: string,
    agentId: string,
    projectName: string
  ): PersistentWorkspaceRecord | null {
    return safeRead<PersistentWorkspaceRecord>(wsKey(userId, agentId, projectName));
  },

  /** List all workspaces for this user+agent */
  list(userId: string, agentId: string): string[] {
    const prefix = `${WORKSPACE_PREFIX}${userId}_${agentId}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keys.push(k.replace(prefix, "").replace(/_/g, " "));
      }
    }
    return keys;
  },

  /** Summary string for display */
  summarise(record: PersistentWorkspaceRecord): string {
    const pct = Math.round(
      (record.totalFieldsCollected / Math.max(record.totalFieldsRequired, 1)) * 100
    );
    const validated = Object.values(record.fields).filter(f => f.validated).length;
    return (
      `📁 ${record.projectName} — ` +
      `${record.totalFieldsCollected}/${record.totalFieldsRequired} fields collected (${pct}%) | ` +
      `${validated} validated | ` +
      `${record.sessions} session(s) | ` +
      `Last updated: ${record.lastUpdated.slice(0, 10)}`
    );
  },

  /** Merge a photo reconstruction result into an existing workspace */
  mergePhotoReconstructionResult(
    userId: string,
    agentId: string,
    projectName: string,
    session: PhotoReconstructionSession
  ): PersistentWorkspaceRecord | null {
    const key = wsKey(userId, agentId, projectName);
    const record = safeRead<PersistentWorkspaceRecord>(key);
    if (!record) return null;

    // Store row count and confidence — not raw data
    const metadata = {
      pagesProcessed: session.pages.length,
      rowsReconstructed: session.mergedTable.length,
      overallConfidence: session.overallConfidence,
      uncertainCellCount: session.uncertainCells.length,
      mergedAt: nowStr(),
    };

    record.fields[`_photo_merge_${session.sessionId}`] = {
      value: metadata,
      source: "photo",
      collectedAt: nowStr(),
      validated: session.overallConfidence >= 80 && !session.requiresUserConfirmation,
    };

    record.auditHistory.push({
      entryId: genId("audit"),
      timestamp: nowStr(),
      action: "photo_merged",
      note: `Photo reconstruction merged: ${session.pages.length} pages, ${session.mergedTable.length} rows, ${session.overallConfidence}% confidence.`,
      source: "photo",
    });

    record.totalFieldsCollected = Object.keys(record.fields).filter(
      k => !k.startsWith("_")
    ).length;
    record.lastUpdated = nowStr();
    safeWrite(key, record);
    return record;
  },
};

// ─────────────────────────────────────────────
// E. PRIVACY GUARD
// ─────────────────────────────────────────────

/**
 * Wrapper enforcing privacy-first behaviour for every Agent and Workflow.
 * Call checkMode() at agent startup. The result determines how the agent
 * collects inputs and whether it switches to GuidedInternalAutomation.
 *
 * Usage:
 *   const check = PrivacyGuard.checkMode("upload", fieldManifest);
 *   if (!check.approved) → switch to restricted flow
 *   PrivacyGuard.buildModeSelector() → renders mode selection UI text
 */
export const PrivacyGuard = {

  RESTRICTED_FIELDS_PATTERNS: [
    /salary/i, /payroll/i, /personal.*data/i, /employee.*id/i,
    /national.*id/i, /passport/i, /bank.*account/i, /iban/i,
    /credit.*card/i, /social.*security/i, /tax.*id/i,
    /health.*record/i, /medical/i, /dob/i, /date.*of.*birth/i,
  ],

  /**
   * Evaluate whether the chosen input mode is appropriate for the field manifest.
   * Returns a privacy check result with warnings and field classifications.
   */
  checkMode(
    mode: InputMode,
    fieldManifest: MinimumDataRequest[]
  ): PrivacyCheckResult {
    const blocked: string[] = [];
    const allowed: string[] = [];
    const warnings: string[] = [];

    for (const field of fieldManifest) {
      const isSensitive =
        field.sensitivity === "high" ||
        this.RESTRICTED_FIELDS_PATTERNS.some(p => p.test(field.field));

      if (mode === "restricted") {
        if (isSensitive && !field.canUseSummary && !field.canUsePhoto) {
          blocked.push(field.field);
        } else {
          allowed.push(field.field);
        }
      } else {
        // Non-restricted mode — warn about sensitive fields
        if (isSensitive) {
          warnings.push(
            `Field "${field.field}" contains sensitive data. Consider using Restricted Enterprise Mode.`
          );
        }
        allowed.push(field.field);
      }
    }

    const privacyStatement =
      mode === "restricted"
        ? EnterprisePrivacyEngine.PRIVACY_STATEMENT
        : blocked.length > 0
        ? "⚠️ Some fields contain sensitive data. Restricted Enterprise Mode is recommended."
        : "";

    return {
      approved: blocked.length === 0 || mode !== "restricted",
      mode,
      privacyStatement,
      warnings,
      blockedFields: blocked,
      allowedFields: allowed,
    };
  },

  /**
   * Render the four-mode selector as descriptive text for display in agent UI.
   */
  buildModeSelector(): Array<{ mode: InputMode; label: string; description: string; icon: string; recommended: boolean }> {
    return [
      {
        mode: "upload",
        label: "Direct Upload",
        description: "Upload files directly. Fastest option when your IT policy permits it.",
        icon: "📤",
        recommended: false,
      },
      {
        mode: "paste",
        label: "Copy / Paste",
        description: "Paste data from your clipboard. Works with Excel, CSV, or plain text.",
        icon: "📋",
        recommended: false,
      },
      {
        mode: "photo",
        label: "Photo Capture",
        description: "Take one or multiple photos of your document. OrchestrIQ reconstructs tables automatically.",
        icon: "📸",
        recommended: false,
      },
      {
        mode: "restricted",
        label: "Restricted Enterprise Mode",
        description:
          "For organisations where file upload is not permitted. " +
          "OrchestrIQ requests only the minimum data needed — specific values, not full files. " +
          "Or generates step-by-step instructions for tools already inside your organisation.",
        icon: "🔒",
        recommended: true,
      },
    ];
  },

  /**
   * Build the privacy disclosure statement to show users before they begin.
   * Call this once at the start of every agent or workflow session.
   */
  buildDisclosure(mode: InputMode, agentName: string): string {
    if (mode !== "restricted") {
      return (
        `**${agentName}** is ready. ` +
        `If your organisation restricts external file uploads, switch to 🔒 Restricted Enterprise Mode.`
      );
    }

    return (
      `🔒 **Restricted Enterprise Mode Active**\n\n` +
      `**${agentName}** is operating in privacy-compliant mode.\n\n` +
      `- Confidential information should remain inside your organisation.\n` +
      `- Only the specific values listed below will be requested.\n` +
      `- No complete files, spreadsheets, or reports should be uploaded.\n` +
      `- Where your data cannot be shared at all, you will receive step-by-step instructions ` +
      `to perform the analysis entirely within your company's own tools.\n\n` +
      `_This mode complies with typical enterprise data security policies. ` +
      `Please verify with your IT or security team if unsure._`
    );
  },
};
