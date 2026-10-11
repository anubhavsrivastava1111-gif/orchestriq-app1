// BANK PROJECT REPORT (DPR) ENGINE - deterministic, no AI.
// Every number a lender reads comes from here: cost of project, means of finance,
// term-loan schedule, depreciation, projected P&L, cash flow and balance sheet,
// DSCR, ratios, break-even and sensitivity. The balance sheet is checked to
// balance every year; the report refuses to present a model that fails its checks.
// Norms used for the lender scorecard are TYPICAL indicative norms - each bank's
// own credit policy prevails, and the report says so.

export type Constitution = "Proprietorship" | "Partnership" | "LLP" | "Private Limited" | "Other";
export type Repayment = "equal-principal" | "emi";
export type Src = "YOUR INPUT" | "FROM YOUR DECISION" | "ASSUMPTION" | "STANDARD ASSUMPTION";

export interface DprInputs {
  businessName: string; promoters: string; constitution: Constitution; activity: string; location: string; state: string; country: string;
  currency: string; employees: number;
  land: number; building: number; machinery: number; otherAssets: number; preOperative: number; contingencyPct: number;
  termLoan: number; subsidy: number; unsecuredLoans: number;
  interestRate: number; tenureYears: number; moratoriumMonths: number; repayment: Repayment;
  steadyMonthlyRevenue: number; ramp: [number, number, number]; growthPct: number;
  variableCostPct: number; monthlyFixedCost: number; costInflationPct: number;
  receivableDays: number; inventoryDays: number; payableDays: number; ccRate: number; bankWcSharePct: number;
  taxRatePct: number; lifeBuilding: number; lifeMachinery: number; lifeOther: number; preOpYears: number;
  years: number; discountRatePct: number; collateralValue: number;
  fullCapacityMonthlyRevenue?: number | null;
}
export type DprSources = Partial<Record<keyof DprInputs, Src>>;

export const TYPICAL_NORMS = {
  avgDscrGood: 1.5, avgDscrMin: 1.25, minDscr: 1.2, promoterGood: 25, promoterMin: 15, tolTnwMax: 3, tolTnwOk: 4,
  currentRatio: 1.33, bepGood: 60, bepMax: 75, icr: 2, facr: 1.33,
};
// Indicative tax rates by constitution (base + surcharge + cess approximations; verify with a CA).
export const TAX_BY_CONSTITUTION: Record<Constitution, number> = { "Private Limited": 25.17, LLP: 31.2, Partnership: 31.2, Proprietorship: 31.2, Other: 31.2 };

export function defaultInputs(): DprInputs {
  return { businessName: "", promoters: "", constitution: "Proprietorship", activity: "", location: "", state: "", country: "India", currency: "INR", employees: 0,
    land: 0, building: 0, machinery: 0, otherAssets: 0, preOperative: 0, contingencyPct: 5,
    termLoan: 0, subsidy: 0, unsecuredLoans: 0, interestRate: 10.5, tenureYears: 7, moratoriumMonths: 6, repayment: "equal-principal",
    steadyMonthlyRevenue: 0, ramp: [70, 85, 100], growthPct: 5, variableCostPct: 60, monthlyFixedCost: 0, costInflationPct: 5,
    receivableDays: 30, inventoryDays: 30, payableDays: 30, ccRate: 11, bankWcSharePct: 75,
    taxRatePct: 31.2, lifeBuilding: 30, lifeMachinery: 15, lifeOther: 10, preOpYears: 5, years: 7, discountRatePct: 12, collateralValue: 0, fullCapacityMonthlyRevenue: null };
}

