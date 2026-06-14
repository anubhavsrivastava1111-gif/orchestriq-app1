import { useState } from "react";

export interface ActionItem{
  id:number;
  text:string;
  source:"boardroom"|"autopilot"|"timemachine"|"workflow"|"manual";
  sourceLabel:string;
  ownerRoleId:string|null;
  status:"not_started"|"in_progress"|"done";
  priority:"high"|"medium"|"low";
  createdAt:string;
  dueHint:string|null;
  notes:string;
}

export interface ExtractedItem{
  text:string;
  ownerRoleId:string|null;
  priority:"high"|"medium"|"low";
  dueHint:string|null;
  selected:boolean;
}

interface ActionTrackerProps{
  items:ActionItem[];
  setItems:(items:ActionItem[])=>void;
  sv:(k:string,v:any)=>void;
  S:any;
  showToast:(m:string,t?:string)=>void;
  AR:any[]; // all roles, for owner lookup/display
}

const PRIORITY_COLORS:Record<string,string>={high:"#EF4444",medium:"#F59E0B",low:"#10B981"};
const SOURCE_LABELS:Record<string,string>={boardroom:"🏛️ Boardroom",autopilot:"🤖 Autopilot",timemachine:"⏳ Time Machine",workflow:"⚡ Workflow",manual:"✍️ Manual"};
const COLUMNS:{id:ActionItem["status"];label:string;color:string}[]=[
  {id:"not_started",label:"Not Started",color:"#5A6480"},
  {id:"in_progress",label:"In Progress",color:"#3B82F6"},
  {id:"done",label:"Done",color:"#10B981"},
];

