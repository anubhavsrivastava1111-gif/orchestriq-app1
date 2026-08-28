// ─────────────────────────────────────────────────────────────────────────────
// DocumentIntelligence.ts — OrchestrIQ Document Intelligence Layer
//
// WHY THIS FILE EXISTS
//
// Documents were being generated from a fraction of the workspace. Three
// independent faults compounded:
//
//   1. LOSS AT THE SOURCE. gatherWorkspace() kept only the LAST assistant reply
//      per executive (1,200 chars). Your questions and every earlier reply were
//      discarded. A 40,000-character CFO conversation reached the generator as
//      1,200 characters — 3% retention.
//
//   2. A FIELD-NAME MISMATCH. Boardroom synthesis is stored at
//      session.stages[].synthesis, but was read as session.synthesis — which
//      does not exist. Every export received the literal string "Synthesis: "
//      followed by nothing. The debate, the Chairman's arbitration, the
//      research brief and the decision status were all present in memory and
//      all thrown away.
//
//   3. A HARD CEILING. Whatever survived was then cut with .slice(0, 8000).
//      8,000 characters is about three pages. The model was asked to write a
//      twenty-page investor report from three pages of input.
//
// The model was not hallucinating. It was filling a vacuum the pipeline created.
//
// THE PRINCIPLE HERE: never shorten by CUTTING; shorten by EXTRACTING.
// Cutting deletes the end of the evidence. Extraction reads all of it and keeps
// what matters. Same output size, completely different fidelity.
//
// This module owns four things:
//   A. AUDIENCE_SPECS   — what each reader actually needs (not a bare label)
//   B. DOC_PURPOSE_SPECS— what each document type must contain
//   C. FORMAT_DOCTRINE  — how a deck differs from a report differs from a model
//   D. The pipeline     — assemble → extract → brief → audit
// ─────────────────────────────────────────────────────────────────────────────

export type AudienceId =
  | "investor" | "board" | "ceo" | "cfo" | "operations"
  | "client" | "regulator" | "internal_team" | "lender" | "general";

export type FormatId = "pdf" | "pptx" | "docx" | "xlsx";

export interface AudienceSpec {
  id: AudienceId;
  label: string;
  /** Who is reading, and the decision they must make. */
  reader: string;
  /** What they will look for first. Drives ordering. */
  opensWith: string;
  /** Must be present or the document fails for this reader. */
  mustInclude: string[];
  /** Actively wrong for this reader. */
  mustAvoid: string[];
  /** How much prior knowledge to assume. */
  assumedKnowledge: string;
  tone: string;
  /** Level of numeric proof this reader demands. */
  evidenceBar: "directional" | "defensible" | "auditable";
}

