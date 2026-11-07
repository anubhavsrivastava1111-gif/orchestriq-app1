// Lifeline — ready-to-send letters to lenders, filled with the user's own data.
import type { Loan, MoneyState } from "./types";
import { inrRaw } from "./engine";

export type LetterKind = "date-change" | "restructure" | "harassment" | "statement" | "card-billing-cycle" | "card-to-emi" | "fee-waiver" | "rate-reset";

export const LETTERS: { id: LetterKind; title: string; when: string }[] = [
  { id: "date-change", title: "Change my EMI date", when: "Your EMI debits before your salary arrives." },
  { id: "restructure", title: "Request lower EMI / restructuring", when: "You can't keep paying the current EMI. Send this before you miss a payment." },
  { id: "statement", title: "Ask for loan statement & foreclosure amount", when: "You want to refinance, prepay or check charges." },
  { id: "harassment", title: "Complain about recovery agents", when: "Agents threaten you, call at odd hours, or contact family and friends." },
  { id: "card-billing-cycle", title: "Change my card's billing cycle", when: "Card due date clashes with salary or other EMIs." },
  { id: "card-to-emi", title: "Convert card balance to EMI (lower rate)", when: "You're paying only the minimum or rotating money each month." },
  { id: "fee-waiver", title: "Request a late-fee / penal-charge reversal", when: "A one-off delay, or charges that look wrong." },
  { id: "rate-reset", title: "Lower EMI after a rate increase", when: "Your floating-rate EMI went up and it no longer fits." },
];

