// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT LIBRARY — what a professional deliverable actually looks like
//
// ── Why this is not 300 templates ────────────────────────────────────────────
// The catalogue below names ~300 business documents. Hand-writing 300 templates
// would be unmaintainable and would rot within months. But they are not 300
// different shapes: a Market Entry Strategy, a Country Entry Strategy and an
// Export Plan share one skeleton. A Break-Even Analysis and a Unit Economics
// study share another. Sixteen archetypes cover the whole catalogue, so adding a
// new document name is one line, not a new template.
//
// ── What actually makes output "McKinsey level" ──────────────────────────────
// Not the section list. Any model can emit headings. What separates a consulting
// deliverable from a competent essay is a writing discipline:
//   - the title states the CONCLUSION, not the topic
//   - the pyramid principle: answer first, then support, then evidence
//   - MECE sections that do not overlap and leave nothing out
//   - every number carries a source or an explicit label
//   - one recommendation, with an owner and a date
// That discipline is encoded once in CONSULTING_STANDARD and applies to all 300.
//
// ── The part that matters most ───────────────────────────────────────────────
// A user should not need to know a document's name. "I want to expand into the
// UAE" should silently become a bundle: market assessment, country risk, entry
// strategy, financial model, roadmap, decision memo. INTENT_BUNDLES does that.
//
// Pure data and pure functions. No imports, no API calls, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

export type ArchetypeId =
  | "plan" | "strategy" | "analysis" | "financial_model" | "assessment"
  | "research" | "decision_memo" | "roadmap" | "framework" | "procedure"
  | "register" | "review" | "profile" | "canvas" | "spec" | "board_paper";

export type Archetype = {
  id: ArchetypeId;
  label: string;
  purpose: string;
  sections: string[];
  mustContain: string[];
  bestFormat: "docx" | "xlsx" | "pptx" | "pdf";
};

// ── THE WRITING DISCIPLINE — applies to every document in the catalogue ───────
export const CONSULTING_STANDARD = [
  "QUALITY BAR — this must read as work from McKinsey, BCG or a Big Four partner. Six rules, all non-negotiable:",
  "",
  "1. ANSWER FIRST. Every section heading states the CONCLUSION, not the topic.",
  "   WRONG: 'Revenue Analysis'   RIGHT: 'Revenue can reach INR 4.2 crore by year two, but only if churn stays under 4%'",
  "2. PYRAMID PRINCIPLE. Lead with the recommendation, then the reasoning that supports it, then the evidence underneath. Never build up to a conclusion at the end.",
  "3. MECE. Sections must not overlap and must not leave a material gap. If two sections cover the same ground, merge them.",
  "4. EVERY NUMBER IS ACCOUNTABLE. Show formula, then assumption, then result. A figure with no derivation and no source does not belong in the document.",
  "5. SO WHAT. Every table and every chart is followed by one line stating what the reader should do differently because of it. If you cannot write that line, delete the table.",
  "6. ONE RECOMMENDATION. End with a single recommended course of action, a named owner, a date, and the cost of doing nothing. Not a list of options with no verdict.",
  "",
  "ALSO: state what you do not know. A named gap with a plan to close it is worth more than a confident guess. Never fabricate a figure to complete a table — write 'not established' and say how to establish it.",
].join("\n");

