// src/Workspace.tsx
// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL AI WORKSPACE — Shipment 1.
//
// A general-purpose AI environment. Any topic. The user picks the provider and
// the model. Conversations persist. Content can be sent into any OrchestrIQ
// module carrying its provenance.
//
// DELIBERATELY ISOLATED. This file imports the ask() function from App.tsx and
// nothing else from it. It changes no existing behaviour, shares no state with
// any module, and can be deleted without affecting anything. That was your
// section 19 and it is the constraint I built to.
//
// NOT IN THIS SHIPMENT, and I am not pretending otherwise: image generation,
// charts, file upload. Those are Shipment 2. What is here works.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";
import { modelsFor, defaultModel, switchNotice, historyLimit, findModel } from "./lib/AIModels";
import { DESTINATIONS, sendToModule } from "./lib/ContextTransfer";

const C = { bg:"#070B14", panel:"#0F1420", raised:"#0A0E1A", line:"#1A2030",
            ink:"#F1F5F9", dim:"#A0AAC0", faint:"#5A6480", teal:"#14B8A6", amber:"#F59E0B" };

const btn: React.CSSProperties = { padding:"7px 12px", borderRadius:6, fontSize:11, fontWeight:700,
  cursor:"pointer", border:"1px solid "+C.line, background:C.raised, color:C.ink,
  fontFamily:"inherit", whiteSpace:"nowrap" };
const prim: React.CSSProperties = { ...btn, background:C.teal, color:"#04070F", border:"1px solid "+C.teal, fontWeight:800 };
const inp: React.CSSProperties = { width:"100%", padding:"9px 11px", background:C.raised,
  border:"1px solid "+C.line, borderRadius:6, color:C.ink, fontSize:12, boxSizing:"border-box", fontFamily:"inherit" };

interface Props {
  /** The app's own AI caller. We reuse it so provider handling stays in ONE place. */
  ask: (sys:string, msgs:any[], maxT:number, search?:boolean, task?:string, provider?:string, model?:string) => Promise<string>;
  /** Which providers this user actually has a key for. */
  availableProviders: Array<{ id:string; label:string }>;
  canUse?: (moduleId:string) => boolean;
  showToast?: (m:string, k?:string) => void;
}

