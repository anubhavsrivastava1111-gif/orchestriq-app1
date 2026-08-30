// src/MyAccount.tsx
// The screen a REGULAR user gets: their plan, their usage, and how to upgrade.
// Everything here is scoped to the person looking at it, enforced by the
// database - not by this file.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

const C = { panel:"#0F1420", line:"#1A2030", ink:"#F1F5F9", dim:"#A0AAC0",
            faint:"#5A6480", teal:"#14B8A6", amber:"#F59E0B", green:"#22C55E" };

const card: React.CSSProperties = { background:C.panel, border:"1px solid "+C.line,
  borderRadius:8, padding:14, marginBottom:14, color:C.ink };
const h: React.CSSProperties = { fontSize:13, fontWeight:800, marginBottom:3, color:C.ink };
const sub: React.CSSProperties = { fontSize:9.5, color:C.faint, marginBottom:12, lineHeight:1.55 };
const th: React.CSSProperties = { fontSize:8.5, fontWeight:800, color:C.dim, background:"#0A0E1A",
  textTransform:"uppercase", letterSpacing:0.6, textAlign:"left", padding:"7px 8px",
  borderBottom:"1px solid "+C.line };
const td: React.CSSProperties = { fontSize:10.5, padding:"7px 8px",
  borderBottom:"1px solid "+C.line, color:C.ink };
const btn: React.CSSProperties = { padding:"7px 12px", borderRadius:5, fontSize:10.5,
  fontWeight:700, cursor:"pointer", border:"1px solid "+C.line, background:"#0A0E1A", color:C.ink };
const prim: React.CSSProperties = { ...btn, background:C.teal, color:"#04070F",
  border:"1px solid "+C.teal, fontWeight:800 };

const n = (v: any) => Number(v || 0).toLocaleString();

