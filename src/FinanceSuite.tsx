import React, { useState, useMemo, useCallback, useEffect } from "react";
import { WorkspaceMemory } from "./lib/WorkspaceMemory";
import { classifyEvidence } from "./lib/IntelligenceEngine";

// ═══════════════════════════════════════════════════════════════════════════
// FINANCE SUITE — Phase 1: AP & AR Analytics (SAP-style subledger registers)
// Tabs: Accounts Payable | Accounts Receivable | (Inventory & Fixed Assets — Phase 2)
// Data source: lightweight bill/invoice registers persisted via WorkspaceMemory.
// Phase 2 will auto-post these to the General Ledger (subledger integration).
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  bg:"#0B1120",card:"#111827",card2:"#0D1829",border:"#1E2D3D",
  accent:"#14B8A6",accentDim:"rgba(20,184,166,0.10)",
  blue:"#3B82F6",blueDim:"rgba(59,130,246,0.10)",
  purple:"#8B5CF6",warn:"#F59E0B",warnDim:"rgba(245,158,11,0.10)",
  danger:"#EF4444",dangerDim:"rgba(239,68,68,0.10)",
  success:"#10B981",successDim:"rgba(16,185,129,0.10)",
  text:"#E8EFF8",textMid:"#94A3B8",textDim:"#4D6A8A",
};

export interface FinDoc {
  id:string; docNo:string; party:string;
  date:string; dueDate:string;
  amount:number; settled:number;
  category:string; notes:string;
}

const uid=()=>Math.random().toString(36).slice(2,10);
const today=()=>new Date().toISOString().slice(0,10);
const daysBetween=(a:string,b:string=today())=>{
  if(!a)return 0;
  const d=Math.floor((new Date(b).getTime()-new Date(a).getTime())/864e5);
  return isNaN(d)?0:d;
};
const fmtMoney=(sym:string,n:number)=>sym+(Math.round(n)).toLocaleString("en-IN");

function usePersistedState<T>(key:string,initial:T):[T,React.Dispatch<React.SetStateAction<T>>]{
  const [state,setState]=useState<T>(()=>{try{const s=WorkspaceMemory.get<T>(key);return (s!==null&&s!==undefined)?s:initial;}catch{return initial;}});
  useEffect(()=>{try{WorkspaceMemory.set(key,state);}catch{}},[key,state]);
  return [state,setState];
}
function loadScriptOnce(src:string):Promise<void>{
  return new Promise((res,rej)=>{
    if((window as any).XLSX)return res();
    src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    const ex=document.querySelector('script[src="'+src+'"]');
    if(ex){ex.addEventListener("load",()=>res());return;}
    const s=document.createElement("script");s.src=src;s.onload=()=>res();s.onerror=()=>rej(new Error("Excel library failed to load"));document.head.appendChild(s);
  });
}
async function downloadExcel(filename:string,sheetName:string,data:Record<string,unknown>[]):Promise<void>{
  if(!data.length)return;
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const X=(window as any).XLSX;
  if(!X)throw new Error("Excel library unavailable");
  const ws=X.utils.json_to_sheet(data);
  const wb=X.utils.book_new();
  X.utils.book_append_sheet(wb,ws,sheetName.slice(0,31));
  X.writeFile(wb,filename);
}
function evidenceAuditLine(text:string):string{
  try{
    const tags=classifyEvidence(text||"");
    if(!tags.length)return "";
    const cnt:{[k:string]:number}={};tags.forEach(t=>{cnt[t.category]=(cnt[t.category]||0)+1;});
    return "\n\n---\nEvidence audit (Intelligence Engine): "+Object.entries(cnt).map(([k,v])=>v+" "+k).join(" · ");
  }catch{return "";}
}
const AI_EVIDENCE_RULES="\n\nEVIDENCE RULES: Label every figure-based finding [Calculation] (derived from the register data above — show the formula) and every forward-looking claim [Assumption] or [Expert Inference]. Never present an invented number as fact.";

