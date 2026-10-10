// GUIDED INTERVIEW (Increment 2) - the system asks back, like a good advisor.
//
// Design rule: this module adds NO new calculation path. Each answer becomes a
// plain sentence ("Variable cost is 55% of revenue.") appended to the question,
// and the EXISTING canonical parser (parseUserInputs) captures it as YOUR INPUT -
// exactly as if the user had typed it. "I don't know" becomes a visible request
// for the executives to estimate it, so it can only ever be an ASSUMPTION.
import { parseUserInputs } from "./DecisionExperience";

export type Archetype = "facility" | "manufacturing" | "food" | "retail" | "service" | "agri" | "generic";
export type QKind = "money" | "percent" | "count" | "days" | "years" | "choice" | "text";
export interface Question {
  id: string; key?: string; kind: QKind; text: string; why: string; example: string; learn?: string;
  label: string; options?: string[]; optional?: boolean;
  sentence: (v: any) => string;
}
export interface Answer { value?: number | string; unknown?: boolean }
export interface InterviewPlan { archetype: Archetype; archetypeLabel: string; questions: Question[]; alreadyKnown: { key: string; label: string; value: number; unit: string }[] }

const ARCH: { a: Archetype; label: string; re: RegExp }[] = [
  { a: "facility", label: "a capacity-based facility", re: /cold ?storage|warehous|hotel|hostel|co-?working|gym|parking|banquet|marriage hall|guest ?house|homestay|resort|occupancy|warehouse/i },
  { a: "food", label: "a food business", re: /restaurant|caf[eé]|cloud kitchen|bakery|food truck|dhaba|catering|sweet shop|juice|tiffin/i },
  { a: "retail", label: "a shop or online store", re: /\bshop\b|\bstore\b|retail|e-?commerce|online (store|shop)|boutique|kirana|pharmacy|showroom|dealership/i },
  { a: "service", label: "a service business", re: /consult|agency|salon|spa|coaching|tuition|clinic|freelanc|repair|cleaning|services? (company|business)|software services|interior design|event management|travel agency/i },
  { a: "agri", label: "a farm or agri business", re: /\bfarm|dairy|poultry|agri|greenhouse|fishery|goat|organic produce|nursery/i },
  { a: "manufacturing", label: "a manufacturing business", re: /manufactur|factory|\bplant\b|production|processing|fabricat|making|unit for|candle|soap|garment|packag/i },
];
export function detectArchetype(q: string): { archetype: Archetype; label: string } {
  for (const x of ARCH) if (x.re.test(q)) return { archetype: x.a, label: x.label };
  return { archetype: "generic", label: "a business" };
}

// Money in sentences the existing parser reads: "₹3 lakh", "₹1.5 crore", "₹850".
export function moneySentence(v: number): string {
  const r = (x: number) => String(Math.round(x * 100) / 100);
  if (v >= 1e7) return "\u20b9" + r(v / 1e7) + " crore";
  if (v >= 1e5) return "\u20b9" + r(v / 1e5) + " lakh";
  return "\u20b9" + Math.round(v);
}
// Accepts "15 lakh", "1.5 crore", "₹2,50,000", "40L", "1 cr", "850".
export function parseMoney(text: string): number | null {
  // Indian digit grouping ("2,50,000") and currency marks are removed, not turned into spaces.
  const t = String(text || "").toLowerCase().replace(/,/g, "").replace(/\u20b9|rs\.?|inr/g, "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k|thousand)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]); const u = m[2] || "";
  const v = /^cr/.test(u) ? n * 1e7 : /^(lakh|lac|l)/.test(u) ? n * 1e5 : /^(k|thousand)/.test(u) ? n * 1e3 : n;
  return isFinite(v) && v >= 0 ? v : null;
}
export function validate(q: Question, raw: string): { ok: boolean; value?: number | string; message?: string } {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, message: "Type an answer, or choose \u201cI don't know\u201d." };
  if (q.kind === "money") { const v = parseMoney(s); return v === null ? { ok: false, message: "Try a number like 15 lakh, 1.5 crore or 250000." } : { ok: true, value: v }; }
  if (q.kind === "choice" || q.kind === "text") return { ok: true, value: s };
  const n = parseFloat(s.replace(/[,%]/g, ""));
  if (!isFinite(n) || n < 0) return { ok: false, message: "Enter a number." };
  if (q.kind === "percent" && n > 100) return { ok: false, message: "A percentage must be between 0 and 100." };
  if (q.kind === "days" && n > 365) return { ok: false, message: "Enter days between 0 and 365." };
  if (q.kind === "years" && (n <= 0 || n > 40)) return { ok: false, message: "Enter years between 1 and 40." };
  return { ok: true, value: n };
}

const UNIT_NOUN: Record<Archetype, { unit: string; per: string }> = {
  facility: { unit: "", per: "" }, manufacturing: { unit: "unit", per: "units" }, agri: { unit: "unit", per: "units" },
  food: { unit: "order", per: "orders" }, retail: { unit: "order", per: "orders" }, service: { unit: "client", per: "clients" }, generic: { unit: "unit", per: "units" },
};

