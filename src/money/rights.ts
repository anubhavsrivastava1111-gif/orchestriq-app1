// Lifeline — borrower rights under RBI rules, in plain language, with what to do about each.
// A summary for guidance; the user can check the current text at rbi.org.in.
import type { LetterKind } from "./letters";

export interface Right { id: string; title: string; rule: string; use: string; letter?: LetterKind; source: string }

export const RIGHTS: Right[] = [
  { id: "billing-cycle", title: "Change your card's billing cycle", source: "RBI Credit & Debit Card Directions, 2022",
    rule: "You can ask the card issuer to change the billing cycle (statement date) at least once.",
    use: "Move the due date to a few days after salary, so card and loan payments don't clash.", letter: "card-billing-cycle" },
  { id: "three-days", title: "3-day grace before “late”", source: "RBI Credit & Debit Card Directions, 2022",
    rule: "A card is reported “past due” to credit bureaus, and late fees are charged, only when payment is more than 3 days past the due date.",
    use: "If salary is a day late, paying within 3 days of the due date protects your credit report. Don't rely on it every month." },
  { id: "no-capitalise", title: "No interest on unpaid fees and taxes", source: "RBI Credit & Debit Card Directions, 2022",
    rule: "Unpaid charges, levies and taxes must not be added to the balance for charging interest.",
    use: "Check statements: interest should be on purchases or cash only. Dispute it if you see interest on fees or GST.", letter: "fee-waiver" },
  { id: "min-due", title: "Minimum due can't trap you", source: "RBI Credit & Debit Card Directions, 2022",
    rule: "The minimum due must be set so the balance doesn't grow when only the minimum is paid (no negative amortisation).",
    use: "Even so, paying only the minimum is very costly. Ask to convert the balance to EMI at a lower rate.", letter: "card-to-emi" },
  { id: "close-card", title: "Close a card within 7 working days", source: "RBI Credit & Debit Card Directions, 2022",
    rule: "Once dues are cleared, the issuer must close the card within 7 working days of your request, or pay ₹500 for each day of delay.",
    use: "Close cards you don't need after clearing them, so you can't fall back into revolving debt." },
  { id: "penal", title: "Penal charges, not penal interest", source: "RBI Fair Lending Practice: Penal Charges in Loan Accounts (2023)",
    rule: "Lenders may levy only reasonable penal charges for defaults, not extra penal interest, and penal charges can't be compounded.",
    use: "If your loan statement shows extra interest for a delay, ask the lender to reverse it.", letter: "fee-waiver" },
  { id: "reset", title: "Choices when a floating rate rises", source: "RBI Reset of Floating Interest Rate on EMI-based Loans (2023)",
    rule: "When the rate changes, lenders must give you options: switch to a fixed rate, increase the EMI, increase the tenure, or prepay.",
    use: "If your EMI is too high, ask for a longer tenure (lower EMI) instead of a higher EMI.", letter: "rate-reset" },
  { id: "prepay", title: "No prepayment penalty on floating-rate loans", source: "RBI directions on foreclosure charges",
    rule: "Banks and NBFCs can't charge foreclosure or prepayment penalties on floating-rate term loans to individuals (non-business).",
    use: "Use bonuses or freed-up money to prepay these loans at no penalty." },
  { id: "recovery", title: "Respectful recovery only", source: "RBI guidelines on recovery agents",
    rule: "Recovery agents can't call before 8 am or after 7 pm, threaten you, or contact friends and family to shame you.",
    use: "Note dates, times and numbers; complain to the lender, then the RBI Ombudsman. Call 1930 for cyber harassment.", letter: "harassment" },
  { id: "credit-report", title: "Credit report errors fixed in 30 days", source: "RBI framework for credit information companies (2023)",
    rule: "Complaints about credit report errors must be resolved within 30 days, or you get ₹100 per day of delay as compensation.",
    use: "Check your CIBIL report every year and dispute mistakes, especially loans already closed." },
  { id: "ombudsman", title: "Free complaint to the RBI Ombudsman", source: "RBI Integrated Ombudsman Scheme, 2021",
    rule: "If the bank or NBFC doesn't resolve your complaint in 30 days (or rejects it), complain free at cms.rbi.org.in.",
    use: "Use it for wrong charges, harassment, or refusal to close a card or loan." },
  { id: "digital", title: "Digital loans must be transparent", source: "RBI Digital Lending Guidelines, 2022",
    rule: "You must get a Key Fact Statement with the all-in yearly rate (APR) before signing. Money must go to your own account, and you can exit in the cooling-off period without penalty.",
    use: "Avoid apps that don't show the APR or ask for contacts and gallery access. Report them on RBI Sachet." },
];
