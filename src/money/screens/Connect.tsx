// Connected apps — everything Lifeline links to, in one place.
import { useMemo, useState } from "react";
import { useApp } from "../context";
import { AI_APPS } from "../ai";
import { BROKER_APPS, UPI_APPS, type AppLink } from "../market";
import { installedApps, isNative, nativeInfo, notificationsEnabled, openApp, openExternal, requestNotifications } from "../native";
import { looksLikeAnthropicKey } from "../claude";
import { Button, Card, Field, List, Pill, Row, Screen, Section } from "../components";
import { Icon } from "../icons";

function KeyField({ label, value, onSave, placeholder, validate, help }: { label: string; value: string; onSave: (v: string) => void; placeholder: string; validate: (v: string) => string; help: React.ReactNode }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  if (value) {
    return (
      <div className="key-row">
        <span className="row-main"><span className="row-title">{label}</span><span className="row-sub">Connected · ••••{value.slice(-4)} · stored encrypted</span></span>
        <Button size="sm" variant="danger" onClick={() => onSave("")}>Remove</Button>
      </div>
    );
  }
  return (
    <Field label={label} error={err} hint={help}>{id => (
      <div className="key-input">
        <input id={id} className="input" type="password" autoComplete="off" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder} />
        <Button size="sm" variant="primary" onClick={() => { const e = validate(draft); setErr(e); if (!e) { onSave(draft.trim()); setDraft(""); } }}>Save</Button>
      </div>
    )}</Field>
  );
}

export default function Connect() {
  const { state, update, open, toast } = useApp();
  const all = useMemo(() => installedApps([...AI_APPS.map(a => a.pkg), ...UPI_APPS.map(a => a.pkg), ...BROKER_APPS.map(a => a.pkg)]), []);
  const [notif, setNotif] = useState(() => notificationsEnabled());
  const info = nativeInfo();
  const setKey = (k: "anthropicKey" | "alphaVantageKey", v: string) => { update(s => ({ ...s, integrations: { ...s.integrations, [k]: v } })); toast(v ? "Connected" : "Disconnected"); };

  const launch = (a: AppLink) => { if (!(isNative && all.has(a.pkg) && openApp(a.pkg))) openExternal(a.web); };
  const appRows = (apps: AppLink[], icon: string) => apps.map(a => (
    <Row key={a.id} icon={icon} iconTone={all.has(a.pkg) ? "good" : ""} title={a.name} subtitle={isNative ? (all.has(a.pkg) ? "Installed: tap to open" : "Not installed: opens website") : "Opens website"} onClick={() => launch(a)} />
  ));

  return (
    <Screen title="Connected apps" subtitle="Lifeline works with the apps and services you already use">
      <Section title="Reminders & alerts">
        <List>
          {isNative ? (
            <Row icon="bell" iconTone={notif ? "good" : "warn"} title="Phone notifications" subtitle={notif ? "On: you'll be alerted before every EMI" : "Off: tap to allow"}
              onClick={async () => { const ok = await requestNotifications(); setNotif(ok); toast(ok ? "Notifications on" : "Allow notifications in Android settings → Apps → Lifeline"); }} />
          ) : null}
          <Row icon="calendar" iconTone={state.settings.calendarAdded ? "good" : "brand"} title="Calendar" subtitle={state.settings.calendarAdded ? "EMIs added to your calendar" : "Add all EMIs to Google Calendar"} onClick={() => open({ kind: "reminders" })} />
        </List>
      </Section>

      <Section title="AI assistants" hint="Send a private summary to any of these from the AI screen.">
        <List>
          {AI_APPS.map(a => (
            <Row key={a.id} icon="sparkle" iconTone={all.has(a.pkg) ? "good" : ""} title={a.name} subtitle={isNative ? (all.has(a.pkg) ? "Installed" : "Not installed: uses website") : "Website"} />
          ))}
        </List>
        <Card>
          <KeyField label="Claude API key (built-in chat)" value={state.integrations.anthropicKey} placeholder="sk-ant-…"
            validate={v => (looksLikeAnthropicKey(v) ? "" : "That doesn't look like a Claude API key (it starts with sk-ant-).")}
            onSave={v => setKey("anthropicKey", v)}
            help={<>Get one at <button type="button" className="link-inline" onClick={() => openExternal("https://console.anthropic.com/settings/keys")}>console.anthropic.com</button>. Usage is billed to your Anthropic account.</>} />
        </Card>
      </Section>

      <Section title="Markets & investments">
        <Card>
          <div className="key-row">
            <span className="row-main"><span className="row-title">Mutual fund NAVs</span><span className="row-sub">Built in (AMFI data via mfapi.in). No key needed</span></span>
            <Pill tone="good">On</Pill>
          </div>
          <KeyField label="Stock prices: Alpha Vantage key" value={state.integrations.alphaVantageKey} placeholder="Your free key"
            validate={v => (/^[A-Za-z0-9]{8,}$/.test(v.trim()) ? "" : "Paste the key exactly as shown on alphavantage.co")}
            onSave={v => setKey("alphaVantageKey", v)}
            help={<>Free at <button type="button" className="link-inline" onClick={() => openExternal("https://www.alphavantage.co/support/#api-key")}>alphavantage.co</button> (25 lookups a day). Indian stocks use the format RELIANCE.BSE.</>} />
        </Card>
        <List>{appRows(BROKER_APPS, "chart")}</List>
      </Section>

      <Section title="Payments (UPI)" hint="Use these to move money between your accounts when Lifeline asks you to.">
        <List>{appRows(UPI_APPS, "transfer")}</List>
      </Section>

      <Card>
        <div className="privacy-row"><Icon name="shield" size={18} /><b>How connections stay safe</b></div>
        <ul className="flags">
          <li>Keys are stored inside your encrypted vault and never shown again in full.</li>
          <li>Lifeline can only talk to api.anthropic.com, api.mfapi.in and alphavantage.co. Everything else is blocked.</li>
          <li>Opening another app only passes the text you approved. Lifeline never reads data from other apps.</li>
        </ul>
        {info && <p className="note">Android app v{info.version} · Android API {info.sdk}</p>}
      </Card>
    </Screen>
  );
}