// ─── AGING ───────────────────────────────────────────────────────────────────
type AgeBucket="current"|"d1_30"|"d31_60"|"d61_90"|"over90";
const BUCKET_LABELS:[AgeBucket,string][]=[["current","Current"],["d1_30","1–30d"],["d31_60","31–60d"],["d61_90","61–90d"],["over90",">90d"]];
function ageBucket(dueDate:string):AgeBucket{
  const overdue=daysBetween(dueDate);
  if(overdue<=0)return "current";
  if(overdue<=30)return "d1_30";
  if(overdue<=60)return "d31_60";
  if(overdue<=90)return "d61_90";
  return "over90";
}
function outstanding(d:FinDoc):number{return Math.max(0,(d.amount||0)-(d.settled||0));}
function docStatus(d:FinDoc):"paid"|"partial"|"open"{
  const o=outstanding(d);
  if(o<=0&&(d.amount||0)>0)return "paid";
  if((d.settled||0)>0)return "partial";
  return "open";
}

// ─── SHARED UI ───────────────────────────────────────────────────────────────
function Cell({value,onChange,type="text",width}:{value:string|number;onChange:(v:string)=>void;type?:string;width?:number}){
  return <input type={type} value={String(value??"")} onChange={e=>onChange(e.target.value)}
    style={{background:"transparent",border:"1px solid transparent",borderRadius:4,color:"inherit",fontSize:11,padding:"3px 4px",width:width||(type==="date"?110:90),outline:"none",fontFamily:"inherit"}}
    onFocus={e=>{e.currentTarget.style.border="1px solid "+C.accent;e.currentTarget.style.background=C.card2;}}
    onBlur={e=>{e.currentTarget.style.border="1px solid transparent";e.currentTarget.style.background="transparent";}}/>;
}
function KpiTile({label,value,sub,rag}:{label:string;value:string|number;sub?:string;rag?:"green"|"amber"|"red"}){
  const col=rag==="green"?C.success:rag==="red"?C.danger:rag==="amber"?C.warn:C.text;
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",minWidth:140,flex:"1 1 140px"}}>
      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textDim,marginBottom:5}}>{label}</div>
      <div style={{fontSize:19,fontWeight:800,color:col,lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{fontSize:9,color:C.textMid,marginTop:4}}>{sub}</div>}
    </div>
  );
}

