// Lifeline — investments and live market data.
//  • Mutual-fund NAVs: mfapi.in (free, no key; mirrors official AMFI data)
//  • Stock prices: Alpha Vantage (free key from alphavantage.co; Indian stocks as SYMBOL.BSE)
import type { Holding, MoneyState } from "./types";
import { httpGetJson } from "./native";

export const holdingInvested = (h: Holding) => h.units * h.avgPrice;
export const holdingValue = (h: Holding) =>
  h.lastPrice !== undefined && (h.kind === "stock" || h.kind === "mf" || h.kind === "crypto") ? h.units * h.lastPrice
    : h.manualValue ?? h.units * h.avgPrice;
export const isPriced = (h: Holding) => h.kind === "stock" || h.kind === "mf";

export interface Portfolio { value: number; invested: number; gain: number; gainPct: number; liquid: number; byKind: { kind: Holding["kind"]; value: number }[] }
export function portfolio(holdings: Holding[]): Portfolio {
  const value = holdings.reduce((s, h) => s + holdingValue(h), 0);
  const invested = holdings.reduce((s, h) => s + holdingInvested(h), 0);
  const kinds = new Map<Holding["kind"], number>();
  for (const h of holdings) kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + holdingValue(h));
  return {
    value, invested, gain: value - invested, gainPct: invested ? ((value - invested) / invested) * 100 : 0,
    liquid: holdings.filter(h => h.liquid).reduce((s, h) => s + holdingValue(h), 0),
    byKind: [...kinds.entries()].map(([kind, v]) => ({ kind, value: v })).sort((a, b) => b.value - a.value),
  };
}

// ─── Mutual funds (mfapi.in) ────────────────────────────────────────────────
export interface MfScheme { schemeCode: number; schemeName: string }
export async function searchFunds(q: string): Promise<MfScheme[]> {
  if (q.trim().length < 3) return [];
  const r = await httpGetJson<MfScheme[]>(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q.trim())}`);
  return Array.isArray(r) ? r.slice(0, 20) : [];
}
export async function fundNav(code: string): Promise<{ nav: number; date: string }> {
  const r = await httpGetJson<{ data?: { date: string; nav: string }[] }>(`https://api.mfapi.in/mf/${encodeURIComponent(code)}/latest`);
  const d = r.data?.[0];
  if (!d) throw new Error("No NAV found");
  return { nav: Number(d.nav), date: d.date };
}

// ─── Stocks (Alpha Vantage) ─────────────────────────────────────────────────
export async function stockQuote(symbol: string, key: string): Promise<number> {
  const r = await httpGetJson<Record<string, unknown>>(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
  const q = r["Global Quote"] as Record<string, string> | undefined;
  const price = q ? Number(q["05. price"]) : NaN;
  if (!Number.isFinite(price) || price <= 0) {
    if (r["Note"] || r["Information"]) throw new Error("Daily free limit reached (Alpha Vantage). Try again tomorrow.");
    throw new Error(`No price for ${symbol}. Use the format RELIANCE.BSE or AAPL.`);
  }
  return price;
}

/** Refreshes every priced holding. Returns updated holdings and a list of problems (if any). */
export async function refreshPrices(state: MoneyState): Promise<{ holdings: Holding[]; errors: string[]; updated: number }> {
  const errors: string[] = [];
  let updated = 0;
  const out: Holding[] = [];
  for (const h of state.holdings) {
    try {
      if (h.kind === "mf" && h.schemeCode) {
        const { nav } = await fundNav(h.schemeCode);
        out.push({ ...h, lastPrice: nav, priceAt: new Date().toISOString() }); updated++; continue;
      }
      if (h.kind === "stock" && h.symbol) {
        if (!state.integrations.alphaVantageKey) { errors.push("Add a free Alpha Vantage key in Connected apps for live stock prices."); out.push(h); continue; }
        const p = await stockQuote(h.symbol, state.integrations.alphaVantageKey);
        out.push({ ...h, lastPrice: p, priceAt: new Date().toISOString() }); updated++; continue;
      }
    } catch (e) {
      errors.push(`${h.name}: ${(e as Error).message}`);
    }
    out.push(h);
  }
  return { holdings: out, errors: [...new Set(errors)], updated };
}

export interface AppLink { id: string; name: string; pkg: string; web: string }
export const BROKER_APPS: AppLink[] = [
  { id: "kite", name: "Zerodha Kite", pkg: "com.zerodha.kite3", web: "https://kite.zerodha.com" },
  { id: "groww", name: "Groww", pkg: "com.nextbillion.groww", web: "https://groww.in" },
  { id: "upstox", name: "Upstox", pkg: "in.upstox.app", web: "https://upstox.com" },
  { id: "angel", name: "Angel One", pkg: "com.msf.angelmobile", web: "https://www.angelone.in" },
  { id: "indmoney", name: "INDmoney", pkg: "in.indwealth", web: "https://www.indmoney.com" },
];
export const UPI_APPS: AppLink[] = [
  { id: "gpay", name: "Google Pay", pkg: "com.google.android.apps.nbu.paisa.user", web: "https://pay.google.com" },
  { id: "phonepe", name: "PhonePe", pkg: "com.phonepe.app", web: "https://www.phonepe.com" },
  { id: "paytm", name: "Paytm", pkg: "net.one97.paytm", web: "https://paytm.com" },
  { id: "bhim", name: "BHIM", pkg: "in.org.npci.upiapp", web: "https://www.bhimupi.org.in" },
];
