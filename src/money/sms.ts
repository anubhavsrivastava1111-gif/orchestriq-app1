// Lifeline — reads Indian bank / card SMS and turns them into transactions.
// Pure functions only (no app state), so every format can be unit-tested.
//
// Safety rules:
//  • Messages that carry a one-time password are rejected outright and never stored.
//  • Promotions, reminders ("will be debited"), and failed / declined transactions are ignored.
//  • Personal SMS (sender is a phone number) are ignored; only bank / business senders are read.
import type { TxnKind } from "./types";

export interface ParsedSms {
  amount: number;
  dir: "debit" | "credit" | "info";
  kind: TxnKind;
  party: string;
  last4?: string;
  toLast4?: string;      // second account in "from A/c X to A/c Y" messages
  isCard: boolean;       // the message is about a credit card
  balanceAfter?: number; // bank balance after the transaction
  availLimit?: number;   // credit card available limit
  ref?: string;
  stmt?: { tad: number; mad: number; due?: string };
}

const MONEY = String.raw`(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)`;
const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : NaN);

/** True for messages that contain a one-time password or verification code. */
export function isOtp(body: string): boolean {
  const t = body.toLowerCase();
  return /\b(otp|one[\s-]?time\s+pass(word|code)?|verification code|security code|auth(entication)? code)\b[\s:=#-]{0,4}\d{4,8}\b/.test(t)
    || /\b(otp|one[\s-]?time\s+pass(word|code)?|code)\b.{0,80}?\bis\s*:?\s*\d{4,8}\b/.test(t)
    || /\b\d{4,8}\b[^0-9]{0,30}\b(is|as)\s+(your|the)\s+(otp|one[\s-]?time|verification)/.test(t);
}

/** Bank and business SMS senders look like "AD-HDFCBK", "VM-SBIUPI-S" or "ICICIB"; people's numbers don't. */
export function isBusinessSender(from: string): boolean {
  const f = from.trim();
  if (!f) return true; // pasted by the user
  if (/^\+?\d[\d\s-]{6,}$/.test(f)) return false;
  return /[a-z]/i.test(f);
}

const PROMO = /\b(pre-?approved|offer|apply now|eligible for|get up to|upto \d+% off|win |congratulations|lowest emi|instant loan|click here to|limited period|exclusive deal)\b/i;
const FAILED = /\b(declined|failed|unsuccessful|could not be processed|was not successful|insufficient (funds|balance))\b/i;
const FUTURE = /\b(will be (debited|deducted|presented|auto-?debited)|is due (on|by)|due on|scheduled for|reminder|please (pay|ensure|maintain)|kindly (pay|ensure|maintain))\b/i;

export function parseSms(body: string, from = ""): ParsedSms | null {
  if (!body || body.length < 15) return null;
  if (!isBusinessSender(from)) return null;
  if (isOtp(body)) return null;
  const text = body.replace(/\s*\n\s*/g, " . ").replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  if (FAILED.test(text)) return null;

  const isCreditCard = /\bcredit\s*card\b|\bcard\s*member\b|\bcardmember\b|\bavl\.?\s*(lmt|limit)\b|\bavailable\s*(credit\s*)?limit\b/i.test(text)
    || (/\bcard\b/i.test(text) && !/\bdebit\s*card\b/i.test(text) && /\b(spent|purchase|used)\b/i.test(text) && !/\ba\/?c\b/i.test(text));

  // ─── Card statement ("Total amount due … Minimum amount due … due by …") ───
  const tadM = text.match(new RegExp(String.raw`(?:total|tot)\.?\s*(?:amt|amount)\.?\s*(?:due|payable)[^0-9₹]{0,12}` + `(?:${MONEY}|([\\d,]+(?:\\.\\d{1,2})?))`, "i"));
  if (tadM) {
    const tad = num(tadM[1] ?? tadM[2]);
    const madM = text.match(new RegExp(String.raw`min(?:imum)?\.?\s*(?:amt|amount)?\.?\s*(?:due|payable)[^0-9₹]{0,12}` + `(?:${MONEY}|([\\d,]+(?:\\.\\d{1,2})?))`, "i"));
    const due = parseDate(text.match(/due\s*(?:date|by|on)?\s*(?:is|:)?\s*([0-9]{1,2}[-/ .]?(?:[A-Za-z]{3,9}|[0-9]{1,2})[-/ .,]*[0-9]{2,4})/i)?.[1]);
    if (tad >= 0) return { amount: tad, dir: "info", kind: "statement", party: bankName(from, text), last4: last4Of(text), isCard: true, stmt: { tad, mad: madM ? num(madM[1] ?? madM[2]) : NaN, due } };
  }
  if (PROMO.test(text) && !/\b(debited|credited|spent|withdrawn)\b/i.test(text)) return null;
  if (FUTURE.test(text)) return null;

  // ─── Balance / limit (read first, then removed so they aren't mistaken for the amount) ───
  const balRe = new RegExp(String.raw`\b(?:avl|available|avbl|avail|clr|clear|closing|total|a\/c)?\.?\s*bal(?:ance)?\b[^0-9₹-]{0,14}(?:rs\.?|inr|₹)?\s*(-?[\d,]+(?:\.\d{1,2})?)`, "i");
  const limRe = new RegExp(String.raw`\b(?:avl|available|avbl|avail)\.?\s*(?:credit\s*)?(?:lmt|limit|cr\.?\s*lmt)\b[^0-9₹]{0,14}(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)`, "i");
  const limit = text.match(limRe);
  const bal = text.match(balRe);
  let rest = text.replace(limRe, " ").replace(balRe, " ");

  // ─── Amount ───
  let amount = NaN;
  const m1 = rest.match(new RegExp(MONEY, "i"));
  if (m1) amount = num(m1[1]);
  if (!(amount > 0)) {
    const m2 = rest.match(/\b(?:debited|credited|debit|credit)\s+(?:by|with|for|of)\s+([\d,]+(?:\.\d{1,2})?)/i);
    if (m2) amount = num(m2[1]);
  }
  if (!(amount > 0)) return null;
  rest = rest.replace(new RegExp(MONEY, "i"), " AMT ");

  // ─── Direction ───
  const creditAt = firstIndex(low, [/\bcredited\b/, /\breceived\b/, /\bdeposited\b/, /\brefund(ed)?\b/, /\breversed\b/, /\bcredit of\b/, /\badded to\b/]);
  const debitAt = firstIndex(low, [/\bdebited\b/, /\bspent\b/, /\bwithdrawn\b/, /\bwithdrawal\b/, /\bsent\b/, /\bpaid\b/, /\bdebit\b/, /\bpurchase\b/, /\btxn of\b/, /\btransaction of\b/, /\bused\b/, /\btransferred\b/, /\bdeducted\b/]);
  if (creditAt < 0 && debitAt < 0) return null;
  const cardPayment = isCreditCard && /\b(payment|pymt|pmt)\b.{0,60}\breceived\b|\breceived\b.{0,40}\b(payment|pymt|pmt)\b|thank you for (your|the) payment/i.test(text);
  let dir: "debit" | "credit" = cardPayment ? "credit" : creditAt >= 0 && (debitAt < 0 || creditAt < debitAt) ? "credit" : "debit";
  // "Rs 500 credited to A/c X … debited from A/c Y" is rare; "debited … credited to beneficiary" means a debit for us.
  if (dir === "credit" && /\bdebited\b/.test(low) && /\bcredited to\b/.test(low) && !/\byour\b.{0,20}\bcredited\b/.test(low)) dir = "debit";

  // ─── Kind ───
  let kind: TxnKind;
  if (cardPayment) kind = "card-payment";
  else if (dir === "debit" && /\batm\b|cash withdrawal|\bwithdrawn\b|\bcash wdl\b|\bwdl\b/i.test(text)) kind = "atm";
  else if (dir === "credit" && /cash deposit|cash dep\b|deposited in cash|\bcdm\b/i.test(text)) kind = "cash-in";
  else if (dir === "debit" && /\b(emi|nach|ach\s*d|ach-dr|ecs|loan|standing instruction|si\s+debit|auto[\s-]?debit|mandate)\b/i.test(text)) kind = "emi";
  else if (dir === "credit" && /\b(salary|sal\b|payroll|sal cr)\b/i.test(text)) kind = "salary";
  else if (dir === "credit" && /\b(refund|reversal|reversed|cashback|cash back)\b/i.test(text)) kind = "refund";
  else if (dir === "credit") kind = "received";
  else kind = isCreditCard ? "card-spend" : "spend";

  const digits = allLast4(text);
  return {
    amount, dir, kind,
    party: kind === "atm" ? "ATM cash" : kind === "card-payment" ? "Card payment" : partyOf(rest, dir) || bankName(from, text),
    last4: digits[0], toLast4: digits[1],
    isCard: isCreditCard,
    balanceAfter: bal && !isCreditCard ? num(bal[1]) : undefined,
    availLimit: limit ? num(limit[1]) : isCreditCard && bal ? num(bal[1]) : undefined,
    ref: text.match(/\b(?:upi\s*)?(?:ref(?:erence)?|rrn|utr|txn\s*id|transaction\s*id|refno)\.?\s*(?:no\.?|number|id)?\s*[:.\-#]?\s*([A-Za-z0-9]{6,})/i)?.[1]
      ?? text.match(/\bUPI\/[A-Z0-9]+\/(\d{9,})/i)?.[1],
  };
}

function firstIndex(s: string, res: RegExp[]): number {
  let best = -1;
  for (const r of res) { const m = s.match(r); if (m && m.index !== undefined && (best < 0 || m.index < best)) best = m.index; }
  return best;
}

const ACCT_RE = /\b(?:a\/?c|acct|account|card|ac)(?:\s*(?:no|number|num|ending|end(?:ing)?\s*with|ending\s*in))?\.?\s*[:-]?\s*(?:[x*.]+\s*)?(\d{3,6})\b/gi;
const ACCT_RE2 = /\b(?:ending|end)\s*(?:with|in)?\s*[x*]*(\d{4})\b|\b[x*]{2,}(\d{3,6})\b/gi;
function allLast4(text: string): string[] {
  const out: string[] = [];
  for (const re of [ACCT_RE, ACCT_RE2]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const d = (m[1] ?? m[2] ?? "").slice(-4);
      if (d && !out.includes(d)) out.push(d);
    }
  }
  // keep the order they appear in the text
  return out.sort((a, b) => text.indexOf(a) - text.indexOf(b));
}
function last4Of(text: string) { return allLast4(text)[0]; }

const STOP = String.raw`(?=\s+on\b|\s+dt\b|\s+date\b|\s*\.\s|\s*\.$|\s*,|\s+avl|\s+ref|\s+upi\b|\s+via\b|\s+using\b|\s*\(|\s+not you|\s+if not|\s+thru\b|\s+-|\s+info|$)`;
function partyOf(t: string, dir: "debit" | "credit"): string {
  const pats: RegExp[] = [
    /\bUPI\/(?:P2M|P2A|CR|DR)?\/?\d{6,}\/([^/\s]+)/i,
    /\bVPA\s+([a-z0-9._-]+@[a-z]+)/i,
    new RegExp(String.raw`\b(?:at|@)\s+([A-Za-z0-9&@._'*\- ]{2,40}?)` + STOP, "i"),
    ...(dir === "debit"
      ? [new RegExp(String.raw`\b(?:trf to|paid to|sent to|transferred to|to|towards|for)\s+(?:vpa\s+)?(?!a\/?c\b|your\b|ac\b|account\b)([A-Za-z0-9&@._'*\- ]{2,40}?)` + STOP, "i")]
      : [new RegExp(String.raw`\b(?:from|by|frm)\s+(?:vpa\s+)?(?!a\/?c\b|your\b|ac\b|account\b)([A-Za-z0-9&@._'*\- ]{2,40}?)` + STOP, "i")]),
    ...(dir === "debit" ? [new RegExp(String.raw`\bon\s+(?!date\b|your\b|the\b|\d)([A-Za-z][A-Za-z0-9&._'*\- ]{2,40}?)` + STOP, "i")] : []),
    /\b(?:NEFT|IMPS|RTGS|NACH|ACH|ECS)[\s\-:/]*(?:D-|CR-|DR-|C-)?\s*([A-Za-z][A-Za-z0-9 &.]{2,40}?)(?=\s*\.|\s+avl|\s+on\b|$|\s*,)/i,
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (!m) continue;
    const v = clean(m[1]);
    if (v && !/^(AMT|your|the|a\/c|ac|account|beneficiary|you|date|rs|inr)$/i.test(v) && !/^\d+$/.test(v)) return v;
  }
  return "";
}
function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/[.,:;\-\s]+$/, "").replace(/^[.,:;\-\s]+/, "").slice(0, 40).trim();
}

