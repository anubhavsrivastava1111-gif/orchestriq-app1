// Lifeline — app shell: security gate, header, bottom navigation, sheets, toasts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MoneyState } from "./types";
import { Ctx, type AppCtx, type SheetState, type Tab } from "./context";
import { EMPTY, clearLegacy, readLegacy } from "./store";
import { setHideAmounts } from "./engine";
import * as vault from "./vault";
import { bioDisable, bioEnable, bioStatus, isNative, scheduleReminders, setNativeTheme, setSecureScreen, wipeNative } from "./native";
import { buildReminders } from "./remindersPlan";
import { SheetHost } from "./sheets";
import { Icon } from "./icons";
import { BioOffer, CreatePasscode, LockScreen, Welcome } from "./Lock";
import Home from "./screens/Home";
import Bills from "./screens/Bills";
import Insights from "./screens/Insights";
import Grow from "./screens/Grow";
import More from "./screens/More";
import Ai from "./screens/Ai";
import Connect from "./screens/Connect";
import CardDetail from "./screens/CardDetail";
import { rollAllCards } from "./cards";

type Phase = "welcome" | "create" | "bio-offer" | "locked" | "ready";

const NAV: { id: Tab | "add"; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "bills", label: "Bills", icon: "calendar" },
  { id: "add", label: "Add", icon: "plus" },
  { id: "insights", label: "Insights", icon: "chart" },
  { id: "earn", label: "Grow", icon: "grow" },
];
const TABS: Tab[] = ["home", "bills", "insights", "earn", "more", "ai", "connect", "card"];

function readHash(): { tab: Tab; sub: string } {
  const [t, s] = location.hash.slice(1).split("/");
  return { tab: TABS.includes(t as Tab) ? (t as Tab) : "home", sub: s ?? "" };
}

const prefersDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export default function MoneyApp() {
  const [phase, setPhase] = useState<Phase>(() => (vault.vaultExists() ? "locked" : "welcome"));
  const [state, setState] = useState<MoneyState>(EMPTY);
  const [{ tab, sub }, setNav] = useState(readHash);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toastMsg, setToast] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const stateRef = useRef(state);
  const hiddenAt = useRef(0);
  const sheetRef = useRef(sheet);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);
  const legacy = useMemo(() => (phase === "welcome" ? readLegacy() : null), [phase]);

  setHideAmounts(state.settings.hideAmounts); // must run before children render

  // ─── Theme (web + Android system bars) ────────────────────────────────────
  useEffect(() => {
    const t = state.settings.theme;
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    setNativeTheme(t === "dark" || (t === "system" && prefersDark()));
  }, [state.settings.theme]);

  // ─── Navigation <-> URL hash ──────────────────────────────────────────────
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

  // ─── Encrypted auto-save ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => { vault.save(state); }, 250);
    return () => clearTimeout(t);
  }, [state, phase]);

  const lockNow = useCallback(() => {
    if (!vault.isUnlocked()) return;
    vault.save(stateRef.current).finally(() => vault.lock());
    setSheet(null);
    setState(EMPTY);
    setPhase("locked");
  }, []);

  const resetApp = useCallback(() => {
    vault.wipeVault();
    wipeNative();
    clearLegacy();
    setSheet(null);
    setState(EMPTY);
    setPhase("welcome");
    location.hash = "home";
  }, []);

  // ─── Auto-lock when the app goes to the background ────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (phase !== "ready") return;
      const after = stateRef.current.settings.autoLockSec;
      if (document.hidden) {
        hiddenAt.current = Date.now();
        if (after === 0) lockNow();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current >= after * 1000) {
        lockNow();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, lockNow]);

  // ─── Android: screenshot blocking + reminder notifications ────────────────
  useEffect(() => {
    if (phase === "ready") setSecureScreen(state.settings.blockScreenshots);
  }, [phase, state.settings.blockScreenshots]);
  useEffect(() => {
    if (!isNative || phase !== "ready") return;
    const t = setTimeout(() => scheduleReminders(buildReminders(state)), 1200);
    return () => clearTimeout(t);
  }, [phase, state.loans, state.cards, state.accounts, state.incomes, state.settings.bufferDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Android back button ──────────────────────────────────────────────────
  useEffect(() => {
    window.LifelineOnBack = () => {
      if (sheetRef.current) { setSheet(null); return true; }
      const cur = readHash().tab;
      if (phase === "ready" && cur !== "home") { go("home"); return true; }
      return false;
    };
    return () => { window.LifelineOnBack = undefined; };
  }, [phase, go]);

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
    toast, lockNow, resetApp,
  }), [state, go, sub, toast, lockNow, resetApp]);

  // ─── Security gate ────────────────────────────────────────────────────────
  if (phase === "welcome") return <Welcome hasLegacy={!!legacy} onStart={() => setPhase("create")} />;
  if (phase === "create") {
    return (
      <CreatePasscode
        onCancel={() => setPhase("welcome")}
        onDone={async code => {
          const initial = readLegacy() ?? EMPTY;
          await vault.createVault(code, initial);
          clearLegacy();
          setState(initial);
          const b = bioStatus();
          setPhase(b.available ? "bio-offer" : "ready");
        }}
      />
    );
  }
  if (phase === "bio-offer") {
    return (
      <BioOffer
        onSkip={() => setPhase("ready")}
        onEnable={async () => {
          const dek = vault.exportDekForBiometrics();
          if (!dek) return false;
          try {
            await bioEnable(dek);
            setState(s => ({ ...s, settings: { ...s.settings, bioEnabled: true } }));
            setPhase("ready");
            return true;
          } catch { bioDisable(); return false; }
        }}
      />
    );
  }
  if (phase === "locked") {
    // Credit cards: statements that came due while the app was closed are generated on unlock.
    return <LockScreen bioOn onUnlock={s => {
      setState(rollAllCards(s)); setPhase("ready");
      // Security: tell the owner if someone tried wrong passcodes since the last unlock.
      const rep = vault.takeUnlockReport();
      if (rep && rep.fails > 0) setTimeout(() => toast(`⚠ ${rep.fails} wrong passcode attempt${rep.fails > 1 ? "s" : ""} since your last unlock`), 400);
    }} onReset={resetApp} />;
  }

  const onboarding = !state.accounts.length && !state.loans.length && !state.cards.length;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="appbar">
          <button type="button" className="appbar-brand" onClick={() => go("home")} aria-label="Lifeline home">
            <span className="brand-mark"><Icon name="shield" size={18} /></span>
            <span>Lifeline</span>
          </button>
          <div className="appbar-actions">
            <button type="button" className={"icon-btn ai-btn" + (tab === "ai" ? " on" : "")} aria-label="AI assistant" onClick={() => go("ai")}>
              <Icon name="sparkle" />
            </button>
            <button type="button" className="icon-btn" aria-pressed={state.settings.hideAmounts} aria-label={state.settings.hideAmounts ? "Show amounts" : "Hide amounts"}
              onClick={() => setState(s => ({ ...s, settings: { ...s.settings, hideAmounts: !s.settings.hideAmounts } }))}>
              <Icon name={state.settings.hideAmounts ? "eyeOff" : "eye"} />
            </button>
            <button type="button" className="icon-btn" aria-label="Lock now" onClick={lockNow}>
              <Icon name="lock" />
            </button>
            <button type="button" className={"icon-btn" + (tab === "more" || tab === "connect" ? " on" : "")} aria-label="More: settings and help" onClick={() => go("more")}>
              <Icon name="menu" />
            </button>
          </div>
        </header>

        <main className="content" id="main">
          {tab === "home" && <Home />}
          {tab === "bills" && <Bills />}
          {tab === "insights" && <Insights />}
          {tab === "earn" && <Grow />}
          {tab === "more" && <More />}
          {tab === "ai" && <Ai />}
          {tab === "connect" && <Connect />}
          {tab === "card" && <CardDetail />}
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
