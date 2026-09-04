// src/lib/BoardroomEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// LIVE AI BOARDROOM — the orchestration layer. Section 34 of the spec: "the
// central architectural component should be a boardroom orchestration layer...
// do not distribute this logic randomly across frontend components."
//
// THE CORE DECISION THIS FILE MAKES, EVERY TIME A MESSAGE ARRIVES:
//   "Given what was just said, who (if anyone) has something to add?"
//
// That is a relevance question, not a queue position. It is answered by one
// cheap model call — the ROUTER — reading the last few messages and the
// current decision state, and returning WHICH active participants should
// speak next, in what order, and why. This is what makes the room reactive
// instead of a fixed CEO->CFO->CMO->CTO pipeline, and it is what keeps cost
// under control: an executive with nothing to add is never called at all.
//
// The router itself is cheap — short prompt, short output, any available
// text-only model — so its cost is negligible next to the executive replies
// it prevents.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export type AskFn = (sys:string, msgs:any[], maxT:number, search?:boolean, task?:string,
                      provider?:string, model?:string) => Promise<string>;

// ── ROLE MANDATES (spec section 25) ─────────────────────────────────────────
// Short and behavioural on purpose. The full persona — background, standard
// of reasoning, debate rules — is layered on separately from App.tsx's own
// buildBoardIdentity/ANALYST_STANDARD/CLARITY_PROTOCOL, which this engine
// reuses rather than reinventing (spec section 49: reuse what exists).
export const MANDATE: Record<string,string> = {
  ceo:   "Strategic direction, decision framing, board coordination, final prioritisation. You convene the board and decide who is needed.",
  cfo:   "Financial viability, capital allocation, ROI, cash impact, downside risk. You demand quantification before agreement.",
  cmo:   "Market opportunity, customers, positioning, acquisition, competitive dynamics.",
  cto:   "Technology, architecture, scalability, security, implementation requirements.",
  coo:   "Operational feasibility, process, execution capacity, logistics.",
  chro:  "People, organisational capacity, talent risk of the plan.",
  clo:   "Legal exposure, compliance, contractual and regulatory risk.",
  trade: "Cross-border, customs, trade-agreement and international-market exposure.",
  cso:   "Long-range strategic fit and portfolio consequence.",
  coach: "Talent and workforce implications of the decision.",
};

// ── THE RELEVANCE ROUTER (spec section 5, 6, 13) ────────────────────────────
// Deliberately terse. It never generates boardroom content — only a routing
// decision — so it can run on the cheapest configured provider.
export interface RouterResult {
  speakers: string[];          // role_ids to call this round, in order — may be empty
  question_to_user: boolean;   // does the room need input from the person, not an executive
  research_needed: string[];   // queries the room genuinely needs before continuing
  ready_for_decision: boolean; // has discussion reached a point worth proposing a decision
  reason: string;              // one line, shown in the activity log — never hidden
}

export async function routeNext(
  ask: AskFn, provider: string, model: string,
  objective: string, activeRoles: string[], recentMessages: string, decisionState: any
): Promise<RouterResult> {
  const sys =
    "You are the boardroom ROUTER. You do not participate in the discussion. You decide, after the " +
    "most recent message, which of the active executives (if any) genuinely have something to add.\n\n" +
    "RULES:\n" +
    "- Silence is correct and common. Do not select an executive just to keep the room busy.\n" +
    "- Select someone only if they would CHALLENGE a claim, ANSWER a direct question or @mention aimed " +
    "at them, ADD evidence from their domain, or the CEO needs to synthesise/redirect.\n" +
    "- At most 2 speakers per round. A crowded round produces noise, not deliberation.\n" +
    "- If the discussion cannot proceed without a fact only the user knows (budget, risk appetite, " +
    "timeline, a constraint), set question_to_user true and say which fact in reason.\n" +
    "- If a claim needs checking or a genuine information gap exists, list it in research_needed.\n" +
    "- Set ready_for_decision true only when material objections have been addressed and no critical " +
    "assumption remains unvalidated \u2014 not merely because everyone has spoken once.\n\n" +
    "Active executives: " + activeRoles.join(", ") + "\n" +
    "Respond with ONLY this JSON, nothing else:\n" +
    '{"speakers":[],"question_to_user":false,"research_needed":[],"ready_for_decision":false,"reason":""}';

  const user = "OBJECTIVE: " + objective +
    "\n\nDECISION STATE SO FAR:\n" + JSON.stringify(decisionState).slice(0,2000) +
    "\n\nRECENT MESSAGES:\n" + recentMessages.slice(-4000);

  try {
    const raw = await ask(sys, [{ role:"user", content:user }], 400, false, "boardroom_route", provider, model);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    const j = JSON.parse(raw.slice(s, e+1));
    return {
      speakers: Array.isArray(j.speakers) ? j.speakers.filter((r:string)=>activeRoles.includes(r)).slice(0,2) : [],
      question_to_user: !!j.question_to_user,
      research_needed: Array.isArray(j.research_needed) ? j.research_needed.slice(0,2) : [],
      ready_for_decision: !!j.ready_for_decision,
      reason: String(j.reason||"").slice(0,200),
    };
  } catch {
    // A router failure must not silently freeze the room. Fall back to
    // whichever single executive was most recently @mentioned, or the CEO.
    return { speakers: [], question_to_user: false, research_needed: [], ready_for_decision: false,
             reason: "Router unavailable this round." };
  }
}