export default function MyAccount({ onOpenHelp }: { onOpenHelp?: () => void }) {
  const [usage, setUsage] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([
        supabase.rpc("my_usage_summary", { p_days: days }),
        supabase.rpc("my_plan_options"),
      ]);
      if (!u.error) setUsage(u.data);
      if (!p.error) setPlans(p.data);
    } catch { /* leave the screen empty rather than break */ }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const changePlan = async (planId: string, name: string, price: number) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("request_plan_change", { p_plan_id: planId });
      if (error) { setNote(error.message); return; }
      setNote((data as any)?.applied
        ? "You are now on the " + name + " plan."
        : "Request sent for " + name + ". You will get a reply in Help & Support once it is set up.");
      load();
    } finally { setBusy(false); }
  };

  const mine = usage?.mine || [];
  const platform = usage?.platform;
  const totIn  = mine.reduce((a: number, r: any) => a + Number(r.input_tokens || 0), 0);
  const totOut = mine.reduce((a: number, r: any) => a + Number(r.output_tokens || 0), 0);
  const calls  = mine.reduce((a: number, r: any) => a + Number(r.calls || 0), 0);

  return (
    <div style={{ flex:1, height:"100%", overflowY:"auto", padding:16, background:"#070B14" }}>

      {note && (
        <div style={{ background:"rgba(20,184,166,0.08)", border:"1px solid rgba(20,184,166,0.3)",
          borderLeft:"3px solid "+C.teal, borderRadius:5, padding:"9px 12px",
          fontSize:10.5, color:C.dim, marginBottom:14 }}>{note}</div>
      )}

      {/* ── YOUR PLAN ─────────────────────────────────────────────── */}
      <div style={card}>
        <div style={h}>Your plan</div>
        {!plans ? <div style={sub}>Loading…</div> : (
          <>
            <div style={{ display:"flex", gap:24, alignItems:"baseline", marginBottom:12, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:C.teal }}>{plans.current_plan || "Free"}</div>
                <div style={{ fontSize:8.5, color:C.faint, textTransform:"uppercase", letterSpacing:0.6 }}>current plan</div>
              </div>
              <div>
                <div style={{ fontSize:20, fontWeight:800 }}>{plans.sessions_used ?? 0}</div>
                <div style={{ fontSize:8.5, color:C.faint, textTransform:"uppercase", letterSpacing:0.6 }}>sessions used</div>
              </div>
            </div>

            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", background:C.panel }}>
                <thead><tr>
                  <th style={th}>Plan</th><th style={th}>Price</th>
                  <th style={{ ...th, textAlign:"center" }}>Sessions</th>
                  <th style={{ ...th, textAlign:"center" }}>Executives</th>
                  <th style={th}>What you get</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {(plans.plans || []).map((p: any) => (
                    <tr key={p.id} style={{ background: p.is_current ? "rgba(20,184,166,0.06)" : "transparent" }}>
                      <td style={{ ...td, fontWeight:800 }}>
                        {p.name}
                        {p.is_current && <span style={{ fontSize:8, color:C.teal, marginLeft:6 }}>CURRENT</span>}
                      </td>
                      <td style={td}>{Number(p.price_monthly) === 0 ? "Free" : "₹" + n(p.price_monthly) + "/mo"}</td>
                      <td style={{ ...td, textAlign:"center" }}>{p.sessions}</td>
                      <td style={{ ...td, textAlign:"center" }}>{p.executives}</td>
                      <td style={{ ...td, fontSize:9, color:C.dim, lineHeight:1.5 }}>
                        {(p.modules || []).join(" · ") || "—"}
                      </td>
                      <td style={td}>
                        {!p.is_current && (
                          <button style={Number(p.price_monthly) === 0 ? btn : prim} disabled={busy}
                            onClick={() => changePlan(p.id, p.name, Number(p.price_monthly))}>
                            {Number(p.price_monthly) === 0 ? "Switch" : "Request"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...sub, marginTop:10, marginBottom:0 }}>
              Moving to a free plan happens straight away. For a paid plan we set it up by hand —
              press Request and we will confirm in Help &amp; Support.
              {onOpenHelp && <> <span onClick={onOpenHelp} style={{ color:C.teal, cursor:"pointer", fontWeight:700 }}>Open Help &amp; Support</span></>}
            </div>
          </>
        )}
      </div>

      {/* ── YOUR USAGE ────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div><div style={h}>Your usage</div>
            <div style={sub}>Only yours. Nobody else can see this, and you cannot see anyone else's.</div></div>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ ...btn, cursor:"pointer" }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        <div style={{ display:"flex", gap:24, marginBottom:12, flexWrap:"wrap" }}>
          <div><div style={{ fontSize:19, fontWeight:800 }}>{n(calls)}</div>
            <div style={{ fontSize:8.5, color:C.faint, textTransform:"uppercase" }}>AI calls</div></div>
          <div><div style={{ fontSize:19, fontWeight:800, color:C.teal }}>{n(totIn)}</div>
            <div style={{ fontSize:8.5, color:C.faint, textTransform:"uppercase" }}>input tokens</div></div>
          <div><div style={{ fontSize:19, fontWeight:800, color:C.amber }}>{n(totOut)}</div>
            <div style={{ fontSize:8.5, color:C.faint, textTransform:"uppercase" }}>output tokens</div></div>
        </div>

        {!mine.length ? (
          <div style={{ ...sub, marginBottom:0 }}>Nothing recorded in this period yet.</div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", background:C.panel }}>
              <thead><tr>
                <th style={th}>Provider</th><th style={th}>Model</th>
                <th style={{ ...th, textAlign:"right" }}>Calls</th>
                <th style={{ ...th, textAlign:"right" }}>Input</th>
                <th style={{ ...th, textAlign:"right" }}>Output</th>
              </tr></thead>
              <tbody>
                {mine.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight:700 }}>{r.provider}</td>
                    <td style={{ ...td, fontSize:9.5, color:C.dim }}>{r.model}</td>
                    <td style={{ ...td, textAlign:"right" }}>{n(r.calls)}</td>
                    <td style={{ ...td, textAlign:"right", color:C.teal }}>{n(r.input_tokens)}</td>
                    <td style={{ ...td, textAlign:"right", color:C.amber }}>{n(r.output_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PLATFORM TOTAL — only ever returned to the owner ───────── */}
      {platform && (
        <div style={card}>
          <div style={h}>Everyone's usage — owner view</div>
          <div style={sub}>
            The whole platform, all users combined. This section is only ever sent to the owner;
            a regular user's request does not return it at all.
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", background:C.panel }}>
              <thead><tr>
                <th style={th}>Provider</th><th style={th}>Model</th>
                <th style={{ ...th, textAlign:"right" }}>Users</th>
                <th style={{ ...th, textAlign:"right" }}>Calls</th>
                <th style={{ ...th, textAlign:"right" }}>Input</th>
                <th style={{ ...th, textAlign:"right" }}>Output</th>
              </tr></thead>
              <tbody>
                {platform.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight:700 }}>{r.provider}</td>
                    <td style={{ ...td, fontSize:9.5, color:C.dim }}>{r.model}</td>
                    <td style={{ ...td, textAlign:"right" }}>{n(r.users)}</td>
                    <td style={{ ...td, textAlign:"right" }}>{n(r.calls)}</td>
                    <td style={{ ...td, textAlign:"right", color:C.teal }}>{n(r.input_tokens)}</td>
                    <td style={{ ...td, textAlign:"right", color:C.amber }}>{n(r.output_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
