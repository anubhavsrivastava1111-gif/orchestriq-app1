# Lifeline — EMI & Money Rescue

Live at **`/money/`** on the OrchestrIQ site (e.g. `https://orchestriq.gorakhai.com/money/`).
It's a separate app that installs on Android as **"Lifeline"**, works offline, and keeps all data on the phone.

---

## 1. Problem breakdown

People under financial stress rarely fail because of one big problem. Usually five small ones add up:

| # | Root cause | What happens | What Lifeline does |
|---|---|---|---|
| 1 | **Memory**: 3–6 EMIs on different dates | Forgets one, so the account isn't funded | Calendar alerts ("fund account", "EMI today") for every EMI |
| 2 | **Wrong account**: EMIs debit from 2–3 accounts | Money sits in account A while the EMI pulls from B | Per-account check: *add ₹X to account Y by date Z* |
| 3 | **Timing**: salary lands after some EMI dates | A bounce even though the monthly total is affordable | Projects salary credits against debits, day by day. Recommends moving every EMI date to just after payday |
| 4 | **Structure**: EMIs over 50% of income, or a deficit | Bounces will keep happening | FOIR (EMI ÷ income), deficit and stress score, refinancing and lender-negotiation steps |
| 5 | **Income ceiling** | Cutting costs alone can't close the gap | Earning options ranked by speed, skills and hours, with a reality check on each |

## 2. What's built (MVP, in this repo)

| Tab | Features |
|---|---|
| **Today** | Per-account funding gap and "top up by" date (counts expected salary). EMIs for the next 3 weeks with status: fund now / debits today / did it go through? / paid. Top 3 actions. Stress score with reasons |
| **EMIs** | Accounts (balance and minimum balance) and loans (EMI, due day, debit account, amount owed, rate). Reminders: a one-tap `.ics` download of all EMIs, or one Google Calendar link per EMI. In-app alerts when the app opens |
| **Money flow** | Income sources against spending, essential and non-essential, EMI share of income, and the monthly surplus or gap |
| **Save** | Rule-based action plan, each with an estimated ₹/month impact: bounce prevention, aligning EMI dates, merging debit accounts, refinancing high-interest debt, trimming non-essentials, a subscription audit, an emergency buffer, prepayment. A debt-free planner compares "EMIs only", highest-interest-first (avalanche) and smallest-loan-first (snowball) |
| **Earn** | 21 curated options in 10 categories (quick cash, teaching, freelancing, AI training work, gig, local, selling, content, free skilling, jobs and government schemes), with links. Ranked by skills, hours per week and urgency. Shows the ₹/hour needed to close your gap. Every option has a reality check, for example that YouTube needs 1,000 subscribers plus 4,000 watch hours before it pays |
| **Help** | Red flags (loan apps, OTP and task scams, recovery-agent rules). Lender-first steps. Free credit reports (CIBIL, Experian, CRIF). RBI ombudsman (CMS), RBI Sachet, cyber helpline 1930, Tele-MANAS 14416. Settings. Backup, restore and delete |

Code: `src/money/` — `engine.ts` (all calculations, pure functions), `opportunities.ts` (directory and ranking), `resources.ts`, `calendar.ts` (ICS and Google Calendar), `MoneyApp.tsx` (UI). Entry point: `money/index.html`. PWA files: `public/money/`.

**Design choices and why:**
- **Calendar reminders, not push notifications.** A web app can't reliably schedule notifications on Android when it's closed. Calendar events ring every time, with no server and no cost. Native notifications come in Phase 2.
- **Data stays on the phone.** No login, no bank credentials and no SMS access. This builds trust with a stressed and often scam-wary user, and keeps compliance under the DPDP Act 2023 trivial at this stage.
- **No AI calls.** The rules are deterministic and explainable, and cost nothing per user.

## 3. Risks and blind spots (read before scaling)

