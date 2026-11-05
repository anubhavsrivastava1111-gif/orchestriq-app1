// Lifeline — data-entry sheets. Every form: one screen, big tap targets, smart defaults,
// optional details folded away, and a Save button that is always visible.
import { useMemo, useState } from "react";
import type { Account, CardCashOut, CardEmi, CreditCard, Expense, ExpenseCategory, Freq, Goal, GoalKind, Holding, HoldingKind, Income, IncomeKind, Loan, LoanType, RiskProfile } from "./types";
import { EXPENSE_ICON, ago } from "./labels";
import { ESSENTIAL_DEFAULT, EXPENSE_LABEL, HOLDING_LABEL, INCOME_LABEL, LOAN_TYPE_LABEL } from "./types";
import { useApp, type SheetState } from "./context";
import { uid, parsePlainBackup } from "./store";
import { inr, inrRaw } from "./engine";
import { buildIcs, googleCalendarLink } from "./calendar";
import { buildLetter, LETTERS, type LetterKind } from "./letters";
import { SKILL_TAGS } from "./opportunities";
import { Button, ChoiceCards, ChoiceChips, DayPicker, Disclosure, FanChart, Field, MoneyInput, NumberInput, Pill, Segmented, Sheet, Slider, TextInput, Toggle, Row, List } from "./components";
import { GOAL_KINDS, PROFILES, RISK_QUESTIONS, goalMonthlyTotal, nextRupeeLadder, planGoal, riskFromScore } from "./wealth";
import { Icon } from "./icons";
import { isNative, notificationsEnabled, requestNotifications, saveTextFile, shareText, copyText } from "./native";
import * as vault from "./vault";
import { searchFunds, fundNav, type MfScheme } from "./market";
import { FREE_FEATURES, PRICES, PRO_FEATURES } from "./entitlements";
import { DEFAULT_CARD, alternativeCost, applyPayment, cashCost, dueAfter, emiQuote, emiRemaining, emiRowFor, emiSchedule, lastStatementDate, nextPayment, nextStatementDate, ymAdd, ymOf } from "./cards";

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
    case "card": return <CardSheet item={sheet.item} fromLoan={sheet.fromLoan} />;
    case "card-emi": return <CardEmiSheet cardId={sheet.cardId} item={sheet.item} />;
    case "card-emi-detail": return <CardEmiDetailSheet cardId={sheet.cardId} emiId={sheet.emiId} />;
    case "card-cash": return <CardCashSheet cardId={sheet.cardId} item={sheet.item} />;
    case "card-pay": return <CardPaySheet cardId={sheet.cardId} />;
    case "goal": return <GoalSheet item={sheet.item} preset={sheet.preset} />;
    case "risk-quiz": return <RiskQuizSheet />;
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
    { icon: "card", title: "Add credit card", sub: "Bills, EMIs, fees, minimum due", go: { kind: "card" } },
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
  const { state, update, close, toast, open } = useApp();
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
      {type === "credit-card" && (
        <div className="ok-banner"><Icon name="card" /><span>For credit cards, use <b>detailed tracking</b>: EMIs on the card, processing fees, GST, card cash and an automatic minimum due.{" "}
          <button type="button" className="link-inline" onClick={() => open({ kind: "card", fromLoan: item ?? undefined })}>{item ? "Upgrade this card" : "Add as a credit card"}</button></span></div>
      )}
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

