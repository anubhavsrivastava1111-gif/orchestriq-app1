// BANK PROJECT REPORT - DOCUMENT. Turns the deterministic DPR result, the Boardroom
// decision and (optional) live compliance/news research into one ordered document.
// Renderer-neutral: the same blocks become the PDF and the Word file, so the two can
// never differ. Every statement carries where it came from.
import { buildProjectReport, sensitivity, amt, moneyUnit, TYPICAL_NORMS, type DprInputs, type DprResult, type DprSources } from "./ProjectReport";
import { detectArchetype, type Archetype } from "./GuidedInterview";

export type Block =
  | { t: "h1"; text: string } | { t: "h2"; text: string } | { t: "p"; text: string; tone?: "note" | "warn" }
  | { t: "ul"; items: string[] } | { t: "kv"; rows: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string; boldLast?: boolean } | { t: "pagebreak" };
export interface ReportDoc { title: string; subtitle: string; meta: [string, string][]; blocks: Block[]; toc: string[] }

// ── COMPLIANCE ─────────────────────────────────────────────────────────────
export interface ComplianceItem { name: string; authority: string; when: string; stage: "Before starting" | "Before operations" | "Ongoing"; basis: "Checklist" | "Sourced" | "Verify"; source?: string }
// Indicative checklist for India. Thresholds and state rules change: every item tells the
// user to confirm, and the report recommends CA / legal sign-off. Never presented as complete.
export function complianceBaseline(arch: Archetype, I: DprInputs, activity: string): ComplianceItem[] {
  const C = (name: string, authority: string, when: string, stage: ComplianceItem["stage"]): ComplianceItem => ({ name, authority, when, stage, basis: "Checklist" });
  const a = (activity || "").toLowerCase();
  if (!/^india$/i.test(I.country || "India")) return [
    C("Business registration / incorporation", "Company registry of " + I.country, "Before trading", "Before starting"),
    C("Tax registration (income tax, VAT / sales tax / GST equivalent)", "National and local tax authorities", "Before invoicing; thresholds vary", "Before operations"),
    C("Employer registration, payroll taxes and social security", "Labour / tax authority", "Before hiring the first employee", "Before operations"),
    C("Health & safety and fire approval of the premises", "Local authority / fire service", "Before occupying the premises", "Before operations"),
    C("Environmental permits (emissions, waste, water)", "Environmental regulator", "If the activity discharges or stores regulated materials", "Before operations"),
    C("Sector licence for this activity", "Sector regulator", "Depends on the activity \u2014 confirm locally", "Before operations"),
    C("Data protection (e.g. GDPR in the EU/UK)", "Data protection authority", "If personal data of customers or staff is processed", "Ongoing"),
  ].map((x) => ({ ...x, basis: "Verify" as const }));
  const L: ComplianceItem[] = [
    C("PAN of the business (and TAN for tax deducted at source)", "Income Tax Department", "Always", "Before starting"),
    C(I.constitution === "Private Limited" ? "Company incorporation (MCA)" : I.constitution === "LLP" ? "LLP registration (MCA)" : I.constitution === "Partnership" ? "Partnership deed and registration with the Registrar of Firms" : "Proprietorship proof (registrations below serve as proof)", I.constitution === "Private Limited" || I.constitution === "LLP" ? "Ministry of Corporate Affairs" : "State Registrar / local bodies", "Always", "Before starting"),
    C("Udyam (MSME) registration", "Ministry of MSME (Udyam portal)", "Recommended for MSMEs \u2014 needed for priority-sector lending, CGTMSE cover and most schemes", "Before starting"),
    C("GST registration", "GST Network", "Mandatory above the turnover threshold (commonly \u20b940 lakh for goods / \u20b920 lakh for services; lower in some states) or for inter-state / e-commerce supply", "Before operations"),
    C("Shops & Establishments registration", "State Labour Department", "For premises in most states", "Before operations"),
    C("Trade licence", "Municipal corporation / local body", "Most commercial activities", "Before operations"),
    C("Professional tax registration", "State Commercial Tax Department", "In states that levy it", "Ongoing"),
    C("EPF registration", "EPFO", "Once 20 or more employees (voluntary below)", "Ongoing"),
    C("ESI registration", "ESIC", "Once 10 or more employees in notified areas, within the wage ceiling", "Ongoing"),
    C("Labour law compliance (wages, bonus, gratuity, working hours) under the Labour Codes and state rules", "Central & State Labour Departments", "From the first employee", "Ongoing"),
    C("Fire safety NOC", "State Fire Service", "For premises above prescribed size/occupancy, and most factories, kitchens and storage", "Before operations"),
  ];
  if (arch === "manufacturing" || arch === "facility" || /plant|unit|factory/.test(a)) L.push(
    C("Consent to Establish and Consent to Operate (CTE / CTO)", "State Pollution Control Board", "Depends on the industry's category (red / orange / green / white)", "Before starting"),
    C("Factory licence and approval of factory building plan", "Chief Inspector of Factories", "With 10+ workers using power (20+ without)", "Before operations"),
    C("Building plan approval / change of land use, occupancy certificate", "Development authority / local body", "For new construction or conversion of agricultural land", "Before starting"),
    C("Electricity connection and sanctioned load; electrical inspector approval", "State electricity distribution company / Electrical Inspectorate", "Before commissioning machinery", "Before operations"));
  if (arch === "manufacturing" || arch === "retail" || /packag|candle|soap|bottl|brand/.test(a)) L.push(
    C("Legal Metrology registration (pre-packaged goods) and labelling", "State Legal Metrology Department", "If goods are sold pre-packed", "Before operations"),
    C("BIS certification", "Bureau of Indian Standards", "If the product is covered by a Quality Control Order", "Before operations"));
  if (arch === "food" || /food|dairy|milk|bakery|cold storage|kitchen|restaurant|caf|sweet|spice|pickle|fruit|vegetable/.test(a)) L.push(
    C("FSSAI registration / licence", "Food Safety and Standards Authority of India", "Basic registration or State/Central licence depending on turnover and activity", "Before operations"));
  if (/cold storage|ammonia|refrigerat/.test(a)) L.push(C("Approval for ammonia/refrigerant installation and safety audit", "Factories Inspectorate / Pollution Control Board", "If ammonia-based refrigeration is used", "Before operations"));
  if (/warehous|cold storage/.test(a)) L.push(C("Warehouse registration (optional) for negotiable warehouse receipts", "Warehousing Development & Regulatory Authority", "If you want to issue receipts that customers can borrow against", "Ongoing"));
  if (/hotel|resort|guest ?house|homestay|restaurant|bar/.test(a)) L.push(C("Police / eating-house licence and tourism registration", "Police Commissionerate / State Tourism Department", "Hotels and eating houses in many cities", "Before operations"),
    C("Liquor licence", "State Excise Department", "Only if alcohol is served", "Before operations"));
  if (/pharma|chemist|medical store|pharmacy/.test(a)) L.push(C("Drug licence (retail / wholesale)", "State Drugs Control Department", "Before selling medicines", "Before operations"));
  if (/clinic|hospital|diagnostic|lab\b/.test(a)) L.push(C("Clinical establishment registration and biomedical waste authorisation", "State Health Department / Pollution Control Board", "For healthcare facilities", "Before operations"));
  if (/online|e-?commerce|app|website|platform|software|saas/.test(a)) L.push(C("Consumer Protection (E-Commerce) Rules compliance", "Department of Consumer Affairs", "If selling online", "Ongoing"));
  L.push(C("Digital Personal Data Protection Act, 2023 and its rules", "Data Protection Board of India", "If you collect personal data of customers or staff", "Ongoing"));
  return L;
}

