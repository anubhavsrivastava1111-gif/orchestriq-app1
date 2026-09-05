// src/Workspace.tsx
// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL AI WORKSPACE — Shipment 1 + Shipment 2.
//
// A general-purpose AI environment. Any topic. The user picks the provider and
// the model. Conversations persist. Content can be sent into any OrchestrIQ
// module carrying its provenance.
//
// DELIBERATELY ISOLATED. This file imports the ask() function from App.tsx and
// nothing else from it. It changes no existing behaviour, shares no state with
// any module, and can be deleted without affecting anything.
//
// SHIPMENT 2 ADDS: image generation, structured tables/charts in replies, and
// file upload for text-extractable formats (txt, csv, pdf, docx, xlsx).
//
// WHAT SHIPMENT 2 DELIBERATELY DOES NOT ADD, STATED PLAINLY:
//   - Vision (the AI reading an uploaded image's content). Doing that properly
//     means changing the request shape of callClaude/callOpenAI/callGemini -
//     functions used by every module on the platform. That is too large and
//     too risky a change to bundle into an isolated feature's file. An
//     uploaded image can be attached and forwarded via Send To, but it is not
//     analysed here.
//   - PPTX text extraction. No reliable client-side library exists for this
//     the way pdf.js/mammoth exist for PDF/Word. Rather than ship a fragile
//     parser, PPTX upload is refused with a clear message.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";
import { modelsFor, defaultModel, switchNotice, historyLimit, findModel } from "./lib/AIModels";
import { DESTINATIONS, sendToModule } from "./lib/ContextTransfer";

const C = { bg:"#070B14", panel:"#0F1420", raised:"#0A0E1A", line:"#1A2030",
            ink:"#F1F5F9", dim:"#A0AAC0", faint:"#5A6480", teal:"#14B8A6", amber:"#F59E0B", red:"#EF4444" };

const btn: React.CSSProperties = { padding:"7px 12px", borderRadius:6, fontSize:11, fontWeight:700,
  cursor:"pointer", border:"1px solid "+C.line, background:C.raised, color:C.ink,
  fontFamily:"inherit", whiteSpace:"nowrap" };
const prim: React.CSSProperties = { ...btn, background:C.teal, color:"#04070F", border:"1px solid "+C.teal, fontWeight:800 };
const inp: React.CSSProperties = { width:"100%", padding:"9px 11px", background:C.raised,
  border:"1px solid "+C.line, borderRadius:6, color:C.ink, fontSize:12, boxSizing:"border-box", fontFamily:"inherit" };

// ── SHIPMENT 2: STRUCTURED CONTENT (same technique as the Live Boardroom) ───
// A deliberate small duplication rather than a cross-file import: each screen
// in this platform is built to be independently deletable (see file header).
// Sharing this renderer would create a dependency between two features that
// otherwise have nothing to do with each other. If a third screen needs it,
// THAT is the point to extract a shared module - not before.
function splitStructured(raw: string): Array<
  { type:"text"; content:string } | { type:"table"; rows:string[][] } | { type:"chart"; title:string; labels:string[]; values:number[] }