// ── ARCHETYPES ───────────────────────────────────────────────────────────────
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  plan: {
    id: "plan", label: "Plan", bestFormat: "docx",
    purpose: "Sets out what will be done, by whom, by when, at what cost.",
    sections: ["Executive Summary", "Objectives and Success Measures", "Current Position", "The Plan (phased)", "Resource and Headcount Requirement", "Financial Requirement and Returns", "Risks and Mitigations", "Milestones and Owners", "What We Do Not Yet Know"],
    mustContain: ["a phased timeline with dates", "a cost table", "named owners", "measurable success criteria"],
  },
  strategy: {
    id: "strategy", label: "Strategy", bestFormat: "pptx",
    purpose: "Chooses where to play and how to win, and rejects the alternatives.",
    sections: ["Executive Summary", "Situation and Context", "Strategic Options Considered", "Recommended Strategy", "Why the Alternatives Were Rejected", "Capabilities Required", "Financial Implications", "Risks and Dependencies", "Implementation Roadmap"],
    mustContain: ["at least three options scored against weighted criteria", "an explicit rejection rationale", "a capability gap assessment"],
  },
  analysis: {
    id: "analysis", label: "Analysis", bestFormat: "docx",
    purpose: "Establishes what is true about a question, with evidence.",
    sections: ["Executive Summary", "Question and Scope", "Method and Sources", "Findings", "Interpretation", "Implications for the Business", "Limitations and Evidence Gaps", "Recommended Next Steps"],
    mustContain: ["a source for every material figure", "an explicit limitations section"],
  },
  financial_model: {
    id: "financial_model", label: "Financial model", bestFormat: "xlsx",
    purpose: "Quantifies the economics and shows how sensitive they are.",
    sections: ["Assumptions (each labelled and sourced)", "Revenue Build", "Cost Build (nine buckets)", "Unit Economics and Contribution Margin", "Break-Even Analysis", "P&L Summary", "Cash Flow and Runway", "Sensitivity on the Top Three Drivers", "Scenario Analysis (low / expected / high)"],
    mustContain: ["a separate assumptions sheet", "formulas, not hardcoded totals", "break-even volume AND break-even revenue", "a sensitivity table"],
  },
  assessment: {
    id: "assessment", label: "Assessment", bestFormat: "docx",
    purpose: "Judges readiness, exposure or fit against a defined standard.",
    sections: ["Executive Summary and Verdict", "Assessment Criteria", "Current State Against Each Criterion", "Gap Analysis", "Severity and Priority Ranking", "Remediation Plan with Cost and Owner", "Residual Risk After Remediation"],
    mustContain: ["a scored criterion-by-criterion table", "a clear overall verdict", "prioritised remediation"],
  },
  research: {
    id: "research", label: "Research report", bestFormat: "docx",
    purpose: "Establishes external facts a decision depends on.",
    sections: ["Executive Summary", "Scope and Method", "Market Size and Growth (TAM / SAM / SOM, calculation shown)", "Demand Drivers", "Competitive Landscape", "Pricing and Unit Economics Benchmarks", "Regulatory Environment", "Disconfirming Evidence", "Evidence Gaps and How to Close Them", "Sources"],
    mustContain: ["TAM/SAM/SOM with the derivation shown", "a named competitor set with pricing", "a disconfirming-evidence section", "a full source list with URLs and dates"],
  },
  decision_memo: {
    id: "decision_memo", label: "Decision memo", bestFormat: "docx",
    purpose: "Puts one decision in front of a decision-maker, with a recommendation.",
    sections: ["The Decision Required", "Recommendation", "Why (three reasons, strongest first)", "Options Considered and Rejected", "Financial Impact", "Risks and What Would Change This Recommendation", "Cost of Delay", "Decision Requested, Owner and Date"],
    mustContain: ["one sentence stating the decision", "a cost of inaction per week or month", "the condition that would reverse the recommendation"],
  },
  roadmap: {
    id: "roadmap", label: "Roadmap", bestFormat: "pptx",
    purpose: "Sequences work over time and shows dependencies.",
    sections: ["Executive Summary", "Objectives by Horizon", "Now (0-90 days)", "Next (3-12 months)", "Later (1-3 years)", "Dependencies and Critical Path", "Resource and Cost by Phase", "Milestones and Gate Criteria", "Risks to the Sequence"],
    mustContain: ["three time horizons", "explicit dependencies", "gate criteria between phases"],
  },
  framework: {
    id: "framework", label: "Framework", bestFormat: "docx",
    purpose: "Defines a repeatable structure others will apply.",
    sections: ["Purpose and Scope", "Principles", "The Framework (each component defined)", "How to Apply It (worked example)", "Roles and Responsibilities (RACI)", "Governance and Review Cycle", "Templates and Artefacts"],
    mustContain: ["a worked example", "a RACI table", "a defined review cadence"],
  },
  procedure: {
    id: "procedure", label: "Procedure / SOP", bestFormat: "docx",
    purpose: "Tells someone exactly how to perform a task correctly.",
    sections: ["Purpose and Scope", "Roles and Responsibilities", "Prerequisites", "Procedure (numbered steps)", "Quality Checks and Acceptance Criteria", "Exception Handling", "Records and Retention", "Review Schedule"],
    mustContain: ["numbered, actionable steps", "acceptance criteria per step", "an exception path"],
  },
  register: {
    id: "register", label: "Register / log", bestFormat: "xlsx",
    purpose: "Tracks a set of items with status, owner and action.",
    sections: ["Purpose and Scoring Method", "The Register (full table)", "Top Items by Severity", "Mitigation Actions and Owners", "Review Cadence"],
    mustContain: ["a scored table with likelihood and impact", "an owner per row", "a next review date"],
  },
  review: {
    id: "review", label: "Performance review", bestFormat: "pptx",
    purpose: "Reports performance against plan and says what to change.",
    sections: ["Headline Performance", "Performance Against Plan (variance table)", "What Drove the Variance", "What Is Working", "What Is Not Working", "Corrective Actions with Owners", "Outlook and Revised Forecast"],
    mustContain: ["a budget-versus-actual variance table", "root cause for each material variance", "corrective actions with owners"],
  },
  profile: {
    id: "profile", label: "Profile", bestFormat: "docx",
    purpose: "Presents an entity clearly to an external reader.",
    sections: ["At a Glance", "What the Business Does", "Market and Customers", "Business Model and Economics", "Team and Structure", "Track Record", "Strategic Direction"],
    mustContain: ["a one-line description a stranger would understand", "concrete metrics"],
  },
  canvas: {
    id: "canvas", label: "Canvas", bestFormat: "pptx",
    purpose: "Captures a whole business model on one page.",
    sections: ["Customer Segments", "Value Proposition", "Channels", "Customer Relationships", "Revenue Streams", "Key Resources", "Key Activities", "Key Partners", "Cost Structure"],
    mustContain: ["all nine blocks populated", "no empty block left as a placeholder"],
  },
  spec: {
    id: "spec", label: "Specification", bestFormat: "docx",
    purpose: "Defines what must be built, precisely enough to build it.",
    sections: ["Problem and Objective", "Users and Use Cases", "Requirements (functional)", "Requirements (non-functional)", "Out of Scope", "Acceptance Criteria", "Dependencies and Assumptions", "Open Questions"],
    mustContain: ["explicit out-of-scope section", "testable acceptance criteria"],
  },
  board_paper: {
    id: "board_paper", label: "Board paper", bestFormat: "pdf",
    purpose: "Gives a board what it needs to govern and decide.",
    sections: ["Purpose of This Paper", "Recommendation and Decision Sought", "Background", "Key Numbers", "Risks and Governance Considerations", "Options and Trade-offs", "Financial Impact", "Resolution Proposed"],
    mustContain: ["a formally worded resolution", "fiduciary and governance framing", "the decision sought stated in one sentence"],
  },
};

