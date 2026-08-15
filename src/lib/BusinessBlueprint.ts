/* ============================================================================
 * OrchestrIQ :: BusinessBlueprint.ts
 *
 * Turns a plain-English business description into a RESEARCHED DRAFT cost
 * model that the user verifies, rather than a blank form they must fill.
 *
 * The user is often a consultant advising a business they are not an expert
 * in. They should not need to know a bakery's butter yield or a steel mill's
 * scale loss. This module does that research, drafts the whole structure with
 * typical figures for the geography, flags exactly what must be confirmed,
 * and names the margin leaks that are known to occur in that business type.
 *
 * Fail-safe: every function returns a usable result or a clear error object.
 * No throw reaches the UI.
 * ========================================================================== */

import type {
  CaResource, CaOffering, CaBomLine, CaCostPool, CaChannel,
  CaOfferingChannel, CaBusinessContext, ResourceClass, OfferingType,
} from "./CostEngine";

/* ------------------------------------------------------------------- types */

export type Verify = "confirmed" | "needs_check" | "must_supply";

export interface BpResource {
  name: string;
  resource_class: ResourceClass;
  purchase_uom: string;
  purchase_qty: number;
  purchase_price: number;
  base_uom: string;
  conversion_factor: number;
  effective_yield_pct: number;
  yield_reason: string;
  price_basis: string;
  verify: Verify;
  note: string;
}

export interface BpRecipeLine {
  resource_name: string;
  qty_per_unit: number;
  uom: string;
  process_scrap_pct: number;
  basis: string;
}

export interface BpOffering {
  name: string;
  offering_type: OfferingType;
  output_uom: string;
  list_price: number;
  monthly_volume: number;
  constraint_minutes_per_unit: number | null;
  price_basis: string;
  verify: Verify;
  recipe: BpRecipeLine[];
}

export interface BpChannel {
  name: string;
  channel_type: string;
  commission_pct: number;
  discount_pct: number;
  ad_spend_pct: number;
  payment_gateway_pct: number;
  packaging_cost: number;
  delivery_subsidy: number;
  returns_pct: number;
  gst_pct: number;
  basis: string;
  verify: Verify;
}

export interface BpCostPool {
  name: string;
  category: string;
  amount: number;
  period: string;
  allocation_basis: string;
  basis: string;
  verify: Verify;
}

export interface BpLeak {
  title: string;
  what_happens: string;
  how_to_spot_it: string;
  typical_size: string;
}

export interface BpChecklistItem {
  question: string;
  why_it_matters: string;
  field_hint: string;
  priority: "critical" | "important" | "nice_to_have";
}

export interface Blueprint {
  business_summary: string;
  business_archetype: string;
  currency: string;
  geography: string;
  constraint_resource_label: string;
  constraint_reason: string;
  resources: BpResource[];
  offerings: BpOffering[];
  channels: BpChannel[];
  cost_pools: BpCostPool[];
  leaks: BpLeak[];
  checklist: BpChecklistItem[];
  research_notes: string;
  sources: string[];
  confidence: "low" | "medium" | "high";
  warnings: string[];
}

export interface BlueprintResult {
  ok: boolean;
  blueprint: Blueprint | null;
  error: string | null;
  rawLength: number;
  /** How the result was produced - shown to the user so nothing is hidden. */
  stage: "web_research" | "model_knowledge" | "compact" | "template" | "failed";
  attempts: string[];
}

/** callAI receives (prompt, useWebSearch). The ladder toggles search. */
export type BlueprintCaller = (prompt: string, useWebSearch: boolean) => Promise<string>;

/* ------------------------------------------------------------- the prompt */

const ARCHETYPE_LIST = [
  "manufacturing_discrete", "manufacturing_process", "food_beverage", "retail_trading",
  "professional_services", "saas_digital", "logistics_transport", "healthcare",
  "construction", "hospitality", "education", "agriculture", "financial_services",
  "media_creative", "other",
].join(" | ");

const CLASS_LIST = [
  "MATERIAL", "LABOUR", "EQUIPMENT", "SUBCONTRACT", "DIGITAL",
  "FACILITY", "ENERGY", "LOGISTICS", "PACKAGING", "OTHER",
].join(" | ");

const TYPE_LIST = [
  "UNIT", "BATCH", "PROJECT", "BILLABLE_HOUR", "SUBSCRIPTION", "TRANSACTION", "SUB_ASSEMBLY",
].join(" | ");

