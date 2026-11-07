// Lifeline — AI connections.
// 1) Hand-off: sends a privacy-filtered money summary + question to an AI app already on the phone
//    (Gemini, ChatGPT, Claude, Perplexity, Copilot) — uses the person's own subscription, no keys needed.
// 2) Built-in assistant: see claude.ts (the user's own Claude API key, stored encrypted).
import type { MoneyState } from "./types";
import { EXPENSE_LABEL, HOLDING_LABEL, INCOME_LABEL, LOAN_TYPE_LABEL } from "./types";
import { cashFlow, fundingPlan, healthScore, inrRaw, insights, monthly } from "./engine";
import { estimateStatement, recentCardCash } from "./cards";
import { GOAL_KINDS, planGoal } from "./wealth";
import { holdingValue } from "./market";

export interface AiApp { id: string; name: string; pkg: string; web: string; prefill: boolean; color: string }

export const AI_APPS: AiApp[] = [
  { id: "gemini", name: "Gemini", pkg: "com.google.android.apps.bard", web: "https://gemini.google.com/app", prefill: false, color: "#4f7cff" },
  { id: "chatgpt", name: "ChatGPT", pkg: "com.openai.chatgpt", web: "https://chatgpt.com/?q=", prefill: true, color: "#10a37f" },
  { id: "claude", name: "Claude", pkg: "com.anthropic.claude", web: "https://claude.ai/new?q=", prefill: true, color: "#d97757" },
  { id: "perplexity", name: "Perplexity", pkg: "ai.perplexity.app.android", web: "https://www.perplexity.ai/search?q=", prefill: true, color: "#20808d" },
  { id: "copilot", name: "Copilot", pkg: "com.microsoft.copilot", web: "https://copilot.microsoft.com/", prefill: false, color: "#3b6fd9" },
];

export interface AiTask { id: string; title: string; subtitle: string; icon: string; prompt: string; needsInput?: string }

export const AI_TASKS: AiTask[] = [
  { id: "organise", title: "Plan my payments this month", subtitle: "What to pay first, no bounces", icon: "calendar",
    prompt: "Using my income dates, loan EMIs and credit card dues below, give me a dated plan for this month: what to pay first, from which account, and how to cover any shortfall at the lowest cost without any EMI bouncing or missing a card minimum due. Compare paying the card in full then moving money back to the bank (about 3% + GST fee) with paying only part of the card. Then list 3 steps to make payments fit my income within 6 months." },
  { id: "review", title: "Review my month", subtitle: "3 most important actions", icon: "sparkle",
    prompt: "Review my finances below. Tell me the 3 most important actions for the next 30 days, in order, with amounts and dates. Be specific and practical." },
  { id: "debt", title: "Plan to clear expensive debt", subtitle: "Month-by-month", icon: "card",
    prompt: "Make a month-by-month plan to clear my most expensive debts first. Consider refinancing to cheaper regulated options (loan against FD, gold loan from a bank, top-up loan). Show the order, monthly amounts and expected debt-free month." },
  { id: "afford", title: "Can I afford this?", subtitle: "Before you buy or borrow", icon: "wallet", needsInput: "What do you want to buy or borrow, and how much?",
    prompt: "Can I afford the following without risking any EMI bounce? Show the impact on my monthly gap and what I would need to change:" },
  { id: "cut", title: "Find savings in my spending", subtitle: "Realistic cuts", icon: "scissors",
    prompt: "Look at my spending and suggest realistic cuts that would close my monthly gap, without touching essentials like rent, food or medicine. Give a weekly limit for each non-essential category." },
  { id: "invest", title: "Analyse my investments", subtitle: "Risk, liquidity, debt vs invest", icon: "chart",
    prompt: "Analyse my investments against my debts. Should I use any liquid investments to repay high-interest debt? Comment on risk, diversification and emergency liquidity. Do not recommend specific stocks." },
  { id: "goals", title: "Plan investments for my goals", subtitle: "Order, amounts, where to invest", icon: "grow",
    prompt: "Using my goals, debts and risk profile below, tell me in which order to fund things, how much per month for each goal, and which investment categories (FD/RD, debt fund, index fund, gold, etc.) suit each goal's time horizon. Respect that expensive debt should usually be cleared first. Explain risks plainly; no guaranteed returns and no specific stock tips." },
  { id: "earn", title: "Earning plan for my skills", subtitle: "Close the gap faster", icon: "grow",
    prompt: "Based on my monthly gap and skills, give me a realistic 30-day plan to earn extra income in India. Prioritise options that pay within weeks. Include exact first steps." },
  { id: "negotiate", title: "Talk to my lender", subtitle: "Call script + email", icon: "phone",
    prompt: "Write a short phone script and an email to ask my lender for a lower EMI or a later EMI date, using my numbers below. Keep it polite and firm, and list what I must ask them to confirm in writing." },
  { id: "custom", title: "Ask anything", subtitle: "Your own question", icon: "edit", needsInput: "Your question",
    prompt: "" },
];

type Mode = MoneyState["settings"]["aiShare"];
const amt = (n: number, mode: Mode) => {
  if (mode === "exact") return inrRaw(n);
  if (mode === "none") return "[amount hidden]";
  const r = Math.abs(n) >= 100000 ? Math.round(n / 10000) * 10000 : Math.abs(n) >= 10000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100;
  return "~" + inrRaw(r);
};

/**
 * Summary sent to AI. Never includes the user's name, account numbers, API keys or lender
 * account details — only categories, amounts (as chosen), rates and dates.
 */