// ─── A. AUDIENCE SPECIFICATIONS ──────────────────────────────────────────────
// A bare label ("investor") tells the model nothing. These tell it everything.
export const AUDIENCE_SPECS: Record<AudienceId, AudienceSpec> = {
  investor: {
    id: "investor", label: "Investor / VC",
    reader: "An investor deciding whether to put money in, and at what valuation.",
    opensWith: "The size of the opportunity and why this team wins it.",
    mustInclude: [
      "Market size with the basis of the estimate stated",
      "The specific problem and who currently pays to solve it",
      "Traction: real numbers, or an explicit statement that there are none yet",
      "Unit economics — CAC, LTV, gross margin, payback period",
      "Why this team, and why now",
      "Use of funds tied to named milestones",
      "The competitive moat, stated honestly",
      "Key risks with mitigations — omitting risk destroys credibility",
    ],
    mustAvoid: [
      "Internal process detail, org charts, task lists",
      "Unsourced hockey-stick projections",
      "Feature lists in place of a business case",
    ],
    assumedKnowledge: "Fluent in business and finance. Knows nothing about your company.",
    tone: "Confident, evidence-led, commercially honest. Ambition anchored in numbers.",
    evidenceBar: "defensible",
  },
  board: {
    id: "board", label: "Board of Directors",
    reader: "Directors exercising oversight and approving or rejecting a course of action.",
    opensWith: "The decision required of them, stated in one sentence.",
    mustInclude: [
      "The decision requested, and the mandate or authority it needs",
      "Options considered, with the reason each was kept or rejected",
      "Financial impact, with the assumptions visible",
      "Risk register with owners and mitigations",
      "What management recommends, and why",
      "Dissenting views where they exist — a board must see the disagreement",
    ],
    mustAvoid: ["Operational minutiae", "Recommendations with no stated alternative"],
    assumedKnowledge: "Knows the company and the sector. Not close to day-to-day detail.",
    tone: "Formal, balanced, decision-oriented. Surfaces disagreement rather than smoothing it.",
    evidenceBar: "defensible",
  },
  ceo: {
    id: "ceo", label: "CEO / Founder",
    reader: "The person who must choose and then be accountable for the choice.",
    opensWith: "The recommendation and the single biggest risk to it.",
    mustInclude: [
      "A clear recommendation, not a menu",
      "The trade-off being accepted",
      "Resource and cash implications",
      "What must be true for this to work",
      "First three actions and who owns each",
    ],
    mustAvoid: ["Hedging without a position", "Analysis with no 'so what'"],
    assumedKnowledge: "Deep company knowledge. Extremely time-constrained.",
    tone: "Direct, compressed, opinionated. Says the thing.",
    evidenceBar: "defensible",
  },
  cfo: {
    id: "cfo", label: "CFO / Finance",
    reader: "A finance professional who will test every number before accepting it.",
    opensWith: "The numbers, and the assumptions underneath them.",
    mustInclude: [
      "Every assumption stated explicitly and separated from results",
      "Working shown — derivation, not just the answer",
      "Sensitivity on the two or three variables that matter most",
      "Cash impact and timing, not just P&L impact",
      "Base, upside and downside cases",
      "Data provenance — which figures are actual, which estimated",
    ],
    mustAvoid: ["Rounded numbers with no basis", "Blending actuals and forecasts without labelling"],
    assumedKnowledge: "Expert. Will find any weakness in the arithmetic.",
    tone: "Precise, conservative, fully auditable.",
    evidenceBar: "auditable",
  },
  operations: {
    id: "operations", label: "Operations Team",
    reader: "The people who have to execute this on Monday morning.",
    opensWith: "What changes for them, specifically.",
    mustInclude: [
      "Concrete steps in sequence",
      "Owner for every step",
      "Dates or durations",
      "Dependencies and blockers",
      "Definition of done for each step",
      "Escalation path when something fails",
    ],
    mustAvoid: ["Strategic abstraction", "Recommendations with no owner or date"],
    assumedKnowledge: "Knows the process intimately. Does not need the strategic rationale re-explained.",
    tone: "Plain, instructional, unambiguous. Written to be followed, not admired.",
    evidenceBar: "directional",
  },
  client: {
    id: "client", label: "Client / Customer",
    reader: "A paying client judging whether this was worth what they paid.",
    opensWith: "Their problem, restated accurately enough that they feel understood.",
    mustInclude: [
      "The brief as they gave it",
      "What was examined and how",
      "Findings, separated from recommendations",
      "Recommendations with expected impact",
      "What happens next and what is needed from them",
    ],
    mustAvoid: ["Internal jargon", "Your costs or margins", "Unhedged claims you cannot support"],
    assumedKnowledge: "Expert in their own business, not in your method.",
    tone: "Professional, clear, quietly authoritative. No internal shorthand.",
    evidenceBar: "defensible",
  },
  regulator: {
    id: "regulator", label: "Regulator / Auditor",
    reader: "An examiner testing compliance and the integrity of the record.",
    opensWith: "Scope, period covered, and basis of preparation.",
    mustInclude: [
      "Scope and period, stated at the top",
      "Basis of preparation and standards applied",
      "Source for every figure",
      "Exceptions and how each was treated",
      "Sign-off and date",
    ],
    mustAvoid: ["Persuasive framing", "Any unsourced figure", "Selective presentation"],
    assumedKnowledge: "Expert in the rules. Assumes nothing about you.",
    tone: "Neutral, complete, traceable. Never advocacy.",
    evidenceBar: "auditable",
  },
  internal_team: {
    id: "internal_team", label: "Internal Team",
    reader: "Colleagues who need shared context to act consistently.",
    opensWith: "The context and what has been decided.",
    mustInclude: ["Background", "What was decided and why", "What it means per function", "Open questions", "Who to ask"],
    mustAvoid: ["External polish at the cost of candour"],
    assumedKnowledge: "Knows the company; may not know this workstream.",
    tone: "Candid, collaborative, practical.",
    evidenceBar: "directional",
  },
  lender: {
    id: "lender", label: "Bank / Lender",
    reader: "A credit officer assessing whether you can service debt.",
    opensWith: "Cash generation and the ability to repay.",
    mustInclude: [
      "Historical financials, actuals clearly labelled",
      "Cash flow and debt service coverage",
      "Collateral and security",
      "Downside case — what happens if revenue falls",
      "Existing obligations",
    ],
    mustAvoid: ["Growth narrative without cash proof", "Optimism unsupported by history"],
    assumedKnowledge: "Credit expert. Sceptical by profession.",
    tone: "Conservative, cash-focused, evidence-first.",
    evidenceBar: "auditable",
  },
  general: {
    id: "general", label: "General / Mixed",
    reader: "A mixed or unspecified audience.",
    opensWith: "A summary that works for a non-specialist.",
    mustInclude: ["Executive summary", "Key findings", "Recommendations", "Next steps"],
    mustAvoid: ["Undefined jargon"],
    assumedKnowledge: "Varies. Define terms on first use.",
    tone: "Clear, professional, accessible.",
    evidenceBar: "defensible",
  },
};

