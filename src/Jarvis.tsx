import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

/* ============================================================================
 * JARVIS — Phase 1: Observe / Diagnose / Recommend only. Nothing in this
 * file executes any action anywhere else in the platform. It reads signals
 * a detector function already wrote to the database, and — only when you
 * ask it to — calls the AI to reason about ONE signal and store what it
 * concluded. Tier 2 (execution) is a deliberately separate, later phase.
 * ========================================================================== */

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

export default function Jarvis({ ask }: { ask:(sys:string,msg:any,maxT:number)=>Promise<string> }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [recos, setRecos] = useState<Record<string,Recommendation>>({});
  const [scanning, setScanning] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string|null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string|null>(null);

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
    <div style={{ padding:20, maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:C.ink, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:C.teal }}>◈</span> JARVIS
          </div>
          <div style={{ fontSize:11.5, color:C.faint, marginTop:2 }}>
            Phase 1 — observes and recommends only. Nothing here changes anything else in the platform without you.
          </div>
        </div>
        <button onClick={runScan} disabled={scanning}
          style={{ background:C.teal, color:"#04070F", border:"none", borderRadius:8, padding:"9px 18px",
            fontWeight:700, fontSize:12.5, cursor:scanning?"default":"pointer", opacity:scanning?0.6:1 }}>
          {scanning ? "Scanning…" : "Run scan"}
        </button>
      </div>

      {error && (
        <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8,
          padding:"8px 12px", marginTop:12, fontSize:11.5, color:C.red }}>{error}</div>
      )}

      {modules.length > 0 && (
        <div style={{ display:"flex", gap:6, marginTop:16, marginBottom:12, flexWrap:"wrap" }}>
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
    </div>
  );
}
