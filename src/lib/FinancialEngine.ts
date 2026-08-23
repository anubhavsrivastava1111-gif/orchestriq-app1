// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL ENGINE — real numbers from the Ledger, with their working shown
//
// You already run a full double-entry system. Ledger.tsx exports computeBalances()
// and computeStatements(), and the chart of accounts already has every code these
// derivations need: 5000 Cost of Goods Sold, 1100 Accounts Receivable, 2000
// Accounts Payable, 1200 Inventory, 1000/1010 Cash and Bank. Nothing was reading
// them, so the Boardroom estimated figures that were sitting in the books.
//
// TWO RULES THIS FILE FOLLOWS
//
// 1. EVERY FIGURE CARRIES ITS OWN DERIVATION.
//    Not "Gross margin 78%" but "45,00,000 - 9,90,000 = 35,10,000 -> 78.0%".
//    CONSULTING_STANDARD already demands executives show their working; until now
//    they had nothing real to show it from.
//
// 2. ARITHMETIC HAPPENS HERE, NOT IN A PROMPT.
//    Deterministic, reproducible, auditable, and free. The model interprets; it
//    does not calculate. That is your own stated architecture rule, finally kept.
//
// No imports, no API calls, no React. Pure functions over a balances map.
// ─────────────────────────────────────────────────────────────────────────────

export type Balances = Record<string, number>;

export type Metric = {
  key: string;
  label: string;
  value: number | null;
  unit: "currency" | "percent" | "days" | "ratio" | "months";
  derivation: string;          // the working, in words
  confidence: "actual" | "partial" | "unavailable";
  note?: string;
};

// Account codes, exactly as defined in Ledger.tsx COA.
const A = {
  CASH: "1000", BANK: "1010", AR: "1100", INVENTORY: "1200",
  EQUIP: "1500", BUILDING: "1510", VEHICLES: "1520", ACC_DEP: "1900",
  AP: "2000", ST_LOAN: "2100", ACCRUED: "2200", LT_LOAN: "2500",
  EQUITY: "3000", RETAINED: "3100", DRAWINGS: "3200",
  SALES: "4000", SERVICE: "4100", OTHER_INC: "4900",
  COGS: "5000", SALARIES: "5100", RENT: "5200", MARKETING: "5300",
  UTILITIES: "5400", DEPRECIATION: "5500", INTEREST: "5600", OTHER_EXP: "5900",
};

const n = (b: Balances, code: string) => Number(b?.[code] || 0);
const sum = (b: Balances, codes: string[]) => codes.reduce((s, c) => s + n(b, c), 0);

/** Indian numbering, because every figure in this app is read by an Indian SMB. */
export function fmtINR(v: number, sym = "₹"): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e7) return sign + sym + (a / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return sign + sym + (a / 1e5).toFixed(2) + " L";
  return sign + sym + Math.round(a).toLocaleString("en-IN");
}

const pct = (x: number) => (x >= 0 ? "" : "-") + Math.abs(x).toFixed(1) + "%";

function metric(key: string, label: string, value: number | null, unit: Metric["unit"],
                derivation: string, confidence: Metric["confidence"], note?: string): Metric {
  return { key, label, value, unit, derivation, confidence, note };
}

// ── THE DERIVATIONS ──────────────────────────────────────────────────────────

