import BusinessExecutionEngine from "./lib/BusinessExecutionEngine";
import { WorkspaceMemory } from "./lib/WorkspaceMemory";
import { useState, useCallback, useRef, useEffect } from "react";
import { saveRecord, estimateCost, estimateTokens } from "./TokenAnalytics";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentContext {
  company: any;
  compData: any;
  industry?: string;
  industryHint?: string;
  userInput: string;
  extractedData?: string;
  uploadedFileName?: string;
  workingMode: "upload" | "photo" | "guide" | "text";
  preferences?: string;
}

interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number)[][];
  formulas?: Record<string, string>;
  summary?: string;
}

export interface ExcelSchema {
  sheets: ExcelSheet[];
}

export interface ActionItem {
  title: string;
  owner: string;
  priority: "High" | "Medium" | "Low";
  dueDate: string;
  status: "Open";
}

export interface AgentOutput {
  mainReport: string;
  excelSchema?: ExcelSchema;
  automationGuide?: string;
  emailDraft?: string;
  actionItems?: ActionItem[];
  confidence: number;
  evidence: string[];
  assumptions: string[];
  recommendations: string[];
  risks: string[];
  hoursaved?: string;
}

interface AgentRun {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: AgentOutput;
  ts: string;
  industry?: string;
  mode: string;
}

export interface AgentDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  timeSaved: string;
  inputTypes: string[];
  outputTypes: string[];
  exportFormats: string[];
  supportsUpload: boolean;
  supportsPhoto: boolean;
  supportsGuide: boolean;
  comingSoon?: boolean;
  flagship?: boolean;
  pipelineAgents?: string[];
  systemPrompt: (ctx: AgentContext) => string;
  excelPrompt?: (ctx: AgentContext) => string;
  guidePrompt?: (ctx: AgentContext) => string;
  emailPrompt?: (ctx: AgentContext) => string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