// ─── Credit card ────────────────────────────────────────────────────────────
const RATE_CHIPS = ["3.5", "3.6", "3.75", "3.99"];
function CardSheet({ item, fromLoan }: { item?: CreditCard; fromLoan?: Loan }) {
  const { state, update, close, toast, go } = useApp();
  const base = item ?? { ...DEFAULT_CARD, id: "", name: fromLoan?.name ?? "", bank: fromLoan?.lender ?? "", accountId: fromLoan?.accountId ?? state.accounts[0]?.id ?? "",
    dueDay: fromLoan?.dueDay ?? DEFAULT_CARD.dueDay, monthlyRatePct: fromLoan && fromLoan.ratePct > 0 ? Math.round((fromLoan.ratePct / 12) * 100) / 100 : DEFAULT_CARD.monthlyRatePct };
  const [name, setName] = useState(base.name);
  const [bank, setBank] = useState(base.bank);
  const [limit, setLimit] = useState(str(item ? item.limit : undefined));
  const [stDay, setStDay] = useState<number | null>(item ? item.statementDay : null);
  const [dueDay, setDueDay] = useState<number | null>(item || fromLoan ? base.dueDay : null);
  const [acct, setAcct] = useState(base.accountId);
  const [plan, setPlan] = useState<CreditCard["plan"]>(item?.plan ?? (fromLoan ? "custom" : "full"));
  const [custom, setCustom] = useState(str(item?.customPay ?? fromLoan?.emi));
  const [rate, setRate] = useState(String(base.monthlyRatePct));
  const [minPct, setMinPct] = useState(String(base.minPct));
  const [minFloor, setMinFloor] = useState(String(base.minFloor));
  const [atmPct, setAtmPct] = useState(String(base.atmFeePct));
  const [atmMin, setAtmMin] = useState(String(base.atmMinFee));
  const [late, setLate] = useState(String(base.lateFee));
  // latest statement (new cards only)
  const [stStatus, setStStatus] = useState<"none" | "unpaid" | "part">(fromLoan && fromLoan.outstanding > 0 ? "unpaid" : "none");
  const [tad, setTad] = useState(str(fromLoan?.outstanding));
  const [mad, setMad] = useState("");
  const [paidPart, setPaidPart] = useState("");
  const [spends, setSpends] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name the card, e.g. “SBI SimplyCLICK”.";
    if (!(num(limit) > 0)) e.limit = "Enter the credit limit (on the card app or statement).";
    if (!stDay) e.st = "Tap the day your statement is generated.";
    if (!dueDay) e.due = "Tap the payment due day.";
    if (!acct) e.acct = "Choose the bank account you pay the bill from (add one in Bills → Banks first).";
    if (!item && stStatus !== "none" && !(num(tad) > 0)) e.tad = "Enter the statement's total due.";
    setErr(e); if (Object.keys(e).length) return;
    const terms = {
      name: name.trim(), bank: bank.trim(), limit: num(limit), statementDay: stDay!, dueDay: dueDay!, accountId: acct, plan, customPay: num(custom) || 0,
      monthlyRatePct: num(rate) || 3.6, minPct: num(minPct) || 5, minFloor: Number.isNaN(num(minFloor)) ? 200 : num(minFloor),
      atmFeePct: num(atmPct) || 2.5, atmMinFee: num(atmMin) || 0, lateFee: num(late) || 0,
    };
    if (item) {
      update(s => ({ ...s, cards: s.cards.map(c => (c.id === item.id ? { ...c, ...terms } : c)) }));
      toast("Card updated"); close(); return;
    }
    const draft: CreditCard = { ...DEFAULT_CARD, id: uid(), ...terms, unbilled: num(spends) || 0, paidMonths: fromLoan?.paidMonths ?? [] };
    const lsDate = lastStatementDate(draft);
    draft.cycleYm = ymOf(lsDate);
    if (stStatus !== "none") {
      const t = num(tad);
      const m = num(mad) > 0 ? num(mad) : Math.min(t, Math.max(draft.minFloor, t * draft.minPct / 100));
      draft.lastStatement = { ym: ymOf(lsDate), date: lsDate.toISOString(), due: dueAfter(draft, lsDate).toISOString(), tad: t, mad: m, paidAmount: stStatus === "part" ? num(paidPart) || 0 : 0, estimated: false };
    }
    update(s => ({ ...s, cards: [...s.cards, draft], loans: fromLoan ? s.loans.filter(l => l.id !== fromLoan.id) : s.loans }));
    toast(fromLoan ? "Card upgraded. Everything carried over" : "Card added. Bills are now calculated automatically");
    close(); go("card", draft.id);
  };
  const del = item ? () => {
    if (!confirm(`Delete ${item.name} and its EMIs?`)) return;
    update(s => ({ ...s, cards: s.cards.filter(c => c.id !== item.id) })); toast("Card deleted"); close(); go("bills", "cards");
  } : undefined;

  return (
    <Sheet title={item ? "Card settings" : fromLoan ? "Upgrade to detailed card" : "Add credit card"} subtitle="Takes a minute. Lifeline then calculates every bill for you" onClose={close} footer={<SaveBar onSave={save} onDelete={del} label={item ? "Save" : "Add card"} />}>
      {!item && <Field label="Bank">{() => <ChoiceChips value={BANKS.includes(bank) ? bank : ""} options={BANKS.map(b => ({ value: b, label: b }))} onChange={b => { setBank(b === "Other" ? "" : b); if (!name) setName(b === "Other" ? "" : `${b} credit card`); }} />}</Field>}
      <Field label="Card name" error={err.name}>{id => <TextInput id={id} value={name} onChange={setName} placeholder="e.g. HDFC Millennia" />}</Field>
      <Field label="Credit limit" error={err.limit}>{id => <MoneyInput id={id} value={limit} onChange={setLimit} large />}</Field>
      <Field label="Statement generated on day" error={err.st} hint="Printed on your statement as “Statement date”.">{() => <DayPicker value={stDay} onChange={d => { setStDay(d); if (!dueDay && d) setDueDay(((d + 19) % 28) + 1); }} />}</Field>
      <Field label="Payment due on day" error={err.due} hint="Usually 15 to 20 days after the statement.">{() => <DayPicker value={dueDay} onChange={setDueDay} />}</Field>
      <Field label="Bill paid from" error={err.acct}>{() => (
        state.accounts.length ? <ChoiceCards value={acct} onChange={setAcct} options={state.accounts.map(a => ({ value: a.id, title: a.name, subtitle: `Balance ${inr(a.balance)}`, icon: "bank" }))} /> : <p className="field-error">Add a bank account first (Bills → Banks).</p>
      )}</Field>
      <Field label="How do you usually pay?">{() => (
        <Segmented label="Payment plan" value={plan} onChange={setPlan} options={[{ value: "full", label: "In full" }, { value: "minimum", label: "Minimum" }, { value: "custom", label: "Fixed ₹" }]} />
      )}</Field>
      {plan === "custom" && <Field label="Amount you pay each month">{id => <MoneyInput id={id} value={custom} onChange={setCustom} />}</Field>}

      {!item && (
        <div className="inline-group">
          <b>Your latest statement</b>
          <Segmented label="Statement status" value={stStatus} onChange={setStStatus} options={[{ value: "none", label: "Paid in full" }, { value: "unpaid", label: "Not paid yet" }, { value: "part", label: "Part paid" }]} />
          {stStatus !== "none" && (
            <>
              <Field label="Total amount due" error={err.tad}>{id => <MoneyInput id={id} value={tad} onChange={setTad} />}</Field>
              <Field label="Minimum amount due" optional hint="Leave blank and Lifeline will calculate it.">{id => <MoneyInput id={id} value={mad} onChange={setMad} />}</Field>
              {stStatus === "part" && <Field label="Already paid">{id => <MoneyInput id={id} value={paidPart} onChange={setPaidPart} />}</Field>}
            </>
          )}
          <Field label="Spent since that statement" optional hint="From your card app's “unbilled” amount.">{id => <MoneyInput id={id} value={spends} onChange={setSpends} />}</Field>
          <p className="note">Converted EMIs and card cash are added on the card screen next.</p>
        </div>
      )}

      <Disclosure summary={<span><b>Card charges</b> <small>· pre-filled with typical Indian rates</small></span>}>
        <Field label="Interest (finance charge) per month">{id => (
          <>
            <NumberInput id={id} value={rate} onChange={setRate} suffix={`% a month = ${((num(rate) || 0) * 12).toFixed(1)}% a year`} />
            <ChoiceChips value={rate} options={RATE_CHIPS.map(r => ({ value: r, label: r + "%" }))} onChange={setRate} />
          </>
        )}</Field>
        <div className="inline-2">
          <Field label="Minimum due %">{id => <NumberInput id={id} value={minPct} onChange={setMinPct} suffix="%" />}</Field>
          <Field label="…but at least">{id => <MoneyInput id={id} value={minFloor} onChange={setMinFloor} />}</Field>
        </div>
        <div className="inline-2">
          <Field label="ATM cash fee">{id => <NumberInput id={id} value={atmPct} onChange={setAtmPct} suffix="%" />}</Field>
          <Field label="…minimum">{id => <MoneyInput id={id} value={atmMin} onChange={setAtmMin} />}</Field>
        </div>
        <Field label="Late payment fee">{id => <MoneyInput id={id} value={late} onChange={setLate} />}</Field>
        <p className="note">18% GST is added to interest and all fees automatically. Exact figures are in your card's “Most Important Terms & Conditions”.</p>
      </Disclosure>
    </Sheet>
  );
}