export function deriveFinancials(balances: Balances, opts?: { months?: number; sym?: string }): Metric[] {
  const b = balances || {};
  const sym = opts?.sym || "₹";
  const months = Math.max(1, opts?.months || 12);
  const out: Metric[] = [];
  const f = (v: number) => fmtINR(v, sym);

  const revenue = sum(b, [A.SALES, A.SERVICE, A.OTHER_INC]);
  const cogs = n(b, A.COGS);
  const opex = sum(b, [A.SALARIES, A.RENT, A.MARKETING, A.UTILITIES, A.OTHER_EXP]);
  const depreciation = n(b, A.DEPRECIATION);
  const interest = n(b, A.INTEREST);

  const currentAssets = sum(b, [A.CASH, A.BANK, A.AR, A.INVENTORY]);
  const currentLiab = sum(b, [A.AP, A.ST_LOAN, A.ACCRUED]);
  const totalLiab = currentLiab + n(b, A.LT_LOAN);
  const equity = sum(b, [A.EQUITY, A.RETAINED]) - n(b, A.DRAWINGS);
  const cash = sum(b, [A.CASH, A.BANK]);

  const no = (what: string) => metric("", "", null, "currency", "", "unavailable",
    "Cannot be derived: " + what + " has not been posted to the Ledger.");

  // ── Profitability ──
  out.push(metric("revenue", "Revenue", revenue || null, "currency",
    revenue ? "4000 Sales + 4100 Service + 4900 Other = " + f(revenue) : "",
    revenue ? "actual" : "unavailable",
    revenue ? undefined : "No revenue posted to accounts 4000/4100/4900."));

  out.push(metric("cogs", "Cost of Goods Sold", cogs || null, "currency",
    cogs ? "Account 5000 = " + f(cogs) : "",
    cogs ? "actual" : "unavailable",
    cogs ? undefined : "Account 5000 has no balance. Post COGS entries to enable gross margin."));

  if (revenue && cogs) {
    const gp = revenue - cogs;
    out.push(metric("gross_profit", "Gross Profit", gp, "currency",
      f(revenue) + " - " + f(cogs) + " = " + f(gp), "actual"));
    out.push(metric("gross_margin", "Gross Margin", gp / revenue * 100, "percent",
      f(gp) + " / " + f(revenue) + " = " + pct(gp / revenue * 100), "actual"));
  }

  out.push(metric("opex", "Operating Expenses", opex || null, "currency",
    opex ? "5100 Salaries + 5200 Rent + 5300 Marketing + 5400 Utilities + 5900 Other = " + f(opex) : "",
    opex ? "actual" : "unavailable"));

  if (revenue && (cogs || opex)) {
    const ebitda = revenue - cogs - opex;
    out.push(metric("ebitda", "EBITDA", ebitda, "currency",
      f(revenue) + " - " + f(cogs) + " - " + f(opex) + " = " + f(ebitda), "actual",
      "Depreciation (5500) and interest (5600) excluded, per definition."));
    out.push(metric("ebitda_margin", "EBITDA Margin", ebitda / revenue * 100, "percent",
      f(ebitda) + " / " + f(revenue) + " = " + pct(ebitda / revenue * 100), "actual"));
    const net = revenue - cogs - opex - depreciation - interest;
    out.push(metric("net_profit", "Net Profit", net, "currency",
      "EBITDA " + f(ebitda) + " - depreciation " + f(depreciation) + " - interest " + f(interest) + " = " + f(net), "actual"));
  }

  // ── Working capital ──
  if (currentAssets || currentLiab) {
    const wc = currentAssets - currentLiab;
    out.push(metric("working_capital", "Working Capital", wc, "currency",
      "Current assets " + f(currentAssets) + " - current liabilities " + f(currentLiab) + " = " + f(wc), "actual"));
    if (currentLiab > 0) {
      out.push(metric("current_ratio", "Current Ratio", currentAssets / currentLiab, "ratio",
        f(currentAssets) + " / " + f(currentLiab) + " = " + (currentAssets / currentLiab).toFixed(2) + "x", "actual"));
      const quick = currentAssets - n(b, A.INVENTORY);
      out.push(metric("quick_ratio", "Quick Ratio", quick / currentLiab, "ratio",
        "(" + f(currentAssets) + " - inventory " + f(n(b, A.INVENTORY)) + ") / " + f(currentLiab) +
        " = " + (quick / currentLiab).toFixed(2) + "x", "actual"));
    }
  }

  const ar = n(b, A.AR), ap = n(b, A.AP), inv = n(b, A.INVENTORY);
  const days = months * 30.42;
  if (ar && revenue) {
    const dso = ar / revenue * days;
    out.push(metric("dso", "Days Sales Outstanding", dso, "days",
      "AR " + f(ar) + " / revenue " + f(revenue) + " x " + Math.round(days) + " days = " + dso.toFixed(0) + " days", "actual",
      "How long customers take to pay. Account 1100."));
  }
  if (ap && cogs) {
    const dpo = ap / cogs * days;
    out.push(metric("dpo", "Days Payable Outstanding", dpo, "days",
      "AP " + f(ap) + " / COGS " + f(cogs) + " x " + Math.round(days) + " days = " + dpo.toFixed(0) + " days", "actual",
      "How long you take to pay suppliers. Account 2000."));
  }
  if (inv && cogs) {
    const dio = inv / cogs * days;
    out.push(metric("dio", "Days Inventory Outstanding", dio, "days",
      "Inventory " + f(inv) + " / COGS " + f(cogs) + " x " + Math.round(days) + " days = " + dio.toFixed(0) + " days", "actual"));
  }
  const dsoV = out.find(m => m.key === "dso")?.value;
  const dpoV = out.find(m => m.key === "dpo")?.value;
  const dioV = out.find(m => m.key === "dio")?.value || 0;
  if (dsoV != null && dpoV != null) {
    const ccc = dsoV + dioV - dpoV;
    out.push(metric("ccc", "Cash Conversion Cycle", ccc, "days",
      "DSO " + dsoV.toFixed(0) + " + DIO " + dioV.toFixed(0) + " - DPO " + dpoV.toFixed(0) + " = " + ccc.toFixed(0) + " days", "actual",
      ccc < 0 ? "Negative is good: suppliers fund your working capital." : undefined));
  }

  // ── Solvency and survival ──
  if (equity !== 0) {
    out.push(metric("debt_equity", "Debt to Equity", totalLiab / equity, "ratio",
      "Total liabilities " + f(totalLiab) + " / equity " + f(equity) + " = " + (totalLiab / equity).toFixed(2) + "x", "actual"));
  }
  const burn = (cogs + opex) / months;
  if (burn > 0) {
    out.push(metric("burn", "Monthly Burn", burn, "currency",
      "(COGS " + f(cogs) + " + OpEx " + f(opex) + ") / " + months + " months = " + f(burn), "actual"));
    if (cash > 0) {
      out.push(metric("runway", "Runway", cash / burn, "months",
        "Cash " + f(cash) + " / burn " + f(burn) + " = " + (cash / burn).toFixed(1) + " months", "actual",
        cash / burn < 6 ? "Under six months. Treat as urgent." : undefined));
    }
  }

  return out.filter(m => m.key);
}

