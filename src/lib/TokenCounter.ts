import { BENCHMARK_MODE } from "./ContextCompressor";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface LevelBenchmarkEntry {
  level: number;
  agent_role: string;
  agent_full_title: string;
  provider: string;
  mode_a_input_tokens: number;
  mode_a_output_tokens: number;
  mode_a_total_tokens: number;
  mode_a_context_chars: number;
  mode_b_input_tokens: number;
  mode_b_output_tokens: number;
  mode_b_total_tokens: number;
  mode_b_context_chars: number;
  compression_tokens_used: number;
  compression_ratio: number;
  net_token_saving: number;
  execution_duration_ms: number;
  provider_failures: number;
  retry_count: number;
  quality_score: number | null;
  quality_notes: string;
}

export interface BenchmarkSession {
  session_id: string;
  workflow_id: string;
  chain_label: string;
  task_preview: string;
  compression_enabled: boolean;
  started_at: string;
  completed_at: string | null;
  levels: LevelBenchmarkEntry[];
  total_mode_a_tokens: number;
  total_mode_b_tokens: number;
  total_compression_tokens: number;
  total_net_saving: number;
  total_provider_failures: number;
  total_retries: number;
  total_duration_ms: number;
  rate_limit_hit: boolean;
}

const sessions: BenchmarkSession[] = [];

export function getBenchmarkSessions(): BenchmarkSession[] {
  return sessions;
}

export function clearBenchmarkSessions(): void {
  sessions.length = 0;
  if (BENCHMARK_MODE) console.log("[BENCHMARK] Sessions cleared.");
}

