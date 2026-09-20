import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";

/* ============================================================================
 * JARVIS — Phase 2: a real conversational agent, not just a signal feed.
 * Still Tier 1 only — nothing in this file executes any action anywhere
 * else in the platform. It can now: hold an actual conversation, answer
 * with real platform numbers (not guesses), reason using genuine knowledge
 * about this codebase's structure and known risk areas, and — when a
 * Claude or Gemini key is available — search the web for anything current
 * (news, prices, rates). NVIDIA's free tier does not support search; a
 * NVIDIA-only user gets an honest answer from the model's own knowledge
 * instead of a live lookup, not a silent wrong one.
 * ========================================================================== */

// GENUINE, WRITTEN KNOWLEDGE ABOUT THIS CODEBASE — not live code-reading
// (a deployed browser app has no access to the GitHub repo at runtime, so
// that specific ask is not technically possible here). This is instead a
// direct summary of real, hard-won facts learned while building this
// platform, given to JARVIS as background so its answers about "what's
// risky" or "what touches what" are grounded in something true rather
// than invented. It will drift out of date as the codebase changes —
// worth refreshing periodically, the same way this was written.
const ARCHITECTURE_BRIEFING = `
KNOWN STRUCTURE AND RISK AREAS OF THIS CODEBASE (OrchestrIQ):
- App.tsx is the single largest file (10,000+ lines) and the true center of
  gravity — routing between every module, all AI provider orchestration
  (callMulti/callAI/resolveRoute), Executive Chat, Project Engine, Settings,
  onboarding. Because so much lives here, changes to it carry the highest
  blast radius of any file in the app — a past incident here took down the
  login page for every user.
- main.tsx is the TRUE entry point, separate from App.tsx — it decides
  whether to show the login screen or the main app. It runs its OWN
  Supabase auth-state listener, independent of Auth.tsx's. These two not
  agreeing on what counts as "signed in" has been a real, confirmed source
  of bugs (a password-reset link once logged users straight in instead of
  letting them set a new password, because of exactly this).
- functions/api/nvidia.ts is a Cloudflare Pages Function — a SEPARATE
  deployment from the main app, easy to forget about when investigating an
  issue. It holds the shared free-tier NVIDIA key pool (currently multiple
  keys, load-balanced) and its own rate limiting. Free-tier NVIDIA issues
  almost always trace back to this file or its Cloudflare environment
  variables, not the main app.
- Whether a user can use the shared NVIDIA tier depends on TWO independent
  systems: a database-level plan/user grant (workspace_shared_nvidia in
  plan_features / user_feature_grants) AND the Cloudflare-side rate pool.
  A "doesn't work for this one user" report needs both checked, not just one.
- CostArchitecture.tsx and its lib/ engines (CostEngine, PricingEngine,
  WorkforceEngine, etc.) hold real, carefully verified financial formulas.
  Margin figures depend on client-side BOM rollup logic that is NOT
  duplicated in the database — so database-level monitoring of margins
  directly is deliberately avoided in favor of monitoring inputs like
  price history instead, to avoid two versions of the same math drifting
  apart silently.
- A recurring pattern worth watching for: this platform evolved from an
  earlier local-only prototype into a real cloud backend, and some text and
  logic describing "your data lives only in this browser" survived that
  transition in multiple places despite being factually wrong. If similar
  stale assumptions turn up elsewhere, they follow this same pattern.
- Every database table has row-level security enabled; admin actions are
  checked at the database level via assert_capability(), not only hidden in
  the UI — a real, confirmed security property, not a claim.
`.trim();

type ChatMsg = { role:"user"|"assistant"; content:string };

const C = {
  bg:"#070B14", panel:"#0F1420", raised:"#0A0E1A", line:"#1A2030",
  ink:"#F1F5F9", dim:"#A0AAC0", faint:"#5A6480", teal:"#14B8A6",
  amber:"#F59E0B", red:"#EF4444", green:"#22C55E",
};

const SEVERITY_COLOR: Record<string,string> = { low:C.dim, medium:C.amber, high:"#F97316", critical:C.red };
const TYPE_ICON: Record<string,string> = { anomaly:"⚠", risk:"⚠", opportunity:"💡", failure:"✕", bottleneck:"⏳" };