// ── LIVE RESEARCH (compliance, news, technology, schemes) ───────────────────
export interface Development { title: string; date: string; source: string; url: string; type: string; impact: "positive" | "negative" | "mixed"; effect: string; navigate: string }
export interface Scheme { name: string; benefit: string; eligibility: string; url: string }
export interface Research { compliance: ComplianceItem[]; developments: Development[]; schemes: Scheme[]; grounded: boolean; ranAt: string; note?: string }
export function researchQuestion(I: DprInputs): string {
  return "For a " + (I.activity || "new business") + " in " + [I.location, I.state, I.country].filter(Boolean).join(", ") + ": (1) every statutory licence, registration and compliance requirement, with the authority; "
    + "(2) news, policy and regulatory changes from the last 12 months that affect this business; (3) new technologies changing this industry; (4) government schemes, subsidies or credit guarantees the promoter could use. Give dates and source links.";
}
export const RESEARCH_JSON_PROMPT = "You convert a research brief into JSON for a bank project report. Use ONLY facts stated in the brief. Return ONLY a JSON object, no prose, no markdown fences:\n"
  + "{\"compliance\":[{\"name\":\"\",\"authority\":\"\",\"when\":\"\",\"stage\":\"Before starting|Before operations|Ongoing\",\"source\":\"URL from the brief or empty\"}],"
  + "\"developments\":[{\"title\":\"\",\"date\":\"\",\"source\":\"publisher\",\"url\":\"URL from the brief or empty\",\"type\":\"news|policy|technology|market\",\"impact\":\"positive|negative|mixed\",\"effect\":\"how it affects THIS business, one sentence\",\"navigate\":\"what the promoter should do, one sentence\"}],"
  + "\"schemes\":[{\"name\":\"\",\"benefit\":\"\",\"eligibility\":\"\",\"url\":\"\"}]}\nNever invent a URL, date or figure. If the brief has no source for an item, leave url empty.";
