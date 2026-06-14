import { useState } from "react";

// ─── CHART OF ACCOUNTS (defaults) ───────────────────────────────────────────
export const COA = [
  // ASSETS
  {code:"1000",name:"Cash",type:"Asset",sub:"Current Asset"},
  {code:"1010",name:"Bank",type:"Asset",sub:"Current Asset"},
  {code:"1100",name:"Accounts Receivable",type:"Asset",sub:"Current Asset"},
  {code:"1200",name:"Inventory",type:"Asset",sub:"Current Asset"},
  {code:"1500",name:"Equipment",type:"Asset",sub:"Fixed Asset"},
  {code:"1510",name:"Building",type:"Asset",sub:"Fixed Asset"},
  {code:"1520",name:"Vehicles",type:"Asset",sub:"Fixed Asset"},
  {code:"1900",name:"Accumulated Depreciation",type:"Asset",sub:"Fixed Asset"},
  // LIABILITIES
  {code:"2000",name:"Accounts Payable",type:"Liability",sub:"Current Liability"},
  {code:"2100",name:"Short-term Loan",type:"Liability",sub:"Current Liability"},
  {code:"2200",name:"Accrued Expenses",type:"Liability",sub:"Current Liability"},
  {code:"2500",name:"Bank Loan (Long-term)",type:"Liability",sub:"Long-term Liability"},
  // EQUITY
  {code:"3000",name:"Owner's Equity / Capital",type:"Equity",sub:"Equity"},
  {code:"3100",name:"Retained Earnings",type:"Equity",sub:"Equity"},
  {code:"3200",name:"Drawings",type:"Equity",sub:"Equity"},
  // INCOME
  {code:"4000",name:"Sales Revenue",type:"Income",sub:"Operating Income"},
  {code:"4100",name:"Service Revenue",type:"Income",sub:"Operating Income"},
  {code:"4900",name:"Other Income",type:"Income",sub:"Non-operating Income"},
  // EXPENSES
  {code:"5000",name:"Cost of Goods Sold",type:"Expense",sub:"COGS"},
  {code:"5100",name:"Salaries & Wages",type:"Expense",sub:"Operating Expense"},
  {code:"5200",name:"Rent",type:"Expense",sub:"Operating Expense"},
  {code:"5300",name:"Marketing & Advertising",type:"Expense",sub:"Operating Expense"},
  {code:"5400",name:"Utilities",type:"Expense",sub:"Operating Expense"},
  {code:"5500",name:"Depreciation Expense",type:"Expense",sub:"Operating Expense"},
  {code:"5600",name:"Interest Expense",type:"Expense",sub:"Non-operating Expense"},
  {code:"5900",name:"Other Expenses",type:"Expense",sub:"Operating Expense"},
];

const TYPE_RANGES:Record<string,[number,number]> = {
  Asset:[1000,1999], Liability:[2000,2999], Equity:[3000,3999], Income:[4000,4999], Expense:[5000,5999],
};
const SUBS_BY_TYPE:Record<string,string[]> = {
  Asset:["Current Asset","Fixed Asset"],
  Liability:["Current Liability","Long-term Liability"],
  Equity:["Equity"],
  Income:["Operating Income","Non-operating Income"],
  Expense:["COGS","Operating Expense","Non-operating Expense"],
};

export interface Account{code:string;name:string;type:string;sub:string;custom?:boolean;}
export interface JournalLine{accountCode:string;debit:number;credit:number;}
export interface JournalEntry{id:number;date:string;narration:string;lines:JournalLine[];}

export function getAllAccounts(customAccounts:Account[]):Account[]{
  return [...COA, ...(customAccounts||[])];
}

export function nextCode(type:string, customAccounts:Account[]):string{
  const [lo,hi]=TYPE_RANGES[type]||[9000,9999];
  const all=getAllAccounts(customAccounts).filter(a=>{
    const n=parseInt(a.code,10);return n>=lo&&n<=hi;
  });
  const used=new Set(all.map(a=>parseInt(a.code,10)));
  for(let n=lo;n<=hi;n++){if(!used.has(n))return String(n);}
  return String(hi);
}

