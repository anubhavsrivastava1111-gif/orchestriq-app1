// ─────────────────────────────────────────────────────────────────────────────
// BlueprintBuilder.ts — build the document blueprint IN THE BROWSER
//
// WHY THIS EXISTS
//
// Two problems dissolved into one answer.
//
//   1. NVIDIA could not generate documents. The NVIDIA key lives in Cloudflare,
//      server-side, reachable only through /api/nvidia from the user's own
//      browser. The Railway render service is a different machine with no
//      NVIDIA key, so /generate/* could only ever use Claude, OpenAI or
//      DeepSeek. Not an oversight — what the architecture allowed.
//
//   2. Customer API keys were POSTed to Railway in the request body. TLS covers
//      them in flight; the exposure is at rest, in any request log or proxy.
//      Open HIGH finding since Session 47.
//
// The browser already reaches every provider. So it builds the blueprint here,
// and Railway only renders it. No keys are sent, because none are needed.
//
// SAFETY: if anything in this file fails — the model returns prose, the JSON is
// malformed, the provider is down — the caller falls back to the old
// /generate/* path, which is untouched. This can only add a better outcome; it
// cannot remove the existing one.
//
// The schemas below MUST match what the Python renderers expect. They were read
// directly from ai_extractor.py (_PPTX_PROMPT and _DOC_PROMPT), not guessed.
// ─────────────────────────────────────────────────────────────────────────────

export type BlueprintFormat = "pptx" | "pdf" | "docx";

export interface BlueprintResult {
  blueprint: any | null;
  ok: boolean;
  reason: string;
  provider?: string;
}

/** PPTX uses `slides`. PDF and DOCX use `sections`. Different shapes entirely. */
const PPTX_SCHEMA =
  '{"title":"...","subtitle":"...",\n' +
  ' "slides":[\n' +
  '  {"type":"bullets","h":"heading","kicker":"section label","points":["insight sentence"],"notes":"speaker note"},\n' +
  '  {"type":"kpi","h":"...","kpis":[["label","value","delta"]],"notes":"..."},\n' +
  '  {"type":"chart","h":"...","chart":{"ctype":"bar|line|pie","title":"...","cats":["..."],"series":[["name",[numbers]]]},"notes":"..."},\n' +
  '  {"type":"table","h":"...","table":{"rows":[["hdr"],["cell"]]},"notes":"..."},\n' +
  '  {"type":"two_col","h":"...","left":["..."],"right":["..."],"notes":"..."}\n' +
  " ]}";

const DOC_SCHEMA =
  '{"title":"...","subtitle":"...",\n' +
  ' "sections":[\n' +
  '  {"h":"heading","body":"3-6 sentence executive paragraph","bullets":["optional point"],\n' +
  '   "table":{"rows":[["hdr"],["cell"]]},\n' +
  '   "chart":{"ctype":"bar","title":"...","cats":["..."],"series":[["name",[numbers]]]}}\n' +
  " ]}";

const PPTX_RULES = [
  "10-16 slides, tailored EXACTLY to the request and the audience brief. No generic filler.",
  "At least 3 chart slides, 1 kpi slide and 1 table slide.",
  "Every slide carries a specific, useful speaker note.",
  "Executive arc: situation, analysis, insight, recommendation, next steps.",
  "Slide headings state the CONCLUSION, not the topic. Not 'Q3 Revenue' but 'Q3 revenue grew 34%, ahead of plan'.",
  "Maximum 6 points per slide, maximum 14 words per point. Longer thoughts belong in notes.",
];

const DOC_RULES = [
  "6-10 sections tailored EXACTLY to the request. Executive summary first, recommendations near the end.",
  "At least 2 tables and 1 chart across the document.",
  "Substantive analytical writing in full sentences. A report is read without a presenter, so it must stand alone.",
  "table and chart keys are optional per section — use them where they carry the argument.",
];

/**
 * Extract JSON from a model response that may be wrapped in prose or fences.
 * Models return markdown far more often than they should, and a silent parse
 * failure here is what previously produced raw markdown inside slide cells.
 */