// ── CEO FORMS THE BOARD (spec section 3) ────────────────────────────────────
export async function ceoFormBoard(
  ask: AskFn, provider: string, model: string, objective: string, evidenceSummary: string
): Promise<{ participants: string[]; opening: string; questions: string[] }> {
  const sys =
    "You are the CEO. Read the objective and the initial evidence. Decide which executives this " +
    "specific decision genuinely needs \u2014 not a default set. Choose from: " +
    Object.keys(MANDATE).filter(r=>r!=="ceo").join(", ") + ". Always include yourself as convener.\n" +
    "Then write your OPENING STATEMENT to the board: frame what the actual decision is, name the " +
    "questions that need answering, and invite the first response. This is the first message the " +
    "user sees \u2014 make it earn the room's attention, not a summary of the research.\n" +
    "Respond as JSON only: " +
    '{"participants":["ceo","cfo",...],"opening":"...","questions":["...","..."]}';
  const raw = await ask(sys, [{ role:"user", content:"OBJECTIVE: "+objective+"\n\nEVIDENCE:\n"+evidenceSummary.slice(0,3000) }],
    900, false, "boardroom_form", provider, model);
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  const j = JSON.parse(raw.slice(s, e+1));
  const participants = Array.from(new Set(["ceo", ...(Array.isArray(j.participants)?j.participants:[])]))
    .filter(r => MANDATE[r]);
  return { participants, opening: String(j.opening||""), questions: Array.isArray(j.questions)?j.questions:[] };
}

// ── ONE EXECUTIVE SPEAKING (spec section 4, 22, 26, 27) ─────────────────────
// personaBlock is passed in from App.tsx's existing buildBoardIdentity +
// ANALYST_STANDARD + CLARITY_PROTOCOL — this engine does not duplicate that
// prompt engineering, it composes with it.
export async function executiveSpeak(
  ask: AskFn, provider: string, model: string,
  roleId: string, personaBlock: string, objective: string, transcript: string, decisionState: any
): Promise<string> {
  const sys = personaBlock +
    "\n\nYOU ARE IN A LIVE BOARDROOM, NOT WRITING A REPORT.\n" +
    "Read the transcript below. Respond to what was ACTUALLY just said \u2014 challenge a specific claim, " +
    "answer a question or @mention aimed at you, add evidence, or move the discussion forward.\n" +
    "NEVER open with agreement filler ('great point', 'I agree with my colleague'). If you agree, say " +
    "WHY with a reason that adds something; otherwise say nothing about it and make your own point.\n" +
    "Use @Name to address a specific colleague or @User to ask the person a direct question.\n" +
    "Keep it to the length of something a real executive would say in a meeting \u2014 usually a paragraph, " +
    "not an essay. This is dialogue, not a deliverable.";
  const user = "OBJECTIVE: " + objective +
    "\n\nDECISION STATE:\n" + JSON.stringify(decisionState).slice(0,1500) +
    "\n\nTRANSCRIPT SO FAR:\n" + transcript.slice(-6000);
  return (await ask(sys, [{ role:"user", content:user }], 700, false, "boardroom_"+roleId, provider, model)).trim();
}