// ── CATALOGUE ────────────────────────────────────────────────────────────────
// Document name -> archetype. Adding a document is one line.
export const CATALOGUE: Record<string, ArchetypeId> = {};
const reg = (a: ArchetypeId, names: string[]) => names.forEach(n => { CATALOGUE[n.toLowerCase()] = a; });

reg("plan", ["business plan","strategic plan","annual operating plan","aop","operations plan","implementation plan","expansion plan","international expansion plan","export plan","import plan","import-export business plan","launch plan","product launch plan","marketing plan","sales plan","hiring plan","recruitment plan","workforce plan","headcount plan","resource plan","capacity plan","procurement plan","logistics plan","project plan","fundraising plan","business continuity plan","disaster recovery plan","crisis management plan","cost reduction plan","risk management plan","risk mitigation plan","change management plan","cutover plan","succession plan","learning and development plan","employee engagement plan","content calendar","demand generation plan","account plan","territory plan","customer acquisition plan","trade finance plan","financial plan","capital allocation plan","contract management plan","experiment plan","r&d plan","internal audit plan","30-60-90 day plan"]);
reg("strategy", ["business strategy","growth strategy","market entry strategy","country entry strategy","go-to-market strategy","gtm strategy","sales strategy","marketing strategy","brand strategy","content strategy","seo strategy","social media strategy","channel strategy","partnership strategy","product strategy","innovation strategy","it strategy","data strategy","ai strategy","cybersecurity strategy","digital transformation strategy","ai transformation strategy","talent strategy","workforce strategy","procurement strategy","sourcing strategy","category strategy","global sourcing strategy","distributor strategy","customer acquisition strategy","key account strategy","lead generation strategy","corporate objectives","strategic priorities","vision and mission statement","cross-sell strategy","upsell strategy","revenue growth plan","strategic alternatives assessment"]);
reg("analysis", ["cost analysis","cost-benefit analysis","pricing analysis","competitor analysis","competitive analysis","competitive marketing analysis","swot analysis","pestle analysis","porter's five forces analysis","value chain analysis","trend analysis","productivity analysis","working capital analysis","investment analysis","roi analysis","npv analysis","irr analysis","sensitivity analysis","scenario analysis","what-if analysis","trade-off analysis","root cause analysis","options analysis","decision analysis","supply chain analysis","inventory analysis","sales pipeline analysis","marketing roi report","procurement savings analysis","make-or-buy analysis","landed cost analysis","tariff analysis","workforce cost analysis","compensation analysis","risk-reward analysis","business impact assessment","product portfolio analysis"]);
reg("financial_model", ["financial model","3-statement financial model","investor financial model","financial forecast","revenue forecast","sales forecast","demand forecast","cash flow forecast","cash flow statement","income statement","p&l","profit and loss","balance sheet","annual budget","marketing budget","break-even analysis","unit economics","contribution margin analysis","pricing model","international pricing model","financial scenario analysis","cash runway analysis","funding requirement","investment requirement","management accounts","cfo report","monthly business review","mbr","sales compensation plan","3-year forecast","5-year forecast"]);
reg("assessment", ["business health assessment","operational readiness assessment","product-market fit assessment","technology assessment","vendor technology assessment","supplier assessment","vendor evaluation","supplier risk assessment","compliance assessment","regulatory impact assessment","privacy impact assessment","information security assessment","cybersecurity risk assessment","operational risk assessment","enterprise risk assessment","country risk assessment","foreign exchange risk assessment","market entry assessment","geographic market assessment","market opportunity assessment","opportunity assessment","international market assessment","trade compliance assessment","contract risk assessment","legal due diligence","financial due diligence","product lifecycle assessment","stakeholder analysis","skills matrix"]);
reg("research", ["market research report","industry analysis","market sizing report","tam / sam / som analysis","tam sam som","customer segmentation","customer persona","customer journey map","voice of customer report","competitive intelligence report","competitive intelligence brief","intelligence brief","market analysis"]);
reg("decision_memo", ["decision memo","executive decision memo","decision brief","recommendation paper","executive recommendation","business case","project business case","product business case","technology business case","investment thesis","problem statement","decision log"]);
reg("roadmap", ["product roadmap","technology roadmap","transformation roadmap","digital transformation roadmap","ai adoption roadmap","innovation roadmap","project roadmap","growth roadmap","implementation roadmap","3-year strategic plan","5-year strategic plan"]);
reg("framework", ["competency framework","performance management framework","governance framework","corporate governance report","compliance framework","internal control framework","data governance framework","lead qualification framework","service delivery model","operating model","target operating model","tom","it operating model","organizational design","organizational structure","business structure","enterprise architecture","system architecture","solution architecture"]);
reg("procedure", ["standard operating procedure","sop","operating procedures","process documentation","process map","workflow design","process improvement plan","continuous improvement plan","lean improvement plan","six sigma improvement plan","service level agreement","sla","demand planning","job description"]);
reg("register", ["risk register","raid log","issue log","assumption register","evidence register","supplier scorecard","dependency map","work breakdown structure","wbs","project schedule","organization chart","hr dashboard","executive dashboard","people report"]);
reg("review", ["performance review","quarterly business review","qbr","annual business review","strategic initiative review","post-implementation review","benefits realization report","project status report","sales performance report","enterprise performance report","audit report","contract review","management briefing","ceo weekly report"]);
reg("profile", ["company profile","corporate profile"]);
reg("canvas", ["business model canvas","business model"]);
reg("spec", ["product requirements document","prd","requirements document","feature specification","project scope","project charter","mvp definition","campaign brief","rfp","rfq"]);
reg("board_paper", ["board paper","board pack","board meeting agenda","board meeting minutes","ceo executive brief","executive summary","executive brief","executive risk report","internal audit plan report"]);

