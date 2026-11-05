// Lifeline — data-entry sheets. Every form: one screen, big tap targets, smart defaults,
// optional details folded away, and a Save button that is always visible.
import { useMemo, useState } from "react";
import type { Account, Expense, ExpenseCategory, Freq, Holding, HoldingKind, Income, IncomeKind, Loan, LoanType } from "./types";
import { EXPENSE_ICON, ago } from "./labels";
import { ESSENTIAL_DEFAULT, EXPENSE_LABEL, HOLDING_LABEL, INCOME_LABEL, LOAN_TYPE_LABEL } from "./types";
import { useApp, type SheetState } from "./context";
import { uid, parsePlainBackup } from "./store";
import { inr, inrRaw } from "./engine";
import { buildIcs, googleCalendarLink } from "./calendar";
import { buildLetter, LETTERS, type LetterKind } from "./letters";
import { SKILL_TAGS } from "./opportunities";
import { Button, ChoiceCards, ChoiceChips, DayPicker, Disclosure, Field, MoneyInput, NumberInput, Segmented, Sheet, Slider, TextInput, Toggle, Row, List } from "./components";
import { Icon } from "./icons";
import { isNative, notificationsEnabled, requestNotifications, saveTextFile, shareText, copyText } from "./native";
import * as vault from "./vault";
import { searchFunds, fundNav, type MfScheme } from "./market";
import { FREE_FEATURES, PRICES, PRO_FEATURES } from "./entitlements";

// ─── Shared option lists ────────────────────────────────────────────────────
const LOAN_SHORT: Record<LoanType, string> = {
  personal: "Personal", home: "Home", car: "Car", "two-wheeler": "Bike / scooter", "credit-card": "Credit card",
  "consumer-durable": "Phone / gadget", bnpl: "Loan app / BNPL", education: "Education", gold: "Gold", business: "Business", other: "Other",
};
const TYPICAL_RATE: Record<LoanType, number> = {
  home: 8.5, personal: 14, car: 9.5, "two-wheeler": 12, education: 10, gold: 10, "credit-card": 42,
  bnpl: 30, "consumer-durable": 16, business: 16, other: 14,
};
const BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "Bank of Baroda", "Canara", "Union Bank", "IDFC FIRST", "Yes Bank", "Other"];
const FREQ_OPTS: { value: Freq; label: string }[] = [
  { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }, { value: "yearly", label: "Yearly" }, { value: "one-off", label: "One-off" },
];
const num = (v: string) => (v === "" ? NaN : Number(v));
const str = (n: number | undefined) => (n === undefined || n === null || Number.isNaN(n) ? "" : String(n));

export function SheetHost({ sheet }: { sheet: SheetState }) {
  switch (sheet.kind) {
    case "quick-add": return <QuickAddSheet />;
    case "account": return <AccountSheet item={sheet.item} />;
    case "loan": return <LoanSheet item={sheet.item} />;
    case "income": return <IncomeSheet item={sheet.item} />;
    case "expense": return <ExpenseSheet item={sheet.item} />;
    case "quick-spends": return <QuickSpendsSheet />;
    case "balances": return <BalancesSheet />;
    case "reminders": return <RemindersSheet />;
    case "letter": return <LetterSheet initial={sheet.letter} loanId={sheet.loanId} />;
    case "earn-profile": return <EarnProfileSheet />;
    case "passcode": return <PasscodeSheet />;
    case "backup": return <BackupSheet />;
    case "restore": return <RestoreSheet text={sheet.text} />;
    case "holding": return <HoldingSheet item={sheet.item} />;
    case "paywall": return <PaywallSheet />;
    case "bounced": return <BouncedSheet loanId={sheet.loanId} />;
  }
}

function SaveBar({ onSave, onDelete, label = "Save", disabled }: { onSave: () => void; onDelete?: () => void; label?: string; disabled?: boolean }) {
  return (
    <div className="savebar">
      {onDelete && <Button variant="danger" icon="trash" onClick={onDelete} aria-label="Delete" />}
      <Button variant="primary" full onClick={onSave} disabled={disabled}>{label}</Button>
    </div>
  );
}