export function buildLetter(kind: LetterKind, loan: Loan, state: MoneyState, extra: { newDay?: number; reason?: string }): { subject: string; body: string } {
  const name = state.settings.name || "[Your full name]";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const ref = `Loan: ${loan.name} — Loan account no. [enter your loan account number]`;
  const salaryDay = state.incomes.find(i => i.kind === "salary" && i.day)?.day;
  const sign = `\n\nRegards,\n${name}\nRegistered mobile: [your number]\nDate: ${today}`;
  const to = `To,\nThe Grievance Redressal Officer / Customer Service\n${loan.lender || "[Lender name]"}\n\n`;

  switch (kind) {
    case "date-change": {
      const day = extra.newDay || Math.min(28, (salaryDay || 1) + 3);
      return {
        subject: `Request to change EMI due date — ${loan.name}`,
        body: `${to}Subject: Request to change EMI due date\n${ref}\n\nDear Sir/Madam,\n\nMy current EMI of ${inrRaw(loan.emi)} is debited on day ${loan.dueDay} of each month. ${salaryDay ? `My salary is credited on day ${salaryDay}, so` : "Because of the timing of my income,"} the current date puts me at risk of an unintended bounce despite my intention to pay on time.\n\nI request you to change my EMI due date to day ${day} of every month, starting from the next possible cycle, and update the NACH/e-mandate accordingly. Kindly let me know any broken-period interest or charges in advance.\n\nI have always intended to repay on time and this change will help me do so.${sign}`,
      };
    }
    case "restructure":
      return {
        subject: `Request for EMI reduction / restructuring — ${loan.name}`,
        body: `${to}Subject: Request for tenure extension / restructuring due to financial hardship\n${ref}\n\nDear Sir/Madam,\n\nI am writing before missing any payment, to inform you that my monthly obligations have become difficult to meet${extra.reason ? ` because ${extra.reason.trim().replace(/\.$/, "")}` : ""}. My current EMI is ${inrRaw(loan.emi)} with an outstanding of about ${inrRaw(loan.outstanding)}.\n\nI wish to continue repaying in full and request you to consider:\n1. Extending the tenure to reduce the EMI, or\n2. A restructuring plan suited to my current income.\n\nPlease share the options available, revised EMI, any charges, and the impact on my credit report, in writing. I am available to discuss at your convenience.${sign}`,
      };
    case "statement":
      return {
        subject: `Request for loan statement and foreclosure letter — ${loan.name}`,
        body: `${to}Subject: Request for statement of account and foreclosure amount\n${ref}\n\nDear Sir/Madam,\n\nPlease provide:\n1. My complete statement of account to date, including all interest, penal and other charges levied;\n2. The current foreclosure / prepayment amount with a breakup and validity date;\n3. The applicable rate of interest and whether it is fixed or floating.\n\nKindly send these to my registered email.${sign}`,
      };
    case "card-billing-cycle": {
      const day = extra.newDay || Math.max(1, Math.min(28, (salaryDay || 1) + 3));
      return {
        subject: `Request to change billing cycle — ${loan.name}`,
        body: `${to}Subject: Request to change the billing cycle of my credit card\nCard: ${loan.name} — Card ending [last 4 digits]\n\nDear Sir/Madam,\n\nMy payment due date currently falls ${salaryDay ? `before my salary credit on day ${salaryDay}` : "at a time that doesn't match my income"}, which makes it hard to pay on time.\n\nAs permitted under the RBI Credit Card and Debit Card – Issuance and Conduct Directions, 2022, I request you to change my billing cycle so that the payment due date falls on or after day ${day} of each month.\n\nPlease confirm the new statement date and due date in writing.${sign}`,
      };
    }
    case "card-to-emi":
      return {
        subject: `Request to convert outstanding to EMI at a lower rate — ${loan.name}`,
        body: `${to}Subject: Request to convert my credit card outstanding into EMIs\nCard: ${loan.name} — Card ending [last 4 digits]\n\nDear Sir/Madam,\n\nMy current outstanding is about ${inrRaw(loan.outstanding)}. To repay it in a disciplined way, I request you to convert the outstanding balance into EMIs over 12–24 months at the lowest rate available to me.\n\nPlease share the interest rate, processing fee, EMI amount, total cost (including GST) and any foreclosure charges in a Key Fact Statement before I confirm.\n\nI also request that the converted amount not be charged revolving interest from the date of conversion.${sign}`,
      };
    case "fee-waiver":
      return {
        subject: `Request for reversal of late fee / penal charges — ${loan.name}`,
        body: `${to}Subject: Request for reversal of late payment / penal charges\n${ref}\n\nDear Sir/Madam,\n\nI have been a regular payer. A one-time delay in [month] led to late payment and related charges${extra.reason ? ` (${extra.reason.trim()})` : ""}. I have since paid / will pay the dues in full.\n\nI request a one-time goodwill reversal of these charges and the related GST. I also request you to confirm that no interest has been charged on unpaid fees, charges or taxes, as required by RBI directions, and that penal charges (not penal interest) have been applied as per RBI's Fair Lending Practice guidelines.${sign}`,
      };
    case "rate-reset":
      return {
        subject: `Request to extend tenure instead of increasing EMI — ${loan.name}`,
        body: `${to}Subject: Request for reset options on my floating-rate loan\n${ref}\n\nDear Sir/Madam,\n\nMy current EMI is ${inrRaw(loan.emi)} with about ${inrRaw(loan.outstanding)} outstanding. Following the change in interest rate, the EMI no longer fits my monthly income.\n\nAs per RBI's guidelines on reset of floating interest rates for EMI-based loans, please share my options: (1) extending the tenure to reduce the EMI, (2) switching to a fixed rate, and (3) part-prepayment without penalty. My preference is to extend the tenure so the EMI falls to an affordable level.\n\nKindly share a revised repayment schedule and Key Fact Statement in writing.${sign}`,
      };
    case "harassment":
      return {
        subject: `Complaint against recovery agent conduct — ${loan.name}`,
        body: `${to}Subject: Complaint regarding conduct of recovery agents\n${ref}\n\nDear Sir/Madam,\n\nI wish to report the following conduct by persons claiming to collect dues on your behalf:\n${extra.reason ? extra.reason.trim() : "[Describe what happened: dates, times, phone numbers, what was said, who was contacted]"}\n\nRBI guidelines require lenders and their agents not to threaten or harass borrowers, not to call outside 8 am – 7 pm, and not to contact family members or friends to shame the borrower. I request you to stop this conduct immediately, share the name and authorisation of the agency, and confirm the action taken in writing.\n\nIf I do not receive a satisfactory response within 30 days, I will escalate to the RBI Integrated Ombudsman (cms.rbi.org.in).${sign}`,
      };
  }
}
