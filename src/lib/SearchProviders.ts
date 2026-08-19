// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PROVIDERS — pluggable retrieval layer
//
// Why this exists: the Research Desk used to ask an LLM to search. That meant
// (a) paying frontier-model search fees on top of frontier token rates, and
// (b) letting the model decide whether to show a source URL — which is how a
// 48,000-word board report ended up with 63 "Verified Fact" claims and ZERO
// URLs. When retrieval is a separate API, the URL is a field in a JSON
// response that OUR code inserts. The model cannot omit it or invent it.
//
// Every adapter returns the SAME shape, so swapping providers is a config
// change, never a code change:
//     { title, url, snippet, publishedDate, source }
//
// This file makes no decisions about which provider to use — it only knows how
// to talk to each one. Selection lives in ModelProfiles (Session 12).
//
// Nothing imports this file until Session 11, so it cannot break any path.
// ─────────────────────────────────────────────────────────────────────────────

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string; // "" when the provider does not supply one
  source: string;        // display host, e.g. "rbi.org.in"
};

export type SearchOutcome = {
  results: SearchResult[];
  provider: string;
  fromCache: boolean;
  error?: string;
};

export type SearchProviderId =
  | "serper"
  | "tavily"
  | "brave"
  | "dataforseo"
  | "native"; // let the LLM search itself — the old behaviour, kept as a fallback

export type SearchKeys = Partial<Record<SearchProviderId, string>>;

// ─── PROVIDER METADATA (drives the Settings UI in Session 13) ────────────────

export const SEARCH_PROVIDERS: Array<{
  id: SearchProviderId;
  label: string;
  costPer1000Usd: number | null;
  freeTier: string;
  notes: string;
  keyPlaceholder: string;
  signupUrl: string;
}> = [
  {
    id: "serper",
    label: "Serper",
    costPer1000Usd: 1.0,
    freeTier: "2,500 queries once, on signup",
    notes: "Cheapest practical option. Raw Google results. Best default.",
    keyPlaceholder: "Serper API key",
    signupUrl: "https://serper.dev",
  },
  {
    id: "tavily",
    label: "Tavily",
    costPer1000Usd: 8.0,
    freeTier: "1,000 credits every month",
    notes: "Returns cleaned page text, not just snippets. Good permanent fallback.",
    keyPlaceholder: "Tavily API key (tvly-...)",
    signupUrl: "https://tavily.com",
  },
  {
    id: "brave",
    label: "Brave Search",
    costPer1000Usd: 5.0,
    freeTier: "$5 of credits monthly",
    notes: "Independent index — NOT derived from Google. Keep as legal-risk fallback.",
    keyPlaceholder: "Brave Search API key",
    signupUrl: "https://api-dashboard.search.brave.com",
  },
  {
    id: "dataforseo",
    label: "DataForSEO",
    costPer1000Usd: 0.6,
    freeTier: "Pay as you go, no minimum",
    notes: "Lowest cost per search. Slower. Uses login:password, not a bearer key.",
    keyPlaceholder: "login:password",
    signupUrl: "https://dataforseo.com",
  },
  {
    id: "native",
    label: "Model's own search (Claude / Gemini)",
    costPer1000Usd: 10.0,
    freeTier: "None",
    notes: "Most expensive, and the model decides whether to show you a URL.",
    keyPlaceholder: "Uses your existing Claude or Gemini key",
    signupUrl: "",
  },
];

