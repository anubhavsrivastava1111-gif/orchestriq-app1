// ─── Shared Excel Export ──────────────────────────────────────────────────────
// Single source of truth for "download data as a styled .xlsx file", used by
// every module that needs a quick Excel export (Pulse Governance, Finance Suite).
//
// This function previously existed as two byte-for-byte identical copies —
// one inside Pulse.tsx, one inside FinanceSuite.tsx. Consolidating here means
// a future fix (e.g. a different Excel library, a new default sheet style)
// only needs to happen once and every module picks it up automatically.
//
// USAGE (identical to how both modules already called their local copy):
//   import { downloadExcel } from "./utils/excelExport";
//   await downloadExcel("Report.xlsx", "Sheet Name", rows);

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if ((window as any).XLSX) return res();
    src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    const ex = document.querySelector('script[src="' + src + '"]');
    if (ex) { ex.addEventListener("load", () => res()); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Excel library failed to load"));
    document.head.appendChild(s);
  });
}

export async function downloadExcel(
  filename: string,
  sheetName: string,
  data: Record<string, unknown>[]
): Promise<void> {
  if (!data.length) return;
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const X = (window as any).XLSX;
  if (!X) throw new Error("Excel library unavailable");
  const ws = X.utils.json_to_sheet(data);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  X.writeFile(wb, filename);
}