// ─── B. DOCUMENT PURPOSE SPECIFICATIONS ──────────────────────────────────────
export interface DocPurposeSpec {
  id: string;
  label: string;
  /** The job the document does. */
  job: string;
  /** Required sections in order. The generator may not silently drop these. */
  spine: string[];
  /** Default audience when the user has not chosen one. */
  defaultAudience: AudienceId;
  /** Target length guidance. */
  depth: "brief" | "standard" | "comprehensive";
}

export const DOC_PURPOSE_SPECS: Record<string, DocPurposeSpec> = {
  summary: {
    id: "summary", label: "Executive Summary", depth: "brief", defaultAudience: "ceo",
    job: "Let a busy decision-maker grasp the situation and the ask in two minutes.",
    spine: ["Situation", "Key Findings", "Recommendation", "Next Steps"],
  },
  detailed: {
    id: "detailed", label: "Detailed Report", depth: "comprehensive", defaultAudience: "internal_team",
    job: "Provide the complete record of analysis so conclusions can be independently checked.",
    spine: ["Executive Summary", "Background & Scope", "Methodology", "Analysis",
            "Findings", "Risks & Limitations", "Recommendations", "Appendix: Supporting Detail"],
  },
  executive: {
    id: "executive", label: "Executive / Board Report", depth: "standard", defaultAudience: "board",
    job: "Give a board what it needs to approve, reject, or defer a decision.",
    spine: ["Decision Required", "Executive Summary", "Situation Analysis", "Options Considered",
            "Financial Impact", "Risk Assessment", "Recommendation", "Implementation Plan"],
  },
  investor: {
    id: "investor", label: "Investor Report", depth: "comprehensive", defaultAudience: "investor",
    job: "Give an investor enough to form a view on the opportunity and the risk.",
    spine: ["Executive Summary", "The Opportunity", "Business Model", "Traction & Metrics",
            "Market Analysis", "Competitive Position", "Financial Performance & Projections",
            "Unit Economics", "Team", "Risks & Mitigations", "Use of Funds", "The Ask"],
  },
  project: {
    id: "project", label: "Project Report", depth: "comprehensive", defaultAudience: "internal_team",
    job: "Record what was undertaken, what happened, and what should follow.",
    spine: ["Project Overview", "Objectives & Scope", "Approach", "Work Completed",
            "Results & Analysis", "Issues Encountered", "Financials", "Conclusions", "Next Phase"],
  },
  research: {
    id: "research", label: "Research Report", depth: "comprehensive", defaultAudience: "internal_team",
    job: "Present an investigation so the reader can judge the strength of the evidence.",
    spine: ["Abstract", "Research Question", "Methodology", "Evidence Base",
            "Findings", "Analysis & Interpretation", "Limitations", "Conclusions", "Sources"],
  },
  financial: {
    id: "financial", label: "Financial Report", depth: "comprehensive", defaultAudience: "cfo",
    job: "Present financial position and performance so every figure can be traced.",
    spine: ["Basis of Preparation", "Executive Summary", "Financial Position", "Performance",
            "Cash Flow & Working Capital", "Key Ratios", "Assumptions Register",
            "Sensitivity Analysis", "Notes & Provenance"],
  },
  operational: {
    id: "operational", label: "Operational Review", depth: "standard", defaultAudience: "operations",
    job: "Show how the operation is performing and what must change.",
    spine: ["Scope & Period", "Performance Against Target", "Process Analysis",
            "Bottlenecks & Root Causes", "Corrective Actions", "Owners & Timeline"],
  },
  briefing: {
    id: "briefing", label: "Executive Briefing", depth: "brief", defaultAudience: "ceo",
    job: "Bring a senior leader up to speed fast enough to act.",
    spine: ["Bottom Line", "Context", "Key Points", "Implications", "Recommended Action"],
  },
  strategy: {
    id: "strategy", label: "Business Strategy", depth: "standard", defaultAudience: "board",
    job: "Set out where to play, how to win, and what it takes.",
    spine: ["Strategic Context", "Where We Are", "Where We Play", "How We Win",
            "Capabilities Required", "Financial Case", "Risks", "Roadmap"],
  },
  pitch: {
    id: "pitch", label: "Startup Pitch", depth: "brief", defaultAudience: "investor",
    job: "Earn the next meeting.",
    spine: ["Problem", "Solution", "Market", "Product", "Traction", "Business Model",
            "Competition", "Team", "Financials", "The Ask"],
  },
  roadmap: {
    id: "roadmap", label: "Product Roadmap", depth: "standard", defaultAudience: "internal_team",
    job: "Align everyone on what ships, when, and why.",
    spine: ["Vision", "Current State", "Themes & Priorities", "Timeline & Phases",
            "Dependencies", "Resourcing", "Success Metrics"],
  },
};