// ── RECONCILIATION: Ledger truth vs Data Hub plan ────────────────────────────
// The gap between what was posted and what was planned is the single most useful
// fact in a board meeting, and nothing currently computes it.

export type Reconciliation = {
  metric: string; ledger: number; plan: number;
  variancePct: number; severity: "agree" | "note" | "conflict"; message: string;
};

/** Reads "₹5,00,000", "5 lakh", "1.2 cr", "5L", "500000" — all to a number. */
export function parseAmount(raw: any): number | null {
  if (typeof raw === "number" && isFinite(raw)) return raw;
  let s = String(raw ?? "").toLowerCase().replace(/[₹$€£,\s]/g, "");
  if (!s) return null;
  let mult = 1;
  if (/(crore|cr)$/.test(s)) { mult = 1e7; s = s.replace(/(crore|cr)$/, ""); }
  else if (/(lakhs|lakh|lac|l)$/.test(s)) { mult = 1e5; s = s.replace(/(lakhs|lakh|lac|l)$/, ""); }
  else if (/(million|mn|m)$/.test(s)) { mult = 1e6; s = s.replace(/(million|mn|m)$/, ""); }
  else if (/k$/.test(s)) { mult = 1e3; s = s.replace(/k$/, ""); }
  const v = parseFloat(s);
  return isFinite(v) ? v * mult : null;
}

const PLAN_KEYS: Record<string, string[]> = {
  revenue: ["monthly revenue", "revenue", "annual revenue", "arr", "mrr"],
  cogs: ["cogs", "cost of goods sold", "cost of goods"],
  opex: ["monthly operating costs", "operating costs", "opex", "operating expenses"],
};

