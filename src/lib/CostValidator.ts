/* ============================================================================
 * OrchestrIQ :: CostValidator.ts
 *
 * Catches data that cannot be true, explains WHY in plain language, suggests a
 * value, and shows what each choice does to the answer.
 *
 * Design rules:
 *  - Never block. The user may be right and the rule wrong.
 *  - Always give a reason. "Invalid" teaches nothing.
 *  - Always show the consequence, so the user can judge for themselves.
 *  - Every finding is overridable, and an override is remembered.
 *
 * Pure functions. No React, no Supabase, no side effects.
 * ========================================================================== */

import {
  diagnose, effectiveCostPerBaseUnit, naiveCostPerBaseUnit, num, round, safeDiv,
  type CostWorkspace, type CaResource, type ResourceClass,
} from "./CostEngine";

/* -------------------------------------------------------------------- types */

export type Severity = "error" | "warning" | "info";
export type Scope = "resource" | "offering" | "bom" | "channel" | "pool" | "portfolio";

export interface Impact {
  label: string;
  withCurrent: string;
  withSuggested: string;
}

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  scope: Scope;
  entityId: string | null;
  entityName: string;
  field: string;
  fieldLabel: string;
  title: string;
  why: string;
  currentValue: string;
  suggestedValue: string | null;
  impact: Impact | null;
}

/* ------------------------------------------------------------------ helpers */

const key = (rule: string, id: string) => `${rule}::${id}`;

const CLASS_LABEL: Record<string, string> = {
  MATERIAL: "material", PACKAGING: "packaging", LABOUR: "labour",
  EQUIPMENT: "equipment", DIGITAL: "software", FACILITY: "space",
  ENERGY: "energy", LOGISTICS: "freight", SUBCONTRACT: "subcontract", OTHER: "input",
};

/** Realistic ceiling for "usable %" by input type. Above this is not achievable. */
const YIELD_CEILING: Record<string, number> = {
  MATERIAL: 98, PACKAGING: 99, LABOUR: 85, SUBCONTRACT: 90,
  EQUIPMENT: 90, FACILITY: 90, LOGISTICS: 90, DIGITAL: 90, ENERGY: 95, OTHER: 95,
};

/** Sensible default when the user has set something impossible. */
const YIELD_TYPICAL: Record<string, number> = {
  MATERIAL: 92, PACKAGING: 97, LABOUR: 70, SUBCONTRACT: 80,
  EQUIPMENT: 70, FACILITY: 70, LOGISTICS: 75, DIGITAL: 70, ENERGY: 88, OTHER: 85,
};

/** What "usable %" is called for each type, in the user's language. */
const YIELD_NAME: Record<string, string> = {
  MATERIAL: "yield after trim and spoilage", PACKAGING: "yield after damage",
  LABOUR: "billable or productive share of paid hours",
  EQUIPMENT: "availability times performance", DIGITAL: "share of seats actually used",
  FACILITY: "occupancy", ENERGY: "conversion efficiency", LOGISTICS: "load factor",
  SUBCONTRACT: "productive share", OTHER: "effective utilisation",
};

/** Plausible monthly cost band for a full-time person, by currency. */
const MONTHLY_LABOUR_BAND: Record<string, [number, number]> = {
  INR: [8000, 2500000], USD: [800, 40000], EUR: [800, 35000], GBP: [700, 30000], AED: [2500, 120000],
};

/** Words that mean "this row is a person's pay". */
const SALARY_WORDS = /salar|wage|payroll|staff cost|consultant|analyst|engineer|manager|developer|designer|auditor|chef|baker|operator|technician|associate|intern|employee|team member/i;

const money = (v: number, cur: string) => {
  const sym = cur === "INR" ? "\u20B9" : cur === "USD" ? "$" : cur === "EUR" ? "\u20AC" : cur + " ";
  return sym + Math.round(v).toLocaleString("en-IN");
};

/** Recompute the whole model with one resource field changed. */
function withResourceChange(ws: CostWorkspace, resourceId: string, patch: Partial<CaResource>): CostWorkspace {
  return {
    ...ws,
    resources: ws.resources.map((r) =>
      r.id === resourceId ? { ...r, ...patch, effective_cost_per_base_unit: null } : r),
  };
}

/* ============================================================================
 * THE RULES
 * ========================================================================== */

