/* ============================================================================
 * OrchestrIQ :: /api/market
 * Cloudflare Pages Function - server-side market data aggregator.
 *
 * WHY THIS EXISTS (three reasons the browser cannot do this itself):
 *   1. CORS. Most market data APIs refuse browser requests. A server can call
 *      them; a web page cannot.
 *   2. API KEYS. A key in front-end code is public. Here it stays in
 *      Cloudflare's encrypted environment and never reaches the browser.
 *   3. RATE LIMITS. This response is cached at Cloudflare's edge, so one
 *      upstream call serves every visitor for the cache window. Ten thousand
 *      users cost the same quota as one.
 *
 * HONESTY: every quote carries a `freshness` field - "live", "delayed" or
 * "daily" - so the interface can tell the user how current the number is
 * instead of implying everything is real-time when it is not.
 *
 * Optional environment variables (set in Cloudflare Pages > Settings >
 * Environment variables, as encrypted Secrets):
 *   TWELVEDATA_KEY  - intraday FX, indices, commodities (twelvedata.com)
 *   METALS_KEY      - precious/industrial metals (metals.dev)
 * With neither set, the endpoint still returns live crypto plus daily FX.
 * ========================================================================== */

interface Env {
  TWELVEDATA_KEY?: string;
  METALS_KEY?: string;
}

type Freshness = "live" | "delayed" | "daily";

interface Quote {
  label: string;
  value: string;
  raw: number;
  delta?: number;       // % change, where the source provides it
  group: "fx" | "crypto" | "metal" | "index" | "energy";
  freshness: Freshness;
  source: string;
}

const CACHE_SECONDS = 90;

/* --------------------------------------------------------------- helpers */

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

async function jget(url: string, ms = 6000): Promise<any | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- providers */

/** Crypto. Free, no key, genuinely live (updates every minute or two). */
async function crypto(): Promise<Quote[]> {
  const d = await jget(
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"
  );
  if (!d) return [];
  const out: Quote[] = [];
  const add = (id: string, label: string) => {
    const v = d?.[id]?.usd;
    if (typeof v !== "number") return;
    out.push({
      label, value: v >= 100 ? fmt(Math.round(v), 0) : fmt(v, 2), raw: v,
      delta: d[id].usd_24h_change, group: "crypto", freshness: "live", source: "CoinGecko",
    });
  };
  add("bitcoin", "BTC"); add("ethereum", "ETH"); add("solana", "SOL");
  return out;
}

/** FX fallback. No key, but ExchangeRate-API's open endpoint only moves once a day. */
async function fxDaily(): Promise<Quote[]> {
  const d = await jget("https://open.er-api.com/v6/latest/INR");
  if (!d?.rates) return [];
  const pairs: Array<[string, string, number]> = [
    ["USD/INR", "USD", 2], ["EUR/INR", "EUR", 2], ["GBP/INR", "GBP", 2],
    ["AED/INR", "AED", 3], ["JPY/INR", "JPY", 4], ["SGD/INR", "SGD", 2],
  ];
  const out: Quote[] = [];
  for (const [label, code, dp] of pairs) {
    const r = d.rates[code];
    if (typeof r !== "number" || r === 0) continue;
    const v = 1 / r;
    out.push({ label, value: fmt(v, dp), raw: v, group: "fx", freshness: "daily", source: "ExchangeRate-API" });
  }
  return out;
}

