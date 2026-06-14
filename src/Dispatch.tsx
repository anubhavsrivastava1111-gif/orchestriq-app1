import { useState, useRef } from "react";
import type { RefObject } from "react";

export interface DispatchTemplate{
  id:number;
  name:string;
  description:string; // AI-inferred structure definition, user-editable
  createdAt:string;
  lastUsed?:string;
}

// Convert a File to a base64 data string (without the data: prefix) and detect media type
function fileToBase64(file:File):Promise<{data:string;mediaType:string}>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const result=reader.result as string;
      const match=result.match(/^data:(.+);base64,(.+)$/);
      if(!match){reject(new Error("Could not read image"));return;}
      resolve({data:match[2],mediaType:match[1]});
    };
    reader.onerror=()=>reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

interface DispatchProps{
  templates:DispatchTemplate[];
  setTemplates:(t:DispatchTemplate[])=>void;
  sv:(k:string,v:any)=>void;
  S:any;
  showToast:(m:string,t?:string)=>void;
  ask:(sys:string,msgs:any[],maxT?:number)=>Promise<string>;
  askVision:(sys:string,userText:string,images:{data:string;mediaType:string}[])=>Promise<string>;
  MicButton:any;
  vLang:string;
}

const AGENTS=[
  {id:"status_report",ic:"📡",name:"Status Report Generator",desc:"Turn a raw team update into your daily SLA/status report - using a template learned from your own samples.",setup:"One-time template setup required"},
  {id:"meeting_notes",ic:"📝",name:"Meeting Notes to Action Items",desc:"Paste rough meeting notes or a transcript - get a clean table of Action | Owner | Deadline | Priority.",setup:"Ready to use"},
  {id:"email_drafter",ic:"✉️",name:"Email Drafter",desc:"Turn bullet points into a polished, professionally-toned email or message.",setup:"Ready to use"},
  {id:"variance",ic:"📊",name:"Variance Explainer",desc:"Paste today's numbers and yesterday's (or last period's) - get a written explanation of what changed and why it likely happened.",setup:"Ready to use"},
];

