// ═══════════════════════════════════════════════════════════════════════════
// OUTCOME DASHBOARD — Shareable workflow-result dashboard for Agentic AI.
//
// Renders KPI tiles, data tables, and canvas-rendered charts in one view.
// Provides three universal share actions:
//   1. Copy as rich HTML → pastes into Gmail / Outlook / Slack with formatting
//      intact, including inline base64-PNG charts (survive all email clients).
//   2. Copy plain text → fallback for Notion / Discord / SMS.
//   3. Download Excel → styled workbook with data + chart images.
//
// DESIGN PRINCIPLES
//   1. Additive only — component is imported per workflow; not importing = pause.
//   2. Zero AI calls — pure rendering. No token cost.
//   3. Email-hostile CSS avoided — inline styles, HTML tables, PNG (not SVG).
//   4. Never throws upward — every share action wrapped, degrades silently.
//   5. No new deps — uses global window.XLSX (already loaded by the platform).
//
// USAGE (in any Agentic workflow after execution completes)
//   import { OutcomeDashboard, OutcomeData } from "./lib/OutcomeDashboard";
//   ...
//   <OutcomeDashboard data={{
//     title: "SLA Compliance — Weekly Report",
//     meta: { period: "Week 27, 2026", generatedFor: co.name },
//     kpis: [
//       { label: "Total Tickets", value: 142, delta: "+8 vs last week" },
//       { label: "SLA Met", value: "94%", tone: "good" },
//       { label: "Breaches", value: 9, tone: "bad" },
//     ],
//     tables: [{
//       title: "SLA Breaches by Priority",
//       headers: ["Priority", "Breaches", "Avg Delay (hrs)"],
//       rows: [["P1", 2, 4.2], ["P2", 4, 12.8], ["P3", 3, 26.5]],
//     }],
//     charts: [{ type: "bar", title: "Tickets by Team", labels: [...], values: [...] }],
//   }} />
// ═══════════════════════════════════════════════════════════════════════════

import React, { useMemo, useRef, useState } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
export type KpiTone = "neutral" | "good" | "bad" | "warn";
export interface OutcomeKpi { label: string; value: string | number; delta?: string; tone?: KpiTone; }
export interface OutcomeTable { title: string; headers: string[]; rows: (string | number)[][]; highlightLastRow?: boolean; }
export interface OutcomeChart { type: "bar" | "line"; title: string; labels: string[]; values: number[]; seriesName?: string; }
export interface OutcomeMeta { period?: string; generatedFor?: string; source?: string; }
export interface OutcomeData {
  title: string;
  meta?: OutcomeMeta;
  kpis?: OutcomeKpi[];
  tables?: OutcomeTable[];
  charts?: OutcomeChart[];
  commentary?: string;
}

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const PAL = {
  primary: "#1E3A5F", accent: "#14B8A6", muted: "#64748B", border: "#E2E8F0",
  bgLight: "#F8FAFC", bgAlt: "#F1F5F9", text: "#0F172A", subtext: "#475569",
  good: "#10B981", bad: "#EF4444", warn: "#F59E0B", neutral: "#3B82F6",
};

// ─── UTILITIES ───────────────────────────────────────────────────────────────
const fmtNum = (n: unknown): string => {
  if (typeof n !== "number" || !isFinite(n)) return String(n ?? "");
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(1) + "Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n * 100) / 100);
};

const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toneColor = (t?: KpiTone) => t === "good" ? PAL.good : t === "bad" ? PAL.bad : t === "warn" ? PAL.warn : PAL.text;