export function buildBlueprintPrompt(
  description: string,
  opts: { geography?: string; currency?: string; depth?: "quick" | "deep" } = {}
): string {
  const geo = opts.geography || "India";
  const cur = opts.currency || "INR";
  const deep = opts.depth !== "quick";

  return `You are a cost engineering researcher building the unit-economics model for a business you have been asked to advise on. The person reading your output is a consultant or owner who is NOT an expert in this specific industry. Your job is to do the expert work for them and hand back a draft they only need to verify.

BUSINESS AS DESCRIBED BY THE USER:
"""
${description.slice(0, 2000)}
"""

MARKET: ${geo}. CURRENCY: ${cur}. All money figures in ${cur}, plain numbers, no symbols, no commas, no text like "approx".

${deep ? `RESEARCH FIRST. Search the web for current, real figures before answering:
- current ${geo} market prices for the main inputs this business buys, with the unit they are normally quoted in
- normal wastage / yield / utilisation for each input in this trade
- realistic recipe or consumption quantities per unit of output
- actual commission, discount and fee structures of the sales channels this business realistically uses in ${geo}
- typical fixed cost levels for a business of this kind and scale in ${geo}
- documented ways businesses of this type lose margin without noticing
Prefer trade associations, government price indices, company filings, industry reports and established trade publications. Say plainly when a figure is your estimate rather than something you found.
` : ""}
HOW TO THINK
1. Identify what the business actually converts into what it sells. Physical goods, people's time, machine time, licences, space, energy - all of these are inputs and all are costed the same way.
2. For EVERY input give the price the way a buyer would actually be quoted it (e.g. butter 1 kg at 520, a chef at 32000 per month), then give the base unit used in recipes and how many base units one purchase yields.
3. effective_yield_pct is the share of what you PAY FOR that actually reaches the finished product. Material: yield after trim, spoilage, spillage. Labour: billable or productive share of paid hours. Equipment: availability times performance. Software: seats actually used. Space: occupied share. NEVER put 100 unless genuinely nothing is lost. This single field is where most businesses silently lose money, so be realistic and explain your number in yield_reason.
4. Build a real recipe for each thing sold: which inputs, how much of each, per single unit of output.
5. Sales channels: use REAL current rates. Marketplace and aggregator commissions, self-funded discounts, ad spend, packaging, payment gateway, returns. This is where reported margin and actual margin diverge most.
6. Fixed costs are bills that do not change with volume. They never belong in a recipe.
7. Name the bottleneck - the one resource that caps output. Oven hours, machine hours, senior staff time, delivery vehicles, chairs, beds.

VERIFICATION FLAGS - be strict and honest:
"confirmed"    = a well-established published figure you are confident in
"needs_check"  = a reasonable typical figure, but it varies enough that the user must confirm
"must_supply"  = genuinely specific to this business; your number is a placeholder only

Selling prices and monthly volumes are almost always "must_supply". Do not pretend otherwise.

Return ONLY a JSON object. No markdown, no code fences, no commentary before or after.

{
  "business_summary": "one or two sentences describing the business as you understood it",
  "business_archetype": "${ARCHETYPE_LIST}",
  "currency": "${cur}",
  "geography": "${geo}",
  "constraint_resource_label": "the bottleneck in plain words",
  "constraint_reason": "why this is the bottleneck",
  "resources": [{
    "name": "string",
    "resource_class": "${CLASS_LIST}",
    "purchase_uom": "how it is bought, e.g. kg, month, litre, licence",
    "purchase_qty": 1,
    "purchase_price": 0,
    "base_uom": "unit used in recipes, e.g. kg, hour",
    "conversion_factor": 1,
    "effective_yield_pct": 100,
    "yield_reason": "why this much is lost",
    "price_basis": "where this price came from",
    "verify": "confirmed | needs_check | must_supply",
    "note": "anything the user should know, e.g. seasonal, volatile, substitutable"
  }],
  "offerings": [{
    "name": "string",
    "offering_type": "${TYPE_LIST}",
    "output_uom": "cake, tonne, engagement, subscriber-month",
    "list_price": 0,
    "monthly_volume": 0,
    "constraint_minutes_per_unit": 0,
    "price_basis": "how you arrived at this",
    "verify": "confirmed | needs_check | must_supply",
    "recipe": [{
      "resource_name": "MUST exactly match a name in resources",
      "qty_per_unit": 0,
      "uom": "string",
      "process_scrap_pct": 0,
      "basis": "why this quantity"
    }]
  }],
  "channels": [{
    "name": "string", "channel_type": "direct | marketplace | aggregator | distributor | reseller | retail | field_sales | inside_sales | partner | export",
    "commission_pct": 0, "discount_pct": 0, "ad_spend_pct": 0, "payment_gateway_pct": 0,
    "packaging_cost": 0, "delivery_subsidy": 0, "returns_pct": 0, "gst_pct": 0,
    "basis": "source of these rates", "verify": "confirmed | needs_check | must_supply"
  }],
  "cost_pools": [{
    "name": "string", "category": "facility | admin | sales_marketing | technology | depreciation | finance | rnd | compliance | other",
    "amount": 0, "period": "monthly", "allocation_basis": "revenue | units | direct_cost | constraint_hours | equal",
    "basis": "how you sized this", "verify": "confirmed | needs_check | must_supply"
  }],
  "leaks": [{
    "title": "short name of the leak",
    "what_happens": "the mechanism, in plain language",
    "how_to_spot_it": "what the user should look at to check whether it applies to them",
    "typical_size": "rough scale of the loss, with units"
  }],
  "checklist": [{
    "question": "a direct question the user must answer",
    "why_it_matters": "what breaks in the numbers if they get it wrong",
    "field_hint": "where in the tool this goes",
    "priority": "critical | important | nice_to_have"
  }],
  "research_notes": "what you found, what you could not find, and what you assumed",
  "sources": ["name of source - what it gave you"],
  "confidence": "low | medium | high",
  "warnings": ["anything that could make this draft misleading"]
}

SIZE: 5 to 12 resources, 1 to 5 offerings, 1 to 4 channels, 2 to 6 cost pools, 3 to 6 leaks, 4 to 8 checklist items. Every recipe resource_name must exactly match a resources[].name. Numbers must be numbers, never strings.`;
}

/* -------------------------------------------------- robust JSON extraction */

/** AI models return markdown, prose wrappers and trailing commas. Four passes. */
export function extractJSON(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  const attempts: string[] = [];

  // 1. as-is
  attempts.push(raw.trim());

  // 2. strip code fences
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) attempts.push(fence[1].trim());

  // 3. first { to last }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));

  // 4. brace-balanced scan (handles prose after the object)
  if (first !== -1) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = first; i < raw.length; i++) {
      const c = raw[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > first) attempts.push(raw.slice(first, end + 1));
  }

  for (const a of attempts) {
    for (const candidate of [a, repairJSON(a)]) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch { /* next */ }
    }
  }
  return null;
}

