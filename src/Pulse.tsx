import React,{useState,useRef,useMemo,useCallback} from "react";

// ══════════════════════════════════════════════════════════════════
// PULSE — Governance Intelligence Module
// Sub-modules: Dispatch | ServiceNow | Concur Audit | Email
// ══════════════════════════════════════════════════════════════════

/* ── Types ── */
interface SNTicket {
  id:string; ticketNumber:string; createdDate:string; priority:string;
  category:string; status:string; assignedTo:string; team:string;
  requestor:string; department:string; resolutionDate:string;
  closedDate:string; csat:string; pendingReason:string;
  firstResponse:string; resolvedBy:string; notes:string;
}
interface ConcurRecord {
  id:string; reportId:string; employeeName:string; department:string;
  submissionDate:string; reportAmount:string; policyViolations:string;
  auditStatus:string; auditor:string; reviewDate:string;
  exceptionType:string; resolution:string; notes:string;
}
interface EmailRecord {
  id:string; dateSent:string; recipient:string; subject:string;
  category:string; status:string; responseDueDate:string;
  respondedDate:string; notes:string;
}

/* ── Palette (matches OrchestrIQ dark theme) ── */
const C={
  bg:"#0B1120",card:"#111827",cardHover:"#1A2332",
  border:"#1E2D3D",borderLight:"#2A3A4A",
  accent:"#14B8A6",accentDim:"rgba(20,184,166,0.12)",
  accentText:"#5EEAD4",
  warn:"#F59E0B",warnDim:"rgba(245,158,11,0.12)",
  danger:"#EF4444",dangerDim:"rgba(239,68,68,0.12)",
  success:"#10B981",successDim:"rgba(16,185,129,0.12)",
  info:"#3B82F6",infoDim:"rgba(59,130,246,0.12)",
  purple:"#8B5CF6",purpleDim:"rgba(139,92,246,0.12)",
  text:"#E8EFF8",textMid:"#94A3B8",textDim:"#4D6A8A",
  white:"#FFFFFF",
};