// ─── Quick add ──────────────────────────────────────────────────────────────
function QuickAddSheet() {
  const { open, state, close } = useApp();
  const tiles: { icon: string; title: string; sub: string; go: SheetState; disabled?: boolean }[] = [
    { icon: "refresh", title: "Update balances", sub: "Takes 20 seconds", go: { kind: "balances" }, disabled: !state.accounts.length },
    { icon: "card", title: "Add EMI / loan", sub: "Amount, date, account", go: { kind: "loan" } },
    { icon: "bank", title: "Add bank account", sub: "Where EMIs debit", go: { kind: "account" } },
    { icon: "income", title: "Add income", sub: "Salary, side income", go: { kind: "income" } },
    { icon: "spend", title: "Add a spend", sub: "Rent, bills, food…", go: { kind: "expense" } },
    { icon: "doc", title: "Letter to lender", sub: "Ready to send", go: { kind: "letter" }, disabled: !state.loans.length },
  ];
  return (
    <Sheet title="What would you like to add?" onClose={close}>
      <div className="tiles">
        {tiles.map(t => (
          <button key={t.title} type="button" className="tile" disabled={t.disabled} onClick={() => open(t.go)}>
            <span className="tile-icon"><Icon name={t.icon} size={22} /></span>
            <b>{t.title}</b><small>{t.sub}</small>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ─── Account ────────────────────────────────────────────────────────────────
function AccountSheet({ item }: { item?: Account }) {
  const { update, close, toast } = useApp();
  const [name, setName] = useState(item?.name ?? "");
  const [bal, setBal] = useState(str(item?.balance));
  const [minBal, setMinBal] = useState(str(item?.minBalance ?? 0));
  const [err, setErr] = useState<Record<string, string>>({});
  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give this account a name, e.g. “SBI salary”.";
    if (Number.isNaN(num(bal))) e.bal = "Enter the current balance (0 is fine).";
    setErr(e); if (Object.keys(e).length) return;
    const rec: Account = { id: item?.id ?? uid(), name: name.trim(), balance: num(bal), minBalance: num(minBal) || 0, updatedAt: new Date().toISOString() };
    update(s => ({ ...s, accounts: item ? s.accounts.map(a => (a.id === item.id ? rec : a)) : [...s.accounts, rec] }));
    toast(item ? "Account updated" : "Account added"); close();
  };
  const del = item ? () => {
    if (!confirm(`Delete “${item.name}”? EMIs linked to it will need a new account.`)) return;
    update(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== item.id) })); toast("Account deleted"); close();
  } : undefined;
  return (
    <Sheet title={item ? "Edit account" : "Add bank account"} subtitle="The account your EMIs are debited from" onClose={close} footer={<SaveBar onSave={save} onDelete={del} />}>
      {!item && (
        <Field label="Bank">{() => (
          <ChoiceChips value={BANKS.find(b => name.startsWith(b)) ?? ""} options={BANKS.map(b => ({ value: b, label: b }))}
            onChange={b => setName(b === "Other" ? "" : `${b} account`)} />
        )}</Field>
      )}
      <Field label="Account name" error={err.name} hint="Use a name you'll recognise, e.g. “HDFC salary”.">{id => <TextInput id={id} value={name} onChange={setName} placeholder="e.g. SBI salary account" autoFocus={!!item} />}</Field>
      <Field label="Balance right now" error={err.bal} hint="Check your bank app or last SMS.">{id => <MoneyInput id={id} value={bal} onChange={setBal} large />}</Field>
      <Field label="Minimum balance the bank requires" hint="We keep this aside so you don't pay a penalty.">{id => (
        <>
          <MoneyInput id={id} value={minBal} onChange={setMinBal} />
          <ChoiceChips value={minBal} options={["0", "1000", "2000", "5000", "10000"].map(v => ({ value: v, label: v === "0" ? "None" : inrRaw(Number(v)) }))} onChange={setMinBal} />
        </>
      )}</Field>
    </Sheet>
  );
}

// ─── Loan / EMI ─────────────────────────────────────────────────────────────
function LoanSheet({ item }: { item?: Loan }) {
  const { state, update, close, toast } = useApp();
  const [type, setType] = useState<LoanType>(item?.type ?? "personal");
  const [name, setName] = useState(item?.name ?? LOAN_TYPE_LABEL.personal);
  const [emi, setEmi] = useState(str(item?.emi));
  const [day, setDay] = useState<number | null>(item?.dueDay ?? null);
  const [acct, setAcct] = useState(item?.accountId ?? state.accounts[0]?.id ?? "new");
  const [newAcct, setNewAcct] = useState("");
  const [newBal, setNewBal] = useState("");
  const [lender, setLender] = useState(item?.lender ?? "");
  const [out, setOut] = useState(str(item?.outstanding));
  const [rate, setRate] = useState(str(item?.ratePct ?? TYPICAL_RATE.personal));
  const [rateTouched, setRateTouched] = useState(!!item);
  const [err, setErr] = useState<Record<string, string>>({});

  const pickType = (t: LoanType) => {
    setType(t);
    if (!name || Object.values(LOAN_TYPE_LABEL).includes(name)) setName(LOAN_TYPE_LABEL[t]);
    if (!rateTouched) setRate(String(TYPICAL_RATE[t]));
  };
  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name this loan, e.g. “Bike loan”.";
    if (!(num(emi) > 0)) e.emi = "Enter the monthly EMI amount.";
    if (!day) e.day = "Tap the day of the month the EMI is debited.";
    if (acct === "new" && !newAcct.trim()) e.acct = "Name the account this EMI is debited from.";
    setErr(e); if (Object.keys(e).length) return;
    let accountId = acct;
    const extraAcct: Account[] = [];
    if (acct === "new") {
      accountId = uid();
      extraAcct.push({ id: accountId, name: newAcct.trim(), balance: num(newBal) || 0, minBalance: 0, updatedAt: new Date().toISOString() });
    }
    const rec: Loan = {
      id: item?.id ?? uid(), name: name.trim(), lender: lender.trim(), type, emi: num(emi), dueDay: day!,
      accountId, outstanding: num(out) || 0, ratePct: Number.isNaN(num(rate)) ? TYPICAL_RATE[type] : num(rate), paidMonths: item?.paidMonths ?? [],
    };
    update(s => ({ ...s, accounts: [...s.accounts, ...extraAcct], loans: item ? s.loans.map(l => (l.id === item.id ? rec : l)) : [...s.loans, rec] }));
    toast(item ? "EMI updated" : `${rec.name} added — reminders will include it`); close();
  };
  const del = item ? () => {
    if (!confirm(`Delete “${item.name}”? Do this only if the loan is closed.`)) return;
    update(s => ({ ...s, loans: s.loans.filter(l => l.id !== item.id) })); toast("EMI deleted"); close();
  } : undefined;

  return (
    <Sheet title={item ? "Edit EMI" : "Add EMI"} subtitle="Only 3 things are required: amount, date, account" onClose={close} footer={<SaveBar onSave={save} onDelete={del} label={item ? "Save changes" : "Add EMI"} />}>
      <Field label="Type of loan">{() => (
        <ChoiceChips value={type} options={(Object.keys(LOAN_SHORT) as LoanType[]).map(t => ({ value: t, label: LOAN_SHORT[t] }))} onChange={pickType} />
      )}</Field>
      <Field label="Name" error={err.name}>{id => <TextInput id={id} value={name} onChange={setName} placeholder="e.g. Bike loan" />}</Field>
      <Field label={type === "credit-card" ? "Amount you pay each month" : "Monthly EMI"} error={err.emi}
        hint={type === "credit-card" ? "Paying only the minimum due keeps you in debt for years at ~42%." : "Exactly as in your loan app or SMS."}>
        {id => <MoneyInput id={id} value={emi} onChange={setEmi} large />}
      </Field>
      <Field label="Debited on day" error={err.day} hint={day ? `Every month on the ${ordinal(day)}${day > 28 ? " (or the last day in shorter months)" : ""}.` : undefined}>
        {() => <DayPicker value={day} onChange={d => setDay(d)} />}
      </Field>
      <Field label="Debited from" error={err.acct}>{() => (
        <>
          <ChoiceCards value={acct} onChange={setAcct} options={[
            ...state.accounts.map(a => ({ value: a.id, title: a.name, subtitle: `Balance ${inr(a.balance)}`, icon: "bank" })),
            { value: "new", title: "A new account", subtitle: "Add it here", icon: "plus" },
          ]} />
          {acct === "new" && (
            <div className="inline-group">
              <Field label="New account name">{id => <TextInput id={id} value={newAcct} onChange={setNewAcct} placeholder="e.g. HDFC savings" />}</Field>
              <Field label="Its balance now" optional>{id => <MoneyInput id={id} value={newBal} onChange={setNewBal} />}</Field>
            </div>
          )}
        </>
      )}</Field>
      <Disclosure summary={<span><b>More details</b> <small>· improves savings advice</small></span>}>
        <Field label="Lender" optional>{id => <TextInput id={id} value={lender} onChange={setLender} placeholder="e.g. Bajaj Finance" />}</Field>
        <Field label="Amount still owed" optional hint="From your loan statement or app.">{id => <MoneyInput id={id} value={out} onChange={setOut} />}</Field>
        <Field label="Interest rate" hint={rateTouched ? undefined : `Pre-filled with a typical rate for ${LOAN_SHORT[type].toLowerCase()} loans — change it if you know yours.`}>
          {id => <NumberInput id={id} value={rate} onChange={v => { setRate(v); setRateTouched(true); }} suffix="% a year" />}
        </Field>
      </Disclosure>
    </Sheet>
  );
}