/** Common model output defects: trailing commas, smart quotes, NaN, comments. */
function repairJSON(s: string): string {
  return s
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\/[^\n\r]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/:\s*NaN/g, ": 0")
    .replace(/:\s*undefined/g, ": null")
    .replace(/:\s*(-?\d[\d,]*\.?\d*)\s*([,}\]])/g, (_m, n, t) => ": " + String(n).replace(/,/g, "") + t);
}

/* --------------------------------------------------------- normalisation */

const n = (v: any, d = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const p = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(p) ? p : d;
};
const s = (v: any, d = ""): string => (typeof v === "string" ? v.trim() : v == null ? d : String(v));
const clampPct = (v: any, d: number) => Math.min(100, Math.max(0.1, n(v, d)));

const VERIFY_SET: Verify[] = ["confirmed", "needs_check", "must_supply"];
const verifyOf = (v: any): Verify => (VERIFY_SET.includes(v) ? v : "needs_check");

const CLASSES: ResourceClass[] = ["MATERIAL","LABOUR","EQUIPMENT","SUBCONTRACT","DIGITAL","FACILITY","ENERGY","LOGISTICS","PACKAGING","OTHER"];
const TYPES: OfferingType[] = ["UNIT","BATCH","PROJECT","BILLABLE_HOUR","SUBSCRIPTION","TRANSACTION","SUB_ASSEMBLY"];

/** Sanity ceilings so a hallucinated 100% yield on labour never lands. */
const YIELD_SANITY: Record<string, number> = {
  MATERIAL: 98, PACKAGING: 99, LABOUR: 85, SUBCONTRACT: 90,
  EQUIPMENT: 90, FACILITY: 90, LOGISTICS: 90, DIGITAL: 90, ENERGY: 95, OTHER: 95,
};

export function normalizeBlueprint(o: any): Blueprint {
  const resources: BpResource[] = (Array.isArray(o?.resources) ? o.resources : [])
    .map((r: any): BpResource => {
      const cls = (CLASSES.includes(r?.resource_class) ? r.resource_class : "MATERIAL") as ResourceClass;
      const rawYield = clampPct(r?.effective_yield_pct, 100);
      return {
        name: s(r?.name, "Unnamed input"),
        resource_class: cls,
        purchase_uom: s(r?.purchase_uom, "unit"),
        purchase_qty: Math.max(0.0001, n(r?.purchase_qty, 1)),
        purchase_price: Math.max(0, n(r?.purchase_price, 0)),
        base_uom: s(r?.base_uom, s(r?.purchase_uom, "unit")),
        conversion_factor: Math.max(0.0001, n(r?.conversion_factor, 1)),
        effective_yield_pct: Math.min(rawYield, YIELD_SANITY[cls] ?? 95),
        yield_reason: s(r?.yield_reason),
        price_basis: s(r?.price_basis),
        verify: verifyOf(r?.verify),
        note: s(r?.note),
      };
    })
    .filter((r: BpResource) => !!r.name);

  const names = new Set(resources.map((r) => r.name.toLowerCase()));

  const offerings: BpOffering[] = (Array.isArray(o?.offerings) ? o.offerings : [])
    .map((f: any): BpOffering => ({
      name: s(f?.name, "Unnamed product"),
      offering_type: (TYPES.includes(f?.offering_type) ? f.offering_type : "UNIT") as OfferingType,
      output_uom: s(f?.output_uom, "unit"),
      list_price: Math.max(0, n(f?.list_price, 0)),
      monthly_volume: Math.max(0, n(f?.monthly_volume, 0)),
      constraint_minutes_per_unit: f?.constraint_minutes_per_unit == null ? null : Math.max(0, n(f.constraint_minutes_per_unit)),
      price_basis: s(f?.price_basis),
      verify: verifyOf(f?.verify),
      recipe: (Array.isArray(f?.recipe) ? f.recipe : [])
        .map((l: any): BpRecipeLine => ({
          resource_name: s(l?.resource_name),
          qty_per_unit: Math.max(0, n(l?.qty_per_unit, 0)),
          uom: s(l?.uom, "unit"),
          process_scrap_pct: Math.min(95, Math.max(0, n(l?.process_scrap_pct, 0))),
          basis: s(l?.basis),
        }))
        // drop recipe lines pointing at inputs that were never defined
        .filter((l: BpRecipeLine) => l.resource_name && names.has(l.resource_name.toLowerCase())),
    }))
    .filter((f: BpOffering) => !!f.name);

  const channels: BpChannel[] = (Array.isArray(o?.channels) ? o.channels : [])
    .map((c: any): BpChannel => ({
      name: s(c?.name, "Direct"),
      channel_type: s(c?.channel_type, "direct"),
      commission_pct: Math.max(0, n(c?.commission_pct)),
      discount_pct: Math.max(0, n(c?.discount_pct)),
      ad_spend_pct: Math.max(0, n(c?.ad_spend_pct)),
      payment_gateway_pct: Math.max(0, n(c?.payment_gateway_pct)),
      packaging_cost: Math.max(0, n(c?.packaging_cost)),
      delivery_subsidy: Math.max(0, n(c?.delivery_subsidy)),
      returns_pct: Math.max(0, n(c?.returns_pct)),
      gst_pct: Math.max(0, n(c?.gst_pct)),
      basis: s(c?.basis),
      verify: verifyOf(c?.verify),
    }))
    .filter((c: BpChannel) => !!c.name);

  const cost_pools: BpCostPool[] = (Array.isArray(o?.cost_pools) ? o.cost_pools : [])
    .map((p: any): BpCostPool => ({
      name: s(p?.name, "Overhead"),
      category: s(p?.category, "other"),
      amount: Math.max(0, n(p?.amount)),
      period: ["monthly", "quarterly", "annual"].includes(s(p?.period)) ? s(p.period) : "monthly",
      allocation_basis: s(p?.allocation_basis, "revenue"),
      basis: s(p?.basis),
      verify: verifyOf(p?.verify),
    }))
    .filter((p: BpCostPool) => !!p.name);

  const leaks: BpLeak[] = (Array.isArray(o?.leaks) ? o.leaks : [])
    .map((l: any): BpLeak => ({
      title: s(l?.title), what_happens: s(l?.what_happens),
      how_to_spot_it: s(l?.how_to_spot_it), typical_size: s(l?.typical_size),
    }))
    .filter((l: BpLeak) => !!l.title);

  const checklist: BpChecklistItem[] = (Array.isArray(o?.checklist) ? o.checklist : [])
    .map((c: any): BpChecklistItem => ({
      question: s(c?.question), why_it_matters: s(c?.why_it_matters),
      field_hint: s(c?.field_hint),
      priority: ["critical", "important", "nice_to_have"].includes(c?.priority) ? c.priority : "important",
    }))
    .filter((c: BpChecklistItem) => !!c.question);

  const warnings: string[] = (Array.isArray(o?.warnings) ? o.warnings : []).map((w: any) => s(w)).filter(Boolean);

  // Structural warnings the model cannot be trusted to raise about itself
  for (const f of offerings) {
    if (!f.recipe.length) warnings.push(`"${f.name}" came back with no recipe - add its inputs before the numbers mean anything.`);
    if (f.list_price <= 0) warnings.push(`"${f.name}" has no selling price - you must supply it.`);
  }
  if (!resources.length) warnings.push("No inputs were identified. Try describing what the business buys in more detail.");
  if (!channels.length) warnings.push("No sales channel identified - commission and discount leakage will not be measured.");

  return {
    business_summary: s(o?.business_summary),
    business_archetype: s(o?.business_archetype, "other"),
    currency: s(o?.currency, "INR"),
    geography: s(o?.geography, "India"),
    constraint_resource_label: s(o?.constraint_resource_label),
    constraint_reason: s(o?.constraint_reason),
    resources, offerings, channels, cost_pools, leaks, checklist,
    research_notes: s(o?.research_notes),
    sources: (Array.isArray(o?.sources) ? o.sources : []).map((x: any) => s(x)).filter(Boolean),
    confidence: ["low", "medium", "high"].includes(o?.confidence) ? o.confidence : "medium",
    warnings,
  };
}