// Pre-fill from the Boardroom decision. Nothing is invented: a value the decision does not
// have stays at 0 and is reported as needed; standard DPR assumptions are labelled as such.
export function inputsFromDecision(ctx: any, opts: { company?: string; location?: string } = {}): { inputs: DprInputs; sources: DprSources } {
  const d = defaultInputs(); const s: DprSources = {};
  const std: (keyof DprInputs)[] = ["ramp", "growthPct", "costInflationPct", "inventoryDays", "payableDays", "ccRate", "bankWcSharePct", "taxRatePct", "lifeBuilding", "lifeMachinery", "lifeOther", "contingencyPct", "moratoriumMonths", "repayment", "discountRatePct", "interestRate", "tenureYears", "years", "receivableDays", "variableCostPct"];
  for (const k of std) s[k] = "STANDARD ASSUMPTION";
  d.businessName = opts.company || ""; d.location = opts.location || "";
  if (!ctx) return { inputs: d, sources: s };
  const I = ctx.inputs || {}; const O = ctx.outputs || {};
  const tag = (k: string): Src => (I[k] && I[k].label === "User Input" ? "FROM YOUR DECISION" : "ASSUMPTION");
  d.activity = activityFromQuestion(String(ctx.question || ""));
  if (O.revenue != null && isFinite(O.revenue) && O.revenue > 0) { d.steadyMonthlyRevenue = O.revenue; s.steadyMonthlyRevenue = I.revenue ? tag("revenue") : I.utilisation ? tag("utilisation") : tag("price"); }
  if (I.revenueFull) d.fullCapacityMonthlyRevenue = I.revenueFull.value;
  if (I.variableCostPct) { d.variableCostPct = I.variableCostPct.value; s.variableCostPct = tag("variableCostPct"); }
  else if (I.contributionMargin) { d.variableCostPct = 100 - I.contributionMargin.value; s.variableCostPct = tag("contributionMargin"); }
  if (I.fixedCost) { d.monthlyFixedCost = I.fixedCost.value; s.monthlyFixedCost = tag("fixedCost"); }
  if (I.capex) { d.machinery = I.capex.value; s.machinery = tag("capex"); }
  if (I.debt) { d.termLoan = I.debt.value; s.termLoan = tag("debt"); }
  if (I.interestRate) { d.interestRate = I.interestRate.value; d.ccRate = I.interestRate.value + 0.5; s.interestRate = tag("interestRate"); }
  if (I.loanTenure && I.loanTenure.value > 0) { d.tenureYears = Math.max(1, Math.round(I.loanTenure.value / 12)); s.tenureYears = tag("loanTenure"); }
  if (I.dso) { d.receivableDays = I.dso.value; s.receivableDays = tag("dso"); }
  d.years = Math.min(10, Math.max(5, d.tenureYears + 1));
  return { inputs: d, sources: s };
}