export default function Workspace({ ask, availableProviders, canUse, showToast }: Props) {
  const [convs, setConvs]       = useState<any[]>([]);
  const [convId, setConvId]     = useState<string>("");
  const [msgs, setMsgs]         = useState<any[]>([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [provider, setProvider] = useState("");
  const [model, setModel]       = useState("");
  const [search, setSearch]     = useState("");
  const [notice, setNotice]     = useState("");
  const [sendOpen, setSendOpen] = useState<number|null>(null);
  const [sharedInfo, setSharedInfo] = useState<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ── provider defaults ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!provider && availableProviders.length) {
      const first = availableProviders[0].id;
      setProvider(first); setModel(defaultModel(first));
    }
  }, [availableProviders, provider]);

  // ── shared NVIDIA: ask the DATABASE, never decide in the browser ───────────
  // A quota enforced in the UI is a suggestion. This asks the server, which is
  // the only place the answer cannot be edited.
  useEffect(() => {
    if (provider !== "nvidia") { setSharedInfo(null); return; }
    (async () => {
      try {
        const { data } = await supabase.rpc("workspace_shared_nvidia_check");
        setSharedInfo(data || null);
      } catch { setSharedInfo(null); }
    })();
  }, [provider, msgs.length]);

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.from("workspace_conversations")
      .select("*").eq("archived", false).order("updated_at", { ascending:false }).limit(60);
    setConvs(data || []);
  }, []);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  const openConv = async (id:string) => {
    setConvId(id); setNotice("");
    const { data } = await supabase.from("workspace_messages")
      .select("*").eq("conversation_id", id).order("created_at");
    setMsgs(data || []);
    const c = convs.find(x => x.id === id);
    if (c?.provider && modelsFor(c.provider).length) { setProvider(c.provider); setModel(c.model || defaultModel(c.provider)); }
  };

  const newConv = () => { setConvId(""); setMsgs([]); setInput(""); setNotice(""); };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs.length, busy]);

  // ── model switching: tell the user what carries over ───────────────────────
  const changeModel = (p:string, m:string) => {
    if (msgs.length && (p !== provider || m !== model)) {
      setNotice(switchNotice(provider, model, p, m, msgs.length));
    }
    setProvider(p); setModel(m);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!provider) { showToast?.("Add an API key in Settings first — NVIDIA's is free.", "warning"); return; }

    // Shared-key quota, checked server-side before spending anything.
    if (provider === "nvidia" && sharedInfo && sharedInfo.allowed === false) {
      showToast?.(sharedInfo.reason, "warning"); return;
    }

    setBusy(true); setInput("");
    let cid = convId;
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) { showToast?.("Please sign in again.", "warning"); setBusy(false); return; }

      if (!cid) {
        const { data: c, error } = await supabase.from("workspace_conversations")
          .insert({ user_id: uid, title: text.slice(0,60), provider, model }).select().single();
        if (error) throw error;
        cid = c.id; setConvId(cid); loadConvs();
      } else {
        await supabase.from("workspace_conversations").update({ provider, model }).eq("id", cid);
      }

      const userMsg = { role:"user", content:text, created_at:new Date().toISOString(), id:"tmp-"+Date.now() };
      setMsgs(m => [...m, userMsg]);
      await supabase.from("workspace_messages").insert({ conversation_id:cid, user_id:uid, role:"user", content:text });

      // Only as much history as this model can genuinely handle.
      const lim = historyLimit(provider, model);
      const history = [...msgs, userMsg].slice(-lim)
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

      // NO BUSINESS RESTRICTION. This is the point of the module.
      const sys = "You are a capable, direct general-purpose assistant inside OrchestrIQ. " +
        "Help with anything the person asks — work, study, code, writing, planning, personal matters, " +
        "creative work, or simple curiosity. There is no business-only restriction here. " +
        "Be concise by default and go deeper when asked. Show your working on anything numerical. " +
        "If you are uncertain, say so plainly rather than guessing confidently.";

      const reply = await ask(sys, history, 4000, false, "workspace", provider, model);
      const clean = String(reply || "").trim();
      if (!clean) throw new Error("The model returned an empty response.");

      const { data: saved } = await supabase.from("workspace_messages")
        .insert({ conversation_id:cid, user_id:uid, role:"assistant", content:clean, provider, model })
        .select().single();
      setMsgs(m => [...m, saved || { role:"assistant", content:clean, provider, model, id:"tmp2-"+Date.now() }]);
      loadConvs();
    } catch (e:any) {
      // A provider failing must not lose the user's message or break the module.
      const m = String(e?.message || e).slice(0,240);
      setMsgs(x => [...x, { role:"assistant", content:"", error:m, id:"err-"+Date.now() }]);
      showToast?.(m, "error");
    } finally { setBusy(false); }
  };

  const doSend = async (i:number, dest:string) => {
    const m = msgs[i];
    const r = await sendToModule({
      destination: dest,
      title: (convs.find(c=>c.id===convId)?.title) || "From Universal Workspace",
      content: m.content, provider: m.provider || provider, model: m.model || model,
      conversationId: convId || undefined,
    });
    setSendOpen(null);
    showToast?.(r.message, r.ok ? "success" : "error");
  };

  const dests = DESTINATIONS.filter(d => !canUse || canUse(d.id));
  const filtered = search.trim()
    ? convs.filter(c => (c.title||"").toLowerCase().includes(search.toLowerCase()))
    : convs;

  return (
    <div style={{ flex:1, display:"flex", height:"100%", background:C.bg, color:C.ink, overflow:"hidden" }}>

      {/* ── conversations ─────────────────────────────────────────────────── */}
      <div style={{ width:250, borderRight:"1px solid "+C.line, display:"flex", flexDirection:"column", background:C.panel }}>
        <div style={{ padding:12, borderBottom:"1px solid "+C.line }}>
          <button style={{ ...prim, width:"100%", marginBottom:8 }} onClick={newConv}>New conversation</button>
          <input style={{ ...inp, fontSize:11 }} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:8 }}>
          {!filtered.length && (
            <div style={{ fontSize:10.5, color:C.faint, padding:14, lineHeight:1.7, textAlign:"center" }}>
              No conversations yet.<br/>Ask anything — work, study, code, writing, or something personal.
            </div>
          )}
          {filtered.map(c => (
            <div key={c.id} onClick={()=>openConv(c.id)}
              style={{ padding:"9px 10px", borderRadius:6, cursor:"pointer", marginBottom:4,
                background: c.id===convId ? "rgba(20,184,166,0.10)" : "transparent",
                border:"1px solid "+(c.id===convId ? "rgba(20,184,166,0.35)" : "transparent") }}>
              <div style={{ fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</div>
              <div style={{ fontSize:8.5, color:C.faint, marginTop:2 }}>
                {c.model ? (findModel(c.provider,c.model)?.label || c.model) : ""} · {new Date(c.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── conversation ──────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        <div style={{ padding:"10px 14px", borderBottom:"1px solid "+C.line, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", background:C.panel }}>
          <select style={{ ...inp, width:"auto", fontSize:11, cursor:"pointer" }} value={provider}
            onChange={e=>changeModel(e.target.value, defaultModel(e.target.value))}>
            {!availableProviders.length && <option value="">No API key configured</option>}
            {availableProviders.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select style={{ ...inp, width:"auto", fontSize:11, cursor:"pointer", minWidth:200 }} value={model}
            onChange={e=>changeModel(provider, e.target.value)}>
            {modelsFor(provider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {findModel(provider,model) && (
            <span style={{ fontSize:9.5, color:C.faint }}>{findModel(provider,model)!.note}</span>
          )}
        </div>

        {notice && (
          <div style={{ padding:"7px 14px", fontSize:10, color:C.amber, background:"rgba(245,158,11,0.07)",
            borderBottom:"1px solid rgba(245,158,11,0.2)" }}>{notice}</div>
        )}
        {provider==="nvidia" && sharedInfo && sharedInfo.allowed===false && (
          <div style={{ padding:"7px 14px", fontSize:10, color:C.amber, background:"rgba(245,158,11,0.07)",
            borderBottom:"1px solid rgba(245,158,11,0.2)" }}>{sharedInfo.reason}</div>
        )}
        {provider==="nvidia" && sharedInfo?.allowed && sharedInfo.cap && (
          <div style={{ padding:"6px 14px", fontSize:9.5, color:C.faint, borderBottom:"1px solid "+C.line }}>
            Shared NVIDIA · {sharedInfo.used} of {sharedInfo.cap} messages used today
          </div>
        )}

        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
          {!msgs.length && !busy && (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.faint }}>
              <div style={{ fontSize:30, marginBottom:12 }}>✳</div>
              <div style={{ fontSize:14, fontWeight:800, color:C.ink, marginBottom:6 }}>Universal AI Workspace</div>
              <div style={{ fontSize:11, lineHeight:1.8, maxWidth:440, margin:"0 auto" }}>
                Ask anything at all. Business, code, study, writing, planning, or something personal.
                Pick whichever model suits the task — and send anything useful into an OrchestrIQ module when you are done.
              </div>
            </div>
          )}

          {msgs.map((m,i) => (
            <div key={m.id||i} style={{ marginBottom:14, maxWidth:820 }}>
              <div style={{ fontSize:8.5, fontWeight:800, color: m.role==="user"?C.faint:C.teal, marginBottom:4, letterSpacing:0.5 }}>
                {m.role==="user" ? "YOU" : (findModel(m.provider,m.model)?.label || m.model || "ASSISTANT").toUpperCase()}
              </div>
              {m.error ? (
                <div style={{ fontSize:11.5, color:"#EF4444", background:"rgba(239,68,68,0.07)",
                  border:"1px solid rgba(239,68,68,0.25)", borderRadius:6, padding:"9px 11px", lineHeight:1.6 }}>
                  {m.error}
                  <div style={{ color:C.faint, marginTop:6, fontSize:10 }}>
                    Your message was saved. Try another model from the picker above.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:12, lineHeight:1.75, whiteSpace:"pre-wrap",
                  background: m.role==="user" ? "transparent" : C.panel,
                  border: m.role==="user" ? "none" : "1px solid "+C.line,
                  borderRadius: m.role==="user" ? 0 : 8, padding: m.role==="user" ? 0 : "11px 13px" }}>
                  {m.content}
                </div>
              )}
              {m.role==="assistant" && !m.error && m.content && (
                <div style={{ marginTop:6, position:"relative" }}>
                  <button style={{ ...btn, fontSize:10, padding:"5px 9px" }}
                    onClick={()=>setSendOpen(sendOpen===i?null:i)}>Use in OrchestrIQ ▾</button>
                  <button style={{ ...btn, fontSize:10, padding:"5px 9px", marginLeft:6 }}
                    onClick={()=>{ navigator.clipboard?.writeText(m.content); showToast?.("Copied","success"); }}>Copy</button>
                  {sendOpen===i && (
                    <div style={{ position:"absolute", zIndex:50, marginTop:5, background:C.panel,
                      border:"1px solid "+C.line, borderRadius:8, padding:6, width:330, maxHeight:300, overflowY:"auto",
                      boxShadow:"0 8px 26px rgba(0,0,0,0.5)" }}>
                      <div style={{ fontSize:9, color:C.faint, padding:"5px 8px", lineHeight:1.5 }}>
                        Sends this answer with a note of which model produced it.
                        Nothing is applied automatically — the module reviews it first.
                      </div>
                      {dests.map(d => (
                        <div key={d.id+d.label} onClick={()=>doSend(i,d.id)}
                          style={{ padding:"7px 9px", borderRadius:5, cursor:"pointer", fontSize:11 }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(20,184,166,0.10)";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
                          <div style={{ fontWeight:700 }}>{d.label}</div>
                          <div style={{ fontSize:9, color:C.faint, marginTop:1, lineHeight:1.4 }}>{d.hint}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && <div style={{ fontSize:11, color:C.teal, padding:"6px 0" }}>Thinking…</div>}
          <div ref={endRef} />
        </div>

        <div style={{ padding:12, borderTop:"1px solid "+C.line, background:C.panel }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <textarea style={{ ...inp, minHeight:52, maxHeight:180, resize:"vertical" }}
              placeholder="Ask anything…  (Enter to send, Shift+Enter for a new line)"
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } }} />
            <button style={{ ...prim, height:40 }} disabled={busy||!input.trim()} onClick={send}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