// ─── C. FORMAT DOCTRINE ──────────────────────────────────────────────────────
// The single most common failure is treating a deck and a report as the same
// content in different wrappers. They are different artefacts with different
// jobs. A slide is a visual argument; a report page is a written one.
export interface FormatDoctrine {
  id: FormatId;
  role: string;
  rules: string[];
  densityRule: string;
}

export const FORMAT_DOCTRINE: Record<FormatId, FormatDoctrine> = {
  pptx: {
    id: "pptx",
    role: "PERSUASION AND RECALL. A deck is presented, usually with someone talking " +
          "over it. It must be understood in the seconds the audience looks up.",
    densityRule:
      "Maximum 6 bullets per slide, maximum 12 words per bullet. If a point needs a " +
      "paragraph, it is not a slide — it is a speaker note. Never paste report prose " +
      "onto a slide.",
    rules: [
      "Every slide title states the CONCLUSION, not the topic. Not 'Q3 Revenue' but " +
      "'Q3 revenue grew 34%, ahead of plan'. The title carries the argument.",
      "One idea per slide. If a slide has two ideas, it is two slides.",
      "Prefer a table or chart to a bullet list wherever the data is comparative.",
      "Numbers are the message: put the number in the title or make it visually dominant.",
      "The deck must tell one continuous story: each slide should follow from the last.",
      "Detail that does not fit belongs in speaker notes or an appendix slide, never crammed in.",
      "Open with the answer. Executives decide in the first three slides.",
    ],
  },
  pdf: {
    id: "pdf",
    role: "THE COMPLETE, CITABLE RECORD. A PDF is read alone, without a presenter. " +
          "It must answer the questions the reader will have, because nobody is there to ask.",
    densityRule:
      "Full prose. Complete sentences and developed paragraphs. This is the format " +
      "that carries the entire body of evidence — do not compress it into bullets.",
    rules: [
      "Must stand entirely on its own. No reliance on a presenter or prior context.",
      "Every claim traceable: state where each figure came from.",
      "Executive summary first, then progressive depth, so a reader can stop at any point.",
      "Tables carry the data; prose carries the interpretation. Never a table with no reading of it.",
      "Assumptions stated explicitly and separated from conclusions.",
      "This is the format where completeness beats brevity. Include the supporting detail.",
      "Section headings must be navigable — a reader should find any topic in seconds.",
    ],
  },
  docx: {
    id: "docx",
    role: "THE WORKING AND CIRCULATING DOCUMENT. A Word file gets edited, commented on, " +
          "and passed around. Structure must survive other people's changes.",
    densityRule:
      "Full prose with clean, consistent heading hierarchy so navigation and " +
      "tables of contents work correctly.",
    rules: [
      "Strict heading hierarchy — never skip a level.",
      "Self-contained sections: each should make sense if extracted.",
      "Explicit placeholders where the recipient must supply something.",
      "Consistent terminology throughout — this document will be edited by others.",
      "Tables formatted for editing, not just for display.",
    ],
  },
  xlsx: {
    id: "xlsx",
    role: "THE CALCULATION AND INTERROGATION TOOL. A spreadsheet exists to be changed. " +
          "If the reader cannot alter an input and see results move, it has failed.",
    densityRule:
      "Data and formulas, not prose. Every derived cell must be a live formula, never " +
      "a typed-in result.",
    rules: [
      "Inputs, calculations and outputs on separate, clearly labelled sheets or blocks.",
      "Every assumption is a single named input cell, referenced everywhere else. Never hardcode a number twice.",
      "Derived cells must contain formulas. A hardcoded result is a defect.",
      "Colour convention: inputs blue, formulas black, links green.",
      "A summary sheet that answers the question without scrolling.",
      "Sensitivity or scenario switching where the decision depends on assumptions.",
    ],
  },
};

