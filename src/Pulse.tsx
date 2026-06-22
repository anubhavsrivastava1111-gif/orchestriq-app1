import React, { useState, useMemo, useCallback, useEffect } from "react";
import DataIngestion, { ModuleKey } from "./DataIngestion";

// ═══════════════════════════════════════════════════════════════════════════
// PULSE — Integrated Governance Intelligence Hub v2
// Tabs: Dispatch Hub | Concur T&E | Email Helpdesk | ServiceNow
// Agentic: each module publishes reports to Dispatch Email Drafter
// ═══════════════════════════════════════════════════════════════════════════


const C = {
  bg:"#0B1120",card:"#111827",card2:"#0D1829",
  border:"#1E2D3D",
  accent:"#14B8A6",accentDim:"rgba(20,184,166,0.10)",accentText:"#5EEAD4",
  blue:"#3B82F6",blueDim:"rgba(59,130,246,0.10)",
  purple:"#8B5CF6",purpleDim:"rgba(139,92,246,0.10)",
  warn:"#F59E0B",warnDim:"rgba(245,158,11,0.10)",
  danger:"#EF4444",dangerDim:"rgba(239,68,68,0.10)",
  success:"#10B981",
  orange:"#F97316",
  text:"#E8EFF8",textMid:"#94A3B8",textDim:"#4D6A8A",
};

interface Config {
  fteCount:number; shiftHours:number; minsPerAudit:number;
  qcSamplePct:number; accuracySLA:number; tatSLA:number;
  helpdeskSLA:number; rejectionTarget:number; backlogThreshold:number;
}
interface ConcurRow {
  id:string; date:string;
  untouched:number; freshInflow:number; resubmitted:number;
  totalWorkable:number; processed:number; openEOD:number;
  pendingOpsTeam:number; pendingBusiness:number;
  tatPct:number; ukAccuracy:number; teamAccuracy:number;
  aging0_2:number; aging3_5:number; aging6_15:number; agingOver15:number;
  rejectionVol:number;
}
interface EmailRow {
  id:string; date:string;
  received:number; resolved:number; slaPct:number;
  pendingOpsTeam:number; pendingClient:number; carryForward:number;
}
interface SNTicket {
  id:string; ticketNo:string; date:string; priority:string; category:string;
  status:string; assignedTo:string; team:string; firstResponse:string;
  pendingReason:string; notes:string;
}
interface PublishPayload {
  module:"concur"|"email"|"servicenow";
  subject:string; kpiSummary:string; tableData:string; period:string;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const fmtPct = (n:number) => (n * 100).toFixed(1) + "%";
const fmtN = (n:number) => Math.round(n).toLocaleString("en-IN");
const daysBetween = (a:string, b:string=today()) => {
  if (!a) return 0;
  const diff = Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
  return isNaN(diff) ? 0 : Math.max(0, diff);
};
const weekLabel = (dateStr:string) => {
  const d = new Date(dateStr);
  const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = (x:Date) => x.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  return fmt(mon) + "-" + fmt(fri);
};
const groupByWeek = <T extends {date:string}>(rows:T[]): Record<string,T[]> => {
  const g: Record<string,T[]> = {};
  rows.forEach(r => {
    const d = new Date(r.date);
    const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
    const key = mon.toISOString().slice(0,10);
    if (!g[key]) g[key] = [];
    g[key].push(r);
  });
  return g;
};
const DEFAULT_CONFIG: Config = {
  fteCount:1,shiftHours:8,minsPerAudit:15,
  qcSamplePct:0.25,accuracySLA:0.95,tatSLA:0.98,
  helpdeskSLA:0.95,rejectionTarget:0.05,backlogThreshold:10,
};
const PRIORITIES = ["Critical","High","Medium","Low"];
const SN_STATUSES = ["Open","Assigned","In Progress","Pending","Resolved","Closed"];

function RagDot({status}:{status:"green"|"amber"|"red"}) {
  const col = status==="green"?C.success:status==="amber"?C.warn:C.danger;
  return <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:col,marginRight:5,flexShrink:0}}/>;
}

function KpiTile({label,value,sub,rag,color}:{label:string;value:string|number;sub?:string;rag?:"green"|"amber"|"red";color?:string}) {
  const col = color??(rag==="green"?C.success:rag==="amber"?C.warn:rag==="red"?C.danger:C.accent);
  return (
    <div style={{background:C.card,border:`1px solid ${col}22`,borderRadius:8,padding:"12px 14px",flex:1,minWidth:100}}>
      <div style={{fontSize:9,color:C.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:21,fontWeight:800,color:col,lineHeight:1.1,display:"flex",alignItems:"center"}}>
        {rag&&<RagDot status={rag}/>}{value}
      </div>
      {sub&&<div style={{fontSize:9,color:C.textMid,marginTop:3}}>{sub}</div>}
    </div>
  );
}

function Cell({value,onChange,type="text",options}:{value:string|number;onChange:(v:string)=>void;type?:string;options?:string[]}) {
  const s:React.CSSProperties = {background:"transparent",border:"none",color:C.text,fontSize:11,outline:"none",width:"100%",fontFamily:"inherit",padding:"2px 0"};
  if (options) return <select value={String(value)} onChange={e=>onChange(e.target.value)} style={{...s,cursor:"pointer",background:C.card}}>{options.map(o=><option key={o} value={o} style={{background:C.card}}>{o}</option>)}</select>;
  return <input type={type} value={String(value)} onChange={e=>onChange(e.target.value)} style={s}/>;
}

function MiniBarChart({data,height=80}:{data:{label:string;value:number;color:string}[];height?:number}) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d=>d.value),1);
  const bw = Math.max(Math.floor(240/data.length)-4,6);
  const W = data.length*(bw+4)+8;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height+22}`} style={{overflow:"visible"}}>
      {data.map((d,i)=>{
        const barH = Math.max((d.value/max)*height,d.value>0?2:0);
        const x = 4+i*(bw+4);
        return (
          <g key={i}>
            <rect x={x} y={height-barH} width={bw} height={barH} fill={d.color} rx={2} opacity={0.85}/>
            <text x={x+bw/2} y={height-barH-3} textAnchor="middle" fill={C.textMid} fontSize={8}>{fmtN(d.value)}</text>
            <text x={x+bw/2} y={height+14} textAnchor="middle" fill={C.textDim} fontSize={7}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ComboChart({dates,bars,lines,slaLine,height=100}:{dates:string[];bars:{values:number[];color:string}[];lines?:{values:number[];color:string}[];slaLine?:number;height?:number}) {
  if (!dates.length) return null;
  const W=320,PAD=8;
  const allVals=[...bars.flatMap(b=>b.values),...(lines||[]).flatMap(l=>l.values),slaLine??0].filter(v=>!isNaN(v)&&isFinite(v));
  const maxVal=Math.max(...allVals,1);
  const bw=Math.max(Math.floor((W-PAD*2)/dates.length)-6,4);
  const nBars=bars.length;
  const xFor=(i:number)=>PAD+i*((W-PAD*2)/dates.length);
  const yFor=(v:number)=>height-4-(v/maxVal)*(height-16);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height+20}`} style={{overflow:"visible"}}>
      {bars.map((b,bi)=>dates.map((_,i)=>{
        const v=b.values[i]??0;
        const barH=Math.max((v/maxVal)*(height-16),v>0?2:0);
        return <rect key={`${bi}-${i}`} x={xFor(i)+bi*(bw/nBars)} y={yFor(v)} width={bw/nBars} height={barH} fill={b.color} rx={1} opacity={0.8}/>;
      }))}
      {(lines||[]).map((l,li)=>{
        const pts=dates.map((_,i)=>`${xFor(i)+bw/2},${yFor(l.values[i]??0)}`).join(" ");
        return <polyline key={li} points={pts} fill="none" stroke={l.color} strokeWidth={1.5} strokeDasharray="4,2"/>;
      })}
      {slaLine!==undefined&&<line x1={PAD} y1={yFor(slaLine)} x2={W-PAD} y2={yFor(slaLine)} stroke={C.danger} strokeWidth={1} strokeDasharray="3,3"/>}
      {dates.map((d,i)=><text key={i} x={xFor(i)+bw/2} y={height+14} textAnchor="middle" fill={C.textDim} fontSize={6}>{d.slice(-5)}</text>)}
    </svg>
  );
}

