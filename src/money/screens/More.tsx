// More — profile, security, help & protection, data.
import { useRef } from "react";
import { useApp } from "../context";
import { EMPTY, demoState, exportJson, parseBackup } from "../store";
import { RED_FLAGS, RESOURCES } from "../resources";
import { Card, Disclosure, Field, List, MoneyInput, Row, Screen, Section, Segmented, TextInput, Toggle } from "../components";
import { Icon } from "../icons";

export default function More() {
  const { state, update, replace, open, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof state.settings>(k: K, v: (typeof state.settings)[K]) => update(s => ({ ...s, settings: { ...s.settings, [k]: v } }));
  const restore = async (f: File) => {
    const parsed = parseBackup(await f.text());
    if (!parsed) return toast("That file isn't a Lifeline backup");
    replace(parsed); toast("Backup restored");
  };
  return (
    <Screen title="More" subtitle="Settings, help and your data">
      <Card>
        <div className="profile-card">
          <span className="avatar">{(state.settings.name || "?").slice(0, 1).toUpperCase()}</span>
          <Field label="Your name" hint="Used in greetings and lender letters.">{id => <TextInput id={id} value={state.settings.name} onChange={v => set("name", v)} placeholder="Your name" />}</Field>
        </div>
      </Card>

      <Section title="Security & privacy">
        <List>
          <Row icon="lock" iconTone="brand" title="App lock (PIN)" subtitle={state.settings.pinHash ? "On: asked every time the app opens" : "Off"} onClick={() => open({ kind: "pin" })} />
          <Toggle checked={state.settings.hideAmounts} onChange={v => set("hideAmounts", v)} label="Hide amounts" description="Masks every ₹ figure, useful in public" />
        </List>
      </Section>

      <Section title="Reminders & alerts">
        <List>
          <Row icon="bell" iconTone="brand" title="EMI reminders" subtitle={`Fund ${state.settings.bufferDays} day(s) before · ${state.settings.calendarAdded ? "in calendar" : "not set up"}`} onClick={() => open({ kind: "reminders" })} />
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
        {RESOURCES.map(g => (
          <Disclosure key={g.id} summary={<b>{g.title}</b>}>
            <List>
              {g.items.map(r => (
                <div key={r.title} className="row resource">
                  <span className="row-main"><span className="row-title">{r.title}</span><span className="row-sub">{r.what}</span>
                    <span className="btn-row">
                      {r.url && <a className="btn btn-secondary btn-sm" href={r.url} target="_blank" rel="noreferrer noopener">Open <Icon name="external" size={14} /></a>}
                      {r.phone && <a className="btn btn-primary btn-sm" href={"tel:" + r.phone}><Icon name="phone" size={14} /> Call {r.phone}</a>}
                    </span>
                  </span>
                </div>
              ))}
            </List>
          </Disclosure>
        ))}
      </Section>

      <Section title="Your data" hint="Stored only on this phone. Clearing browser data deletes it, so export a backup every month.">
        <List>
          <Row icon="download" iconTone="brand" title="Export backup" subtitle="Save a file you can restore later" onClick={() => exportJson(state)} />
          <Row icon="upload" iconTone="brand" title="Restore backup" subtitle="From a Lifeline backup file" onClick={() => fileRef.current?.click()} />
          <Row icon="sparkle" title="Load sample data" subtitle="Replaces your data, for exploring" onClick={() => { if (confirm("Replace your data with sample data?")) { replace(demoState()); toast("Sample data loaded"); } }} />
          <Row icon="trash" iconTone="danger" title="Delete all data" subtitle="Cannot be undone" onClick={() => { if (confirm("Delete all Lifeline data from this phone? This cannot be undone.")) { replace(EMPTY); toast("All data deleted"); } }} />
        </List>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      </Section>

      <p className="note center">Lifeline gives general guidance, not regulated financial advice. Part of <a href="/">OrchestrIQ</a>.</p>
    </Screen>
  );
}