// ─── CHART RENDERER — returns base64 PNG (email-safe) ────────────────────────
function renderChartPNG(spec: OutcomeChart, width = 640, height = 300): string {
  const { labels, values, type, title, seriesName } = spec;
  if (!labels?.length || !values?.length || labels.length !== values.length) return "";
  try {
    const cv = document.createElement("canvas");
    cv.width = width; cv.height = height;
    const g = cv.getContext("2d");
    if (!g) return "";
    // background
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, width, height);
    g.strokeStyle = PAL.border; g.strokeRect(0.5, 0.5, width - 1, height - 1);
    // title
    g.fillStyle = PAL.primary;
    g.font = "bold 15px Calibri, Arial, sans-serif";
    g.fillText(title || seriesName || "", 20, 26);
    g.fillStyle = PAL.accent; g.fillRect(20, 32, 40, 3);
    // plot area
    const padL = 50, padR = 20, padT = 46, padB = 44;
    const iw = width - padL - padR, ih = height - padT - padB;
    const max = Math.max(...values, 0), min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const yOf = (v: number) => padT + ih - ((v - min) / range) * ih;
    // gridlines + y-axis labels
    g.font = "11px Calibri, Arial, sans-serif"; g.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const gv = min + (range * i) / 4;
      const gy = yOf(gv);
      g.strokeStyle = PAL.bgAlt; g.beginPath(); g.moveTo(padL, gy); g.lineTo(width - padR, gy); g.stroke();
      g.fillStyle = PAL.muted;
      g.fillText(fmtNum(gv), padL - 6, gy + 4);
    }
    const n = values.length;
    g.textAlign = "center";
    if (type === "line") {
      const xOf = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      g.strokeStyle = PAL.accent; g.lineWidth = 2.5; g.beginPath();
      values.forEach((v, i) => { const x = xOf(i), y = yOf(v); i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
      g.stroke();
      values.forEach((v, i) => {
        const x = xOf(i), y = yOf(v);
        g.fillStyle = PAL.accent; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = PAL.subtext; g.font = "10px Calibri, Arial, sans-serif";
        g.fillText(String(labels[i]).slice(0, 10), x, height - padB + 16);
      });
    } else {
      // bar
      const bw = Math.min(48, (iw / n) * 0.62);
      values.forEach((v, i) => {
        const x = padL + (i + 0.5) * (iw / n) - bw / 2;
        const y0 = yOf(0), yv = yOf(Math.max(v, 0));
        const bh = Math.max(2, Math.abs(y0 - yv));
        const grad = g.createLinearGradient(0, yv, 0, yv + bh);
        grad.addColorStop(0, PAL.accent); grad.addColorStop(1, PAL.primary);
        g.fillStyle = grad;
        g.fillRect(x, v >= 0 ? yv : y0, bw, bh);
        g.fillStyle = PAL.subtext; g.font = "10px Calibri, Arial, sans-serif";
        g.fillText(String(labels[i]).slice(0, 10), x + bw / 2, height - padB + 16);
        g.fillStyle = PAL.text; g.font = "bold 10px Calibri, Arial, sans-serif";
        g.fillText(fmtNum(v), x + bw / 2, (v >= 0 ? yv : y0 + bh) - 6);
      });
    }
    return cv.toDataURL("image/png");
  } catch { return ""; }
}

// ─── HTML BUILDER — email-client-safe ────────────────────────────────────────
// Table-based layout, inline styles only, PNG images. Tested to survive Gmail,
// Outlook (desktop + web), Apple Mail, and Slack rich-text paste.
export function buildOutcomeHTML(data: OutcomeData, chartImages: string[] = []): string {
  const { title, meta, kpis = [], tables = [], charts = [], commentary } = data;
  const wrap = (inner: string) => `
<div style="font-family:Calibri,Arial,sans-serif;color:${PAL.text};max-width:760px;background:#FFFFFF;">
${inner}
</div>`.trim();
  const header = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.primary};color:#FFFFFF;">
  <tr><td style="padding:14px 18px;">
    <div style="font-size:18px;font-weight:800;letter-spacing:-0.01em;">${esc(title)}</div>
    ${meta ? `<div style="font-size:11px;opacity:0.85;margin-top:4px;">${[meta.generatedFor, meta.period, meta.source].filter(Boolean).map(esc).join(" &middot; ")}</div>` : ""}
  </td></tr>
