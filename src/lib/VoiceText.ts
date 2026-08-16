/* ============================================================================
 * OrchestrIQ :: VoiceText.ts
 *
 * Makes free browser dictation usable for business work.
 *
 * The browser's speech recognition is free and offline-ish, but it was trained
 * on general speech. It does not know "OrchestrIQ", "GR/IR", "SOX" or "Concur",
 * and it writes Indian number words as words. So it produces things like
 * "Linkiden", "Orchestra IQ", "gorky" and "five lakh twenty thousand".
 *
 * This module repairs that afterwards, at zero cost:
 *   1. Domain vocabulary  - business and product terms spelled correctly
 *   2. Indian numbers     - "five lakh twenty thousand" becomes 520000
 *   3. Spoken punctuation - "full stop", "comma", "new line"
 *   4. Tidy-up            - spacing, capitalisation, stray filler words
 *
 * Pure functions. No network, no cost, fully testable.
 * ========================================================================== */

/* ------------------------------------------------------- domain vocabulary */

/**
 * What the recogniser hears -> what it should have written.
 * Keys are lowercase. Matching is whole-word and case-insensitive.
 * Order matters: longer phrases are applied before shorter ones.
 */
export const DOMAIN_TERMS: Array<[RegExp, string]> = [
  // ---- product and company
  [/\b(orchestra|orchestre|orchestrate)\s*(iq|i\.?\s?q\.?|ik|eye\s?q)\b/gi, "OrchestrIQ"],
  [/\borchestriq\b/gi, "OrchestrIQ"],
  [/\b(gorky|gorak|gorakh|goraq|gorakhi)\s*(ai|a\.?\s?i\.?)\b/gi, "GorakhAI"],
  [/\bgorakhai\b/gi, "GorakhAI"],
  [/\b(gorky|goraq)\b/gi, "Gorakh"],

  // ---- platforms commonly dictated
  [/\b(linkiden|linked\s?in|linkden|link\s?din|linkedin)\b/gi, "LinkedIn"],
  [/\b(service\s?now|servicenow|service\s?no)\b/gi, "ServiceNow"],
  [/\b(concur|con\s?cur|sap\s?concur)\b/gi, "Concur"],
  [/\b(power\s?bi|power\s?b\.?\s?i\.?|powerbi)\b/gi, "Power BI"],
  [/\b(power\s?automate)\b/gi, "Power Automate"],
  [/\b(sales\s?force|salesforce)\b/gi, "Salesforce"],
  [/\b(share\s?point|sharepoint)\b/gi, "SharePoint"],
  [/\b(one\s?drive|onedrive)\b/gi, "OneDrive"],
  [/\b(google\s?work\s?space|workspace)\b/gi, "Google Workspace"],
  [/\b(app\s?script|apps\s?script)\b/gi, "Apps Script"],
  [/\b(supabase|supa\s?base|super\s?base)\b/gi, "Supabase"],
  [/\b(cloud\s?flare|cloudflare)\b/gi, "Cloudflare"],
  [/\b(git\s?hub|github)\b/gi, "GitHub"],
  [/\b(swiggy|zomato)\b/gi, (m: string) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()] as any,

  // ---- audit, finance, compliance
  [/\b(s\.?\s?o\.?\s?x\.?|socks|sox)\b/gi, "SOX"],
  [/\b(g\.?\s?r\.?\s?i\.?\s?r\.?|gr\s?ir|grir|g\s?r\s?slash\s?i\s?r)\b/gi, "GR/IR"],
  [/\b(s\.?\s?l\.?\s?a\.?|sla|slas)\b/gi, "SLA"],
  [/\b(t\s?and\s?e|t\s?&\s?e|t\.?\s?n\.?\s?e\.?|travel\s?and\s?expense)\b/gi, "T&E"],
  [/\b(k\.?\s?p\.?\s?i\.?|kpi|kpis)\b/gi, "KPI"],
  [/\b(p\s?and\s?l|p\s?&\s?l|p\.?\s?n\.?\s?l\.?)\b/gi, "P&L"],
  [/\b(g\.?\s?s\.?\s?t\.?|gst)\b/gi, "GST"],
  [/\b(i\.?\s?t\.?\s?c\.?|input\s?tax\s?credit)\b/gi, "input tax credit"],
  [/\b(e\.?\s?b\.?\s?i\.?\s?t\.?\s?d\.?\s?a\.?|ebitda)\b/gi, "EBITDA"],
  [/\b(c\.?\s?a\.?\s?c\.?|cac)\b/gi, "CAC"],
  [/\b(l\.?\s?t\.?\s?v\.?|ltv)\b/gi, "LTV"],
  [/\b(r\.?\s?o\.?\s?i\.?|roi)\b/gi, "ROI"],
  [/\b(accounts\s?payable|a\.?\s?p\.?)\b/gi, "accounts payable"],
  [/\b(purchase\s?order|p\.?\s?o\.?)\b/gi, "purchase order"],
  [/\b(bill\s?of\s?materials|b\.?\s?o\.?\s?m\.?)\b/gi, "bill of materials"],
  [/\b(turn\s?around\s?time|t\.?\s?a\.?\s?t\.?)\b/gi, "turnaround time"],
  [/\b(o\.?\s?e\.?\s?e\.?|oee)\b/gi, "OEE"],
  [/\b(c\.?\s?s\.?\s?a\.?\s?t\.?|csat)\b/gi, "CSAT"],
  [/\b(h\.\s?r\.?|h\sr)\b/gi, "HR"],

  // ---- units frequently dictated in cost work
  [/\b(k\.?\s?g\.?|kilo\s?gram|kilogram)s?\b/gi, "kg"],
  [/\b(m\.?\s?t\.?|metric\s?ton(ne)?)\b/gi, "MT"],
  [/\bper\s?unit\b/gi, "per unit"],
  [/\bman\s?hours?\b/gi, "man-hours"],
];