type Signal = {
  id:string; source_module:string; signal_type:string; severity:string;
  title:string; description:string; data:any; status:string; detected_at:string;
};
type Recommendation = {
  id:string; signal_id:string; root_cause:string; recommendation:string;
  confidence:string; provider:string; model:string; created_at:string;
};

export default function Jarvis({ ask, isOwner, availableProviders }: { ask:(sys:any,msg:any,maxT:number,enableSearch?:boolean,taskType?:string,provider?:string,model?:string)=>Promise<string>; isOwner?:boolean; availableProviders?: Array<{id:string;label:string}> }) {
  const [view, setView] = useState<"chat"|"signals">("chat");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [recos, setRecos] = useState<Record<string,Recommendation>>({});
  const [scanning, setScanning] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string|null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string|null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // VOICE — JARVIS speaks its replies aloud, on by default, one click to
  // mute. Uses the browser's own built-in speech synthesis - no new
  // provider, key, or cost involved.
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, thinking]);

  // PERSISTENCE, THE CONFIRMED GAP: conversations previously lived only in
  // React state and vanished on refresh — never actually saved anywhere,
  // despite looking like a real chat history.
  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoadingHistory(false); return; }
      const { data } = await supabase.from("jarvis_conversations").select("role,content")
        .eq("user_id", user.id).order("created_at",{ascending:true}).limit(40);
      setMessages((data||[]).map((m:any)=>({ role:m.role, content:m.content })));
      setLoadingHistory(false);
    })();
  }, []);

  const saveMsg = async (role:"user"|"assistant", content:string) => {
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (user) await supabase.from("jarvis_conversations").insert({ user_id:user.id, role, content, provider: provider||null });
    } catch {}
  };

  const speak = (text:string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel(); // never speaks two replies on top of each other
      const clean = text.replace(/[*#_`]/g,"").slice(0,1000); // strip markdown JARVIS would otherwise read literally
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const toggleListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice input isn't supported in this browser — try Chrome or Edge."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e:any) => { setChatInput(prev => (prev ? prev + " " : "") + e.results[0][0].transcript); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec; rec.start(); setListening(true);
  };

  const load = useCallback(async () => {
    const { data: sigs } = await supabase.from("jarvis_signals").select("*")
      .neq("status","dismissed").order("severity",{ascending:false}).order("detected_at",{ascending:false});
    setSignals(sigs || []);
    const { data: r } = await supabase.from("jarvis_recommendations").select("*").order("created_at",{ascending:false});
    const byId: Record<string,Recommendation> = {};
    (r || []).forEach((rec:any) => { if(!byId[rec.signal_id]) byId[rec.signal_id]=rec; }); // most recent per signal
    setRecos(byId);
  }, []);
  useEffect(() => { load(); }, [load]);

  const getSnapshot = async () => {
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.rpc("jarvis_platform_snapshot", { p_user_id: user.id });
      return data;
    } catch { return null; }
  };

  const sentContextThisSession = useRef(false);

  const sendChat = async (text?: string) => {
    const userText = (text ?? chatInput).trim();
    if (!userText || thinking) return;
    setChatInput("");
    saveMsg("user", userText);
    const nextMsgs: ChatMsg[] = [...messages, { role:"user", content:userText }];
    setMessages(nextMsgs);
    setThinking(true); setError(null);
    try {
      // TOKEN EFFICIENCY, FIXED PROPERLY: with conversations now persisted
      // across sessions, messages.length is no longer a safe way to tell
      // "is this genuinely the first turn" — loaded history would make it
      // look like every session is a continuation, so the platform
      // snapshot would never refresh again after the very first day. This
      // tracks it per browser session instead, so it's still sent once
      // when you open JARVIS today, even if yesterday's conversation loaded in.
      const isFirstTurn = !sentContextThisSession.current;
      sentContextThisSession.current = true;
      const snapshot = isFirstTurn ? await getSnapshot() : null;

      const corePersonality = "You are JARVIS, the operating intelligence for a business platform called OrchestrIQ, speaking directly with " +
        (isOwner ? "the platform's owner" : "a user of the platform") + ". Be direct, specific, and genuinely knowledgeable — " +
        "like a top-tier colleague, not a scripted assistant. You currently have NO ability to change, delete, or execute " +
        "anything — you can only observe, analyze, and recommend; say so plainly if asked to act. " +
        "If a question needs information, access, or a capability you don't currently have, say exactly that — name what's " +
        "missing and what would need to be added to do it — rather than pretending, refusing vaguely, or staying silent.";

      const sys = isFirstTurn
        ? corePersonality + "\n\nREAL, CURRENT PLATFORM DATA (use this for any question about users, plans, or open issues — never guess a number):\n" +
          JSON.stringify(snapshot || {}) + "\n\n" + ARCHITECTURE_BRIEFING
        : corePersonality; // later turns rely on the conversation history below for continuity, not a resent briefing

      const history = nextMsgs.slice(-10).map(m => ({ role:m.role, content:m.content }));
      // A DEFENSIVE TIMEOUT: if a reply never comes back for any reason,
      // this turns silence into a clear message within a bounded wait,
      // rather than a chat that just looks frozen with no explanation.
      const reply = await Promise.race([
        ask(sys, history, 900, true, "jarvis", provider || undefined),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("JARVIS didn't respond in time. This is usually a busy AI provider — try again in a moment, or switch models in Settings.")), 45000)),
      ]);
      setMessages(m => [...m, { role:"assistant", content:reply }]);
      saveMsg("assistant", reply);
      speak(reply);
    } catch (e:any) {
      setError(e.message);
      setMessages(m => [...m, { role:"assistant", content:"I ran into a problem answering that: " + e.message }]);
    }
    setThinking(false);
  };

  const analyzeEverything = async () => {
    setThinking(true);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (user) { try { await supabase.rpc("jarvis_detect_cost_signals", { p_user_id: user.id }); } catch {} }
      await load();
    } finally {
      await sendChat("Analyze the entire platform right now: check current signals, current platform numbers, and tell me plainly what's working, what isn't, and what deserves my attention first. Be specific, not generic.");
    }
  };

  const runScan = async () => {
    setScanning(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      // Phase 1 has one detector. Each future module's detector is a
      // separate RPC added to this same array — the framework doesn't
      // change when more are added, only this list grows.
      const detectors = ["jarvis_detect_cost_signals"];
      for (const fn of detectors) {
        await supabase.rpc(fn, { p_user_id: user.id });
      }
      await load();
    } catch (e:any) { setError(e.message); }
    setScanning(false);
  };

  const diagnose = async (sig: Signal) => {
    setDiagnosing(sig.id); setError(null);
    try {
      const sys = "You are JARVIS, an operating intelligence for a business platform called OrchestrIQ. " +
        "You have been given ONE detected signal and its raw supporting data. Your job: identify the most " +
        "likely root cause, and give one clear, concrete, actionable recommendation. Be direct and specific — " +
        "reference the actual numbers given. Do not hedge with generic advice. " +
        "Respond in exactly this format:\nROOT CAUSE: <one or two sentences>\nRECOMMENDATION: <one clear, specific action>\nCONFIDENCE: <low|medium|high>";
      const userMsg = `Signal: ${sig.title}\nModule: ${sig.source_module}\nType: ${sig.signal_type}\nSeverity: ${sig.severity}\n` +
        `Description: ${sig.description}\nRaw data: ${JSON.stringify(sig.data)}`;
      const text = await ask(sys, [{role:"user",content:userMsg}], 500);
      const rootCause = /ROOT CAUSE:\s*([\s\S]*?)(?:\nRECOMMENDATION:|$)/i.exec(text)?.[1]?.trim() || "";
      const recommendation = /RECOMMENDATION:\s*([\s\S]*?)(?:\nCONFIDENCE:|$)/i.exec(text)?.[1]?.trim() || text.trim();
      const confidence = /CONFIDENCE:\s*(low|medium|high)/i.exec(text)?.[1]?.toLowerCase() || "medium";

      const { data:{ user } } = await supabase.auth.getUser();
      await supabase.from("jarvis_recommendations").insert({
        signal_id: sig.id, user_id: user?.id, root_cause: rootCause,
        recommendation, confidence, tier: 1,
      });
      await supabase.from("jarvis_signals").update({ status:"recommended" }).eq("id", sig.id);
      await load();
    } catch (e:any) { setError(e.message); }
    setDiagnosing(null);
  };

  const dismiss = async (id:string) => {
    await supabase.from("jarvis_signals").update({ status:"dismissed" }).eq("id", id);
    await load();
  };

  const filtered = signals.filter(s => filter==="all" || s.source_module===filter);
  const modules = Array.from(new Set(signals.map(s=>s.source_module)));

  return (
    <div style={{ padding:20, maxWidth:900, margin:"0 auto", display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:C.ink, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:C.teal }}>◈</span> JARVIS
          </div>
          <div style={{ fontSize:11.5, color:C.faint, marginTop:2 }}>
            Advisory only — observes, analyzes, and recommends. Cannot change anything without you.
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>setView("chat")} style={{ background: view==="chat"?C.teal:C.panel, color: view==="chat"?"#04070F":C.dim,
            border:"1px solid "+C.line, borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Chat</button>
          <button onClick={()=>setView("signals")} style={{ background: view==="signals"?C.teal:C.panel, color: view==="signals"?"#04070F":C.dim,
            border:"1px solid "+C.line, borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            Signals{signals.length ? ` (${signals.length})` : ""}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8,
          padding:"8px 12px", marginTop:12, fontSize:11.5, color:C.red }}>{error}</div>
      )}

      {view === "chat" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0, marginTop:14 }}>
          {/* MODEL PICKER + VOICE TOGGLE — pick which real, configured
              provider answers (Claude/NVIDIA/DeepSeek/Gemini/OpenAI, or
              "Auto" for the platform's normal routing), and mute JARVIS
              speaking its replies aloud without losing text output. */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <select value={provider} onChange={e=>setProvider(e.target.value)}
              style={{ background:C.raised, border:"1px solid "+C.line, borderRadius:6, padding:"5px 8px", color:C.dim, fontSize:11 }}>
              <option value="">Auto (recommended)</option>
              {(availableProviders||[]).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button onClick={()=>setVoiceOn(v=>{ if(v) window.speechSynthesis?.cancel(); return !v; })}
              title={voiceOn ? "Mute JARVIS's voice" : "Un-mute JARVIS's voice"}
              style={{ background:"transparent", border:"1px solid "+C.line, borderRadius:6, padding:"5px 10px", color: voiceOn?C.teal:C.faint, fontSize:11, cursor:"pointer" }}>
              {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
            </button>
          </div>
          {loadingHistory && <div style={{ fontSize:11, color:C.faint, textAlign:"center", padding:10 }}>Loading your last conversation…</div>}
          {!loadingHistory && messages.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:C.faint }}>
              <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>◈</div>
              <div style={{ fontSize:13, marginBottom:4 }}>Ask me anything about the platform, or the world.</div>
              <div style={{ fontSize:11, marginBottom:16 }}>"How many Enterprise users do we have?" · "Is anything broken right now?" · "What's gold trading at today?"</div>
              <button onClick={analyzeEverything} disabled={thinking}
                style={{ background:C.teal, color:"#04070F", border:"none", borderRadius:8, padding:"9px 18px",
                  fontWeight:700, fontSize:12, cursor:"pointer", opacity:thinking?0.6:1 }}>
                Analyze the entire platform now
              </button>
            </div>
          )}
          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:12, paddingBottom:10 }}>
            {messages.map((m,i) => (
              <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth:"80%", background: m.role==="user" ? "rgba(20,184,166,0.10)" : C.panel,
                  border:"1px solid "+(m.role==="user"?"#14B8A633":C.line), borderRadius:10, padding:"10px 13px",
                  fontSize:12.5, color:C.ink, lineHeight:1.6, whiteSpace:"pre-wrap" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && <div style={{ fontSize:11, color:C.faint, fontStyle:"italic" }}>JARVIS is thinking…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:"1px solid "+C.line }}>
            <button onClick={toggleListen} title="Push to talk"
              style={{ background: listening?"#EF4444":C.raised, border:"1px solid "+(listening?"#EF4444":C.line), borderRadius:8,
                padding:"0 14px", color: listening?"#fff":C.dim, fontSize:14, cursor:"pointer" }}>
              {listening ? "◉" : "🎙"}
            </button>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendChat(); } }}
              placeholder="Ask JARVIS anything, or press 🎙 to speak…" disabled={thinking}
              style={{ flex:1, background:C.raised, border:"1px solid "+C.line, borderRadius:8, padding:"9px 12px",
                color:C.ink, fontSize:12.5, fontFamily:"inherit" }} />
            <button onClick={()=>sendChat()} disabled={thinking || !chatInput.trim()}
              style={{ background:C.teal, color:"#04070F", border:"none", borderRadius:8, padding:"0 18px",
                fontWeight:700, fontSize:12.5, cursor:"pointer", opacity:(thinking||!chatInput.trim())?0.4:1 }}>Send</button>
          </div>
        </div>
      )}

      {view === "signals" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
            <button onClick={runScan} disabled={scanning}
              style={{ background:C.teal, color:"#04070F", border:"none", borderRadius:8, padding:"7px 16px",
                fontWeight:700, fontSize:11.5, cursor:scanning?"default":"pointer", opacity:scanning?0.6:1 }}>
              {scanning ? "Scanning…" : "Run scan"}
            </button>
          </div>

          {modules.length > 0 && (
            <div style={{ display:"flex", gap:6, marginTop:12, marginBottom:12, flexWrap:"wrap" }}>
              {["all", ...modules].map(m => (
                <button key={m} onClick={()=>setFilter(m)}
                  style={{ background: filter===m ? C.teal : C.panel, color: filter===m ? "#04070F" : C.dim,
                    border:"1px solid "+C.line, borderRadius:20, padding:"4px 12px", fontSize:10.5, fontWeight:600, cursor:"pointer" }}>
                  {m === "all" ? "All" : m.replace(/_/g," ")}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.faint }}>
              <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>◈</div>
              <div style={{ fontSize:13 }}>Nothing found yet.</div>
              <div style={{ fontSize:11, marginTop:4 }}>Run a scan to have JARVIS check Cost Architecture for cost anomalies.</div>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
            {filtered.map(sig => {
              const reco = recos[sig.id];
              return (
                <div key={sig.id} style={{ background:C.panel, border:"1px solid "+C.line, borderRadius:10, padding:14 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ fontSize:16, color:SEVERITY_COLOR[sig.severity], flexShrink:0, marginTop:1 }}>
                      {TYPE_ICON[sig.signal_type] || "•"}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>{sig.title}</span>
                        <span style={{ fontSize:8.5, fontWeight:800, color:SEVERITY_COLOR[sig.severity], textTransform:"uppercase",
                          border:"1px solid "+SEVERITY_COLOR[sig.severity]+"55", borderRadius:4, padding:"1px 6px" }}>{sig.severity}</span>
                        <span style={{ fontSize:9.5, color:C.faint }}>{sig.source_module.replace(/_/g," ")}</span>
                      </div>
                      <div style={{ fontSize:11.5, color:C.dim, marginTop:5, lineHeight:1.5 }}>{sig.description}</div>

                      {reco && (
                        <div style={{ marginTop:10, padding:"10px 12px", background:C.raised, borderLeft:"2px solid "+C.teal, borderRadius:6 }}>
                          <div style={{ fontSize:9, fontWeight:800, color:C.teal, letterSpacing:0.4, marginBottom:4 }}>
                            JARVIS'S DIAGNOSIS {reco.confidence && `· ${reco.confidence} confidence`}
                          </div>
                          {reco.root_cause && <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}><b style={{color:C.ink}}>Root cause:</b> {reco.root_cause}</div>}
                          <div style={{ fontSize:11.5, color:C.ink }}><b>Recommendation:</b> {reco.recommendation}</div>
                        </div>
                      )}

                      <div style={{ display:"flex", gap:8, marginTop:10 }}>
                        {!reco && (
                          <button onClick={()=>diagnose(sig)} disabled={diagnosing===sig.id}
                            style={{ background:"transparent", border:"1px solid "+C.teal+"55", color:C.teal, borderRadius:6,
                              padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", opacity:diagnosing===sig.id?0.5:1 }}>
                            {diagnosing===sig.id ? "Thinking…" : "Ask JARVIS to diagnose"}
                          </button>
                        )}
                        <button onClick={()=>dismiss(sig.id)}
                          style={{ background:"transparent", border:"1px solid "+C.line, color:C.faint, borderRadius:6,
                            padding:"5px 12px", fontSize:11, cursor:"pointer" }}>Dismiss</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
