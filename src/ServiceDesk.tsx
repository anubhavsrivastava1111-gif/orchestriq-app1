import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ───────────── types ───────────── */
interface Ticket {
  id: string;
  user_id: string;
  ticket_number: string;
  created_date: string;
  created_time: string;
  requestor: string;
  requestor_dept: string;
  category: string;
  sub_category: string;
  priority: "P1"|"P2"|"P3"|"P4";
  sla_days: number;
  assigned_team: string;
  assigned_member: string;
  current_owner: string;
  reassigned: boolean;
  reassigned_to: string;
  status: "Open"|"Pending"|"In Progress"|"Resolved"|"Closed";
  pending_reason: string;
  first_review_date: string;
  first_review_by: string;
  resolution_date: string;
  closed_date: string;
  resolved_by: string;
  resolution_notes: string;
  csat_score: number;
  returned_to_employee: boolean;
  returned_to_employee_reason: string;
  returned_to_client: boolean;
  returned_to_client_reason: string;
  rca_comments: string;
  corrective_action: string;
  preventive_action: string;
  additional_notes: string;
  created_at: string;
  /* computed client-side */
  first_response_days?: number;
  ticket_age_days?: number;
  sla_breached?: boolean;
}

interface Props {
  co: string;
  compData: any;
  ask: (prompt: string, sys?: string) => Promise<string>;
  supabase: any;
  userId: string;
}

/* ───────────── constants ───────────── */
const PRIORITIES = ["P1","P2","P3","P4"] as const;
const STATUSES = ["Open","Pending","In Progress","Resolved","Closed"] as const;
const AGING_BUCKETS = [
  { label: "0–3 Days", min: 0, max: 3 },
  { label: "4–5 Days", min: 4, max: 5 },
  { label: "6–10 Days", min: 6, max: 10 },
  { label: "11–15 Days", min: 11, max: 15 },
  { label: "16–30 Days", min: 16, max: 30 },
  { label: "31+ Days", min: 31, max: 99999 },
];

const DEFAULT_PENDING_REASONS = [
  "Waiting for Employee Response","Waiting for Client Response","Waiting for Vendor",
  "Waiting for Payroll","Waiting for HR","Waiting for System Fix",
  "Waiting for Leadership Approval","Waiting for Documentation","Waiting for Carrier",
  "Waiting for Technical Team","Incorrect Information Received","Duplicate Request",
  "Investigation In Progress","Knowledge Gap","Resource Constraint","Other"
];

const CATEGORIES = [
  "Benefits","Payroll","HR","IT","Finance","Compliance","Onboarding","Offboarding",
  "Leave Management","Expense","Travel","General Inquiry","Other"
];

const SLA_BY_PRIORITY: Record<string,number> = { P1:1, P2:3, P3:5, P4:10 };

const PRI_COLOR: Record<string,string> = {
  P1:"#EF4444",P2:"#F59E0B",P3:"#3B82F6",P4:"#6B7280"
};
const STATUS_COLOR: Record<string,string> = {
  Open:"#3B82F6","In Progress":"#8B5CF6",Pending:"#F59E0B",Resolved:"#10B981",Closed:"#6B7280"
};

/* ───────────── helpers ───────────── */
function daysBetween(a: string|null, b: string|null): number|null {
  if(!a||!b) return null;
  const d1=new Date(a), d2=new Date(b);
  return Math.floor((d2.getTime()-d1.getTime())/(86400000));
}
function ticketAge(created: string|null, closed: string|null): number {
  if(!created) return 0;
  const end = closed ? new Date(closed) : new Date();
  return Math.max(0, Math.floor((end.getTime()-new Date(created).getTime())/86400000));
}
function enrichTicket(t: any): Ticket {
  const frd = daysBetween(t.created_date, t.first_review_date);
  const age = ticketAge(t.created_date, t.closed_date);
  const sla = t.sla_days || SLA_BY_PRIORITY[t.priority] || 5;
  return { ...t, first_response_days: frd, ticket_age_days: age, sla_days: sla, sla_breached: frd !== null ? frd > sla : null };
}

