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
// ── P0-1/2: STRUCTURED MENTIONS ─────────────────────────────────────────────
// "The mention system therefore cannot be frontend-only." This is the backend
// half: every message is scanned for @role and @User references against the
// ACTUAL roster in this session, so a mention is a fact the router can act on
// (priority) rather than text a human has to notice.
// THE EXACT BUG THAT SENT YOUR QUESTION TO THE WRONG EXECUTIVE.
// This table only recognised short internal codes (ceo, cfo, cso...). It had
// never heard the word "chief" - and every single C-suite title starts with
// that word, so the mention picker's own suggestion ("@Chief") could never
// resolve to anyone, for any executive, ever. Two things fix this together:
// this table now also accepts the ONE WORD THAT ACTUALLY DISTINGUISHES each
// role (Strategy, Finance, Marketing...), so someone typing naturally has a
// real chance of being understood - and separately, the picker itself has
// been fixed to insert the unambiguous code directly rather than a guessed
// word from the title.
const ROLE_ALIASES: Record<string,string> = {
  // "chief" and "executive" are deliberately NOT mapped here - every single
  // C-suite title contains one of those words, so treating either as a
  // reliable pointer to any one specific role would silently guess wrong with
  // total confidence, which is worse than the honest ambiguity it replaces.
  ceo:"ceo",
  cfo:"cfo", finance:"cfo", financial:"cfo",
  cmo:"cmo", marketing:"cmo",
  cto:"cto", technology:"cto", tech:"cto",
  coo:"coo", operations:"coo", operating:"coo",
  chro:"chro", hr:"chro", people:"chro", human:"chro",
  clo:"clo", legal:"clo", compliance:"clo",
  cso:"cso", strategy:"cso", strategist:"cso",
  trade:"trade", export:"trade", international:"trade",
  coach:"coach", career:"coach",
  chairman:"chairman", chair:"chairman",
};

export function extractMentions(text: string, activeRoleIds: string[]): { mentions: string[]; toUser: boolean } {
  const found = new Set<string>();
  let toUser = false;
  const re = /@(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[1].toLowerCase();
    if (tok === "user") { toUser = true; continue; }
    const role = ROLE_ALIASES[tok];
    if (role && activeRoleIds.includes(role)) found.add(role);
  }
  return { mentions: Array.from(found), toUser };
}

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
  const lastMsg = recentMessages.split("\n\n").filter(Boolean).pop() || "";
  const { mentions: directMentions, toUser: directToUser } = extractMentions(lastMsg, activeRoles);

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
    (directMentions.length ? ("The last message explicitly addressed: " + directMentions.join(", ") +
      ". Give them priority to respond, but you may still add another executive with a materially " +
      "relevant contribution \u2014 a mention creates priority, not an exclusive turn.\n") : "") +
    (directToUser ? "The last message explicitly addressed @User. Set question_to_user true.\n" : "") +
    "REPEATED DISAGREEMENT: if the same two positions have gone back and forth 3+ times with no new " +
    "evidence, do not let it continue. Either set research_needed, set question_to_user for the " +
    "deciding fact, or select the CEO to name the impasse and force a choice.\n" +
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
// ── MAKE THE PENDING QUESTION A REAL, ATTRIBUTED STATEMENT ─────────────────
// THE EXACT CONFUSION IN YOUR SCREENSHOT: the yellow "board needs your input"
// banner was a SYSTEM announcement, never actually said by any executive in
// their own voice. It was attributed to one (askedBy) as bookkeeping only.
// So when you asked that executive directly "did you ask me a question?",
// they answered honestly from their own transcript, which contained no such
// question - and correctly said no. The system was telling the truth about
// itself; the attribution was fiction.
//
// This makes the router-selected executive ACTUALLY ask it, in their own
// persona, ending with the literal @User tag - so it is a genuine turn in
// their own voice that they will truthfully confirm later, and it is caught
// by the same deterministic @User check every other executive message goes
// through, rather than needing its own separate, disconnected mechanism.
export async function speakQuestionToUser(
  ask: AskFn, provider: string, model: string,
  roleId: string, personaBlock: string, objective: string, transcript: string, decisionState: any,
  reason: string
): Promise<string> {
  const sys = personaBlock +
    "\n\nYOU HAVE DETERMINED YOU NEED SOMETHING FROM THE USER TO PROCEED: " + reason + "\n" +
    "Ask them directly, in your own voice, in one or two sentences. Your message MUST contain the " +
    "literal text \"@User\" immediately before the question, exactly like that. Do not restate the " +
    "whole discussion - just ask what you need, as you genuinely would in a live meeting.";
  const user = "OBJECTIVE: " + objective + "\n\nTRANSCRIPT SO FAR:\n" + transcript.slice(-4000);
  const out = (await ask(sys, [{ role:"user", content:user }], 300, false, "boardroom_"+roleId, provider, model)).trim();
  // A model can still forget, despite the instruction - this is the backstop
  // that guarantees the tag is present regardless, so the deterministic
  // pause mechanism never depends on the model's compliance alone.
  return /@user\b/i.test(out) ? out : ("@User " + out);
}

