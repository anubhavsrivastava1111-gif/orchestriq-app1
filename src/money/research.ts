// Lifeline — research: fetch price history for a fund or stock and analyse it.
// Only the fund code / stock symbol is sent to the data source. No personal data ever leaves the vault.
import type { FundMetrics } from "./types";
import { httpGetJson } from "./native";

export interface Point { t: number; v: number } // t = ms timestamp, v = price / NAV
export interface History { name: string; category: string; house: string; points: Point[] } // oldest → newest

const FD_RATE = 7; // benchmark: a bank FD

// ─── Fetch ──────────────────────────────────────────────────────────────────
export async function fundHistory(code: string): Promise<History> {
  const r = await httpGetJson<{ meta?: { scheme_name?: string; scheme_category?: string; fund_house?: string }; data?: { date: string; nav: string }[] }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
  if (!r.data?.length) throw new Error("No price history for this fund");
  const points = r.data.map(d => { const [dd, mm, yy] = d.date.split("-").map(Number); return { t: new Date(yy, mm - 1, dd).getTime(), v: Number(d.nav) }; })
    .filter(p => Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.t - b.t);
  return { name: r.meta?.scheme_name ?? code, category: r.meta?.scheme_category ?? "Mutual fund", house: r.meta?.fund_house ?? "", points };
}