// ── DECISION STATE EXTRACTION (spec section 9) ──────────────────────────────
// Cheap, separate call rather than asking every executive to self-report
// structured state inline — keeps their spoken output natural (section 27)
// while still building the durable record.
export async function extractStateUpdate(
  ask: AskFn, provider: string, model: string, latestMessage: string, currentState: any
): Promise<any> {
  const sys =
    "Read the new boardroom message. Extract ONLY what is genuinely new: an assumption made, a fact " +
    "claimed, an objection raised, a risk named, a question the user must answer, or a position change. " +
    "If nothing new, return {}. Respond as JSON only, using ONLY these keys where relevant: " +
    '{"assumptions":[],"risks":[],"objections":[],"unresolved_questions":[],"facts":[]}';
  try {
    const raw = await ask(sys, [{ role:"user", content: latestMessage.slice(0,1500) }], 300, false, "boardroom_extract", provider, model);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    const patch = JSON.parse(raw.slice(s, e+1));
    const merged = { ...currentState };
    for (const k of ["assumptions","risks","objections","unresolved_questions","facts"]) {
      if (Array.isArray(patch[k]) && patch[k].length) {
        merged[k] = Array.from(new Set([...(currentState[k]||[]), ...patch[k]])).slice(0,25);
      }
    }
    return merged;
  } catch { return currentState; }
}

// ── FINAL SYNTHESIS FROM THE ACTUAL DISCUSSION (spec section 48) ────────────
// Explicitly built FROM decisionState + transcript, never independently of it.
export async function proposeDecision(
  ask: AskFn, provider: string, model: string, objective: string, transcript: string, decisionState: any
): Promise<any> {
  const sys =
    "You are the CEO closing this boardroom round. Produce a structured decision record built STRICTLY " +
    "from the discussion below \u2014 do not introduce reasoning that was not actually raised. " +
    "Respond as JSON only:\n" +
    '{"decision":"","why":"","conditions":[],"risks":[],"alternatives_considered":[],' +
    '"dissent":"","vote":{"for":0,"against":0,"abstain":0},"confidence":"High|Medium|Low"}\n' +
    "If a participant genuinely disagreed and was not overturned by evidence, dissent must say so " +
    "by name \u2014 never invent unanimity.";
  const user = "OBJECTIVE: " + objective +
    "\n\nDECISION STATE:\n" + JSON.stringify(decisionState).slice(0,2500) +
    "\n\nFULL TRANSCRIPT:\n" + transcript.slice(-9000);
  const raw = await ask(sys, [{ role:"user", content:user }], 1000, false, "boardroom_decide", provider, model);
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(s, e+1));
}

// ── PERSISTENCE HELPERS ──────────────────────────────────────────────────────
export async function createSession(objective: string) {
  const { data: s } = await supabase.auth.getSession();
  const uid = s?.session?.user?.id;
  if (!uid) throw new Error("Please sign in again.");
  const { data, error } = await supabase.from("boardroom_sessions")
    .insert({ user_id: uid, objective, status: "researching" }).select().single();
  if (error) throw error;
  return data;
}

export async function addParticipant(sessionId: string, roleId: string, label: string, addedBy: "ceo"|"user") {
  await supabase.from("boardroom_participants").insert({ session_id: sessionId, role_id: roleId, label, added_by: addedBy });
}

export async function postMessage(sessionId: string, authorType: "user"|"agent"|"system",
  authorRole: string|null, content: string, opts: { kind?:string; provider?:string; model?:string; refs?:string[] } = {}) {
  const { error } = await supabase.from("boardroom_messages").insert({
    session_id: sessionId, author_type: authorType, author_role: authorRole, content,
    kind: opts.kind || "text", provider: opts.provider, model: opts.model, refs: opts.refs || [],
  });
  if (error) throw error;
}

export async function setStatus(sessionId: string, status: string) {
  await supabase.from("boardroom_sessions").update({ status }).eq("id", sessionId);
}

export async function mergeDecisionState(sessionId: string, patch: any) {
  const { data } = await supabase.from("boardroom_sessions").select("decision_state").eq("id", sessionId).single();
  const merged = { ...(data?.decision_state || {}), ...patch };
  await supabase.from("boardroom_sessions").update({ decision_state: merged }).eq("id", sessionId);
  return merged;
}

export function transcriptOf(messages: any[]): string {
  return messages.map(m =>
    (m.author_type === "user" ? "USER" : m.author_type === "system" ? "SYSTEM" : (m.author_role||"").toUpperCase())
    + ": " + m.content).join("\n\n");
}

export default { MANDATE, routeNext, ceoFormBoard, executiveSpeak, extractStateUpdate,
                 proposeDecision, createSession, addParticipant, postMessage, setStatus,
                 mergeDecisionState, transcriptOf };
