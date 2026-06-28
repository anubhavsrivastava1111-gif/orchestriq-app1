// ═══════════════════════════════════════════════════════════════════════════════
// WorkflowEngine.tsx  — Step executor, memory manager, dependency resolver
// Self-contained: no imports from App.tsx directly.
// All platform functions injected via EngineProps.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type WorkflowMode = "auto" | "guided" | "manual";
export type StepStatus = "pending" | "running" | "done" | "blocked" | "skipped" | "waiting_input";
export type StepType = "input" | "validate" | "analyse" | "generate" | "decide" | "output" | "archive";

export interface SLADef { priority: string; hours: number; color: string; }

export interface WorkflowConfig {
  system: string;
  slaDefs: SLADef[];
  columnMappings: Record<string, string>;
  filters: string[];
  namingConventions: Record<string, string>;
  reportNames: string[];
  customRules: string[];
}

export interface WorkflowMemory {
  workflowId: string;
  config: Partial<WorkflowConfig>;
  lastRun?: string;
  uploadedData: Record<string, string>;
  snapshots: { date: string; summary: string }[];
  preferences: Record<string, string>;
}

export interface StepInput {
  id: string;
  label: string;
  description: string;
  required: boolean;
  accepts: string[];         // file types or "text"
  memoryKey?: string;        // if set, load from memory if available
}

export interface StepOutput {
  id: string;
  label: string;
  format: "text" | "xlsx" | "pdf" | "pptx" | "docx" | "email" | "actions";
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  type: StepType;
  requires: string[];
  inputs: StepInput[];
  outputs: StepOutput[];
  canAuto: boolean;
  icon: string;
  aiPrompt?: (ctx: StepContext) => string;
  validate?: (data: Record<string, string>) => { ok: boolean; reason?: string };
}

export interface WorkflowDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  businessObjective: string;
  industries: string[];
  estimatedTime: string;
  steps: WorkflowStep[];
  defaultConfig: WorkflowConfig;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  inputData: Record<string, string>;
  output: string;
  generatedFiles: string[];
  blockedReason?: string;
  startedAt?: string;
  completedAt?: string;
  aiTokens?: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  mode: WorkflowMode;
  startedAt: string;
  completedAt?: string;
  status: "running" | "waiting_input" | "complete" | "blocked" | "cancelled";
  currentStepId: string;
  steps: Record<string, StepResult>;
  outputs: Record<string, string>;
  config: WorkflowConfig;
}

export interface StepContext {
  company: any;
  compData: any;
  config: WorkflowConfig;
  memory: WorkflowMemory;
  inputData: Record<string, string>;
  previousOutputs: Record<string, string>;
  mode: WorkflowMode;
}

// ─── MEMORY MANAGER ───────────────────────────────────────────────────────────

export class WorkflowMemoryManager {
  private key(workflowId: string) { return `oiq-wf-memory-${workflowId}`; }

  load(workflowId: string): WorkflowMemory {
    try {
      const raw = localStorage.getItem(this.key(workflowId));
      if (raw) return JSON.parse(raw);
    } catch {}
    return { workflowId, config: {}, uploadedData: {}, snapshots: [], preferences: {} };
  }

  save(mem: WorkflowMemory): void {
    try { localStorage.setItem(this.key(mem.workflowId), JSON.stringify(mem)); } catch {}
  }

  saveUpload(workflowId: string, stepId: string, data: string): void {
    const mem = this.load(workflowId);
    mem.uploadedData[stepId] = data;
    this.save(mem);
  }

  saveConfig(workflowId: string, config: Partial<WorkflowConfig>): void {
    const mem = this.load(workflowId);
    mem.config = { ...mem.config, ...config };
    this.save(mem);
  }

  addSnapshot(workflowId: string, summary: string): void {
    const mem = this.load(workflowId);
    mem.snapshots = [{ date: new Date().toISOString(), summary }, ...mem.snapshots].slice(0, 30);
    mem.lastRun = new Date().toISOString();
    this.save(mem);
  }

  clearUploads(workflowId: string): void {
    const mem = this.load(workflowId);
    mem.uploadedData = {};
    this.save(mem);
  }
}

export const memoryManager = new WorkflowMemoryManager();

// ─── RUN STORE ────────────────────────────────────────────────────────────────

export function saveRun(run: WorkflowRun): void {
  try {
    const runs: WorkflowRun[] = JSON.parse(localStorage.getItem("oiq-wf-runs") || "[]");
    const updated = [run, ...runs.filter(r => r.id !== run.id)].slice(0, 50);
    localStorage.setItem("oiq-wf-runs", JSON.stringify(updated));
  } catch {}
}

