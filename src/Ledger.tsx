import { useState, useEffect } from "react";

// ─── CHART OF ACCOUNTS ──────────────────────────────────────────────────────
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

// ─── TYPES ──────────────────────────────────────────────────────────────────
export interface JournalLine{accountCode:string;debit:number;credit:number;}
export interface JournalEntry{id:number;date:string;narration:string;lines:JournalLine[];}

// ─── LEDGER COMPUTATION ─────────────────────────────────────────────────────
export function computeBalances(entries:JournalEntry[]){
  const balances:Record<string,number>={};
  COA.forEach(a=>balances[a.code]=0);
  entries.forEach(e=>{
    e.lines.forEach(l=>{
      const acc=COA.find(a=>a.code===l.accountCode);
      if(!acc)return;
      const normalSide=["Asset","Expense"].includes(acc.type)?"debit":"credit";
      const net=l.debit-l.credit;
      balances[l.accountCode]+=normalSide==="debit"?net:-net;
    });
  });
  return balances;
}

export function computeStatements(entries:JournalEntry[]){
  const bal=computeBalances(entries);
  const byType=(type:string)=>COA.filter(a=>a.type===type).map(a=>({...a,balance:bal[a.code]||0})).filter(a=>a.balance!==0);
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

// ─── COMPONENT ──────────────────────────────────────────────────────────────
export default function Ledger({cur,entries,setEntries,sv,S,showToast}:{cur:any,entries:JournalEntry[],setEntries:(e:JournalEntry[])=>void,sv:(k:string,v:any)=>void,S:any,showToast:(m:string,t?:string)=>void}){
  const [tab,setTab]=useState("entry");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [narration,setNarration]=useState("");
  const [lines,setLines]=useState<JournalLine[]>([{accountCode:"",debit:0,credit:0},{accountCode:"",debit:0,credit:0}]);

  const addLine=()=>setLines([...lines,{accountCode:"",debit:0,credit:0}]);
  const removeLine=(i:number)=>setLines(lines.filter((_,idx)=>idx!==i));
  const updateLine=(i:number,field:string,val:any)=>{
    const nl=[...lines];(nl[i] as any)[field]=field==="accountCode"?val:Number(val)||0;setLines(nl);
  };

  const totalDebit=lines.reduce((s,l)=>s+l.debit,0);
  const totalCredit=lines.reduce((s,l)=>s+l.credit,0);
  const balanced=totalDebit===totalCredit&&totalDebit>0;

  const postEntry=()=>{
    if(!balanced){showToast("Debits must equal credits","error");return;}
    const validLines=lines.filter(l=>l.accountCode&&(l.debit>0||l.credit>0));
    if(validLines.length<2){showToast("Need at least 2 valid lines","error");return;}
    const entry:JournalEntry={id:Date.now(),date,narration:narration||"(no narration)",lines:validLines};
    const updated=[...entries,entry];
    setEntries(updated);sv("cos-ledger",updated);
    setNarration("");setLines([{accountCode:"",debit:0,credit:0},{accountCode:"",debit:0,credit:0}]);
    showToast("Journal entry posted ✓","success");
  };

  const deleteEntry=(id:number)=>{
    const updated=entries.filter(e=>e.id!==id);
    setEntries(updated);sv("cos-ledger",updated);
  };

  const stmts=computeStatements(entries);
  const fmt=(n:number)=>cur.sym+Math.abs(n).toLocaleString("en-IN",{maximumFractionDigits:0});

  return(
    <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
      <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>General Ledger</h2>
      <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Double-entry bookkeeping · Currency: <strong style={{color:"#14B8A6"}}>{cur.sym} {cur.code}</strong></p>

      <div style={{display:"flex",gap:3,marginBottom:12,flexWrap:"wrap"}}>
        {[["entry","Journal Entry"],["journal","All Entries ("+entries.length+")"],["trial","Trial Balance"],["pnl","P&L"],["bs","Balance Sheet"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(tab===id?"#14B8A6":"#1a2030"),background:tab===id?"rgba(20,184,166,0.08)":"transparent",color:tab===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
        ))}
      </div>

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
                <option value="">Select account…</option>
                {COA.map(a=><option key={a.code} value={a.code} style={{background:"#0a0e1a"}}>{a.code} · {a.name} ({a.type})</option>)}
              </select>
              <input style={{...S.inp,flex:1}} type="number" placeholder="Debit" value={l.debit||""} onChange={e=>updateLine(i,"debit",e.target.value)}/>
              <input style={{...S.inp,flex:1}} type="number" placeholder="Credit" value={l.credit||""} onChange={e=>updateLine(i,"credit",e.target.value)}/>
              {lines.length>2&&<button onClick={()=>removeLine(i)} style={{background:"none",border:"none",color:"#3A4060",fontSize:14,cursor:"pointer",padding:"0 4px"}}>×</button>}
            </div>
          ))}
          <button onClick={addLine} style={{...S.hBtn,marginBottom:10}}>+ Add Line</button>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:"#0a0e1a",borderRadius:5,marginBottom:10,fontSize:11}}>
            <span style={{color:"#A0AAC0"}}>Total Debit: <strong style={{color:"#F1F5F9"}}>{fmt(totalDebit)}</strong></span>
            <span style={{color:"#A0AAC0"}}>Total Credit: <strong style={{color:"#F1F5F9"}}>{fmt(totalCredit)}</strong></span>
            <span style={{color:balanced?"#10B981":"#EF4444",fontWeight:700}}>{balanced?"✓ Balanced":"⚠ Not Balanced"}</span>
          </div>
          <button onClick={postEntry} disabled={!balanced} style={{...S.pBtn,marginTop:0,opacity:balanced?1:0.4}}>Post Journal Entry</button>
        </div>
      )}

      {tab==="journal"&&(
        <div>
          {!entries.length?(
            <div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:28,marginBottom:8}}>📒</div><div style={{fontSize:12}}>No journal entries yet.</div></div>
          ):entries.slice().reverse().map(e=>(
            <div key={e.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <div><span style={{fontSize:10,color:"#5A6480"}}>{e.date}</span> · <span style={{fontSize:11,color:"#F1F5F9",fontWeight:600}}>{e.narration}</span></div>
                <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer"}}>Delete</button>
              </div>
              {e.lines.map((l,i)=>{const acc=COA.find(a=>a.code===l.accountCode);return(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#A0AAC0",padding:"2px 0"}}>
                  <span>{acc?.code} {acc?.name}</span>
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
              {COA.map(a=>{
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
