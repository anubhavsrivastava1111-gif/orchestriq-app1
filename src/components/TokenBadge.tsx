import { useState, useEffect, useCallback } from "react";
import { loadRecords, estimateCost, type TokenRecord } from "../TokenAnalytics";

function fmt(n: number): string {
  return n >= 1_000_000 ? (n/1_000_000).toFixed(1)+"M" : n >= 1_000 ? (n/1_000).toFixed(1)+"K" : String(n);
}
function fmtCost(c: number): string {
  if(c===0)return "Free";
  if(c<0.001)return "<$0.001";
  return "$"+c.toFixed(3);
}

const MODELS: Record<string,{label:string;inputPer1M:number;outputPer1M:number;provider:string}[]> = {
  claude:[
    {label:"Claude Haiku",inputPer1M:0.25,outputPer1M:1.25,provider:"claude"},
    {label:"Claude Sonnet",inputPer1M:3,outputPer1M:15,provider:"claude"},
    {label:"Claude Opus",inputPer1M:15,outputPer1M:75,provider:"claude"},
  ],
  gemini:[
    {label:"Gemini 2.0 Flash",inputPer1M:0,outputPer1M:0,provider:"gemini"},
    {label:"Gemini 1.5 Pro",inputPer1M:1.25,outputPer1M:5,provider:"gemini"},
  ],
  groq:[
    {label:"Groq Llama 3.3 70B",inputPer1M:0,outputPer1M:0,provider:"groq"},
  ],
  openai:[
    {label:"GPT-4o",inputPer1M:2.5,outputPer1M:10,provider:"openai"},
    {label:"GPT-4o Mini",inputPer1M:0.15,outputPer1M:0.6,provider:"openai"},
  ],
};

export default function TokenBadge({defP,setDefP,keys}:{defP:string;setDefP:(p:string)=>void;keys:Record<string,string>}) {
  const [open,setOpen]=useState(false);
  const [records,setRecords]=useState<TokenRecord[]>([]);

  const reload=useCallback(()=>setRecords(loadRecords()),[]);

  useEffect(()=>{
    reload();
    window.addEventListener("oiq-token-update",reload);
    return()=>window.removeEventListener("oiq-token-update",reload);
  },[reload]);

  const totalIn=records.reduce((s,r)=>s+r.inputTokens,0);
  const totalOut=records.reduce((s,r)=>s+r.outputTokens,0);
  const totalCost=records.reduce((s,r)=>s+r.costUsd,0);
  const totalTok=totalIn+totalOut;

  const activeKeys=Object.keys(keys).filter(k=>keys[k]?.trim());

  return(
    <>
      {/* BADGE */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{position:"fixed",bottom:20,right:20,zIndex:9000,background:open?"#14B8A6":"#0F1829",border:"1px solid "+(open?"#14B8A6":"#1C2A40"),borderRadius:24,padding:"7px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:"'Inter',-apple-system,sans-serif",boxShadow:"0 4px 20px rgba(0,0,0,0.5)",transition:"all 0.2s"}}>
        <span style={{fontSize:14}}>🔢</span>
        <span style={{fontSize:11,fontWeight:700,color:open?"#0a0e1a":"#F0F4FF"}}>{fmt(totalTok)} tokens</span>
        {totalCost>0&&<span style={{fontSize:10,color:open?"#0a0e1a":"#14B8A6",fontWeight:600}}>{fmtCost(totalCost)}</span>}
      </button>

      {/* PANEL */}
      {open&&(
        <div style={{position:"fixed",bottom:64,right:20,zIndex:9001,width:320,background:"#0F1829",border:"1px solid #1C2A40",borderRadius:12,padding:16,fontFamily:"'Inter',-apple-system,sans-serif",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>

          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#F0F4FF"}}>🔢 Session Token Usage</div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",color:"#4D6A8A",fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
          </div>

          {/* Metrics */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[["Total",fmt(totalTok),"#F0F4FF"],["Input ↑",fmt(totalIn),"#3B82F6"],["Output ↓",fmt(totalOut),"#14B8A6"]].map(([lb,val,c])=>(
              <div key={lb} style={{background:"#141F33",borderRadius:7,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#4D6A8A",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>{lb}</div>
                <div style={{fontSize:16,fontWeight:800,color:c}}>{val}</div>
              </div>
            ))}
          </div>

          {/* Cost */}
          <div style={{background:totalCost===0?"rgba(16,185,129,0.08)":"rgba(20,184,166,0.08)",border:"1px solid "+(totalCost===0?"rgba(16,185,129,0.2)":"rgba(20,184,166,0.2)"),borderRadius:7,padding:"10px 12px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"#8FA8CC"}}>Estimated cost this session</span>
            <span style={{fontSize:16,fontWeight:800,color:totalCost===0?"#10B981":"#14B8A6"}}>{fmtCost(totalCost)}</span>
          </div>

          {/* Model switcher */}
          <div style={{marginBottom:6}}>
            <div style={{fontSize:10,fontWeight:700,color:"#4D6A8A",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Switch model</div>
            {Object.entries(MODELS).map(([provKey,models])=>{
              const hasKey=!!keys[provKey]?.trim()||provKey==="groq"||provKey==="gemini";
              if(!hasKey)return null;
              return(
                <div key={provKey} style={{marginBottom:6}}>
                  <div style={{fontSize:9,color:"#4D6A8A",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{provKey}</div>
                  {models.map(m=>{
                    const isActive=defP===provKey;
                    return(
                      <button key={m.label} onClick={()=>{setDefP(provKey);setOpen(false);}}
                        style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",marginBottom:3,borderRadius:6,border:"1px solid "+(isActive?"#14B8A644":"#1C2A40"),background:isActive?"rgba(20,184,166,0.08)":"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                        <span style={{fontSize:11,color:isActive?"#14B8A6":"#8FA8CC",fontWeight:isActive?700:400}}>{m.label}{isActive?" ✓":""}</span>
                        <span style={{fontSize:10,color:m.inputPer1M===0?"#10B981":"#4D6A8A"}}>{m.inputPer1M===0?"Free":"$"+m.inputPer1M+"/1M"}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {records.length===0&&(
            <div style={{fontSize:10,color:"#2D4460",textAlign:"center",paddingTop:8}}>Use any AI feature to start tracking</div>
          )}
        </div>
      )}
    </>
  );
}
