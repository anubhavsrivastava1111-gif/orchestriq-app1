// Lifeline — reminders that work on any Android phone today, without a server:
// recurring calendar events (Google Calendar / Samsung Calendar ring like alarms).
import type { Account, Loan, Settings } from "./types";
import { inrRaw as inr } from "./engine";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date, h = 9, m = 0) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
const esc = (s: string) => s.replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");

/** Monthly RRULE that lands on `day`, or the last day of the month when the month is shorter. */
export function monthlyRule(day: number): string {
  if (day >= 1 && day <= 28) return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`;
  if (day > 28) return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1`;
  return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day - 1}`; // 0 → last day (-1), -1 → second-last (-2)
}

/** First occurrence on/after today for a monthly rule on `day` (handles negative/overflow days). */
function firstOccurrence(day: number): Date {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  for (let k = 0; k < 3; k++) {
    const y = t.getFullYear(), m = t.getMonth() + k;
    const dim = new Date(y, m + 1, 0).getDate();
    const d = day >= 1 ? Math.min(day, dim) : dim + day; // day 0 → last day, -1 → second-last
    const c = new Date(y, m, d);
    if (c >= t) return c;
  }
  return t;
}

/** RFC 5545 line folding (≤75 octets); splits on code points so emoji/₹ stay intact. */
function fold(line: string): string {
  const cps = Array.from(line);
  if (new TextEncoder().encode(line).length <= 75) return line;
  const parts: string[] = []; let cur = "";
  for (const c of cps) {
    if (new TextEncoder().encode(cur + c).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; }
    cur += c;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

interface Ev { uid: string; title: string; details: string; day: number; hour: number }

function eventsFor(loan: Loan, account: Account | undefined, s: Settings): Ev[] {
  const acct = account?.name || "your bank account";
  const fundDay = loan.dueDay - s.bufferDays;
  return [
    {
      uid: `fund-${loan.id}`, hour: 9, day: fundDay,
      title: `💰 Fund ${acct}: ${inr(loan.emi)} for ${loan.name}`,
      details: `${loan.name} (${loan.lender}) EMI of ${inr(loan.emi)} auto-debits from ${acct} on day ${loan.dueDay}. Check the balance today and top up if needed. — Lifeline`,
    },
    {
      uid: `due-${loan.id}`, hour: 8, day: loan.dueDay,
      title: `🔔 EMI today: ${loan.name} ${inr(loan.emi)}`,
      details: `Auto-debit from ${acct}. After it goes through, open Lifeline and mark it paid. — Lifeline`,
    },
  ];
}

export function buildIcs(loans: Loan[], accounts: Account[], s: Settings): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lifeline//EMI Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:EMI reminders (Lifeline)"];
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const loan of loans) {
    for (const ev of eventsFor(loan, accounts.find(a => a.id === loan.accountId), s)) {
      const start = firstOccurrence(ev.day);
      lines.push(
        "BEGIN:VEVENT", `UID:${ev.uid}@lifeline`, `DTSTAMP:${now}`,
        `DTSTART:${stamp(start, ev.hour)}`, `DTEND:${stamp(start, ev.hour, 30)}`,
        monthlyRule(ev.day), `SUMMARY:${esc(ev.title)}`, `DESCRIPTION:${esc(ev.details)}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", `DESCRIPTION:${esc(ev.title)}`, "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** One-tap "add to Google Calendar" link for a single loan's fund-by reminder. */
export function googleCalendarLink(loan: Loan, account: Account | undefined, s: Settings, which: "fund" | "due"): string {
  const ev = eventsFor(loan, account, s)[which === "fund" ? 0 : 1];
  const start = firstOccurrence(ev.day);
  const q = new URLSearchParams({
    action: "TEMPLATE", text: ev.title, details: ev.details,
    dates: `${stamp(start, ev.hour)}/${stamp(start, ev.hour, 30)}`,
    recur: monthlyRule(ev.day),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
