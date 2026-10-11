import React, { useEffect, useMemo, useState } from "react";
import { applicability, COSO_PRINCIPLES, type Entity, type Applies } from "./lib/compliance/Frameworks";
import { PROCESSES, type Control, type Freq } from "./lib/compliance/ControlLibrary";
import { StartHere, ProcessReview, RolesView, BoardroomLinkPanel, type ReviewState, type LinkState } from "./ComplianceReview";
import type { ReviewProcess } from "./lib/compliance/ReviewGuide";
import { TOD_QUESTIONS, MW_INDICATORS, controlStatus, programme, ownerScorecard, raci, sodConflicts, roadmap, buildRacmWorkbook, type States, type ControlState, type Overall } from "./lib/compliance/ControlEngine";

// COMPLIANCE & CONTROLS - a Chief Compliance Officer / CFO / Internal Audit workbench.
// Applicability, process maps, RCM, ownership, testing and deficiency evaluation are all
// deterministic. Data stays in this browser (localStorage) until a shared backend exists.
const V = { text: "var(--oiq-ink)", text2: "var(--oiq-body)", text3: "var(--oiq-muted)", border: "var(--oiq-border)", surface: "var(--oiq-surface)", surface2: "var(--oiq-surface2)", accent: "var(--oiq-accent)", ok: "var(--oiq-success)", warn: "var(--oiq-warning)", bad: "var(--oiq-danger)" };
const STATUS_COLOR: Record<Overall, string> = { Effective: "#16A34A", Designed: "#2563EB", "Not started": "#94A3B8", "Design gap": "#DC2626", Deficient: "#DC2626", Remediating: "#D97706", "Not applicable": "#CBD5E1" };
const APPLY_COLOR: Record<Applies, string> = { REQUIRED: "#DC2626", LIKELY: "#D97706", "GOOD PRACTICE": "#2563EB", "NOT REQUIRED": "#94A3B8" };
const KEY = "oiq-compliance-v1";
// Defined at module level so inputs keep focus while typing (a component created inside render remounts every keystroke).
function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: V.text2, minWidth: 0 }}>{label}{children}</label>; }
interface Store { entities: Entity[]; scope: Record<string, string[]>; states: States; sod: Record<string, Record<string, [string, string][]>>; custom: Control[]; fin: Record<string, { pbt: number; rev: number }>; review?: Record<string, Record<string, ReviewState>>; links?: Record<string, LinkState | null> }
const newEntity = (n: number, name = "", country = "India"): Entity => ({ id: "e" + Date.now() + n, name: name || "Entity " + n, country, type: "Private", listedIn: [], turnoverCr: 0, borrowingsCr: 0, paidUpCr: 0, netWorthCr: 0, employees: 0, personalData: true, euData: false, ukBusiness: false, usNexus: false, govtDealings: false });
// Saved data from before new areas existed: if an entity had every original area in scope, add the new ones too.
const ORIGINAL_AREAS = ["p2p", "o2c", "r2r", "payroll", "te", "inv", "fa", "treasury", "itgc", "elc"];
const migrate = (st: Store): Store => { const all = PROCESSES.map((p) => p.id); const scope: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(st.scope || {})) scope[k] = ORIGINAL_AREAS.every((a) => v.includes(a)) ? Array.from(new Set([...v, ...all])) : v;
  return { ...st, scope }; };
const load = (company: string): Store => { try { const v = localStorage.getItem(KEY); if (v) return migrate(JSON.parse(v)); } catch {} const e = newEntity(1, company || "My company"); return { entities: [e], scope: { [e.id]: PROCESSES.map((p) => p.id) }, states: {}, sod: {}, custom: [], fin: {} }; };