</table>`;
  const kpiRow = kpis.length ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
  <tr>
    ${kpis.slice(0, 6).map(k => `
    <td style="padding:6px;" valign="top">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.bgLight};border:1px solid ${PAL.border};border-radius:6px;">
        <tr><td style="padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:${PAL.muted};letter-spacing:0.06em;">${esc(k.label)}</div>
          <div style="font-size:20px;font-weight:800;color:${toneColor(k.tone)};margin-top:4px;">${esc(typeof k.value === "number" ? fmtNum(k.value) : k.value)}</div>
          ${k.delta ? `<div style="font-size:10px;color:${PAL.subtext};margin-top:3px;">${esc(k.delta)}</div>` : ""}
        </td></tr>
      </table>
    </td>`).join("")}
  </tr>
</table>` : "";
  const chartsBlock = charts.length ? charts.map((c, i) => {
    const img = chartImages[i];
    if (!img) return "";
    return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;background:${PAL.bgLight};border:1px solid ${PAL.border};border-radius:6px;">
  <tr><td style="padding:12px;">
    <div style="font-size:12px;font-weight:700;color:${PAL.text};margin-bottom:8px;">${esc(c.title)}</div>
    <img src="${img}" alt="${esc(c.title)}" width="640" style="width:100%;max-width:640px;height:auto;display:block;border:0;" />
  </td></tr>
</table>`;
  }).join("") : "";
  const tablesBlock = tables.map(t => `
<div style="margin-top:16px;">
  <div style="font-size:12px;font-weight:700;color:${PAL.text};margin-bottom:6px;">${esc(t.title)}</div>
  <table role="presentation" cellpadding="6" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="background:${PAL.primary};color:#FFFFFF;">
        ${t.headers.map(h => `<th align="left" style="padding:8px 10px;font-weight:700;border:1px solid ${PAL.primary};">${esc(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${t.rows.map((r, ri) => `
        <tr style="background:${ri % 2 === 0 ? "#FFFFFF" : PAL.bgLight};${t.highlightLastRow && ri === t.rows.length - 1 ? "font-weight:700;" : ""}">
          ${r.map((cell, ci) => `<td style="padding:7px 10px;border:1px solid ${PAL.border};color:${PAL.text};${ci === 0 ? "" : "text-align:right;"}">${esc(typeof cell === "number" ? fmtNum(cell) : cell)}</td>`).join("")}
        </tr>`).join("")}
    </tbody>
  </table>
</div>`).join("");
  const commentaryBlock = commentary ? `
<div style="margin-top:16px;padding:12px 14px;background:${PAL.bgLight};border-left:3px solid ${PAL.accent};font-size:12px;color:${PAL.subtext};line-height:1.6;">
  ${esc(commentary)}
</div>` : "";
  const footer = `
<div style="margin-top:16px;padding-top:10px;border-top:1px solid ${PAL.border};font-size:10px;color:${PAL.muted};text-align:center;">
  Generated by OrchestrIQ &middot; ${new Date().toLocaleString("en-GB")}
</div>`;
  return wrap(header + kpiRow + chartsBlock + tablesBlock + commentaryBlock + footer);
}

// ─── PLAIN-TEXT FALLBACK for Slack/SMS/Discord ───────────────────────────────
function buildOutcomeText(data: OutcomeData): string {
  const lines: string[] = [];
  lines.push("═".repeat(60));
  lines.push(data.title.toUpperCase());
  if (data.meta) lines.push([data.meta.generatedFor, data.meta.period, data.meta.source].filter(Boolean).join(" · "));
  lines.push("═".repeat(60));
  if (data.kpis?.length) {
    lines.push("");
    data.kpis.forEach(k => lines.push("• " + k.label + ": " + (typeof k.value === "number" ? fmtNum(k.value) : k.value) + (k.delta ? "  (" + k.delta + ")" : "")));
  }
  data.tables?.forEach(t => {
    lines.push(""); lines.push("── " + t.title + " ──");
    const widths = t.headers.map((h, i) => Math.max(h.length, ...t.rows.map(r => String(r[i] ?? "").length)));
    lines.push(t.headers.map((h, i) => h.padEnd(widths[i])).join(" │ "));
    lines.push(widths.map(w => "─".repeat(w)).join("─┼─"));
    t.rows.forEach(r => lines.push(r.map((c, i) => (typeof c === "number" ? fmtNum(c) : String(c ?? "")).padEnd(widths[i])).join(" │ ")));
  });
  if (data.commentary) { lines.push(""); lines.push(data.commentary); }
  return lines.join("\n");
}

// ─── EXCEL EXPORT ────────────────────────────────────────────────────────────
async function downloadExcel(data: OutcomeData, chartImages: string[]): Promise<void> {
  const w = window as any;
  if (!w.XLSX) {
    // load style-capable build (same as Pulse/Finance Suite)
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
      s.onload = () => res(); s.onerror = () => rej(new Error("Excel library failed"));
      document.head.appendChild(s);
    });
  }
  const X = (window as any).XLSX;
  if (!X) throw new Error("XLSX unavailable");
  const wb = X.utils.book_new();
  // Summary sheet: KPIs
  if (data.kpis?.length) {
    const rows: any[][] = [["Metric", "Value", "Change"]];
    data.kpis.forEach(k => rows.push([k.label, typeof k.value === "number" ? k.value : String(k.value), k.delta || ""]));
    const ws = X.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 28 }];
    // Style header row
    ["A1", "B1", "C1"].forEach(a => { if (ws[a]) ws[a].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } }; });
    X.utils.book_append_sheet(wb, ws, "Summary");
  }
  // One sheet per table
  data.tables?.forEach((t, i) => {
    const rows = [t.headers, ...t.rows];
    const ws = X.utils.aoa_to_sheet(rows);
    ws["!cols"] = t.headers.map(h => ({ wch: Math.max(12, h.length + 2) }));
    t.headers.forEach((_, ci) => {
      const addr = X.utils.encode_cell({ r: 0, c: ci });
      if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } };
    });
    X.utils.book_append_sheet(wb, ws, (t.title || ("Table " + (i + 1))).slice(0, 31));
  });
  const filename = data.title.replace(/[^a-zA-Z0-9]+/g, "-") + "-" + new Date().toISOString().slice(0, 10) + ".xlsx";
  X.writeFile(wb, filename);
}