// ── INTENT BUNDLES ───────────────────────────────────────────────────────────
// The user should not have to know a document's name. A goal becomes a bundle.
export const INTENT_BUNDLES: Array<{ match: RegExp; label: string; documents: string[] }> = [
  { match: /\b(expand|enter|entry|launch)\b.{0,40}\b(into|in|to)\b.{0,30}\b(uae|dubai|usa|us|uk|europe|singapore|africa|market|country|abroad|overseas|international)\b/i,
    label: "Entering a new market",
    documents: ["Market Research Report","Competitor Analysis","TAM / SAM / SOM Analysis","PESTLE Analysis","Country Risk Assessment","Market Entry Strategy","Operating Model","Financial Model","Investment Requirement","Implementation Roadmap","Risk Register","Executive Decision Memo"] },
  { match: /\b(raise|raising|fundrais\w*|seed|series a|investor|pitch)\b/i,
    label: "Raising capital",
    documents: ["Investment Thesis","Business Plan","3-Statement Financial Model","Unit Economics","Market Sizing Report","Competitor Analysis","Cash Runway Analysis","Funding Requirement","Risk Register","Board Paper"] },
  { match: /\b(start|starting|set ?up|setting up|new business|from scratch|found)\b/i,
    label: "Starting a business",
    documents: ["Business Model Canvas","Market Research Report","Business Plan","Financial Model","Break-Even Analysis","Go-to-Market Strategy","Operating Model","Hiring Plan","Risk Register"] },
  { match: /\b(cut|reduce|reduction|save|saving)\b.{0,20}\b(cost|costs|spend|burn)\b/i,
    label: "Reducing cost",
    documents: ["Cost Analysis","Cost Reduction Plan","Unit Economics","Procurement Savings Analysis","Workforce Cost Analysis","Scenario Analysis","Executive Decision Memo"] },
  { match: /\b(launch\w*)\b.{0,30}\b(product|service|feature|app)\b/i,
    label: "Launching a product",
    documents: ["Product Requirements Document","Product-Market Fit Assessment","Go-to-Market Plan","Pricing Model","Product Launch Plan","Marketing Campaign Plan","Financial Model","Risk Register"] },
  { match: /\b(import|export|shipping|customs|tariff|cross-border)\b/i,
    label: "Import / export",
    documents: ["International Market Assessment","Trade Compliance Assessment","Tariff Analysis","Landed Cost Analysis","International Pricing Model","Distributor Strategy","Foreign Exchange Risk Assessment","Import-Export Business Plan"] },
  { match: /\b(hire|hiring|recruit\w*|team|headcount|staff)\b/i,
    label: "Building the team",
    documents: ["Workforce Plan","Organizational Design","Hiring Plan","Job Description","Competency Framework","Compensation Analysis","Workforce Cost Analysis"] },
];