// ─── EMI on a card ──────────────────────────────────────────────────────────
function CardEmiSheet({ cardId, item }: { cardId: string; item?: CardEmi }) {
  const { state, update, close, toast } = useApp();
  const card = state.cards.find(c => c.id === cardId);
  const nextYm = card ? ymOf(nextStatementDate(card)) : ymOf(new Date());
  const [label, setLabel] = useState(item?.label ?? "");
  const [principal, setPrincipal] = useState(str(item?.principal));
  const [rate, setRate] = useState(str(item?.ratePct ?? 16));
  const [tenure, setTenure] = useState(str(item?.tenure ?? 12));
  const [feeMode, setFeeMode] = useState<"amount" | "pct">("amount");
  const [fee, setFee] = useState(str(item?.processingFee ?? 199));
  const [billed, setBilled] = useState(String(item ? Math.max(0, -ymDiffSafe(nextYm, item.startYm)) : 0));
  const [err, setErr] = useState("");
  if (!card) return null;
  const P = num(principal) || 0, R = num(rate) || 0, N = Math.round(num(tenure) || 0);
  const feeAmt = feeMode === "pct" ? (P * (num(fee) || 0)) / 100 : num(fee) || 0;
  const q = P > 0 && N > 0 ? emiQuote(P, R, N, feeAmt) : null;
  const plCost = q ? alternativeCost(P, 14, N * 30.4) / 2 : 0; // reducing balance ≈ half the principal on average
  const save = () => {
    if (!label.trim()) return setErr("Name this EMI, e.g. “Phone” or “Balance conversion”.");
    if (!(P > 0) || !(N > 0)) return setErr("Enter the amount and number of months.");
    const rec: CardEmi = { id: item?.id ?? uid(), label: label.trim(), principal: P, ratePct: R, tenure: N, processingFee: Math.round(feeAmt * 100) / 100, startYm: ymAdd(nextYm, -Math.max(0, Math.round(num(billed) || 0))) };
    update(s => ({ ...s, cards: s.cards.map(c => (c.id !== cardId ? c : { ...c, emis: item ? c.emis.map(e => (e.id === item.id ? rec : e)) : [...c.emis, rec] })) }));
    toast(item ? "EMI updated" : "EMI added. It's now in every bill"); close();
  };
  const del = item ? () => { if (confirm(`Remove ${item.label}?`)) { update(s => ({ ...s, cards: s.cards.map(c => (c.id !== cardId ? c : { ...c, emis: c.emis.filter(e => e.id !== item.id) })) })); close(); } } : undefined;
  return (
    <Sheet title={item ? "Edit card EMI" : "EMI on " + card.name} subtitle="A purchase or balance converted to EMI" onClose={close} footer={<SaveBar onSave={save} onDelete={del} />}>
      <Field label="What was converted" error={err}>{id => <TextInput id={id} value={label} onChange={setLabel} placeholder="e.g. Phone, Balance conversion" />}</Field>
      <Field label="Amount converted (principal)">{id => <MoneyInput id={id} value={principal} onChange={setPrincipal} large />}</Field>
      <Field label="Interest rate (per year)">{id => (
        <>
          <NumberInput id={id} value={rate} onChange={setRate} suffix="% a year" />
          <ChoiceChips value={rate} options={["0", "13", "15", "16", "18", "24"].map(r => ({ value: r, label: r === "0" ? "No-cost" : r + "%" }))} onChange={setRate} />
        </>
      )}</Field>
      <Field label="Months">{id => (
        <>
          <NumberInput id={id} value={tenure} onChange={setTenure} suffix="months" />
          <ChoiceChips value={tenure} options={["3", "6", "9", "12", "18", "24", "36"].map(m => ({ value: m, label: m }))} onChange={setTenure} />
        </>
      )}</Field>
      <Field label="Processing fee" hint="GST of 18% is added on top.">{id => (
        <>
          <Segmented label="Fee type" value={feeMode} onChange={setFeeMode} options={[{ value: "amount", label: "₹ amount" }, { value: "pct", label: "% of amount" }]} />
          {feeMode === "amount" ? <MoneyInput id={id} value={fee} onChange={setFee} /> : <NumberInput id={id} value={fee} onChange={setFee} suffix={`% = ${inr(feeAmt)}`} />}
        </>
      )}</Field>
      <Field label="Instalments already billed" hint="0 if the first instalment comes on your next statement.">{id => <NumberInput id={id} value={billed} onChange={setBilled} suffix="instalments" />}</Field>
      {q && (
        <div className="quote">
          <div className="quote-head"><span>Monthly instalment</span><b>{inr(q.emi)}</b><small>+ GST on interest (~{inr(q.firstBill - q.emi - q.fee - q.feeGst)} in month 1)</small></div>
          <div className="bd-row"><span>First bill (incl. processing fee + GST)</span><b>{inr(q.firstBill)}</b></div>
          <div className="bd-row"><span>Total interest</span><b>{inr(q.totalInterest)}</b></div>
          <div className="bd-row"><span>GST on interest</span><b>{inr(q.gstOnInterest)}</b></div>
          <div className="bd-row"><span>Processing fee + GST</span><b>{inr(q.fee + q.feeGst)}</b></div>
          <div className="bd-row bd-total"><span>Extra you pay in total</span><b>{inr(q.totalCost)}</b></div>
          <div className="bd-row bd-min"><span>True yearly cost (incl. fees & GST)</span><b>{q.effectivePct.toFixed(1)}%</b></div>
          {R === 0 && q.totalCost > 0 && <p className="note">“No-cost” EMI still costs {inr(q.totalCost)} through the processing fee and GST.</p>}
          {q.totalCost > plCost * 1.2 && plCost > 0 && <p className="note">A personal loan at ~14% would cost about {inr(plCost)} in interest for the same amount and time.</p>}
        </div>
      )}
    </Sheet>
  );
}
const ymDiffSafe = (a: string, b: string) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };

