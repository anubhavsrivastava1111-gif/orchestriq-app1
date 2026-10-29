// SHEETS REPORT BUILDER - PDF (jsPDF + autotable) and PowerPoint (pptxgenjs), both loaded by
// the site from CDNs. Every figure comes from computed chart data; slide titles state the
// finding ("West leads with 25.1%") rather than just naming the chart.
import { fmtNum, pct } from "./SheetsAnalytics";
import type { ChartData, ChartType } from "./SheetsSmart";

export interface ReportItem { title: string; why: string; type: ChartType; data: ChartData; png?: string }
export interface Report { title: string; subtitle: string; scope: string; rows: number; kpis: { label: string; value: number }[]; summary: string[]; items: ReportItem[];
  pivot?: { title: string; head: string[]; rows: string[][] }; recommendations: string[]; notes: string[] }

// The finding behind a chart, in one sentence (used as slide / section titles).
export function actionTitle(it: ReportItem): string {
  const d = it.data, s = d.series[0]; if (!s || !d.categories.length) return it.title;
  const tot = s.values.reduce((a, b) => a + b, 0);
  if (/^\d{4}-\d{2}$/.test(d.categories[0]) && d.categories.length >= 2 && d.series.length === 1) { const n = d.categories.length, a = s.values[n - 2], b = s.values[n - 1]; const ch = a ? ((b - a) / Math.abs(a)) * 100 : 0;
    return d.yLabel + " " + (ch >= 0 ? "rose " : "fell ") + Math.abs(ch).toFixed(1) + "% in " + d.categories[n - 1] + " to " + fmtNum(b); }
  if (d.series.length > 1) { const totals = d.categories.map((_, i) => d.series.reduce((x, sr) => x + sr.values[i], 0)); const i = totals.indexOf(Math.max(...totals)); return d.categories[i] + " leads " + it.title.toLowerCase().replace(/^total /, "") + " (" + fmtNum(totals[i]) + ")"; }
  const i = s.values.indexOf(Math.max(...s.values)); return d.categories[i] + " leads " + it.title.replace(/^Total /, "").replace(/^Share of /, "") + " at " + pct(s.values[i], tot).toFixed(1) + "%";
}
const rowsOf = (d: ChartData, max = 12) => { const s = d.series[0]; const tot = s.values.reduce((a, b) => a + b, 0);
  return d.categories.slice(0, max).map((k, i) => d.series.length > 1 ? [k, ...d.series.map((sr) => fmtNum(sr.values[i]))] : [k, fmtNum(s.values[i]), pct(s.values[i], tot).toFixed(1) + "%"]); };