export default function ActionTracker({items,setItems,sv,S,showToast,AR}:ActionTrackerProps){
  const [filterOwner,setFilterOwner]=useState<string>("all");
  const [filterPriority,setFilterPriority]=useState<string>("all");
  const [newText,setNewText]=useState("");
  const [showAdd,setShowAdd]=useState(false);

  const owners=Array.from(new Set(items.map(i=>i.ownerRoleId).filter(Boolean))) as string[];

  const filtered=items.filter(i=>
    (filterOwner==="all"||i.ownerRoleId===filterOwner)&&
    (filterPriority==="all"||i.priority===filterPriority)
  );

  const advance=(id:number,newStatus:ActionItem["status"])=>{
    const updated=items.map(i=>i.id===id?{...i,status:newStatus}:i);
    setItems(updated);sv("cos-actions",updated);
  };

  const deleteItem=(id:number)=>{
    const updated=items.filter(i=>i.id!==id);
    setItems(updated);sv("cos-actions",updated);
    showToast("Action item removed","info");
  };

  const addManual=()=>{
    if(!newText.trim())return;
    const item:ActionItem={
      id:Date.now(),text:newText.trim(),source:"manual",sourceLabel:"Manually added",
      ownerRoleId:null,status:"not_started",priority:"medium",createdAt:new Date().toISOString(),dueHint:null,notes:"",
    };
    const updated=[item,...items];
    setItems(updated);sv("cos-actions",updated);
    setNewText("");setShowAdd(false);
    showToast("Action item added","success");
  };

  const getRole=(roleId:string|null)=>roleId?AR.find(r=>r.id===roleId):null;

  return(
    <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
      <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Action Tracker</h2>
      <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Action items extracted from Boardroom, Autopilot, and Time Machine - track what's been decided and what's actually getting done.</p>

      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <select style={{...S.inp,width:"auto",padding:"6px 8px",fontSize:10}} value={filterOwner} onChange={e=>setFilterOwner(e.target.value)}>
          <option value="all" style={{background:"#0a0e1a"}}>All Owners</option>
          {owners.map(o=>{const r=getRole(o);return <option key={o} value={o} style={{background:"#0a0e1a"}}>{r?r.ic+" "+r.t:o}</option>;})}
        </select>
        <select style={{...S.inp,width:"auto",padding:"6px 8px",fontSize:10}} value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>
          <option value="all" style={{background:"#0a0e1a"}}>All Priorities</option>
          <option value="high" style={{background:"#0a0e1a"}}>High</option>
          <option value="medium" style={{background:"#0a0e1a"}}>Medium</option>
          <option value="low" style={{background:"#0a0e1a"}}>Low</option>
        </select>
        <button onClick={()=>setShowAdd(!showAdd)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633",marginLeft:"auto"}}>+ Add Manually</button>
      </div>

      {showAdd&&(
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          <input style={{...S.inp,flex:1}} value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Describe the action item..." onKeyDown={e=>e.key==="Enter"&&addManual()}/>
          <button onClick={addManual} disabled={!newText.trim()} style={{...S.pBtn,marginTop:0,width:"auto",padding:"9px 16px",opacity:newText.trim()?1:0.4}}>Add</button>
        </div>
      )}

      {!items.length?(
        <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"16px",textAlign:"center"}}>
          <div style={{fontSize:12,color:"#A0AAC0",lineHeight:1.7}}>
            No action items yet. Run a Boardroom session, Autopilot scan, or Time Machine simulation, then click "Extract Action Items" on the result to populate this tracker - or add items manually above.
          </div>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {COLUMNS.map(col=>{
            const colItems=filtered.filter(i=>i.status===col.id);
            return(
              <div key={col.id}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,padding:"6px 8px",background:col.color+"10",borderRadius:6,border:"1px solid "+col.color+"33"}}>
                  <span style={{fontSize:11,fontWeight:700,color:col.color}}>{col.label}</span>
                  <span style={{fontSize:10,color:"#5A6480",marginLeft:"auto"}}>{colItems.length}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,minHeight:60}}>
                  {colItems.map(item=>{
                    const role=getRole(item.ownerRoleId);
                    return(
                      <div key={item.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"9px 10px"}}>
                        <div style={{fontSize:11,color:"#F1F5F9",lineHeight:1.5,marginBottom:6}}>{item.text}</div>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:6}}>
                          <span style={{fontSize:8,fontWeight:700,color:PRIORITY_COLORS[item.priority],background:PRIORITY_COLORS[item.priority]+"15",padding:"2px 6px",borderRadius:8,textTransform:"uppercase"}}>{item.priority}</span>
                          {role&&<span style={{fontSize:9,color:role.dc,background:role.dc+"12",padding:"2px 6px",borderRadius:8}}>{role.ic} {role.t}</span>}
                          {item.dueHint&&<span style={{fontSize:8,color:"#5A6480"}}>{item.dueHint}</span>}
                        </div>
                        <div style={{fontSize:8,color:"#3A4060",marginBottom:6}}>{SOURCE_LABELS[item.source]} · {item.sourceLabel}</div>
                        <div style={{display:"flex",gap:4}}>
                          {COLUMNS.filter(c=>c.id!==col.id).map(c=>(
                            <button key={c.id} onClick={()=>advance(item.id,c.id)} style={{...S.hBtn,fontSize:8,padding:"2px 6px",color:c.color,borderColor:c.color+"33"}}>→ {c.label}</button>
                          ))}
                          <button onClick={()=>deleteItem(item.id)} style={{...S.hBtn,fontSize:8,padding:"2px 6px",color:"#EF4444",borderColor:"#EF444433",marginLeft:"auto"}}>×</button>
                        </div>
                      </div>
                    );
                  })}
                  {!colItems.length&&<div style={{fontSize:10,color:"#3A4060",textAlign:"center",padding:"16px 0"}}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── EXTRACTION REVIEW MODAL ─────────────────────────────────────────────────
// Shown after AI extracts candidate action items from a Boardroom/Autopilot/TimeMachine result.
// User reviews, deselects unwanted items, then confirms to add to the tracker.
export function ExtractReviewModal({
  extracted,sourceType,sourceLabel,onConfirm,onCancel,AR,S
}:{
  extracted:ExtractedItem[];
  sourceType:ActionItem["source"];
  sourceLabel:string;
  onConfirm:(items:ActionItem[])=>void;
  onCancel:()=>void;
  AR:any[];
  S:any;
}){
  const [items,setItems]=useState(extracted);

  const toggle=(i:number)=>setItems(prev=>prev.map((it,idx)=>idx===i?{...it,selected:!it.selected}:it));

  const confirm=()=>{
    const toAdd:ActionItem[]=items.filter(i=>i.selected).map(i=>({
      id:Date.now()+Math.random(),
      text:i.text,
      source:sourceType,
      sourceLabel,
      ownerRoleId:i.ownerRoleId,
      status:"not_started",
      priority:i.priority,
      createdAt:new Date().toISOString(),
      dueHint:i.dueHint,
      notes:"",
    }));
    onConfirm(toAdd);
  };

  return(
    <div style={S.modalBg} onClick={onCancel}>
      <div style={{...S.modal,maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9"}}>Review Action Items</h2>
          <button onClick={onCancel} style={S.iBtn}>×</button>
        </div>
        <p style={{fontSize:11,color:"#8892B0",marginBottom:12,lineHeight:1.6}}>The AI suggests these action items from this session. Uncheck any you don't want, then add the rest to your tracker.</p>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14,maxHeight:320,overflowY:"auto"}}>
          {items.map((item,i)=>{
            const role=item.ownerRoleId?AR.find(r=>r.id===item.ownerRoleId):null;
            return(
              <label key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",background:item.selected?"#131825":"#0a0e1a",border:"1px solid "+(item.selected?"#14B8A633":"#1a2030"),borderRadius:6,cursor:"pointer"}}>
                <input type="checkbox" checked={item.selected} onChange={()=>toggle(i)} style={{accentColor:"#14B8A6",marginTop:2}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:"#F1F5F9",lineHeight:1.5,marginBottom:4}}>{item.text}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:8,fontWeight:700,color:PRIORITY_COLORS[item.priority],background:PRIORITY_COLORS[item.priority]+"15",padding:"2px 6px",borderRadius:8,textTransform:"uppercase"}}>{item.priority}</span>
                    {role&&<span style={{fontSize:9,color:role.dc,background:role.dc+"12",padding:"2px 6px",borderRadius:8}}>{role.ic} {role.t}</span>}
                    {item.dueHint&&<span style={{fontSize:8,color:"#5A6480"}}>{item.dueHint}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={confirm} disabled={!items.some(i=>i.selected)} style={{...S.pBtn,marginTop:0,flex:1,opacity:items.some(i=>i.selected)?1:0.4}}>Add {items.filter(i=>i.selected).length} to Tracker</button>
          <button onClick={onCancel} style={{...S.hBtn,padding:"10px 16px"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Strip AI response to a clean JSON array
export function extractItemsFromJSON(raw:string):ExtractedItem[]|null{
  const start=raw.indexOf("[");
  const end=raw.lastIndexOf("]");
  if(start===-1||end===-1)return null;
  try{
    const parsed=JSON.parse(raw.slice(start,end+1));
    if(!Array.isArray(parsed))return null;
    return parsed.map((p:any)=>({
      text:String(p.text||p.action||"").trim(),
      ownerRoleId:p.ownerRoleId||p.owner||null,
      priority:["high","medium","low"].includes(p.priority)?p.priority:"medium",
      dueHint:p.dueHint||p.timeframe||null,
      selected:true,
    })).filter(i=>i.text);
  }catch{return null;}
}

export const EXTRACTION_PROMPT=
  "From the following strategic output, extract 3-7 concrete, specific action items. For each, identify:\n"+
  "- text: a one-line description of the action (specific, not generic)\n"+
  "- ownerRoleId: the single best-fit role id from this list (pick the closest match): ceo, cfo, cto, coo, cmo, chro, clo, cso, vp_fin, vp_sales, vp_mktg, vp_hr, vp_cx, dir_prod, sl, sm_ops, sm_mktg, sm_sales, sm_hr, sm_fin, acct, rec, audit_mgr, risk_mgr\n"+
  "- priority: \"high\", \"medium\", or \"low\"\n"+
  "- dueHint: a short timeframe like \"0-30 days\", \"this week\", \"3-6 months\" if mentioned or implied, otherwise null\n\n"+
  "Output ONLY a valid JSON array of objects with these exact fields (text, ownerRoleId, priority, dueHint). No preamble, no markdown, no explanation.";

