// Lifeline — ready-to-send letters to lenders, filled with the user's own data.
import type { Loan, MoneyState } from "./types";
import { inrRaw } from "./engine";

export type LetterKind = "date-change" | "restructure" | "harassment" | "statement";

export const LETTERS: { id: LetterKind; title: string; when: string }[] = [
  { id: "date-change", title: "Change my EMI date", when: "Your EMI debits before your salary arrives." },
  { id: "restructure", title: "Request lower EMI / restructuring", when: "You can't keep paying the current EMI. Send this before you miss a payment." },
  { id: "statement", title: "Ask for loan statement & foreclosure amount", when: "You want to refinance, prepay or check charges." },
  { id: "harassment", title: "Complain about recovery agents", when: "Agents threaten you, call at odd hours, or contact family and friends." },
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
    case "harassment":
      return {
        subject: `Complaint against recovery agent conduct — ${loan.name}`,
        body: `${to}Subject: Complaint regarding conduct of recovery agents\n${ref}\n\nDear Sir/Madam,\n\nI wish to report the following conduct by persons claiming to collect dues on your behalf:\n${extra.reason ? extra.reason.trim() : "[Describe what happened: dates, times, phone numbers, what was said, who was contacted]"}\n\nRBI guidelines require lenders and their agents not to threaten or harass borrowers, not to call outside 8 am – 7 pm, and not to contact family members or friends to shame the borrower. I request you to stop this conduct immediately, share the name and authorisation of the agency, and confirm the action taken in writing.\n\nIf I do not receive a satisfactory response within 30 days, I will escalate to the RBI Integrated Ombudsman (cms.rbi.org.in).${sign}`,
      };
  }
}
