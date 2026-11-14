// Parametric question generators.
// Each template draws random inputs, COMPUTES the correct answer in code, and builds distractors from the
// specific mistakes candidates make (wrong z-value, forgetting tax shield, etc.). Because the maths is done by
// code, every variant is correct by construction, and `npm test` checks thousands of variants per template.
import type { Question } from './data'

export type Rng = () => number
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const int = (r: Rng, lo: number, hi: number, step = 1) => lo + step * Math.floor(r() * (Math.floor((hi - lo) / step) + 1))
const money = (n: number, cur = '$') => `${n < 0 ? '−' : ''}${cur}${Math.abs(Math.round(n)).toLocaleString('en-US')}`
const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`
const num = (n: number, dp = 2) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

type Built = { stem: string; correct: string; wrong: string[]; simple: string; steps: string[]; trap: string }
export type Template = { id: string; exam: 'CPA' | 'FRM'; paper: string; topic: string; difficulty: number; ref: string; build: (r: Rng) => Built }

const Z = { 0.95: 1.645, 0.99: 2.326 } as const

export const TEMPLATES: Template[] = [
  // ───────────── FRM ─────────────
  { id: 'var-param', exam: 'FRM', paper: 'P1-VRM', topic: 'Value at Risk', difficulty: 2, ref: 'FRM Part I – Valuation & Risk Models', build: (r) => {
    const V = int(r, 2, 50) * 1_000_000, sig = int(r, 5, 30) / 1000, c = pick(r, [0.95, 0.99] as const), z = Z[c]
    const ans = z * sig * V, alt = c === 0.95 ? 1.96 : 2.576
    return { stem: `A ${money(V)} portfolio has daily return volatility of ${pct(sig, 1)} and zero expected return. Assuming normal returns, what is the 1-day ${c * 100}% VaR?`,
      correct: money(ans), wrong: [money(alt * sig * V), money(sig * V), money((c === 0.95 ? 2.326 : 1.645) * sig * V)],
      simple: `On a bad day, the kind that happens about ${c === 0.95 ? '1 day in 20' : '1 day in 100'}, the portfolio could lose about ${money(ans)}.`,
      steps: [`VaR = z × σ × V`, `z(${c * 100}%, one-tailed) = ${z}`, `= ${z} × ${pct(sig, 1)} × ${money(V)} = ${money(ans)}`],
      trap: `${money(alt * sig * V)} uses the two-tailed z (${alt}). VaR is one-tailed.` } } },
  { id: 'var-sqrt-t', exam: 'FRM', paper: 'P1-VRM', topic: 'Value at Risk', difficulty: 1, ref: 'FRM Part I – Valuation & Risk Models', build: (r) => {
    const v1 = int(r, 1, 20) * 100_000, T = pick(r, [4, 5, 9, 10, 16, 20, 25]), ans = v1 * Math.sqrt(T)
    return { stem: `The 1-day 99% VaR is ${money(v1)}. Assuming i.i.d. zero-mean returns, what is the ${T}-day 99% VaR?`,
      correct: money(ans), wrong: [money(v1 * T), money(v1 * T / 2), money(v1 * Math.sqrt(T) * 1.5)],
      simple: `Risk grows with the SQUARE ROOT of time, because good and bad days partly cancel out.`,
      steps: [`VaR(T) = VaR(1) × √T`, `= ${money(v1)} × √${T} = ${money(ans)}`],
      trap: `Multiplying by ${T} (${money(v1 * T)}) assumes every day is a worst day.` } } },
  { id: 'capm', exam: 'FRM', paper: 'P1-FRM', topic: 'CAPM', difficulty: 1, ref: 'FRM Part I – Foundations', build: (r) => {
    const rf = int(r, 1, 7) / 100, rm = rf + int(r, 3, 8) / 100, b = int(r, 5, 18) / 10, ans = rf + b * (rm - rf)
    return { stem: `Risk-free rate ${pct(rf, 1)}, expected market return ${pct(rm, 1)}, beta ${b.toFixed(1)}. What is the CAPM expected return?`,
      correct: pct(ans), wrong: [pct(b * rm), pct(rf + b * rm), pct(rm)],
      simple: `Start with the safe return (${pct(rf, 1)}). Add the market's extra reward (${pct(rm - rf, 1)}) scaled by how jumpy the stock is (β = ${b.toFixed(1)}).`,
      steps: [`E(R) = Rf + β(Rm − Rf)`, `= ${pct(rf, 1)} + ${b.toFixed(1)} × ${pct(rm - rf, 1)} = ${pct(ans)}`],
      trap: `${pct(b * rm)} forgets to subtract the risk-free rate.` } } },
  { id: 'sharpe', exam: 'FRM', paper: 'P1-FRM', topic: 'Risk-adjusted performance', difficulty: 1, ref: 'FRM Part I – Foundations', build: (r) => {
    const rp = int(r, 6, 18) / 100, rf = int(r, 1, 5) / 100, s = int(r, 8, 30) / 100, b = int(r, 6, 15) / 10, ans = (rp - rf) / s
    return { stem: `A fund returned ${pct(rp, 0)} with volatility ${pct(s, 0)} and beta ${b.toFixed(1)}. The risk-free rate is ${pct(rf, 0)}. What is its Sharpe ratio?`,
      correct: num(ans), wrong: [num(rp / s), num((rp - rf) / b), num((rp - rf) / s / 2)],
      simple: `Sharpe = extra return per unit of TOTAL risk.`, steps: [`Sharpe = (Rp − Rf) / σp`, `= (${pct(rp, 0)} − ${pct(rf, 0)}) / ${pct(s, 0)} = ${num(ans)}`],
      trap: `Dividing by beta gives the Treynor ratio (${num((rp - rf) / b)}), not the Sharpe ratio.` } } },
  { id: 'jensen', exam: 'FRM', paper: 'P1-FRM', topic: 'Risk-adjusted performance', difficulty: 2, ref: 'FRM Part I – Foundations', build: (r) => {
    const rf = int(r, 1, 5) / 100, rm = rf + int(r, 3, 8) / 100, b = int(r, 6, 15) / 10, rp = rf + b * (rm - rf) + int(r, -30, 40) / 1000
    const req = rf + b * (rm - rf), ans = rp - req
    return { stem: `A portfolio returned ${pct(rp)} with beta ${b.toFixed(1)}. Risk-free ${pct(rf, 1)}, market ${pct(rm, 1)}. What is Jensen's alpha?`,
      correct: pct(ans), wrong: [pct(rp - rm), pct(rp - rf), pct(-ans)],
      simple: `Given its risk, the portfolio should have earned ${pct(req)}. Alpha is the difference from that.`,
      steps: [`Required = ${pct(rf, 1)} + ${b.toFixed(1)} × ${pct(rm - rf, 1)} = ${pct(req)}`, `α = ${pct(rp)} − ${pct(req)} = ${pct(ans)}`],
      trap: `Comparing with the raw market return (${pct(rp - rm)}) ignores beta.` } } },
  { id: 'port-sd', exam: 'FRM', paper: 'P1-QA', topic: 'Portfolio statistics', difficulty: 2, ref: 'FRM Part I – Quantitative Analysis', build: (r) => {
    const w = int(r, 2, 8) / 10, sa = int(r, 8, 20) / 100, sb = int(r, 15, 35) / 100, rho = int(r, -5, 8) / 10
    const v = w * w * sa * sa + (1 - w) ** 2 * sb * sb + 2 * w * (1 - w) * rho * sa * sb, ans = Math.sqrt(v)
    const v0 = w * w * sa * sa + (1 - w) ** 2 * sb * sb
    return { stem: `${pct(w, 0)} in Asset A (σ = ${pct(sa, 0)}) and ${pct(1 - w, 0)} in Asset B (σ = ${pct(sb, 0)}). Correlation = ${rho.toFixed(1)}. What is the portfolio standard deviation?`,
      correct: pct(ans), wrong: [pct(w * sa + (1 - w) * sb), pct(Math.sqrt(v0) === ans ? ans * 1.15 : Math.sqrt(v0)), pct(v)],
      simple: `Mixing assets that don't move perfectly together cancels out some of the wobble.`,
      steps: [`σp² = w²σA² + (1−w)²σB² + 2w(1−w)ρσAσB = ${v.toFixed(5)}`, `σp = √${v.toFixed(5)} = ${pct(ans)}`],
      trap: `The weighted average (${pct(w * sa + (1 - w) * sb)}) is right only if ρ = +1.` } } },
  { id: 'bayes', exam: 'FRM', paper: 'P1-QA', topic: 'Probability', difficulty: 2, ref: 'FRM Part I – Quantitative Analysis', build: (r) => {
    const pd = int(r, 1, 10) / 100, tp = int(r, 70, 98) / 100, fp = int(r, 2, 15) / 100, pf = tp * pd + fp * (1 - pd), ans = tp * pd / pf
    return { stem: `${pct(pd, 0)} of borrowers default. A model flags ${pct(tp, 0)} of defaulters and ${pct(fp, 0)} of non-defaulters. Given a flag, what is the probability of default?`,
      correct: pct(ans, 1), wrong: [pct(tp, 1), pct(1 - fp, 1), pct(tp * pd, 1)],
      simple: `False alarms from the large group of good borrowers swamp the true alarms.`,
      steps: [`P(flag) = ${tp} × ${pd} + ${fp} × ${(1 - pd).toFixed(2)} = ${pf.toFixed(4)}`, `P(D|flag) = ${(tp * pd).toFixed(4)} / ${pf.toFixed(4)} = ${pct(ans, 1)}`],
      trap: `${pct(tp, 0)} is P(flag | default), the reverse of what is asked.` } } },
  { id: 'var-affine', exam: 'FRM', paper: 'P1-QA', topic: 'Statistics & distributions', difficulty: 1, ref: 'FRM Part I – Quantitative Analysis', build: (r) => {
    const vx = int(r, 2, 16), a = pick(r, [-4, -3, -2, 2, 3, 4, 5]), b = int(r, 1, 9), ans = a * a * vx
    return { stem: `Var(X) = ${vx}. If Y = ${a}X + ${b}, what is Var(Y)?`, correct: String(ans), wrong: [String(a * vx), String(ans + b), String(Math.abs(a) * vx + b)],
      simple: `Adding a constant shifts values without spreading them. Multiplying stretches the spread, and variance grows by the square.`,
      steps: [`Var(aX + b) = a²Var(X) = ${a * a} × ${vx} = ${ans}`], trap: `The "+${b}" has no effect on variance, and a negative "a" still squares to a positive number.` } } },
  { id: 'el', exam: 'FRM', paper: 'P2-CR', topic: 'Expected loss', difficulty: 1, ref: 'FRM Part II – Credit Risk', build: (r) => {
    const ead = int(r, 1, 50) * 100_000, pd = int(r, 5, 80) / 1000, rec = int(r, 2, 7) / 10, ans = ead * pd * (1 - rec)
    return { stem: `EAD ${money(ead)}, PD ${pct(pd, 1)}, recovery rate ${pct(rec, 0)}. What is the expected loss?`,
      correct: money(ans), wrong: [money(ead * pd * rec), money(ead * pd), money(ead * (1 - rec))],
      simple: `Expected loss = how often borrowers fail × how much you lose each time × how much is lent.`, steps: [`LGD = 1 − ${pct(rec, 0)} = ${pct(1 - rec, 0)}`, `EL = ${pct(pd, 1)} × ${pct(1 - rec, 0)} × ${money(ead)} = ${money(ans)}`],
      trap: `${money(ead * pd * rec)} uses the recovery rate instead of LGD.` } } },
  { id: 'fwd-cont', exam: 'FRM', paper: 'P1-FMP', topic: 'Forwards and futures', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const S = int(r, 20, 500), rr = int(r, 2, 9) / 100, q = pick(r, [0, 0, 0.01, 0.02, 0.03]), T = pick(r, [0.5, 1, 2]), ans = S * Math.exp((rr - q) * T)
    return { stem: `A stock trades at $${S}${q ? ` with a continuous dividend yield of ${pct(q, 0)}` : ' and pays no dividends'}. The continuously compounded risk-free rate is ${pct(rr, 0)}. What is the ${T}-year forward price?`,
      correct: `$${num(ans)}`, wrong: [`$${num(S * (1 + (rr - q) * T))}`, `$${num(S * Math.exp(rr * T) * (q ? 1 : 1.01))}`, `$${num(S * Math.exp(-(rr - q) * T))}`],
      simple: `Buying later instead of now lets your cash earn interest, minus any dividends you'd miss.`, steps: [`F = S·e^((r − q)T) = ${S} × e^(${((rr - q) * T).toFixed(3)}) = $${num(ans)}`],
      trap: `Use e^(rT) when "continuously compounded" is stated. Discounting (e^−rT) gives a present value, not a forward price.` } } },
  { id: 'pcp', exam: 'FRM', paper: 'P1-FMP', topic: 'Options', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const S = int(r, 40, 120), K = S + int(r, -10, 10), pvk = Math.round(K * (1 - int(r, 2, 6) / 100) * 100) / 100, P0 = int(r, 2, 9), C = Math.round((P0 + S - pvk) * 100) / 100
    const ans = C - S + pvk
    return { stem: `European call = $${num(C)}, stock = $${S}, strike = $${K}, PV(strike) = $${num(pvk)}. Using put-call parity, what is the European put price?`,
      correct: `$${num(ans)}`, wrong: [`$${num(C + S - pvk)}`, `$${num(C - S + K)}`, `$${num(Math.abs(ans - 1.5))}`],
      simple: `"Call + cash" pays exactly the same as "share + put", so they must cost the same.`, steps: [`C + PV(K) = P + S`, `P = ${num(C)} − ${S} + ${num(pvk)} = $${num(ans)}`],
      trap: `Use PV(K), not K. Using K gives $${num(C - S + K)}.` } } },
  { id: 'bond-price', exam: 'FRM', paper: 'P1-FMP', topic: 'Bonds', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const n = pick(r, [2, 3, 4, 5]), c = int(r, 2, 9) / 100, y = c + pick(r, [-0.02, -0.01, 0.01, 0.02, 0.03])
    let p = 0; for (let t = 1; t <= n; t++) p += (100 * c) / (1 + y) ** t; p += 100 / (1 + y) ** n
    return { stem: `A ${n}-year bond pays a ${pct(c, 0)} annual coupon on $100 face. If its yield is ${pct(y, 0)}, what is its price?`,
      correct: `$${num(p)}`, wrong: [`$${num(100)}`, `$${num(200 - p)}`, `$${num(100 * (1 + (c - y) * n))}`],
      simple: `${c < y ? 'The coupon is lower than the market yield, so the bond sells below 100.' : 'The coupon is higher than the market yield, so the bond sells above 100.'}`,
      steps: [`P = Σ coupon/(1+y)^t + 100/(1+y)^${n}`, `= $${num(p)}`], trap: `Coupon < yield means a discount. Coupon > yield means a premium.` } } },
  { id: 'dur-conv', exam: 'FRM', paper: 'P1-VRM', topic: 'Duration and convexity', difficulty: 2, ref: 'FRM Part I – Valuation & Risk Models', build: (r) => {
    const D = int(r, 2, 15), C = int(r, 10, 200), dy = pick(r, [-200, -100, -50, 50, 100, 150, 200]) / 10000, ans = -D * dy + 0.5 * C * dy * dy
    return { stem: `Modified duration ${D}, convexity ${C}. Yields ${dy > 0 ? 'rise' : 'fall'} by ${Math.abs(dy * 10000)} bp. Estimated % price change?`,
      correct: pct(ans), wrong: [pct(-D * dy), pct(-D * dy - 0.5 * C * dy * dy), pct(D * dy)],
      simple: `Duration gives the main move, and convexity always adds a small cushion.`, steps: [`%ΔP ≈ −D·Δy + ½·C·Δy²`, `= ${pct(-D * dy)} + ${pct(0.5 * C * dy * dy)} = ${pct(ans)}`],
      trap: `The convexity term is positive whichever way rates move.` } } },
  { id: 'dv01', exam: 'FRM', paper: 'P1-VRM', topic: 'Duration and convexity', difficulty: 1, ref: 'FRM Part I – Valuation & Risk Models', build: (r) => {
    const D = int(r, 2, 15), P = int(r, 1, 50) * 1_000_000, ans = D * P * 0.0001
    return { stem: `A ${money(P)} bond position has modified duration ${D}. What is its DV01?`, correct: money(ans), wrong: [money(ans * 100), money(ans / 10), money(D * P * 0.001)],
      simple: `DV01 = money lost if rates rise by 0.01%.`, steps: [`DV01 = D × P × 0.0001 = ${D} × ${money(P)} × 0.0001 = ${money(ans)}`], trap: `1 bp = 0.0001.` } } },
  { id: 'hedge-ratio', exam: 'FRM', paper: 'P1-FMP', topic: 'Forwards and futures', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const ss = int(r, 10, 40) / 1000, sf = int(r, 10, 45) / 1000, rho = int(r, 5, 95) / 100, ans = rho * ss / sf
    return { stem: `σ(spot) = ${pct(ss, 1)}, σ(futures) = ${pct(sf, 1)}, correlation = ${rho}. What is the minimum-variance hedge ratio?`,
      correct: num(ans, 3), wrong: [num(rho * sf / ss, 3), num(ss / sf, 3), num(rho, 3)],
      simple: `The hedge ratio is how many units of futures to use per unit you own.`, steps: [`h* = ρ × σS/σF = ${rho} × ${pct(ss, 1)}/${pct(sf, 1)} = ${num(ans, 3)}`], trap: `Spot volatility goes on TOP.` } } },
  { id: 'beta-hedge', exam: 'FRM', paper: 'P1-FMP', topic: 'Forwards and futures', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const P = int(r, 5, 100) * 1_000_000, b = int(r, 6, 18) / 10, F = int(r, 1000, 6000, 50), m = pick(r, [50, 100, 250]), ans = (b * P) / (F * m)
    return { stem: `A ${money(P)} equity portfolio has beta ${b.toFixed(1)}. The index futures price is ${F.toLocaleString()} with a multiplier of ${m}. How many contracts must be sold to hedge market risk fully?`,
      correct: num(ans, 1), wrong: [num(P / (F * m), 1), num(ans * 2, 1), num(b * P / F / 100, 1)],
      simple: `You need ${b.toFixed(1)}× your portfolio value in short futures.`, steps: [`N = β × P / (F × multiplier) = ${b.toFixed(1)} × ${money(P)} / ${money(F * m)} = ${num(ans, 1)}`],
      trap: `Ignoring beta gives ${num(P / (F * m), 1)} contracts.` } } },
  { id: 'fwd-rate', exam: 'FRM', paper: 'P1-FMP', topic: 'Interest & FX rates', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const s1 = int(r, 10, 70) / 1000, s2 = s1 + int(r, -10, 20) / 1000, ans = (1 + s2) ** 2 / (1 + s1) - 1
    return { stem: `1-year spot rate ${pct(s1, 1)}, 2-year spot rate ${pct(s2, 1)} (annual compounding). What is the 1-year forward rate one year from now?`,
      correct: pct(ans), wrong: [pct((s1 + s2) / 2), pct(s2 - s1), pct(2 * s2 + s1)],
      simple: `Two years at the 2-year rate must equal one year at the 1-year rate and then rolling over.`, steps: [`(1 + ${pct(s2, 1)})² = (1 + ${pct(s1, 1)})(1 + f)`, `f = ${pct(ans)}`], trap: `A simple average ignores compounding.` } } },
  { id: 'cip', exam: 'FRM', paper: 'P1-FMP', topic: 'Interest & FX rates', difficulty: 2, ref: 'FRM Part I – Financial Markets & Products', build: (r) => {
    const S = int(r, 7500, 9000) / 100, ri = int(r, 40, 90) / 1000, ru = int(r, 10, 60) / 1000, ans = S * (1 + ri) / (1 + ru)
    return { stem: `Spot USD/INR = ${num(S)} (₹ per $). 1-year rates: India ${pct(ri, 1)}, US ${pct(ru, 1)} (annual compounding). What is the 1-year forward rate under covered interest parity?`,
      correct: num(ans), wrong: [num(S * (1 + ru) / (1 + ri)), num(S), num(S * (1 + ri - ru) * 1.01)],
      simple: `The higher-interest currency must be cheaper in the forward market, otherwise there would be free money.`, steps: [`F = S × (1 + r₹)/(1 + r$) = ${num(S)} × ${(1 + ri).toFixed(3)}/${(1 + ru).toFixed(3)} = ${num(ans)}`],
      trap: `The quoted (price) currency's rate goes on top.` } } },
  { id: 'ewma', exam: 'FRM', paper: 'P2-MR', topic: 'Volatility models', difficulty: 2, ref: 'FRM Part II – Market Risk', build: (r) => {
    const l = pick(r, [0.9, 0.94, 0.97]), s = int(r, 5, 25) / 1000, u = int(r, 0, 50) / 1000 * pick(r, [1, -1]), v = l * s * s + (1 - l) * u * u, ans = Math.sqrt(v)
    return { stem: `EWMA with λ = ${l}. Yesterday's volatility estimate was ${pct(s, 1)} and yesterday's return was ${pct(u, 1)}. Today's volatility estimate?`,
      correct: pct(ans), wrong: [pct(l * s + (1 - l) * Math.abs(u)), pct(Math.sqrt((1 - l) * s * s + l * u * u)), pct(s)],
      simple: `Mostly remember yesterday's estimate and nudge it by the newest shock.`, steps: [`σ² = λσ² + (1−λ)u² = ${v.toExponential(3)}`, `σ = ${pct(ans)}`], trap: `Weight VARIANCES (squares), not volatilities.` } } },
  { id: 'cds-hazard', exam: 'FRM', paper: 'P2-CR', topic: 'Credit derivatives & securitisation', difficulty: 2, ref: 'FRM Part II – Credit Risk', build: (r) => {
    const sp = int(r, 40, 600, 10) / 10000, rec = int(r, 2, 6) / 10, ans = sp / (1 - rec)
    return { stem: `A CDS spread is ${Math.round(sp * 10000)} bp and expected recovery is ${pct(rec, 0)}. What is the approximate annual hazard rate?`,
      correct: pct(ans), wrong: [pct(sp), pct(sp / rec), pct(sp * (1 - rec))],
      simple: `Premium ≈ default chance × loss when it happens.`, steps: [`λ ≈ spread/(1 − R) = ${pct(sp)}/${pct(1 - rec, 0)} = ${pct(ans)}`], trap: `Divide by LGD, not by the recovery rate.` } } },
  { id: 'cva', exam: 'FRM', paper: 'P2-CR', topic: 'Counterparty risk', difficulty: 2, ref: 'FRM Part II – Credit Risk', build: (r) => {
    const ee = int(r, 1, 30) * 100_000, pd = int(r, 5, 60) / 1000, rec = int(r, 2, 6) / 10, ans = ee * pd * (1 - rec)
    return { stem: `Expected exposure ${money(ee)}, counterparty PD ${pct(pd, 1)}, recovery ${pct(rec, 0)}. Simplified one-period CVA?`, correct: money(ans), wrong: [money(ee * pd * rec), money(ee * pd), money(ee * (1 - rec))],
      simple: `CVA is the price of your trading partner defaulting while owing you money.`, steps: [`CVA ≈ LGD × EE × PD = ${pct(1 - rec, 0)} × ${money(ee)} × ${pct(pd, 1)} = ${money(ans)}`], trap: `Use LGD (1 − R).` } } },
  { id: 'lcr', exam: 'FRM', paper: 'P2-LT', topic: 'LCR and NSFR', difficulty: 2, ref: 'BCBS 238', build: (r) => {
    const out = int(r, 100, 400, 10), inf = int(r, 20, 380, 10), hqla = int(r, 50, 400, 10), net = out - Math.min(inf, 0.75 * out), ans = hqla / net
    return { stem: `HQLA ${hqla}, stressed 30-day outflows ${out}, inflows ${inf}. Inflows are capped at 75% of outflows. What is the LCR?`,
      correct: pct(ans, 0), wrong: [pct(hqla / Math.max(out - inf, 1), 0) === pct(ans, 0) ? pct(hqla / out, 0) : pct(hqla / Math.max(out - inf, 1), 0), pct(hqla / (out + inf), 0), pct(hqla / out * 1.37, 0)],
      simple: `Can the bank survive a month of panic with its easy-to-sell assets?`, steps: [`Cap = 75% × ${out} = ${0.75 * out}. Usable inflows = ${Math.min(inf, 0.75 * out)}`, `Net outflows = ${net}`, `LCR = ${hqla}/${net} = ${pct(ans, 0)}`],
      trap: `Always apply the 75% inflow cap.` } } },
  { id: 'gap', exam: 'FRM', paper: 'P2-LT', topic: 'Asset-liability management', difficulty: 1, ref: 'FRM Part II – Liquidity & Treasury Risk', build: (r) => {
    const a = int(r, 100, 900, 10), l = int(r, 100, 900, 10), dr = pick(r, [-0.02, -0.01, -0.005, 0.005, 0.01, 0.02]), ans = (a - l) * dr
    return { stem: `Rate-sensitive assets ${a}, rate-sensitive liabilities ${l}. Rates change by ${dr > 0 ? '+' : ''}${pct(dr, 1)}. Approximate change in net interest income?`,
      correct: num(ans), wrong: [num(-ans || 1), num((a + l) * dr), num(a * dr)],
      simple: `Whichever side reprices more decides who wins when rates move.`, steps: [`Gap = ${a} − ${l} = ${a - l}`, `ΔNII = ${a - l} × ${pct(dr, 1)} = ${num(ans)}`], trap: `Negative gap means rising rates hurt.` } } },
  { id: 'binomial', exam: 'FRM', paper: 'P1-VRM', topic: 'Option valuation & Greeks', difficulty: 2, ref: 'FRM Part I – Valuation & Risk Models', build: (r) => {
    const S = 100, u = pick(r, [1.1, 1.15, 1.2, 1.25]), d = pick(r, [0.8, 0.85, 0.9]), rr = pick(r, [0, 0.01, 0.02, 0.03]), K = pick(r, [95, 100, 105])
    const p = (1 + rr - d) / (u - d), cu = Math.max(S * u - K, 0), cd = Math.max(S * d - K, 0), ans = (p * cu + (1 - p) * cd) / (1 + rr)
    return { stem: `One-step binomial: S = 100, u = ${u}, d = ${d}, one-period risk-free rate ${pct(rr, 0)}. Value of a European call with K = ${K}?`,
      correct: `$${num(ans)}`, wrong: [`$${num(0.5 * cu + 0.5 * cd)}`, `$${num(p * cu + (1 - p) * cd)}`, `$${num(cu)}`].map((x, i) => (x === `$${num(ans)}` ? `$${num(ans + i + 0.75)}` : x)),
      simple: `Price the call as the risk-neutral average payoff, discounted.`, steps: [`p = (1 + r − d)/(u − d) = ${num(p, 4)}`, `Payoffs: up ${num(cu)}, down ${num(cd)}`, `C = (${num(p, 4)}×${num(cu)} + ${num(1 - p, 4)}×${num(cd)})/${(1 + rr).toFixed(2)} = $${num(ans)}`],
      trap: `Don't use 50/50 or real-world probabilities, and remember to discount.` } } },
  { id: 'backtest-zone', exam: 'FRM', paper: 'P2-MR', topic: 'Backtesting', difficulty: 1, ref: 'Basel backtesting framework', build: (r) => {
    const x = int(r, 0, 14), zone = x <= 4 ? 'Green' : x <= 9 ? 'Yellow' : 'Red'
    return { stem: `A bank finds ${x} exceptions of its 99% 1-day VaR over 250 days. Basel traffic-light zone?`, correct: zone, wrong: ['Green', 'Yellow', 'Red', 'No zone: sample too small'].filter((z) => z !== zone),
      simple: `About 2–3 breaks a year are expected. More than that is a warning (yellow) or a failure (red).`, steps: [`Green 0–4, Yellow 5–9, Red 10+`, `${x} exceptions → ${zone}`], trap: `Expected exceptions = 1% × 250 = 2.5.` } } },

  // ───────────── CPA ─────────────
  { id: 'breakeven', exam: 'CPA', paper: 'BAR', topic: 'Cost-volume-profit', difficulty: 1, ref: 'CVP analysis', build: (r) => {
    const fc = int(r, 20, 500, 10) * 1000, p = int(r, 20, 200), vc = Math.round(p * int(r, 30, 80) / 100), tp = pick(r, [0, 0, int(r, 10, 100, 10) * 1000]), cm = p - vc, ans = (fc + tp) / cm
    return { stem: `Fixed costs ${money(fc)}, price $${p}/unit, variable cost $${vc}/unit. How many units are needed ${tp ? `to earn a profit of ${money(tp)}` : 'to break even'}?`,
      correct: num(ans, 0) + ' units', wrong: [num((fc + tp) / p, 0) + ' units', num((fc + tp) / vc, 0) + ' units', num(fc / cm, 0) === num(ans, 0) ? num(ans * 1.25, 0) + ' units' : num(fc / cm, 0) + ' units'],
      simple: `Each unit leaves $${cm} towards fixed costs${tp ? ' and profit' : ''}.`, steps: [`CM/unit = ${p} − ${vc} = ${cm}`, `Units = (${money(fc)}${tp ? ` + ${money(tp)}` : ''}) / ${cm} = ${num(ans, 0)}`], trap: `Divide by CONTRIBUTION, not by price or variable cost.` } } },
  { id: 'ddb', exam: 'CPA', paper: 'FAR', topic: 'PP&E and depreciation', difficulty: 2, ref: 'ASC 360', build: (r) => {
    const c = int(r, 10, 200) * 1000, sv = Math.round(c * int(r, 0, 15) / 100 / 100) * 100, n = pick(r, [4, 5, 8, 10]), yr = pick(r, [1, 2]), rate = 2 / n
    const ans = yr === 1 ? c * rate : c * (1 - rate) * rate
    return { stem: `Cost ${money(c)}, salvage ${money(sv)}, life ${n} years. Year-${yr} depreciation under double-declining balance?`,
      correct: money(ans), wrong: [money((c - sv) / n), money(yr === 1 ? (c - sv) * rate : (c - sv) * (1 - rate) * rate), money(yr === 1 ? c * rate * (1 - rate) : c * rate)],
      simple: `DDB writes off fast at the start: twice the straight-line rate, applied to the remaining book value.`, steps: [`Rate = 2/${n} = ${pct(rate, 1)}`, yr === 1 ? `Y1 = ${money(c)} × ${pct(rate, 1)} = ${money(ans)}` : `BV start of Y2 = ${money(c * (1 - rate))}; × ${pct(rate, 1)} = ${money(ans)}`],
      trap: `Ignore salvage when applying the DDB rate. Just stop once book value reaches salvage.` } } },
  { id: 'eps', exam: 'CPA', paper: 'FAR', topic: 'Equity & EPS', difficulty: 2, ref: 'ASC 260', build: (r) => {
    const ni = int(r, 100, 5000, 10) * 1000, pref = int(r, 0, 20) * 5000, sh = int(r, 50, 2000, 10) * 1000, cum = r() > 0.5, ans = (ni - pref) / sh
    return { stem: `Net income ${money(ni)}. ${cum ? 'Cumulative' : 'Non-cumulative'} preferred dividends of ${money(pref)} were declared. Weighted average common shares ${sh.toLocaleString()}. Basic EPS?`,
      correct: `$${num(ans)}`, wrong: [`$${num(ni / sh)}`, `$${num((ni + pref) / sh)}`, `$${num((ni - pref) / (sh * 1.1))}`],
      simple: `EPS is the profit belonging to ordinary shareholders, divided by their shares.`, steps: [`(${money(ni)} − ${money(pref)}) / ${sh.toLocaleString()} = $${num(ans)}`], trap: `Subtract preferred dividends (cumulative ones even if undeclared).` } } },
  { id: 'wtd-shares', exam: 'CPA', paper: 'FAR', topic: 'Equity & EPS', difficulty: 1, ref: 'ASC 260', build: (r) => {
    const s0 = int(r, 50, 500, 10) * 1000, iss = int(r, 5, 100, 5) * 1000, m = int(r, 2, 11), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1], ans = s0 + iss * (12 - (m - 1)) / 12
    return { stem: `${s0.toLocaleString()} shares outstanding on 1 Jan. ${iss.toLocaleString()} new shares issued for cash on 1 ${mon}. Weighted average shares for the calendar year?`,
      correct: num(ans, 0), wrong: [num(s0 + iss, 0), num(s0, 0), num(s0 + iss * (m - 1) / 12, 0)],
      simple: `New shares count only for the months they existed.`, steps: [`${iss.toLocaleString()} × ${13 - m}/12 = ${num(iss * (13 - m) / 12, 0)}`, `+ ${s0.toLocaleString()} = ${num(ans, 0)}`], trap: `Stock dividends and splits are retroactive, NOT time-weighted.` } } },
  { id: 'equity-method', exam: 'CPA', paper: 'FAR', topic: 'Investments', difficulty: 2, ref: 'ASC 323', build: (r) => {
    const cost = int(r, 100, 5000, 10) * 1000, own = int(r, 20, 45) / 100, ni = int(r, 50, 2000, 10) * 1000, div = Math.round(ni * int(r, 10, 60) / 100 / 1000) * 1000, ans = cost + own * ni - own * div
    return { stem: `Investor pays ${money(cost)} for ${pct(own, 0)} of an investee (significant influence). The investee earns ${money(ni)} and pays dividends of ${money(div)}. Ending investment balance?`,
      correct: money(ans), wrong: [money(cost + own * ni), money(cost + own * div), money(cost)],
      simple: `Your share of profit increases the investment. Dividends received decrease it.`, steps: [`+ ${money(own * ni)} share of income`, `− ${money(own * div)} dividends`, `= ${money(ans)}`], trap: `Dividends are NOT income under the equity method.` } } },
  { id: 'bad-debt', exam: 'CPA', paper: 'FAR', topic: 'Receivables', difficulty: 2, ref: 'ASC 326', build: (r) => {
    const req = int(r, 5, 100) * 1000, bal = int(r, 1, 20) * 1000, debit = r() > 0.5, ans = debit ? req + bal : req - bal
    return { stem: `Required allowance ${money(req)}. Before adjustment the allowance has a ${money(bal)} ${debit ? 'DEBIT' : 'credit'} balance. Credit loss expense?`,
      correct: money(ans), wrong: [money(req), money(debit ? req - bal : req + bal), money(bal)],
      simple: `Top the allowance up to the required level. The top-up is the expense.`, steps: [`${money(req)} ${debit ? '+' : '−'} ${money(bal)} = ${money(ans)}`], trap: `A debit balance means you must ADD it back.` } } },
  { id: 'eff-int', exam: 'CPA', paper: 'FAR', topic: 'Bonds and liabilities', difficulty: 2, ref: 'ASC 835-30', build: (r) => {
    const face = int(r, 1, 20) * 100_000, cr = int(r, 3, 9) / 100, mr = cr + pick(r, [-0.02, -0.01, 0.01, 0.02]), ca = Math.round(face * (1 + (cr - mr) * 3) / 1000) * 1000
    const exp = ca * mr, cash = face * cr, ans = Math.abs(exp - cash)
    return { stem: `Bonds: face ${money(face)}, coupon ${pct(cr, 0)} annual, carrying amount ${money(ca)}, market rate at issue ${pct(mr, 0)}. This year's ${exp > cash ? 'discount' : 'premium'} amortisation (effective interest)?`,
      correct: money(ans), wrong: [money(Math.abs(face * mr - cash)), money(exp), money(Math.abs(ca * cr - cash) || ans * 1.4)],
      simple: `The expense is the true market interest on what was borrowed. The gap from the cash coupon is amortisation.`, steps: [`Expense = ${money(ca)} × ${pct(mr, 0)} = ${money(exp)}`, `Cash = ${money(face)} × ${pct(cr, 0)} = ${money(cash)}`, `Amortisation = ${money(ans)}`],
      trap: `Expense uses CARRYING amount × MARKET rate.` } } },
  { id: 'cfo', exam: 'CPA', paper: 'FAR', topic: 'Financial statements & cash flows', difficulty: 2, ref: 'ASC 230', build: (r) => {
    const ni = int(r, 50, 900) * 1000, dep = int(r, 5, 100) * 1000, ar = int(r, -40, 40) * 1000, inv = int(r, -30, 30) * 1000, ap = int(r, -30, 30) * 1000, ans = ni + dep - ar - inv + ap
    const s = (x: number, n: string) => `${n} ${x >= 0 ? 'increased' : 'decreased'} by ${money(Math.abs(x))}`
    return { stem: `Net income ${money(ni)}; depreciation ${money(dep)}; ${s(ar, 'accounts receivable')}; ${s(inv, 'inventory')}; ${s(ap, 'accounts payable')}. Operating cash flow (indirect)?`,
      correct: money(ans), wrong: [money(ni + dep + ar + inv - ap), money(ni - dep - ar - inv + ap), money(ni + dep)],
      simple: `Start from profit and undo the non-cash items and the timing differences.`, steps: [`${money(ni)} + ${money(dep)} − ΔAR(${money(ar)}) − ΔInv(${money(inv)}) + ΔAP(${money(ap)}) = ${money(ans)}`],
      trap: `Increases in current ASSETS are subtracted. Increases in current LIABILITIES are added.` } } },
  { id: 'goodwill', exam: 'CPA', paper: 'FAR', topic: 'Business combinations', difficulty: 3, ref: 'ASC 805', build: (r) => {
    const own = pick(r, [0.6, 0.7, 0.75, 0.8, 0.9]), na = int(r, 200, 3000, 10) * 1000, prem = int(r, 5, 40) / 100, cons = Math.round(own * na * (1 + prem) / 1000) * 1000, nci = Math.round((1 - own) * na * (1 + prem * 0.8) / 1000) * 1000, ans = cons + nci - na
    return { stem: `P pays ${money(cons)} for ${pct(own, 0)} of S. NCI fair value ${money(nci)}. Fair value of S's identifiable net assets ${money(na)}. Goodwill (US GAAP)?`,
      correct: money(ans), wrong: [money(cons - own * na), money(cons - na), money(cons + nci)],
      simple: `Total value of the whole company minus what you can identify equals goodwill.`, steps: [`${money(cons)} + ${money(nci)} − ${money(na)} = ${money(ans)}`], trap: `US GAAP uses FULL goodwill (includes NCI).` } } },
  { id: 'rev-alloc', exam: 'CPA', paper: 'FAR', topic: 'Revenue recognition', difficulty: 2, ref: 'ASC 606-10-32-29', build: (r) => {
    const a = int(r, 100, 2000, 50), b = int(r, 50, 1000, 50), price = Math.round((a + b) * int(r, 75, 95) / 100), ans = price * a / (a + b)
    return { stem: `A product (SSP $${a}) and a service (SSP $${b}) are sold together for $${price}. How much is allocated to the product?`,
      correct: `$${num(ans)}`, wrong: [`$${num(a)}`, `$${num(price - b)}`, `$${num(price / 2)}`],
      simple: `Share the bundle discount in proportion to the normal prices.`, steps: [`${a}/(${a}+${b}) × ${price} = $${num(ans)}`], trap: `Don't put the whole discount on one item.` } } },
  { id: 'dtl', exam: 'CPA', paper: 'FAR', topic: 'Income taxes', difficulty: 2, ref: 'ASC 740', build: (r) => {
    const td = int(r, 10, 900) * 1000, cur = 0.21, fut = pick(r, [0.21, 0.25, 0.28, 0.3]), ans = td * fut
    return { stem: `Taxable temporary differences ${money(td)}. Current rate ${pct(cur, 0)}. Enacted rate for the reversal years ${pct(fut, 0)}. Deferred tax liability?`,
      correct: money(ans), wrong: [money(td * cur === ans ? td * 0.35 : td * cur), money(td * (fut - cur) || td * 0.1), money(td)],
      simple: `Use the tax rate that will apply when the difference reverses.`, steps: [`${money(td)} × ${pct(fut, 0)} = ${money(ans)}`], trap: `Use the ENACTED future rate.` } } },
  { id: 'impair', exam: 'CPA', paper: 'FAR', topic: 'Impairment & intangibles', difficulty: 2, ref: 'ASC 360-10-35', build: (r) => {
    const ca = int(r, 100, 2000, 10) * 1000, und = Math.round(ca * int(r, 70, 120) / 100 / 1000) * 1000, fv = Math.round(Math.min(und, ca) * int(r, 60, 95) / 100 / 1000) * 1000, ans = und < ca ? ca - fv : 0
    return { stem: `Asset held and used: carrying amount ${money(ca)}, undiscounted future cash flows ${money(und)}, fair value ${money(fv)}. Impairment loss (US GAAP)?`,
      correct: money(ans), wrong: [money(Math.max(ca - und, 0) === ans ? ans + 10000 : Math.max(ca - und, 0)), money(ans === 0 ? ca - fv : 0), money(ca - fv + 5000)],
      simple: `First test with undiscounted cash flows. Only if the asset fails, measure the loss with fair value.`, steps: [`Recoverable? ${money(und)} ${und < ca ? '<' : '≥'} ${money(ca)} → ${und < ca ? 'impaired' : 'not impaired'}`, und < ca ? `Loss = ${money(ca)} − ${money(fv)} = ${money(ans)}` : `No loss.`],
      trap: `Undiscounted cash flows are for the TEST only.` } } },
  { id: 'lcnrv', exam: 'CPA', paper: 'FAR', topic: 'Inventory', difficulty: 2, ref: 'ASC 330', build: (r) => {
    const cost = int(r, 10, 500) * 1000, sp = Math.round(cost * int(r, 85, 120) / 100 / 1000) * 1000, sell = Math.round(sp * int(r, 5, 20) / 100 / 1000) * 1000, nrv = sp - sell, ans = Math.max(cost - nrv, 0)
    return { stem: `FIFO inventory: cost ${money(cost)}, estimated selling price ${money(sp)}, costs to sell ${money(sell)}. Write-down required?`,
      correct: money(ans), wrong: [money(Math.max(cost - sp, 0) === ans ? ans + sell : Math.max(cost - sp, 0)), money(sell), money(ans + sell)],
      simple: `Inventory can't be carried at more than you'll actually get for it.`, steps: [`NRV = ${money(sp)} − ${money(sell)} = ${money(nrv)}`, `Write-down = max(cost − NRV, 0) = ${money(ans)}`], trap: `Deduct the costs to sell.` } } },
  { id: 'ratios', exam: 'CPA', paper: 'BAR', topic: 'Financial statement analysis', difficulty: 1, ref: 'Ratio analysis', build: (r) => {
    const m = int(r, 2, 15) / 100, t = int(r, 5, 30) / 10, l = int(r, 10, 40) / 10, ans = m * t * l
    return { stem: `Net margin ${pct(m, 0)}, asset turnover ${t.toFixed(1)}, equity multiplier ${l.toFixed(1)}. ROE (DuPont)?`, correct: pct(ans, 1), wrong: [pct(m * t, 1), pct(m + t / 100 + l / 100, 1), pct(m * l, 1)],
      simple: `ROE = profit per sale × sales per asset × assets per equity.`, steps: [`${pct(m, 0)} × ${t.toFixed(1)} × ${l.toFixed(1)} = ${pct(ans, 1)}`], trap: `Multiply all three. ROA alone is margin × turnover.` } } },
  { id: 'lab-eff', exam: 'CPA', paper: 'BAR', topic: 'Cost & variance analysis', difficulty: 2, ref: 'Standard costing', build: (r) => {
    const sh = int(r, 500, 5000, 50), ah = sh + int(r, -300, 300, 10), sr = int(r, 10, 60), ar = sr + int(r, -3, 3), v = (ah - sh) * sr
    const lab = (x: number) => `${money(Math.abs(x))} ${x > 0 ? 'unfavourable' : x < 0 ? 'favourable' : '(nil)'}`
    return { stem: `Actual hours ${ah.toLocaleString()}, standard hours allowed ${sh.toLocaleString()}, standard rate $${sr}, actual rate $${ar}. Labour EFFICIENCY variance?`,
      correct: lab(v), wrong: [lab((ah - sh) * ar === v ? v + sr * 7 : (ah - sh) * ar), lab(-v || sr * 11), lab((ar - sr) * ah || sr * 13)],
      simple: `Extra hours, valued at the PLANNED rate.`, steps: [`(AH − SH) × SR = (${ah} − ${sh}) × ${sr} = ${lab(v)}`], trap: `The rate variance is a separate figure: (AR − SR) × AH.` } } },
  { id: 'partner-basis', exam: 'CPA', paper: 'REG', topic: 'Entity taxation', difficulty: 2, ref: 'IRC §705, §752', build: (r) => {
    const c = int(r, 10, 200) * 1000, inc = int(r, -20, 80) * 1000, d = int(r, 0, 40) * 1000, l = int(r, -10, 30) * 1000, ans = Math.max(c + inc - d + l, 0)
    return { stem: `A partner contributes ${money(c)} cash. Share of partnership ${inc >= 0 ? 'income' : 'loss'} ${money(Math.abs(inc))}, distributions ${money(d)}, share of partnership liabilities ${l >= 0 ? 'increases' : 'decreases'} by ${money(Math.abs(l))}. Ending outside basis?`,
      correct: money(ans), wrong: [money(c + inc - d), money(c + inc + d + l), money(c - inc - d + l)],
      simple: `Basis goes up with money in, profits and debt share. It goes down with losses, cash out and reduced debt share.`, steps: [`${money(c)} ${inc >= 0 ? '+' : '−'} ${money(Math.abs(inc))} − ${money(d)} ${l >= 0 ? '+' : '−'} ${money(Math.abs(l))} = ${money(ans)}`],
      trap: `Liability changes are deemed contributions or distributions (§752).` } } },
  { id: 'like-kind', exam: 'CPA', paper: 'REG', topic: 'Property transactions', difficulty: 3, ref: 'IRC §1031', build: (r) => {
    const basis = int(r, 50, 800, 10) * 1000, fmv = basis + int(r, 20, 500, 10) * 1000, boot = int(r, 0, 100, 10) * 1000, real = fmv - basis, rec = Math.min(boot, real)
    return { stem: `Investment real estate (basis ${money(basis)}, FMV ${money(fmv)}) is exchanged for like-kind real estate worth ${money(fmv - boot)}${boot ? ` plus ${money(boot)} cash` : ''}. Recognised gain?`,
      correct: money(rec), wrong: [money(real), money(boot ? 0 : real / 2), money(real - rec || boot + 10000)],
      simple: `Swapping property for property is tax-deferred. Only the cash ("boot") received is taxed.`, steps: [`Realised = ${money(fmv)} − ${money(basis)} = ${money(real)}`, `Recognised = lesser of boot and realised = ${money(rec)}`],
      trap: `Since 2018, §1031 applies only to real property.` } } },
  { id: 'installment', exam: 'CPA', paper: 'TCP', topic: 'Property planning', difficulty: 2, ref: 'IRC §453', build: (r) => {
    const price = int(r, 50, 1000, 10) * 1000, basis = Math.round(price * int(r, 30, 85) / 100 / 1000) * 1000, pay = Math.round(price * int(r, 10, 50) / 100 / 1000) * 1000, gp = (price - basis) / price, ans = pay * gp
    return { stem: `Land (basis ${money(basis)}) sold for ${money(price)} on an installment basis. ${money(pay)} collected in year 1. Gain recognised in year 1?`,
      correct: money(ans), wrong: [money(price - basis), money(pay), money(pay * (1 - gp))],
      simple: `Each rupee collected contains the same share of profit (${pct(gp, 1)}).`, steps: [`GP% = ${money(price - basis)}/${money(price)} = ${pct(gp, 1)}`, `${money(pay)} × ${pct(gp, 1)} = ${money(ans)}`], trap: `Depreciation recapture is recognised in the year of sale.` } } },
  { id: 'make-buy', exam: 'CPA', paper: 'BAR', topic: 'Decision making', difficulty: 2, ref: 'Relevant costing', build: (r) => {
    const vc = int(r, 5, 80), fx = int(r, 2, 30), buy = vc + int(r, -10, 15), diff = buy - vc
    const ans = diff > 0 ? `Make: saves $${diff} per unit` : diff < 0 ? `Buy: saves $${-diff} per unit` : 'Indifferent'
    return { stem: `Buy price $${buy}/unit. Making costs $${vc} variable plus $${fx} of allocated fixed overhead that continues either way. On cost alone, the company should:`,
      correct: ans, wrong: [diff + fx > 0 && diff < 0 ? `Make: saves $${diff + fx} per unit` : `Buy: saves $${Math.abs(buy - vc - fx) || fx} per unit`, `Make: saves $${Math.abs(diff) + fx} per unit`, diff === 0 ? `Make: saves $${fx} per unit` : 'Indifferent'],
      simple: `Ignore the fixed cost that stays either way. Compare only the costs that change.`, steps: [`Relevant make cost = $${vc}`, `Buy = $${buy}`, ans], trap: `Allocated, unavoidable fixed overhead is irrelevant.` } } },
]