export function searchProviderMeta(id: SearchProviderId) {
  return SEARCH_PROVIDERS.find((p) => p.id === id) || null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clean(s: any): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

/** Drops entries without a usable URL, de-duplicates by host+title, and trims. */
function normalise(raw: SearchResult[], limit: number): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of raw) {
    if (!r.url || !/^https?:\/\//i.test(r.url)) continue; // no URL, no entry — the whole point
    const key = hostOf(r.url) + "|" + r.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: clean(r.title).slice(0, 300),
      url: r.url,
      snippet: clean(r.snippet).slice(0, 1200),
      publishedDate: clean(r.publishedDate),
      source: r.source || hostOf(r.url),
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function postJson(url: string, headers: Record<string, string>, body: any, timeoutMs = 20000) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    let m = "";
    try { m = JSON.parse(t)?.error?.message || JSON.parse(t)?.message; } catch { m = t.slice(0, 200); }
    throw new Error("HTTP " + r.status + (m ? ": " + m : ""));
  }
  return r.json();
}

// ─── ADAPTERS ────────────────────────────────────────────────────────────────

async function searchSerper(query: string, key: string, limit: number): Promise<SearchResult[]> {
  const d = await postJson("https://google.serper.dev/search", { "X-API-KEY": key.trim() }, { q: query, num: Math.min(limit, 10) });
  const organic = Array.isArray(d?.organic) ? d.organic : [];
  const news = Array.isArray(d?.news) ? d.news : [];
  const map = (x: any): SearchResult => ({
    title: clean(x?.title),
    url: clean(x?.link),
    snippet: clean(x?.snippet),
    publishedDate: clean(x?.date),
    source: hostOf(clean(x?.link)),
  });
  return [...news.map(map), ...organic.map(map)];
}

async function searchTavily(query: string, key: string, limit: number): Promise<SearchResult[]> {
  const d = await postJson("https://api.tavily.com/search", {}, {
    api_key: key.trim(),
    query,
    search_depth: "basic",
    max_results: Math.min(limit, 10),
    include_answer: false,
  });
  const rs = Array.isArray(d?.results) ? d.results : [];
  return rs.map((x: any): SearchResult => ({
    title: clean(x?.title),
    url: clean(x?.url),
    snippet: clean(x?.content),
    publishedDate: clean(x?.published_date),
    source: hostOf(clean(x?.url)),
  }));
}

