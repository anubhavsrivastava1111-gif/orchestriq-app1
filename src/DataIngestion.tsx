import React, { useState, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// DATA INGESTION ENGINE — Universal Smart Import for Pulse Modules

// ─── DIRECT CLAUDE API CALL (vision + text) ──────────────────────────────
// Uses EFF_CLAUDE env var — same key used by the rest of the app
// Self-contained so it works regardless of how callAI prop is wired
async function callClaudeDirectly(
  prompt: string,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const key = (import.meta as any).env?.EFF_CLAUDE || (window as any).__EFF_CLAUDE || "";
  if (!key) throw new Error("API key not found. Go to Settings and ensure your API key is saved.");

  const userContent: any[] = [];
  if (imageBase64 && imageMime) {
    if (imageMime === "application/pdf") {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: imageBase64 },
      });
    } else {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: imageMime, data: imageBase64 },
      });
    }
  }
  userContent.push({ type: "text", text: prompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Claude API error: " + errText.slice(0, 300));
  }
  const data = await res.json();
  return (data.content || []).map((b: any) => b.text || "").join("");
}
// Supports: Camera | Screenshot | PDF | Excel/CSV | Word (.docx)
// Pipeline: File → AI Vision/Text Extraction → Staging Review → Confirm Load
// ═══════════════════════════════════════════════════════════════════════════

// ─── PALETTE (matches Pulse.tsx) ────────────────────────────────────────────
const C = {
  bg:"#0B1120",card:"#111827",card2:"#0D1829",
  border:"#1E2D3D",
  accent:"#14B8A6",accentDim:"rgba(20,184,166,0.10)",accentText:"#5EEAD4",
  blue:"#3B82F6",blueDim:"rgba(59,130,246,0.10)",
  purple:"#8B5CF6",purpleDim:"rgba(139,92,246,0.10)",
  warn:"#F59E0B",warnDim:"rgba(245,158,11,0.10)",
  danger:"#EF4444",dangerDim:"rgba(239,68,68,0.10)",
  success:"#10B981",successDim:"rgba(16,185,129,0.10)",
  text:"#E8EFF8",textMid:"#94A3B8",textDim:"#4D6A8A",
};

// ─── MODULE SCHEMAS ──────────────────────────────────────────────────────────
// Each module defines the exact columns Claude must extract into

export const SCHEMAS = {
  concur: {
    label: "Concur T&E Audit",
    color: C.purple,
    columns: [
      { key: "date", label: "Date", type: "date", required: true, hint: "Audit date or report date" },
      { key: "freshInflow", label: "Fresh Inflow", type: "number", required: true, hint: "New reports received today" },
      { key: "resubmitted", label: "Resubmitted", type: "number", required: false, hint: "Reports resubmitted after rejection" },
      { key: "processed", label: "Processed", type: "number", required: true, hint: "Total reports audited/processed" },
      { key: "pendingOpsTeam", label: "Pending Ops Team", type: "number", required: false, hint: "Items awaiting Operations Team action" },
      { key: "pendingBusiness", label: "Pending Business", type: "number", required: false, hint: "Items awaiting client/business action" },
      { key: "tatPct", label: "TAT %", type: "percent", required: false, hint: "Turnaround time within 2 days, e.g. 98.5" },
      { key: "ukAccuracy", label: "UK Accuracy %", type: "percent", required: false, hint: "UK team audit accuracy percentage" },
      { key: "teamAccuracy", label: "Team Accuracy %", type: "percent", required: false, hint: "Operations Team audit accuracy percentage" },
      { key: "aging0_2", label: "Aging 0-2d", type: "number", required: false, hint: "Reports aged 0-2 days" },
      { key: "aging3_5", label: "Aging 3-5d", type: "number", required: false, hint: "Reports aged 3-5 days" },
      { key: "aging6_15", label: "Aging 6-15d", type: "number", required: false, hint: "Reports aged 6-15 days" },
      { key: "agingOver15", label: "Aging >15d", type: "number", required: false, hint: "Reports aged over 15 days — critical" },
      { key: "rejectionVol", label: "Rejections", type: "number", required: false, hint: "Number of expense reports rejected" },
    ],
  },
  email: {
    label: "Email Helpdesk",
    color: C.warn,
    columns: [
      { key: "date", label: "Date", type: "date", required: true, hint: "Date of helpdesk activity" },
      { key: "received", label: "Received", type: "number", required: true, hint: "Total emails/queries received" },
      { key: "resolved", label: "Resolved", type: "number", required: true, hint: "Queries resolved within SLA" },
      { key: "pendingOpsTeam", label: "Pending Ops Team", type: "number", required: false, hint: "Emails awaiting Operations Team response" },
      { key: "pendingClient", label: "Pending Client", type: "number", required: false, hint: "Emails awaiting client response" },
      { key: "carryForward", label: "Carry Forward", type: "number", required: false, hint: "Unresolved emails carried to next day" },
    ],
  },
  servicenow: {
    label: "ServiceNow Tickets",
    color: C.blue,
    columns: [
      { key: "ticketNo", label: "Ticket #", type: "text", required: true, hint: "ServiceNow ticket number e.g. INC0012345" },
      { key: "date", label: "Created Date", type: "date", required: true, hint: "Date ticket was created/opened" },
      { key: "priority", label: "Priority", type: "text", required: true, hint: "Critical / High / Medium / Low" },
      { key: "category", label: "Category", type: "text", required: false, hint: "Ticket category or type" },
      { key: "status", label: "Status", type: "text", required: true, hint: "Open / In Progress / Pending / Resolved / Closed" },
      { key: "assignedTo", label: "Assigned To", type: "text", required: false, hint: "Name of person assigned" },
      { key: "team", label: "Team", type: "text", required: false, hint: "Team or group handling the ticket" },
      { key: "firstResponse", label: "First Response", type: "date", required: false, hint: "Date of first response to ticket" },
    ],
  },
} as const;