// ─── D. THE PIPELINE ─────────────────────────────────────────────────────────

export interface SourceRecord {
  module: string;
  label: string;
  content: string;
  /** Higher = more likely to be a conclusion worth preserving verbatim. */
  weight: number;
}

export interface EvidenceLedger {
  facts: string[];
  figures: string[];
  decisions: string[];
  risks: string[];
  assumptions: string[];
  openQuestions: string[];
  sourcesSeen: string[];
  charsIngested: number;
  charsRetained: number;
}

const EMPTY_LEDGER = (): EvidenceLedger => ({
  facts: [], figures: [], decisions: [], risks: [],
  assumptions: [], openQuestions: [], sourcesSeen: [],
  charsIngested: 0, charsRetained: 0,
});

/**
 * STAGE 1 — LOSSLESS ASSEMBLY.
 * Reads the FULL conversation, not the last reply. Reads the correct Boardroom
 * path (stages[].synthesis and stages[].debate), which the old code missed.
 */
export function assembleCorpus(src: {
  co?: any; compData?: any; chats?: any; brSessions?: any[];
  workflows?: any[]; tQueue?: any[]; ledgerSnapshot?: string;
  timeMachine?: string; autopilot?: string;
  roles?: Array<{ id: string; t: string }>;
  include?: { chats?: boolean; boardroom?: boolean; workflows?: boolean; tasks?: boolean; timeMachine?: boolean; autopilot?: boolean };
  strip?: (s: string) => string;
}): SourceRecord[] {
  const out: SourceRecord[] = [];
  const strip = src.strip || ((s: string) => s);
  const inc = src.include || {};
  const roles = src.roles || [];

  if (src.co) {
    out.push({
      module: "Company", label: "Company Profile", weight: 9,
      content: ["Name: " + (src.co.name || ""), "Industry: " + (src.co.industry || ""),
                "Stage: " + (src.co.stage || ""), "Location: " + (src.co.location || ""),
                "Currency: " + (src.co.currency || "")].filter(l => l.split(": ")[1]).join("\n"),
    });
  }

  if (src.compData && Object.keys(src.compData).length) {
    out.push({
      module: "Data Hub", label: "Structured Company Data", weight: 10,
      content: Object.entries(src.compData).map(([k, v]) => k + ": " + v).join("\n"),
    });
  }

  if (src.ledgerSnapshot) {
    out.push({ module: "General Ledger", label: "Posted Entries (actuals)", weight: 10, content: src.ledgerSnapshot });
  }

  // BOARDROOM — reading the CORRECT path. The old code read session.synthesis,
  // which does not exist on the saved object, so every export got an empty
  // string. The synthesis is at stages[].synthesis, and the debate that
  // produced it is at stages[].debate. Both are kept in full.
  if (inc.boardroom && Array.isArray(src.brSessions)) {
    src.brSessions.forEach((s: any, i: number) => {
      const stages: any[] = Array.isArray(s?.stages) ? s.stages : [];
      const synth = stages.map(st => st?.synthesis || "").filter(Boolean).join("\n\n");
      const legacy = s?.synthesis || "";                    // older sessions
      const finalSynth = (synth || legacy || "").trim();
      const debate = stages.flatMap((st: any) => Array.isArray(st?.debate) ? st.debate : [])
        .map((d: any) => {
          const who = d?.role || d?.name || d?.agent || d?.executive || "Executive";
          const txt = d?.text || d?.content || d?.output || d?.response || "";
          return txt ? who + ": " + strip(String(txt)) : "";
        }).filter(Boolean).join("\n\n");
      const decision = stages.map(st => st?.decisionStatus).filter(Boolean).join(", ");
      const parts = [
        "QUESTION PUT TO THE BOARD: " + (s?.q || s?.question || ""),
        s?.researchBrief ? "RESEARCH BRIEF:\n" + strip(String(s.researchBrief)) : "",
        debate ? "EXECUTIVE DEBATE:\n" + debate : "",
        finalSynth ? "CHAIRMAN SYNTHESIS:\n" + strip(finalSynth) : "",
        decision ? "DECISION STATUS: " + decision : "",
      ].filter(Boolean);
      if (parts.length > 1) {
        out.push({ module: "AI Boardroom", label: "Session " + (i + 1) + ": " + String(s?.q || "").slice(0, 70), weight: 10, content: parts.join("\n\n") });
      }
    });
  }

  // EXECUTIVE CHAT — the FULL conversation, both sides. The old code kept only
  // the final assistant message and discarded the user's questions entirely,
  // which removed the framing that made the answers meaningful.
  if (inc.chats && src.chats) {
    Object.keys(src.chats).forEach(id => {
      const msgs = src.chats[id];
      if (!Array.isArray(msgs) || !msgs.length) return;
      const role = roles.find(r => r.id === id);
      const who = role?.t || id;
      const thread = msgs.map((m: any) => {
        const speaker = m?.role === "user" ? "USER ASKED" : who + " RESPONDED";
        const body = strip(String(m?.content || ""));
        return body ? speaker + ":\n" + body : "";
      }).filter(Boolean).join("\n\n");
      if (thread) out.push({ module: "Executive Chat", label: who + " (" + msgs.length + " messages)", weight: 9, content: thread });
    });
  }

  // WORKFLOWS — all steps, not just the last one.
  if (inc.workflows && Array.isArray(src.workflows)) {
    src.workflows.forEach((w: any) => {
      const steps = Array.isArray(w?.steps) ? w.steps : [];
      const body = steps.map((s: any) =>
        "LEVEL " + (s?.level ?? "?") + " — " + (s?.role?.t || "Step") + ":\n" + strip(String(s?.output || ""))
      ).filter(Boolean).join("\n\n");
      if (body) out.push({ module: "Workflow", label: (w?.chainLabel || "Workflow") + " — " + (w?.task || ""), weight: 8, content: body });
    });
  }

  if (inc.tasks && Array.isArray(src.tQueue)) {
    src.tQueue.filter((t: any) => t?.finalOutput).forEach((t: any) => {
      const steps = Array.isArray(t?.steps) ? t.steps : [];
      const body = [
        steps.map((s: any) => "LEVEL " + (s?.level ?? "?") + " — " + (s?.role?.t || "Step") + ":\n" + strip(String(s?.output || ""))).filter(Boolean).join("\n\n"),
        "FINAL OUTPUT:\n" + strip(String(t.finalOutput)),
      ].filter(Boolean).join("\n\n");
      out.push({ module: "Autopilot Task", label: (t?.chainLabel || "Task") + " — " + (t?.task || ""), weight: 8, content: body });
    });
  }

  if (inc.timeMachine && src.timeMachine) out.push({ module: "Time Machine", label: "Scenario Projection", weight: 8, content: strip(src.timeMachine) });
  if (inc.autopilot && src.autopilot) out.push({ module: "Decision Autopilot", label: "Decision Analysis", weight: 8, content: strip(src.autopilot) });

  return out.filter(r => r.content && r.content.trim().length > 20);
}