function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ─── Income ─────────────────────────────────────────────────────────────────
function IncomeSheet({ item }: { item?: Income }) {
  const { state, update, close, toast } = useApp();
  const [kind, setKind] = useState<IncomeKind>(item?.kind ?? "salary");
  const [source, setSource] = useState(item?.source ?? "");
  const [amount, setAmount] = useState(str(item?.amount));
  const [freq, setFreq] = useState<Freq>(item?.freq ?? "monthly");
  const [day, setDay] = useState<number | null>(item?.day ?? null);
  const [acct, setAcct] = useState(item?.accountId ?? state.accounts[0]?.id ?? "");
  const [err, setErr] = useState<Record<string, string>>({});
  const save = () => {
    const e: Record<string, string> = {};
    if (!(num(amount) > 0)) e.amount = "Enter the amount you receive.";
    setErr(e); if (Object.keys(e).length) return;
    const rec: Income = { id: item?.id ?? uid(), kind, source: source.trim() || INCOME_LABEL[kind], amount: num(amount), freq, day: freq === "monthly" ? day ?? undefined : undefined, accountId: acct || undefined };
    update(s => ({ ...s, incomes: item ? s.incomes.map(x => (x.id === item.id ? rec : x)) : [...s.incomes, rec] }));
    toast(item ? "Income updated" : "Income added"); close();
  };
  const del = item ? () => { update(s => ({ ...s, incomes: s.incomes.filter(x => x.id !== item.id) })); toast("Income deleted"); close(); } : undefined;
  return (
    <Sheet title={item ? "Edit income" : "Add income"} subtitle="Where your money comes from" onClose={close} footer={<SaveBar onSave={save} onDelete={del} />}>
      <Field label="Type">{() => <ChoiceChips value={kind} options={(Object.keys(INCOME_LABEL) as IncomeKind[]).map(k => ({ value: k, label: INCOME_LABEL[k] }))} onChange={setKind} />}</Field>
      <Field label="Amount" error={err.amount}>{id => <MoneyInput id={id} value={amount} onChange={setAmount} large />}</Field>
      <Field label="How often">{() => <Segmented label="Frequency" value={freq} options={FREQ_OPTS} onChange={setFreq} />}</Field>
      {freq === "monthly" && (
        <Field label="Arrives on day" hint="Important: we count this money when checking if your EMIs are covered.">{() => <DayPicker value={day} onChange={setDay} allowNone />}</Field>
      )}
      {state.accounts.length > 0 && (
        <Field label="Credited to">{() => (
          <ChoiceCards value={acct} onChange={setAcct} options={[...state.accounts.map(a => ({ value: a.id, title: a.name, icon: "bank" })), { value: "", title: "Cash / other", icon: "wallet" }]} />
        )}</Field>
      )}
      <Field label="Description" optional>{id => <TextInput id={id} value={source} onChange={setSource} placeholder={`e.g. ${kind === "salary" ? "Salary — ABC Ltd" : "Weekend tuition"}`} />}</Field>
    </Sheet>
  );
}