function bank(a: Archetype): Question[] {
  const u = UNIT_NOUN[a];
  const revenue: Question[] = a === "facility" ? [
    { id: "revenueFull", key: "revenueFull", kind: "money", label: "Monthly revenue at full capacity", learn: "utilisation",
      text: "If the facility were 100% full, how much revenue would it earn in a month?", why: "Facilities earn in proportion to how full they are. Asking for the full-capacity figure separately from occupancy avoids the most common mistake: mixing the two.",
      example: "e.g. 40 lakh", sentence: (v) => "Monthly revenue of " + moneySentence(v) + " at full capacity." },
    { id: "utilisation", key: "utilisation", kind: "percent", label: "Expected occupancy", learn: "utilisation",
      text: "On average, how full do you expect it to be (occupancy %)?", why: "Most costs stay the same whether the facility is half-empty or full, so occupancy usually decides profit.",
      example: "e.g. 65", sentence: (v) => "Expected occupancy is " + v + "%." },
  ] : a === "generic" ? [
    { id: "revenue", key: "revenue", kind: "money", label: "Expected monthly revenue", text: "Roughly how much do you expect to sell in a month?", learn: "breakEven",
      why: "Revenue is compared with your costs to see if, and when, the business makes money.", example: "e.g. 8 lakh", sentence: (v) => "Monthly revenue is " + moneySentence(v) + "." },
  ] : [
    { id: "price", key: "price", kind: "money", label: "Average price per " + u.unit, learn: "contributionMargin",
      text: "What is the average price a customer pays per " + u.unit + "?", why: "Price times quantity is your revenue. Small price changes often matter more than big volume changes.",
      example: a === "service" ? "e.g. 25000" : "e.g. 120", sentence: (v) => "Average " + (a === "service" ? "fee" : "price") + " per " + u.unit + " is " + moneySentence(v) + "." },
    { id: "volume", key: "volume", kind: "count", label: (u.per.charAt(0).toUpperCase() + u.per.slice(1)) + " per month", learn: "breakEven",
      text: "How many " + u.per + " do you expect per month once running?", why: "Your rent and salaries are paid whether you sell a little or a lot; volume decides whether they are covered.",
      example: a === "service" ? "e.g. 12" : "e.g. 9000", sentence: (v) => "We expect " + Math.round(v) + " " + u.per + " per month." },
  ];
  return [
    ...revenue,
    { id: "variableCostPct", key: "variableCostPct", kind: "percent", label: "Running costs (% of sales)", learn: "contributionMargin",
      text: "Out of every \u20b9100 of sales, how much goes on materials, power, packaging and other costs that rise with sales?", why: "What is left (the contribution margin) pays for rent, salaries and profit. A few points here can decide whether you break even.",
      example: "e.g. 55", sentence: (v) => "Variable cost is " + v + "% of revenue." },
    { id: "fixedCost", key: "fixedCost", kind: "money", label: "Fixed costs per month", learn: "opex",
      text: "What will you pay every month regardless of sales \u2014 rent, salaries, basic utilities?", why: "These costs come every month even if you sell nothing, so they set the level of sales you must reach.",
      example: "e.g. 3 lakh", sentence: (v) => "Fixed cost is " + moneySentence(v) + " per month." },
    { id: "capex", key: "capex", kind: "money", label: "One-time setup cost", learn: "capex",
      text: "Roughly how much will it cost to set up \u2014 machines, fit-out, deposits, equipment?", why: "This money is spent before you earn anything, so it decides how much funding you need up front.",
      example: "e.g. 45 lakh", sentence: (v) => "Initial capital required is " + moneySentence(v) + "." },
    { id: "funding", key: "funding", kind: "money", label: "Money you have available", learn: "workingCapital",
      text: "How much money do you have available in total for this business (your own plus any already arranged)?", why: "Funding must cover the setup AND the cash tied up while customers have not paid yet.",
      example: "e.g. 1 crore", sentence: (v) => "Funding available is " + moneySentence(v) + "." },
    { id: "dso", key: "dso", kind: "days", label: "Days customers take to pay", learn: "dso",
      text: "After a sale, how many days do customers usually take to pay you? (0 if they pay immediately)", why: "Until customers pay, your money is stuck with them \u2014 a profitable business can still run out of cash.",
      example: "e.g. 30", sentence: (v) => "Customers pay in " + Math.round(v) + " days." },
    { id: "borrow", kind: "choice", label: "Borrowing", options: ["Yes, I will take a loan", "No loan"], optional: true,
      text: "Will you take a loan for this business?", why: "Loan repayments must be paid from the business's cash; we test whether the business can carry them.", example: "", sentence: () => "" },
    { id: "debt", key: "debt", kind: "money", label: "Loan amount", learn: "dscr", optional: true,
      text: "How much will you borrow?", why: "Bigger loans mean bigger monthly repayments the business must earn.", example: "e.g. 40 lakh", sentence: (v) => "Debt of " + moneySentence(v) + "." },
    { id: "interestRate", key: "interestRate", kind: "percent", label: "Loan interest rate", learn: "interestCoverage", optional: true,
      text: "What interest rate will the bank charge (per year)?", why: "Interest is a fixed cost; we check whether operating cash covers it comfortably.", example: "e.g. 11", sentence: (v) => "Interest rate is " + v + "%." },
    { id: "loanTenure", key: "loanTenure", kind: "years", label: "Loan tenure", learn: "dscr", optional: true,
      text: "Over how many years will you repay the loan?", why: "Tenure decides the size of each repayment, which we need to calculate debt safety (DSCR).", example: "e.g. 7", sentence: (v) => "Loan tenure is " + Math.round(v) + " years." },
    { id: "customers", kind: "choice", label: "Main customers", optional: true, options: ["Individual consumers", "Shops / other businesses", "Government / institutions", "A mix"],
      text: "Who will mainly buy from you?", why: "Selling to businesses usually means bigger orders but slower payment; consumers pay faster but each sale is small.", example: "",
      sentence: (v) => "Context: main customers are " + String(v).toLowerCase() + "." },
    { id: "experience", kind: "choice", label: "Your experience", optional: true, options: ["New to this industry", "Some experience", "Several years in this industry"],
      text: "How much experience do you have in this line of business?", why: "Experience changes the risks the executives focus on and how fast you can expect to reach full volume.", example: "",
      sentence: (v) => "Context: founder experience \u2014 " + String(v).toLowerCase() + "." },
  ];
}
const LOAN_IDS = new Set(["debt", "interestRate", "loanTenure"]);
const MENTIONS_LOAN = /\b(loan|borrow|debt|bank finance|term loan|emi|mudra)\b/i;