/**
 * STAGE 2 — EXTRACTION, NOT TRUNCATION.
 * When the corpus exceeds what one prompt can hold, we do NOT cut the end off.
 * We read it in chunks and extract the substance from every chunk, then merge.
 * Nothing is skipped; density goes up instead of coverage going down.
 */
export async function extractEvidence(
  sources: SourceRecord[],
  ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>,
  opts: { charBudget?: number; onProgress?: (m: string) => void } = {},
): Promise<EvidenceLedger> {
  const charBudget = opts.charBudget ?? 60000;
  const onProgress = opts.onProgress || (() => {});
  const ledger = EMPTY_LEDGER();
  ledger.sourcesSeen = sources.map(s => s.module + " — " + s.label);
  ledger.charsIngested = sources.reduce((n, s) => n + s.content.length, 0);

  // Under budget: everything travels verbatim, no extraction needed.
  if (ledger.charsIngested <= charBudget) {
    ledger.charsRetained = ledger.charsIngested;
    return ledger;
  }

  // Over budget: chunk on source boundaries so no single source is split
  // mid-argument, then extract from EVERY chunk.
  const chunks: SourceRecord[][] = [];
  let cur: SourceRecord[] = [];
  let curLen = 0;
  const CHUNK = 28000;
  for (const s of sources) {
    if (curLen + s.content.length > CHUNK && cur.length) { chunks.push(cur); cur = []; curLen = 0; }
    cur.push(s); curLen += s.content.length;
  }
  if (cur.length) chunks.push(cur);

  const EXTRACT_SYS =
    "You are an evidence extractor for a consulting-grade document pipeline.\n\n" +
    "You will be given part of a business workspace: executive conversations, boardroom\n" +
    "debates, financial records and analysis. Your ONLY job is to extract what a senior\n" +
    "consultant would refuse to lose when writing the final document.\n\n" +
    "RULES:\n" +
    "1. NEVER invent. Extract only what is present in the text.\n" +
    "2. Keep every figure exactly as written, with its unit and currency.\n" +
    "3. Preserve attribution: if the CFO said it, record that the CFO said it.\n" +
    "4. Preserve disagreement. If two executives differ, record BOTH positions.\n" +
    "5. Prefer specific over general. 'Runway is 14 months at current burn' beats 'runway is limited'.\n" +
    "6. If a section contains nothing for a category, return an empty array for it.\n\n" +
    "Return ONLY a JSON object, no markdown fence, no preamble:\n" +
    "{\n" +
    '  "facts": ["specific verifiable statements, with attribution"],\n' +
    '  "figures": ["every number with its label, unit and source"],\n' +
    '  "decisions": ["decisions taken or recommended, and by whom"],\n' +
    '  "risks": ["risks named, with any stated mitigation"],\n' +
    '  "assumptions": ["assumptions relied on, flagged as assumptions"],\n' +
    '  "openQuestions": ["questions raised and left unresolved"]\n' +
    "}";

  for (let i = 0; i < chunks.length; i++) {
    onProgress("📖 Reading source material " + (i + 1) + " of " + chunks.length + " — extracting evidence…");
    const body = chunks[i].map(s => "### " + s.module + " — " + s.label + "\n" + s.content).join("\n\n---\n\n");
    try {
      const raw = await ask(EXTRACT_SYS, [{ role: "user", content: body }], 3000);
      const text = typeof raw === "string" ? raw : (raw?.text || raw?.content?.[0]?.text || "");
      const cleaned = String(text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
      const j = JSON.parse(cleaned);
      (["facts", "figures", "decisions", "risks", "assumptions", "openQuestions"] as const).forEach(k => {
        if (Array.isArray(j[k])) ledger[k].push(...j[k].map((x: any) => String(x)).filter(Boolean));
      });
    } catch {
      // Extraction failed for this chunk. Rather than lose it silently, carry the
      // opening of each source through verbatim so it still reaches the writer.
      chunks[i].forEach(s => ledger.facts.push("[" + s.module + "] " + s.content.slice(0, 900)));
    }
  }

  const dedupe = (a: string[]) => Array.from(new Set(a.map(x => x.trim()).filter(Boolean)));
  (["facts", "figures", "decisions", "risks", "assumptions", "openQuestions"] as const)
    .forEach(k => { ledger[k] = dedupe(ledger[k]); });
  ledger.charsRetained = JSON.stringify(ledger).length;
  return ledger;
}

/** Render the ledger as text the writer model can consume. */
export function renderEvidence(l: EvidenceLedger): string {
  const sec = (t: string, a: string[]) => a.length ? "## " + t + "\n" + a.map(x => "- " + x).join("\n") : "";
  return [
    "# EVIDENCE LEDGER",
    "Assembled from: " + l.sourcesSeen.join("; "),
    sec("VERIFIED FACTS", l.facts),
    sec("FIGURES (use these exact numbers — do not round or invent)", l.figures),
    sec("DECISIONS TAKEN OR RECOMMENDED", l.decisions),
    sec("RISKS IDENTIFIED", l.risks),
    sec("ASSUMPTIONS RELIED ON", l.assumptions),
    sec("OPEN QUESTIONS", l.openQuestions),
  ].filter(Boolean).join("\n\n");
}

/**
 * STAGE 3 — THE GENERATION BRIEF.
 * One authoritative instruction combining audience, purpose, format doctrine and
 * the evidence ledger. This replaces sending a bare label and hoping.
 */
export function buildGenerationBrief(cfg: {
  format: FormatId;
  docPurpose: string;
  audience: AudienceId;
  title: string;
  companyContext: string;
  evidence: string;
  currencySymbol?: string;
  customInstruction?: string;
}): string {
  const aud = AUDIENCE_SPECS[cfg.audience] || AUDIENCE_SPECS.general;
  const pur = DOC_PURPOSE_SPECS[cfg.docPurpose] || DOC_PURPOSE_SPECS.detailed;
  const fmt = FORMAT_DOCTRINE[cfg.format] || FORMAT_DOCTRINE.pdf;

  return [
    "# DOCUMENT GENERATION BRIEF",
    "",
    "## 1. THE ARTEFACT",
    "Title: " + cfg.title,
    "Format: " + cfg.format.toUpperCase(),
    "Document type: " + pur.label,
    "Purpose: " + pur.job,
    "Depth: " + pur.depth,
    cfg.currencySymbol ? "Currency: all monetary figures in " + cfg.currencySymbol : "",
    "",
    "## 2. THE READER — write for this person specifically",
    "Audience: " + aud.label,
    "Who they are: " + aud.reader,
    "They open it looking for: " + aud.opensWith,
    "Assume they know: " + aud.assumedKnowledge,
    "Tone: " + aud.tone,
    "Evidence standard: " + aud.evidenceBar.toUpperCase() +
      (aud.evidenceBar === "auditable" ? " — every figure must be traceable to a source." :
       aud.evidenceBar === "defensible" ? " — every figure must survive a challenge." :
       " — directional figures acceptable if labelled as such."),
    "",
    "MUST INCLUDE for this reader:",
    ...aud.mustInclude.map(x => "  - " + x),
    "",
    "MUST AVOID for this reader:",
    ...aud.mustAvoid.map(x => "  - " + x),
    "",
    "## 3. REQUIRED STRUCTURE",
    "Cover these in order. Adapt wording to the material, but do not silently drop one:",
    ...pur.spine.map((s, i) => "  " + (i + 1) + ". " + s),
    "",
    "## 4. FORMAT DOCTRINE — " + cfg.format.toUpperCase(),
    "Role of this format: " + fmt.role,
    "Density: " + fmt.densityRule,
    "Rules:",
    ...fmt.rules.map(r => "  - " + r),
    "",
    "## 5. COMPANY CONTEXT",
    cfg.companyContext || "(none supplied)",
    "",
    "## 6. EVIDENCE — this is your ONLY source of fact",
    "Everything below was extracted from the user's actual workspace: their executive",
    "conversations, boardroom debates, ledger and data. You must build the document",
    "FROM this. Do not introduce facts or figures that are not here. If something",
    "required by the structure above is genuinely absent, write a short explicit gap",
    "note rather than inventing content to fill the space.",
    "",
    cfg.evidence,
    "",
    "## 7. NON-NEGOTIABLE",
    "- Every figure in the ledger that is relevant to this reader must appear.",
    "- Where executives disagreed, show the disagreement; do not average it away.",
    "- Never write a placeholder such as 'insert data here' or 'TBD'.",
    "- Never present an estimate as an actual. Label estimates.",
    "- The reader must be able to act on this without asking a follow-up question.",
    cfg.customInstruction ? "\n## 8. ADDITIONAL INSTRUCTION FROM THE USER\n" + cfg.customInstruction : "",
  ].filter(Boolean).join("\n");
}

/**
 * STAGE 4 — COVERAGE AUDIT.
 * After generation, check the important figures actually survived into the
 * output. This is what turns "hopefully complete" into "verified complete".
 */
export function auditCoverage(generated: string, ledger: EvidenceLedger): {
  ok: boolean; coverage: number; missing: string[]; checked: number;
} {
  const hay = (generated || "").toLowerCase();
  // Figures are the highest-value, easiest-to-verify items.
  const checks = ledger.figures.slice(0, 40);
  if (!checks.length) return { ok: true, coverage: 1, missing: [], checked: 0 };
  const numsIn = (s: string) => (s.match(/[\d][\d,.]*/g) || [])
    .map(n => n.replace(/[,]/g, "")).filter(n => n.replace(/\./g, "").length >= 2);
  const missing: string[] = [];
  let hit = 0;
  for (const f of checks) {
    const ns = numsIn(f);
    if (!ns.length) { hit++; continue; }
    const found = ns.some(n => hay.includes(n) || hay.includes(Number(n).toLocaleString("en-IN")) || hay.includes(Number(n).toLocaleString("en-US")));
    if (found) hit++; else missing.push(f);
  }
  const coverage = hit / checks.length;
  return { ok: coverage >= 0.7, coverage, missing: missing.slice(0, 12), checked: checks.length };
}

/** Sensible audience default when the user has not picked one. */
export function inferAudience(docPurpose: string, explicit?: string): AudienceId {
  if (explicit && (AUDIENCE_SPECS as any)[explicit]) return explicit as AudienceId;
  return DOC_PURPOSE_SPECS[docPurpose]?.defaultAudience || "general";
}

export const AUDIENCE_OPTIONS = (Object.keys(AUDIENCE_SPECS) as AudienceId[])
  .map(id => ({ id, label: AUDIENCE_SPECS[id].label, hint: AUDIENCE_SPECS[id].opensWith }));

export default {
  AUDIENCE_SPECS, DOC_PURPOSE_SPECS, FORMAT_DOCTRINE,
  assembleCorpus, extractEvidence, renderEvidence,
  buildGenerationBrief, auditCoverage, inferAudience, AUDIENCE_OPTIONS,
};