// ─── Expense ────────────────────────────────────────────────────────────────
function ExpenseSheet({ item }: { item?: Expense }) {
  const { update, close, toast } = useApp();
  const [cat, setCat] = useState<ExpenseCategory>(item?.category ?? "groceries");
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(str(item?.amount));
  const [freq, setFreq] = useState<Freq>(item?.freq ?? "monthly");
  const [essential, setEssential] = useState(item?.essential ?? ESSENTIAL_DEFAULT.groceries);
  const [touched, setTouched] = useState(!!item);
  const [err, setErr] = useState("");
  const pick = (c: ExpenseCategory) => { setCat(c); if (!touched) setEssential(ESSENTIAL_DEFAULT[c]); };
  const save = () => {
    if (!(num(amount) > 0)) return setErr("Enter how much you spend.");
    const rec: Expense = { id: item?.id ?? uid(), category: cat, name: name.trim() || EXPENSE_LABEL[cat], amount: num(amount), freq, essential };
    update(s => ({ ...s, expenses: item ? s.expenses.map(x => (x.id === item.id ? rec : x)) : [...s.expenses, rec] }));
    toast(item ? "Spend updated" : "Spend added"); close();
  };
  const del = item ? () => { update(s => ({ ...s, expenses: s.expenses.filter(x => x.id !== item.id) })); toast("Spend deleted"); close(); } : undefined;
  return (
    <Sheet title={item ? "Edit spend" : "Add a regular spend"} subtitle="Rough numbers are fine" onClose={close} footer={<SaveBar onSave={save} onDelete={del} />}>
      <Field label="Category">{() => (
        <div className="cat-grid">
          {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map(c => (
            <button key={c} type="button" className={"cat" + (cat === c ? " on" : "")} aria-pressed={cat === c} onClick={() => pick(c)}>
              <Icon name={EXPENSE_ICON[c]} size={18} /><span>{EXPENSE_LABEL[c]}</span>
            </button>
          ))}
        </div>
      )}</Field>
      <Field label="Amount" error={err}>{id => <MoneyInput id={id} value={amount} onChange={setAmount} large />}</Field>
      <Field label="How often">{() => <Segmented label="Frequency" value={freq} options={FREQ_OPTS} onChange={setFreq} />}</Field>
      <Toggle checked={essential} onChange={v => { setEssential(v); setTouched(true); }} label="Essential" description={essential ? "Can't be cut without real hardship" : "Could be reduced if needed"} />
      <Field label="Description" optional>{id => <TextInput id={id} value={name} onChange={setName} placeholder={EXPENSE_LABEL[cat]} />}</Field>
    </Sheet>
  );
}

// ─── Quick spends (bulk entry for setup) ────────────────────────────────────
const QUICK_CATS: ExpenseCategory[] = ["rent", "groceries", "utilities", "transport", "family-support", "education", "eating-out", "subscriptions", "shopping", "entertainment"];
function QuickSpendsSheet() {
  const { update, close, toast } = useApp();
  const [vals, setVals] = useState<Record<string, string>>({});
  const total = Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);
  const save = () => {
    const recs: Expense[] = QUICK_CATS.filter(c => Number(vals[c]) > 0).map(c => ({ id: uid(), category: c, name: EXPENSE_LABEL[c], amount: Number(vals[c]), freq: "monthly", essential: ESSENTIAL_DEFAULT[c] }));
    update(s => ({ ...s, expenses: [...s.expenses, ...recs] }));
    toast(`${recs.length} spends added`); close();
  };
  return (
    <Sheet title="Monthly spends" subtitle="Fill what applies, skip the rest" onClose={close}
      footer={<SaveBar onSave={save} label={total ? `Save · ${inr(total)}/month` : "Save"} disabled={!total} />}>
      <div className="quick-list">
        {QUICK_CATS.map(c => (
          <Field key={c} label={EXPENSE_LABEL[c]}>{id => (
            <div className="quick-row"><span className="row-icon"><Icon name={EXPENSE_ICON[c]} /></span><MoneyInput id={id} value={vals[c] ?? ""} onChange={v => setVals(p => ({ ...p, [c]: v }))} /></div>
          )}</Field>
        ))}
      </div>
    </Sheet>
  );
}

