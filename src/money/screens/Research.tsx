// Research — analyse any mutual fund (AMFI NAV history) or stock (Alpha Vantage) from its real price history.
import { useMemo, useState } from "react";
import { useApp } from "../context";
import { inr } from "../engine";
import { searchFunds, type MfScheme } from "../market";
import { RESEARCH_SITES, analyse, fundHistory, monthly, projectFromHistory, sipBacktest, stockHistory, verdict, type History } from "../research";
import { copyText, isNative, openExternal, shareText } from "../native";
import type { FundMetrics, WatchItem } from "../types";
import { uid } from "../store";
import { Button, Card, ChoiceChips, Empty, LineChart, List, MoneyInput, Row, Section, Segmented } from "../components";
import { Icon } from "../icons";

const fmtPct = (v?: number) => (v === undefined ? "–" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`);

export default function Research() {
  const { state, update, toast } = useApp();
  const [kind, setKind] = useState<"mf" | "stock">("mf");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MfScheme[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<{ item: Omit<WatchItem, "id" | "addedAt">; hist: History } | null>(null);

  const load = async (k: "mf" | "stock", code: string, name: string) => {
    setBusy(true); setErr(""); setResults([]);
    try {
      const hist = k === "mf" ? await fundHistory(code) : await stockHistory(code, state.integrations.alphaVantageKey);
      if (hist.points.length < 13) throw new Error("Not enough history to analyse (needs at least a year).");
      const metrics = analyse(hist.points);
      setSel({ item: { kind: k, code, name: hist.name || name, category: hist.category, metrics }, hist });
      // refresh cached numbers if it's on the watchlist
      update(s => ({ ...s, watchlist: s.watchlist.map(w => (w.kind === k && w.code === code ? { ...w, metrics, name: hist.name || w.name } : w)) }));
    } catch (e) { setErr((e as Error).message || "Couldn't load data. Check your internet."); }
    setBusy(false);
  };
  const search = async () => {
    if (kind === "stock") { if (q.trim()) load("stock", q.trim().toUpperCase(), q.trim().toUpperCase()); return; }
    setBusy(true); setErr("");
    try { const r = await searchFunds(q); setResults(r); if (!r.length) setErr("No funds found. Try fewer words, e.g. “parag flexi”."); } catch { setErr("Search failed. Check your internet."); }
    setBusy(false);
  };

  if (sel) return <Analysis sel={sel} onBack={() => setSel(null)} onWatch={() => {
    if (state.watchlist.some(w => w.kind === sel.item.kind && w.code === sel.item.code)) { toast("Already on your watchlist"); return; }
    update(s => ({ ...s, watchlist: [...s.watchlist, { ...sel.item, id: uid(), addedAt: new Date().toISOString() }] })); toast("Added to watchlist");
  }} />;

  return (
    <>
      <Card>
        <Segmented label="Research type" value={kind} onChange={v => { setKind(v); setResults([]); setErr(""); }} options={[{ value: "mf", label: "Mutual fund" }, { value: "stock", label: "Stock" }]} />
        <div className="key-input" style={{ marginTop: 12 }}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} aria-label={kind === "mf" ? "Fund name" : "Stock symbol"}
            placeholder={kind === "mf" ? "Fund name, e.g. Nifty 50 index" : "Symbol, e.g. RELIANCE.BSE or AAPL"}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
          <Button size="sm" variant="primary" onClick={search} disabled={busy || q.trim().length < (kind === "mf" ? 3 : 1)}>{busy ? "…" : kind === "mf" ? "Search" : "Analyse"}</Button>
        </div>
        {kind === "stock" && !state.integrations.alphaVantageKey && <p className="note">Stocks need a free Alpha Vantage key (Connected apps). Mutual funds work without any key.</p>}
        {err && <p className="field-error">{err}</p>}
        {results.length > 0 && <div className="results">{results.map(f => <button key={f.schemeCode} type="button" className="result" onClick={() => load("mf", String(f.schemeCode), f.schemeName)}>{f.schemeName}</button>)}</div>}
        {busy && <p className="note">Fetching full price history…</p>}
      </Card>

      <Section title="Watchlist">
        {state.watchlist.length === 0 ? <Empty icon="star" title="Nothing saved yet" text="Analyse a fund or stock and tap “Watch” to keep it here." /> : (
          <List>
            {state.watchlist.map(w => (
              <Row key={w.id} icon={w.kind === "mf" ? "grow" : "chart"} iconTone="brand" title={w.name}
                subtitle={w.metrics ? `5y ${fmtPct(w.metrics.cagr5)} · 3y ${fmtPct(w.metrics.cagr3)} · swings ${w.metrics.vol.toFixed(0)}%` : w.category}
                onClick={() => load(w.kind, w.code, w.name)} />
            ))}
          </List>
        )}
      </Section>

      <Card>
        <div className="privacy-row"><Icon name="shield" size={18} /><b>Private by design</b></div>
        <p>Only the fund code or stock symbol is sent to the data source. Nothing about you or your money leaves the encrypted vault.</p>
      </Card>
    </>
  );
}

function Analysis({ sel, onBack, onWatch }: { sel: { item: Omit<WatchItem, "id" | "addedAt">; hist: History }; onBack: () => void; onWatch: () => void }) {
  const { state, open, toast } = useApp();
  const mt = sel.item.metrics as FundMetrics;
  const v = verdict(mt);
  const m = useMemo(() => monthly(sel.hist.points), [sel]);
  const [sip, setSip] = useState("5000");
  const [years, setYears] = useState("5");
  const [lump, setLump] = useState("0");
  const [ahead, setAhead] = useState("5");
  const bt = useMemo(() => sipBacktest(sel.hist.points, Number(sip) || 0, Number(years)), [sel, sip, years]);
  const proj = useMemo(() => projectFromHistory(sel.hist.points, Number(lump) || 0, Number(sip) || 0, Number(ahead) * 12), [sel, lump, sip, ahead]);
  const infl = state.wealth.inflationPct;
  const real = (x: number) => x / Math.pow(1 + infl / 100, Number(ahead));
  const sites = RESEARCH_SITES(sel.item.kind, sel.item.code, sel.item.name);

  const aiPrompt = `Analyse this ${sel.item.kind === "mf" ? "mutual fund" : "stock"} for an Indian retail investor. Explain strengths, risks and what kind of investor and time horizon it suits. Compare with a low-cost Nifty 50 index fund and a 7% FD. Do not promise returns.\n\nName: ${sel.item.name}\nCategory: ${sel.item.category}\nHistory: ${mt.years.toFixed(1)} years (to ${new Date(mt.asOf).toLocaleDateString("en-IN")})\nReturns a year: 1y ${fmtPct(mt.cagr1)}, 3y ${fmtPct(mt.cagr3)}, 5y ${fmtPct(mt.cagr5)}, 10y ${fmtPct(mt.cagr10)}\nVolatility: ${mt.vol.toFixed(1)}% a year; biggest fall ${mt.maxDrawdown.toFixed(0)}%; worst 12 months ${mt.worstYear.toFixed(0)}%; best 12 months ${mt.bestYear.toFixed(0)}%\n${mt.rolling3 ? `Rolling 3-year returns: min ${mt.rolling3.min.toFixed(1)}%, median ${mt.rolling3.median.toFixed(1)}%, max ${mt.rolling3.max.toFixed(1)}%; beat a 7% FD in ${mt.rolling3.pctBeatFd.toFixed(0)}% of periods` : ""}\nMy risk profile: ${state.wealth.risk ?? "not set"}.`;
  const askAi = async () => {
    if (isNative) { await shareText(aiPrompt, "Fund analysis"); return; }
    await copyText(aiPrompt); toast("Copied. Paste it into ChatGPT, Gemini or Claude"); openExternal("https://claude.ai/new?q=" + encodeURIComponent(aiPrompt));
  };

  return (
    <>
      <div className="screen-head">
        <button type="button" className="icon-btn" aria-label="Back to research" onClick={onBack}><Icon name="back" /></button>
        <div className="screen-titles" style={{ flex: 1 }}><h1 className="h-small">{sel.item.name}</h1><p>{sel.item.category}{sel.hist.house ? ` · ${sel.hist.house}` : ""}</p></div>
      </div>
      <Card>
        <div className="kpi-row">
          <div><small>{sel.item.kind === "mf" ? "NAV" : "Price"}</small><b>{inr(mt.last).replace(/\.00$/, "")}</b></div>
          <div><small>5-yr return/yr</small><b className={(mt.cagr5 ?? 0) >= 0 ? "pos" : "neg"}>{fmtPct(mt.cagr5 ?? mt.cagr3)}</b></div>
          <div><small>Swings/yr</small><b>{mt.vol.toFixed(1)}%</b></div>
        </div>
        <LineChart values={m.map(p => p.v)} labels={[new Date(m[0].t).getFullYear().toString(), "Now"]} tone={(mt.cagr5 ?? 0) >= 0 ? "good" : "danger"} />
      </Card>

      <Section title="Track record">
        <Card>
          <div className="metric-grid">
            <div><small>1 year</small><b>{fmtPct(mt.cagr1)}</b></div>
            <div><small>3 years /yr</small><b>{fmtPct(mt.cagr3)}</b></div>
            <div><small>5 years /yr</small><b>{fmtPct(mt.cagr5)}</b></div>
            <div><small>10 years /yr</small><b>{fmtPct(mt.cagr10)}</b></div>
            <div><small>Biggest fall</small><b className="neg">{fmtPct(mt.maxDrawdown)}</b></div>
            <div><small>Worst 12 months</small><b className="neg">{fmtPct(mt.worstYear)}</b></div>
            <div><small>Best 12 months</small><b className="pos">{fmtPct(mt.bestYear)}</b></div>
            <div><small>Beat 7% FD (3-yr periods)</small><b>{mt.rolling3 ? mt.rolling3.pctBeatFd.toFixed(0) + "%" : "–"}</b></div>
          </div>
          {mt.rolling3 && <p className="note">Any 3-year stretch returned between {fmtPct(mt.rolling3.min)} and {fmtPct(mt.rolling3.max)} a year (typical {fmtPct(mt.rolling3.median)}). That spread is the honest range of outcomes.</p>}
        </Card>
        <Card tone={v.tone === "good" ? "good" : v.tone === "warn" ? "warn" : "danger"}>
          <b>What the numbers say</b>
          <ul className="flags">{v.lines.map(l => <li key={l}>{l}</li>)}</ul>
        </Card>
      </Section>

      <Section title="If you had invested monthly">
        <Card>
          <div className="inline-2">
            <div className="field"><label>Each month</label><MoneyInput id="bt-sip" value={sip} onChange={setSip} /></div>
            <div className="field"><label>For the last</label><ChoiceChips value={years} options={["3", "5", "10"].map(y => ({ value: y, label: y + " yrs" }))} onChange={setYears} /></div>
          </div>
          {bt ? (
            <div className="bt">
              <div><small>You'd have put in</small><b>{inr(bt.invested)}</b></div>
              <div><small>Worth today</small><b className={bt.value >= bt.invested ? "pos" : "neg"}>{inr(bt.value)}</b></div>
              <div><small>Yearly return</small><b>{fmtPct(bt.xirr)}</b></div>
            </div>
          ) : <p className="note">Not enough history for this period.</p>}
        </Card>
      </Section>

      <Section title="Possible futures" hint="Built from this investment's own past monthly ups and downs, replayed in 1,500 random orders. Not a prediction.">
        <Card>
          <div className="inline-2">
            <div className="field"><label>Lump sum now</label><MoneyInput id="pj-lump" value={lump} onChange={setLump} /></div>
            <div className="field"><label>Years ahead</label><ChoiceChips value={ahead} options={["3", "5", "10", "15"].map(y => ({ value: y, label: y }))} onChange={setAhead} /></div>
          </div>
          <p className="note">Plus {inr(Number(sip) || 0)} every month.</p>
          {proj ? (
            <div className="scenarios">
              <div className="sc bad"><small>Tough markets (1 in 10)</small><b>{inr(proj.p10)}</b></div>
              <div className="sc mid"><small>Middle outcome</small><b>{inr(proj.p50)}</b><span>≈ {inr(real(proj.p50))} in today's money</span></div>
              <div className="sc good"><small>Good markets (1 in 10)</small><b>{inr(proj.p90)}</b></div>
              <p className="note">You'd invest {inr(proj.invested)}. Adjusted for {infl}% inflation. The past can't guarantee the future.</p>
            </div>
          ) : <p className="note">Needs at least 2 years of history.</p>}
        </Card>
      </Section>

      <div className="btn-row wrap">
        <Button variant="primary" icon="sparkle" onClick={askAi}>Ask AI to analyse</Button>
        <Button icon="star" onClick={onWatch}>Watch</Button>
        {sel.item.kind === "mf" && <Button icon="plus" onClick={() => open({ kind: "holding" })}>I own this</Button>}
      </div>
      <Section title="Deeper research">
        <div className="chips">{sites.map(s => <button key={s.url} type="button" className="chip" onClick={() => openExternal(s.url)}>{s.label} <Icon name="external" size={14} /></button>)}</div>
      </Section>
      <p className="note">Data: {sel.item.kind === "mf" ? "AMFI NAVs via mfapi.in" : "Alpha Vantage"}. <b>Educational analysis, not a recommendation to buy or sell.</b></p>
    </>
  );
}