/* ───────────── CSV parser ───────────── */
function parseCSV(text: string): Record<string,string>[] {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return [];
  const hdr = lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
  return lines.slice(1).map(line=>{
    const vals: string[] = [];
    let cur="", inQ=false;
    for(const ch of line){
      if(ch==='"'){ inQ=!inQ; continue; }
      if(ch===','&&!inQ){ vals.push(cur.trim()); cur=""; continue; }
      cur+=ch;
    }
    vals.push(cur.trim());
    const row: Record<string,string> = {};
    hdr.forEach((h,i)=>{ row[h]=vals[i]||""; });
    return row;
  });
}

const FIELD_MAP: Record<string,string> = {
  "ticket number":"ticket_number","ticket_no":"ticket_number","ticket id":"ticket_number","id":"ticket_number",
  "created date":"created_date","date created":"created_date","open date":"created_date","opened":"created_date",
  "created time":"created_time","time":"created_time",
  "requestor":"requestor","requester":"requestor","raised by":"requestor","submitted by":"requestor",
  "department":"requestor_dept","requestor department":"requestor_dept","dept":"requestor_dept",
  "category":"category","type":"category","ticket type":"category","ticket category":"category",
  "sub category":"sub_category","subcategory":"sub_category","sub_category":"sub_category","sub type":"sub_category",
  "priority":"priority","severity":"priority",
  "assigned team":"assigned_team","team":"assigned_team","assignment group":"assigned_team",
  "assigned member":"assigned_member","assigned to":"assigned_member","assignee":"assigned_member",
  "owner":"current_owner","current owner":"current_owner",
  "status":"status","state":"status","ticket status":"status",
  "pending reason":"pending_reason","hold reason":"pending_reason",
  "first review date":"first_review_date","first response":"first_review_date","first touch":"first_review_date",
  "first review by":"first_review_by",
  "resolution date":"resolution_date","resolved date":"resolution_date","resolved on":"resolution_date",
  "closed date":"closed_date","close date":"closed_date","closed on":"closed_date",
  "resolved by":"resolved_by",
  "resolution notes":"resolution_notes","resolution":"resolution_notes","close notes":"resolution_notes",
  "csat":"csat_score","satisfaction":"csat_score","csat score":"csat_score","customer satisfaction":"csat_score",
  "notes":"additional_notes","comments":"additional_notes","additional notes":"additional_notes"
};

