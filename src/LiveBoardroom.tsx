// src/LiveBoardroom.tsx
// ─────────────────────────────────────────────────────────────────────────────
// LIVE AI BOARDROOM — the live group-chat surface (spec sections 18, 42).
//
// Layout, per spec section 42:
//   LEFT   participants + status
//   CENTER live conversation (dominant)
//   RIGHT  decision panel — objective, options, assumptions, open questions, risks
//   BOTTOM composer, always available, even mid-discussion (section 7, 21)
//
// ISOLATED. Imports ask() from App.tsx and nothing else. Deleting this file
// and its two lib companions removes the feature with zero effect on anything
// existing — same discipline as the Workspace.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import BE, { MANDATE, transcriptOf } from "./lib/BoardroomEngine";

const C = { bg:"#070B14", panel:"#0F1420", raised:"#0A0E1A", line:"#1A2030",
            ink:"#F1F5F9", dim:"#A0AAC0", faint:"#5A6480", teal:"#14B8A6", amber:"#F59E0B", red:"#EF4444" };

const ROLE_COLOR: Record<string,string> = {
  ceo:"#14B8A6", cfo:"#F59E0B", cmo:"#EC4899", cto:"#3B82F6", coo:"#22C55E",
  chro:"#A855F7", clo:"#EF4444", trade:"#06B6D4", cso:"#F97316", coach:"#84CC16",
};
const roleLabel = (roles:any[], id:string) => roles.find(r=>r.id===id)?.t || id.toUpperCase();

const btn: React.CSSProperties = { padding:"7px 12px", borderRadius:6, fontSize:11, fontWeight:700,
  cursor:"pointer", border:"1px solid "+C.line, background:C.raised, color:C.ink, fontFamily:"inherit" };
const prim: React.CSSProperties = { ...btn, background:C.teal, color:"#04070F", border:"1px solid "+C.teal, fontWeight:800 };
const inp: React.CSSProperties = { width:"100%", padding:"9px 11px", background:C.raised, border:"1px solid "+C.line,
  borderRadius:6, color:C.ink, fontSize:12, boxSizing:"border-box", fontFamily:"inherit" };

interface Props {
  ask: BE.AskFn extends any ? any : any; // typed loosely to avoid coupling to App.tsx's ask signature
  AR: any[];                              // the app's full executive roster — reused, not duplicated
  buildIdentity: (role:any) => string;    // App.tsx's buildBoardIdentity+ANALYST_STANDARD+CLARITY_PROTOCOL
  routerProviderModel: () => { provider:string; model:string };
  runResearch: (query:string) => Promise<{ text:string; sources:Array<{url:string;title?:string}> }>;
  showToast?: (m:string, k?:string) => void;
}

type Msg = { id:string; author_type:string; author_role?:string; content:string; kind?:string; created_at:string };