// Only the questions that change the answer: anything already in the question is skipped.
export function planInterview(question: string): InterviewPlan {
  const { archetype, label } = detectArchetype(question);
  const known = parseUserInputs(question).inputs;
  const knownKeys = new Set(known.map((i: any) => i.key));
  const loanKnown = knownKeys.has("debt");
  let qs = bank(archetype).filter((q) => !q.key || !knownKeys.has(q.key));
  // Revenue: if any revenue path is already given, do not ask for another one.
  if (knownKeys.has("revenue") || knownKeys.has("revenueFull") || (knownKeys.has("price") && knownKeys.has("volume"))) qs = qs.filter((q) => !["revenue", "revenueFull", "price", "volume", "utilisation"].includes(q.id) || (q.id === "utilisation" && knownKeys.has("revenueFull") && !knownKeys.has("utilisation")));
  if (knownKeys.has("equity") && knownKeys.has("debt")) qs = qs.filter((q) => q.id !== "funding");
  if (loanKnown || MENTIONS_LOAN.test(question)) qs = qs.filter((q) => q.id !== "borrow");
  else qs = qs.filter((q) => !LOAN_IDS.has(q.id));   // loan details only after "Yes, I will take a loan"
  return { archetype, archetypeLabel: label, questions: qs,
    alreadyKnown: known.map((i: any) => ({ key: i.key, label: i.label, value: i.value, unit: i.unit })) };
}
// Loan questions appear only if the user says they will borrow.
export function visibleQuestions(plan: InterviewPlan, answers: Record<string, Answer>, question: string): Question[] {
  const wantsLoan = String(answers.borrow?.value || "").startsWith("Yes") || MENTIONS_LOAN.test(question);
  const all = bank(plan.archetype).filter((q) => plan.questions.some((p) => p.id === q.id) || (wantsLoan && LOAN_IDS.has(q.id) && !plan.alreadyKnown.some((k) => k.key === q.key)));
  return all;
}
// The enriched question: original words + one plain sentence per answer.
export function buildEnrichedQuestion(original: string, plan: InterviewPlan, answers: Record<string, Answer>): string {
  const qs = visibleQuestions(plan, answers, original);
  const lines: string[] = []; const unknown: string[] = [];
  for (const q of qs) {
    const a = answers[q.id]; if (!a) continue;
    if (a.unknown) { if (q.key) unknown.push(q.label.toLowerCase()); continue; }
    if (q.id === "borrow") continue;
    const s = q.sentence(a.value); if (s) lines.push(s);
  }
  if (unknown.length) lines.push("Not known yet \u2014 please estimate from research and mark as assumptions: " + unknown.join("; ") + ".");
  if (!lines.length) return original;
  return original.trim() + "\n\nAnswers from the guided interview:\n" + lines.join("\n");
}
// Executives recommended for this kind of business (only ids that exist are used).
export function recommendedExecutives(a: Archetype, available: string[]): string[] {
  const want = a === "service" ? ["ceo", "cfo", "cmo", "coo", "chro"] : a === "retail" || a === "food" ? ["ceo", "cfo", "cmo", "coo", "clo"] : ["ceo", "cfo", "coo", "cmo", "cto"];
  const set = new Set(available.map((x) => String(x).toLowerCase()));
  return want.filter((x) => set.has(x)).slice(0, 5);
}
