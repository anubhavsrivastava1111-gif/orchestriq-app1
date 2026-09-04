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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs.length, activity.length]);

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
      while (guard++ < 8) { // hard ceiling — a runaway loop must never be possible
        const { data: mRows } = await supabase.from("boardroom_messages").select("*").eq("session_id", sessionId).order("created_at");
        const { data: sRow } = await supabase.from("boardroom_sessions").select("decision_state,status").eq("id", sessionId).single();
        if (sRow?.status && ["decision_proposed","accepted","closed"].includes(sRow.status)) break;
        const transcript = transcriptOf((mRows as any) || []);
        const decisionState = sRow?.decision_state || {};

        setActivity(a=>[...a, "Boardroom is thinking…"]);
        const route = await BE.routeNext(ask, rp, rm, objective || session?.objective || "", roleIds, transcript, decisionState);
        setActivity([]);

        if (route.question_to_user) {
          await BE.postMessage(sessionId, "system", null,
            "The board needs your input: " + route.reason, { kind:"question_to_user" });
          break; // stop and wait — spec section 8: live, not deferred
        }
        if (route.research_needed.length) {
          setActivity(a=>[...a, "Researching: " + route.research_needed[0]]);
          const r = await runResearch(route.research_needed[0]);
          await BE.postMessage(sessionId, "system", null,
            "Additional research — " + route.research_needed[0] + ": " + r.text.slice(0,600), { kind:"evidence" });
          setActivity([]);
          continue;
        }
        if (route.ready_for_decision) {
          await proposeDecisionNow(sessionId, roleIds);
          break;
        }
        if (!route.speakers.length) break; // genuine silence — correct and common

        for (const roleId of route.speakers) {
          const role = AR.find((r:any)=>r.id===roleId);
          if (!role) continue;
          setActivity(a=>[...a, role.t + " is reviewing…"]);
          try {
            const persona = buildIdentity(role);
            const text = await BE.executiveSpeak(ask, rp, rm, roleId, persona,
              objective || session?.objective || "", transcript, decisionState);
            await BE.postMessage(sessionId, "agent", roleId, text, { provider: rp, model: rm });
            const updated = await BE.extractStateUpdate(ask, rp, rm, text, decisionState);
            await BE.mergeDecisionState(sessionId, updated);
          } catch (e:any) {
            await BE.postMessage(sessionId, "system", null,
              role.t + " temporarily unavailable (" + String(e?.message||e).slice(0,100) + "). Continuing without them this round.",
              { kind:"text" });
          }
          setActivity(a=>a.filter(x=>x!==role.t+" is reviewing…"));
        }
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

  // ── USER PARTICIPATES LIVE (spec section 7, 8, 21) ──────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || !session?.id) return;
    setInput("");
    await BE.postMessage(session.id, "user", null, text, { kind:"text" });
    // If the room was waiting on the user, this is the answer — merge it and resume.
    await BE.mergeDecisionState(session.id, { user_constraints: [text] });
    runRound(session.id, activeRoleIds);
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
    runRound(session.id, [...activeRoleIds, addRole]);
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

  const decisionState = session?.decision_state || {};
  const finalDecision = decisionState.final_decision;
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
        <div style={{ padding:"10px 16px", borderBottom:"1px solid "+C.line, background:C.panel }}>
          <div style={{ fontSize:12.5, fontWeight:800 }}>{session.objective}</div>
          <div style={{ fontSize:9, color:C.faint, textTransform:"capitalize" }}>{session.status.replace(/_/g," ")}</div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
          {msgs.map(m => {
            const isUser = m.author_type === "user";
            const isSystem = m.author_type === "system";
            const color = m.author_role ? (ROLE_COLOR[m.author_role]||C.dim) : C.faint;
            return (
              <div key={m.id} style={{ marginBottom:14, maxWidth:680 }}>
                {isSystem ? (
                  <div style={{ fontSize:10, color: m.kind==="question_to_user"?C.amber:C.faint,
                    background: m.kind==="question_to_user" ? "rgba(245,158,11,0.08)" : "transparent",
                    border: m.kind==="question_to_user" ? "1px solid rgba(245,158,11,0.3)" : "none",
                    borderRadius:6, padding: m.kind==="question_to_user" ? "8px 10px" : "2px 0", fontStyle:"italic" }}>
                    {m.kind==="question_to_user" ? "\u2753 " : "\u2022 "}{m.content}
                  </div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                      {!isUser && <div style={{ width:7, height:7, borderRadius:99, background:color }} />}
                      <span style={{ fontSize:9, fontWeight:800, color: isUser?C.teal:color, letterSpacing:0.4 }}>
                        {isUser ? "YOU" : roleLabel(AR, m.author_role||"").toUpperCase()}
                      </span>
                      <span style={{ fontSize:8, color:C.faint }}>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                    <div style={{ fontSize:12, lineHeight:1.7, whiteSpace:"pre-wrap",
                      background: isUser ? "transparent" : C.panel, border: isUser ? "none" : "1px solid "+C.line,
                      borderRadius: isUser ? 0 : 8, padding: isUser ? 0 : "10px 12px" }}>{m.content}</div>
                  </>
                )}
              </div>
            );
          })}
          {activity.map((a,i) => (
            <div key={i} style={{ fontSize:10.5, color:C.teal, fontStyle:"italic", marginBottom:6 }}>{a}</div>
          ))}
          <div ref={endRef} />
        </div>

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

        <div style={{ padding:12, borderTop:"1px solid "+C.line, background:C.panel, display:"flex", gap:8 }}>
          <textarea style={{ ...inp, minHeight:44, maxHeight:140, resize:"vertical" }}
            placeholder="Speak to the board…" value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } }} />
          <button style={{ ...prim, height:40 }} onClick={send} disabled={!input.trim()}>Send</button>
        </div>
      </div>

      {/* RIGHT — decision panel */}
      <div style={{ width:250, borderLeft:"1px solid "+C.line, background:C.panel, overflowY:"auto", padding:12 }}>
        <div style={{ fontSize:10, fontWeight:800, color:C.faint, textTransform:"uppercase", marginBottom:10 }}>Board state</div>
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
        {!Object.keys(decisionState).length && (
          <div style={{ fontSize:10, color:C.faint, lineHeight:1.6 }}>Nothing recorded yet — this fills in as the board deliberates.</div>
        )}
      </div>
    </div>
  );
}
