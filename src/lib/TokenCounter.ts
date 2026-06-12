  console.log("Retries:", session.total_retries);
  console.groupEnd();

  // Per-level table
  console.group("Per-Level Breakdown");
  console.table(
    session.levels.map(l => ({
      Level: l.level,
      Role: l.agent_role,
      "Mode A Tokens": l.mode_a_total_tokens,
      "Mode B Tokens": l.mode_b_total_tokens,
      "Compression Cost": l.compression_tokens_used,
      "Net Saving": l.net_token_saving,
      "Ratio": l.compression_ratio + "×",
      "Duration ms": l.execution_duration_ms,
      "Failures": l.provider_failures,
      "Quality": l.quality_score ?? "unscored",
    }))
  );
  console.groupEnd();

  console.log(
    "%c[BENCHMARK] Copy this session object for records:",
    "color:#8892B0"
  );
  console.log(JSON.stringify(session, null, 2));

  console.groupEnd();
}

// ─── MANUAL QUALITY SCORING ───────────────────────────────────────────────────
// Call this from the browser console after reviewing a level output.
// Example: scoreLevel("bench_123_abc", 3, 4, "Context retention good, numbers preserved")
//
// Score guide:
//   5 — Output references prior decisions accurately, adds new value, no hallucination
//   4 — Mostly accurate context, minor gaps
//   3 — Context partially maintained, some decisions from prior levels missing
//   2 — Significant context loss, output could be from a standalone prompt
//   1 — No meaningful use of prior context

export function scoreLevel(
  sessionId: string,
  levelNumber: number,
  score: 1 | 2 | 3 | 4 | 5,
  notes: string = ""
): void {
  const session = sessions.find(s => s.session_id === sessionId);
  if (!session) {
    console.error("[BENCHMARK] Session not found:", sessionId);
    return;
  }

  const level = session.levels.find(l => l.level === levelNumber);
  if (!level) {
    console.error("[BENCHMARK] Level not found:", levelNumber);
    return;
  }

  level.quality_score = score;
  level.quality_notes = notes;

  console.log(
    `%c[BENCHMARK] Level ${levelNumber} scored: ${score}/5`,
    "color:#14B8A6;font-weight:bold"
  );
  if (notes) console.log("Notes:", notes);
}

// ─── EXPORT FOR CONSOLE ACCESS ────────────────────────────────────────────────
// Attach to window so Anubhav can call these from DevTools console directly.
// Usage in browser console:
//   window.benchmark.sessions()     → see all sessions
//   window.benchmark.score(id, lvl, score, notes) → score a level
//   window.benchmark.clear()        → clear all sessions
//   window.benchmark.export()       → download sessions as JSON

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
      console.log(`
[BENCHMARK] Available commands:
  window.benchmark.sessions()
    → Returns all benchmark sessions recorded this page load.

  window.benchmark.score(sessionId, levelNumber, score, notes)
    → Score a level output for quality after manual review.
    → score: 1 (no context) to 5 (perfect context retention)
    → Example: window.benchmark.score("bench_123_abc", 3, 4, "Good")

  window.benchmark.clear()
    → Clears all sessions from memory.

  window.benchmark.export()
    → Downloads all sessions as a JSON file.

  window.benchmark.help()
    → Shows this message.
      `);
    },
  };

  if (BENCHMARK_MODE) {
    console.log(
      "%c[BENCHMARK] Mode active. Type window.benchmark.help() for commands.",
      "color:#14B8A6;font-weight:bold"
    );
  }
}