export default function ComplianceView({ company = "", showToast, boardroomSessions = [], boardroomCurrent, location = "", onAskBoardroom }:
  { company?: string; showToast?: (m: string, k?: string) => void; boardroomSessions?: any[]; boardroomCurrent?: any; location?: string; onAskBoardroom?: (q: string) => void }) {
  const [S, setS] = useState<Store>(() => load(company));
  const [tab, setTab] = useState<"start" | "review" | "roles" | "landscape" | "process" | "testing" | "owners" | "roadmap">("start");
  const [rp, setRp] = useState<ReviewProcess>("te");
  const [eid, setEid] = useState<string>(() => S.entities[0]?.id || "");
  const [pid, setPid] = useState("p2p"); const [cid, setCid] = useState("P2P-01");
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, [S]);
  const ent = S.entities.find((e) => e.id === eid) || S.entities[0];
  const scope = (ent && S.scope[ent.id]) || PROCESSES.map((p) => p.id);
  const prog = useMemo(() => (ent ? programme(ent, scope, S.states, S.custom) : null), [ent, scope, S.states, S.custom]);
  const toast = (m: string, k = "info") => { try { showToast && showToast(m, k); } catch {} };
  const setEnt = (patch: Partial<Entity>) => setS((s) => ({ ...s, entities: s.entities.map((e) => (e.id === ent.id ? { ...e, ...patch } : e)) }));
  const kOf = (c: string) => ent.id + ":" + c;
  const getSt = (c: string): ControlState => S.states[kOf(c)] || {};
  const setSt = (c: string, patch: Partial<ControlState>) => setS((s) => ({ ...s, states: { ...s.states, [kOf(c)]: { ...(s.states[kOf(c)] || {}), ...patch } } }));
  const allCtl = (p: string) => [...(PROCESSES.find((x) => x.id === p)?.controls || []), ...S.custom.filter((c) => c.process === p)];
  const ctl = [...PROCESSES.flatMap((p) => p.controls), ...S.custom].find((c) => c.id === cid);
  const exportXlsx = async () => { try { const ExcelJS: any = (await import("exceljs")).default; const wb = await buildRacmWorkbook(ExcelJS, ent, scope, S.states, S.custom); const buf = await wb.xlsx.writeBuffer();
    const u = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const a = document.createElement("a"); a.href = u; a.download = "RACM-" + (ent.name || "entity").replace(/[^A-Za-z0-9]+/g, "-") + ".xlsx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); toast("Risk & Control Matrix downloaded.", "success"); } catch (e: any) { toast("Export failed: " + (e?.message || e), "warning"); } };

  const card: React.CSSProperties = { border: "1px solid " + V.border, borderRadius: 12, background: V.surface, padding: "14px 16px", marginBottom: 14 };
  const inp: React.CSSProperties = { minHeight: 38, padding: "0 10px", borderRadius: 8, border: "1px solid " + V.border, background: V.surface, color: V.text, fontSize: 13.5, width: "100%", boxSizing: "border-box" };
  const btn = (on = false): React.CSSProperties => ({ minHeight: 38, padding: "0 14px", borderRadius: 8, border: "1px solid " + (on ? V.accent : V.border), background: on ? V.accent : V.surface, color: on ? "#fff" : V.text, fontWeight: 700, fontSize: 13, cursor: "pointer" });
  const chip = (t: string, c: string) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: "#fff", background: c, whiteSpace: "nowrap" }}>{t}</span>;
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text3, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid " + V.border, color: V.text, fontSize: 12.5, verticalAlign: "top" };
  const num = (v: number, f: (n: number) => void) => <input inputMode="decimal" style={inp} value={v ? String(v) : ""} onChange={(e) => { const n = parseFloat(e.target.value); f(isFinite(n) && n >= 0 ? n : 0); }} />;
  if (!ent || !prog) return null;

  return (
    <div data-testid="compliance" style={{ padding: "18px 20px", maxWidth: 1240, margin: "0 auto", color: V.text }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div><div style={{ fontSize: 20, fontWeight: 800 }}>Compliance & Controls</div>
          <div style={{ fontSize: 13, color: V.text3 }}>Review any process like an experienced controller: ask the right questions, prove with data that controls catch problems, and assign every fix — SOX, COSO 2013, Companies Act IFC, CARO and global regimes.</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select aria-label="Entity" value={ent.id} onChange={(e) => setEid(e.target.value)} style={{ ...inp, width: "auto" }}>{S.entities.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.country})</option>)}</select>
          <button data-testid="cmp-export" onClick={exportXlsx} style={btn()}>Export RACM (Excel)</button>
        </div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {([["start", "Start here"], ["review", "Review a process"], ["roles", "Who does what"], ["landscape", "Laws & entities"], ["process", "Control library & testing"]] as const).map(([k, l]) => { const on = tab === k || (k === "process" && ["process", "testing", "owners", "roadmap"].includes(tab));
          return <button key={k} role="tab" aria-selected={on} data-testid={"cmp-tab-" + k} onClick={() => setTab(k)} style={btn(on)}>{l}</button>; })}
      </div>
      {["process", "testing", "owners", "roadmap"].includes(tab) && <div role="tablist" aria-label="Control library" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, paddingLeft: 10, borderLeft: "3px solid " + V.accent }}>
        {([["process", "Process maps & control matrix"], ["testing", "Test a control"], ["owners", "Owner scorecard"], ["roadmap", "Implementation path"]] as const).map(([k, l]) =>
          <button key={k} role="tab" aria-selected={tab === k} data-testid={"cmp-tab-" + k + (k === "process" ? "-sub" : "")} onClick={() => setTab(k)} style={{ ...btn(tab === k), fontSize: 12.5, minHeight: 34 }}>{l}</button>)}
      </div>}

      {tab === "start" && <StartHere onStart={(p) => { setRp(p); setTab("review"); }} />}
      {tab === "review" && <>
        <BoardroomLinkPanel sessions={boardroomSessions} current={boardroomCurrent} location={location} company={company} link={(S.links || {})[ent.id] || null}
          onPlug={(sum, patch) => { setS((s) => ({ ...s, entities: s.entities.map((e) => (e.id === ent.id ? { ...e, ...patch } : e)), scope: { ...s.scope, [ent.id]: sum.suggested }, links: { ...(s.links || {}), [ent.id]: { id: sum.id, question: sum.question, date: sum.date, decision: sum.decision, risks: sum.risks } } })); toast("Linked to the Boardroom decision. Profile and scope carried over.", "success"); }}
          onUnplug={() => { setS((s) => ({ ...s, links: { ...(s.links || {}), [ent.id]: null } })); toast("Unplugged. Values stay as they are and are now manual.", "info"); }} />
        <ProcessReview p={rp} setP={setRp} entity={ent.name} link={(S.links || {})[ent.id] || null} risks={((S.links || {})[ent.id]?.risks) || []}
          st={((S.review || {})[ent.id] || {})[rp] || { scope: {}, answers: {} }}
          set={(patch) => setS((s) => { const all = { ...(s.review || {}) }; const mine = { ...(all[ent.id] || {}) }; mine[rp] = { ...(mine[rp] || { scope: {}, answers: {} }), ...patch }; all[ent.id] = mine; return { ...s, review: all }; })}
          onRecord={(control, population, exceptions, test) => { setSt(control, { sample: population, exceptions, testDate: new Date().toISOString().slice(0, 10), notes: "From detection test: " + test }); toast("Recorded against " + control + ". Complete its design test under Control library → Test a control.", "success"); }}
          onAsk={onAskBoardroom} owners={Object.fromEntries(Object.entries(S.states).filter(([k]) => k.startsWith(ent.id + ":")).map(([k, v]) => [k.split(":")[1], (v as ControlState).owner || ""]))}
          setOwner={(c, n) => setSt(c, { owner: n })} />
      </>}
      {tab === "roles" && <RolesView names={Object.fromEntries(Object.entries(S.states).filter(([k]) => k.startsWith(ent.id + ":")).map(([k, v]) => [k.split(":")[1], [(v as ControlState).owner, (v as ControlState).performer].filter(Boolean) as string[]]))} />}

      {/* Programme summary strip (library and laws views) */}
      {!["start", "review", "roles"].includes(tab) && <div data-testid="cmp-summary" style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {[["Controls in scope", prog.total + " (" + prog.key + " key)"], ["Owners named", prog.assigned + "%"], ["Design effective", prog.designed + "%"], ["Key controls effective", prog.keyEffective + "%"],
          ["Material weaknesses", String(prog.mw)], ["Significant deficiencies", String(prog.sd)], ["Overdue remediation", String(prog.overdue)]].map(([k, v]) =>
          <div key={k}><div style={{ fontSize: 11, color: V.text3 }}>{k}</div><div style={{ fontWeight: 800, fontSize: 16, color: (k.startsWith("Material") && v !== "0") || (k.startsWith("Overdue") && v !== "0") ? V.bad : V.text }}>{v}</div></div>)}
        <div style={{ gridColumn: "1 / -1", fontWeight: 800, color: prog.opinion.startsWith("EFFECTIVE") ? V.ok : prog.opinion.startsWith("NOT EFFECTIVE") ? V.bad : V.warn }}>Conclusion for {ent.name}: {prog.opinion}</div>
      </div>}

      {tab === "landscape" && <>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Entity profile — drives which laws apply</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <L label="Entity name"><input style={inp} value={ent.name} onChange={(e) => setEnt({ name: e.target.value })} /></L>
            <L label="Country of incorporation"><input style={inp} value={ent.country} onChange={(e) => setEnt({ country: e.target.value })} /></L>
            <L label="Company type"><select style={inp} value={ent.type} onChange={(e) => setEnt({ type: e.target.value as Entity["type"] })}><option>Private</option><option>Public unlisted</option><option>Listed</option></select></L>
            <L label="Turnover (₹ crore)">{num(ent.turnoverCr, (n) => setEnt({ turnoverCr: n }))}</L>
            <L label="Borrowings (₹ crore)">{num(ent.borrowingsCr, (n) => setEnt({ borrowingsCr: n }))}</L>
            <L label="Paid-up capital (₹ crore)">{num(ent.paidUpCr, (n) => setEnt({ paidUpCr: n }))}</L>
            <L label="Net worth (₹ crore)">{num(ent.netWorthCr, (n) => setEnt({ netWorthCr: n }))}</L>
            <L label="Employees">{num(ent.employees, (n) => setEnt({ employees: n }))}</L>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10, fontSize: 13, color: V.text2 }}>
            <span style={{ fontWeight: 700 }}>Listed in:</span>
            {["India", "US", "UK", "Japan", "China", "Australia", "Singapore"].map((x) => <label key={x}><input type="checkbox" checked={ent.listedIn.includes(x)} onChange={(e) => setEnt({ listedIn: e.target.checked ? [...ent.listedIn, x] : ent.listedIn.filter((y) => y !== x), type: e.target.checked ? "Listed" : ent.type })} /> {x}</label>)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 8, fontSize: 13, color: V.text2 }}>
            {([["subsidiaryOfUSListed", "Subsidiary of a US-listed group"], ["accelerated", "US accelerated filer"], ["usNexus", "US business nexus"], ["ukBusiness", "Carries on business in the UK"], ["euData", "Processes EU/UK personal data"], ["personalData", "Processes personal data in India"], ["govtDealings", "Deals with government officials"], ["operatesSites", "Operates a factory, plant, warehouse or site"]] as [keyof Entity, string][]).map(([k, l]) =>
              <label key={k}><input type="checkbox" checked={!!ent[k]} onChange={(e) => setEnt({ [k]: e.target.checked } as any)} /> {l}</label>)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button data-testid="cmp-add-entity" style={btn()} onClick={() => { const e = newEntity(S.entities.length + 1); setS((s) => ({ ...s, entities: [...s.entities, e], scope: { ...s.scope, [e.id]: PROCESSES.map((p) => p.id) } })); setEid(e.id); }}>+ Add entity / country</button>
            {S.entities.length > 1 && <button style={{ ...btn(), color: V.bad }} onClick={() => { if (!window.confirm("Remove " + ent.name + " and its test records?")) return; setS((s) => ({ ...s, entities: s.entities.filter((e) => e.id !== ent.id) })); setEid(S.entities.find((e) => e.id !== ent.id)!.id); }}>Remove this entity</button>}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Laws and frameworks for {ent.name}</div>
          <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}><thead><tr><th style={th}>Framework / law</th><th style={th}>Status</th><th style={th}>Why</th><th style={th}>What it requires</th></tr></thead>
            <tbody>{applicability(ent).map((a) => <tr key={a.fw.id}><td style={td}><b>{a.fw.name}</b><div style={{ color: V.text3, fontSize: 11 }}>{a.fw.region} · {a.fw.ref}</div></td><td style={td}>{chip(a.status, APPLY_COLOR[a.status])}</td><td style={td}>{a.why}</td><td style={td}>{a.fw.obligations.join("; ")}</td></tr>)}</tbody></table></div>
          <div style={{ fontSize: 11.5, color: V.text3, marginTop: 6 }}>Indicative applicability based on the profile above and the law as understood in 2026. Confirm with your statutory auditor and legal counsel; group structure and thresholds can change the answer.</div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Group view — all entities</div>
          <div style={{ overflowX: "auto" }}><table data-testid="cmp-group" style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}><thead><tr>{["Entity", "Country", "Required regimes", "Controls", "Owners", "Designed", "Key effective", "MW / SD", "Overdue", "Conclusion"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{S.entities.map((e) => { const p = programme(e, S.scope[e.id] || [], S.states, S.custom); return <tr key={e.id} onClick={() => setEid(e.id)} style={{ cursor: "pointer", background: e.id === ent.id ? V.surface2 : undefined }}>
              <td style={td}><b>{e.name}</b></td><td style={td}>{e.country}</td><td style={td}>{applicability(e).filter((a) => a.status === "REQUIRED").length}</td><td style={td}>{p.total}</td><td style={td}>{p.assigned}%</td><td style={td}>{p.designed}%</td><td style={td}>{p.keyEffective}%</td>
              <td style={{ ...td, color: p.mw ? V.bad : V.text }}>{p.mw} / {p.sd}</td><td style={{ ...td, color: p.overdue ? V.bad : V.text }}>{p.overdue}</td><td style={td}>{p.opinion.split(" —")[0].split(" (")[0]}</td></tr>; })}</tbody></table></div>
        </div>
      </>}

      {tab === "process" && <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {PROCESSES.map((p) => <button key={p.id} data-testid={"cmp-proc-" + p.id} onClick={() => { setPid(p.id); setCid(p.controls[0].id); }} style={{ ...btn(pid === p.id), opacity: scope.includes(p.id) ? 1 : 0.5 }}>{p.name}</button>)}
        </div>
        {(() => { const p = PROCESSES.find((x) => x.id === pid)!; const inS = scope.includes(p.id); const rc = raci(p, S.custom); const sodA = (S.sod[ent.id] || {})[p.id] || [];
          const laneH = 74, colW = 170, left = 132, W = left + p.steps.length * colW + 20, H = p.lanes.length * laneH + 10;
          const pos = (i: number) => ({ x: left + i * colW + 12, y: p.lanes.indexOf(p.steps[i].lane) * laneH + 14 });
          return <>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div><div style={{ fontWeight: 800 }}>{p.name} — process map</div><div style={{ fontSize: 12.5, color: V.text2 }}>{p.objective}</div></div>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={inS} onChange={(e) => setS((s) => ({ ...s, scope: { ...s.scope, [ent.id]: e.target.checked ? [...scope, p.id] : scope.filter((x) => x !== p.id) } }))} /> In scope for {ent.name}</label>
              </div>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <svg data-testid="cmp-map" width={W} height={H} viewBox={"0 0 " + W + " " + H} role="img" aria-label={p.name + " process map"} style={{ display: "block" }}>
                  {p.lanes.map((l, i) => <g key={l}><rect x={0} y={i * laneH} width={W} height={laneH} fill={i % 2 ? "rgba(127,127,127,0.06)" : "transparent"} stroke="rgba(127,127,127,0.25)" />
                    <text x={8} y={i * laneH + laneH / 2 + 4} fontSize={11.5} fontWeight={700} style={{ fill: "var(--oiq-ink)" }}>{l.length > 18 ? l.slice(0, 17) + "…" : l}</text></g>)}
                  {p.steps.map((s, i) => { if (i === 0) return null; const a = pos(i - 1), b = pos(i); const x1 = a.x + 140, y1 = a.y + 20, x2 = b.x, y2 = b.y + 20, mx = (x1 + x2) / 2;
                    return <path key={"a" + i} d={"M" + x1 + "," + y1 + " L" + mx + "," + y1 + " L" + mx + "," + y2 + " L" + (x2 - 4) + "," + y2} fill="none" stroke="rgba(127,127,127,0.7)" strokeWidth={1.4} markerEnd="url(#arr)" />; })}
                  <defs><marker id="arr" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="rgba(127,127,127,0.8)" /></marker></defs>
                  {p.steps.map((s, i) => { const q = pos(i); const words = s.label.split(" "); const lines: string[] = []; let cur = ""; for (const w of words) { if ((cur + " " + w).trim().length > 22) { lines.push(cur.trim()); cur = w; } else cur += " " + w; } lines.push(cur.trim());
                    return <g key={s.id}><rect x={q.x} y={q.y} width={140} height={40} rx={7} style={{ fill: "var(--oiq-surface)", stroke: "var(--oiq-accent)", strokeWidth: 1.3 }} />
                      {lines.slice(0, 2).map((ln, j) => <text key={j} x={q.x + 70} y={q.y + (lines.length > 1 ? 16 + j * 13 : 24)} fontSize={10.5} textAnchor="middle" style={{ fill: "var(--oiq-ink)" }}>{ln}</text>)}
                      {s.controls.map((c, j) => { const st = controlStatus(allCtl(p.id).find((x) => x.id === c)!, getSt(c)).overall; return <g key={c} style={{ cursor: "pointer" }} onClick={() => { setCid(c); setTab("testing"); }}>
                        <rect x={q.x + j * 70} y={q.y + 44} width={66} height={16} rx={8} fill={STATUS_COLOR[st]} /><text x={q.x + j * 70 + 33} y={q.y + 55.5} fontSize={9.5} fontWeight={800} textAnchor="middle" fill="#fff">{c}</text><title>{c}: {st} — click to test</title></g>; })}</g>; })}
                </svg>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: V.text3, marginTop: 6 }}>{(Object.keys(STATUS_COLOR) as Overall[]).map((k) => <span key={k}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: STATUS_COLOR[k], marginRight: 4 }} />{k}</span>)}<span>· Click a control to test it.</span></div>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Risk & Control Matrix</div>
              <div style={{ overflowX: "auto" }}><table data-testid="cmp-racm" style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}><thead><tr>{["Control", "Risk (assertions)", "Control activity", "Attributes", "Owner · performer · reviewer", "Evidence", "Laws", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{allCtl(p.id).map((c) => { const r = p.risks.find((x) => x.id === c.risk); const s = getSt(c.id); const cs = controlStatus(c, s);
                  return <tr key={c.id}><td style={td}><button onClick={() => { setCid(c.id); setTab("testing"); }} style={{ border: "none", background: "none", color: V.accent, fontWeight: 800, cursor: "pointer", padding: 0 }}>{c.id}</button>{c.key && <div>{chip("KEY", "#11264A")}</div>}</td>
                    <td style={td}>{r ? r.text : c.risk}<div style={{ color: V.text3, fontSize: 11 }}>{r ? r.assertions.join(", ") + " · " + r.level : ""}</div></td><td style={td}>{c.text}</td>
                    <td style={td}>{c.type}<br />{c.nature}<br />{c.freq}<br /><span style={{ color: V.text3 }}>COSO P{c.coso}</span></td>
                    <td style={td}>{(s.owner || c.owner)} · {(s.performer || c.performer)} · {(s.reviewer || c.reviewer)}</td><td style={td}>{c.evidence}</td><td style={{ ...td, fontSize: 11 }}>{c.regs.join(", ")}</td><td style={td}>{chip(cs.overall, STATUS_COLOR[cs.overall])}</td></tr>; })}</tbody></table></div>
              <AddControl process={p} onAdd={(c) => { setS((s) => ({ ...s, custom: [...s.custom, c] })); toast("Control " + c.id + " added to " + p.name + ".", "success"); }} inp={inp} btn={btn} count={S.custom.length} />
            </div>
            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>RACI — who does what</div>
              <div style={{ fontSize: 12, color: V.text3, marginBottom: 6 }}>R = performs the control · A = accountable owner · C = reviews. The Audit Committee and Chief Compliance Officer are informed through the quarterly dashboard.</div>
              <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", minWidth: 500 }}><thead><tr><th style={th}>Control</th>{rc.roles.map((r) => <th key={r} style={{ ...th, whiteSpace: "normal", minWidth: 80 }}>{r}</th>)}</tr></thead>
                <tbody>{rc.rows.map((row) => <tr key={row.control}><td style={td}><b>{row.control}</b></td>{rc.roles.map((r) => <td key={r} style={{ ...td, textAlign: "center", fontWeight: 800 }}>{row.cells[r] || ""}</td>)}</tr>)}</tbody></table></div>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Segregation of duties — name who does each activity</div>
              {p.sod.map(([a, b, why], i) => { const pair = sodA[i] || ["", ""]; const clash = pair[0] && pair[1] && pair[0].trim().toLowerCase() === pair[1].trim().toLowerCase();
                const upd = (j: 0 | 1, v: string) => setS((s) => { const all = { ...(s.sod[ent.id] || {}) }; const arr = [...(all[p.id] || [])]; const cur: [string, string] = [...(arr[i] || ["", ""])] as any; cur[j] = v; arr[i] = cur; all[p.id] = arr; return { ...s, sod: { ...s.sod, [ent.id]: all } }; });
                return <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, padding: "8px 0", borderBottom: "1px solid " + V.border }}>
                  <L label={a}><input style={inp} value={pair[0]} placeholder="Person" onChange={(e) => upd(0, e.target.value)} /></L>
                  <L label={b}><input style={inp} value={pair[1]} placeholder="Person" onChange={(e) => upd(1, e.target.value)} /></L>
                  <div style={{ fontSize: 12.5, color: clash ? V.bad : V.text3, alignSelf: "end", fontWeight: clash ? 800 : 400 }} data-testid={clash ? "cmp-sod-clash" : undefined}>{clash ? "CONFLICT: " + why + ". Split the duties or add an independent review." : why}</div></div>; })}
            </div>
          </>; })()}
      </>}

      {tab === "testing" && ctl && (() => { const s = getSt(ctl.id); const cs = controlStatus(ctl, s); const tod = s.tod && s.tod.length === TOD_QUESTIONS.length ? s.tod : TOD_QUESTIONS.map(() => false); const todSet = !!(s.tod && s.tod.length === TOD_QUESTIONS.length);
        const list = scope.flatMap((p) => allCtl(p));
        return <>
          <div style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select aria-label="Control" value={ctl.id} onChange={(e) => setCid(e.target.value)} style={{ ...inp, width: "auto", maxWidth: "100%" }}>{list.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.text.slice(0, 70)}</option>)}</select>
              {chip(cs.overall, STATUS_COLOR[cs.overall])}
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={s.applicable !== false} onChange={(e) => setSt(ctl.id, { applicable: e.target.checked })} /> Applicable to {ent.name}</label>
            </div>
            <p style={{ margin: "10px 0 4px", fontSize: 14 }}>{ctl.text}</p>
            <div style={{ fontSize: 12, color: V.text3 }}>{ctl.key ? "Key" : "Non-key"} · {ctl.type} · {ctl.nature} · {ctl.freq} · COSO P{ctl.coso} {COSO_PRINCIPLES[ctl.coso - 1]?.text} · Evidence: {ctl.evidence}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 10 }}>
              <L label={"Control owner (accountable) — role: " + ctl.owner}><input style={inp} value={s.owner || ""} placeholder="Name" onChange={(e) => setSt(ctl.id, { owner: e.target.value })} /></L>
              <L label={"Performer — role: " + ctl.performer}><input style={inp} value={s.performer || ""} placeholder="Name" onChange={(e) => setSt(ctl.id, { performer: e.target.value })} /></L>
              <L label={"Reviewer — role: " + ctl.reviewer}><input style={inp} value={s.reviewer || ""} placeholder="Name" onChange={(e) => setSt(ctl.id, { reviewer: e.target.value })} /></L>
              <L label="Tester (independent of the control)"><input style={inp} value={s.tester || ""} placeholder="Name" onChange={(e) => setSt(ctl.id, { tester: e.target.value })} /></L>
            </div>
            {s.performer && s.tester && s.performer.trim().toLowerCase() === s.tester.trim().toLowerCase() && <div role="alert" style={{ color: V.bad, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>The tester performs this control: the test is not independent.</div>}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 1 — Test of design (walkthrough)</div>
            {TOD_QUESTIONS.map((q, i) => <label key={i} style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 13.5 }}><input type="checkbox" data-testid={"cmp-tod-" + i} checked={tod[i]} onChange={(e) => { const n = [...tod]; n[i] = e.target.checked; setSt(ctl.id, { tod: n, todDate: new Date().toISOString().slice(0, 10) }); }} />{q}</label>)}
            <div style={{ fontWeight: 700, marginTop: 6, color: cs.design === "Effective" ? V.ok : cs.design === "Ineffective" ? V.bad : V.text3 }}>Design: {todSet ? cs.design : "Not assessed"}{cs.design === "Ineffective" ? " — every question must be true. Fix the design (Step 4) before testing operation." : ""}</div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 2 — Test of operating effectiveness</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <L label="Risk of this control failing"><select style={inp} value={s.risk || "Higher"} onChange={(e) => setSt(ctl.id, { risk: e.target.value as any })}><option>Higher</option><option>Lower</option></select></L>
              {ctl.freq === "As needed" && <L label="Times it occurred in the period">{num(s.population || 0, (n) => setSt(ctl.id, { population: n }))}</L>}
              {ctl.nature === "Automated" && <L label="IT general controls effective?"><select style={inp} value={s.itgcReliance === false ? "no" : "yes"} onChange={(e) => setSt(ctl.id, { itgcReliance: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No / not tested</option></select></L>}
              <L label="Items tested">{num(s.sample || 0, (n) => setSt(ctl.id, { sample: n, testDate: new Date().toISOString().slice(0, 10) }))}</L>
              <L label="Exceptions found">{num(s.exceptions || 0, (n) => setSt(ctl.id, { exceptions: n }))}</L>
              {cs.test.result === "Expand sample" || s.expSample ? <><L label="Additional items tested">{num(s.expSample || 0, (n) => setSt(ctl.id, { expSample: n }))}</L><L label="Exceptions in additional items">{num(s.expExceptions || 0, (n) => setSt(ctl.id, { expExceptions: n }))}</L></> : null}
            </div>
            <div style={{ fontSize: 12.5, color: V.text2, marginTop: 8 }}>Required sample: <b>{cs.required.size || "—"}</b> ({cs.required.basis}). Procedure: {ctl.test}</div>
            <div data-testid="cmp-test-result" style={{ fontWeight: 800, marginTop: 6, color: cs.test.result === "Effective" ? V.ok : cs.test.result === "Not effective" ? V.bad : V.warn }}>Result: {cs.test.result} — {cs.test.why}</div>
          </div>
          {(cs.design === "Ineffective" || cs.test.result === "Not effective") && <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 3 — How severe is this deficiency?</div>
            {(() => { const d = s.deficiency || { likelihood: "Reasonably possible" as const, magnitude: "More than inconsequential" as const, compensating: false, indicators: [] as string[] }; const upd = (p: Partial<typeof d>) => setSt(ctl.id, { deficiency: { ...d, ...p } });
              return <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <L label="Could it lead to a misstatement?"><select style={inp} value={d.likelihood} onChange={(e) => upd({ likelihood: e.target.value as any })}><option>Remote</option><option>Reasonably possible</option><option>Probable</option></select></L>
                <L label="How large could it be (vs materiality)?"><select style={inp} value={d.magnitude} onChange={(e) => upd({ magnitude: e.target.value as any })}><option>Inconsequential</option><option>More than inconsequential</option><option>Material</option></select></L>
                <label style={{ fontSize: 13, alignSelf: "end" }}><input type="checkbox" checked={d.compensating} onChange={(e) => upd({ compensating: e.target.checked })} /> A tested compensating control exists</label></div>
                <div style={{ fontSize: 12.5, color: V.text2, marginTop: 8 }}>Strong indicators of a material weakness:</div>
                {MW_INDICATORS.map((m) => <label key={m} style={{ display: "block", fontSize: 13 }}><input type="checkbox" checked={d.indicators.includes(m)} onChange={(e) => upd({ indicators: e.target.checked ? [...d.indicators, m] : d.indicators.filter((x) => x !== m) })} /> {m}</label>)}
                {!s.deficiency && <button style={{ ...btn(true), marginTop: 8 }} onClick={() => setSt(ctl.id, { deficiency: d })}>Classify</button>}
                {cs.severity && <div data-testid="cmp-severity" style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "2px solid " + (cs.severity.severity === "Material weakness" ? V.bad : cs.severity.severity === "Significant deficiency" ? V.warn : V.text3) }}>
                  <b>{cs.severity.severity}</b> — {cs.severity.why}<div style={{ fontSize: 12.5, color: V.text2, marginTop: 4 }}>Report to: {cs.severity.reportTo}</div></div>}</>; })()}
          </div>}
          {(cs.design === "Ineffective" || cs.test.result === "Not effective" || s.remediation) && <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 4 — Remediation</div>
            {(() => { const r = s.remediation || { action: "", owner: s.owner || "", due: "", status: "Open" as const }; const upd = (p: Partial<typeof r>) => setSt(ctl.id, { remediation: { ...r, ...p } });
              return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                <L label="Action"><input style={inp} value={r.action} onChange={(e) => upd({ action: e.target.value })} /></L><L label="Remediation owner"><input style={inp} value={r.owner} onChange={(e) => upd({ owner: e.target.value })} /></L>
                <L label="Due date"><input type="date" style={inp} value={r.due} onChange={(e) => upd({ due: e.target.value })} /></L>
                <L label="Status"><select style={inp} value={r.status} onChange={(e) => upd({ status: e.target.value as any })}><option>Open</option><option>In progress</option><option>Closed</option></select></L>
                {r.status === "Closed" && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: V.text2 }}>Closed remediation must be re-tested after the control has operated long enough: reset the test results above and record the re-test.</div>}</div>; })()}
          </div>}
        </>; })()}

      {tab === "owners" && <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Control owner scorecard — how assignments are judged</div>
        <div style={{ fontSize: 12.5, color: V.text3, marginBottom: 8 }}>Score = % of owned controls concluded effective, minus 10 points per overdue remediation. Lowest scores first, so the CCO sees where to act.</div>
        <div style={{ overflowX: "auto" }}><table data-testid="cmp-owners" style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}><thead><tr>{["Owner", "Controls", "Effective", "Deficient", "Not yet tested", "Overdue remediation", "Score"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{ownerScorecard(ent, scope, S.states, S.custom).map((o) => <tr key={o.person}><td style={td}><b>{o.person}</b></td><td style={td}>{o.controls}</td><td style={td}>{o.effective}</td><td style={{ ...td, color: o.deficient ? V.bad : V.text }}>{o.deficient}</td><td style={td}>{o.untested}</td><td style={{ ...td, color: o.overdue ? V.bad : V.text }}>{o.overdue}</td><td style={{ ...td, fontWeight: 800 }}>{o.score}</td></tr>)}</tbody></table></div>
        {(() => { const all = sodConflicts(S.sod[ent.id] || {}); return all.length ? <div style={{ marginTop: 10, color: V.bad, fontSize: 13 }}><b>Segregation-of-duties conflicts:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{all.map((c, i) => <li key={i}>{c.person}: {c.a} + {c.b} ({c.process}) — {c.why}</li>)}</ul></div> : null; })()}
        {prog.cosoGaps.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: V.warn }}><b>COSO principles with no in-scope control:</b> {prog.cosoGaps.join("; ")}. A COSO-based programme needs all 17 present and functioning.</div>}
      </div>}

      {tab === "roadmap" && (() => { const f = S.fin[ent.id] || { pbt: 0, rev: 0 }; const rm = roadmap(ent, prog, f.pbt, f.rev); const setF = (p: Partial<typeof f>) => setS((s) => ({ ...s, fin: { ...s.fin, [ent.id]: { ...f, ...p } } }));
        return <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Implementation path for {ent.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 10 }}>
            <L label="Profit before tax (₹ crore) — for materiality">{num(f.pbt, (n) => setF({ pbt: n }))}</L><L label="Revenue (₹ crore)">{num(f.rev, (n) => setF({ rev: n }))}</L></div>
          {rm.map((r) => <div key={r.phase} data-testid="cmp-phase" style={{ borderLeft: "4px solid " + (r.status === "Done" ? V.ok : r.status === "In progress" ? V.warn : V.border), padding: "8px 12px", marginBottom: 10, background: V.surface2, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}><b>{r.phase}</b><span style={{ fontSize: 12, color: V.text3 }}>{r.status}{r.weeks ? " · about " + r.weeks + " weeks" : ""}</span></div>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>{r.what}</div>
            <div style={{ fontSize: 12.5, color: V.text2, marginTop: 4 }}><b>Who:</b> {r.who} · <b>Output:</b> {r.output}</div></div>)}
          <div style={{ fontSize: 11.5, color: V.text3 }}>Durations are typical for a first-year programme and lengthen for large or multi-location groups. Status updates automatically from the testing records.</div>
        </div>; })()}
      <div style={{ fontSize: 11.5, color: V.text3, marginTop: 8 }}>Records are stored in this browser only. Control conclusions follow documented rules (sample sizes, exceptions, PCAOB AS 2201 / ICAI Guidance Note severity logic); final conclusions rest with management and the auditor.</div>
    </div>);
}