async function searchBrave(query: string, key: string, limit: number): Promise<SearchResult[]> {
  const u = "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) + "&count=" + Math.min(limit, 20);
  const r = await fetch(u, {
    headers: { Accept: "application/json", "X-Subscription-Token": key.trim() },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const rs = Array.isArray(d?.web?.results) ? d.web.results : [];
  return rs.map((x: any): SearchResult => ({
    title: clean(x?.title),
    url: clean(x?.url),
    snippet: clean(x?.description),
    publishedDate: clean(x?.page_age || x?.age),
    source: hostOf(clean(x?.url)),
  }));
}

async function searchDataForSeo(query: string, credentials: string, limit: number): Promise<SearchResult[]> {
  // credentials arrive as "login:password"
  const auth = typeof btoa === "function" ? btoa(credentials.trim()) : "";
  const d = await postJson(
    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    { Authorization: "Basic " + auth },
    [{ keyword: query, location_code: 2356 /* India */, language_code: "en", depth: Math.min(limit, 20) }],
    30000
  );
  const items = d?.tasks?.[0]?.result?.[0]?.items;
  const rs = Array.isArray(items) ? items : [];
  return rs
    .filter((x: any) => x?.type === "organic")
    .map((x: any): SearchResult => ({
      title: clean(x?.title),
      url: clean(x?.url),
      snippet: clean(x?.description),
      publishedDate: clean(x?.timestamp),
      source: hostOf(clean(x?.url)),
    }));
}

// ─── CACHE ───────────────────────────────────────────────────────────────────
// Same query twice in a session costs nothing. Research angles overlap heavily,
// so this is a real saving, not a micro-optimisation.

const _cache = new Map<string, { at: number; results: SearchResult[]; provider: string }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey(provider: string, query: string, limit: number) {
  return provider + "::" + limit + "::" + query.trim().toLowerCase();
}

export function clearSearchCache() {
  _cache.clear();
}

// ─── PUBLIC ENTRY POINT ──────────────────────────────────────────────────────

/**
 * Runs one search against the chosen provider, falling back through the rest
 * of the chain on failure. Returns [] rather than throwing, so a failed search
 * degrades the brief instead of killing the whole board session.
 */
export async function runSearch(
  query: string,
  chain: SearchProviderId[],
  keys: SearchKeys,
  limit = 8,
  onNote?: (provider: string, message: string) => void
): Promise<SearchOutcome> {
  const q = (query || "").trim();
  if (!q) return { results: [], provider: "none", fromCache: false, error: "Empty query." };

  let lastErr = "";
  for (const id of chain) {
    if (id === "native") continue; // handled by the caller, not here
    const key = (keys?.[id] || "").trim();
    if (!key) continue;

    const ck = cacheKey(id, q, limit);
    const hit = _cache.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { results: hit.results, provider: hit.provider, fromCache: true };
    }

    try {
      let raw: SearchResult[] = [];
      if (id === "serper") raw = await searchSerper(q, key, limit);
      else if (id === "tavily") raw = await searchTavily(q, key, limit);
      else if (id === "brave") raw = await searchBrave(q, key, limit);
      else if (id === "dataforseo") raw = await searchDataForSeo(q, key, limit);

      const results = normalise(raw, limit);
      if (!results.length) {
        lastErr = id + " returned no usable results";
        try { onNote && onNote(id, lastErr); } catch {}
        continue;
      }
      _cache.set(ck, { at: Date.now(), results, provider: id });
      return { results, provider: id, fromCache: false };
    } catch (e: any) {
      lastErr = String(e?.message || e);
      try { onNote && onNote(id, lastErr); } catch {}
    }
  }
  return { results: [], provider: "none", fromCache: false, error: lastErr || "No search provider configured." };
}

/** True when at least one non-native provider has a key. */
export function hasExternalSearch(chain: SearchProviderId[], keys: SearchKeys): boolean {
  return chain.some((id) => id !== "native" && !!(keys?.[id] || "").trim());
}

// ─── FORMATTING FOR PROMPTS ──────────────────────────────────────────────────

/**
 * Turns results into a block a model can reason over. The URL and the published
 * date are OUR text, not the model's, which is what makes citation reliable.
 */
export function formatResultsForPrompt(results: SearchResult[], heading?: string): string {
  if (!results.length) return (heading ? heading + "\n" : "") + "(no results retrieved)";
  const lines: string[] = [];
  if (heading) lines.push(heading);
  results.forEach((r, i) => {
    lines.push(
      "[" + (i + 1) + "] " + r.title +
      "\n    SOURCE: " + r.source +
      "\n    URL: " + r.url +
      "\n    PUBLISHED: " + (r.publishedDate || "date-unknown") +
      "\n    EXCERPT: " + r.snippet
    );
  });
  return lines.join("\n\n");
}

/** Instruction block that pairs with formatResultsForPrompt. */
export const RETRIEVED_RESULTS_RULES =
  "THESE RESULTS WERE RETRIEVED BY THE APPLICATION, NOT BY YOU.\n" +
  "Every URL and PUBLISHED date above is real and was returned by a search engine. Rules:\n" +
  "- Copy URLs EXACTLY as given. Never shorten, guess, reconstruct or invent one.\n" +
  "- Cite the PUBLISHED date shown. If it says date-unknown, write date-unknown — never substitute today's date.\n" +
  "- A finding you cannot tie to one of the numbered results above is NOT verified. Tag it [Recalled — Unverified].\n" +
  "- If the results do not answer the question, say so plainly. An honest gap is worth more than a confident guess.";

/** Rough cost estimate in USD for a planned number of searches. */
export function estimateSearchCost(provider: SearchProviderId, searches: number): number {
  const meta = searchProviderMeta(provider);
  if (!meta || meta.costPer1000Usd === null) return 0;
  return (meta.costPer1000Usd * searches) / 1000;
}