export async function stockHistory(symbol: string, key: string): Promise<History> {
  if (!key) throw new Error("Add your free Alpha Vantage key in Connected apps to analyse stocks.");
  const pull = async (fn: string, field: string, series: string) => {
    const r = await httpGetJson<Record<string, unknown>>(`https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
    const s = r[series] as Record<string, Record<string, string>> | undefined;
    if (!s) { if (r["Note"] || r["Information"]) throw new Error(String(r["Note"] || r["Information"]).slice(0, 140)); throw new Error(`No data for ${symbol}. Try the format RELIANCE.BSE or AAPL.`); }
    return Object.entries(s).map(([d, row]) => ({ t: new Date(d).getTime(), v: Number(row[field]) })).filter(p => p.v > 0).sort((a, b) => a.t - b.t);
  };
  let points: Point[];
  try { points = await pull("TIME_SERIES_MONTHLY_ADJUSTED", "5. adjusted close", "Monthly Adjusted Time Series"); }
  catch (e) {
    if (/limit|premium/i.test((e as Error).message)) throw e;
    points = await pull("TIME_SERIES_MONTHLY", "4. close", "Monthly Time Series");
  }
  return { name: symbol.toUpperCase(), category: "Stock", house: "", points };
}

// ─── Analysis ───────────────────────────────────────────────────────────────
const YEAR = 365.25 * 86400000;

/** Last price at or before each month end (oldest → newest). */
export function monthly(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const d = new Date(p.t);
    const key = d.getFullYear() * 12 + d.getMonth();
    const last = out[out.length - 1];
    if (last && (new Date(last.t).getFullYear() * 12 + new Date(last.t).getMonth()) === key) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

function valueAt(points: Point[], t: number): Point | null {
  let lo = 0, hi = points.length - 1, best: Point | null = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid].t <= t) { best = points[mid]; lo = mid + 1; } else hi = mid - 1; }
  return best;
}

export function cagr(points: Point[], years: number): number | undefined {
  if (points.length < 2) return undefined;
  const end = points[points.length - 1];
  const start = valueAt(points, end.t - years * YEAR);
  if (!start || end.t - start.t < years * YEAR * 0.95) return undefined;
  const y = (end.t - start.t) / YEAR;
  return (Math.pow(end.v / start.v, 1 / y) - 1) * 100;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function analyse(points: Point[]): FundMetrics {
  const m = monthly(points);
  const rets = m.slice(1).map((p, i) => p.v / m[i].v - 1);
  const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  let peak = -Infinity, mdd = 0;
  for (const p of m) { peak = Math.max(peak, p.v); mdd = Math.min(mdd, p.v / peak - 1); }
  const yearly = m.slice(12).map((p, i) => (p.v / m[i].v - 1) * 100);
  const roll = m.slice(36).map((p, i) => (Math.pow(p.v / m[i].v, 1 / 3) - 1) * 100);
  const last = points[points.length - 1];
  return {
    asOf: new Date(last.t).toISOString(), last: last.v,
    cagr1: cagr(points, 1), cagr3: cagr(points, 3), cagr5: cagr(points, 5), cagr10: cagr(points, 10),
    vol: sd * Math.sqrt(12) * 100, maxDrawdown: mdd * 100,
    worstYear: yearly.length ? Math.min(...yearly) : 0, bestYear: yearly.length ? Math.max(...yearly) : 0,
    rolling3: roll.length ? { min: Math.min(...roll), median: median(roll), max: Math.max(...roll), pctBeatFd: (roll.filter(x => x > FD_RATE).length / roll.length) * 100 } : null,
    years: (last.t - points[0].t) / YEAR,
  };
}

/** “If I had invested ₹sip every month for the last n years” — value today and yearly return (XIRR). */
export function sipBacktest(points: Point[], sip: number, years: number): { invested: number; value: number; xirr: number; months: number } | null {
  const m = monthly(points);
  const n = Math.min(m.length - 1, Math.round(years * 12));
  if (n < 6) return null;
  const slice = m.slice(m.length - 1 - n);
  let units = 0;
  for (let i = 0; i < slice.length - 1; i++) units += sip / slice[i].v;
  const value = units * slice[slice.length - 1].v;
  const invested = sip * n;
  // XIRR on monthly flows: -sip at months 0..n-1, +value at month n
  const npv = (r: number) => -Array.from({ length: n }, (_, i) => sip / Math.pow(1 + r, i)).reduce((s, x) => s + x, 0) + value / Math.pow(1 + r, n);
  let lo = -0.05, hi = 0.1;
  for (let k = 0; k < 120; k++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return { invested, value, xirr: (Math.pow(1 + lo, 12) - 1) * 100, months: n };
}

/** Future scenarios built only from this investment's own past monthly returns (bootstrap). Not a prediction. */
export function projectFromHistory(points: Point[], lump: number, sip: number, months: number, paths = 1500): { p10: number; p50: number; p90: number; invested: number } | null {
  const m = monthly(points);
  const rets = m.slice(1).map((p, i) => p.v / m[i].v);
  if (rets.length < 24) return null;
  let s = 20260611;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const finals: number[] = [];
  for (let k = 0; k < paths; k++) {
    let v = lump;
    for (let i = 0; i < months; i++) v = (v + sip) * rets[Math.floor(rnd() * rets.length)];
    finals.push(v);
  }
  finals.sort((a, b) => a - b);
  const q = (p: number) => finals[Math.floor(p * (finals.length - 1))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), invested: lump + sip * months };
}

/** Plain-language read-out of the numbers, with the trade-offs. */
export function verdict(mt: FundMetrics): { tone: "good" | "warn" | "danger"; lines: string[] } {
  const lines: string[] = [];
  const c5 = mt.cagr5 ?? mt.cagr3;
  if (c5 !== undefined) lines.push(c5 > 12 ? `Strong past growth: ${c5.toFixed(1)}% a year.` : c5 > FD_RATE ? `Beat an FD: ${c5.toFixed(1)}% a year.` : `Lagged a bank FD: ${c5.toFixed(1)}% a year.`);
  if (mt.rolling3) lines.push(`In ${mt.rolling3.pctBeatFd.toFixed(0)}% of all 3-year periods it beat a ${FD_RATE}% FD.`);
  lines.push(`Biggest fall from a peak: ${mt.maxDrawdown.toFixed(0)}%. Worst 12 months: ${mt.worstYear.toFixed(0)}%.`);
  lines.push(mt.vol > 18 ? "High swings. Suits only money you won't need for 7+ years." : mt.vol > 8 ? "Moderate swings. Suits goals 5+ years away." : "Low swings. Suits short goals.");
  if (mt.years < 5) lines.push(`Only ${mt.years.toFixed(1)} years of history, so treat these numbers with caution.`);
  const tone = mt.maxDrawdown < -35 || mt.vol > 22 ? "danger" : mt.maxDrawdown < -15 ? "warn" : "good";
  return { tone, lines };
}

export const RESEARCH_SITES = (kind: "mf" | "stock", code: string, name: string) => {
  const q = encodeURIComponent(name);
  const base = code.replace(/\.(BSE|NSE|BO|NS)$/i, "");
  return kind === "mf"
    ? [
      { label: "Value Research", url: `https://www.valueresearchonline.com/search/?q=${q}` },
      { label: "Morningstar India", url: `https://www.morningstar.in/search.aspx?q=${q}` },
      { label: "AMFI (official NAVs)", url: "https://www.amfiindia.com/net-asset-value" },
      { label: "MF Central (invest/track)", url: "https://app.mfcentral.com" },
    ]
    : [
      { label: "Screener.in", url: `https://www.screener.in/company/${encodeURIComponent(base)}/` },
      { label: "Tickertape", url: `https://www.tickertape.in/search?text=${encodeURIComponent(base)}` },
      { label: "NSE India", url: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(base)}` },
      { label: "BSE India", url: "https://www.bseindia.com" },
    ];
};