/* ------------------------------------------------ hints from the user's text */

export interface Hints {
  money: number[];
  hours: number[];
  percents: number[];
  headcount: number | null;
  perUnitPrice: number | null;
  marginPct: number | null;
  plannedVsActual: { planned: number; actual: number } | null;
}

/** Pull real figures out of what the user typed so nothing they said is lost. */
export function extractHints(text: string): Hints {
  const t = (text || "").replace(/,/g, "");
  const money: number[] = [];
  const rxMoney = /(?:\u20B9|rs\.?|inr|rupees?)\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*(?:rupees?|inr)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rxMoney.exec(t))) {
    const v = parseFloat(m[1] || m[2]);
    if (Number.isFinite(v) && v > 0) money.push(v);
  }
  const hours: number[] = [];
  const rxHours = /([0-9]+(?:\.[0-9]+)?)\s*(?:hours?|hrs?)\b/gi;
  while ((m = rxHours.exec(t))) { const v = parseFloat(m[1]); if (Number.isFinite(v)) hours.push(v); }

  const percents: number[] = [];
  const rxPct = /([0-9]+(?:\.[0-9]+)?)\s*(?:%|per\s*cent|percent)/gi;
  while ((m = rxPct.exec(t))) { const v = parseFloat(m[1]); if (Number.isFinite(v)) percents.push(v); }

  const hc = t.match(/\b([0-9]+)\s*(?:person|people|member|employee|staff|consultant|head)/i);
  const headcount = hc ? parseInt(hc[1], 10) : null;

  // "10,000 per audit / per case / per project / each"
  const per = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:\u20B9|rs\.?|inr|rupees?)?\s*(?:per|\/|each)\s*(?:audit|case|project|engagement|unit|report|assignment)/i)
           || t.match(/(?:\u20B9|rs\.?|inr|rupees?)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:per|\/|each)\s*(?:audit|case|project|engagement|unit|report|assignment)/i);
  const perUnitPrice = per ? parseFloat(per[1]) : (money.length ? Math.max(...money) : null);

  const marginPct = percents.length ? percents[percents.length - 1] : null;

  let plannedVsActual: Hints["plannedVsActual"] = null;
  if (hours.length >= 2) {
    const a = hours[0], b = hours[1];
    if (b > a) plannedVsActual = { planned: a, actual: b };
    else if (a > b) plannedVsActual = { planned: b, actual: a };
  }
  return { money, hours, percents, headcount, perUnitPrice, marginPct, plannedVsActual };
}

/* --------------------------------------------- deterministic archetype guess */

