import React, { useEffect, useMemo, useState } from "react";
import { buildProjectReport, inputsFromDecision, defaultInputs, TAX_BY_CONSTITUTION, amt, moneyUnit, type DprInputs, type DprSources, type Constitution } from "./lib/ProjectReport";
import { buildReportDocument, parseResearch, researchQuestion, RESEARCH_JSON_PROMPT, type Research } from "./lib/ProjectReportDocument";
import { renderPdf, renderWordHtml } from "./lib/ProjectReportRender";
import { parseMoney } from "./lib/GuidedInterview";
import { cockpitContext } from "./lib/DecisionExports";

// BANK PROJECT REPORT (DPR) / CREDIT APPRAISAL. Pre-fills from the Boardroom decision,
// lets the user complete what a bank needs, shows the lender's view live, optionally runs
// sourced compliance + news research, and downloads a bank-format PDF or an editable Word file.
type ResearchFn = (question: string) => Promise<{ text: string; grounded: boolean }>;
const loadScript = (src: string) => new Promise<void>((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) { res(); return; } const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });
async function getPdfLib(): Promise<any> {
  const w: any = window;
  if (!w.jspdf?.jsPDF) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if (!w.jspdf?.jsPDF?.API?.autoTable) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  if (!w.jspdf?.jsPDF?.API?.autoTable) throw new Error("The PDF table component did not load. Check your connection and try again, or use the Word download.");
  return w.jspdf.jsPDF;
}
const download = (name: string, blob: Blob) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };

type F = { k: keyof DprInputs; label: string; kind: "money" | "num" | "text" | "pct"; hint?: string };
const GROUPS: { title: string; fields: F[]; advanced?: boolean }[] = [
  { title: "1. About the applicant", fields: [{ k: "businessName", label: "Business name", kind: "text" }, { k: "promoters", label: "Promoter(s) and experience", kind: "text", hint: "Names, qualifications, years in this line, net worth. Banks lend to people as much as to projects." },
    { k: "activity", label: "What the business does", kind: "text" }, { k: "location", label: "City / district", kind: "text" }, { k: "state", label: "State", kind: "text" }, { k: "country", label: "Country", kind: "text" }, { k: "employees", label: "People to be employed", kind: "num" }] },
  { title: "2. Cost of the project", fields: [{ k: "land", label: "Land", kind: "money" }, { k: "building", label: "Building / civil works", kind: "money" }, { k: "machinery", label: "Plant, machinery & equipment", kind: "money", hint: "Use supplier quotations: banks ask for them." },
    { k: "otherAssets", label: "Other assets (furniture, vehicles, computers)", kind: "money" }, { k: "preOperative", label: "Pre-operative expenses", kind: "money", hint: "Registrations, trial runs, interest during construction." }, { k: "contingencyPct", label: "Contingency %", kind: "pct" }] },
  { title: "3. Loan and other finance", fields: [{ k: "termLoan", label: "Term loan you are asking for", kind: "money" }, { k: "interestRate", label: "Interest rate % p.a.", kind: "pct" }, { k: "tenureYears", label: "Repayment period (years)", kind: "num" },
    { k: "moratoriumMonths", label: "Moratorium (months)", kind: "num", hint: "Months after the loan starts when only interest is paid." }, { k: "subsidy", label: "Capital subsidy", kind: "money" }, { k: "unsecuredLoans", label: "Unsecured loans from promoters / family", kind: "money" }, { k: "collateralValue", label: "Collateral offered (value)", kind: "money" }] },
  { title: "4. Sales and costs", fields: [{ k: "steadyMonthlyRevenue", label: "Monthly sales once running normally", kind: "money" }, { k: "variableCostPct", label: "Costs that rise with sales (% of sales)", kind: "pct" },
    { k: "monthlyFixedCost", label: "Fixed costs per month (rent, salaries, utilities)", kind: "money" }, { k: "growthPct", label: "Yearly sales growth %", kind: "pct" }, { k: "costInflationPct", label: "Yearly increase in fixed costs %", kind: "pct" }] },
  { title: "5. Working capital, tax and accounting", advanced: true, fields: [{ k: "receivableDays", label: "Days customers take to pay", kind: "num" }, { k: "inventoryDays", label: "Days of stock held", kind: "num" }, { k: "payableDays", label: "Days suppliers give you", kind: "num" },
    { k: "ccRate", label: "Working-capital interest %", kind: "pct" }, { k: "bankWcSharePct", label: "Bank finance of current assets %", kind: "pct" }, { k: "taxRatePct", label: "Income-tax rate %", kind: "pct" },
    { k: "lifeBuilding", label: "Building life (years)", kind: "num" }, { k: "lifeMachinery", label: "Machinery life (years)", kind: "num" }, { k: "lifeOther", label: "Other assets life (years)", kind: "num" }, { k: "preOpYears", label: "Write off pre-operative over (years)", kind: "num" }, { k: "years", label: "Years to project", kind: "num" }, { k: "discountRatePct", label: "Discount rate for NPV %", kind: "pct" }] },
];