// ─── CLIPBOARD (rich HTML + plain text) ──────────────────────────────────────
async function copyRichHTML(html: string, plain: string): Promise<boolean> {
  try {
    if (!(navigator.clipboard && (window as any).ClipboardItem)) throw new Error("no-clipboardapi");
    const blob = new Blob([html], { type: "text/html" });
    const blobT = new Blob([plain], { type: "text/plain" });
    const item = new (window as any).ClipboardItem({ "text/html": blob, "text/plain": blobT });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    // Fallback: legacy execCommand
    try {
      const el = document.createElement("div");
      el.contentEditable = "true"; el.innerHTML = html;
      el.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(el);
      const range = document.createRange(); range.selectNodeContents(el);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
      const ok = document.execCommand("copy");
      sel?.removeAllRanges(); el.remove();
      return ok;
    } catch { return false; }
  }
}

// ─── REACT COMPONENT ─────────────────────────────────────────────────────────
export function OutcomeDashboard({ data, onError }: { data: OutcomeData; onError?: (msg: string) => void }) {
  const [copied, setCopied] = useState<"" | "html" | "text">("");
  const [downloading, setDownloading] = useState(false);
  const chartRefs = useRef<string[]>([]);

  // Pre-render chart PNGs once so both copy and preview share the same images
  const chartImages = useMemo(() => {
    return (data.charts || []).map(c => renderChartPNG(c));
  }, [data.charts]);
  chartRefs.current = chartImages;

  const handleCopyHTML = async () => {
    try {
      const html = buildOutcomeHTML(data, chartRefs.current);
      const plain = buildOutcomeText(data);
      const ok = await copyRichHTML(html, plain);
      if (ok) { setCopied("html"); setTimeout(() => setCopied(""), 2200); }
      else onError?.("Copy failed — try the plain text option or download Excel.");
    } catch (e: any) { onError?.("Copy failed: " + (e?.message || "unknown")); }
  };
  const handleCopyText = async () => {
    try {
      const plain = buildOutcomeText(data);
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(plain); }
      else { const ta = document.createElement("textarea"); ta.value = plain; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      setCopied("text"); setTimeout(() => setCopied(""), 2200);
    } catch (e: any) { onError?.("Text copy failed: " + (e?.message || "unknown")); }
  };
  const handleExcel = async () => {
    setDownloading(true);
    try { await downloadExcel(data, chartRefs.current); }
    catch (e: any) { onError?.("Excel export failed: " + (e?.message || "unknown")); }
    setDownloading(false);
  };

  const btn: React.CSSProperties = {
    padding: "7px 13px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    border: "1px solid " + PAL.border, background: "#FFFFFF", color: PAL.text,
    cursor: "pointer", fontFamily: "Calibri,Arial,sans-serif",
  };
  const btnPrimary: React.CSSProperties = { ...btn, background: PAL.accent, color: "#FFFFFF", border: "1px solid " + PAL.accent };

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid " + PAL.border, borderRadius: 10, overflow: "hidden", fontFamily: "Calibri, Arial, sans-serif", marginTop: 12 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: PAL.bgLight, borderBottom: "1px solid " + PAL.border, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: PAL.text, marginRight: "auto", textTransform: "uppercase", letterSpacing: "0.05em" }}>📋 Share Outcome</div>
        <button style={btnPrimary} onClick={handleCopyHTML}>{copied === "html" ? "✓ Copied" : "📧 Copy for Email"}</button>
        <button style={btn} onClick={handleCopyText}>{copied === "text" ? "✓ Copied" : "📝 Copy Text"}</button>
        <button style={btn} disabled={downloading} onClick={handleExcel}>{downloading ? "..." : "⬇ Excel"}</button>
      </div>

      {/* Preview (identical to what will be copied) */}
      <div style={{ padding: 12, background: "#FFFFFF", color: PAL.text }}>
        {/* Header */}
        <div style={{ background: PAL.primary, color: "#FFFFFF", padding: "10px 14px", borderRadius: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{data.title}</div>
          {data.meta && <div style={{ fontSize: 10, opacity: 0.85, marginTop: 3 }}>{[data.meta.generatedFor, data.meta.period, data.meta.source].filter(Boolean).join(" · ")}</div>}
        </div>

        {/* KPI row */}
        {data.kpis?.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {data.kpis.slice(0, 6).map((k, i) => (
              <div key={i} style={{ flex: "1 1 140px", minWidth: 140, background: PAL.bgLight, border: "1px solid " + PAL.border, borderRadius: 6, padding: "9px 11px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: PAL.muted, letterSpacing: "0.06em" }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: toneColor(k.tone), marginTop: 3 }}>{typeof k.value === "number" ? fmtNum(k.value) : k.value}</div>
                {k.delta && <div style={{ fontSize: 10, color: PAL.subtext, marginTop: 2 }}>{k.delta}</div>}
              </div>
            ))}
          </div>
        ) : null}

        {/* Charts */}
        {(data.charts || []).map((c, i) => (
          chartImages[i] ? (
            <div key={i} style={{ marginTop: 14, background: PAL.bgLight, border: "1px solid " + PAL.border, borderRadius: 6, padding: 11 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: PAL.text, marginBottom: 6 }}>{c.title}</div>
              <img src={chartImages[i]} alt={c.title} style={{ width: "100%", maxWidth: 640, display: "block" }} />
            </div>
          ) : null
        ))}

        {/* Tables */}
        {(data.tables || []).map((t, ti) => (
          <div key={ti} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: PAL.text, marginBottom: 5 }}>{t.title}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: PAL.primary, color: "#FFFFFF" }}>
                  {t.headers.map((h, ci) => <th key={ci} style={{ padding: "7px 9px", textAlign: "left", fontWeight: 700, border: "1px solid " + PAL.primary }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "#FFFFFF" : PAL.bgLight, fontWeight: t.highlightLastRow && ri === t.rows.length - 1 ? 700 : 400 }}>
                    {r.map((cell, ci) => <td key={ci} style={{ padding: "6px 9px", border: "1px solid " + PAL.border, textAlign: ci === 0 ? "left" : "right", color: PAL.text }}>{typeof cell === "number" ? fmtNum(cell) : cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {data.commentary && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: PAL.bgLight, borderLeft: "3px solid " + PAL.accent, fontSize: 11, color: PAL.subtext, lineHeight: 1.6 }}>
            {data.commentary}
          </div>
        )}
      </div>
    </div>
  );
}
export default OutcomeDashboard;