const ARCHETYPE_KEYWORDS: Array<[string, RegExp]> = [
  ["professional_services", /consult|advisor|audit|agency|legal|law firm|accounting|ca firm|recruit|architect|design studio|market research|due diligence/i],
  ["saas_digital",          /saas|software as a service|subscription software|app|platform|api|cloud product/i],
  ["food_beverage",         /restaurant|bakery|cafe|caf\u00e9|cloud kitchen|food|dining|catering|sweet shop|snack|sandwich|pizza|biryani|qsr/i],
  ["manufacturing_process", /steel|cement|chemical|refinery|smelt|rolling mill|process plant|paper mill|textile mill/i],
  ["manufacturing_discrete",/manufactur|factory|assembly|fabricat|machin(e|ing) shop|component|工|工厂|workshop|engineering works/i],
  ["retail_trading",        /retail|store|shop|d2c|ecommerce|e-commerce|marketplace seller|trading|distribut|wholesal/i],
  ["logistics_transport",   /logistic|transport|fleet|trucking|courier|last mile|freight|delivery company|3pl/i],
  ["healthcare",            /hospital|clinic|diagnostic|healthcare|medical centre|medical center|dental|pharma retail/i],
  ["construction",          /construction|contractor|civil work|builder|infrastructure project|interior fit-?out/i],
  ["hospitality",           /hotel|resort|hostel|homestay|banquet|hospitality/i],
  ["education",             /school|coaching|edtech|training institute|tuition|academy/i],
  ["agriculture",           /farm|agri|dairy|poultry|plantation|horticulture/i],
];

export function detectArchetype(text: string): string {
  for (const [a, rx] of ARCHETYPE_KEYWORDS) if (rx.test(text || "")) return a;
  return "other";
}

/* ------------------------------------------------ deterministic fallback model */

/**
 * Built without any AI. Guarantees the user always leaves with a working
 * starting model seeded with the figures they actually typed.
 */