export function validate(ws: CostWorkspace, overrides: Set<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const cur = ws.context?.currency || "INR";
  const push = (f: Finding) => { if (!overrides.has(f.id)) out.push(f); };

  const usedResourceIds = new Set(
    ws.bomLines.filter((b) => b.child_type === "RESOURCE" && b.child_resource_id).map((b) => b.child_resource_id as string)
  );

  /* ---------------------------------------------------------- RESOURCE RULES */

  for (const r of ws.resources) {
    const cls = (r.resource_class || "OTHER") as ResourceClass;
    const clsLabel = CLASS_LABEL[cls] || "input";
    const yieldPct = num(r.effective_yield_pct, 100);
    const ceiling = YIELD_CEILING[cls] ?? 95;
    const typical = YIELD_TYPICAL[cls] ?? 85;
    const eff = effectiveCostPerBaseUnit(r);
    const naive = naiveCostPerBaseUnit(r);
    const nameOr = r.name || "(unnamed input)";

    // R1 :: usable % of 100
    if (yieldPct >= 100) {
      const alt = withResourceChange(ws, r.id, { effective_yield_pct: typical });
      const altR = alt.resources.find((x) => x.id === r.id)!;
      push({
        id: key("YIELD_100", r.id), rule: "YIELD_100", severity: cls === "LABOUR" ? "error" : "warning",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "effective_yield_pct", fieldLabel: "Usable %",
        title: "100% usable is almost never true",
        why: cls === "LABOUR"
          ? `This says every paid hour is billable. Proposals, admin, internal meetings and rework mean it is normally ${typical}%. At 100% your cost per billable hour is understated by roughly ${round((100 / typical - 1) * 100, 0)}%.`
          : `This says nothing is ever lost. For ${clsLabel} there is normally some loss - ${YIELD_NAME[cls]}. Leaving it at 100% makes this input look cheaper than it is.`,
        currentValue: "100%", suggestedValue: `${typical}%`,
        impact: {
          label: `True cost per ${r.base_uom || "unit"}`,
          withCurrent: money(eff, cur),
          withSuggested: money(effectiveCostPerBaseUnit(altR), cur),
        },
      });
    }
    // R2 :: above what is physically achievable
    else if (yieldPct > ceiling) {
      const alt = withResourceChange(ws, r.id, { effective_yield_pct: ceiling });
      const altR = alt.resources.find((x) => x.id === r.id)!;
      push({
        id: key("YIELD_ABOVE_CEILING", r.id), rule: "YIELD_ABOVE_CEILING", severity: "warning",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "effective_yield_pct", fieldLabel: "Usable %",
        title: `Above the realistic ceiling for ${clsLabel}`,
        why: `${yieldPct}% is higher than ${clsLabel} normally achieves. The practical ceiling is around ${ceiling}% (${YIELD_NAME[cls]}). If you have measured this, keep it - otherwise it understates your cost.`,
        currentValue: `${yieldPct}%`, suggestedValue: `${ceiling}%`,
        impact: {
          label: `True cost per ${r.base_uom || "unit"}`,
          withCurrent: money(eff, cur),
          withSuggested: money(effectiveCostPerBaseUnit(altR), cur),
        },
      });
    }
    // R3 :: implausibly low
    else if (yieldPct > 0 && yieldPct < 25) {
      push({
        id: key("YIELD_VERY_LOW", r.id), rule: "YIELD_VERY_LOW", severity: "warning",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "effective_yield_pct", fieldLabel: "Usable %",
        title: "Usable % looks too low",
        why: `Only ${yieldPct}% usable means you throw away ${100 - yieldPct}% of everything you buy. That is possible but rare. Check you have not typed the waste figure here instead of the usable figure - they are opposites.`,
        currentValue: `${yieldPct}%`, suggestedValue: `${100 - yieldPct}%`,
        impact: {
          label: `True cost per ${r.base_uom || "unit"}`,
          withCurrent: money(eff, cur),
          withSuggested: money(safeDiv(naive * 100, 100 - yieldPct), cur),
        },
      });
    }

    // R4 :: price of zero on something actually used in a recipe
    if (num(r.purchase_price) <= 0 && usedResourceIds.has(r.id)) {
      push({
        id: key("PRICE_ZERO", r.id), rule: "PRICE_ZERO", severity: "error",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "purchase_price", fieldLabel: "You pay",
        title: "Costs nothing but is used in a recipe",
        why: `This input has a price of zero yet appears in a product recipe. Every product using it is being costed as if it were free, so those margins are overstated.`,
        currentValue: money(0, cur), suggestedValue: null, impact: null,
      });
    }

    // R5 :: conversion of 1 when the units clearly differ
    const pu = (r.purchase_uom || "").toLowerCase().trim();
    const bu = (r.base_uom || "").toLowerCase().trim();
    const convF = num(r.conversion_factor, 1);
    if (pu && bu && pu !== bu && convF === 1) {
      const guess = (pu === "month" && bu === "hour") ? 160
                  : (pu === "week" && bu === "hour") ? 40
                  : (pu === "day" && bu === "hour") ? 8
                  : (pu === "kg" && bu === "g") ? 1000
                  : (pu === "mt" || pu === "tonne") && bu === "kg" ? 1000
                  : (pu === "l" || pu === "litre") && bu === "ml" ? 1000
                  : null;
      push({
        id: key("CONV_MISMATCH", r.id), rule: "CONV_MISMATCH", severity: "warning",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "conversion_factor", fieldLabel: "How many base units per purchase",
        title: `Bought in "${r.purchase_uom}" but recipes use "${r.base_uom}"`,
        why: `You buy this by the ${r.purchase_uom} but recipes count it in ${r.base_uom}, and the conversion is set to 1. That treats one ${r.purchase_uom} as one ${r.base_uom}.${guess ? ` For ${pu} to ${bu} it is usually ${guess}.` : " Set how many " + r.base_uom + " one " + r.purchase_uom + " gives you."}`,
        currentValue: "1", suggestedValue: guess ? String(guess) : null,
        impact: guess ? {
          label: `True cost per ${r.base_uom}`,
          withCurrent: money(eff, cur),
          withSuggested: money(effectiveCostPerBaseUnit(withResourceChange(ws, r.id, { conversion_factor: guess }).resources.find((x) => x.id === r.id)!), cur),
        } : null,
      });
    }

    // R6 :: conversion not 1 when the units are identical
    if (pu && bu && pu === bu && convF !== 1) {
      push({
        id: key("CONV_SAME_UNIT", r.id), rule: "CONV_SAME_UNIT", severity: "error",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "conversion_factor", fieldLabel: "How many base units per purchase",
        title: `One ${r.purchase_uom} is being treated as ${convF} ${r.base_uom}`,
        why: `You buy in "${r.purchase_uom}" and recipes also use "${r.base_uom}" - the same unit - so the conversion should be 1. At ${convF} the cost is divided by ${convF}, making it ${convF > 1 ? `${convF} times cheaper` : "more expensive"} than reality.`,
        currentValue: String(convF), suggestedValue: "1",
        impact: {
          label: `True cost per ${r.base_uom}`,
          withCurrent: money(eff, cur),
          withSuggested: money(effectiveCostPerBaseUnit(withResourceChange(ws, r.id, { conversion_factor: 1 }).resources.find((x) => x.id === r.id)!), cur),
        },
      });
    }

    // R7 :: a person's monthly cost outside any plausible band
    if (cls === "LABOUR" && num(r.purchase_price) > 0 && /month/i.test(pu)) {
      const band = MONTHLY_LABOUR_BAND[cur] || MONTHLY_LABOUR_BAND.INR;
      const price = num(r.purchase_price) / Math.max(1, num(r.purchase_qty, 1));
      if (price < band[0]) {
        push({
          id: key("LABOUR_TOO_LOW", r.id), rule: "LABOUR_TOO_LOW", severity: "error",
          scope: "resource", entityId: r.id, entityName: nameOr,
          field: "purchase_price", fieldLabel: "You pay",
          title: "Monthly cost looks far too low for a person",
          why: `${money(price, cur)} per month is below what a full-time person costs anywhere. A common cause is missing zeros - ${money(price, cur)} instead of ${money(price * 100, cur)}. Everything this person touches is currently costed at a fraction of reality.`,
          currentValue: money(price, cur), suggestedValue: money(price * 100, cur),
          impact: {
            label: "True cost per " + (r.base_uom || "hour"),
            withCurrent: money(eff, cur),
            withSuggested: money(effectiveCostPerBaseUnit(withResourceChange(ws, r.id, { purchase_price: price * 100 }).resources.find((x) => x.id === r.id)!), cur),
          },
        });
      } else if (price > band[1]) {
        push({
          id: key("LABOUR_TOO_HIGH", r.id), rule: "LABOUR_TOO_HIGH", severity: "warning",
          scope: "resource", entityId: r.id, entityName: nameOr,
          field: "purchase_price", fieldLabel: "You pay",
          title: "Monthly cost looks very high for one person",
          why: `${money(price, cur)} per month is unusually high for a single person. If this row is a whole team rather than one individual, that is fine - but set "For qty" to the number of people so the per-person cost is right.`,
          currentValue: money(price, cur), suggestedValue: null, impact: null,
        });
      }
    }

    // R8 :: defined but never used
    if (!usedResourceIds.has(r.id) && ws.offerings.length > 0 && num(r.purchase_price) > 0) {
      push({
        id: key("RESOURCE_UNUSED", r.id), rule: "RESOURCE_UNUSED", severity: "info",
        scope: "resource", entityId: r.id, entityName: nameOr,
        field: "recipe", fieldLabel: "Recipe use",
        title: "Not used in any recipe",
        why: `You pay for this but no product consumes it. Either add it to a recipe, or move it to Fixed monthly costs if it is a standing bill rather than something consumed per unit.`,
        currentValue: "Not in any recipe", suggestedValue: null, impact: null,
      });
    }
  }

  /* ------------------------------------------------- DOUBLE COUNTING (people) */

  for (const p of ws.costPools) {
    const poolName = (p.name || "").trim();
    if (!poolName || !SALARY_WORDS.test(poolName)) continue;
    const match = ws.resources.find((r) => {
      if (r.resource_class !== "LABOUR") return false;
      const a = poolName.toLowerCase().replace(/['\u2019]s\b/g, "").replace(/salary|wage|payroll|cost|time/gi, "").trim();
      const b = (r.name || "").toLowerCase().replace(/['\u2019]s\b/g, "").replace(/salary|wage|payroll|cost|time/gi, "").trim();
      if (!a || !b) return false;
      return a.includes(b) || b.includes(a);
    });
    if (match) {
      push({
        id: key("DOUBLE_COUNT", p.id), rule: "DOUBLE_COUNT", severity: "error",
        scope: "pool", entityId: p.id, entityName: poolName,
        field: "amount", fieldLabel: "Fixed monthly cost",
        title: `"${poolName}" may already be counted in "${match.name}"`,
        why: `This looks like the same person appearing twice - once as an input consumed by recipes, and again as a fixed monthly bill. That inflates your fixed costs and understates your unit costs at the same time. The rule: if someone's time goes into a recipe, they belong in "What you buy" only. If they never touch delivery, they belong in Fixed costs only. Never both.`,
        currentValue: money(num(p.amount), cur) + " / " + (p.period || "monthly"),
        suggestedValue: "Remove from Fixed costs",
        impact: null,
      });
    }
  }

  /* --------------------------------------------------------- OFFERING RULES */

  const d = diagnose(ws);

  for (const o of ws.offerings) {
    if (o.is_active === false) continue;
    const e = d.offerings.find((x) => x.offeringId === o.id);
    const lines = ws.bomLines.filter((b) => b.offering_id === o.id);
    const nameOr = o.name || "(unnamed product)";

    // O1 :: no recipe
    if (!lines.length) {
      push({
        id: key("NO_RECIPE", o.id), rule: "NO_RECIPE", severity: "error",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "recipe", fieldLabel: "Recipe",
        title: "No recipe - this product appears to cost nothing",
        why: `Without a recipe the cost to make is zero, so the margin shows as 100%. Add the inputs one unit consumes.`,
        currentValue: "0 recipe lines", suggestedValue: null, impact: null,
      });
    }

    // O2 :: no price
    if (num(o.list_price) <= 0) {
      push({
        id: key("NO_PRICE", o.id), rule: "NO_PRICE", severity: "error",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "list_price", fieldLabel: "Price",
        title: "No selling price set",
        why: `Margin, breakeven and every comparison depend on the price. Only you can supply this one.`,
        currentValue: money(0, cur), suggestedValue: null, impact: null,
      });
    }

    // O3 :: no volume
    if (num(o.monthly_volume) <= 0 && num(o.list_price) > 0) {
      push({
        id: key("NO_VOLUME", o.id), rule: "NO_VOLUME", severity: "warning",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "monthly_volume", fieldLabel: "Vol / month",
        title: "No monthly volume",
        why: `Per-unit figures still work, but this product contributes nothing to revenue, breakeven or the ranked opportunities until you say how many you sell.`,
        currentValue: "0", suggestedValue: null, impact: null,
      });
    }

    // O4 :: margin too good to be true
    if (e && e.contributionMarginPct > 90 && num(o.list_price) > 0) {
      push({
        id: key("MARGIN_IMPLAUSIBLE", o.id), rule: "MARGIN_IMPLAUSIBLE", severity: "error",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "recipe", fieldLabel: "Recipe",
        title: `${e.contributionMarginPct}% margin means costs are missing`,
        why: `Almost no real business exceeds 90% contribution margin. This normally means the recipe is incomplete, an input is priced at zero, or the people who deliver this work are sitting in Fixed costs instead of the recipe. Cost to make is showing as ${money(e.marginalCostPerUnit, cur)} against a price of ${money(e.listPrice, cur)}.`,
        currentValue: `${e.contributionMarginPct}%`, suggestedValue: null, impact: null,
      });
    }

    // O5 :: loss making
    if (e && e.isLossMaking && num(o.monthly_volume) > 0) {
      push({
        id: key("LOSS_MAKING", o.id), rule: "LOSS_MAKING", severity: "warning",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "list_price", fieldLabel: "Price",
        title: "Loses money on every unit sold",
        why: `Costs ${money(e.marginalCostPerUnit, cur)} to make but only ${money(e.blendedNetRealisation, cur)} reaches the bank. Selling more makes the loss bigger, not smaller. Price would need to reach at least ${money(safeDiv(e.marginalCostPerUnit, 1 - 0), cur)} before deductions just to break even on variable cost.`,
        currentValue: money(e.contributionPerUnit, cur) + " per unit",
        suggestedValue: null, impact: null,
      });
    }

    // O6 :: channel volume shares that do not add up
    const links = ws.offeringChannels.filter((c) => c.offering_id === o.id);
    if (links.length) {
      const total = links.reduce((s, l) => s + num(l.volume_share_pct), 0);
      if (Math.abs(total - 100) > 0.5) {
        push({
          id: key("SHARE_NOT_100", o.id), rule: "SHARE_NOT_100", severity: "warning",
          scope: "offering", entityId: o.id, entityName: nameOr,
          field: "volume_share_pct", fieldLabel: "% of volume",
          title: `Channel volume adds up to ${round(total, 1)}%, not 100%`,
          why: total < 100
            ? `${round(100 - total, 1)}% of this product's sales are not assigned to any channel. The blended figure only reflects the ${round(total, 1)}% you have allocated, so it may not represent your real average.`
            : `The channel shares total more than 100%, so some volume is being counted twice.`,
          currentValue: `${round(total, 1)}%`, suggestedValue: "100%", impact: null,
        });
      }
    }

    // O7 :: bottleneck named but minutes not set
    if (ws.context?.constraint_resource_label && !num(o.constraint_minutes_per_unit)) {
      push({
        id: key("NO_CONSTRAINT_MIN", o.id), rule: "NO_CONSTRAINT_MIN", severity: "info",
        scope: "offering", entityId: o.id, entityName: nameOr,
        field: "constraint_minutes_per_unit", fieldLabel: "Bottleneck min",
        title: `Bottleneck minutes not set`,
        why: `You named "${ws.context.constraint_resource_label}" as your bottleneck. Until you say how many minutes of it one unit consumes, the "per bottleneck-minute" ranking stays blank - and that ranking is what tells you which product deserves your limited capacity.`,
        currentValue: "Not set", suggestedValue: null, impact: null,
      });
    }
  }

  /* -------------------------------------------------------- CHANNEL RULES */

  for (const c of ws.channels) {
    const nameOr = c.name || "(unnamed channel)";
    const drag = num(c.commission_pct) + num(c.discount_pct) + num(c.ad_spend_pct) +
                 num(c.payment_gateway_pct) + num(c.returns_pct);

    if (drag >= 100) {
      push({
        id: key("DRAG_OVER_100", c.id), rule: "DRAG_OVER_100", severity: "error",
        scope: "channel", entityId: c.id, entityName: nameOr,
        field: "commission_pct", fieldLabel: "Deductions",
        title: "Deductions add up to 100% or more",
        why: `Commission, discount, ads, gateway and returns total ${round(drag, 1)}%. Nothing would reach your bank at all. Check none of these has been entered as a decimal fraction or duplicated.`,
        currentValue: `${round(drag, 1)}%`, suggestedValue: null, impact: null,
      });
    }

    const isServiceLike = ws.context?.business_archetype === "professional_services" ||
                          ws.context?.business_archetype === "saas_digital";
    if (num(c.gst_pct) === 0 && ws.offerings.some((o) => num(o.list_price) > 0)) {
      push({
        id: key("GST_ZERO", c.id), rule: "GST_ZERO", severity: "info",
        scope: "channel", entityId: c.id, entityName: nameOr,
        field: "gst_pct", fieldLabel: "GST",
        title: "GST is set to zero",
        why: `If your prices include GST, leaving this at zero overstates what reaches your bank by the tax amount.${isServiceLike ? " Professional services in India are normally 18%." : " Common Indian rates: 5% restaurant, 12% or 18% goods, 18% services."} If you quote prices excluding GST, zero is correct.`,
        currentValue: "0%", suggestedValue: isServiceLike ? "18%" : null, impact: null,
      });
    }
  }

  /* ------------------------------------------------------- PORTFOLIO RULES */

  if (d.offerings.length && d.monthlyRevenue > 0) {
    if (d.contributionMarginPct > 88) {
      push({
        id: key("PORTFOLIO_MARGIN", "all"), rule: "PORTFOLIO_MARGIN", severity: "error",
        scope: "portfolio", entityId: null, entityName: "Whole business",
        field: "contributionMarginPct", fieldLabel: "Contribution margin",
        title: `${d.contributionMarginPct}% contribution margin is not realistic`,
        why: `Services typically run 40-65%, manufacturing 15-30%, retail 15-35%. A figure this high nearly always means delivery costs are missing from recipes, or the people doing the work are recorded as fixed costs rather than as inputs. Treat every figure on Diagnostics as unreliable until this is resolved.`,
        currentValue: `${d.contributionMarginPct}%`, suggestedValue: null, impact: null,
      });
    }
    if (!ws.costPools.length) {
      push({
        id: key("NO_FIXED_COSTS", "all"), rule: "NO_FIXED_COSTS", severity: "warning",
        scope: "portfolio", entityId: null, entityName: "Whole business",
        field: "costPools", fieldLabel: "Fixed monthly costs",
        title: "No fixed costs entered",
        why: `Every business has bills that do not change with volume - rent, salaries of non-delivery staff, software, insurance. Without them, operating profit equals contribution and breakeven cannot be calculated.`,
        currentValue: "None", suggestedValue: null, impact: null,
      });
    }
    if (!ws.channels.length) {
      push({
        id: key("NO_CHANNELS", "all"), rule: "NO_CHANNELS", severity: "info",
        scope: "portfolio", entityId: null, entityName: "Whole business",
        field: "channels", fieldLabel: "Sales channels",
        title: "No sales channel defined",
        why: `List price is being treated as what reaches your bank. Commission, discount and tax leakage are not being measured at all - and that gap is often larger than the entire profit margin.`,
        currentValue: "None", suggestedValue: null, impact: null,
      });
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------------------------------------------ summary */

export interface ValidationSummary {
  errors: number; warnings: number; infos: number; total: number;
  trustable: boolean;
  headline: string;
}

export function summarise(findings: Finding[]): ValidationSummary {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  return {
    errors, warnings, infos, total: findings.length,
    trustable: errors === 0,
    headline: errors > 0
      ? `${errors} issue${errors > 1 ? "s" : ""} make the numbers unreliable`
      : warnings > 0
        ? `${warnings} thing${warnings > 1 ? "s" : ""} worth checking`
        : "Data looks sound",
  };
}

/** Findings attached to one row, for the inline flag. */
export function findingsFor(findings: Finding[], entityId: string): Finding[] {
  return findings.filter((f) => f.entityId === entityId);
}

/** Highest severity present on a row. */
export function worstOf(findings: Finding[]): Severity | null {
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  if (findings.some((f) => f.severity === "info")) return "info";
  return null;
}

export const COST_VALIDATOR_VERSION = "1.0.0";