// ─── Update all balances ────────────────────────────────────────────────────
function BalancesSheet() {
  const { state, update, close, toast } = useApp();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(state.accounts.map(a => [a.id, String(a.balance)])));
  const save = () => {
    const now = new Date().toISOString();
    update(s => ({ ...s, accounts: s.accounts.map(a => (vals[a.id] !== undefined && vals[a.id] !== "" ? { ...a, balance: Number(vals[a.id]), updatedAt: now } : a)) }));
    toast("Balances updated — plan recalculated"); close();
  };
  return (
    <Sheet title="Update balances" subtitle="Copy each balance from your bank app" onClose={close} footer={<SaveBar onSave={save} label="Update all" />}>
      {state.accounts.map((a, i) => (
        <Field key={a.id} label={a.name} hint={`Last updated ${ago(a.updatedAt)}`}>{id => <MoneyInput id={id} value={vals[a.id] ?? ""} onChange={v => setVals(p => ({ ...p, [a.id]: v }))} large autoFocus={i === 0} />}</Field>
      ))}
    </Sheet>
  );
}


// ─── Reminders ──────────────────────────────────────────────────────────────
function RemindersSheet() {
  const { state, update, close, toast } = useApp();
  const [notif, setNotif] = useState(() => notificationsEnabled());
  const downloadAll = async () => {
    const ok = await saveTextFile("emi-reminders.ics", "text/calendar", buildIcs(state.loans, state.accounts, state.settings));
    if (!ok) return;
    update(s => ({ ...s, settings: { ...s.settings, calendarAdded: true } }));
    toast(isNative ? "Saved. Open the file and choose your Calendar app" : "Downloaded. Open the file and choose your Calendar app");
  };
  return (
    <Sheet title="EMI reminders" subtitle={isNative ? "Lifeline alerts you even when the app is closed" : "Your phone's calendar will alert you even when Lifeline is closed"} onClose={close}>
      <div className="steps-mini">
        <div><span>1</span>“Fund your account”: {state.settings.bufferDays} day{state.settings.bufferDays > 1 ? "s" : ""} before each EMI, 9 am</div>
        <div><span>2</span>“EMI today”: on the due date, 8 am</div>
        {isNative && <div><span>3</span>“Salary day”: update balances, plan the month</div>}
      </div>
      <Field label={`Remind me ${state.settings.bufferDays} day(s) before`}>{id => (
        <Slider id={id} value={state.settings.bufferDays} min={1} max={7} onChange={v => update(s => ({ ...s, settings: { ...s.settings, bufferDays: v } }))} />
      )}</Field>
      {isNative && (
        notif
          ? <div className="ok-banner"><Icon name="check" /> Phone notifications are on. Reminders update automatically when you change an EMI.</div>
          : <Button variant="primary" full icon="bell" onClick={async () => { const ok = await requestNotifications(); setNotif(ok); toast(ok ? "Notifications on" : "Allow notifications in Android Settings → Apps → Lifeline"); }}>Allow phone notifications</Button>
      )}
      <Button variant={isNative ? "secondary" : "primary"} full icon="download" onClick={downloadAll} disabled={!state.loans.length}>Also add all {state.loans.length} EMIs to my calendar</Button>
      <p className="note">Save the file, open it and choose <b>Calendar</b> → <b>Save</b>. Do this again if you add or change an EMI.</p>
      {state.loans.length > 0 && (
        <Disclosure summary={<b>Or add one at a time (Google Calendar)</b>}>
          <List>
            {state.loans.map(l => {
              const a = state.accounts.find(x => x.id === l.accountId);
              return (
                <div key={l.id} className="row">
                  <span className="row-main"><span className="row-title">{l.name}</span><span className="row-sub">Day {l.dueDay} · {inr(l.emi)}</span></span>
                  <a className="btn btn-secondary btn-sm" href={googleCalendarLink(l, a, state.settings, "fund")} target="_blank" rel="noreferrer">Fund</a>
                  <a className="btn btn-secondary btn-sm" href={googleCalendarLink(l, a, state.settings, "due")} target="_blank" rel="noreferrer">Due</a>
                </div>
              );
            })}
          </List>
        </Disclosure>
      )}
    </Sheet>
  );
}