export function templateBlueprint(
  description: string, currency = "INR", geography = "India"
): Blueprint {
  const arch = detectArchetype(description);
  const h = extractHints(description);
  const price = h.perUnitPrice && h.perUnitPrice > 0 ? h.perUnitPrice : 0;

  const resources: BpResource[] = [];
  const recipe: BpRecipeLine[] = [];
  const channels: BpChannel[] = [];
  const pools: BpCostPool[] = [];
  const leaks: BpLeak[] = [];

  const R = (r: Partial<BpResource> & { name: string }): BpResource => ({
    resource_class: "OTHER", purchase_uom: "month", purchase_qty: 1, purchase_price: 0,
    base_uom: "unit", conversion_factor: 1, effective_yield_pct: 90,
    yield_reason: "", price_basis: "Starting placeholder - replace with your figure",
    verify: "must_supply", note: "", ...r,
  });

  if (arch === "professional_services") {
    // Utilisation derived from what the user described, if they gave it
    const util = h.plannedVsActual
      ? Math.max(30, Math.round((h.plannedVsActual.planned / h.plannedVsActual.actual) * 100))
      : 65;
    const deliveryHours = h.plannedVsActual ? h.plannedVsActual.actual : 10;

    resources.push(R({ name: "Consultant time", resource_class: "LABOUR", purchase_uom: "month",
      purchase_price: 0, base_uom: "hour", conversion_factor: 160, effective_yield_pct: util,
      yield_reason: h.plannedVsActual
        ? `You said ${h.plannedVsActual.planned} hours are scoped but ${h.plannedVsActual.actual} are actually delivered - that is ${util}% realisation`
        : "Billable share of paid hours - non-billable admin, sales and rework sit in the gap",
      price_basis: "Enter the monthly cost of the person delivering the work", verify: "must_supply" }));

    resources.push(R({ name: "Lead generation (LinkedIn / referral)", resource_class: "DIGITAL",
      purchase_uom: "month", purchase_price: h.money.find((v) => v > 500 && v < 50000 && v !== price) ?? 0,
      base_uom: "month", conversion_factor: 1, effective_yield_pct: 70,
      yield_reason: "Share of spend that converts to paying work",
      price_basis: "From your description", verify: "needs_check" }));

    resources.push(R({ name: "Meeting & collaboration software", resource_class: "DIGITAL",
      purchase_uom: "month", purchase_price: 0, base_uom: "month", conversion_factor: 1,
      effective_yield_pct: 75, yield_reason: "Seats actually used", verify: "must_supply" }));

    recipe.push({ resource_name: "Consultant time", qty_per_unit: deliveryHours, uom: "hour",
      process_scrap_pct: 0, basis: h.plannedVsActual ? "Actual hours you said are delivered" : "Typical hours per engagement" });

    channels.push({ name: "Direct / referral", channel_type: "direct", commission_pct: 0, discount_pct: 0,
      ad_spend_pct: 0, payment_gateway_pct: 0, packaging_cost: 0, delivery_subsidy: 0, returns_pct: 0,
      gst_pct: 18, basis: "Professional services attract 18% GST in India", verify: "needs_check" });

    pools.push({ name: "Software subscriptions", category: "technology", amount: 0, period: "monthly",
      allocation_basis: "revenue", basis: "Add your monthly tool spend", verify: "must_supply" });
    pools.push({ name: "Admin & office", category: "admin", amount: 0, period: "monthly",
      allocation_basis: "revenue", basis: "Rent, accounting, compliance", verify: "must_supply" });

    leaks.push({ title: "Scope overrun eats the margin silently",
      what_happens: "Work is priced on scoped hours but delivered on actual hours. The extra hours are never invoiced, so the loss never appears anywhere in the accounts - it just shows up as a thinner year.",
      how_to_spot_it: "Compare hours scoped against hours actually spent on your last five engagements.",
      typical_size: h.plannedVsActual ? `${Math.round(((h.plannedVsActual.actual / h.plannedVsActual.planned) - 1) * 100)}% overrun on your own numbers` : "10-50% of delivery hours" });
    leaks.push({ title: "Fixed fee on variable effort",
      what_happens: "A flat per-case fee means every complicated case is subsidised by the simple ones. Without per-engagement tracking the mix quietly shifts toward the hard ones.",
      how_to_spot_it: "Rank last quarter's engagements by hours spent at the same fee.",
      typical_size: "The worst quartile often runs at negative margin" });
    leaks.push({ title: "Non-billable time is invisible",
      what_happens: "Sales calls, proposals, admin and rework are paid for but never charged. At 65% realisation the true cost per billable hour is over 50% higher than the salary implies.",
      how_to_spot_it: "Divide monthly salary cost by hours actually invoiced, not hours worked.",
      typical_size: "20-40% uplift on true hourly cost" });
  } else if (arch === "food_beverage") {
    resources.push(R({ name: "Main ingredient", resource_class: "MATERIAL", purchase_uom: "kg",
      purchase_price: 0, base_uom: "kg", conversion_factor: 1, effective_yield_pct: 88,
      yield_reason: "Trim, spillage and spoilage" }));
    resources.push(R({ name: "Kitchen labour", resource_class: "LABOUR", purchase_uom: "month",
      purchase_price: 0, base_uom: "hour", conversion_factor: 208, effective_yield_pct: 72,
      yield_reason: "Productive share of paid hours" }));
    resources.push(R({ name: "Packaging", resource_class: "PACKAGING", purchase_uom: "pack",
      purchase_price: 0, base_uom: "unit", conversion_factor: 100, effective_yield_pct: 97,
      yield_reason: "Damage" }));
    recipe.push({ resource_name: "Main ingredient", qty_per_unit: 0, uom: "kg", process_scrap_pct: 0, basis: "Enter your recipe quantity" });
    channels.push({ name: "Walk-in", channel_type: "direct", commission_pct: 0, discount_pct: 0, ad_spend_pct: 0,
      payment_gateway_pct: 0, packaging_cost: 0, delivery_subsidy: 0, returns_pct: 0, gst_pct: 5,
      basis: "5% GST without input tax credit", verify: "needs_check" });
    channels.push({ name: "Delivery aggregator", channel_type: "aggregator", commission_pct: 22, discount_pct: 10,
      ad_spend_pct: 4, payment_gateway_pct: 0, packaging_cost: 0, delivery_subsidy: 0, returns_pct: 0, gst_pct: 5,
      basis: "NRAI reports 18-30% aggregator commission in India", verify: "needs_check" });
    pools.push({ name: "Rent", category: "facility", amount: 0, period: "monthly", allocation_basis: "revenue", basis: "", verify: "must_supply" });
    leaks.push({ title: "Aggregator discount is self-funded",
      what_happens: "The platform promotes a discount but the restaurant absorbs it, on top of commission and ad spend. Gross order value and settlement diverge sharply.",
      how_to_spot_it: "Compare app order value against the amount actually settled to your bank.",
      typical_size: "10-15% of order value on top of commission" });
  } else {
    resources.push(R({ name: "Main input", resource_class: "MATERIAL", purchase_uom: "unit",
      purchase_price: 0, base_uom: "unit", conversion_factor: 1, effective_yield_pct: 92,
      yield_reason: "Waste and rejection" }));
    resources.push(R({ name: "Direct labour", resource_class: "LABOUR", purchase_uom: "month",
      purchase_price: 0, base_uom: "hour", conversion_factor: 208, effective_yield_pct: 70,
      yield_reason: "Productive share of paid hours" }));
    recipe.push({ resource_name: "Main input", qty_per_unit: 0, uom: "unit", process_scrap_pct: 0, basis: "Enter your consumption per unit" });
    channels.push({ name: "Direct", channel_type: "direct", commission_pct: 0, discount_pct: 0, ad_spend_pct: 0,
      payment_gateway_pct: 0, packaging_cost: 0, delivery_subsidy: 0, returns_pct: 0, gst_pct: 18,
      basis: "Standard GST", verify: "needs_check" });
    pools.push({ name: "Fixed overheads", category: "other", amount: 0, period: "monthly", allocation_basis: "revenue", basis: "", verify: "must_supply" });
    leaks.push({ title: "Paying for more than reaches the product",
      what_happens: "Every input has a gap between what you buy and what converts into saleable output. That gap is paid for but never sold.",
      how_to_spot_it: "For your three largest inputs, measure what you purchased against what ended up in finished goods.",
      typical_size: "5-20% of input spend" });
  }

  const offering: BpOffering = {
    name: arch === "professional_services" ? "Client engagement" : "Main product",
    offering_type: arch === "professional_services" ? "PROJECT" : "UNIT",
    output_uom: arch === "professional_services" ? "engagement" : "unit",
    list_price: price, monthly_volume: 0,
    constraint_minutes_per_unit: arch === "professional_services" && h.plannedVsActual ? h.plannedVsActual.actual * 60 : null,
    price_basis: price > 0 ? "Taken from your description" : "Enter your price",
    verify: price > 0 ? "needs_check" : "must_supply",
    recipe,
  };

  return {
    business_summary: "Starter model built from your description without live research. Every figure marked \u201CYou must enter\u201D needs your real number before the diagnostics mean anything.",
    business_archetype: arch, currency, geography,
    constraint_resource_label: arch === "professional_services" ? "Consultant hours" : "Production capacity",
    constraint_reason: "The resource that caps how much you can deliver in a month.",
    resources, offerings: [offering], channels, cost_pools: pools, leaks,
    checklist: [
      { question: "What does the person delivering the work actually cost per month, fully loaded?", why_it_matters: "Every unit cost depends on it.", field_hint: "What you buy > You pay", priority: "critical" },
      { question: "How many units or engagements do you deliver in a month?", why_it_matters: "Without volume, nothing can be totalled or compared.", field_hint: "What you sell > Vol / month", priority: "critical" },
      { question: "Of the hours you pay for, what share is genuinely billable or productive?", why_it_matters: "This is usually the single largest hidden cost.", field_hint: "What you buy > Usable %", priority: "critical" },
      { question: "What are your fixed monthly bills - rent, salaries, software?", why_it_matters: "Needed for breakeven and true profit.", field_hint: "Setup > Fixed monthly costs", priority: "important" },
    ],
    research_notes: "Live research was unavailable, so this is a structural starter model rather than a researched one. The structure is correct for your industry; the numbers are yours to supply.",
    sources: [], confidence: "low",
    warnings: ["Built without live research - treat every figure as a placeholder until you replace it."],
  };
}