/* ------------------------------------------------- Indian number handling */

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALE: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, lakhs: 100000,
  lacs: 100000, crore: 10000000, crores: 10000000, million: 1000000,
  billion: 1000000000,
};

/** Convert a run of number words into a single value. */
function wordsToNumber(words: string[]): number | null {
  let total = 0, current = 0, seen = false;
  for (const w of words) {
    const key = w.toLowerCase().replace(/[^a-z]/g, "");
    if (key === "and") continue;
    if (key in SMALL) { current += SMALL[key]; seen = true; continue; }
    if (key in SCALE) {
      const s = SCALE[key];
      if (current === 0) current = 1;
      if (s >= 1000) { total += current * s; current = 0; }
      else { current *= s; }
      seen = true;
      continue;
    }
    return null;
  }
  return seen ? total + current : null;
}

const NUM_WORD = new RegExp(
  `\\b(?:${[...Object.keys(SMALL), ...Object.keys(SCALE), "and"].join("|")})\\b`, "i"
);

/**
 * "five lakh twenty thousand"  -> "520000"
 * "twenty five thousand"       -> "25000"
 * "one hundred and twenty"     -> "120"
 * Leaves ordinary words alone.
 */
export function convertSpokenNumbers(text: string): string {
  // A lone number word directly before a unit is a figure, not prose.
  text = text.replace(
    new RegExp(`\\b(${Object.keys(SMALL).join("|")})\\s*(?=(percent|per cent|%|rupees?|kg\\b|hours?\\b))`, "gi"),
    (m, w) => (SMALL[String(w).toLowerCase()] !== undefined ? String(SMALL[String(w).toLowerCase()]) : m)
  );
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (!buf.length) return;
    const words = buf.filter(t => t.trim().length > 0);
    // A single small word like "one" or "and" is usually prose, not a figure.
    const meaningful = words.filter(w => !/^and$/i.test(w));
    // keep any trailing whitespace that belonged to the run
    const tail = /\s+$/.test(buf[buf.length - 1] || "") ? buf[buf.length - 1] : "";
    if (meaningful.length >= 2) {
      const n = wordsToNumber(words);
      if (n !== null && n > 0) { out.push(String(n) + tail); buf = []; return; }
    }
    out.push(buf.join(""));
    buf = [];
  };

  for (const tok of tokens) {
    if (!tok.trim()) { if (buf.length) buf.push(tok); else out.push(tok); continue; }
    if (NUM_WORD.test(tok.replace(/[^a-zA-Z]/g, ""))) { buf.push(tok); }
    else { flush(); out.push(tok); }
  }
  flush();
  return out.join("");
}