const ALL_TOPICS_WITH_GEN = new Set(TEMPLATES.map((t) => `${t.exam}|${t.paper}|${t.topic}`))
export const hasGenerator = (exam: string, paper?: string, topic?: string) =>
  TEMPLATES.some((t) => t.exam === exam && (!paper || t.paper === paper) && (!topic || t.topic === topic))
export { ALL_TOPICS_WITH_GEN }

/** Build one generated question. Deterministic for a given template id + seed. */
export function generate(t: Template, seed: number): Question {
  const r = mulberry32(seed * 2654435761 + t.id.length * 97)
  const b = t.build(r)
  // de-duplicate distractors, then top up with nudged variants of the correct answer if needed
  const seen = new Set([b.correct]); const wrong: string[] = []
  for (const w of b.wrong) if (!seen.has(w) && wrong.length < 3) { seen.add(w); wrong.push(w) }
  let k = 1
  while (wrong.length < 3) { const alt = nudge(b.correct, k++); if (!seen.has(alt)) { seen.add(alt); wrong.push(alt) } }
  const options = [b.correct, ...wrong]
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [options[i], options[j]] = [options[j], options[i]] }
  return {
    id: `GEN-${t.id}-${seed}`, exam: t.exam, paper: t.paper, topic: t.topic, difficulty: t.difficulty, stem: b.stem, options, answer: options.indexOf(b.correct),
    explain: { simple: b.simple, steps: b.steps, trap: b.trap }, ref: t.ref, status: 'generated',
  }
}