const headOf = (d: ChartData) => (d.series.length > 1 ? [d.xLabel, ...d.series.map((s) => s.name)] : [d.xLabel, d.series[0].name, "Share"]);
const safe = (s: string) => String(s ?? "").replace(/\u20b9\s?/g, "Rs. ").replace(/[\u2014\u2013]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export function buildPdf(jsPDF: any, r: Report): any {
  const d = new jsPDF({ unit: "mm", format: "a4" }); const W = 210, M = 14, CW = W - 2 * M, NAVY: [number, number, number] = [17, 38, 74]; let y = 0;
  const AT = (o: any) => (d as any).autoTable(o); const need = (h: number) => { if (y + h > 280) { d.addPage(); y = M; } };
  const text = (t: string, size: number, o: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => { d.setFont("helvetica", o.bold ? "bold" : "normal"); d.setFontSize(size); d.setTextColor(...(o.color || [30, 41, 59]));
    for (const ln of d.splitTextToSize(safe(t), CW)) { need(size * 0.45); d.text(ln, M, y + size * 0.36); y += size * 0.45; } y += o.gap ?? 1.5; };
  const section = (t: string) => { need(16); d.setFillColor(...NAVY); d.rect(M, y, 3, 8, "F"); d.setFont("helvetica", "bold"); d.setFontSize(13); d.setTextColor(...NAVY); d.text(safe(t), M + 6, y + 6); y += 12; };
  // Cover band
  d.setFillColor(...NAVY); d.rect(0, 0, W, 46, "F"); d.setTextColor(255, 255, 255); d.setFont("helvetica", "bold"); d.setFontSize(22); d.text(d.splitTextToSize(safe(r.title), CW)[0], M, 22);
  d.setFont("helvetica", "normal"); d.setFontSize(11); d.text(safe(r.subtitle + " \u00b7 " + r.rows.toLocaleString("en-IN") + " records \u00b7 " + r.scope + " \u00b7 " + new Date().toLocaleDateString("en-IN")).slice(0, 120), M, 33); y = 54;
  // KPI cards
  const k = r.kpis.slice(0, 4); const cw = (CW - (k.length - 1) * 4) / Math.max(1, k.length);
  k.forEach((x, i) => { const cx = M + i * (cw + 4); d.setFillColor(241, 245, 249); d.setDrawColor(226, 232, 240); d.roundedRect(cx, y, cw, 20, 2, 2, "FD"); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(100, 116, 139); d.text(safe(x.label).toUpperCase().slice(0, 28), cx + 3, y + 6); d.setFont("helvetica", "bold"); d.setFontSize(15); d.setTextColor(...NAVY); d.text(safe(fmtNum(x.value)), cx + 3, y + 15); }); y += 27;
  if (r.summary.length) { section("Executive summary"); r.summary.forEach((s) => { const lines = d.splitTextToSize(safe(s), CW - 6); need(lines.length * 4.6 + 1); d.setFont("helvetica", "normal"); d.setFontSize(10.5); d.setTextColor(30, 41, 59); d.text("\u2022", M + 1, y + 3.6); lines.forEach((ln: string, j: number) => d.text(ln, M + 5, y + 3.6 + j * 4.6)); y += lines.length * 4.6 + 1.5; }); y += 2; }
  // Charts flow: a section starts on the current page when the chart and the top of its table fit.
  const ihFull = CW * (380 / 900);
  r.items.forEach((it, n) => { if (n === 0) { d.addPage(); y = M; } else { y += 4; need(ihFull + 50); } section((n + 1) + ". " + actionTitle(it)); text(it.why, 10, { color: [71, 85, 105], gap: 3 });
    if (it.png) { const ih = CW * (380 / 900); need(ih + 2); d.addImage(it.png, "PNG", M, y, CW, ih); y += ih + 4; }
    AT({ startY: y, head: [headOf(it.data).map(safe)], body: rowsOf(it.data).map((row) => row.map(safe)), theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 9, cellPadding: 1.8, lineColor: [217, 222, 231], lineWidth: 0.15 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: { 0: { fontStyle: "bold" } },
      didParseCell: (h: any) => { if (h.section === "body" && h.column.index > 0) h.cell.styles.halign = "right"; } }); y = (d as any).lastAutoTable.finalY + 6; });
  if (r.pivot) { d.addPage(); y = M; section("Pivot: " + r.pivot.title); AT({ startY: y, head: [r.pivot.head.map(safe)], body: r.pivot.rows.map((row) => row.map(safe)), theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: NAVY, textColor: 255 },
    didParseCell: (h: any) => { if (h.section === "body" && h.column.index > 0) h.cell.styles.halign = "right"; if (h.section === "body" && /^Total/.test(String(h.row.raw?.[0]))) h.cell.styles.fontStyle = "bold"; } }); y = (d as any).lastAutoTable.finalY + 6; }
  if (r.recommendations.length) { need(30); section("Recommendations"); r.recommendations.forEach((s, i) => text((i + 1) + ". " + s, 10.5, { gap: 1.5 })); }
  if (r.notes.length) { need(20); y += 2; r.notes.forEach((s) => text(s, 8.5, { color: [100, 116, 139], gap: 1 })); }
  const pages = d.internal.getNumberOfPages(); for (let i = 1; i <= pages; i++) { d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(148, 163, 184); d.text(safe(r.title).slice(0, 80), M, 291); d.text("Page " + i + " of " + pages, W - M, 291, { align: "right" }); }
  return d;
}

export async function buildPpt(PptxGenJS: any, r: Report): Promise<any> {
  const P = new PptxGenJS(); P.layout = "LAYOUT_WIDE"; const NAVY = "11264A", INK = "1F2937", MUTED = "64748B", COLORS = ["2563EB", "16A34A", "F59E0B", "DC2626", "7C3AED", "0891B2", "DB2777", "65A30D"];
  const head = (s: any, t: string, sub?: string) => { s.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: NAVY }, line: { color: NAVY } }); s.addText(t, { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: NAVY, fontFace: "Arial" }); if (sub) s.addText(sub, { x: 0.5, y: 0.9, w: 12.3, h: 0.4, fontSize: 13, color: MUTED, fontFace: "Arial" }); };
  let s = P.addSlide(); s.background = { color: NAVY }; s.addText(r.title, { x: 0.7, y: 2.3, w: 12, h: 1.1, fontSize: 38, bold: true, color: "FFFFFF", fontFace: "Arial" });
  s.addText(r.subtitle + "  \u00b7  " + r.rows.toLocaleString("en-IN") + " records  \u00b7  " + r.scope + "  \u00b7  " + new Date().toLocaleDateString("en-IN"), { x: 0.7, y: 3.45, w: 12, h: 0.5, fontSize: 16, color: "D6DEEA", fontFace: "Arial" });
  s = P.addSlide(); head(s, "At a glance", "Key figures and what they tell us");
  const k = r.kpis.slice(0, 4); k.forEach((x, i) => { const cx = 0.5 + i * 3.13; s.addShape(P.ShapeType.roundRect, { x: cx, y: 1.5, w: 2.93, h: 1.35, fill: { color: "F1F5F9" }, line: { color: "E2E8F0" }, rectRadius: 0.08 });
    s.addText([{ text: x.label.toUpperCase() + "\n", options: { fontSize: 10, color: MUTED } }, { text: fmtNum(x.value), options: { fontSize: 24, bold: true, color: NAVY } }], { x: cx + 0.1, y: 1.55, w: 2.75, h: 1.25, valign: "middle", fontFace: "Arial" }); });
  if (r.summary.length) s.addText(r.summary.slice(0, 5).map((t) => ({ text: t, options: { bullet: true, paraSpaceAfter: 6 } })), { x: 0.6, y: 3.2, w: 12.1, h: 3.8, fontSize: 15, color: INK, fontFace: "Arial", valign: "top" });
  for (const it of r.items) { s = P.addSlide(); head(s, actionTitle(it), it.why); const d = it.data; const labels = d.categories;
    const series = d.series.map((sr) => ({ name: sr.name, labels, values: sr.values }));
    const t = it.type; const box = { x: 0.5, y: 1.45, w: 8.6, h: 5.6 };
    const common = { ...box, chartColors: COLORS, catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valGridLine: { color: "E5E7EB", size: 0.5 }, showLegend: d.series.length > 1, legendPos: "t", legendFontSize: 11, dataLabelColor: INK, dataLabelFontSize: 10, valAxisLabelFormatCode: "#,##0" };
    if (t === "doughnut") s.addChart(P.ChartType.doughnut, series, { ...box, chartColors: COLORS, holeSize: 55, showPercent: true, showLegend: true, legendPos: "r", legendFontSize: 12, dataLabelColor: "FFFFFF", dataLabelFontSize: 11 });
    else if (t === "line" || t === "area") s.addChart(t === "area" ? P.ChartType.area : P.ChartType.line, series, { ...common, lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 7 });
    else s.addChart(P.ChartType.bar, series, { ...common, barDir: t === "bar" ? "bar" : "col", barGrouping: t === "stacked" ? "stacked" : "clustered", showValue: d.categories.length <= 10 && d.series.length === 1, dataLabelFormatCode: "#,##0", barGapWidthPct: 60 });
    const sr = d.series[0]; const tot = sr.values.reduce((a, b) => a + b, 0);
    const take = d.series.length === 1 && !/^\d{4}-\d{2}$/.test(labels[0] || "") ? labels.slice(0, 5).map((l, i) => l + ": " + fmtNum(sr.values[i]) + " (" + pct(sr.values[i], tot).toFixed(1) + "%)") : [actionTitle(it)];
    s.addShape(P.ShapeType.roundRect, { x: 9.35, y: 1.45, w: 3.5, h: 5.6, fill: { color: "F8FAFC" }, line: { color: "E2E8F0" }, rectRadius: 0.06 });
    s.addText([{ text: "Key numbers\n", options: { fontSize: 13, bold: true, color: NAVY } }, ...take.map((x) => ({ text: x, options: { bullet: true, fontSize: 12, color: INK, paraSpaceAfter: 4 } }))], { x: 9.5, y: 1.6, w: 3.25, h: 5.3, valign: "top", fontFace: "Arial" }); }
  const tableOpts = (n: number) => ({ x: 0.5, y: 1.45, w: 12.3, fontSize: n > 12 ? 10 : 12, fontFace: "Arial", color: INK, border: { type: "solid", color: "D9DEE7", pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true });
  const hdr = (cells: string[]) => cells.map((c) => ({ text: c, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
  if (r.pivot) { s = P.addSlide(); head(s, r.pivot.title, "Pivot table"); s.addTable([hdr(r.pivot.head), ...r.pivot.rows.slice(0, 20).map((row) => row.map((c, j) => ({ text: c, options: { align: j ? "right" : "left", bold: /^Total/.test(row[0]) } })))], tableOpts(r.pivot.rows.length)); }
  else if (r.items[0]) { const it = r.items[0]; s = P.addSlide(); head(s, it.title + " \u2014 detail", "Table behind the chart"); s.addTable([hdr(headOf(it.data)), ...rowsOf(it.data, 15).map((row) => row.map((c, j) => ({ text: c, options: { align: j ? "right" : "left" } })))], tableOpts(15)); }
  if (r.recommendations.length) { s = P.addSlide(); head(s, "Recommended next steps"); s.addText(r.recommendations.map((t) => ({ text: t, options: { bullet: { type: "number" }, paraSpaceAfter: 8 } })), { x: 0.6, y: 1.5, w: 12.1, h: 5.4, fontSize: 18, color: INK, fontFace: "Arial", valign: "top" }); }
  return P;
}