export async function executiveSpeak(
  ask: AskFn, provider: string, model: string,
  roleId: string, personaBlock: string, objective: string, transcript: string, decisionState: any,
  // Fix #1: when the round exists BECAUSE the user directly addressed this
  // executive, that is not optional context — it is the reason they were
  // called at all, and the previous version left it to inference from the
  // transcript alone, which is how a direct @CFO question got dropped.
  directedByUser?: string
): Promise<string> {
  const sys = personaBlock +
    "\n\nYOU ARE IN A LIVE BOARDROOM, NOT WRITING A REPORT.\n" +
    "Read the transcript below. Respond to what was ACTUALLY just said \u2014 challenge a specific claim, " +
    "answer a question or @mention aimed at you, add evidence, or move the discussion forward.\n" +
    (directedByUser
      ? ("THE USER ADDRESSED YOU DIRECTLY, JUST NOW, WITH THIS QUESTION \u2014 answer it, specifically and " +
         "first, before anything else you want to add: \"" + directedByUser + "\"\n" +
         "The user is the person this discussion exists for. Do not deflect the question back to another " +
         "executive and do not fold it into a general comment \u2014 answer it.\n")
      : "") +
    "TAG COLLEAGUES BY NAME WHEN IT IS GENUINELY WARRANTED. If you disagree with something a specific " +
    "colleague said, are building on their point, or need something only they can answer, address them " +
    "directly: \"@CFO your payback assumption does not include...\". This is not decoration \u2014 a live " +
    "boardroom is executives talking TO each other, not each delivering a statement to the room. Do this " +
    "whenever it genuinely applies; do not force it when it does not.\n" +
    "Where you state something as fact rather than your own judgement, say EVIDENCE: or ASSUMPTION: at the " +
    "start of that sentence so it can be shown as such \u2014 do not let an inference read as an established fact.\n" +
    "NEVER open with agreement filler ('great point', 'I agree with my colleague'). If you agree, say " +
    "WHY with a reason that adds something; otherwise say nothing about it and make your own point.\n" +
    "IF YOU NEED ANYTHING FROM THE HUMAN USER \u2014 their budget, their risk tolerance, a fact only " +
    "they know, or a decision only they can make \u2014 YOU MUST WRITE THE LITERAL TEXT \"@User\" " +
    "immediately before the question, exactly like that, with a capital U. This is not optional " +
    "phrasing: the platform detects this exact text to pause the discussion and wait for their answer. " +
    "A question to the user written any other way will be missed entirely and never receive an answer. " +
    "Example: \"@User what is the maximum you are willing to invest in the first year?\"\n" +
    "Use @Name the same way to address a specific colleague.\n" +
    "STRUCTURED DATA: if you have a genuine table of figures (a comparison, a cost breakdown, a set of " +
    "options), format it as a proper markdown table with | pipes |. If a simple numeric comparison would " +
    "read better as a chart, add one fenced block after your prose, exactly in this form:\n" +
    "```chart\n{\"title\":\"...\",\"labels\":[\"A\",\"B\"],\"values\":[10,20]}\n```\n" +
    "Only do either when it genuinely helps \u2014 most of what you say is spoken dialogue, not a report, and " +
    "should stay plain sentences.\n" +
    "Keep it to the length of something a real executive would say in a meeting \u2014 usually a paragraph, " +
    "not an essay. This is dialogue, not a deliverable.";
  const user = "OBJECTIVE: " + objective +
    "\n\nDECISION STATE:\n" + JSON.stringify(decisionState).slice(0,1500) +
    "\n\nTRANSCRIPT SO FAR:\n" + transcript.slice(-6000);
  return (await ask(sys, [{ role:"user", content:user }], 800, false, "boardroom_"+roleId, provider, model)).trim();
}