function CardEmiDetailSheet({ cardId, emiId }: { cardId: string; emiId: string }) {
  const { state, close, open } = useApp();
  const card = state.cards.find(c => c.id === cardId);
  const emi = card?.emis.find(e => e.id === emiId);
  if (!card || !emi) return null;
  const rows = emiSchedule(emi);
  const ym = ymOf(nextStatementDate(card));
  const current = emiRowFor(emi, ym);
  const left = emiRemaining(emi, ym) + (current?.principal ?? 0);
  const q = emiQuote(emi.principal, emi.ratePct, emi.tenure, emi.processingFee);
  const forecloseFee = left * 0.03;
  return (
    <Sheet title={emi.label} subtitle={`${inr(emi.principal)} at ${emi.ratePct}% for ${emi.tenure} months on ${card.name}`} onClose={close}
      footer={<div className="savebar"><Button full variant="primary" icon="edit" onClick={() => open({ kind: "card-emi", cardId, item: emi })}>Edit EMI</Button></div>}>
      <div className="kpi-row">
        <div><small>Principal left</small><b>{inr(left)}</b></div>
        <div><small>Monthly bill</small><b>{inr(current?.billed ?? 0)}</b></div>
        <div><small>True cost</small><b>{q.effectivePct.toFixed(1)}%/yr</b></div>
      </div>
      {left > 1 && <div className="ok-banner"><Icon name="info" /><span>Closing it early (foreclosure) usually costs about 3% of the principal left + GST: ~{inr(forecloseFee * 1.18)}. Worth it only if the money would otherwise sit idle or carry higher interest.</span></div>}
      <div className="sched" role="table" aria-label="EMI schedule">
        <div className="sched-row head" role="row"><span>#</span><span>Month</span><span>Principal</span><span>Interest</span><span>GST</span><span>Bill</span></div>
        {rows.map(r => (
          <div key={r.k} role="row" className={"sched-row" + (current && r.k === current.k ? " now" : "") + (r.ym < ym ? " past" : "")}>
            <span>{r.k}</span><span>{r.ym.slice(5)}/{r.ym.slice(2, 4)}</span><span>{inr(r.principal)}</span><span>{inr(r.interest)}</span><span>{inr(r.gst)}</span><span>{inr(r.billed)}</span>
          </div>
        ))}
      </div>
      <p className="note">Month 1 includes the processing fee {inr(emi.processingFee)} + GST {inr(emi.processingFee * 0.18)}. Total paid {inr(q.totalPaid)}.</p>
    </Sheet>
  );
}

