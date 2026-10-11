// Renderers for the bank project report. Same blocks -> PDF and Word, so they never differ.
// PDF: real selectable text and tables (jsPDF + autotable), cover, contents with page
// numbers, running footer. Word: HTML that Word / Google Docs / LibreOffice open and edit.
import type { ReportDoc, Block } from "./ProjectReportDocument";

// jsPDF's built-in fonts cover Latin-1 only: map symbols to safe text so nothing prints as garbage.
export function pdfSafe(s: string): string {
  return String(s ?? "").replace(/\u20b9\s?/g, "Rs. ").replace(/[\u2014\u2013]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2265/g, ">=").replace(/\u2264/g, "<=")
    .replace(/\u00d7/g, "x").replace(/\u00f7/g, "/").replace(/\u2212/g, "-").replace(/\u2022/g, "-").replace(/\u2026/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function renderPdf(jsPDF: any, doc: ReportDoc, autoTable?: (d: any, o: any) => void): any {
  const d = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const AT = autoTable || ((dd: any, o: any) => dd.autoTable(o));
  const W = 210, M = 16, CW = W - 2 * M, BOTTOM = 297 - 18; const NAVY: [number, number, number] = [17, 38, 74]; const GREY: [number, number, number] = [90, 90, 90];
  let y = M; const tocPages: { title: string; page: number }[] = [];
  const page = () => d.internal.getNumberOfPages();
  const need = (h: number) => { if (y + h > BOTTOM) { d.addPage(); y = M; } };
  const text = (s: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number } = {}) => {
    d.setFont("helvetica", opts.bold ? "bold" : "normal"); d.setFontSize(size); d.setTextColor(...(opts.color || [30, 30, 30]));
    const lines = d.splitTextToSize(pdfSafe(s), CW - (opts.indent || 0)); const lh = size * 0.42;
    for (const ln of lines) { need(lh); d.text(ln, M + (opts.indent || 0), y + lh * 0.8); y += lh; }
    y += opts.gap ?? 1.5;
  };
  // Cover
  d.setFillColor(...NAVY); d.rect(0, 0, W, 70, "F");
  d.setTextColor(255, 255, 255); d.setFont("helvetica", "bold"); d.setFontSize(26); d.text(pdfSafe(doc.title.toUpperCase()), M, 34);
  d.setFont("helvetica", "normal"); d.setFontSize(12); d.text(d.splitTextToSize(pdfSafe(doc.subtitle), CW), M, 46);
  y = 86; for (const [k, v] of doc.meta) { d.setFont("helvetica", "bold"); d.setFontSize(10.5); d.setTextColor(...GREY); d.text(pdfSafe(k), M, y); d.setFont("helvetica", "normal"); d.setTextColor(30, 30, 30); d.text(d.splitTextToSize(pdfSafe(v), CW - 45), M + 45, y); y += 8; }
  // Contents placeholder (filled at the end)
  d.addPage(); const tocPage = page();
  d.addPage(); y = M;
  for (const b of doc.blocks) renderBlock(b);
  // Contents
  d.setPage(tocPage); y = M; d.setFont("helvetica", "bold"); d.setFontSize(16); d.setTextColor(...NAVY); d.text("Contents", M, y + 6); y += 14;
  d.setFontSize(10.5); for (const t of tocPages) { d.setFont("helvetica", "normal"); d.setTextColor(30, 30, 30); const label = pdfSafe(t.title); d.text(d.splitTextToSize(label, CW - 20)[0], M, y); d.text(String(t.page), W - M, y, { align: "right" }); y += 6.4; }
  // Footer on every page except the cover
  const n = page();
  for (let i = 2; i <= n; i++) { d.setPage(i); d.setDrawColor(200); d.line(M, 297 - 13, W - M, 297 - 13); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...GREY);
    d.text(pdfSafe(doc.title + " - " + doc.subtitle).slice(0, 95), M, 297 - 8.5); d.text("Page " + i + " of " + n, W - M, 297 - 8.5, { align: "right" }); }
  return d;

  function renderBlock(b: Block) {
    if (b.t === "pagebreak") { d.addPage(); y = M; return; }
    if (b.t === "h1") { if (y > M + 2 && (y > BOTTOM - 70 || /statement|balance sheet|compliance|appraisal|repayment/i.test(b.text))) { d.addPage(); y = M; } else if (y > M + 2) y += 4; tocPages.push({ title: b.text, page: page() }); d.setFillColor(...NAVY); d.rect(M, y, CW, 9, "F"); d.setTextColor(255, 255, 255); d.setFont("helvetica", "bold"); d.setFontSize(12.5); d.text(pdfSafe(b.text), M + 3, y + 6.3); y += 13; return; }
    if (b.t === "h2") { need(12); text(b.text, 11.5, { bold: true, color: NAVY, gap: 1 }); return; }
    if (b.t === "p") { if (b.tone) { const lines = d.splitTextToSize(pdfSafe(b.text), CW - 6); const h = lines.length * 9.5 * 0.42 + 4; need(h); d.setFillColor(...(b.tone === "warn" ? [253, 236, 200] as [number, number, number] : [232, 240, 252] as [number, number, number])); d.rect(M, y, CW, h, "F"); y += 2; text(b.text, 9.5, { indent: 3, gap: 3 }); return; } text(b.text, 10); return; }
    if (b.t === "ul") { for (const it of b.items) { const lines = d.splitTextToSize(pdfSafe(it), CW - 6); need(lines.length * 4.2); d.setFont("helvetica", "normal"); d.setFontSize(10); d.setTextColor(30, 30, 30); d.text("-", M + 1, y + 3.4); lines.forEach((ln: string, i: number) => d.text(ln, M + 5, y + 3.4 + i * 4.2)); y += lines.length * 4.2 + 1; } y += 1.5; return; }
    const isKv = b.t === "kv"; const head = isKv ? undefined : [(b as any).head.map(pdfSafe)];
    const body = (isKv ? (b as any).rows : (b as any).rows).map((r: string[]) => r.map(pdfSafe));
    const cols = isKv ? 2 : (b as any).head.length; const wide = cols > 7;
    if (!isKv && (b as any).caption) { need(8); text((b as any).caption, 8.5, { color: GREY, gap: 0.5 }); }
    AT(d, { startY: y, head, body, theme: "grid", margin: { left: M, right: M },
      styles: { font: "helvetica", fontSize: wide ? 7 : 8.6, cellPadding: wide ? 1.2 : 1.8, overflow: "linebreak", valign: "middle", lineColor: [190, 196, 206], lineWidth: 0.15, textColor: [30, 30, 30] },
      headStyles: { fillColor: [226, 232, 243], textColor: NAVY, fontStyle: "bold" },
      columnStyles: isKv ? { 0: { fontStyle: "bold", cellWidth: 58, fillColor: [246, 248, 252] } } : wide ? { 0: { cellWidth: 44 } } : {},
      didParseCell: (h: any) => { if (h.section !== "body") return; const raw = String(h.row.raw?.[0] || ""); const last = !isKv && (b as any).boldLast && h.row.index === body.length - 1;
        if (last || /^(SOURCES|USES|LIABILITIES|ASSETS|Total|Profit after tax|EBITDA|Closing cash|Contribution)/i.test(raw)) h.cell.styles.fontStyle = "bold";
        if (!isKv && h.column.index > 0 && /^[\d(,.\-]+$/.test(String(h.cell.raw || "").trim())) h.cell.styles.halign = "right";
        if (/^(WEAK|GOOD|ACCEPTABLE)$/.test(String(h.cell.raw))) h.cell.styles.textColor = h.cell.raw === "WEAK" ? [176, 24, 24] : h.cell.raw === "GOOD" ? [18, 110, 50] : [150, 95, 0]; } });
    y = (d as any).lastAutoTable.finalY + 4;
  }
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function renderWordHtml(doc: ReportDoc): string {
  const css = "body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1e1e1e}h1{font-size:15pt;color:#fff;background:#11264a;padding:4pt 8pt;page-break-before:always;margin:0 0 8pt}"
    + "h2{font-size:12pt;color:#11264a}table{border-collapse:collapse;width:100%;margin:4pt 0 10pt}td,th{border:0.5pt solid #9aa4b4;padding:2pt 4pt;font-size:9pt;vertical-align:top}th{background:#e2e8f3;color:#11264a}"
    + ".num{text-align:right}.kvk{font-weight:bold;background:#f6f8fc;width:35%}.note{background:#e8f0fc;padding:5pt}.warn{background:#fdecc8;padding:5pt}.b{font-weight:bold}.cap{color:#5a5a5a;font-size:8.5pt}";
  const B: string[] = [];
  B.push('<div style="background:#11264a;color:#fff;padding:24pt"><p style="font-size:26pt;font-weight:bold;margin:0">' + esc(doc.title.toUpperCase()) + '</p><p style="font-size:13pt">' + esc(doc.subtitle) + "</p></div>");
  B.push("<table>" + doc.meta.map(([k, v]) => '<tr><td class="kvk">' + esc(k) + "</td><td>" + esc(v) + "</td></tr>").join("") + "</table>");
  B.push('<h1>Contents</h1><ol>' + doc.toc.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ol>");
  for (const b of doc.blocks) {
    if (b.t === "h1") B.push("<h1>" + esc(b.text) + "</h1>");
    else if (b.t === "h2") B.push("<h2>" + esc(b.text) + "</h2>");
    else if (b.t === "p") B.push('<p class="' + (b.tone || "") + '">' + esc(b.text) + "</p>");
    else if (b.t === "ul") B.push("<ul>" + b.items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul>");
    else if (b.t === "kv") B.push("<table>" + b.rows.map(([k, v]) => '<tr><td class="kvk">' + esc(k) + "</td><td>" + esc(v) + "</td></tr>").join("") + "</table>");
    else if (b.t === "table") B.push((b.caption ? '<p class="cap">' + esc(b.caption) + "</p>" : "") + "<table><tr>" + b.head.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr>"
      + b.rows.map((r, i) => "<tr>" + r.map((c, j) => '<td class="' + (j > 0 && /^[\d(,.\-]+$/.test(String(c).trim()) ? "num" : "") + (b.boldLast && i === b.rows.length - 1 || /^(SOURCES|USES|LIABILITIES|ASSETS|Total|Profit after tax|Closing cash)/i.test(r[0]) ? " b" : "") + '">' + esc(c) + "</td>").join("") + "</tr>").join("") + "</table>");
    else if (b.t === "pagebreak") B.push('<br style="page-break-before:always">');
  }
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(doc.title)
    + "</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>@page{size:A4;margin:2cm}" + css + "</style></head><body>" + B.join("\n") + "</body></html>";
}