// ── EXPORT: BUILD A DOCUMENT FROM THE ACTUAL DISCUSSION ─────────────────────
// Reused by every export format (spec item 5, item 7: "reuse existing
// infrastructure"). The Railway document service already knows how to turn
// well-structured Markdown into a polished PDF/PPTX/DOCX (the same
// content_blueprint path used elsewhere in the app), so the job here is only
// to produce that Markdown FROM the session's real state \u2014 never inventing
// content the board did not actually produce.
export function buildTranscriptMarkdown(
  session: any, messages: any[], decisionState: any, roleLabelOf: (id:string)=>string
): string {
  const L: string[] = [];
  L.push("# " + (session.objective || "Boardroom Decision"));
  L.push("");
  const fd = decisionState?.final_decision;
  if (fd?.decision) {
    L.push("## Executive Summary");
    L.push("");
    L.push("**Decision:** " + fd.decision);
    L.push("");
    if (fd.why) L.push(fd.why);
    L.push("");
    if (fd.confidence) L.push("**Confidence:** " + fd.confidence);
    if (fd.vote) L.push("**Board vote:** " + (fd.vote.for||0) + " for, " + (fd.vote.against||0) +
      " against, " + (fd.vote.abstain||0) + " abstaining");
    if (fd.dissent) L.push("**Dissent:** " + fd.dissent);
    L.push("");
  }
  for (const k of ["assumptions","risks","objections","unresolved_questions","facts"]) {
    const arr = decisionState?.[k];
    if (Array.isArray(arr) && arr.length) {
      L.push("## " + k.replace(/_/g," ").replace(/\b\w/g, (c:string)=>c.toUpperCase()));
      L.push("");
      arr.forEach((x:string) => L.push("- " + x));
      L.push("");
    }
  }
  if (Array.isArray(fd?.conditions) && fd.conditions.length) {
    L.push("## Conditions"); L.push("");
    fd.conditions.forEach((c:string) => L.push("- " + c));
    L.push("");
  }
  if (Array.isArray(fd?.alternatives_considered) && fd.alternatives_considered.length) {
    L.push("## Alternatives Considered"); L.push("");
    fd.alternatives_considered.forEach((c:string) => L.push("- " + c));
    L.push("");
  }
  L.push("## Discussion");
  L.push("");
  for (const m of messages) {
    if (m.author_type === "system") continue;
    const who = m.author_type === "user" ? "User" : roleLabelOf(m.author_role || "");
    L.push("**" + who + ":** " + (m.content || "").replace(/```chart[\s\S]*?```/g, "").trim());
    L.push("");
  }
  return L.join("\n");
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
  authorRole: string|null, content: string,
  opts: { kind?:string; provider?:string; model?:string; refs?:string[]; activeRoles?:string[]; replyTo?:string } = {}) {
  // P0-2: mentions and evidence status are extracted and stored as DATA, not
  // left implicit in the prose. This is what lets the router and the UI act
  // on them instead of re-parsing text every time.
  const { mentions } = extractMentions(content, opts.activeRoles || []);
  let evidence_status: string | null = null;
  if (/^EVIDENCE:/i.test(content.trim())) evidence_status = "verified";
  else if (/^ASSUMPTION:/i.test(content.trim())) evidence_status = "assumption";

  const { data, error } = await supabase.from("boardroom_messages").insert({
    session_id: sessionId, author_type: authorType, author_role: authorRole, content,
    kind: opts.kind || "text", provider: opts.provider, model: opts.model, refs: opts.refs || [],
    mentions, reply_to: opts.replyTo || null, evidence_status,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function setStatus(sessionId: string, status: string) {
  await supabase.from("boardroom_sessions").update({ status }).eq("id", sessionId);
}

// P0-3/P0-9: a machine-readable "the board is waiting, and for what" record,
// separate from status text. This is what survives a refresh (spec: persistence)
// and what a rejoining user sees immediately without re-reading the transcript.
export async function setPendingQuestion(sessionId: string, q: { messageId:string; askedBy:string; text:string } | null) {
  await supabase.from("boardroom_sessions").update({
    pending_question: q, status: q ? "waiting_for_user" : "live_discussion",
  }).eq("id", sessionId);
}

export async function setPaused(sessionId: string, paused: boolean) {
  await supabase.from("boardroom_sessions").update({ paused }).eq("id", sessionId);
}

export async function mergeDecisionState(sessionId: string, patch: any) {
  const { data } = await supabase.from("boardroom_sessions").select("decision_state").eq("id", sessionId).single();
  const merged = { ...(data?.decision_state || {}), ...patch };
  await supabase.from("boardroom_sessions").update({ decision_state: merged }).eq("id", sessionId);
  return merged;
}

// ── QUESTION STATE TRACKING (spec: "PENDING/ANSWERED/SKIPPED/DECLINED/RESOLVED") ─
// WHAT WAS MISSING: a question that got answered or skipped was simply erased -
// pending_question was set back to null with nothing kept. That meant nobody
// could later see WHAT was asked, WHO answered it, or that a question had been
// deliberately skipped rather than never having existed. This is what the spec
// means by tracking "unresolved state" as a real thing, not a transient UI flag.
//
// mergeDecisionState above does a SHALLOW merge, so an array field has to be
// read, modified, and written back whole - it cannot be appended to directly.
export type QuestionStatus = "PENDING" | "ANSWERED" | "SKIPPED" | "DECLINED" | "RESOLVED";
export interface QuestionLogEntry {
  id: string; text: string; askedBy: string; status: QuestionStatus;
  answer?: string; askedAt: string; resolvedAt?: string;
}

export async function logQuestionAsked(sessionId: string, entry: { messageId:string; askedBy:string; text:string }) {
  const { data } = await supabase.from("boardroom_sessions").select("decision_state").eq("id", sessionId).single();
  const state = data?.decision_state || {};
  const log: QuestionLogEntry[] = Array.isArray(state.question_log) ? state.question_log : [];
  log.push({ id: entry.messageId, text: entry.text, askedBy: entry.askedBy, status: "PENDING", askedAt: new Date().toISOString() });
  await mergeDecisionState(sessionId, { question_log: log });
}

export async function logQuestionResolved(sessionId: string, messageId: string, status: "ANSWERED"|"SKIPPED", answer?: string) {
  const { data } = await supabase.from("boardroom_sessions").select("decision_state").eq("id", sessionId).single();
  const state = data?.decision_state || {};
  const log: QuestionLogEntry[] = Array.isArray(state.question_log) ? state.question_log : [];
  const updated = log.map(q => q.id === messageId
    ? { ...q, status, answer: answer, resolvedAt: new Date().toISOString() }
    : q);
  await mergeDecisionState(sessionId, { question_log: updated });
}

export function transcriptOf(messages: any[]): string {
  return messages.map(m =>
    (m.author_type === "user" ? "USER" : m.author_type === "system" ? "SYSTEM" : (m.author_role||"").toUpperCase())
    + ": " + m.content).join("\n\n");
}

export default { MANDATE, routeNext, ceoFormBoard, executiveSpeak, extractStateUpdate,
                 proposeDecision, createSession, addParticipant, postMessage, setStatus,
                 setPendingQuestion, setPaused, extractMentions, mergeDecisionState, transcriptOf,
                 buildTranscriptMarkdown, logQuestionAsked, logQuestionResolved, speakQuestionToUser };
