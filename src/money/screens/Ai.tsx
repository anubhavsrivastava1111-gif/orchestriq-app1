// AI — hand off to the AI apps on the phone, or chat with the built-in Claude assistant.
import { useMemo, useRef, useState } from "react";
import { useApp } from "../context";
import { AI_APPS, AI_TASKS, buildContext, buildPrompt, type AiApp, type AiTask } from "../ai";
import { askClaude, AssistantError, type ChatTurn } from "../claude";
import { copyText, installedApps, isNative, openExternal, shareText } from "../native";
import { isPro } from "../entitlements";
import { Button, Card, Disclosure, Pill, Screen, Section, Segmented } from "../components";
import { Icon } from "../icons";

interface Bubble { role: "user" | "assistant"; text: string; error?: boolean }

export default function Ai() {
  const { state, update, open, go, toast } = useApp();
  const [task, setTask] = useState<AiTask>(AI_TASKS[0]);
  const [extra, setExtra] = useState("");
  const installed = useMemo(() => installedApps(AI_APPS.map(a => a.pkg)), []);
  const prompt = buildPrompt(task, state, extra);
  const mode = state.settings.aiShare;
  const ready = !task.needsInput || extra.trim().length > 2;

  const sendTo = async (app: AiApp) => {
    if (!ready) { toast("Type your question first"); return; }
    if (isNative && installed.has(app.pkg)) { await shareText(prompt, "My money question", app.pkg); return; }
    if (isNative) { await shareText(prompt, "My money question"); return; }
    if (app.prefill) { openExternal(app.web + encodeURIComponent(prompt)); return; }
    await copyText(prompt);
    toast(`Copied. Paste it into ${app.name}`);
    openExternal(app.web);
  };

  return (
    <Screen title="AI assistant" subtitle="Get answers about your own money">
      <div className="ai-hero">
        <Icon name="sparkle" size={22} />
        <div>
          <b>Your AI, your choice</b>
          <p>Send a private summary to the AI app you already use, or chat right here.</p>
        </div>
      </div>

      <Section title="1. What do you want help with?">
        <div className="task-grid">
          {AI_TASKS.map(t => (
            <button key={t.id} type="button" className={"task" + (task.id === t.id ? " on" : "")} aria-pressed={task.id === t.id} onClick={() => { setTask(t); setExtra(""); }}>
              <Icon name={t.icon} size={18} /><b>{t.title}</b><small>{t.subtitle}</small>
            </button>
          ))}
        </div>
        {task.needsInput && (
          <textarea className="input textarea" rows={3} value={extra} onChange={e => setExtra(e.target.value)} placeholder={task.needsInput} aria-label={task.needsInput} />
        )}
      </Section>

      <Section title="2. Send to an AI app" hint={isNative ? "Opens the app with your question ready. It uses your own subscription, so there's no extra cost." : "Opens the AI in a new tab with your question."}>
        <div className="ai-apps">
          {AI_APPS.map(a => (
            <button key={a.id} type="button" className="ai-app" onClick={() => sendTo(a)} disabled={!ready}>
              <span className="ai-logo" style={{ background: a.color }}>{a.name[0]}</span>
              <b>{a.name}</b>
              <small>{isNative ? (installed.has(a.pkg) ? "Installed" : "Choose app") : "Web"}</small>
            </button>
          ))}
        </div>
        <Card>
          <div className="privacy-row">
            <Icon name="shield" size={18} />
            <span>Amounts in the summary</span>
          </div>
          <Segmented label="Amounts shared" value={mode} onChange={v => update(s => ({ ...s, settings: { ...s.settings, aiShare: v } }))} options={[
            { value: "rounded", label: "Rounded" }, { value: "exact", label: "Exact" }, { value: "none", label: "Hidden" },
          ]} />
          <p className="note">Never shared: your name, account numbers, lender account details or API keys.</p>
          <Disclosure summary={<span>Preview exactly what will be sent</span>}>
            <pre className="letter">{prompt}</pre>
            <Button size="sm" icon="copy" onClick={async () => { await copyText(prompt); toast("Copied"); }}>Copy text</Button>
          </Disclosure>
        </Card>
      </Section>

      <Section title="3. Or chat here" action={<Pill tone="brand">Pro</Pill>}>
        {!isPro(state) ? (
          <Card onClick={() => open({ kind: "paywall", feature: "ai" })}><p>Unlock the built-in assistant with Lifeline Pro.</p></Card>
        ) : !state.integrations.anthropicKey ? (
          <Card>
            <div className="connect-cta">
              <span className="ai-logo" style={{ background: "#d97757" }}>C</span>
              <div>
                <b>Connect Claude</b>
                <p>Add your own Claude API key once. It's stored encrypted on this phone and sent only to Anthropic.</p>
              </div>
            </div>
            <div className="btn-row">
              <Button variant="primary" size="sm" onClick={() => go("connect")}>Add key</Button>
              <Button size="sm" onClick={() => openExternal("https://console.anthropic.com/settings/keys")}>Get a key</Button>
            </div>
          </Card>
        ) : (
          <Chat apiKey={state.integrations.anthropicKey} context={buildContext(state)} starter={task.id !== "custom" ? task.prompt : ""} />
        )}
      </Section>
    </Screen>
  );
}

function Chat({ apiKey, context, starter }: { apiKey: string; context: string; starter: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setBubbles(b => [...b, { role: "user", text: question }, { role: "assistant", text: "" }]);
    abort.current = new AbortController();
    try {
      const r = await askClaude(apiKey, context, history, question, delta => {
        setBubbles(b => { const c = [...b]; c[c.length - 1] = { ...c[c.length - 1], text: c[c.length - 1].text + delta }; return c; });
        endRef.current?.scrollIntoView({ block: "end" });
      }, abort.current.signal);
      setBubbles(b => { const c = [...b]; c[c.length - 1] = { role: "assistant", text: r.text }; return c; });
      setHistory(r.history);
    } catch (e) {
      const msg = e instanceof AssistantError ? e.message : (e as Error).name === "AbortError" ? "Stopped." : "Something went wrong. Try again.";
      setBubbles(b => { const c = [...b]; c[c.length - 1] = { role: "assistant", text: msg, error: true }; return c; });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  return (
    <Card className="chat">
      {bubbles.length === 0 && (
        <div className="chat-empty">
          <p>Ask about your EMIs, spending, investments or a plan. Claude sees your current summary, never your name or account numbers.</p>
          {starter && <Button size="sm" icon="sparkle" onClick={() => send(starter)}>Ask: {starter.split(".")[0]}</Button>}
        </div>
      )}
      <div className="bubbles" aria-live="polite">
        {bubbles.map((b, i) => (
          <div key={i} className={"bubble " + b.role + (b.error ? " error" : "")}>
            {b.text || (busy && i === bubbles.length - 1 ? <span className="typing">Thinking<i>.</i><i>.</i><i>.</i></span> : "")}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(input); }}>
        <textarea className="input" rows={1} value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your money…" aria-label="Your question"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        {busy
          ? <Button size="sm" onClick={() => abort.current?.abort()}>Stop</Button>
          : <Button size="sm" variant="primary" icon="arrowRight" disabled={!input.trim()} aria-label="Send" onClick={() => send(input)} />}
      </form>
      <p className="note">Answers are general guidance, not regulated financial advice. Usage is billed to your Anthropic account.</p>
    </Card>
  );
}