> {
  const parts: any[] = [];
  const lines = raw.split("\n");
  let buf: string[] = [];
  const flushText = () => { const t = buf.join("\n").trim(); if (t) parts.push({ type:"text", content:t }); buf = []; };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```chart\s*$/i.test(line.trim())) {
      flushText();
      const body: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      try {
        const j = JSON.parse(body.join("\n"));
        if (Array.isArray(j.labels) && Array.isArray(j.values) && j.labels.length === j.values.length) {
          parts.push({ type:"chart", title:String(j.title||""), labels:j.labels.map(String), values:j.values.map(Number) });
          continue;
        }
      } catch {}
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i+1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i+1]) && lines[i+1].includes("-")) {
      flushText();
      const rows: string[][] = [];
      const toCells = (l:string) => l.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
      rows.push(toCells(line)); i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(toCells(lines[i])); i++; }
      parts.push({ type:"table", rows });
      continue;
    }
    buf.push(line); i++;
  }
  flushText();
  return parts;
}

function StructuredTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div style={{ overflowX:"auto", margin:"8px 0", border:"1px solid "+C.line, borderRadius:8 }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
        <thead><tr style={{ background:C.raised }}>
          {head.map((h,i)=>(<th key={i} style={{ textAlign:"left", padding:"7px 10px", fontWeight:800, fontSize:9.5,
            color:C.dim, textTransform:"uppercase", letterSpacing:0.4, borderBottom:"1px solid "+C.line }}>{h}</th>))}
        </tr></thead>
        <tbody>{body.map((r,ri)=>(
          <tr key={ri} style={{ background: ri%2 ? "rgba(255,255,255,0.015)" : "transparent" }}>
            {r.map((c,ci)=>(<td key={ci} style={{ padding:"7px 10px", borderBottom:"1px solid "+C.line, color:C.ink,
              fontVariantNumeric:"tabular-nums" }}>{c}</td>))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function StructuredChart({ title, labels, values }: { title:string; labels:string[]; values:number[] }) {
  const w=320,h=140,pad=24; const max=Math.max(1,...values); const bw=(w-pad*2)/values.length;
  return (
    <div style={{ margin:"8px 0", padding:"10px 12px", border:"1px solid "+C.line, borderRadius:8, background:C.raised }}>
      {title && <div style={{ fontSize:10, fontWeight:800, color:C.dim, marginBottom:6 }}>{title}</div>}
      <svg width="100%" viewBox={"0 0 "+w+" "+h} style={{ display:"block" }}>
        {values.map((v,i)=>{ const bh=((h-pad*2)*v)/max; const x=pad+i*bw+bw*0.15; const y=h-pad-bh;
          return (<g key={i}>
            <rect x={x} y={y} width={bw*0.7} height={bh} fill={C.teal} rx={2} />
            <text x={x+bw*0.35} y={h-pad+12} fontSize="8" fill={C.faint} textAnchor="middle">{labels[i]}</text>
            <text x={x+bw*0.35} y={y-4} fontSize="8" fill={C.ink} textAnchor="middle">{v}</text>
          </g>); })}
      </svg>
    </div>
  );
}

function MessageBody({ content }: { content:string }) {
  const parts = splitStructured(content);
  return (<>{parts.map((p,i)=>{
    if (p.type==="table") return <StructuredTable key={i} rows={p.rows} />;
    if (p.type==="chart") return <StructuredChart key={i} title={p.title} labels={p.labels} values={p.values} />;
    return <div key={i} style={{ whiteSpace:"pre-wrap", marginBottom: i<parts.length-1?8:0 }}>{p.content}</div>;
  })}</>);
}

// ── SHIPMENT 2: ON-DEMAND LIBRARY LOADING, SAME CDN TECHNIQUE ALREADY USED
// ELSEWHERE IN THIS APP (App.tsx's ensureXLSX). No new build dependency. ────
async function loadScript(src: string): Promise<void> {
  if (document.querySelector('script[src="'+src+'"]')) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script"); s.src = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Could not load a required library."));
    document.head.appendChild(s);
  });
}
async function ensurePdfJs() {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const lib = (window as any).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return lib;
}
async function ensureMammoth() {
  if ((window as any).mammoth) return (window as any).mammoth;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
  return (window as any).mammoth;
}
async function ensureXLSX() {
  if ((window as any).XLSX) return (window as any).XLSX;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  return (window as any).XLSX;
}

/** Extracts text from an uploaded file. Throws a clear, specific message for
 *  anything unsupported rather than silently producing nothing. */
async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".md")) {
    return await file.text();
  }
  if (name.endsWith(".pdf")) {
    const pdfjsLib = await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map((it:any)=>it.str).join(" ") + "\n\n";
    }
    if (!out.trim()) throw new Error("This PDF has no extractable text (it may be a scan). Try a text-based PDF.");
    return out;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await ensureMammoth();
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value;
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array" });
    return wb.SheetNames.map((n:string) => "# " + n + "\n" + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n");
  }
  if (name.endsWith(".pptx")) {
    throw new Error("PowerPoint text extraction is not supported yet - no reliable client-side reader exists for it. Please paste the key slide content as text instead.");
  }
  throw new Error("Unsupported file type. Supported: .txt, .csv, .md, .pdf, .docx, .xlsx");
}

interface Props {
  /** The app's own AI caller. We reuse it so provider handling stays in ONE place. */
  ask: (sys:string, msgs:any[], maxT:number, search?:boolean, task?:string, provider?:string, model?:string) => Promise<string>;
  /** Which providers this user actually has a key for. */
  availableProviders: Array<{ id:string; label:string }>;
  canUse?: (moduleId:string) => boolean;
  showToast?: (m:string, k?:string) => void;
  // SHIPMENT 2 — both optional and safely defaulted. Without them the Image
  // mode toggle simply does not appear; nothing else in the Workspace changes.
  generateImage?: (prompt:string) => Promise<string>;
  imageProviders?: Array<{ id:string; label:string }>;
  // NVIDIA LIVE CATALOG — the user's own real nvapi- key, if they have one.
  // Passed through only so this screen can ask NVIDIA directly what models
  // actually exist right now. Never the shared platform key, and never sent
  // anywhere except straight to NVIDIA's own metadata endpoint.
  nvidiaUserKey?: string;
}
export default function Workspace({ ask, availableProviders, canUse, showToast, generateImage, imageProviders, nvidiaUserKey }: Props) {
  const [nvidiaLive, setNvidiaLive] = useState<any[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (nvidiaUserKey) {
      import("./lib/AIModels").then(({ fetchNvidiaLiveCatalog }) =>
        fetchNvidiaLiveCatalog(nvidiaUserKey).then(models => {
          if (!cancelled && models.length) setNvidiaLive(models);
        })
      );
    } else {
      setNvidiaLive(null);
    }
    return () => { cancelled = true; };
  }, [nvidiaUserKey]);
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
  // SHIPMENT 2 — mode toggle and file attach.
  const [mode, setMode] = useState<"chat"|"image">("chat");
  const [attaching, setAttaching] = useState(false);
  const [attachedText, setAttachedText] = useState<{ name:string; text:string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // THE BUG: this table has no "archived" column. It never existed on the
      // real workspace_conversations table - only in the schema I wrongly
      // assumed when writing this file. With Row Level Security newly fixed
      // to actually allow your own rows, this filter would have started
      // throwing a real error instead of the silent one it was masked by
      // before. Removed, since there is no archive concept on this table.
      .select("*").order("updated_at", { ascending:false }).limit(60);
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

  // SHIPMENT 2 — file upload. Extracted text is attached as context for the
  // NEXT message, shown as a small chip so the user knows it will be
  // included, and can be cleared before sending.
  const handleFile = async (file: File) => {
    setAttaching(true);
    try {
      const text = await extractFileText(file);
      setAttachedText({ name: file.name, text: text.slice(0, 40000) });
      showToast?.("Attached " + file.name + " (" + text.length.toLocaleString() + " characters extracted).", "success");
    } catch (e:any) {
      showToast?.(String(e?.message || e).slice(0, 220), "error");
    } finally { setAttaching(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  // SHIPMENT 2 — image generation. A separate path from chat: one prompt,
  // one picture, saved as an asset on the message (asset_url/asset_kind
  // columns already exist on workspace_messages from the original schema).
  const sendImage = async () => {
    const prompt = input.trim();
    if (!prompt || busy || !generateImage) return;
    setBusy(true); setInput("");
    let cid = convId;
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) { showToast?.("Please sign in again.", "warning"); setBusy(false); return; }
      if (!cid) {
        const { data: c, error } = await supabase.from("workspace_conversations")
          .insert({ user_id: uid, title: prompt.slice(0,60), provider, model }).select().single();
        if (error) throw error;
        cid = c.id; setConvId(cid); loadConvs();
      }
      const userMsg = { role:"user", content:prompt, created_at:new Date().toISOString(), id:"tmp-"+Date.now() };
      setMsgs(m => [...m, userMsg]);
      await supabase.from("workspace_messages").insert({ conversation_id:cid, user_id:uid, role:"user", content:prompt });

      const url = await generateImage(prompt);
      const { data: saved } = await supabase.from("workspace_messages")
        // THE EXACT BUG YOU HIT: workspace_messages has no asset_url or
        // asset_kind column - it has one column, "assets", holding jsonb.
        // This is what produced "Could not find the asset_url column".
        // "assets" is a NOT NULL array column (default '[]') on the real table -
        // the same shape module_inbox uses. Storing a single object instead of
        // a one-item array would not violate NOT NULL, but it would not match
        // the column's own design, so this stores it correctly from the start
        // rather than waiting to find out the hard way later.
        .insert({ conversation_id:cid, user_id:uid, role:"assistant", content:"", assets:[{ url, kind:"image" }] })
        .select().single();
      setMsgs(m => [...m, saved || { role:"assistant", content:"", assets:[{ url, kind:"image" }], id:"tmp2-"+Date.now() }]);
      loadConvs();
    } catch (e:any) {
      const m = String(e?.message || e).slice(0,240);
      setMsgs(x => [...x, { role:"assistant", content:"", error:m, id:"err-"+Date.now() }]);
      showToast?.(m, "error");
    } finally { setBusy(false); }
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

      // SHIPMENT 2: an attached file's extracted text rides along with THIS
      // message only, then is cleared - it is context for the question being
      // asked now, not a permanent addition to every future turn.
      const attachment = attachedText;
      const displayText = attachment ? text + "\n\n[Attached: " + attachment.name + "]" : text;
      const sendText = attachment ? text + "\n\n--- Content of " + attachment.name + " ---\n" + attachment.text : text;
      setAttachedText(null);

      const userMsg = { role:"user", content:displayText, created_at:new Date().toISOString(), id:"tmp-"+Date.now() };
      setMsgs(m => [...m, userMsg]);
      await supabase.from("workspace_messages").insert({ conversation_id:cid, user_id:uid, role:"user", content:displayText });

      // Only as much history as this model can genuinely handle. The FULL
      // attachment text is sent to the model even though only a short note
      // is shown in the chat, so the model can genuinely answer about the file
      // without the conversation view being swamped by it.
      const lim = historyLimit(provider, model);
      const history = [...msgs, { ...userMsg, content: sendText }].slice(-lim)
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

      // NO BUSINESS RESTRICTION. This is the point of the module.
      const sys = "You are a capable, direct general-purpose assistant inside OrchestrIQ. " +
        "Help with anything the person asks — work, study, code, writing, planning, personal matters, " +
        "creative work, or simple curiosity. There is no business-only restriction here. " +
        "Be concise by default and go deeper when asked. Show your working on anything numerical. " +
        "If you are uncertain, say so plainly rather than guessing confidently. " +
        "When a table of figures would genuinely help, format it as markdown with | pipes |. " +
        "For a simple numeric comparison, you may add one fenced block after your prose: " +
        '```chart\n{"title":"...","labels":["A","B"],"values":[10,20]}\n```' +
        " Only use either when it genuinely helps; most answers should stay plain sentences.";

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
            {/* When NVIDIA's own live catalog loaded successfully, it REPLACES
                the static list entirely - it is the real, current truth, not
                an addition to a guess. The static list is the fallback used
                only until the live one arrives, or if it never can (no
                personal key). */}
            {(provider==="nvidia" && nvidiaLive?.length ? nvidiaLive : modelsFor(provider))
              .map((m:any) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {provider==="nvidia" && (
            <span style={{ fontSize:9, color: nvidiaLive?.length ? "#22C55E" : C.faint }}>
              {nvidiaLive?.length
                ? "● Live from NVIDIA · " + nvidiaLive.length + " models"
                : nvidiaUserKey ? "Loading NVIDIA's live catalog…" : "Add your own NVIDIA key for the full live catalog"}
            </span>
          )}
          {provider!=="nvidia" && findModel(provider,model) && (
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
                {m.role==="user" ? "YOU" : (m.assets?.[0]?.kind==="image" ? "IMAGE" : (findModel(m.provider,m.model)?.label || m.model || "ASSISTANT")).toUpperCase()}
              </div>
              {m.error ? (
                <div style={{ fontSize:11.5, color:"#EF4444", background:"rgba(239,68,68,0.07)",
                  border:"1px solid rgba(239,68,68,0.25)", borderRadius:6, padding:"9px 11px", lineHeight:1.6 }}>
                  {m.error}
                  <div style={{ color:C.faint, marginTop:6, fontSize:10 }}>
                    Your message was saved. Try another model from the picker above.
                  </div>
                </div>
              ) : m.assets?.[0]?.kind === "image" && m.assets?.[0]?.url ? (
                // SHIPMENT 2 — a generated image, shown inline with a real download link.
                <div>
                  <img src={m.assets?.[0]?.url} alt="Generated" style={{ maxWidth:420, borderRadius:8, border:"1px solid "+C.line, display:"block" }} />
                  <a href={m.assets?.[0]?.url} download target="_blank" rel="noreferrer"
                    style={{ fontSize:9.5, color:C.teal, marginTop:5, display:"inline-block" }}>Download image</a>
                </div>
              ) : (
                <div style={{ fontSize:12, lineHeight:1.75,
                  background: m.role==="user" ? "transparent" : C.panel,
                  border: m.role==="user" ? "none" : "1px solid "+C.line,
                  borderRadius: m.role==="user" ? 0 : 8, padding: m.role==="user" ? 0 : "11px 13px" }}>
                  {m.role==="user" ? <div style={{ whiteSpace:"pre-wrap" }}>{m.content}</div> : <MessageBody content={m.content} />}
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
          {/* SHIPMENT 2 — mode toggle. Only shown when an image provider is
              actually configured; otherwise the Workspace behaves exactly as
              it did in Shipment 1. */}
          {!!generateImage && (
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              <button style={mode==="chat" ? { ...prim, fontSize:10, padding:"5px 11px" } : { ...btn, fontSize:10, padding:"5px 11px" }}
                onClick={()=>setMode("chat")}>\uD83D\uDCAC Chat</button>
              <button style={mode==="image" ? { ...prim, fontSize:10, padding:"5px 11px" } : { ...btn, fontSize:10, padding:"5px 11px" }}
                onClick={()=>setMode("image")}>\uD83D\uDDBC Image</button>
              {mode==="image" && !!imageProviders?.length && (
                <span style={{ fontSize:9, color:C.faint, alignSelf:"center" }}>
                  via {imageProviders.map(p=>p.label).join(", ")}
                </span>
              )}
            </div>
          )}

          {attachedText && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, fontSize:10,
              background:"rgba(20,184,166,0.08)", border:"1px solid rgba(20,184,166,0.25)", borderRadius:6, padding:"6px 10px" }}>
              <span style={{ color:C.teal }}>\uD83D\uDCCE {attachedText.name}</span>
              <span style={{ color:C.faint }}>({attachedText.text.length.toLocaleString()} characters — sent with your next message)</span>
              <button onClick={()=>setAttachedText(null)} style={{ marginLeft:"auto", background:"none", border:"none", color:C.faint, cursor:"pointer", fontSize:12 }}>\u2715</button>
            </div>
          )}

          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            {mode==="chat" && (
              <>
                <input ref={fileInputRef} type="file" accept=".txt,.csv,.md,.pdf,.docx,.xlsx,.xls" style={{ display:"none" }}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }} />
                <button style={{ ...btn, height:40 }} disabled={attaching} onClick={()=>fileInputRef.current?.click()} title="Attach a file">
                  {attaching ? "\u2026" : "\uD83D\uDCCE"}
                </button>
              </>
            )}
            <textarea style={{ ...inp, minHeight:52, maxHeight:180, resize:"vertical" }}
              placeholder={mode==="image" ? "Describe the image you want\u2026" : "Ask anything…  (Enter to send, Shift+Enter for a new line)"}
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); mode==="image" ? sendImage() : send(); } }} />
            <button style={{ ...prim, height:40 }} disabled={busy||!input.trim()} onClick={mode==="image" ? sendImage : send}>
              {busy ? "…" : mode==="image" ? "Generate" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
