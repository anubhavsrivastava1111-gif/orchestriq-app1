// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE LIBRARY — a shared, cited fact base that compounds across sessions
//
// Every research run retrieves real sources and then throws them away. This keeps
// the FACTS (not the documents, not the questions) so the next person asking about
// the same market starts from what has already been established.
//
// ── THE PRIVACY BOUNDARY, which is the whole design ──────────────────────────
// A research brief is derived from the user's question, so storing the brief would
// leak their business. The boundary is drawn at the FACT:
//
//   STORED      market fact, source name, URL, publication date, tier,
//               industry, geography, angle
//   NEVER       the question, the company name, the user's own figures,
//               the "so what" clause (it is written ABOUT the user's business),
//               the executive debate, the synthesis
//
// The table has no column for any of those, so it cannot hold them even by
// mistake. On top of that, sanitiseFact() below rejects any line that addresses
// the reader or mentions the contributing company.
//
// ── WHY FACTS EXPIRE ─────────────────────────────────────────────────────────
// A regulation is good for a year. A steel price is stale in a month. Each angle
// carries its own TTL, and stale rows are simply not served.
//
// Pure functions plus Supabase calls. Every call is wrapped: the library can never
// break a research run. If it fails, research proceeds exactly as it does today.
// ─────────────────────────────────────────────────────────────────────────────

export type LibraryFact = {
  fact_text: string;
  source_name: string;
  source_url: string;
  source_domain: string;
  published_date: string | null;
  tier: "T1" | "T2" | "T3";
  industry: string;
  geography: string;
  angle: string;
  topic_tags: string[];
};

/** How long a fact from each angle stays trustworthy, in days. */
export const ANGLE_TTL_DAYS: Record<string, number> = {
  regulatory: 365,   // statutes and licences move slowly
  market: 180,       // market sizing is annual-ish
  customer: 180,
  competitors: 90,   // competitor pricing changes
  pricing: 60,       // benchmarks and margins move
  contrarian: 180,
  news: 21,          // "recent events" is stale fast
};
export const DEFAULT_TTL_DAYS = 90;

const SELF_REF = /\b(your|you|we|our|us)\b/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/**
 * Splits a Research Desk bullet into a storable market fact.
 * Deliberately DROPS the "→ So what:" clause — that clause is written about the
 * user's own business and is the single biggest leak risk in the whole brief.
 */
export function parseFindingLine(line: string, angle: string, industry: string, geography: string): LibraryFact | null {
  try {
    const raw = String(line || "").replace(/^\s*[\u2022\-\*]\s*/, "").replace(/^[\u{1F7E2}\u{1F7E1}\u{1F534}]\s*/u, "").trim();
    if (!raw) return null;

    const url = (raw.match(/https?:\/\/[^\s)]+/) || [""])[0];
    if (!url) return null;                                   // no source, no knowledge
    if (/NO RELIABLE SOURCE FOUND/i.test(raw)) return null;

    const tierM = raw.match(/\[(T1|T2|T3)\]/);
    const tier = (tierM ? tierM[1] : "T3") as "T1" | "T2" | "T3";

    // Everything before the "so what" clause is the fact itself.
    let factText = raw.split(/\u2192\s*So what:/i)[0];
    factText = factText.replace(/\[(T1|T2|T3)\]/, "").replace(/Source:.*$/i, "").trim();
    if (factText.length < 25) return null;

    const srcM = raw.match(/Source:\s*([^,]+?),\s*published\s*([^\s.]+)/i);
    const sourceName = srcM ? srcM[1].trim() : hostOf(url);
    const dateRaw = srcM ? srcM[2].trim() : "";
    const published = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;

    return {
      fact_text: factText.slice(0, 900),
      source_name: sourceName.slice(0, 160),
      source_url: url,
      source_domain: hostOf(url),
      published_date: published,
      tier,
      industry: (industry || "").slice(0, 120),
      geography: (geography || "").slice(0, 120),
      angle,
      topic_tags: [],
    };
  } catch { return null; }
}

/**
 * Final privacy gate. Rejects anything that addresses the reader or names the
 * contributing company. Runs after parsing, so nothing reaches the shared table
 * without passing it.
 */
export function sanitiseFact(f: LibraryFact, companyName: string): LibraryFact | null {
  if (!f) return null;
  if (SELF_REF.test(f.fact_text)) return null;
  const name = (companyName || "").trim().toLowerCase();
  if (name && name.length > 2 && f.fact_text.toLowerCase().includes(name)) return null;
  return f;
}

