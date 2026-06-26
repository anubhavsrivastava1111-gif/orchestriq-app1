import { useState, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// BOARDROOM VIEW — Enterprise Redesign
// Matches: Claude · ChatGPT · Linear · Stripe Dashboard · Notion
// Typography: Inter · 16px base · proper hierarchy
// Modes: Light (executive default) · Dark (analyst mode)
// ═══════════════════════════════════════════════════════════════════════════

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const T = {
  light: {
    bg:        "#F7F8FC",
    surface:   "#FFFFFF",
    surface2:  "#F0F2F8",
    border:    "#E2E8F2",
    borderStr: "#CBD5E1",
    text:      "#0F172A",
    text2:     "#334155",
    text3:     "#64748B",
    muted:     "#94A3B8",
    accent:    "#0D9488",
    accentBg:  "#F0FDFA",
    accentStr: "#0F766E",
    blue:      "#2563EB",
    blueBg:    "#EFF6FF",
    purple:    "#7C3AED",
    purpleBg:  "#F5F3FF",
    warn:      "#D97706",
    warnBg:    "#FFFBEB",
    danger:    "#DC2626",
    dangerBg:  "#FEF2F2",
    success:   "#059669",
    successBg: "#F0FDF4",
    shadow:    "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
    shadowLg:  "0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)",
    inputBg:   "#FFFFFF",
    cardHover: "#FAFBFF",
  },
  dark: {
    bg:        "#0B1120",
    surface:   "#111827",
    surface2:  "#0D1829",
    border:    "#1E2D3D",
    borderStr: "#2A3A4A",
    text:      "#F1F5F9",
    text2:     "#CBD5E1",
    text3:     "#94A3B8",
    muted:     "#64748B",
    accent:    "#14B8A6",
    accentBg:  "rgba(20,184,166,0.08)",
    accentStr: "#0D9488",
    blue:      "#3B82F6",
    blueBg:    "rgba(59,130,246,0.08)",
    purple:    "#8B5CF6",
    purpleBg:  "rgba(139,92,246,0.08)",
    warn:      "#F59E0B",
    warnBg:    "rgba(245,158,11,0.08)",
    danger:    "#EF4444",
    dangerBg:  "rgba(239,68,68,0.08)",
    success:   "#10B981",
    successBg: "rgba(16,185,129,0.08)",
    shadow:    "0 1px 3px rgba(0,0,0,0.4)",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.4)",
    shadowLg:  "0 8px 24px rgba(0,0,0,0.5)",
    inputBg:   "#0D1829",
    cardHover: "#131F30",
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
  const [collapsed, setCollapsed] = useState(false);

  // Parse sections from the brief text
  const lines = text.split("\n").filter(l => l.trim());
  const sourceBlocks: string[] = [];
  let current = "";
  lines.forEach(l => {
    if (l.match(/^(#{1,3}|\d+\.|Source|Data Point|Ref)/i) && current.trim()) {
      sourceBlocks.push(current.trim());
      current = l + "\n";
    } else {
      current += l + "\n";
    }
  });
  if (current.trim()) sourceBlocks.push(current.trim());

  return (
    <div style={{ marginBottom: 24, borderRadius: 12, border: `1px solid ${tok.blue}33`, overflow: "hidden", background: tok.blueBg }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: tok.blue + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: tok.blue, letterSpacing: "0.02em" }}>Research Brief</div>
          <div style={{ fontSize: 12, color: tok.text3, marginTop: 1 }}>Live data · {new Date().toLocaleString()} · Verify sources independently</div>
        </div>
        <div style={{ fontSize: 13, color: tok.text3, transform: collapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</div>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 18px 18px" }}>
          {sourceBlocks.length > 1 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {sourceBlocks.map((block, i) => (
                <div key={i} style={{ background: tok.surface, borderRadius: 8, border: `1px solid ${tok.border}`, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: tok.blue, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Source {i + 1}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: tok.text2 }}>{block.replace(/^#+\s*/gm, "")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 14, lineHeight: 1.75, color: tok.text2 }}>{text}</div>
          )}
          <div style={{ fontSize: 12, color: tok.muted, marginTop: 12, fontStyle: "italic" }}>
            ⚠️ AI-generated research. Verify critical figures before external use.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXECUTIVE CARD ──────────────────────────────────────────────────────────
function ExecutiveCard({
  entry, index, question, isDark, tok,
  onDrill, drillRole, drillQ, setDrillQ, drillRun, runDrill,
  onCopy, onContinue, showDrillClose,
}: {
  entry: any; index: number; question: string; isDark: boolean; tok: typeof T.light;
  onDrill: () => void; drillRole: string | null; drillQ: string; setDrillQ: (v: string) => void;
  drillRun: boolean; runDrill: () => void; onCopy: () => void; onContinue: () => void;
  showDrillClose: () => void;
}) {
  const ag = entry.ag;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        marginBottom: 20,
        borderRadius: 14,
        border: `1px solid ${tok.border}`,
        background: hovered ? tok.cardHover : tok.surface,
        boxShadow: hovered ? tok.shadowMd : tok.shadow,
        overflow: "hidden",
        transition: "box-shadow 0.15s, background 0.15s",
        animation: "fadeInUp 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {/* Executive Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "16px 20px",
        borderBottom: `1px solid ${tok.border}`,
        background: isDark ? ag.dc + "08" : ag.dc + "05",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: ag.dc + "15",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
          border: `1px solid ${ag.dc}25`,
        }}>
          {ag.ic}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: ag.dc, lineHeight: 1.2 }}>{ag.t}</div>
          <div style={{ fontSize: 12, color: tok.text3, marginTop: 2 }}>{ag.d || "Executive Perspective"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {entry.truncated && (
            <span style={{ fontSize: 11, background: tok.warnBg, color: tok.warn, padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
              Response cut short
            </span>
          )}
          <span style={{ fontSize: 12, color: tok.muted, background: tok.surface2, padding: "3px 8px", borderRadius: 6 }}>
            #{index + 1}
          </span>
        </div>
      </div>

      {/* Response Body */}
      <div style={{ padding: "20px 24px" }}>
        <RenderedMd text={entry.text} tok={tok} isDark={isDark} />
      </div>

      {/* Drilldown Q&A history */}
      {entry.drilldown && Object.entries(entry.drilldown).map(([, qas]: any, di) =>
        (Array.isArray(qas) ? qas : []).map((qa: any, qi: number) => (
          <div key={`${di}-${qi}`} style={{ margin: "0 24px 16px", padding: "16px", background: tok.surface2, borderRadius: 10, border: `1px solid ${tok.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: ag.dc, marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
              <span>{qa.q}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: tok.text2 }}>
              <RenderedMd text={qa.a} tok={tok} isDark={isDark} />
            </div>
          </div>
        ))
      )}

      {/* Drilldown Input */}
      {drillRole === ag.id && (
        <div style={{ margin: "0 24px 20px", padding: "16px", background: tok.accentBg, borderRadius: 10, border: `1px solid ${tok.accent}33` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.accent, marginBottom: 10 }}>Ask {ag.t} a follow-up</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={drillQ}
              onChange={e => setDrillQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runDrill()}
              placeholder={`e.g. What's your biggest concern about the financial risk?`}
              disabled={drillRun}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8,
                border: `1px solid ${tok.accent}44`, background: tok.inputBg,
                color: tok.text, fontSize: 14, outline: "none",
                fontFamily: "Inter, sans-serif",
              }} />
            <button onClick={runDrill} disabled={drillRun || !drillQ.trim()}
              style={{ padding: "10px 16px", borderRadius: 8, background: ag.dc, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              {drillRun ? "Thinking…" : "Ask"}
            </button>
            <button onClick={showDrillClose}
              style={{ padding: "10px", borderRadius: 8, background: tok.surface2, color: tok.text3, border: `1px solid ${tok.border}`, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Card Footer Actions */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 20px",
        borderTop: `1px solid ${tok.border}`,
        background: tok.surface2,
        flexWrap: "wrap",
      }}>
        <button onClick={onDrill}
          style={{ ...btnBase(tok, drillRole === ag.id, tok.accent), fontSize: 12, padding: "6px 12px" }}>
          💬 Drill Down
        </button>
        <button onClick={onCopy}
          style={{ ...btnBase(tok, false), fontSize: 12, padding: "6px 12px" }}>
          📋 Copy
        </button>
        {entry.truncated && (
          <button onClick={onContinue}
            style={{ ...btnBase(tok, false, tok.warn), fontSize: 12, padding: "6px 12px" }}>
            ▶ Continue Response
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: tok.muted }}>
          ~{Math.round((entry.text || "").split(" ").length / 200)} min read
        </span>
      </div>
    </div>
  );
}

// ─── SYNTHESIS CARD ───────────────────────────────────────────────────────────
function SynthesisCard({ synthesis, question, tok, isDark, onCopy, onExportPDF, onExportPPT, onExportMD, onExtractActions, extracting }: any) {
  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      border: `1px solid ${tok.accent}40`,
      boxShadow: `0 0 0 4px ${tok.accent}08, ${tok.shadowLg}`,
      background: tok.surface,
      animation: "fadeInUp 0.4s ease",
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px",
        background: `linear-gradient(135deg, ${tok.accent}12, ${tok.blue}08)`,
        borderBottom: `1px solid ${tok.accent}30`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: tok.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: `1px solid ${tok.accent}30` }}>
            🏛️
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: tok.accent, letterSpacing: "0.02em" }}>Boardroom Synthesis</div>
            <div style={{ fontSize: 12, color: tok.text3, marginTop: 2 }}>Executive consensus · AI-generated</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={onExportPDF} style={{ ...actionBtn(tok), color: tok.text2 }}>📄 PDF</button>
            <button onClick={onExportPPT} style={{ ...actionBtn(tok), color: tok.text2 }}>📊 PPT</button>
            <button onClick={onExportMD} style={{ ...actionBtn(tok), color: tok.text2 }}>MD</button>
            <button onClick={onCopy} style={{ ...actionBtn(tok), color: tok.text2 }}>Copy</button>
            <button onClick={onExtractActions} disabled={extracting}
              style={{ ...actionBtn(tok, true), color: tok.accent }}>
              {extracting ? "Extracting…" : "✅ Actions"}
            </button>
          </div>
        </div>
        {question && (
          <div style={{ fontSize: 13, color: tok.text3, fontStyle: "italic", paddingLeft: 48 }}>
            "{question.slice(0, 120)}{question.length > 120 ? "…" : ""}"
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "24px 28px" }}>
        <RenderedMd text={synthesis} tok={tok} isDark={isDark} />
      </div>
    </div>
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
            <button onClick={() => onReopen(s)}
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
  const [showExecPanel, setShowExecPanel] = React.useState(false);
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
    brQ, setBrQ, brAg, setBrAg, brCur, brRun, brPh,
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
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 24px 60px" }}>

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
              const restored = { q: s.q, debate: s.debate || [], synthesis: s.synthesis || "", drilldown: {}, researchBrief: s.researchBrief || "" };
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

        {/* ── QUESTION INPUT ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tok.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Strategic Question
          </div>
          <QuestionInput
            value={brQ} onChange={setBrQ}
            onSubmit={runBR} disabled={brRun || brAg.length < 2}
            isRunning={brRun} onCancel={cancelBR}
            MicButton={MicButton} vLang={vLang} tok={tok} />
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
            {/* Executive cards for this stage */}
            {(stage.debate || []).map((e: any, ei: number) => (
              <ExecutiveCard
                key={ei} entry={e} index={ei} question={stage.question}
                isDark={isDark} tok={tok}
                drillRole={drillRole}
                drillQ={drillQ} setDrillQ={setDrillQ}
                drillRun={drillRun} runDrill={runDrill}
                onDrill={() => setDrillRole(drillRole === e.ag.id ? null : e.ag.id)}
                showDrillClose={() => { setDrillRole(null); setDrillQ(""); }}
                onCopy={() => cp(e.text)}
                onContinue={async () => showToast("Use the follow-up box below to continue.", "info")}
              />
            ))}
            {/* Stage synthesis */}
            {stage.synthesis && (
              <SynthesisCard
                synthesis={stage.synthesis} question={stage.question}
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
            {/* Stage divider (not after last stage) */}
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
            <button onClick={() => {
              const fullText = isThreaded
                ? brCur.stages.map((s: any, i: number) => `## Stage ${i+1}: "${s.question}"\n\n${s.debate?.map((d: any) => `**${d.ag.t}:**\n${d.text}`).join("\n\n")}${s.synthesis ? "\n\n**Chairman Synthesis:**\n"+s.synthesis : ""}`).join("\n\n---\n\n")
                : brCur.debate?.map((d: any) => `**${d.ag.t}:**\n${d.text}`).join("\n\n") + (brCur.synthesis ? "\n\n**Synthesis:**\n"+brCur.synthesis : "");
              quickExport("pdf", "detailed", "Decision Thread — " + brCur.q, fullText || "");
            }} style={actionBtn(tok)}>📄 Full PDF</button>
            <button onClick={() => {
              const fullText = isThreaded
                ? brCur.stages.map((s: any, i: number) => `## Stage ${i+1}: "${s.question}"\n\n${s.synthesis || ""}`).join("\n\n---\n\n")
                : brCur.synthesis || "";
              quickExport("pptx", "strategy", "Decision Thread — " + brCur.q, fullText);
            }} style={actionBtn(tok)}>📊 Full PPT</button>
            <button onClick={() => {
              const fullText = isThreaded
                ? brCur.stages.map((s: any, i: number) => `## Stage ${i+1}: "${s.question}"\n\n${s.debate?.map((d: any) => `**${d.ag.t}:**\n${d.text}`).join("\n\n")}${s.synthesis ? "\n\n**Chairman Synthesis:**\n"+s.synthesis : ""}`).join("\n\n---\n\n")
                : brCur.debate?.map((d: any) => d.ag.t+": "+d.text).join("\n\n") + "\n\n"+brCur.synthesis;
              dlFile("Boardroom-Thread-" + Date.now() + ".md", "# " + brCur.q + "\n\n" + fullText, "text/markdown");
            }} style={actionBtn(tok)}>Full MD</button>
            {isThreaded && latestDecisionStatus && (
              <div style={{ marginLeft: "auto" }}><DecisionStatus status={latestDecisionStatus} tok={tok} /></div>
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