// ─── Letters to lender ──────────────────────────────────────────────────────
function LetterSheet({ initial, loanId }: { initial?: LetterKind; loanId?: string }) {
  const { state, close, toast, update } = useApp();
  const [kind, setKind] = useState<LetterKind>(initial ?? "date-change");
  const [lid, setLid] = useState(loanId ?? state.loans[0]?.id ?? "");
  const [newDay, setNewDay] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [name, setName] = useState(state.settings.name);
  const loan = state.loans.find(l => l.id === lid);
  const letter = useMemo(() => (loan ? buildLetter(kind, loan, { ...state, settings: { ...state.settings, name } }, { newDay: newDay ?? undefined, reason }) : null), [kind, loan, state, newDay, reason, name]);
  if (!loan || !letter) return <Sheet title="Letter to lender" onClose={close}><p>Add an EMI first.</p></Sheet>;
  const text = `Subject: ${letter.subject}\n\n${letter.body}`;
  const saveName = () => { if (name !== state.settings.name) update(s => ({ ...s, settings: { ...s.settings, name } })); };
  const copy = async () => { saveName(); toast((await copyText(text)) ? "Letter copied" : "Couldn't copy. Select the text and copy it manually"); };
  const share = async () => { saveName(); const r = await shareText(text, letter.subject); if (r === "copied") toast("Letter copied. Paste it into your email"); };
  return (
    <Sheet title="Letter to lender" subtitle="Filled in for you — review, then send from your email" onClose={close}
      footer={<div className="savebar"><Button icon="copy" onClick={copy}>Copy</Button><Button variant="primary" full icon="share" onClick={share}>Share / send</Button></div>}>
      <Field label="What do you need?">{() => <ChoiceCards value={kind} onChange={v => setKind(v as LetterKind)} options={LETTERS.map(l => ({ value: l.id, title: l.title, subtitle: l.when }))} />}</Field>
      <Field label="Which loan?">{() => <ChoiceChips value={lid} options={state.loans.map(l => ({ value: l.id, label: l.name }))} onChange={setLid} />}</Field>
      <Field label="Your full name">{id => <TextInput id={id} value={name} onChange={setName} placeholder="As on your loan account" />}</Field>
      {kind === "date-change" && <Field label="New EMI date you want" hint="2–5 days after your salary is ideal.">{() => <DayPicker value={newDay} onChange={setNewDay} />}</Field>}
      {(kind === "restructure" || kind === "harassment") && (
        <Field label={kind === "restructure" ? "Reason (one line)" : "What happened"} optional>{id => (
          <textarea id={id} className="input textarea" value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder={kind === "restructure" ? "e.g. my salary was reduced by 30% from August" : "Dates, times, numbers, what was said, who was contacted"} />
        )}</Field>
      )}
      <Field label="Preview">{() => <pre className="letter">{text}</pre>}</Field>
      <p className="note">Fill the parts in [brackets]. Send to the lender's grievance email (on their website) and keep the reply.</p>
    </Sheet>
  );
}

// ─── Earn profile ───────────────────────────────────────────────────────────
function EarnProfileSheet() {
  const { state, update, close } = useApp();
  const [p, setP] = useState(state.profile);
  const toggle = (id: string) => setP(x => ({ ...x, skills: x.skills.includes(id) ? x.skills.filter(s => s !== id) : [...x.skills, id] }));
  return (
    <Sheet title="Your earning profile" subtitle="We use this to rank opportunities" onClose={close}
      footer={<SaveBar onSave={() => { update(s => ({ ...s, profile: p })); close(); }} label="Show my matches" />}>
      <Field label="What can you do? (tap all that apply)">{() => <ChoiceChips multi value={p.skills} options={SKILL_TAGS.map(s => ({ value: s.id, label: s.label }))} onChange={toggle} />}</Field>
      <Field label={`Hours per week you can give: ${p.hoursPerWeek}`}>{id => <Slider id={id} value={p.hoursPerWeek} min={2} max={40} onChange={v => setP(x => ({ ...x, hoursPerWeek: v }))} />}</Field>
      <Field label="When do you need the money?">{() => (
        <ChoiceCards value={p.urgency} onChange={v => setP(x => ({ ...x, urgency: v as typeof p.urgency }))} options={[
          { value: "this-month", title: "This month", subtitle: "Fastest options first", icon: "clock" },
          { value: "3-months", title: "Within 3 months", subtitle: "Balance of speed and pay", icon: "calendar" },
          { value: "long-term", title: "Long term", subtitle: "Build skills and assets", icon: "grow" },
        ]} />
      )}</Field>
    </Sheet>
  );
}

// ─── Change passcode ────────────────────────────────────────────────────────
function PasscodeSheet() {
  const { close, toast } = useApp();
  const [cur, setCur] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^\d{6}$/.test(a)) return setErr("New passcode must be 6 digits.");
    if (a !== b) return setErr("The new passcodes don't match.");
    setBusy(true);
    const ok = await vault.changePasscode(cur, a);
    setBusy(false);
    if (!ok) return setErr("Current passcode is wrong.");
    toast("Passcode changed"); close();
  };
  const pin = (id: string, v: string, set: (x: string) => void, af = false) => (
    <input id={id} className="input pin-input" inputMode="numeric" type="password" maxLength={6} value={v} autoComplete="off" onChange={e => set(e.target.value.replace(/\D/g, ""))} {...(af ? { "data-autofocus": true } : {})} />
  );
  return (
    <Sheet title="Change passcode" subtitle="Your data is re-locked with the new passcode" onClose={close} footer={<SaveBar onSave={save} label={busy ? "Saving…" : "Change passcode"} disabled={busy} />}>
      <Field label="Current passcode" error={err}>{id => pin(id, cur, setCur, true)}</Field>
      <Field label="New 6-digit passcode">{id => pin(id, a, setA)}</Field>
      <Field label="Repeat new passcode">{id => pin(id, b, setB)}</Field>
    </Sheet>
  );
}

