import { useState, useRef } from "react";

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

function AIDisclaimer(){
  return <div style={{fontSize:9,color:"#5A6480",marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>⚠ AI-generated — please review and verify before sending or posting.</div>;
}
function AIDisclaimer(){
  return <div style={{fontSize:9,color:"#5A6480",marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>⚠ AI-generated — please review and verify before sending or posting.</div>;
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
  const [trackerImg,setTrackerImg]=useState<{data:string;mediaType:string;preview:string}|null>(null);
  const [outputImg,setOutputImg]=useState<{data:string;mediaType:string;preview:string}|null>(null);
  const [outputText,setOutputText]=useState("");
  const [inferring,setInferring]=useState(false);
  const [inferredDesc,setInferredDesc]=useState("");

  const [runTemplateId,setRunTemplateId]=useState<number|null>(null);
  const [runUpdateText,setRunUpdateText]=useState("");
  const [runTrackerImg,setRunTrackerImg]=useState<{data:string;mediaType:string;preview:string}|null>(null);
  const [running,setRunning]=useState(false);
  const [runOutput,setRunOutput]=useState("");

  const trackerInputRef=useRef<HTMLInputElement>(null);
  const outputInputRef=useRef<HTMLInputElement>(null);
  const runTrackerInputRef=useRef<HTMLInputElement>(null);

  const handleImageUpload=async(file:File,setter:(v:{data:string;mediaType:string;preview:string}|null)=>void)=>{
    try{
      const {data,mediaType}=await fileToBase64(file);
      const preview=URL.createObjectURL(file);
      setter({data,mediaType,preview});
    }catch(e:any){
      showToast("Could not read image: "+e.message,"error");
    }
  };

  const inferTemplate=async()=>{
    if(!trackerImg&&!outputText.trim()&&!outputImg){
      showToast("Upload a tracker screenshot and/or describe the output format","error");
      return;
    }
    setInferring(true);setInferredDesc("");
    try{
      const sys=
        "You are a report-template analyst. The user will show you (a) a screenshot of their data tracker (spreadsheet, ticket queue, mailbox, etc) and/or (b) a sample of the report/email output they currently produce manually.\n"+
        "Your job: infer and describe, in clear plain text, a reusable TEMPLATE that captures:\n"+
        "1. The structure/columns of the tracker (what data fields exist, what each means)\n"+
        "2. The structure of the desired OUTPUT (sections, tables, tone, what calculations are derived - e.g. aging buckets, totals, categorization)\n"+
        "3. Any business rules visible (e.g. SLA = first action within 3 days, aging buckets 0-3/4-5/5+ days, pending reasons categorized as Employee/Client/Dependency)\n\n"+
        "Write this as a clear, numbered specification that another AI can follow later, given only a fresh raw update, to regenerate the same kind of output. Be specific about column names and output formatting. Do NOT include any actual data values from the samples - only the STRUCTURE and RULES. Output plain text only, no markdown headers.";

      const images:{data:string;mediaType:string}[]=[];
      if(trackerImg)images.push({data:trackerImg.data,mediaType:trackerImg.mediaType});
      if(outputImg)images.push({data:outputImg.data,mediaType:outputImg.mediaType});

      let userText="Analyze these samples and produce the template specification.";
      if(outputText.trim())userText+="\n\nSAMPLE OUTPUT TEXT:\n"+outputText.trim();
      if(trackerImg&&outputImg)userText+="\n\n(First image = tracker sample, second image = output sample)";
      else if(trackerImg)userText+="\n\n(Image = tracker sample)";
      else if(outputImg)userText+="\n\n(Image = output sample)";

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
    setNewName("");setTrackerImg(null);setOutputImg(null);setOutputText("");setInferredDesc("");
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
    if(!runUpdateText.trim()&&!runTrackerImg){showToast("Paste today's update or upload a tracker screenshot","error");return;}
    setRunning(true);setRunOutput("");
    try{
      const sys=
        "You generate a formatted status report from a raw update, following this template specification exactly:\n\n"+
        "=== TEMPLATE SPECIFICATION ===\n"+tpl.description+"\n=== END SPECIFICATION ===\n\n"+
        "Apply the template's structure, calculations (aging buckets, totals, categorization) and tone to the raw input below. "+
        "If a tracker screenshot is provided, read the actual data from it. Output ONLY the final formatted report, ready to copy-paste - no preamble, no explanation, no markdown code fences.";

      const images:{data:string;mediaType:string}[]=[];
      if(runTrackerImg)images.push({data:runTrackerImg.data,mediaType:runTrackerImg.mediaType});

      let userText="RAW UPDATE FROM TEAM:\n"+(runUpdateText.trim()||"(see attached tracker screenshot)");
      if(runTrackerImg)userText+="\n\n(A current tracker screenshot is attached - use it as the data source.)";

      const result=await askVision(sys,userText,images);
      setRunOutput(result.trim());

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
              <label style={S.lbl}>Tracker Screenshot (optional)</label>
              <input ref={trackerInputRef} type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&handleImageUpload(e.target.files[0],setTrackerImg)} style={{display:"none"}}/>
              {trackerImg?(
                <div style={{position:"relative"}}>
                  <img src={trackerImg.preview} alt="Tracker sample" style={{width:"100%",borderRadius:6,border:"1px solid #1a2030",maxHeight:140,objectFit:"cover"}}/>
                  <button onClick={()=>setTrackerImg(null)} style={{position:"absolute",top:4,right:4,background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:4,color:"#EF4444",fontSize:10,cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                </div>
              ):(
                <button onClick={()=>trackerInputRef.current?.click()} style={{...S.inp,cursor:"pointer",textAlign:"center",color:"#5A6480",padding:"24px 10px"}}>📊 Upload tracker screenshot</button>
              )}
            </div>
            <div>
              <label style={S.lbl}>Sample Output Screenshot (optional)</label>
              <input ref={outputInputRef} type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&handleImageUpload(e.target.files[0],setOutputImg)} style={{display:"none"}}/>
              {outputImg?(
                <div style={{position:"relative"}}>
                  <img src={outputImg.preview} alt="Output sample" style={{width:"100%",borderRadius:6,border:"1px solid #1a2030",maxHeight:140,objectFit:"cover"}}/>
                  <button onClick={()=>setOutputImg(null)} style={{position:"absolute",top:4,right:4,background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:4,color:"#EF4444",fontSize:10,cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                </div>
              ):(
                <button onClick={()=>outputInputRef.current?.click()} style={{...S.inp,cursor:"pointer",textAlign:"center",color:"#5A6480",padding:"24px 10px"}}>📧 Upload output sample</button>
              )}
            </div>
          </div>

          <label style={S.lbl}>Or paste/describe your output format as text (optional)</label>
          <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
            <textarea style={{...S.inp,flex:1,minHeight:70,resize:"vertical"}} value={outputText} onChange={e=>setOutputText(e.target.value)} placeholder="Paste a sample of the email/report you currently send..."/>
            <MicButton lang={vLang} onResult={(t:string)=>setOutputText(prev=>(prev?prev+" ":"")+t)} disabled={inferring}/>
          </div>

          <button onClick={inferTemplate} disabled={inferring||(!trackerImg&&!outputText.trim()&&!outputImg)} style={{...S.pBtn,marginTop:0,opacity:inferring||(!trackerImg&&!outputText.trim()&&!outputImg)?0.4:1}}>{inferring?"Analyzing samples...":"Analyze and Generate Template"}</button>

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

              <label style={S.lbl}>Fresh Tracker Screenshot (optional, if tracker changed today)</label>
              <input ref={runTrackerInputRef} type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&handleImageUpload(e.target.files[0],setRunTrackerImg)} style={{display:"none"}}/>
              {runTrackerImg?(
                <div style={{position:"relative",marginBottom:10}}>
                  <img src={runTrackerImg.preview} alt="Tracker" style={{width:"100%",borderRadius:6,border:"1px solid #1a2030",maxHeight:160,objectFit:"cover"}}/>
                  <button onClick={()=>setRunTrackerImg(null)} style={{position:"absolute",top:4,right:4,background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:4,color:"#EF4444",fontSize:10,cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                </div>
              ):(
                <button onClick={()=>runTrackerInputRef.current?.click()} style={{...S.inp,cursor:"pointer",textAlign:"center",color:"#5A6480",padding:"16px 10px",marginBottom:10}}>📊 Upload current tracker screenshot</button>
              )}

              <button onClick={runReport} disabled={running||!runTemplateId||(!runUpdateText.trim()&&!runTrackerImg)} style={{...S.pBtn,marginTop:0,opacity:running||!runTemplateId||(!runUpdateText.trim()&&!runTrackerImg)?0.4:1}}>{running?"Generating report...":"Generate Report"}</button>

              {runOutput&&(
                <div style={{marginTop:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <label style={{...S.lbl,marginBottom:0}}>Generated Report</label>
                    <button onClick={()=>cpHelper(runOutput,showToast)} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>Copy</button>
                  </div>
                  <textarea style={{...S.inp,minHeight:240,resize:"vertical",fontSize:11,lineHeight:1.7,fontFamily:"monospace"}} value={runOutput} onChange={e=>setRunOutput(e.target.value)}/>
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
