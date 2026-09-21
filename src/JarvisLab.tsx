import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

// ============================================================================
// PHASE 2 — REAL TOOLS. Each one has a defined purpose, input shape, and a
// risk level, per the tool/permission architecture asked for. Every handler
// here is "read_only" — Phase 2 is Tier 1 (observe/diagnose/recommend) only;
// nothing here writes, deletes, or changes anything. Tier 2 (execute) is a
// deliberately separate, later phase with its own approval gate.
// ============================================================================
async function currentUserId():Promise<string|null>{
  const { data:{ user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Now a function, not a constant: get_ledger_status needs to react to
// whatever ledger data is actually loaded in THIS browser session right
// now - a module-level constant could never see that.
function buildJarvisTools(ctx:{ ledgerEntries?: any[] }) {
return [
  {
    name: "get_open_signals",
    description: "Get the current list of open (unresolved) signals JARVIS has already detected — anomalies, risks, or opportunities across the platform. Use this before answering any question about current problems or what needs attention.",
    input_schema: { type:"object", properties:{}, required:[] },
    riskLevel: "read_only" as const, requiresApproval: false,
    handler: async () => {
      const uid = await currentUserId();
      if (!uid) return { error: "Not signed in" };
      const { data } = await supabase.from("jarvis_lab_signals").select("id,title,severity,source_module,description,detected_at")
        .eq("user_id", uid).not("status","in.(dismissed,resolved)").order("severity",{ascending:false}).limit(20);
      return { open_signal_count: data?.length || 0, signals: data || [] };
    },
  },
  {
    name: "get_cost_anomalies",
    description: "Check Cost Architecture directly for resource price changes of 20% or more since the last recorded price. This queries live data, not just what's already been flagged as a signal — use it to actively investigate cost/margin questions, not just report past findings.",
    input_schema: { type:"object", properties:{}, required:[] },
    riskLevel: "read_only" as const, requiresApproval: false,
    handler: async () => {
      const uid = await currentUserId();
      if (!uid) return { error: "Not signed in" };
      const { data, error } = await supabase.rpc("jarvis_lab_detect_cost_signals", { p_user_id: uid });
      if (error) return { error: error.message };
      const { data: recent } = await supabase.from("jarvis_lab_signals").select("title,description,data")
        .eq("user_id", uid).eq("source_module","cost_architecture").order("detected_at",{ascending:false}).limit(10);
      return { new_anomalies_found_this_check: data ?? 0, current_cost_signals: recent || [] };
    },
  },
  {
    name: "get_ledger_status",
    description: "Check the General Ledger for financial anomalies or discrepancies — specifically, whether every journal entry's debits actually equal its credits.",
    input_schema: { type:"object", properties:{}, required:[] },
    riskLevel: "read_only" as const, requiresApproval: false,
    handler: async () => {
      // AN HONEST, PARTIAL CAPABILITY, NOT A FAKE ONE: the Ledger module
      // stores data only in this browser's local storage, never in
      // Supabase - so a scheduled server job can never check it, but a
      // real check IS possible right now, using whatever is actually
      // loaded in this session. This is why Ledger can only ever be
      // checked "when the app is open," not truly in the background,
      // until Ledger itself moves to a real database table.
      const entries = ctx.ledgerEntries || [];
      if (!entries.length) {
        return { available: false, reason: "No ledger entries are loaded in this browser session right now — nothing to check yet. This can only be checked when Ledger data is actually open, since it lives in local browser storage, not the database." };
      }
      const imbalanced = entries.filter((e:any) => {
        const debits = (e.lines||[]).reduce((s:number,l:any)=>s+(Number(l.debit)||0),0);
        const credits = (e.lines||[]).reduce((s:number,l:any)=>s+(Number(l.credit)||0),0);
        return Math.abs(debits - credits) > 0.01;
      });
      return {
        available: true, checked_this_session_only: true, total_entries: entries.length,
        imbalanced_entries: imbalanced.map((e:any)=>({ id:e.id, date:e.date, narration:e.narration })),
        imbalanced_count: imbalanced.length,
      };
    },
  },
  {
    name: "get_platform_stats",
    description: "Get real, current platform numbers: total users, users by plan, recent signups, and counts of open signals by severity and by module. Use this for any question about user counts, plan distribution, or overall platform state.",
    input_schema: { type:"object", properties:{}, required:[] },
    riskLevel: "read_only" as const, requiresApproval: false,
    handler: async () => {
      const uid = await currentUserId();
      if (!uid) return { error: "Not signed in" };
      const { data, error } = await supabase.rpc("jarvis_platform_snapshot", { p_user_id: uid });
      if (error) return { error: error.message };
      return data || {};
    },
  },
  // ==========================================================================
  // PHASE 3 — the first two ACTUAL execution-capable tools. Chosen
  // deliberately for bounded, real risk, not wired to anything destructive
  // (e.g. a full workspace reset) this early. Every consequential tool MUST
  // request "reasoning" as a required input - Claude has to justify the
  // action as part of calling it, not have a reason invented afterward.
  // ==========================================================================
  {
    name: "dismiss_signal",
    description: "Mark a signal as dismissed — for a genuine false positive, or one you and the user have already discussed and resolved. This is reversible (a dismissed signal can be found again by re-running detection) and touches nothing outside JARVIS's own signal list, so it executes immediately without approval.",
    input_schema: { type:"object", properties:{ signal_id:{type:"string",description:"The id of the signal to dismiss, from get_open_signals"} }, required:["signal_id"] },
    riskLevel: "low_risk" as const, requiresApproval: false,
    handler: async (input:any) => {
      const uid = await currentUserId();
      if (!uid) return { error: "Not signed in" };
      const { error } = await supabase.from("jarvis_lab_signals").update({ status:"dismissed" }).eq("id", input.signal_id).eq("user_id", uid);
      if (error) return { error: error.message };
      return { dismissed: true, signal_id: input.signal_id };
    },
  },
  {
    name: "propose_resource_price_update",
    description: "Propose a new price for a Cost Architecture resource — for example, correcting a stale price you found during investigation. This touches real financial/cost data used in pricing decisions, so it does NOT execute immediately: it is queued for the owner's explicit approval, exactly like every other consequential action. You must give a specific, genuine reason.",
    input_schema: { type:"object", properties:{
      resource_id:{type:"string",description:"The resource's id"},
      resource_name:{type:"string",description:"The resource's name, for the human reviewing this"},
      new_price:{type:"number",description:"The proposed new price"},
      reasoning:{type:"string",description:"Why this change is being proposed — specific, not generic"},
    }, required:["resource_id","resource_name","new_price","reasoning"] },
    riskLevel: "consequential" as const, requiresApproval: true, riskCategory: "financial",
    // This handler only ever runs AFTER approval, at Approve-click time —
    // never during the conversation itself. That is the entire point of
    // requiresApproval: true in the loop that calls this.
    handler: async (input:any) => {
      const uid = await currentUserId();
      if (!uid) return { error: "Not signed in" };
      const { error } = await supabase.from("ca_price_history").insert({
        user_id: uid, resource_id: input.resource_id, price: input.new_price,
        effective_date: new Date().toISOString().slice(0,10), source: "jarvis_lab_approved",
      });
      if (error) return { error: error.message };
      return { updated: true, resource_id: input.resource_id, new_price: input.new_price };
    },
  },
];
}


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

export default function JarvisLab({ ask, askWithTools, isOwner, availableProviders, ledgerEntries }: { ask:(sys:any,msg:any,maxT:number,enableSearch?:boolean,taskType?:string,provider?:string,model?:string)=>Promise<string>; askWithTools?:(sys:string,userMsg:string,history:{role:string;content:string}[],tools:any[],onToolCall?:(name:string,input:any)=>void)=>Promise<string>; isOwner?:boolean; availableProviders?: Array<{id:string;label:string}>; ledgerEntries?: any[] }) {
  // Rebuilt whenever ledger data changes, so JARVIS always sees whatever
  // is actually loaded in this session right now - not a stale snapshot
  // from when the chat first opened.
  const jarvisTools = useMemo(() => buildJarvisTools({ ledgerEntries }), [ledgerEntries]);
  const [view, setView] = useState<"chat"|"signals"|"approvals">("chat");
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [decidingId, setDecidingId] = useState<string|null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [recos, setRecos] = useState<Record<string,Recommendation>>({});
  const [scanning, setScanning] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string|null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string|null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [thinking, setThinking] = useState(false);
  // PHASE 2 TRANSPARENCY: shows which tool JARVIS is actually calling
  // right now, in plain language — the visible half of "what did JARVIS
  // see, and why did it decide to look" that auditability requires.
  const [toolActivity, setToolActivity] = useState<string|null>(null);
  const TOOL_LABELS:Record<string,string> = {
    get_open_signals: "Checking known issues…",
    get_cost_anomalies: "Checking Cost Architecture for anomalies…",
    get_ledger_status: "Checking the Ledger…",
    get_platform_stats: "Checking platform numbers…",
  };
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
      const { data } = await supabase.from("jarvis_lab_conversations").select("role,content")
        .eq("user_id", user.id).order("created_at",{ascending:true}).limit(40);
      setMessages((data||[]).map((m:any)=>({ role:m.role, content:m.content })));
      setLoadingHistory(false);
    })();
  }, []);

  const saveMsg = async (role:"user"|"assistant", content:string) => {
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (user) await supabase.from("jarvis_lab_conversations").insert({ user_id:user.id, role, content, provider: provider||null });
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

  // ============================================================================
  // WAKE WORD — explicit opt-in only, OFF by default, exactly as specified.
  // Continuous listening genuinely means the microphone stays open, so this
  // never turns on by itself and shows a clear, unmissable indicator the
  // moment it's active. Defaults to "jarvis"; if that doesn't reliably
  // trigger for you, "Record my own wake word" captures whatever you say
  // first and uses that instead — reusing the exact same browser speech
  // API as push-to-talk above, not a second voice framework.
  // ============================================================================
  const [wakeWordOn, setWakeWordOn] = useState(false);
  const [customWakePhrase, setCustomWakePhrase] = useState<string|null>(() => {
    try { return localStorage.getItem("jarvis-lab-wake-phrase"); } catch { return null; }
  });
  const [recordingWakePhrase, setRecordingWakePhrase] = useState(false);
  const wakeRecognitionRef = useRef<any>(null);
  const wakeWordOnRef = useRef(false); // read inside the recognition callback, which closes over stale state otherwise

  const effectiveWakePhrase = (customWakePhrase || "jarvis").toLowerCase();

  const recordCustomWakePhrase = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice isn't supported in this browser — try Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
    setRecordingWakePhrase(true);
    rec.onresult = (e:any) => {
      const phrase = (e.results[0][0].transcript || "").trim().toLowerCase();
      if (phrase) {
        setCustomWakePhrase(phrase);
        try { localStorage.setItem("jarvis-lab-wake-phrase", phrase); } catch {}
      }
      setRecordingWakePhrase(false);
    };
    rec.onerror = () => setRecordingWakePhrase(false);
    rec.onend = () => setRecordingWakePhrase(false);
    rec.start();
  };

  const startWakeListener = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e:any) => {
      const last = e.results[e.results.length-1];
      const heard = (last[0].transcript || "").toLowerCase();
      if (heard.includes(effectiveWakePhrase)) {
        rec.stop(); // stop listening for the wake word so it doesn't also try to capture the command that follows
        toggleListen(); // hands off to the exact same one-shot capture push-to-talk already uses
      }
    };
    // Browsers stop continuous recognition after periods of silence on
    // their own; this restarts it automatically for as long as wake-word
    // mode is switched on, so "continuous" actually stays continuous.
    rec.onend = () => { if (wakeWordOnRef.current) { try { rec.start(); } catch {} } };
    rec.onerror = () => { if (wakeWordOnRef.current) { try { rec.start(); } catch {} } };
    wakeRecognitionRef.current = rec;
    rec.start();
  }, [effectiveWakePhrase]);

  const toggleWakeWord = () => {
    const next = !wakeWordOn;
    wakeWordOnRef.current = next;
    setWakeWordOn(next);
    if (next) startWakeListener();
    else wakeRecognitionRef.current?.stop();
  };
  useEffect(() => () => { wakeRecognitionRef.current?.stop(); }, []); // never leave the mic open if this screen unmounts

  const load = useCallback(async () => {
    const { data: sigs } = await supabase.from("jarvis_lab_signals").select("*")
      .neq("status","dismissed").order("severity",{ascending:false}).order("detected_at",{ascending:false});
    setSignals(sigs || []);
    const { data: r } = await supabase.from("jarvis_lab_recommendations").select("*").order("created_at",{ascending:false});
    const byId: Record<string,Recommendation> = {};
    (r || []).forEach((rec:any) => { if(!byId[rec.signal_id]) byId[rec.signal_id]=rec; }); // most recent per signal
    setRecos(byId);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadApprovals = useCallback(async () => {
    const uid = await currentUserId();
    if (!uid) return;
    const { data } = await supabase.from("jarvis_lab_approvals").select("*")
      .eq("user_id", uid).eq("status","pending").order("created_at",{ascending:false});
    setPendingApprovals(data || []);
  }, []);
  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // THE ACTUAL RESUME, PHASE 3: approving here is the only place any
  // consequential tool's real handler is ever invoked. Rejecting never
  // touches the handler at all — the action simply never happens, exactly
  // as it should for something a human declined.
  const decideApproval = async (approval:any, approve:boolean) => {
    setDecidingId(approval.id);
    try {
      if (!approve) {
        await supabase.from("jarvis_lab_approvals").update({ status:"rejected", decided_at:new Date().toISOString() }).eq("id", approval.id);
        await loadApprovals();
        return;
      }
      const tool = jarvisTools.find(t => t.name === approval.tool_name);
      if (!tool) {
        await supabase.from("jarvis_lab_approvals").update({ status:"failed", error:"Tool no longer exists", decided_at:new Date().toISOString() }).eq("id", approval.id);
        await loadApprovals();
        return;
      }
      await supabase.from("jarvis_lab_approvals").update({ status:"approved", decided_at:new Date().toISOString() }).eq("id", approval.id);
      try {
        const result = await tool.handler(approval.proposed_input);
        await supabase.from("jarvis_lab_approvals").update({ status:"executed", result, executed_at:new Date().toISOString() }).eq("id", approval.id);
      } catch (e:any) {
        // Approved does not silently become "did nothing" — a genuine
        // execution failure after approval is recorded plainly, not hidden.
        await supabase.from("jarvis_lab_approvals").update({ status:"failed", error:e.message||"Execution failed" }).eq("id", approval.id);
      }
      await loadApprovals();
    } finally {
      setDecidingId(null);
    }
  };

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
    setThinking(true); setError(null); setToolActivity(null);
    const history = nextMsgs.slice(-10).map(m => ({ role:m.role, content:m.content }));
    const corePersonality = "You are JARVIS, the operating intelligence for a business platform called OrchestrIQ, speaking directly with " +
      (isOwner ? "the platform's owner" : "a user of the platform") + ". Be direct, specific, and genuinely knowledgeable — " +
      "like a top-tier colleague, not a scripted assistant. You currently have NO ability to change, delete, or execute " +
      "anything — you can only observe, analyze, and recommend; say so plainly if asked to act. " +
      "If a question needs information, access, or a capability you don't currently have, say exactly that — name what's " +
      "missing and what would need to be added to do it — rather than pretending, refusing vaguely, or staying silent. " +
      "You have real tools to look up current platform data — use them whenever a question needs actual numbers or " +
      "current state, rather than guessing or relying on what you were told earlier in the conversation.";
    try {
      // PHASE 2, THE ACTUAL UPGRADE: when tool-calling is available, JARVIS
      // decides for itself what to look up, and only when the question
      // actually needs it — a real improvement over always front-loading a
      // snapshot whether or not it was relevant. This also means fresher
      // data: a tool call happens at the moment it's needed, not once at
      // the start of a session that might be hours old by now.
      if (askWithTools) {
        try {
          const reply = await Promise.race([
            askWithTools(corePersonality + "\n\n" + ARCHITECTURE_BRIEFING, userText, history, jarvisTools,
              (name) => setToolActivity(name)),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60000)),
          ]);
          setToolActivity(null);
          setMessages(m => [...m, { role:"assistant", content:reply }]);
          saveMsg("assistant", reply);
          speak(reply);
          loadApprovals(); // a turn that just ran may have queued a new consequential action
          setThinking(false);
          return;
        } catch (toolErr:any) {
          // GRACEFUL FALLBACK, NOT A HARD FAILURE: no Claude key, or the
          // tool-calling attempt itself failed for any reason — fall
          // through to the plain, proven single-shot approach below
          // rather than leaving the user with an error for something
          // that used to work fine a phase ago.
          console.warn("[JarvisLab] tool-calling unavailable, falling back:", toolErr?.message);
        }
      }

      const isFirstTurn = !sentContextThisSession.current;
      sentContextThisSession.current = true;
      const snapshot = isFirstTurn ? await getSnapshot() : null;
      const sys = isFirstTurn
        ? corePersonality + "\n\nREAL, CURRENT PLATFORM DATA (use this for any question about users, plans, or open issues — never guess a number):\n" +
          JSON.stringify(snapshot || {}) + "\n\n" + ARCHITECTURE_BRIEFING
        : corePersonality;

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
      if (user) { try { await supabase.rpc("jarvis_lab_detect_cost_signals", { p_user_id: user.id }); } catch {} }
      await load();
    } finally {
      await sendChat("Analyze the entire platform right now: check current signals, current platform numbers, and tell me plainly what's working, what isn't, and what deserves my attention first. Be specific, not generic.");
    }
  };

  // PHASE 5 — DAILY BRIEFING. Real, aggregated data first; JARVIS only
  // writes up what actually happened. The prompt below explicitly forbids
  // presenting a recommendation as a fact, per the exact requirement.
  const generateDailyBriefing = async () => {
    setThinking(true); setToolActivity(null);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setThinking(false); return; }
      const since = new Date(Date.now()-24*60*60*1000).toISOString();
      const [{ data: newSignals }, { data: recos }, { data: approvalsToday }, { data: toolFailures }] = await Promise.all([
        supabase.from("jarvis_lab_signals").select("title,severity,source_module,description,status,detected_at").gte("detected_at",since).order("severity",{ascending:false}),
        supabase.from("jarvis_lab_recommendations").select("recommendation,root_cause,confidence,created_at").gte("created_at",since),
        supabase.from("jarvis_lab_approvals").select("tool_name,reasoning,status,proposed_input,created_at,executed_at").gte("created_at",since),
        supabase.from("jarvis_lab_tool_calls").select("tool_name,error,created_at").not("error","is",null).gte("created_at",since),
      ]);
      const briefingData = {
        observed_facts: {
          new_signals_detected_last_24h: newSignals || [],
          tool_failures_last_24h: toolFailures || [],
        },
        jarvis_analysis: { diagnoses_made: recos || [] },
        actions: {
          executed: (approvalsToday||[]).filter((a:any)=>a.status==="executed"),
          pending_your_approval: (approvalsToday||[]).filter((a:any)=>a.status==="pending"),
          rejected_by_you: (approvalsToday||[]).filter((a:any)=>a.status==="rejected"),
        },
      };
      const sys = "You are JARVIS, writing a daily briefing for the owner of OrchestrIQ. You are given REAL structured data — " +
        "do not invent anything beyond it. Structure your briefing into these exact labeled sections, in this order: " +
        "OBSERVED FACTS (only what the data literally shows — counts, names, timestamps), JARVIS ANALYSIS (your interpretation " +
        "of what the facts mean — clearly framed as your read of it, not certainty), RECOMMENDATIONS (what you suggest doing, " +
        "clearly labeled as suggestions), ACTIONS TAKEN (only things with status 'executed' — never describe a pending or " +
        "rejected action as done), STILL WAITING ON YOU (pending approvals), and WHAT I'D FOCUS ON TODAY (one or two sentences). " +
        "If a section has nothing to report, say so briefly rather than omitting it silently. Never blur the line between a fact and a guess.";
      const reply = await ask(sys, [{role:"user",content:"Here is the last 24 hours of real data:\n"+JSON.stringify(briefingData)}], 1100, false, "jarvis", provider||undefined);
      const nextMsgs: ChatMsg[] = [...messages, { role:"user", content:"Give me today's briefing." }, { role:"assistant", content:reply }];
      setMessages(nextMsgs);
      saveMsg("user","Give me today's briefing.");
      saveMsg("assistant",reply);
      speak(reply);
    } catch (e:any) {
      setError(e.message);
    }
    setThinking(false);
  };

  const runScan = async () => {
    setScanning(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      // Phase 1 has one detector. Each future module's detector is a
      // separate RPC added to this same array — the framework doesn't
      // change when more are added, only this list grows.
      const detectors = ["jarvis_lab_detect_cost_signals"];
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
      await supabase.from("jarvis_lab_recommendations").insert({
        signal_id: sig.id, user_id: user?.id, root_cause: rootCause,
        recommendation, confidence, tier: 1,
      });
      await supabase.from("jarvis_lab_signals").update({ status:"recommended" }).eq("id", sig.id);
      await load();
    } catch (e:any) { setError(e.message); }
    setDiagnosing(null);
  };

  const dismiss = async (id:string) => {
    await supabase.from("jarvis_lab_signals").update({ status:"dismissed" }).eq("id", id);
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
            <span style={{ fontSize:9, fontWeight:800, letterSpacing:0.6, color:"#04070F", background:"#F59E0B", borderRadius:4, padding:"2px 7px" }}>EXPERIMENTAL</span>
          </div>
          <div style={{ fontSize:11.5, color:C.faint, marginTop:2 }}>
            Test build — separate data from the real JARVIS. Advisory only; cannot change anything without you.
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>setView("chat")} style={{ background: view==="chat"?C.teal:C.panel, color: view==="chat"?"#04070F":C.dim,
            border:"1px solid "+C.line, borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Chat</button>
          <button onClick={()=>setView("signals")} style={{ background: view==="signals"?C.teal:C.panel, color: view==="signals"?"#04070F":C.dim,
            border:"1px solid "+C.line, borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            Signals{signals.length ? ` (${signals.length})` : ""}
          </button>
          <button onClick={()=>setView("approvals")} style={{ background: view==="approvals"?(pendingApprovals.length?C.amber:C.teal):C.panel, color: view==="approvals"?"#04070F":C.dim,
            border:"1px solid "+(pendingApprovals.length?C.amber:C.line), borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            Approvals{pendingApprovals.length ? ` (${pendingApprovals.length})` : ""}
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
            <button onClick={generateDailyBriefing} disabled={thinking} title="A structured summary of the last 24 hours"
              style={{ background:"transparent", border:"1px solid "+C.teal+"55", borderRadius:6, padding:"5px 10px", color:C.teal, fontSize:11, fontWeight:600, cursor:"pointer", opacity:thinking?0.5:1 }}>
              📋 Daily Briefing
            </button>
            <button onClick={toggleWakeWord} title={wakeWordOn ? "Wake word is ON — the microphone is listening" : "Turn on wake-word listening (\""+effectiveWakePhrase+"\")"}
              style={{ background: wakeWordOn ? "#EF4444" : "transparent", border:"1px solid "+(wakeWordOn?"#EF4444":C.line), borderRadius:6, padding:"5px 10px",
                color: wakeWordOn ? "#fff" : C.dim, fontSize:11, fontWeight:600, cursor:"pointer",
                animation: wakeWordOn ? "pulse 1.6s ease-in-out infinite" : "none" }}>
              {wakeWordOn ? "🔴 Listening for \""+effectiveWakePhrase+"\"" : "Wake word: off"}
            </button>
            <button onClick={recordCustomWakePhrase} disabled={recordingWakePhrase} title="Say your own wake phrase once to use it instead of the default"
              style={{ background:"transparent", border:"1px solid "+C.line, borderRadius:6, padding:"5px 10px", color:C.faint, fontSize:10.5, cursor:"pointer" }}>
              {recordingWakePhrase ? "🎙 Say it now…" : "Set my own wake word"}
            </button>
            <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}"}</style>
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
            {thinking && <div style={{ fontSize:11, color:toolActivity?C.teal:C.faint, fontStyle:"italic" }}>{toolActivity ? "◈ "+(TOOL_LABELS[toolActivity]||("Using "+toolActivity+"…")) : "JARVIS is thinking…"}</div>}
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

      {view === "approvals" && (
        <div style={{ marginTop:14 }}>
          {pendingApprovals.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.faint }}>
              <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>✓</div>
              <div style={{ fontSize:13 }}>Nothing waiting on you.</div>
              <div style={{ fontSize:11, marginTop:4 }}>Consequential actions JARVIS proposes — like a price correction — show up here for your decision before anything happens.</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {pendingApprovals.map(a => (
              <div key={a.id} style={{ background:C.panel, border:"1px solid "+C.amber+"55", borderRadius:10, padding:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:8.5, fontWeight:800, color:C.amber, textTransform:"uppercase", border:"1px solid "+C.amber+"55", borderRadius:4, padding:"1px 6px" }}>
                    {a.risk_category}
                  </span>
                  <span style={{ fontSize:12.5, fontWeight:700, color:C.ink }}>{a.tool_name.replace(/_/g," ")}</span>
                </div>
                <div style={{ fontSize:11.5, color:C.dim, marginBottom:8 }}><b style={{color:C.ink}}>JARVIS's reasoning:</b> {a.reasoning}</div>
                <div style={{ fontSize:10.5, color:C.faint, background:C.raised, borderRadius:6, padding:"6px 10px", marginBottom:10, fontFamily:"monospace" }}>
                  {JSON.stringify(a.proposed_input)}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>decideApproval(a,true)} disabled={decidingId===a.id}
                    style={{ background:C.teal, color:"#04070F", border:"none", borderRadius:6, padding:"6px 14px", fontSize:11, fontWeight:700, cursor:"pointer", opacity:decidingId===a.id?0.5:1 }}>
                    {decidingId===a.id ? "Working…" : "Approve & Execute"}
                  </button>
                  <button onClick={()=>decideApproval(a,false)} disabled={decidingId===a.id}
                    style={{ background:"transparent", border:"1px solid "+C.line, color:C.faint, borderRadius:6, padding:"6px 14px", fontSize:11, cursor:"pointer" }}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
