// Lifeline — help, rights and protection resources (India first, with a few global ones).

export interface Resource { title: string; what: string; url?: string; phone?: string }
export interface ResourceGroup { id: string; title: string; items: Resource[] }

export const RESOURCES: ResourceGroup[] = [
  {
    id: "lender", title: "Before you miss an EMI",
    items: [
      { title: "Call or email your lender first", what: "Ask for a tenure extension, an EMI-date change or restructuring — in writing. Lenders have far more options before a default than after it. Keep the reference number." },
      { title: "Know what a bounce costs", what: "A failed auto-debit usually triggers a bounce fee from your bank and a late/bounce fee from your lender (each typically a few hundred rupees plus GST), penal charges, and a late mark on your credit report." },
      { title: "Avoid 'settlement' unless there is no other way", what: "A settled loan is reported as 'settled', not 'closed', and lowers your credit score for years. Restructuring is usually better." },
    ],
  },
  {
    id: "credit", title: "Your credit report",
    items: [
      { title: "CIBIL — free report", what: "Check what lenders see. You are entitled to a free full report from each credit bureau every year.", url: "https://www.cibil.com" },
      { title: "Experian India", what: "Second credit bureau — errors can differ between bureaus.", url: "https://www.experian.in" },
      { title: "CRIF High Mark", what: "Third bureau; many microfinance and fintech lenders report here.", url: "https://www.crifhighmark.com" },
    ],
  },
  {
    id: "complaints", title: "Complaints & harassment",
    items: [
      { title: "RBI Complaint Management System (Ombudsman)", what: "Free complaint against a bank/NBFC if it doesn't resolve your issue within 30 days — wrong charges, harassment by recovery agents, mis-selling.", url: "https://cms.rbi.org.in" },
      { title: "RBI Sachet — report illegal lenders", what: "Report unregistered lenders and illegal loan apps.", url: "https://sachet.rbi.org.in" },
      { title: "Cyber crime helpline 1930", what: "Loan-app threats, morphed photos, contact-list harassment, UPI fraud. Call 1930 immediately or file online.", url: "https://cybercrime.gov.in", phone: "1930" },
    ],
  },
  {
    id: "wellbeing", title: "You are not alone",
    items: [
      { title: "Tele-MANAS (Govt. of India)", what: "Free, confidential 24×7 mental-health support in many Indian languages. Money stress is one of the most common reasons people call.", phone: "14416" },
    ],
  },
  {
    id: "global", title: "Outside India",
    items: [
      { title: "NFCC (USA)", what: "Non-profit credit counselling.", url: "https://www.nfcc.org" },
      { title: "StepChange (UK)", what: "Free debt advice charity.", url: "https://www.stepchange.org" },
    ],
  },
];

export const RED_FLAGS: string[] = [
  "Never take an instant-loan-app loan to pay an EMI. Short tenures and hidden fees make it the fastest route into a debt trap.",
  "Before borrowing, confirm the lender is an RBI-registered bank/NBFC (or partners with one) — the app must name it.",
  "Never share OTPs, UPI PINs or screen-sharing access — no genuine lender, bank or employer asks for them.",
  "'Work from home' or 'task' offers that ask you to pay first are scams. Real work pays you; you don't pay it.",
  "Recovery agents may not call at odd hours, threaten you or contact your friends and family. Report it.",
];