export function parseResearch(text: string, grounded: boolean): Research {
  const empty: Research = { compliance: [], developments: [], schemes: [], grounded, ranAt: new Date().toISOString() };
  try {
    const raw = String(text || "").replace(/```json|```/g, ""); const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s < 0 || e <= s) return { ...empty, note: "The research could not be structured." };
    const j = JSON.parse(raw.slice(s, e + 1)); const url = (u: any) => (/^https?:\/\/\S+\.\S+/.test(String(u || "")) ? String(u) : "");
    const imp = (x: any): Development["impact"] => (/pos/i.test(x) ? "positive" : /neg/i.test(x) ? "negative" : "mixed");
    const stg = (x: any): ComplianceItem["stage"] => (/before start/i.test(x) ? "Before starting" : /ongoing/i.test(x) ? "Ongoing" : "Before operations");
    return { ...empty,
      compliance: (Array.isArray(j.compliance) ? j.compliance : []).filter((c: any) => c && c.name).slice(0, 25).map((c: any) => ({ name: String(c.name), authority: String(c.authority || "\u2014"), when: String(c.when || "\u2014"), stage: stg(c.stage), basis: url(c.source) && grounded ? "Sourced" as const : "Verify" as const, source: url(c.source) })),
      developments: (Array.isArray(j.developments) ? j.developments : []).filter((d: any) => d && d.title).slice(0, 15).map((d: any) => ({ title: String(d.title), date: String(d.date || ""), source: String(d.source || ""), url: url(d.url), type: String(d.type || "news"), impact: imp(d.impact), effect: String(d.effect || ""), navigate: String(d.navigate || "") })),
      schemes: (Array.isArray(j.schemes) ? j.schemes : []).filter((x: any) => x && x.name).slice(0, 10).map((x: any) => ({ name: String(x.name), benefit: String(x.benefit || ""), eligibility: String(x.eligibility || ""), url: url(x.url) })) };
  } catch { return { ...empty, note: "The research could not be structured." }; }
}
// Merge: research items first (they carry sources), checklist items not already covered after.
export function mergeCompliance(base: ComplianceItem[], research: Research | null): ComplianceItem[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14);
  const r = research ? research.compliance : []; const seen = new Set(r.map((x) => key(x.name)));
  return [...r, ...base.filter((b) => !seen.has(key(b.name)))];
}

// Markdown (research brief, board text) → plain paragraphs and bullets for the document.
export function mdToBlocks(md: string, max = 40): Block[] {
  const out: Block[] = []; let ul: string[] = [];
  const clean = (s: string) => s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)").replace(/\*\*|__|`/g, "").replace(/^#+\s*/, "").trim();
  const flush = () => { if (ul.length) { out.push({ t: "ul", items: ul }); ul = []; } };
  for (const line of String(md || "").split("\n")) {
    if (out.length >= max) break;
    const l = line.trim(); if (!l || /^[-=*_]{3,}$/.test(l) || /^\|/.test(l)) { flush(); continue; }
    if (/^#{1,4}\s/.test(l)) { flush(); out.push({ t: "p", text: clean(l).toUpperCase() }); continue; }
    if (/^([-*\u2022]|\d+[.)])\s+/.test(l)) { ul.push(clean(l.replace(/^([-*\u2022]|\d+[.)])\s+/, ""))); continue; }
    flush(); out.push({ t: "p", text: clean(l) });
  }
  flush(); return out;
}

const SRC_TEXT: Record<string, string> = { "YOUR INPUT": "Your input", "FROM YOUR DECISION": "Your input (Boardroom)", ASSUMPTION: "Estimate \u2014 verify", "STANDARD ASSUMPTION": "Standard assumption" };