/* --------------------------------------------------- spoken punctuation */

const PUNCT: Array<[RegExp, string]> = [
  [/\s*\b(full stop|period)\b\s*/gi, ". "],
  [/\s*\b(comma)\b\s*/gi, ", "],
  [/\s*\b(question mark)\b\s*/gi, "? "],
  [/\s*\b(exclamation (mark|point))\b\s*/gi, "! "],
  [/\s*\b(colon)\b\s*/gi, ": "],
  [/\s*\b(semi colon|semicolon)\b\s*/gi, "; "],
  [/\s*\b(new line|newline|next line)\b\s*/gi, "\n"],
  [/\s*\b(new paragraph|next paragraph)\b\s*/gi, "\n\n"],
  [/\s*\b(open bracket)\b\s*/gi, " ("],
  [/\s*\b(close bracket)\b\s*/gi, ") "],
  [/\s*\b(percent|per cent)\b/gi, "%"],
  [/\s*\b(rupees|rupee)\b\s*/gi, " \u20B9"],
];

/* ------------------------------------------------------------- filler */

const FILLER = /\b(um+|uh+|erm+|hmm+|you know|i mean|like i said|basically|actually so)\b[,\s]*/gi;

/* ------------------------------------------------------------- pipeline */

export interface CleanOptions {
  domainTerms?: boolean;
  numbers?: boolean;
  punctuation?: boolean;
  removeFiller?: boolean;
  capitalise?: boolean;
}

/** Repair a raw dictation string. Every stage is optional and independent. */
export function cleanDictation(raw: string, opts: CleanOptions = {}): string {
  const {
    domainTerms = true, numbers = true, punctuation = true,
    removeFiller = true, capitalise = true,
  } = opts;

  let t = (raw || "").trim();
  if (!t) return "";

  if (removeFiller) t = t.replace(FILLER, " ");
  if (punctuation) for (const [rx, rep] of PUNCT) t = t.replace(rx, rep);
  if (numbers) t = convertSpokenNumbers(t);

  if (domainTerms) {
    for (const [rx, rep] of DOMAIN_TERMS) {
      t = typeof rep === "function"
        ? t.replace(rx, rep as any)
        : t.replace(rx, rep as string);
    }
  }

  // tidy spacing and punctuation adjacency
  t = t.replace(/[ \t]{2,}/g, " ")
       .replace(/\s+([,.;:!?%])/g, "$1")
       .replace(/\u20B9\s+/g, "\u20B9")
       .replace(/(\d[\d,]*(?:\.\d+)?)\s*\u20B9/g, "\u20B9$1")
       .replace(/(\u20B9[\d,\.]+)(?=[A-Za-z])/g, "$1 ")
       .replace(/(\d)(?=[A-Za-z]{2,})/g, "$1 ")
       .replace(/\(\s+/g, "(")
       .replace(/\s+\)/g, ")")
       .replace(/\n{3,}/g, "\n\n")
       .trim();

  if (capitalise) {
    t = t.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }
  return t;
}

/** What changed, so the user can see the corrections rather than trust blindly. */
export interface Correction { from: string; to: string; }

export function diffCorrections(raw: string, cleaned: string): Correction[] {
  const out: Correction[] = [];
  const seen = new Set<string>();
  for (const [rx, rep] of DOMAIN_TERMS) {
    if (typeof rep !== "string") continue;
    const re = new RegExp(rx.source, rx.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const from = m[0];
      if (from.toLowerCase() === rep.toLowerCase()) continue;
      const k = from.toLowerCase() + "->" + rep;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ from, to: rep });
      if (out.length >= 8) return out;
    }
  }
  const nums = cleaned.match(/\b\d{3,}\b/g) || [];
  if (nums.length && NUM_WORD.test(raw)) {
    for (const n of nums.slice(0, 3)) {
      const k = "num" + n;
      if (!seen.has(k)) { seen.add(k); out.push({ from: "spoken number", to: n }); }
    }
  }
  return out;
}

/* ----------------------------------------------- browser capability check */

export function speechInputSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof (window as any).SpeechSynthesisUtterance !== "undefined";
}

export const VOICE_TEXT_VERSION = "1.0.0";