/** FX, indices and commodities via Twelve Data. Batched into one call. */
async function twelve(key: string): Promise<Quote[]> {
  const symbols: Array<{ sym: string; label: string; dp: number; group: Quote["group"] }> = [
    { sym: "USD/INR", label: "USD/INR", dp: 2, group: "fx" },
    { sym: "EUR/INR", label: "EUR/INR", dp: 2, group: "fx" },
    { sym: "GBP/INR", label: "GBP/INR", dp: 2, group: "fx" },
    { sym: "AED/INR", label: "AED/INR", dp: 3, group: "fx" },
    { sym: "JPY/INR", label: "JPY/INR", dp: 4, group: "fx" },
    // The rest need a paid Twelve Data plan. They fail silently on free.
    { sym: "XAU/USD", label: "Gold $/oz", dp: 2, group: "metal" },
    { sym: "XAG/USD", label: "Silver $/oz", dp: 2, group: "metal" },
  ];
  const d = await jget(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.map(s => s.sym).join(","))}` +
    `&apikey=${encodeURIComponent(key)}`
  );
  if (!d) return [];

  const out: Quote[] = [];
  for (const s of symbols) {
    const node = d[s.sym] ?? (d.symbol === s.sym ? d : null);
    if (!node || node.status === "error" || node.code) continue;
    const v = parseFloat(node.close ?? node.price);
    if (!Number.isFinite(v)) continue;
    const pc = parseFloat(node.percent_change);
    out.push({
      label: s.label, value: fmt(v, s.dp), raw: v,
      delta: Number.isFinite(pc) ? pc : undefined,
      group: s.group, freshness: "delayed", source: "Twelve Data",
    });
  }
  return out;
}

/** Metals via metals.dev, if a key is configured. */
async function metals(key: string): Promise<Quote[]> {
  const d = await jget(`https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(key)}&currency=USD&unit=toz`);
  const m = d?.metals;
  if (!m) return [];
  const out: Quote[] = [];
  const add = (k: string, label: string, dp: number) => {
    const v = m[k];
    if (typeof v !== "number") return;
    out.push({ label, value: fmt(v, dp), raw: v, group: "metal", freshness: "delayed", source: "metals.dev" });
  };
  add("gold", "Gold $/oz", 2);
  add("silver", "Silver $/oz", 2);
  add("platinum", "Platinum $/oz", 2);
  add("copper", "Copper $/lb", 3);
  add("nickel", "Nickel $/t", 0);
  return out;
}

/* ------------------------------------------------------------- handler */

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  // Serve from the edge cache when we can - protects the upstream quota.
  const cache = (caches as any).default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const tasks: Array<Promise<Quote[]>> = [crypto()];
  if (env.TWELVEDATA_KEY) tasks.push(twelve(env.TWELVEDATA_KEY));
  else tasks.push(fxDaily());
  if (env.METALS_KEY) tasks.push(metals(env.METALS_KEY));

  const settled = await Promise.all(tasks.map(p => p.catch(() => [] as Quote[])));
  let items = settled.flat();

  // If Twelve Data returned no FX at all (bad key, quota spent), fall back so
  // the strip is never empty.
  if (env.TWELVEDATA_KEY && !items.some(q => q.group === "fx")) {
    items = items.concat(await fxDaily().catch(() => []));
  }

  // De-duplicate by label, preferring the fresher source.
  const rank: Record<Freshness, number> = { live: 0, delayed: 1, daily: 2 };
  const best = new Map<string, Quote>();
  for (const q of items) {
    const cur = best.get(q.label);
    if (!cur || rank[q.freshness] < rank[cur.freshness]) best.set(q.label, q);
  }
  const ordered = Array.from(best.values()).sort((a, b) => {
    const g = ["fx", "crypto", "metal", "index", "energy"];
    return g.indexOf(a.group) - g.indexOf(b.group);
  });

  const body = JSON.stringify({
    ok: ordered.length > 0,
    updatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_SECONDS,
    providers: {
      crypto: "CoinGecko (live)",
      fx: env.TWELVEDATA_KEY ? "Twelve Data (intraday)" : "ExchangeRate-API (updates once a day)",
      metals: env.METALS_KEY ? "metals.dev" : env.TWELVEDATA_KEY ? "Twelve Data (paid plan required)" : "not configured",
    },
    items: ordered,
  });

  const res = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=30, s-maxage=${CACHE_SECONDS}`,
      "access-control-allow-origin": "*",
    },
  });

  context.env && (await cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
};