// ── DETECTION ────────────────────────────────────────────────────────────────
export type DocumentRequest = {
  matched: boolean;
  documentName: string;
  archetype: Archetype | null;
  bundleLabel: string;
  bundle: string[];
};

export function detectDocumentRequest(question: string): DocumentRequest {
  const q = String(question || "").toLowerCase();
  const empty: DocumentRequest = { matched: false, documentName: "", archetype: null, bundleLabel: "", bundle: [] };
  if (!q.trim()) return empty;

  // Longest name first, so "business model canvas" beats "business model".
  const names = Object.keys(CATALOGUE).sort((a, b) => b.length - a.length);
  const hit = names.find(n => q.includes(n));

  let bundleLabel = "", bundle: string[] = [];
  const b = INTENT_BUNDLES.find(x => x.match.test(q));
  if (b) { bundleLabel = b.label; bundle = b.documents; }

  if (!hit) {
    // No document named, but the goal implies one: lead with the bundle's first item.
    if (bundle.length) {
      const lead = bundle[0].toLowerCase();
      return { matched: true, documentName: bundle[0], archetype: ARCHETYPES[CATALOGUE[lead] || "analysis"], bundleLabel, bundle };
    }
    return empty;
  }
  const proper = hit.replace(/\b\w/g, c => c.toUpperCase());
  return { matched: true, documentName: proper, archetype: ARCHETYPES[CATALOGUE[hit]], bundleLabel, bundle };
}