/** Perturb a formatted answer (e.g. "$1,234" or "12.50%") to make a plausible distinct distractor. */
function nudge(s: string, k: number): string {
  const m = s.match(/-?[\d,]+(\.\d+)?/)
  if (!m) return `${s} (approx.)`.repeat(k)
  const n = parseFloat(m[0].replace(/,/g, '')), dp = m[1] ? m[1].length - 1 : 0
  const f = [1.1, 0.9, 1.25, 0.75, 1.5, 0.5][(k - 1) % 6] * (1 + Math.floor((k - 1) / 6) * 0.07)
  const v = n === 0 ? k * 1000 : n * f
  return s.replace(m[0], v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
}

/** Get `count` generated questions for an exam/paper/topic filter, with fresh random seeds. */
export function generateMany(filter: { exam?: string | null; paper?: string; topic?: string }, count: number, seedBase = Date.now() % 1_000_000): Question[] {
  const ts = TEMPLATES.filter((t) => (!filter.exam || t.exam === filter.exam) && (!filter.paper || t.paper === filter.paper) && (!filter.topic || t.topic === filter.topic))
  if (!ts.length) return []
  return Array.from({ length: count }, (_, i) => generate(ts[i % ts.length], seedBase + i * 7919))
}

/** Rebuild a generated question from its id (used to show history/reviews). */
export function fromId(id: string): Question | null {
  const m = id.match(/^GEN-(.+)-(\d+)$/); if (!m) return null
  const t = TEMPLATES.find((x) => x.id === m[1]); return t ? generate(t, Number(m[2])) : null
}