// ─── LEDGER COMPUTATION ─────────────────────────────────────────────────────
export function computeBalances(entries:JournalEntry[], accounts:Account[]){
  const balances:Record<string,number>={};
  accounts.forEach(a=>balances[a.code]=0);
  entries.forEach(e=>{
    e.lines.forEach(l=>{
      const acc=accounts.find(a=>a.code===l.accountCode);
      if(!acc)return;
      const normalSide=["Asset","Expense"].includes(acc.type)?"debit":"credit";
      const net=l.debit-l.credit;
      balances[l.accountCode]=(balances[l.accountCode]||0)+(normalSide==="debit"?net:-net);
    });
  });
  return balances;
}

export function computeStatements(entries:JournalEntry[], accounts:Account[]){
  const bal=computeBalances(entries, accounts);
  const byType=(type:string)=>accounts.filter(a=>a.type===type).map(a=>({...a,balance:bal[a.code]||0})).filter(a=>a.balance!==0);
  const income=byType("Income");
  const expense=byType("Expense");
  const totalIncome=income.reduce((s,a)=>s+a.balance,0);
  const totalExpense=expense.reduce((s,a)=>s+a.balance,0);
  const netProfit=totalIncome-totalExpense;
  const assets=byType("Asset");
  const liabilities=byType("Liability");
  const equity=byType("Equity");
  const totalAssets=assets.reduce((s,a)=>s+a.balance,0);
  const totalLiabilities=liabilities.reduce((s,a)=>s+a.balance,0);
  const totalEquity=equity.reduce((s,a)=>s+a.balance,0)+netProfit;
  return{income,expense,totalIncome,totalExpense,netProfit,assets,liabilities,equity,totalAssets,totalLiabilities,totalEquity,bal};
}