export type ModuleKey = keyof typeof SCHEMAS;

// ─── CONFIDENCE LEVELS ────────────────────────────────────────────────────────
type Confidence = "high" | "medium" | "low" | "missing";

interface ExtractedCell {
  value: string;
  confidence: Confidence;
  rawSource?: string; // what AI saw before normalization
}

interface ExtractedRow {
  cells: Record<string, ExtractedCell>;
  rowIndex: number;
}

interface ExtractionResult {
  rows: ExtractedRow[];
  sourceDescription: string;
  warnings: string[];
  totalRowsFound: number;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });

const normalizeDate = (raw: string): string => {
  if (!raw) return "";
  // Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY
  const cleaned = raw.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? "20" + y : y;
    return `${year}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  // Try JS Date parse as fallback
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return cleaned; // return as-is if cannot parse
};

const normalizePercent = (raw: string): string => {
  if (!raw) return "";
  const n = parseFloat(raw.replace("%", "").trim());
  if (isNaN(n)) return "";
  // If it's >1 and <=100 it's already a percentage value, store as decimal
  // We store as decimal in the module (0.98 = 98%) but display as value entry
  // In ingestion we return the raw percent number for user review
  return n > 1 ? n.toFixed(2) : (n * 100).toFixed(2);
};

const confidenceColor = (c: Confidence) =>
  c === "high" ? C.success : c === "medium" ? C.warn : c === "low" ? C.orange : C.danger;

const confidenceLabel = (c: Confidence) =>
  c === "high" ? "✓" : c === "medium" ? "~" : c === "low" ? "?" : "✗";

// ─── PROMPT BUILDERS ──────────────────────────────────────────────────────────
const buildExtractionPrompt = (moduleKey: ModuleKey, sourceType: string, textContent?: string): string => {
  const schema = SCHEMAS[moduleKey];
  const columnDefs = schema.columns.map(col =>
    `  - "${col.key}": ${col.label} (${col.type}${col.required ? ", REQUIRED" : ""}) — ${col.hint}`
  ).join("\n");

  const jsonExample = schema.columns.reduce((acc, col) => {
    acc[col.key] = col.type === "number" ? 0 : col.type === "percent" ? "98.50" : col.type === "date" ? "2024-06-15" : "value";
    return acc;
  }, {} as Record<string, string | number>);

  return `You are a data extraction AI specialized in operations and governance data for ${schema.label}.

${textContent ? `SOURCE CONTENT (${sourceType}):\n${textContent.slice(0, 8000)}\n` : `You are analyzing an image/screenshot/photo of a ${sourceType} containing ${schema.label} data.`}

YOUR TASK: Extract ALL data rows you can identify and return them as a strict JSON array.

COLUMNS TO EXTRACT (extract ONLY these fields):
${columnDefs}

RULES:
1. Extract EVERY row of data you can identify — even partial rows
2. For each cell, estimate confidence: "high" (clearly visible), "medium" (inferred/partially visible), "low" (guessed), "missing" (not found)
3. Dates: normalize to YYYY-MM-DD format
4. Percentages: return as the numeric value only (e.g., "98.5" not "98.5%")
5. Numbers: return as plain numbers, remove commas
6. For ServiceNow priority: normalize to exactly "Critical", "High", "Medium", or "Low"
7. For ServiceNow status: normalize to "Open", "Assigned", "In Progress", "Pending", "Resolved", or "Closed"
8. If a field is not visible or not applicable, use "" with confidence "missing"
9. Extract multiple rows if multiple data rows are visible

RETURN FORMAT — respond with ONLY this JSON, no other text:
{
  "rows": [
    {
      "cells": {
        ${schema.columns.map(col => `"${col.key}": {"value": "...", "confidence": "high|medium|low|missing", "rawSource": "exact text seen"}`).join(",\n        ")}
      }
    }
  ],
  "sourceDescription": "brief description of what was in the image/document",
  "warnings": ["any issues or ambiguities found"],
  "totalRowsFound": 1
}`;
};

// ─── MAIN INGESTION COMPONENT ─────────────────────────────────────────────────
interface DataIngestionProps {
  moduleKey: ModuleKey;
  onConfirm: (rows: Record<string, string>[]) => void;
  onClose: () => void;
  callAI?: (prompt: string, imageBase64?: string, imageMime?: string) => Promise<string>;
}

type Stage = "input" | "processing" | "review" | "done";

export default function DataIngestion({ moduleKey, onConfirm, onClose, callAI }: DataIngestionProps) {
  const schema = SCHEMAS[moduleKey];
  const [stage, setStage] = useState<Stage>("input");
  const [processingMsg, setProcessingMsg] = useState("");
  const [processingPct, setProcessingPct] = useState(0);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [editedRows, setEditedRows] = useState<ExtractedRow[]>([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // ─── PROCESSING PIPELINE ───────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setStage("processing");
    setError("");
    setFileName(file.name || "captured image");

    try {
      const mime = file.type;
      const isImage = mime.startsWith("image/");
      const isPDF = mime === "application/pdf";
      const isExcel = mime.includes("spreadsheet") || mime.includes("excel") || file.name.match(/\.(xlsx|xls)$/i);
      const isCSV = mime === "text/csv" || file.name.match(/\.csv$/i);
      const isWord = mime.includes("word") || file.name.match(/\.(docx|doc)$/i);

      let extractionJSON = "";

      // ── IMAGE / SCREENSHOT / CAMERA ───────────────────────────────────────
      if (isImage) {
        setProcessingMsg("Reading image...");
        setProcessingPct(20);
        const base64 = await fileToBase64(file);

        setProcessingMsg("Analysing image with AI vision...");
        setProcessingPct(50);

        const prompt = buildExtractionPrompt(moduleKey, "screenshot or photo");
        extractionJSON = await callClaudeDirectly(prompt, base64, mime);

      // ── PDF ───────────────────────────────────────────────────────────────
      } else if (isPDF) {
        setProcessingMsg("Reading PDF...");
        setProcessingPct(20);
        const base64 = await fileToBase64(file);

        setProcessingMsg("Extracting data from PDF with AI...");
        setProcessingPct(50);

        // Send PDF as document to Claude
        const prompt = buildExtractionPrompt(moduleKey, "PDF document");
        extractionJSON = await callClaudeDirectly(prompt, base64, "application/pdf");

      // ── EXCEL / XLSX ──────────────────────────────────────────────────────
      } else if (isExcel) {
        setProcessingMsg("Loading Excel parser...");
        setProcessingPct(15);

        // Load SheetJS from CDN at runtime — no npm package needed
        const csvText = await new Promise<string>((resolve, reject) => {
          const existingScript = document.getElementById("sheetjs-cdn");
          const run = () => {
            const XLSXLib = (window as any).XLSX;
            if (!XLSXLib) { reject(new Error("SheetJS failed to load from CDN.")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                const workbook = XLSXLib.read(data, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                resolve(XLSXLib.utils.sheet_to_csv(sheet));
              } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          };
          if (existingScript && (window as any).XLSX) { run(); return; }
          const script = document.createElement("script");
          script.id = "sheetjs-cdn";
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          script.onload = run;
          script.onerror = () => reject(new Error("Could not load Excel parser. Check internet connection."));
          document.head.appendChild(script);
        });

        setProcessingMsg("Mapping columns with AI...");
        setProcessingPct(55);

        const prompt = buildExtractionPrompt(moduleKey, "Excel spreadsheet", csvText);
        extractionJSON = await callClaudeDirectly(prompt);

      // ── CSV ───────────────────────────────────────────────────────────────
      } else if (isCSV) {
        setProcessingMsg("Parsing CSV...");
        setProcessingPct(20);
        const text = await fileToText(file);

        setProcessingMsg("Mapping columns with AI...");
        setProcessingPct(55);

        const prompt = buildExtractionPrompt(moduleKey, "CSV file", text);
        extractionJSON = await callClaudeDirectly(prompt);

      // ── WORD DOCUMENT ─────────────────────────────────────────────────────
      } else if (isWord) {
        setProcessingMsg("Reading Word document...");
        setProcessingPct(20);

        // Extract text from .docx (ZIP containing XML) — no npm library needed
        // Read as binary, find word/document.xml, strip XML tags
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const binary = e.target!.result as string;
              // Search for readable text chunks between XML tags
              // docx XML contains w:t elements with actual text
              const wtMatches = binary.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
              const extracted = wtMatches
                .map(m => m.replace(/<[^>]+>/g, ""))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              if (extracted.length > 20) {
                resolve(extracted);
              } else {
                // Fallback: strip all XML tags from binary read
                const stripped = binary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                resolve(stripped.slice(0, 8000));
              }
            } catch (err) { reject(err); }
          };
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });

        setProcessingMsg("Extracting data from document with AI...");
        setProcessingPct(55);

        const prompt = buildExtractionPrompt(moduleKey, "Word document", text);
        extractionJSON = await callClaudeDirectly(prompt);

      } else {
        throw new Error(`Unsupported file type: ${mime || "unknown"}. Please use image, PDF, Excel, CSV, or Word.`);
      }

      setProcessingMsg("Parsing AI response...");
      setProcessingPct(80);

      // Parse JSON response from AI
      const clean = extractionJSON
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      let parsed: ExtractionResult;
      try {
        parsed = JSON.parse(clean);
      } catch {
        // Try to find JSON in the response
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI returned an unexpected format. Please try again.");
        parsed = JSON.parse(jsonMatch[0]);
      }

      // Defensively extract rows — AI may return rows directly, nested, or as object
      let rawRows: any[] = [];
      if (Array.isArray(parsed.rows)) {
        rawRows = parsed.rows;
      } else if (Array.isArray(parsed)) {
        rawRows = parsed;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        rawRows = parsed.data;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        rawRows = parsed.results;
      } else if (parsed.rows && typeof parsed.rows === "object") {
        // Single row returned as object instead of array
        rawRows = [parsed.rows];
      } else {
        // Last resort: look for any array value in the top-level object
        const firstArray = Object.values(parsed).find(v => Array.isArray(v));
        rawRows = (firstArray as any[]) || [];
      }

      // Normalize each row — handle both {cells:{}} and flat {key:value} shapes
      const normalizedRows: ExtractedRow[] = rawRows.map((row: any, idx: number) => {
        const normalizedCells: Record<string, ExtractedCell> = {};
        const hasCells = row && typeof row.cells === "object" && !Array.isArray(row.cells);
        schema.columns.forEach(col => {
          let cell: any;
          if (hasCells) {
            // Expected shape: { cells: { key: { value, confidence } } }
            cell = row.cells?.[col.key];
          } else {
            // Flat shape: { key: value } or { key: { value, confidence } }
            const raw = row?.[col.key];
            cell = (raw && typeof raw === "object" && "value" in raw)
              ? raw
              : { value: raw ?? "", confidence: "medium" };
          }
          if (!cell) cell = { value: "", confidence: "missing" };
          let val = String(cell.value ?? "").trim();
          if (col.type === "date" && val) val = normalizeDate(val);
          if (col.type === "percent" && val) val = normalizePercent(val);
          normalizedCells[col.key] = {
            value: val,
            confidence: (cell.confidence as Confidence) || (val ? "medium" : "missing"),
            rawSource: cell.rawSource,
          };
        });
        return { cells: normalizedCells, rowIndex: idx };
      });

      setProcessingPct(100);
      setProcessingMsg("Done!");

      const finalResult: ExtractionResult = {
        rows: normalizedRows,
        sourceDescription: parsed.sourceDescription || "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        totalRowsFound: parsed.totalRowsFound || normalizedRows.length,
      };

      setResult(finalResult);
      setEditedRows(normalizedRows.map((r: ExtractedRow) => ({ ...r, cells: { ...r.cells } })));
      setStage("review");

    } catch (err: any) {
      setError(err.message || "An error occurred during extraction.");
      setStage("input");
    }
  }, [moduleKey, callAI]);

  // ─── FILE DROP HANDLER ─────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ""; // reset so same file can be re-selected
  }, [processFile]);

  // ─── CELL EDIT IN REVIEW ───────────────────────────────────────────────────
  const editCell = (rowIdx: number, key: string, value: string) => {
    setEditedRows(prev => prev.map((row, i) =>
      i === rowIdx
        ? { ...row, cells: { ...row.cells, [key]: { ...row.cells[key], value, confidence: "high" } } }
        : row
    ));
  };

  const deleteRow = (rowIdx: number) => {
    setEditedRows(prev => prev.filter((_, i) => i !== rowIdx));
  };

  const addEmptyRow = () => {
    const emptyCells: Record<string, ExtractedCell> = {};
    schema.columns.forEach(col => {
      emptyCells[col.key] = { value: "", confidence: "missing" };
    });
    setEditedRows(prev => [...prev, { cells: emptyCells, rowIndex: prev.length }]);
  };

  // ─── CONFIRM LOAD ──────────────────────────────────────────────────────────
  const confirmAndLoad = () => {
    const plain = editedRows.map(row => {
      const out: Record<string, string> = {};
      Object.entries(row.cells).forEach(([k, v]) => { out[k] = v.value; });
      return out;
    });
    onConfirm(plain);
    setStage("done");
  };

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const schemaColor = schema.color;

  // ─── RENDER: INPUT STAGE ──────────────────────────────────────────────────
  if (stage === "input") return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",padding:24 }}>
        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16,fontWeight:800,color:C.text }}>📥 Smart Data Import</div>
            <div style={{ fontSize:11,color:C.textMid,marginTop:3 }}>{schema.label} — AI extracts and auto-fills your columns</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",lineHeight:1 }}>×</button>
        </div>

        {error && (
          <div style={{ background:C.dangerDim,border:`1px solid ${C.danger}44`,borderRadius:8,padding:"10px 12px",marginBottom:16,fontSize:11,color:C.danger,lineHeight:1.6 }}>
            ⚠ {error}
            {error.includes("API key") && (
              <div style={{marginTop:6,fontSize:10,color:C.textMid}}>
                The API key is read from your Cloudflare environment variable <strong style={{color:C.accent}}>EFF_CLAUDE</strong>. If it is set, try refreshing the page.
              </div>
            )}
          </div>
        )}

        {/* Camera — PRIMARY for mobile/IT-restricted */}
        <div style={{ background:`${schemaColor}10`,border:`1px solid ${schemaColor}33`,borderRadius:10,padding:16,marginBottom:12 }}>
          <div style={{ fontSize:11,fontWeight:700,color:schemaColor,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em" }}>
            📱 Recommended for IT-Restricted Environments
          </div>
          <div style={{ fontSize:11,color:C.textMid,marginBottom:12,lineHeight:1.6 }}>
            Cannot upload screenshots? Point your phone camera at the screen — AI reads the data directly from your photo.
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            style={{ display:"none" }}
          />
          <button
            onClick={() => cameraRef.current?.click()}
            style={{ width:"100%",padding:"14px",borderRadius:8,background:schemaColor,color:"#0B1120",border:"none",fontSize:13,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            📷 Open Camera & Capture Screen
          </button>
          <div style={{ fontSize:9,color:C.textDim,marginTop:6,textAlign:"center" }}>
            Opens rear camera on your phone — point at laptop/monitor screen and tap capture
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e=>{ e.preventDefault(); setDragOver(true); }}
          onDragLeave={()=>setDragOver(false)}
          style={{ border:`2px dashed ${dragOver?schemaColor:C.border}`,borderRadius:10,padding:"20px 16px",textAlign:"center",background:dragOver?`${schemaColor}08`:C.card2,transition:"all 0.15s",marginBottom:12,cursor:"pointer" }}
          onClick={() => uploadRef.current?.click()}>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc"
            onChange={handleFileInput}
            style={{ display:"none" }}
          />
          <div style={{ fontSize:28,marginBottom:8 }}>📂</div>
          <div style={{ fontSize:12,fontWeight:600,color:C.textMid,marginBottom:4 }}>
            Drop file here or click to browse
          </div>
          <div style={{ fontSize:10,color:C.textDim }}>
            Screenshot · PDF · Excel (.xlsx/.xls) · CSV · Word (.docx)
          </div>
        </div>

        {/* Format buttons */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
          {[
            { label:"Screenshot / Image", icon:"🖼", accept:"image/*", desc:"PNG, JPG, WEBP" },
            { label:"PDF Report", icon:"📄", accept:".pdf", desc:"Any PDF format" },
            { label:"Excel / CSV", icon:"📊", accept:".xlsx,.xls,.csv", desc:"Spreadsheet data" },
            { label:"Word Document", icon:"📝", accept:".docx,.doc", desc:"Word reports" },
          ].map(btn => {
            const ref = React.createRef<HTMLInputElement>();
            return (
              <div key={btn.label}>
                <input ref={ref} type="file" accept={btn.accept} onChange={handleFileInput} style={{ display:"none" }}/>
                <button onClick={() => ref.current?.click()}
                  style={{ width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:18 }}>{btn.icon}</span>
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,color:C.text }}>{btn.label}</div>
                    <div style={{ fontSize:9,color:C.textDim }}>{btn.desc}</div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Column preview */}
        <div style={{ marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:14 }}>
          <div style={{ fontSize:10,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>
            AI will extract these columns
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
            {schema.columns.map(col => (
              <span key={col.key} style={{ fontSize:9,padding:"2px 8px",borderRadius:10,background:col.required?`${schemaColor}15`:C.card2,color:col.required?schemaColor:C.textDim,border:`1px solid ${col.required?schemaColor+"33":C.border}` }}>
                {col.label}{col.required?" *":""}
              </span>
            ))}
          </div>
          <div style={{ fontSize:9,color:C.textDim,marginTop:6 }}>* Required fields</div>
        </div>
      </div>
    </div>
  );

  // ─── RENDER: PROCESSING ────────────────────────────────────────────────────
  if (stage === "processing") return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:32,width:"100%",maxWidth:380,textAlign:"center" }}>
        <div style={{ fontSize:40,marginBottom:12 }}>🤖</div>
        <div style={{ fontSize:14,fontWeight:800,color:C.text,marginBottom:6 }}>Analysing {fileName}</div>
        <div style={{ fontSize:11,color:C.textMid,marginBottom:20 }}>{processingMsg}</div>

        {/* Progress bar */}
        <div style={{ background:C.card2,borderRadius:20,height:6,overflow:"hidden",marginBottom:8 }}>
          <div style={{ height:"100%",background:`linear-gradient(90deg, ${schemaColor}, ${C.blue})`,width:`${processingPct}%`,transition:"width 0.4s ease",borderRadius:20 }}/>
        </div>
        <div style={{ fontSize:10,color:C.textDim }}>{processingPct}% complete</div>

        <div style={{ marginTop:20,fontSize:10,color:C.textDim,lineHeight:1.6 }}>
          AI is reading the source, identifying your data columns,<br/>and structuring it for review.
        </div>
      </div>
    </div>
  );

  // ─── RENDER: REVIEW STAGE ─────────────────────────────────────────────────
  if (stage === "review" && result && editedRows.length > 0) {
    const lowConfidenceCount = editedRows.reduce((n, row) =>
      n + Object.values(row.cells).filter(c => c.confidence === "low" || c.confidence === "missing").length, 0);
    const missingRequired = editedRows.some(row =>
      schema.columns.filter(c => c.required).some(col => !row.cells[col.key]?.value));

    return (
      <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",flexDirection:"column" }}>
        {/* Review header */}
        <div style={{ background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13,fontWeight:800,color:C.text }}>
              🔍 Review Extracted Data
            </div>
            <div style={{ fontSize:10,color:C.textMid,marginTop:2 }}>
              {editedRows.length} row{editedRows.length !== 1?"s":""} extracted from {fileName}
              {result.sourceDescription ? ` · ${result.sourceDescription}` : ""}
            </div>
          </div>

          {/* Confidence legend */}
          <div style={{ display:"flex",gap:8,fontSize:9,color:C.textDim }}>
            {([["high","✓","Confident"],[" medium","~","Inferred"],["low","?","Uncertain"],["missing","✗","Not found"]] as const).map(([c,sym,lb])=>(
              <div key={c} style={{ display:"flex",alignItems:"center",gap:3 }}>
                <span style={{ color:confidenceColor(c as Confidence),fontWeight:700 }}>{sym}</span> {lb}
              </div>
            ))}
          </div>

          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer" }}>×</button>
        </div>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div style={{ background:C.warnDim,borderBottom:`1px solid ${C.warn}33`,padding:"8px 18px",display:"flex",gap:8,alignItems:"center" }}>
            <span style={{ fontSize:14 }}>⚠️</span>
            <div style={{ fontSize:10,color:C.warn }}>
              {result.warnings.join(" · ")}
            </div>
          </div>
        )}

        {lowConfidenceCount > 0 && (
          <div style={{ background:"rgba(139,92,246,0.08)",borderBottom:`1px solid ${C.purple}33`,padding:"7px 18px",fontSize:10,color:C.purple }}>
            💡 {lowConfidenceCount} cell{lowConfidenceCount!==1?"s":""} have lower confidence — highlighted below. Review and correct before loading.
          </div>
        )}

        {/* Table */}
        <div style={{ flex:1,overflowY:"auto",overflowX:"auto",padding:"12px 18px" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:10 }}>
            <thead>
              <tr>
                <th style={{ padding:"8px 6px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",color:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0 }}>#</th>
                {schema.columns.map(col => (
                  <th key={col.key} style={{ padding:"8px 6px",textAlign:"left",fontSize:9,fontWeight:700,textTransform:"uppercase",color:col.required?schemaColor:C.textDim,background:C.card2,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0 }}>
                    {col.label}{col.required?" *":""}
                  </th>
                ))}
                <th style={{ padding:"8px 6px",background:C.card2,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0 }}/>
              </tr>
            </thead>
            <tbody>
              {editedRows.map((row, rowIdx) => (
                <tr key={rowIdx} style={{ background:rowIdx%2===0?C.card:C.card2 }}>
                  <td style={{ padding:"4px 6px",borderBottom:`1px solid ${C.border}`,color:C.textDim,fontSize:9,verticalAlign:"middle" }}>{rowIdx+1}</td>
                  {schema.columns.map(col => {
                    const cell = row.cells[col.key] || { value:"",confidence:"missing" as Confidence };
                    const confCol = confidenceColor(cell.confidence);
                    const isBad = cell.confidence === "low" || cell.confidence === "missing";
                    return (
                      <td key={col.key} style={{ padding:"3px 4px",borderBottom:`1px solid ${C.border}`,verticalAlign:"middle",minWidth:80 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:3 }}>
                          <span style={{ color:confCol,fontSize:9,fontWeight:700,flexShrink:0 }} title={cell.rawSource?`AI saw: "${cell.rawSource}"`:undefined}>
                            {confidenceLabel(cell.confidence)}
                          </span>
                          <input
                            value={cell.value}
                            onChange={e => editCell(rowIdx, col.key, e.target.value)}
                            type={col.type === "date" ? "date" : "text"}
                            placeholder={isBad ? "—" : ""}
                            style={{ background:isBad?"rgba(239,68,68,0.08)":"transparent",border:`1px solid ${isBad?C.danger+"44":C.border}`,borderRadius:4,color:isBad?C.danger:C.text,fontSize:10,padding:"3px 5px",width:"100%",outline:"none",fontFamily:"inherit" }}
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding:"4px 6px",borderBottom:`1px solid ${C.border}`,verticalAlign:"middle" }}>
                    <button onClick={() => deleteRow(rowIdx)} style={{ background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:13 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div style={{ background:C.card,borderTop:`1px solid ${C.border}`,padding:"12px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap" }}>
          <button onClick={addEmptyRow}
            style={{ padding:"7px 14px",borderRadius:6,background:"transparent",border:`1px solid ${C.border}`,color:C.textMid,fontSize:11,cursor:"pointer" }}>
            + Add Row
          </button>
          <button onClick={() => { setStage("input"); setResult(null); setEditedRows([]); }}
            style={{ padding:"7px 14px",borderRadius:6,background:"transparent",border:`1px solid ${C.border}`,color:C.textMid,fontSize:11,cursor:"pointer" }}>
            ← Import Again
          </button>
          <div style={{ flex:1 }}/>
          {missingRequired && (
            <div style={{ fontSize:10,color:C.danger }}>⚠ Fill required fields (*) before loading</div>
          )}
          <button
            onClick={confirmAndLoad}
            disabled={editedRows.length === 0}
            style={{ padding:"9px 22px",borderRadius:7,background:schemaColor,color:"#0B1120",border:"none",fontSize:12,fontWeight:800,cursor:editedRows.length===0?"not-allowed":"pointer",opacity:editedRows.length===0?0.4:1 }}>
            ✓ Confirm & Load {editedRows.length} Row{editedRows.length!==1?"s":""}
          </button>
        </div>
      </div>
    );
  }

  // ─── RENDER: REVIEW (empty result) ────────────────────────────────────────
  if (stage === "review" && (!result || editedRows.length === 0)) return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:32,maxWidth:380,textAlign:"center" }}>
        <div style={{ fontSize:36,marginBottom:12 }}>🔍</div>
        <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:8 }}>No data rows found</div>
        <div style={{ fontSize:11,color:C.textMid,marginBottom:8 }}>
          {result?.sourceDescription && `AI saw: "${result.sourceDescription}"`}
        </div>
        <div style={{ fontSize:11,color:C.textMid,marginBottom:20,lineHeight:1.6 }}>
          The AI couldn't extract structured rows from this source. Try a clearer photo, different file, or enter data manually.
        </div>
        {result?.warnings.length ? <div style={{ fontSize:10,color:C.warn,marginBottom:16 }}>{result.warnings.join(" · ")}</div> : null}
        <button onClick={() => { setStage("input"); setResult(null); }}
          style={{ padding:"9px 24px",borderRadius:7,background:schemaColor,color:"#0B1120",border:"none",fontSize:12,fontWeight:800,cursor:"pointer" }}>
          Try Again
        </button>
      </div>
    </div>
  );

  // ─── DONE ─────────────────────────────────────────────────────────────────
  if (stage === "done") return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:C.card,border:`1px solid ${C.success}33`,borderRadius:14,padding:32,maxWidth:340,textAlign:"center" }}>
        <div style={{ fontSize:48,marginBottom:12 }}>✅</div>
        <div style={{ fontSize:14,fontWeight:800,color:C.success,marginBottom:8 }}>Data Loaded</div>
        <div style={{ fontSize:11,color:C.textMid,marginBottom:20 }}>
          {editedRows.length} row{editedRows.length!==1?"s":""} successfully imported into {schema.label}
        </div>
        <button onClick={onClose}
          style={{ padding:"9px 24px",borderRadius:7,background:schemaColor,color:"#0B1120",border:"none",fontSize:12,fontWeight:800,cursor:"pointer" }}>
          View Data →
        </button>
      </div>
    </div>
  );

  return null;
}