export function loadRuns(): WorkflowRun[] {
  try { return JSON.parse(localStorage.getItem("oiq-wf-runs") || "[]"); } catch { return []; }
}

// ─── STEP EXECUTOR ────────────────────────────────────────────────────────────

export class WorkflowStepExecutor {
  constructor(
    private ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>,
    private ensureXLSX: () => Promise<any>,
    private ensureJsPDF: () => Promise<any>,
    private ensurePptx: () => Promise<any>,
    private dlFile: (name: string, content: any, mime?: string) => void,
    private parseSections: (md: string) => Array<{ title: string; lines: string[] }>,
    private stripMd: (s: string) => string,
  ) {}

  async executeStep(
    step: WorkflowStep,
    ctx: StepContext,
    onProgress: (msg: string) => void,
  ): Promise<StepResult> {
    const result: StepResult = {
      stepId: step.id, status: "running", inputData: ctx.inputData,
      output: "", generatedFiles: [], startedAt: new Date().toISOString(),
    };

    try {
      onProgress(`Running: ${step.name}...`);

      // Validate if required
      if (step.validate) {
        const v = step.validate(ctx.inputData);
        if (!v.ok) {
          result.status = "blocked";
          result.blockedReason = v.reason || "Validation failed";
          return result;
        }
      }

      // Run AI prompt if defined
      if (step.aiPrompt) {
        const sys = step.aiPrompt(ctx);
        const inputText = Object.values(ctx.inputData).join("

");
        const raw = await this.ask(sys, [{ role: "user", content: inputText || "Proceed with available data." }], 3000);
        result.output = typeof raw === "string" ? raw : raw?.text || raw?.content?.[0]?.text || "";
        onProgress(`✓ ${step.name} complete`);
      } else {
        result.output = `Step completed: ${step.name}`;
        onProgress(`✓ ${step.name} complete (no AI required)`);
      }

      result.status = "done";
      result.completedAt = new Date().toISOString();
    } catch (e: any) {
      result.status = "blocked";
      result.blockedReason = `Error: ${e.message || "Unknown"}`;
    }

    return result;
  }

  async generateExcel(
    sheetData: Record<string, string[][]>,
    filename: string,
  ): Promise<void> {
    const XLSX = await this.ensureXLSX();
    const wb = XLSX.utils.book_new();
    Object.entries(sheetData).forEach(([name, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = rows[0]?.map(() => ({ wch: 20 })) || [];
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(u), 200);
  }

  async generateDocx(content: string, title: string, filename: string): Promise<void> {
    const secs = this.parseSections(content);
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:72pt;}h1{font-size:18pt;color:#14B8A6;}h2{font-size:13pt;color:#0D6EFD;}p{line-height:1.5;}table{border-collapse:collapse;width:100%;}th{background:#14B8A6;color:#fff;padding:5pt 8pt;}td{padding:4pt 8pt;border-bottom:1pt solid #ddd;}</style></head><body><h1>${title}</h1>`;
    for (const sec of secs) {
      html += `<h2>${sec.title}</h2>`;
      sec.lines.forEach(ln => { const t = this.stripMd(ln).trim(); if (t) html += `<p>${t}</p>`; });
    }
    html += "</body></html>";
    this.dlFile(filename, html, "application/msword");
  }
}

// ─── DEPENDENCY RESOLVER ──────────────────────────────────────────────────────

export function resolveExecutionOrder(steps: WorkflowStep[]): WorkflowStep[][] {
  // Returns steps grouped by wave (steps in same wave have no dependency on each other)
  const remaining = new Set(steps.map(s => s.id));
  const completed = new Set<string>();
  const waves: WorkflowStep[][] = [];

  let safety = 0;
  while (remaining.size > 0 && safety++ < 20) {
    const wave = steps.filter(s =>
      remaining.has(s.id) &&
      s.requires.every(r => completed.has(r))
    );
    if (!wave.length) break; // Circular dependency guard
    wave.forEach(s => { remaining.delete(s.id); completed.add(s.id); });
    waves.push(wave);
  }
  return waves;
}

export function getMissingInputs(
  step: WorkflowStep,
  inputData: Record<string, string>,
  memory: WorkflowMemory,
): StepInput[] {
  return step.inputs.filter(inp => {
    if (!inp.required) return false;
    const fromMemory = inp.memoryKey ? memory.uploadedData[inp.memoryKey] : undefined;
    const fromInput = inputData[inp.id];
    return !fromMemory && !fromInput;
  });
}
