// Lifeline — wealth engine: goals, scenarios, risk profile, priority ladder.
// Educational planning tool. Returns are assumptions with ranges, never promises.
import type { Goal, GoalKind, MoneyState, RiskProfile } from "./types";
import { cashFlow, loansOf, monthly } from "./engine";
import { holdingValue } from "./market";

// ─── Plan assumptions (long-run, nominal, before tax; India) ────────────────
export interface ProfileSpec { id: RiskProfile; label: string; tagline: string; expected: number; vol: number; worstYear: number; minYears: number; mix: { label: string; pct: number; examples: string }[] }

export const PROFILES: Record<RiskProfile, ProfileSpec> = {
  conservative: {
    id: "conservative", label: "Conservative", tagline: "Steady, low swings", expected: 7, vol: 2.5, worstYear: 3, minYears: 0,
    mix: [
      { label: "Fixed deposit / recurring deposit", pct: 40, examples: "Your bank's FD or RD, Post Office RD" },
      { label: "Liquid / short-duration debt fund", pct: 35, examples: "Liquid or short-duration debt mutual funds" },
      { label: "Gold", pct: 10, examples: "Gold ETF or gold mutual fund" },
      { label: "Nifty 50 index fund", pct: 15, examples: "Low-cost Nifty 50 index fund or ETF" },
    ],
  },
  balanced: {
    id: "balanced", label: "Balanced", tagline: "Growth with a cushion", expected: 10, vol: 9, worstYear: -12, minYears: 3,
    mix: [
      { label: "Nifty 50 / Next 50 index funds", pct: 40, examples: "Low-cost index funds or ETFs" },
      { label: "Flexi-cap fund", pct: 15, examples: "Diversified flexi-cap mutual fund" },
      { label: "Debt fund / FD", pct: 30, examples: "Short-duration debt fund, FD, PPF for long goals" },
      { label: "Gold", pct: 15, examples: "Gold ETF or gold fund" },
    ],
  },
  growth: {
    id: "growth", label: "Growth", tagline: "Highest long-run potential, big swings", expected: 12, vol: 16, worstYear: -30, minYears: 5,
    mix: [
      { label: "Nifty 50 index fund", pct: 45, examples: "Low-cost Nifty 50 index fund or ETF" },
      { label: "Flexi / mid-cap funds", pct: 25, examples: "Flexi-cap and mid-cap mutual funds" },
      { label: "Debt fund / PPF", pct: 15, examples: "Short-duration debt fund, PPF" },
      { label: "Gold", pct: 10, examples: "Gold ETF or gold fund" },
      { label: "International index", pct: 5, examples: "US / global index fund (fund-of-funds)" },
    ],
  },
};

export const GOAL_KINDS: Record<GoalKind, { label: string; icon: string; inflation: number }> = {
  emergency: { label: "Emergency fund", icon: "shield", inflation: 6 },
  "debt-free": { label: "Clear a debt", icon: "card", inflation: 0 },
  car: { label: "Car / bike", icon: "card", inflation: 5 },
  trip: { label: "Trip / travel", icon: "arrowRight", inflation: 7 },
  home: { label: "Home down-payment", icon: "home", inflation: 7 },
  education: { label: "Education", icon: "doc", inflation: 10 },
  wedding: { label: "Wedding / family event", icon: "heart", inflation: 7 },
  gadget: { label: "Phone / laptop", icon: "phone", inflation: 3 },
  retirement: { label: "Retirement", icon: "sun", inflation: 6 },
  other: { label: "Other", icon: "star", inflation: 6 },
};

// ─── Core finance ───────────────────────────────────────────────────────────
export const monthsUntil = (ym: string, today = new Date()) => {
  const [y, m] = ym.split("-").map(Number);
  return Math.max(1, (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth()));
};
export const inflate = (amount: number, pct: number, months: number) => amount * Math.pow(1 + pct / 100, months / 12);
const mRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Value after n months: lump sum + monthly investment at the start of each month. */
export function futureValue(lump: number, sip: number, annualPct: number, months: number): number {
  const r = mRate(annualPct);
  if (r === 0) return lump + sip * months;
  const g = Math.pow(1 + r, months);
  return lump * g + sip * ((g - 1) / r) * (1 + r);
}

/** Monthly amount needed to reach `target` in n months. */
export function requiredSip(target: number, lump: number, annualPct: number, months: number): number {
  const r = mRate(annualPct);
  const fromLump = lump * Math.pow(1 + r, months);
  const gap = target - fromLump;
  if (gap <= 0) return 0;
  if (r === 0) return gap / months;
  return gap / (((Math.pow(1 + r, months) - 1) / r) * (1 + r));
}

// ─── Monte Carlo (seeded, deterministic) ────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}
function gauss(r: () => number) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const pct = (arr: number[], p: number) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]; };

export interface Simulation { p10: number; p50: number; p90: number; successPct: number; sipFor80: number; path50: number[]; path10: number[]; path90: number[] }