function mapCSVRow(row: Record<string,string>): Partial<Ticket> {
  const mapped: any = {};
  for(const [csvCol, val] of Object.entries(row)){
    const key = FIELD_MAP[csvCol.toLowerCase().trim()] || csvCol.toLowerCase().replace(/\s+/g,"_");
    mapped[key] = val;
  }
  if(mapped.priority && !["P1","P2","P3","P4"].includes(mapped.priority)){
    const p = mapped.priority.toString().toLowerCase();
    if(p.includes("1")||p.includes("critical")||p.includes("high")) mapped.priority="P1";
    else if(p.includes("2")||p.includes("medium")) mapped.priority="P2";
    else if(p.includes("3")||p.includes("normal")) mapped.priority="P3";
    else mapped.priority="P4";
  }
  if(mapped.status){
    const s = mapped.status.toLowerCase();
    if(s.includes("open")||s.includes("new")) mapped.status="Open";
    else if(s.includes("progress")||s.includes("active")||s.includes("work")) mapped.status="In Progress";
    else if(s.includes("pend")||s.includes("hold")||s.includes("wait")) mapped.status="Pending";
    else if(s.includes("resolv")) mapped.status="Resolved";
    else if(s.includes("clos")||s.includes("complet")) mapped.status="Closed";
  }
  if(mapped.csat_score) mapped.csat_score = parseInt(mapped.csat_score)||0;
  if(mapped.sla_days) mapped.sla_days = parseInt(mapped.sla_days) || SLA_BY_PRIORITY[mapped.priority] || 5;
  else mapped.sla_days = SLA_BY_PRIORITY[mapped.priority] || 5;
  return mapped;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function ServiceDesk({ co, compData, ask, supabase, userId }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard"|"tickets"|"upload"|"ai">("dashboard");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [uploadResult, setUploadResult] = useState<{success:number;errors:number}|null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── load tickets ── */
  const loadTickets = useCallback(async()=>{
    if(!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("service_tickets").select("*").eq("user_id", userId).order("created_date",{ascending:false});
    setTickets((data||[]).map(enrichTicket));
    setLoading(false);
  },[supabase, userId]);

  useEffect(()=>{ loadTickets(); },[loadTickets]);

  /* ── CSV upload ── */
  const handleUpload = async(e: React.ChangeEvent<HTMLInputElement>)=>{
    const file = e.target.files?.[0];
    if(!file||!supabase) return;
    setUploading(true); setUploadResult(null);
    const text = await file.text();
    const rows = parseCSV(text);
    let success=0, errors=0;
    for(const row of rows){
      const mapped = mapCSVRow(row);
      if(!mapped.ticket_number){ errors++; continue; }
      const { error } = await supabase.from("service_tickets").insert({ ...mapped, user_id: userId });
      if(error) errors++; else success++;
    }
    setUploadResult({success,errors});
    setUploading(false);
    loadTickets();
    if(fileRef.current) fileRef.current.value="";
  };

  /* ── computed metrics ── */
  const metrics = useMemo(()=>{
    const open = tickets.filter(t=>!["Resolved","Closed"].includes(t.status));
    const resolved = tickets.filter(t=>["Resolved","Closed"].includes(t.status));
    const breached = tickets.filter(t=>t.sla_breached===true);
    const slaChecked = tickets.filter(t=>t.sla_breached!==null&&t.sla_breached!==undefined);
    const slaPct = slaChecked.length>0 ? ((slaChecked.length-breached.length)/slaChecked.length*100) : 100;
    const avgAge = open.length>0 ? open.reduce((s,t)=>s+(t.ticket_age_days||0),0)/open.length : 0;
    const avgCSAT = resolved.filter(t=>t.csat_score>0);
    const csatAvg = avgCSAT.length>0 ? avgCSAT.reduce((s,t)=>s+t.csat_score,0)/avgCSAT.length : 0;
    const agingBuckets = AGING_BUCKETS.map(b=>({
      ...b, count: open.filter(t=>(t.ticket_age_days||0)>=b.min&&(t.ticket_age_days||0)<=b.max).length
    }));
    const byStatus: Record<string,number> = {};
    tickets.forEach(t=>{ byStatus[t.status]=(byStatus[t.status]||0)+1; });
    const byPriority: Record<string,number> = {};
    tickets.forEach(t=>{ byPriority[t.priority]=(byPriority[t.priority]||0)+1; });
    const byTeam: Record<string,{total:number;resolved:number;breached:number}> = {};
    tickets.forEach(t=>{
      const team = t.assigned_team||"Unassigned";
      if(!byTeam[team]) byTeam[team]={total:0,resolved:0,breached:0};
      byTeam[team].total++;
      if(["Resolved","Closed"].includes(t.status)) byTeam[team].resolved++;
      if(t.sla_breached) byTeam[team].breached++;
    });
    const byMember: Record<string,{total:number;resolved:number;avgAge:number}> = {};
    tickets.forEach(t=>{
      const m = t.assigned_member||t.current_owner||"Unassigned";
      if(!byMember[m]) byMember[m]={total:0,resolved:0,avgAge:0};
      byMember[m].total++;
      if(["Resolved","Closed"].includes(t.status)) byMember[m].resolved++;
    });
    Object.entries(byMember).forEach(([m,v])=>{
      const memberTickets = tickets.filter(t=>(t.assigned_member||t.current_owner||"Unassigned")===m);
      v.avgAge = memberTickets.length>0 ? memberTickets.reduce((s,t)=>s+(t.ticket_age_days||0),0)/memberTickets.length : 0;
    });
    const pendingReasons: Record<string,number> = {};
    tickets.filter(t=>t.status==="Pending"&&t.pending_reason).forEach(t=>{
      pendingReasons[t.pending_reason]=(pendingReasons[t.pending_reason]||0)+1;
    });
    return { total:tickets.length, open:open.length, resolved:resolved.length, breached:breached.length,
      slaPct, avgAge, csatAvg, agingBuckets, byStatus, byPriority, byTeam, byMember, pendingReasons };
  },[tickets]);

  /* ── AI analysis ── */
  const runAI = async(type: string)=>{
    setAiLoading(true); setAiResult("");
    const snapshot = {
      total: metrics.total, open: metrics.open, resolved: metrics.resolved,
      slaPct: metrics.slaPct.toFixed(1), breached: metrics.breached,
      avgAge: metrics.avgAge.toFixed(1), csatAvg: metrics.csatAvg.toFixed(1),
      agingBuckets: metrics.agingBuckets, byTeam: metrics.byTeam,
      byMember: metrics.byMember, pendingReasons: metrics.pendingReasons,
      byStatus: metrics.byStatus, byPriority: metrics.byPriority,
      recentTickets: tickets.slice(0,30).map(t=>({
        ticket_number:t.ticket_number, priority:t.priority, status:t.status,
        category:t.category, assigned_team:t.assigned_team, assigned_member:t.assigned_member,
        age_days:t.ticket_age_days, sla_breached:t.sla_breached, pending_reason:t.pending_reason,
        csat_score:t.csat_score
      }))
    };
    const prompts: Record<string,string> = {
      daily: `You are a Service Delivery Operations Director. Generate a concise Daily Operations Report.\n\nData:\n${JSON.stringify(snapshot,null,1)}\n\nCover: Executive Summary (3 lines), Ticket Volume (received/closed/open), SLA Performance (% and breaches with reasons), Aging Analysis (by bucket), Team Performance (top/bottom), Key Risks, Recommended Actions. Use tables where helpful. Be specific with numbers.`,
      weekly: `You are a VP of Service Operations. Generate a Weekly Executive Performance Report.\n\nData:\n${JSON.stringify(snapshot,null,1)}\n\nCover: Week Summary, Volume Trends, SLA Achievement %, Team Rankings, Top Pending Reasons, Aging Trends, CSAT Summary, Escalation Trends, Recommendations. Executive-ready format.`,
      rca: `You are a Root Cause Analysis Expert. Analyze SLA breaches and operational bottlenecks.\n\nData:\n${JSON.stringify(snapshot,null,1)}\n\nProvide: Top breach causes with %, Pattern analysis, Systemic issues, Corrective actions, Preventive measures. Be specific — cite ticket numbers and teams.`,
      workforce: `You are a Workforce Analytics Director. Analyze team and individual performance.\n\nData:\n${JSON.stringify(snapshot,null,1)}\n\nCover: Individual productivity ranking, Workload distribution analysis, Overloaded vs underutilized members, Resolution rate by member, Recommendations for redistribution. Include specific numbers.`,
      forecast: `You are an Operations Forecasting Analyst. Predict next period performance.\n\nData:\n${JSON.stringify(snapshot,null,1)}\n\nProvide: Expected ticket volume trend, Predicted SLA breaches, Staffing recommendations, Backlog risk assessment, Actionable mitigation steps.`
    };
    try {
      const result = await ask(prompts[type]||prompts.daily, `You are an enterprise service delivery AI agent for ${co}. Provide actionable, data-driven analysis. Use markdown tables. Be specific with numbers — never generalize.`);
      setAiResult(result);
    } catch(e:any){ setAiResult("Error: "+e.message); }
    setAiLoading(false);
  };

  /* ── filtered tickets for table ── */
  const filtered = useMemo(()=>{
    return tickets.filter(t=>{
      if(filterStatus!=="all"&&t.status!==filterStatus) return false;
      if(filterPriority!=="all"&&t.priority!==filterPriority) return false;
      return true;
    });
  },[tickets, filterStatus, filterPriority]);

  /* ── styles ── */
  const S: Record<string,React.CSSProperties> = {
    wrap: { padding: "24px 28px", fontFamily: "Inter, system-ui, sans-serif", color: "#C5D4E8", minHeight: "100vh" },
    hdr: { fontSize: 22, fontWeight: 700, color: "#E8EFF8", marginBottom: 4 },
    sub: { fontSize: 12, color: "#4D6A8A", marginBottom: 20 },
    tabs: { display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1C2A40" },
    tab: { padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", color: "#4D6A8A", borderBottom: "2px solid transparent", transition: "all 0.2s" },
    tabA: { padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", color: "#14B8A6", borderBottom: "2px solid #14B8A6", transition: "all 0.2s" },
    card: { background: "#0D1520", border: "1px solid #1C2A40", borderRadius: 10, padding: "16px 20px" },
    metricVal: { fontSize: 28, fontWeight: 700, color: "#E8EFF8", lineHeight: 1 },
    metricLbl: { fontSize: 10, color: "#4D6A8A", marginTop: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
    grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 },
    barBg: { height: 8, borderRadius: 4, background: "#1C2A40", overflow: "hidden" as const },
    btn: { padding: "8px 16px", borderRadius: 6, border: "1px solid #14B8A644", background: "rgba(20,184,166,0.1)", color: "#14B8A6", fontSize: 12, fontWeight: 600, cursor: "pointer" },
    btnSm: { padding: "6px 12px", borderRadius: 5, border: "1px solid #1C2A40", background: "transparent", color: "#8FA8CC", fontSize: 11, cursor: "pointer" },
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 },
    th: { textAlign: "left" as const, padding: "8px 10px", borderBottom: "1px solid #1C2A40", color: "#4D6A8A", fontWeight: 600, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
    td: { padding: "8px 10px", borderBottom: "1px solid #0D1520" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 },
    upload: { border: "2px dashed #1C2A40", borderRadius: 10, padding: "40px 20px", textAlign: "center" as const, cursor: "pointer" },
    aiBox: { background: "#0A0F18", border: "1px solid #1C2A40", borderRadius: 8, padding: "16px 20px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" as const, maxHeight: 500, overflowY: "auto" as const },
  };

  if(loading) return <div style={{...S.wrap, display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#4D6A8A"}}>Loading Service Desk...</div></div>;

  return (
    <div style={S.wrap}>
      <div style={S.hdr}>🎯 Service Delivery Intelligence</div>
      <div style={S.sub}>Agentic Operations Governance • SLA Monitoring • Workforce Analytics • AI-Powered Insights</div>

      {/* Tabs */}
      <div style={S.tabs}>
        {(["dashboard","tickets","upload","ai"] as const).map(t=>(
          <button key={t} style={tab===t?S.tabA:S.tab} onClick={()=>setTab(t)}>
            {t==="dashboard"?"📊 Dashboard":t==="tickets"?"📋 Tickets":t==="upload"?"📤 Upload Data":"🤖 AI Reports"}
          </button>
        ))}
      </div>

      {/* ══════ DASHBOARD ══════ */}
      {tab==="dashboard"&&(
        <div>
          {/* Top metrics */}
          <div style={S.grid4}>
            {[
              { val: metrics.total, lbl: "Total Tickets", color: "#8FA8CC" },
              { val: metrics.open, lbl: "Open Tickets", color: "#3B82F6" },
              { val: metrics.resolved, lbl: "Resolved", color: "#10B981" },
              { val: metrics.slaPct.toFixed(1)+"%", lbl: "SLA Compliance", color: (metrics.slaPct>=95?"#10B981":metrics.slaPct>=85?"#F59E0B":"#EF4444") },
              { val: metrics.breached, lbl: "SLA Breaches", color: metrics.breached>0?"#EF4444":"#10B981" },
              { val: metrics.avgAge.toFixed(1)+"d", lbl: "Avg Aging (Open)", color: "#F59E0B" },
              { val: metrics.csatAvg.toFixed(1)+"/5", lbl: "Avg CSAT", color: metrics.csatAvg>=4?"#10B981":"#F59E0B" },
              { val: Object.keys(metrics.byTeam).length, lbl: "Active Teams", color: "#8B5CF6" },
            ].map((m,i)=>(
              <div key={i} style={S.card}>
                <div style={{...S.metricVal, color:m.color}}>{m.val}</div>
                <div style={S.metricLbl}>{m.lbl}</div>
              </div>
            ))}
          </div>

          {/* Status + Priority split */}
          <div style={S.grid2}>
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>By Status</div>
              {STATUSES.map(s=>{
                const c = metrics.byStatus[s]||0;
                const pct = metrics.total>0 ? c/metrics.total*100 : 0;
                return (
                  <div key={s} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                      <span style={{color:STATUS_COLOR[s]}}>{s}</span>
                      <span style={{color:"#4D6A8A"}}>{c} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={S.barBg}><div style={{height:8,borderRadius:4,background:STATUS_COLOR[s],width:pct+"%",transition:"width 0.5s"}}/></div>
                  </div>
                );
              })}
            </div>

            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>By Priority</div>
              {PRIORITIES.map(p=>{
                const c = metrics.byPriority[p]||0;
                const pct = metrics.total>0 ? c/metrics.total*100 : 0;
                return (
                  <div key={p} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                      <span style={{color:PRI_COLOR[p]}}>{p}</span>
                      <span style={{color:"#4D6A8A"}}>{c} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={S.barBg}><div style={{height:8,borderRadius:4,background:PRI_COLOR[p],width:pct+"%",transition:"width 0.5s"}}/></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aging Buckets */}
          <div style={{...S.card, marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>Aging Analysis (Open Tickets)</div>
            <div style={{display:"flex",gap:10}}>
              {metrics.agingBuckets.map((b,i)=>(
                <div key={i} style={{flex:1,textAlign:"center",padding:"12px 6px",background:b.count>0?(i>=4?"rgba(239,68,68,0.1)":i>=3?"rgba(245,158,11,0.1)":"rgba(20,184,166,0.05)"):"transparent",borderRadius:8,border:"1px solid "+(b.count>0?(i>=4?"#EF444444":i>=3?"#F59E0B44":"#1C2A40"):"#1C2A40")}}>
                  <div style={{fontSize:20,fontWeight:700,color:b.count>0?(i>=4?"#EF4444":i>=3?"#F59E0B":"#14B8A6"):"#2D4460"}}>{b.count}</div>
                  <div style={{fontSize:9,color:"#4D6A8A",marginTop:2}}>{b.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Team Performance */}
          {Object.keys(metrics.byTeam).length>0&&(
            <div style={{...S.card,marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>Team Performance</div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Team</th><th style={S.th}>Total</th><th style={S.th}>Resolved</th>
                  <th style={S.th}>Resolution %</th><th style={S.th}>SLA Breaches</th>
                </tr></thead>
                <tbody>{Object.entries(metrics.byTeam).map(([team,v])=>(
                  <tr key={team}>
                    <td style={{...S.td,color:"#C5D4E8",fontWeight:600}}>{team}</td>
                    <td style={S.td}>{v.total}</td>
                    <td style={{...S.td,color:"#10B981"}}>{v.resolved}</td>
                    <td style={S.td}>{v.total>0?(v.resolved/v.total*100).toFixed(0)+"%":"–"}</td>
                    <td style={{...S.td,color:v.breached>0?"#EF4444":"#10B981"}}>{v.breached}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* Member Performance */}
          {Object.keys(metrics.byMember).length>0&&(
            <div style={{...S.card,marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>Individual Productivity</div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Member</th><th style={S.th}>Assigned</th><th style={S.th}>Resolved</th>
                  <th style={S.th}>Resolution %</th><th style={S.th}>Avg Age (days)</th>
                </tr></thead>
                <tbody>{Object.entries(metrics.byMember).sort((a,b)=>b[1].total-a[1].total).map(([m,v])=>(
                  <tr key={m}>
                    <td style={{...S.td,color:"#C5D4E8",fontWeight:600}}>{m}</td>
                    <td style={S.td}>{v.total}</td>
                    <td style={{...S.td,color:"#10B981"}}>{v.resolved}</td>
                    <td style={S.td}>{v.total>0?(v.resolved/v.total*100).toFixed(0)+"%":"–"}</td>
                    <td style={{...S.td,color:v.avgAge>10?"#EF4444":v.avgAge>5?"#F59E0B":"#10B981"}}>{v.avgAge.toFixed(1)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* Pending Reasons */}
          {Object.keys(metrics.pendingReasons).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:12}}>Top Pending Reasons</div>
              {Object.entries(metrics.pendingReasons).sort((a,b)=>b[1]-a[1]).map(([reason,count])=>{
                const maxR = Math.max(...Object.values(metrics.pendingReasons));
                return (
                  <div key={reason} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                      <span style={{color:"#C5D4E8"}}>{reason}</span><span style={{color:"#4D6A8A"}}>{count}</span>
                    </div>
                    <div style={S.barBg}><div style={{height:6,borderRadius:3,background:"#F59E0B",width:(count/maxR*100)+"%"}}/></div>
                  </div>
                );
              })}
            </div>
          )}

          {metrics.total===0&&(
            <div style={{...S.card,textAlign:"center",padding:40}}>
              <div style={{fontSize:40,marginBottom:12}}>📤</div>
              <div style={{fontSize:14,color:"#E8EFF8",fontWeight:600,marginBottom:6}}>No ticket data yet</div>
              <div style={{fontSize:12,color:"#4D6A8A",marginBottom:16}}>Upload a CSV from ServiceNow, Concur, or any ticketing system to get started</div>
              <button style={S.btn} onClick={()=>setTab("upload")}>Upload Data →</button>
            </div>
          )}
        </div>
      )}

      {/* ══════ TICKETS TABLE ══════ */}
      {tab==="tickets"&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{...S.btnSm,background:"#0D1520"}}>
              <option value="all">All Statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}
              style={{...S.btnSm,background:"#0D1520"}}>
              <option value="all">All Priorities</option>
              {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{flex:1}}/>
            <span style={{fontSize:11,color:"#4D6A8A"}}>{filtered.length} tickets</span>
          </div>
          <div style={{...S.card,overflowX:"auto"}}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Ticket #</th><th style={S.th}>Date</th><th style={S.th}>Priority</th>
                <th style={S.th}>Category</th><th style={S.th}>Requestor</th><th style={S.th}>Assigned To</th>
                <th style={S.th}>Status</th><th style={S.th}>Age</th><th style={S.th}>SLA</th>
              </tr></thead>
              <tbody>
                {filtered.length===0&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#4D6A8A",padding:30}}>No tickets found</td></tr>}
                {filtered.slice(0,100).map(t=>(
                  <tr key={t.id} style={{cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.background="#0A0F18")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <td style={{...S.td,color:"#14B8A6",fontWeight:600,fontFamily:"JetBrains Mono, monospace"}}>{t.ticket_number}</td>
                    <td style={{...S.td,fontSize:10,color:"#4D6A8A"}}>{t.created_date||"–"}</td>
                    <td style={S.td}><span style={{...S.badge,background:PRI_COLOR[t.priority]+"22",color:PRI_COLOR[t.priority]}}>{t.priority}</span></td>
                    <td style={{...S.td,color:"#8FA8CC"}}>{t.category||"–"}</td>
                    <td style={{...S.td,color:"#C5D4E8"}}>{t.requestor||"–"}</td>
                    <td style={{...S.td,color:"#C5D4E8"}}>{t.assigned_member||t.current_owner||"–"}</td>
                    <td style={S.td}><span style={{...S.badge,background:(STATUS_COLOR[t.status]||"#6B7280")+"22",color:STATUS_COLOR[t.status]||"#6B7280"}}>{t.status}</span></td>
                    <td style={{...S.td,color:(t.ticket_age_days||0)>10?"#EF4444":(t.ticket_age_days||0)>5?"#F59E0B":"#10B981",fontWeight:600}}>{t.ticket_age_days||0}d</td>
                    <td style={S.td}>{t.sla_breached===true?<span style={{color:"#EF4444",fontWeight:700}}>⚠ Breach</span>:t.sla_breached===false?<span style={{color:"#10B981"}}>✓</span>:<span style={{color:"#4D6A8A"}}>–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════ UPLOAD ══════ */}
      {tab==="upload"&&(
        <div>
          <div style={{...S.card,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700,color:"#E8EFF8",marginBottom:8}}>Upload Ticket Data</div>
            <div style={{fontSize:12,color:"#4D6A8A",marginBottom:16}}>
              Upload a CSV exported from ServiceNow, Concur, Helpdesk, or any ticketing system. Column headers are auto-mapped.
            </div>
            <div style={S.upload} onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} style={{display:"none"}}/>
              {uploading ? (
                <div style={{color:"#14B8A6"}}>⏳ Importing tickets...</div>
              ) : (
                <>
                  <div style={{fontSize:36,marginBottom:8}}>📄</div>
                  <div style={{fontSize:13,color:"#C5D4E8",fontWeight:600}}>Click to upload CSV</div>
                  <div style={{fontSize:11,color:"#4D6A8A",marginTop:4}}>or drag and drop</div>
                </>
              )}
            </div>
            {uploadResult&&(
              <div style={{marginTop:12,padding:"10px 14px",borderRadius:6,background:uploadResult.errors>0?"rgba(245,158,11,0.1)":"rgba(16,185,129,0.1)",border:"1px solid "+(uploadResult.errors>0?"#F59E0B44":"#10B98144")}}>
                <span style={{fontSize:12,color:"#E8EFF8"}}>✅ {uploadResult.success} tickets imported</span>
                {uploadResult.errors>0&&<span style={{fontSize:12,color:"#F59E0B",marginLeft:10}}>⚠ {uploadResult.errors} rows skipped</span>}
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={{fontSize:12,fontWeight:700,color:"#E8EFF8",marginBottom:10}}>Supported Column Headers</div>
            <div style={{fontSize:11,color:"#4D6A8A",lineHeight:1.8}}>
              The system auto-maps common headers. Examples of recognized columns:
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
              {["Ticket Number","Created Date","Priority","Category","Status","Assigned To","Team",
                "Requestor","Department","Resolution Date","Closed Date","CSAT","Pending Reason",
                "First Response","Resolved By","Notes"].map(h=>(
                <span key={h} style={{...S.badge,background:"#1C2A40",color:"#8FA8CC",padding:"3px 8px"}}>{h}</span>
              ))}
            </div>
            <div style={{fontSize:11,color:"#4D6A8A",marginTop:12}}>
              Priority values like "Critical", "High", "Medium", "Low" or "1","2","3","4" are auto-converted to P1–P4.
            </div>
          </div>
        </div>
      )}

      {/* ══════ AI REPORTS ══════ */}
      {tab==="ai"&&(
        <div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}}>
            {[
              {key:"daily",icon:"📊",label:"Daily Ops Report"},
              {key:"weekly",icon:"📈",label:"Weekly Executive"},
              {key:"rca",icon:"🔍",label:"Root Cause Analysis"},
              {key:"workforce",icon:"👥",label:"Workforce Analytics"},
              {key:"forecast",icon:"🔮",label:"Forecast & Risk"},
            ].map(r=>(
              <button key={r.key} style={{...S.btn,opacity:aiLoading?0.5:1}} disabled={aiLoading||metrics.total===0}
                onClick={()=>runAI(r.key)}>
                {r.icon} {r.label}
              </button>
            ))}
          </div>
          {metrics.total===0&&(
            <div style={{...S.card,textAlign:"center",padding:30,color:"#4D6A8A",fontSize:12}}>
              Upload ticket data first to generate AI reports
            </div>
          )}
          {aiLoading&&(
            <div style={{...S.card,textAlign:"center",padding:30}}>
              <div style={{color:"#14B8A6",fontSize:13}}>🤖 AI agents analyzing your operations data...</div>
            </div>
          )}
          {aiResult&&!aiLoading&&(
            <div style={S.aiBox}>{aiResult}</div>
          )}
        </div>
      )}
    </div>
  );
}