/* ------------------------------------------------------------- the runner */

/** Compact prompt - used when the full one produces nothing. */
function compactPrompt(description: string, geo: string, cur: string): string {
  return `Build a unit-economics starter model for this business. Market ${geo}, currency ${cur}.

"""${description.slice(0, 1200)}"""

Return ONLY JSON, no prose, no code fences:
{"business_summary":"","business_archetype":"${ARCHETYPE_LIST}","currency":"${cur}","geography":"${geo}","constraint_resource_label":"","constraint_reason":"",
"resources":[{"name":"","resource_class":"${CLASS_LIST}","purchase_uom":"","purchase_qty":1,"purchase_price":0,"base_uom":"","conversion_factor":1,"effective_yield_pct":80,"yield_reason":"","price_basis":"","verify":"needs_check","note":""}],
"offerings":[{"name":"","offering_type":"${TYPE_LIST}","output_uom":"","list_price":0,"monthly_volume":0,"constraint_minutes_per_unit":0,"price_basis":"","verify":"must_supply","recipe":[{"resource_name":"","qty_per_unit":0,"uom":"","process_scrap_pct":0,"basis":""}]}],
"channels":[{"name":"","channel_type":"direct","commission_pct":0,"discount_pct":0,"ad_spend_pct":0,"payment_gateway_pct":0,"packaging_cost":0,"delivery_subsidy":0,"returns_pct":0,"gst_pct":0,"basis":"","verify":"needs_check"}],
"cost_pools":[{"name":"","category":"other","amount":0,"period":"monthly","allocation_basis":"revenue","basis":"","verify":"must_supply"}],
"leaks":[{"title":"","what_happens":"","how_to_spot_it":"","typical_size":""}],
"checklist":[{"question":"","why_it_matters":"","field_hint":"","priority":"critical"}],
"research_notes":"","sources":[],"confidence":"medium","warnings":[]}

Use figures the user gave. effective_yield_pct is the share of what you pay for that reaches the product - for labour that is billable utilisation, never 100. 4-8 resources, 1-3 offerings, 3-5 leaks.`;
}

/**
 * Resilient ladder. Every rung is tried before giving up, and the last rung
 * cannot fail because it uses no AI at all. The user always leaves with a model.
 */
export async function researchBlueprint(
  callAI: BlueprintCaller,
  description: string,
  opts: { geography?: string; currency?: string; depth?: "quick" | "deep" } = {}
): Promise<BlueprintResult> {
  const clean = (description || "").trim();
  const geo = opts.geography || "India";
  const cur = opts.currency || "INR";
  const attempts: string[] = [];

  if (clean.length < 12) {
    return { ok: false, blueprint: null, rawLength: 0, stage: "failed", attempts,
      error: "Describe the business in a bit more detail - what it makes or does, roughly where, and how it sells." };
  }

  type Rung = { label: string; stage: BlueprintResult["stage"]; search: boolean; prompt: string };
  const rungs: Rung[] = [
    { label: "Live web research",        stage: "web_research",    search: true,  prompt: buildBlueprintPrompt(clean, { geography: geo, currency: cur, depth: "deep" }) },
    { label: "Model knowledge (no web)", stage: "model_knowledge", search: false, prompt: buildBlueprintPrompt(clean, { geography: geo, currency: cur, depth: "quick" }) },
    { label: "Compact request",          stage: "compact",         search: false, prompt: compactPrompt(clean, geo, cur) },
  ];

  let lastRaw = 0;
  for (const rung of rungs) {
    let raw = "";
    try {
      raw = await callAI(rung.prompt, rung.search);
    } catch (e: any) {
      const msg = e?.message || "unknown error";
      attempts.push(`${rung.label}: request failed - ${msg}`);
      // A bad key or exhausted quota will fail every rung - stop early and say so.
      if (/invalid api key|401|no api key|quota|billing/i.test(msg)) {
        return { ok: false, blueprint: null, rawLength: 0, stage: "failed", attempts,
          error: "Your AI provider rejected the request: " + msg + " Fix the key in Settings, then press Research again." };
      }
      continue;
    }

    if (!raw || !raw.trim()) { attempts.push(`${rung.label}: returned nothing`); continue; }
    lastRaw = raw.length;

    const parsed = extractJSON(raw);
    if (!parsed) { attempts.push(`${rung.label}: replied in prose, not JSON`); continue; }

    const bp = normalizeBlueprint(parsed);
    if (!bp.resources.length && !bp.offerings.length) { attempts.push(`${rung.label}: JSON had no usable content`); continue; }

    attempts.push(`${rung.label}: success`);
    if (rung.stage !== "web_research") {
      bp.warnings.unshift(
        rung.stage === "model_knowledge"
          ? "Live web search did not return in time, so this draft comes from the model's own knowledge. Prices may be out of date - check anything marked \u201CCheck this\u201D."
          : "This is a simplified draft - the fuller request did not come back. Structure is sound; verify the figures."
      );
    }
    return { ok: true, blueprint: bp, error: null, rawLength: raw.length, stage: rung.stage, attempts };
  }

  // Last rung: no AI at all. Cannot fail.
  const tpl = templateBlueprint(clean, cur, geo);
  attempts.push("Structural starter model: built without AI");
  return { ok: true, blueprint: tpl, error: null, rawLength: lastRaw, stage: "template", attempts };
}