// ─── REGISTER MODULE (shared engine for AP and AR) ──────────────────────────
function RegisterModule({mode,curSym,ask,showToast}:{mode:"ap"|"ar";curSym:string;ask?:(sys:string,msgs:{role:string;content:string}[],maxT:number)=>Promise<string>;showToast?:(m:string,t?:string)=>void}){
  const isAP=mode==="ap";
  const partyLabel=isAP?"Vendor":"Customer";
  const docLabel=isAP?"Bill":"Invoice";
  const storageKey=isAP?"cos-fin-ap":"cos-fin-ar";
  const [docs,setDocs]=usePersistedState<FinDoc[]>(storageKey,[]);
  const [view,setView]=useState<"dashboard"|"register"|"ai">("dashboard");
  const [aiReport,setAiReport]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [filter,setFilter]=useState<"all"|"open"|"overdue">("all");

  const addDoc=()=>setDocs(d=>[...d,{id:uid(),docNo:(isAP?"BILL-":"INV-")+String(d.length+1).padStart(4,"0"),party:"",date:today(),dueDate:today(),amount:0,settled:0,category:"",notes:""}]);
  const upd=useCallback((id:string,field:keyof FinDoc,val:string)=>{
    setDocs(prev=>prev.map(d=>{
      if(d.id!==id)return d;
      const numeric=field==="amount"||field==="settled";
      return {...d,[field]:numeric?(parseFloat(val)||0):val} as FinDoc;
    }));
  },[setDocs]);

  const metrics=useMemo(()=>{
    const open=docs.filter(d=>docStatus(d)!=="paid");
    const totalOut=open.reduce((s,d)=>s+outstanding(d),0);
    const overdueDocs=open.filter(d=>daysBetween(d.dueDate)>0);
    const overdueAmt=overdueDocs.reduce((s,d)=>s+outstanding(d),0);
    const aging:Record<AgeBucket,number>={current:0,d1_30:0,d31_60:0,d61_90:0,over90:0};
    open.forEach(d=>{aging[ageBucket(d.dueDate)]+=outstanding(d);});
    // Weighted average age of outstanding (proxy for DSO/DPO on open items)
    const wAge=totalOut>0?open.reduce((s,d)=>s+outstanding(d)*Math.max(0,daysBetween(d.date)),0)/totalOut:0;
    const byParty:Record<string,{out:number;overdue:number;count:number}>={};
    open.forEach(d=>{
      const p=d.party||"Unassigned";
      if(!byParty[p])byParty[p]={out:0,overdue:0,count:0};
      byParty[p].out+=outstanding(d);byParty[p].count++;
      if(daysBetween(d.dueDate)>0)byParty[p].overdue+=outstanding(d);
    });
    const topParties=Object.entries(byParty).sort((a,b)=>b[1].out-a[1].out).slice(0,8);
    return {openCount:open.length,totalOut,overdueAmt,overdueCount:overdueDocs.length,aging,wAge,topParties,totalBilled:docs.reduce((s,d)=>s+(d.amount||0),0),totalSettled:docs.reduce((s,d)=>s+(d.settled||0),0)};
  },[docs]);

  const visible=useMemo(()=>{
    if(filter==="open")return docs.filter(d=>docStatus(d)!=="paid");
    if(filter==="overdue")return docs.filter(d=>docStatus(d)!=="paid"&&daysBetween(d.dueDate)>0);
    return docs;
  },[docs,filter]);

  const exportExcel=()=>{
    downloadExcel(
      (isAP?"Accounts_Payable_":"Accounts_Receivable_")+today()+".xlsx",
      isAP?"AP Register":"AR Register",
      docs.map(({id,...d})=>({...d,outstanding:outstanding(d as FinDoc),status:docStatus(d as FinDoc),daysOverdue:Math.max(0,daysBetween(d.dueDate)),agingBucket:BUCKET_LABELS.find(([b])=>b===ageBucket(d.dueDate))?.[1]||""}))
    ).catch(()=>showToast?.("Excel export failed — check connection","error"));
  };

  const generateReport=async()=>{
    if(!ask||!docs.length)return;
    setAiLoading(true);
    const m=metrics;
    const agingStr=BUCKET_LABELS.map(([b,l])=>l+": "+fmtMoney(curSym,m.aging[b])).join(" | ");
    const partyStr=m.topParties.map(([p,v])=>p+": "+fmtMoney(curSym,v.out)+" ("+v.count+" "+docLabel.toLowerCase()+"s, overdue "+fmtMoney(curSym,v.overdue)+")").join("\n");
    const roleTxt=isAP
      ?"You are a Working Capital & Accounts Payable analyst. Focus on payment prioritisation, cash preservation, early-payment discounts vs holding cash, and vendor risk."
      :"You are a Credit Control & Accounts Receivable analyst. Focus on collection prioritisation, credit risk by customer, cash acceleration, and bad-debt exposure.";
    try{
      const rep=await ask(roleTxt,
        [{role:"user",content:"LIVE "+(isAP?"AP":"AR")+" REGISTER DATA (all figures "+curSym+"):\n- Open "+docLabel.toLowerCase()+"s: "+m.openCount+" | Total outstanding: "+fmtMoney(curSym,m.totalOut)+"\n- Overdue: "+fmtMoney(curSym,m.overdueAmt)+" across "+m.overdueCount+" documents\n- Aging: "+agingStr+"\n- Weighted avg age of outstanding: "+m.wAge.toFixed(0)+" days\n- Exposure by "+partyLabel.toLowerCase()+":\n"+partyStr+"\n\nPRODUCE:\n1. EXECUTIVE SUMMARY (3 sentences with specific numbers)\n2. AGING RISK TABLE — which buckets and parties need action\n3. "+(isAP?"PAYMENT PRIORITISATION — what to pay first and why":"COLLECTION PRIORITISATION — who to chase first and why")+"\n4. CASH FLOW IMPACT — next 30/60/90 days\n5. TOP 3 ACTION ITEMS with owner and deadline\n6. RISK FLAGS"+AI_EVIDENCE_RULES}],3000);
      setAiReport(rep+evidenceAuditLine(rep));
    }catch(e:any){setAiReport("Error: "+e.message);}
    setAiLoading(false);
  };

  const TH:React.CSSProperties={padding:"7px 8px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",color:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0};
  const TD:React.CSSProperties={padding:"4px 8px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.text,verticalAlign:"middle"};
  const statusPill=(s:"paid"|"partial"|"open",overdue:boolean)=>{
    const col=s==="paid"?C.success:overdue?C.danger:s==="partial"?C.warn:C.blue;
    const bg=s==="paid"?C.successDim:overdue?C.dangerDim:s==="partial"?C.warnDim:C.blueDim;
    return <span style={{fontSize:9,fontWeight:800,color:col,background:bg,padding:"2px 8px",borderRadius:10,textTransform:"uppercase"}}>{s==="paid"?"Paid":overdue?"Overdue":s==="partial"?"Partial":"Open"}</span>;
  };

  return (
    <div style={{padding:16,height:"100%",overflowY:"auto"}}>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {(["dashboard","register","ai"] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"6px 14px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${view===v?C.accent:C.border}`,background:view===v?C.accentDim:"transparent",color:view===v?C.accent:C.textMid,cursor:"pointer"}}>
            {v==="dashboard"?"📊 Dashboard":v==="register"?("📋 "+docLabel+" Register"):"🤖 AI Analysis"}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          <button onClick={exportExcel} disabled={!docs.length} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.success}44`,background:C.successDim,color:C.success,cursor:docs.length?"pointer":"not-allowed",opacity:docs.length?1:0.4}}>⬇ Excel</button>
          <button onClick={addDoc} style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,border:`1px solid ${C.accent}44`,background:C.accentDim,color:C.accent,cursor:"pointer"}}>＋ {docLabel}</button>
        </div>
      </div>

      {view==="dashboard"&&(
        <>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
            <KpiTile label={"Total Outstanding"} value={fmtMoney(curSym,metrics.totalOut)} sub={metrics.openCount+" open "+docLabel.toLowerCase()+"s"}/>
            <KpiTile label="Overdue" value={fmtMoney(curSym,metrics.overdueAmt)} sub={metrics.overdueCount+" documents"} rag={metrics.overdueAmt>0?"red":"green"}/>
            <KpiTile label={isAP?"Avg Age (DPO proxy)":"Avg Age (DSO proxy)"} value={metrics.wAge.toFixed(0)+"d"} sub="Weighted by outstanding" rag={metrics.wAge>60?"red":metrics.wAge>30?"amber":"green"}/>
            <KpiTile label=">90d Bucket" value={fmtMoney(curSym,metrics.aging.over90)} sub="Escalate immediately" rag={metrics.aging.over90>0?"red":"green"}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:16}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Aging Analysis (outstanding {curSym})</div>
              {BUCKET_LABELS.map(([b,l])=>{
                const v=metrics.aging[b];
                const pct=metrics.totalOut>0?v/metrics.totalOut:0;
                const col=b==="current"?C.success:b==="d1_30"?C.blue:b==="d31_60"?C.warn:C.danger;
                return (
                  <div key={b} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                      <span style={{color:C.textMid,fontWeight:600}}>{l}</span>
                      <span style={{color:col,fontWeight:700}}>{fmtMoney(curSym,v)} ({(pct*100).toFixed(0)}%)</span>
                    </div>
                    <div style={{height:6,background:C.card2,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:(pct*100)+"%",background:col,borderRadius:3,transition:"width 0.3s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Exposure by {partyLabel}</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{[partyLabel,"Outstanding","Overdue","Docs"].map(h=><th key={h} style={{...TH,position:"static"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {metrics.topParties.length===0&&<tr><td colSpan={4} style={{...TD,color:C.textDim,textAlign:"center",padding:16}}>No open {docLabel.toLowerCase()}s yet — add one in the Register tab</td></tr>}
                  {metrics.topParties.map(([p,v])=>(
                    <tr key={p}>
                      <td style={{...TD,fontWeight:600}}>{p}</td>
                      <td style={TD}>{fmtMoney(curSym,v.out)}</td>
                      <td style={{...TD,color:v.overdue>0?C.danger:C.textDim,fontWeight:v.overdue>0?700:400}}>{fmtMoney(curSym,v.overdue)}</td>
                      <td style={TD}>{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view==="register"&&(
        <>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {(["all","open","overdue"] as const).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:"4px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:`1px solid ${filter===f?C.blue:C.border}`,background:filter===f?C.blueDim:"transparent",color:filter===f?C.blue:C.textDim,cursor:"pointer",textTransform:"capitalize"}}>{f}</button>
            ))}
            <span style={{marginLeft:"auto",fontSize:10,color:C.textDim,alignSelf:"center"}}>{visible.length} of {docs.length} shown · auto-saved</span>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"auto",maxHeight:"62vh"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead><tr>{[docLabel+" #",partyLabel,"Date","Due Date","Amount","Settled","Outstanding","Days Overdue","Status","Category","Notes",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {visible.map(d=>{
                  const out=outstanding(d);const st=docStatus(d);const od=Math.max(0,daysBetween(d.dueDate));
                  return (
                    <tr key={d.id} style={{background:st!=="paid"&&od>90?C.dangerDim:st!=="paid"&&od>30?"rgba(249,115,22,0.06)":"transparent"}}>
                      <td style={TD}><Cell value={d.docNo} onChange={v=>upd(d.id,"docNo",v)} width={90}/></td>
                      <td style={TD}><Cell value={d.party} onChange={v=>upd(d.id,"party",v)} width={120}/></td>
                      <td style={TD}><Cell value={d.date} onChange={v=>upd(d.id,"date",v)} type="date"/></td>
                      <td style={TD}><Cell value={d.dueDate} onChange={v=>upd(d.id,"dueDate",v)} type="date"/></td>
                      <td style={TD}><Cell value={d.amount} onChange={v=>upd(d.id,"amount",v)} width={80}/></td>
                      <td style={TD}><Cell value={d.settled} onChange={v=>upd(d.id,"settled",v)} width={80}/></td>
                      <td style={{...TD,fontWeight:700,color:out>0?C.text:C.textDim}}>{fmtMoney(curSym,out)}</td>
                      <td style={{...TD,fontWeight:700,color:st==="paid"?C.textDim:od>90?C.danger:od>30?C.warn:od>0?C.warn:C.success}}>{st==="paid"?"—":od+"d"}</td>
                      <td style={TD}>{statusPill(st,st!=="paid"&&od>0)}</td>
                      <td style={TD}><Cell value={d.category} onChange={v=>upd(d.id,"category",v)} width={90}/></td>
                      <td style={TD}><Cell value={d.notes} onChange={v=>upd(d.id,"notes",v)} width={130}/></td>
                      <td style={TD}><button onClick={()=>setDocs(p=>p.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:14}}>×</button></td>
                    </tr>
                  );
                })}
                {visible.length===0&&<tr><td colSpan={12} style={{...TD,color:C.textDim,textAlign:"center",padding:24}}>No {docLabel.toLowerCase()}s — click ＋ {docLabel} to add the first one</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view==="ai"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={generateReport} disabled={aiLoading||!docs.length} style={{padding:"8px 16px",borderRadius:6,background:C.blue,color:"#fff",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",opacity:aiLoading||!docs.length?0.4:1}}>
              {aiLoading?"⏳ Analysing...":"🤖 Generate "+(isAP?"Payables":"Receivables")+" Report"}
            </button>
          </div>
          {aiReport&&<div style={{background:C.card2,border:`1px solid ${C.blue}33`,borderRadius:8,padding:16,fontSize:12,lineHeight:1.8,color:C.text,whiteSpace:"pre-wrap",maxHeight:520,overflowY:"auto"}}>{aiReport}</div>}
        </>
      )}
    </div>
  );
}

// ─── MAIN SHELL ──────────────────────────────────────────────────────────────
interface FinanceSuiteProps{
  curSym:string;
  ask?:(sys:string,msgs:{role:string;content:string}[],maxT:number)=>Promise<string>;
  showToast?:(m:string,t?:string)=>void;
}
export default function FinanceSuite({curSym,ask,showToast}:FinanceSuiteProps){
  const [tab,setTab]=useState<"ap"|"ar">("ap");
  const TABS=[
    {id:"ap" as const,label:"Accounts Payable",ic:"📤",live:true},
    {id:"ar" as const,label:"Accounts Receivable",ic:"📥",live:true},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text}}>
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:C.card2,flexShrink:0,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"7px 14px",borderRadius:7,fontSize:11,fontWeight:700,border:`1px solid ${tab===t.id?C.accent:C.border}`,background:tab===t.id?C.accentDim:"transparent",color:tab===t.id?C.accent:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            {t.ic} {t.label}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:C.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Inventory · Fixed Assets — Phase 2</span>
      </div>
      <div style={{flex:1,overflow:"auto"}}>
        {tab==="ap"&&<RegisterModule mode="ap" curSym={curSym} ask={ask} showToast={showToast}/>}
        {tab==="ar"&&<RegisterModule mode="ar" curSym={curSym} ask={ask} showToast={showToast}/>}
      </div>
    </div>
  );
}