1. **Manual entry is the biggest adoption risk.** Users must keep balances current or the funding check goes stale. The fix is auto-sync (Phase 3). Until then the app nudges for updates and shows each balance's "last updated" date.
2. **SMS reading is mostly closed to you.** Google Play restricts `READ_SMS` to default SMS apps and a few exceptions. Money-manager apps usually get rejected. Don't plan the roadmap around SMS parsing. Use the **Account Aggregator** framework (RBI-regulated, consent-based) instead.
3. **Lending referrals are a conflict of interest.** The obvious revenue model, earning commission for referring stressed users to loans, harms the user and creates regulatory exposure under RBI digital-lending rules. Avoid it. Keep "Lifeline earns nothing from these links" true, or disclose clearly.
4. **This is guidance, not advice.** Stay generic, as the app does now. Personalised investment advice needs SEBI RIA registration.
5. **Earn listings go stale.** Platforms change terms and pay. Review the list quarterly; the data is in one file.
6. **Mental health.** Debt stress is a known suicide risk factor. Tele-MANAS is surfaced, so keep it one tap away.

## 4. Roadmap

| Phase | Scope | Effort | Unlocks |
|---|---|---|---|
| **1 (done)** | Installable web app at `/money/` | — | Validate with 20–50 real users |
| **2: Play Store app** | Wrap as a Trusted Web Activity (no code rewrite), then Capacitor with Local Notifications for native alarms | 1–2 weeks | Play Store discovery, reliable alerts |
| **3: Auto data** | Account Aggregator through a licensed partner (Setu, Finvu, OneMoney, Anumati) to get balances and transactions automatically. Needs a backend, consent screens and a DPDP privacy notice | 6–10 weeks + partner fees | Funding checks need no manual input; auto-categorised spending |
| **4: Opportunity marketplace** | A verified local-gig and tutoring board on the OrchestrIQ site: employers post, users apply. Partner with NGOs, colleges and skilling centres | 2–3 months | The "earn" side becomes a two-sided network effect |
| **5: Assisted negotiation** | Draft letters to lenders (restructuring, EMI-date change, harassment complaints), optionally AI-assisted using OrchestrIQ's existing AI stack | 2–4 weeks | High-value help users can't get elsewhere |

**Monetization (ethical order):** (1) free core app. (2) Employer and HR wellness programmes: companies pay so employees stop taking salary advances. (3) Paid "Lifeline Plus": auto-sync, lender letters, 1:1 counsellor sessions. (4) Sponsored *skilling* listings, clearly labelled. Never sell loans to the user.

## 5. Execution steps for you (non-technical)

**A. Put it live (5 min).** Merge this branch into the branch Cloudflare Pages deploys from. Once the deploy finishes, open `https://orchestriq.gorakhai.com/money/` on your phone.

**B. Install on Android.** In Chrome, open the link → ⋮ menu → **Add to Home screen / Install app** → Install. "Lifeline" appears as its own app icon.

**C. Set it up (10 min).**
1. EMIs tab → **+ Add** each bank account with today's balance.
2. **+ Add** each EMI: amount, due day, and which account it debits from. Find these in your loan app or bank SMS.
3. Money flow tab → add salary (set **day it arrives** and **credited to**, so the funding check counts it) and your main spends.
4. EMIs tab → **Download all reminders (.ics)** → open the file → Google Calendar → Save.

**D. Monthly routine (2 min).** When salary arrives, open Today and do what each red card says. After each EMI debits, tap **Mark paid**.

**E. Publish to Google Play (when ready).**
1. Create a Google Play Console developer account (one-time US$25).
2. Go to https://www.pwabuilder.com and enter `https://orchestriq.gorakhai.com/money/` → **Package for stores** → **Android**. Download the package.
3. Upload `assetlinks.json` from the package to `public/.well-known/assetlinks.json` in this repo and deploy. This removes the browser bar from the app.
4. In Play Console: Create app → upload the `.aab` file → complete Data safety (answer "no data collected": it all stays on the device) → finance-app declaration → submit for review.
5. Before going public, write a privacy policy page. Play requires one for finance apps.

## 6. Next best step

Run the app with **10 people you know who have 3+ EMIs** for one month. Track: (a) did anyone have a bounce, (b) how many kept balances updated weekly, (c) which Earn option each person tried. If (b) is under 50%, prioritise Phase 3 (auto-sync) over everything else.
