// Lifeline — welcome, passcode creation, fingerprint offer and lock screen.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MoneyState } from "./types";
import { Icon } from "./icons";
import { Button } from "./components";
import { FREE_ATTEMPTS, lockoutRemaining, unlockWithDek, unlockWithPasscode, WrongPasscode } from "./vault";
import { bioStatus, bioUnlock, isNative } from "./native";

const LEN = 6;

// ─── Keypad ─────────────────────────────────────────────────────────────────
function PasscodePad({ title, subtitle, error, busy, onComplete, footer, disabled }: {
  title: string; subtitle?: string; error?: string; busy?: boolean; disabled?: boolean;
  onComplete: (code: string) => void; footer?: React.ReactNode;
}) {
  const [code, setCode] = useState("");
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (code.length === LEN) { const c = code; setTimeout(() => { setCode(""); done.current(c); }, 120); }
  }, [code]);
  const press = useCallback((d: string) => { if (!busy && !disabled) setCode(c => (c.length < LEN ? c + d : c)); }, [busy, disabled]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setCode(c => c.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label={title}>
      <span className="welcome-badge"><Icon name="lock" size={28} /></span>
      <h1>{title}</h1>
      {subtitle && <p className="lock-sub">{subtitle}</p>}
      <div className={"pin-dots" + (error ? " shake" : "")} aria-live="polite" aria-label={`${code.length} of ${LEN} digits entered`}>
        {Array.from({ length: LEN }, (_, i) => <span key={i} className={i < code.length ? "on" : ""} />)}
      </div>
      <p className="lock-err" role="alert">{busy ? "Checking…" : error || " "}</p>
      <div className="keypad" aria-disabled={disabled}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => <button key={d} type="button" disabled={disabled} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button type="button" disabled={disabled} onClick={() => press("0")}>0</button>
        <button type="button" aria-label="Delete digit" onClick={() => setCode(c => c.slice(0, -1))}><Icon name="back" /></button>
      </div>
      {footer && <div className="lock-footer">{footer}</div>}
    </div>
  );
}

// ─── Welcome ────────────────────────────────────────────────────────────────
export function Welcome({ onStart, hasLegacy }: { onStart: () => void; hasLegacy: boolean }) {
  return (
    <div className="gate">
      <div className="gate-hero">
        <span className="welcome-badge big"><Icon name="shield" size={34} /></span>
        <h1>Lifeline</h1>
        <p>Never miss an EMI. Know where every rupee goes. Find ways to earn more, with AI at your side.</p>
      </div>
      <ul className="welcome-points">
        <li><Icon name="bell" /> Reminders before every EMI, even when the app is closed</li>
        <li><Icon name="transfer" /> Which account to top up, from where, and by when</li>
        <li><Icon name="sparkle" /> AI help with Gemini, ChatGPT or Claude</li>
        <li><Icon name="chart" /> Investments, savings plan and debt-free date</li>
        <li><Icon name="lock" /> Bank-grade encryption. Your data never leaves your phone</li>
      </ul>
      {hasLegacy && <p className="note">We found your earlier Lifeline data. It will be moved into the encrypted vault.</p>}
      <Button variant="primary" full onClick={onStart}>Get started: create a passcode</Button>
      <p className="note center">No sign-up, no bank login, no SMS access.</p>
    </div>
  );
}

// ─── Create passcode ────────────────────────────────────────────────────────
export function CreatePasscode({ onDone, onCancel, title = "Create a passcode" }: { onDone: (code: string) => Promise<void> | void; onCancel?: () => void; title?: string }) {
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const weak = (c: string) => /^(\d)\1{5}$/.test(c) || "0123456789".includes(c) || "9876543210".includes(c);
  return (
    <PasscodePad
      key={first === null ? "a" : "b"}
      title={first === null ? title : "Confirm your passcode"}
      subtitle={first === null ? "6 digits. It encrypts your data, so keep it to yourself." : "Enter the same 6 digits again"}
      error={err} busy={busy}
      onComplete={async code => {
        if (first === null) {
          if (weak(code)) { setErr("Too easy to guess. Avoid 111111 or 123456."); return; }
          setErr(""); setFirst(code);
        } else if (code !== first) {
          setErr("Didn't match. Start again."); setFirst(null);
        } else {
          setBusy(true);
          try { await onDone(code); } finally { setBusy(false); }
        }
      }}
      footer={onCancel ? <button type="button" className="text-btn" onClick={onCancel}>Cancel</button> : undefined}
    />
  );
}

// ─── Fingerprint offer ──────────────────────────────────────────────────────
export function BioOffer({ onEnable, onSkip }: { onEnable: () => Promise<boolean>; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="gate">
      <div className="gate-hero">
        <span className="welcome-badge big"><Icon name="user" size={34} /></span>
        <h1>Unlock with fingerprint?</h1>
        <p>Faster than typing your passcode. Your fingerprint never leaves the phone. Lifeline only gets a yes/no from Android's secure hardware.</p>
      </div>
      <Button variant="primary" full disabled={busy} onClick={async () => { setBusy(true); const ok = await onEnable(); setBusy(false); if (!ok) onSkip(); }}>Use fingerprint / face</Button>
      <Button variant="ghost" full onClick={onSkip}>Not now</Button>
    </div>
  );
}

// ─── Lock screen ────────────────────────────────────────────────────────────
export function LockScreen({ bioOn, onUnlock, onReset }: { bioOn: boolean; onUnlock: (s: MoneyState) => void; onReset: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(lockoutRemaining());
  const bio = isNative && bioOn && bioStatus().enrolledHere;
  const tried = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait(lockoutRemaining()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  const tryBio = useCallback(async () => {
    try {
      const dek = await bioUnlock();
      setBusy(true);
      onUnlock(await unlockWithDek(dek));
    } catch (e) {
      const m = (e as Error).message;
      if (m === "invalidated") setErr("Fingerprints changed on this phone. Use your passcode, then turn fingerprint unlock on again.");
      else if (m !== "cancelled") setErr("Fingerprint didn't work. Use your passcode.");
      setBusy(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    if (bio && !tried.current && wait <= 0) { tried.current = true; tryBio(); }
  }, [bio, tryBio, wait]);

  const submit = async (code: string) => {
    setBusy(true); setErr("");
    try {
      onUnlock(await unlockWithPasscode(code));
    } catch (e) {
      if (e instanceof WrongPasscode) {
        if (e.lockedForSec > 0) { setWait(e.lockedForSec); setErr(""); }
        else setErr(`Wrong passcode. ${e.attemptsLeft} ${e.attemptsLeft === 1 ? "try" : "tries"} left before a short lockout.`);
      } else setErr("Couldn't open your data. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <PasscodePad
      title={wait > 0 ? "Too many attempts" : "Enter your passcode"}
      subtitle={wait > 0 ? `For your security, try again in ${wait >= 60 ? Math.ceil(wait / 60) + " min" : wait + " s"}.` : `After ${FREE_ATTEMPTS} wrong tries, Lifeline pauses for a while.`}
      error={err} busy={busy} disabled={wait > 0} onComplete={submit}
      footer={
        <>
          {bio && <Button icon="user" onClick={tryBio} disabled={wait > 0}>Use fingerprint</Button>}
          <button type="button" className="text-btn" onClick={() => { if (confirm("Forgot your passcode? Your data is encrypted with it, so the only option is to erase Lifeline on this phone and start again (or restore an encrypted backup). Erase now?")) onReset(); }}>Forgot passcode?</button>
        </>
      }
    />
  );
}