/** Extracts every storable fact from a completed research brief. */
export function extractFacts(
  briefBody: string,
  angleLabels: Array<{ id: string; label: string }>,
  industry: string,
  geography: string,
  companyName: string,
): LibraryFact[] {
  const out: LibraryFact[] = [];
  try {
    const lines = String(briefBody || "").split("\n");
    let angle = "market";
    for (const line of lines) {
      const h = line.match(/^###\s+(.*)$/);
      if (h) {
        const hit = angleLabels.find(a => h[1].trim().startsWith(a.label.slice(0, 28)));
        if (hit) angle = hit.id;
        continue;
      }
      const parsed = parseFindingLine(line, angle, industry, geography);
      if (!parsed) continue;
      const clean = sanitiseFact(parsed, companyName);
      if (clean) out.push(clean);
    }
  } catch { /* never break a research run */ }
  return out;
}

// ── SUPABASE I/O ─────────────────────────────────────────────────────────────

export async function saveFacts(supabase: any, facts: LibraryFact[], userId: string): Promise<number> {
  try {
    if (!supabase || !userId || !facts?.length) return 0;
    const rows = facts.slice(0, 60).map(f => ({ ...f, contributed_by: userId }));
    // Duplicates are expected and harmless: the unique index on (url, fact hash)
    // silently ignores a fact already in the library.
    const { error } = await supabase.from("knowledge_facts").upsert(rows, {
      onConflict: "source_url,fact_text", ignoreDuplicates: true,
    });
    if (error) { console.warn("[OIQ] library write skipped:", error.message); return 0; }
    return rows.length;
  } catch (e: any) { console.warn("[OIQ] library write skipped:", e?.message || e); return 0; }
}

export async function logQuery(supabase: any, row: {
  query_text: string; angle: string; industry: string; geography: string;
  provider: string; results_count: number; usable_count: number; junk_count: number;
}): Promise<void> {
  try { if (supabase) await supabase.from("knowledge_queries").insert(row); } catch { /* silent */ }
}

/**
 * Fetches still-fresh facts for one angle. Returns [] on any failure, so a
 * library outage degrades to today's behaviour rather than breaking research.
 */
export async function fetchFacts(supabase: any, opts: {
  industry: string; geography: string; angle: string; limit?: number;
}): Promise<any[]> {
  try {
    if (!supabase || !opts.industry) return [];
    const ttl = ANGLE_TTL_DAYS[opts.angle] ?? DEFAULT_TTL_DAYS;
    const cutoff = new Date(Date.now() - ttl * 86400000).toISOString();
    const { data, error } = await supabase
      .from("knowledge_facts")
      .select("fact_text,source_name,source_url,published_date,tier,geography,last_verified")
      .eq("industry", opts.industry)
      .eq("angle", opts.angle)
      .is("superseded_by", null)
      .gte("last_verified", cutoff)
      .order("tier", { ascending: true })
      .limit(opts.limit ?? 6);
    if (error) return [];
    // Prefer facts from the same geography, but never discard national data.
    const geo = (opts.geography || "").toLowerCase();
    return (data || []).sort((a: any, b: any) => {
      const ag = String(a.geography || "").toLowerCase().includes(geo) ? 0 : 1;
      const bg = String(b.geography || "").toLowerCase().includes(geo) ? 0 : 1;
      return ag - bg;
    });
  } catch { return []; }
}

/** Renders library facts for a prompt, clearly marked so they are never passed off as new. */
export function formatLibraryFacts(facts: any[]): string {
  if (!facts?.length) return "";
  const lines = facts.map((f, i) =>
    "[L" + (i + 1) + "] [" + (f.tier || "T3") + "] " + f.fact_text +
    " Source: " + (f.source_name || "") + ", published " + (f.published_date || "date-unknown") + ". " + f.source_url
  );
  return [
    "PREVIOUSLY ESTABLISHED FACTS FROM THIS WORKSPACE'S KNOWLEDGE LIBRARY:",
    ...lines,
    "",
    "These were retrieved and cited in earlier sessions and are still within their freshness window.",
    "You may reuse them, and you must keep their source and date exactly as given.",
    "Mark any bullet you reuse from here with [LIBRARY] so the reader can tell it apart from a fresh retrieval.",
    "If a new search result contradicts one of these, say so explicitly — a stale fact is worse than no fact.",
  ].join("\n");
}
