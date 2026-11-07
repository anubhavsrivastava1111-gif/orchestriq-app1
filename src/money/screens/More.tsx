// More — profile, plan, security, connections, help & protection, data.
import { useState } from "react";
import { useApp } from "../context";
import { demoState } from "../store";
import { RED_FLAGS, RESOURCES } from "../resources";
import { RIGHTS } from "../rights";
import { planLabel } from "../entitlements";
import * as vault from "../vault";
import { bioDisable, bioEnable, bioStatus, isNative, nativeInfo, openExternal, pickTextFile } from "../native";
import { Card, Disclosure, Field, List, MoneyInput, Pill, Row, Screen, Section, Segmented, TextInput, Toggle } from "../components";
import { Icon } from "../icons";

const LOCK_OPTIONS = [
  { value: "0", label: "Instantly" }, { value: "30", label: "30 s" }, { value: "60", label: "1 min" }, { value: "300", label: "5 min" },
];

export default function More() {
  const { state, update, replace, open, go, toast, lockNow, resetApp } = useApp();
  const [bio, setBio] = useState(bioStatus);
  const set = <K extends keyof typeof state.settings>(k: K, v: (typeof state.settings)[K]) => update(s => ({ ...s, settings: { ...s.settings, [k]: v } }));
  const info = nativeInfo();

  const toggleBio = async (on: boolean) => {
    if (!on) { bioDisable(); set("bioEnabled", false); setBio(bioStatus()); toast("Fingerprint unlock off"); return; }
    const dek = vault.exportDekForBiometrics();
    if (!dek) return;
    try { await bioEnable(dek); set("bioEnabled", true); toast("Fingerprint unlock on"); }
    catch { toast("Fingerprint wasn't confirmed"); }
    setBio(bioStatus());
  };

  const restore = async () => {
    try { open({ kind: "restore", text: await pickTextFile() }); } catch { /* cancelled */ }
  };

  return (
    <Screen title="More" subtitle="Settings, security, connections and help">
      <Card>
        <div className="profile-card">
          <span className="avatar">{(state.settings.name || "?").slice(0, 1).toUpperCase()}</span>
          <Field label="Your name" hint="Only used on this phone, in greetings and lender letters. Never sent to AI.">{id => <TextInput id={id} value={state.settings.name} onChange={v => set("name", v)} placeholder="Your name" />}</Field>
        </div>
      </Card>

      <Card onClick={() => open({ kind: "paywall" })} className="plan-card">
        <div className="profile-sum">
          <span className="action-icon brand"><Icon name="star" /></span>
          <div><b>{planLabel(state)}</b><p>AI assistant, investments, forecasts, letters and encrypted backups</p></div>
          <Icon name="chevron" size={18} />
        </div>
      </Card>

      <Section title="Connected apps">
        <List>
          <Row icon="sparkle" iconTone="brand" title="AI assistant" subtitle="Gemini, ChatGPT, Claude, Perplexity, Copilot" onClick={() => go("ai")} />
          <Row icon="transfer" iconTone="brand" title="Apps & data connections" subtitle="Notifications, calendar, market prices, UPI and broker apps" onClick={() => go("connect")} />
        </List>
      </Section>

      <Section title="Security & privacy">
        <Card className="security-card">
          <div className="sec-head"><Icon name="shield" /><div><b>Your data is encrypted</b><small>AES-256 · locked by your passcode{isNative ? " · bound to this phone's secure hardware" : ""}</small><small>Wrong passcode attempts are reported to you at the next unlock. Research and market data requests never include your personal data.</small></div></div>
        </Card>
        <List>
          <Row icon="lock" iconTone="brand" title="Change passcode" subtitle="6 digits; re-encrypts your data key" onClick={() => open({ kind: "passcode" })} />
          {isNative && bio.supported && (
            <Toggle checked={state.settings.bioEnabled && bio.enrolledHere} onChange={toggleBio} label="Fingerprint / face unlock"
              description={bio.available ? "Hardware-backed. Turns off automatically if fingerprints change" : "Add a fingerprint in Android settings first"} />
          )}
          {isNative && <Toggle checked={state.settings.blockScreenshots} onChange={v => set("blockScreenshots", v)} label="Block screenshots & hide in recent apps" description="Recommended: stops other apps and screen recorders seeing your money" />}
          <Toggle checked={state.settings.hideAmounts} onChange={v => set("hideAmounts", v)} label="Hide amounts" description="Masks every ₹ figure, useful in public" />
          <div className="row seg-row">
            <span className="row-main"><span className="row-title">Auto-lock</span><span className="row-sub">After leaving the app</span></span>
          </div>
        </List>
        <Segmented label="Auto-lock" value={String(state.settings.autoLockSec)} onChange={v => set("autoLockSec", Number(v))} options={LOCK_OPTIONS} />
        <List><Row icon="lock" title="Lock now" onClick={lockNow} /></List>
      </Section>

      <Section title="Reminders">
        <List>
          <Row icon="bell" iconTone="brand" title="EMI reminders" subtitle={`Fund ${state.settings.bufferDays} day(s) before each EMI`} onClick={() => open({ kind: "reminders" })} />
        </List>
        <Card>
          <Field label="Typical cost of one bounced EMI" hint="Bank and lender charges combined. Used to show what a bounce would cost you.">{id => (
            <MoneyInput id={id} value={String(state.settings.bounceFee)} onChange={v => set("bounceFee", Number(v) || 0)} />
          )}</Field>
        </Card>
      </Section>

      <Section title="Appearance">
        <Segmented label="Theme" value={state.settings.theme} onChange={v => set("theme", v)} options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </Section>

      <Section title="Help & protection">
        <Card tone="warn">
          <div className="flags-head"><Icon name="shield" /> <b>Stay safe</b></div>
          <ul className="flags">{RED_FLAGS.map(r => <li key={r}>{r}</li>)}</ul>
        </Card>
        <Disclosure summary={<b>Your rights under RBI rules</b>}>
          {RIGHTS.map(r => (
            <div key={r.id} className="right">
              <b>{r.title}</b><p>{r.rule}</p><p><b>Use it:</b> {r.use}</p><small className="muted">{r.source}</small>
              {r.letter && <div className="btn-row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => open({ kind: "letter", letter: r.letter })}>Draft the email</button></div>}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openExternal("https://www.rbi.org.in/commonperson/English/Scripts/Notification.aspx")}>Check the latest RBI rules <Icon name="external" size={14} /></button>
        </Disclosure>
        {RESOURCES.map(g => (
          <Disclosure key={g.id} summary={<b>{g.title}</b>}>
            <List>
              {g.items.map(r => (
                <div key={r.title} className="row resource">
                  <span className="row-main"><span className="row-title">{r.title}</span><span className="row-sub">{r.what}</span>
                    <span className="btn-row">
                      {r.url && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openExternal(r.url!)}>Open <Icon name="external" size={14} /></button>}
                      {r.phone && <a className="btn btn-primary btn-sm" href={"tel:" + r.phone}><Icon name="phone" size={14} /> Call {r.phone}</a>}
                    </span>
                  </span>
                </div>
              ))}
            </List>
          </Disclosure>
        ))}
      </Section>

      <Section title="Your data" hint="Stored only on this phone, encrypted. Save an encrypted backup monthly so you can restore on a new phone.">
        <List>
          <Row icon="download" iconTone="brand" title="Save encrypted backup" subtitle="Password-protected file" onClick={() => open({ kind: "backup" })} />
          <Row icon="upload" iconTone="brand" title="Restore backup" subtitle="From a Lifeline backup file" onClick={restore} />
          <Row icon="sparkle" title="Load sample data" subtitle="Replaces your data, for exploring" onClick={() => { if (confirm("Replace your data with sample data?")) { replace({ ...demoState(), settings: { ...demoState().settings, plan: state.settings.plan, bioEnabled: state.settings.bioEnabled } }); toast("Sample data loaded"); } }} />
          <Row icon="trash" iconTone="danger" title="Erase Lifeline on this phone" subtitle="Deletes the vault, keys and reminders. Cannot be undone" onClick={() => { if (confirm("Erase all Lifeline data on this phone? This cannot be undone.")) resetApp(); }} />
        </List>
      </Section>

      <p className="note center">Lifeline {info ? `v${info.version} for Android` : "web"} · <Pill>{planLabel(state)}</Pill><br />General guidance, not regulated financial advice. Part of OrchestrIQ.</p>
    </Screen>
  );
}