export default function ProjectReportView({ cur, si, tok, company, location, currency, showToast, research, standalone }:
  { cur?: any; si?: number; tok: any; company?: string; location?: string; currency?: string; showToast?: (m: string, k?: string) => void; research?: ResearchFn; standalone?: boolean }) {
  const ctx = useMemo(() => { try { return cur && si !== undefined && si >= 0 ? cockpitContext(cur, si, { location: location || "" }) : null; } catch { return null; } }, [cur, si, location]);
  const storeKey = "oiq-dpr-" + (cur?.sessionId ?? "standalone");
  const seed = useMemo(() => { const s = inputsFromDecision(ctx, { company, location }); if (currency && currency !== "INR") s.inputs.currency = currency; return s; }, [ctx, company, location, currency]);
  const [I, setI] = useState<DprInputs>(() => { try { const v = localStorage.getItem(storeKey); if (v) return { ...seed.inputs, ...JSON.parse(v).inputs }; } catch {} return seed.inputs; });
  const [S, setS] = useState<DprSources>(() => { try { const v = localStorage.getItem(storeKey); if (v) return { ...seed.sources, ...JSON.parse(v).sources }; } catch {} return seed.sources; });
  const [R, setR] = useState<Research | null>(() => { try { const v = localStorage.getItem(storeKey); if (v) return JSON.parse(v).research || null; } catch {} return null; });
  const [aud, setAud] = useState<"applicant" | "lender">("applicant");
  const [open, setOpen] = useState(!!standalone); const [adv, setAdv] = useState(false); const [busy, setBusy] = useState(""); const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify({ inputs: I, sources: S, research: R })); } catch {} }, [I, S, R, storeKey]);
  const res = useMemo(() => buildProjectReport(I), [I]);
  const U = moneyUnit(I.currency || "INR");
  const set = (k: keyof DprInputs, v: any) => { setI((p) => { const n: any = { ...p, [k]: v }; if (k === "constitution" && S.taxRatePct !== "YOUR INPUT") n.taxRatePct = TAX_BY_CONSTITUTION[v as Constitution]; return n; }); setS((p) => ({ ...p, [k]: "YOUR INPUT" })); };
  const toast = (m: string, k = "info") => { try { showToast && showToast(m, k); } catch {} };

  const runResearch = async () => {
    if (!research) return; setBusy("research");
    try { const out = await research(researchQuestion(I)); const parsed = parseResearch(out.text, out.grounded); setR(parsed);
      toast(parsed.note ? parsed.note : "Added " + parsed.compliance.length + " compliance items, " + parsed.developments.length + " developments and " + parsed.schemes.length + " schemes" + (out.grounded ? " from live research." : " (no live search was available - marked for verification)."), parsed.note ? "warning" : "success");
    } catch (e: any) { toast("Research failed: " + (e?.message || e) + ". The report still works with the built-in checklist.", "warning"); }
    setBusy("");
  };
  const doc = () => buildReportDocument({ inputs: I, sources: S, ctx, cur, research: R, audience: aud }).doc;
  const fileBase = (aud === "lender" ? "Credit-Appraisal-" : "Project-Report-") + (I.businessName || "Project").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40);
  const pdf = async () => { setBusy("pdf"); try { const jsPDF = await getPdfLib(); const d = renderPdf(jsPDF, doc()); download(fileBase + ".pdf", d.output("blob")); toast("PDF downloaded.", "success"); } catch (e: any) { toast(String(e?.message || e), "warning"); } setBusy(""); };
  const word = () => { try { download(fileBase + ".doc", new Blob(["\ufeff" + renderWordHtml(doc())], { type: "application/msword" })); toast("Word file downloaded - open it in Word or Google Docs to edit.", "success"); } catch (e: any) { toast(String(e?.message || e), "warning"); } };
  const reset = () => { setI(seed.inputs); setS(seed.sources); setR(null); setDrafts({}); };

  const verdictColor = /^BANKABLE \(/.test(res.verdict.label) ? tok.success : /CONDITIONS/.test(res.verdict.label) ? tok.warn : tok.danger;
  const card: React.CSSProperties = { borderRadius: 14, border: "1px solid " + tok.border, background: tok.surface, padding: "16px 18px" };
  const btn = (primary = false, disabled = false): React.CSSProperties => ({ minHeight: 42, padding: "0 16px", borderRadius: 10, border: "1px solid " + (primary ? tok.accent : tok.border), background: primary ? tok.accent : tok.surface, color: primary ? "#fff" : tok.text, fontWeight: 700, fontSize: 13.5, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 });
  const srcPill = (k: keyof DprInputs) => { const s = S[k]; if (!s) return null; const est = s === "ASSUMPTION"; return <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: est ? "#FEF3C7" : s === "STANDARD ASSUMPTION" ? tok.surface2 : "#DBEAFE", color: est ? "#78350F" : s === "STANDARD ASSUMPTION" ? tok.text3 : "#1E3A8A" }}>{s === "FROM YOUR DECISION" ? "FROM YOUR DECISION" : s === "STANDARD ASSUMPTION" ? "STANDARD" : s === "ASSUMPTION" ? "ESTIMATE" : "YOUR INPUT"}</span>; };

  if (!open) return (
    <div data-testid="dpr-card" style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "14px 0" }}>
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: tok.text, fontSize: 15 }}>Bank loan project report</div>
        <div style={{ fontSize: 13.5, color: tok.text2 }}>Turn this decision into a bank-format Detailed Project Report (cost of project, projections, DSCR, repayment, compliance, recent developments) or a lender's appraisal note.</div>
      </div>
      <button data-testid="dpr-open" onClick={() => setOpen(true)} style={btn(true)}>Prepare the report</button>
    </div>);

  return (
    <section data-testid="dpr" aria-label="Bank project report" style={{ ...card, margin: "14px 0", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div><div style={{ fontWeight: 800, fontSize: 17, color: tok.text }}>{aud === "lender" ? "Credit appraisal of a loan proposal" : "Bank loan project report (DPR)"}</div>
          <div style={{ fontSize: 13, color: tok.text3 }}>{ctx ? "Pre-filled from your Boardroom decision. Complete the rest; every figure keeps its source label." : "Enter the proposal's figures; the report and the lender's view update as you type."}</div></div>
        <div role="group" aria-label="Who is this for" style={{ display: "flex", gap: 6 }}>
          <button aria-pressed={aud === "applicant"} onClick={() => setAud("applicant")} style={btn(aud === "applicant")}>I'm applying for a loan</button>
          <button aria-pressed={aud === "lender"} onClick={() => setAud("lender")} style={btn(aud === "lender")}>I'm a banker / lender</button>
        </div>
      </div>

      {/* Live lender view */}
      <div data-testid="dpr-verdict" style={{ borderRadius: 12, border: "2px solid " + verdictColor, padding: "12px 14px", background: tok.surface2 }}>
        <div style={{ fontWeight: 800, color: verdictColor, fontSize: 15 }}>{res.verdict.label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
          {[["Project cost", amt(res.projectCost.total, I.currency) + " " + U.label], ["Your contribution", res.meansOfFinance.promoterPct.toFixed(1) + "%"], ["Average DSCR", res.dscr.average === null ? "no loan" : res.dscr.average.toFixed(2)],
            ["Lowest DSCR", res.dscr.minimum === null ? "\u2014" : res.dscr.minimum.toFixed(2)], ["Break-even", isFinite(res.bep.pctOfSales) ? res.bep.pctOfSales.toFixed(0) + "% of sales" : "not reached"], ["Cash", res.fundingShortfallYear ? "short in year " + res.fundingShortfallYear : "enough every year"]]
            .map(([k, v]) => <div key={k}><div style={{ fontSize: 11.5, color: tok.text3 }}>{k}</div><div style={{ fontWeight: 700, color: tok.text, fontSize: 14.5 }}>{v}</div></div>)}
        </div>
        {res.verdict.reasons.length > 0 && !/^BANKABLE \(/.test(res.verdict.label) && <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: tok.text2, fontSize: 13 }}>{res.verdict.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>}
        <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 6 }}>Indicative, against typical lending norms. Each bank applies its own credit policy.</div>
      </div>

      {GROUPS.filter((g) => !g.advanced || adv).map((g) => (
        <fieldset key={g.title} style={{ border: "1px solid " + tok.border, borderRadius: 12, padding: "10px 12px", margin: 0 }}>
          <legend style={{ fontWeight: 700, color: tok.text, fontSize: 14, padding: "0 6px" }}>{g.title}</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            {g.fields.map((f) => {
              const v: any = (I as any)[f.k]; const id = "dpr-" + String(f.k); const draft = drafts[f.k as string];
              const shown = draft !== undefined ? draft : f.kind === "money" ? (v ? String(Math.round(v)) : "") : v === 0 && f.kind !== "pct" && f.kind !== "num" ? "" : String(v ?? "");
              const parsed = f.kind === "money" && draft ? parseMoney(draft) : null;
              return (<div key={String(f.k)} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <label htmlFor={id} style={{ fontSize: 12.5, color: tok.text2 }}>{f.label}{srcPill(f.k)}</label>
                <input id={id} value={shown} inputMode={f.kind === "text" ? "text" : f.kind === "money" ? "text" : "decimal"} placeholder={f.kind === "money" ? "e.g. 15 lakh" : ""}
                  onChange={(e) => { const t = e.target.value; if (f.kind === "text") { set(f.k, t); return; } setDrafts((d) => ({ ...d, [f.k as string]: t }));
                    const n = f.kind === "money" ? parseMoney(t) : parseFloat(t.replace(/[,%]/g, "")); if (t.trim() === "") set(f.k, 0); else if (n !== null && isFinite(n as number) && (n as number) >= 0) set(f.k, n); }}
                  onBlur={() => setDrafts((d) => { const n = { ...d }; delete n[f.k as string]; return n; })}
                  style={{ minHeight: 40, padding: "0 10px", borderRadius: 8, border: "1px solid " + tok.border, background: tok.inputBg, color: tok.text, fontSize: 14 }} />
                {f.kind === "money" && <span style={{ fontSize: 11.5, color: tok.text3 }}>{parsed !== null && draft ? "= " + amt(parsed, I.currency) + " " + U.label : v ? amt(v, I.currency) + " " + U.label : ""}</span>}
                {f.hint && <span style={{ fontSize: 11.5, color: tok.text3 }}>{f.hint}</span>}
              </div>);
            })}
            {g.title.startsWith("1.") && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><label htmlFor="dpr-constitution" style={{ fontSize: 12.5, color: tok.text2 }}>Constitution{srcPill("constitution")}</label>
              <select id="dpr-constitution" value={I.constitution} onChange={(e) => set("constitution", e.target.value)} style={{ minHeight: 40, borderRadius: 8, border: "1px solid " + tok.border, background: tok.inputBg, color: tok.text, padding: "0 8px" }}>
                {(["Proprietorship", "Partnership", "LLP", "Private Limited", "Other"] as Constitution[]).map((c) => <option key={c}>{c}</option>)}</select></div>}
            {g.title.startsWith("3.") && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><label htmlFor="dpr-repayment" style={{ fontSize: 12.5, color: tok.text2 }}>Repayment style{srcPill("repayment")}</label>
              <select id="dpr-repayment" value={I.repayment} onChange={(e) => set("repayment", e.target.value)} style={{ minHeight: 40, borderRadius: 8, border: "1px solid " + tok.border, background: tok.inputBg, color: tok.text, padding: "0 8px" }}>
                <option value="equal-principal">Equal monthly principal</option><option value="emi">EMI (equal instalments)</option></select></div>}
            {g.title.startsWith("4.") && [0, 1, 2].map((i) => <div key={"r" + i} style={{ display: "flex", flexDirection: "column", gap: 3 }}><label htmlFor={"dpr-ramp" + i} style={{ fontSize: 12.5, color: tok.text2 }}>Year {i + 1}{i === 2 ? "+" : ""}: % of normal sales{i === 0 ? srcPill("ramp") : null}</label>
              <input id={"dpr-ramp" + i} inputMode="decimal" value={String(I.ramp[i])} onChange={(e) => { const n = parseFloat(e.target.value); const r = [...I.ramp] as [number, number, number]; r[i] = isFinite(n) ? Math.max(0, Math.min(150, n)) : 0; set("ramp", r); }}
                style={{ minHeight: 40, padding: "0 10px", borderRadius: 8, border: "1px solid " + tok.border, background: tok.inputBg, color: tok.text, fontSize: 14 }} /></div>)}
          </div>
        </fieldset>))}
      <button onClick={() => setAdv(!adv)} aria-expanded={adv} style={{ alignSelf: "flex-start", border: "none", background: "none", color: tok.accent, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13.5 }}>{adv ? "Hide" : "Show"} working capital, tax and accounting settings</button>

      <div style={{ borderRadius: 12, background: tok.surface2, padding: "12px 14px", fontSize: 13.5, color: tok.text2 }}>
        <b style={{ color: tok.text }}>Compliance and recent developments.</b> {R ? (R.compliance.length + " compliance items, " + R.developments.length + " developments and " + R.schemes.length + " schemes added " + (R.grounded ? "from live research with sources" : "without live search (marked to verify)") + " on " + new Date(R.ranAt).toLocaleDateString("en-IN") + ".")
          : "The report includes a built-in compliance checklist for this type of business. Add live research for current rules, news, new technology and schemes, each with its source."}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {research && <button data-testid="dpr-research" disabled={!!busy} onClick={runResearch} style={btn(false, !!busy)}>{busy === "research" ? "Researching\u2026 (about a minute)" : R ? "Refresh research" : "Research compliance & recent news"}</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button data-testid="dpr-pdf" disabled={!!busy} onClick={pdf} style={btn(true, !!busy)}>{busy === "pdf" ? "Preparing PDF\u2026" : "Download PDF (bank format)"}</button>
        <button data-testid="dpr-word" disabled={!!busy} onClick={word} style={btn(false, !!busy)}>Download Word (editable)</button>
        <button onClick={reset} style={{ ...btn(), border: "none", background: "transparent", color: tok.text3 }}>Reset to decision figures</button>
        {!standalone && <button onClick={() => setOpen(false)} style={{ ...btn(), border: "none", background: "transparent", color: tok.text3 }}>Close</button>}
      </div>
      {!res.checks.every((c) => c.pass) && <div role="alert" style={{ color: tok.danger, fontSize: 13 }}>Model check: {res.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")}. Fix the figures above before submitting.</div>}
      <div style={{ fontSize: 11.5, color: tok.text3 }}>Financial statements are calculated, not written by AI. Have the projections certified by a Chartered Accountant if your bank requires it, and confirm the compliance list for your state.</div>
    </section>);
}
