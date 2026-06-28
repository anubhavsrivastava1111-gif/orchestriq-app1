import { useState, useCallback, useRef, useEffect } from "react";
import type { WorkflowDef, WorkflowRun, StepResult, WorkflowConfig, WorkflowMode, StepContext } from "./WorkflowEngine";
import { memoryManager, saveRun, loadRuns, resolveExecutionOrder, getMissingInputs, WorkflowStepExecutor } from "./WorkflowEngine";
import { WORKFLOW_REGISTRY } from "./WorkflowTemplates";
import { saveRecord, estimateCost, estimateTokens } from "./TokenAnalytics";

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  co: any; compData: any; keys: Record<string, string>; defP: string;
  ask: (sys: string, msgs: any[], maxT?: number) => Promise<any>;
  showToast: (msg: string, type?: string) => void;
  dlFile: (name: string, content: any, mime?: string) => void;
  ensureJsPDF: () => Promise<any>; ensureXLSX: () => Promise<any>;
  ensurePptx: () => Promise<any>; ensureJSZip: () => Promise<any>;
  parseSections: (md: string) => Array<{ title: string; lines: string[] }>;
  stripMd: (s: string) => string;
  actionItems: any[]; setActionItems: (items: any[]) => void;
  brSessions: any[]; setBrSessions: (s: any[]) => void;
  sv: (key: string, val: any) => void;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseExcelJSON(text: string): { sheets: any[] } | null {
  try {
    const c = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const p = JSON.parse(c);
    if (Array.isArray(p?.sheets)) return p;
  } catch {}
  return null;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function AgenticWorkflows({
  co, compData, keys, defP, ask, showToast, dlFile,
  ensureJsPDF, ensureXLSX, ensurePptx, ensureJSZip,
  parseSections, stripMd, actionItems, setActionItems,
  brSessions, setBrSessions, sv
}: Props) {

  const [view, setView] = useState<"library" | "config" | "run" | "result" | "history" | "builder">("library");
  const [selectedWF, setSelectedWF] = useState<WorkflowDef | null>(null);
  const [mode, setMode] = useState<WorkflowMode>("guided");
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [stepInputs, setStepInputs] = useState<Record<string, string>>({});
  const [activeStepId, setActiveStepId] = useState<string>("");
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const executorRef = useRef<WorkflowStepExecutor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentStepRef = useRef<string>("");

  useEffect(() => {
    setRuns(loadRuns());
    executorRef.current = new WorkflowStepExecutor(ask, ensureXLSX, ensureJsPDF, ensurePptx, dlFile, parseSections, stripMd);
  }, [ask, ensureXLSX, ensureJsPDF, ensurePptx, dlFile, parseSections, stripMd]);

  const log = useCallback((msg: string) => setProgressLog(p => [msg, ...p].slice(0, 50)), []);

  // ─── START WORKFLOW ─────────────────────────────────────────────────────────
  const startWorkflow = useCallback((wf: WorkflowDef, wfMode: WorkflowMode) => {
    const mem = memoryManager.load(wf.id);
    const wfConfig: WorkflowConfig = { ...wf.defaultConfig, ...mem.config };
    const runId = Date.now().toString(36);
    const stepResults: Record<string, StepResult> = {};
    wf.steps.forEach(s => {
      stepResults[s.id] = { stepId: s.id, status: "pending", inputData: {}, output: "", generatedFiles: [] };
    });
    const newRun: WorkflowRun = {
      id: runId, workflowId: wf.id, workflowName: wf.name, mode: wfMode,
      startedAt: new Date().toISOString(), status: "running",
      currentStepId: wf.steps[0]?.id || "", steps: stepResults, outputs: {}, config: wfConfig,
    };
    setCurrentRun(newRun);
    setSelectedWF(wf);
    setMode(wfMode);
    setProgressLog([`🚀 Starting: ${wf.name} (${wfMode} mode)`]);
    setStepInputs({});
    setActiveStepId(wf.steps[0]?.id || "");
    setView("run");
    if (wfMode === "auto") {
      setTimeout(() => autoAdvance(newRun, wf, wfConfig, {}), 300);
    }
  }, []);

  // ─── AUTO ADVANCE (Mode 1) ──────────────────────────────────────────────────
  const autoAdvance = useCallback(async (
    run: WorkflowRun, wf: WorkflowDef, cfg: WorkflowConfig, prevOutputs: Record<string, string>
  ) => {
    if (!executorRef.current) return;
    const mem = memoryManager.load(wf.id);
    const waves = resolveExecutionOrder(wf.steps);
    const updatedRun = { ...run };
    const outputs = { ...prevOutputs };

    for (const wave of waves) {
      for (const step of wave) {
        const missing = getMissingInputs(step, stepInputs, mem);
        if (missing.length > 0 && step.type === "input") {
          updatedRun.steps[step.id] = { ...updatedRun.steps[step.id], status: "waiting_input", blockedReason: `Needs: ${missing.map(m => m.label).join(", ")}` };
          updatedRun.status = "waiting_input";
          updatedRun.currentStepId = step.id;
          setCurrentRun({ ...updatedRun });
          setActiveStepId(step.id);
          saveRun(updatedRun);
          log(`⏸ Waiting for input: ${missing.map(m => m.label).join(", ")}`);
          return;
        }

        // Build input data: merge memory + current inputs
        const inputData: Record<string, string> = {};
        step.inputs.forEach(inp => {
          const fromMem = inp.memoryKey ? mem.uploadedData[inp.memoryKey] : undefined;
          inputData[inp.id] = stepInputs[inp.id] || fromMem || "";
        });

        const ctx: StepContext = { company: co, compData, config: cfg, memory: mem, inputData, previousOutputs: outputs, mode: run.mode };
        updatedRun.steps[step.id] = { ...updatedRun.steps[step.id], status: "running" };
        setCurrentRun({ ...updatedRun });
        log(`▶ ${step.name}...`);

        const result = await executorRef.current.executeStep(step, ctx, log);
        updatedRun.steps[step.id] = result;
        if (result.output) outputs[step.id] = result.output;

        // Auto-generate Excel if step produces xlsx and AI output is JSON schema
        if (step.outputs.some(o => o.format === "xlsx") && result.output) {
          const schema = parseExcelJSON(result.output);
          if (schema) {
            try {
              await executorRef.current.generateExcel(
                Object.fromEntries(schema.sheets.map((s: any) => [s.name, [s.headers, ...(s.rows||[])]])),
                `${wf.name.replace(/\s+/g,"-")}-${step.id}-${Date.now()}.xlsx`
              );
              log(`✅ Excel downloaded: ${step.name}`);
              saveRecord({ feature: `Agentic WF — ${wf.name}`, featureIcon: wf.icon, provider: defP, model: defP, inputTokens: estimateTokens(Object.values(inputData).join("")), outputTokens: estimateTokens(result.output), costUsd: estimateCost(defP, estimateTokens(Object.values(inputData).join("")), estimateTokens(result.output)) });
            } catch (e: any) { log(`⚠ Excel generation failed: ${e.message}`); }
          }
        }

        if (result.status === "done") {
          log(`✓ Complete: ${step.name}`);
        } else {
          log(`❌ Blocked: ${step.name} — ${result.blockedReason}`);
        }
        setCurrentRun({ ...updatedRun });
      }
    }

    updatedRun.status = "complete";
    updatedRun.completedAt = new Date().toISOString();
    updatedRun.outputs = outputs;
    setCurrentRun({ ...updatedRun });
    saveRun(updatedRun);
    memoryManager.addSnapshot(wf.id, `Run complete — ${wf.steps.length} steps, ${Object.values(updatedRun.steps).filter(s => s.status === "done").length} succeeded`);
    log(`🎉 Workflow complete: ${wf.name}`);
    showToast(`✅ ${wf.name} complete`, "success");
  }, [co, compData, defP, stepInputs, log, showToast]);

  // ─── PROVIDE INPUT FOR WAITING STEP ────────────────────────────────────────
  const provideInput = useCallback(async () => {
    if (!selectedWF || !currentRun || !config) return;
    setRunning(true);
    const wf = selectedWF;
    const cfg = config;
    const mem = memoryManager.load(wf.id);

    // Persist uploads to memory
    Object.entries(stepInputs).forEach(([key, val]) => {
      if (val) memoryManager.saveUpload(wf.id, key, val);
    });

    try {
      if (mode === "auto") {
        await autoAdvance(currentRun, wf, cfg, currentRun.outputs || {});
      } else {
        // Guided / Manual: execute just the active step
        const step = wf.steps.find(s => s.id === activeStepId);
        if (!step || !executorRef.current) return;
        const inputData: Record<string, string> = {};
        step.inputs.forEach(inp => { inputData[inp.id] = stepInputs[inp.id] || mem.uploadedData[inp.memoryKey||inp.id] || ""; });
        const ctx: StepContext = { company: co, compData, config: cfg, memory: mem, inputData, previousOutputs: currentRun.outputs || {}, mode };
        log(`▶ Running: ${step.name}...`);
        const result = await executorRef.current.executeStep(step, ctx, log);
        const updatedRun: WorkflowRun = { ...currentRun, steps: { ...currentRun.steps, [step.id]: result }, outputs: { ...currentRun.outputs, [step.id]: result.output } };

        // Auto-generate Excel if applicable
        if (step.outputs.some(o => o.format === "xlsx") && result.output) {
          const schema = parseExcelJSON(result.output);
          if (schema && executorRef.current) {
            try { await executorRef.current.generateExcel(Object.fromEntries(schema.sheets.map((s: any) => [s.name, [s.headers, ...(s.rows||[])]])), `${wf.name.replace(/\s+/g,"-")}-${step.id}.xlsx`); log(`✅ Excel downloaded`); } catch {}
          }
        }

        // Advance to next pending step
        const nextStep = wf.steps.find(s => updatedRun.steps[s.id]?.status === "pending" || updatedRun.steps[s.id]?.status === "waiting_input");
        if (nextStep) {
          updatedRun.currentStepId = nextStep.id;
          setActiveStepId(nextStep.id);
          updatedRun.status = "running";
        } else {
          updatedRun.status = "complete";
          updatedRun.completedAt = new Date().toISOString();
          showToast(`✅ ${wf.name} complete`, "success");
        }
        setCurrentRun(updatedRun);
        saveRun(updatedRun);
      }
    } finally { setRunning(false); }
  }, [selectedWF, currentRun, config, stepInputs, mode, activeStepId, co, compData, autoAdvance, log, showToast]);

  // ─── FILE UPLOAD ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File, inputId: string) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["txt","md","csv"].includes(ext||"")) {
      const t = await file.text();
      setStepInputs(p => ({ ...p, [inputId]: t }));
      showToast(`✅ ${file.name} loaded`, "success");
    } else if (["xlsx","xls"].includes(ext||"")) {
      try {
        const XLSX = await ensureXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        let text = "";
        wb.SheetNames.forEach((n: string) => { const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]); if (csv.trim()) text += `
### ${n}
${csv}
`; });
        setStepInputs(p => ({ ...p, [inputId]: text }));
        showToast(`✅ Excel loaded (${wb.SheetNames.length} sheets)`, "success");
      } catch (e: any) { showToast("Excel parse error: " + e.message, "error"); }
    } else { showToast("Use CSV, Excel, or text files.", "warning"); }
  }, [ensureXLSX, showToast]);

  // ─── STYLES ─────────────────────────────────────────────────────────────────
  const S = {
    page:  { flex: 1, overflowY: "auto" as const, background: "#070C18", fontFamily: "'Inter',-apple-system,sans-serif", color: "#F0F4FF" },
    hdr:   { padding: "16px 24px 12px", borderBottom: "1px solid #1C2A40", marginBottom: 14 },
    card:  { background: "#0F1829", border: "1px solid #1C2A40", borderRadius: 8, padding: "14px 16px", marginBottom: 10 },
    inp:   { width: "100%", background: "#141F33", border: "1px solid #1C2A40", borderRadius: 6, padding: "9px 12px", color: "#F0F4FF", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none" },
    btn:   { background: "linear-gradient(135deg,#14B8A6,#6366F1)", border: "none", borderRadius: 6, padding: "10px 18px", color: "#fff", fontSize: 12, fontWeight: 700 as const, cursor: "pointer" as const, fontFamily: "inherit" },
    hBtn:  { background: "none", border: "1px solid #1C2A40", borderRadius: 5, padding: "5px 12px", color: "#8FA8CC", fontSize: 11, cursor: "pointer" as const, fontFamily: "inherit" },
    badge: (c: string) => ({ fontSize: 8, padding: "2px 7px", borderRadius: 10, background: c + "22", color: c, fontWeight: 700 as const }),
    modeBtn: (active: boolean, c: string) => ({ padding: "8px 16px", borderRadius: 7, border: "1px solid " + (active ? c : "#1C2A40"), background: active ? c + "18" : "transparent", color: active ? c : "#4D6A8A", cursor: "pointer" as const, fontFamily: "inherit", fontSize: 11, fontWeight: (active ? 700 : 400) as any }),
    tab: (a: boolean) => ({ padding: "5px 14px", borderRadius: 6, fontSize: 10, fontWeight: 600 as const, border: "1px solid " + (a ? "#14B8A6" : "#1C2A40"), background: a ? "rgba(20,184,166,0.1)" : "transparent", color: a ? "#14B8A6" : "#4D6A8A", cursor: "pointer" as const, fontFamily: "inherit" }),
  };

  const categories = [...new Set(WORKFLOW_REGISTRY.map(w => w.category))];
  const filteredWFs = WORKFLOW_REGISTRY.filter(w => filterCat === "all" || w.category === filterCat);

  // ─── LIBRARY VIEW ───────────────────────────────────────────────────────────
  if (view === "library") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F0F4FF", marginBottom: 2 }}>🔄 Agentic Workflows</div>
            <div style={{ fontSize: 11, color: "#4D6A8A" }}>Complete business process automation · intelligent step-by-step execution · three working modes</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setRuns(loadRuns()); setView("history"); }} style={S.hBtn}>History</button>
            <button onClick={() => setView("builder")} style={{ ...S.hBtn, color: "#A855F7", borderColor: "#A855F744" }}>⚙ Builder</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" as const }}>
          <button onClick={() => setFilterCat("all")} style={S.tab(filterCat === "all")}>All</button>
          {categories.map(c => <button key={c} onClick={() => setFilterCat(c)} style={S.tab(filterCat === c)}>{c}</button>)}
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
          {filteredWFs.map(wf => {
            const mem = memoryManager.load(wf.id);
            const hasMemory = Object.keys(mem.uploadedData).length > 0;
            return (
              <div key={wf.id} style={{ ...S.card, border: `1px solid ${wf.color}44`, cursor: "pointer" }}
                onClick={() => { setSelectedWF(wf); setConfig({ ...wf.defaultConfig, ...memoryManager.load(wf.id).config }); setView("config"); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26 }}>{wf.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F4FF" }}>{wf.name}</div>
                    <div style={{ fontSize: 9, color: "#4D6A8A" }}>{wf.category} · {wf.steps.length} steps · {wf.estimatedTime}</div>
                  </div>
                  {hasMemory && <span style={S.badge("#14B8A6")}>Memory</span>}
                </div>
                <div style={{ fontSize: 10, color: "#8FA8CC", lineHeight: 1.5, marginBottom: 8 }}>{wf.description}</div>
                <div style={{ fontSize: 10, color: "#14B8A6", fontStyle: "italic", marginBottom: 10, lineHeight: 1.4 }}>"{wf.businessObjective}"</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                  {wf.steps.map(s => (
                    <span key={s.id} style={{ fontSize: 7, padding: "2px 5px", borderRadius: 4, background: "#141F33", color: "#4D6A8A" }}>{s.icon} {s.name}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ─── CONFIG VIEW ────────────────────────────────────────────────────────────
  if (view === "config" && selectedWF && config) return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <span style={{ fontSize: 22 }}>{selectedWF.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>{selectedWF.name}</div>
            <div style={{ fontSize: 10, color: "#4D6A8A" }}>{selectedWF.steps.length} steps · {selectedWF.estimatedTime}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#8FA8CC", marginBottom: 14, lineHeight: 1.6, padding: "10px 12px", background: "rgba(20,184,166,0.05)", border: "1px solid rgba(20,184,166,0.15)", borderRadius: 6 }}>
          🎯 <strong style={{ color: "#14B8A6" }}>Objective:</strong> {selectedWF.businessObjective}
        </div>
        {/* Mode selection */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Select Working Mode</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div onClick={() => setMode("auto")} style={{ ...S.modeBtn(mode === "auto", "#14B8A6"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>⚡</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Automatic</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI executes every possible step automatically. Stops only when data is missing.</div>
          </div>
          <div onClick={() => setMode("guided")} style={{ ...S.modeBtn(mode === "guided", "#8B5CF6"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🧭</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Guided</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI explains and assists each step. You confirm before proceeding.</div>
          </div>
          <div onClick={() => setMode("manual")} style={{ ...S.modeBtn(mode === "manual", "#F59E0B"), flex: 1, textAlign: "center" as const, cursor: "pointer" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🔒</div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Manual</div>
            <div style={{ fontSize: 9, color: "#4D6A8A" }}>AI analyses only files you supply. No autonomous requests. Best for confidential data.</div>
          </div>
        </div>
        {/* Configuration */}
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF", marginBottom: 10 }}>⚙ Workflow Configuration</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>System / Platform</label>
              <input value={config.system} onChange={e => setConfig(c => c ? { ...c, system: e.target.value } : c)} style={{ ...S.inp, marginBottom: 0 }} placeholder="SAP / ServiceNow / Jira / Concur..." />
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Expected Report Names</label>
              <input value={config.reportNames.join(", ")} onChange={e => setConfig(c => c ? { ...c, reportNames: e.target.value.split(",").map(s => s.trim()) } : c)} style={{ ...S.inp, marginBottom: 0 }} placeholder="report.xlsx, extract.csv" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>SLA Definitions</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
              {config.slaDefs.map((sla, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: sla.color, minWidth: 100 }}>{sla.priority}</span>
                  <input type="number" value={sla.hours} onChange={e => { const d = [...config.slaDefs]; d[i] = { ...d[i], hours: Number(e.target.value) }; setConfig(c => c ? { ...c, slaDefs: d } : c); }} style={{ ...S.inp, width: 70, marginBottom: 0, padding: "5px 8px" }} />
                  <span style={{ fontSize: 9, color: "#4D6A8A" }}>hrs</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Custom Rules (one per line)</label>
            <textarea value={config.customRules.join("\n")} onChange={e => setConfig(c => c ? { ...c, customRules: e.target.value.split("\n").filter(Boolean) } : c)} rows={3} style={{ ...S.inp, resize: "vertical" as const }} placeholder="e.g. Meal cap: &#8377;500 per person" />
          </div>
          <button onClick={() => { if (config) memoryManager.saveConfig(selectedWF.id, config); showToast("Configuration saved — will be remembered for future runs", "success"); }} style={{ ...S.hBtn, marginTop: 8, color: "#14B8A6", borderColor: "#14B8A633" }}>💾 Save Configuration</button>
        </div>
        {/* Step overview */}
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF", marginBottom: 10 }}>📋 Workflow Steps ({selectedWF.steps.length})</div>
          {selectedWF.steps.map((step, idx) => (
            <div key={step.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #111827", alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#141F33", border: "1px solid #1C2A40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#14B8A6", flexShrink: 0 }}>{idx + 1}</div>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{step.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF" }}>{step.name}</div>
                <div style={{ fontSize: 9, color: "#4D6A8A", lineHeight: 1.4 }}>{step.description}</div>
                {step.inputs.filter(i => i.required).length > 0 && (
                  <div style={{ fontSize: 8, color: "#F59E0B", marginTop: 2 }}>Requires: {step.inputs.filter(i => i.required).map(i => i.label).join(", ")}</div>
                )}
              </div>
              <span style={S.badge(step.canAuto ? "#10B981" : "#F59E0B")}>{step.canAuto ? "Auto" : "Input"}</span>
            </div>
          ))}
        </div>
        <button onClick={() => startWorkflow(selectedWF, mode)} style={{ ...S.btn, width: "100%" }}>▶ Start Workflow — {mode === "auto" ? "⚡ Automatic" : mode === "guided" ? "🧭 Guided" : "🔒 Manual"}</button>
      </div>
    </div>
  );

  // ─── RUN VIEW ───────────────────────────────────────────────────────────────
  if (view === "run" && selectedWF && currentRun && config) {
    const wf = selectedWF;
    const activeStep = wf.steps.find(s => s.id === activeStepId);
    const stepStatuses = currentRun.steps;

    return (
      <div style={S.page}>
        <div style={S.hdr}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => { setCurrentRun(r => r ? { ...r, status: "cancelled" } : null); setView("library"); }} style={{ ...S.hBtn, color: "#EF4444", borderColor: "#EF444433" }}>✕ Cancel</button>
            <span style={{ fontSize: 18 }}>{wf.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F0F4FF" }}>{wf.name}</div>
              <div style={{ fontSize: 9, color: "#4D6A8A" }}>{mode} mode · {new Date(currentRun.startedAt).toLocaleTimeString()}</div>
            </div>
            <span style={S.badge(currentRun.status === "complete" ? "#10B981" : currentRun.status === "waiting_input" ? "#F59E0B" : currentRun.status === "blocked" ? "#EF4444" : "#14B8A6")}>{currentRun.status.replace("_", " ")}</span>
          </div>
          {/* Step progress bar */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
            {wf.steps.map(step => {
              const sr = stepStatuses[step.id];
              const c = sr?.status === "done" ? "#10B981" : sr?.status === "running" ? "#14B8A6" : sr?.status === "blocked" ? "#EF4444" : sr?.status === "waiting_input" ? "#F59E0B" : "#1C2A40";
              return (
                <button key={step.id} onClick={() => setActiveStepId(step.id)} title={step.name}
                  style={{ fontSize: 8, padding: "3px 8px", borderRadius: 4, border: `1px solid ${c}44`, background: c + "18", color: c, cursor: "pointer", fontFamily: "inherit" }}>
                  {step.icon} {step.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "0 24px 24px" }}>
          {/* Progress log */}
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", marginBottom: 6 }}>Activity Log</div>
            <div style={{ maxHeight: 140, overflowY: "auto" as const }}>
              {progressLog.map((entry, i) => (
                <div key={i} style={{ fontSize: 10, color: entry.startsWith("✓") || entry.startsWith("✅") || entry.startsWith("🎉") ? "#10B981" : entry.startsWith("❌") ? "#EF4444" : entry.startsWith("⏸") ? "#F59E0B" : "#8FA8CC", padding: "2px 0", lineHeight: 1.4 }}>{entry}</div>
              ))}
            </div>
          </div>

          {/* Active step input panel */}
          {activeStep && (stepStatuses[activeStep.id]?.status === "waiting_input" || stepStatuses[activeStep.id]?.status === "pending" || mode !== "auto") && currentRun.status !== "complete" && (
            <div style={{ ...S.card, border: `1px solid ${selectedWF.color}44` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{activeStep.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F4FF" }}>{activeStep.name}</div>
                  <div style={{ fontSize: 10, color: "#4D6A8A" }}>{activeStep.description}</div>
                </div>
              </div>
              {mode === "guided" && activeStep.aiPrompt && (
                <div style={{ fontSize: 10, color: "#8B5CF6", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 5, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  🧭 <strong>Guided:</strong> {activeStep.description} — provide the required data below and the AI will execute this step and explain the results.
                </div>
              )}
              {activeStep.inputs.filter(i => i.required || true).map(inp => {
                const mem = memoryManager.load(wf.id);
                const hasMemory = inp.memoryKey && mem.uploadedData[inp.memoryKey];
                return (
                  <div key={inp.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: inp.required ? "#F59E0B" : "#4D6A8A" }}>{inp.label} {inp.required ? "* Required" : "(optional)"}</label>
                      {hasMemory && <span style={{ ...S.badge("#14B8A6"), fontSize: 8 }}>💾 Loaded from memory</span>}
                    </div>
                    <div style={{ fontSize: 9, color: "#4D6A8A", marginBottom: 4 }}>{inp.description}</div>
                    <textarea value={stepInputs[inp.id] || (hasMemory ? mem.uploadedData[inp.memoryKey!] : "")} onChange={e => setStepInputs(p => ({ ...p, [inp.id]: e.target.value }))} placeholder={`Paste ${inp.label} data here, or upload a file below...`} rows={5} style={{ ...S.inp, resize: "vertical" as const, minHeight: 100 }} />
                    {inp.accepts.some(a => a.startsWith(".")) && (
                      <div style={{ marginTop: 4 }}>
                        <input type="file" id={`file-${inp.id}`} style={{ display: "none" }} accept={inp.accepts.join(",")} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, inp.id); e.target.value = ""; }} />
                        <button onClick={() => document.getElementById(`file-${inp.id}`)?.click()} style={{ ...S.hBtn, fontSize: 9, color: "#3B82F6", borderColor: "#3B82F644" }}>📎 Upload {inp.accepts.join("/")}</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button onClick={provideInput} disabled={running} style={{ ...S.btn, width: "100%", opacity: running ? 0.5 : 1 }}>
                {running ? "⏳ Running..." : mode === "auto" ? "▶ Continue Automatic Execution" : `▶ Run: ${activeStep.name}`}
              </button>
            </div>
          )}

          {/* Completed step outputs */}
          {wf.steps.filter(s => stepStatuses[s.id]?.status === "done" && stepStatuses[s.id]?.output).map(step => (
            <div key={step.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>✓ {step.name}</div>
                <div style={{ fontSize: 9, color: "#4D6A8A" }}>{stepStatuses[step.id]?.completedAt ? new Date(stepStatuses[step.id].completedAt!).toLocaleTimeString() : ""}</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => navigator.clipboard.writeText(stepStatuses[step.id]?.output || "")} style={{ ...S.hBtn, fontSize: 9 }}>📋 Copy</button>
                  <button onClick={() => executorRef.current?.generateDocx(stepStatuses[step.id]?.output || "", step.name, step.name.replace(/\s+/g,"-")+".doc")} style={{ ...S.hBtn, fontSize: 9 }}>↓ DOCX</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#8FA8CC", lineHeight: 1.5, maxHeight: 120, overflow: "hidden", cursor: "pointer" }} onClick={() => { setCurrentRun(r => r ? { ...r } : null); }}>{stepStatuses[step.id]?.output?.slice(0, 500)}...</div>
            </div>
          ))}

          {/* Complete banner */}
          {currentRun.status === "complete" && (
            <div style={{ ...S.card, border: "1px solid #10B98144", background: "rgba(16,185,129,0.05)", textAlign: "center" as const, padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981", marginBottom: 4 }}>Workflow Complete</div>
              <div style={{ fontSize: 11, color: "#4D6A8A", marginBottom: 16 }}>{wf.steps.filter(s => stepStatuses[s.id]?.status === "done").length} of {wf.steps.length} steps completed</div>
              <button onClick={() => setView("library")} style={{ ...S.hBtn, marginRight: 8 }}>← Back to Workflows</button>
              <button onClick={() => { setRuns(loadRuns()); setView("history"); }} style={S.hBtn}>View History</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── HISTORY VIEW ───────────────────────────────────────────────────────────
  if (view === "history") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>Workflow History ({runs.length})</div>
          <button onClick={() => { if (confirm("Clear all history?")) { localStorage.removeItem("oiq-wf-runs"); setRuns([]); } }} style={{ ...S.hBtn, color: "#EF4444", borderColor: "#EF444433", marginLeft: "auto" }}>Clear</button>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        {runs.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center" as const, padding: 40, color: "#4D6A8A" }}>No workflow runs yet.</div>
        ) : runs.map(run => {
          const wf = WORKFLOW_REGISTRY.find(w => w.id === run.workflowId);
          const doneSteps = Object.values(run.steps).filter(s => s.status === "done").length;
          return (
            <div key={run.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 18 }}>{wf?.icon || "🔄"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F4FF" }}>{run.workflowName}</div>
                  <div style={{ fontSize: 9, color: "#4D6A8A" }}>{new Date(run.startedAt).toLocaleString()} · {run.mode} · {doneSteps}/{Object.keys(run.steps).length} steps</div>
                </div>
                <span style={S.badge(run.status === "complete" ? "#10B981" : run.status === "cancelled" ? "#EF4444" : "#F59E0B")}>{run.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── BUILDER VIEW (placeholder — full builder is Phase 2) ──────────────────
  if (view === "builder") return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("library")} style={{ ...S.hBtn, color: "#14B8A6", borderColor: "#14B8A633" }}>← Workflows</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF" }}>⚙ Workflow Builder</div>
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ ...S.card, textAlign: "center" as const, padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF", marginBottom: 8 }}>Custom Workflow Builder</div>
          <div style={{ fontSize: 11, color: "#4D6A8A", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 16px" }}>
            Define your own workflows without writing code.<br />
            Configure: Steps → Inputs → Validations → AI Prompts → Outputs → Dependencies.<br /><br />
            <strong style={{ color: "#14B8A6" }}>Coming in Phase 2.</strong><br />
            For now, use the 10 industry templates above — all are fully configurable.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, maxWidth: 480, margin: "0 auto" }}>
            {["Define Steps","Set Dependencies","Configure Inputs","Add Validations","Write AI Prompts","Set Outputs"].map(f => (
              <div key={f} style={{ background: "#141F33", borderRadius: 6, padding: "8px 10px", fontSize: 9, color: "#4D6A8A" }}>📋 {f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
