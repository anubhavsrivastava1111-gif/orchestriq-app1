// Lifeline — app shell: header, bottom navigation, sheets, toasts, lock.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MoneyState } from "./types";
import { Ctx, type AppCtx, type SheetState, type Tab } from "./context";
import { EMPTY, useMoneyState } from "./store";
import { fundingPlan, inr, setHideAmounts, upcomingDues, ymKey } from "./engine";
import { SheetHost } from "./sheets";
import { Icon } from "./icons";
import Lock from "./Lock";
import Home from "./screens/Home";
import Bills from "./screens/Bills";
import Insights from "./screens/Insights";
import Earn from "./screens/Earn";
import More from "./screens/More";

const NAV: { id: Tab | "add"; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "bills", label: "Bills", icon: "calendar" },
  { id: "add", label: "Add", icon: "plus" },
  { id: "insights", label: "Insights", icon: "chart" },
  { id: "earn", label: "Earn", icon: "grow" },
];
const TABS: Tab[] = ["home", "bills", "insights", "earn", "more"];

function readHash(): { tab: Tab; sub: string } {
  const [t, s] = location.hash.slice(1).split("/");
  return { tab: TABS.includes(t as Tab) ? (t as Tab) : "home", sub: s ?? "" };
}

export default function MoneyApp() {
  const [state, setState] = useMoneyState();
  const [{ tab, sub }, setNav] = useState(readHash);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toastMsg, setToast] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const [locked, setLocked] = useState(() => !!state.settings.pinHash);
  const hiddenAt = useRef(0);

  setHideAmounts(state.settings.hideAmounts); // must run before children render

  // Theme
  useEffect(() => {
    const t = state.settings.theme;
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [state.settings.theme]);

  // Navigation <-> URL hash (Android back button works between tabs)
  useEffect(() => {
    const onHash = () => { setNav(readHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((t: Tab, s?: string) => {
    const h = "#" + t + (s ? "/" + s : "");
    if (location.hash !== h) location.hash = h; else setNav({ tab: t, sub: s ?? "" });
    window.scrollTo({ top: 0 });
  }, []);

  // Re-lock after 60 s in the background
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (state.settings.pinHash && Date.now() - hiddenAt.current > 60000 && hiddenAt.current) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state.settings.pinHash]);

  const toast = useCallback((msg: string, undo?: () => void) => setToast({ msg, undo, id: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToast(null), toastMsg.undo ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const ctx: AppCtx = useMemo(() => ({
    state,
    update: fn => setState(s => fn(s)),
    replace: (s: MoneyState) => setState(s),
    go, sub,
    open: s => setSheet(s),
    close: () => setSheet(null),
    toast,
  }), [state, setState, go, sub, toast]);

  useReminderNotifications(state, locked);

  if (locked && state.settings.pinHash) {
    return <Lock pinHash={state.settings.pinHash} onUnlock={() => setLocked(false)} onReset={() => { setState(EMPTY); setLocked(false); }} />;
  }

  const onboarding = !state.accounts.length && !state.loans.length;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="appbar">
          <button type="button" className="appbar-brand" onClick={() => go("home")} aria-label="Lifeline home">
            <span className="brand-mark"><Icon name="shield" size={18} /></span>
            <span>Lifeline</span>
          </button>
          <div className="appbar-actions">
            <button type="button" className="icon-btn" aria-pressed={state.settings.hideAmounts} aria-label={state.settings.hideAmounts ? "Show amounts" : "Hide amounts"}
              onClick={() => setState(s => ({ ...s, settings: { ...s.settings, hideAmounts: !s.settings.hideAmounts } }))}>
              <Icon name={state.settings.hideAmounts ? "eyeOff" : "eye"} />
            </button>
            <button type="button" className={"icon-btn" + (tab === "more" ? " on" : "")} aria-label="More: settings and help" onClick={() => go("more")}>
              <Icon name="menu" />
            </button>
          </div>
        </header>

        <main className="content" id="main">
          {tab === "home" && <Home />}
          {tab === "bills" && <Bills />}
          {tab === "insights" && <Insights />}
          {tab === "earn" && <Earn />}
          {tab === "more" && <More />}
        </main>

        {!onboarding && (
          <nav className="tabbar" aria-label="Main">
            {NAV.map(n => n.id === "add" ? (
              <button key="add" type="button" className="tab-add" aria-label="Add" onClick={() => setSheet({ kind: "quick-add" })}>
                <span><Icon name="plus" size={24} /></span>
              </button>
            ) : (
              <button key={n.id} type="button" className={"tab" + (tab === n.id ? " on" : "")} aria-current={tab === n.id ? "page" : undefined} onClick={() => go(n.id as Tab)}>
                <Icon name={n.icon} size={22} /><span>{n.label}</span>
              </button>
            ))}
          </nav>
        )}

        {sheet && <SheetHost sheet={sheet} />}

        {toastMsg && (
          <div className="toast" role="status" key={toastMsg.id}>
            <Icon name="check" size={18} /><span>{toastMsg.msg}</span>
            {toastMsg.undo && <button type="button" onClick={() => { toastMsg.undo!(); setToast(null); }}>Undo</button>}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

// In-app notification once a day when something needs action (calendar is the primary channel).
function useReminderNotifications(state: MoneyState, locked: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (locked || done.current || !state.settings.remindersOn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    done.current = true;
    const key = "lifeline-notified-" + new Date().toDateString();
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { /* ignore */ }
    const urgent = upcomingDues(state).filter(d => d.status === "fund-now" || d.status === "due-today");
    const short = fundingPlan(state).filter(p => p.shortfall > 0);
    if (!urgent.length && !short.length) return;
    const body = short.length
      ? short.map(p => `Add ${inr(p.shortfall)} to ${p.account.name}`).join(" · ")
      : urgent.map(d => `${d.loan.name} ${inr(d.loan.emi)} on ${d.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`).join(" · ");
    navigator.serviceWorker?.getRegistration("/money/").then(reg => {
      if (reg) reg.showNotification("Lifeline: EMI action needed", { body, icon: "/icon-192.png", tag: "lifeline-" + ymKey(new Date()) });
      else new Notification("Lifeline: EMI action needed", { body });
    }).catch(() => { /* ignore */ });
  }, [state, locked]);
}
