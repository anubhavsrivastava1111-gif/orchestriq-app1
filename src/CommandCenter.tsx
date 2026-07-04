import React, { useMemo } from "react";
import { WorkspaceMemory } from "./lib/WorkspaceMemory";

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND CENTER — the master corporate dashboard. One place showing every
// business activity for the active company, built from live platform data.
// Read-only aggregation: zero AI calls, zero token cost, instant load.
// ═══════════════════════════════════════════════════════════════════════════

const C={bg:"#0B1120",card:"#111827",card2:"#0D1829",border:"#1E2D3D",accent:"#14B8A6",blue:"#3B82F6",purple:"#8B5CF6",warn:"#F59E0B",danger:"#EF4444",success:"#10B981",text:"#E8EFF8",mid:"#94A3B8",dim:"#4D6A8A"};
const num=(n:number)=>n>=1e7?(n/1e7).toFixed(1)+"Cr":n>=1e5?(n/1e5).toFixed(1)+"L":n>=1e3?(n/1e3).toFixed(1)+"K":String(Math.round(n));
const out=(d:any)=>Math.max(0,(Number(d?.amount)||0)-(Number(d?.settled)||0));
const overdue=(d:any)=>{try{return Math.floor((Date.now()-new Date(d.dueDate).getTime())/864e5)>0;}catch{return false;}};

function Tile({ic,label,value,sub,color,onClick}:{ic:string;label:string;value:string|number;sub?:string;color:string;onClick?:()=>void}){
  return(
    <div onClick={onClick} style={{flex:"1 1 150px",minWidth:150,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",cursor:onClick?"pointer":"default",transition:"border-color 0.15s"}}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.borderColor=color;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{width:34,height:34,borderRadius:9,background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{ic}</div>
        <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.dim}}>{label}</div>
      </div>
      <div style={{fontSize:22,fontWeight:800,color:C.text,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:9,color:C.mid,marginTop:5}}>{sub}</div>}
    </div>
  );
}

