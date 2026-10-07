// ONE export path for the whole app (journey shell + Decision Cockpit).
// Every export is built from cockpitContext(), the single canonical decision
// context, so the screen, PDF, PPT, Excel and MD can never show different numbers.
import { cockpitContext, businessReportMarkdown, deckMarkdown, buildExcelModel, auditMarkdown, type CockpitContext } from "./DecisionExports";
import type { Actuals } from "./DecisionCockpit";

export type ExportKind = "pdf" | "ppt" | "excel" | "md" | "brief";
export const EXPORT_PURPOSE: Record<ExportKind, { label: string; purpose: string }> = {
  pdf: { label: "PDF", purpose: "Complete business report" },
  ppt: { label: "PPT", purpose: "Executive presentation" },
  excel: { label: "Excel", purpose: "Interactive financial & decision model" },
  md: { label: "MD", purpose: "Complete technical / audit record" },
  brief: { label: "Decision Brief", purpose: "Short summary to paste into email, WhatsApp or Slack" },
};
export interface ExportDeps {
  company?: string; location?: string; actuals?: Actuals | null;
  exportVerbatimPDF?: (title: string, md: string) => Promise<void> | void;
  quickExport?: (mode: string, dtype: string, title: string, body: string) => any;
  dlFile?: (name: string, content: string, mime: string) => void;
  cp?: (text: string) => void;
  showToast?: (msg: string, kind?: string) => void;
}
// The latest completed stage of a Boardroom session (the one the decision is about).
export function latestDecisionStage(cur: any): number {
  const st = (cur && cur.stages) || [];
  for (let i = st.length - 1; i >= 0; i--) if (st[i] && st[i].synthesis) return i;
  return -1;
}
export async function runDecisionExport(kind: ExportKind, cur: any, si: number, deps: ExportDeps, given?: CockpitContext | null): Promise<boolean> {
  const ctx = given || cockpitContext(cur, si, { location: deps.location || "", actuals: deps.actuals || null });
  if (!ctx) { deps.showToast && deps.showToast("There is no completed decision to export yet.", "warning"); return false; }
  const company = deps.company || "";
  if (kind === "pdf") {
    const md = businessReportMarkdown(cur, si, ctx, company);
    if (deps.exportVerbatimPDF) await deps.exportVerbatimPDF("Decision Report \u2014 " + ctx.question.slice(0, 60), md);
    else if (deps.quickExport) await deps.quickExport("pdf", "detailed", "Decision Report", md);
    return true;
  }
  if (kind === "ppt") { if (deps.quickExport) await deps.quickExport("pptx", "strategy", "Decision \u2014 " + ctx.question.slice(0, 50), deckMarkdown(ctx, company)); return true; }
  if (kind === "excel") {
    const ExcelJS: any = (await import("exceljs")).default;
    const wb = await buildExcelModel(ExcelJS, ctx, company); const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const el = document.createElement("a"); el.href = url; el.download = "Decision-Model-" + Date.now() + ".xlsx";
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  if (kind === "md") { deps.dlFile && deps.dlFile("Decision-Audit-" + Date.now() + ".md", auditMarkdown(cur, ctx), "text/markdown"); return true; }
  if (kind === "brief") {
    deps.cp && deps.cp(ctx.brief);
    deps.showToast && deps.showToast("Decision Brief copied \u2014 paste it into email, WhatsApp or Slack.", "success");
    return true;
  }
  return false;
}