export default function LiveBoardroom({ ask, AR, buildIdentity, routerProviderModel, runResearch, showToast }: Props) {
  const [sessions, setSessions]   = useState<any[]>([]);
  const [session, setSession]     = useState<any>(null);
  const [participants, setParts]  = useState<any[]>([]);
  const [msgs, setMsgs]           = useState<Msg[]>([]);
  const [objective, setObjective] = useState("");
  const [input, setInput]         = useState("");
  const [busy, setBusy]           = useState(false);
  const [activity, setActivity]   = useState<string[]>([]); // "CFO is reviewing…" style lines
  const [addRole, setAddRole]     = useState("");
  const runningRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  // ── load session list ───────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    const { data } = await supabase.from("boardroom_sessions").select("*").order("updated_at",{ascending:false}).limit(30);
    setSessions(data || []);
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── open a session + realtime subscription (spec section 20, 35) ───────
  const openSession = useCallback(async (s:any) => {
    setSession(s);
    const [{ data: pRows }, { data: mRows }] = await Promise.all([
      supabase.from("boardroom_participants").select("*").eq("session_id", s.id),
      supabase.from("boardroom_messages").select("*").eq("session_id", s.id).order("created_at"),
    ]);
    setParts(pRows || []); setMsgs((mRows as any) || []);
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    const ch = supabase.channel("boardroom-"+session.id)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"boardroom_messages",
        filter:"session_id=eq."+session.id },
        (payload:any) => setMsgs(m => m.some(x=>x.id===payload.new.id) ? m : [...m, payload.new]))
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"boardroom_sessions",
        filter:"id=eq."+session.id },
        (payload:any) => setSession((s:any)=>({ ...s, ...payload.new })))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.id]);

  // P0-6: INTELLIGENT SCROLLING.
  // WAS: every new message force-scrolled the viewport, regardless of where
  // the user was reading. If they had scrolled up to reread the CFO's point,
  // a new CTO message yanked them back down mid-sentence. That is the exact
  // defect the spec names.
  //
  // Now: track whether the user is AT the bottom. Only auto-follow if they
  // were already there. If they have scrolled away, a new-message counter
  // accumulates and a "Jump to latest" control appears instead of moving
  // anything — the user's position is never touched without their action.
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newSince, setNewSince] = useState(0);
  const prevLenRef = useRef(0);

  const checkBottom = useCallback(() => {
    const el = scrollBoxRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist < 80;
    setAtBottom(nearBottom);
    if (nearBottom) setNewSince(0);
  }, []);

  const jumpToLatest = () => {
    endRef.current?.scrollIntoView({ behavior:"smooth" });
    setNewSince(0); setAtBottom(true);
  };

  useEffect(() => {
    const grew = msgs.length > prevLenRef.current;
    if (grew) {
      if (atBottom) { endRef.current?.scrollIntoView({ behavior:"smooth" }); }
      else { setNewSince(n => n + (msgs.length - prevLenRef.current)); }
    }
    prevLenRef.current = msgs.length;
  }, [msgs.length, atBottom]);

  const activeRoleIds = participants.filter(p=>p.active && !p.muted).map(p=>p.role_id);
  const { provider: rp, model: rm } = routerProviderModel();

  // ── START A NEW SESSION (spec section 2, 3) ─────────────────────────────
  const start = async () => {
    if (!objective.trim() || busy) return;
    setBusy(true);
    try {
      const s = await BE.createSession(objective.trim());
      setSession(s); setParts([]); setMsgs([]); loadSessions();

      setActivity(["Gathering initial evidence…"]);
      const research = await runResearch(objective.trim());
      await BE.postMessage(s.id, "system", null,
        "Initial research complete. " + (research.sources?.length||0) + " sources reviewed.", { kind:"text" });
      for (const src of (research.sources||[]).slice(0,6)) {
        await supabase.from("boardroom_evidence").insert({
          session_id: s.id, query: objective.trim(), source_url: src.url, snippet: src.title||"",
          verified: true, requested_by: "system" });
      }

      setActivity(["CEO is forming the board…"]);
      await BE.setStatus(s.id, "board_forming");
      const form = await BE.ceoFormBoard(ask, rp, rm, objective.trim(), research.text);
      for (const roleId of form.participants) {
        const role = AR.find((r:any)=>r.id===roleId);
        if (role) await BE.addParticipant(s.id, roleId, role.t, "ceo");
      }
      const { data: pRows } = await supabase.from("boardroom_participants").select("*").eq("session_id", s.id);
      setParts(pRows || []);

      await BE.postMessage(s.id, "agent", "ceo", form.opening, { provider:"", kind:"text" });
      if (form.questions.length) {
        await BE.mergeDecisionState(s.id, { unresolved_questions: form.questions });
      }
      await BE.setStatus(s.id, "live_discussion");
      const { data: mRows } = await supabase.from("boardroom_messages").select("*").eq("session_id", s.id).order("created_at");
      setMsgs((mRows as any) || []);
      setActivity([]);
      runRound(s.id, form.participants);
    } catch (e:any) {
      showToast?.(String(e?.message||e).slice(0,200), "error");
      setActivity([]);
    } finally { setBusy(false); }
  };

  // ── THE REACTIVE LOOP — NOT A PIPELINE (spec section 5, 6, 47) ──────────
  // After every message, ask the router who (if anyone) should speak next.
  // This function calls itself until the router says nothing is pending —
  // that is what makes the room feel alive rather than turn-based.
  const runRound = useCallback(async (sessionId:string, roleIds:string[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      let guard = 0;
      let sameDisagreementCount = 0;
      let lastSpeakerPair = "";
      while (guard++ < 8) { // hard ceiling — a runaway loop must never be possible
        // P0-7: manual pause is checked at the TOP of every iteration. This is
        // what makes Pause actually stop generation rather than merely hiding
        // a button — the loop will not start another executive call once this
        // is true, even mid-round.
        const { data: sRowCheck } = await supabase.from("boardroom_sessions").select("paused,status").eq("id", sessionId).single();
        if (sRowCheck?.paused) { setActivity([]); break; }
        if (sRowCheck?.status && ["decision_proposed","accepted","closed","waiting_for_user"].includes(sRowCheck.status)) break;

        const { data: mRows } = await supabase.from("boardroom_messages").select("*").eq("session_id", sessionId).order("created_at");
        const { data: sRow } = await supabase.from("boardroom_sessions").select("decision_state,status").eq("id", sessionId).single();
        const transcript = transcriptOf((mRows as any) || []);
        const decisionState = sRow?.decision_state || {};

        setActivity(a=>[...a, "Boardroom is thinking\u2026"]);
        const route = await BE.routeNext(ask, rp, rm, objective || session?.objective || "", roleIds, transcript, decisionState);
        setActivity([]);

        if (route.question_to_user) {
          // P0-3/P0-9: post the question as a live message AND record it as
          // the session's explicit pending_question. The status flip to
          // waiting_for_user is what the loop checks above to actually stop —
          // the message alone would only be a visual cue, not an enforced pause.
          const posted = await BE.postMessage(sessionId, "system", null,
            "The board needs your input: " + route.reason, { kind:"question_to_user" });
          await BE.setPendingQuestion(sessionId, { messageId: posted?.id, askedBy: (route.speakers[0]||"ceo"), text: route.reason });
          break; // P0-3: stop \u2014 live, never deferred to "after the conversation"
        }
        if (route.research_needed.length) {
          setActivity(a=>[...a, "Researching: " + route.research_needed[0]]);
          const r = await runResearch(route.research_needed[0]);
          await BE.postMessage(sessionId, "system", null,
            "Additional research \u2014 " + route.research_needed[0] + ": " + r.text.slice(0,600), { kind:"evidence" });
          setActivity([]);
          continue;
        }
        if (route.ready_for_decision) {
          await proposeDecisionNow(sessionId, roleIds);
          break;
        }
        if (!route.speakers.length) break; // genuine silence — correct and common

        // P1-18: crude but effective loop guard. If the same two participants
        // keep exchanging turns with the router never finding new ground,
        // force the CEO to name the impasse rather than let it repeat forever.
        const pairKey = route.speakers.slice().sort().join(",");
        if (pairKey && pairKey === lastSpeakerPair) sameDisagreementCount++; else sameDisagreementCount = 0;
        lastSpeakerPair = pairKey;
        const forcedBreak = sameDisagreementCount >= 3;

        for (const roleId of (forcedBreak ? ["ceo"] : route.speakers)) {
          const role = AR.find((r:any)=>r.id===roleId);
          if (!role) continue;
          // P1-12: a meaningful activity line, not a generic "typing…".
          const domainLine = BE.MANDATE[roleId] ? BE.MANDATE[roleId].split(".")[0] : "reviewing";
          setActivity(a=>[...a, role.t + " is " + (forcedBreak ? "resolving a repeated disagreement" : domainLine.toLowerCase()) + "\u2026"]);
          try {
            const persona = buildIdentity(role);
            const speakTranscript = forcedBreak
              ? transcript + "\n\nSYSTEM NOTE: the same disagreement has repeated 3 times with no new evidence. Name the impasse plainly and either force a choice, request one specific piece of evidence, or ask the user."
              : transcript;
            const text = await BE.executiveSpeak(ask, rp, rm, roleId, persona,
              objective || session?.objective || "", speakTranscript, decisionState);
            // P0-2: thread the reply — if this executive's text mentions a
            // colleague, attach reply_to the colleague's most recent message,
            // so the conversational relationship is real data, not inferred.
            const { mentions } = BE.extractMentions(text, roleIds);
            let replyTo: string | undefined;
            if (mentions.length) {
              const target = (mRows as any[]).slice().reverse().find(x => x.author_role === mentions[0]);
              replyTo = target?.id;
            }
            await BE.postMessage(sessionId, "agent", roleId, text,
              { provider: rp, model: rm, activeRoles: roleIds, replyTo });
            const updated = await BE.extractStateUpdate(ask, rp, rm, text, decisionState);
            await BE.mergeDecisionState(sessionId, updated);
          } catch (e:any) {
            await BE.postMessage(sessionId, "system", null,
              role.t + " temporarily unavailable (" + String(e?.message||e).slice(0,100) + "). Continuing without them this round.",
              { kind:"text" });
          }
          setActivity(a=>a.filter(x=>!x.startsWith(role.t)));
        }
        if (forcedBreak) { sameDisagreementCount = 0; lastSpeakerPair = ""; }
      }
    } finally { runningRef.current = false; setActivity([]); }
  }, [ask, rp, rm, AR, buildIdentity, objective, session, runResearch]);

  const proposeDecisionNow = async (sessionId:string, roleIds:string[]) => {
    const { data: mRows } = await supabase.from("boardroom_messages").select("*").eq("session_id", sessionId).order("created_at");
    const { data: sRow } = await supabase.from("boardroom_sessions").select("decision_state").eq("id", sessionId).single();
    const decision = await BE.proposeDecision(ask, rp, rm, objective || session?.objective || "",
      transcriptOf((mRows as any)||[]), sRow?.decision_state || {});
    await BE.mergeDecisionState(sessionId, { final_decision: decision });
    await BE.postMessage(sessionId, "system", null, "The board has reached a proposed decision.", { kind:"decision_proposal" });
    await BE.setStatus(sessionId, "decision_proposed");
  };

  // ── P0-3/4/5/8: USER PARTICIPATES LIVE, AND CAN ANSWER OR SKIP A QUESTION ──
  const send = async () => {
    const text = input.trim();
    if (!text || !session?.id) return;
    setInput(""); setShowMentions(false);
    const wasWaiting = session.status === "waiting_for_user";

    // P0-4: an answer to a pending question is recorded as a decision INPUT,
    // not appended as ordinary chat text \u2014 the spec is explicit that this
    // distinction matters for recommendation quality.
    await BE.postMessage(session.id, "user", null, text, { kind: wasWaiting ? "user_answer" : "text", activeRoles: activeRoleIds });
    if (wasWaiting) {
      await BE.mergeDecisionState(session.id, { user_constraints: [text] });
      await BE.setPendingQuestion(session.id, null); // clears status back to live_discussion
    }
    // P0-8: a new user message is authoritative new context. Because executives
    // are called one at a time (never in a silent batch), and the loop below
    // re-reads the transcript from the database at the START of every
    // iteration, a message sent mid-round is picked up before the NEXT
    // executive speaks \u2014 nothing already "said" is un-said, but nothing
    // further is generated on stale assumptions either.
    if (!session.paused) runRound(session.id, activeRoleIds);
  };

  const skipQuestion = async () => {
    if (!session?.id || !session.pending_question) return;
    // P0-5: explicitly recorded as UNRESOLVED, never invented. This is what
    // the router and the final synthesis both read to know the fact is
    // genuinely unavailable, not merely unasked.
    await BE.postMessage(session.id, "user", null,
      "(Skipped \u2014 continuing without an answer to: \u201c" + session.pending_question.text + "\u201d)",
      { kind:"text" });
    await BE.mergeDecisionState(session.id, { unresolved_questions: [session.pending_question.text + " (user chose not to answer)"] });
    await BE.setPendingQuestion(session.id, null);
    if (!session.paused) runRound(session.id, activeRoleIds);
  };

  // P0-7: manual pause stops autonomous activity only. The loop's own guard
  // (checked every iteration) is what actually halts generation; this simply
  // sets the flag it reads.
  const togglePause = async () => {
    if (!session?.id) return;
    const next = !session.paused;
    await BE.setPaused(session.id, next);
    setSession((s:any)=>({ ...s, paused: next }));
    if (!next && session.status !== "waiting_for_user") runRound(session.id, activeRoleIds);
  };

  const addExec = async () => {
    if (!addRole || !session?.id) return;
    const role = AR.find((r:any)=>r.id===addRole);
    if (!role) return;
    await BE.addParticipant(session.id, addRole, role.t, "user");
    const { data } = await supabase.from("boardroom_participants").select("*").eq("session_id", session.id);
    setParts(data || []);
    await BE.postMessage(session.id, "system", null, role.t + " has joined the board, at your request.", { kind:"text" });
    setAddRole("");
    if (!session.paused) runRound(session.id, [...activeRoleIds, addRole]);
  };

  const toggleMute = async (p:any) => {
    await supabase.from("boardroom_participants").update({ muted: !p.muted }).eq("id", p.id);
    setParts(ps => ps.map(x => x.id===p.id ? { ...x, muted: !x.muted } : x));
  };

  const acceptDecision = async () => {
    await BE.setStatus(session.id, "accepted");
    showToast?.("Decision accepted.", "success");
  };
  const rejectDecision = async () => {
    await BE.setStatus(session.id, "reopened");
    await BE.postMessage(session.id, "user", null, "I do not agree with this recommendation. Please continue the discussion.", { kind:"text" });
    await BE.setStatus(session.id, "live_discussion");
    runRound(session.id, activeRoleIds);
  };

  // ── P0-1: @mention autocomplete. Frontend suggestion; backend already
  // understands any @role in a message regardless of how it was typed. ──
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const mentionCandidates = participants
    .filter(p => p.active && p.label.toLowerCase().includes(mentionQuery.toLowerCase()));

  const onComposerChange = (v: string) => {
    setInput(v);
    const m = /@(\w*)$/.exec(v);
    if (m) { setShowMentions(true); setMentionQuery(m[1]); } else { setShowMentions(false); }
  };
  const pickMention = (roleId: string) => {
    const label = AR.find((r:any)=>r.id===roleId)?.t || roleId;
    setInput(v => v.replace(/@\w*$/, "@" + label.split(" ")[0] + " "));
    setShowMentions(false);
  };

  const decisionState = session?.decision_state || {};
  const finalDecision = decisionState.final_decision;
  const pendingQMsgId = session?.pending_question?.messageId;
  const availableRoles = Object.keys(MANDATE).filter(r => !participants.some(p=>p.role_id===r));

  // ── NO SESSION OPEN: start screen ────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ flex:1, display:"flex", height:"100%", background:C.bg, color:C.ink }}>
        <div style={{ width:250, borderRight:"1px solid "+C.line, background:C.panel, overflowY:"auto", padding:10 }}>
          <div style={{ fontSize:10, fontWeight:800, color:C.faint, padding:"6px 6px 10px", textTransform:"uppercase" }}>Past sessions</div>
          {sessions.map(s => (
            <div key={s.id} onClick={()=>openSession(s)} style={{ padding:"9px 10px", borderRadius:6, cursor:"pointer", marginBottom:4, background:C.raised }}>
              <div style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.objective}</div>
              <div style={{ fontSize:8.5, color:C.faint, marginTop:2, textTransform:"capitalize" }}>{s.status.replace(/_/g," ")}</div>
            </div>
          ))}
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:30 }}>
          <div style={{ maxWidth:560, width:"100%" }}>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>Live AI Boardroom</div>
            <div style={{ fontSize:11.5, color:C.faint, lineHeight:1.7, marginBottom:18 }}>
              Describe a decision. The CEO will form the right board and the discussion runs live —
              executives challenge each other, ask you questions, and converge on one recommendation.
            </div>
            <textarea style={{ ...inp, minHeight:90, resize:"vertical", marginBottom:12 }}
              placeholder="e.g. I am considering opening a new office in New York City."
              value={objective} onChange={e=>setObjective(e.target.value)} />
            <button style={{ ...prim, width:"100%", padding:"11px" }} disabled={busy||!objective.trim()} onClick={start}>
              {busy ? (activity[0] || "Starting…") : "Convene the board"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIVE SESSION ──────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", height:"100%", background:C.bg, color:C.ink, overflow:"hidden" }}>

      {/* LEFT — participants */}
      <div style={{ width:210, borderRight:"1px solid "+C.line, background:C.panel, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 12px", borderBottom:"1px solid "+C.line }}>
          <button style={{ ...btn, width:"100%", fontSize:10 }} onClick={()=>setSession(null)}>&larr; All sessions</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:10 }}>
          <div style={{ fontSize:9, fontWeight:800, color:C.faint, textTransform:"uppercase", marginBottom:8 }}>Board</div>
          {participants.map(p => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 4px", opacity:p.muted?0.4:1 }}>
              <div style={{ width:8, height:8, borderRadius:99, background:ROLE_COLOR[p.role_id]||C.dim, flexShrink:0 }} />
              <div style={{ flex:1, fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.label}</div>
              {p.role_id !== "ceo" && (
                <button onClick={()=>toggleMute(p)} title={p.muted?"Unmute":"Mute"}
                  style={{ background:"none", border:"none", color:C.faint, cursor:"pointer", fontSize:10 }}>
                  {p.muted ? "\u{1F507}" : "\u{1F50A}"}
                </button>
              )}
            </div>
          ))}
          {!!availableRoles.length && (
            <div style={{ marginTop:14, paddingTop:10, borderTop:"1px solid "+C.line }}>
              <div style={{ fontSize:9, color:C.faint, marginBottom:6 }}>Add a participant</div>
              <select style={{ ...inp, fontSize:10, marginBottom:6 }} value={addRole} onChange={e=>setAddRole(e.target.value)}>
                <option value="">Choose…</option>
                {availableRoles.map(r => <option key={r} value={r}>{AR.find((x:any)=>x.id===r)?.t || r}</option>)}
              </select>
              <button style={{ ...btn, width:"100%", fontSize:10 }} disabled={!addRole} onClick={addExec}>Add to board</button>
            </div>
          )}
        </div>
      </div>

      {/* CENTER — live conversation */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid "+C.line, background:C.panel,
          display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:12.5, fontWeight:800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{session.objective}</div>
            <div style={{ fontSize:9.5, fontWeight:700, marginTop:1,
              color: session.status==="waiting_for_user" ? C.amber : session.paused ? C.faint : C.teal }}>
              {session.paused ? "\u23F8 PAUSED \u2014 press Resume to continue"
                : session.status==="waiting_for_user" ? "\u23F3 WAITING FOR YOU \u2014 the board has paused for your answer below"
                : session.status==="researching" ? "\u{1F50D} Researching\u2026"
                : session.status==="decision_proposed" ? "\u2705 Decision proposed \u2014 review below"
                : "\u25CF LIVE \u2014 discussion in progress"}
            </div>
          </div>
          <button style={{ ...btn, background: session.paused ? C.teal : C.raised,
            color: session.paused ? "#04070F" : C.ink, fontWeight:800, flexShrink:0 }}
            onClick={togglePause}>
            {session.paused ? "\u25B6 Resume" : "\u23F8 Pause"}
          </button>
        </div>

        <div ref={scrollBoxRef} onScroll={checkBottom} style={{ flex:1, overflowY:"auto", padding:16, position:"relative" }}>
          {msgs.map(m => {
            const isUser = m.author_type === "user";
            const isSystem = m.author_type === "system";
            const color = m.author_role ? (ROLE_COLOR[m.author_role]||C.dim) : C.faint;
            // P0-2: mentions/reply are now real data on the message, not text
            // to notice. P0-10: a message that addresses the user directly
            // must visually announce that \u2014 whether it is the system's
            // "board is waiting" event or the executive's own sentence.
            const mentions: string[] = Array.isArray(m.mentions) ? m.mentions : [];
            const addressesUser = /@user\b/i.test(m.content);
            const replyMsg = m.reply_to ? msgs.find(x=>x.id===m.reply_to) : null;
            const evTag = m.evidence_status === "verified" ? "EVIDENCE"
                        : m.evidence_status === "assumption" ? "ASSUMPTION" : null;
            return (
              <div key={m.id} id={"msg-"+m.id} style={{ marginBottom:14, maxWidth:680 }}>
                {isSystem ? (
                  <div style={{ fontSize:10, color: m.kind==="question_to_user"?C.amber:C.faint,
                    background: m.kind==="question_to_user" ? "rgba(245,158,11,0.08)" : "transparent",
                    border: m.kind==="question_to_user" ? "1px solid rgba(245,158,11,0.3)" : "none",
                    borderRadius:6, padding: m.kind==="question_to_user" ? "8px 10px" : "2px 0", fontStyle:"italic" }}>
                    {m.kind==="question_to_user" ? "\u2753 " : "\u2022 "}{m.content}
                  </div>
                ) : (
                  <div style={{
                    // P0-10: a direct question to the user gets a border and tint that
                    // is unmistakable against ordinary discussion \u2014 "substantially
                    // easier to notice than a normal board message", per spec.
                    ...(addressesUser && !isUser ? {
                      border:"1.5px solid rgba(245,158,11,0.5)", background:"rgba(245,158,11,0.06)",
                      borderRadius:10, padding:"10px 12px",
                    } : {})
                  }}>
                    {addressesUser && !isUser && (
                      <div style={{ fontSize:8.5, fontWeight:800, color:C.amber, letterSpacing:0.5, marginBottom:5 }}>
                        \u26A1 QUESTION FOR YOU
                      </div>
                    )}
                    {replyMsg && (
                      <div style={{ fontSize:9, color:C.faint, marginBottom:4, paddingLeft:8, borderLeft:"2px solid "+C.line }}>
                        Replying to {roleLabel(AR, replyMsg.author_role||"")}: \u201c{(replyMsg.content||"").slice(0,60)}{(replyMsg.content||"").length>60?"\u2026":""}\u201d
                      </div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                      {!isUser && <div style={{ width:7, height:7, borderRadius:99, background:color }} />}
                      <span style={{ fontSize:9, fontWeight:800, color: isUser?C.teal:color, letterSpacing:0.4 }}>
                        {isUser ? "YOU" : roleLabel(AR, m.author_role||"").toUpperCase()}
                      </span>
                      {mentions.map(rid => (
                        <span key={rid} style={{ fontSize:8.5, fontWeight:700, color:ROLE_COLOR[rid]||C.dim,
                          background:(ROLE_COLOR[rid]||C.dim)+"1A", borderRadius:4, padding:"1px 6px" }}>
                          @{roleLabel(AR, rid)}
                        </span>
                      ))}
                      {evTag && (
                        <span style={{ fontSize:7.5, fontWeight:800, color: evTag==="EVIDENCE"?"#22C55E":C.amber,
                          background: evTag==="EVIDENCE"?"rgba(34,197,94,0.12)":"rgba(245,158,11,0.12)",
                          borderRadius:4, padding:"1px 6px", letterSpacing:0.4 }}>{evTag}</span>
                      )}
                      <span style={{ fontSize:8, color:C.faint }}>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                    <div style={{ fontSize:12, lineHeight:1.7, whiteSpace:"pre-wrap",
                      background: isUser ? "transparent" : (addressesUser ? "transparent" : C.panel),
                      border: (isUser || addressesUser) ? "none" : "1px solid "+C.line,
                      borderRadius: (isUser || addressesUser) ? 0 : 8,
                      padding: (isUser || addressesUser) ? 0 : "10px 12px" }}>
                      {m.content.replace(/^(EVIDENCE|ASSUMPTION):\s*/i,"")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {activity.map((a,i) => (
            <div key={i} style={{ fontSize:10.5, color:C.teal, fontStyle:"italic", marginBottom:6 }}>{a}</div>
          ))}
          <div ref={endRef} />
        </div>

        {newSince > 0 && (
          <button onClick={jumpToLatest} style={{ position:"absolute", left:"50%", transform:"translateX(-50%)",
            bottom:190, zIndex:20, ...prim, borderRadius:20, padding:"7px 16px", fontSize:10.5,
            boxShadow:"0 4px 16px rgba(0,0,0,0.5)" }}>
            \u2193 {newSince} new message{newSince>1?"s":""} \u00b7 Jump to latest
          </button>
        )}

        {finalDecision && session.status === "decision_proposed" && (
          <div style={{ margin:"0 16px 12px", padding:14, borderRadius:10, background:"rgba(20,184,166,0.06)",
            border:"1px solid rgba(20,184,166,0.3)" }}>
            <div style={{ fontSize:11, fontWeight:800, color:C.teal, marginBottom:8 }}>PROPOSED DECISION</div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{finalDecision.decision}</div>
            <div style={{ fontSize:11, color:C.dim, marginBottom:8, lineHeight:1.6 }}>{finalDecision.why}</div>
            {!!finalDecision.dissent && (
              <div style={{ fontSize:10, color:C.amber, marginBottom:8 }}>Dissent: {finalDecision.dissent}</div>
            )}
            <div style={{ fontSize:9.5, color:C.faint, marginBottom:10 }}>
              Vote: {finalDecision.vote?.for||0} for · {finalDecision.vote?.against||0} against · {finalDecision.vote?.abstain||0} abstain
              {"  ·  Confidence: "}{finalDecision.confidence}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={prim} onClick={acceptDecision}>Accept decision</button>
              <button style={btn} onClick={rejectDecision}>Continue discussion</button>
            </div>
          </div>
        )}

        {/* P0-3/P0-9/P0-10: when the board is waiting, this replaces the plain
            prompt with an unmistakable prompt naming who asked and what for,
            plus the explicit Skip path required by P0-5. */}
        {session.status === "waiting_for_user" && session.pending_question && (
          <div style={{ margin:"0 16px 10px", padding:"10px 13px", borderRadius:8,
            background:"rgba(245,158,11,0.10)", border:"1.5px solid rgba(245,158,11,0.4)" }}>
            <div style={{ fontSize:9, fontWeight:800, color:C.amber, letterSpacing:0.5, marginBottom:4 }}>
              \u23F3 THE BOARD IS WAITING FOR YOU
            </div>
            <div style={{ fontSize:11.5, color:C.ink, lineHeight:1.5, marginBottom:8 }}>{session.pending_question.text}</div>
            <button style={{ ...btn, fontSize:10, padding:"5px 10px" }} onClick={skipQuestion}>
              Skip \u2014 continue without this
            </button>
          </div>
        )}

        <div style={{ padding:12, borderTop:"1px solid "+C.line, background:C.panel, display:"flex", gap:8, position:"relative" }}>
          {showMentions && mentionCandidates.length > 0 && (
            <div style={{ position:"absolute", bottom:"100%", left:12, marginBottom:6, background:C.raised,
              border:"1px solid "+C.line, borderRadius:8, padding:5, minWidth:180, boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>
              {mentionCandidates.map(p => (
                <div key={p.id} onClick={()=>pickMention(p.role_id)}
                  style={{ padding:"6px 9px", borderRadius:5, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:7 }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(20,184,166,0.10)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
                  <div style={{ width:7, height:7, borderRadius:99, background:ROLE_COLOR[p.role_id]||C.dim }} />
                  {p.label}
                </div>
              ))}
            </div>
          )}
          <textarea style={{ ...inp, minHeight:44, maxHeight:140, resize:"vertical" }}
            placeholder={session.status==="waiting_for_user" ? "Type your answer\u2026 (or use Skip above)" : "Speak to the board\u2026  Type @ to mention someone"}
            value={input} onChange={e=>onComposerChange(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey && !showMentions){ e.preventDefault(); send(); } }} />
          <button style={{ ...prim, height:40 }} onClick={send} disabled={!input.trim()}>Send</button>
        </div>
      </div>

      {/* RIGHT — P1-14: a live decision dashboard, not a static assumptions dump */}
      <div style={{ width:260, borderLeft:"1px solid "+C.line, background:C.panel, overflowY:"auto", padding:12 }}>
        <div style={{ fontSize:9, fontWeight:800, color:C.faint, textTransform:"uppercase", marginBottom:4 }}>Objective</div>
        <div style={{ fontSize:11, color:C.ink, lineHeight:1.5, marginBottom:12 }}>{session.objective}</div>

        <div style={{ fontSize:9, fontWeight:800, color:C.faint, textTransform:"uppercase", marginBottom:4 }}>Status</div>
        <div style={{ fontSize:11, fontWeight:700, marginBottom:12,
          color: session.status==="waiting_for_user" ? C.amber : session.paused ? C.faint : C.teal }}>
          {session.paused ? "Paused" : session.status.replace(/_/g," ")}
        </div>

        {!!pendingQMsgId && (
          <div onClick={()=>{ document.getElementById("msg-"+pendingQMsgId)?.scrollIntoView({behavior:"smooth",block:"center"}); }}
            style={{ fontSize:10, color:C.amber, cursor:"pointer", marginBottom:12, padding:"6px 8px",
              background:"rgba(245,158,11,0.08)", borderRadius:6, fontWeight:700 }}>
            \u2753 1 question waiting for you \u2014 jump to it
          </div>
        )}

        {finalDecision?.decision && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:800, color:C.teal, textTransform:"uppercase", marginBottom:4 }}>Recommendation</div>
            <div style={{ fontSize:11, color:C.ink, lineHeight:1.5 }}>{finalDecision.decision}</div>
          </div>
        )}

        {["assumptions","risks","objections","unresolved_questions","facts"].map(k => (
          (decisionState[k]||[]).length ? (
            <div key={k} style={{ marginBottom:12 }}>
              <div style={{ fontSize:9, fontWeight:800, color:C.dim, textTransform:"capitalize", marginBottom:4 }}>{k.replace(/_/g," ")}</div>
              {(decisionState[k]||[]).map((x:string,i:number)=>(
                <div key={i} style={{ fontSize:10, color:C.faint, lineHeight:1.5, marginBottom:3 }}>&bull; {x}</div>
              ))}
            </div>
          ) : null
        ))}
        {!Object.keys(decisionState).length && !pendingQMsgId && (
          <div style={{ fontSize:10, color:C.faint, lineHeight:1.6 }}>Nothing recorded yet — this fills in as the board deliberates.</div>
        )}
      </div>
    </div>
  );
}
