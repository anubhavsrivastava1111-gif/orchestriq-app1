import React, { useState, useRef, useEffect, useMemo } from "react";
import ReadAloudButton from "./components/ReadAloudButton";
import { claimSummary, executivePosition, userQuestions, validateContribution, completenessReport, boardDecisionState, kpiBasis, buildFullThreadMarkdown, buildEmailBrief, analyseStage, type StageAnalysis } from "./lib/BoardroomIntegrity";
import { tierLabel, type LinkedClaim } from "./lib/DecisionIntegrity";
import DecisionCockpitView from "./DecisionCockpitView";
// One analysis per (stage object, brief, research state) - recomputed only when they change.
const _analysisCache = new WeakMap<object, { key: string; a: StageAnalysis }>();
function cachedAnalysis(cur: any, si: number, location: string): StageAnalysis | null {
  const st = cur?.stages?.[si]; if (!st) return null;
  const key = String((cur.researchBrief || "").length) + "|" + JSON.stringify(cur.researchState?.intelligence?.gaps || []).length + "|" + JSON.stringify(cur.researchState?.pendingUserQuestions || []).length + "|" + location;
  const hit = _analysisCache.get(st); if (hit && hit.key === key) return hit.a;
  try { const a = analyseStage(cur, si, { location }); _analysisCache.set(st, { key, a }); return a; } catch (e) { console.warn("[OIQ] stage analysis failed", e); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARDROOM VIEW — Enterprise Redesign
// Matches: Claude · ChatGPT · Linear · Stripe Dashboard · Notion
// Typography: Inter · 16px base · proper hierarchy
// Modes: Light (executive default) · Dark (analyst mode)
// ═══════════════════════════════════════════════════════════════════════════

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const T = {
  light: {
    bg:        "var(--oiq-bg)",
    surface:   "var(--oiq-surface)",
    surface2:  "var(--oiq-surface2)",
    border:    "var(--oiq-border)",
    borderStr: "var(--oiq-border)",
    text:      "var(--oiq-ink)",
    text2:     "var(--oiq-body)",
    text3:     "var(--oiq-muted)",
    muted:     "var(--oiq-faint)",
    accent:    "var(--oiq-accent)",
    accentBg:  "var(--accent-10)",
    accentStr: "var(--oiq-accent)",
    blue:      "var(--oiq-info)",
    blueBg:    "var(--oiq-surface2)",
    purple:    "#7C3AED",
    purpleBg:  "var(--oiq-surface2)",
    warn:      "var(--oiq-warning)",
    warnBg:    "var(--oiq-surface2)",
    danger:    "var(--oiq-danger)",
    dangerBg:  "var(--oiq-surface2)",
    success:   "var(--oiq-success)",
    successBg: "var(--oiq-surface2)",
    shadow:    "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
    shadowLg:  "0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)",
    inputBg:   "var(--oiq-surface)",
    cardHover: "var(--oiq-surface2)",
  },
  dark: {
    bg:        "var(--oiq-bg)",
    surface:   "var(--oiq-surface)",
    surface2:  "var(--oiq-surface2)",
    border:    "var(--oiq-border)",
    borderStr: "var(--oiq-border)",
    text:      "var(--oiq-ink)",
    text2:     "var(--oiq-body)",
    text3:     "var(--oiq-muted)",
    muted:     "var(--oiq-faint)",
    accent:    "var(--oiq-accent)",
    accentBg:  "var(--accent-10)",
    accentStr: "var(--oiq-accent)",
    blue:      "var(--oiq-info)",
    blueBg:    "var(--oiq-surface2)",
    purple:    "#7C3AED",
    purpleBg:  "var(--oiq-surface2)",
    warn:      "var(--oiq-warning)",
    warnBg:    "var(--oiq-surface2)",
    danger:    "var(--oiq-danger)",
    dangerBg:  "var(--oiq-surface2)",
    success:   "var(--oiq-success)",
    successBg: "var(--oiq-surface2)",
    shadow:    "0 1px 3px rgba(0,0,0,0.4)",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.4)",
    shadowLg:  "0 8px 24px rgba(0,0,0,0.5)",
    inputBg:   "var(--oiq-surface)",
    cardHover: "var(--oiq-surface2)",
  },
};

// ─── MD RENDERER ─────────────────────────────────────────────────────────────
// Renders AI markdown into styled executive-report HTML
function RenderedMd({ text, tok, isDark }: { text: string; tok: typeof T.light; isDark: boolean }) {
  if (!text) return null;

  const html = (() => {
    const lines = (text || "").split("\n");
    const out: string[] = [];
    let inList = false;
    let inOl = false;
    let inTable = false;
    let tableRows: string[] = [];

    const flushTable = () => {
      if (!tableRows.length) return;
      const rows = tableRows.filter(r => !r.match(/^\|[\s|:\-]+\|$/));
      if (rows.length) {
        const cols = rows[0].split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
        out.push(`<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;"><thead><tr>${
          cols.map(c => `<th style="text-align:left;padding:10px 14px;font-weight:600;font-size:13px;color:${tok.text3};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${tok.borderStr};white-space:nowrap;">${c.trim()}</th>`).join("")
        }</tr></thead><tbody>${
          rows.slice(1).map((r, ri) => {
            const cells = r.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
            return `<tr style="background:${ri%2===0?tok.surface:tok.surface2};">${
              cells.map(c => `<td style="padding:10px 14px;border-bottom:1px solid ${tok.border};font-size:14px;line-height:1.5;color:${tok.text2};">${fmt(c.trim())}</td>`).join("")
            }</tr>`;
          }).join("")
        }</tbody></table>`);
      }
      tableRows = [];
      inTable = false;
    };

    const fmt = (s: string) => s
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/\*\*(.+?)\*\*/g,`<strong style="color:${tok.text};font-weight:600;">$1</strong>`)
      .replace(/\*(.+?)\*/g,"<em>$1</em>")
      .replace(/`(.+?)`/g,`<code style="background:${tok.surface2};border:1px solid ${tok.border};border-radius:4px;padding:2px 6px;font-size:13px;font-family:'JetBrains Mono',monospace;color:${tok.accent};">$1</code>`)
      .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g,`<a href="$2" target="_blank" rel="noopener" style="color:${tok.blue};text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;">$1</a>`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Tables
      if (line.trim().startsWith("|")) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        inTable = true;
        tableRows.push(line);
        continue;
      }
      if (inTable) flushTable();

      // Headings
      const h1 = line.match(/^# (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);

      if (h1) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(`<h1 style="font-size:22px;font-weight:700;color:${tok.text};margin:28px 0 12px;line-height:1.3;letter-spacing:-0.02em;">${fmt(h1[1])}</h1>`);
        continue;
      }
      if (h2) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(`<h2 style="font-size:18px;font-weight:600;color:${tok.text};margin:24px 0 10px;line-height:1.4;padding-bottom:8px;border-bottom:1px solid ${tok.border};">${fmt(h2[1])}</h2>`);
        continue;
      }
      if (h3) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(`<h3 style="font-size:15px;font-weight:600;color:${tok.text2};margin:20px 0 8px;line-height:1.4;">${fmt(h3[1])}</h3>`);
        continue;
      }

      // Dividers
      if (line.match(/^---+$/)) {
        out.push(`<hr style="border:none;border-top:1px solid ${tok.border};margin:20px 0;"/>`);
        continue;
      }

      // Unordered list
      const ulMatch = line.match(/^[\-\*] (.+)/);
      if (ulMatch) {
        if (inOl) { out.push("</ol>"); inOl = false; }
        if (!inList) { out.push(`<ul style="margin:10px 0 10px 0;padding:0;list-style:none;">`); inList = true; }
        out.push(`<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;font-size:15px;line-height:1.65;color:${tok.text2};"><span style="width:6px;height:6px;border-radius:50%;background:${tok.accent};flex-shrink:0;margin-top:9px;"></span><span>${fmt(ulMatch[1])}</span></li>`);
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^\d+\. (.+)/);
      if (olMatch) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (!inOl) { out.push(`<ol style="margin:10px 0;padding:0;list-style:none;counter-reset:li;">`); inOl = true; }
        const num = line.match(/^(\d+)\./)?.[1];
        out.push(`<li style="display:flex;gap:12px;margin-bottom:10px;font-size:15px;line-height:1.65;color:${tok.text2};"><span style="min-width:24px;height:24px;border-radius:50%;background:${tok.accentBg};color:${tok.accent};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">${num}</span><span>${fmt(olMatch[1])}</span></li>`);
        continue;
      }

      // Code blocks
      if (line.startsWith("```")) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i].replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"));
          i++;
        }
        out.push(`<pre style="background:${tok.surface2};border:1px solid ${tok.border};border-radius:8px;padding:16px;overflow-x:auto;margin:12px 0;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.6;color:${tok.text2};">${codeLines.join("\n")}</pre>`);
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(`<blockquote style="border-left:3px solid ${tok.accent};margin:12px 0;padding:12px 16px;background:${tok.accentBg};border-radius:0 8px 8px 0;font-size:15px;line-height:1.7;color:${tok.text2};font-style:italic;">${fmt(line.slice(2))}</blockquote>`);
        continue;
      }

      // Close lists on empty line
      if (!line.trim()) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push('<div style="height:8px;"></div>');
        continue;
      }

      // Paragraph
      if (inList) { out.push("</ul>"); inList = false; }
      if (inOl) { out.push("</ol>"); inOl = false; }
      out.push(`<p style="font-size:15px;line-height:1.75;color:${tok.text2};margin:0 0 12px;font-weight:400;">${fmt(line)}</p>`);
    }

    if (inList) out.push("</ul>");
    if (inOl) out.push("</ol>");
    if (inTable) flushTable();

    return out.join("");
  })();

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── RESEARCH BRIEF CARDS ────────────────────────────────────────────────────
function ResearchBriefPanel({ text, tok }: { text: string; tok: typeof T.light }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // The brief arrives as blocks separated by headings, with individual findings
  // separated by 🔴 and attributed as "— [TIER n: label] Publisher , accessed DATE".
  // Splitting on that structure turns a wall of text into scannable rows.
  const sources = useMemo(() => {
    const blocks: { title: string; findings: { claim: string; pub: string; date: string; tier: string }[] }[] = [];
    const rawBlocks = (text || "").split(/\n(?=(?:#{1,3}\s|\d+\.\s|Source\s|Data Point|Ref\s))/i);
    rawBlocks.forEach(b => {
      const parts = b.split("🔴").map(p => p.trim()).filter(Boolean);
      if (!parts.length) return;
      const title = parts[0].replace(/^[#>\-*\s\d.]+/, "").replace(/\(https?:\/\/[^)]*\)/g, "").trim().slice(0, 90);
      const findings = parts.slice(title && parts.length > 1 ? 1 : 0).map(p => {
        const clean = p.replace(/\(https?:\/\/[^)]*\)/g, "").trim();
        const tierM = clean.match(/\[TIER\s*(\d)[^\]]*\]/i);
        const dateM = clean.match(/accessed\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
        let claim = clean.split(/—\s*\[TIER/i)[0].replace(/[*`_]/g, "").trim();
        let pub = "";
        const after = clean.split(/\]/).slice(1).join("]");
        if (after) pub = after.split(/,\s*accessed/i)[0].replace(/[*`_]/g, "").trim();
        return { claim, pub: pub.slice(0, 70), date: dateM ? dateM[1] : "", tier: tierM ? tierM[1] : "" };
      }).filter(f => f.claim.length > 15);
      if (findings.length) blocks.push({ title: title || "Findings", findings });
    });
    return blocks;
  }, [text]);

  const totalFindings = sources.reduce((n, s) => n + s.findings.length, 0);
  const copy = (t: string, id: string) => {
    try { navigator.clipboard.writeText(t); setCopied(id); setTimeout(() => setCopied(null), 1400); } catch {}
  };
  const plain = (s: any) => `${s.title}\n` + s.findings.map((f: any) => `• ${f.claim}${f.pub ? `\n  — ${f.pub}${f.date ? `, ${f.date}` : ""}` : ""}`).join("\n");

  // Highlight the figures inside a claim so numbers are findable at a glance.
  const mark = (s: string) => {
    const parts = s.split(/((?:₹|USD\s?|\$)\s?[\d,]+(?:\.\d+)?\s?(?:Cr|crore|lakh|L|K|M|B|Million|Billion|bn|mn)?|\d+(?:\.\d+)?\s?%(?:\s*CAGR)?)/gi);
    return parts.map((p, i) =>
      /^(?:₹|USD|\$)|%$|% CAGR$/i.test(p.trim()) && p.trim().length > 1
        ? <span key={i} style={{ fontFamily: "var(--font-mono),monospace", background: tok.accentBg, color: tok.accent, padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap" }}>{p.trim()}</span>
        : <span key={i}>{p}</span>
    );
  };

  const tierColor = (t: string) =>
    t === "1" ? { bg: tok.successBg, fg: tok.success }
    : t === "3" ? { bg: tok.warnBg, fg: tok.warn }
    : { bg: tok.accentBg, fg: tok.accent };

  return (
    <>
      <div onClick={() => setOpen(true)}
        style={{ marginBottom: 22, borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, padding: "15px 20px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: tok.surface2, border: `1px solid ${tok.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📡</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 600, color: tok.text }}>Research Brief</div>
          <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 2 }}>
            {sources.length} source{sources.length === 1 ? "" : "s"} · {totalFindings} finding{totalFindings === 1 ? "" : "s"} · verify before external use
          </div>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: tok.accent, flexShrink: 0 }}>Open ↗</div>
      </div>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,14,26,0.62)", zIndex: 9995, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "min(1080px,100%)", maxHeight: "90vh", background: tok.surface, borderRadius: 12, border: `1px solid ${tok.border}`, boxShadow: tok.shadowLg, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${tok.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 17, fontWeight: 600, color: tok.text }}>Research Brief</div>
                <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 2 }}>{sources.length} sources · {totalFindings} findings · verify critical figures before external use</div>
              </div>
              <button onClick={() => copy(sources.map(plain).join("\n\n"), "all")}
                style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${tok.border}`, background: tok.surface2, color: tok.text2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                {copied === "all" ? "Copied" : "Copy all"}
              </button>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: `1px solid ${tok.border}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: tok.text3, fontSize: 15, fontFamily: "inherit" }}>✕</button>
            </div>

            <div style={{ padding: "16px 22px 22px", overflowY: "auto", flex: 1 }}>
              {sources.length === 0 && (
                <div style={{ fontSize: 13.5, lineHeight: 1.75, color: tok.text2, whiteSpace: "pre-wrap" }}>{(text || "").replace(/\(https?:\/\/[^)]*\)/g, "")}</div>
              )}
              {sources.map((s, si) => (
                <div key={si} style={{ border: `1px solid ${tok.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: tok.text3, flexShrink: 0 }}>Source {si + 1}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: tok.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                    {s.findings[0]?.tier && (
                      <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: tierColor(s.findings[0].tier).bg, color: tierColor(s.findings[0].tier).fg, fontWeight: 700, flexShrink: 0 }}>Tier {s.findings[0].tier}</span>
                    )}
                    <button onClick={() => copy(plain(s), "s" + si)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: tok.text3, fontSize: 13, padding: 2, flexShrink: 0 }}>
                      {copied === "s" + si ? "✓" : "⧉"}
                    </button>
                  </div>
                  {s.findings.map((f, fi) => (
                    <div key={fi} style={{ borderTop: `1px solid ${tok.border}`, paddingTop: 11, marginTop: fi ? 11 : 0 }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.62, color: tok.text }}>{mark(f.claim)}</div>
                      {(f.pub || f.date) && (
                        <div style={{ fontSize: 11, color: tok.text3, marginTop: 5 }}>
                          {f.pub}{f.pub && f.date ? " · accessed " : ""}{f.date}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── EXECUTIVE CARD ──────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  COMPLETE: { label: "Complete", tone: "ok" }, CONTINUATION_COMPLETE: { label: "Complete (continued)", tone: "ok" },
  PARTIAL: { label: "Partial \u2014 continuation failed", tone: "warn" }, TRUNCATED: { label: "Cut short", tone: "warn" },
  FAILED: { label: "Failed", tone: "bad" }, IDENTITY_MISMATCH: { label: "Identity mismatch", tone: "bad" },
  DUPLICATE_CONTENT: { label: "Duplicate of another executive", tone: "bad" }, PROVIDER_LIMIT: { label: "No provider available", tone: "bad" },
  CONTEXT_LIMIT: { label: "Context limit", tone: "bad" },
  LEGACY: { label: "Legacy (unattributed)", tone: "warn" },
};
// EXECUTIVE CONTRIBUTION CARD - progressive disclosure:
// position -> what I need from you -> opportunities -> full analysis (inline) -> sources.
// Reads the canonical full text; nothing here shortens the stored response.
function ExecutiveCard({
  entry, index, question, isDark, tok, stageNumber, intel, drillAnswers, claims,
  onDrill, drillRole, drillQ, setDrillQ, drillRun, runDrill,
  onCopy, onContinue, showDrillClose,
}: any) {
  const ag = entry.ag || {};
  const [open, setOpen] = useState(false);
  const full: string = typeof entry.fullText === "string" && entry.fullText ? entry.fullText : (typeof entry.text === "string" ? entry.text : "");
  // IDENTITY CHECK before display: a contribution is shown only under the
  // executive whose identity it carries. Legacy entries (saved before identity
  // existed) have no callId and are shown as they were.
  const idCheck = entry.identity ? validateContribution(entry, { executiveId: ag.id, stageId: entry.identity.stageId }) : { valid: true, reason: "" };
  const status: string = !idCheck.valid ? "IDENTITY_MISMATCH" : !entry.identity ? "LEGACY" : (entry.status || (entry.truncated ? "TRUNCATED" : "COMPLETE"));
  const st = STATUS_STYLE[status] || STATUS_STYLE.COMPLETE;
  const toneBg = st.tone === "ok" ? tok.successBg : st.tone === "warn" ? tok.warnBg : tok.dangerBg;
  const toneFg = st.tone === "ok" ? tok.success : st.tone === "warn" ? tok.warn : tok.danger;
  const position = executivePosition(full);
  const questions = userQuestions(full);
  const cs = claimSummary(full);
  const opps = ((intel && intel.opportunities) || []).filter((o: any) => o.discovered_by === ag.t).slice(0, 4);
  const sources = Array.from(new Set((full.match(/https?:\/\/[^\s)\]>"']+/g) || []).map((u: string) => u.replace(/[.,;:]+$/, "")))).slice(0, 8);
  const chip = (txt: string, bg: string, fg: string) => (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: bg, color: fg, letterSpacing: ".02em", whiteSpace: "nowrap" }}>{txt}</span>);
  const label = (t: string) => <div style={{ fontSize: 10, fontWeight: 800, color: tok.text3, letterSpacing: ".1em", textTransform: "uppercase", margin: "12px 0 5px" }}>{t}</div>;

  if (!idCheck.valid) {
    return (
      <div style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${tok.danger}`, background: tok.dangerBg, padding: "14px 18px" }}>
        <div style={{ fontWeight: 700, color: tok.danger, fontSize: 13 }}>{ag.ic} {ag.t} — contribution withheld (identity mismatch)</div>
        <div style={{ fontSize: 12, color: tok.text2, marginTop: 4 }}>{idCheck.reason}. This text is not shown under {ag.t} and is excluded from the synthesis.</div>
      </div>);
  }
  return (
    <div style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, overflow: "hidden" }}>
      {/* HEADER */}
      <div style={{ padding: "13px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: (ag.dc || "#64748b") + "15", border: `1px solid ${(ag.dc || "#64748b")}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{ag.ic}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: tok.text }}>{ag.t}</span>
            {chip(st.label, toneBg, toneFg)}
            {stageNumber ? <span style={{ fontSize: 10.5, color: tok.muted }}>Stage {stageNumber}</span> : null}
            {entry.identity?.provider && entry.identity.provider !== "none" && entry.identity.provider !== "see stage log" ? <span style={{ fontSize: 10.5, color: tok.muted }}>· {entry.identity.provider}</span> : null}
          </div>
          <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 2 }}>{ag.d || "Executive Perspective"}</div>
          {/* EVIDENCE-LINKED claim summary: "verified" means backed by a retrieved
              source - never just the model's own "[Verified Fact]" label. */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
            {(() => {
              const cl: LinkedClaim[] = Array.isArray(claims) ? claims : [];
              if (!cl.length) return chip(cs.total ? cs.total + " claims (evidence not linked)" : "no material claims tagged", tok.surface2, tok.text3);
              const n = (k: string) => cl.filter((c) => c.support === k).length;
              const ma = cl.filter((c) => c.modelAsserted).length;
              const bestTier = Math.min(...cl.filter((c) => c.support === "SUPPORTED").map((c) => c.sourceTier), 9);
              return (<>
                {chip(cl.length + " claims", tok.surface2, tok.text2)}
                {n("SUPPORTED") ? chip(n("SUPPORTED") + " verified" + (bestTier < 9 ? " (best: " + tierLabel(bestTier) + ")" : ""), tok.successBg, tok.success) : null}
                {n("PARTIALLY_SUPPORTED") ? chip(n("PARTIALLY_SUPPORTED") + " partly supported", tok.surface2, tok.text2) : null}
                {n("CONTRADICTED") ? chip(n("CONTRADICTED") + " contradicted by research", tok.dangerBg, tok.danger) : null}
                {n("INFERRED") ? chip(n("INFERRED") + " inference", tok.surface2, tok.text2) : null}
                {n("ASSUMED") ? chip(n("ASSUMED") + " assumptions", tok.warnBg, tok.warn) : null}
                {n("ESTIMATED") ? chip(n("ESTIMATED") + " estimates", tok.warnBg, tok.warn) : null}
                {n("UNVERIFIED") ? chip(n("UNVERIFIED") + " unverified" + (ma ? " (" + ma + " model-labelled \u201cverified\u201d)" : ""), tok.dangerBg, tok.danger) : null}
              </>);
            })()}
          </div>
          {entry.execution && !/^Completed using [A-Za-z]+\.$/.test(entry.execution) && <div style={{ fontSize: 11, color: tok.muted, marginTop: 5 }}>{entry.execution}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ReadAloudButton text={full.replace(/[#*`_>|]/g, "")} id={"br-exec-" + (ag?.t || "exec") + "-" + index} />
          <span style={{ fontSize: 11, color: tok.muted }}>#{index + 1}</span>
        </div>
      </div>
      {/* BODY - readable default view */}
      <div style={{ padding: "0 16px 12px 62px" }}>
        {label("Executive position")}
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: tok.text2 }}>{position || "See the full analysis below."}</div>
        {questions.length > 0 && (<>{label("What " + ag.t + " needs from you")}
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: tok.text2 }}>{questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ol></>)}
        {opps.length > 0 && (<>{label("Opportunities raised")}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{opps.map((o: any) => (
            <div key={o.id} style={{ fontSize: 12.5, color: tok.text2 }}><span style={{ fontFamily: "var(--font-mono),monospace", fontSize: 11, color: tok.accent }}>{o.id}</span> {o.title} <span style={{ color: tok.muted }}>({o.status.replace(/_/g, " ")})</span></div>))}</div></>)}
        {(status === "PARTIAL" || status === "TRUNCATED") && (
          <div style={{ marginTop: 10, fontSize: 12, color: tok.warn }}>This response is incomplete. Everything received is preserved below; it was not completed by the provider.</div>)}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => setOpen(!open)} style={{ ...btnBase(tok, open, tok.accent), fontSize: 12, padding: "6px 12px" }}>{open ? "Hide full analysis" : "Read full analysis (~" + Math.max(1, Math.round(full.split(/\s+/).length / 200)) + " min)"}</button>
          <button onClick={onDrill} style={{ ...btnBase(tok, drillRole === ag.id, tok.accent), fontSize: 12, padding: "6px 12px" }}>Ask {ag.t}</button>
          <button onClick={onCopy} style={{ ...btnBase(tok, false), fontSize: 12, padding: "6px 12px" }}>Copy full text</button>
          {(status === "PARTIAL" || status === "TRUNCATED") && <button onClick={onContinue} style={{ ...btnBase(tok, false, tok.warn), fontSize: 12, padding: "6px 12px" }}>Continue response</button>}
        </div>
        {/* FULL ANALYSIS - inline, only this card expands */}
        {open && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${tok.border}` }}>
            <RenderedMd text={full} tok={tok} isDark={isDark} />
            {sources.length > 0 && (<>{label("Sources cited")}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{sources.map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: tok.accent, wordBreak: "break-all" }}>{u}</a>)}</div></>)}
          </div>)}
        {/* drill-down answers (were saved per role but never displayed) */}
        {(drillAnswers || []).map((qa: any, qi: number) => (
          <div key={qi} style={{ marginTop: 12, padding: 14, background: tok.surface2, borderRadius: 10, border: `1px solid ${tok.border}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: ag.dc, marginBottom: 8 }}>{qa.q}</div>
            <RenderedMd text={qa.a} tok={tok} isDark={isDark} />
          </div>))}
        {drillRole === ag.id && (
          <div style={{ marginTop: 12, padding: 14, background: tok.accentBg, borderRadius: 10, border: `1px solid ${tok.accent}33` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: tok.accent, marginBottom: 8 }}>Ask {ag.t} a follow-up</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={drillQ} onChange={(e: any) => setDrillQ(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && runDrill()}
                placeholder="e.g. What's your biggest concern about the financial risk?" disabled={drillRun}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${tok.accent}44`, background: tok.inputBg, color: tok.text, fontSize: 13.5, outline: "none", fontFamily: "inherit" }} />
              <button onClick={runDrill} disabled={drillRun || !drillQ.trim()} style={{ padding: "9px 14px", borderRadius: 8, background: ag.dc, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{drillRun ? "Thinking\u2026" : "Ask"}</button>
              <button onClick={showDrillClose} style={{ padding: "9px", borderRadius: 8, background: tok.surface2, color: tok.text3, border: `1px solid ${tok.border}`, cursor: "pointer" }}>✕</button>
            </div>
          </div>)}
      </div>
    </div>
  );
}

// ─── SYNTHESIS CARD ───────────────────────────────────────────────────────────
function SynthesisCard({ synthesis, question, tok, isDark, onCopy, onExportPDF, onExportPPT, onExportMD, onExtractActions, extracting, basisText, kpiClaims }: any) {
  const [kpiOpen, setKpiOpen] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const raw = typeof synthesis === "string" ? synthesis : "";

  // Board KPIs and crux come from the synthesis itself, declared in structured
  // blocks. Nothing is scraped out of prose — a figure only appears here if the
  // board explicitly nominated it, with its reason.
  let kpis: { label: string; value: string; why?: string }[] = [];
  try {
    const b = raw.match(/===BOARD_KPIS===([\s\S]*?)===END_KPIS===/);
    if (b) {
      const parsed = JSON.parse(b[1].trim());
      if (Array.isArray(parsed)) {
        kpis = parsed
          .filter((k: any) => k && typeof k.label === "string" && typeof k.value === "string")
          .slice(0, 4);
      }
    }
  } catch { kpis = []; }

  const cruxMatch = raw.match(/===CRUX===([\s\S]*?)===END_CRUX===/);
  const bold = raw.match(/\*\*(.+?)\*\*/);
  // Strip machine blocks (KPI JSON, crux markers) before choosing a headline, so
  // raw JSON is never shown as the synthesis summary.
  const proseOnly = raw.replace(/===BOARD_KPIS===[\s\S]*?===END_KPIS===/g, "").replace(/===CRUX===[\s\S]*?===END_CRUX===/g, "");
  const firstPara = proseOnly.split("\n").map(l => l.replace(/^[#>\-*\s]+/, "").trim())
    .find(l => l.length > 50 && !l.startsWith("|") && !l.startsWith("[{") && !l.startsWith("===")) || "";
  const headline = (cruxMatch ? cruxMatch[1] : (bold ? bold[1] : firstPara))
    .replace(/[*`_]/g, "").trim().slice(0, 420);

  const actions = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
      <button onClick={onExportPDF} style={{ ...actionBtn(tok), color: tok.text2 }}>📄 PDF</button>
      <button onClick={onExportPPT} style={{ ...actionBtn(tok), color: tok.text2 }}>📊 PPT</button>
      <button onClick={onExportMD} style={{ ...actionBtn(tok), color: tok.text2 }}>MD</button>
      <button onClick={onCopy} style={{ ...actionBtn(tok), color: tok.text2 }}>Copy</button>
      <button onClick={onExtractActions} disabled={extracting} style={{ ...actionBtn(tok, true), color: tok.accent }}>
        {extracting ? "Extracting…" : "✅ Actions"}
      </button>
    </div>
  );

  return (
    <>
      {/* ── BOARD KPI STRIP ── */}
      {kpis.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: `repeat(${kpis.length}, minmax(0,1fr))`,
          border: `1px solid ${tok.border}`, borderRadius: 10, overflow: "hidden",
          background: tok.surface, marginBottom: 18, boxShadow: tok.shadow,
        }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ padding: "16px 19px", borderLeft: i ? `1px solid ${tok.border}` : "none" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: tok.text3, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 26, fontWeight: 700, color: tok.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
              {k.why && <div style={{ fontSize: 11.5, fontWeight: 600, color: tok.text3, marginTop: 6, lineHeight: 1.35 }}>{k.why}</div>}
              {(() => {
                // Where the figure came from, and what kind of claim it is - so an
                // estimate never looks like a verified fact.
                const kb = kpiBasis(String(basisText || "") + "\n" + raw, k.value);
                // Label from EVIDENCE LINKING when the figure's sentence was linked; the
                // model's own tag alone never makes a KPI "verified".
                const lc: any = (Array.isArray(kpiClaims) ? kpiClaims : []).find((c: any) => kb.basis && (c.text.includes(kb.basis.slice(0, 60)) || kb.basis.includes(c.text.slice(0, 60))));
                const sup = lc ? lc.support : "";
                const lbl = sup === "SUPPORTED" ? "Verified \u00b7 " + tierLabel(lc.sourceTier) : sup === "PARTIALLY_SUPPORTED" ? "Partly supported" : sup === "CONTRADICTED" ? "Contradicted by research"
                  : sup === "ESTIMATED" || kb.kind === "ESTIMATE" ? "Modelled estimate" : sup === "ASSUMED" || kb.kind === "ASSUMPTION" ? "Assumption" : sup === "INFERRED" || kb.kind === "INFERENCE" ? "Inference"
                  : kb.basis ? (lc && lc.modelAsserted ? "Unverified (model-labelled verified)" : "Unverified") : "Basis not stated";
                const ok = sup === "SUPPORTED";
                return (<>
                  <span onClick={() => setKpiOpen(kpiOpen === i ? null : i)} style={{ display: "inline-block", marginTop: 7, fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4, cursor: kb.basis ? "pointer" : "default",
                    background: ok ? tok.successBg : tok.warnBg, color: ok ? tok.success : tok.warn }}>{lbl}{kb.basis ? (kpiOpen === i ? " \u25b4" : " \u25be") : ""}</span>
                  {kpiOpen === i && kb.basis && <div style={{ fontSize: 11, color: tok.text3, marginTop: 6, lineHeight: 1.45 }}>Basis: {kb.basis}</div>}
                </>);
              })()}
            </div>
          ))}
        </div>
      )}

      {/* ── SYNTHESIS ROW ── */}
      <div onClick={() => setOpen(true)}
        style={{ marginBottom: 24, borderRadius: 10, border: `1px solid ${tok.accent}55`, background: tok.surface, boxShadow: tok.shadowMd, cursor: "pointer", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: tok.accentBg, border: `1px solid ${tok.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏛️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-head)", fontSize: 16, fontWeight: 600, color: tok.text }}>Boardroom Synthesis</div>
            <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 1 }}>Executive consensus · AI-generated</div>
          </div>
          {actions}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: tok.text2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>{headline}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: tok.accent, marginTop: 9 }}>Open full synthesis ↗</div>
      </div>

      {/* ── FULL READER ── */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,14,26,0.62)", zIndex: 9995, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "min(1120px,100%)", maxHeight: "90vh", background: tok.surface, borderRadius: 12, border: `1px solid ${tok.border}`, boxShadow: tok.shadowLg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${tok.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 17, fontWeight: 600, color: tok.text }}>Boardroom Synthesis</div>
                {question && <div style={{ fontSize: 11.5, color: tok.text3, marginTop: 2, fontStyle: "italic" }}>"{question.slice(0, 140)}{question.length > 140 ? "…" : ""}"</div>}
              </div>
              {actions}
              <ReadAloudButton text={raw.replace(/[#*`_>|]/g, "")} id={"boardroom-synth-" + (question || "").slice(0, 24)} />
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: `1px solid ${tok.border}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: tok.text3, fontSize: 15, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ padding: "20px 26px", overflowY: "auto", flex: 1 }}>
              <RenderedMd text={raw.replace(/===BOARD_KPIS===[\s\S]*?===END_KPIS===/, "").replace(/===CRUX===[\s\S]*?===END_CRUX===/, "").trim()} tok={tok} isDark={isDark} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── AGENT SELECTOR ──────────────────────────────────────────────────────────
function AgentSelector({ agents, selected, onToggle, disabled, tok }: { agents: any[]; selected: string[]; onToggle: (id: string) => void; disabled: boolean; tok: typeof T.light }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
      {agents.map(a => {
        const sel = selected.includes(a.id);
        return (
          <button key={a.id} onClick={() => !disabled && onToggle(a.id)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: `1px solid ${sel ? a.dc + "60" : tok.border}`,
              background: sel ? a.dc + "12" : tok.surface2,
              color: sel ? a.dc : tok.text3,
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              opacity: disabled && !sel ? 0.4 : 1,
            }}>
            <span style={{ fontSize: 16 }}>{a.ic}</span>
            <span>{a.t}</span>
            {sel && <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.dc, marginLeft: 2 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── QUESTION INPUT ───────────────────────────────────────────────────────────
function QuestionInput({ value, onChange, onSubmit, disabled, isRunning, onCancel, MicButton, vLang, tok }: any) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 10,
        background: tok.inputBg,
        border: `2px solid ${disabled ? tok.border : tok.accent}`,
        borderRadius: 14, padding: "12px 14px",
        boxShadow: disabled ? "none" : `0 0 0 3px ${tok.accent}15`,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled && value.trim()) onSubmit();
            }
          }}
          placeholder="Ask the boardroom a strategic question… (e.g. Should we expand to UAE next quarter?)"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: tok.text, fontSize: 15, fontFamily: "Inter, sans-serif",
            resize: "none", lineHeight: 1.6, padding: "4px 0", minHeight: 28,
          }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {MicButton && <MicButton lang={vLang} onResult={(t: string) => onChange((prev: string) => (prev ? prev + " " : "") + t)} disabled={disabled} />}
          {isRunning ? (
            <button onClick={onCancel}
              style={{ padding: "8px 16px", borderRadius: 9, background: tok.dangerBg, color: tok.danger, border: `1px solid ${tok.danger}40`, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              ✕ Cancel
            </button>
          ) : (
            <button onClick={onSubmit} disabled={disabled || !value.trim()}
              style={{ padding: "10px 20px", borderRadius: 9, background: disabled || !value.trim() ? tok.muted : tok.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: disabled || !value.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: disabled || !value.trim() ? 0.4 : 1, transition: "all 0.15s" }}>
              Start Boardroom →
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: tok.muted, marginTop: 6, paddingLeft: 4 }}>
        Press Enter to submit · Shift+Enter for new line
      </div>
    </div>
  );
}

// ─── PHASE INDICATOR ──────────────────────────────────────────────────────────
function PhaseIndicator({ phase, tok }: { phase: string; tok: typeof T.light }) {
  if (!phase) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: tok.accentBg, borderRadius: 10, marginBottom: 20, border: `1px solid ${tok.accent}30` }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: tok.danger, flexShrink: 0, animation: "pulse 1s ease-in-out infinite" }} />
      <span style={{ fontSize: 14, color: tok.accent, fontWeight: 500 }}>{phase}</span>
    </div>
  );
}

// ─── HISTORY PANEL ────────────────────────────────────────────────────────────
function HistoryPanel({ sessions, onReopen, onDelete, tok }: { sessions: any[]; onReopen: (s: any) => void; onDelete: (id: number) => void; tok: typeof T.light }) {
  const [compare, setCompare] = useState<any[] | null>(null);
  if (compare) return (
    <div onClick={() => setCompare(null)}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,26,0.62)", zIndex: 9996, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(1400px,100%)", maxHeight: "90vh", background: tok.surface, borderRadius: 12, border: `1px solid ${tok.border}`, boxShadow: tok.shadowLg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "15px 22px", borderBottom: `1px solid ${tok.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 17, fontWeight: 600, color: tok.text, flex: 1 }}>Compare sessions · {compare.length}</div>
          <button onClick={() => setCompare(null)}
            style={{ background: "none", border: `1px solid ${tok.border}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: tok.text3, fontSize: 15, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(compare.length, 3)}, minmax(0,1fr))`, gap: 16, padding: 20, overflowY: "auto" }}>
          {compare.map((s: any, i: number) => {
            const syn = s.synthesis || (Array.isArray(s.stages) ? s.stages.map((st: any) => st.synthesis).filter(Boolean).join("\n\n") : "");
            const clean = syn.replace(/===BOARD_KPIS===[\s\S]*?===END_KPIS===/, "").replace(/===CRUX===|===END_CRUX===/g, "").replace(/[*`_#>]/g, "").trim();
            return (
              <div key={i} style={{ border: `1px solid ${tok.border}`, borderRadius: 10, background: tok.surface2, padding: 16, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: tok.text, lineHeight: 1.4 }}>{s.q}</div>
                <div style={{ fontSize: 11, color: tok.text3, margin: "5px 0 10px" }}>
                  {(s.agents || []).length || s.execCount || "—"} executives · {s.ts ? new Date(s.ts).toLocaleDateString() : ""}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: tok.text2, whiteSpace: "pre-wrap" }}>{clean.slice(0, 2200) || "No synthesis saved for this session."}</div>
                <button onClick={() => { setCompare(null); onReopen(s); }}
                  style={{ marginTop: 12, padding: "6px 12px", borderRadius: 7, border: `1px solid ${tok.border}`, background: tok.surface, color: tok.text2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Open this one</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  if (!sessions.length) return null;
  return (
    <div style={{ marginBottom: 24, borderRadius: 12, border: `1px solid ${tok.border}`, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", background: tok.surface2, borderBottom: `1px solid ${tok.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tok.text2 }}>🕓 Past Boardroom Sessions</div>
      </div>
      <div style={{ background: tok.surface }}>
        {sessions.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: i < sessions.length - 1 ? `1px solid ${tok.border}` : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: tok.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.q}</div>
              <div style={{ fontSize: 12, color: tok.muted, marginTop: 4, display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                <span>{(s.agents?.length || s.debate?.length || 0)} executives</span>
                {(()=>{ const fu = s.agents?.length ? Math.floor((s.debate?.length - s.agents.length) / s.agents.length) : 0; return fu > 0 ? <span style={{ color: tok.accent }}>· ↻ {fu} follow-up{fu > 1 ? "s" : ""}</span> : null; })()}
                <span>· {new Date(s.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
            <button onClick={() => setCompare(sessions.slice(0, 3))} title="Open the latest sessions side by side"
                style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${tok.accent}55`, background: "none", color: tok.accent, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", marginRight: 6 }}>Compare</button>
              <button onClick={() => onReopen(s)} title="Open this session on its own"
              style={{ ...actionBtn(tok, true), color: tok.accent, whiteSpace: "nowrap" }}>
              Reopen
            </button>
            <button onClick={() => onDelete(s.id)}
              style={{ ...actionBtn(tok), color: tok.danger }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONTINUE DEBATE ──────────────────────────────────────────────────────────
function DecisionStatus({ status, tok }: { status: string; tok: typeof T.light }) {
  const colors: Record<string, string> = {
    "Proceed": "#10B981",
    "Proceed with Conditions": "#F97316",
    "Needs More Information": "#F59E0B",
    "Do Not Proceed": "#EF4444",
    "No Consensus": "#8B5CF6",
  };
  const color = colors[status] || tok.muted;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 20,
      background: color + "18", border: `1px solid ${color}44` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{status}</span>
    </div>
  );
}

function FollowUpInput({
  value, onChange, onSubmit, disabled, tok,
  prevExecIds, CS, suggestions,
  followUpExecIds, setFollowUpExecIds,
  onAcceptSuggestions,
}: any) {
  const [showExecPanel, setShowExecPanel] = useState(false);
  const currentIds: string[] = followUpExecIds.length > 0 ? followUpExecIds : [...prevExecIds];

  const toggle = (id: string) => {
    const next = currentIds.includes(id)
      ? currentIds.filter((x: string) => x !== id)
      : [...currentIds, id];
    setFollowUpExecIds(next.length ? next : currentIds);
  };

  const newSuggestions = suggestions.filter((s: any) => !currentIds.includes(s.id));

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${tok.accent}44`,
      overflow: "hidden", background: tok.surface, marginBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tok.border}`,
        background: tok.surface2, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>↻</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: tok.text }}>Continue this Decision Thread</div>
          <div style={{ fontSize: 11, color: tok.muted, marginTop: 1 }}>
            Add a follow-up question. All prior stages are automatically included as context.
          </div>
        </div>
      </div>

      {/* Question input */}
      <div style={{ padding: "14px 18px 10px" }}>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. What is the realistic setup cost and can we verify independently?"
          disabled={disabled}
          rows={2}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 9,
            border: `1px solid ${tok.border}`, background: tok.inputBg,
            color: tok.text, fontSize: 14, resize: "none",
            fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" as const }} />
      </div>

      {/* AI suggestions */}
      {newSuggestions.length > 0 && (
        <div style={{ padding: "0 18px 12px" }}>
          <div style={{ fontSize: 11, color: tok.muted, marginBottom: 6, fontWeight: 600 }}>
            💡 AI suggests for this question:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {newSuggestions.map((s: any) => {
              const exec = CS.find((e: any) => e.id === s.id);
              if (!exec) return null;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 8, fontSize: 11,
                  background: tok.accent + "10", border: `1px solid ${tok.accent}33`, color: tok.text2 }}>
                  <span>{exec.ic}</span>
                  <span style={{ fontWeight: 600 }}>{exec.t}</span>
                  <span style={{ color: tok.muted }}>— {s.reason}</span>
                </div>
              );
            })}
            <button onClick={onAcceptSuggestions}
              style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: tok.accent, color: "#fff", border: "none", cursor: "pointer" }}>
              ✓ Add suggested
            </button>
          </div>
        </div>
      )}

      {/* Executive selector */}
      <div style={{ padding: "0 18px 12px" }}>
        <button onClick={() => setShowExecPanel(!showExecPanel)}
          style={{ fontSize: 11, color: tok.accent, background: "none", border: "none",
            cursor: "pointer", fontFamily: "Inter, sans-serif", padding: 0, marginBottom: 8, fontWeight: 600 }}>
          {showExecPanel ? "▲ Hide" : "▼ Choose"} executives for this question
          ({currentIds.length} selected)
        </button>
        {showExecPanel && (
          <div style={{ border: `1px solid ${tok.border}`, borderRadius: 9, padding: 12, background: tok.surface2 }}>
            <div style={{ fontSize: 11, color: tok.muted, marginBottom: 8 }}>
              Pre-selected from previous stage. Add or remove as needed.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
              {CS.map((exec: any) => {
                const sel = currentIds.includes(exec.id);
                return (
                  <button key={exec.id} onClick={() => toggle(exec.id)} disabled={disabled}
                    style={{ display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${sel ? exec.dc + "66" : tok.border}`,
                      background: sel ? exec.dc + "14" : tok.surface,
                      color: sel ? exec.dc : tok.text3,
                      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.12s" }}>
                    <span>{exec.ic}</span>
                    <span>{exec.t}</span>
                    {sel && <span style={{ fontSize: 9, color: exec.dc }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Send button */}
      <div style={{ padding: "0 18px 14px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onSubmit} disabled={disabled || !value.trim()}
          style={{ padding: "10px 22px", borderRadius: 9, background: tok.accent,
            color: "#fff", border: "none", fontWeight: 700, fontSize: 13,
            cursor: "pointer", opacity: disabled || !value.trim() ? 0.4 : 1 }}>
          Send to {currentIds.length} executive{currentIds.length !== 1 ? "s" : ""} →
        </button>
      </div>
    </div>
  );
}


function btnBase(tok: typeof T.light, active = false, activeColor?: string): React.CSSProperties {
  return {
    background: active && activeColor ? activeColor + "12" : tok.surface2,
    border: `1px solid ${active && activeColor ? activeColor + "44" : tok.border}`,
    borderRadius: 7, padding: "6px 12px", cursor: "pointer",
    color: active && activeColor ? activeColor : tok.text3,
    fontSize: 12, fontWeight: 500, fontFamily: "Inter, sans-serif",
    transition: "all 0.15s",
  };
}
function actionBtn(tok: typeof T.light, accent = false, color?: string): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
    background: tok.surface2, border: `1px solid ${tok.border}`,
    color: color || tok.text3, cursor: "pointer", fontFamily: "Inter, sans-serif",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
interface BoardroomViewProps {
  exportVerbatimPDF?: (title: string, markdown: string) => Promise<void> | void;
  researchPriorityGaps?: (stageIndex: number) => void;
  ledgerEntries?: any[]; customAccounts?: any[]; explainLevel?: "new" | "expert";
  saveCockpit?: (patch: any, handoff?: any) => void; addCockpitActions?: (texts: string[], label: string, notes?: string[]) => void; openInTimeMachine?: (text: string) => void;
  brFreshResearch?: boolean; setBrFreshResearch?: (v: boolean) => void;
  // Data
  brQ: string; setBrQ: (v: string) => void;
  brAg: string[]; setBrAg: (v: string[]) => void;
  brCur: any; brRun: boolean; brPh: string;
  brSessions: any[]; setBrSessions: (v: any[]) => void;
  brShowHistory: boolean; setBrShowHistory: (v: boolean) => void;
  brFollowUp: string; setBrFollowUp: (v: string) => void;
  drillRole: string | null; setDrillRole: (v: string | null) => void;
  drillQ: string; setDrillQ: (v: string) => void;
  drillRun: boolean;
  brEnd: React.RefObject<HTMLDivElement>;
  // Actions
  runBR: () => void;
  runBRContinue: () => void;
  runDrill: () => void;
  cancelBR: () => void;
  dlFile: (name: string, content: any, mime?: string) => void;
  cp: (text: string) => void;
  quickExport: (mode: string, type: string, title: string, content: string) => void;
  extractActionItems: (source: string, label: string, content: string) => void;
  extracting: string | null;
  showToast: (msg: string, type?: string) => void;
  sv: (key: string, val: any) => void;
  setBrCur: (v: any) => void;
  // Config
  CS: any[];
  co: any; cur: any;
  isDark: boolean;
  MicButton?: any; vLang?: string;
  // Decision Thread props
  followUpExecIds: string[]; setFollowUpExecIds: (v: string[]) => void;
  followUpSuggestions: any[]; setFollowUpSuggestions: (v: any[]) => void;
  suggestFollowUpExecs: (q: string, prevIds: string[]) => any[];
}

export default function BoardroomView(props: BoardroomViewProps) {
  const {
    brQ, setBrQ, brAg, setBrAg, brCur, brRun, brPh, exportVerbatimPDF, researchPriorityGaps, brFreshResearch, setBrFreshResearch,
    saveCockpit, addCockpitActions, openInTimeMachine, ledgerEntries, customAccounts, explainLevel,
    brSessions, setBrSessions, brShowHistory, setBrShowHistory,
    brFollowUp, setBrFollowUp, drillRole, setDrillRole,
    drillQ, setDrillQ, drillRun, brEnd,
    runBR, runBRContinue, runDrill, cancelBR,
    dlFile, cp, quickExport, extractActionItems, extracting,
    showToast, sv, setBrCur,
    CS, co, cur, isDark, MicButton, vLang = "en-IN",
    followUpExecIds, setFollowUpExecIds,
    followUpSuggestions, setFollowUpSuggestions,
    suggestFollowUpExecs,
  } = props;
  // Which stage's contradiction list is expanded (clickable count in Board Status).
  const [showContradictions, setShowContradictions] = useState<number | null>(null);
  // Completed stages lead with the Decision Cockpit; the executive debate is secondary.
  const [debateOpen, setDebateOpen] = useState<Record<number, boolean>>({});
  // Problems are never hidden: a stage whose executives are not all complete (partial,
  // duplicate, identity mismatch, failed, legacy) shows its debate by default.
  const stageHasIssues = (st: any) => (st?.debate || []).some((d: any) => !d?.identity || !["COMPLETE", "CONTINUATION_COMPLETE"].includes(d?.status || "COMPLETE")
    || (d?.identity && d?.ag?.id && d.identity.executiveId !== d.ag.id));
  const isDebateOpen = (si: number, st: any) => (debateOpen[si] !== undefined ? debateOpen[si] : stageHasIssues(st));

  const tok = isDark ? T.dark : T.light;

  // Support both threaded (new) and legacy (flat) format
  const isThreaded = brCur.format === "threaded" && Array.isArray(brCur.stages);
  const isLegacy = !isThreaded && (brCur.debate?.length > 0 || brCur.synthesis);
  const hasSession = isThreaded ? brCur.stages.length > 0 : isLegacy;
  const latestStage = isThreaded && brCur.stages.length > 0
    ? brCur.stages[brCur.stages.length - 1] : null;
  const latestDecisionStatus = latestStage?.decisionStatus || null;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: tok.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ── INNER CONTAINER ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 28px 60px" }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: tok.text, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                AI Boardroom
              </h1>
              <p style={{ fontSize: 14, color: tok.text3, margin: "6px 0 0", lineHeight: 1.5 }}>
                Live executive debate · {co.location || "Set location in Settings"} · {cur?.code || "INR"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {brSessions.length > 0 && (
                <>
                  <button onClick={() => setBrShowHistory(h => !h)}
                    style={{ ...actionBtn(tok, brShowHistory, tok.accent), color: brShowHistory ? tok.accent : tok.text3 }}>
                    {brShowHistory ? "✕ Hide" : `🕓 History (${brSessions.length})`}
                  </button>
                  <button onClick={() => dlFile("Boardroom-" + Date.now() + ".json", brSessions)}
                    style={actionBtn(tok)}>
                    Export All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── HISTORY PANEL ── */}
        {brShowHistory && (
          <HistoryPanel
            sessions={brSessions}
            tok={tok}
            onReopen={s => {
              // Sessions are saved threaded ({format,stages}). The old code
                // only looked for the flat {debate,synthesis} shape, so nothing
                // was restored. Carry both, and rebuild stages if a legacy
                // session is opened.
                const restored: any = Array.isArray(s.stages) && s.stages.length
                  ? { format: "threaded", stages: s.stages, q: s.q, drilldown: {}, researchBrief: s.researchBrief || "" }
                  : (s.debate?.length || s.synthesis)
                    ? { format: "threaded", q: s.q, drilldown: {}, researchBrief: s.researchBrief || "",
                        stages: [{ question: s.q, debate: s.debate || [], synthesis: s.synthesis || "",
                                   decisionStatus: s.decisionStatus || "", completedAt: s.ts || Date.now() }] }
                    : { q: s.q, debate: [], synthesis: "", drilldown: {}, researchBrief: s.researchBrief || "" };
              // PHASE 14: restore the Research State, grounding, intake register and
              // session id too. Previously only the brief text came back, so a
              // reopened session's follow-ups ran with no Research State, and its
              // follow-up stages were written into whichever session was newest.
              restored.researchState = s.researchState || null;
              restored.grounded = s.grounded ?? false;
              restored.intakeRegister = s.intakeRegister || "";
              restored.sessionId = s.id;
              setBrCur(restored); setBrQ(s.q);
              setBrAg(s.agents || brAg); sv("cos-br-live", restored);
              setBrShowHistory(false);
              showToast("Session reopened", "success");
            }}
            onDelete={id => {
              if (confirm("Delete this session?")) {
                const ns = brSessions.filter(x => x.id !== id);
                setBrSessions(ns); sv("cos-br", ns);
              }
            }}
          />
        )}

        {/* ── AGENT SELECTOR ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tok.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Select Executives ({brAg.length} selected — min 2)
          </div>
          <AgentSelector agents={CS} selected={brAg} onToggle={id => setBrAg(brAg.includes(id) ? brAg.filter(x => x !== id) : [...brAg, id])} disabled={brRun} tok={tok} />
        </div>

        {/* ── QUESTION INPUT ── (journey step "Ask") */}
        <div id="dj-ask" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tok.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Strategic Question
          </div>
          <QuestionInput
            value={brQ} onChange={setBrQ}
            onSubmit={runBR} disabled={brRun || brAg.length < 2}
            isRunning={brRun} onCancel={cancelBR}
            MicButton={MicButton} vLang={vLang} tok={tok} />
          {setBrFreshResearch && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: tok.text3, cursor: "pointer" }}>
              <input type="checkbox" checked={!!brFreshResearch} onChange={(e: any) => setBrFreshResearch(e.target.checked)} />
              Fresh research (otherwise research from the last 7 days for this exact question is reused)
            </label>)}
        </div>

        {/* ── PHASE INDICATOR ── */}
        <PhaseIndicator phase={brPh} tok={tok} />

        {/* ── RESEARCH BRIEF ── */}
        {brCur.researchBrief && (
          <ResearchBriefPanel text={brCur.researchBrief} tok={tok} />
        )}

        {/* ══ THREADED: Decision Thread Stages ══ */}
        {isThreaded && brCur.stages.map((stage: any, si: number) => (
          <div key={si} style={{ marginBottom: 8 }}>
            {/* Stage header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", marginBottom: 16,
              background: tok.surface2, borderRadius: 10,
              border: `1px solid ${tok.border}` }}>
              <div style={{ width: 28, height: 28, borderRadius: 8,
                background: tok.accent + "18", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12, fontWeight: 800, color: tok.accent,
                flexShrink: 0 }}>{si + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: tok.muted,
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                  {si === 0 ? "Original Question" : `Follow-up · Stage ${si + 1}`}
                  {stage.completedAt && (
                    <span style={{ fontWeight: 400, marginLeft: 6 }}>
                      · {new Date(stage.completedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: tok.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  "{stage.question}"
                </div>
              </div>
              {stage.decisionStatus && (
                <DecisionStatus status={stage.decisionStatus} tok={tok} />
              )}
            </div>
            {/* DECISION COCKPIT - decision, gates, scenarios, Autopilot (calculated, no AI call) */}
            {stage.synthesis && (
              <DecisionCockpitView cur={brCur} si={si} analysis={cachedAnalysis(brCur, si, co?.location || "")} tok={tok}
                saveCockpit={saveCockpit} addCockpitActions={addCockpitActions} openInTimeMachine={openInTimeMachine} showToast={showToast}
                quickExport={quickExport} exportVerbatimPDF={exportVerbatimPDF} dlFile={dlFile} cp={cp} company={co?.name || ""} location={co?.location || ""} ledgerEntries={ledgerEntries} customAccounts={customAccounts} explainLevel={explainLevel}
                onShowDebate={() => { setDebateOpen({ ...debateOpen, [si]: true }); setTimeout(() => { try { document.getElementById("debate-" + si)?.scrollIntoView({ behavior: "smooth" }); } catch {} }, 50); }} />
            )}
            {/* KPI strip + synthesis (renders the board's declared figures) */}
            {stage.synthesis && (
              <SynthesisCard
                synthesis={stage.synthesis} question={stage.question}
                basisText={(stage.debate || []).map((d: any) => d.fullText || d.text || "").join("\n")}
                kpiClaims={cachedAnalysis(brCur, si, co?.location || "")?.claims || []}
                tok={tok} isDark={isDark}
                onCopy={() => cp(stage.synthesis)}
                onExportPDF={() => quickExport("pdf", "executive",
                  `Boardroom Stage ${si + 1} — ${stage.question}`, stage.synthesis)}
                onExportPPT={() => quickExport("pptx", "strategy",
                  `Boardroom Stage ${si + 1}`, stage.synthesis)}
                onExportMD={() => dlFile(`Synthesis-Stage${si+1}-${Date.now()}.md`,
                  `# ${stage.question}\n\n${stage.synthesis}`, "text/markdown")}
                onExtractActions={() => extractActionItems("boardroom",
                  `Boardroom Stage ${si + 1} — "${stage.question}"`, stage.synthesis)}
                extracting={extracting === "boardroom"}
              />
            )}

            {stage.synthesis && (
              <button onClick={() => setDebateOpen({ ...debateOpen, [si]: !isDebateOpen(si, stage) })}
                style={{ margin: "4px 0 12px", padding: "8px 14px", borderRadius: 8, border: `1px solid ${tok.border}`, background: tok.surface, color: tok.text2, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {isDebateOpen(si, stage) ? "Hide executive debate & evidence" : "View executive debate & evidence (" + (stage.debate || []).length + " executives)"}</button>)}
            {/* ── TWO COLUMNS: debate left, decision + evidence right ── */}
            {(!stage.synthesis || isDebateOpen(si, stage)) && (
            <div id={"debate-" + si} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>

              {/* LEFT — Executive Debate */}
              <div style={{ borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${tok.border}`, display: "flex", alignItems: "center" }}>
                  <div style={{ fontFamily: "var(--font-head)", fontSize: 16, fontWeight: 600, color: tok.text }}>Executive Debate</div>
                  <div style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: tok.accent }}>{(stage.debate || []).length} executives</div>
                </div>
                <div style={{ padding: "6px 14px 14px" }}>
                  {(stage.debate || []).map((e: any, ei: number) => (
                    <ExecutiveCard
                      key={e.identity?.callId || ((e.ag?.id || "x") + "-" + si + "-" + ei)} entry={e} index={ei} question={stage.question}
                      isDark={isDark} tok={tok} stageNumber={si + 1}
                      intel={brCur.researchState?.intelligence} drillAnswers={brCur.drilldown?.[e.ag?.id]}
                      claims={(cachedAnalysis(brCur, si, co?.location || "")?.claims || []).filter((c: any) => c.executive === e.ag?.t)}
                      drillRole={drillRole}
                      drillQ={drillQ} setDrillQ={setDrillQ}
                      drillRun={drillRun} runDrill={runDrill}
                      onDrill={() => setDrillRole(drillRole === e.ag.id ? null : e.ag.id)}
                      showDrillClose={() => { setDrillRole(null); setDrillQ(""); }}
                      onCopy={() => cp(e.fullText || e.text)}
                      onContinue={async () => showToast("Use the follow-up box below to continue.", "info")}
                    />
                  ))}
                </div>
              </div>

              {/* RIGHT - one deterministic analysis drives every panel (and the exports) */}
              {(() => {
                const debate = stage.debate || [];
                const an = cachedAnalysis(brCur, si, co?.location || "");
                if (!an) return <div style={{ fontSize: 12, color: tok.muted }}>Analysis unavailable for this stage.</div>;
                const intel = brCur.researchState?.intelligence || null;
                const d = an.decision; const rows = an.rows;
                const done = rows.filter((r: any) => r.complete).length;
                const partial = rows.filter((r: any) => !r.complete && r.included !== "excluded").length;
                const failed = rows.filter((r: any) => r.included === "excluded").length;
                const sp = an.support;
                const openX = an.contradictions.filter((c) => c.status !== "resolved");
                const hiGaps = (intel?.gaps || []).filter((g: any) => g.priority === "high" && g.current_status !== "closed");
                const panel = (title: string, body: any) => (
                  <div style={{ borderRadius: 10, border: `1px solid ${tok.border}`, background: tok.surface, boxShadow: tok.shadow, overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: `1px solid ${tok.border}`, fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 600, color: tok.text }}>{title}</div>
                    <div style={{ padding: "12px 18px" }}>{body}</div>
                  </div>);
                const row = (dot: string, lbl: string, val: any, onClick?: () => void) => (
                  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", fontSize: 12.5, cursor: onClick ? "pointer" : "default" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                    <span style={{ color: tok.text2, textDecoration: onClick ? "underline dotted" : "none" }}>{lbl}</span><span style={{ marginLeft: "auto", fontWeight: 700, color: tok.text }}>{val}</span>
                  </div>);
                const sub = (t: string, color?: string) => <div style={{ fontSize: 10, fontWeight: 800, color: color || tok.text3, letterSpacing: ".1em", textTransform: "uppercase", margin: "12px 0 5px" }}>{t}</div>;
                const list = (xs: string[], ordered = false) => ordered
                  ? <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: tok.text }}>{xs.map((x, i) => <li key={i}>{x}</li>)}</ol>
                  : <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.55, color: tok.text2 }}>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>;
                const confTone = d.confidence === "HIGH" ? tok.success : d.confidence === "MEDIUM" ? tok.warn : tok.danger;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {an.execution.message && (
                      <div style={{ fontSize: 12, padding: "9px 14px", borderRadius: 8, border: `1px solid ${tok.border}`, background: an.execution.state === "SUCCESS" ? tok.surface : an.execution.state === "SUCCESS_AFTER_FALLBACK" ? tok.surface2 : tok.warnBg, color: tok.text2 }}>
                        {an.execution.message}</div>)}
                    {panel("Board Decision", (<>
                      <div style={{ background: "var(--oiq-sbBg)", borderRadius: 9, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--oiq-accent)", letterSpacing: ".12em", textTransform: "uppercase" }}>{d.state}</div>
                        <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 600, color: "var(--oiq-sbText)", marginTop: 4 }}>{d.decision}</div>
                        <div style={{ fontSize: 11.5, marginTop: 6 }}><span style={{ fontWeight: 800, color: confTone }}>Confidence: {d.confidence}</span> <span style={{ color: "var(--oiq-sbText)", opacity: .8 }}>— {d.confidenceReason}</span></div>
                        {stage.decisionStatus && <div style={{ fontSize: 11, color: "var(--oiq-sbText)", opacity: .7, marginTop: 4 }}>Chairman's verdict: {stage.decisionStatus}</div>}
                      </div>
                      {d.why.length > 0 && (<>{sub("Why")}{list(d.why.slice(0, 6))}</>)}
                      {d.invalidators.length > 0 && (<>{sub("What could change it")}{list(d.invalidators)}</>)}
                      {d.requiredUserDecisions.length > 0 && (<>{sub("Decision required from you", tok.accent)}{list(d.requiredUserDecisions, true)}</>)}
                      {hiGaps.length > 0 && (<>{sub("High-priority evidence gaps", tok.warn)}{list(hiGaps.slice(0, 4).map((g: any) => g.id + " " + g.question))}
                        {an.priorityGaps.length > 0 && researchPriorityGaps && !brRun && (
                          <button onClick={() => researchPriorityGaps(si)} style={{ ...btnBase(tok, false, tok.accent), fontSize: 12, padding: "6px 12px", marginTop: 8 }}>
                            Research {an.priorityGaps.length} priority gap{an.priorityGaps.length === 1 ? "" : "s"}</button>)}</>)}
                    </>))}
                    {panel("Board Status", (<>
                      {row(tok.accent, "Executives selected", rows.length)}
                      {row(tok.success, "Complete", done)}
                      {row(tok.warn, "Partial / legacy", partial)}
                      {row(tok.danger, "Failed / excluded", failed)}
                      {row(tok.warn, "Open evidence gaps", (intel?.gaps || []).filter((g: any) => g.current_status !== "closed").length)}
                      {row(tok.danger, "Contradictions (open / total)", openX.length + " / " + an.contradictions.length, an.contradictions.length ? () => setShowContradictions(showContradictions === si ? null : si) : undefined)}
                      {showContradictions === si && an.contradictions.map((c) => (
                        <div key={c.id} style={{ fontSize: 11.5, color: tok.text2, padding: "6px 0", borderTop: `1px solid ${tok.border}` }}>
                          <b>{c.id} {c.variable}</b> <span style={{ color: c.status === "resolved" ? tok.success : c.severity === "HIGH" ? tok.danger : tok.warn }}>[{c.type.toLowerCase()} · {c.severity.toLowerCase()} · {c.status.replace(/_/g, " ")}]</span>
                          <div>{c.executiveA} vs {c.executiveB}: {c.resolutionMethod}{c.resolutionEvidence ? " (" + c.resolutionEvidence + ")" : ""}</div>
                        </div>))}
                      {rows.filter((r: any) => !r.complete).map((r: any, i: number) => (
                        <div key={i} style={{ fontSize: 11.5, color: tok.text3, marginTop: 4 }}>{r.executive}: {r.status.replace(/_/g, " ").toLowerCase()}{r.note ? " \u2014 " + r.note : ""}</div>))}
                    </>))}
                    {panel("Evidence Quality (linked to sources)", (<>
                      {row(tok.success, "Verified (backed by a retrieved source)", sp.SUPPORTED)}
                      {row(tok.text3, "Partly supported", sp.PARTIALLY_SUPPORTED)}
                      {row(tok.danger, "Contradicted by research", sp.CONTRADICTED)}
                      {row(tok.text3, "Executive inference", sp.INFERRED)}
                      {row(tok.warn, "Assumptions", sp.ASSUMED)}
                      {row(tok.warn, "Estimates", sp.ESTIMATED)}
                      {row(tok.danger, "Unverified", sp.UNVERIFIED)}
                      <div style={{ fontSize: 11, color: tok.muted, marginTop: 6 }}>{sp.total} material claims across {debate.length} executives{sp.modelAsserted ? "; " + sp.modelAsserted + " labelled \u201cverified\u201d by the model without supporting evidence" : ""}.</div>
                    </>))}
                  </div>);
              })()}
            </div>)}
            {si < brCur.stages.length - 1 && (
              <div style={{ height: 1, background:
                `linear-gradient(90deg, transparent, ${tok.accent}44, transparent)`,
                margin: "24px 0" }} />
            )}
          </div>
        ))}

        {/* ══ LEGACY: flat debate rendering ══ */}
        {isLegacy && brCur.q && (
          <div style={{ marginBottom: 24, padding: "16px 20px", background: tok.surface2, borderRadius: 12, border: `1px solid ${tok.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tok.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Strategic Question</div>
            <div style={{ fontSize: 16, color: tok.text, lineHeight: 1.5, fontWeight: 500 }}>"{brCur.q}"</div>
          </div>
        )}
        {isLegacy && brCur.debate?.map((e: any, i: number) => (
          <ExecutiveCard
            key={i} entry={e} index={i} question={brCur.q}
            isDark={isDark} tok={tok}
            drillRole={drillRole}
            drillQ={drillQ} setDrillQ={setDrillQ}
            drillRun={drillRun} runDrill={runDrill}
            onDrill={() => setDrillRole(drillRole === e.ag.id ? null : e.ag.id)}
            showDrillClose={() => { setDrillRole(null); setDrillQ(""); }}
            onCopy={() => cp(e.text)}
            onContinue={async () => showToast("Continuing response…", "info")}
          />
        ))}
        {isLegacy && brCur.synthesis && (
          <SynthesisCard
            synthesis={brCur.synthesis} question={brCur.q}
            tok={tok} isDark={isDark}
            onCopy={() => cp(brCur.synthesis)}
            onExportPDF={() => quickExport("pdf", "executive", "Boardroom — " + brCur.q, brCur.synthesis)}
            onExportPPT={() => quickExport("pptx", "strategy", "Boardroom — " + brCur.q, brCur.synthesis)}
            onExportMD={() => dlFile("Synthesis-" + Date.now() + ".md", "# " + brCur.q + "\n\n" + brCur.synthesis, "text/markdown")}
            onExtractActions={() => extractActionItems("boardroom", 'Boardroom — "' + brCur.q + '"'  , brCur.synthesis)}
            extracting={extracting === "boardroom"}
          />
        )}

        {/* ── FULL EXPORT BAR ── */}
        {hasSession && !brRun && (
          <div style={{ display: "flex", gap: 8, padding: "14px 18px", background: tok.surface2, borderRadius: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tok.text3, marginRight: 4, alignSelf: "center" }}>Full Thread:</div>
            {/* FULL THREAD = every executive's complete text, completeness, evidence
                classes, opportunities, contradictions, ledger and synthesis - built
                from the canonical full texts, never from card previews. */}
            <button onClick={() => {
              const md = isThreaded ? buildFullThreadMarkdown(brCur) : ("# " + brCur.q + "\n\n" + (brCur.debate || []).map((d: any) => "**" + d.ag.t + ":**\n" + (d.fullText || d.text)).join("\n\n") + (brCur.synthesis ? "\n\n**Synthesis:**\n" + brCur.synthesis : ""));
              // Verbatim PDF (no AI rewriting, paginates long responses) when available.
              if (exportVerbatimPDF) { Promise.resolve(exportVerbatimPDF("Decision Thread \u2014 " + brCur.q, md)).catch((e: any) => showToast("PDF failed: " + String(e?.message || e), "error")); }
              else quickExport("pdf", "detailed", "Decision Thread \u2014 " + brCur.q, md);
            }} style={actionBtn(tok)}>Full PDF</button>
            <button onClick={() => {
              // Was: syntheses only - the executive debate was left out entirely.
              const md = isThreaded ? buildFullThreadMarkdown(brCur) : ((brCur.debate || []).map((d: any) => d.ag.t + ": " + (d.fullText || d.text)).join("\n\n") + "\n\n" + (brCur.synthesis || ""));
              quickExport("pptx", "strategy", "Decision Thread \u2014 " + brCur.q, md);
            }} style={actionBtn(tok)}>Full PPT</button>
            <button onClick={() => {
              const md = isThreaded ? buildFullThreadMarkdown(brCur) : ("# " + brCur.q + "\n\n" + (brCur.debate || []).map((d: any) => "**" + d.ag.t + ":**\n" + (d.fullText || d.text)).join("\n\n") + (brCur.synthesis ? "\n\n**Synthesis:**\n" + brCur.synthesis : ""));
              dlFile("Boardroom-Thread-" + Date.now() + ".md", md, "text/markdown");
            }} style={actionBtn(tok)}>Full MD</button>
            <button onClick={() => {
              // Structured brief first, then the COMPLETE thread. Copied to the clipboard
              // (mailto: links are length-limited and would cut the analysis).
              const last = (brCur.stages || []).slice(-1)[0] || {};
              const intel = brCur.researchState?.intelligence || null;
              const dbt = last.debate || [];
              const rows = last.completeness && last.completeness.length ? last.completeness : completenessReport(dbt, dbt.map((d: any) => ({ executiveId: d?.ag?.id || d?.identity?.executiveId, executiveKey: d?.ag?.t })), "stage-" + (brCur.stages || []).length);
              const ds = boardDecisionState({ rows, userQuestions: Array.from(new Set(dbt.flatMap((d: any) => userQuestions(d.fullText || d.text || "")))), contradictions: intel?.contradictions || [], gaps: intel?.gaps || [] });
              const em = buildEmailBrief(brCur, ds);
              cp(em.body);
              showToast("Email brief copied (" + Math.round(em.body.length / 1000) + "k characters, complete). Paste it into your email; subject: " + em.subject, "success");
            }} style={actionBtn(tok)}>Copy Email Brief</button>
            {isThreaded && latestDecisionStatus && (
              <div style={{ marginLeft: "auto" }}><DecisionStatus status={latestDecisionStatus} tok={tok} /></div>
            )}
          </div>
        )}

        {/* ── THREAD SUMMARY ── */}
        {isThreaded && brCur.stages.length > 0 && !brRun && (
          <div style={{ padding: "12px 18px", background: tok.surface2,
            borderRadius: 10, marginBottom: 16,
            border: `1px solid ${tok.border}`, fontSize: 12, color: tok.text3,
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 600, color: tok.text2 }}>THREAD SUMMARY</span>
            <span>{brCur.stages.length} stage{brCur.stages.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{[...new Set(brCur.stages.flatMap((s: any) => s.executiveIds || []))].length} executives</span>
            {latestDecisionStatus && (
              <>
                <span>· Latest status:</span>
                <DecisionStatus status={latestDecisionStatus} tok={tok} />
              </>
            )}
          </div>
        )}

        {/* ── FOLLOW-UP INPUT ── */}
        {hasSession && !brRun && (
          <FollowUpInput
            value={brFollowUp} onChange={setBrFollowUp}
            onSubmit={runBRContinue}
            disabled={brRun} tok={tok}
            prevExecIds={isThreaded && brCur.stages.length > 0
              ? brCur.stages[brCur.stages.length-1].executiveIds
              : brAg}
            CS={CS}
            suggestions={isThreaded
              ? (suggestFollowUpExecs ? suggestFollowUpExecs(
                  brFollowUp,
                  brCur.stages.length > 0 ? brCur.stages[brCur.stages.length-1].executiveIds : brAg
                ) : [])
              : []}
            followUpExecIds={followUpExecIds}
            setFollowUpExecIds={setFollowUpExecIds}
            onAcceptSuggestions={() => {
              const prevIds = isThreaded && brCur.stages.length > 0
                ? brCur.stages[brCur.stages.length-1].executiveIds
                : brAg;
              const currentIds = followUpExecIds.length > 0 ? followUpExecIds : [...prevIds];
              const sugs = suggestFollowUpExecs
                ? suggestFollowUpExecs(brFollowUp, prevIds)
                : [];
              const newIds = [...new Set([...currentIds, ...sugs.map((s: any) => s.id)])];
              setFollowUpExecIds(newIds);
              if(setFollowUpSuggestions) setFollowUpSuggestions(sugs);
            }}
          />
        )}

        {/* ── EMPTY STATE ── */}
{/* ── EMPTY STATE ── */}
        {!hasSession && !brRun && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: tok.muted }}>
            <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.6 }}>🏛️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tok.text2, marginBottom: 8 }}>Ready for your question</div>
            <div style={{ fontSize: 15, color: tok.text3, maxWidth: 460, margin: "0 auto", lineHeight: 1.7 }}>
              Select at least 2 executives above, type a strategic question, and start the boardroom debate.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              {["Should we expand to UAE next quarter?", "How do we respond to the new competitor?", "What's our optimal pricing strategy?"].map(q => (
                <button key={q} onClick={() => setBrQ(q)}
                  style={{ padding: "8px 14px", borderRadius: 8, background: tok.surface, border: `1px solid ${tok.border}`, color: tok.text3, fontSize: 13, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={brEnd} />
      </div>

      {/* ── ANIMATIONS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
