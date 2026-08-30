// src/SupportWidget.tsx
// A Help button any signed-in user can use to write to the owner.
// Their messages land in Admin Console → Support.
//
// Security notes worth knowing:
//  - A user can only ever see their OWN threads. That is enforced by the
//    database, not by this screen.
//  - A user cannot set status or priority. Otherwise anyone could mark their
//    own ticket urgent and jump the queue.
//  - Whether a reply is shown as coming from the owner is decided by a database
//    trigger reading the author's real role, never by anything sent from here.
//    A user cannot post a message that looks like it came from you.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

const C = { panel:"#0F1420", line:"#1A2030", ink:"#F1F5F9", dim:"#A0AAC0",
            faint:"#5A6480", teal:"#14B8A6" };

const CATS = [
  { v: "question",       l: "I have a question" },
  { v: "bug",            l: "Something is broken" },
  { v: "access_request", l: "I need access to something" },
  { v: "billing",        l: "Billing or my plan" },
  { v: "feedback",       l: "Feedback or a suggestion" },
  { v: "concern",        l: "A concern or complaint" },
];

export default function SupportWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("question");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("support_threads")
      .select("*").order("last_message_at", { ascending: false });
    if (!error) setThreads(data || []);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const openThread = async (t: any) => {
    setActive(t); setComposing(false);
    const { data } = await supabase.from("support_messages").select("*")
      .eq("thread_id", t.id).order("created_at");
    setMessages(data || []);
    // Clear the user's own unread flag. A user may not touch status or
    // priority, so this is the only field they can change here.
    try { await supabase.from("support_threads").update({ unread_for_user: false }).eq("id", t.id); } catch { /* not fatal */ }
  };

  const startThread = async () => {
    if (subject.trim().length < 3 || body.trim().length < 3) {
      setNote("Please write a short subject and a message."); return;
    }
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) { setNote("Your session has expired. Please sign in again."); return; }
      const { data: t, error } = await supabase.from("support_threads")
        .insert({ user_id: uid, subject: subject.trim(), category }).select().single();
      if (error) { setNote(error.message); return; }
      const { error: e2 } = await supabase.from("support_messages")
        .insert({ thread_id: t.id, author_id: uid, body: body.trim() });
      if (e2) { setNote(e2.message); return; }
      setSubject(""); setBody(""); setComposing(false);
      setNote("Sent. You will see the reply here.");
      await load(); openThread(t);
    } finally { setBusy(false); }
  };

  const reply = async () => {
    if (body.trim().length < 2 || !active) return;
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      const { error } = await supabase.from("support_messages")
        .insert({ thread_id: active.id, author_id: uid, body: body.trim() });
      if (error) { setNote(error.message); return; }
      setBody(""); openThread(active); load();
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "#0A0E1A",
    border: "1px solid " + C.line, borderRadius: 5, color: C.ink, fontSize: 11, boxSizing: "border-box" };
  const btn: React.CSSProperties = { padding: "8px 13px", borderRadius: 5, fontSize: 11, fontWeight: 700,
    cursor: "pointer", border: "1px solid " + C.line, background: "#0A0E1A", color: C.ink };
  const prim: React.CSSProperties = { ...btn, background: C.teal, color: "#04070F",
    border: "1px solid " + C.teal, fontWeight: 800 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,0.8)",
      zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, color: C.ink,
        border: "1px solid " + C.line, borderRadius: 10, width: "100%", maxWidth: 640,
        maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "13px 16px", borderBottom: "1px solid " + C.line,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Help &amp; Support</div>
            <div style={{ fontSize: 9.5, color: C.faint }}>Messages go straight to the OrchestrIQ team</div>
          </div>
          <button style={btn} onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {note && (
            <div style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: 5, padding: "8px 11px", fontSize: 10, color: C.dim, marginBottom: 12 }}>{note}</div>
          )}

          {!active && !composing && (
            <>
              <button style={{ ...prim, width: "100%", marginBottom: 14 }}
                onClick={() => { setComposing(true); setNote(""); }}>Write a new message</button>
              {!threads.length && (
                <div style={{ fontSize: 10.5, color: C.faint, textAlign: "center", padding: "22px 0", lineHeight: 1.7 }}>
                  You have not sent any messages yet.<br />
                  Ask a question, report a problem, or request access to a module.
                </div>
              )}
              {threads.map(t => (
                <div key={t.id} onClick={() => openThread(t)}
                  style={{ padding: "10px 11px", borderRadius: 6, cursor: "pointer", marginBottom: 7,
                    border: "1px solid " + (t.unread_for_user ? C.teal + "66" : C.line),
                    background: t.unread_for_user ? "rgba(20,184,166,0.06)" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700 }}>{t.subject}</div>
                    {t.unread_for_user && <span style={{ fontSize: 8.5, color: C.teal, fontWeight: 800 }}>REPLY</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>
                    {t.status === "resolved" ? "Resolved" : t.status === "closed" ? "Closed" : "Open"}
                    {" \u00b7 "}{new Date(t.last_message_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </>
          )}

          {composing && (
            <>
              <label style={{ fontSize: 9, fontWeight: 700, color: C.dim, display: "block", marginBottom: 4 }}>WHAT IS THIS ABOUT?</label>
              <select style={{ ...inp, marginBottom: 11, cursor: "pointer" }} value={category}
                onChange={e => setCategory(e.target.value)}>
                {CATS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
              <label style={{ fontSize: 9, fontWeight: 700, color: C.dim, display: "block", marginBottom: 4 }}>SUBJECT</label>
              <input style={{ ...inp, marginBottom: 11 }} value={subject} maxLength={120}
                onChange={e => setSubject(e.target.value)} placeholder="A short summary" />
              <label style={{ fontSize: 9, fontWeight: 700, color: C.dim, display: "block", marginBottom: 4 }}>MESSAGE</label>
              <textarea style={{ ...inp, minHeight: 130, resize: "vertical", marginBottom: 12 }}
                value={body} maxLength={8000} onChange={e => setBody(e.target.value)}
                placeholder="Tell us what you need. Include anything on screen that looked wrong." />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btn, flex: 1 }} onClick={() => { setComposing(false); setNote(""); }}>Cancel</button>
                <button style={{ ...prim, flex: 2 }} disabled={busy} onClick={startThread}>
                  {busy ? "Sending\u2026" : "Send"}</button>
              </div>
            </>
          )}

          {active && (
            <>
              <button style={{ ...btn, marginBottom: 12 }} onClick={() => { setActive(null); setBody(""); load(); }}>
                &larr; All messages</button>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{active.subject}</div>
              <div style={{ fontSize: 9, color: C.faint, marginBottom: 12 }}>
                {active.status === "resolved" ? "Resolved" : active.status === "closed" ? "Closed" : "Open"}
              </div>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 9, padding: "9px 11px", borderRadius: 6,
                  background: m.is_admin ? "rgba(20,184,166,0.08)" : "#0A0E1A",
                  border: "1px solid " + (m.is_admin ? "rgba(20,184,166,0.28)" : C.line) }}>
                  <div style={{ fontSize: 8.5, fontWeight: 800, marginBottom: 3,
                    color: m.is_admin ? C.teal : C.faint }}>
                    {m.is_admin ? "ORCHESTRIQ TEAM" : "YOU"}
                    {" \u00b7 "}{new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical", marginTop: 10 }}
                value={body} maxLength={8000} onChange={e => setBody(e.target.value)}
                placeholder="Add to this conversation\u2026" />
              <button style={{ ...prim, marginTop: 8 }} disabled={busy} onClick={reply}>
                {busy ? "Sending\u2026" : "Send reply"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