/**
 * Simulates `paths` market journeys with yearly return `expected` and volatility `vol` (lognormal, monthly steps).
 * Because the final value is linear in the monthly amount, we can also find the amount that succeeds in 80% of paths.
 */
export function simulate(opts: { lump: number; sip: number; months: number; expected: number; vol: number; target: number; paths?: number; seed?: number }): Simulation {
  const { lump, sip, months, expected, vol, target } = opts;
  const N = opts.paths ?? 2000;
  const r = rng(opts.seed ?? 42);
  const sm = vol / 100 / Math.sqrt(12);
  const mu = Math.log(1 + expected / 100) / 12 - (sm * sm) / 2;
  const finals: number[] = [], thresholds: number[] = [];
  const checkpoints = Math.min(months, 60);
  const step = months / checkpoints;
  const track: number[][] = Array.from({ length: checkpoints + 1 }, () => []);
  for (let i = 0; i < N; i++) {
    let lumpV = lump, unitV = 0; // value of the lump, and of ₹1/month invested
    track[0].push(lump + sip);
    let cp = 1;
    for (let m = 1; m <= months; m++) {
      const g = Math.exp(mu + sm * gauss(r));
      lumpV *= g;
      unitV = (unitV + 1) * g;
      if (m >= cp * step - 1e-9 && cp <= checkpoints) { track[cp].push(lumpV + sip * unitV); cp++; }
    }
    finals.push(lumpV + sip * unitV);
    thresholds.push(unitV > 0 ? Math.max(0, (target - lumpV) / unitV) : Infinity);
  }
  return {
    p10: pct(finals, 0.1), p50: pct(finals, 0.5), p90: pct(finals, 0.9),
    successPct: (finals.filter(v => v >= target).length / N) * 100,
    sipFor80: pct(thresholds, 0.8),
    path10: track.map(t => pct(t, 0.1)), path50: track.map(t => pct(t, 0.5)), path90: track.map(t => pct(t, 0.9)),
  };
}

// ─── Goal plans ─────────────────────────────────────────────────────────────
export interface GoalPlan {
  months: number; years: number; futureCost: number; stillNeeded: number;
  plans: { profile: ProfileSpec; sipExpected: number; sipFor80: number; suitable: boolean; why: string }[];
  recommended: RiskProfile;
  chosen: { sim: Simulation; sip: number; realP50: number } | null;
}

export function planGoal(g: Goal, today = new Date()): GoalPlan {
  const months = monthsUntil(g.targetYm, today);
  const years = months / 12;
  const futureCost = inflate(g.costToday, g.inflationPct, months);
  const recommended: RiskProfile = years < 3 ? "conservative" : years < 5 ? (g.profile === "growth" ? "balanced" : g.profile) : g.profile;
  const plans = (Object.values(PROFILES)).map(p => {
    const sim = simulate({ lump: g.saved, sip: 0, months, expected: p.expected, vol: p.vol, target: futureCost, paths: 1200, seed: 7 });
    const suitable = years >= p.minYears;
    const why = suitable ? "" : p.id === "growth" ? `Needs 5+ years. Shares can fall ${Math.abs(p.worstYear)}% in a bad year` : "Needs 3+ years to ride out market dips";
    return { profile: p, sipExpected: requiredSip(futureCost, g.saved, p.expected, months), sipFor80: sim.sipFor80, suitable, why };
  });
  let chosen: GoalPlan["chosen"] = null;
  if (g.monthly > 0 || g.saved > 0) {
    const p = PROFILES[g.profile];
    const sim = simulate({ lump: g.saved, sip: g.monthly, months, expected: p.expected, vol: p.vol, target: futureCost, seed: 11 });
    chosen = { sim, sip: g.monthly, realP50: sim.p50 / Math.pow(1 + g.inflationPct / 100, years) };
  }
  return { months, years, futureCost, stillNeeded: Math.max(0, futureCost - futureValue(g.saved, 0, PROFILES[g.profile].expected, months)), plans, recommended, chosen };
}

// ─── Risk quiz ──────────────────────────────────────────────────────────────
export const RISK_QUESTIONS: { q: string; options: { label: string; points: number }[] }[] = [
  { q: "When will you need most of this money?", options: [{ label: "Within 3 years", points: 1 }, { label: "3 to 7 years", points: 2 }, { label: "More than 7 years", points: 3 }] },
  { q: "Your investment falls 20% in a month. You…", options: [{ label: "Sell to stop the loss", points: 1 }, { label: "Wait and watch", points: 2 }, { label: "Invest more while it's cheap", points: 3 }] },
  { q: "How steady is your income?", options: [{ label: "Irregular / at risk", points: 1 }, { label: "Mostly steady", points: 2 }, { label: "Very stable, with savings", points: 3 }] },
  { q: "Have you invested in mutual funds or shares before?", options: [{ label: "Never", points: 1 }, { label: "A little", points: 2 }, { label: "Yes, through ups and downs", points: 3 }] },
  { q: "Your age group?", options: [{ label: "50+", points: 1 }, { label: "35–50", points: 2 }, { label: "Under 35", points: 3 }] },
];