export function startBenchmarkSession(params: {
  workflowId: string;
  chainLabel: string;
  task: string;
  compressionEnabled: boolean;
}): BenchmarkSession {
  const session: BenchmarkSession = {
    session_id: `bench_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    workflow_id: params.workflowId,
    chain_label: params.chainLabel,
    task_preview: params.task.slice(0, 80),
    compression_enabled: params.compressionEnabled,
    started_at: new Date().toISOString(),
    completed_at: null,
    levels: [],
    total_mode_a_tokens: 0,
    total_mode_b_tokens: 0,
    total_compression_tokens: 0,
    total_net_saving: 0,
    total_provider_failures: 0,
    total_retries: 0,
    total_duration_ms: 0,
    rate_limit_hit: false,
  };
  sessions.push(session);
  if (BENCHMARK_MODE) {
    console.group(`%c[BENCHMARK] Session started — ${params.chainLabel}`,"color:#14B8A6;font-weight:bold");
    console.log("Session ID:", session.session_id);
    console.log("Task:", session.task_preview);
    console.log("Compression:", params.compressionEnabled ? "ENABLED" : "DISABLED");
    console.groupEnd();
  }
  return session;
}

export function completeBenchmarkSession(session: BenchmarkSession): void {
  session.completed_at = new Date().toISOString();
  session.total_mode_a_tokens = session.levels.reduce((s,l) => s+l.mode_a_total_tokens, 0);
  session.total_mode_b_tokens = session.levels.reduce((s,l) => s+l.mode_b_total_tokens, 0);
  session.total_compression_tokens = session.levels.reduce((s,l) => s+l.compression_tokens_used, 0);
  session.total_net_saving = session.levels.reduce((s,l) => s+l.net_token_saving, 0);
  session.total_provider_failures = session.levels.reduce((s,l) => s+l.provider_failures, 0);
  session.total_retries = session.levels.reduce((s,l) => s+l.retry_count, 0);
  session.total_duration_ms = session.levels.reduce((s,l) => s+l.execution_duration_ms, 0);
  if (BENCHMARK_MODE) printSessionSummary(session);
}

export function markRateLimitHit(session: BenchmarkSession): void {
  session.rate_limit_hit = true;
  if (BENCHMARK_MODE) console.warn("[BENCHMARK] Rate limit hit.");
}

export function logLevelBenchmark(session: BenchmarkSession, entry: LevelBenchmarkEntry): void {
  session.levels.push(entry);
  if (!BENCHMARK_MODE) return;
  const pct = entry.mode_a_total_tokens > 0
    ? Math.round((entry.net_token_saving / entry.mode_a_total_tokens) * 100) : 0;
  console.group(`%c[BENCHMARK] Level ${entry.level} — ${entry.agent_role}`,"color:#8892B0;font-weight:bold");
  console.log("Provider:", entry.provider, "| Duration:", entry.execution_duration_ms+"ms");
  console.group("Mode A (Full)");
  console.log("Input:", entry.mode_a_input_tokens, "| Output:", entry.mode_a_output_tokens, "| Total:", entry.mode_a_total_tokens, "| Chars:", entry.mode_a_context_chars);
  console.groupEnd();
  console.group("Mode B (Compressed)");
  console.log("Input:", entry.mode_b_input_tokens, "| Output:", entry.mode_b_output_tokens, "| Total:", entry.mode_b_total_tokens, "| Chars:", entry.mode_b_context_chars);
  console.log("Compression cost:", entry.compression_tokens_used, "| Ratio:", entry.compression_ratio+"×");
  console.groupEnd();
  console.log(`%cNet saving: ${entry.net_token_saving} tokens (${pct}% reduction)`, entry.net_token_saving > 0 ? "color:#10B981;font-weight:bold" : "color:#EF4444");
  console.groupEnd();
}

function printSessionSummary(session: BenchmarkSession): void {
  const pct = session.total_mode_a_tokens > 0
    ? Math.round((session.total_net_saving / session.total_mode_a_tokens) * 100) : 0;
  console.group(`%c[BENCHMARK] SESSION COMPLETE — ${session.chain_label}`,"color:#14B8A6;font-weight:bold");
  console.log("ID:", session.session_id, "| Compression:", session.compression_enabled ? "ON" : "OFF");
  console.log("Duration:", session.total_duration_ms+"ms | Rate limit:", session.rate_limit_hit ? "YES" : "No");
  console.log("Mode A total:", session.total_mode_a_tokens, "tokens");
  console.log("Mode B total:", session.total_mode_b_tokens, "tokens");
  console.log("Compression overhead:", session.total_compression_tokens, "tokens");
  console.log(`%cNet saving: ${session.total_net_saving} tokens (${pct}% reduction)`,"color:#10B981;font-weight:bold");
  console.table(session.levels.map(l => ({
    Level: l.level, Role: l.agent_role,
    "Mode A": l.mode_a_total_tokens, "Mode B": l.mode_b_total_tokens,
    "Cost": l.compression_tokens_used, "Saving": l.net_token_saving,
    "Ratio": l.compression_ratio+"×", "ms": l.execution_duration_ms,
    "Quality": l.quality_score ?? "unscored",
  })));
  console.groupEnd();
}

export function scoreLevel(sessionId: string, levelNumber: number, score: 1|2|3|4|5, notes: string = ""): void {
  const session = sessions.find(s => s.session_id === sessionId);
  if (!session) { console.error("[BENCHMARK] Session not found:", sessionId); return; }
  const level = session.levels.find(l => l.level === levelNumber);
  if (!level) { console.error("[BENCHMARK] Level not found:", levelNumber); return; }
  level.quality_score = score;
  level.quality_notes = notes;
  console.log(`%c[BENCHMARK] Level ${levelNumber} scored: ${score}/5`,"color:#14B8A6;font-weight:bold");
}

export function attachBenchmarkToWindow(): void {
  if (typeof window === "undefined") return;
  (window as any).benchmark = {
    sessions: getBenchmarkSessions,
    score: scoreLevel,
    clear: clearBenchmarkSessions,
    export: () => {
      const data = JSON.stringify(getBenchmarkSessions(), null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `benchmark-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log("[BENCHMARK] Exported.");
    },
    help: () => {
      console.log("[BENCHMARK] Commands:\n  window.benchmark.sessions()\n  window.benchmark.score(sessionId, level, 1-5, notes)\n  window.benchmark.clear()\n  window.benchmark.export()\n  window.benchmark.help()");
    },
  };
  if (BENCHMARK_MODE) {
    console.log("%c[BENCHMARK] Active. Type window.benchmark.help() for commands.","color:#14B8A6;font-weight:bold");
  }
}