export function buildContext(state: MoneyState, mode: Mode = state.settings.aiShare): string {
  const cf = cashFlow(state);
  const h = healthScore(state);
  const plans = fundingPlan(state);
  const lines: string[] = [];
  lines.push(`Country: India. Currency: INR. Today: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`);
  lines.push(`Monthly income: ${amt(cf.income, mode)} (${state.incomes.map(i => `${INCOME_LABEL[i.kind]} ${amt(monthly(i.amount, i.freq), mode)}${i.day ? `, arrives day ${i.day}` : ""}`).join("; ") || "none listed"}).`);
  lines.push(`Monthly EMIs: ${amt(cf.emi, mode)} = ${Math.round(cf.foir * 100)}% of income. Essentials: ${amt(cf.essentials, mode)}. Non-essentials: ${amt(cf.discretionary, mode)}. ${cf.surplus < 0 ? "Monthly gap" : "Left over"}: ${amt(Math.abs(cf.surplus), mode)}.`);
  if (state.loans.length) {
    lines.push("Loans:");
    for (const l of state.loans) lines.push(`- ${LOAN_TYPE_LABEL[l.type]}: EMI ${amt(l.emi, mode)} on day ${l.dueDay}, ${l.ratePct}% a year, ${amt(l.outstanding, mode)} still owed.`);
  }
  for (const c of state.cards) {
    const e = estimateStatement(c);
    lines.push(`Credit card (${c.bank || "card"}): limit ${amt(c.limit, mode)}, ${Math.round(e.utilization * 100)}% used, interest ${c.monthlyRatePct}%/month. Next statement est. total ${amt(e.tad, mode)}, minimum ${amt(e.mad, mode)}; paying ${c.plan === "full" ? "in full" : c.plan === "minimum" ? "only the minimum" : "a fixed amount"}. Carried balance ${amt(e.carried, mode)}.`);
    for (const x of c.emis) lines.push(`  - Card EMI: ${amt(x.principal, mode)} at ${x.ratePct}% for ${x.tenure} months, processing fee ${amt(x.processingFee, mode)} + GST.`);
  }
  const rc = recentCardCash(state);
  if (rc.amount > 0) lines.push(`Took ${amt(rc.amount, mode)} out via credit card in the last month (fees/interest ${amt(rc.cost, mode)}, ~${rc.annualPct.toFixed(0)}% a year), used to pay EMIs.`);
  if (state.accounts.length) {
    lines.push(`Bank accounts: ${state.accounts.length}. Spare money in the next 31 days after EMIs (lowest point): ${plans.map(p => amt(p.lowest, mode)).join(", ")}.`);
  }
  if (cf.bySpend.length) lines.push("Spending by category (monthly): " + cf.bySpend.map(s => `${EXPENSE_LABEL[s.label as keyof typeof EXPENSE_LABEL] ?? s.label} ${amt(s.value, mode)}${s.essential ? "" : " (non-essential)"}`).join("; ") + ".");
  if (state.holdings.length) lines.push("Investments: " + state.holdings.map(x => `${HOLDING_LABEL[x.kind]} ${amt(holdingValue(x), mode)}${x.liquid ? " (liquid)" : ""}`).join("; ") + ".");
  if (state.wealth.risk) lines.push(`Risk profile: ${state.wealth.risk}.`);
  for (const g of state.goals) {
    const p = planGoal(g);
    lines.push(`Goal: ${GOAL_KINDS[g.kind].label} by ${g.targetYm}, needs ${amt(p.futureCost, mode)} (today ${amt(g.costToday, mode)}), saved ${amt(g.saved, mode)}, investing ${amt(g.monthly, mode)}/month in a ${g.profile} mix${p.chosen ? `, ${p.chosen.sim.successPct.toFixed(0)}% chance on track` : ""}.`);
  }
  if (state.profile.skills.length) lines.push(`Skills: ${state.profile.skills.join(", ")}. Can work ${state.profile.hoursPerWeek} extra hours/week.`);
  lines.push(`Financial stress score: ${h.score}/100 (${h.label}).`);
  const top = insights(state).slice(0, 4).map(i => i.title);
  if (top.length) lines.push("Issues already flagged: " + top.join(" | ") + ".");
  return lines.join("\n");
}

export function buildPrompt(task: AiTask, state: MoneyState, extra = "", mode?: Mode): string {
  const ask = task.id === "custom" ? extra : task.prompt + (extra ? " " + extra : "");
  return `I'm using Lifeline, a personal money app. Here is my anonymised financial summary:\n\n${buildContext(state, mode)}\n\n${ask}\n\nI'm in India. Please give practical steps, not generic advice. Never suggest instant-loan apps or unregulated lenders.`;
}

export const SYSTEM_PROMPT = `You are Lifeline's money assistant for a person in India who may be under financial stress.
Use the user's financial summary to give specific, practical, step-by-step guidance with amounts and dates.
Priorities: never miss an EMI; avoid new high-cost debt (never suggest instant-loan apps or unregulated lenders); reduce interest cost; protect essentials; increase income realistically.
Prefer regulated, low-cost options (talking to the lender, restructuring, loan against FD, bank gold loan, balance transfer).
Be concise: short paragraphs or numbered steps, under 250 words unless asked for more. Use ₹ and Indian number formatting.
You give general guidance, not regulated investment, tax or legal advice; say so briefly when the question needs a professional.
For payments under stress: protect auto-debit EMIs first, then every card's minimum due, then pay cards in full where possible; compare the cost of card-to-bank transfers (fee + GST) against revolving card interest; point out RBI rights (billing-cycle change, 3-day grace before past-due reporting, tenure options on floating-rate loans) where they help.
For investing: explain options by category and time horizon (FD/RD and debt funds for short goals; diversified low-cost index funds for 5+ years), show ranges and risks, never promise returns or give "sure-shot" tips, and suggest a SEBI-registered investment adviser for personalised advice.
If the user seems in crisis or mentions self-harm, gently share India's Tele-MANAS helpline: 14416.`;