// ─── Encrypted backup ───────────────────────────────────────────────────────
function BackupSheet() {
  const { state, close, toast } = useApp();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 8) return setErr("Use at least 8 characters. A short sentence is best.");
    if (pw !== pw2) return setErr("The passwords don't match.");
    setBusy(true);
    const text = await vault.makeBackup(state, pw);
    const ok = await saveTextFile(`lifeline-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json", text);
    setBusy(false);
    if (ok) { toast("Encrypted backup saved"); close(); }
  };
  return (
    <Sheet title="Encrypted backup" subtitle="Restore it on a new phone with this password" onClose={close} footer={<SaveBar onSave={save} label={busy ? "Encrypting…" : "Save backup"} disabled={busy} />}>
      <div className="ok-banner"><Icon name="shield" /> The file is AES-256 encrypted. Without the password it's unreadable, even to us.</div>
      <Field label="Backup password" error={err} hint="Different from your passcode. Write it down somewhere safe. It can't be recovered.">{id => (
        <input id={id} className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} data-autofocus />
      )}</Field>
      <Field label="Repeat password">{id => <input id={id} className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />}</Field>
    </Sheet>
  );
}

function RestoreSheet({ text }: { text: string }) {
  const { replace, close, toast } = useApp();
  const encrypted = vault.isEncryptedBackup(text);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    const s = encrypted ? await vault.readBackup(text, pw) : parsePlainBackup(text);
    setBusy(false);
    if (!s) return setErr(encrypted ? "Wrong password, or the file is damaged." : "This isn't a Lifeline backup.");
    if (!confirm("Replace everything in Lifeline with this backup?")) return;
    replace(s); toast("Backup restored"); close();
  };
  return (
    <Sheet title="Restore backup" subtitle={encrypted ? "Enter the backup's password" : "Older unencrypted backup"} onClose={close} footer={<SaveBar onSave={restore} label={busy ? "Decrypting…" : "Restore"} disabled={busy} />}>
      {encrypted
        ? <Field label="Backup password" error={err}>{id => <input id={id} className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} data-autofocus />}</Field>
        : <p className="field-error">{err || "This file isn't encrypted. After restoring, save a new encrypted backup and delete the old file."}</p>}
    </Sheet>
  );
}

// ─── Investment ─────────────────────────────────────────────────────────────
const PRICED: HoldingKind[] = ["stock", "mf", "crypto"];
function HoldingSheet({ item }: { item?: Holding }) {
  const { update, close, toast } = useApp();
  const [kind, setKind] = useState<HoldingKind>(item?.kind ?? "mf");
  const [name, setName] = useState(item?.name ?? "");
  const [symbol, setSymbol] = useState(item?.symbol ?? "");
  const [code, setCode] = useState(item?.schemeCode ?? "");
  const [units, setUnits] = useState(str(item?.units));
  const [avg, setAvg] = useState(str(item?.avgPrice));
  const [cur, setCur] = useState(str(item?.manualValue ?? item?.lastPrice));
  const [liquid, setLiquid] = useState(item?.liquid ?? true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MfScheme[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const priced = PRICED.includes(kind);

  const search = async () => {
    setSearching(true); setErr("");
    try { setResults(await searchFunds(q)); } catch { setErr("Couldn't search right now. Check your internet."); }
    setSearching(false);
  };
  const pickFund = async (f: MfScheme) => {
    setName(f.schemeName); setCode(String(f.schemeCode)); setResults([]); setQ("");
    try { const n = await fundNav(String(f.schemeCode)); setCur(String(n.nav)); } catch { /* price later */ }
  };
  const save = () => {
    if (!name.trim()) return setErr("Give this investment a name.");
    const u = priced ? num(units) : 1;
    const a = num(avg);
    if (!(u > 0) || !(a >= 0) || Number.isNaN(a)) return setErr(priced ? "Enter units and average buy price." : "Enter the amount invested.");
    const c = num(cur);
    const rec: Holding = {
      id: item?.id ?? uid(), kind, name: name.trim(), units: u, avgPrice: a, liquid,
      symbol: kind === "stock" ? symbol.trim().toUpperCase() || undefined : undefined,
      schemeCode: kind === "mf" ? code || undefined : undefined,
      lastPrice: priced && c > 0 ? c : undefined, priceAt: priced && c > 0 ? new Date().toISOString() : undefined,
      manualValue: !priced && c > 0 ? c : undefined,
    };
    update(s => ({ ...s, holdings: item ? s.holdings.map(h => (h.id === item.id ? rec : h)) : [...s.holdings, rec] }));
    toast(item ? "Investment updated" : "Investment added"); close();
  };
  const del = item ? () => { if (confirm(`Remove ${item.name}?`)) { update(s => ({ ...s, holdings: s.holdings.filter(h => h.id !== item.id) })); close(); } } : undefined;
  return (
    <Sheet title={item ? "Edit investment" : "Add investment"} subtitle="Mutual fund prices update automatically" onClose={close} footer={<SaveBar onSave={save} onDelete={del} />}>
      <Field label="Type">{() => <ChoiceChips value={kind} options={(Object.keys(HOLDING_LABEL) as HoldingKind[]).map(k => ({ value: k, label: HOLDING_LABEL[k] }))} onChange={k => { setKind(k); setLiquid(k !== "epf"); }} />}</Field>
      {kind === "mf" && !item && (
        <Field label="Find your fund" hint="Type at least 3 letters of the fund name.">{id => (
          <>
            <div className="key-input">
              <input id={id} className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Parag Parikh Flexi" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
              <Button size="sm" onClick={search} disabled={searching || q.trim().length < 3}>{searching ? "…" : "Search"}</Button>
            </div>
            {results.length > 0 && <div className="results">{results.map(f => <button key={f.schemeCode} type="button" className="result" onClick={() => pickFund(f)}>{f.schemeName}</button>)}</div>}
          </>
        )}</Field>
      )}
      <Field label="Name" error={err}>{id => <TextInput id={id} value={name} onChange={setName} placeholder={kind === "stock" ? "e.g. Reliance Industries" : kind === "fd" ? "e.g. SBI FD" : "Name"} maxLength={120} />}</Field>
      {kind === "stock" && <Field label="Symbol" optional hint="For live prices: RELIANCE.BSE, TCS.BSE, or US tickers like AAPL.">{id => <TextInput id={id} value={symbol} onChange={setSymbol} placeholder="RELIANCE.BSE" />}</Field>}
      {priced ? (
        <>
          <Field label="Units / quantity">{id => <NumberInput id={id} value={units} onChange={setUnits} placeholder="0" />}</Field>
          <Field label="Average buy price per unit">{id => <MoneyInput id={id} value={avg} onChange={setAvg} />}</Field>
          <Field label="Current price per unit" optional hint={kind === "mf" ? "Filled automatically from the latest NAV." : "Updated when you tap Prices."}>{id => <MoneyInput id={id} value={cur} onChange={setCur} />}</Field>
        </>
      ) : (
        <>
          <Field label="Amount invested">{id => <MoneyInput id={id} value={avg} onChange={setAvg} large />}</Field>
          <Field label="Current value" optional>{id => <MoneyInput id={id} value={cur} onChange={setCur} />}</Field>
        </>
      )}
      <Toggle checked={liquid} onChange={setLiquid} label="Can be withdrawn within a week" description="Used to check if investments should repay expensive debt" />
    </Sheet>
  );
}

// ─── Plans ──────────────────────────────────────────────────────────────────
function PaywallSheet() {
  const { state, update, close, toast } = useApp();
  return (
    <Sheet title="Lifeline Pro" subtitle="Everything you need to get out of money stress" onClose={close}
      footer={<Button variant="primary" full onClick={() => { update(s => ({ ...s, settings: { ...s.settings, plan: s.settings.plan === "free" ? "early-access" : s.settings.plan } })); toast("Pro unlocked. Free during early access"); close(); }}>
        {state.settings.plan === "free" ? "Unlock Pro free (early access)" : "You have Pro"}
      </Button>}>
      <div className="plan-hero">
        <span className="pill pill-good">Early access: free</span>
        <div className="plan-price"><b>{PRICES.currency}{PRICES.yearly}</b><span>/year after launch</span></div>
        <p>or {PRICES.currency}{PRICES.monthly}/month. Less than one bounced-EMI charge.</p>
      </div>
      <div className="plan-list">
        {PRO_FEATURES.map(f => (
          <div key={f.id} className="plan-item"><span className="action-icon brand"><Icon name={f.icon} /></span><div><b>{f.title}</b><small>{f.detail}</small></div></div>
        ))}
      </div>
      <Disclosure summary={<b>Always free</b>}>
        <ul className="flags">{FREE_FEATURES.map(f => <li key={f}>{f}</li>)}</ul>
      </Disclosure>
    </Sheet>
  );
}

// ─── Bounced EMI help ───────────────────────────────────────────────────────
function BouncedSheet({ loanId }: { loanId: string }) {
  const { state, close, open } = useApp();
  const loan = state.loans.find(l => l.id === loanId);
  return (
    <Sheet title="Your EMI bounced — do this today" subtitle={loan ? `${loan.name} · ${inr(loan.emi)}` : undefined} onClose={close}
      footer={<Button variant="primary" full icon="doc" onClick={() => open({ kind: "letter", letter: "restructure", loanId })}>Write to lender for help</Button>}>
      <ol className="numbered">
        <li><b>Pay it within 24–48 hours</b> through the lender's app, website or branch (UPI/net banking). Paying quickly limits extra charges and the damage to your credit score.</li>
        <li><b>Don't wait for the lender to re-try the auto-debit.</b> If it bounces again, you pay the bounce charges twice.</li>
        <li><b>Keep the receipt</b> and check the next statement for bounce and penal charges.</li>
        <li><b>If you can't pay it at all</b>, call the lender today and ask for a short extension in writing. Never take an instant-app loan to cover it.</li>
      </ol>
      <List>
        <Row icon="phone" title="Cyber helpline 1930" subtitle="If loan-app agents threaten or harass you" onClick={() => { location.href = "tel:1930"; }} />
      </List>
    </Sheet>
  );
}
