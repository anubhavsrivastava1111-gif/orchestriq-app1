/**
 * OrchestrIQ Generation Service — Frontend Integration
 * Railway URL: https://orchestriq-gen-service-production.up.railway.app
 */

const GENERATION_SERVICE_URL = "https://orchestriq-gen-service-production.up.railway.app";

export type DocType = "excel" | "pptx" | "pdf" | "docx";

export interface GenerateRequest {
  objective: string;
  company_context?: string;
  available_data?: string;
  currency?: string;
  currency_symbol?: string;
  api_key?: string;
}

export interface GenerateResult {
  success: boolean;
  filename?: string;
  error?: string;
}

const MIME_TYPES: Record<DocType, string> = {
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx:  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf:   "application/pdf",
  docx:  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXTENSIONS: Record<DocType, string> = {
  excel: ".xlsx",
  pptx:  ".pptx",
  pdf:   ".pdf",
  docx:  ".docx",
};

export async function generateDocument(
  docType: DocType,
  request: GenerateRequest,
  onProgress?: (message: string) => void
): Promise<GenerateResult> {
  try {
    onProgress?.(`🔍 Analysing your inputs...`);

    const endpoint = `${GENERATION_SERVICE_URL}/generate/${docType}`;

    const payload = {
      objective:       request.objective       || "Generate a professional document",
      company_context: request.company_context || "",
      available_data:  request.available_data  || "",
      currency:        request.currency        || "INR",
      currency_symbol: request.currency_symbol || "₹",
      ...(request.api_key ? { api_key: request.api_key } : {}),
    };

    onProgress?.(`⚙️ Building your ${docType.toUpperCase()} — this takes 20–40 seconds...`);

    const response = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Service error ${response.status}`;
      try { errMsg = JSON.parse(errText).detail || errMsg; } catch {}
      return { success: false, error: errMsg };
    }

    onProgress?.(`📥 Downloading your file...`);

    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] || `OrchestrIQ-Output${EXTENSIONS[docType]}`;

    const blob = await response.blob();
    const url  = URL.createObjectURL(new Blob([blob], { type: MIME_TYPES[docType] }));
    const link = document.createElement("a");
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onProgress?.(`✅ ${filename} downloaded successfully`);
    return { success: true, filename };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

export const generateExcel = (req: GenerateRequest, onProgress?: (m: string) => void) =>
  generateDocument("excel", req, onProgress);

export const generatePptx = (req: GenerateRequest, onProgress?: (m: string) => void) =>
  generateDocument("pptx", req, onProgress);

export const generatePdf = (req: GenerateRequest, onProgress?: (m: string) => void) =>
  generateDocument("pdf", req, onProgress);

export const generateDocx = (req: GenerateRequest, onProgress?: (m: string) => void) =>
  generateDocument("docx", req, onProgress);

export async function checkGenerationService(): Promise<boolean> {
  try {
    const r = await fetch(`${GENERATION_SERVICE_URL}/health`);
    return r.ok;
  } catch {
    return false;
  }
}