// ── PROMPT BUILDERS ──────────────────────────────────────────────────────────

/** Tells each executive what document is being built and which part is theirs. */
export function buildDocumentBrief(req: DocumentRequest): string {
  if (!req.matched || !req.archetype) return "";
  const a = req.archetype;
  const lines: string[] = [];
  lines.push("DELIVERABLE BEING PRODUCED: " + req.documentName + "  (" + a.label + ")");
  lines.push("Purpose of this document: " + a.purpose);
  lines.push("");
  lines.push("REQUIRED STRUCTURE — the final document must contain these sections, in this order:");
  a.sections.forEach((s, i) => lines.push("  " + (i + 1) + ". " + s));
  lines.push("");
  lines.push("THIS DOCUMENT IS NOT COMPLETE WITHOUT: " + a.mustContain.join("; ") + ".");
  lines.push("Best output format for this document type: " + a.bestFormat.toUpperCase() + ".");
  if (req.bundle.length) {
    lines.push("");
    lines.push("The user's underlying goal is: " + req.bundleLabel + ". A complete answer normally needs: " + req.bundle.join(", ") + ".");
    lines.push("Produce the document named above now, and note in one line which of the others the user should commission next and why.");
  }
  lines.push("");
  lines.push("YOUR PART: contribute only the sections your mandate covers, written to final quality — not notes toward a section. The Chairman assembles the document from what every executive contributes, so write your part as if it will be pasted straight in.");
  lines.push("");
  lines.push(CONSULTING_STANDARD);
  return lines.join("\n");
}

/** Replaces the Chairman's generic debate summary with the document's own structure. */
export function buildSynthesisOverride(req: DocumentRequest, currencySymbol: string): string {
  if (!req.matched || !req.archetype) return "";
  const a = req.archetype;
  const lines: string[] = [];
  lines.push("OUTPUT OVERRIDE — you are NOT writing a debate summary. You are assembling a finished " + req.documentName + ".");
  lines.push("Use EXACTLY these sections as your markdown headings, in this order, and nothing else:");
  a.sections.forEach(s => lines.push("## " + s));
  lines.push("");
  lines.push("Assembly rules:");
  lines.push("- Take the best material from each executive. Do not summarise their debate; USE their content.");
  lines.push("- Where two executives gave different figures for the same thing, choose one, state it, and note the other in brackets with your reason.");
  lines.push("- Where a required section had no executive input, write the section and state plainly what is missing and how to obtain it. Never leave a heading empty.");
  lines.push("- All figures in " + currencySymbol + ", with Indian lakh/crore convention where the currency is INR.");
  lines.push("- This document is not complete without: " + a.mustContain.join("; ") + ".");
  lines.push("");
  lines.push(CONSULTING_STANDARD);
  return lines.join("\n");
}

/** Suggests the format buttons to surface for a detected document. */
export function suggestedFormats(req: DocumentRequest): string[] {
  if (!req.matched || !req.archetype) return ["docx", "pdf"];
  const b = req.archetype.bestFormat;
  const all = ["docx", "xlsx", "pptx", "pdf"];
  return [b, ...all.filter(f => f !== b)];
}

/** Total documents recognised — used in the UI so the user knows the coverage. */
export function catalogueSize(): number { return Object.keys(CATALOGUE).length; }