interface CCProps{
  co:any;curSym:string;
  ledgerEntries:any[];workflows:any[];tQueue:any[];brSessions:any[];
  setView:(v:string)=>void;
}
export default function CommandCenter({co,curSym,ledgerEntries,workflows,tQueue,brSessions,setView}:CCProps){
  const d=useMemo(()=>{
    const g=<T,>(k:string):T[]=>{try{return (WorkspaceMemory.get<T[]>(k)||[]) as T[];}catch{return [];}};
    const decisions=g<any>("cos-decision-history");
    const unfulfilled=g<any>("cos-unfulfilled-log");
    const ap=g<any>("cos-fin-ap");const ar=g<any>("cos-fin-ar");
    const sn=g<any>("cos-pulse-sn");
    const apOut=ap.reduce((s,x)=>s+out(x),0);const arOut=ar.reduce((s,x)=>s+out(x),0);
    const apOver=ap.filter(x=>out(x)>0&&overdue(x)).length;
    const arOver=ar.filter(x=>out(x)>0&&overdue(x)).length;
    const wfDone=(workflows||[]).filter((w:any)=>w?.status==="complete"||w?.status==="approved").length;
    const tqOpen=(tQueue||[]).filter((t:any)=>t?.status!=="complete"&&t?.status!=="done").length;
    const snOpen=sn.filter((t:any)=>String(t?.status||"").toLowerCase()!=="closed"&&String(t?.status||"").toLowerCase()!=="resolved").length;
    return {decisions,unfulfilled,apOut,arOut,apOver,arOver,wfDone,tqOpen,snOpen,apCount:ap.length,arCount:ar.length};
  },[workflows,tQueue,ledgerEntries,brSessions]);

  const MODULES=[
    {v:"nerve",ic:"🧠",n:"Nerve Center",sub:(brSessions||[]).length+" board sessions",c:C.purple},
    {v:"workflow",ic:"⚡",n:"Workflow",sub:(workflows||[]).length+" runs · "+d.wfDone+" complete",c:C.accent},
    {v:"p3",ic:"🤖",n:"Autopilot",sub:"Decision scanning",c:C.blue},
    {v:"ledger",ic:"📒",n:"General Ledger",sub:(ledgerEntries||[]).length+" journal entries",c:C.warn},
    {v:"finance",ic:"🏦",n:"Finance Suite",sub:d.apCount+" bills · "+d.arCount+" invoices",c:C.success},
    {v:"dispatch",ic:"📡",n:"Pulse Governance",sub:d.snOpen+" open tickets",c:C.blue},
    {v:"actions",ic:"✅",n:"Action Tracker",sub:"Cross-module tasks",c:C.accent},
    {v:"studio",ic:"🎨",n:"Studio",sub:"Presentations & media",c:C.purple},
  ];

  const total=d.apOut+d.arOut||1;
  return(
    <div style={{height:"100%",overflowY:"auto",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,padding:"18px 20px"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:4,flexWrap:"wrap"}}>
        <div style={{fontSize:24,fontWeight:900,letterSpacing:"-0.02em"}}>{co?.name||"Your Company"} — Command Center</div>
        <div style={{fontSize:10,color:C.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>Execute · Automate · Analyze · Decide · Deliver</div>
      </div>
      <div style={{fontSize:10.5,color:C.mid,marginBottom:16}}>{co?.industry||""}{co?.stage?" · "+co.stage:""}{co?.location?" · "+co.location:""} — every business activity, one view.</div>

      {/* KPI row */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
        <Tile ic="⚡" label="Workflows" value={(workflows||[]).length} sub={d.wfDone+" completed"} color={C.accent} onClick={()=>setView("workflow")}/>
        <Tile ic="📋" label="Task Queue" value={d.tqOpen} sub="open tasks" color={C.blue} onClick={()=>setView("p3")}/>
        <Tile ic="🏛" label="Board Decisions" value={d.decisions.length} sub="in decision history" color={C.purple} onClick={()=>setView("nerve")}/>
        <Tile ic="📤" label="Payables" value={curSym+num(d.apOut)} sub={d.apOver+" overdue bills"} color={d.apOver>0?C.danger:C.success} onClick={()=>setView("finance")}/>
        <Tile ic="📥" label="Receivables" value={curSym+num(d.arOut)} sub={d.arOver+" overdue invoices"} color={d.arOver>0?C.warn:C.success} onClick={()=>setView("finance")}/>
        <Tile ic="📡" label="Governance" value={d.snOpen} sub="open tickets" color={C.blue} onClick={()=>setView("dispatch")}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,marginBottom:16}}>
        {/* Modules */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12,color:C.text}}>Business Modules</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {MODULES.map(m=>(
              <div key={m.v} onClick={()=>setView(m.v)} style={{display:"flex",gap:9,alignItems:"center",padding:"9px 10px",borderRadius:9,border:`1px solid ${C.border}`,cursor:"pointer",background:C.card2}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=m.c;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}>
                <div style={{width:30,height:30,borderRadius:8,background:m.c+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{m.ic}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:10.5,fontWeight:700,whiteSpace:"nowrap"}}>{m.n}</div>
                  <div style={{fontSize:8.5,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Working capital + decisions */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Working Capital Position</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:4}}>
              <span style={{color:C.warn,fontWeight:700}}>Payables {curSym}{num(d.apOut)}</span>
              <span style={{color:C.success,fontWeight:700}}>Receivables {curSym}{num(d.arOut)}</span>
            </div>
            <div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",background:C.card2}}>
              <div style={{width:(d.apOut/total*100)+"%",background:C.warn}}/>
              <div style={{width:(d.arOut/total*100)+"%",background:C.success}}/>
            </div>
            <div style={{fontSize:9.5,color:C.mid,marginTop:8}}>Net position: <span style={{fontWeight:800,color:d.arOut-d.apOut>=0?C.success:C.danger}}>{curSym}{num(Math.abs(d.arOut-d.apOut))} {d.arOut-d.apOut>=0?"in your favour":"payable"}</span>{(d.apOver+d.arOver)>0?" · "+(d.apOver+d.arOver)+" overdue documents need attention":""}</div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,flex:1}}>
            <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Recent Board Decisions</div>
            {d.decisions.length===0&&<div style={{fontSize:10,color:C.dim}}>No decisions yet — run a Boardroom debate in the Nerve Center.</div>}
            {d.decisions.slice(0,4).map((dec:any,i:number)=>(
              <div key={i} style={{padding:"7px 0",borderBottom:i<Math.min(d.decisions.length,4)-1?`1px solid ${C.border}`:"none"}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(dec.question||"").slice(0,90)}</div>
                <div style={{fontSize:8.5,color:C.dim,marginTop:2}}>{String(dec.ts||"").slice(0,10)}{dec.status?" · "+String(dec.status).slice(0,40):""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI-powered insights row */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Platform Intelligence</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[
            {ic:"🧠",t:d.decisions.length+" decisions in memory",s:"Boardroom references past decisions automatically",c:C.purple},
            {ic:"🔍",t:"Evidence-audited outputs",s:"Facts, estimates and assumptions labeled in every report",c:C.accent},
            {ic:"⚠",t:d.unfulfilled.length+" unfulfilled requests logged",s:"Continuous-improvement backlog",c:d.unfulfilled.length>0?C.warn:C.success},
            {ic:"📈",t:"Charts in every workbook",s:"Auto-derived dashboard visuals",c:C.blue},
          ].map((x,i)=>(
            <div key={i} style={{flex:"1 1 200px",display:"flex",gap:9,alignItems:"flex-start",padding:"10px 11px",borderRadius:9,background:C.card2,border:`1px solid ${C.border}`}}>
              <div style={{width:28,height:28,borderRadius:7,background:x.c+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{x.ic}</div>
              <div><div style={{fontSize:10,fontWeight:700}}>{x.t}</div><div style={{fontSize:8.5,color:C.dim,marginTop:2}}>{x.s}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{textAlign:"center",padding:"11px",background:"linear-gradient(90deg,#1E1B4B,#312E81)",borderRadius:10,fontSize:11,fontWeight:800,letterSpacing:"0.03em"}}>
        {co?.name||"OrchestrIQ"} — Powering Intelligent Business Execution
      </div>
    </div>
  );
}
