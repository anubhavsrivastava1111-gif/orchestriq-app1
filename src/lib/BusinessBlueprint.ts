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
}

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

/* ------------------------------------------------------------- the runner */

export async function researchBlueprint(
  callAI: (prompt: string) => Promise<string>,
  description: string,
  opts: { geography?: string; currency?: string; depth?: "quick" | "deep" } = {}
): Promise<BlueprintResult> {
  const clean = (description || "").trim();
  if (clean.length < 12) {
    return { ok: false, blueprint: null, rawLength: 0,
      error: "Describe the business in a bit more detail - what it makes or does, roughly where, and how it sells." };
  }

  let raw = "";
  try {
    raw = await callAI(buildBlueprintPrompt(clean, opts));
  } catch (e: any) {
    return { ok: false, blueprint: null, rawLength: 0,
      error: "The AI request failed: " + (e?.message || "unknown error") + ". Check your provider key in Settings and try again." };
  }

  if (!raw || !raw.trim()) {
    return { ok: false, blueprint: null, rawLength: 0,
      error: "The AI returned an empty response. Try again, or switch provider in Settings." };
  }

  const parsed = extractJSON(raw);
  if (!parsed) {
    return { ok: false, blueprint: null, rawLength: raw.length,
      error: "The AI replied in prose instead of the structured format. Press Research again - this usually clears on a retry." };
  }

  const bp = normalizeBlueprint(parsed);
  if (!bp.resources.length && !bp.offerings.length) {
    return { ok: false, blueprint: null, rawLength: raw.length,
      error: "Nothing usable came back. Try naming the products and the main things the business buys." };
  }
  return { ok: true, blueprint: bp, error: null, rawLength: raw.length };
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