export function reconcile(metrics: Metric[], compData: Record<string, any>): Reconciliation[] {
  const out: Reconciliation[] = [];
  const lower: Record<string, any> = {};
  Object.keys(compData || {}).forEach(k => { lower[k.toLowerCase().trim()] = compData[k]; });

  Object.entries(PLAN_KEYS).forEach(([key, labels]) => {
    const m = metrics.find(x => x.key === key);
    if (!m || m.value == null) return;
    const hit = labels.map(l => lower[l]).find(v => v != null);
    const plan = parseAmount(hit);
    if (plan == null || plan === 0) return;
    const variance = (m.value - plan) / plan * 100;
    const a = Math.abs(variance);
    const severity: Reconciliation["severity"] = a > 20 ? "conflict" : a > 5 ? "note" : "agree";
    out.push({
      metric: m.label, ledger: m.value, plan, variancePct: variance, severity,
      message: m.label + ": Ledger shows " + fmtINR(m.value) + ", Data Hub says " + fmtINR(plan) +
        " — " + (variance > 0 ? "+" : "") + variance.toFixed(1) + "%" +
        (severity === "conflict"
          ? ". MATERIAL CONFLICT: the board must decide which figure to rely on before using either."
          : severity === "note" ? ". Worth noting." : ". They agree."),
    });
  });
  return out;
}

// ── PROMPT BLOCK ─────────────────────────────────────────────────────────────

export function buildFinancialBrief(metrics: Metric[], recon: Reconciliation[], sym = "₹"): string {
  const usable = metrics.filter(m => m.value != null);
  if (!usable.length) {
    return "\n\nLEDGER FINANCIALS: no journal entries have been posted, so no actual figures exist. " +
      "Every financial number in this session is an estimate or an assumption. Say so explicitly, and do not present any of them as verified.\n";
  }
  const fmt = (m: Metric) =>
    m.unit === "currency" ? fmtINR(m.value as number, sym) :
    m.unit === "percent" ? (m.value as number).toFixed(1) + "%" :
    m.unit === "days" ? (m.value as number).toFixed(0) + " days" :
    m.unit === "months" ? (m.value as number).toFixed(1) + " months" :
    (m.value as number).toFixed(2) + "x";

  const lines: string[] = [];
  lines.push("");
  lines.push("═══ LEDGER FINANCIALS — POSTED ACTUALS, NOT ESTIMATES ═══");
  lines.push("These come from this company's own double-entry Ledger. Each carries its derivation.");
  lines.push("Use these figures in preference to any benchmark, and quote the derivation when you cite one.");
  lines.push("");
  usable.forEach(m => {
    lines.push("  " + m.label + ": " + fmt(m));
    lines.push("      = " + m.derivation);
    if (m.note) lines.push("      note: " + m.note);
  });
  const missing = metrics.filter(m => m.value == null && m.note);
  if (missing.length) {
    lines.push("");
    lines.push("NOT DERIVABLE FROM THE LEDGER:");
    missing.forEach(m => lines.push("  - " + m.note));
    lines.push("  Treat these as unknown. Do not substitute an estimate and present it as an actual.");
  }
  if (recon.length) {
    lines.push("");
    lines.push("LEDGER vs DATA HUB — reconciliation:");
    recon.forEach(r => lines.push("  " + (r.severity === "conflict" ? "⚠ " : "") + r.message));
    if (recon.some(r => r.severity === "conflict")) {
      lines.push("  A MATERIAL CONFLICT is a board matter. Name it, rule on which figure to use, and say why.");
    }
  }
  lines.push("═══ END LEDGER FINANCIALS ═══");
  lines.push("");
  return lines.join("\n");
}

/** One-line summary for a status strip. */
export function financialHeadline(metrics: Metric[], sym = "₹"): string {
  const g = metrics.find(m => m.key === "gross_margin");
  const r = metrics.find(m => m.key === "runway");
  const rev = metrics.find(m => m.key === "revenue");
  const bits: string[] = [];
  if (rev?.value != null) bits.push("Revenue " + fmtINR(rev.value, sym));
  if (g?.value != null) bits.push("GM " + g.value.toFixed(1) + "%");
  if (r?.value != null) bits.push("Runway " + r.value.toFixed(1) + " mo");
  return bits.join(" · ");
}
