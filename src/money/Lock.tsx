// Lifeline — PIN lock screen.
import { useEffect, useState } from "react";
import { hashPin } from "./store";
import { Icon } from "./icons";

export default function Lock({ pinHash, onUnlock, onReset }: { pinHash: string; onUnlock: () => void; onReset: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (pin.length !== 4) return;
    hashPin(pin).then(h => { if (h === pinHash) onUnlock(); else { setErr(true); setPin(""); } });
  }, [pin, pinHash, onUnlock]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin(p => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin(p => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const press = (d: string) => { setErr(false); setPin(p => (p.length < 4 ? p + d : p)); };
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label="Enter PIN">
      <span className="welcome-badge"><Icon name="lock" size={28} /></span>
      <h1>Enter your PIN</h1>
      <div className={"pin-dots" + (err ? " shake" : "")} aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map(i => <span key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      <p className="lock-err" role="alert">{err ? "Wrong PIN, try again" : " "}</p>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <button type="button" className="kp-text" onClick={() => { if (confirm("Forgot PIN? Resetting deletes all Lifeline data on this phone. Restore from a backup afterwards.")) onReset(); }}>Forgot?</button>
        <button type="button" onClick={() => press("0")}>0</button>
        <button type="button" aria-label="Delete digit" onClick={() => setPin(p => p.slice(0, -1))}><Icon name="back" /></button>
      </div>
    </div>
  );
}
