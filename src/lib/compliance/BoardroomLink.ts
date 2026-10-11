// LINK BETWEEN THE AI BOARDROOM AND COMPLIANCE & CONTROLS.
// Plug in a saved Boardroom decision: the company profile, the processes in scope and the
// risks the Board raised are carried over. Unplug at any time; values become manual.
// Reads decisions through cockpitContext(), the same canonical context the Cockpit uses.
import { cockpitContext } from "../DecisionExports";
import { latestDecisionStage } from "../DecisionExportActions";
import { detectArchetype } from "../GuidedInterview";
import type { Entity } from "./Frameworks";

export interface BoardroomSummary {
  id: string; question: string; date: string; activity: string; archetype: string;
  turnoverCr: number | null; borrowingsCr: number | null; employees: number | null;
  decision: string; risks: string[]; suggested: string[];
}
const cr = (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? null : Math.round(v / 1e7 * 100) / 100);

export function summariseSession(session: any, location = ""): BoardroomSummary | null {
  if (!session || !Array.isArray(session.stages)) return null;
  const si = latestDecisionStage(session); if (si < 0) return null;
  let ctx: any = null; try { ctx = cockpitContext(session, si, { location }); } catch { ctx = null; }
  const q = String(session.q || session.stages[si]?.question || "").split("\n")[0];
  const arch = detectArchetype(q).archetype;
  const I = ctx?.inputs || {}, O = ctx?.outputs || {};
  const monthly = O.revenue != null && isFinite(O.revenue) ? O.revenue : null;
  const risks: string[] = [];
  for (const i of ctx?.issues || []) if (i?.issue) risks.push(String(i.issue).replace(/\s*\[Calculation\]/g, ""));
  for (const u of ctx?.unknowns || []) if (u?.missing) risks.push("Unverified: " + String(u.missing));
  const headcount = I.headcount?.value ?? null; const debt = I.debt?.value ?? null;
  const base = ["r2r", "p2p", "itgc", "elc", "o2c"];
  const byArch: Record<string, string[]> = { manufacturing: ["inv", "fa", "payroll"], food: ["inv", "fa", "payroll"], retail: ["inv", "payroll"], facility: ["fa", "payroll"], agri: ["inv", "fa"], service: ["te", "payroll"], generic: ["te", "payroll"] };
  const suggested = Array.from(new Set([...base, ...(byArch[arch] || []), ...(debt ? ["treasury"] : []), ...(headcount && headcount >= 10 ? ["payroll", "te"] : [])]));
  return { id: String(session.id ?? session.sessionId ?? ""), question: q, date: session.ts ? String(session.ts).slice(0, 10) : "", activity: q.slice(0, 120), archetype: arch,
    turnoverCr: monthly !== null ? cr(monthly * 12) : null, borrowingsCr: cr(debt), employees: headcount, decision: String(ctx?.display?.decision || ctx?.oneSentence || "").slice(0, 200),
    risks: risks.slice(0, 8), suggested };
}
export function summariseAll(sessions: any[], current?: any, location = ""): BoardroomSummary[] {
  const all = [...(current && current.stages && current.stages.length ? [{ ...current, id: current.sessionId ?? "current" }] : []), ...(sessions || [])];
  const seen = new Set<string>(); const out: BoardroomSummary[] = [];
  for (const s of all) { const x = summariseSession(s, location); if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); } }
  return out;
}
// What changes on the entity when a decision is plugged in. Only fields the decision knows are set.
export function entityPatch(sum: BoardroomSummary, company = "", location = ""): Partial<Entity> {
  const p: Partial<Entity> = {};
  if (company) p.name = company;
  if (/india|delhi|mumbai|bengaluru|bangalore|pune|chennai|hyderabad|kolkata|gurugram|noida|lucknow|ahmedabad|jaipur/i.test(location) || !location) p.country = "India";
  if (sum.turnoverCr !== null) p.turnoverCr = sum.turnoverCr;
  if (sum.borrowingsCr !== null) p.borrowingsCr = sum.borrowingsCr;
  if (sum.employees !== null) p.employees = sum.employees;
  return p;
}
