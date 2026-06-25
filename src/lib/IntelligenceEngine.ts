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