export function buildReportDocument(args: { inputs: DprInputs; sources: DprSources; ctx?: any; cur?: any; research?: Research | null; audience: "applicant" | "lender"; preparedOn?: string }): { doc: ReportDoc; result: DprResult } {
  const { inputs: I, sources: S, ctx, cur, research, audience } = args;
  const R = buildProjectReport(I); const sens = sensitivity(R.inputs); const cur$ = I.currency || "INR"; const U = moneyUnit(cur$);
  const A = (v: number | null | undefined) => amt(v, cur$); const yrs = R.years; const H = ["Particulars", ...yrs.map((y) => "Year " + y.y)];
  const row = (label: string, f: (y: any) => number | null) => [label, ...yrs.map((y) => A(f(y)))];
  const ratio = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !isFinite(v) ? "\u2014" : v.toFixed(d));
  const arch = detectArchetype(I.activity || (ctx && ctx.question) || "").archetype;
  const comp = mergeCompliance(complianceBaseline(arch, I, I.activity || (ctx && ctx.question) || ""), research || null);
  const B: Block[] = []; const toc: string[] = [];
  const sec = (title: string) => { toc.push(title); B.push({ t: "h1", text: (toc.length) + ". " + title }); };
  const lender = audience === "lender";

  // 1. Executive summary
  sec("Executive summary");
  B.push({ t: "kv", rows: [["Applicant", I.businessName || "\u2014"], ["Promoter(s)", I.promoters || "\u2014"], ["Constitution", I.constitution], ["Activity", I.activity || "\u2014"],
    ["Location", [I.location, I.state, I.country].filter(Boolean).join(", ") || "\u2014"], ["Cost of project", A(R.projectCost.total) + " " + U.label],
    ["Term loan requested", A(I.termLoan) + " " + U.label + (I.termLoan > 0 ? " for " + I.tenureYears + " years incl. " + I.moratoriumMonths + " months moratorium at " + I.interestRate + "% p.a." : "")],
    ["Working-capital limit assessed", A(R.wc.ccLimit) + " " + U.label], ["Promoter's contribution", A(R.meansOfFinance.promoterContribution) + " " + U.label + " (" + R.meansOfFinance.promoterPct.toFixed(1) + "%)"],
    ["Average / lowest DSCR", ratio(R.dscr.average) + " / " + ratio(R.dscr.minimum)], ["Break-even (year " + R.bep.year + ")", isFinite(R.bep.pctOfSales) ? R.bep.pctOfSales.toFixed(1) + "% of sales" : "not reached"],
    ["Project IRR (no terminal value)", R.irr === null ? "\u2014" : R.irr.toFixed(1) + "%"], ["Payback", R.paybackYears === null ? "beyond projection period" : R.paybackYears.toFixed(1) + " years"],
    ["Employment", I.employees ? String(I.employees) + " people" : "\u2014"], ["Indicative lender view", R.verdict.label]] });
  if (ctx && ctx.oneSentence) B.push({ t: "p", text: "Boardroom decision: " + String(ctx.oneSentence) });
  if (R.missing.length) B.push({ t: "p", tone: "warn", text: "This report is incomplete. Missing: " + R.missing.join("; ") + ". Figures depending on these are not reliable." });

  if (lender) { sec("Lender's appraisal summary"); pushAppraisal(); }

  // 2. Promoter and project
  sec("Promoter profile and the project");
  B.push({ t: "kv", rows: [["Promoter(s)", I.promoters || "To be completed by the applicant: names, qualifications, experience, net worth."], ["Nature of business", I.activity || "\u2014"], ["Constitution", I.constitution], ["Proposed employment", I.employees ? String(I.employees) : "\u2014"]] });
  if (ctx && Array.isArray(ctx.executives)) {
    const views = ctx.executives.filter((e: any) => e && e.view && e.view.view).slice(0, 6);
    if (views.length) { B.push({ t: "p", text: "Expert review (AI Boardroom executives; opinions, not verified facts):" }); B.push({ t: "ul", items: views.map((e: any) => e.name + ": " + String(e.view.view).slice(0, 400) + (e.view.worried && e.view.worried.length ? " Concern: " + String(e.view.worried[0]).slice(0, 200) : "")) }); }
  }

  // 3. Market & industry (sourced research brief from the Boardroom)
  sec("Market and industry analysis");
  const brief = cur && cur.researchBrief ? String(cur.researchBrief) : "";
  if (brief && cur.grounded !== false) { B.push({ t: "p", tone: "note", text: "From live web research carried out for this decision. Source links are shown next to each figure." }); B.push(...mdToBlocks(brief, 45)); }
  else B.push({ t: "p", tone: "warn", text: "No sourced market research is attached to this report. Run the Boardroom with web research enabled, or add the applicant's own market study, before submitting." });

  // 4-5. Cost of project, means of finance
  sec("Cost of project");
  B.push({ t: "table", head: ["Item", "Amount (" + U.label + ")"], rows: [...R.projectCost.rows.filter((r) => r[1] > 0).map((r) => [r[0], A(r[1])]), ["Total cost of project", A(R.projectCost.total)]], boldLast: true });
  sec("Means of finance");
  B.push({ t: "table", head: ["Source", "Amount (" + U.label + ")", "% of cost"], rows: [...R.meansOfFinance.rows.filter((r) => Math.abs(r[1]) > 0.5).map((r) => [r[0], A(r[1]), (R.projectCost.total ? r[1] / R.projectCost.total * 100 : 0).toFixed(1) + "%"]), ["Total", A(R.meansOfFinance.total), "100.0%"]], boldLast: true });
  if (I.termLoan > 0 && I.termLoan / Math.max(1, R.projectCost.total) > 0.85) B.push({ t: "p", tone: "warn", text: "The loan covers more than 85% of the project. Most banks will expect a larger promoter contribution unless a scheme (e.g. Mudra, CGTMSE, PMEGP) applies." });

  // 6. Assumptions with provenance
  sec("Key assumptions and where each comes from");
  const asm: [string, string, keyof DprInputs][] = [["Sales at stable operations (per month)", A(I.steadyMonthlyRevenue) + " " + U.label, "steadyMonthlyRevenue"], ["Capacity build-up (years 1 / 2 / 3+)", I.ramp.join("% / ") + "%", "ramp"],
    ["Annual growth in sales after year 1", I.growthPct + "%", "growthPct"], ["Variable costs (% of sales)", I.variableCostPct + "%", "variableCostPct"], ["Fixed costs (per month)", A(I.monthlyFixedCost) + " " + U.label, "monthlyFixedCost"],
    ["Annual increase in fixed costs", I.costInflationPct + "%", "costInflationPct"], ["Term-loan interest", I.interestRate + "% p.a.", "interestRate"], ["Repayment", I.repayment === "emi" ? "Equated monthly instalments" : "Equal monthly principal instalments", "repayment"],
    ["Tenure / moratorium", I.tenureYears + " years / " + I.moratoriumMonths + " months", "tenureYears"], ["Credit given to customers", I.receivableDays + " days", "receivableDays"], ["Stock held", I.inventoryDays + " days of variable cost", "inventoryDays"],
    ["Credit from suppliers", I.payableDays + " days", "payableDays"], ["Working-capital interest", I.ccRate + "% p.a.", "ccRate"], ["Bank finance of current assets", I.bankWcSharePct + "% (margin " + (100 - I.bankWcSharePct) + "%)", "bankWcSharePct"],
    ["Income-tax rate", I.taxRatePct + "% (" + I.constitution + ")", "taxRatePct"], ["Depreciation (straight line)", "Building " + I.lifeBuilding + " yrs, machinery " + I.lifeMachinery + " yrs, other " + I.lifeOther + " yrs", "lifeMachinery"],
    ["Pre-operative expenses written off over", I.preOpYears + " years", "preOpYears"]];
  B.push({ t: "table", head: ["Assumption", "Value", "Basis"], rows: asm.map(([l, v, k]) => [l, v, SRC_TEXT[S[k] || "YOUR INPUT"] || "Your input"]) });
  B.push({ t: "p", tone: "note", text: "Construction is assumed complete and operations start in year 1; the term loan is disbursed at the start of year 1. Interest during the moratorium is paid monthly. Projections are estimates, not guarantees." });

  // 7-12. Financial statements
  sec("Projected profitability statement");
  B.push({ t: "table", caption: "Amounts in " + U.label, head: H, rows: [row("Sales / revenue", (y) => y.revenue), row("Less: variable costs", (y) => y.variableCost), row("Contribution", (y) => y.contribution), row("Less: fixed costs", (y) => y.fixedCost),
    row("EBITDA", (y) => y.ebitda), row("Less: depreciation & amortisation", (y) => y.depreciation), row("Less: term-loan interest", (y) => y.interestTL), row("Less: working-capital interest", (y) => y.interestCC),
    row("Profit before tax", (y) => y.pbt), row("Less: income tax", (y) => y.tax), row("Profit after tax", (y) => y.pat), row("Cash accruals (PAT + depreciation)", (y) => y.cashAccrual)] });
  sec("Projected cash-flow statement");
  const inNames = Array.from(new Set(yrs.flatMap((y) => y.cf.inflows.map((x) => x[0])))), outNames = Array.from(new Set(yrs.flatMap((y) => y.cf.outflows.map((x) => x[0]))));
  const cfv = (y: any, list: "inflows" | "outflows", n: string) => { const f = y.cf[list].find((x: any) => x[0] === n); return f ? f[1] : 0; };
  B.push({ t: "table", caption: "Amounts in " + U.label, head: H, rows: [row("Opening cash", (y) => y.cf.opening), ["SOURCES", ...yrs.map(() => "")], ...inNames.map((n) => row("  " + n, (y) => cfv(y, "inflows", n))),
    ["USES", ...yrs.map(() => "")], ...outNames.map((n) => row("  " + n, (y) => cfv(y, "outflows", n))), row("Closing cash", (y) => y.cash)] });
  sec("Projected balance sheet");
  B.push({ t: "table", caption: "Amounts in " + U.label + " (as at year end)", head: H, rows: [["LIABILITIES", ...yrs.map(() => "")], row("Capital (incl. capital subsidy)", (y) => y.capital), row("Reserves & surplus", (y) => y.reserves),
    row("Term loan outstanding", (y) => y.tlOutstanding), row("Unsecured loans", (y) => y.unsecured), row("Bank working-capital loan", (y) => y.ccLoan), row("Trade creditors", (y) => y.payables), row("Total liabilities", (y) => y.totalLiabilities),
    ["ASSETS", ...yrs.map(() => "")], row("Net fixed assets (incl. land)", (y) => y.netBlock), row("Pre-operative expenses not yet written off", (y) => y.preOpUnamortised), row("Receivables", (y) => y.receivables), row("Inventory", (y) => y.inventory), row("Cash & bank", (y) => y.cash), row("Total assets", (y) => y.totalAssets)] });
  sec("Depreciation schedule");
  B.push({ t: "table", head: ["Asset", "Cost (" + U.label + ")", "Life (years)", "Annual charge (" + U.label + ")"], rows: [...(I.land > 0 ? [["Land (not depreciated)", A(I.land), "\u2014", "\u2014"]] : []), ...R.depreciation.filter((d) => d.cost > 0).map((d) => [d.asset, A(d.cost), String(d.life), A(d.annual)])] });
  if (I.termLoan > 0) {
    sec("Term-loan repayment schedule");
    B.push({ t: "table", caption: "Amounts in " + U.label, head: ["Year", "Opening balance", "Interest", "Principal repaid", "Closing balance", "Monthly instalment (principal)"],
      rows: yrs.filter((y) => R.loan.some((m) => Math.ceil(m.m / 12) === y.y)).map((y) => { const ms = R.loan.filter((m) => Math.ceil(m.m / 12) === y.y); return [String(y.y), A(ms[0].opening), A(ms.reduce((a, m) => a + m.interest, 0)), A(ms.reduce((a, m) => a + m.principal, 0)), A(ms[ms.length - 1].closing), A(ms[ms.length - 1].principal)]; }) });
  }
  sec("Working-capital assessment");
  B.push({ t: "table", caption: "Holding-period method (second method of lending: bank finances " + I.bankWcSharePct + "% of current assets less trade creditors). Amounts in " + U.label, head: ["Year", "Current assets", "Trade creditors", "Working-capital gap", "Bank finance", "Promoter margin"],
    rows: R.wc.holding.slice(0, 3).map((w) => [String(w.year), A(w.currentAssets), A(w.payables), A(w.gap), A(w.bankFinance), A(w.margin)]) });
  if (cur$ === "INR") B.push({ t: "p", tone: "note", text: "Turnover method (often used for MSME limits up to \u20b95 crore): requirement 25% of year-1 turnover = " + A(R.wc.turnover.requirement) + " lakh; bank finance 20% = " + A(R.wc.turnover.bank) + " lakh; promoter margin 5% = " + A(R.wc.turnover.margin) + " lakh. Assessed limit used in this report: " + A(R.wc.ccLimit) + " lakh." });

  // 13-15. DSCR, ratios, break-even, sensitivity
  sec("Debt-service coverage and key ratios");
  B.push({ t: "table", head: ["Particulars", ...yrs.map((y) => "Y" + y.y)], rows: [
    ["DSCR", ...yrs.map((y) => ratio(y.dscr))], ["Interest coverage", ...yrs.map((y) => ratio(y.icr))], ["Current ratio", ...yrs.map((y) => ratio(y.currentRatio))],
    ["TOL / TNW", ...yrs.map((y) => ratio(y.tolTnw))], ["Term loan / net worth", ...yrs.map((y) => ratio(y.debtEquity))], ["Fixed-asset coverage", ...yrs.map((y) => ratio(y.facr))], ["Net profit margin %", ...yrs.map((y) => (y.revenue ? (y.pat / y.revenue * 100).toFixed(1) : "\u2014"))]] });
  B.push({ t: "p", text: "Average DSCR over the loan period: " + ratio(R.dscr.average) + ". Lowest year: " + ratio(R.dscr.minimum) + ". DSCR = (profit after tax + depreciation + term-loan interest) \u00f7 (term-loan interest + principal repaid)." });
  sec("Break-even analysis");
  B.push({ t: "kv", rows: [["Year analysed", "Year " + R.bep.year + " (first year at planned capacity)"], ["Break-even sales (accounting)", A(R.bep.revenue) + " " + U.label + " = " + (isFinite(R.bep.pctOfSales) ? R.bep.pctOfSales.toFixed(1) + "% of projected sales" : "not reached")],
    ["Cash break-even sales", A(R.bep.cashRevenue) + " " + U.label], ...(R.bep.pctOfCapacity !== null ? [["As % of full capacity", R.bep.pctOfCapacity.toFixed(1) + "%"] as [string, string]] : [])] });
  sec("Sensitivity analysis");
  B.push({ t: "table", head: ["Scenario", "Average DSCR", "Lowest DSCR", "Year-3 profit after tax (" + U.label + ")", "Break-even % of sales", "Cash shortfall"],
    rows: sens.map((s) => [s.name, ratio(s.avgDscr), ratio(s.minDscr), A(s.patY3), isFinite(s.bepPct) ? s.bepPct.toFixed(1) + "%" : "not reached", s.cashNegative ? "Year " + s.cashNegative : "None"]) });

  // 16. Compliance
  sec("Statutory approvals and compliance");
  B.push({ t: "p", tone: "note", text: "\u201cSourced\u201d items come from live research with a link. \u201cChecklist\u201d items are OrchestrIQ's general checklist for this type of business in " + (I.country || "India") + ". \u201cVerify\u201d items need local confirmation. Rules and thresholds change and differ by state: have the final list confirmed by a Chartered Accountant or legal adviser before submission." });
  B.push({ t: "table", head: ["Approval / compliance", "Authority", "When it applies", "Stage", "Basis"], rows: comp.map((c) => [c.name, c.authority, c.when, c.stage, c.basis + (c.source ? " \u2014 " + c.source : "")]) });
  if (!research) B.push({ t: "p", tone: "warn", text: "Live compliance and news research has not been run for this report. Use \u201cResearch compliance & recent news\u201d before submitting." });

  // 17. Developments
  sec("Recent developments, technology and their impact");
  if (research && research.developments.length) {
    B.push({ t: "table", head: ["Development", "Date / source", "Impact", "How it affects this business", "How to respond"], rows: research.developments.map((d) => [d.title + " (" + d.type + ")", [d.date, d.source, d.url].filter(Boolean).join(" \u2014 ") || "Unverified \u2014 no source", d.impact.toUpperCase(), d.effect, d.navigate]) });
    if (!research.grounded) B.push({ t: "p", tone: "warn", text: "Live web search was not available, so these items are model knowledge, not sourced news. Verify each before relying on it." });
  } else B.push({ t: "p", tone: "warn", text: research ? "The research found no specific recent developments. " + (research.note || "") : "Not yet researched. Use \u201cResearch compliance & recent news\u201d to add sourced items." });
  if (research && research.schemes.length) { B.push({ t: "h2", text: "Government schemes and subsidies to explore" }); B.push({ t: "table", head: ["Scheme", "Benefit", "Eligibility", "Source"], rows: research.schemes.map((s) => [s.name, s.benefit, s.eligibility, s.url || "Verify"]) }); }
  if (ctx && Array.isArray(ctx.externalFactors) && ctx.externalFactors.length) { B.push({ t: "h2", text: "External factors identified in the Boardroom decision" }); B.push({ t: "ul", items: ctx.externalFactors.slice(0, 8).map((f: any) => (f.category ? f.category.charAt(0).toUpperCase() + f.category.slice(1) + ": " : "") + String(f.text || "").slice(0, 300) + (f.source ? " (" + f.source + (f.date ? ", " + f.date : "") + ")" : "")) }); }

  // 18. Risks
  sec("Risk analysis and mitigation");
  const risks: string[][] = [];
  const worst = sens[sens.length - 1];
  risks.push(["Sales lower or slower than planned", "If sales are 10% lower and costs 10% higher, average DSCR becomes " + ratio(worst.avgDscr) + (worst.cashNegative ? " and cash runs short in year " + worst.cashNegative : ""), "Secure written orders / letters of intent; keep a cash reserve; phase capacity"]);
  if (I.receivableDays >= 60) risks.push(["Slow customer payment", I.receivableDays + " days of credit ties up " + A(R.years[0].receivables) + " " + U.label + " in year 1", "Advance payments, invoice discounting (TReDS for MSMEs), credit insurance"]);
  if (ctx && Array.isArray(ctx.issues)) for (const i of ctx.issues.slice(0, 4)) risks.push([String(i.issue || "").replace(/\s*\[Calculation\]/g, "").slice(0, 160), i.severity === "blocking" ? "Blocks the decision until resolved" : i.severity === "serious" ? "Serious" : "Watch", "See the actions in the Boardroom decision"]);
  if (ctx && Array.isArray(ctx.unknowns)) for (const u of ctx.unknowns.slice(0, 3)) risks.push(["Unverified: " + String(u.missing).slice(0, 110), String(u.whyMatters || ""), String(u.howToVerify || "")]);
  B.push({ t: "table", head: ["Risk", "Effect", "Mitigation"], rows: risks });

  if (!lender) { sec("Lender's appraisal summary (indicative)"); pushAppraisal(); }

  // Documents & declaration
  sec("Documents usually required by the bank");
  B.push({ t: "ul", items: ["KYC of the business and promoters (PAN, Aadhaar, address proof); constitution documents", "Udyam registration certificate and other registrations listed above", "Income-tax returns and financial statements of the promoters/business for the last 3 years (if existing)",
    "Bank statements for the last 6\u201312 months", "Quotations for machinery and equipment; estimates for civil works", "Title deed or rent/lease agreement for the premises; approvals obtained", "Details of collateral security offered (if any) and net-worth statement of promoters",
    "This project report \u2014 many banks require projections certified by a Chartered Accountant"] });
  sec("Model integrity and disclaimer");
  B.push({ t: "table", head: ["Check", "Result"], rows: R.checks.map((c) => [c.name, c.pass ? "Passed" : "FAILED \u2014 " + c.detail]) });
  B.push({ t: "p", tone: "note", text: "Prepared with OrchestrIQ on " + (args.preparedOn || new Date().toLocaleDateString("en-IN")) + ". All financial statements are calculated by a deterministic model from the assumptions shown; AI was used only for research summaries and expert commentary, which are labelled. Ratio norms are typical indicative norms; each lender applies its own credit policy. This report supports, and does not replace, the lender's own appraisal and professional (CA / legal) advice." });

  function pushAppraisal() {
    B.push({ t: "p", text: "Indicative assessment: " + R.verdict.label + "." });
    B.push({ t: "table", head: ["Measure", "This project", "Typical norm", "Status", "What it means"], rows: R.assessment.map((a) => [a.metric, a.value, a.norm, a.status, a.why]) });
    if (R.verdict.reasons.length) B.push({ t: "ul", items: R.verdict.reasons });
    const strengths = R.assessment.filter((a) => a.status === "GOOD").map((a) => a.metric), concerns = R.assessment.filter((a) => a.status !== "GOOD").map((a) => a.metric + " (" + a.value + ")");
    B.push({ t: "kv", rows: [["Strengths", strengths.join(", ") || "\u2014"], ["Points for the credit discussion", concerns.join(", ") || "None from the ratios"], ["Not assessed by this model", "Promoter character and track record, title of security, site visit, market reputation, CIBIL / credit history"]] });
  }

  const title = lender ? "Credit Appraisal Note" : "Detailed Project Report";
  return { doc: { title, subtitle: (I.businessName || "Proposed project") + " \u2014 " + (I.activity || "").slice(0, 90), toc,
    meta: [["Prepared for", lender ? "Lender's internal appraisal" : "Term-loan / working-capital application"], ["Location", [I.location, I.state, I.country].filter(Boolean).join(", ")], ["Amounts", "In " + U.label + " unless stated"], ["Date", args.preparedOn || new Date().toLocaleDateString("en-IN")]],
    blocks: B }, result: R };
}
// Re-exported for the UI
export { TYPICAL_NORMS };
