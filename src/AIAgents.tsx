import { useState, useCallback, useRef } from "react";
import { saveRecord, estimateCost, estimateTokens } from "./TokenAnalytics";

// ─────────────────────────────────────────────────────────────────────────────
// AGENT REGISTRY — Configuration-driven. Adding a new agent = one entry here.
// ─────────────────────────────────────────────────────────────────────────────
export interface AgentDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  exportFormats: string[];
  comingSoon?: boolean;
  flagship?: boolean;
  systemPrompt: (ctx: AgentContext) => string;
  color: string;
}

interface AgentContext {
  company: any;
  compData: any;
  industry?: string;
  userInput: string;
  dataHubSummary?: string;
  preferences?: Record<string, string>;
}

export const AGENT_REGISTRY: AgentDef[] = [
  // ── EXECUTIVE OFFICE ─────────────────────────────────────────────────────
  {
    id: "exec_assistant", name: "Executive Assistant", category: "Executive Office",
    icon: "🤝", color: "#14B8A6", flagship: true,
    description: "Drafts executive communications, meeting agendas, briefing notes and action summaries.",
    inputTypes: ["text", "meeting notes", "emails"], outputTypes: ["summary", "action list", "briefing"],
    exportFormats: ["docx", "pdf", "md"],
    systemPrompt: ({ company, userInput }) =>
      `You are a world-class Executive Assistant for ${company?.name||"the company"} (${company?.industry||"business"}).\n` +
      `Produce professional executive-grade output. Be concise, structured and action-oriented.\n` +
      `Use clear sections: Summary, Key Points, Actions Required, Next Steps.\n` +
      `TASK: ${userInput}`
  },
  {
    id: "meeting_intel", name: "Meeting Intelligence", category: "Executive Office",
    icon: "🎙️", color: "#8B5CF6", flagship: true,
    description: "Transforms meeting notes or transcripts into structured summaries, decisions and action items.",
    inputTypes: ["text", "transcript"], outputTypes: ["summary", "decisions", "action items"],
    exportFormats: ["docx", "pdf", "xlsx"],
    systemPrompt: ({ company, userInput }) =>
      `You are a Meeting Intelligence specialist for ${company?.name||"the company"}.\n` +
      `Analyse the meeting content and produce:\n` +
      `1. Executive Summary (3-5 sentences)\n2. Key Decisions Made\n3. Action Items (Owner | Action | Deadline)\n` +
      `4. Open Issues\n5. Next Meeting Agenda Suggestions\n\nMEETING CONTENT:\n${userInput}`
  },
  {
    id: "monthly_review", name: "Monthly Business Review", category: "Executive Office",
    icon: "📊", color: "#F59E0B", flagship: true,
    description: "Generates MBR reports with KPI analysis, variance commentary and executive recommendations.",
    inputTypes: ["text", "data", "metrics"], outputTypes: ["MBR report", "dashboard", "presentation"],
    exportFormats: ["pptx", "pdf", "xlsx", "docx"],
    systemPrompt: ({ company, compData, userInput }) =>
      `You are a Business Performance Analyst for ${company?.name||"the company"} (${company?.industry||"business"}).\n` +
      (compData && Object.keys(compData).length ? `DATA HUB:\n${Object.entries(compData).map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n` : "") +
      `Produce a Monthly Business Review covering:\n` +
      `1. Executive Summary\n2. Financial Performance vs Target\n3. KPI Scorecard with RAG status\n` +
      `4. Key Highlights & Lowlights\n5. Risks & Issues\n6. Recommendations\n7. Next Month Priorities\n\n` +
      `Use [VERIFIED] for confirmed data, [ASSUMPTION] where estimated.\n\nINPUT:\n${userInput}`
  },
  // ── FINANCE & AUDIT ───────────────────────────────────────────────────────
  {
    id: "expense_audit", name: "Expense Audit", category: "Finance & Audit",
    icon: "🧾", color: "#EF4444", flagship: true,
    description: "Audits expense reports and receipts for policy violations, duplicates and missing documentation.",
    inputTypes: ["text", "expense data", "policy"], outputTypes: ["audit report", "violations list", "risk score"],
    exportFormats: ["xlsx", "pdf", "docx"],
    systemPrompt: ({ company, userInput }) =>
      `You are a Senior Internal Auditor specialising in Travel & Expense compliance for ${company?.name||"the company"}.\n\n` +
      `Analyse the expense data and produce a structured audit report:\n\n` +
      `## EXPENSE AUDIT REPORT\n\n` +
      `### 1. Executive Summary\n### 2. Policy Violations\n| Claim | Employee | Amount | Violation | Risk |\n` +
      `### 3. Duplicate Claims Detected\n### 4. Missing Documentation\n` +
      `### 5. High-Risk Items\n### 6. Risk Score (0-100)\n### 7. Recommendations\n\n` +
      `Flag: missing receipts, exceeding limits, personal expenses, duplicate claims, policy breaches.\n` +
      `Label each finding: [CRITICAL] [HIGH] [MEDIUM] [LOW]\n\nEXPENSE DATA:\n${userInput}`
  },
  {
    id: "ap_review", name: "Accounts Payable Review", category: "Finance & Audit",
    icon: "📑", color: "#3B82F6", flagship: true,
    description: "Reviews invoices for three-way matching, duplicates, vendor analysis and payment ageing.",
    inputTypes: ["text", "invoice data", "PO data"], outputTypes: ["AP report", "exceptions", "ageing analysis"],
    exportFormats: ["xlsx", "pdf", "docx"],
    systemPrompt: ({ company, userInput }) =>
      `You are an AP Operations Specialist and Internal Auditor for ${company?.name||"the company"}.\n\n` +
      `Perform a comprehensive Accounts Payable review:\n\n` +
      `## AP REVIEW REPORT\n\n` +
      `### 1. Invoice Verification Summary\n### 2. Three-Way Match Exceptions\n` +
      `### 3. Duplicate Invoice Detection\n### 4. Vendor Risk Analysis\n` +
      `### 5. Payment Ageing Analysis\n| Bucket | Count | Amount | % of Total |\n` +
      `### 6. GR/IR Exceptions\n### 7. Month-End Accruals\n### 8. Compliance Issues\n` +
      `### 9. Recommendations\n\nLabel risk: [CRITICAL] [HIGH] [MEDIUM] [LOW]\n\nAP DATA:\n${userInput}`
  },
  {
    id: "financial_analysis", name: "Financial Analysis", category: "Finance & Audit",
    icon: "📈", color: "#10B981",
    description: "Deep financial analysis with variance commentary, ratio analysis and executive insights.",
    inputTypes: ["text", "financial data"], outputTypes: ["analysis report", "ratios", "commentary"],
    exportFormats: ["xlsx", "pdf", "pptx"],
    comingSoon: false,
    systemPrompt: ({ company, userInput }) =>
      `You are a CFO-level Financial Analyst for ${company?.name||"the company"}.\n` +
      `Produce a comprehensive financial analysis with: P&L Analysis, Balance Sheet Review, Cash Flow Analysis, ` +
      `Key Ratios (Liquidity, Profitability, Efficiency, Leverage), Variance Commentary, Red Flags, and Recommendations.\n\nDATA:\n${userInput}`
  },
  {
    id: "sox_review", name: "SOX Compliance Review", category: "Finance & Audit",
    icon: "⚖️", color: "#F97316", comingSoon: true,
    description: "Reviews internal controls against SOX/COSO framework requirements.",
    inputTypes: ["text", "controls data"], outputTypes: ["compliance report", "control gaps", "remediation plan"],
    exportFormats: ["docx", "xlsx"],
    systemPrompt: ({ company, userInput }) => `SOX compliance analysis for ${company?.name}.\n${userInput}`
  },
  {
    id: "reconciliation", name: "Reconciliation Assistant", category: "Finance & Audit",
    icon: "🔄", color: "#6366F1", comingSoon: true,
    description: "Identifies reconciling items, unmatched transactions and open items.",
    inputTypes: ["text", "reconciliation data"], outputTypes: ["recon report", "exceptions", "open items"],
    exportFormats: ["xlsx", "pdf"],
    systemPrompt: ({ company, userInput }) => `Reconciliation analysis for ${company?.name}.\n${userInput}`
  },
  // ── BUSINESS ANALYST (FLAGSHIP) ───────────────────────────────────────────
  {
    id: "business_analyst", name: "Business Analyst", category: "Executive Office",
    icon: "🔬", color: "#A855F7", flagship: true,
    description: "Transforms business data into executive reports, SWOT, root cause analysis, risk registers and Boardroom-ready summaries.",
    inputTypes: ["text", "data", "financials", "strategy"], outputTypes: ["analysis", "SWOT", "risk register", "recommendations", "boardroom brief"],
    exportFormats: ["pptx", "pdf", "docx", "xlsx"],
    systemPrompt: ({ company, compData, userInput }) =>
      `You are a McKinsey-calibre Business Analyst for ${company?.name||"the company"} (${company?.industry||"business"}, ${company?.stage||""}).\n\n` +
      (compData && Object.keys(compData).length ? `WORKSPACE DATA:\n${Object.entries(compData).map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n` : "") +
      `Produce a comprehensive business analysis:\n\n` +
      `## EXECUTIVE SUMMARY\n## SITUATION ANALYSIS\n## SWOT ANALYSIS\n` +
      `| | Strengths | Weaknesses |\n|---|---|---|\n| **Opportunities** | SO Strategies | WO Strategies |\n| **Threats** | ST Strategies | WT Strategies |\n\n` +
      `## ROOT CAUSE ANALYSIS\n## RISK REGISTER\n| Risk | Likelihood | Impact | Score | Mitigation |\n` +
      `## KEY FINDINGS\n## STRATEGIC RECOMMENDATIONS\n## BOARDROOM BRIEF (3 key decisions required)\n\n` +
      `Label: [VERIFIED] [ASSUMPTION] [ESTIMATE] [CRITICAL]\n\nINPUT:\n${userInput}`
  },
  // ── OPERATIONS ────────────────────────────────────────────────────────────
  {
    id: "process_mining", name: "Process Mining", category: "Operations",
    icon: "⚙️", color: "#06B6D4", flagship: true,
    description: "Analyses process descriptions to identify bottlenecks, inefficiencies and improvement opportunities.",
    inputTypes: ["text", "process data"], outputTypes: ["process analysis", "bottlenecks", "improvement plan"],
    exportFormats: ["docx", "pdf", "pptx"],
    systemPrompt: ({ company, userInput }) =>
      `You are a Process Excellence specialist for ${company?.name||"the company"}.\n\n` +
      `Perform process mining analysis:\n\n## PROCESS ANALYSIS REPORT\n\n` +
      `### 1. Process Overview\n### 2. Process Map (text-based)\n### 3. Bottlenecks Identified\n` +
      `### 4. Cycle Time Analysis\n### 5. Waste Identification (Lean 8 Wastes)\n` +
      `### 6. Root Causes\n### 7. Improvement Opportunities\n### 8. Quick Wins vs Strategic Changes\n` +
      `### 9. Expected Benefits\n\nPROCESS DATA:\n${userInput}`
  },
  {
    id: "workforce_planner", name: "Workforce Planner", category: "Operations",
    icon: "👥", color: "#84CC16", comingSoon: true,
    description: "Plans workforce capacity, identifies gaps and models headcount requirements.",
    inputTypes: ["text", "headcount data"], outputTypes: ["capacity plan", "gap analysis"],
    exportFormats: ["xlsx", "docx"],
    systemPrompt: ({ company, userInput }) => `Workforce planning for ${company?.name}.\n${userInput}`
  },
  // ── COMPLIANCE & RISK ─────────────────────────────────────────────────────
  {
    id: "sop_compliance", name: "SOP Compliance", category: "Compliance & Risk",
    icon: "📋", color: "#F59E0B", flagship: true,
    description: "Reviews processes against SOPs and identifies compliance gaps and deviations.",
    inputTypes: ["text", "SOP", "process description"], outputTypes: ["compliance report", "gaps", "remediation"],
    exportFormats: ["docx", "xlsx", "pdf"],
    systemPrompt: ({ company, userInput }) =>
      `You are a Compliance & Risk specialist for ${company?.name||"the company"}.\n\n` +
      `Review the provided content against the SOP/policy and produce:\n\n## SOP COMPLIANCE REVIEW\n\n` +
      `### 1. Compliance Summary\n### 2. Compliant Areas\n### 3. Non-Compliant Areas\n` +
      `| Section | Requirement | Actual | Gap | Risk | Action |\n` +
      `### 4. Risk Assessment\n### 5. Remediation Plan\n### 6. Priority Actions\n\nCONTENT:\n${userInput}`
  },
  {
    id: "risk_assessment", name: "Risk Assessment", category: "Compliance & Risk",
    icon: "⚠️", color: "#EF4444", comingSoon: true,
    description: "Identifies, scores and mitigates business, operational and compliance risks.",
    inputTypes: ["text", "risk data"], outputTypes: ["risk register", "heat map", "mitigation plan"],
    exportFormats: ["xlsx", "docx"],
    systemPrompt: ({ company, userInput }) => `Risk assessment for ${company?.name}.\n${userInput}`
  },
  {
    id: "internal_audit", name: "Internal Audit Assistant", category: "Compliance & Risk",
    icon: "🔍", color: "#6366F1", comingSoon: true,
    description: "Supports audit planning, fieldwork documentation and finding reporting.",
    inputTypes: ["text", "audit data"], outputTypes: ["audit report", "findings", "management letter"],
    exportFormats: ["docx", "xlsx"],
    systemPrompt: ({ company, userInput }) => `Internal audit for ${company?.name}.\n${userInput}`
  },
  // ── MARKETING & GROWTH ────────────────────────────────────────────────────
  {
    id: "marketing_campaign", name: "Marketing Campaign Builder", category: "Marketing & Growth",
    icon: "📣", color: "#EC4899", flagship: true,
    description: "Builds complete marketing campaigns with messaging, channels, calendar and budget allocation.",
    inputTypes: ["text", "objectives", "audience"], outputTypes: ["campaign plan", "content calendar", "messaging"],
    exportFormats: ["pptx", "docx", "xlsx"],
    systemPrompt: ({ company, userInput }) =>
      `You are a Senior Marketing Strategist for ${company?.name||"the company"} (${company?.industry||"business"}).\n\n` +
      `Build a complete marketing campaign:\n\n## MARKETING CAMPAIGN PLAN\n\n` +
      `### 1. Campaign Overview & Objectives\n### 2. Target Audience & ICP\n` +
      `### 3. Key Messages & Value Proposition\n### 4. Channel Strategy\n` +
      `### 5. Content Calendar (4-Week)\n| Week | Channel | Content Type | Message | CTA |\n` +
      `### 6. Budget Allocation\n### 7. KPIs & Success Metrics\n### 8. A/B Testing Plan\n\nBRIEF:\n${userInput}`
  },
  {
    id: "brand_strategy", name: "Brand Strategy", category: "Marketing & Growth",
    icon: "🎯", color: "#8B5CF6", comingSoon: true,
    description: "Develops brand positioning, voice and identity guidelines.",
    inputTypes: ["text", "brand brief"], outputTypes: ["brand strategy", "positioning", "guidelines"],
    exportFormats: ["pptx", "docx"],
    systemPrompt: ({ company, userInput }) => `Brand strategy for ${company?.name}.\n${userInput}`
  },
  {
    id: "investor_pitch", name: "Investor Pitch Assistant", category: "Marketing & Growth",
    icon: "💼", color: "#F59E0B", comingSoon: true,
    description: "Builds investor-ready pitch decks and financial narratives.",
    inputTypes: ["text", "financials", "strategy"], outputTypes: ["pitch deck", "executive summary"],
    exportFormats: ["pptx", "pdf"],
    systemPrompt: ({ company, userInput }) => `Investor pitch for ${company?.name}.\n${userInput}`
  },
  // ── DOCUMENT INTELLIGENCE ─────────────────────────────────────────────────
  {
    id: "smart_ocr", name: "Smart OCR", category: "Document Intelligence",
    icon: "🔬", color: "#06B6D4", flagship: true,
    description: "Extracts and structures text from documents, invoices, receipts and forms.",
    inputTypes: ["text", "image description", "document content"], outputTypes: ["structured data", "extracted text"],
    exportFormats: ["xlsx", "docx", "md"],
    systemPrompt: ({ userInput }) =>
      `You are a Document Intelligence specialist.\n\n` +
      `Extract and structure all information from the provided document content:\n\n` +
      `## DOCUMENT EXTRACTION REPORT\n\n` +
      `### Document Type\n### Extracted Data\n` +
      `| Field | Value | Confidence |\n|---|---|---|\n` +
      `### Structured Tables\n### Key Entities\n### Validation Flags\n\nDOCUMENT:\n${userInput}`
  },
  {
    id: "table_extraction", name: "Table Extraction", category: "Document Intelligence",
    icon: "📊", color: "#10B981", flagship: true,
    description: "Extracts tabular data from documents and converts to structured Excel-ready format.",
    inputTypes: ["text", "table data"], outputTypes: ["structured tables", "Excel data"],
    exportFormats: ["xlsx", "csv", "md"],
    systemPrompt: ({ userInput }) =>
      `You are a Data Extraction specialist.\n\n` +
      `Extract ALL tables from the provided content. For each table:\n` +
      `1. Identify the table title/subject\n2. Extract headers and all rows\n3. Clean and normalise data\n` +
      `4. Flag any ambiguous or missing values\n5. Output as clean Markdown tables\n\nCONTENT:\n${userInput}`
  },
  {
    id: "doc_comparison", name: "Document Comparison", category: "Document Intelligence",
    icon: "🔀", color: "#F97316", comingSoon: true,
    description: "Compares two documents and highlights differences, additions and deletions.",
    inputTypes: ["text", "two documents"], outputTypes: ["comparison report", "diff summary"],
    exportFormats: ["docx", "pdf"],
    systemPrompt: ({ userInput }) => `Document comparison.\n${userInput}`
  },
  // ── HR ────────────────────────────────────────────────────────────────────
  {
    id: "recruitment_review", name: "Recruitment Review", category: "HR",
    icon: "👔", color: "#84CC16", comingSoon: true,
    description: "Analyses CVs, shortlists candidates and generates structured interview questions.",
    inputTypes: ["text", "CV", "job description"], outputTypes: ["shortlist", "interview questions", "assessment"],
    exportFormats: ["docx", "xlsx"],
    systemPrompt: ({ company, userInput }) => `Recruitment analysis for ${company?.name}.\n${userInput}`
  },
  {
    id: "perf_review", name: "Performance Review", category: "HR",
    icon: "⭐", color: "#F59E0B", comingSoon: true,
    description: "Structures performance reviews with ratings, development plans and feedback.",
    inputTypes: ["text", "performance data"], outputTypes: ["review report", "development plan"],
    exportFormats: ["docx", "pdf"],
    systemPrompt: ({ company, userInput }) => `Performance review for ${company?.name}.\n${userInput}`
  },
  // ── CREATIVE STUDIO ───────────────────────────────────────────────────────
  {
    id: "media_prompt_builder", name: "Media Prompt Builder", category: "Creative Studio",
    icon: "🎨", color: "#EC4899", comingSoon: true,
    description: "Builds professional image and video prompts for any AI generation platform.",
    inputTypes: ["text", "brief"], outputTypes: ["image prompts", "video prompts"],
    exportFormats: ["md", "txt"],
    systemPrompt: ({ userInput }) => `Build professional media generation prompts for: ${userInput}`
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRY TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
const INDUSTRY_TEMPLATES: Record<string, { label: string; hint: string; icon: string }> = {
  banking:       { label: "Banking & Financial Services", hint: "Consider Basel III, AML, KYC, regulatory capital, NPA provisions", icon: "🏦" },
  insurance:     { label: "Insurance",                    hint: "Consider claims ratio, combined ratio, solvency margin, IFRS 17", icon: "🛡️" },
  healthcare:    { label: "Healthcare",                   hint: "Consider HIPAA, patient outcomes, bed occupancy, EBITDAR", icon: "🏥" },
  retail:        { label: "Retail & E-Commerce",          hint: "Consider same-store sales, inventory turnover, GMROI, NPS", icon: "🛒" },
  manufacturing: { label: "Manufacturing",                hint: "Consider OEE, yield rates, supply chain, OTIF, capacity utilisation", icon: "🏭" },
  hospitality:   { label: "Hospitality & Tourism",        hint: "Consider RevPAR, ADR, occupancy rate, F&B margins", icon: "🏨" },
  consulting:    { label: "Consulting & Professional Services", hint: "Consider utilisation rate, realisable rate, revenue per consultant", icon: "💼" },
  government:    { label: "Government & Public Sector",   hint: "Consider budget utilisation, service delivery KPIs, compliance", icon: "🏛️" },
  airlines:      { label: "Airlines & Aviation",          hint: "Consider CASK, RASK, load factor, on-time performance, yield", icon: "✈️" },
};

// ─────────────────────────────────────────────────────────────────────────────
// AGENT CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "Executive Office",      icon: "🏛️", color: "#14B8A6" },
  { id: "Finance & Audit",       icon: "💰", color: "#3B82F6" },
  { id: "Operations",            icon: "⚙️", color: "#06B6D4" },
  { id: "Compliance & Risk",     icon: "⚖️", color: "#F59E0B" },
  { id: "Marketing & Growth",    icon: "📣", color: "#EC4899" },
  { id: "Document Intelligence", icon: "📄", color: "#8B5CF6" },
  { id: "HR",                    icon: "👥", color: "#84CC16" },
  { id: "Creative Studio",       icon: "🎨", color: "#F97316" },
];

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface AgentRun {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: string;
  confidence: number;
  evidence: string[];
  assumptions: string[];
  recommendations: string[];
  risks: string[];
  ts: string;
  industry?: string;
}

interface AIAgentsProps {
  co: any;
  compData: any;
  keys: Record<string, string>;
  defP: string;
  ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>;
  showToast: (msg: string, type?: string) => void;
  dlFile: (name: string, content: any, mime?: string) => void;
  ensureJsPDF: () => Promise<any>;
  ensureXLSX: () => Promise<any>;
  ensurePptx: () => Promise<any>;
  parseSections: (md: string) => Array<{ title: string; lines: string[] }>;
  stripMd: (s: string) => string;
  brSessions: any[];
  setBrSessions: (s: any[]) => void;
  sv: (key: string, val: any) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function extractSection(text: string, heading: string): string {
  const lines = text.split("\n");
  let capture = false;
  const result: string[] = [];
  for (const ln of lines) {
    if (ln.match(new RegExp(`^#+\\s*${heading}`, "i"))) { capture = true; continue; }
    if (capture && ln.match(/^#+\s/)) break;
    if (capture) result.push(ln);
  }
  return result.join("\n").trim();
}

function parseEvidence(output: string): { confidence: number; evidence: string[]; assumptions: string[]; recommendations: string[]; risks: string[] } {
  const lines = output.split("\n");
  const evidence = lines.filter(l => l.includes("[VERIFIED]")).map(l => l.replace(/\[VERIFIED\]/g, "").trim()).filter(Boolean).slice(0, 5);
  const assumptions = lines.filter(l => l.includes("[ASSUMPTION]") || l.includes("[ESTIMATE]")).map(l => l.replace(/\[ASSUMPTION\]|\[ESTIMATE\]/g, "").trim()).filter(Boolean).slice(0, 5);
  const recs = extractSection(output, "Recommendation").split("\n").filter(l => l.trim() && !l.startsWith("#")).slice(0, 5);
  const risks = lines.filter(l => /\[CRITICAL\]|\[HIGH\]/.test(l)).map(l => l.replace(/\[(CRITICAL|HIGH)\]/g, "[$1]").trim()).filter(Boolean).slice(0, 5);
  const placeholders = (output.match(/\[INSERT\]|\[TBD\]|Lorem ipsum/gi) || []).length;
  const confidence = Math.max(40, Math.min(95, 85 - placeholders * 8 - assumptions.length * 3));
  return { confidence, evidence, assumptions, recommendations: recs, risks };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AIAgents({ co, compData, keys, defP, ask, showToast, dlFile, ensureJsPDF, ensureXLSX, ensurePptx, parseSections, stripMd, brSessions, setBrSessions, sv }: AIAgentsProps) {
  const [view, setView] = useState<"landing" | "run" | "result" | "history" | "orchestrate">("landing");
  const [activeAgent, setActiveAgent] = useState<AgentDef | null>(null);
  const [userInput, setUserInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentRun | null>(null);
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [filterCat, setFilterCat] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [showPrefPrompt, setShowPrefPrompt] = useState(false);
  const [editedOutput, setEditedOutput] = useState("");
  const [orchestrateInput, setOrchestrateInput] = useState("");
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchestrateResult, setOrchestrateResult] = useState<AgentRun[]>([]);
  const historyRef = useRef<AgentRun[]>([]);

  // ── LOAD HISTORY ────────────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    try { const h = JSON.parse(localStorage.getItem("oiq-agent-history") || "[]"); setHistory(h); historyRef.current = h; } catch {}
  }, []);

  const saveHistory = useCallback((runs: AgentRun[]) => {
    const trimmed = runs.slice(0, 100);
    historyRef.current = trimmed;
    setHistory(trimmed);
    try { localStorage.setItem("oiq-agent-history", JSON.stringify(trimmed)); } catch {}
  }, []);

  // ── RUN AGENT ───────────────────────────────────────────────────────────
  const runAgent = useCallback(async (agent: AgentDef, input: string, industryKey: string) => {
    if (!input.trim()) { showToast("Please provide input for the agent", "warning"); return; }
    setRunning(true);
    try {
      const ctx: AgentContext = {
        company: co, compData,
        industry: industryKey ? INDUSTRY_TEMPLATES[industryKey]?.hint : undefined,
        userInput: input + (industryKey ? `\n\nINDUSTRY CONTEXT: ${INDUSTRY_TEMPLATES[industryKey]?.hint}` : ""),
        preferences: preferences[agent.id] ? { style: preferences[agent.id] } : undefined,
      };
      const sys = agent.systemPrompt(ctx) +
        (ctx.preferences?.style ? `\n\nUSER STYLE PREFERENCE: ${ctx.preferences.style}` : "") +
        "\n\nLabel verified data [VERIFIED], assumptions [ASSUMPTION], critical issues [CRITICAL], high priority [HIGH].";

      const raw = await ask(sys, [{ role: "user", content: input }], 3000);
      const output = typeof raw === "string" ? raw : raw?.text || raw?.content?.[0]?.text || JSON.stringify(raw);
      const parsed = parseEvidence(output);

      const run: AgentRun = {
        id: Date.now().toString(36),
        agentId: agent.id,
        agentName: agent.name,
        input: input.slice(0, 500),
        output,
        ...parsed,
        ts: new Date().toISOString(),
        industry: industryKey || undefined,
      };

      saveRecord({ feature: "AI Agents — " + agent.name, featureIcon: agent.icon, provider: defP, model: defP, inputTokens: estimateTokens(input + sys), outputTokens: estimateTokens(output), costUsd: estimateCost(defP, estimateTokens(input + sys), estimateTokens(output)) });
      saveHistory([run, ...historyRef.current]);
      setResult(run);
      setEditedOutput(output);
      setView("result");
    } catch (e: any) {
      showToast("Agent failed: " + (e.message || "Unknown error"), "error");
    } finally {
      setRunning(false);
    }
  }, [co, compData, ask, defP, showToast, preferences, saveHistory]);

  // ── ORCHESTRATOR ─────────────────────────────────────────────────────────
  const runOrchestrator = useCallback(async (input: string) => {
    if (!input.trim()) { showToast("Describe your business request", "warning"); return; }
    setOrchestrating(true);
    setOrchestrateResult([]);
    try {
      // Step 1: Determine which agents to run
      const planSys = `You are an AI Agent Orchestrator. Given a business request, determine which agents from this list should run and in what order.\n` +
        `AVAILABLE AGENTS: ${AGENT_REGISTRY.filter(a => !a.comingSoon).map(a => a.id + ": " + a.name).join(", ")}\n\n` +
        `Output ONLY a JSON array of agent IDs in execution order. Maximum 4 agents. No other text.\nExample: ["exec_assistant","business_analyst"]`;
      const planRaw = await ask(planSys, [{ role: "user", content: input }], 300);
      const planText = typeof planRaw === "string" ? planRaw : planRaw?.text || "[]";
      let agentIds: string[] = [];
      try {
        const cleaned = planText.trim().replace(/```json\s*/i, "").replace(/```\s*/i, "").replace(/```\s*$/, "");
        agentIds = JSON.parse(cleaned);
      } catch {
        agentIds = ["business_analyst"];
      }

      // Step 2: Run each agent
      const runs: AgentRun[] = [];
      for (const agentId of agentIds.slice(0, 4)) {
        const agent = AGENT_REGISTRY.find(a => a.id === agentId);
        if (!agent || agent.comingSoon) continue;
        const ctx: AgentContext = { company: co, compData, userInput: input };
        const sys = agent.systemPrompt(ctx);
        const raw = await ask(sys, [{ role: "user", content: input }], 2500);
        const output = typeof raw === "string" ? raw : raw?.text || "";
        const parsed = parseEvidence(output);
        const run: AgentRun = { id: Date.now().toString(36) + agentId, agentId: agent.id, agentName: agent.name, input: input.slice(0, 300), output, ...parsed, ts: new Date().toISOString() };
        runs.push(run);
        saveRecord({ feature: "Orchestrator — " + agent.name, featureIcon: "🎯", provider: defP, model: defP, inputTokens: estimateTokens(input + sys), outputTokens: estimateTokens(output), costUsd: estimateCost(defP, estimateTokens(input + sys), estimateTokens(output)) });
      }
      setOrchestrateResult(runs);
      saveHistory([...runs, ...historyRef.current]);
      showToast(`✅ Orchestrator complete — ${runs.length} agents executed`, "success");
    } catch (e: any) {
      showToast("Orchestrator failed: " + (e.message || ""), "error");
    } finally {
      setOrchestrating(false);
    }
  }, [co, compData, ask, defP, showToast, saveHistory]);

  // ── SEND TO BOARDROOM ────────────────────────────────────────────────────
  const sendToBoardroom = useCallback((run: AgentRun) => {
    const brief = `## ${run.agentName} Output\n\n${run.output.slice(0, 2000)}\n\n---\n_From AI Agents module_`;
    showToast("Output sent to AI Boardroom for executive debate", "success");
    // The parent can pick this up via brSessions if needed
    // For now we show the user the brief and suggest they use it in Boardroom
    const session = {
      id: Date.now().toString(36),
      q: `Debate the findings from ${run.agentName}: ${run.output.slice(0, 200)}`,
      res: brief,
      researchBrief: "",
      format: "threaded" as const,
      stages: [] as any[],
      ts: new Date().toISOString(),
    };
    const updated = [session, ...brSessions].slice(0, 50);
    setBrSessions(updated);
    sv("cos-br", updated);
    showToast("Sent to AI Boardroom — open Nerve Center → Boardroom to debate", "success");
  }, [brSessions, setBrSessions, sv, showToast]);

  // ── EXPORT RESULT ────────────────────────────────────────────────────────
  const exportResult = useCallback(async (run: AgentRun, format: string) => {
    const nm = run.agentName.replace(/\s+/g, "-");
    const content = editedOutput || run.output;
    if (format === "md") { dlFile(nm + ".md", content, "text/plain"); return; }
    if (format === "docx") {
      const secs = parseSections(content);
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:72pt;}h1{font-size:18pt;color:#14B8A6;}h2{font-size:13pt;color:#0D6EFD;}p{line-height:1.5;}table{border-collapse:collapse;width:100%;}th{background:#14B8A6;color:#fff;padding:5pt 8pt;}td{padding:4pt 8pt;border-bottom:1pt solid #ddd;}</style></head><body><h1>${run.agentName}</h1><p><em>${co?.name||""} · ${new Date(run.ts).toLocaleDateString()}</em></p>`;
      for (const sec of secs) { html += `<h2>${sec.title}</h2>`; sec.lines.forEach(ln => { const t = stripMd(ln).trim(); if (t) html += `<p>${t}</p>`; }); }
      html += "</body></html>";
      dlFile(nm + ".doc", html, "application/msword"); return;
    }
    if (format === "xlsx") {
      try {
        const XLSX = await ensureXLSX();
        const wb = XLSX.utils.book_new();
        const rows = content.split("\n").filter(Boolean).map((r: string) => r.split("|").filter((c: string, ii: number, a: string[]) => ii > 0 && ii < a.length - 1).map((c: string) => c.trim())).filter((r: string[]) => r.length > 1 && !r.every((c: string) => c.match(/^[-:]+$/)));
        const ws = rows.length > 0 ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[run.agentName], [""], [content.slice(0, 1000)]]);
        XLSX.utils.book_append_sheet(wb, ws, run.agentName.slice(0, 31));
        const meta = XLSX.utils.aoa_to_sheet([["Field", "Value"], ["Agent", run.agentName], ["Confidence", run.confidence + "%"], ["Generated", new Date(run.ts).toLocaleDateString()], ["Company", co?.name || ""]]);
        XLSX.utils.book_append_sheet(wb, meta, "Summary");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = u; a.download = nm + ".xlsx"; a.style.display = "none";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(u), 200);
      } catch (e: any) { showToast("Excel export failed: " + e.message, "error"); }
      return;
    }
    if (format === "pdf") {
      try {
        const jsPDF = await ensureJsPDF();
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
        let y = M;
        const agent = AGENT_REGISTRY.find(a => a.id === run.agentId);
        const accentR = parseInt((agent?.color || "#14B8A6").slice(1, 3), 16);
        const accentG = parseInt((agent?.color || "#14B8A6").slice(3, 5), 16);
        const accentB = parseInt((agent?.color || "#14B8A6").slice(5, 7), 16);
        doc.setFillColor(accentR, accentG, accentB); doc.rect(0, 0, W, 72, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
        doc.text(run.agentName, M, 44, { maxWidth: W - 2 * M });
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text((co?.name || "") + " · " + new Date(run.ts).toLocaleDateString() + " · Confidence: " + run.confidence + "%", M, 62);
        y = 90;
        parseSections(content).forEach(sec => {
          if (y > H - M) { doc.addPage(); y = M; }
          doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(accentR, accentG, accentB);
          doc.splitTextToSize(sec.title, W - 2 * M).forEach((l: string) => { if (y > H - M) { doc.addPage(); y = M; } doc.text(l, M, y); y += 15; });
          doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(45, 45, 45);
          sec.lines.forEach(ln => {
            const t = stripMd(ln); if (!t.trim()) return;
            if (y > H - M) { doc.addPage(); y = M; }
            doc.splitTextToSize(t, W - 2 * M).forEach((w: string) => { if (y > H - M) { doc.addPage(); y = M; } doc.text(w, M, y); y += 13; });
          });
          y += 6;
        });
        const pg = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pg; p++) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.text("Page " + p + " of " + pg, M, H - 18); }
        doc.save(nm + ".pdf");
      } catch (e: any) { showToast("PDF export failed: " + e.message, "error"); }
    }
  }, [editedOutput, co, dlFile, ensureJsPDF, ensureXLSX, parseSections, stripMd, showToast]);

  // ── STYLE ────────────────────────────────────────────────────────────────
  const S = {
    page: { flex: 1, overflowY: "auto" as const, background: "#070C18", fontFamily: "'Inter',-apple-system,sans-serif", color: "#F0F4FF" },
    card: { background: "#0F1829", border: "1px solid #1C2A40", borderRadius: 8, padding: "14px 16px", marginBottom: 10 },
    hdr: { padding: "18px 24px 14px", borderBottom: "1px solid #1C2A40", marginBottom: 16 },
    inp: { width: "100%", background: "#141F33", border: "1px solid #1C2A40", borderRadius: 6, padding: "9px 12px", color: "#F0F4FF", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none" },
    btn: { background: "linear-gradient(135deg,#14B8A6,#6366F1)", border: "none", borderRadius: 6, padding: "10px 18px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    hBtn: { background: "none", border: "1px solid #1C2A40", borderRadius: 5, padding: "4px 10px", color: "#8FA8CC", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
    badge: (c: string) => ({ fontSize: 8, padding: "2px 7px", borderRadius: 10, background: c + "22", color: c, fontWeight: 700 }),
  };

  // ── LANDING ──────────────────────────────────────────────────────────────
  const filteredAgents = AGENT_REGISTRY.filter(a =>
    (filterCat === "all" || a.category === filterCat) &&
    (!searchQ || a.name.toLowerCase().includes(searchQ.toLowerCase()) || a.description.toLowerCase().includes(searchQ.toLowerCase()))
  );

  if (view === "landing") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F0F4FF", marginBottom: 3 }}>🤖 AI Agents</div>
            <div style={{ fontSize: 11, color: "#4D6A8A" }}>Specialised AI agents for every business function · enterprise-grade outputs · export-ready</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setView("orchestrate"); }} style={{ ...S.hBtn, color: "#A855F7", borderColor: "#A855F7AA" }}>🎯 Orchestrate</button>
            <button onClick={() => { loadHistory(); setView("history"); }} style={S.hBtn}>History</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" as const }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search agents..." style={{ ...S.inp, width: 200, padding: "5px 10px", fontSize: 11 }} />
          {[{ id: "all", label: "All" }, ...CATEGORIES].map(c => (
            <button key={c.id} onClick={() => setFilterCat(c.id)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid " + (filterCat === c.id ? "#14B8A6" : "#1C2A40"), background: filterCat === c.id ? "rgba(20,184,166,0.1)" : "transparent", color: filterCat === c.id ? "#14B8A6" : "#4D6A8A", cursor: "pointer", fontFamily: "inherit" }}>{"icon" in c ? (c as any).icon + " " : ""}{c.label || "All"}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        {(filterCat === "all" ? CATEGORIES : CATEGORIES.filter(c => c.id === filterCat)).map(cat => {
          const agents = filteredAgents.filter(a => a.category === cat.id);
          if (!agents.length) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{cat.icon}</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#F0F4FF" }}>{cat.id}</div>
                <div style={{ height: 1, flex: 1, background: "#1C2A40" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8 }}>
                {agents.map(agent => (
                  <div key={agent.id} onClick={() => { if (!agent.comingSoon) { setActiveAgent(agent); setUserInput(""); setIndustry(""); setView("run"); } }} style={{ background: "#0F1829", border: "1px solid " + (agent.flagship ? agent.color + "44" : "#1C2A40"), borderRadius: 8, padding: "12px 14px", cursor: agent.comingSoon ? "default" : "pointer", opacity: agent.comingSoon ? 0.5 : 1, transition: "border 0.2s,transform 0.15s", position: "relative" as const }}>
                    {agent.flagship && <div style={{ position: "absolute", top: 8, right: 8, ...S.badge("#14B8A6") }}>FLAGSHIP</div>}
                    {agent.comingSoon && <div style={{ position: "absolute", top: 8, right: 8, ...S.badge("#5A6480") }}>SOON</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>{agent.icon}</span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF", flex: 1 }}>{agent.name}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#4D6A8A", lineHeight: 1.5, marginBottom: 8 }}>{agent.description}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                      {agent.exportFormats.map(f => <span key={f} style={{ ...S.badge(agent.color), fontSize: 7 }}>{f.toUpperCase()}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── RUN AGENT ────────────────────────────────────────────────────────────
  if (view === "run" && activeAgent) return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("landing")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Agents</button>
          <span style={{ fontSize: 20 }}>{activeAgent.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>{activeAgent.name}</div>
            <div style={{ fontSize: 10, color: "#4D6A8A" }}>{activeAgent.category}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={S.card}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Industry Context (optional)</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ ...S.inp, marginBottom: 14 }}>
            <option value="">— General —</option>
            {Object.entries(INDUSTRY_TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          {industry && <div style={{ fontSize: 10, color: "#14B8A6", background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: 5, padding: "6px 10px", marginBottom: 14 }}>💡 {INDUSTRY_TEMPLATES[industry]?.hint}</div>}
          <label style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Input — {activeAgent.inputTypes.join(" / ")}</label>
          <textarea value={userInput} onChange={e => setUserInput(e.target.value)} placeholder={"Paste your data, describe the task, or enter your request...\n\nThis agent accepts: " + activeAgent.inputTypes.join(", ")} rows={10} style={{ ...S.inp, resize: "vertical" as const, minHeight: 200 }} />
          {co?.name && <div style={{ fontSize: 10, color: "#4D6A8A", marginTop: 6 }}>Company context: {co.name} · {co.industry || "General"} · {co.currencySymbol || "₹"}{co.currency || "INR"}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => runAgent(activeAgent, userInput, industry)} disabled={running || !userInput.trim()} style={{ ...S.btn, opacity: running || !userInput.trim() ? 0.5 : 1, flex: 1 }}>
              {running ? "⏳ Running Agent..." : "▶ Run " + activeAgent.name}
            </button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#2D4460", textAlign: "center" as const }}>Output formats: {activeAgent.exportFormats.map(f => f.toUpperCase()).join(" · ")}</div>
      </div>
    </div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (view === "result" && result) {
    const agent = AGENT_REGISTRY.find(a => a.id === result.agentId);
    return (
      <div style={S.page}>
        <div style={S.hdr}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setView("run")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Back</button>
            <button onClick={() => setView("landing")} style={S.hBtn}>All Agents</button>
            <span style={{ fontSize: 18 }}>{agent?.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F0F4FF" }}>{result.agentName} — Results</div>
              <div style={{ fontSize: 9, color: "#4D6A8A" }}>{new Date(result.ts).toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          {/* Confidence & Evidence panel */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
            {[
              ["Confidence", result.confidence + "%", result.confidence >= 75 ? "#10B981" : result.confidence >= 55 ? "#F59E0B" : "#EF4444"],
              ["Evidence", result.evidence.length + " items", "#3B82F6"],
              ["Assumptions", result.assumptions.length + " items", "#F59E0B"],
              ["Risks", result.risks.length + " flags", "#EF4444"],
            ].map(([lb, val, c]) => (
              <div key={lb as string} style={{ background: "#141F33", border: "1px solid #1C2A40", borderRadius: 7, padding: "10px 8px", textAlign: "center" as const }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, marginBottom: 3 }}>{lb}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c as string }}>{val}</div>
              </div>
            ))}
          </div>
          {/* Evidence, Assumptions, Risks */}
          {(result.evidence.length > 0 || result.assumptions.length > 0 || result.risks.length > 0) && (
            <div style={{ ...S.card, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {result.evidence.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", marginBottom: 5 }}>✓ Evidence Used</div>{result.evidence.map((e, i) => <div key={i} style={{ fontSize: 10, color: "#8FA8CC", marginBottom: 3, lineHeight: 1.4 }}>• {e.slice(0, 80)}</div>)}</div>}
                {result.assumptions.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", marginBottom: 5 }}>⚠ Assumptions</div>{result.assumptions.map((a, i) => <div key={i} style={{ fontSize: 10, color: "#8FA8CC", marginBottom: 3, lineHeight: 1.4 }}>• {a.slice(0, 80)}</div>)}</div>}
                {result.risks.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", marginBottom: 5 }}>🚨 Key Risks</div>{result.risks.map((r, i) => <div key={i} style={{ fontSize: 10, color: "#8FA8CC", marginBottom: 3, lineHeight: 1.4 }}>• {r.slice(0, 80)}</div>)}</div>}
              </div>
            </div>
          )}
          {/* Output — editable */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF" }}>Output</div>
              <button onClick={() => { if (editedOutput !== result.output) { setShowPrefPrompt(true); } }} style={{ ...S.hBtn, fontSize: 9, color: "#14B8A6" }}>Save Edits as Preference</button>
            </div>
            <textarea value={editedOutput} onChange={e => setEditedOutput(e.target.value)} style={{ ...S.inp, minHeight: 360, resize: "vertical" as const, fontSize: 11, lineHeight: 1.6 }} />
          </div>
          {/* Learning prompt */}
          {showPrefPrompt && (
            <div style={{ ...S.card, border: "1px solid #14B8A644", background: "rgba(20,184,166,0.05)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#14B8A6", marginBottom: 8 }}>💡 Save as Style Preference?</div>
              <div style={{ fontSize: 11, color: "#8FA8CC", marginBottom: 10 }}>Your edits can be saved as a writing style preference for this agent. Future runs will apply your preferred style.</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { const p = { ...preferences, [result.agentId]: "Apply user edits: " + editedOutput.slice(0, 200) }; setPreferences(p); try { localStorage.setItem("oiq-agent-prefs", JSON.stringify(p)); } catch {} setShowPrefPrompt(false); showToast("Style preference saved for " + result.agentName, "success"); }} style={{ ...S.btn, flex: 1, fontSize: 11 }}>Yes — Save Preference</button>
                <button onClick={() => setShowPrefPrompt(false)} style={{ ...S.hBtn, flex: 1, textAlign: "center" as const }}>No Thanks</button>
              </div>
            </div>
          )}
          {/* Actions */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12 }}>
            {(agent?.exportFormats || ["md"]).map(fmt => (
              <button key={fmt} onClick={() => exportResult(result, fmt)} style={{ ...S.hBtn, color: agent?.color || "#14B8A6" }}>↓ {fmt.toUpperCase()}</button>
            ))}
            {(result.agentId === "business_analyst" || result.agentId === "monthly_review") && (
              <button onClick={() => sendToBoardroom(result)} style={{ ...S.hBtn, color: "#8B5CF6", borderColor: "#8B5CF644" }}>🏛 Send to Boardroom</button>
            )}
            <button onClick={() => navigator.clipboard.writeText(editedOutput)} style={S.hBtn}>📋 Copy</button>
            <button onClick={() => { setView("run"); }} style={S.hBtn}>🔄 Re-run</button>
          </div>
        </div>
      </div>
    );
  }

  // ── ORCHESTRATOR ──────────────────────────────────────────────────────────
  if (view === "orchestrate") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("landing")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Agents</button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>🎯 AI Agent Orchestrator</div>
            <div style={{ fontSize: 10, color: "#4D6A8A" }}>Describe your business request · system selects and runs the right agents automatically</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={S.card}>
          <div style={{ fontSize: 11, color: "#4D6A8A", marginBottom: 12, lineHeight: 1.6 }}>
            You do not need to select individual agents. Describe your business need and the Orchestrator will automatically determine which agents to run, execute them in the right order and combine the outputs.
          </div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Business Request</label>
          <textarea value={orchestrateInput} onChange={e => setOrchestrateInput(e.target.value)} placeholder={"Example: Analyse our Q3 financial performance, identify risks and prepare an executive boardroom brief\n\nOr: Review our expense claims for the month, check for policy violations and generate an audit report"} rows={6} style={{ ...S.inp, minHeight: 140 }} />
          <button onClick={() => runOrchestrator(orchestrateInput)} disabled={orchestrating || !orchestrateInput.trim()} style={{ ...S.btn, width: "100%", marginTop: 12, opacity: orchestrating || !orchestrateInput.trim() ? 0.5 : 1 }}>
            {orchestrating ? "⏳ Orchestrating..." : "🎯 Run Agent Orchestrator"}
          </button>
        </div>
        {orchestrateResult.length > 0 && orchestrateResult.map((run, idx) => {
          const agent = AGENT_REGISTRY.find(a => a.id === run.agentId);
          return (
            <div key={run.id} style={{ ...S.card, border: "1px solid " + (agent?.color || "#14B8A6") + "44" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{agent?.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#F0F4FF" }}>{run.agentName}</div><div style={{ fontSize: 9, color: "#4D6A8A" }}>Confidence: {run.confidence}%</div></div>
                <button onClick={() => { setResult(run); setEditedOutput(run.output); setView("result"); }} style={{ ...S.hBtn, fontSize: 9 }}>View Full</button>
              </div>
              <div style={{ fontSize: 10, color: "#8FA8CC", lineHeight: 1.5, maxHeight: 120, overflow: "hidden" }}>{run.output.slice(0, 400)}...</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── HISTORY ───────────────────────────────────────────────────────────────
  if (view === "history") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("landing")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Agents</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>Agent History</div>
          <button onClick={() => { if (confirm("Clear all agent history?")) { saveHistory([]); } }} style={{ ...S.hBtn, color: "#EF4444", borderColor: "#EF444433", marginLeft: "auto" }}>Clear All</button>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        {history.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center" as const, padding: 40, color: "#4D6A8A" }}>No agent runs yet. Run an agent to see history here.</div>
        ) : history.map(run => {
          const agent = AGENT_REGISTRY.find(a => a.id === run.agentId);
          return (
            <div key={run.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{agent?.icon || "🤖"}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF" }}>{run.agentName}</div><div style={{ fontSize: 9, color: "#4D6A8A" }}>{new Date(run.ts).toLocaleString()} · Confidence: {run.confidence}%</div></div>
                <button onClick={() => { setResult(run); setEditedOutput(run.output); setView("result"); }} style={{ ...S.hBtn, fontSize: 9, color: "#14B8A6" }}>Open</button>
              </div>
              <div style={{ fontSize: 10, color: "#4D6A8A" }}>{run.input.slice(0, 80)}...</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return null;
}