/* ------------------------------------------- blueprint -> database rows */

export interface MappedRows {
  context: Partial<CaBusinessContext>;
  resources: CaResource[];
  offerings: CaOffering[];
  bomLines: CaBomLine[];
  costPools: CaCostPool[];
  channels: CaChannel[];
  offeringChannels: CaOfferingChannel[];
}

/**
 * Convert an accepted blueprint into rows ready for Supabase.
 * `newId` is injected so the caller controls id generation.
 * `skip` lets the user drop items they rejected during review.
 */
export function blueprintToRows(
  bp: Blueprint,
  userId: string,
  newId: () => string,
  skip: { resources?: Set<string>; offerings?: Set<string>; channels?: Set<string>; costPools?: Set<string> } = {}
): MappedRows {
  const skipR = skip.resources ?? new Set<string>();
  const skipO = skip.offerings ?? new Set<string>();
  const skipC = skip.channels ?? new Set<string>();
  const skipP = skip.costPools ?? new Set<string>();

  const resIdByName = new Map<string, string>();
  const resources: CaResource[] = [];
  for (const r of bp.resources) {
    if (skipR.has(r.name)) continue;
    const id = newId();
    resIdByName.set(r.name.toLowerCase(), id);
    resources.push({
      id, user_id: userId, name: r.name, resource_class: r.resource_class,
      purchase_uom: r.purchase_uom, purchase_qty: r.purchase_qty, purchase_price: r.purchase_price,
      base_uom: r.base_uom, conversion_factor: r.conversion_factor,
      effective_yield_pct: r.effective_yield_pct,
      yield_basis_label: r.yield_reason || null,
      freight_cost: 0, duty_cost: 0, other_landed_cost: 0, input_tax_credit: 0, scrap_recovery_value: 0,
      is_variable: true, is_substitutable: false,
      notes: [r.price_basis, r.note].filter(Boolean).join(" | ") || null,
    });
  }

  const offerings: CaOffering[] = [];
  const bomLines: CaBomLine[] = [];
  const offIds: string[] = [];
  for (const f of bp.offerings) {
    if (skipO.has(f.name)) continue;
    const id = newId();
    offIds.push(id);
    offerings.push({
      id, user_id: userId, name: f.name, offering_type: f.offering_type,
      output_uom: f.output_uom, batch_size: 1, list_price: f.list_price,
      monthly_volume: f.monthly_volume,
      constraint_minutes_per_unit: f.constraint_minutes_per_unit,
      is_active: true, notes: f.price_basis || null,
    });
    f.recipe.forEach((l, i) => {
      const rid = resIdByName.get(l.resource_name.toLowerCase());
      if (!rid) return;
      bomLines.push({
        id: newId(), user_id: userId, offering_id: id, child_type: "RESOURCE",
        child_resource_id: rid, child_offering_id: null,
        qty_per_unit: l.qty_per_unit, uom: l.uom,
        process_scrap_pct: l.process_scrap_pct, applies_per: "UNIT",
        sequence: i, is_optional: false, notes: l.basis || null,
      });
    });
  }

  const channels: CaChannel[] = [];
  const chIds: string[] = [];
  for (const c of bp.channels) {
    if (skipC.has(c.name)) continue;
    const id = newId();
    chIds.push(id);
    channels.push({
      id, user_id: userId, name: c.name, channel_type: c.channel_type,
      commission_pct: c.commission_pct, discount_pct: c.discount_pct,
      ad_spend_pct: c.ad_spend_pct, payment_gateway_pct: c.payment_gateway_pct,
      packaging_cost: c.packaging_cost, delivery_subsidy: c.delivery_subsidy,
      returns_pct: c.returns_pct, gst_pct: c.gst_pct, notes: c.basis || null,
    });
  }

  const costPools: CaCostPool[] = [];
  for (const p of bp.cost_pools) {
    if (skipP.has(p.name)) continue;
    costPools.push({
      id: newId(), user_id: userId, name: p.name, category: p.category,
      amount: p.amount, period: p.period, allocation_basis: p.allocation_basis as any,
      is_avoidable: false, notes: p.basis || null,
    });
  }

  // Attach every offering to every channel, splitting volume evenly so the
  // model computes immediately. The user re-weights this in one edit.
  const offeringChannels: CaOfferingChannel[] = [];
  if (chIds.length) {
    const share = Math.round((100 / chIds.length) * 10) / 10;
    for (const oid of offIds) {
      for (const cid of chIds) {
        offeringChannels.push({
          id: newId(), user_id: userId, offering_id: oid, channel_id: cid,
          volume_share_pct: share,
        });
      }
    }
  }

  return {
    context: {
      business_archetype: bp.business_archetype,
      currency: bp.currency,
      geography: bp.geography,
      constraint_resource_label: bp.constraint_resource_label || null,
    },
    resources, offerings, bomLines, costPools, channels, offeringChannels,
  };
}

/* ---------------------------------------------------------------- summary */

export function blueprintStats(bp: Blueprint) {
  const all = [
    ...bp.resources.map((r) => r.verify),
    ...bp.offerings.map((o) => o.verify),
    ...bp.channels.map((c) => c.verify),
    ...bp.cost_pools.map((p) => p.verify),
  ];
  return {
    total: all.length,
    confirmed: all.filter((v) => v === "confirmed").length,
    needsCheck: all.filter((v) => v === "needs_check").length,
    mustSupply: all.filter((v) => v === "must_supply").length,
    recipeLines: bp.offerings.reduce((s2, o) => s2 + o.recipe.length, 0),
    critical: bp.checklist.filter((c) => c.priority === "critical").length,
  };
}

export const BLUEPRINT_VERSION = "1.0.0";