// ─── Card cash ──────────────────────────────────────────────────────────────
function CardCashSheet({ cardId, item }: { cardId: string; item?: CardCashOut }) {
  const { state, update, close, toast } = useApp();
  const card = state.cards.find(c => c.id === cardId);
  const [method, setMethod] = useState<CardCashOut["method"]>(item?.method ?? "app");
  const [amount, setAmount] = useState(str(item?.amount));
  const [feePct, setFeePct] = useState(str(item?.feePct ?? (card ? 3 : 3)));
  const [incl, setIncl] = useState(item?.feeIncludesGst ?? false);
  const [date, setDate] = useState((item?.date ?? new Date().toISOString()).slice(0, 10));
  const [note, setNote] = useState(item?.note ?? "");
  if (!card) return null;
  const a = num(amount) || 0;
  const tx = { amount: a, method, feePct: num(feePct) || 0, feeIncludesGst: incl, date: new Date(date + "T12:00:00").toISOString() };
  const k = a > 0 ? cashCost(card, tx) : null;
  const kMin = a > 0 && card.plan === "full" ? cashCost(card, tx, false) : null;
  const pickMethod = (m: CardCashOut["method"]) => { setMethod(m); setFeePct(String(m === "atm" ? card.atmFeePct : 3)); };
  const save = () => {
    if (!(a > 0)) return;
    const rec: CardCashOut = { id: item?.id ?? uid(), ...tx, note: note.trim() };
    update(s => ({ ...s, cards: s.cards.map(c => (c.id !== cardId ? c : { ...c, cashOuts: item ? c.cashOuts.map(x => (x.id === item.id ? rec : x)) : [...c.cashOuts, rec] })) }));
    toast("Added to the card's next bill"); close();
  };
  const del = item ? () => { update(s => ({ ...s, cards: s.cards.map(c => (c.id !== cardId ? c : { ...c, cashOuts: c.cashOuts.filter(x => x.id !== item.id) })) })); close(); } : undefined;
  return (
    <Sheet title="Cash via credit card" subtitle="See the real cost first, then save it to the card" onClose={close} footer={<SaveBar onSave={save} onDelete={del} label={item ? "Save" : "Add to card"} disabled={!(a > 0)} />}>
      <Segmented label="Method" value={method} onChange={pickMethod} options={[{ value: "app", label: "Pay via app (rent, EMI, wallet)" }, { value: "atm", label: "ATM withdrawal" }]} />
      <Field label={method === "atm" ? "Cash withdrawn" : "Amount paid / received"}>{id => <MoneyInput id={id} value={amount} onChange={setAmount} large autoFocus />}</Field>
      <Field label="Fee charged" hint={method === "atm" ? `Your card: ${card.atmFeePct}% (at least ${inr(card.atmMinFee)}) + GST` : "The app's convenience fee, often 1–3%."}>{id => <NumberInput id={id} value={feePct} onChange={setFeePct} suffix="%" />}</Field>
      {method === "app" && <Toggle checked={incl} onChange={setIncl} label="Fee already includes GST" description={incl ? "Fee shown is the final amount" : "18% GST is added to the fee"} />}
      <div className="inline-2">
        <Field label="Date">{id => <input id={id} className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="Used for" optional>{id => <TextInput id={id} value={note} onChange={setNote} placeholder="e.g. Bike loan EMI" />}</Field>
      </div>
      {k && (
        <div className="quote">
          <div className="quote-head"><span>Real cost of this {inr(a)}</span><b>{inr(k.total)}</b><small>{inr(k.perHundred)} per ₹100 · ~{k.annualPct.toFixed(0)}% a year</small></div>
          <div className="bd-row"><span>Fee</span><b>{inr(k.fee)}</b></div>
          <div className="bd-row"><span>GST on fee</span><b>{inr(k.gst)}</b></div>
          <div className="bd-row"><span>Interest{method === "atm" ? " (from day one)" : ""} + GST</span><b>{inr(k.interest)}</b></div>
          <div className="bd-row"><span>Added to your card bill</span><b>{inr(k.chargedToCard)}</b></div>
          <div className="bd-row"><span>Days until you repay it (bill due)</span><b>{k.daysCarried}</b></div>
          {kMin && <div className="bd-row bd-min"><span>If you pay only the minimum that month</span><b>{inr(kMin.total)}</b></div>}
          <div className="compare-mini">
            <div><small>Personal loan ~14%</small><b>{inr(alternativeCost(a, 14, k.daysCarried))}</b></div>
            <div><small>Bank gold loan ~10%</small><b>{inr(alternativeCost(a, 10, k.daysCarried))}</b></div>
          </div>
          <p className="note">Doing this every month to pay EMIs means paying about {inr(k.total * 12)} a year just in charges. Fine for a one-off gap; for a gap that repeats, a cheaper loan or a lower EMI fixes it.</p>
        </div>
      )}
    </Sheet>
  );
}

// ─── Record a card payment ──────────────────────────────────────────────────
function CardPaySheet({ cardId }: { cardId: string }) {
  const { state, update, close, toast } = useApp();
  const card = state.cards.find(c => c.id === cardId);
  const p = card ? nextPayment(card) : null;
  const [amount, setAmount] = useState(p ? String(Math.round(p.amount)) : "");
  if (!card || !p) return null;
  const acct = state.accounts.find(x => x.id === card.accountId);
  const save = () => {
    const amt = num(amount);
    if (!(amt > 0)) return;
    const before = state;
    update(s => ({
      ...s,
      cards: s.cards.map(c => (c.id === cardId ? applyPayment(c, amt) : c)),
      accounts: s.accounts.map(a => (a.id === card.accountId ? { ...a, balance: a.balance - amt } : a)),
    }));
    toast(`${inr(amt)} recorded for ${card.name}`, () => update(() => before));
    close();
  };
  return (
    <Sheet title={`Pay ${card.name}`} subtitle={p.source === "statement" ? `Statement due ${p.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Paying before the statement lowers the bill and the interest"} onClose={close} footer={<SaveBar onSave={save} label="Record payment" disabled={!(num(amount) > 0)} />}>
      <div className="kpi-row">
        <div><small>Total due</small><b>{inr(p.tad)}</b></div>
        <div><small>Minimum</small><b>{inr(p.mad)}</b></div>
        <div><small>Paid so far</small><b>{inr(p.paidSoFar)}</b></div>
      </div>
      <Field label="Amount paid">{id => (
        <>
          <MoneyInput id={id} value={amount} onChange={setAmount} large />
          <ChoiceChips value={amount} options={[
            { value: String(Math.round(Math.max(0, p.tad - p.paidSoFar))), label: `Full ${inr(Math.max(0, p.tad - p.paidSoFar))}` },
            { value: String(Math.round(Math.max(0, p.mad - p.paidSoFar))), label: `Minimum ${inr(Math.max(0, p.mad - p.paidSoFar))}` },
          ]} onChange={setAmount} />
        </>
      )}</Field>
      <p className="note">Deducted from {acct?.name ?? "your account"} in Lifeline. Whatever stays unpaid carries over with interest, and Lifeline adds it to the next bill automatically.</p>
    </Sheet>
  );
}

// ─── Goal planner ───────────────────────────────────────────────────────────
function GoalSheet({ item, preset }: { item?: Goal; preset?: GoalKind }) {
  const { state, update, close, toast } = useApp();
  const startKind: GoalKind = item?.kind ?? preset ?? "trip";
  const defYm = () => { const d = new Date(); d.setFullYear(d.getFullYear() + (startKind === "emergency" ? 1 : 3)); return ymOf(d); };
  const [kind, setKind] = useState<GoalKind>(startKind);
  const [name, setName] = useState(item?.name ?? (preset ? GOAL_KINDS[preset].label : ""));
  const [cost, setCost] = useState(str(item?.costToday ?? (startKind === "emergency" ? Math.round(nextRupeeLadder(state).steps.find(s => s.id === "emergency")?.amount ?? 0) || undefined : undefined)));
  const [ym, setYm] = useState(item?.targetYm ?? defYm());
  const [infl, setInfl] = useState(str(item?.inflationPct ?? GOAL_KINDS[startKind].inflation));
  const [saved, setSaved] = useState(str(item?.saved ?? 0));
  const [profile, setProfile] = useState<RiskProfile>(item?.profile ?? state.wealth.risk ?? "balanced");
  const [monthlyAmt, setMonthlyAmt] = useState(str(item?.monthly ?? 0));
  const [err, setErr] = useState("");
  const draft: Goal = { id: item?.id ?? "draft", name: name || GOAL_KINDS[kind].label, kind, costToday: num(cost) || 0, targetYm: ym, inflationPct: Number.isNaN(num(infl)) ? 6 : num(infl), saved: num(saved) || 0, profile, monthly: num(monthlyAmt) || 0, createdAt: item?.createdAt ?? new Date().toISOString() };
  const plan = useMemo(() => (draft.costToday > 0 ? planGoal(draft) : null), [draft.costToday, draft.targetYm, draft.inflationPct, draft.saved, draft.profile, draft.monthly]); // eslint-disable-line react-hooks/exhaustive-deps
  const free = nextRupeeLadder(state).investable - goalMonthlyTotal(state) + (item?.monthly ?? 0);
  const pickKind = (k: GoalKind) => { setKind(k); if (!name || Object.values(GOAL_KINDS).some(g => g.label === name)) setName(GOAL_KINDS[k].label); setInfl(String(GOAL_KINDS[k].inflation)); };
  const yearsChips = [1, 2, 3, 5, 7, 10].map(y => { const d = new Date(); d.setFullYear(d.getFullYear() + y); return { value: ymOf(d), label: `${y} yr${y > 1 ? "s" : ""}` }; });
  const save = () => {
    if (!(draft.costToday > 0)) return setErr("Enter what it costs today.");
    const rec = { ...draft, id: item?.id ?? uid(), name: draft.name.trim() };
    update(s => ({ ...s, goals: item ? s.goals.map(g => (g.id === item.id ? rec : g)) : [...s.goals, rec] }));
    toast(item ? "Goal updated" : "Goal added"); close();
  };
  const del = item ? () => { if (confirm(`Delete goal “${item.name}”?`)) { update(s => ({ ...s, goals: s.goals.filter(g => g.id !== item.id) })); close(); } } : undefined;
  return (
    <Sheet title={item ? "Goal plan" : "New goal"} subtitle="Inflation and market ups and downs are built in" onClose={close} footer={<SaveBar onSave={save} onDelete={del} label={item ? "Save plan" : "Add goal"} />}>
      <Field label="Goal">{() => <ChoiceChips value={kind} options={(Object.keys(GOAL_KINDS) as GoalKind[]).map(k => ({ value: k, label: GOAL_KINDS[k].label }))} onChange={pickKind} />}</Field>
      <Field label="Name">{id => <TextInput id={id} value={name} onChange={setName} placeholder="e.g. Goa trip with family" />}</Field>
      <Field label="What it costs today" error={err} hint={kind === "emergency" ? "Suggested: 3 months of essentials and EMIs." : undefined}>{id => <MoneyInput id={id} value={cost} onChange={setCost} large />}</Field>
      <Field label="When do you want it?">{id => (
        <>
          <ChoiceChips value={ym} options={yearsChips} onChange={setYm} />
          <input id={id} className="input" type="month" value={ym} min={ymOf(new Date())} onChange={e => e.target.value && setYm(e.target.value)} />
        </>
      )}</Field>
      <div className="inline-2">
        <Field label="Already saved">{id => <MoneyInput id={id} value={saved} onChange={setSaved} />}</Field>
        <Field label="Price rise / year">{id => <NumberInput id={id} value={infl} onChange={setInfl} suffix="%" />}</Field>
      </div>
      {plan && (
        <>
          <div className="quote">
            <div className="quote-head"><span>It will cost about</span><b>{inr(plan.futureCost)}</b><small>in {plan.years < 1 ? `${plan.months} months` : `${plan.years.toFixed(1)} years`}, after {draft.inflationPct}% yearly price rise</small></div>
          </div>
          <Field label="Choose a plan" hint="Monthly amount for an 80% chance of reaching the goal (2,000 simulated markets). The plain average needs less, but fails about half the time.">{() => (
            <div className="plans">
              {plan.plans.map(pl => (
                <button key={pl.profile.id} type="button" className={"plan-opt" + (profile === pl.profile.id ? " on" : "") + (pl.suitable ? "" : " unsuitable")} aria-pressed={profile === pl.profile.id}
                  onClick={() => { setProfile(pl.profile.id); setMonthlyAmt(String(Math.ceil(pl.sipFor80 / 100) * 100)); }}>
                  <span className="plan-top"><b>{pl.profile.label}</b>{plan.recommended === pl.profile.id && <Pill tone="good">Best fit</Pill>}</span>
                  <span className="plan-amt">{inr(Math.ceil(pl.sipFor80 / 100) * 100)}<small>/month</small></span>
                  <small>~{pl.profile.expected}%/yr expected · bad year {pl.profile.worstYear}%</small>
                  {!pl.suitable && <small className="neg">{pl.why}</small>}
                </button>
              ))}
            </div>
          )}</Field>
          <Field label="I'll invest each month" hint={free > 0 ? `You have about ${inr(free)} a month free for goals.` : "Your budget shows no free money yet. Close the gap or clear costly debt first."}>{id => <MoneyInput id={id} value={monthlyAmt} onChange={setMonthlyAmt} />}</Field>
          {plan.chosen && (
            <div className="quote">
              <div className="quote-head"><span>Chance of reaching {inr(plan.futureCost)}</span><b className={plan.chosen.sim.successPct >= 75 ? "pos" : plan.chosen.sim.successPct >= 50 ? "" : "neg"}>{plan.chosen.sim.successPct.toFixed(0)}%</b><small>with {inr(draft.monthly)}/month in a {PROFILES[profile].label.toLowerCase()} mix</small></div>
              <FanChart p10={plan.chosen.sim.path10} p50={plan.chosen.sim.path50} p90={plan.chosen.sim.path90} target={plan.futureCost} />
              <div className="scenarios">
                <div className="sc bad"><small>Tough markets</small><b>{inr(plan.chosen.sim.p10)}</b></div>
                <div className="sc mid"><small>Middle</small><b>{inr(plan.chosen.sim.p50)}</b></div>
                <div className="sc good"><small>Good markets</small><b>{inr(plan.chosen.sim.p90)}</b></div>
              </div>
              {draft.monthly > free && free >= 0 && <p className="field-error">That's more than your free monthly money ({inr(Math.max(0, free))}). Push the date out, pick a cheaper target, or earn a little more.</p>}
            </div>
          )}
          <p className="note">Where to put it: {PROFILES[profile].mix.map(m => `${m.pct}% ${m.label.toLowerCase()}`).join(", ")}. Educational projection, not investment advice.</p>
        </>
      )}
    </Sheet>
  );
}

// ─── Risk quiz ──────────────────────────────────────────────────────────────
function RiskQuizSheet() {
  const { state, update, close, toast } = useApp();
  const [ans, setAns] = useState<number[]>(() => RISK_QUESTIONS.map(() => -1));
  const done = ans.every(a => a >= 0);
  const score = ans.reduce((s, a, i) => s + (a >= 0 ? RISK_QUESTIONS[i].options[a].points : 0), 0);
  const result = done ? riskFromScore(score, state) : null;
  const save = () => {
    if (!result) return;
    update(s => ({ ...s, wealth: { ...s.wealth, risk: result.profile, riskScore: score } }));
    toast(`You're a ${PROFILES[result.profile].label.toLowerCase()} investor`); close();
  };
  return (
    <Sheet title="Your risk profile" subtitle="5 quick questions, no right answers" onClose={close} footer={<SaveBar onSave={save} label={result ? `Save: ${PROFILES[result.profile].label}` : "Answer all 5"} disabled={!done} />}>
      {RISK_QUESTIONS.map((q, i) => (
        <Field key={i} label={`${i + 1}. ${q.q}`}>{() => (
          <ChoiceCards value={String(ans[i])} onChange={v => setAns(a => a.map((x, j) => (j === i ? Number(v) : x)))} options={q.options.map((o, k) => ({ value: String(k), title: o.label }))} />
        )}</Field>
      ))}
      {result && (
        <div className="quote">
          <div className="quote-head"><span>Your profile</span><b>{PROFILES[result.profile].label}</b><small>{PROFILES[result.profile].tagline} · ~{PROFILES[result.profile].expected}% a year expected, bad years down to {PROFILES[result.profile].worstYear}%</small></div>
          {result.capped && <p className="field-error">Your answers suggest Growth, but your EMIs are high right now, so we've set Balanced until your debt is lower. A market crash shouldn't force you to sell to pay EMIs.</p>}
        </div>
      )}
    </Sheet>
  );
}