// Strip AI response down to a clean JSON object
function extractJSON(raw:string):any{
  const start=raw.indexOf("{");
  const end=raw.lastIndexOf("}");
  if(start===-1||end===-1)return null;
  try{return JSON.parse(raw.slice(start,end+1));}catch{return null;}
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
interface LedgerProps{
  cur:any;
  entries:JournalEntry[];
  setEntries:(e:JournalEntry[])=>void;
  customAccounts:Account[];
  setCustomAccounts:(a:Account[])=>void;
  sv:(k:string,v:any)=>void;
  S:any;
  showToast:(m:string,t?:string)=>void;
  ask:(sys:string,msgs:any[],maxT?:number)=>Promise<string>;
  MicButton:any;
  vLang:string;
}

export default function Ledger({cur,entries,setEntries,customAccounts,setCustomAccounts,sv,S,showToast,ask,MicButton,vLang}:LedgerProps){
  const [tab,setTab]=useState("ai");
  const accounts=getAllAccounts(customAccounts);

  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [narration,setNarration]=useState("");
  const [lines,setLines]=useState<JournalLine[]>([{accountCode:"",debit:0,credit:0},{accountCode:"",debit:0,credit:0}]);

  const [newAcc,setNewAcc]=useState({name:"",type:"Asset",sub:SUBS_BY_TYPE.Asset[0]});
  const [editAccCode,setEditAccCode]=useState<string|null>(null);

  const [aiInput,setAiInput]=useState("");
  const [aiThinking,setAiThinking]=useState(false);
  const [aiQuestion,setAiQuestion]=useState("");
  const [aiProposal,setAiProposal]=useState<{date:string;narration:string;lines:JournalLine[];explanation:string}|null>(null);
  const [aiHistory,setAiHistory]=useState<{role:string;content:string}[]>([]);

  const addLine=()=>setLines([...lines,{accountCode:"",debit:0,credit:0}]);
  const removeLine=(i:number)=>setLines(lines.filter((_,idx)=>idx!==i));
  const updateLine=(i:number,field:string,val:any)=>{
    const nl=[...lines];(nl[i] as any)[field]=field==="accountCode"?val:Number(val)||0;setLines(nl);
  };

  const totalDebit=lines.reduce((s,l)=>s+l.debit,0);
  const totalCredit=lines.reduce((s,l)=>s+l.credit,0);
  const balanced=totalDebit===totalCredit&&totalDebit>0;

  const postEntry=(entryDate?:string, entryNarration?:string, entryLines?:JournalLine[])=>{
    const useLines=entryLines||lines;
    const useDate=entryDate||date;
    const useNarration=entryNarration||narration||"(no narration)";
    const totalD=useLines.reduce((s,l)=>s+l.debit,0);
    const totalC=useLines.reduce((s,l)=>s+l.credit,0);
    if(totalD!==totalC||totalD===0){showToast("Debits must equal credits","error");return false;}
    const validLines=useLines.filter(l=>l.accountCode&&(l.debit>0||l.credit>0));
    if(validLines.length<2){showToast("Need at least 2 valid lines","error");return false;}
    const entry:JournalEntry={id:Date.now(),date:useDate,narration:useNarration,lines:validLines};
    const updated=[...entries,entry];
    setEntries(updated);sv("cos-ledger",updated);
    return true;
  };

  const postManual=()=>{
    if(postEntry()){
      setNarration("");setLines([{accountCode:"",debit:0,credit:0},{accountCode:"",debit:0,credit:0}]);
      showToast("Journal entry posted","success");
    }
  };

  const deleteEntry=(id:number)=>{
    const updated=entries.filter(e=>e.id!==id);
    setEntries(updated);sv("cos-ledger",updated);
  };

  const saveAccount=()=>{
    if(!newAcc.name.trim()){showToast("Account name required","error");return;}
    if(editAccCode){
      const updated=customAccounts.map(a=>a.code===editAccCode?{...a,name:newAcc.name,type:newAcc.type,sub:newAcc.sub}:a);
      setCustomAccounts(updated);sv("cos-accounts",updated);
      showToast("Account updated","success");
      setEditAccCode(null);
    }else{
      const code=nextCode(newAcc.type,customAccounts);
      const acc:Account={code,name:newAcc.name,type:newAcc.type,sub:newAcc.sub,custom:true};
      const updated=[...customAccounts,acc];
      setCustomAccounts(updated);sv("cos-accounts",updated);
      showToast("Account created: "+code+" "+acc.name,"success");
    }
    setNewAcc({name:"",type:"Asset",sub:SUBS_BY_TYPE.Asset[0]});
  };

  const startEditAccount=(a:Account)=>{
    setNewAcc({name:a.name,type:a.type,sub:a.sub});
    setEditAccCode(a.code);
  };

  const deleteAccount=(code:string)=>{
    const used=entries.some(e=>e.lines.some(l=>l.accountCode===code));
    if(used){showToast("Cannot delete - account has journal entries posted","error");return;}
    const updated=customAccounts.filter(a=>a.code!==code);
    setCustomAccounts(updated);sv("cos-accounts",updated);
    showToast("Account deleted","success");
  };

  const acctList=accounts.map(a=>a.code+" "+a.name+" ("+a.type+" / "+a.sub+")").join("\n");

  const aiSystemPrompt=
    "You are an expert accountant helping a small business owner record transactions using double-entry bookkeeping.\n"+
    "AVAILABLE ACCOUNTS (code, name, type, sub-category):\n"+acctList+"\n\n"+
    "RULES:\n"+
    "- Every transaction must balance: total debits = total credits.\n"+
    "- Asset and Expense accounts increase with Debit, decrease with Credit.\n"+
    "- Liability, Equity, and Income accounts increase with Credit, decrease with Debit.\n"+
    "- If the user's description has enough information to create a balanced entry using EXISTING accounts, respond with JSON only:\n"+
    '{"status":"ready","date":"YYYY-MM-DD","narration":"short description","lines":[{"accountCode":"CODE","debit":NUMBER,"credit":NUMBER}],"explanation":"one sentence explaining the accounting treatment and which rule applies"}\n'+
    "- If information is missing (e.g. how cash was obtained, which bank, who the loan is from), respond with JSON only:\n"+
    '{"status":"question","question":"a single clear clarifying question"}\n'+
    "- If the user needs a NEW account that does not exist in the list (e.g. a new bank account, a new asset type, a specific vendor or partner), respond with JSON only:\n"+
    '{"status":"need_account","accountName":"suggested name","accountType":"Asset|Liability|Equity|Income|Expense","accountSub":"appropriate sub-category","question":"explain to the user this new account will be created and ask them to confirm or rename it"}\n'+
    "- Always respond with ONLY the JSON object, no other text. Use today's date if not specified: "+new Date().toISOString().slice(0,10);

  const runAI=async(userText:string)=>{
    setAiThinking(true);setAiQuestion("");setAiProposal(null);
    const newHistory=[...aiHistory,{role:"user",content:userText}];
    try{
      const reply=await ask(aiSystemPrompt, newHistory.map(h=>({role:h.role,content:h.content})), 600);
      const parsed=extractJSON(reply);
      if(!parsed){showToast("Could not understand AI response, please try rephrasing","error");setAiThinking(false);return;}
      setAiHistory([...newHistory,{role:"assistant",content:reply}]);

      if(parsed.status==="ready"){
        setAiProposal({date:parsed.date||new Date().toISOString().slice(0,10),narration:parsed.narration||userText,lines:parsed.lines||[],explanation:parsed.explanation||""});
      }else if(parsed.status==="question"){
        setAiQuestion(parsed.question||"Can you provide more details?");
      }else if(parsed.status==="need_account"){
        const code=nextCode(parsed.accountType||"Asset",customAccounts);
        const acc:Account={code,name:parsed.accountName||"New Account",type:parsed.accountType||"Asset",sub:parsed.accountSub||SUBS_BY_TYPE[parsed.accountType||"Asset"][0],custom:true};
        const updated=[...customAccounts,acc];
        setCustomAccounts(updated);sv("cos-accounts",updated);
        showToast("New account created: "+code+" "+acc.name,"info");
        setAiQuestion((parsed.question||"")+" (Created account: "+code+" "+acc.name+")");
      }
    }catch(e:any){
      showToast("AI error: "+e.message,"error");
    }finally{
      setAiThinking(false);
    }
  };

  const startAI=()=>{
    if(!aiInput.trim())return;
    setAiHistory([]);
    runAI(aiInput.trim());
  };

  const answerQuestion=(answerText:string)=>{
    if(!answerText.trim())return;
    runAI(answerText.trim());
  };

  const confirmProposal=()=>{
    if(!aiProposal)return;
    if(postEntry(aiProposal.date,aiProposal.narration,aiProposal.lines)){
      showToast("Transaction posted","success");
      setAiProposal(null);setAiInput("");setAiHistory([]);setAiQuestion("");
    }
  };

  const editProposalLine=(i:number,field:string,val:any)=>{
    if(!aiProposal)return;
    const nl=[...aiProposal.lines];(nl[i] as any)[field]=field==="accountCode"?val:Number(val)||0;
    setAiProposal({...aiProposal,lines:nl});
  };

  const stmts=computeStatements(entries, accounts);
  const fmt=(n:number)=>cur.sym+Math.abs(n).toLocaleString("en-IN",{maximumFractionDigits:0});
  const propTotalD=aiProposal?.lines.reduce((s,l)=>s+l.debit,0)||0;
  const propTotalC=aiProposal?.lines.reduce((s,l)=>s+l.credit,0)||0;
  const propBalanced=propTotalD===propTotalC&&propTotalD>0;

  return(
    <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
      <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>General Ledger</h2>
      <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Double-entry bookkeeping. Currency: <strong style={{color:"#14B8A6"}}>{cur.sym} {cur.code}</strong></p>

      <div style={{display:"flex",gap:3,marginBottom:12,flexWrap:"wrap"}}>
        {[["ai","AI Assistant"],["entry","Manual Entry"],["accounts","Accounts ("+accounts.length+")"],["journal","All Entries ("+entries.length+")"],["trial","Trial Balance"],["pnl","P&L"],["bs","Balance Sheet"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(tab===id?"#14B8A6":"#1a2030"),background:tab===id?"rgba(20,184,166,0.08)":"transparent",color:tab===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
        ))}
      </div>

      {tab==="ai"&&(
        <div>
          <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"10px 12px",marginBottom:10,fontSize:11,color:"#A0AAC0",lineHeight:1.7}}>
            Describe a transaction in plain language - for example: "I purchased a tractor for the business today, I paid by cash."
            The assistant will work out the correct double-entry treatment, ask follow-up questions if needed, and propose a journal entry for your review before posting.
          </div>

          {!aiProposal&&!aiQuestion&&(
            <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end"}}>
              <textarea style={{...S.inp,flex:1,minHeight:60,resize:"vertical"}} value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Describe the transaction..." disabled={aiThinking}/>
              <MicButton lang={vLang} onResult={t=>setAiInput(prev=>(prev?prev+" ":"")+t)} disabled={aiThinking}/>
              <button onClick={startAI} disabled={aiThinking||!aiInput.trim()} style={{...S.pBtn,width:"auto",padding:"10px 18px",marginTop:0,opacity:aiThinking||!aiInput.trim()?0.4:1}}>{aiThinking?"Thinking...":"Submit"}</button>
            </div>
          )}

          {aiQuestion&&!aiProposal&&(
            <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:7,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#F59E0B",marginBottom:6}}>The assistant needs more information</div>
              <div style={{fontSize:12,color:"#F1F5F9",marginBottom:10,lineHeight:1.6}}>{aiQuestion}</div>
              <AnswerBox onSubmit={answerQuestion} disabled={aiThinking} S={S}/>
            </div>
          )}

          {aiProposal&&(
            <div style={{background:"#131825",border:"1px solid rgba(20,184,166,0.3)",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:800,color:"#14B8A6",marginBottom:6}}>Proposed Journal Entry</div>
              <div style={{fontSize:11,color:"#8892B0",marginBottom:8,lineHeight:1.6}}>{aiProposal.explanation}</div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <div style={{flex:1}}><label style={S.lbl}>Date</label><input type="date" style={S.inp} value={aiProposal.date} onChange={e=>setAiProposal({...aiProposal,date:e.target.value})}/></div>
                <div style={{flex:2}}><label style={S.lbl}>Narration</label><input style={S.inp} value={aiProposal.narration} onChange={e=>setAiProposal({...aiProposal,narration:e.target.value})}/></div>
              </div>
              <label style={S.lbl}>Lines (you can edit before posting)</label>
              {aiProposal.lines.map((l,i)=>{const acc=accounts.find(a=>a.code===l.accountCode);return(
                <div key={i} style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                  <select style={{...S.inp,flex:2}} value={l.accountCode} onChange={e=>editProposalLine(i,"accountCode",e.target.value)}>
                    <option value="">Select account...</option>
                    {accounts.map(a=><option key={a.code} value={a.code} style={{background:"#0a0e1a"}}>{a.code} - {a.name} ({a.type})</option>)}
                  </select>
                  <input style={{...S.inp,flex:1}} type="number" placeholder="Debit" value={l.debit||""} onChange={e=>editProposalLine(i,"debit",e.target.value)}/>
                  <input style={{...S.inp,flex:1}} type="number" placeholder="Credit" value={l.credit||""} onChange={e=>editProposalLine(i,"credit",e.target.value)}/>
                  {!acc&&l.accountCode&&<span style={{fontSize:9,color:"#EF4444"}}>unknown</span>}
                </div>
              );})}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:"#0a0e1a",borderRadius:5,marginTop:8,marginBottom:10,fontSize:11}}>
                <span style={{color:"#A0AAC0"}}>Total Debit: <strong style={{color:"#F1F5F9"}}>{fmt(propTotalD)}</strong></span>
                <span style={{color:"#A0AAC0"}}>Total Credit: <strong style={{color:"#F1F5F9"}}>{fmt(propTotalC)}</strong></span>
                <span style={{color:propBalanced?"#10B981":"#EF4444",fontWeight:700}}>{propBalanced?"Balanced":"Not Balanced"}</span>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={confirmProposal} disabled={!propBalanced} style={{...S.pBtn,marginTop:0,flex:1,opacity:propBalanced?1:0.4}}>Confirm and Post</button>
                <button onClick={()=>{setAiProposal(null);setAiInput("");setAiHistory([]);setAiQuestion("");}} style={{...S.hBtn,padding:"10px 16px"}}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="accounts"&&(
        <div>
          <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"12px",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#F1F5F9",marginBottom:8}}>{editAccCode?"Edit Account":"Add New Account"}</div>
            <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
              <div style={{flex:2,minWidth:140}}><label style={S.lbl}>Account Name</label><input style={S.inp} value={newAcc.name} onChange={e=>setNewAcc({...newAcc,name:e.target.value})} placeholder="e.g. HDFC Current Account"/></div>
              <div style={{flex:1,minWidth:110}}>
                <label style={S.lbl}>Type</label>
                <select style={{...S.inp,padding:"8px"}} value={newAcc.type} onChange={e=>setNewAcc({...newAcc,type:e.target.value,sub:SUBS_BY_TYPE[e.target.value][0]})}>
                  {Object.keys(TYPE_RANGES).map(t=><option key={t} value={t} style={{background:"#0a0e1a"}}>{t}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <label style={S.lbl}>Sub-category</label>
                <select style={{...S.inp,padding:"8px"}} value={newAcc.sub} onChange={e=>setNewAcc({...newAcc,sub:e.target.value})}>
                  {SUBS_BY_TYPE[newAcc.type].map(s=><option key={s} value={s} style={{background:"#0a0e1a"}}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={saveAccount} style={{...S.pBtn,marginTop:0,flex:1}}>{editAccCode?"Save Changes":"Create Account"}</button>
              {editAccCode&&<button onClick={()=>{setEditAccCode(null);setNewAcc({name:"",type:"Asset",sub:SUBS_BY_TYPE.Asset[0]});}} style={{...S.hBtn,padding:"10px 16px"}}>Cancel</button>}
            </div>
          </div>

          <div style={{fontSize:10,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:6}}>Your Custom Accounts</div>
          {!customAccounts.length?(
            <div style={{fontSize:11,color:"#5A6480",padding:"10px 0"}}>No custom accounts yet. Add one above, or let the AI Assistant create them automatically.</div>
          ):customAccounts.map(a=>(
            <div key={a.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"#131825",border:"1px solid #1a2030",borderRadius:5,marginBottom:3}}>
              <div style={{fontSize:11,color:"#A0AAC0"}}><span style={{color:"#5A6480"}}>{a.code}</span> {a.name} <span style={{color:"#5A6480",fontSize:9}}>({a.type} / {a.sub})</span></div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>startEditAccount(a)} style={{background:"none",border:"none",color:"#5A6480",fontSize:10,cursor:"pointer"}}>Edit</button>
                <button onClick={()=>deleteAccount(a.code)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          ))}

          <div style={{fontSize:10,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginTop:14,marginBottom:6}}>Default Accounts (Reference)</div>
          {COA.map(a=>(
            <div key={a.code} style={{display:"flex",justifyContent:"space-between",padding:"5px 10px",fontSize:10,color:"#5A6480",borderBottom:"1px solid #14192a"}}>
              <span>{a.code} {a.name}</span><span>{a.type} / {a.sub}</span>
            </div>
          ))}
        </div>
      )}

      {tab==="entry"&&(
        <div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <div style={{flex:1}}><label style={S.lbl}>Date</label><input type="date" style={S.inp} value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div style={{flex:2}}><label style={S.lbl}>Narration</label><input style={S.inp} value={narration} onChange={e=>setNarration(e.target.value)} placeholder="e.g. Purchased building - cash + bank loan"/></div>
          </div>
          <label style={S.lbl}>Lines (select account, enter Debit OR Credit)</label>
          {lines.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
              <select style={{...S.inp,flex:2}} value={l.accountCode} onChange={e=>updateLine(i,"accountCode",e.target.value)}>
                <option value="">Select account...</option>
                {accounts.map(a=><option key={a.code} value={a.code} style={{background:"#0a0e1a"}}>{a.code} - {a.name} ({a.type})</option>)}
              </select>
              <input style={{...S.inp,flex:1}} type="number" placeholder="Debit" value={l.debit||""} onChange={e=>updateLine(i,"debit",e.target.value)}/>
              <input style={{...S.inp,flex:1}} type="number" placeholder="Credit" value={l.credit||""} onChange={e=>updateLine(i,"credit",e.target.value)}/>
              {lines.length>2&&<button onClick={()=>removeLine(i)} style={{background:"none",border:"none",color:"#3A4060",fontSize:14,cursor:"pointer",padding:"0 4px"}}>x</button>}
            </div>
          ))}
          <button onClick={addLine} style={{...S.hBtn,marginBottom:10}}>+ Add Line</button>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:"#0a0e1a",borderRadius:5,marginBottom:10,fontSize:11}}>
            <span style={{color:"#A0AAC0"}}>Total Debit: <strong style={{color:"#F1F5F9"}}>{fmt(totalDebit)}</strong></span>
            <span style={{color:"#A0AAC0"}}>Total Credit: <strong style={{color:"#F1F5F9"}}>{fmt(totalCredit)}</strong></span>
            <span style={{color:balanced?"#10B981":"#EF4444",fontWeight:700}}>{balanced?"Balanced":"Not Balanced"}</span>
          </div>
          <button onClick={postManual} disabled={!balanced} style={{...S.pBtn,marginTop:0,opacity:balanced?1:0.4}}>Post Journal Entry</button>
        </div>
      )}

      {tab==="journal"&&(
        <div>
          {!entries.length?(
            <div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:12}}>No journal entries yet.</div></div>
          ):entries.slice().reverse().map(e=>(
            <div key={e.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <div><span style={{fontSize:10,color:"#5A6480"}}>{e.date}</span> - <span style={{fontSize:11,color:"#F1F5F9",fontWeight:600}}>{e.narration}</span></div>
                <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer"}}>Delete</button>
              </div>
              {e.lines.map((l,i)=>{const acc=accounts.find(a=>a.code===l.accountCode);return(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#A0AAC0",padding:"2px 0"}}>
                  <span>{acc?.code} {acc?.name||"(unknown account "+l.accountCode+")"}</span>
                  <span>{l.debit>0?"Dr "+fmt(l.debit):""}{l.credit>0?"Cr "+fmt(l.credit):""}</span>
                </div>
              );})}
            </div>
          ))}
        </div>
      )}

      {tab==="trial"&&(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              {["Code","Account","Type","Debit","Credit"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",borderBottom:"2px solid #14B8A633",color:"#14B8A6",fontWeight:700,fontSize:9,textTransform:"uppercase",background:"#0d1220"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {accounts.map(a=>{
                const b=stmts.bal[a.code]||0;
                if(b===0)return null;
                const isDebitNormal=["Asset","Expense"].includes(a.type);
                const dr=isDebitNormal?(b>0?b:0):(b<0?-b:0);
                const cr=isDebitNormal?(b<0?-b:0):(b>0?b:0);
                return(
                  <tr key={a.code}>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#5A6480"}}>{a.code}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#F1F5F9"}}>{a.name}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#8892B0"}}>{a.type}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#A0AAC0"}}>{dr>0?fmt(dr):""}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#A0AAC0"}}>{cr>0?fmt(cr):""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!entries.length&&<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}>No entries posted yet.</div>}
        </div>
      )}

      {tab==="pnl"&&(
        <div>
          <div style={{fontSize:12,fontWeight:800,color:"#14B8A6",marginBottom:8}}>Profit & Loss Statement</div>
          <div style={{fontSize:10,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:4}}>Income</div>
          {stmts.income.map(a=><div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",color:"#A0AAC0"}}><span>{a.name}</span><span>{fmt(a.balance)}</span></div>)}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,padding:"4px 0",borderTop:"1px solid #1a2030",color:"#F1F5F9"}}><span>Total Income</span><span>{fmt(stmts.totalIncome)}</span></div>
          <div style={{fontSize:10,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginTop:10,marginBottom:4}}>Expenses</div>
          {stmts.expense.map(a=><div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",color:"#A0AAC0"}}><span>{a.name}</span><span>{fmt(a.balance)}</span></div>)}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,padding:"4px 0",borderTop:"1px solid #1a2030",color:"#F1F5F9"}}><span>Total Expenses</span><span>{fmt(stmts.totalExpense)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:800,padding:"10px 0",marginTop:8,borderTop:"2px solid #14B8A6",color:stmts.netProfit>=0?"#10B981":"#EF4444"}}><span>Net {stmts.netProfit>=0?"Profit":"Loss"}</span><span>{fmt(stmts.netProfit)}</span></div>
          {!entries.length&&<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}>No entries posted yet.</div>}
        </div>
      )}

      {tab==="bs"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#14B8A6",marginBottom:8}}>Assets</div>
            {["Current Asset","Fixed Asset"].map(sub=>{const items=stmts.assets.filter(a=>a.sub===sub);if(!items.length)return null;return(
              <div key={sub} style={{marginBottom:8}}>
                <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>{sub}</div>
                {items.map(a=><div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#A0AAC0"}}><span>{a.name}</span><span>{fmt(a.balance)}</span></div>)}
              </div>
            );})}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,padding:"8px 0",borderTop:"2px solid #14B8A6",color:"#F1F5F9"}}><span>Total Assets</span><span>{fmt(stmts.totalAssets)}</span></div>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#14B8A6",marginBottom:8}}>Liabilities & Equity</div>
            {["Current Liability","Long-term Liability"].map(sub=>{const items=stmts.liabilities.filter(a=>a.sub===sub);if(!items.length)return null;return(
              <div key={sub} style={{marginBottom:8}}>
                <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>{sub}</div>
                {items.map(a=><div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#A0AAC0"}}><span>{a.name}</span><span>{fmt(a.balance)}</span></div>)}
              </div>
            );})}
            <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3,marginTop:8}}>Equity</div>
            {stmts.equity.map(a=><div key={a.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#A0AAC0"}}><span>{a.name}</span><span>{fmt(a.balance)}</span></div>)}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#A0AAC0"}}><span>Retained Earnings (Current Period)</span><span>{fmt(stmts.netProfit)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,padding:"8px 0",borderTop:"2px solid #14B8A6",color:"#F1F5F9"}}><span>Total Liabilities + Equity</span><span>{fmt(stmts.totalLiabilities+stmts.totalEquity)}</span></div>
          </div>
          {!entries.length&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"30px",color:"#5A6480"}}>No entries posted yet.</div>}
        </div>
      )}
    </div>
  );
}

function AnswerBox({onSubmit,disabled,S}:{onSubmit:(t:string)=>void,disabled:boolean,S:any}){
  const [val,setVal]=useState("");
  return(
    <div style={{display:"flex",gap:6}}>
      <input style={{...S.inp,flex:1}} value={val} onChange={e=>setVal(e.target.value)} placeholder="Type your answer..." disabled={disabled} onKeyDown={e=>{if(e.key==="Enter"&&val.trim()){onSubmit(val.trim());setVal("");}}}/>
      <button onClick={()=>{if(val.trim()){onSubmit(val.trim());setVal("");}}} disabled={disabled||!val.trim()} style={{...S.pBtn,width:"auto",padding:"8px 16px",marginTop:0,opacity:disabled||!val.trim()?0.4:1}}>{disabled?"...":"Answer"}</button>
    </div>
  );
}