export const INDUSTRY_TEMPLATES: Record<string, { label: string; hint: string; icon: string; tools: string[] }> = {
  banking:        { label: "Banking & Financial Services", icon: "🏦", tools: ["SAP","Oracle","Temenos","FIS"],          hint: "Basel III, AML/KYC, NPA provisioning, RAROC, IFRS 9, NIM, LCR/NSFR" },
  insurance:      { label: "Insurance",                    icon: "🛡️", tools: ["Guidewire","Duck Creek","SAP"],          hint: "Claims ratio, combined ratio, solvency margin, IFRS 17, loss reserve" },
  healthcare:     { label: "Healthcare",                   icon: "🏥", tools: ["Epic","Cerner","SAP"],                   hint: "HIPAA, patient outcomes, bed occupancy, EBITDAR, denial rate" },
  retail:         { label: "Retail & E-Commerce",          icon: "🛒", tools: ["SAP S/4HANA","Oracle Retail"],           hint: "Same-store sales, inventory turnover, GMROI, shrinkage, NPS" },
  manufacturing:  { label: "Manufacturing",                icon: "🏭", tools: ["SAP","Oracle","Infor"],                  hint: "OEE, yield, OTIF, capacity utilisation, scrap rate, downtime" },
  hospitality:    { label: "Hospitality",                  icon: "🏨", tools: ["Opera","SAP"],                           hint: "RevPAR, ADR, occupancy rate, F&B margins, GOP PAR" },
  consulting:     { label: "Consulting & Professional Services", icon: "💼", tools: ["SAP","Salesforce"],               hint: "Utilisation rate, realisable rate, revenue per consultant, project margin" },
  government:     { label: "Government & Public Sector",   icon: "🏛️", tools: ["SAP","ServiceNow"],                    hint: "Budget utilisation, programme delivery, compliance rate, service level" },
  airlines:       { label: "Airlines & Aviation",          icon: "✈️", tools: ["Amadeus","Sabre"],                       hint: "CASK, RASK, load factor, OTP, yield, ancillary revenue" },
  shared_services: { label: "Shared Services / GBS",      icon: "🏢", tools: ["SAP Concur","SAP S/4HANA","ServiceNow"], hint: "SLA compliance, FTE productivity, cycle time, first-time-right, cost per transaction" },
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const AGENT_REGISTRY: AgentDef[] = [

  // ─── EXPENSE AUDIT ────────────────────────────────────────────────────────
  {
    id: "expense_audit", name: "Expense Audit", category: "Finance & Audit",
    icon: "🧾", color: "#EF4444", flagship: true,
    timeSaved: "4–6 hours per audit cycle",
    description: "Full T&E audit: receipts → policy check → duplicate detection → risk scoring → audit workbook → PPT → employee emails.",
    inputTypes: ["expense report","receipts","policy doc","CSV/Excel"],
    outputTypes: ["audit report","exception workbook","risk dashboard","employee emails","PPT"],
    exportFormats: ["xlsx","pdf","pptx","docx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    pipelineAgents: ["smart_ocr","expense_audit","business_analyst"],
    systemPrompt: ({ company, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are a Senior Internal Auditor specialising in T&E compliance for ${company?.name||"the company"} (${company?.industry||"Shared Services"}).\n`+
        (industryHint ? `INDUSTRY CONTEXT: ${industryHint}\n` : "")+
        `\nPerform a COMPLETE expense audit with these exact sections:\n\n`+
        `## EXECUTIVE SUMMARY\nTotal claims reviewed, total value, violation rate, top finding.\n\n`+
        `## POLICY VIOLATIONS\n| # | Employee | Date | Amount | Category | Violation | Policy Ref | Risk | Action |\n|---|---|---|---|---|---|---|---|---|\n\n`+
        `## DUPLICATE CLAIMS DETECTED\n| Invoice/Receipt # | Employee | Date | Amount | Match with | Action |\n|---|---|---|---|---|---|\n\n`+
        `## MISSING DOCUMENTATION\n| Employee | Claim | Amount | Missing Item | Required By |\n|---|---|---|---|---|\n\n`+
        `## VENDOR RISK FLAGS\nUnusual vendors, cash claims, round-number amounts.\n\n`+
        `## RISK SCORING\n| Risk Category | Count | Total Amount | Risk Level |\n|---|---|---|---|\nOverall Risk Score: X/100\n\n`+
        `## ROOT CAUSE ANALYSIS\n## RECOMMENDATIONS\n## PRIORITY ACTIONS\n| Priority | Action | Owner | Deadline |\n|---|---|---|---|\n\n`+
        `Label: [CRITICAL] [HIGH] [MEDIUM] [LOW] [VERIFIED] [ASSUMPTION]\n\nEXPENSE DATA:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `Extract ALL expense claims and output ONLY JSON:\n`+
        `{"sheets":[`+
        `{"name":"Exception Register","headers":["#","Employee","Date","Amount","Category","Vendor","Receipt#","Violation","Risk","Status","Action"],"rows":[]},`+
        `{"name":"By Employee","headers":["Employee","Total Claims","Total Amount","Violations","Risk Score","Status"],"rows":[]},`+
        `{"name":"By Category","headers":["Category","Count","Total Amount","Violations","% Violation Rate"],"rows":[]},`+
        `{"name":"Summary","headers":["Metric","Value"],"rows":[["Total Claims Reviewed",""],["Total Amount",""],["Violations Found",""],["Total at Risk",""],["Risk Score",""]]}]}\n\nDATA:\n${data}`;
    },
    emailPrompt: ({ company, userInput }) =>
      `Draft a professional audit email from Internal Audit to employees with violations.\nCompany: ${company?.name||"the company"}\nTone: Professional, factual, solution-oriented. Under 200 words. Include subject line.\nBased on: ${userInput.slice(0,500)}`,
    guidePrompt: ({ company, industryHint }) =>
      `Generate a complete SAP Concur + Excel automation guide for T&E audit at ${company?.name||"the company"}.\n`+
      (industryHint ? `Context: ${industryHint}\n` : "")+
      `\n## SAP CONCUR AUDIT SETUP\nStep-by-step configuration for policy rules and audit triggers.\n\n`+
      `## EXCEL DUPLICATE DETECTION\n\`\`\`excel\n=COUNTIFS(D:D,D2,E:E,E2,F:F,F2)>1\n\`\`\`\n\n`+
      `## VBA AUDIT AUTOMATION\n\`\`\`vba\nSub RunExpenseAudit()\n    Dim ws As Worksheet\n    Set ws = ThisWorkbook.Sheets("Expenses")\n    Dim lastRow As Long\n    lastRow = ws.Cells(ws.Rows.Count,"A").End(xlUp).Row\n    ' Add duplicate detection and policy check logic here\nEnd Sub\n\`\`\`\n\n`+
      `## POWER BI DAX MEASURES\n\`\`\`dax\nViolation Rate = DIVIDE(COUNTX(FILTER(Expenses,[Violation]<>""),[Violation]),COUNT(Expenses[ID]))\nTotal at Risk = CALCULATE(SUM(Expenses[Amount]),Expenses[Risk]="High")\n\`\`\`\n\n`+
      `## POWER AUTOMATE FLOW\nViolation detected → notify employee → require response within 5 days → escalate if no response.`,
  },

  // ─── ACCOUNTS PAYABLE ─────────────────────────────────────────────────────
  {
    id: "ap_review", name: "Accounts Payable Review", category: "Finance & Audit",
    icon: "📑", color: "#3B82F6", flagship: true,
    timeSaved: "6–10 hours per month-end cycle",
    description: "Full AP review: invoice validation → 3-way match → duplicate detection → vendor ageing → GR/IR → accruals → month-end workbook.",
    inputTypes: ["invoice data","PO data","GR/IR","vendor master","ageing report"],
    outputTypes: ["AP workbook","exception report","ageing analysis","accrual schedule","month-end checklist"],
    exportFormats: ["xlsx","pdf","docx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are an AP Operations Manager and Internal Auditor for ${company?.name||"the company"}.\n`+
        (industryHint ? `CONTEXT: ${industryHint}\n` : "")+
        `\n## ACCOUNTS PAYABLE REVIEW REPORT\n\n`+
        `## EXECUTIVE SUMMARY\n\n`+
        `## INVOICE VALIDATION\n| Invoice # | Vendor | Amount | PO Match | GR Match | Status | Exception |\n|---|---|---|---|---|---|---|\n\n`+
        `## THREE-WAY MATCH EXCEPTIONS\n| Invoice | PO | GR | Invoice Amt | PO Amt | GR Amt | Variance | Action |\n|---|---|---|---|---|---|---|---|\n\n`+
        `## DUPLICATE INVOICE DETECTION\n| Invoice # | Vendor | Amount | Date | Duplicate of | Risk |\n|---|---|---|---|---|---|\n\n`+
        `## VENDOR AGEING\n| Bucket | Count | Amount | % of Total | Action |\n|---|---|---|---|---|\nBuckets: Current | 1-30 | 31-60 | 61-90 | 90+ days\n\n`+
        `## GR/IR OPEN ITEMS\n| PO # | Vendor | GR Amount | IR Amount | Variance | Age | Action |\n|---|---|---|---|---|---|---|\n\n`+
        `## MONTH-END ACCRUALS\n| Vendor | Description | Amount | Cost Centre | GL Account | Basis |\n|---|---|---|---|---|---|\n\n`+
        `## PRIORITY ACTIONS\n| Priority | Action | Owner | Deadline |\n|---|---|---|---|\n\nDATA:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `Extract AP data and output ONLY JSON:\n`+
        `{"sheets":[`+
        `{"name":"Invoice Register","headers":["Invoice#","Vendor","Date","Amount","PO#","GR#","Match Status","Days Outstanding","Exception","Action"],"rows":[]},`+
        `{"name":"Vendor Ageing","headers":["Vendor","Current","1-30 Days","31-60 Days","61-90 Days","90+ Days","Total","Risk Flag"],"rows":[]},`+
        `{"name":"GR-IR Open Items","headers":["PO#","Vendor","GR Amount","IR Amount","Variance","Age (Days)","Action"],"rows":[]},`+
        `{"name":"Accrual Schedule","headers":["Vendor","Description","Amount","Cost Centre","GL Account","Basis","Approver"],"rows":[]},`+
        `{"name":"Month-End Checklist","headers":["#","Task","Responsible","Due Date","Status","Notes"],"rows":[["1","Clear GR/IR open items >30 days","AP Lead","","Open",""],["2","Post accruals","Finance","","Open",""],["3","Vendor statement recon","AP Team","","Open",""],["4","Review duplicates","AP Lead","","Open",""],["5","Payment run","Treasury","","Open",""]]}]}\n\nDATA:\n${data}`;
    },
    guidePrompt: ({ company }) =>
      `Generate a complete SAP S/4HANA + Excel AP automation guide for ${company?.name||"the company"}.\n\n`+
      `## KEY SAP T-CODES\nMIRO (Invoice), FB60 (Manual invoice), F110 (Payment run), FBL1N (Vendor line items), MRBR (Release blocked invoices), MR11 (GR/IR clearing).\n\n`+
      `## DUPLICATE INVOICE FORMULA\n\`\`\`excel\n=COUNTIFS(B:B,B2,C:C,C2,D:D,D2)>1\n\`\`\`\n\n`+
      `## THREE-WAY MATCH FORMULA\n\`\`\`excel\n=IF(AND(ABS(D2-E2)<5,ABS(D2-F2)<5),"Match","Exception")\n\`\`\`\n\n`+
      `## VENDOR AGEING FORMULA\n\`\`\`excel\n=IFS(TODAY()-A2<=30,"Current",TODAY()-A2<=60,"1-30 Days",TODAY()-A2<=90,"31-60 Days",TRUE,"90+ Days")\n\`\`\`\n\n`+
      `## POWER BI DAX\n\`\`\`dax\nAP Overdue = CALCULATE(SUM(Invoices[Amount]),Invoices[DaysOutstanding]>30)\nDuplicate Count = COUNTX(FILTER(Invoices,COUNTIFS(Invoices[InvoiceNo],Invoices[InvoiceNo])>1),Invoices[InvoiceNo])\n\`\`\`\n\n`+
      `## POWER AUTOMATE FLOW\nInvoice email received → extract data → match against PO → route for approval → post to SAP.`,
  },

  // ─── BUSINESS ANALYST ─────────────────────────────────────────────────────
  {
    id: "business_analyst", name: "Business Analyst", category: "Executive Office",
    icon: "🔬", color: "#A855F7", flagship: true,
    timeSaved: "8–12 hours per report cycle",
    description: "CFO-level analysis: multi-sheet Excel workbook with KPIs, variance, forecast → Power BI dashboard → executive PPT → boardroom brief.",
    inputTypes: ["financial data","business metrics","operational data","narrative"],
    outputTypes: ["Excel workbook","KPI dashboard","executive PPT","variance analysis","boardroom brief"],
    exportFormats: ["xlsx","pptx","pdf","docx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, compData, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      const dataHub = compData && Object.keys(compData).length ? `WORKSPACE DATA:\n${Object.entries(compData).map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n` : "";
      return `You are a McKinsey-calibre Business Analyst and CFO advisor for ${company?.name||"the company"} (${company?.industry||"business"}).\n`+
        (industryHint ? `INDUSTRY: ${industryHint}\n` : "")+dataHub+
        `Produce a CFO-ready analysis:\n\n`+
        `## EXECUTIVE SUMMARY\n3-sentence summary.\n\n`+
        `## P&L PERFORMANCE\n| Line Item | Budget | Actual | Variance | Var% | Commentary |\n|---|---|---|---|---|---|\n\n`+
        `## KPI SCORECARD\n| KPI | Target | Actual | RAG | Trend | Action |\n|---|---|---|---|---|---|\nRAG: 🟢 GREEN 🟡 AMBER 🔴 RED\n\n`+
        `## VARIANCE ANALYSIS\nTop 3 favourable and unfavourable variances with root cause.\n\n`+
        `## TREND ANALYSIS\n3-period comparison.\n\n`+
        `## FORECAST\nRevised full-year forecast with key assumptions.\n\n`+
        `## SWOT ANALYSIS\n| | Strengths | Weaknesses |\n|---|---|---|\n| **Opportunities** | SO | WO |\n| **Threats** | ST | WT |\n\n`+
        `## RISK REGISTER\n| Risk | Likelihood | Impact | Score | Owner | Mitigation |\n|---|---|---|---|---|---|\n\n`+
        `## ROOT CAUSE ANALYSIS\nFishbone / 5 Whys on top 2 issues.\n\n`+
        `## STRATEGIC RECOMMENDATIONS\nNumbered, prioritised.\n\n`+
        `## BOARDROOM BRIEF\n3 key decisions required with recommendation for each.\n\n`+
        `Label: [VERIFIED] [ASSUMPTION] [ESTIMATE] [CRITICAL] [HIGH] [MEDIUM]\n\nDATA:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData, company }) => {
      const data = (extractedData || userInput).slice(0, 2000);
      return `Extract financial data and output ONLY JSON for a CFO-grade workbook:\n`+
        `{"sheets":[`+
        `{"name":"Executive Dashboard","headers":["KPI","Target","Actual","Variance","Var%","RAG Status","Trend"],"rows":[]},`+
        `{"name":"P&L Analysis","headers":["Line Item","Prior Year","Budget","Actual","Budget Var","Budget Var%","YoY Var","YoY Var%","Commentary"],"rows":[]},`+
        `{"name":"Variance Analysis","headers":["Category","Description","Fav/(Unfav)","Root Cause","Owner","Action"],"rows":[]},`+
        `{"name":"Trend Analysis","headers":["Period","Revenue","Cost","Gross Margin","EBITDA","Net Margin%","Growth%"],"rows":[]},`+
        `{"name":"Forecast","headers":["Month","Budget","Revised Forecast","Assumption","Risk","Confidence"],"rows":[]},`+
        `{"name":"Risk Register","headers":["Risk ID","Risk","Category","Likelihood","Impact","Score","Owner","Mitigation","Status","Due Date"],"rows":[]},`+
        `{"name":"Assumptions","headers":["Assumption","Basis","Value","Sensitivity","Source"],"rows":[]}]}\n\nCompany: ${company?.name||""}\nDATA:\n${data}`;
    },
    guidePrompt: ({ company, industryHint }) =>
      `Generate a complete CFO dashboard automation guide for ${company?.name||"the company"}.\n`+
      (industryHint ? `Industry: ${industryHint}\n` : "")+
      `\n## EXCEL FORMULAS\n\`\`\`excel\n// Budget variance %\n=(Actual-Budget)/ABS(Budget)\n// RAG status\n=IFS(ABS((D2-C2)/C2)<=0.05,"🟢",ABS((D2-C2)/C2)<=0.1,"🟡",TRUE,"🔴")\n// Rolling 12-month avg\n=AVERAGE(OFFSET(B2,0,-11,1,12))\n\`\`\`\n\n`+
      `## POWER BI DAX\n\`\`\`dax\nRevenue Variance % = DIVIDE([Actual Revenue]-[Budget Revenue],[Budget Revenue])\nYoY Growth = DIVIDE([Current Revenue]-[Prior Year Revenue],[Prior Year Revenue])\nRunning Total = CALCULATE(SUM(Sales[Amount]),DATESYTD(Calendar[Date]))\n\`\`\`\n\n`+
      `## POWER QUERY M CODE\n\`\`\`m\nlet\n  Source = Excel.CurrentWorkbook(){[Name="RawData"]}[Content],\n  TypedCols = Table.TransformColumnTypes(Source,{{"Amount",type number},{"Date",type date}}),\n  FilteredRows = Table.SelectRows(TypedCols, each [Amount] <> null)\nin FilteredRows\n\`\`\`\n\n`+
      `## POWER AUTOMATE FLOW\nMonthly data collection → email reminder → consolidation → dashboard refresh → distribution.`,
  },

  // ─── EXECUTIVE ASSISTANT ──────────────────────────────────────────────────
  {
    id: "exec_assistant", name: "Executive Assistant", category: "Executive Office",
    icon: "🤝", color: "#14B8A6", flagship: true,
    timeSaved: "2–3 hours per day",
    description: "Drafts executive communications, meeting agendas, briefings, board papers and action summaries.",
    inputTypes: ["text","meeting notes","emails","context"],
    outputTypes: ["briefing","agenda","action list","board paper"],
    exportFormats: ["docx","pdf","md"],
    supportsUpload: true, supportsPhoto: false, supportsGuide: false,
    systemPrompt: ({ company, userInput }) =>
      `You are a world-class Executive Assistant for ${company?.name||"the company"}.\n`+
      `Produce professional, concise, action-oriented output.\n`+
      `Structure: Executive Summary | Key Points | Decisions Required | Actions (Owner | Action | Deadline) | Next Steps\n\n`+
      `TASK: ${userInput}`,
    emailPrompt: ({ userInput }) =>
      `Draft a professional executive email based on: ${userInput.slice(0,500)}\nTone: Authoritative, clear, brief. Include subject line.`,
  },

  // ─── MEETING INTELLIGENCE ─────────────────────────────────────────────────
  {
    id: "meeting_intel", name: "Meeting Intelligence", category: "Executive Office",
    icon: "🎙️", color: "#8B5CF6", flagship: true,
    timeSaved: "1–2 hours per meeting",
    description: "Transforms meeting notes or transcripts into structured summaries, decisions, action items and follow-up emails.",
    inputTypes: ["meeting notes","transcript","audio description"],
    outputTypes: ["summary","decisions","action items","follow-up email"],
    exportFormats: ["docx","pdf","xlsx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: false,
    systemPrompt: ({ company, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are a Meeting Intelligence specialist for ${company?.name||"the company"}.\n\n`+
        `## MEETING SUMMARY\n2-3 sentence overview.\n\n`+
        `## ATTENDEES & ROLES\n\n`+
        `## KEY DECISIONS MADE\nNumbered list with decision owner.\n\n`+
        `## ACTION ITEMS\n| # | Action | Owner | Deadline | Priority | Notes |\n|---|---|---|---|---|---|\n\n`+
        `## OPEN ISSUES / PARKING LOT\n\n`+
        `## NEXT MEETING AGENDA\nSuggested agenda based on open items.\n\nMEETING CONTENT:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `Extract meeting actions and output ONLY JSON:\n`+
        `{"sheets":[{"name":"Action Register","headers":["#","Action Item","Owner","Deadline","Priority","Status","Meeting Date","Notes"],"rows":[]},`+
        `{"name":"Decisions Log","headers":["#","Decision","Owner","Date","Impact","Follow-Up Required"],"rows":[]}]}\n\nDATA:\n${data}`;
    },
    emailPrompt: ({ userInput, extractedData }) =>
      `Draft a professional follow-up email from this meeting:\n${(extractedData||userInput).slice(0,800)}\n`+
      `Include: Summary, decisions, action items with owners and deadlines, next meeting if mentioned. Professional tone.`,
  },

  // ─── MONTHLY BUSINESS REVIEW ──────────────────────────────────────────────
  {
    id: "monthly_review", name: "Monthly Business Review", category: "Executive Office",
    icon: "📊", color: "#F59E0B", flagship: true,
    timeSaved: "6–8 hours per MBR",
    description: "Full MBR package: KPI scorecard → variance commentary → risk review → exec PPT → management email.",
    inputTypes: ["text","data","metrics","prior MBR"],
    outputTypes: ["MBR report","KPI scorecard","variance commentary","management PPT"],
    exportFormats: ["pptx","pdf","xlsx","docx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, compData, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      const dataHub = compData && Object.keys(compData).length ? `WORKSPACE DATA:\n${Object.entries(compData).map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n` : "";
      return `You are a Business Performance Director for ${company?.name||"the company"}.\n`+
        (industryHint ? `INDUSTRY: ${industryHint}\n` : "")+dataHub+
        `Produce a complete Monthly Business Review:\n\n`+
        `## EXECUTIVE SUMMARY\n## FINANCIAL PERFORMANCE\n| Metric | Budget | Actual | Var | Var% | Prior Month | Commentary |\n|---|---|---|---|---|---|---|\n\n`+
        `## KPI SCORECARD\n| KPI | Target | Actual | RAG | MoM | YTD | Commentary |\n|---|---|---|---|---|---|---|\n\n`+
        `## HIGHLIGHTS ## LOWLIGHTS / CONCERNS\n## YEAR-TO-DATE PERFORMANCE\n`+
        `## RISKS & MITIGATIONS\n| Risk | Likelihood | Impact | Mitigation | Owner |\n|---|---|---|---|---|\n\n`+
        `## NEXT MONTH PRIORITIES\n## DECISIONS REQUIRED\n\nDATA:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `Extract MBR data and output ONLY JSON:\n`+
        `{"sheets":[{"name":"KPI Scorecard","headers":["KPI","Target","Actual","Variance","Var%","RAG","MoM Change","YTD","Commentary"],"rows":[]},`+
        `{"name":"Financial Summary","headers":["Line Item","Budget","Actual","Variance","Var%","Prior Month","Prior Month Var%","Commentary"],"rows":[]},`+
        `{"name":"Risk Log","headers":["Risk","Likelihood","Impact","Score","Owner","Mitigation","Status"],"rows":[]},`+
        `{"name":"Action Tracker","headers":["#","Priority","Action","Owner","Due Date","Status","Update"],"rows":[]}]}\n\nDATA:\n${data}`;
    },
    guidePrompt: ({ company }) =>
      `Generate a complete MBR automation guide for ${company?.name||"the company"} using Excel and Power BI.\n\n`+
      `## EXCEL MBR TEMPLATE\n## KEY FORMULAS\n\`\`\`excel\n=IFS(ABS((D2-C2)/C2)<=0.05,"🟢 On Track",ABS((D2-C2)/C2)<=0.1,"🟡 At Risk",TRUE,"🔴 Off Track")\n\`\`\`\n\n`+
      `## POWER BI DAX\n\`\`\`dax\nMoM Growth = DIVIDE([Current Month]-[Prior Month],[Prior Month])\nRAG Status = IF([Var%]>=-0.05,"🟢","🟡")\n\`\`\`\n\n`+
      `## POWER AUTOMATE MBR FLOW\nData collection → consolidation → review reminder → distribution.`,
  },

  // ─── PROCESS MINING ───────────────────────────────────────────────────────
  {
    id: "process_mining", name: "Process Mining", category: "Operations",
    icon: "⚙️", color: "#06B6D4", flagship: true,
    timeSaved: "20–40 hours of process mapping",
    description: "Analyses processes to find bottlenecks, waste, and generates automation playbook with formulas and flow designs.",
    inputTypes: ["process description","SLA data","cycle time data","screenshots"],
    outputTypes: ["process analysis","bottleneck map","improvement plan","automation playbook"],
    exportFormats: ["docx","pdf","pptx","xlsx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are a Process Excellence and Six Sigma Black Belt for ${company?.name||"the company"}.\n`+
        (industryHint ? `CONTEXT: ${industryHint}\n` : "")+
        `\n## PROCESS OVERVIEW\n## AS-IS PROCESS MAP\nText-based flowchart with decision points.\n\n`+
        `## BOTTLENECK ANALYSIS\n| Step | Avg Time | Max Time | Freq | Bottleneck Score | Root Cause |\n|---|---|---|---|---|---|\n\n`+
        `## LEAN 8 WASTES\n| Waste | Found? | Example | Impact | Elimination |\n|---|---|---|---|---|\n\n`+
        `## CYCLE TIME ANALYSIS\n| Step | Value-Added? | Time | % of Total | Action |\n|---|---|---|---|---|\n\n`+
        `## AUTOMATION OPPORTUNITIES\n| Step | Tool | Effort | Saving (hrs/mo) | ROI |\n|---|---|---|---|---|\n\n`+
        `## TO-BE PROCESS MAP\n## IMPLEMENTATION ROADMAP\n| Phase | Initiative | Timeline | Owner | Saving |\n|---|---|---|---|---|\n\n`+
        `## QUICK WINS (<2 weeks)\n\nDATA:\n${data}`;
    },
    guidePrompt: ({ company }) =>
      `Generate an automation implementation playbook for ${company?.name||"the company"}.\n\n`+
      `## POWER AUTOMATE FLOWS\nStep-by-step flows for each automation opportunity identified.\n\n`+
      `## EXCEL VBA AUTOMATION\n\`\`\`vba\nSub AutomateProcess()\n    ' Automation logic here\nEnd Sub\n\`\`\`\n\n`+
      `## SHAREPOINT LIST SETUP\n## MICROSOFT FORMS CONFIGURATION\n## TEAMS NOTIFICATION WORKFLOW\n## OFFICE SCRIPTS (for Excel Online)\n\`\`\`javascript\nfunction main(workbook: ExcelScript.Workbook) {\n    // Script logic here\n}\n\`\`\``,
  },

  // ─── SOP COMPLIANCE ───────────────────────────────────────────────────────
  {
    id: "sop_compliance", name: "SOP Compliance", category: "Compliance & Risk",
    icon: "📋", color: "#F59E0B", flagship: true,
    timeSaved: "3–5 hours per review",
    description: "Reviews processes against SOPs, identifies compliance gaps, generates remediation plan and control workbook.",
    inputTypes: ["SOP document","process description","audit evidence","screenshots"],
    outputTypes: ["compliance report","gap register","remediation plan","control workbook"],
    exportFormats: ["docx","xlsx","pdf"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are a Compliance and Internal Controls specialist for ${company?.name||"the company"}.\n\n`+
        `## SOP COMPLIANCE REVIEW\n\n## COMPLIANCE SUMMARY\nOverall score X/100 with RAG status.\n\n`+
        `## REQUIREMENTS MATRIX\n| Req # | SOP Requirement | Evidence Found | Compliant? | Gap | Risk | Remediation |\n|---|---|---|---|---|---|---|\n\n`+
        `## NON-COMPLIANT FINDINGS\n| # | Finding | Root Cause | Risk Rating | SOP Ref | Remediation | Owner | Deadline |\n|---|---|---|---|---|---|---|---|\n\n`+
        `## CONTROLS EFFECTIVENESS\n| Control | Design Adequate? | Operating Effectively? | Gap | Improvement |\n|---|---|---|---|---|\n\n`+
        `## REMEDIATION PLAN\n| Priority | Action | Owner | Deadline | Resource | Success Metric |\n|---|---|---|---|---|---|\n\nCONTENT:\n${data}`;
    },
    excelPrompt: ({ userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `Output ONLY JSON for SOP compliance workbook:\n`+
        `{"sheets":[{"name":"Gap Register","headers":["#","Requirement","SOP Reference","Evidence","Compliant","Risk Rating","Remediation Action","Owner","Due Date","Status"],"rows":[]},`+
        `{"name":"Controls Matrix","headers":["Control ID","Control","Type","Frequency","Owner","Design Status","Operating Status","Finding","Priority"],"rows":[]},`+
        `{"name":"Remediation Tracker","headers":["#","Finding","Priority","Action","Owner","Due Date","Status","Evidence Required","Closed Date"],"rows":[]}]}\n\nDATA:\n${data}`;
    },
  },

  // ─── SMART OCR ────────────────────────────────────────────────────────────
  {
    id: "smart_ocr", name: "Smart OCR & Document Reader", category: "Document Intelligence",
    icon: "🔬", color: "#06B6D4", flagship: true,
    timeSaved: "1–3 hours per document",
    description: "Extracts and structures text from any document. Detects tables, validates data, reconstructs datasets from multiple photos.",
    inputTypes: ["document text","image descriptions","photo captures","scanned pages"],
    outputTypes: ["structured data","extracted tables","validated dataset"],
    exportFormats: ["xlsx","docx","md","csv"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: false,
    systemPrompt: ({ userInput }) =>
      `You are a Document Intelligence specialist with OCR expertise.\n\n`+
      `## DOCUMENT EXTRACTION REPORT\n\n### Document Type\nIdentify: Invoice | Receipt | Report | Form | Contract | Spreadsheet | Statement | Other\n\n`+
      `### Extracted Entities\n| Field | Value | Confidence | Validation |\n|---|---|---|---|\n\n`+
      `### Extracted Tables\nReproduce each table as clean Markdown with headers.\n\n`+
      `### Data Quality Issues\n| Issue | Location | Suggested Fix |\n|---|---|---|\n\n`+
      `### Reconstructed Dataset\nIf multiple pages: merge, de-duplicate, remove page numbers/continuation headers.\n\nDOCUMENT:\n${userInput}`,
    excelPrompt: ({ userInput }) =>
      `Extract ALL structured data and output ONLY JSON:\n`+
      `{"sheets":[{"name":"Extracted Data","headers":[],"rows":[]},{"name":"Validation Log","headers":["Field","Value","Confidence","Issue","Fix"],"rows":[]}]}\n`+
      `Auto-detect all headers. DOCUMENT:\n${userInput}`,
  },

  // ─── TABLE EXTRACTION ─────────────────────────────────────────────────────
  {
    id: "table_extraction", name: "Table Extraction", category: "Document Intelligence",
    icon: "📊", color: "#10B981", flagship: true,
    timeSaved: "30–90 minutes per document",
    description: "Extracts all tables from any document and converts to clean Excel-ready structured format.",
    inputTypes: ["document content","image of tables","PDF text"],
    outputTypes: ["structured Excel tables","cleaned dataset"],
    exportFormats: ["xlsx","csv","md"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: false,
    systemPrompt: ({ userInput }) =>
      `You are a Data Extraction specialist.\n\nExtract EVERY table from the content below.\nFor each table:\n`+
      `1. Title / Subject\n2. Clean headers (standardised)\n3. All data rows (normalised)\n4. Data type per column\n5. Missing/ambiguous values flagged\n\n`+
      `Output as clean, complete Markdown tables.\n\nCONTENT:\n${userInput}`,
    excelPrompt: ({ userInput }) =>
      `Extract every table. Output ONLY JSON with one sheet per table:\n`+
      `{"sheets":[{"name":"[Table Title]","headers":[...],"rows":[[...],[...]]}]}\n`+
      `Normalise data types. Remove duplicate headers from continuation pages.\nCONTENT:\n${userInput}`,
  },

  // ─── MARKETING CAMPAIGN ───────────────────────────────────────────────────
  {
    id: "marketing_campaign", name: "Marketing Campaign Builder", category: "Marketing & Growth",
    icon: "📣", color: "#EC4899", flagship: true,
    timeSaved: "10–20 hours per campaign",
    description: "Full campaign package: strategy → messaging → 4-week content calendar → budget workbook → stakeholder PPT.",
    inputTypes: ["campaign brief","target audience","budget","objectives"],
    outputTypes: ["campaign strategy","content calendar","budget workbook","stakeholder PPT","email sequences"],
    exportFormats: ["pptx","docx","xlsx"],
    supportsUpload: true, supportsPhoto: false, supportsGuide: false,
    systemPrompt: ({ company, industryHint, userInput }) =>
      `You are a Senior Marketing Strategist for ${company?.name||"the company"} (${company?.industry||"business"}).\n`+
      (industryHint ? `CONTEXT: ${industryHint}\n` : "")+
      `\n## CAMPAIGN STRATEGY\n\n## CAMPAIGN OVERVIEW\nObjective, timeline, target audience, KPIs.\n\n`+
      `## TARGET AUDIENCE\n| Segment | Profile | Pain Points | Message | Channel |\n|---|---|---|---|---|\n\n`+
      `## KEY MESSAGES\nPrimary message, supporting messages, proof points, CTA.\n\n`+
      `## CHANNEL STRATEGY\n| Channel | Audience | Content Type | Frequency | KPI | Budget% |\n|---|---|---|---|---|---|\n\n`+
      `## 4-WEEK CONTENT CALENDAR\n| Week | Day | Channel | Content Type | Topic | Message | CTA | Owner |\n|---|---|---|---|---|---|---|---|\n\n`+
      `## EMAIL SEQUENCE\n| # | Trigger | Subject Line | Preview Text | Key Message | CTA |\n|---|---|---|---|---|---|\n\n`+
      `## BUDGET ALLOCATION\n| Item | Budget | % of Total | KPI | Expected ROI |\n|---|---|---|---|---|\n\n`+
      `## SUCCESS METRICS\n| KPI | Baseline | Target | Measurement | Frequency |\n|---|---|---|---|---|\n\nBRIEF:\n${userInput}`,
    excelPrompt: ({ userInput }) =>
      `Output ONLY JSON:\n`+
      `{"sheets":[{"name":"Content Calendar","headers":["Week","Date","Channel","Content Type","Topic","Key Message","CTA","Owner","Status","Notes"],"rows":[]},`+
      `{"name":"Budget Tracker","headers":["Channel","Activity","Budget","Spent","Remaining","ROI","Notes"],"rows":[]},`+
      `{"name":"KPI Tracker","headers":["KPI","Baseline","Week 1","Week 2","Week 3","Week 4","Target","Status","Action"],"rows":[]}]}\n\nBRIEF:\n${userInput}`,
  },

  // ─── FINANCIAL ANALYSIS ───────────────────────────────────────────────────
  {
    id: "financial_analysis", name: "Financial Analysis", category: "Finance & Audit",
    icon: "📈", color: "#10B981",
    timeSaved: "5–8 hours per report",
    description: "Deep financial analysis with ratio analysis, trend commentary, benchmarking and CFO narrative.",
    inputTypes: ["financial statements","management accounts","data extract"],
    outputTypes: ["analysis report","ratio workbook","CFO commentary","investor brief"],
    exportFormats: ["xlsx","pdf","pptx"],
    supportsUpload: true, supportsPhoto: true, supportsGuide: true,
    systemPrompt: ({ company, industryHint, userInput, extractedData }) => {
      const data = extractedData || userInput;
      return `You are a CFO-level Financial Analyst for ${company?.name||"the company"}.\n`+
        (industryHint ? `BENCHMARKS: ${industryHint}\n` : "")+
        `\n## FINANCIAL ANALYSIS REPORT\n\n## EXECUTIVE OVERVIEW\n## P&L ANALYSIS\n## BALANCE SHEET ANALYSIS\n`+
        `## CASH FLOW ANALYSIS\n## KEY RATIOS\n| Ratio | Formula | Value | Benchmark | Assessment |\n|---|---|---|---|---|\n`+
        `Groups: Liquidity | Profitability | Efficiency | Leverage | Coverage\n\n`+
        `## TREND ANALYSIS\n## RED FLAGS\n## MANAGEMENT RECOMMENDATIONS\nDATA:\n${data}`;
    },
    guidePrompt: () =>
      `## EXCEL RATIO FORMULAS\n\`\`\`excel\n// Current Ratio\n=B5/B10\n// Gross Margin %\n=(B2-B3)/B2\n// EBITDA Margin\n=B8/B2\n// Debt to Equity\n=B15/B16\n// DSO\n=(B20/B2)*365\n\`\`\`\n\n`+
      `## POWER BI DAX\n\`\`\`dax\nGross Margin % = DIVIDE([Revenue]-[COGS],[Revenue])\nEBITDA = [Operating Profit]+[D&A]\n\`\`\``,
  },

  // ─── COMING SOON agents ───────────────────────────────────────────────────
  { id:"sox_review",         name:"SOX Compliance Review",      category:"Finance & Audit",       icon:"⚖️", color:"#F97316", comingSoon:true, timeSaved:"10+ hours", description:"SOX/COSO controls testing, deficiency classification, management letter.",           inputTypes:["controls data"], outputTypes:["compliance report"],  exportFormats:["docx","xlsx"], supportsUpload:true,  supportsPhoto:true,  supportsGuide:true,  systemPrompt:({userInput})=>userInput },
  { id:"reconciliation",     name:"Reconciliation Assistant",    category:"Finance & Audit",       icon:"🔄", color:"#6366F1", comingSoon:true, timeSaved:"3–5 hours", description:"Automated reconciliation: identify breaks, root cause, journal support.",            inputTypes:["recon data"],    outputTypes:["recon report"],       exportFormats:["xlsx","pdf"],  supportsUpload:true,  supportsPhoto:true,  supportsGuide:true,  systemPrompt:({userInput})=>userInput },
  { id:"risk_assessment",    name:"Risk Assessment",             category:"Compliance & Risk",     icon:"⚠️", color:"#EF4444", comingSoon:true, timeSaved:"8–12 hours",description:"Enterprise risk register with heat map, scoring and mitigation plans.",              inputTypes:["risk data"],     outputTypes:["risk register"],      exportFormats:["xlsx","docx"], supportsUpload:true,  supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"internal_audit",     name:"Internal Audit Assistant",    category:"Compliance & Risk",     icon:"🔍", color:"#6366F1", comingSoon:true, timeSaved:"15–20 hours",description:"Audit planning, fieldwork workpapers, RACM, findings and management letter.",        inputTypes:["audit scope"],   outputTypes:["audit report"],       exportFormats:["docx","xlsx"], supportsUpload:true,  supportsPhoto:true,  supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"workforce_planner",  name:"Workforce Planner",           category:"Operations",            icon:"👥", color:"#84CC16", comingSoon:true, timeSaved:"6–10 hours", description:"Headcount planning, capacity modelling and skills gap analysis.",                  inputTypes:["headcount data"],outputTypes:["capacity plan"],      exportFormats:["xlsx","docx"], supportsUpload:true,  supportsPhoto:false, supportsGuide:true,  systemPrompt:({userInput})=>userInput },
  { id:"brand_strategy",     name:"Brand Strategy",              category:"Marketing & Growth",    icon:"🎯", color:"#8B5CF6", comingSoon:true, timeSaved:"20–30 hours",description:"Brand positioning, voice, visual identity guidelines.",                             inputTypes:["brand brief"],   outputTypes:["brand strategy"],     exportFormats:["pptx","docx"], supportsUpload:false, supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"investor_pitch",     name:"Investor Pitch Assistant",    category:"Marketing & Growth",    icon:"💼", color:"#F59E0B", comingSoon:true, timeSaved:"15–25 hours",description:"Investor-ready pitch deck with financial narrative and model.",                      inputTypes:["business data"], outputTypes:["pitch deck"],         exportFormats:["pptx","pdf"],  supportsUpload:true,  supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"recruitment_review", name:"Recruitment Review",          category:"HR",                    icon:"👔", color:"#84CC16", comingSoon:true, timeSaved:"2–4 hours",  description:"CV screening, shortlist, structured interview questions.",                         inputTypes:["CV","JD"],       outputTypes:["shortlist"],          exportFormats:["docx","xlsx"], supportsUpload:true,  supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"perf_review",        name:"Performance Review",          category:"HR",                    icon:"⭐", color:"#F59E0B", comingSoon:true, timeSaved:"1–2 hours",  description:"Structured performance reviews with ratings and development plans.",              inputTypes:["performance data"],outputTypes:["review report"],    exportFormats:["docx","pdf"],  supportsUpload:false, supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"doc_comparison",     name:"Document Comparison",         category:"Document Intelligence", icon:"🔀", color:"#F97316", comingSoon:true, timeSaved:"2–4 hours",  description:"Compare two documents, highlight differences and generate change summary.",      inputTypes:["two documents"], outputTypes:["comparison report"],  exportFormats:["docx","pdf"],  supportsUpload:true,  supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
  { id:"media_prompt_builder",name:"Media Prompt Builder",       category:"Creative Studio",       icon:"🎨", color:"#EC4899", comingSoon:true, timeSaved:"30–60 min",  description:"Professional image and video prompts for any AI generation platform.",          inputTypes:["brief"],         outputTypes:["prompts"],            exportFormats:["md","txt"],    supportsUpload:false, supportsPhoto:false, supportsGuide:false, systemPrompt:({userInput})=>userInput },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { id: "Executive Office",      icon: "🏛️", color: "#14B8A6" },
  { id: "Finance & Audit",       icon: "💰", color: "#3B82F6" },
  { id: "Operations",            icon: "⚙️", color: "#06B6D4" },
  { id: "Compliance & Risk",     icon: "⚖️", color: "#F59E0B" },
  { id: "Marketing & Growth",    icon: "📣", color: "#EC4899" },
  { id: "Document Intelligence", icon: "📄", color: "#8B5CF6" },
  { id: "HR",                    icon: "👥", color: "#84CC16" },
  { id: "Creative Studio",       icon: "🎨", color: "#F97316" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseEvidence(text: string) {
  const lines = text.split("\n");
  const evidence = lines.filter(l=>l.includes("[VERIFIED]")).map(l=>l.replace(/\[VERIFIED\]/g,"").trim()).filter(Boolean).slice(0,6);
  const assumptions = lines.filter(l=>/\[ASSUMPTION\]|\[ESTIMATE\]/.test(l)).map(l=>l.replace(/\[ASSUMPTION\]|\[ESTIMATE\]/g,"").trim()).filter(Boolean).slice(0,6);
  const recommendations: string[] = [];
  let inRec = false;
  for (const ln of lines) {
    if (/^#{1,3}\s*(recommendation|priority action|next step)/i.test(ln)) { inRec = true; continue; }
    if (inRec && /^#{1,3}\s/.test(ln)) inRec = false;
    if (inRec && ln.trim()) recommendations.push(ln.replace(/^[\d\.\-\*\s]+/,"").trim());
    if (recommendations.length >= 5) break;
  }
  const risks = lines.filter(l=>/\[CRITICAL\]|\[HIGH\]/.test(l)).map(l=>l.trim()).filter(Boolean).slice(0,5);
  const placeholders = (text.match(/\[INSERT\]|\[TBD\]|Lorem ipsum/gi)||[]).length;
  const confidence = Math.max(35, Math.min(92, 85 - placeholders*8 - assumptions.length*2));
  return { confidence, evidence, assumptions, recommendations, risks };
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
    return JSON.parse(cleaned);
  } catch { return fallback; }
}

async function callAgent(sys: string, input: string, ask: any): Promise<string> {
  const raw = await ask(sys, [{ role: "user", content: input }], 3000);
  if (typeof raw === "string") return raw;
  if (raw?.text) return raw.text;
  if (raw?.content?.[0]?.text) return raw.content[0].text;
  return JSON.stringify(raw);
}

async function buildExcelWorkbook(
  schema: ExcelSchema,
  ensureXLSX: ()=>Promise<any>,
  agentName: string,
  beEngine?: BusinessExecutionEngine,
  objective?: string,
  companyContext?: string,
  aiOutput?: string,
): Promise<void> {
  // Route through BusinessExecutionEngine for professional output
  if (beEngine && (aiOutput || objective)) {
    try {
      const del: any = {
        type: "excel", title: agentName,
        purpose: objective || agentName,
        audience: "cfo" as const, qualityStandard: "cfo_model" as const, priority: "primary" as const,
      };
      const plan: any = {
        objectiveRestated: objective || agentName,
        domain: "finance", persona: "Senior FP&A Manager",
        audience: "cfo", qualityStandard: "cfo_model",
        decisionContext: objective || agentName,
        deliverables: [del], missingInfo: [], executionOrder: [agentName], validationCriteria: [],
      };
      await beEngine.generateExcel(plan, del, companyContext || "", aiOutput || "", "USD", "$", () => {});
      return;
    } catch { /* fall through to schema-based generation */ }
  }
  // Fallback: schema-based XLSX
  const XLSX = await ensureXLSX();
  const wb = XLSX.utils.book_new();
  schema.sheets.forEach(sheet => {
    const rows: any[][] = [];
    if (sheet.headers.length) rows.push(sheet.headers);
    (sheet.rows||[]).forEach(row => rows.push(row));
    const ws = rows.length > 0 ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[sheet.name],["No data extracted"]]);
    ws["!cols"] = sheet.headers.map(() => ({ wch: 20 }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    if (sheet.headers.length) {
      sheet.headers.forEach((_: any, ci: number) => {
        const ref = `${String.fromCharCode(65+ci)}1`;
        if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } };
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0,31));
  });
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = agentName.replace(/\s+/g,"-")+"-"+Date.now()+".xlsx";
  a.style.display = "none"; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(u),200);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

interface AIAgentsProps {
  co: any;
  compData: any;
  keys: Record<string,string>;
  defP: string;
  ask: (sys: string, msgs: any[], maxT?: number, enableSearch?: boolean, taskType?: string) => Promise<any>;
  askImage?: (prompt: string, size?: string, model?: string) => Promise<string>;
  askVideo?: (prompt: string, durationSec?: number, model?: string) => Promise<string>;
  showToast: (msg: string, type?: string) => void;
  dlFile: (name: string, content: any, mime?: string) => void;
  ensureJsPDF: () => Promise<any>;
  ensureXLSX: () => Promise<any>;
  ensurePptx: () => Promise<any>;
  ensureJSZip: () => Promise<any>;
  parseSections: (md: string) => Array<{title:string;lines:string[]}>;
  stripMd: (s: string) => string;
  brSessions: any[];
  setBrSessions: (s: any[]) => void;
  actionItems: any[];
  setActionItems: (items: any[]) => void;
  sv: (key: string, val: any) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AIAgents({
  co, compData, keys, defP, ask, askImage, askVideo, showToast, dlFile,
  ensureJsPDF, ensureXLSX, ensurePptx, ensureJSZip,
  parseSections, stripMd, brSessions, setBrSessions,
  actionItems, setActionItems, sv
}: AIAgentsProps) {

  const [view, setView]               = useState<"landing"|"run"|"result"|"history"|"orchestrate">("landing");
  const [activeAgent, setActiveAgent] = useState<AgentDef|null>(null);
  const [workingMode, setWorkingMode] = useState<"upload"|"photo"|"guide"|"text">("text");
  const [userInput, setUserInput]     = useState("");
  const [uploadedText, setUploadedText]       = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [photoNotes, setPhotoNotes]   = useState<string[]>([""]);
  const [industry, setIndustry]       = useState("");
  const [running, setRunning]         = useState(false);
  const [result, setResult]           = useState<AgentRun|null>(null);
  const [editedOutput, setEditedOutput] = useState("");
  const [history, setHistory]         = useState<AgentRun[]>([]);
  const [filterCat, setFilterCat]     = useState("all");
  const [searchQ, setSearchQ]         = useState("");
  const [preferences, setPreferences] = useState<Record<string,string>>({});
  const [showPrefPrompt, setShowPrefPrompt] = useState(false);
  const [orchestrateInput, setOrchestrateInput] = useState("");
  const [orchestrating, setOrchestrating]       = useState(false);
  const [orchestrateResult, setOrchestrateResult] = useState<AgentRun[]>([]);
  const [activeTab, setActiveTab]     = useState<"output"|"excel"|"guide"|"email"|"actions">("output");
  const historyRef = useRef<AgentRun[]>([]);
  const fileRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const h = (WorkspaceMemory.get<any[]>("oiq-agent-history")||[]); setHistory(h); historyRef.current = h; } catch {}
    try { const p = WorkspaceMemory.get<any>("oiq-agent-prefs")||{}; setPreferences(p); } catch {}
  }, []);

  const saveHistory = useCallback((runs: AgentRun[]) => {
    const trimmed = runs.slice(0,100);
    historyRef.current = trimmed; setHistory(trimmed);
    try { WorkspaceMemory.set("oiq-agent-history", trimmed); } catch {}
  }, []);

  // ─── FILE UPLOAD ─────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setUploadedFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["txt","md","csv"].includes(ext||"")) {
      const text = await file.text();
      setUploadedText(text);
      showToast(`✅ ${file.name} loaded — ${text.length.toLocaleString()} chars`, "success");
      return;
    }
    if (["xlsx","xls"].includes(ext||"")) {
      try {
        const XLSX = await ensureXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        let allText = "";
        wb.SheetNames.forEach((name: string) => {
          const ws = wb.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(ws);
          if (csv.trim()) allText += `\n### Sheet: ${name}\n${csv}\n`;
        });
        setUploadedText(allText);
        showToast(`✅ Excel loaded — ${wb.SheetNames.length} sheets`, "success");
      } catch (e: any) { showToast("Could not parse Excel: "+e.message, "error"); }
      return;
    }
    if (["jpg","jpeg","png","gif","webp"].includes(ext||"")) {
      setPhotoNotes(["Image uploaded. Please describe what you see in the image (tables, text, numbers)."]);
      setWorkingMode("photo");
      showToast("Image received — describe the content below", "warning");
      return;
    }
    showToast("File type not directly supported. Please paste the content as text.", "warning");
  }, [ensureXLSX, showToast]);

  // ─── RUN AGENT ───────────────────────────────────────────────────────────
  const runAgent = useCallback(async (agent: AgentDef) => {
    let inputData = userInput;
    if (workingMode==="upload" && uploadedText) inputData = uploadedText+(userInput ? "\n\nAdditional context:\n"+userInput : "");
    if (workingMode==="photo") inputData = "PHOTO CAPTURE DATA:\n"+photoNotes.filter(Boolean).join("\n---\n")+(userInput ? "\n\nAdditional notes:\n"+userInput : "");
    if (!inputData.trim()) { showToast("Please provide input data", "warning"); return; }
    setRunning(true);
    const ind = INDUSTRY_TEMPLATES[industry];
    const ctx: AgentContext = {
      company: co, compData, industry, industryHint: ind?.hint,
      userInput: inputData, extractedData: workingMode==="upload" ? uploadedText : undefined,
      uploadedFileName, workingMode, preferences: preferences[agent.id],
    };
    try {
      let mainReport = "";
      let excelSchema: ExcelSchema|undefined;
      let automationGuide: string|undefined;
      let emailDraft: string|undefined;
      let agentActionItems: ActionItem[]|undefined;

      if (workingMode==="guide" && agent.guidePrompt) {
        automationGuide = await callAgent(agent.guidePrompt(ctx), inputData, ask);
        mainReport = `## Automation Guide Generated\n\nSee the **Automation Guide** tab for step-by-step instructions, formulas, DAX measures and flow designs.\n\n${automationGuide.slice(0,400)}...`;
      } else {
        mainReport = await callAgent(agent.systemPrompt(ctx), inputData, ask);
      }

      if (agent.excelPrompt && workingMode!=="guide") {
        try {
          const raw = await callAgent(agent.excelPrompt(ctx), inputData, ask);
          const parsed = parseJSON<{sheets:ExcelSheet[]}>(raw, {sheets:[]});
          if (parsed.sheets?.length) excelSchema = parsed;
        } catch {}
      }

      if (agent.emailPrompt && workingMode!=="guide") {
        try { emailDraft = await callAgent(agent.emailPrompt(ctx), inputData, ask); } catch {}
      }

      // Extract action items from tables in main report
      try {
        const actionLines = mainReport.split("\n").filter(l=>/\|\s*\w+\s*\|.*\|\s*(High|Medium|Low)/i.test(l));
        if (actionLines.length) {
          agentActionItems = actionLines.slice(0,5).map(l=>{
            const parts = l.split("|").map(p=>p.trim()).filter(Boolean);
            return { title:parts[0]||"Action", owner:parts[1]||"TBD", priority:(parts[2]||"Medium") as "High"|"Medium"|"Low", dueDate:parts[3]||"TBD", status:"Open" as const };
          });
        }
      } catch {}

      // ── MEDIA GENERATION ───────────────────────────────────────────────────
      let generatedImageUrl: string|undefined;
      let generatedVideoUrl: string|undefined;
      const rLow = mainReport.toLowerCase();
      if (askImage && (rLow.includes("[generate image:") || agent.exportFormats?.includes("image"))) {
        try {
          const m = mainReport.match(/\[generate image:\s*([^\]]{10,500})\]/i);
          const p = m ? m[1] : agent.name+" for "+co.name+". "+mainReport.slice(0,300);
          generatedImageUrl = await askImage(p,"landscape_4_3");
          if (generatedImageUrl) mainReport = mainReport.replace(/\[generate image:[^\]]*\]/gi,"")
            +`\n\n---\n**✅ Image Generated**\n\n🖼️ [View Image](${generatedImageUrl})\n\n![${agent.name}](${generatedImageUrl})`;
        } catch(e:any){ mainReport+=`\n\n*Image generation failed: ${(e.message||"").slice(0,80)}*`; }
      }
      if (askVideo && (rLow.includes("[generate video:") || agent.exportFormats?.includes("video"))) {
        try {
          const m = mainReport.match(/\[generate video:\s*([^\]]{10,500})\]/i);
          const p = m ? m[1] : agent.name+" for "+co.name+". "+mainReport.slice(0,300);
          generatedVideoUrl = await askVideo(p,5);
          if (generatedVideoUrl) mainReport = mainReport.replace(/\[generate video:[^\]]*\]/gi,"")
            +`\n\n---\n**✅ Video Generated**\n\n🎬 [Download Video](${generatedVideoUrl})`;
        } catch(e:any){ mainReport+=`\n\n*Video generation failed: ${(e.message||"").slice(0,80)}*`; }
      }
      const parsed = parseEvidence(mainReport);
      const run: AgentRun = {
        id: Date.now().toString(36), agentId:agent.id, agentName:agent.name,
        input: inputData.slice(0,300), mode: workingMode,
        output: { mainReport, excelSchema, automationGuide, emailDraft, actionItems:agentActionItems,
                  generatedImageUrl, generatedVideoUrl, ...parsed },
        ts: new Date().toISOString(), industry,
      };
      saveRecord({ feature:"AI Agents — "+agent.name, featureIcon:agent.icon, provider:defP, model:defP, inputTokens:estimateTokens(inputData), outputTokens:estimateTokens(mainReport), costUsd:estimateCost(defP,estimateTokens(inputData),estimateTokens(mainReport)) });
      saveHistory([run, ...historyRef.current]);
      setResult(run); setEditedOutput(mainReport); setActiveTab("output"); setView("result");
    } catch (e:any) {
      showToast("Agent failed: "+(e.message||"Unknown error"), "error");
    } finally { setRunning(false); }
  }, [userInput, workingMode, uploadedText, photoNotes, uploadedFileName, industry, co, compData, ask, askImage, askVideo, defP, preferences, showToast, saveHistory]);

  // ─── ORCHESTRATOR ─────────────────────────────────────────────────────────
  const runOrchestrator = useCallback(async (input: string) => {
    if (!input.trim()) { showToast("Describe your business request", "warning"); return; }
    setOrchestrating(true); setOrchestrateResult([]);
    try {
      const planSys = `You are an AI Agent Orchestrator. Given a business request, select which agents should run.\n`+
        `AVAILABLE: ${AGENT_REGISTRY.filter(a=>!a.comingSoon).map(a=>a.id+": "+a.name).join(", ")}\n\n`+
        `Output ONLY a JSON array of agent IDs (max 4, most relevant first). No other text.`;
      const planRaw = await callAgent(planSys, input, ask);
      let agentIds = parseJSON<string[]>(planRaw, ["business_analyst"]);
      if (!Array.isArray(agentIds)||!agentIds.length) agentIds = ["business_analyst"];
      const runs: AgentRun[] = [];
      for (const agentId of agentIds.slice(0,4)) {
        const agent = AGENT_REGISTRY.find(a=>a.id===agentId&&!a.comingSoon);
        if (!agent) continue;
        const ctx: AgentContext = { company:co, compData, userInput:input, workingMode:"text" };
        const mainReport = await callAgent(agent.systemPrompt(ctx), input, ask);
        const parsed = parseEvidence(mainReport);
        runs.push({ id:Date.now().toString(36)+agentId, agentId:agent.id, agentName:agent.name, input:input.slice(0,300), mode:"text", output:{mainReport,...parsed}, ts:new Date().toISOString() });
        saveRecord({ feature:"Orchestrator — "+agent.name, featureIcon:"🎯", provider:defP, model:defP, inputTokens:estimateTokens(input), outputTokens:estimateTokens(mainReport), costUsd:estimateCost(defP,estimateTokens(input),estimateTokens(mainReport)) });
      }
      setOrchestrateResult(runs);
      saveHistory([...runs, ...historyRef.current]);
      showToast(`✅ Orchestrator complete — ${runs.length} agents executed`, "success");
    } catch (e:any) {
      showToast("Orchestrator failed: "+(e.message||""), "error");
    } finally { setOrchestrating(false); }
  }, [co, compData, ask, defP, showToast, saveHistory]);

  // ─── BOARDROOM ────────────────────────────────────────────────────────────
  const sendToBoardroom = useCallback((run: AgentRun) => {
    const session = { id:Date.now().toString(36), q:`Debate findings from ${run.agentName}: ${run.output.mainReport.slice(0,200)}`, res:run.output.mainReport.slice(0,2000), researchBrief:"", format:"threaded", stages:[], ts:new Date().toISOString() };
    const updated = [session,...brSessions].slice(0,50);
    setBrSessions(updated); sv("cos-br",updated);
    showToast("Sent to AI Boardroom — open Nerve Center to debate","success");
  }, [brSessions, setBrSessions, sv, showToast]);

  // ─── ACTION TRACKER ───────────────────────────────────────────────────────
  const addToActionTracker = useCallback((items: ActionItem[]) => {
    const newItems = items.map(item=>({
      id:Date.now().toString(36)+Math.random().toString(36).slice(2),
      title:item.title, owner:item.owner, priority:item.priority,
      dueDate:item.dueDate, status:"Open", createdAt:new Date().toISOString(), source:"AI Agents",
    }));
    const updated = [...newItems,...actionItems].slice(0,200);
    setActionItems(updated); sv("cos-actions",updated);
    showToast(`✅ ${newItems.length} actions added to Action Tracker`,"success");
  }, [actionItems, setActionItems, sv, showToast]);

  // ─── EXPORT ───────────────────────────────────────────────────────────────
  const exportResult = useCallback(async (run: AgentRun, format: string) => {
    const agent = AGENT_REGISTRY.find(a=>a.id===run.agentId);
    const nm = run.agentName.replace(/\s+/g,"-");
    const content = editedOutput || run.output.mainReport;

    if (format==="xlsx") {
      // Prefer BusinessExecutionEngine for CFO-grade workbook
      const _beEng = new BusinessExecutionEngine(
        async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>ask(sys,msgs,maxT,false,tt||"excel_advanced"),
        ensureXLSX, ensurePptx, ensureJsPDF, dlFile, stripMd,
      );
      const _coCtx = [co?.name, co?.industry, co?.stage, co?.location].filter(Boolean).join(" | ");
      await buildExcelWorkbook(
        run.output.excelSchema || { sheets: [] },
        ensureXLSX, run.agentName, _beEng,
        run.input.slice(0,200),
        _coCtx,
        content,
      );
      return;
    }
    if (format==="md") { dlFile(nm+".md",content,"text/plain"); return; }
    if (format==="docx") {
      // Use BusinessExecutionEngine for publication-quality DOCX
      try {
        const _beEng = new BusinessExecutionEngine(
          async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>ask(sys,msgs,maxT,false,tt||"general"),
          ensureXLSX, ensurePptx, ensureJsPDF, dlFile, stripMd,
        );
        const _coCtx = [co?.name, co?.industry, co?.stage, co?.location].filter(Boolean).join(" | ");
        const _del: any = {
          type:"docx", title: run.agentName, purpose: run.input.slice(0,200),
          audience:"client", qualityStandard:"client_deliverable", priority:"primary",
        };
        const _plan: any = {
          objectiveRestated: run.input.slice(0,200),
          domain:"general", persona:"Senior Consultant",
          audience:"client", qualityStandard:"client_deliverable",
          decisionContext: run.input.slice(0,200),
          deliverables:[_del], missingInfo:[], executionOrder:[run.agentName], validationCriteria:[],
        };
        await _beEng.generateDocx(_plan, _del, _coCtx, content, ()=>{});
        return;
      } catch {}
      // Fallback: basic DOCX
      const secs = parseSections(content);
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>@page{mso-page-orientation:portrait;margin:2.54cm;}body{font-family:Calibri,sans-serif;font-size:11pt;text-align:left;}h1{font-size:20pt;color:#14B8A6;border-bottom:2pt solid #14B8A6;padding-bottom:4pt;}h2{font-size:14pt;color:#0D6EFD;margin-top:14pt;}h3{font-size:12pt;color:#333;}p{line-height:1.5;margin:4pt 0;text-align:left;}table{border-collapse:collapse;width:100%;margin:8pt 0;}th{background:#14B8A6;color:#fff;padding:5pt 8pt;text-align:left;}td{padding:4pt 8pt;border-bottom:1pt solid #e2e2e2;}tr:nth-child(even) td{background:#f6f8fb;}</style></head><body><h1>${run.agentName}</h1><p><em>${co?.name||""} · ${new Date(run.ts).toLocaleDateString()} · Confidence: ${run.output.confidence}%</em></p>`;
      for (const sec of secs) {
        html += `<h2>${sec.title}</h2>`;
        const tableLines = sec.lines.filter(l=>l.includes("|")&&l.trim().startsWith("|"));
        if (tableLines.length>=2) {
          const headers = tableLines[0].split("|").filter((_:any,i:number,a:any[])=>i>0&&i<a.length-1).map((c:string)=>c.trim());
          const dataRows = tableLines.filter((l:string)=>!l.match(/^[\s|:-]+$/)).slice(1);
          html += `<table><thead><tr>${headers.map((h:string)=>`<th>${h}</th>`).join("")}</tr></thead><tbody>`;
          dataRows.forEach((r:string)=>{ const cells=r.split("|").filter((_:any,i:number,a:any[])=>i>0&&i<a.length-1).map((c:string)=>c.trim()); html+=`<tr>${cells.map((c:string)=>`<td>${c}</td>`).join("")}</tr>`; });
          html += `</tbody></table>`;
        } else { sec.lines.forEach(ln=>{ const t=stripMd(ln).trim(); if(t)html+=`<p>${t}</p>`; }); }
      }
      if (run.output.automationGuide) html += `<h2>Automation Guide</h2><pre style="font-size:9pt;background:#f5f5f5;padding:8pt;">${run.output.automationGuide.slice(0,3000)}</pre>`;
      html += "</body></html>";
      dlFile(nm+".doc",html,"application/msword"); return;
    }
    if (format==="pdf") {
      // Publication engine first (cover, TOC, branded wrapped tables) — same
      // pattern already used successfully for xlsx and docx exports above.
      try {
        const _beEng = new BusinessExecutionEngine(
          async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>ask(sys,msgs,maxT,false,tt||"general"),
          ensureXLSX, ensurePptx, ensureJsPDF, dlFile, stripMd,
        );
        const _coCtx = [co?.name, co?.industry, co?.stage, co?.location].filter(Boolean).join(" | ");
        const _del: any = {
          type:"pdf", title: run.agentName, purpose: run.input.slice(0,200),
          audience:"client", qualityStandard:"client_deliverable", priority:"primary",
        };
        const _plan: any = {
          objectiveRestated: run.input.slice(0,200),
          domain:"general", persona:"Senior Consultant",
          audience:"client", qualityStandard:"client_deliverable",
          decisionContext: run.input.slice(0,200),
          deliverables:[_del], missingInfo:[], executionOrder:[run.agentName], validationCriteria:[],
        };
        await _beEng.generatePDF(_plan, _del, _coCtx, content, ()=>{});
        return;
      } catch {}
      // Fallback: basic PDF
      try {
        const jsPDF = await ensureJsPDF();
        const doc = new jsPDF({unit:"pt",format:"a4"});
        const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=48;
        const agColor = agent?.color||"#14B8A6";
        const r=parseInt(agColor.slice(1,3),16), g=parseInt(agColor.slice(3,5),16), b=parseInt(agColor.slice(5,7),16);
        let y=M;
        doc.setFillColor(r,g,b); doc.rect(0,0,W,80,"F");
        doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(16);
        doc.text(run.agentName,M,40,{maxWidth:W-2*M});
        doc.setFontSize(9); doc.setFont("helvetica","normal");
        doc.text((co?.name||"")+" · "+new Date(run.ts).toLocaleDateString()+" · Confidence: "+run.output.confidence+"% · "+( agent?.timeSaved||""),M,62);
        y=100;
        parseSections(content).forEach(sec=>{
          if(y>H-M){doc.addPage();y=M;}
          doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(r,g,b);
          doc.splitTextToSize(sec.title,W-2*M).forEach((l:string)=>{if(y>H-M){doc.addPage();y=M;}doc.text(l,M,y);y+=15;});
          doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(45,45,45);
          const tableLines=sec.lines.filter(l=>l.includes("|")&&l.trim().startsWith("|"));
          if(tableLines.length>=2){
            const headers=tableLines[0].split("|").filter((_:any,i:number,a:any[])=>i>0&&i<a.length-1).map((c:string)=>c.trim());
            const dataRows=tableLines.filter((l:string)=>!l.match(/^[\s|:-]+$/)).slice(1);
            const colW=Math.floor((W-2*M)/Math.max(headers.length,1));
            if(y+16>H-M){doc.addPage();y=M;}
            doc.setFillColor(r,g,b); doc.rect(M,y,W-2*M,16,"F");
            doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont("helvetica","bold");
            headers.forEach((h:string,ci:number)=>doc.text(h.slice(0,18),M+ci*colW+3,y+11));
            y+=18; doc.setTextColor(45,45,45); doc.setFont("helvetica","normal");
            dataRows.slice(0,15).forEach((row:string,ri:number)=>{
              if(y>H-M){doc.addPage();y=M;}
              if(ri%2===1){doc.setFillColor(246,248,251);doc.rect(M,y,W-2*M,14,"F");}
              const cells=row.split("|").filter((_:any,i:number,a:any[])=>i>0&&i<a.length-1).map((c:string)=>c.trim());
              doc.setTextColor(45,45,45);
              cells.forEach((c:string,ci:number)=>doc.text(c.slice(0,22),M+ci*colW+3,y+10));
              y+=14;
            });
            y+=6;
          } else {
            sec.lines.forEach(ln=>{
              const t=stripMd(ln); if(!t.trim())return;
              if(y>H-M){doc.addPage();y=M;}
              doc.splitTextToSize(t,W-2*M).forEach((w:string)=>{if(y>H-M){doc.addPage();y=M;}doc.text(w,M,y);y+=13;});
            });
          }
          y+=6;
        });
        const pg=doc.internal.getNumberOfPages();
        for(let p=1;p<=pg;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text("Page "+p+" of "+pg+" · "+run.agentName+" · OrchestrIQ",M,H-18);}
        doc.save(nm+".pdf");
      } catch(e:any){ showToast("PDF failed: "+e.message,"error"); }
      return;
    }
    dlFile(nm+"."+(format||"txt"),content,"text/plain");
  }, [editedOutput, co, dlFile, ensureJsPDF, ensureXLSX, parseSections, stripMd, showToast]);

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const S = {
    page:  { flex:1, overflowY:"auto" as const, background:"#070C18", fontFamily:"'Inter',-apple-system,sans-serif", color:"#F0F4FF" },
    hdr:   { padding:"16px 24px 12px", borderBottom:"1px solid #1C2A40", marginBottom:14 },
    card:  { background:"#0F1829", border:"1px solid #1C2A40", borderRadius:8, padding:"14px 16px", marginBottom:10 },
    inp:   { width:"100%", background:"#141F33", border:"1px solid #1C2A40", borderRadius:6, padding:"9px 12px", color:"#F0F4FF", fontSize:12, fontFamily:"inherit", boxSizing:"border-box" as const, outline:"none" },
    btn:   { background:"linear-gradient(135deg,#14B8A6,#6366F1)", border:"none", borderRadius:6, padding:"10px 18px", color:"#fff", fontSize:12, fontWeight:700 as const, cursor:"pointer" as const, fontFamily:"inherit" },
    hBtn:  { background:"none", border:"1px solid #1C2A40", borderRadius:5, padding:"5px 12px", color:"#8FA8CC", fontSize:11, cursor:"pointer" as const, fontFamily:"inherit" },
    modeBtn:(active:boolean,c:string)=>({ padding:"8px 14px", borderRadius:7, border:"1px solid "+(active?c:"#1C2A40"), background:active?c+"18":"transparent", color:active?c:"#4D6A8A", cursor:"pointer" as const, fontFamily:"inherit", fontSize:11, fontWeight:(active?700:400) as any }),
    badge: (c:string)=>({ fontSize:8, padding:"2px 7px", borderRadius:10, background:c+"22", color:c, fontWeight:700 as const }),
    tab:   (active:boolean)=>({ padding:"5px 14px", borderRadius:6, fontSize:10, fontWeight:600 as const, border:"1px solid "+(active?"#14B8A6":"#1C2A40"), background:active?"rgba(20,184,166,0.1)":"transparent", color:active?"#14B8A6":"#4D6A8A", cursor:"pointer" as const, fontFamily:"inherit" }),
  };

  const filteredAgents = AGENT_REGISTRY.filter(a=>
    (filterCat==="all"||a.category===filterCat)&&
    (!searchQ||(a.name+" "+a.description).toLowerCase().includes(searchQ.toLowerCase()))
  );

  // ─── LANDING ──────────────────────────────────────────────────────────────
  if (view==="landing") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:"#F0F4FF",marginBottom:2}}>🤖 AI Agents</div>
            <div style={{fontSize:11,color:"#4D6A8A"}}>Your digital workforce · real time savings · enterprise-grade outputs</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setView("orchestrate")} style={{...S.hBtn,color:"#A855F7",borderColor:"#A855F744"}}>🎯 Orchestrate</button>
            <button onClick={()=>{try{const h=(WorkspaceMemory.get<any[]>("oiq-agent-history")||[]);setHistory(h);}catch{}setView("history");}} style={S.hBtn}>History</button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap" as const}}>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search agents..." style={{...S.inp,width:180,padding:"5px 10px",fontSize:11}}/>
          <button onClick={()=>setFilterCat("all")} style={{...S.tab(filterCat==="all"),padding:"5px 12px"}}>All</button>
          {CATEGORIES.map(c=>(
            <button key={c.id} onClick={()=>setFilterCat(c.id)} style={{...S.tab(filterCat===c.id),padding:"5px 10px"}}>{c.icon} {c.id.split(" ")[0]}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"0 24px 24px"}}>
        {(filterCat==="all"?CATEGORIES:CATEGORIES.filter(c=>c.id===filterCat)).map(cat=>{
          const agents = filteredAgents.filter(a=>a.category===cat.id);
          if(!agents.length) return null;
          return (
            <div key={cat.id} style={{marginBottom:22}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:16}}>{cat.icon}</span>
                <div style={{fontSize:13,fontWeight:800,color:"#F0F4FF"}}>{cat.id}</div>
                <div style={{height:1,flex:1,background:"#1C2A40"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                {agents.map(agent=>(
                  <div key={agent.id}
                    onClick={()=>{if(!agent.comingSoon){setActiveAgent(agent);setUserInput("");setUploadedText("");setUploadedFileName("");setPhotoNotes([""]);setWorkingMode("text");setView("run");}}}
                    style={{background:"#0F1829",border:"1px solid "+(agent.flagship?agent.color+"44":"#1C2A40"),borderRadius:8,padding:"12px 14px",cursor:agent.comingSoon?"default":"pointer",opacity:agent.comingSoon?0.5:1,position:"relative" as const}}>
                    {agent.flagship&&<div style={{position:"absolute",top:8,right:8,...S.badge("#14B8A6")}}>FLAGSHIP</div>}
                    {agent.comingSoon&&<div style={{position:"absolute",top:8,right:8,...S.badge("#5A6480")}}>SOON</div>}
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>{agent.icon}</span>
                      <div style={{fontSize:11,fontWeight:700,color:"#F0F4FF",flex:1}}>{agent.name}</div>
                    </div>
                    <div style={{fontSize:10,color:"#4D6A8A",lineHeight:1.5,marginBottom:6}}>{agent.description}</div>
                    <div style={{fontSize:9,color:"#10B981",marginBottom:6}}>⏱ Saves {agent.timeSaved}</div>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap" as const}}>
                      {agent.supportsUpload&&<span style={{...S.badge("#3B82F6"),fontSize:7}}>📎 Upload</span>}
                      {agent.supportsPhoto&&<span style={{...S.badge("#F59E0B"),fontSize:7}}>📷 Photo</span>}
                      {agent.supportsGuide&&<span style={{...S.badge("#8B5CF6"),fontSize:7}}>⚡ Auto Guide</span>}
                      {agent.exportFormats.map(f=><span key={f} style={{...S.badge(agent.color),fontSize:7}}>{f.toUpperCase()}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── RUN ──────────────────────────────────────────────────────────────────
  if (view==="run"&&activeAgent) {
    const agent = activeAgent;
    return (
      <div style={S.page}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <button onClick={()=>setView("landing")} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>← Agents</button>
            <span style={{fontSize:20}}>{agent.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#F0F4FF"}}>{agent.name}</div>
              <div style={{fontSize:10,color:"#10B981"}}>⏱ Saves {agent.timeSaved}</div>
            </div>
          </div>
          <div style={{fontSize:10,fontWeight:700,color:"#4D6A8A",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:8}}>Working Mode</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
            <button onClick={()=>setWorkingMode("text")} style={S.modeBtn(workingMode==="text","#14B8A6")}>✏️ Type / Paste</button>
            {agent.supportsUpload&&<button onClick={()=>{setWorkingMode("upload");setTimeout(()=>fileRef.current?.click(),100);}} style={S.modeBtn(workingMode==="upload","#3B82F6")}>📎 Upload File</button>}
            {agent.supportsPhoto&&<button onClick={()=>setWorkingMode("photo")} style={S.modeBtn(workingMode==="photo","#F59E0B")}>📷 Photo Capture</button>}
            {agent.supportsGuide&&<button onClick={()=>setWorkingMode("guide")} style={S.modeBtn(workingMode==="guide","#8B5CF6")}>⚡ Automation Guide</button>}
          </div>
          <input ref={fileRef} type="file" style={{display:"none"}} accept=".txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files?.[0];if(f)handleFileUpload(f);e.target.value="";}}/>
        </div>
        <div style={{padding:"0 24px 24px"}}>
          {workingMode==="upload"&&(
            <div style={{...S.card,border:"1px solid #3B82F644",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginBottom:6}}>📎 File Upload Mode</div>
              {uploadedFileName?(
                <div style={{fontSize:11,color:"#10B981"}}>✅ {uploadedFileName} loaded — {uploadedText.length.toLocaleString()} chars extracted</div>
              ):(
                <div>
                  <div style={{fontSize:11,color:"#8FA8CC",marginBottom:8}}>Accepts: Excel (.xlsx), CSV, Text (.txt/.md). For PDF/Word, paste the content as text below.</div>
                  <button onClick={()=>fileRef.current?.click()} style={{...S.btn,background:"#3B82F6",fontSize:11}}>Choose File</button>
                </div>
              )}
            </div>
          )}
          {workingMode==="photo"&&(
            <div style={{...S.card,border:"1px solid #F59E0B44",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#F59E0B",marginBottom:4}}>📷 Secure Photo Capture Mode</div>
              <div style={{fontSize:10,color:"#8FA8CC",marginBottom:10,lineHeight:1.5}}>Cannot upload files? Take photos of document sections and describe what you see. Add one description per photo.</div>
              {photoNotes.map((note,idx)=>(
                <div key={idx} style={{display:"flex",gap:6,marginBottom:6}}>
                  <span style={{fontSize:11,color:"#F59E0B",paddingTop:9,minWidth:24}}>📷{idx+1}</span>
                  <input value={note} onChange={e=>{const n=[...photoNotes];n[idx]=e.target.value;setPhotoNotes(n);}} placeholder={`Photo ${idx+1}: describe tables, numbers, headings...`} style={{...S.inp,flex:1}}/>
                  {idx>0&&<button onClick={()=>setPhotoNotes(photoNotes.filter((_,i)=>i!==idx))} style={{...S.hBtn,color:"#EF4444",padding:"5px 8px"}}>✕</button>}
                </div>
              ))}
              <button onClick={()=>setPhotoNotes([...photoNotes,""])} style={{...S.hBtn,fontSize:10,marginTop:4}}>+ Add Photo</button>
            </div>
          )}
          {workingMode==="guide"&&(
            <div style={{...S.card,border:"1px solid #8B5CF644",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8B5CF6",marginBottom:4}}>⚡ Automation Guide Mode</div>
              <div style={{fontSize:10,color:"#8FA8CC",lineHeight:1.5}}>Cannot share data externally? The AI generates step-by-step automation instructions using tools in your organisation: Excel, Power BI, Power Automate, SQL, SAP, Concur, ServiceNow, SharePoint, Teams, VBA, and more.</div>
            </div>
          )}
          <div style={S.card}>
            <label style={{fontSize:10,fontWeight:700,color:"#4D6A8A",textTransform:"uppercase" as const,letterSpacing:"0.08em",display:"block",marginBottom:5}}>Industry (optional)</label>
            <select value={industry} onChange={e=>setIndustry(e.target.value)} style={{...S.inp,marginBottom:industry?10:0}}>
              <option value="">— General —</option>
              {Object.entries(INDUSTRY_TEMPLATES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            {industry&&<div style={{fontSize:10,color:"#14B8A6",background:"rgba(20,184,166,0.06)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:5,padding:"6px 10px"}}>💡 {INDUSTRY_TEMPLATES[industry]?.hint}</div>}
          </div>
          <div style={S.card}>
            <label style={{fontSize:10,fontWeight:700,color:"#4D6A8A",textTransform:"uppercase" as const,letterSpacing:"0.08em",display:"block",marginBottom:5}}>
              {workingMode==="guide"?"What process do you want to automate?":workingMode==="upload"?"Additional context / instructions":workingMode==="photo"?"Additional notes":"Input — paste data or describe the task"}
            </label>
            <textarea value={userInput} onChange={e=>setUserInput(e.target.value)}
              placeholder={workingMode==="guide"?
                "Example: We spend 4 hours every month reconciling expense reports against Concur. We have 200 employees. We use SAP Concur, Excel and SharePoint. Tell me how to automate this completely.":
                "Paste data, describe the task, or enter your request...\nAccepts: "+agent.inputTypes.join(", ")}
              rows={workingMode==="guide"?5:8} style={{...S.inp,resize:"vertical" as const,minHeight:workingMode==="guide"?100:160}}/>
            {co?.name&&<div style={{fontSize:9,color:"#2D4460",marginTop:5}}>Context: {co.name} · {co.industry||"General"} · {co.currencySymbol||"₹"}</div>}
          </div>
          <button onClick={()=>runAgent(agent)} disabled={running||(workingMode==="text"&&!userInput.trim()&&!uploadedText)||(workingMode==="photo"&&!photoNotes.some(Boolean))} style={{...S.btn,width:"100%",opacity:running?0.5:1}}>
            {running?"⏳ Agent Running...":"▶ Run "+agent.name}
          </button>
        </div>
      </div>
    );
  }

  // ─── RESULT ───────────────────────────────────────────────────────────────
  if (view==="result"&&result) {
    const agent = AGENT_REGISTRY.find(a=>a.id===result.agentId);
    const out = result.output;
    const tabs = [
      { id:"output",  label:"📄 Report",    show:true },
      { id:"excel",   label:"📊 Workbook",  show:!!out.excelSchema?.sheets?.length },
      { id:"guide",   label:"⚡ Auto Guide", show:!!out.automationGuide },
      { id:"email",   label:"📧 Email",      show:!!out.emailDraft },
      { id:"actions", label:"✅ Actions",    show:!!(out.actionItems?.length) },
    ].filter(t=>t.show);

    return (
      <div style={S.page}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button onClick={()=>setView("run")} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>← Re-run</button>
            <button onClick={()=>setView("landing")} style={S.hBtn}>All Agents</button>
            <span style={{fontSize:18}}>{agent?.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"#F0F4FF"}}>{result.agentName}</div>
              <div style={{fontSize:9,color:"#4D6A8A"}}>{new Date(result.ts).toLocaleString()} · {result.mode} mode</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
            {[["Confidence",out.confidence+"%",out.confidence>=75?"#10B981":out.confidence>=55?"#F59E0B":"#EF4444"],
              ["Evidence",out.evidence.length+" items","#3B82F6"],
              ["Assumptions",out.assumptions.length+" items","#F59E0B"],
              ["Risks",out.risks.length+" flags","#EF4444"],
            ].map(([lb,val,c])=>(
              <div key={lb as string} style={{background:"#141F33",borderRadius:7,padding:"8px",textAlign:"center" as const}}>
                <div style={{fontSize:8,fontWeight:700,color:"#4D6A8A",textTransform:"uppercase" as const,marginBottom:2}}>{lb}</div>
                <div style={{fontSize:15,fontWeight:800,color:c as string}}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap" as const}}>
            {tabs.map(t=><button key={t.id} onClick={()=>setActiveTab(t.id as any)} style={S.tab(activeTab===t.id)}>{t.label}</button>)}
          </div>
        </div>
        <div style={{padding:"0 24px 24px"}}>
          {(out.evidence.length>0||out.assumptions.length>0||out.risks.length>0)&&(
            <div style={{...S.card,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {out.evidence.length>0&&<div><div style={{fontSize:10,fontWeight:700,color:"#3B82F6",marginBottom:4}}>✓ Evidence</div>{out.evidence.map((e,i)=><div key={i} style={{fontSize:9,color:"#8FA8CC",marginBottom:2,lineHeight:1.4}}>• {e.slice(0,70)}</div>)}</div>}
                {out.assumptions.length>0&&<div><div style={{fontSize:10,fontWeight:700,color:"#F59E0B",marginBottom:4}}>⚠ Assumptions</div>{out.assumptions.map((a,i)=><div key={i} style={{fontSize:9,color:"#8FA8CC",marginBottom:2,lineHeight:1.4}}>• {a.slice(0,70)}</div>)}</div>}
                {out.risks.length>0&&<div><div style={{fontSize:10,fontWeight:700,color:"#EF4444",marginBottom:4}}>🚨 Key Risks</div>{out.risks.map((r,i)=><div key={i} style={{fontSize:9,color:"#8FA8CC",marginBottom:2,lineHeight:1.4}}>• {r.slice(0,70)}</div>)}</div>}
              </div>
            </div>
          )}
          {activeTab==="output"&&(
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#F0F4FF"}}>Analysis Report</div>
                <button onClick={()=>{if(editedOutput!==out.mainReport)setShowPrefPrompt(true);}} style={{...S.hBtn,fontSize:9,color:"#14B8A6"}}>💡 Save Style</button>
              </div>
              <textarea value={editedOutput} onChange={e=>setEditedOutput(e.target.value)} style={{...S.inp,minHeight:360,resize:"vertical" as const,fontSize:11,lineHeight:1.6}}/>
              {showPrefPrompt&&(
                <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid #14B8A644",borderRadius:6,padding:"10px 12px",marginTop:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#14B8A6",marginBottom:6}}>💡 Save edits as style preference for future runs?</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{const p={...preferences,[result.agentId]:"Match this style: "+editedOutput.slice(0,200)};setPreferences(p);try{WorkspaceMemory.set("oiq-agent-prefs",p);}catch{}setShowPrefPrompt(false);showToast("Style preference saved","success");}} style={{...S.btn,flex:1,fontSize:10}}>Yes — Save</button>
                    <button onClick={()=>setShowPrefPrompt(false)} style={{...S.hBtn,flex:1,textAlign:"center" as const}}>No</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab==="excel"&&out.excelSchema&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#F0F4FF",marginBottom:8}}>📊 Excel Workbook — {out.excelSchema.sheets.length} sheets</div>
              <div style={{fontSize:10,color:"#4D6A8A",marginBottom:12}}>Click Download to get the fully formatted workbook with all data extracted from your input.</div>
              {out.excelSchema.sheets.map((sheet,si)=>(
                <div key={si} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#14B8A6",marginBottom:4}}>📋 {sheet.name}</div>
                  {sheet.headers.length>0&&(
                    <div style={{overflowX:"auto" as const}}>
                      <table style={{fontSize:9,borderCollapse:"collapse" as const,width:"100%"}}>
                        <thead><tr>{sheet.headers.map((h,i)=><th key={i} style={{background:"#141F33",color:"#14B8A6",padding:"4px 8px",textAlign:"left" as const,whiteSpace:"nowrap" as const,borderBottom:"1px solid #1C2A40"}}>{h}</th>)}</tr></thead>
                        <tbody>{(sheet.rows||[]).slice(0,4).map((row,ri)=><tr key={ri}>{(Array.isArray(row)?row:[]).map((c:any,ci:number)=><td key={ci} style={{padding:"3px 8px",borderBottom:"1px solid #0a0e1a",color:"#8FA8CC",whiteSpace:"nowrap" as const}}>{String(c).slice(0,22)}</td>)}</tr>)}</tbody>
                      </table>
                      {(sheet.rows||[]).length>4&&<div style={{fontSize:9,color:"#4D6A8A",marginTop:3}}>{(sheet.rows||[]).length-4} more rows in download</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {activeTab==="guide"&&out.automationGuide&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#8B5CF6",marginBottom:8}}>⚡ Automation Guide</div>
              <textarea value={out.automationGuide} readOnly style={{...S.inp,minHeight:400,resize:"vertical" as const,fontSize:11,lineHeight:1.7,fontFamily:"'Fira Code',monospace"}}/>
            </div>
          )}
          {activeTab==="email"&&out.emailDraft&&(
            <div style={S.card}>
              <div style={{fontSize:12,fontWeight:700,color:"#F0F4FF",marginBottom:8}}>📧 Draft Email</div>
              <textarea defaultValue={out.emailDraft} style={{...S.inp,minHeight:240,resize:"vertical" as const,fontSize:11,lineHeight:1.6}}/>
            </div>
          )}
          {activeTab==="actions"&&out.actionItems&&(
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:"#F0F4FF"}}>✅ Action Items</div>
                <button onClick={()=>addToActionTracker(out.actionItems!)} style={{...S.btn,fontSize:10,padding:"6px 12px"}}>+ Add to Action Tracker</button>
              </div>
              {out.actionItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",gap:8,padding:"8px 0",borderBottom:"1px solid #1C2A40",alignItems:"center"}}>
                  <span style={{...S.badge(item.priority==="High"?"#EF4444":item.priority==="Medium"?"#F59E0B":"#10B981"),flexShrink:0}}>{item.priority}</span>
                  <div style={{flex:1,fontSize:11,color:"#F0F4FF"}}>{item.title}</div>
                  <div style={{fontSize:10,color:"#4D6A8A",minWidth:80}}>{item.owner}</div>
                  <div style={{fontSize:10,color:"#4D6A8A",minWidth:60}}>{item.dueDate}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,marginTop:8}}>
            {(agent?.exportFormats||["md"]).map(fmt=>(
              <button key={fmt} onClick={()=>exportResult(result,fmt)} style={{...S.hBtn,color:agent?.color||"#14B8A6",borderColor:(agent?.color||"#14B8A6")+"44"}}>↓ {fmt.toUpperCase()}</button>
            ))}
            {["business_analyst","monthly_review","exec_assistant"].includes(result.agentId)&&(
              <button onClick={()=>sendToBoardroom(result)} style={{...S.hBtn,color:"#8B5CF6",borderColor:"#8B5CF644"}}>🏛 Boardroom</button>
            )}
            <button onClick={()=>navigator.clipboard.writeText(editedOutput)} style={S.hBtn}>📋 Copy</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── ORCHESTRATE ──────────────────────────────────────────────────────────
  if (view==="orchestrate") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setView("landing")} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>← Agents</button>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#F0F4FF"}}>🎯 AI Agent Orchestrator</div>
            <div style={{fontSize:10,color:"#4D6A8A"}}>Describe your need · system selects and runs the right agents automatically</div>
          </div>
        </div>
      </div>
      <div style={{padding:"0 24px 24px"}}>
        <div style={S.card}>
          <div style={{fontSize:11,color:"#4D6A8A",marginBottom:12,lineHeight:1.7}}>Describe what work you need done. The Orchestrator automatically selects the right combination of agents, runs them in sequence, and combines their outputs.</div>
          <textarea value={orchestrateInput} onChange={e=>setOrchestrateInput(e.target.value)}
            placeholder={"Examples:\n• Analyse our Q3 financial performance and prepare a boardroom brief with recommendations\n• Review this month's expense claims for policy violations and generate an audit report\n• Help me build a complete marketing campaign for our product launch"}
            rows={6} style={{...S.inp,minHeight:120}}/>
          <button onClick={()=>runOrchestrator(orchestrateInput)} disabled={orchestrating||!orchestrateInput.trim()} style={{...S.btn,width:"100%",marginTop:12,opacity:orchestrating||!orchestrateInput.trim()?0.5:1}}>
            {orchestrating?"⏳ Orchestrating agents...":"🎯 Run Agent Orchestrator"}
          </button>
        </div>
        {orchestrateResult.map(run=>{
          const agent = AGENT_REGISTRY.find(a=>a.id===run.agentId);
          return (
            <div key={run.id} style={{...S.card,border:"1px solid "+(agent?.color||"#14B8A6")+"44"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:16}}>{agent?.icon}</span>
                <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:"#F0F4FF"}}>{run.agentName}</div><div style={{fontSize:9,color:"#4D6A8A"}}>Confidence: {run.output.confidence}%</div></div>
                <button onClick={()=>{setResult(run);setEditedOutput(run.output.mainReport);setActiveTab("output");setView("result");}} style={{...S.hBtn,fontSize:9,color:"#14B8A6"}}>View Full</button>
              </div>
              <div style={{fontSize:10,color:"#8FA8CC",lineHeight:1.5,maxHeight:100,overflow:"hidden"}}>{run.output.mainReport.slice(0,350)}...</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── HISTORY ──────────────────────────────────────────────────────────────
  if (view==="history") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setView("landing")} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>← Agents</button>
          <div style={{fontSize:14,fontWeight:800,color:"#F0F4FF"}}>Agent History ({history.length})</div>
          <button onClick={()=>{if(confirm("Clear all history?"))saveHistory([]);}} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433",marginLeft:"auto"}}>Clear</button>
        </div>
      </div>
      <div style={{padding:"0 24px 24px"}}>
        {history.length===0?(
          <div style={{...S.card,textAlign:"center" as const,padding:40,color:"#4D6A8A"}}>No runs yet. Run an agent to see history here.</div>
        ):history.map(run=>{
          const agent = AGENT_REGISTRY.find(a=>a.id===run.agentId);
          return (
            <div key={run.id} style={S.card}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontSize:16}}>{agent?.icon||"🤖"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#F0F4FF"}}>{run.agentName}</div>
                  <div style={{fontSize:9,color:"#4D6A8A"}}>{new Date(run.ts).toLocaleString()} · {run.mode} mode · Confidence: {run.output.confidence}%</div>
                </div>
                <button onClick={()=>{setResult(run);setEditedOutput(run.output.mainReport);setActiveTab("output");setView("result");}} style={{...S.hBtn,fontSize:9,color:"#14B8A6"}}>Open</button>
              </div>
              <div style={{fontSize:10,color:"#4D6A8A"}}>{run.input.slice(0,80)}...</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return null;
}
