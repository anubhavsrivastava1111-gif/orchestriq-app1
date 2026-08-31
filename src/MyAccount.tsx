// src/MyAccount.tsx
// The screen a REGULAR user gets: their plan, their usage, and how to upgrade.
// Everything here is scoped to the person looking at it, enforced by the
// database - not by this file.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
// Shared styling. Every table in the product now uses the same column rules,
// the same padding and the same alignment, so nothing drifts between screens.
import { C, page, card, h1 as h, sub, tableWrap, table as tbl, th, td,
         btn, btnPrimary as prim, statRow, stat, statValue, statLabel, num as n } from "./lib/ui";

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
    <div style={page}>

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
            <div style={statRow}>
              <div style={stat}>
                <div style={statValue(C.teal)}>{plans.current_plan || "Free"}</div>
                <div style={statLabel}>current plan</div>
              </div>
              <div style={stat}>
                <div style={statValue()}>{plans.sessions_used ?? 0}</div>
                <div style={statLabel}>sessions used</div>
              </div>
            </div>

            {/* Fixed column widths so every heading sits above its own column,
                prices and counts right-aligned so they line up on their digits. */}
            <div style={tableWrap}>
              <table style={{ ...tbl, minWidth: 760 }}>
                <colgroup>
                  <col style={{ width: 150 }} /><col style={{ width: 110 }} />
                  <col style={{ width: 90 }} /><col style={{ width: 100 }} />
                  <col /><col style={{ width: 110 }} />
                </colgroup>
                <thead><tr>
                  <th style={th("left")}>Plan</th>
                  <th style={th("right")}>Price</th>
                  <th style={th("right")}>Sessions</th>
                  <th style={th("right")}>Executives</th>
                  <th style={th("left")}>What you get</th>
                  <th style={th("right")}>&nbsp;</th>
                </tr></thead>
                <tbody>
                  {(plans.plans || []).map((p: any) => (
                    <tr key={p.id} style={{ background: p.is_current ? "rgba(20,184,166,0.07)" : "transparent" }}>
                      <td style={{ ...td("left"), fontWeight: 800 }}>
                        {p.name}
                        {p.is_current && <span style={{ fontSize: 8, color: C.teal, marginLeft: 6, fontWeight: 800 }}>CURRENT</span>}
                      </td>
                      <td style={td("right")}>{Number(p.price_monthly) === 0 ? "Free" : "\u20B9" + n(p.price_monthly)}</td>
                      <td style={td("right")}>{p.sessions}</td>
                      <td style={td("right")}>{p.executives}</td>
                      <td style={{ ...td("left", { wrap: true, dim: true }), fontSize: 9 }}>
                        {(p.modules || []).join(" \u00b7 ") || "\u2014"}
                      </td>
                      <td style={td("right")}>
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

        {/* Each figure gets the same minimum width, so the row stays evenly
            spaced instead of shuffling as the numbers change length. */}
        <div style={statRow}>
          <div style={stat}><div style={statValue()}>{n(calls)}</div>
            <div style={statLabel}>AI calls</div></div>
          <div style={stat}><div style={statValue(C.teal)}>{n(totIn)}</div>
            <div style={statLabel}>input tokens</div></div>
          <div style={stat}><div style={statValue(C.amber)}>{n(totOut)}</div>
            <div style={statLabel}>output tokens</div></div>
        </div>

        {!mine.length ? (
          <div style={{ ...sub, marginBottom: 0 }}>Nothing recorded in this period yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ ...tbl, minWidth: 560 }}>
              <colgroup>
                <col style={{ width: 130 }} /><col />
                <col style={{ width: 90 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead><tr>
                <th style={th("left")}>Provider</th>
                <th style={th("left")}>Model</th>
                <th style={th("right")}>Calls</th>
                <th style={th("right")}>Input</th>
                <th style={th("right")}>Output</th>
              </tr></thead>
              <tbody>
                {mine.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td("left"), fontWeight: 700 }}>{r.provider}</td>
                    <td style={{ ...td("left", { mono: true, dim: true }), fontSize: 9.5 }}>{r.model}</td>
                    <td style={td("right")}>{n(r.calls)}</td>
                    <td style={{ ...td("right"), color: C.teal }}>{n(r.input_tokens)}</td>
                    <td style={{ ...td("right"), color: C.amber }}>{n(r.output_tokens)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td("left"), fontWeight: 800, borderTop: "2px solid " + C.line }}>Total</td>
                  <td style={{ ...td("left"), borderTop: "2px solid " + C.line }}></td>
                  <td style={{ ...td("right"), fontWeight: 800, borderTop: "2px solid " + C.line }}>{n(calls)}</td>
                  <td style={{ ...td("right"), fontWeight: 800, color: C.teal, borderTop: "2px solid " + C.line }}>{n(totIn)}</td>
                  <td style={{ ...td("right"), fontWeight: 800, color: C.amber, borderTop: "2px solid " + C.line }}>{n(totOut)}</td>
                </tr>
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
          <div style={tableWrap}>
            <table style={{ ...tbl, minWidth: 640 }}>
              <colgroup>
                <col style={{ width: 130 }} /><col />
                <col style={{ width: 80 }} /><col style={{ width: 90 }} />
                <col style={{ width: 110 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead><tr>
                <th style={th("left")}>Provider</th>
                <th style={th("left")}>Model</th>
                <th style={th("right")}>Users</th>
                <th style={th("right")}>Calls</th>
                <th style={th("right")}>Input</th>
                <th style={th("right")}>Output</th>
              </tr></thead>
              <tbody>
                {platform.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td("left"), fontWeight: 700 }}>{r.provider}</td>
                    <td style={{ ...td("left", { mono: true, dim: true }), fontSize: 9.5 }}>{r.model}</td>
                    <td style={td("right")}>{n(r.users)}</td>
                    <td style={td("right")}>{n(r.calls)}</td>
                    <td style={{ ...td("right"), color: C.teal }}>{n(r.input_tokens)}</td>
                    <td style={{ ...td("right"), color: C.amber }}>{n(r.output_tokens)}</td>
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