const BANKS: [RegExp, string][] = [
  [/hdfc/i, "HDFC Bank"], [/\bsbi|sbiinb|sbiupi|state bank/i, "SBI"], [/icici/i, "ICICI Bank"], [/axis/i, "Axis Bank"], [/kotak|kotakb/i, "Kotak"],
  [/\bpnb|punjab national/i, "PNB"], [/\bbob|baroda/i, "Bank of Baroda"], [/canara|cnrb/i, "Canara Bank"], [/union bank|unionb/i, "Union Bank"],
  [/idfc/i, "IDFC FIRST"], [/yes ?bank|yesbnk/i, "Yes Bank"], [/indusind|indusb/i, "IndusInd"], [/\bau bank|aubank/i, "AU Bank"], [/rbl/i, "RBL Bank"],
  [/federal|fedbnk/i, "Federal Bank"], [/onecard/i, "OneCard"], [/amex|american express/i, "Amex"], [/bajaj/i, "Bajaj Finance"],
];
export function bankName(from: string, text = ""): string {
  for (const [re, name] of BANKS) if (re.test(from)) return name;
  for (const [re, name] of BANKS) if (re.test(text)) return name;
  return from.replace(/^[A-Z]{2}-/, "").replace(/-[A-Z]$/, "") || "Bank";
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "02-Dec-26", "02/12/2026", "2 Dec 2026" → ISO date (noon), or undefined. */
export function parseDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{1,2})[-/ .]?([A-Za-z]{3,9}|\d{1,2})[-/ .,]*(\d{2,4})$/);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = /\d/.test(m[2]) ? Number(m[2]) - 1 : MON.indexOf(m[2].slice(0, 3).toLowerCase());
  let y = Number(m[3]); if (y < 100) y += 2000;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return undefined;
  return new Date(y, mo, d, 12).toISOString();
}