// "I want to start a candle manufacturing business with ₹1 crore." -> "Candle manufacturing business"
export function activityFromQuestion(q: string): string {
  let s = String(q || "").split("\n")[0].trim();
  s = s.replace(/^(should i|can i|i (want|plan|intend|would like|am planning|'m planning)( to)?|i am|we (want|plan|are planning)( to)?|planning to|is it worth)\s+/i, "")
    .replace(/^(start(ing)?|open(ing)?|set(ting)? up|launch(ing)?|build(ing)?|expand(ing)?|run(ning)?)\s+/i, "").replace(/^(a|an|the|my|our)\s+/i, "");
  s = s.split(/\s+with\s+(?:[\u20b9$]|rs\.?|inr|\d)|[.?!]|\s+for\s+(?:[\u20b9$]|rs\.?|\d)/i)[0].trim();
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 120);
}
const r2 = (x: number) => Math.round(x * 100) / 100;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export interface LoanMonth { m: number; opening: number; interest: number; principal: number; closing: number }
export function loanSchedule(P: number, ratePct: number, tenureYears: number, moratoriumMonths: number, kind: Repayment): LoanMonth[] {
  const out: LoanMonth[] = []; if (!(P > 0) || !(tenureYears > 0)) return out;
  const N = Math.round(tenureYears * 12), mor = Math.max(0, Math.min(N - 1, Math.round(moratoriumMonths))), n = N - mor, i = ratePct / 100 / 12;
  const emi = i > 0 ? P * i / (1 - Math.pow(1 + i, -n)) : P / n;
  let bal = P;
  for (let m = 1; m <= N; m++) {
    const interest = bal * i;
    let principal = m <= mor ? 0 : kind === "emi" ? emi - interest : P / n;
    if (m === N || principal > bal) principal = bal;   // final instalment clears rounding
    out.push({ m, opening: bal, interest, principal, closing: bal - principal }); bal -= principal;
  }
  return out;
}

export interface YearRow {
  y: number; revenue: number; variableCost: number; contribution: number; fixedCost: number; ebitda: number; depreciation: number; interestTL: number; interestCC: number;
  pbt: number; tax: number; pat: number; cashAccrual: number; principalTL: number; dscr: number | null; icr: number | null;
  receivables: number; inventory: number; payables: number; ccLoan: number; tlOutstanding: number; netBlock: number; preOpUnamortised: number; cash: number;
  capital: number; reserves: number; unsecured: number; totalAssets: number; totalLiabilities: number; balanceDiff: number;
  currentRatio: number | null; tolTnw: number | null; debtEquity: number | null; facr: number | null;
  cf: { opening: number; inflows: [string, number][]; outflows: [string, number][]; closing: number };
}
export interface Assessment { metric: string; value: string; norm: string; status: "GOOD" | "ACCEPTABLE" | "WEAK"; why: string }
export interface DprResult {
  inputs: DprInputs; projectCost: { rows: [string, number][]; total: number; marginMoneyWC: number };
  meansOfFinance: { rows: [string, number][]; total: number; promoterContribution: number; promoterPct: number; gap: number };
  wc: { holding: { year: number; currentAssets: number; payables: number; gap: number; bankFinance: number; margin: number }[]; turnover: { requirement: number; bank: number; margin: number }; ccLimit: number };
  loan: LoanMonth[]; years: YearRow[]; depreciation: { asset: string; cost: number; life: number; annual: number }[];
  dscr: { average: number | null; minimum: number | null; byYear: (number | null)[] };
  bep: { year: number; revenue: number; pctOfSales: number; cashRevenue: number; pctOfCapacity: number | null };
  irr: number | null; npv: number; paybackYears: number | null; fundingShortfallYear: number | null;
  assessment: Assessment[]; verdict: { label: string; reasons: string[] }; checks: { name: string; pass: boolean; detail: string }[];
  missing: string[];
}

export function buildProjectReport(raw: DprInputs): DprResult {
  const I: DprInputs = { ...defaultInputs(), ...raw, ramp: (raw.ramp || [70, 85, 100]).map((x) => Number(x) || 0) as [number, number, number] };
  const missing: string[] = [];
  if (!(I.steadyMonthlyRevenue > 0)) missing.push("Expected monthly sales at stable operations");
  if (!(I.land + I.building + I.machinery + I.otherAssets > 0)) missing.push("Project cost (land, building, machinery or other assets)");
  if (!(I.monthlyFixedCost >= 0)) missing.push("Monthly fixed costs");
  const loanYears = I.termLoan > 0 ? Math.ceil(I.tenureYears) : 0;
  const Y = Math.max(3, Math.min(15, Math.max(Math.round(I.years) || 5, loanYears)));

  // ── Year-by-year operating lines ──
  const rampOf = (y: number) => (y <= 3 ? I.ramp[y - 1] : I.ramp[2]) / 100;
  const revenue = Array.from({ length: Y }, (_, k) => I.steadyMonthlyRevenue * 12 * rampOf(k + 1) * Math.pow(1 + I.growthPct / 100, k));
  const variable = revenue.map((r) => r * I.variableCostPct / 100);
  const fixed = Array.from({ length: Y }, (_, k) => I.monthlyFixedCost * 12 * Math.pow(1 + I.costInflationPct / 100, k));

  // ── Working capital (holding-period / MPBF method II, and turnover method) ──
  const rec = revenue.map((r) => r * I.receivableDays / 365), inv = variable.map((v) => v * I.inventoryDays / 365), pay = variable.map((v) => v * I.payableDays / 365);
  const mpbf = rec.map((_, k) => Math.max(0, (rec[k] + inv[k]) * I.bankWcSharePct / 100 - pay[k]));
  const ccLimit = Math.max(mpbf[0] || 0, mpbf[1] || 0);
  const cc = mpbf.map((x) => Math.min(ccLimit, x));
  const marginMoneyWC = Math.max(0, rec[0] + inv[0] - pay[0] - cc[0]);

  // ── Cost of project ──
  const fixedAssets = I.building + I.machinery + I.otherAssets;
  const contingency = fixedAssets * I.contingencyPct / 100;
  const projectRows: [string, number][] = [["Land", I.land], ["Building / civil works", I.building], ["Plant, machinery & equipment", I.machinery], ["Other fixed assets", I.otherAssets],
    ["Contingency (" + I.contingencyPct + "% of buildings & equipment)", contingency], ["Preliminary & pre-operative expenses", I.preOperative], ["Margin money for working capital", marginMoneyWC]];
  const projectCost = sum(projectRows.map((r) => r[1]));
  const promoterContribution = projectCost - I.termLoan - I.subsidy - I.unsecuredLoans;
  const meansRows: [string, number][] = [["Promoter's contribution (capital)", promoterContribution], ["Term loan from bank", I.termLoan], ["Capital subsidy", I.subsidy], ["Unsecured loans (promoters / relatives)", I.unsecuredLoans]];

  // ── Depreciation (straight line by asset class; contingency spread pro rata) ──
  const share = (x: number) => (fixedAssets > 0 ? x + contingency * x / fixedAssets : x);
  const dep = [["Building / civil works", share(I.building), I.lifeBuilding], ["Plant, machinery & equipment", share(I.machinery), I.lifeMachinery], ["Other fixed assets", share(I.otherAssets), I.lifeOther]]
    .map(([a, c, l]: any) => ({ asset: a, cost: c, life: l, annual: l > 0 ? c / l : 0 }));
  const grossBlock = I.land + sum(dep.map((d) => d.cost));

  // ── Loan ──
  const loan = loanSchedule(I.termLoan, I.interestRate, I.tenureYears, I.moratoriumMonths, I.repayment);
  const yr = (k: number, f: (x: LoanMonth) => number) => sum(loan.filter((x) => Math.ceil(x.m / 12) === k + 1).map(f));

  // ── Projections ──
  const rows: YearRow[] = []; let cumDep = 0, cumPreop = 0, reserves = 0, lossCF = 0, cash = 0, tl = I.termLoan;
  for (let k = 0; k < Y; k++) {
    const depY = sum(dep.map((d) => (k < d.life ? d.annual : 0)));
    const preopY = I.preOpYears > 0 && k < I.preOpYears ? I.preOperative / I.preOpYears : k === 0 && !(I.preOpYears > 0) ? I.preOperative : 0;
    cumDep += depY; cumPreop += preopY;
    const intTL = yr(k, (x) => x.interest), prTL = yr(k, (x) => x.principal);
    const intCC = cc[k] * I.ccRate / 100;
    const contribution = revenue[k] - variable[k], ebitda = contribution - fixed[k];
    const pbt = ebitda - depY - preopY - intTL - intCC;
    // Tax: losses carried forward and set off against later profits.
    let taxable = pbt; if (taxable > 0 && lossCF > 0) { const use = Math.min(lossCF, taxable); taxable -= use; lossCF -= use; } else if (taxable < 0) { lossCF += -taxable; taxable = 0; }
    const tax = Math.max(0, taxable) * I.taxRatePct / 100, pat = pbt - tax;
    reserves += pat;
    const dRec = rec[k] - (k ? rec[k - 1] : 0), dInv = inv[k] - (k ? inv[k - 1] : 0), dPay = pay[k] - (k ? pay[k - 1] : 0), dCC = cc[k] - (k ? cc[k - 1] : 0);
    const inflows: [string, number][] = [], outflows: [string, number][] = [];
    if (k === 0) { inflows.push(["Promoter's contribution", promoterContribution], ["Term loan disbursed", I.termLoan], ["Capital subsidy", I.subsidy], ["Unsecured loans", I.unsecuredLoans]); outflows.push(["Capital expenditure (incl. contingency & pre-operative)", projectCost - marginMoneyWC]); }
    inflows.push(["Profit after tax", pat], ["Depreciation & amortisation (non-cash)", depY + preopY], ["Increase in bank working-capital loan", dCC], ["Increase in creditors", dPay]);
    outflows.push(["Increase in receivables", dRec], ["Increase in inventory", dInv], ["Term-loan principal repaid", prTL]);
    const opening = cash; cash = opening + sum(inflows.map((x) => x[1])) - sum(outflows.map((x) => x[1]));
    tl -= prTL;
    const netBlock = grossBlock - cumDep, preopLeft = I.preOperative - cumPreop;
    const capital = promoterContribution + I.subsidy;
    const totalAssets = netBlock + preopLeft + rec[k] + inv[k] + cash;
    const totalLiabilities = capital + reserves + tl + I.unsecuredLoans + cc[k] + pay[k];
    const tnw = capital + reserves, nextPrincipal = yr(k + 1, (x) => x.principal);
    rows.push({ y: k + 1, revenue: revenue[k], variableCost: variable[k], contribution, fixedCost: fixed[k], ebitda, depreciation: depY + preopY, interestTL: intTL, interestCC: intCC,
      pbt, tax, pat, cashAccrual: pat + depY + preopY, principalTL: prTL,
      dscr: intTL + prTL > 0 ? (pat + depY + preopY + intTL) / (intTL + prTL) : null, icr: intTL + intCC > 0 ? ebitda / (intTL + intCC) : null,
      receivables: rec[k], inventory: inv[k], payables: pay[k], ccLoan: cc[k], tlOutstanding: tl, netBlock, preOpUnamortised: preopLeft, cash, capital, reserves, unsecured: I.unsecuredLoans,
      totalAssets, totalLiabilities, balanceDiff: totalAssets - totalLiabilities,
      currentRatio: cc[k] + pay[k] + nextPrincipal > 0 ? (rec[k] + inv[k] + Math.max(0, cash)) / (cc[k] + pay[k] + nextPrincipal) : null,
      tolTnw: tnw > 0 ? (tl + I.unsecuredLoans + cc[k] + pay[k]) / tnw : null, debtEquity: tnw > 0 ? tl / tnw : null, facr: tl > 1 ? netBlock / tl : null,
      cf: { opening, inflows, outflows, closing: cash } });
  }

  // ── DSCR (average = sum of cash available for debt service / sum of debt service) ──
  const svc = rows.filter((r) => r.interestTL + r.principalTL > 0);
  const dscrAvg = svc.length ? sum(svc.map((r) => r.pat + r.depreciation + r.interestTL)) / sum(svc.map((r) => r.interestTL + r.principalTL)) : null;
  const dscrMin = svc.length ? Math.min(...svc.map((r) => r.dscr as number)) : null;

  // ── Break-even (first stable year = year 3, or the last year if shorter) ──
  const b = rows[Math.min(2, rows.length - 1)];
  const cmr = b.revenue > 0 ? b.contribution / b.revenue : 0;
  const bepRev = cmr > 0 ? (b.fixedCost + b.depreciation + b.interestTL + b.interestCC) / cmr : Infinity;
  const cashBep = cmr > 0 ? (b.fixedCost + b.interestTL + b.interestCC) / cmr : Infinity;
  const capRev = I.fullCapacityMonthlyRevenue && I.fullCapacityMonthlyRevenue > 0 ? I.fullCapacityMonthlyRevenue * 12 * Math.pow(1 + I.growthPct / 100, b.y - 1) : null;

  // ── IRR / NPV / payback (no terminal value; working capital released in the last year) ──
  const flows = [-(projectCost - marginMoneyWC)];   // t0: fixed investment; working capital is handled year by year below
  rows.forEach((r, k) => { const dWC = (rec[k] + inv[k] - pay[k]) - (k ? rec[k - 1] + inv[k - 1] - pay[k - 1] : 0); flows.push(r.ebitda - r.tax - dWC + (k === rows.length - 1 ? rec[k] + inv[k] - pay[k] : 0)); });
  const npvAt = (rate: number) => flows.reduce((a, f, t) => a + f / Math.pow(1 + rate, t), 0);
  let irr: number | null = null;
  if (npvAt(-0.99) > 0 && npvAt(10) < 0 || npvAt(0) > 0 && npvAt(10) < 0) { let lo = -0.99, hi = 10; for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (npvAt(mid) > 0) lo = mid; else hi = mid; } irr = (lo + hi) / 2 * 100; }
  let paybackYears: number | null = null, acc = 0;
  for (const r of rows) { const prev = acc; acc += r.cashAccrual + r.interestTL * (1 - I.taxRatePct / 100); if (acc >= projectCost && paybackYears === null) paybackYears = (r.y - 1) + (r.cashAccrual + r.interestTL * (1 - I.taxRatePct / 100) > 0 ? (projectCost - prev) / (acc - prev) : 0); }
  const short = rows.find((r) => r.cash < -1);

  // ── Lender scorecard (typical indicative norms) ──
  const N = TYPICAL_NORMS, A: Assessment[] = [];
  const pc = projectCost > 0 ? promoterContribution / projectCost * 100 : 0;
  const st = (good: boolean, ok: boolean): Assessment["status"] => (good ? "GOOD" : ok ? "ACCEPTABLE" : "WEAK");
  if (dscrAvg !== null) A.push({ metric: "Average DSCR", value: dscrAvg.toFixed(2), norm: "\u2265 " + N.avgDscrGood + " preferred; \u2265 " + N.avgDscrMin + " minimum", status: st(dscrAvg >= N.avgDscrGood, dscrAvg >= N.avgDscrMin), why: "How many times the cash from the business covers loan instalments plus interest, on average over the loan." });
  if (dscrMin !== null) A.push({ metric: "Lowest yearly DSCR", value: dscrMin.toFixed(2), norm: "\u2265 " + N.minDscr, status: st(dscrMin >= N.minDscr + 0.15, dscrMin >= N.minDscr - 0.2), why: "The weakest year decides whether instalments can be paid without extra money from the promoter." });
  A.push({ metric: "Promoter's contribution", value: pc.toFixed(1) + "%", norm: N.promoterMin + "\u2013" + N.promoterGood + "% of project cost (varies by scheme)", status: st(pc >= N.promoterGood, pc >= N.promoterMin), why: "Banks expect the promoter to share the risk; schemes such as Mudra or CGTMSE can allow less." });
  const y2 = rows[Math.min(1, rows.length - 1)];
  if (y2.tolTnw !== null) A.push({ metric: "TOL / TNW (year 2)", value: y2.tolTnw.toFixed(2), norm: "\u2264 " + N.tolTnwMax, status: st(y2.tolTnw <= N.tolTnwMax, y2.tolTnw <= N.tolTnwOk), why: "Total outside liabilities compared with the owner's net worth: how much of the business is funded by others." });
  if (y2.currentRatio !== null) A.push({ metric: "Current ratio (year 2)", value: y2.currentRatio.toFixed(2), norm: "\u2265 " + N.currentRatio, status: st(y2.currentRatio >= N.currentRatio, y2.currentRatio >= 1.1), why: "Short-term assets against short-term dues, including next year's loan instalments." });
  const bepPct = isFinite(bepRev) && b.revenue > 0 ? bepRev / b.revenue * 100 : Infinity;
  A.push({ metric: "Break-even (year " + b.y + ")", value: isFinite(bepPct) ? bepPct.toFixed(1) + "% of sales" : "not reached", norm: "\u2264 " + N.bepGood + "% good; \u2264 " + N.bepMax + "% acceptable", status: st(bepPct <= N.bepGood, bepPct <= N.bepMax), why: "The lower the break-even, the more sales can fall before the business makes a loss." });
  if (b.icr !== null) A.push({ metric: "Interest coverage (year " + b.y + ")", value: b.icr.toFixed(2) + "\u00d7", norm: "\u2265 " + N.icr, status: st(b.icr >= N.icr, b.icr >= 1.5), why: "Operating profit before depreciation compared with total interest." });
  if (rows[0].facr !== null) A.push({ metric: "Fixed-asset coverage (year 1)", value: (rows[0].facr as number).toFixed(2), norm: "\u2265 " + N.facr, status: st((rows[0].facr as number) >= N.facr, (rows[0].facr as number) >= 1.1), why: "Value of the assets the loan creates, compared with the loan still outstanding." });
  if (I.collateralValue > 0 && I.termLoan > 0) { const cv = I.collateralValue / I.termLoan; A.push({ metric: "Collateral cover", value: cv.toFixed(2) + "\u00d7", norm: "as per bank policy (CGTMSE may replace collateral for eligible MSEs)", status: st(cv >= 1, cv >= 0.5), why: "Additional security offered beyond the assets created by the loan." }); }
  A.push({ metric: "Cash balance in every year", value: short ? "negative in year " + short.y : "positive", norm: "never negative", status: short ? "WEAK" : "GOOD", why: "A negative balance means the plan needs more money than is arranged." });

  // ── Integrity checks (the report is not presentable if these fail) ──
  const checks = [
    { name: "Balance sheet balances in every year", pass: rows.every((r) => Math.abs(r.balanceDiff) < 1), detail: rows.map((r) => "Y" + r.y + " diff " + r2(r.balanceDiff)).join(", ") },
    { name: "Means of finance equals cost of project", pass: Math.abs(sum(meansRows.map((x) => x[1])) - projectCost) < 1, detail: r2(sum(meansRows.map((x) => x[1]))) + " vs " + r2(projectCost) },
    { name: "Loan fully repaid within tenure", pass: I.termLoan <= 0 || (loan.length > 0 && Math.abs(sum(loan.map((x) => x.principal)) - I.termLoan) < 1 && loan[loan.length - 1].closing < 1), detail: "principal repaid " + r2(sum(loan.map((x) => x.principal))) },
    { name: "Depreciation never exceeds asset cost", pass: dep.every((d) => d.annual * Math.min(Y, d.life) <= d.cost + 1), detail: "" },
    { name: "Promoter's contribution is not negative", pass: promoterContribution >= -1, detail: r2(promoterContribution) + "" },
    { name: "All figures are finite numbers", pass: rows.every((r) => [r.revenue, r.pat, r.cash, r.totalAssets].every((v) => isFinite(v))), detail: "" },
  ];

  // ── Verdict for the lender view ──
  const weak = A.filter((a) => a.status === "WEAK"), acceptable = A.filter((a) => a.status === "ACCEPTABLE");
  const critical = weak.filter((a) => /DSCR|Cash balance|Promoter/.test(a.metric));
  const verdict = missing.length ? { label: "INCOMPLETE \u2014 information needed", reasons: missing.map((m) => "Missing: " + m) }
    : !checks.every((c) => c.pass) ? { label: "MODEL CHECK FAILED", reasons: checks.filter((c) => !c.pass).map((c) => c.name + ": " + c.detail) }
    : !(I.termLoan > 0) ? { label: "ENTER THE LOAN AMOUNT to see the lender's view", reasons: ["Repayment capacity (DSCR) can only be assessed against the loan being requested."] }
    : critical.length ? { label: "WEAK \u2014 unlikely to be bankable as structured", reasons: critical.map((a) => a.metric + " " + a.value + " (norm " + a.norm + ")") }
    : weak.length || acceptable.length ? { label: "BANKABLE WITH CONDITIONS (indicative)", reasons: [...weak, ...acceptable].map((a) => a.metric + " " + a.value + " (norm " + a.norm + ")") }
    : { label: "BANKABLE (indicative)", reasons: ["All key ratios meet typical lending norms."] };

  return { inputs: I, projectCost: { rows: projectRows, total: projectCost, marginMoneyWC }, meansOfFinance: { rows: meansRows, total: sum(meansRows.map((x) => x[1])), promoterContribution, promoterPct: pc, gap: Math.min(0, promoterContribution) },
    wc: { holding: rows.map((r, k) => ({ year: r.y, currentAssets: rec[k] + inv[k], payables: pay[k], gap: rec[k] + inv[k] - pay[k], bankFinance: cc[k], margin: rec[k] + inv[k] - pay[k] - cc[k] })),
      turnover: { requirement: revenue[0] * 0.25, bank: revenue[0] * 0.2, margin: revenue[0] * 0.05 }, ccLimit },
    loan, years: rows, depreciation: dep, dscr: { average: dscrAvg, minimum: dscrMin, byYear: rows.map((r) => r.dscr) },
    bep: { year: b.y, revenue: bepRev, pctOfSales: bepPct, cashRevenue: cashBep, pctOfCapacity: capRev && isFinite(bepRev) ? bepRev / capRev * 100 : null },
    irr, npv: npvAt(I.discountRatePct / 100), paybackYears, fundingShortfallYear: short ? short.y : null, assessment: A, verdict, checks, missing };
}

// What-if table banks ask for: each case re-runs the whole model.
export function sensitivity(I: DprInputs) {
  const cases: [string, Partial<DprInputs>][] = [["Base case", {}], ["Sales 10% lower", { steadyMonthlyRevenue: I.steadyMonthlyRevenue * 0.9 }],
    ["Variable costs 10% higher", { variableCostPct: Math.min(99, I.variableCostPct * 1.1) }], ["Fixed costs 10% higher", { monthlyFixedCost: I.monthlyFixedCost * 1.1 }],
    ["Interest rate +2 points", { interestRate: I.interestRate + 2, ccRate: I.ccRate + 2 }],
    ["Sales \u221210% and variable costs +10%", { steadyMonthlyRevenue: I.steadyMonthlyRevenue * 0.9, variableCostPct: Math.min(99, I.variableCostPct * 1.1) }]];
  return cases.map(([name, ch]) => { const r = buildProjectReport({ ...I, ...ch }); const y3 = r.years[Math.min(2, r.years.length - 1)];
    return { name, avgDscr: r.dscr.average, minDscr: r.dscr.minimum, patY3: y3.pat, bepPct: r.bep.pctOfSales, cashNegative: r.fundingShortfallYear }; });
}

// Indian presentation: amounts in ₹ lakh; other currencies in thousands.
export function moneyUnit(currency: string): { label: string; div: number } { return currency === "INR" ? { label: "\u20b9 lakh", div: 1e5 } : { label: currency + " '000", div: 1e3 }; }
export function amt(v: number | null | undefined, currency: string, dp = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  const u = moneyUnit(currency); const x = v / u.div; const s = Math.abs(x).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return x < -0.005 ? "(" + s + ")" : s;
}