export default function Dispatch({templates,setTemplates,sv,S,showToast,ask,askVision,MicButton,vLang}:DispatchProps){
  const [activeAgent,setActiveAgent]=useState<string|null>(null);

  if(!activeAgent){
    return(
      <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Pulse Agentic</h2>
        <p style={{fontSize:10,color:"#5A6480",marginBottom:14}}>A toolkit of small agents that turn your messy daily inputs into polished, ready-to-use output. Pick a tool to get started.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {AGENTS.map(a=>(
            <button key={a.id} onClick={()=>setActiveAgent(a.id)} style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,padding:"14px",borderRadius:9,border:"1px solid #1a2030",background:"#131825",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
              <span style={{fontSize:22}}>{a.ic}</span>
              <div style={{fontSize:12,fontWeight:700,color:"#F1F5F9"}}>{a.name}</div>
              <div style={{fontSize:10,color:"#8892B0",lineHeight:1.6}}>{a.desc}</div>
              <div style={{fontSize:9,color:a.setup==="Ready to use"?"#10B981":"#F59E0B",fontWeight:700,marginTop:2}}>{a.setup==="Ready to use"?"● Ready to use":"○ "+a.setup}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return(
    <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
      <button onClick={()=>setActiveAgent(null)} style={{...S.hBtn,marginBottom:10}}>← All Agents</button>
      {activeAgent==="status_report"&&<StatusReportAgent templates={templates} setTemplates={setTemplates} sv={sv} S={S} showToast={showToast} askVision={askVision} MicButton={MicButton} vLang={vLang}/>}
      {activeAgent==="meeting_notes"&&<MeetingNotesAgent S={S} showToast={showToast} ask={ask} MicButton={MicButton} vLang={vLang}/>}
      {activeAgent==="email_drafter"&&<EmailDrafterAgent S={S} showToast={showToast} ask={ask} MicButton={MicButton} vLang={vLang}/>}
      {activeAgent==="variance"&&<VarianceAgent S={S} showToast={showToast} ask={ask} MicButton={MicButton} vLang={vLang}/>}
    </div>
  );
}

const cpHelper=(t:string,showToast:(m:string,ty?:string)=>void)=>{try{navigator.clipboard.writeText(t);showToast("Copied to clipboard","success");}catch{showToast("Copy failed","error");}};

// Copy as rich HTML so pasting into Outlook/Gmail preserves formatting (colors, tables, borders)
const cpHtmlRich=async(html:string,showToast:(m:string,ty?:string)=>void)=>{
  try{
    if(navigator.clipboard&&"write" in navigator.clipboard&&typeof ClipboardItem!=="undefined"){
      const blobHtml=new Blob([html],{type:"text/html"});
      const blobText=new Blob([html],{type:"text/plain"});
      await navigator.clipboard.write([new ClipboardItem({"text/html":blobHtml,"text/plain":blobText})]);
      showToast("Copied with formatting - paste directly into your email","success");
    }else{
      navigator.clipboard.writeText(html);
      showToast("Copied (your browser may not preserve formatting on paste)","info");
    }
  }catch{
    try{navigator.clipboard.writeText(html);showToast("Copied as text","info");}catch{showToast("Copy failed","error");}
  }
};

function AIDisclaimer(){
  return <div style={{fontSize:9,color:"#5A6480",marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>⚠ AI-generated — please review and verify before sending or posting.</div>;
}

// Multi-image upload gallery: shows thumbnails with remove buttons + an "add more" tile
function ImageGallery({images,onRemove,onAddClick,inputRef,onFiles,label,emptyLabel,S}:{
  images:{data:string;mediaType:string;preview:string}[],
  onRemove:(i:number)=>void,
  onAddClick:()=>void,
  inputRef:RefObject<HTMLInputElement|null>,
  onFiles:(files:FileList)=>void,
  label:string,
  emptyLabel:string,
  S:any,
}){
  return(
    <div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={e=>e.target.files&&onFiles(e.target.files)} style={{display:"none"}}/>
      {!images.length?(
        <button onClick={onAddClick} style={{...S.inp,cursor:"pointer",textAlign:"center",color:"#5A6480",padding:"24px 10px"}}>{emptyLabel}</button>
      ):(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6,marginBottom:6}}>
            {images.map((img,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={img.preview} alt={label+" "+(i+1)} style={{width:"100%",height:80,objectFit:"cover",borderRadius:5,border:"1px solid #1a2030"}}/>
                <button onClick={()=>onRemove(i)} style={{position:"absolute",top:2,right:2,background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:4,color:"#EF4444",fontSize:9,cursor:"pointer",padding:"1px 4px",lineHeight:1.4}}>×</button>
                <span style={{position:"absolute",bottom:2,left:2,background:"rgba(10,14,26,0.8)",borderRadius:3,color:"#A0AAC0",fontSize:8,padding:"1px 4px"}}>{i+1}</span>
              </div>
            ))}
          </div>
          <button onClick={onAddClick} style={{...S.hBtn,width:"100%",textAlign:"center",padding:"6px"}}>+ Add another screenshot</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT 2: Meeting Notes to Action Items
// ═══════════════════════════════════════════════════════════════════════════
function MeetingNotesAgent({S,showToast,ask,MicButton,vLang}:{S:any,showToast:(m:string,t?:string)=>void,ask:(sys:string,msgs:any[],maxT?:number)=>Promise<string>,MicButton:any,vLang:string}){
  const [input,setInput]=useState("");
  const [running,setRunning]=useState(false);
  const [output,setOutput]=useState("");

  const run=async()=>{
    if(!input.trim())return;
    setRunning(true);setOutput("");
    try{
      const sys=
        "You extract action items from meeting notes or transcripts. Output a markdown table with columns: Action Item | Owner | Deadline | Priority (High/Medium/Low). "+
        "If an owner or deadline isn't stated, write 'Not specified'. After the table, add a short 'Key Decisions' section (bullet list) if any decisions were made, and a 'Open Questions' section (bullet list) if anything was left unresolved. "+
        "Output ONLY the formatted result, no preamble.";
      const result=await ask(sys,[{role:"user",content:input.trim()}],1500);
      setOutput(result.trim());
    }catch(e:any){
      showToast("Failed: "+e.message,"error");
    }finally{
      setRunning(false);
    }
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:22}}>📝</span>
        <div><h3 style={{fontSize:14,fontWeight:800,color:"#F1F5F9"}}>Meeting Notes to Action Items</h3><p style={{fontSize:10,color:"#5A6480"}}>Paste rough notes or a transcript - get a clean action items table.</p></div>
      </div>
      <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"10px 12px",margin:"10px 0",fontSize:11,color:"#A0AAC0",lineHeight:1.7}}>
        Paste your raw meeting notes below - bullet points, a transcript, even messy typed notes work fine.
      </div>
      <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
        <textarea style={{...S.inp,flex:1,minHeight:140,resize:"vertical"}} value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste meeting notes here..." disabled={running}/>
        <MicButton lang={vLang} onResult={(t:string)=>setInput(prev=>(prev?prev+" ":"")+t)} disabled={running}/>
      </div>
      <button onClick={run} disabled={running||!input.trim()} style={{...S.pBtn,marginTop:0,opacity:running||!input.trim()?0.4:1}}>{running?"Extracting...":"Extract Action Items"}</button>
      {output&&(
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...S.lbl,marginBottom:0}}>Result (editable)</label>
            <button onClick={()=>cpHelper(output,showToast)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Copy</button>
          </div>
          <textarea style={{...S.inp,minHeight:180,resize:"vertical",fontSize:11,lineHeight:1.7,fontFamily:"monospace"}} value={output} onChange={e=>setOutput(e.target.value)}/>
          <AIDisclaimer/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT 3: Email Drafter
// ═══════════════════════════════════════════════════════════════════════════
const TONES=["Professional","Friendly","Formal/Escalation","Apologetic","Assertive/Firm"];

function EmailDrafterAgent({S,showToast,ask,MicButton,vLang}:{S:any,showToast:(m:string,t?:string)=>void,ask:(sys:string,msgs:any[],maxT?:number)=>Promise<string>,MicButton:any,vLang:string}){
  const [input,setInput]=useState("");
  const [tone,setTone]=useState("Professional");
  const [recipient,setRecipient]=useState("");
  const [running,setRunning]=useState(false);
  const [output,setOutput]=useState("");

  const run=async()=>{
    if(!input.trim())return;
    setRunning(true);setOutput("");
    try{
      const sys=
        "You draft professional emails or chat messages from bullet points or rough notes. "+
        "Tone requested: "+tone+". "+(recipient.trim()?"Recipient context: "+recipient.trim()+". ":"")+
        "Write a complete, ready-to-send email with a subject line and body. Keep it concise - do not pad with unnecessary filler. "+
        "Output ONLY the email (Subject: ... then body), no preamble or explanation.";
      const result=await ask(sys,[{role:"user",content:input.trim()}],1200);
      setOutput(result.trim());
    }catch(e:any){
      showToast("Failed: "+e.message,"error");
    }finally{
      setRunning(false);
    }
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:22}}>✉️</span>
        <div><h3 style={{fontSize:14,fontWeight:800,color:"#F1F5F9"}}>Email Drafter</h3><p style={{fontSize:10,color:"#5A6480"}}>Turn bullet points into a polished, ready-to-send email.</p></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,margin:"10px 0"}}>
        <div>
          <label style={S.lbl}>Tone</label>
          <select style={{...S.inp,padding:"8px"}} value={tone} onChange={e=>setTone(e.target.value)}>
            {TONES.map(t=><option key={t} value={t} style={{background:"#0a0e1a"}}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Recipient / Context (optional)</label>
          <input style={S.inp} value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="e.g. Client leadership, my manager"/>
        </div>
      </div>
      <label style={S.lbl}>Your Bullet Points / Rough Notes</label>
      <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
        <textarea style={{...S.inp,flex:1,minHeight:120,resize:"vertical"}} value={input} onChange={e=>setInput(e.target.value)} placeholder="e.g. - need extension on Q2 report, 2 more days&#10;- waiting on data from finance team&#10;- want to keep tone polite but firm" disabled={running}/>
        <MicButton lang={vLang} onResult={(t:string)=>setInput(prev=>(prev?prev+" ":"")+t)} disabled={running}/>
      </div>
      <button onClick={run} disabled={running||!input.trim()} style={{...S.pBtn,marginTop:0,opacity:running||!input.trim()?0.4:1}}>{running?"Drafting...":"Draft Email"}</button>
      {output&&(
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...S.lbl,marginBottom:0}}>Draft</label>
            <button onClick={()=>cpHelper(output,showToast)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Copy</button>
          </div>
          <textarea style={{...S.inp,minHeight:180,resize:"vertical",fontSize:11,lineHeight:1.7}} value={output} onChange={e=>setOutput(e.target.value)}/>
          <AIDisclaimer/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT 4: Variance Explainer
// ═══════════════════════════════════════════════════════════════════════════
function VarianceAgent({S,showToast,ask,MicButton,vLang}:{S:any,showToast:(m:string,t?:string)=>void,ask:(sys:string,msgs:any[],maxT?:number)=>Promise<string>,MicButton:any,vLang:string}){
  const [current,setCurrent]=useState("");
  const [previous,setPrevious]=useState("");
  const [context,setContext]=useState("");
  const [running,setRunning]=useState(false);
  const [output,setOutput]=useState("");

  const run=async()=>{
    if(!current.trim()||!previous.trim())return;
    setRunning(true);setOutput("");
    try{
      const sys=
        "You compare two sets of numbers/metrics (current period vs previous period) and write a clear, concise narrative explaining what changed and the likely reasons why, based on the context given. "+
        "Structure: a short summary line, then for each metric that changed meaningfully, one or two sentences on the change (amount and %) and a plausible reason. End with a 'Worth Flagging' line if anything looks like it needs attention. "+
        "Be specific with numbers. Output ONLY the narrative, no preamble.";
      const userMsg="PREVIOUS PERIOD:\n"+previous.trim()+"\n\nCURRENT PERIOD:\n"+current.trim()+(context.trim()?"\n\nADDITIONAL CONTEXT:\n"+context.trim():"");
      const result=await ask(sys,[{role:"user",content:userMsg}],1200);
      setOutput(result.trim());
    }catch(e:any){
      showToast("Failed: "+e.message,"error");
    }finally{
      setRunning(false);
    }
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:22}}>📊</span>
        <div><h3 style={{fontSize:14,fontWeight:800,color:"#F1F5F9"}}>Variance Explainer</h3><p style={{fontSize:10,color:"#5A6480"}}>Paste two periods of numbers - get a written explanation of what changed.</p></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,margin:"10px 0"}}>
        <div>
          <label style={S.lbl}>Previous Period</label>
          <textarea style={{...S.inp,minHeight:100,resize:"vertical"}} value={previous} onChange={e=>setPrevious(e.target.value)} placeholder="e.g. Pending tickets: 8&#10;Closed: 5&#10;New: 3" disabled={running}/>
        </div>
        <div>
          <label style={S.lbl}>Current Period</label>
          <textarea style={{...S.inp,minHeight:100,resize:"vertical"}} value={current} onChange={e=>setCurrent(e.target.value)} placeholder="e.g. Pending tickets: 12&#10;Closed: 2&#10;New: 6" disabled={running}/>
        </div>
      </div>
      <label style={S.lbl}>Additional Context (optional - e.g. holidays, known issues)</label>
      <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
        <textarea style={{...S.inp,flex:1,minHeight:60,resize:"vertical"}} value={context} onChange={e=>setContext(e.target.value)} placeholder="e.g. one team member was on leave, client delayed responses on 3 tickets" disabled={running}/>
        <MicButton lang={vLang} onResult={(t:string)=>setContext(prev=>(prev?prev+" ":"")+t)} disabled={running}/>
      </div>
      <button onClick={run} disabled={running||!current.trim()||!previous.trim()} style={{...S.pBtn,marginTop:0,opacity:running||!current.trim()||!previous.trim()?0.4:1}}>{running?"Analyzing...":"Explain Variance"}</button>
      {output&&(
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...S.lbl,marginBottom:0}}>Explanation (editable)</label>
            <button onClick={()=>cpHelper(output,showToast)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Copy</button>
          </div>
          <textarea style={{...S.inp,minHeight:160,resize:"vertical",fontSize:11,lineHeight:1.7}} value={output} onChange={e=>setOutput(e.target.value)}/>
          <AIDisclaimer/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT 1: Status Report Generator (template-based, original implementation)
// ═══════════════════════════════════════════════════════════════════════════
function StatusReportAgent({templates,setTemplates,sv,S,showToast,askVision,MicButton,vLang}:{
  templates:DispatchTemplate[],setTemplates:(t:DispatchTemplate[])=>void,sv:(k:string,v:any)=>void,S:any,showToast:(m:string,t?:string)=>void,
  askVision:(sys:string,userText:string,images:{data:string;mediaType:string}[])=>Promise<string>,MicButton:any,vLang:string
}){
  const [tab,setTab]=useState<"templates"|"new"|"run">("templates");

  const [newName,setNewName]=useState("");
  const [trackerImgs,setTrackerImgs]=useState<{data:string;mediaType:string;preview:string}[]>([]);
  const [outputImgs,setOutputImgs]=useState<{data:string;mediaType:string;preview:string}[]>([]);
  const [outputText,setOutputText]=useState("");
  const [inferring,setInferring]=useState(false);
  const [inferredDesc,setInferredDesc]=useState("");

  const [runTemplateId,setRunTemplateId]=useState<number|null>(null);
  const [runUpdateText,setRunUpdateText]=useState("");
  const [runTrackerImgs,setRunTrackerImgs]=useState<{data:string;mediaType:string;preview:string}[]>([]);
  const [running,setRunning]=useState(false);
  const [runOutput,setRunOutput]=useState("");
  const [outputView,setOutputView]=useState<"preview"|"source">("preview");

  const trackerInputRef=useRef<HTMLInputElement>(null);
  const outputInputRef=useRef<HTMLInputElement>(null);
  const runTrackerInputRef=useRef<HTMLInputElement>(null);

  const handleMultiImageUpload=async(files:FileList,adder:(v:{data:string;mediaType:string;preview:string})=>void)=>{
    for(const file of Array.from(files)){
      try{
        const {data,mediaType}=await fileToBase64(file);
        const preview=URL.createObjectURL(file);
        adder({data,mediaType,preview});
      }catch(e:any){
        showToast("Could not read image: "+e.message,"error");
      }
    }
  };

  const inferTemplate=async()=>{
    if(!trackerImgs.length&&!outputText.trim()&&!outputImgs.length){
      showToast("Upload a tracker screenshot and/or describe the output format","error");
      return;
    }
    setInferring(true);setInferredDesc("");
    try{
      const sys=
        "You are a report-template analyst. The user will show you (a) one or more screenshots of their data tracker (spreadsheet, ticket queue, mailbox, etc - the tracker may span multiple screenshots since it doesn't fit in one image) and/or (b) one or more screenshots or text samples of the report/email output they currently produce manually.\n"+
        "Your job: infer and describe, in clear plain text, a reusable TEMPLATE that captures:\n"+
        "1. The structure/columns of the tracker (what data fields exist, what each means) - combine information across all tracker images into one unified structure\n"+
        "2. The structure of the desired OUTPUT: sections, tables (exact column names and order), tone, and what calculations are derived (e.g. aging buckets, totals, categorization)\n"+
        "3. Any business rules visible (e.g. SLA = first action within 3 days, aging buckets 0-3/4-5/5+ days, pending reasons categorized as Employee/Client/Dependency)\n"+
        "4. The VISUAL STYLE of any tables shown in the output sample - note header bar color, any shaded/highlighted cells (e.g. totals rows, specific aging buckets), and general layout, so the final report can be reproduced as a styled HTML email with similar professional appearance (navy/blue header bars, light shading for totals, clean borders).\n\n"+
        "Write this as a clear, numbered specification that another AI can follow later, given only a fresh raw update, to regenerate the same kind of output AS A STYLED HTML EMAIL. Be specific about column names, table order, calculations, and visual styling. Do NOT include any actual data values from the samples - only the STRUCTURE, RULES, and STYLE. Output plain text only, no markdown headers.";

      const images:{data:string;mediaType:string}[]=[];
      trackerImgs.forEach(img=>images.push({data:img.data,mediaType:img.mediaType}));
      outputImgs.forEach(img=>images.push({data:img.data,mediaType:img.mediaType}));

      let userText="Analyze these samples and produce the template specification.";
      if(outputText.trim())userText+="\n\nSAMPLE OUTPUT TEXT:\n"+outputText.trim();
      if(trackerImgs.length&&outputImgs.length)userText+="\n\n(First "+trackerImgs.length+" image(s) = tracker sample across multiple screenshots, remaining "+outputImgs.length+" image(s) = output sample)";
      else if(trackerImgs.length)userText+="\n\n("+trackerImgs.length+" image(s) = tracker sample, possibly split across multiple screenshots - combine them into one unified structure)";
      else if(outputImgs.length)userText+="\n\n("+outputImgs.length+" image(s) = output sample)";

      const result=await askVision(sys,userText,images);
      setInferredDesc(result.trim());
    }catch(e:any){
      showToast("Could not analyze samples: "+e.message,"error");
    }finally{
      setInferring(false);
    }
  };

  const saveTemplate=()=>{
    if(!newName.trim()||!inferredDesc.trim()){
      showToast("Name your template and generate/edit the specification first","error");
      return;
    }
    const tpl:DispatchTemplate={
      id:Date.now(),
      name:newName.trim(),
      description:inferredDesc.trim(),
      createdAt:new Date().toISOString(),
    };
    const updated=[...templates,tpl];
    setTemplates(updated);sv("cos-dispatch-templates",updated);
    showToast("Template \""+tpl.name+"\" saved","success");
    setNewName("");setTrackerImgs([]);setOutputImgs([]);setOutputText("");setInferredDesc("");
    setTab("templates");
  };

  const deleteTemplate=(id:number)=>{
    const updated=templates.filter(t=>t.id!==id);
    setTemplates(updated);sv("cos-dispatch-templates",updated);
    showToast("Template deleted","info");
  };

  const runReport=async()=>{
    const tpl=templates.find(t=>t.id===runTemplateId);
    if(!tpl){showToast("Select a template first","error");return;}
    if(!runUpdateText.trim()&&!runTrackerImgs.length){showToast("Paste today's update or upload a tracker screenshot","error");return;}
    setRunning(true);setRunOutput("");
    try{
      const sys=
        "You generate a formatted status report EMAIL from a raw update, following this template specification:\n\n"+
        "=== TEMPLATE SPECIFICATION ===\n"+tpl.description+"\n=== END SPECIFICATION ===\n\n"+
        "Apply the template's structure, calculations (aging buckets, totals, categorization) and tone to the raw input below. "+
        "If tracker screenshots are provided (possibly multiple, covering the full tracker), read the actual data from all of them combined.\n\n"+
        "OUTPUT FORMAT - THIS IS MANDATORY:\n"+
        "Output a single self-contained HTML fragment (no <html>/<head>/<body> tags - just the content, ready to paste into an email body). Use ONLY inline CSS styles (style=\"...\" attributes), since email clients strip <style> blocks. Follow these exact visual rules:\n"+
        "- Every table: <table style=\"border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:13px;margin-bottom:14px\">\n"+
        "- Header row cells: <th style=\"background:#1F3864;color:#FFFFFF;padding:6px 10px;border:1px solid #999;text-align:left;font-weight:bold\">\n"+
        "- Normal data cells: <td style=\"padding:6px 10px;border:1px solid #ccc\">\n"+
        "- Totals / Grand Total rows or cells: <td style=\"padding:6px 10px;border:1px solid #ccc;background:#D9E2F3;font-weight:bold\">\n"+
        "- Cells flagged as a concern (e.g. SLA breach, 5+ days aging, high pending count): <td style=\"padding:6px 10px;border:1px solid #ccc;background:#F8CBAD;font-weight:bold\">\n"+
        "- Section titles (e.g. 'T&E ACTIVITIES OVERVIEW', 'AGEING SUMMARY'): <p style=\"font-weight:bold;font-size:14px;margin:14px 0 6px;color:#1F3864\">\n"+
        "- Body text/paragraphs: <p style=\"font-family:Calibri,Arial,sans-serif;font-size:13px;margin:4px 0\">\n"+
        "- Greeting, intro line, closing ('Let me know if you have any questions.', sign-off) all as styled <p> tags matching the tone in the specification.\n\n"+
        "Output ONLY this HTML fragment - no markdown, no code fences, no preamble or explanation, no asterisks for bold (use <strong> or the styles above instead).";

      const images:{data:string;mediaType:string}[]=[];
      runTrackerImgs.forEach(img=>images.push({data:img.data,mediaType:img.mediaType}));

      let userText="RAW UPDATE FROM TEAM:\n"+(runUpdateText.trim()||"(see attached tracker screenshot(s))");
      if(runTrackerImgs.length)userText+="\n\n("+runTrackerImgs.length+" current tracker screenshot(s) attached - use them together as the data source.)";

      const result=await askVision(sys,userText,images);
      let cleaned=result.trim();
      // Strip accidental markdown code fences if the model adds them despite instructions
      cleaned=cleaned.replace(/^```(?:html)?\s*/i,"").replace(/```\s*$/,"").trim();
      setRunOutput(cleaned);
      setOutputView("preview");

      const updated=templates.map(t=>t.id===tpl.id?{...t,lastUsed:new Date().toISOString()}:t);
      setTemplates(updated);sv("cos-dispatch-templates",updated);
    }catch(e:any){
      showToast("Report generation failed: "+e.message,"error");
    }finally{
      setRunning(false);
    }
  };

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:22}}>📡</span>
        <div><h3 style={{fontSize:14,fontWeight:800,color:"#F1F5F9"}}>Status Report Generator</h3><p style={{fontSize:10,color:"#5A6480"}}>Learn your report format once, then generate it daily from a quick update.</p></div>
      </div>
      <div style={{display:"flex",gap:3,margin:"10px 0",flexWrap:"wrap"}}>
        {[["templates","My Templates ("+templates.length+")"],["new","+ New Template"],["run","Run Report"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id as any)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(tab===id?"#14B8A6":"#1a2030"),background:tab===id?"rgba(20,184,166,0.08)":"transparent",color:tab===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
        ))}
      </div>

      {tab==="templates"&&(
        <div>
          {!templates.length?(
            <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"16px",textAlign:"center"}}>
              <div style={{fontSize:12,color:"#A0AAC0",marginBottom:10,lineHeight:1.7}}>No templates yet. Create one by uploading a sample of your tracker and the report format you currently produce - the AI will learn the structure once, and you can reuse it every day.</div>
              <button onClick={()=>setTab("new")} style={{...S.pBtn,marginTop:0,width:"auto",padding:"8px 18px"}}>+ Create Your First Template</button>
            </div>
          ):templates.map(t=>(
            <div key={t.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:700,color:"#F1F5F9"}}>{t.name}</div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>{setRunTemplateId(t.id);setTab("run");}} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Use</button>
                  <button onClick={()=>deleteTemplate(t.id)} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433"}}>Delete</button>
                </div>
              </div>
              <div style={{fontSize:9,color:"#5A6480",marginBottom:4}}>Created {new Date(t.createdAt).toLocaleDateString()}{t.lastUsed?" · Last used "+new Date(t.lastUsed).toLocaleDateString():""}</div>
              <div style={{fontSize:10,color:"#8892B0",lineHeight:1.6,maxHeight:60,overflow:"hidden",textOverflow:"ellipsis"}}>{t.description.slice(0,200)}{t.description.length>200?"...":""}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="new"&&(
        <div>
          <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"10px 12px",marginBottom:12,fontSize:11,color:"#A0AAC0",lineHeight:1.7}}>
            Upload a screenshot of your tracker (the spreadsheet/queue you work from) and/or a sample of the report you currently send. The AI will learn the structure and rules once - then you reuse this template every day with just a quick update.
          </div>

          <label style={S.lbl}>Template Name</label>
          <input style={{...S.inp,marginBottom:10}} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. T&E Daily Status Report"/>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={S.lbl}>Tracker Screenshot(s) (optional - upload multiple if your tracker doesn't fit one screen)</label>
              <ImageGallery images={trackerImgs} onRemove={i=>setTrackerImgs(prev=>prev.filter((_,idx)=>idx!==i))} onAddClick={()=>trackerInputRef.current?.click()} inputRef={trackerInputRef} onFiles={files=>handleMultiImageUpload(files,img=>setTrackerImgs(prev=>[...prev,img]))} label="Tracker" emptyLabel="📊 Upload tracker screenshot(s)" S={S}/>
            </div>
            <div>
              <label style={S.lbl}>Sample Output Screenshot(s) (optional)</label>
              <ImageGallery images={outputImgs} onRemove={i=>setOutputImgs(prev=>prev.filter((_,idx)=>idx!==i))} onAddClick={()=>outputInputRef.current?.click()} inputRef={outputInputRef} onFiles={files=>handleMultiImageUpload(files,img=>setOutputImgs(prev=>[...prev,img]))} label="Output" emptyLabel="📧 Upload output sample(s)" S={S}/>
            </div>
          </div>

          <label style={S.lbl}>Or paste/describe your output format as text (optional)</label>
          <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
            <textarea style={{...S.inp,flex:1,minHeight:70,resize:"vertical"}} value={outputText} onChange={e=>setOutputText(e.target.value)} placeholder="Paste a sample of the email/report you currently send..."/>
            <MicButton lang={vLang} onResult={(t:string)=>setOutputText(prev=>(prev?prev+" ":"")+t)} disabled={inferring}/>
          </div>

          <button onClick={inferTemplate} disabled={inferring||(!trackerImgs.length&&!outputText.trim()&&!outputImgs.length)} style={{...S.pBtn,marginTop:0,opacity:inferring||(!trackerImgs.length&&!outputText.trim()&&!outputImgs.length)?0.4:1}}>{inferring?"Analyzing samples...":"Analyze and Generate Template"}</button>

          {inferredDesc&&(
            <div style={{marginTop:12}}>
              <label style={S.lbl}>Inferred Template Specification (review and edit before saving)</label>
              <textarea style={{...S.inp,minHeight:180,resize:"vertical",fontSize:11,lineHeight:1.6}} value={inferredDesc} onChange={e=>setInferredDesc(e.target.value)}/>
              <button onClick={saveTemplate} disabled={!newName.trim()} style={{...S.pBtn,opacity:newName.trim()?1:0.4}}>Save Template</button>
            </div>
          )}
        </div>
      )}

      {tab==="run"&&(
        <div>
          {!templates.length?(
            <div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}>
              <div style={{fontSize:12,marginBottom:10}}>No templates yet.</div>
              <button onClick={()=>setTab("new")} style={{...S.pBtn,width:"auto",padding:"8px 18px"}}>+ Create a Template</button>
            </div>
          ):(
            <div>
              <label style={S.lbl}>Select Template</label>
              <select style={{...S.inp,marginBottom:10,padding:"8px"}} value={runTemplateId||""} onChange={e=>setRunTemplateId(Number(e.target.value)||null)}>
                <option value="">Choose a template...</option>
                {templates.map(t=><option key={t.id} value={t.id} style={{background:"#0a0e1a"}}>{t.name}</option>)}
              </select>

              <label style={S.lbl}>Today's Update (paste team chat messages, counts, etc)</label>
              <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
                <textarea style={{...S.inp,flex:1,minHeight:80,resize:"vertical"}} value={runUpdateText} onChange={e=>setRunUpdateText(e.target.value)} placeholder="Paste raw update, e.g.: out of 11 tickets 2 is closed remaining is pending. UK 30 reports worked. EX employee 5 reports worked" disabled={running}/>
                <MicButton lang={vLang} onResult={(t:string)=>setRunUpdateText(prev=>(prev?prev+" ":"")+t)} disabled={running}/>
              </div>

              <label style={S.lbl}>Fresh Tracker Screenshot(s) (optional, if tracker changed today - upload multiple if it spans more than one screen)</label>
              <div style={{marginBottom:10}}>
                <ImageGallery images={runTrackerImgs} onRemove={i=>setRunTrackerImgs(prev=>prev.filter((_,idx)=>idx!==i))} onAddClick={()=>runTrackerInputRef.current?.click()} inputRef={runTrackerInputRef} onFiles={files=>handleMultiImageUpload(files,img=>setRunTrackerImgs(prev=>[...prev,img]))} label="Tracker" emptyLabel="📊 Upload current tracker screenshot(s)" S={S}/>
              </div>

              <button onClick={runReport} disabled={running||!runTemplateId||(!runUpdateText.trim()&&!runTrackerImgs.length)} style={{...S.pBtn,marginTop:0,opacity:running||!runTemplateId||(!runUpdateText.trim()&&!runTrackerImgs.length)?0.4:1}}>{running?"Generating report...":"Generate Report"}</button>

              {runOutput&&(
                <div style={{marginTop:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
                    <label style={{...S.lbl,marginBottom:0}}>Generated Report</label>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>setOutputView("preview")} style={{...S.hBtn,color:outputView==="preview"?"#14B8A6":"#5A6480",borderColor:outputView==="preview"?"#14B8A633":"#1a2030"}}>Preview</button>
                      <button onClick={()=>setOutputView("source")} style={{...S.hBtn,color:outputView==="source"?"#14B8A6":"#5A6480",borderColor:outputView==="source"?"#14B8A633":"#1a2030"}}>HTML Source (edit)</button>
                      <button onClick={()=>cpHtmlRich(runOutput,showToast)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Copy Formatted</button>
                      <button onClick={()=>cpHelper(runOutput,showToast)} style={S.hBtn}>Copy HTML</button>
                    </div>
                  </div>
                  {outputView==="preview"?(
                    <div style={{background:"#FFFFFF",border:"1px solid #1a2030",borderRadius:6,padding:"14px",maxHeight:480,overflowY:"auto"}}>
                      <div dangerouslySetInnerHTML={{__html:runOutput}}/>
                    </div>
                  ):(
                    <textarea style={{...S.inp,minHeight:240,resize:"vertical",fontSize:11,lineHeight:1.7,fontFamily:"monospace"}} value={runOutput} onChange={e=>setRunOutput(e.target.value)}/>
                  )}
                  <div style={{fontSize:9,color:"#5A6480",marginTop:6,lineHeight:1.5}}>Click <strong>Copy Formatted</strong> then paste directly into Outlook/Gmail to keep the colors and table layout. Use <strong>HTML Source</strong> to fine-tune the underlying code if needed.</div>
                  <AIDisclaimer/>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