/** Score → profile. Debt stress caps the profile: heavy EMIs mean you can't afford to sit through a crash. */
export function riskFromScore(score: number, state: MoneyState): { profile: RiskProfile; capped: boolean } {
  let profile: RiskProfile = score <= 8 ? "conservative" : score <= 12 ? "balanced" : "growth";
  const cf = cashFlow(state);
  const stressed = cf.foir > 0.5 || cf.surplus < 0;
  if (stressed && profile === "growth") { profile = "balanced"; return { profile, capped: true }; }
  return { profile, capped: false };
}

// ─── Where should the next rupee go? ────────────────────────────────────────
export interface LadderStep { id: string; title: string; detail: string; status: "done" | "now" | "later"; amount?: number; returnNote: string; action?: { label: string; tab: string; sub?: string } }

export function nextRupeeLadder(state: MoneyState): { steps: LadderStep[]; investable: number } {
  const cf = cashFlow(state);
  const investable = Math.max(0, cf.surplus);
  const all = loansOf(state);
  const costly = all.filter(l => l.ratePct >= 18 && l.outstanding > 0);
  const costlyOwed = costly.reduce((s, l) => s + l.outstanding, 0);
  const topRate = costly.reduce((m, l) => Math.max(m, l.ratePct), 0);
  const essentials = cf.essentials + cf.emi;
  const efTarget = essentials * 3;
  const efGoal = state.goals.filter(g => g.kind === "emergency").reduce((s, g) => s + g.saved, 0);
  const liquid = state.holdings.filter(h => h.liquid && (h.kind === "fd" || h.kind === "mf")).reduce((s, h) => s + holdingValue(h), 0);
  const ef = efGoal + liquid * 0.5;
  const hasInsurance = state.expenses.some(e => e.category === "insurance");
  const goalSips = state.goals.filter(g => g.kind !== "emergency").reduce((s, g) => s + g.monthly, 0);
  let current = false;
  const status = (done: boolean): LadderStep["status"] => { if (done) return "done"; if (!current) { current = true; return "now"; } return "later"; };

  const steps: LadderStep[] = [
    { id: "gap", title: "Close the monthly gap", status: status(cf.surplus >= 0),
      detail: cf.surplus >= 0 ? "Your income covers EMIs and spends." : `You're short by ₹${Math.round(-cf.surplus).toLocaleString("en-IN")} a month. Investing borrowed money only adds risk.`,
      returnNote: "Stops new debt", action: { label: "See the plan", tab: "insights", sub: "plan" } },
    { id: "costly", title: "Clear expensive debt (18%+)", status: status(costlyOwed < 1), amount: costlyOwed,
      detail: costlyOwed < 1 ? "No expensive debt." : `${costly.map(l => l.name).join(", ")}. Every rupee here “earns” ${topRate.toFixed(0)}% guaranteed. No investment reliably beats that.`,
      returnNote: costlyOwed < 1 ? "Done" : `Guaranteed ${topRate.toFixed(0)}%`, action: { label: "Debt-free plan", tab: "insights", sub: "debt" } },
    { id: "emergency", title: "Emergency fund: 3 months of essentials", status: status(ef >= efTarget && efTarget > 0), amount: Math.max(0, efTarget - ef),
      detail: `Target ₹${Math.round(efTarget).toLocaleString("en-IN")} in a sweep FD or liquid fund, so a job loss or medical bill doesn't become new debt.`,
      returnNote: "≈6–7%, safe", action: { label: "Make it a goal", tab: "earn", sub: "goals" } },
    { id: "insure", title: "Health and term insurance", status: status(hasInsurance),
      detail: hasInsurance ? "You have insurance premiums listed. Check health cover ≥ ₹5 lakh and term cover ≈ 10× yearly income if others depend on you." : "One hospital bill can undo years of saving. Get family health cover first, then a pure term plan if anyone depends on your income.",
      returnNote: "Protects everything else" },
    { id: "goals", title: "Fund your goals by date", status: status(state.goals.some(g => g.kind !== "emergency") && goalSips > 0),
      detail: "Short goals (<3 yrs): FD / RD / debt funds. 3–5 yrs: balanced. 5+ yrs: equity index funds via monthly SIP.",
      returnNote: "7–12% by plan", action: { label: "Plan a goal", tab: "earn", sub: "goals" } },
    { id: "wealth", title: "Long-term wealth & tax saving", status: status(false),
      detail: state.wealth.taxpayer ? "Monthly SIP in a low-cost index fund; use PPF / ELSS / NPS for tax benefits only if they fit your goals." : "Monthly SIP in a low-cost Nifty 50 index fund, increased by 10% each year.",
      returnNote: "≈10–12% long-run, not guaranteed", action: { label: "Research funds", tab: "earn", sub: "research" } },
  ];
  return { steps, investable };
}

export const goalMonthlyTotal = (state: MoneyState) => state.goals.reduce((s, g) => s + g.monthly, 0);
export const monthlyIncome = (state: MoneyState) => state.incomes.reduce((s, i) => s + monthly(i.amount, i.freq), 0);