function AddControl({ process, onAdd, inp, btn, count }: { process: any; onAdd: (c: Control) => void; inp: React.CSSProperties; btn: (on?: boolean) => React.CSSProperties; count: number }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({ text: "", risk: process.risks[0].id, freq: "Monthly" as Freq, type: "Detective", nature: "Manual", owner: "", key: true });
  useEffect(() => setF((x) => ({ ...x, risk: process.risks[0].id })), [process.id]);
  if (!open) return <button onClick={() => setOpen(true)} style={{ ...btn(), marginTop: 10 }}>+ Add your own control to {process.name}</button>;
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
    <label style={{ gridColumn: "1 / -1", fontSize: 12 }}>Control description<input style={inp} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
    <label style={{ fontSize: 12 }}>Risk addressed<select style={inp} value={f.risk} onChange={(e) => setF({ ...f, risk: e.target.value })}>{process.risks.map((r: any) => <option key={r.id} value={r.id}>{r.id}: {r.text.slice(0, 50)}</option>)}</select></label>
    <label style={{ fontSize: 12 }}>Frequency<select style={inp} value={f.freq} onChange={(e) => setF({ ...f, freq: e.target.value as Freq })}>{["Annual", "Quarterly", "Monthly", "Weekly", "Daily", "Multiple times a day", "As needed"].map((x) => <option key={x}>{x}</option>)}</select></label>
    <label style={{ fontSize: 12 }}>Type<select style={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>Preventive</option><option>Detective</option></select></label>
    <label style={{ fontSize: 12 }}>Nature<select style={inp} value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value })}><option>Manual</option><option>Automated</option><option>IT-dependent manual</option></select></label>
    <label style={{ fontSize: 12 }}>Owner role<input style={inp} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></label>
    <label style={{ fontSize: 12, alignSelf: "end" }}><input type="checkbox" checked={f.key} onChange={(e) => setF({ ...f, key: e.target.checked })} /> Key control</label>
    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
      <button disabled={f.text.trim().length < 10 || !f.owner.trim()} style={btn(true)} onClick={() => { onAdd({ id: "CUS-" + String(count + 1).padStart(2, "0"), process: process.id, risk: f.risk, text: f.text.trim(), key: f.key, type: f.type as any, nature: f.nature as any, freq: f.freq,
        owner: f.owner.trim(), performer: f.owner.trim(), reviewer: "Finance Controller", evidence: "As documented by the owner", test: "Inspect evidence for the sample; re-perform where possible.", coso: 10, regs: ["sox404", "in-ifc-audit", "in-ifc-board"], custom: true }); setOpen(false); setF({ ...f, text: "" }); }}>Add control</button>
      <button style={btn()} onClick={() => setOpen(false)}>Cancel</button></div></div>;
}