function extractJson(raw: string): any | null {
  if (!raw) return null;
  let t = String(raw).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch { /* keep trying */ }
  // Take the outermost balanced object. Substring-to-last-brace fails whenever
  // the model adds a closing remark after the JSON.
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/** Coerce anything numeric-looking to a number; charts must not carry strings. */
function num(v: any): number {
  if (typeof v === "number" && isFinite(v)) return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

/**
 * Normalise whatever the model produced into exactly what the Python renderers
 * accept. The renderers are defensive, but sending them a clean structure means
 * a slide is never silently dropped for having the wrong shape.
 */
export function normaliseBlueprint(bp: any, format: BlueprintFormat): any | null {
  if (!bp || typeof bp !== "object") return null;
  const out: any = {
    title: String(bp.title || "").slice(0, 120),
    subtitle: String(bp.subtitle || "").slice(0, 140),
  };

  const cleanChart = (ch: any) => {
    if (!ch || typeof ch !== "object") return undefined;
    const cats = Array.isArray(ch.cats) ? ch.cats.slice(0, 24).map((c: any) => String(c)) : [];
    const seriesIn = Array.isArray(ch.series) ? ch.series.slice(0, 6) : [];
    const series = seriesIn
      .map((s: any) => {
        if (Array.isArray(s) && s.length === 2 && Array.isArray(s[1])) {
          return [String(s[0]), s[1].slice(0, 24).map(num)];
        }
        if (s && typeof s === "object" && Array.isArray(s.values)) {
          return [String(s.name || "Series"), s.values.slice(0, 24).map(num)];
        }
        return null;
      })
      .filter(Boolean);
    if (!cats.length || !series.length) return undefined;
    const ctype = ["bar", "line", "pie", "stacked", "hbar"].includes(ch.ctype) ? ch.ctype : "bar";
    return { ctype, title: String(ch.title || "").slice(0, 90), cats, series };
  };

  const cleanTable = (tb: any) => {
    const rows = Array.isArray(tb?.rows) ? tb.rows : Array.isArray(tb) ? tb : null;
    if (!rows) return undefined;
    const r = rows
      .filter((x: any) => Array.isArray(x))
      .slice(0, 40)
      .map((x: any[]) => x.slice(0, 8).map((c: any) => String(c ?? "")));
    return r.length ? { rows: r } : undefined;
  };

  if (format === "pptx") {
    const src = Array.isArray(bp.slides) ? bp.slides : Array.isArray(bp.sections) ? bp.sections : [];
    const slides = src
      .filter((s: any) => s && typeof s === "object")
      .slice(0, 30)
      .map((s: any) => {
        const o: any = {
          type: String(s.type || "bullets"),
          h: String(s.h || s.heading || "Section").slice(0, 120),
          kicker: String(s.kicker || "").slice(0, 60),
          notes: String(s.notes || "").slice(0, 700),
        };
        const ch = cleanChart(s.chart);
        const tb = cleanTable(s.table);
        if (ch) { o.type = "chart"; o.chart = ch; }
        else if (tb) { o.type = "table"; o.table = tb; }
        else if (Array.isArray(s.kpis) && s.kpis.length) {
          o.type = "kpi";
          o.kpis = s.kpis.slice(0, 10)
            .filter((k: any) => Array.isArray(k))
            .map((k: any[]) => k.slice(0, 3).map((x: any) => String(x ?? "")));
        } else if (Array.isArray(s.left) || Array.isArray(s.right)) {
          o.type = "two_col";
          o.left = (s.left || []).slice(0, 8).map((x: any) => String(x));
          o.right = (s.right || []).slice(0, 8).map((x: any) => String(x));
        } else {
          o.type = "bullets";
          const pts = Array.isArray(s.points) ? s.points
            : Array.isArray(s.bullets) ? s.bullets
            : s.body ? String(s.body).split(/(?<=\.)\s+/).slice(0, 6)
            : [];
          o.points = pts.slice(0, 8).map((x: any) => String(x)).filter(Boolean);
          if (!o.points.length) return null;
        }
        return o;
      })
      .filter(Boolean);
    if (!slides.length) return null;
    out.slides = slides;
    return out;
  }

  // pdf / docx
  const src = Array.isArray(bp.sections) ? bp.sections : Array.isArray(bp.slides) ? bp.slides : [];
  const sections = src
    .filter((s: any) => s && typeof s === "object")
    .slice(0, 24)
    .map((s: any) => {
      const o: any = { h: String(s.h || s.heading || "Section").slice(0, 120) };
      const body = s.body || (Array.isArray(s.points) ? s.points.join(" ") : "");
      if (body) o.body = String(body).slice(0, 4000);
      const bl = Array.isArray(s.bullets) ? s.bullets : Array.isArray(s.points) && s.body ? s.points : [];
      if (bl.length) o.bullets = bl.slice(0, 8).map((x: any) => String(x));
      const ch = cleanChart(s.chart); if (ch) o.chart = ch;
      const tb = cleanTable(s.table); if (tb) o.table = tb;
      return (o.body || o.bullets || o.table || o.chart) ? o : null;
    })
    .filter(Boolean);
  if (!sections.length) return null;
  out.sections = sections;
  return out;
}

/**
 * Ask the model for a blueprint, using the audience brief that
 * DocumentIntelligence already built. `ask` is the app's existing multi-provider
 * caller, so whichever provider the user selected is used — NVIDIA included.
 */
export async function buildBlueprint(
  format: BlueprintFormat,
  cfg: { brief: string; title: string; currencySymbol?: string },
  ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>,
  opts: { onProgress?: (m: string) => void } = {},
): Promise<BlueprintResult> {
  const onProgress = opts.onProgress || (() => {});
  const isDeck = format === "pptx";
  const sym = cfg.currencySymbol || "\u20b9";

  const sys = [
    isDeck
      ? "You are a McKinsey-caliber presentation designer."
      : "You are a McKinsey-caliber consultant and report writer.",
    "",
    "Design a " + (isDeck ? "boardroom-quality PowerPoint" : "publication-quality " + format.toUpperCase()) +
      " BLUEPRINT for the brief below.",
    "",
    "Return ONLY a JSON object. No markdown fence, no preamble, no closing remark.",
    "",
    "SCHEMA — follow it exactly:",
    isDeck ? PPTX_SCHEMA : DOC_SCHEMA,
    "",
    "RULES:",
    ...(isDeck ? PPTX_RULES : DOC_RULES).map(r => "- " + r),
    "- All monetary figures in " + sym + ".",
    "- CRITICAL: if the brief contains actual figures, use EXACTLY those. Derive new",
    "  values only by arithmetic from them. Never invent a number that contradicts",
    "  the evidence, and never invent one to fill a gap — say the gap exists instead.",
    "- Every chart's numbers must also appear in the surrounding text or a table, so",
    "  a reader can check the chart against something.",
  ].join("\n");

  onProgress("\uD83E\uDDE0 Designing the document structure\u2026");

  let lastErr = "";
  // THE RETRY USED TO SEND THE SAME PROMPT AGAIN. If the first attempt failed
  // because the prompt was too large to finish inside the provider's time
  // window - which is exactly what happens to NVIDIA's reasoning models on a
  // 120,000-character brief - then repeating it verbatim fails identically.
  // A retry that changes nothing is not a retry.
  //
  // Each attempt now shrinks the evidence. The audience brief and the schema
  // are at the TOP of the brief, so trimming from the end removes the least
  // important material first: the tail of the source content, not the
  // instructions. Attempt 3 is small enough that any provider can complete it.
  const SIZES = [120000, 35000, 14000];
  for (let attempt = 0; attempt < SIZES.length; attempt++) {
    try {
      const trimmed = cfg.brief.length > SIZES[attempt]
        ? cfg.brief.slice(0, SIZES[attempt]) +
          "\n\n[Source material truncated to fit. Build the document from what is above.]"
        : cfg.brief;
      const user = attempt === 0
        ? trimmed
        : trimmed + "\n\nReturn ONLY the JSON object, starting with { and ending with }. " +
          "No explanation, no markdown fence.";
      if (attempt > 0) {
        onProgress("\u26A0\uFE0F Retrying with less content (attempt " + (attempt + 1) + " of " + SIZES.length + ")\u2026");
      }
      const raw = await ask(sys, [{ role: "user", content: user }], isDeck ? 7000 : 8000);
      const text = typeof raw === "string" ? raw : (raw?.text || raw?.content?.[0]?.text || "");
      const parsed = extractJson(String(text));
      if (!parsed) { lastErr = "model did not return parseable JSON"; continue; }
      const bp = normaliseBlueprint(parsed, format);
      if (!bp) { lastErr = "blueprint had no usable slides or sections"; continue; }
      if (cfg.title) bp.title = cfg.title.slice(0, 120);
      const n = (bp.slides || bp.sections || []).length;
      onProgress("\u2713 Structure ready \u2014 " + n + (isDeck ? " slides" : " sections") + ", rendering\u2026");
      return { blueprint: bp, ok: true, reason: "browser blueprint (" + n + ")" };
    } catch (e: any) {
      lastErr = String(e?.message || e).slice(0, 200);
      // A key or sign-in problem will not improve with a smaller prompt.
      if (/invalid api key|sign in|no api key/i.test(lastErr)) break;
    }
  }
  return { blueprint: null, ok: false, reason: lastErr || "the model did not return a usable document structure" };
}

export default { buildBlueprint, normaliseBlueprint };