function StackedBar({dates,buckets,colors,labels,height=90}:{dates:string[];buckets:number[][];colors:string[];labels:string[];height?:number}) {
  if (!dates.length) return null;
  const W=300,PAD=8;
  const totals=dates.map((_,i)=>buckets.reduce((s,b)=>s+(b[i]??0),0));
  const maxVal=Math.max(...totals,1);
  const bw=Math.max(Math.floor((W-PAD*2)/dates.length)-4,6);
  const xFor=(i:number)=>PAD+i*((W-PAD*2)/dates.length);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height+38}`} style={{overflow:"visible"}}>
      {dates.map((_,i)=>{
        let yOff=height;
        return (
          <g key={i}>
            {buckets.map((b,bi)=>{
              const v=b[i]??0;
              const barH=Math.max((v/maxVal)*height,v>0?2:0);
              yOff-=barH;
              return <rect key={bi} x={xFor(i)} y={yOff} width={bw} height={barH} fill={colors[bi]} rx={1} opacity={0.85}/>;
            })}
            <text x={xFor(i)+bw/2} y={height-totals[i]/maxVal*height-4} textAnchor="middle" fill={C.textMid} fontSize={7}>{fmtN(totals[i])}</text>
            <text x={xFor(i)+bw/2} y={height+12} textAnchor="middle" fill={C.textDim} fontSize={6}>{dates[i].slice(-5)}</text>
          </g>
        );
      })}
      {labels.map((lb,i)=>(
        <g key={i}>
          <rect x={PAD+i*68} y={height+20} width={8} height={8} fill={colors[i]} rx={1}/>
          <text x={PAD+i*68+11} y={height+28} fill={C.textDim} fontSize={7}>{lb}</text>
        </g>
      ))}
    </svg>
  );
}

function ConfigPanel({cfg,setCfg,onClose}:{cfg:Config;setCfg:(c:Config)=>void;onClose:()=>void}) {
  const [local,setLocal]=useState<Config>({...cfg});
  const workable=local.fteCount*Math.floor(local.shiftHours*60/local.minsPerAudit);
  const processed=Math.floor(workable*1.2);
  const F=({label,field,suffix,step=1}:{label:string;field:keyof Config;suffix?:string;step?:number})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontSize:11,color:C.textMid}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input type="number" value={local[field] as number} step={step}
          onChange={e=>setLocal({...local,[field]:parseFloat(e.target.value)||0})}
          style={{width:60,background:C.card2,border:`1px solid ${C.border}`,borderRadius:4,color:C.accent,fontSize:12,fontWeight:700,textAlign:"right",padding:"3px 6px"}}/>
        {suffix&&<span style={{fontSize:10,color:C.textDim}}>{suffix}</span>}
      </div>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{width:320,height:"100%",background:C.card,borderLeft:`1px solid ${C.border}`,padding:"20px 18px",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:14,fontWeight:800,color:C.text}}>⚙ Configuration</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{fontSize:10,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>FTE Capacity</div>
        <F label="Number of FTEs" field="fteCount"/>
        <F label="Shift hours/day" field="shiftHours" suffix="hrs" step={0.5}/>
        <F label="Minutes per audit" field="minsPerAudit" suffix="min"/>
        <div style={{background:C.accentDim,borderRadius:6,padding:"8px 10px",margin:"10px 0",fontSize:11}}>
          <div style={{color:C.textMid}}>Workable threshold: <strong style={{color:C.accent}}>{workable}/day</strong></div>
          <div style={{color:C.textMid}}>Processed threshold: <strong style={{color:C.accent}}>{processed}/day</strong></div>
        </div>
        <div style={{fontSize:10,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:"0.08em",margin:"12px 0 8px"}}>SLA Targets</div>
        <F label="QC Sample Rate" field="qcSamplePct" suffix="%" step={0.01}/>
        <F label="Accuracy SLA" field="accuracySLA" suffix="%" step={0.01}/>
        <F label="TAT SLA (2 days)" field="tatSLA" suffix="%" step={0.01}/>
        <F label="Helpdesk SLA (24hr)" field="helpdeskSLA" suffix="%" step={0.01}/>
        <F label="Max Rejection %" field="rejectionTarget" suffix="%" step={0.01}/>
        <F label="Backlog Threshold" field="backlogThreshold"/>
        <button onClick={()=>{setCfg(local);onClose();}}
          style={{width:"100%",marginTop:16,background:C.accent,color:"#0B1120",border:"none",borderRadius:7,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
          Save Configuration
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCUR T&E AUDIT MODULE
// ═══════════════════════════════════════════════════════════════════════════
function ConcurModule({cfg,callAI,callVision,companyName,onPublish}:{cfg:Config;callAI?:(p:string)=>Promise<string>;callVision?:(p:string,img?:string,mime?:string)=>Promise<string>;companyName:string;onPublish:(p:PublishPayload)=>void}) {
  const [rows,setRows]=useState<ConcurRow[]>([]);
  const [view,setView]=useState<"dashboard"|"table"|"ai">("dashboard");
  const [chartMode,setChartMode]=useState<"daily"|"weekly">("weekly");
  const [aiReport,setAiReport]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [showIngestion,setShowIngestion]=useState(false);

  const handleIngestConfirm=(ingested:Record<string,string>[])=>{
    const mk=()=>Math.random().toString(36).slice(2,10);
    // Smart percent: AI sends whole numbers (98.5). Module stores decimals (0.985).
    // If n > 1 it's a whole-number percent. If n <= 1 it's already decimal.
    const pct=(v:string,def:number)=>{const n=parseFloat(v);if(isNaN(n))return def/100;return n>1?n/100:n;};
    const num=(v:string)=>parseFloat(v)||0;
    const newRows=ingested.map(d=>({
      id:mk(),date:d.date||today(),
      untouched:num(d.untouched),
      freshInflow:num(d.freshInflow),
      resubmitted:num(d.resubmitted),
      totalWorkable:0,processed:num(d.processed),openEOD:0,
      pendingOpsTeam:num(d.pendingOpsTeam),
      pendingBusiness:num(d.pendingBusiness),
      tatPct:pct(d.tatPct,98),
      ukAccuracy:pct(d.ukAccuracy,100),
      teamAccuracy:pct(d.teamAccuracy,100),
      aging0_2:num(d.aging0_2),
      aging3_5:num(d.aging3_5),
      aging6_15:num(d.aging6_15),
      agingOver15:num(d.agingOver15),
      rejectionVol:num(d.rejectionVol),
    } as any)).map((r:any)=>{r.totalWorkable=r.untouched+r.freshInflow+r.resubmitted;r.openEOD=r.totalWorkable-r.processed;return r;});
    setRows((prev:any)=>[...prev,...newRows]);
    setShowIngestion(false);setView("table");
    showToast?.(`${newRows.length} row${newRows.length!==1?"s":""} imported into Concur T&E`,"success");
  };

  const workableThresh=cfg.fteCount*Math.floor(cfg.shiftHours*60/cfg.minsPerAudit);
  const processedThresh=Math.floor(workableThresh*1.2);

  const addRow=()=>{
    const prev=rows[rows.length-1];
    setRows(r=>[...r,{id:uid(),date:today(),untouched:prev?prev.openEOD:0,freshInflow:0,resubmitted:0,totalWorkable:0,processed:0,openEOD:0,pendingOpsTeam:0,pendingBusiness:0,tatPct:0.98,ukAccuracy:1,teamAccuracy:1,aging0_2:0,aging3_5:0,aging6_15:0,agingOver15:0,rejectionVol:0}]);
  };

  const updateRow=useCallback((id:string,field:keyof ConcurRow,val:string)=>{
    setRows(prev=>prev.map(r=>{
      if(r.id!==id)return r;
      const n={...r,[field]:isNaN(parseFloat(val))?val:parseFloat(val)} as ConcurRow;
      n.totalWorkable=n.untouched+n.freshInflow+n.resubmitted;
      n.openEOD=n.totalWorkable-n.processed;
      return n;
    }));
  },[]);

  const metrics=useMemo(()=>{
    if(!rows.length)return null;
    const last=rows[rows.length-1];
    const avgTAT=rows.reduce((s,r)=>s+r.tatPct,0)/rows.length;
    const avgAcc=rows.reduce((s,r)=>s+(r.ukAccuracy+r.teamAccuracy)/2,0)/rows.length;
    const totalRej=rows.reduce((s,r)=>s+r.rejectionVol,0);
    const totalProc=rows.reduce((s,r)=>s+r.processed,0);
    return {workableInflow:last.totalWorkable,processed:last.processed,pctThreshold:last.processed/processedThresh,backlog:last.pendingOpsTeam+last.pendingBusiness,tatPct:avgTAT,accuracy:avgAcc,rejPct:totalProc>0?totalRej/totalProc:0,openEOD:last.openEOD,aging:{a:last.aging0_2,b:last.aging3_5,c:last.aging6_15,d:last.agingOver15}};
  },[rows,processedThresh]);

  const cd=useMemo(()=>{
    if(chartMode==="daily"){
      const r=rows.slice(-10);
      return {dates:r.map(x=>x.date),inflow:r.map(x=>x.totalWorkable),processed:r.map(x=>x.processed),threshold:r.map(()=>workableThresh),tatPct:r.map(x=>x.tatPct*100),accuracy:r.map(x=>((x.ukAccuracy+x.teamAccuracy)/2)*100),a0:r.map(x=>x.aging0_2),a3:r.map(x=>x.aging3_5),a6:r.map(x=>x.aging6_15),a15:r.map(x=>x.agingOver15),rej:r.map(x=>x.rejectionVol)};
    }
    const g=groupByWeek(rows);const keys=Object.keys(g).sort().slice(-4);
    return {dates:keys.map(k=>weekLabel(k)),inflow:keys.map(k=>g[k].reduce((s,r)=>s+r.totalWorkable,0)),processed:keys.map(k=>g[k].reduce((s,r)=>s+r.processed,0)),threshold:keys.map(()=>workableThresh*5),tatPct:keys.map(k=>{const v=g[k];return v.reduce((s,r)=>s+r.tatPct,0)/v.length*100;}),accuracy:keys.map(k=>{const v=g[k];return v.reduce((s,r)=>s+(r.ukAccuracy+r.teamAccuracy)/2,0)/v.length*100;}),a0:keys.map(k=>g[k].reduce((s,r)=>s+r.aging0_2,0)),a3:keys.map(k=>g[k].reduce((s,r)=>s+r.aging3_5,0)),a6:keys.map(k=>g[k].reduce((s,r)=>s+r.aging6_15,0)),a15:keys.map(k=>g[k].reduce((s,r)=>s+r.agingOver15,0)),rej:keys.map(k=>g[k].reduce((s,r)=>s+r.rejectionVol,0))};
  },[rows,chartMode,workableThresh]);

  const generateReport=async()=>{
    if(!callAI||!rows.length)return;
    setAiLoading(true);
    const m=metrics!;
    try{setAiReport(await callAI(`You are a T&E Audit Governance Analyst for ${companyName}. Produce a structured governance report.\n\nLIVE KPI DATA:\n- Workable Inflow: ${m.workableInflow} (Threshold: ${workableThresh})\n- Processed: ${m.processed} (${fmtPct(m.pctThreshold)} of target)\n- TAT within 2 days: ${fmtPct(m.tatPct)} (SLA: ${fmtPct(cfg.tatSLA)}) — ${m.tatPct>=cfg.tatSLA?"MEETS SLA":"BREACH"}\n- Combined Accuracy: ${fmtPct(m.accuracy)} (SLA: ${fmtPct(cfg.accuracySLA)}) — ${m.accuracy>=cfg.accuracySLA?"MEETS SLA":"BREACH"}\n- Rejection Rate: ${fmtPct(m.rejPct)} (Target: ${fmtPct(cfg.rejectionTarget)}) — ${m.rejPct<=cfg.rejectionTarget?"WITHIN TARGET":"EXCEEDS TARGET"}\n- Backlog: ${m.backlog} (Threshold: ${cfg.backlogThreshold})\n- Aging: 0-2d: ${m.aging.a}, 3-5d: ${m.aging.b}, 6-15d: ${m.aging.c}, >15d: ${m.aging.d}\n\nPRODUCE:\n1. EXECUTIVE SUMMARY (3 sentences with specific numbers)\n2. SLA COMPLIANCE TABLE (TAT | Accuracy | Rejection | Backlog)\n3. AGING RISK ANALYSIS — which items need immediate action\n4. THROUGHPUT ANALYSIS — processed vs threshold\n5. TOP 3 ACTION ITEMS with owner and deadline\n6. RISK FLAGS`));}catch(e:any){setAiReport("Error: "+e.message);}
    setAiLoading(false);
  };

  const publishToEmail=()=>{
    if(!metrics)return;
    const m=metrics;
    onPublish({module:"concur",subject:`T&E Audit Report — ${companyName} — ${today()}`,kpiSummary:`Workable Inflow: ${m.workableInflow} | Processed: ${m.processed} (${fmtPct(m.pctThreshold)} of target) | TAT: ${fmtPct(m.tatPct)} | Accuracy: ${fmtPct(m.accuracy)} | Backlog: ${m.backlog} | Aging >15d: ${m.aging.d}`,tableData:`| Metric | Actual | Target | Status |\n|--------|--------|--------|--------|\n| TAT within 2 days | ${fmtPct(m.tatPct)} | ${fmtPct(cfg.tatSLA)} | ${m.tatPct>=cfg.tatSLA?"✓ Meets":"✗ Breach"} |\n| Combined Accuracy | ${fmtPct(m.accuracy)} | ${fmtPct(cfg.accuracySLA)} | ${m.accuracy>=cfg.accuracySLA?"✓ Meets":"✗ Breach"} |\n| Rejection Rate | ${fmtPct(m.rejPct)} | ≤${fmtPct(cfg.rejectionTarget)} | ${m.rejPct<=cfg.rejectionTarget?"✓ OK":"✗ High"} |\n| Backlog | ${m.backlog} | ≤${cfg.backlogThreshold} | ${m.backlog<=cfg.backlogThreshold?"✓ OK":"✗ Over"} |\n| Aging >15d | ${m.aging.d} | 0 | ${m.aging.d===0?"✓ Clear":"✗ Critical"} |`,period:chartMode==="weekly"?"Weekly":"Daily"});
  };

  const TH:React.CSSProperties={padding:"7px 8px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0};
  const TD:React.CSSProperties={padding:"5px 8px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.text,verticalAlign:"middle"};

  return (
    <div style={{padding:16,height:"100%",overflowY:"auto"}}>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {(["dashboard","table","ai"] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"6px 14px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${view===v?C.accent:C.border}`,background:view===v?C.accentDim:"transparent",color:view===v?C.accentText:C.textMid,cursor:"pointer"}}>
            {v==="dashboard"?"📊 Dashboard":v==="table"?"📋 Daily Data":"🤖 AI Analysis"}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {(["daily","weekly"] as const).map(m=>(
            <button key={m} onClick={()=>setChartMode(m)} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:600,border:`1px solid ${chartMode===m?C.blue:C.border}`,background:chartMode===m?C.blueDim:"transparent",color:chartMode===m?C.blue:C.textDim,cursor:"pointer"}}>
              {m==="daily"?"10-Day":"4-Week"}
            </button>
          ))}
          <button onClick={publishToEmail} disabled={!metrics} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.purple}44`,background:C.purpleDim,color:C.purple,cursor:metrics?"pointer":"not-allowed",opacity:metrics?1:0.4}}>
            📧 Publish Report
          </button>
          <button onClick={()=>setShowIngestion(true)} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.accent}44`,background:C.accentDim,color:C.accentText,cursor:"pointer"}}>
            📥 Import Data
          </button>
        </div>
      </div>

      {showIngestion&&<DataIngestion moduleKey="concur" onConfirm={handleIngestConfirm} onClose={()=>setShowIngestion(false)} callAI={callVision}/>}

      {metrics&&(
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <KpiTile label="Workable Inflow" value={fmtN(metrics.workableInflow)} sub={`Threshold: ${workableThresh}`} rag={metrics.workableInflow<=workableThresh?"green":"amber"}/>
          <KpiTile label="Processed" value={fmtN(metrics.processed)} sub={`${fmtPct(metrics.pctThreshold)} of target`} rag={metrics.pctThreshold>=1?"green":metrics.pctThreshold>=0.8?"amber":"red"}/>
          <KpiTile label="TAT within 2d" value={fmtPct(metrics.tatPct)} sub={`SLA: ${fmtPct(cfg.tatSLA)}`} rag={metrics.tatPct>=cfg.tatSLA?"green":"red"}/>
          <KpiTile label="Accuracy" value={fmtPct(metrics.accuracy)} sub={`SLA: ${fmtPct(cfg.accuracySLA)}`} rag={metrics.accuracy>=cfg.accuracySLA?"green":"red"}/>
          <KpiTile label="Backlog" value={fmtN(metrics.backlog)} sub={`Threshold: ${cfg.backlogThreshold}`} rag={metrics.backlog<=cfg.backlogThreshold?"green":metrics.backlog<=cfg.backlogThreshold*1.5?"amber":"red"}/>
          <KpiTile label="Aging >15d" value={metrics.aging.d} sub="Critical: escalate immediately" rag={metrics.aging.d===0?"green":"red"}/>
        </div>
      )}

      {metrics&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Non-Compliance Scorecard</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr>{["Dimension","Actual","Target","Status"].map(h=><th key={h} style={{...TH,position:"relative"}}>{h}</th>)}</tr></thead>
              <tbody>
                {[["Volume",fmtPct(metrics.pctThreshold),"≥100%",metrics.pctThreshold>=1?"✓ OK":"✗ Low"],["Quality",fmtPct(metrics.accuracy),fmtPct(cfg.accuracySLA),metrics.accuracy>=cfg.accuracySLA?"✓ Meets":"✗ Breach"],["TAT SLA",fmtPct(metrics.tatPct),fmtPct(cfg.tatSLA),metrics.tatPct>=cfg.tatSLA?"✓ Meets":"✗ Breach"],["Rejection",fmtPct(metrics.rejPct),`≤${fmtPct(cfg.rejectionTarget)}`,metrics.rejPct<=cfg.rejectionTarget?"✓ OK":"✗ High"]].map(([d,a,t,s])=>(
                  <tr key={d as string}><td style={TD}>{d}</td><td style={{...TD,fontWeight:700}}>{a}</td><td style={{...TD,color:C.textDim}}>{t}</td><td style={{...TD,color:(s as string).startsWith("✓")?C.success:C.danger,fontWeight:700}}>{s}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>FTE Capacity (Live)</div>
            {[["FTEs Deployed",cfg.fteCount],["Workable/day",workableThresh],["Processed/day",processedThresh],["QC Sample",fmtPct(cfg.qcSamplePct)],["Capacity Util.",fmtPct(metrics.processed/processedThresh)]].map(([lb,val])=>(
              <div key={lb as string} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}`,fontSize:10}}>
                <span style={{color:C.textMid}}>{lb}</span><span style={{color:C.accent,fontWeight:700}}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="dashboard"&&rows.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Inflow vs Processed vs Threshold</div>
            <ComboChart dates={cd.dates} bars={[{values:cd.inflow,color:C.blue},{values:cd.processed,color:C.accent}]} lines={[{values:cd.threshold,color:C.warn}]} slaLine={workableThresh} height={100}/>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              {[["Inflow",C.blue],["Processed",C.accent],["Threshold",C.warn]].map(([lb,col])=>(
                <div key={lb} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:C.textDim}}>
                  <span style={{width:8,height:8,background:col as string,borderRadius:2,flexShrink:0}}/>{lb}
                </div>
              ))}
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Backlog Aging Distribution</div>
            <StackedBar dates={cd.dates} buckets={[cd.a0,cd.a3,cd.a6,cd.a15]} colors={[C.success,C.warn,C.orange,C.danger]} labels={["0-2d","3-5d","6-15d",">15d"]} height={90}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>TAT % — within 2 days (SLA {fmtPct(cfg.tatSLA)})</div>
            <MiniBarChart data={cd.dates.map((d,i)=>({label:d.slice(-5),value:parseFloat(cd.tatPct[i].toFixed(1)),color:cd.tatPct[i]>=cfg.tatSLA*100?C.success:C.danger}))} height={70}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Accuracy % (SLA {fmtPct(cfg.accuracySLA)})</div>
            <MiniBarChart data={cd.dates.map((d,i)=>({label:d.slice(-5),value:parseFloat(cd.accuracy[i].toFixed(1)),color:cd.accuracy[i]>=cfg.accuracySLA*100?C.success:C.danger}))} height={70}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12,gridColumn:"1 / -1"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Rejection Volume (Target ≤{fmtPct(cfg.rejectionTarget)} of processed)</div>
            <MiniBarChart data={cd.dates.map((d,i)=>({label:d.slice(-5),value:cd.rej[i],color:C.danger}))} height={55}/>
          </div>
        </div>
      )}

      {view==="dashboard"&&rows.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.textDim}}>
          <div style={{fontSize:32,marginBottom:8}}>🧾</div>
          <div style={{fontSize:13,fontWeight:600,color:C.textMid,marginBottom:4}}>No audit data yet</div>
          <div style={{fontSize:11,marginBottom:16}}>Switch to Daily Data tab and add your first entry</div>
          <button onClick={()=>setView("table")} style={{padding:"8px 20px",borderRadius:6,background:C.accent,color:"#0B1120",border:"none",fontWeight:700,cursor:"pointer"}}>Add First Entry</button>
        </div>
      )}

      {view==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={addRow} style={{padding:"7px 14px",borderRadius:6,background:C.accent,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add Today's Entry</button>
            {rows.length>0&&<button onClick={()=>{if(window.confirm("Clear all data?"))setRows([]);}} style={{padding:"7px 14px",borderRadius:6,background:"transparent",color:C.danger,border:`1px solid ${C.border}`,fontSize:11,cursor:"pointer"}}>🗑 Clear All</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                {["Date","Untouched","Fresh Inflow","Resubmit","Total Workable","Processed","Open EOD","Pend GP","Pend Biz","TAT%","UK Acc%","Team Acc%","0-2d","3-5d","6-15d",">15d","Rejected",""].map(h=><th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} style={{background:r.agingOver15>0?C.dangerDim:r.aging6_15>0?"rgba(249,115,22,0.07)":"transparent"}}>
                    <td style={TD}><Cell value={r.date} onChange={v=>updateRow(r.id,"date",v)} type="date"/></td>
                    <td style={{...TD,color:C.textDim}}>{r.untouched}</td>
                    <td style={TD}><Cell value={r.freshInflow} onChange={v=>updateRow(r.id,"freshInflow",v)}/></td>
                    <td style={TD}><Cell value={r.resubmitted} onChange={v=>updateRow(r.id,"resubmitted",v)}/></td>
                    <td style={{...TD,fontWeight:700,color:r.totalWorkable>workableThresh?C.warn:C.text}}>{r.totalWorkable}</td>
                    <td style={TD}><Cell value={r.processed} onChange={v=>updateRow(r.id,"processed",v)}/></td>
                    <td style={{...TD,color:r.openEOD>cfg.backlogThreshold?C.danger:C.success,fontWeight:700}}>{r.openEOD}</td>
                    <td style={TD}><Cell value={r.pendingOpsTeam} onChange={v=>updateRow(r.id,"pendingOpsTeam",v)}/></td>
                    <td style={TD}><Cell value={r.pendingBusiness} onChange={v=>updateRow(r.id,"pendingBusiness",v)}/></td>
                    <td style={{...TD,color:r.tatPct>=cfg.tatSLA?C.success:C.danger,fontWeight:700}}><Cell value={(r.tatPct*100).toFixed(1)} onChange={v=>updateRow(r.id,"tatPct",String(parseFloat(v)/100))}/></td>
                    <td style={{...TD,color:r.ukAccuracy>=cfg.accuracySLA?C.success:C.danger}}><Cell value={(r.ukAccuracy*100).toFixed(1)} onChange={v=>updateRow(r.id,"ukAccuracy",String(parseFloat(v)/100))}/></td>
                    <td style={{...TD,color:r.teamAccuracy>=cfg.accuracySLA?C.success:C.danger}}><Cell value={(r.teamAccuracy*100).toFixed(1)} onChange={v=>updateRow(r.id,"teamAccuracy",String(parseFloat(v)/100))}/></td>
                    <td style={TD}><Cell value={r.aging0_2} onChange={v=>updateRow(r.id,"aging0_2",v)}/></td>
                    <td style={TD}><Cell value={r.aging3_5} onChange={v=>updateRow(r.id,"aging3_5",v)}/></td>
                    <td style={{...TD,color:r.aging6_15>0?C.warn:C.text}}><Cell value={r.aging6_15} onChange={v=>updateRow(r.id,"aging6_15",v)}/></td>
                    <td style={{...TD,color:r.agingOver15>0?C.danger:C.text,fontWeight:r.agingOver15>0?700:400}}><Cell value={r.agingOver15} onChange={v=>updateRow(r.id,"agingOver15",v)}/></td>
                    <td style={TD}><Cell value={r.rejectionVol} onChange={v=>updateRow(r.id,"rejectionVol",v)}/></td>
                    <td style={TD}><button onClick={()=>setRows(p=>p.filter(x=>x.id!==r.id))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={generateReport} disabled={aiLoading||rows.length===0} style={{padding:"8px 16px",borderRadius:6,background:C.accent,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:aiLoading||rows.length===0?0.4:1}}>
              {aiLoading?"⏳ Analysing...":"🤖 Generate Governance Report"}
            </button>
            {aiReport&&<button onClick={publishToEmail} style={{padding:"8px 16px",borderRadius:6,background:C.purpleDim,color:C.purple,border:`1px solid ${C.purple}44`,fontSize:11,fontWeight:700,cursor:"pointer"}}>📧 Send to Email Drafter</button>}
          </div>
          {!callAI&&<div style={{fontSize:11,color:C.warn,marginBottom:10}}>⚠ AI not connected — add API key in Settings</div>}
          {rows.length===0&&<div style={{fontSize:11,color:C.textDim}}>Add daily data first, then generate the report.</div>}
          {aiReport&&<div style={{background:C.card2,border:`1px solid ${C.accent}33`,borderRadius:8,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",maxHeight:500,overflowY:"auto"}}>{aiReport}</div>}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL HELPDESK MODULE
// ═══════════════════════════════════════════════════════════════════════════
function EmailModule({cfg,callAI,callVision,companyName,onPublish}:{cfg:Config;callAI?:(p:string)=>Promise<string>;callVision?:(p:string,img?:string,mime?:string)=>Promise<string>;companyName:string;onPublish:(p:PublishPayload)=>void}) {
  const [rows,setRows]=useState<EmailRow[]>([]);
  const [view,setView]=useState<"dashboard"|"table"|"ai">("dashboard");
  const [chartMode,setChartMode]=useState<"daily"|"weekly">("weekly");
  const [aiReport,setAiReport]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [showIngestion,setShowIngestion]=useState(false);

  const handleIngestConfirm=(ingested:Record<string,string>[])=>{
    const mk=()=>Math.random().toString(36).slice(2,10);
    const pct=(v:string)=>{const n=parseFloat(v);if(isNaN(n))return 0;return n>1?n/100:n;};
    const num=(v:string)=>parseFloat(v)||0;
    const newRows=ingested.map(d=>({
      id:mk(),date:d.date||today(),
      received:num(d.received),resolved:num(d.resolved),
      slaPct:d.slaPct?pct(d.slaPct):0,
      pendingOpsTeam:num(d.pendingOpsTeam),
      pendingClient:num(d.pendingClient),
      carryForward:num(d.carryForward),
    } as any)).map((r:any)=>{if(!r.slaPct&&r.received>0)r.slaPct=r.resolved/r.received;return r;});
    setRows((prev:any)=>[...prev,...newRows]);
    setShowIngestion(false);setView("table");
    showToast?.(`${newRows.length} row${newRows.length!==1?"s":""} imported into Email Helpdesk`,"success");
  };

  const addRow=()=>setRows(r=>[...r,{id:uid(),date:today(),received:0,resolved:0,slaPct:0,pendingOpsTeam:0,pendingClient:0,carryForward:0}]);

  const updateRow=useCallback((id:string,field:keyof EmailRow,val:string)=>{
    setRows(prev=>prev.map(r=>{
      if(r.id!==id)return r;
      const n={...r,[field]:isNaN(parseFloat(val))?val:parseFloat(val)} as EmailRow;
      if(n.received>0)n.slaPct=n.resolved/n.received;
      return n;
    }));
  },[]);

  const metrics=useMemo(()=>{
    if(!rows.length)return null;
    const last=rows[rows.length-1];
    const total=rows.reduce((s,r)=>s+r.received,0);
    const totalRes=rows.reduce((s,r)=>s+r.resolved,0);
    const avgSLA=rows.reduce((s,r)=>s+r.slaPct,0)/rows.length;
    return {total,totalRes,avgSLA,pendingOpsTeam:last.pendingOpsTeam,pendingClient:last.pendingClient,carryForward:last.carryForward};
  },[rows]);

  const cd=useMemo(()=>{
    if(chartMode==="daily"){
      const r=rows.slice(-10);
      return {dates:r.map(x=>x.date),received:r.map(x=>x.received),resolved:r.map(x=>x.resolved),sla:r.map(x=>x.slaPct*100),pgp:r.map(x=>x.pendingOpsTeam),pcl:r.map(x=>x.pendingClient)};
    }
    const g=groupByWeek(rows);const keys=Object.keys(g).sort().slice(-4);
    return {dates:keys.map(k=>weekLabel(k)),received:keys.map(k=>g[k].reduce((s,r)=>s+r.received,0)),resolved:keys.map(k=>g[k].reduce((s,r)=>s+r.resolved,0)),sla:keys.map(k=>{const v=g[k];return v.reduce((s,r)=>s+r.slaPct,0)/v.length*100;}),pgp:keys.map(k=>g[k].reduce((s,r)=>s+r.pendingOpsTeam,0)),pcl:keys.map(k=>g[k].reduce((s,r)=>s+r.pendingClient,0))};
  },[rows,chartMode]);

  const generateReport=async()=>{
    if(!callAI||!rows.length)return;
    setAiLoading(true);
    const m=metrics!;
    try{setAiReport(await callAI(`You are a Helpdesk Communication Governance Analyst for ${companyName}.\n\nLIVE DATA:\n- Total Received: ${m.total}\n- Total Resolved: ${m.totalRes} (${fmtPct(m.totalRes/Math.max(m.total,1))})\n- Average SLA (24hr): ${fmtPct(m.avgSLA)} (Target: ${fmtPct(cfg.helpdeskSLA)})\n- Pending Ops Team: ${m.pendingOpsTeam}\n- Pending Client: ${m.pendingClient}\n- Carry Forward: ${m.carryForward}\n\nPRODUCE:\n1. EXECUTIVE SUMMARY\n2. SLA COMPLIANCE — breaches and patterns\n3. PENDING ANALYSIS — Ops Team vs Client split\n4. TOP 3 ACTION ITEMS\n5. RISK FLAGS`));}catch(e:any){setAiReport("Error: "+e.message);}
    setAiLoading(false);
  };

  const publishToEmail=()=>{
    if(!metrics)return;
    const m=metrics;
    onPublish({module:"email",subject:`Helpdesk Email Report — ${companyName} — ${today()}`,kpiSummary:`Received: ${m.total} | Resolved: ${m.totalRes} | SLA: ${fmtPct(m.avgSLA)} | Pending Ops Team: ${m.pendingOpsTeam} | Pending Client: ${m.pendingClient}`,tableData:`| Metric | Actual | Target | Status |\n|--------|--------|--------|--------|\n| SLA 24hr | ${fmtPct(m.avgSLA)} | ${fmtPct(cfg.helpdeskSLA)} | ${m.avgSLA>=cfg.helpdeskSLA?"✓ Meets":"✗ Breach"} |\n| Resolution Rate | ${fmtPct(m.totalRes/Math.max(m.total,1))} | 100% | ${m.totalRes>=m.total?"✓ Clear":"⚠ Pending"} |\n| Pending Ops Team | ${m.pendingOpsTeam} | 0 | ${m.pendingOpsTeam===0?"✓ Clear":"⚠ Action Needed"} |`,period:chartMode==="weekly"?"Weekly":"Daily"});
  };

  const TH:React.CSSProperties={padding:"7px 8px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",color:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0};
  const TD:React.CSSProperties={padding:"5px 8px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.text,verticalAlign:"middle"};

  return (
    <div style={{padding:16,height:"100%",overflowY:"auto"}}>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {(["dashboard","table","ai"] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"6px 14px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${view===v?C.warn:C.border}`,background:view===v?C.warnDim:"transparent",color:view===v?C.warn:C.textMid,cursor:"pointer"}}>
            {v==="dashboard"?"📊 Dashboard":v==="table"?"📋 Daily Data":"🤖 AI Analysis"}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {(["daily","weekly"] as const).map(m=>(
            <button key={m} onClick={()=>setChartMode(m)} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:600,border:`1px solid ${chartMode===m?C.blue:C.border}`,background:chartMode===m?C.blueDim:"transparent",color:chartMode===m?C.blue:C.textDim,cursor:"pointer"}}>
              {m==="daily"?"10-Day":"4-Week"}
            </button>
          ))}
          <button onClick={publishToEmail} disabled={!metrics} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.purple}44`,background:C.purpleDim,color:C.purple,cursor:metrics?"pointer":"not-allowed",opacity:metrics?1:0.4}}>
            📧 Publish Report
          </button>
          <button onClick={()=>setShowIngestion(true)} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.warn}44`,background:C.warnDim,color:C.warn,cursor:"pointer"}}>
            📥 Import Data
          </button>
        </div>
      </div>

      {showIngestion&&<DataIngestion moduleKey="email" onConfirm={handleIngestConfirm} onClose={()=>setShowIngestion(false)} callAI={callVision}/>}

      {metrics&&(
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <KpiTile label="Emails Received" value={fmtN(metrics.total)} color={C.blue}/>
          <KpiTile label="Resolved" value={fmtN(metrics.totalRes)} sub={fmtPct(metrics.totalRes/Math.max(metrics.total,1))} rag={metrics.totalRes>=metrics.total?"green":"amber"}/>
          <KpiTile label="SLA 24hr" value={fmtPct(metrics.avgSLA)} sub={`Target: ${fmtPct(cfg.helpdeskSLA)}`} rag={metrics.avgSLA>=cfg.helpdeskSLA?"green":"red"}/>
          <KpiTile label="Pend Ops Team" value={metrics.pendingOpsTeam} rag={metrics.pendingOpsTeam===0?"green":"amber"}/>
          <KpiTile label="Pend Client" value={metrics.pendingClient} color={C.textMid}/>
          <KpiTile label="Carry Forward" value={metrics.carryForward} rag={metrics.carryForward===0?"green":"red"}/>
        </div>
      )}

      {view==="dashboard"&&rows.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Received vs Resolved</div>
            <ComboChart dates={cd.dates} bars={[{values:cd.received,color:C.blue},{values:cd.resolved,color:C.success}]} height={90}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>SLA % (24hr — Target: {fmtPct(cfg.helpdeskSLA)})</div>
            <MiniBarChart data={cd.dates.map((d,i)=>({label:d.slice(-5),value:parseFloat(cd.sla[i].toFixed(1)),color:cd.sla[i]>=cfg.helpdeskSLA*100?C.success:C.danger}))} height={70}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12,gridColumn:"1 / -1"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Pending Split — Operations Team vs Client</div>
            <StackedBar dates={cd.dates} buckets={[cd.pgp,cd.pcl]} colors={[C.accent,C.warn]} labels={["Ops Team","Client"]} height={70}/>
          </div>
        </div>
      )}

      {view==="dashboard"&&rows.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.textDim}}>
          <div style={{fontSize:32,marginBottom:8}}>📧</div>
          <div style={{fontSize:13,fontWeight:600,color:C.textMid,marginBottom:4}}>No helpdesk data yet</div>
          <button onClick={()=>setView("table")} style={{padding:"8px 20px",borderRadius:6,background:C.warn,color:"#0B1120",border:"none",fontWeight:700,cursor:"pointer"}}>Add First Entry</button>
        </div>
      )}

      {view==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={addRow} style={{padding:"7px 14px",borderRadius:6,background:C.warn,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add Entry</button>
            {rows.length>0&&<button onClick={()=>{if(window.confirm("Clear all?"))setRows([]);}} style={{padding:"7px 14px",borderRadius:6,background:"transparent",color:C.danger,border:`1px solid ${C.border}`,fontSize:11,cursor:"pointer"}}>🗑 Clear</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Date","Received","Resolved","SLA% (auto)","Pend Ops Team","Pend Client","Carry Fwd",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id}>
                    <td style={TD}><Cell value={r.date} onChange={v=>updateRow(r.id,"date",v)} type="date"/></td>
                    <td style={TD}><Cell value={r.received} onChange={v=>updateRow(r.id,"received",v)}/></td>
                    <td style={TD}><Cell value={r.resolved} onChange={v=>updateRow(r.id,"resolved",v)}/></td>
                    <td style={{...TD,fontWeight:700,color:r.slaPct>=cfg.helpdeskSLA?C.success:C.danger}}>{fmtPct(r.slaPct)}</td>
                    <td style={TD}><Cell value={r.pendingOpsTeam} onChange={v=>updateRow(r.id,"pendingOpsTeam",v)}/></td>
                    <td style={TD}><Cell value={r.pendingClient} onChange={v=>updateRow(r.id,"pendingClient",v)}/></td>
                    <td style={{...TD,color:r.carryForward>0?C.danger:C.text}}><Cell value={r.carryForward} onChange={v=>updateRow(r.id,"carryForward",v)}/></td>
                    <td style={TD}><button onClick={()=>setRows(p=>p.filter(x=>x.id!==r.id))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={generateReport} disabled={aiLoading||rows.length===0} style={{padding:"8px 16px",borderRadius:6,background:C.warn,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:aiLoading||rows.length===0?0.4:1}}>
              {aiLoading?"⏳ Analysing...":"🤖 Generate Helpdesk Report"}
            </button>
            {aiReport&&<button onClick={publishToEmail} style={{padding:"8px 16px",borderRadius:6,background:C.purpleDim,color:C.purple,border:`1px solid ${C.purple}44`,fontSize:11,fontWeight:700,cursor:"pointer"}}>📧 Send to Email Drafter</button>}
          </div>
          {aiReport&&<div style={{background:C.card2,border:`1px solid ${C.warn}33`,borderRadius:8,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",maxHeight:500,overflowY:"auto"}}>{aiReport}</div>}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICENOW MODULE
// ═══════════════════════════════════════════════════════════════════════════
function ServiceNowModule({cfg,callAI,callVision,companyName,onPublish}:{cfg:Config;callAI?:(p:string)=>Promise<string>;callVision?:(p:string,img?:string,mime?:string)=>Promise<string>;companyName:string;onPublish:(p:PublishPayload)=>void}) {
  const [tickets,setTickets]=useState<SNTicket[]>([]);
  const [view,setView]=useState<"dashboard"|"table"|"ai">("dashboard");
  const [aiReport,setAiReport]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [showIngestion,setShowIngestion]=useState(false);

  const handleIngestConfirm=(ingested:Record<string,string>[])=>{
    const mk=()=>Math.random().toString(36).slice(2,10);
    const VALID_PRIORITIES=["Critical","High","Medium","Low"];
    const VALID_STATUSES=["Open","Assigned","In Progress","Pending","Resolved","Closed"];
    const normPriority=(v:string)=>VALID_PRIORITIES.find(p=>p.toLowerCase()===v?.toLowerCase())||"Medium";
    const normStatus=(v:string)=>VALID_STATUSES.find(s=>s.toLowerCase()===v?.toLowerCase())||"Open";
    const newTickets=ingested.map(d=>({
      id:mk(),
      ticketNo:d.ticketNo||("INC"+mk().slice(0,6).toUpperCase()),
      date:d.date||today(),
      priority:normPriority(d.priority),
      category:d.category||"",
      status:normStatus(d.status),
      assignedTo:d.assignedTo||"",
      team:d.team||"",
      firstResponse:d.firstResponse||"",
      pendingReason:"",notes:"",
    }));
    setTickets((prev:any)=>[...prev,...newTickets]);
    setShowIngestion(false);setView("table");
    showToast?.(`${newTickets.length} ticket${newTickets.length!==1?"s":""} imported into ServiceNow`,"success");
  };

  const addTicket=()=>setTickets(t=>[...t,{id:uid(),ticketNo:"INC"+uid().slice(0,6).toUpperCase(),date:today(),priority:"Medium",category:"",status:"Open",assignedTo:"",team:"",firstResponse:"",pendingReason:"",notes:""}]);
  const upd=useCallback((id:string,field:keyof SNTicket,val:string)=>setTickets(prev=>prev.map(t=>t.id===id?{...t,[field]:val}:t)),[]);

  const metrics=useMemo(()=>{
    const active=tickets.filter(t=>!["Resolved","Closed"].includes(t.status));
    const resolved=tickets.filter(t=>["Resolved","Closed"].includes(t.status));
    const slaMet=tickets.filter(t=>t.firstResponse&&t.date&&daysBetween(t.date,t.firstResponse)<=3);
    const slaPct=tickets.length>0?slaMet.length/tickets.length:0;
    const aging={a:active.filter(t=>daysBetween(t.date)<=3).length,b:active.filter(t=>daysBetween(t.date)>3&&daysBetween(t.date)<=5).length,c:active.filter(t=>daysBetween(t.date)>5&&daysBetween(t.date)<=15).length,d:active.filter(t=>daysBetween(t.date)>15).length};
    const byPriority:Record<string,number>={};
    PRIORITIES.forEach(p=>{byPriority[p]=tickets.filter(t=>t.priority===p).length;});
    const byTeam:Record<string,{total:number;resolved:number}>={};
    tickets.forEach(t=>{const team=t.team||"Unassigned";if(!byTeam[team])byTeam[team]={total:0,resolved:0};byTeam[team].total++;if(["Resolved","Closed"].includes(t.status))byTeam[team].resolved++;});
    return {total:tickets.length,active:active.length,resolved:resolved.length,slaPct,aging,byPriority,byTeam};
  },[tickets]);

  const generateReport=async()=>{
    if(!callAI||!tickets.length)return;
    setAiLoading(true);
    const m=metrics;
    try{setAiReport(await callAI(`You are an IT Service Management governance analyst for ${companyName}.\n\nTICKET DATA:\n- Total: ${m.total} | Active: ${m.active} | Resolved: ${m.resolved}\n- SLA (first response ≤3 days): ${fmtPct(m.slaPct)}\n- Aging: 0-3d: ${m.aging.a}, 4-5d: ${m.aging.b}, 6-15d: ${m.aging.c}, >15d: ${m.aging.d}\n- Priority: ${JSON.stringify(m.byPriority)}\n- Teams: ${JSON.stringify(m.byTeam)}\n\nPRODUCE:\n1. EXECUTIVE SUMMARY\n2. SLA COMPLIANCE ANALYSIS\n3. AGING RISK — items needing escalation\n4. TEAM PERFORMANCE — resolution rates\n5. TOP 3 ACTION ITEMS\n6. RISK FLAGS`));}catch(e:any){setAiReport("Error: "+e.message);}
    setAiLoading(false);
  };

  const publishToEmail=()=>{
    const m=metrics;
    onPublish({module:"servicenow",subject:`ServiceNow Ticket Report — ${companyName} — ${today()}`,kpiSummary:`Total: ${m.total} | Active: ${m.active} | SLA: ${fmtPct(m.slaPct)} | Aging >15d: ${m.aging.d} | Resolved: ${m.resolved}`,tableData:`| Metric | Value | Status |\n|--------|-------|--------|\n| Total Tickets | ${m.total} | — |\n| Active | ${m.active} | ${m.active>10?"⚠ High":"✓ OK"} |\n| SLA Compliance | ${fmtPct(m.slaPct)} | ${m.slaPct>=0.95?"✓ Meets":"✗ Breach"} |\n| Aging >15d | ${m.aging.d} | ${m.aging.d===0?"✓ Clear":"✗ Critical"} |\n| Resolved | ${m.resolved} | — |`,period:"Current"});
  };

  const TH:React.CSSProperties={padding:"7px 8px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",color:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0};
  const TD:React.CSSProperties={padding:"5px 8px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.text,verticalAlign:"middle"};

  return (
    <div style={{padding:16,height:"100%",overflowY:"auto"}}>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {(["dashboard","table","ai"] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"6px 14px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${view===v?C.blue:C.border}`,background:view===v?C.blueDim:"transparent",color:view===v?C.blue:C.textMid,cursor:"pointer"}}>
            {v==="dashboard"?"📊 Dashboard":v==="table"?"🎫 Tickets":"🤖 AI Analysis"}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          <button onClick={publishToEmail} disabled={!tickets.length} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.purple}44`,background:C.purpleDim,color:C.purple,cursor:tickets.length?"pointer":"not-allowed",opacity:tickets.length?1:0.4}}>
            📧 Publish Report
          </button>
          <button onClick={()=>setShowIngestion(true)} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.blue}44`,background:C.blueDim,color:C.blue,cursor:"pointer"}}>
            📥 Import Data
          </button>
        </div>
      </div>

      {showIngestion&&<DataIngestion moduleKey="servicenow" onConfirm={handleIngestConfirm} onClose={()=>setShowIngestion(false)} callAI={callVision}/>}

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <KpiTile label="Total Tickets" value={metrics.total} color={C.blue}/>
        <KpiTile label="Active" value={metrics.active} rag={metrics.active>10?"amber":"green"}/>
        <KpiTile label="Resolved" value={metrics.resolved} color={C.success}/>
        <KpiTile label="SLA Compliance" value={fmtPct(metrics.slaPct)} sub="First response ≤3 days" rag={metrics.slaPct>=0.95?"green":"red"}/>
        <KpiTile label="Aging >15d" value={metrics.aging.d} rag={metrics.aging.d===0?"green":"red"}/>
      </div>

      {view==="dashboard"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Priority Distribution</div>
            <MiniBarChart data={PRIORITIES.map(p=>({label:p,value:metrics.byPriority[p]??0,color:p==="Critical"?C.danger:p==="High"?C.warn:p==="Medium"?C.blue:C.success}))} height={70}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Aging Buckets (Active)</div>
            <MiniBarChart data={[{label:"0-3d",value:metrics.aging.a,color:C.success},{label:"4-5d",value:metrics.aging.b,color:C.warn},{label:"6-15d",value:metrics.aging.c,color:C.orange},{label:">15d",value:metrics.aging.d,color:C.danger}]} height={70}/>
          </div>
          {Object.keys(metrics.byTeam).length>0&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12,gridColumn:"1 / -1"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>Team Performance</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead><tr>{["Team","Total","Resolved","Resolution %"].map(h=><th key={h} style={{...TH,position:"relative"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(metrics.byTeam).map(([team,v])=>(
                    <tr key={team}><td style={TD}>{team}</td><td style={TD}>{v.total}</td><td style={TD}>{v.resolved}</td><td style={{...TD,color:v.total>0&&v.resolved/v.total>=0.7?C.success:C.warn,fontWeight:700}}>{v.total>0?fmtPct(v.resolved/v.total):"—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tickets.length===0&&<div style={{gridColumn:"1 / -1",textAlign:"center",padding:"30px",color:C.textDim}}><div style={{fontSize:28,marginBottom:8}}>🎫</div><div style={{fontSize:12,color:C.textMid}}>No tickets yet — switch to Tickets tab to add</div></div>}
        </div>
      )}

      {view==="table"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={addTicket} style={{padding:"7px 14px",borderRadius:6,background:C.blue,color:"#fff",border:"none",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add Ticket</button>
            {tickets.length>0&&<button onClick={()=>{if(window.confirm("Clear all?"))setTickets([]);}} style={{padding:"7px 14px",borderRadius:6,background:"transparent",color:C.danger,border:`1px solid ${C.border}`,fontSize:11,cursor:"pointer"}}>🗑 Clear</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Ticket #","Date","Priority","Category","Status","Team","Assigned","1st Response","Aging","SLA",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {tickets.map(t=>{
                  const aging=daysBetween(t.date);
                  const sla=t.firstResponse?daysBetween(t.date,t.firstResponse)<=3:null;
                  return (
                    <tr key={t.id} style={{background:aging>15&&!["Resolved","Closed"].includes(t.status)?C.dangerDim:"transparent"}}>
                      <td style={TD}><Cell value={t.ticketNo} onChange={v=>upd(t.id,"ticketNo",v)}/></td>
                      <td style={TD}><Cell value={t.date} onChange={v=>upd(t.id,"date",v)} type="date"/></td>
                      <td style={TD}><Cell value={t.priority} onChange={v=>upd(t.id,"priority",v)} options={PRIORITIES}/></td>
                      <td style={TD}><Cell value={t.category} onChange={v=>upd(t.id,"category",v)}/></td>
                      <td style={TD}><Cell value={t.status} onChange={v=>upd(t.id,"status",v)} options={SN_STATUSES}/></td>
                      <td style={TD}><Cell value={t.team} onChange={v=>upd(t.id,"team",v)}/></td>
                      <td style={TD}><Cell value={t.assignedTo} onChange={v=>upd(t.id,"assignedTo",v)}/></td>
                      <td style={TD}><Cell value={t.firstResponse} onChange={v=>upd(t.id,"firstResponse",v)} type="date"/></td>
                      <td style={{...TD,fontWeight:700,color:aging>15?C.danger:aging>5?C.warn:C.success}}>{aging}d</td>
                      <td style={TD}>{sla===null?<span style={{color:C.textDim}}>—</span>:sla?<span style={{color:C.success}}>✓</span>:<span style={{color:C.danger}}>✗</span>}</td>
                      <td style={TD}><button onClick={()=>setTickets(p=>p.filter(x=>x.id!==t.id))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={generateReport} disabled={aiLoading||tickets.length===0} style={{padding:"8px 16px",borderRadius:6,background:C.blue,color:"#fff",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:aiLoading||tickets.length===0?0.4:1}}>
              {aiLoading?"⏳ Analysing...":"🤖 Generate Ticket Report"}
            </button>
            {aiReport&&<button onClick={publishToEmail} style={{padding:"8px 16px",borderRadius:6,background:C.purpleDim,color:C.purple,border:`1px solid ${C.purple}44`,fontSize:11,fontWeight:700,cursor:"pointer"}}>📧 Send to Email Drafter</button>}
          </div>
          {aiReport&&<div style={{background:C.card2,border:`1px solid ${C.blue}33`,borderRadius:8,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",maxHeight:500,overflowY:"auto"}}>{aiReport}</div>}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH HUB — Agentic Publishing Layer
// ═══════════════════════════════════════════════════════════════════════════
function DispatchHub({callAI,companyName,pendingPublish,onClearPublish}:{callAI?:(p:string)=>Promise<string>;companyName:string;pendingPublish:PublishPayload|null;onClearPublish:()=>void}) {
  const [activeAgent,setActiveAgent]=useState<"email"|"status"|"meeting"|"variance"|null>(null);
  const [emailDraft,setEmailDraft]=useState("");
  const [emailDraftHTML,setEmailDraftHTML]=useState("");
  const [emailSubject,setEmailSubject]=useState("");
  const [generating,setGenerating]=useState(false);
  const [customInput,setCustomInput]=useState("");
  const [copied,setCopied]=useState<"text"|"html"|null>(null);

  useEffect(()=>{
    if(pendingPublish){
      setActiveAgent("email");
      setEmailSubject(pendingPublish.subject);
      generateFromPayload(pendingPublish);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pendingPublish]);

  const generateFromPayload=async(payload:PublishPayload)=>{
    if(!callAI)return;
    setGenerating(true);
    const label=payload.module==="concur"?"T&E Audit":payload.module==="email"?"Helpdesk Email":"ServiceNow Tickets";
    try{
      const result=await callAI(`You are a professional business communication writer for ${companyName}. Draft a ${payload.period} ${label} operational report email.\n\nSUBJECT: ${payload.subject}\n\nKPI SUMMARY:\n${payload.kpiSummary}\n\nDATA TABLE:\n${payload.tableData}\n\nINSTRUCTIONS:\nWrite a professional email body. Lead with overall health status (GREEN/AMBER/RED based on SLA status). Include the KPI table. End with action items if any SLAs are breached. Sign off as "${companyName} Operations Team". Keep under 250 words.\n\nThen on a new line write exactly: ===HTML_VERSION===\nThen write the same email as clean HTML with: dark blue (#1e3a5f) header bar with white subject text, colored status badge (green/amber/red), KPI table with blue (#2563eb) header row and white text, alternating row colors (#f8fafc and white), breach numbers bolded in red (#dc2626), sans-serif font, max-width 600px, professional footer. Output ONLY: plain text email body, then ===HTML_VERSION===, then HTML. No other commentary.`);
      const split=result.indexOf("===HTML_VERSION===");
      if(split>-1){setEmailDraft(result.slice(0,split).trim());setEmailDraftHTML(result.slice(split+18).trim());}
      else{setEmailDraft(result.trim());setEmailDraftHTML("");}
    }catch(e:any){setEmailDraft("Error generating email: "+e.message);}
    setGenerating(false);
  };

  const generateCustomEmail=async()=>{
    if(!callAI||!customInput.trim())return;
    setGenerating(true);
    try{
      const result=await callAI(`Draft a professional email for ${companyName} based on these bullet points:\n\n${customInput}\n\nWrite: Subject line first as "Subject: ...", then full professional email body. Sign off as "${companyName} Operations Team".\n\nThen on a new line: ===HTML_VERSION===\nThen same email as clean HTML (max-width 600px, dark blue header, professional table if any, sans-serif font).`);
      const subMatch=result.match(/Subject:\s*(.+)/);
      if(subMatch)setEmailSubject(subMatch[1].trim());
      const split=result.indexOf("===HTML_VERSION===");
      if(split>-1){setEmailDraft(result.slice(0,split).replace(/Subject:.+\n/,"").trim());setEmailDraftHTML(result.slice(split+18).trim());}
      else setEmailDraft(result.trim());
    }catch(e:any){setEmailDraft("Error: "+e.message);}
    setGenerating(false);
  };

  const copy=(type:"text"|"html")=>{
    navigator.clipboard.writeText(type==="html"?emailDraftHTML:emailDraft).then(()=>{setCopied(type);setTimeout(()=>setCopied(null),2500);});
  };

  const AGENTS=[
    {id:"email" as const,label:"Email Drafter",ic:"✉️",desc:"Draft professional emails from bullet points or auto-generate from Concur, Email & ServiceNow governance reports.",color:C.accent},
    {id:"status" as const,label:"Status Report",ic:"📊",desc:"Convert raw team updates into formatted SLA and status reports.",color:C.blue},
    {id:"meeting" as const,label:"Meeting Notes → Actions",ic:"📝",desc:"Extract action items, owners, and deadlines from meeting notes.",color:C.purple},
    {id:"variance" as const,label:"Variance Explainer",ic:"📉",desc:"Explain what changed between numbers and why it likely happened.",color:C.warn},
  ];

  return (
    <div style={{padding:16,height:"100%",overflowY:"auto"}}>
      {pendingPublish&&(
        <div style={{background:C.purpleDim,border:`1px solid ${C.purple}44`,borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>🔗</span>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:C.purple}}>Report received from {pendingPublish.module==="concur"?"Concur T&E":pendingPublish.module==="email"?"Email Helpdesk":"ServiceNow"}</div>
            <div style={{fontSize:10,color:C.textMid,marginTop:2}}>{pendingPublish.subject}</div>
          </div>
          <button onClick={onClearPublish} style={{background:"none",border:"none",color:C.textDim,cursor:"pointer",fontSize:18}}>×</button>
        </div>
      )}

      {!activeAgent&&(
        <>
          <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4}}>Dispatch Hub</div>
          <div style={{fontSize:11,color:C.textMid,marginBottom:16,lineHeight:1.7}}>
            Agentic publishing layer. Use the <strong style={{color:C.purple}}>📧 Publish Report</strong> button in any governance module to auto-send live KPI data here — the Email Drafter generates a ready-to-copy professional email with both plain text and HTML versions.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {AGENTS.map(a=>(
              <button key={a.id} onClick={()=>setActiveAgent(a.id)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 14px",cursor:"pointer",textAlign:"left",display:"flex",flexDirection:"column",gap:6}}
                onMouseEnter={e=>(e.currentTarget.style.borderColor=a.color)}
                onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                <span style={{fontSize:24}}>{a.ic}</span>
                <div style={{fontSize:12,fontWeight:700,color:a.color}}>{a.label}</div>
                <div style={{fontSize:10,color:C.textMid,lineHeight:1.5}}>{a.desc}</div>
                {a.id==="email"&&pendingPublish&&<div style={{fontSize:9,background:C.purpleDim,color:C.purple,padding:"2px 8px",borderRadius:10,fontWeight:700,width:"fit-content"}}>1 report waiting →</div>}
              </button>
            ))}
          </div>
        </>
      )}

      {activeAgent==="email"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <button onClick={()=>{setActiveAgent(null);onClearPublish();setEmailDraft("");setEmailDraftHTML("");}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 10px",color:C.textMid,fontSize:11,cursor:"pointer"}}>← Back</button>
            <span style={{fontSize:14,fontWeight:800,color:C.text}}>✉️ Email Drafter</span>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:C.textDim,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Subject Line</div>
            <input value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} placeholder="Email subject..."
              style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px",color:C.text,fontSize:12,outline:"none"}}/>
          </div>

          {pendingPublish?(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.accent,marginBottom:6}}>📊 DATA FROM {pendingPublish.module.toUpperCase()} MODULE</div>
              <div style={{fontSize:10,color:C.textMid,lineHeight:1.6,marginBottom:10}}>{pendingPublish.kpiSummary}</div>
              <button onClick={()=>generateFromPayload(pendingPublish)} disabled={generating||!callAI}
                style={{padding:"7px 14px",borderRadius:6,background:C.accent,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:generating||!callAI?0.4:1}}>
                {generating?"⏳ Drafting...":"🤖 Auto-Draft from Module Data"}
              </button>
              {!callAI&&<span style={{fontSize:10,color:C.warn,marginLeft:10}}>⚠ AI not connected</span>}
            </div>
          ):(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:C.textDim,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Your Bullet Points</div>
              <textarea value={customInput} onChange={e=>setCustomInput(e.target.value)} rows={5}
                placeholder={"Paste bullets here...\n• TAT this week: 99.7%\n• Backlog reduced to 5\n• 2 items aging >15 days — escalated to manager"}
                style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px",color:C.text,fontSize:11,resize:"vertical",lineHeight:1.6,outline:"none"}}/>
              <button onClick={generateCustomEmail} disabled={generating||!customInput.trim()||!callAI}
                style={{marginTop:8,padding:"7px 14px",borderRadius:6,background:C.accent,color:"#0B1120",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:generating||!customInput.trim()||!callAI?0.4:1}}>
                {generating?"⏳ Drafting...":"🤖 Draft Email"}
              </button>
            </div>
          )}

          {emailDraft&&(
            <>
              {/* Plain text */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:C.text}}>Plain Text Version</div>
                    <div style={{fontSize:9,color:C.textDim}}>Copy and paste directly into Outlook</div>
                  </div>
                  <button onClick={()=>copy("text")} style={{padding:"5px 14px",borderRadius:5,background:copied==="text"?C.success:C.accentDim,color:copied==="text"?"#fff":C.accent,border:`1px solid ${C.accent}44`,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    {copied==="text"?"✓ Copied!":"📋 Copy Text"}
                  </button>
                </div>
                <textarea readOnly value={emailDraft} rows={12}
                  style={{width:"100%",background:"transparent",border:"none",color:C.text,fontSize:11,padding:"12px",lineHeight:1.7,resize:"vertical",outline:"none"}}/>
              </div>

              {/* HTML version */}
              {emailDraftHTML&&(
                <div style={{background:C.card,border:`1px solid ${C.purple}33`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.text}}>HTML Version</div>
                      <div style={{fontSize:9,color:C.textDim}}>Rendered preview below — copy HTML for rich email clients</div>
                    </div>
                    <button onClick={()=>copy("html")} style={{padding:"5px 14px",borderRadius:5,background:copied==="html"?C.success:C.purpleDim,color:copied==="html"?"#fff":C.purple,border:`1px solid ${C.purple}44`,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                      {copied==="html"?"✓ Copied!":"📋 Copy HTML"}
                    </button>
                  </div>
                  <div style={{padding:12}}>
                    <div style={{fontSize:9,color:C.textDim,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Rendered Preview</div>
                    <div style={{background:"#fff",borderRadius:6,padding:8,maxHeight:300,overflowY:"auto",border:"1px solid #e2e8f0"}} dangerouslySetInnerHTML={{__html:emailDraftHTML}}/>
                    <div style={{fontSize:9,color:C.textDim,marginTop:8,lineHeight:1.5}}>
                      <strong style={{color:C.textMid}}>To use in Outlook:</strong> Copy the HTML code below → In Outlook, create a new email → Insert → Signature (paste there) or use Insert Object → HTML. Alternatively, open any browser email client that accepts HTML paste.
                    </div>
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:9,color:C.textDim,fontWeight:600,marginBottom:4,textTransform:"uppercase"}}>Raw HTML Code</div>
                      <textarea readOnly value={emailDraftHTML} rows={4}
                        style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:4,color:C.textMid,fontSize:9,padding:"6px 8px",resize:"vertical",outline:"none"}}/>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeAgent&&activeAgent!=="email"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <button onClick={()=>setActiveAgent(null)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 10px",color:C.textMid,fontSize:11,cursor:"pointer"}}>← Back</button>
            <span style={{fontSize:14,fontWeight:800,color:C.text}}>{AGENTS.find(a=>a.id===activeAgent)?.ic} {AGENTS.find(a=>a.id===activeAgent)?.label}</span>
          </div>
          <AgentWorkspace agent={AGENTS.find(a=>a.id===activeAgent)!} callAI={callAI} companyName={companyName}/>
        </div>
      )}
    </div>
  );
}

function AgentWorkspace({agent,callAI,companyName}:{agent:{label:string;ic:string;color:string};callAI?:(p:string)=>Promise<string>;companyName:string}) {
  const [input,setInput]=useState("");
  const [output,setOutput]=useState("");
  const [loading,setLoading]=useState(false);

  const run=async()=>{
    if(!callAI||!input.trim())return;
    setLoading(true);
    const prompts:Record<string,string>={
      "Status Report":`You are a professional report writer for ${companyName}. Convert these raw team updates into a structured, professional status report with: Executive Summary, SLA Status table, Key Highlights, Issues & Risks, Next Steps.\n\nINPUT:\n${input}`,
      "Meeting Notes → Actions":`Extract all action items from these meeting notes for ${companyName}. Format as a table with: Action Item | Owner | Deadline | Priority | Status. Then list any open decisions and risks identified.\n\nNOTES:\n${input}`,
      "Variance Explainer":`You are a financial and operational analyst for ${companyName}. Explain the variances in the data provided. Structure your response as: What Changed (the facts), Why It Changed (root cause analysis, 3-4 reasons), What It Means (business impact), and What To Do (recommended actions).\n\nDATA:\n${input}`,
    };
    try{setOutput(await callAI(prompts[agent.label]||`Process this for ${companyName}: ${input}`));}catch(e:any){setOutput("Error: "+e.message);}
    setLoading(false);
  };

  return (
    <div>
      <textarea value={input} onChange={e=>setInput(e.target.value)} rows={6}
        placeholder="Paste your input here..."
        style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px",color:C.text,fontSize:11,resize:"vertical",marginBottom:10,outline:"none",lineHeight:1.6}}/>
      <button onClick={run} disabled={loading||!input.trim()||!callAI}
        style={{padding:"9px 24px",borderRadius:6,background:agent.color,color:"#0B1120",border:"none",fontSize:12,fontWeight:700,cursor:"pointer",opacity:loading||!input.trim()||!callAI?0.4:1}}>
        {loading?"⏳ Processing...":"🤖 Process"}
      </button>
      {output&&(
        <div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",marginTop:12,maxHeight:500,overflowY:"auto"}}>
          {output}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
interface PulseProps {
  callAI?:(prompt:string)=>Promise<string>;
  companyName?:string;
  defaultModule?:string;
  templates?:any[];setTemplates?:any;sv?:any;S?:any;
  showToast?:(msg:string,type?:string)=>void;
  ask?:any;askVision?:any;MicButton?:any;vLang?:string;
}

export default function PulseGovernance({callAI,companyName="Your Company",defaultModule,showToast,askVision}:PulseProps) {
  const [module,setModule]=useState<"dispatch"|"concur"|"email"|"servicenow">((defaultModule as any)||"dispatch");
  const [cfg,setCfg]=useState<Config>(DEFAULT_CONFIG);
  const [showConfig,setShowConfig]=useState(false);
  const [pendingPublish,setPendingPublish]=useState<PublishPayload|null>(null);

  // Vision-capable AI call — uses askVision from App.tsx (same key, same auth)
  // Falls back to text-only callAI if no image (for CSV/Word)
  const callVision = async (prompt: string, imageBase64?: string, imageMime?: string): Promise<string> => {
    if (imageBase64 && askVision) {
      // askVision signature: (systemPrompt, messages, maxTokens, imageBase64, imageMime)
      return askVision("You are a data extraction AI.", [{role:"user",content:prompt}], 4096, imageBase64, imageMime);
    }
    if (callAI) return callAI(prompt);
    throw new Error("AI not connected. Add your API key in Settings.");
  };

  const handlePublish=(payload:PublishPayload)=>{
    setPendingPublish(payload);
    setModule("dispatch");
    const src=payload.module==="concur"?"Concur T&E":payload.module==="email"?"Email Helpdesk":"ServiceNow";
    showToast?.(`Report from ${src} sent to Dispatch Hub`,"success");
  };

  const TABS=[
    {id:"dispatch" as const,label:"Dispatch Hub",ic:"🚀",color:C.accent},
    {id:"concur" as const,label:"Concur T&E",ic:"🧾",color:C.purple},
    {id:"email" as const,label:"Email Helpdesk",ic:"📧",color:C.warn},
    {id:"servicenow" as const,label:"ServiceNow",ic:"🎫",color:C.blue},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text}}>
      {showConfig&&<ConfigPanel cfg={cfg} setCfg={c=>{setCfg(c);showToast?.("Configuration saved","success");}} onClose={()=>setShowConfig(false)}/>}

      <div style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:C.card2,flexShrink:0,flexWrap:"wrap"}}>
        {TABS.map(tab=>(
          <button key={tab.id} onClick={()=>setModule(tab.id)}
            style={{padding:"7px 14px",borderRadius:7,fontSize:11,fontWeight:700,border:`1px solid ${module===tab.id?tab.color:C.border}`,background:module===tab.id?`${tab.color}15`:"transparent",color:module===tab.id?tab.color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}}>
            {tab.ic} {tab.label}
            {tab.id==="dispatch"&&pendingPublish&&<span style={{background:C.purple,color:"#fff",fontSize:8,padding:"1px 5px",borderRadius:8,fontWeight:800}}>1</span>}
          </button>
        ))}
        <button onClick={()=>setShowConfig(true)} title="Configure FTE & SLA thresholds"
          style={{marginLeft:"auto",padding:"6px 10px",borderRadius:6,background:"transparent",border:`1px solid ${C.border}`,color:C.textDim,fontSize:14,cursor:"pointer"}}>⚙</button>
      </div>

      <div style={{flex:1,overflow:"auto"}}>
        {module==="dispatch"&&<DispatchHub callAI={callAI} companyName={companyName} pendingPublish={pendingPublish} onClearPublish={()=>setPendingPublish(null)}/>}
        {module==="concur"&&<ConcurModule cfg={cfg} callAI={callAI} callVision={callVision} companyName={companyName} onPublish={handlePublish}/>}
        {module==="email"&&<EmailModule cfg={cfg} callAI={callAI} callVision={callVision} companyName={companyName} onPublish={handlePublish}/>}
        {module==="servicenow"&&<ServiceNowModule cfg={cfg} callAI={callAI} callVision={callVision} companyName={companyName} onPublish={handlePublish}/>}
      </div>
    </div>
  );
}