/* ── Styles ── */
const S:Record<string,React.CSSProperties>={
  wrap:{padding:0,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,flex:1,display:"flex",flexDirection:"column" as const,height:"100%",overflow:"hidden"},
  moduleBar:{display:"flex",gap:6,padding:"10px 14px",flexWrap:"wrap" as const,borderBottom:`1px solid ${C.border}`,background:C.bg,flexShrink:0},
  moduleBtn:(a:boolean):React.CSSProperties=>({padding:"8px 16px",borderRadius:8,border:`1px solid ${a?C.accent:C.border}`,background:a?C.accentDim:"transparent",color:a?C.accentText:C.textMid,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"}),
  subTab:(a:boolean):React.CSSProperties=>({padding:"6px 14px",borderRadius:6,border:"none",background:a?C.card:"transparent",color:a?C.text:C.textDim,fontSize:11,fontWeight:500,cursor:"pointer"}),
  card:{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:16,marginBottom:14},
  kpiGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:16},
  kpi:(color:string):React.CSSProperties=>({background:`${color}11`,border:`1px solid ${color}33`,borderRadius:8,padding:"12px 14px"}),
  kpiVal:{fontSize:22,fontWeight:700,lineHeight:1.2},
  kpiLabel:{fontSize:10,fontWeight:500,color:C.textDim,marginTop:4,textTransform:"uppercase" as const,letterSpacing:"0.05em"},
  tableWrap:{overflowX:"auto" as const,borderRadius:8,border:`1px solid ${C.border}`},
  table:{width:"100%",borderCollapse:"collapse" as const,fontSize:11},
  th:{padding:"8px 10px",textAlign:"left" as const,fontWeight:600,fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.04em",color:C.textDim,background:C.bg,borderBottom:`1px solid ${C.border}`,position:"sticky" as const,top:0,whiteSpace:"nowrap" as const},
  td:{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,color:C.text,verticalAlign:"top" as const},
  input:{background:"transparent",border:"none",color:C.text,fontSize:11,width:"100%",outline:"none",padding:"2px 0"},
  btn:(bg:string):React.CSSProperties=>({padding:"7px 14px",borderRadius:6,border:"none",background:bg,color:C.white,fontSize:11,fontWeight:600,cursor:"pointer"}),
  btnOutline:{padding:"7px 14px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.textMid,fontSize:11,fontWeight:600,cursor:"pointer"},
  badge:(bg:string,fg:string):React.CSSProperties=>({display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600,background:bg,color:fg}),
  upload:{border:`2px dashed ${C.border}`,borderRadius:8,padding:24,textAlign:"center" as const,cursor:"pointer",transition:"border-color .15s"},
  aiPanel:{background:"#0D1F2D",border:`1px solid ${C.accent}33`,borderRadius:10,padding:16,marginTop:14,whiteSpace:"pre-wrap" as const,fontSize:12,lineHeight:1.7,color:C.text,maxHeight:500,overflowY:"auto" as const},
};

/* ── Helpers ── */
const uid=()=>Math.random().toString(36).slice(2,10);
const daysBetween=(a:string,b:string)=>{if(!a)return 0;const d1=new Date(a),d2=b?new Date(b):new Date();const diff=Math.floor((d2.getTime()-d1.getTime())/(864e5));return isNaN(diff)?0:diff;};
const today=()=>new Date().toISOString().slice(0,10);
const fmtN=(n:number)=>n.toLocaleString("en-IN");

const PRIORITIES=["Critical","High","Medium","Low"];
const SN_STATUSES=["Open","Assigned","In Progress","Pending","Resolved","Closed"];
const CONCUR_STATUSES=["Pending Review","Under Audit","Exception Raised","Cleared","Escalated","Closed"];
const EMAIL_CATEGORIES=["Follow-up","Escalation","Notification","Reminder","Approval Request","General"];
const EMAIL_STATUSES=["Sent","Awaiting Response","Responded","Overdue","No Response Required"];

const emptySN=():SNTicket=>({id:uid(),ticketNumber:"",createdDate:today(),priority:"Medium",category:"",status:"Open",assignedTo:"",team:"",requestor:"",department:"",resolutionDate:"",closedDate:"",csat:"",pendingReason:"",firstResponse:"",resolvedBy:"",notes:""});
const emptyConcur=():ConcurRecord=>({id:uid(),reportId:"",employeeName:"",department:"",submissionDate:today(),reportAmount:"",policyViolations:"0",auditStatus:"Pending Review",auditor:"",reviewDate:"",exceptionType:"",resolution:"",notes:""});
const emptyEmail=():EmailRecord=>({id:uid(),dateSent:today(),recipient:"",subject:"",category:"Follow-up",status:"Sent",responseDueDate:"",respondedDate:"",notes:""});

/* ── CSV Parser ── */
function parseCSV(text:string):Record<string,string>[]{
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return[];
  const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
  return lines.slice(1).map(line=>{
    const vals:string[]=[];let cur="",inQ=false;
    for(const ch of line){if(ch==='"'){inQ=!inQ}else if(ch===","&&!inQ){vals.push(cur.trim());cur=""}else{cur+=ch}}
    vals.push(cur.trim());
    const obj:Record<string,string>={};
    headers.forEach((h,i)=>{obj[h]=vals[i]?.replace(/^"|"$/g,"")||""});
    return obj;
  });
}

/* ── Column mapping (auto-map common ServiceNow/Concur headers) ── */
const SN_HEADER_MAP:Record<string,keyof SNTicket>={
  "ticket number":"ticketNumber","ticket_number":"ticketNumber","ticket id":"ticketNumber","number":"ticketNumber",
  "created date":"createdDate","created":"createdDate","opened":"createdDate","opened at":"createdDate",
  "priority":"priority","urgency":"priority",
  "category":"category","type":"category",
  "status":"status","state":"status","stage":"status",
  "assigned to":"assignedTo","assignee":"assignedTo",
  "team":"team","assignment group":"team","group":"team",
  "requestor":"requestor","requester":"requestor","caller":"requestor","opened by":"requestor",
  "department":"department","dept":"department",
  "resolution date":"resolutionDate","resolved at":"resolutionDate","resolved date":"resolutionDate",
  "closed date":"closedDate","closed at":"closedDate",
  "csat":"csat","satisfaction":"csat","rating":"csat",
  "pending reason":"pendingReason","hold reason":"pendingReason",
  "first response":"firstResponse","first response date":"firstResponse",
  "resolved by":"resolvedBy",
  "notes":"notes","comments":"notes","description":"notes",
};
const CONCUR_HEADER_MAP:Record<string,keyof ConcurRecord>={
  "report id":"reportId","report_id":"reportId","expense report":"reportId",
  "employee name":"employeeName","employee":"employeeName","name":"employeeName",
  "department":"department","dept":"department",
  "submission date":"submissionDate","submitted":"submissionDate","date":"submissionDate",
  "report amount":"reportAmount","amount":"reportAmount","total":"reportAmount",
  "policy violations":"policyViolations","violations":"policyViolations",
  "audit status":"auditStatus","status":"auditStatus",
  "auditor":"auditor","reviewer":"auditor",
  "review date":"reviewDate","reviewed":"reviewDate",
  "exception type":"exceptionType","exception":"exceptionType",
  "resolution":"resolution",
  "notes":"notes","comments":"notes",
};

function mapCSVtoSN(rows:Record<string,string>[]):SNTicket[]{
  return rows.map(row=>{
    const t=emptySN();
    Object.entries(row).forEach(([k,v])=>{
      const mapped=SN_HEADER_MAP[k.toLowerCase().trim()];
      if(mapped)(t as any)[mapped]=v;
    });
    if(!t.ticketNumber)t.ticketNumber="INC"+uid().slice(0,6).toUpperCase();
    return t;
  });
}
function mapCSVtoConcur(rows:Record<string,string>[]):ConcurRecord[]{
  return rows.map(row=>{
    const r=emptyConcur();
    Object.entries(row).forEach(([k,v])=>{
      const mapped=CONCUR_HEADER_MAP[k.toLowerCase().trim()];
      if(mapped)(r as any)[mapped]=v;
    });
    if(!r.reportId)r.reportId="RPT"+uid().slice(0,6).toUpperCase();
    return r;
  });
}

/* ════════════════════════════════════════════════════════════════ */
/* COMPONENT                                                       */
/* ════════════════════════════════════════════════════════════════ */

interface PulseProps {
  callAI?:(prompt:string)=>Promise<string>;
  companyName?:string;
  existingDispatch?:React.ReactNode;
}

export default function PulseGovernance({callAI,companyName="Your Company",existingDispatch}:PulseProps){
  const [module,setModule]=useState<"dispatch"|"servicenow"|"concur"|"email">("dispatch");
  const [subView,setSubView]=useState<"dashboard"|"table"|"ai">("dashboard");

  /* ── ServiceNow State ── */
  const [snTickets,setSnTickets]=useState<SNTicket[]>([]);
  const [snAiReport,setSnAiReport]=useState("");
  const [snLoading,setSnLoading]=useState(false);
  const snFileRef=useRef<HTMLInputElement>(null);

  /* ── Concur State ── */
  const [concurRecords,setConcurRecords]=useState<ConcurRecord[]>([]);
  const [concurAiReport,setConcurAiReport]=useState("");
  const [concurLoading,setConcurLoading]=useState(false);
  const concurFileRef=useRef<HTMLInputElement>(null);

  /* ── Email State ── */
  const [emailRecords,setEmailRecords]=useState<EmailRecord[]>([]);
  const [emailAiReport,setEmailAiReport]=useState("");
  const [emailLoading,setEmailLoading]=useState(false);

  /* ══ ServiceNow Calculations ══ */
  const snMetrics=useMemo(()=>{
    const active=snTickets.filter(t=>!["Resolved","Closed"].includes(t.status));
    const resolved=snTickets.filter(t=>["Resolved","Closed"].includes(t.status));
    const slaMet=snTickets.filter(t=>{
      if(!t.firstResponse||!t.createdDate)return false;
      return daysBetween(t.createdDate,t.firstResponse)<=3;
    });
    const slaPct=snTickets.length>0?Math.round((slaMet.length/snTickets.length)*100):0;
    const aging={bucket0_3:0,bucket4_5:0,bucket5plus:0};
    active.forEach(t=>{
      const d=daysBetween(t.createdDate,"");
      if(d<=3)aging.bucket0_3++;
      else if(d<=5)aging.bucket4_5++;
      else aging.bucket5plus++;
    });
    const avgResolve=resolved.length>0?Math.round(resolved.reduce((s,t)=>s+daysBetween(t.createdDate,t.resolutionDate||t.closedDate),0)/resolved.length):0;
    const byTeam:Record<string,{total:number,resolved:number}>={}; 
    snTickets.forEach(t=>{
      const team=t.team||"Unassigned";
      if(!byTeam[team])byTeam[team]={total:0,resolved:0};
      byTeam[team].total++;
      if(["Resolved","Closed"].includes(t.status))byTeam[team].resolved++;
    });
    const pendingReasons:Record<string,number>={};
    active.filter(t=>t.pendingReason).forEach(t=>{pendingReasons[t.pendingReason]=(pendingReasons[t.pendingReason]||0)+1});
    const priorityDist:Record<string,number>={};
    active.forEach(t=>{priorityDist[t.priority]=(priorityDist[t.priority]||0)+1});
    return{total:snTickets.length,active:active.length,resolved:resolved.length,slaPct,aging,avgResolve,byTeam,pendingReasons,priorityDist};
  },[snTickets]);

  /* ══ Concur Calculations ══ */
  const concurMetrics=useMemo(()=>{
    const total=concurRecords.length;
    const cleared=concurRecords.filter(r=>r.auditStatus==="Cleared").length;
    const exceptions=concurRecords.filter(r=>r.auditStatus==="Exception Raised").length;
    const escalated=concurRecords.filter(r=>r.auditStatus==="Escalated").length;
    const pending=concurRecords.filter(r=>["Pending Review","Under Audit"].includes(r.auditStatus)).length;
    const totalAmt=concurRecords.reduce((s,r)=>s+parseFloat(r.reportAmount||"0"),0);
    const violationCount=concurRecords.reduce((s,r)=>s+parseInt(r.policyViolations||"0",10),0);
    const compliancePct=total>0?Math.round((cleared/(total))*100):0;
    const byDept:Record<string,{count:number,amount:number,violations:number}>={}; 
    concurRecords.forEach(r=>{
      const d=r.department||"Unknown";
      if(!byDept[d])byDept[d]={count:0,amount:0,violations:0};
      byDept[d].count++;
      byDept[d].amount+=parseFloat(r.reportAmount||"0");
      byDept[d].violations+=parseInt(r.policyViolations||"0",10);
    });
    const exceptionTypes:Record<string,number>={};
    concurRecords.filter(r=>r.exceptionType).forEach(r=>{exceptionTypes[r.exceptionType]=(exceptionTypes[r.exceptionType]||0)+1});
    const avgReview=concurRecords.filter(r=>r.reviewDate&&r.submissionDate).length>0?
      Math.round(concurRecords.filter(r=>r.reviewDate&&r.submissionDate).reduce((s,r)=>s+daysBetween(r.submissionDate,r.reviewDate),0)/concurRecords.filter(r=>r.reviewDate&&r.submissionDate).length):0;
    return{total,cleared,exceptions,escalated,pending,totalAmt,violationCount,compliancePct,byDept,exceptionTypes,avgReview};
  },[concurRecords]);

  /* ══ Email Calculations ══ */
  const emailMetrics=useMemo(()=>{
    const total=emailRecords.length;
    const awaiting=emailRecords.filter(r=>r.status==="Awaiting Response").length;
    const overdue=emailRecords.filter(r=>{
      if(r.status!=="Awaiting Response"||!r.responseDueDate)return false;
      return new Date(r.responseDueDate)<new Date();
    }).length;
    const responded=emailRecords.filter(r=>r.status==="Responded").length;
    const responsePct=total>0?Math.round(((responded)/(total))*100):0;
    const slaMet=emailRecords.filter(r=>{
      if(!r.responseDueDate||!r.respondedDate)return false;
      return new Date(r.respondedDate)<=new Date(r.responseDueDate);
    }).length;
    const slaTotal=emailRecords.filter(r=>r.responseDueDate&&r.respondedDate).length;
    const slaPct=slaTotal>0?Math.round((slaMet/slaTotal)*100):0;
    const byCategory:Record<string,number>={};
    emailRecords.forEach(r=>{byCategory[r.category]=(byCategory[r.category]||0)+1});
    return{total,awaiting,overdue,responded,responsePct,slaPct,byCategory};
  },[emailRecords]);

  /* ══ Table Edit Handlers ══ */
  const updateSN=useCallback((id:string,field:keyof SNTicket,val:string)=>{
    setSnTickets(prev=>prev.map(t=>t.id===id?{...t,[field]:val}:t));
  },[]);
  const updateConcur=useCallback((id:string,field:keyof ConcurRecord,val:string)=>{
    setConcurRecords(prev=>prev.map(r=>r.id===id?{...r,[field]:val}:r));
  },[]);
  const updateEmail=useCallback((id:string,field:keyof EmailRecord,val:string)=>{
    setEmailRecords(prev=>prev.map(r=>r.id===id?{...r,[field]:val}:r));
  },[]);

  /* ══ CSV Upload ══ */
  const handleSNUpload=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const text=ev.target?.result as string;
      const rows=parseCSV(text);
      const mapped=mapCSVtoSN(rows);
      setSnTickets(prev=>[...prev,...mapped]);
    };
    reader.readAsText(file);
    e.target.value="";
  };
  const handleConcurUpload=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const text=ev.target?.result as string;
      const rows=parseCSV(text);
      const mapped=mapCSVtoConcur(rows);
      setConcurRecords(prev=>[...prev,...mapped]);
    };
    reader.readAsText(file);
    e.target.value="";
  };

  /* ══ AI Report Generation ══ */
  const generateAIReport=async(type:"servicenow"|"concur"|"email")=>{
    if(!callAI)return;
    let prompt="";
    if(type==="servicenow"){
      setSnLoading(true);
      prompt=`You are an IT Service Management governance analyst for ${companyName}. Analyze this ServiceNow ticket data and produce a structured governance report.

DATA SUMMARY:
- Total tickets: ${snMetrics.total}
- Active: ${snMetrics.active} | Resolved: ${snMetrics.resolved}
- SLA compliance: ${snMetrics.slaPct}%
- Average resolution time: ${snMetrics.avgResolve} business days
- Aging buckets — 0-3 days: ${snMetrics.aging.bucket0_3}, 4-5 days: ${snMetrics.aging.bucket4_5}, 5+ days: ${snMetrics.aging.bucket5plus}
- Team performance: ${JSON.stringify(snMetrics.byTeam)}
- Pending reasons: ${JSON.stringify(snMetrics.pendingReasons)}
- Priority distribution: ${JSON.stringify(snMetrics.priorityDist)}

RAW DATA (last 50 records):
${JSON.stringify(snTickets.slice(-50).map(t=>({...t,agingDays:daysBetween(t.createdDate,""),slaFirstResponse:t.firstResponse&&t.createdDate?daysBetween(t.createdDate,t.firstResponse)<=3:null})))}

PRODUCE:
1. EXECUTIVE SUMMARY (3 lines)
2. SLA COMPLIANCE ANALYSIS — breach patterns, root causes
3. AGING ANALYSIS — tickets at risk, escalation recommendations
4. TEAM PERFORMANCE — utilization, resolution rates, bottlenecks
5. PENDING REASON ANALYSIS — systemic issues, recommendations
6. TOP 5 ACTION ITEMS with owner and deadline suggestions
7. RISK FLAGS — anything requiring immediate attention`;
      try{const r=await callAI(prompt);setSnAiReport(r)}catch(e:any){setSnAiReport("Error: "+e.message)}
      setSnLoading(false);
    }else if(type==="concur"){
      setConcurLoading(true);
      prompt=`You are a T&E Compliance and Audit governance analyst for ${companyName}. Analyze this SAP Concur audit data and produce a structured compliance report.

DATA SUMMARY:
- Total expense reports: ${concurMetrics.total}
- Cleared: ${concurMetrics.cleared} | Exceptions: ${concurMetrics.exceptions} | Escalated: ${concurMetrics.escalated} | Pending: ${concurMetrics.pending}
- Total report amount: ₹${fmtN(concurMetrics.totalAmt)}
- Total policy violations: ${concurMetrics.violationCount}
- Compliance rate: ${concurMetrics.compliancePct}%
- Average review time: ${concurMetrics.avgReview} days
- Department breakdown: ${JSON.stringify(concurMetrics.byDept)}
- Exception types: ${JSON.stringify(concurMetrics.exceptionTypes)}

RAW DATA (last 50 records):
${JSON.stringify(concurRecords.slice(-50))}

PRODUCE:
1. EXECUTIVE SUMMARY (3 lines)
2. COMPLIANCE ANALYSIS — violation patterns, repeat offenders, policy gaps
3. FINANCIAL EXPOSURE — amount at risk, high-value exceptions
4. DEPARTMENT ANALYSIS — which teams are most non-compliant and why
5. EXCEPTION ANALYSIS — root cause patterns, prevention recommendations
6. AUDIT CYCLE EFFICIENCY — review time optimization
7. TOP 5 ACTION ITEMS with owner and deadline suggestions
8. RISK FLAGS — anything requiring immediate management attention`;
      try{const r=await callAI(prompt);setConcurAiReport(r)}catch(e:any){setConcurAiReport("Error: "+e.message)}
      setConcurLoading(false);
    }else{
      setEmailLoading(true);
      prompt=`You are a Communication Governance analyst for ${companyName}. Analyze this email communication tracking data and produce a governance report.

DATA SUMMARY:
- Total tracked communications: ${emailMetrics.total}
- Awaiting response: ${emailMetrics.awaiting} | Overdue: ${emailMetrics.overdue}
- Response rate: ${emailMetrics.responsePct}%
- Response SLA compliance: ${emailMetrics.slaPct}%
- Category distribution: ${JSON.stringify(emailMetrics.byCategory)}

RAW DATA (last 50 records):
${JSON.stringify(emailRecords.slice(-50))}

PRODUCE:
1. EXECUTIVE SUMMARY (3 lines)
2. RESPONSE COMPLIANCE — SLA adherence, overdue patterns
3. ESCALATION ANALYSIS — which escalations are unresolved and aging
4. COMMUNICATION PATTERNS — frequency, category trends
5. BOTTLENECK IDENTIFICATION — who/what is causing delays
6. TOP 5 ACTION ITEMS with owner and deadline
7. RISK FLAGS`;
      try{const r=await callAI(prompt);setEmailAiReport(r)}catch(e:any){setEmailAiReport("Error: "+e.message)}
      setEmailLoading(false);
    }
  };

  /* ══ Inline Editable Cell ══ */
  const EditCell=({value,onChange,type="text",options}:{value:string,onChange:(v:string)=>void,type?:string,options?:string[]})=>{
    if(options){
      return <select value={value} onChange={e=>onChange(e.target.value)} style={{...S.input,background:"transparent",cursor:"pointer"}}>{options.map(o=><option key={o} value={o} style={{background:C.card}}>{o}</option>)}</select>;
    }
    return <input type={type} value={value} onChange={e=>onChange(e.target.value)} style={S.input}/>;
  };

  /* ══ KPI Card ══ */
  const KPI=({label,value,color}:{label:string,value:string|number,color:string})=>(
    <div style={S.kpi(color)}>
      <div style={{...S.kpiVal,color}}>{value}</div>
      <div style={S.kpiLabel}>{label}</div>
    </div>
  );

  /* ══ Bar (mini chart) ══ */
  const MiniBar=({data,color}:{data:{label:string,value:number}[],color:string})=>{
    const max=Math.max(...data.map(d=>d.value),1);
    return(
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
        {data.map((d,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
            <div style={{width:"100%",maxWidth:40,height:Math.max((d.value/max)*60,2),background:color,borderRadius:"3px 3px 0 0",transition:"height .3s"}}/>
            <div style={{fontSize:9,color:C.textDim,marginTop:4,textAlign:"center",lineHeight:1.2}}>{d.label}</div>
            <div style={{fontSize:10,fontWeight:600,color:C.textMid}}>{d.value}</div>
          </div>
        ))}
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════ */
  /* DISPATCH — Cross-module overview                            */
  /* ════════════════════════════════════════════════════════════ */
  const renderDispatch=()=>(
    <div>
      <div style={{...S.card,borderLeft:`3px solid ${C.accent}`}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Governance Command Center</div>
        <div style={{fontSize:12,color:C.textMid}}>Real-time operational intelligence across ServiceNow, Concur Audit, and Email communications.</div>
      </div>

      <div style={S.kpiGrid}>
        <KPI label="ServiceNow Active" value={snMetrics.active} color={C.info}/>
        <KPI label="SN SLA Compliance" value={`${snMetrics.slaPct}%`} color={snMetrics.slaPct>=80?C.success:snMetrics.slaPct>=60?C.warn:C.danger}/>
        <KPI label="Concur Pending" value={concurMetrics.pending} color={C.purple}/>
        <KPI label="T&E Compliance" value={`${concurMetrics.compliancePct}%`} color={concurMetrics.compliancePct>=80?C.success:concurMetrics.compliancePct>=60?C.warn:C.danger}/>
        <KPI label="Emails Awaiting" value={emailMetrics.awaiting} color={C.warn}/>
        <KPI label="Email Overdue" value={emailMetrics.overdue} color={C.danger}/>
      </div>

      {/* Cross-module alerts */}
      <div style={S.card}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>⚡ Active Alerts</div>
        {snMetrics.aging.bucket5plus>0&&<div style={{padding:"8px 12px",background:C.dangerDim,borderRadius:6,marginBottom:6,fontSize:12}}>🎫 <strong>{snMetrics.aging.bucket5plus}</strong> ServiceNow tickets aging beyond 5 days</div>}
        {concurMetrics.escalated>0&&<div style={{padding:"8px 12px",background:C.warnDim,borderRadius:6,marginBottom:6,fontSize:12}}>🧾 <strong>{concurMetrics.escalated}</strong> Concur reports escalated and unresolved</div>}
        {emailMetrics.overdue>0&&<div style={{padding:"8px 12px",background:C.dangerDim,borderRadius:6,marginBottom:6,fontSize:12}}>📧 <strong>{emailMetrics.overdue}</strong> emails past response SLA deadline</div>}
        {snMetrics.active===0&&concurMetrics.pending===0&&emailMetrics.overdue===0&&<div style={{padding:"8px 12px",background:C.successDim,borderRadius:6,fontSize:12,color:C.success}}>✓ All clear — no active alerts across modules</div>}
      </div>

      {/* Module summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12}}>
        <div style={{...S.card,cursor:"pointer",borderTop:`2px solid ${C.info}`}} onClick={()=>setModule("servicenow")}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🎫 ServiceNow</div>
          <div style={{fontSize:11,color:C.textMid,marginBottom:8}}>{snMetrics.total} total tickets · {snMetrics.resolved} resolved</div>
          {Object.keys(snMetrics.byTeam).length>0&&<MiniBar data={Object.entries(snMetrics.byTeam).slice(0,5).map(([k,v])=>({label:k.slice(0,8),value:v.total}))} color={C.info}/>}
          {snMetrics.total===0&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic"}}>No data yet — click to add tickets</div>}
        </div>
        <div style={{...S.card,cursor:"pointer",borderTop:`2px solid ${C.purple}`}} onClick={()=>setModule("concur")}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🧾 Concur Audit</div>
          <div style={{fontSize:11,color:C.textMid,marginBottom:8}}>{concurMetrics.total} reports · ₹{fmtN(Math.round(concurMetrics.totalAmt))} total value</div>
          {Object.keys(concurMetrics.byDept).length>0&&<MiniBar data={Object.entries(concurMetrics.byDept).slice(0,5).map(([k,v])=>({label:k.slice(0,8),value:v.count}))} color={C.purple}/>}
          {concurMetrics.total===0&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic"}}>No data yet — click to add reports</div>}
        </div>
        <div style={{...S.card,cursor:"pointer",borderTop:`2px solid ${C.warn}`}} onClick={()=>setModule("email")}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📧 Email Governance</div>
          <div style={{fontSize:11,color:C.textMid,marginBottom:8}}>{emailMetrics.total} tracked · {emailMetrics.responded} responded</div>
          {Object.keys(emailMetrics.byCategory).length>0&&<MiniBar data={Object.entries(emailMetrics.byCategory).slice(0,5).map(([k,v])=>({label:k.slice(0,6),value:v}))} color={C.warn}/>}
          {emailMetrics.total===0&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic"}}>No data yet — click to add communications</div>}
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════ */
  /* SERVICENOW MODULE                                           */
  /* ════════════════════════════════════════════════════════════ */
  const renderServiceNow=()=>(
    <div>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,background:C.bg,padding:4,borderRadius:8,width:"fit-content"}}>
        {(["dashboard","table","ai"] as const).map(v=><button key={v} style={S.subTab(subView===v)} onClick={()=>setSubView(v)}>{v==="dashboard"?"📊 Dashboard":v==="table"?"📋 Table":"🤖 AI Report"}</button>)}
      </div>

      {subView==="dashboard"&&(
        <>
          <div style={S.kpiGrid}>
            <KPI label="Total Tickets" value={snMetrics.total} color={C.info}/>
            <KPI label="Active" value={snMetrics.active} color={C.warn}/>
            <KPI label="Resolved" value={snMetrics.resolved} color={C.success}/>
            <KPI label="SLA Compliance" value={`${snMetrics.slaPct}%`} color={snMetrics.slaPct>=80?C.success:C.danger}/>
            <KPI label="Avg Resolution" value={`${snMetrics.avgResolve}d`} color={C.accent}/>
            <KPI label="5+ Day Aging" value={snMetrics.aging.bucket5plus} color={C.danger}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Aging Distribution</div>
              <MiniBar data={[{label:"0-3d",value:snMetrics.aging.bucket0_3},{label:"4-5d",value:snMetrics.aging.bucket4_5},{label:"5d+",value:snMetrics.aging.bucket5plus}]} color={C.info}/>
            </div>
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Priority Mix</div>
              <MiniBar data={PRIORITIES.map(p=>({label:p,value:snMetrics.priorityDist[p]||0}))} color={C.purple}/>
            </div>
          </div>
          {Object.keys(snMetrics.pendingReasons).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Pending Reasons</div>
              <MiniBar data={Object.entries(snMetrics.pendingReasons).map(([k,v])=>({label:k.slice(0,12),value:v}))} color={C.warn}/>
            </div>
          )}
          {Object.keys(snMetrics.byTeam).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Team Performance</div>
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Team</th><th style={S.th}>Total</th><th style={S.th}>Resolved</th><th style={S.th}>Resolution %</th></tr></thead>
                  <tbody>{Object.entries(snMetrics.byTeam).map(([team,v])=>(
                    <tr key={team}><td style={S.td}>{team}</td><td style={S.td}>{v.total}</td><td style={S.td}>{v.resolved}</td><td style={S.td}><span style={{color:v.total>0&&(v.resolved/v.total)*100>=70?C.success:C.warn}}>{v.total>0?Math.round((v.resolved/v.total)*100):0}%</span></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {subView==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <button style={S.btn(C.accent)} onClick={()=>setSnTickets(p=>[emptySN(),...p])}>+ Add Ticket</button>
            <button style={S.btnOutline} onClick={()=>snFileRef.current?.click()}>📄 Import CSV</button>
            <input ref={snFileRef} type="file" accept=".csv" onChange={handleSNUpload} style={{display:"none"}}/>
            {snTickets.length>0&&<button style={S.btnOutline} onClick={()=>{if(window.confirm("Clear all ServiceNow tickets?"))setSnTickets([])}}>🗑 Clear All</button>}
          </div>
          {snTickets.length===0?(
            <div style={{...S.card,textAlign:"center",padding:40}}>
              <div style={{fontSize:28,marginBottom:8}}>🎫</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No tickets yet</div>
              <div style={{fontSize:11,color:C.textDim}}>Click "Add Ticket" to enter manually, or import a CSV from ServiceNow</div>
            </div>
          ):(
            <div style={{...S.tableWrap,maxHeight:500,overflowY:"auto"}}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Ticket #</th><th style={S.th}>Created</th><th style={S.th}>Priority</th><th style={S.th}>Category</th>
                  <th style={S.th}>Status</th><th style={S.th}>Assigned To</th><th style={S.th}>Team</th><th style={S.th}>Requestor</th>
                  <th style={S.th}>Aging</th><th style={S.th}>SLA</th><th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>{snTickets.map(t=>{
                  const aging=daysBetween(t.createdDate,"");
                  const sla=t.firstResponse&&t.createdDate?daysBetween(t.createdDate,t.firstResponse)<=3:null;
                  return(
                    <tr key={t.id} style={{background:aging>5&&!["Resolved","Closed"].includes(t.status)?C.dangerDim:"transparent"}}>
                      <td style={S.td}><EditCell value={t.ticketNumber} onChange={v=>updateSN(t.id,"ticketNumber",v)}/></td>
                      <td style={S.td}><EditCell value={t.createdDate} onChange={v=>updateSN(t.id,"createdDate",v)} type="date"/></td>
                      <td style={S.td}><EditCell value={t.priority} onChange={v=>updateSN(t.id,"priority",v)} options={PRIORITIES}/></td>
                      <td style={S.td}><EditCell value={t.category} onChange={v=>updateSN(t.id,"category",v)}/></td>
                      <td style={S.td}><EditCell value={t.status} onChange={v=>updateSN(t.id,"status",v)} options={SN_STATUSES}/></td>
                      <td style={S.td}><EditCell value={t.assignedTo} onChange={v=>updateSN(t.id,"assignedTo",v)}/></td>
                      <td style={S.td}><EditCell value={t.team} onChange={v=>updateSN(t.id,"team",v)}/></td>
                      <td style={S.td}><EditCell value={t.requestor} onChange={v=>updateSN(t.id,"requestor",v)}/></td>
                      <td style={{...S.td,fontWeight:600,color:aging>5?C.danger:aging>3?C.warn:C.success}}>{aging}d</td>
                      <td style={S.td}>{sla===null?<span style={{color:C.textDim}}>–</span>:sla?<span style={{color:C.success}}>✓</span>:<span style={{color:C.danger}}>⚠</span>}</td>
                      <td style={S.td}><button style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}} onClick={()=>setSnTickets(p=>p.filter(x=>x.id!==t.id))}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subView==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button style={S.btn(C.accent)} onClick={()=>generateAIReport("servicenow")} disabled={snLoading||snTickets.length===0}>
              {snLoading?"⏳ Generating...":"🤖 Generate Governance Report"}
            </button>
            {!callAI&&<span style={{fontSize:11,color:C.warn,alignSelf:"center"}}>⚠ AI not connected — configure API key in Settings</span>}
          </div>
          {snTickets.length===0&&<div style={{...S.card,fontSize:12,color:C.textDim}}>Add ticket data first (Dashboard → Table → enter data), then generate a report.</div>}
          {snAiReport&&<div style={S.aiPanel}>{snAiReport}</div>}
        </>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════════ */
  /* CONCUR AUDIT MODULE                                        */
  /* ════════════════════════════════════════════════════════════ */
  const renderConcur=()=>(
    <div>
      <div style={{display:"flex",gap:4,marginBottom:14,background:C.bg,padding:4,borderRadius:8,width:"fit-content"}}>
        {(["dashboard","table","ai"] as const).map(v=><button key={v} style={S.subTab(subView===v)} onClick={()=>setSubView(v)}>{v==="dashboard"?"📊 Dashboard":v==="table"?"📋 Table":"🤖 AI Report"}</button>)}
      </div>

      {subView==="dashboard"&&(
        <>
          <div style={S.kpiGrid}>
            <KPI label="Total Reports" value={concurMetrics.total} color={C.purple}/>
            <KPI label="Cleared" value={concurMetrics.cleared} color={C.success}/>
            <KPI label="Exceptions" value={concurMetrics.exceptions} color={C.danger}/>
            <KPI label="Compliance %" value={`${concurMetrics.compliancePct}%`} color={concurMetrics.compliancePct>=80?C.success:C.danger}/>
            <KPI label="Total Amount" value={`₹${fmtN(Math.round(concurMetrics.totalAmt))}`} color={C.info}/>
            <KPI label="Violations" value={concurMetrics.violationCount} color={C.warn}/>
          </div>
          {Object.keys(concurMetrics.byDept).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Department Breakdown</div>
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Department</th><th style={S.th}>Reports</th><th style={S.th}>Amount</th><th style={S.th}>Violations</th></tr></thead>
                  <tbody>{Object.entries(concurMetrics.byDept).map(([dept,v])=>(
                    <tr key={dept}><td style={S.td}>{dept}</td><td style={S.td}>{v.count}</td><td style={S.td}>₹{fmtN(Math.round(v.amount))}</td><td style={{...S.td,color:v.violations>0?C.danger:C.success}}>{v.violations}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {Object.keys(concurMetrics.exceptionTypes).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Exception Types</div>
              <MiniBar data={Object.entries(concurMetrics.exceptionTypes).map(([k,v])=>({label:k.slice(0,12),value:v}))} color={C.danger}/>
            </div>
          )}
        </>
      )}

      {subView==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <button style={S.btn(C.purple)} onClick={()=>setConcurRecords(p=>[emptyConcur(),...p])}>+ Add Report</button>
            <button style={S.btnOutline} onClick={()=>concurFileRef.current?.click()}>📄 Import CSV</button>
            <input ref={concurFileRef} type="file" accept=".csv" onChange={handleConcurUpload} style={{display:"none"}}/>
            {concurRecords.length>0&&<button style={S.btnOutline} onClick={()=>{if(window.confirm("Clear all Concur records?"))setConcurRecords([])}}>🗑 Clear All</button>}
          </div>
          {concurRecords.length===0?(
            <div style={{...S.card,textAlign:"center",padding:40}}>
              <div style={{fontSize:28,marginBottom:8}}>🧾</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No audit records yet</div>
              <div style={{fontSize:11,color:C.textDim}}>Click "Add Report" to enter manually, or import a CSV from Concur</div>
            </div>
          ):(
            <div style={{...S.tableWrap,maxHeight:500,overflowY:"auto"}}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Report ID</th><th style={S.th}>Employee</th><th style={S.th}>Dept</th><th style={S.th}>Submitted</th>
                  <th style={S.th}>Amount</th><th style={S.th}>Violations</th><th style={S.th}>Status</th><th style={S.th}>Auditor</th>
                  <th style={S.th}>Exception</th><th style={S.th}>Aging</th><th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>{concurRecords.map(r=>{
                  const aging=daysBetween(r.submissionDate,"");
                  return(
                    <tr key={r.id} style={{background:r.auditStatus==="Exception Raised"?C.dangerDim:r.auditStatus==="Escalated"?C.warnDim:"transparent"}}>
                      <td style={S.td}><EditCell value={r.reportId} onChange={v=>updateConcur(r.id,"reportId",v)}/></td>
                      <td style={S.td}><EditCell value={r.employeeName} onChange={v=>updateConcur(r.id,"employeeName",v)}/></td>
                      <td style={S.td}><EditCell value={r.department} onChange={v=>updateConcur(r.id,"department",v)}/></td>
                      <td style={S.td}><EditCell value={r.submissionDate} onChange={v=>updateConcur(r.id,"submissionDate",v)} type="date"/></td>
                      <td style={S.td}><EditCell value={r.reportAmount} onChange={v=>updateConcur(r.id,"reportAmount",v)}/></td>
                      <td style={{...S.td,color:parseInt(r.policyViolations||"0")>0?C.danger:C.success,fontWeight:600}}><EditCell value={r.policyViolations} onChange={v=>updateConcur(r.id,"policyViolations",v)}/></td>
                      <td style={S.td}><EditCell value={r.auditStatus} onChange={v=>updateConcur(r.id,"auditStatus",v)} options={CONCUR_STATUSES}/></td>
                      <td style={S.td}><EditCell value={r.auditor} onChange={v=>updateConcur(r.id,"auditor",v)}/></td>
                      <td style={S.td}><EditCell value={r.exceptionType} onChange={v=>updateConcur(r.id,"exceptionType",v)}/></td>
                      <td style={{...S.td,fontWeight:600,color:aging>7?C.danger:aging>3?C.warn:C.success}}>{aging}d</td>
                      <td style={S.td}><button style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}} onClick={()=>setConcurRecords(p=>p.filter(x=>x.id!==r.id))}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subView==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button style={S.btn(C.purple)} onClick={()=>generateAIReport("concur")} disabled={concurLoading||concurRecords.length===0}>
              {concurLoading?"⏳ Generating...":"🤖 Generate Compliance Report"}
            </button>
            {!callAI&&<span style={{fontSize:11,color:C.warn,alignSelf:"center"}}>⚠ AI not connected</span>}
          </div>
          {concurRecords.length===0&&<div style={{...S.card,fontSize:12,color:C.textDim}}>Add audit data first, then generate a report.</div>}
          {concurAiReport&&<div style={S.aiPanel}>{concurAiReport}</div>}
        </>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════════ */
  /* EMAIL MODULE                                                */
  /* ════════════════════════════════════════════════════════════ */
  const renderEmail=()=>(
    <div>
      <div style={{display:"flex",gap:4,marginBottom:14,background:C.bg,padding:4,borderRadius:8,width:"fit-content"}}>
        {(["dashboard","table","ai"] as const).map(v=><button key={v} style={S.subTab(subView===v)} onClick={()=>setSubView(v)}>{v==="dashboard"?"📊 Dashboard":v==="table"?"📋 Table":"🤖 AI Report"}</button>)}
      </div>

      {subView==="dashboard"&&(
        <>
          <div style={S.kpiGrid}>
            <KPI label="Total Tracked" value={emailMetrics.total} color={C.warn}/>
            <KPI label="Awaiting Response" value={emailMetrics.awaiting} color={C.info}/>
            <KPI label="Overdue" value={emailMetrics.overdue} color={C.danger}/>
            <KPI label="Responded" value={emailMetrics.responded} color={C.success}/>
            <KPI label="Response Rate" value={`${emailMetrics.responsePct}%`} color={emailMetrics.responsePct>=80?C.success:C.warn}/>
            <KPI label="SLA Met" value={`${emailMetrics.slaPct}%`} color={emailMetrics.slaPct>=80?C.success:C.danger}/>
          </div>
          {Object.keys(emailMetrics.byCategory).length>0&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Communication by Category</div>
              <MiniBar data={Object.entries(emailMetrics.byCategory).map(([k,v])=>({label:k,value:v}))} color={C.warn}/>
            </div>
          )}
        </>
      )}

      {subView==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <button style={S.btn(C.warn)} onClick={()=>setEmailRecords(p=>[emptyEmail(),...p])}>+ Add Email</button>
            {emailRecords.length>0&&<button style={S.btnOutline} onClick={()=>{if(window.confirm("Clear all email records?"))setEmailRecords([])}}>🗑 Clear All</button>}
          </div>
          {emailRecords.length===0?(
            <div style={{...S.card,textAlign:"center",padding:40}}>
              <div style={{fontSize:28,marginBottom:8}}>📧</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No emails tracked yet</div>
              <div style={{fontSize:11,color:C.textDim}}>Click "Add Email" to track communications</div>
            </div>
          ):(
            <div style={{...S.tableWrap,maxHeight:500,overflowY:"auto"}}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Date Sent</th><th style={S.th}>Recipient</th><th style={S.th}>Subject</th><th style={S.th}>Category</th>
                  <th style={S.th}>Status</th><th style={S.th}>Due Date</th><th style={S.th}>Responded</th><th style={S.th}>SLA</th><th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>{emailRecords.map(r=>{
                  const overdue=r.status==="Awaiting Response"&&r.responseDueDate&&new Date(r.responseDueDate)<new Date();
                  const slaMet=r.responseDueDate&&r.respondedDate?new Date(r.respondedDate)<=new Date(r.responseDueDate):null;
                  return(
                    <tr key={r.id} style={{background:overdue?C.dangerDim:"transparent"}}>
                      <td style={S.td}><EditCell value={r.dateSent} onChange={v=>updateEmail(r.id,"dateSent",v)} type="date"/></td>
                      <td style={S.td}><EditCell value={r.recipient} onChange={v=>updateEmail(r.id,"recipient",v)}/></td>
                      <td style={S.td}><EditCell value={r.subject} onChange={v=>updateEmail(r.id,"subject",v)}/></td>
                      <td style={S.td}><EditCell value={r.category} onChange={v=>updateEmail(r.id,"category",v)} options={EMAIL_CATEGORIES}/></td>
                      <td style={S.td}><EditCell value={r.status} onChange={v=>updateEmail(r.id,"status",v)} options={EMAIL_STATUSES}/></td>
                      <td style={S.td}><EditCell value={r.responseDueDate} onChange={v=>updateEmail(r.id,"responseDueDate",v)} type="date"/></td>
                      <td style={S.td}><EditCell value={r.respondedDate} onChange={v=>updateEmail(r.id,"respondedDate",v)} type="date"/></td>
                      <td style={S.td}>{slaMet===null?<span style={{color:C.textDim}}>–</span>:slaMet?<span style={{color:C.success}}>✓</span>:<span style={{color:C.danger}}>⚠</span>}</td>
                      <td style={S.td}><button style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}} onClick={()=>setEmailRecords(p=>p.filter(x=>x.id!==r.id))}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subView==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button style={S.btn(C.warn)} onClick={()=>generateAIReport("email")} disabled={emailLoading||emailRecords.length===0}>
              {emailLoading?"⏳ Generating...":"🤖 Generate Email Governance Report"}
            </button>
            {!callAI&&<span style={{fontSize:11,color:C.warn,alignSelf:"center"}}>⚠ AI not connected</span>}
          </div>
          {emailRecords.length===0&&<div style={{...S.card,fontSize:12,color:C.textDim}}>Add email tracking data first, then generate a report.</div>}
          {emailAiReport&&<div style={S.aiPanel}>{emailAiReport}</div>}
        </>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════════ */
  /* MAIN RENDER                                                 */
  /* ════════════════════════════════════════════════════════════ */
  return(
    <div style={S.wrap}>
      {/* Module selector */}
      <div style={S.moduleBar}>
        {([["dispatch","📡","Dispatch"],["servicenow","🎫","ServiceNow"],["concur","🧾","Concur Audit"],["email","📧","Email"]] as const).map(([id,ic,label])=>(
          <button key={id} style={S.moduleBtn(module===id)} onClick={()=>{setModule(id as any);setSubView("dashboard")}}>
            {ic} {label}
          </button>
        ))}
      </div>

      {/* Module content */}
      <div style={{flex:1,overflowY:"auto" as const,padding:module==="dispatch"?0:20}}>{module==="dispatch"&&(existingDispatch||renderDispatch())}
      {module==="servicenow"&&renderServiceNow()}
      {module==="concur"&&renderConcur()}
      {module==="email"&&renderEmail()}
      </div>
    </div>
  );
}
