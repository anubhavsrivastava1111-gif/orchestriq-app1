import { useState, useEffect, useCallback, useRef } from "react";
import { loadRecords, estimateCost, type TokenRecord } from "../TokenAnalytics";

// ─── CENTRAL PRICING CONFIG ────────────────────────────────────────────────
// Adding a new provider = add one entry here. Nothing else changes.
export const PROVIDER_PRICING: Record<string, { label: string; inputPer1M: number; outputPer1M: number; currency: string }> = {
  groq:      { label: "Groq (free)",      inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
  gemini:    { label: "Gemini Flash",     inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
  claude:    { label: "Claude Haiku",     inputPer1M: 0.25,  outputPer1M: 1.25,  currency: "USD" },
  openai:    { label: "GPT-4o",           inputPer1M: 2.50,  outputPer1M: 10.0,  currency: "USD" },
  deepseek:  { label: "DeepSeek Chat",    inputPer1M: 0.14,  outputPer1M: 0.28,  currency: "USD" },
  kimi:      { label: "Kimi Moonshot",    inputPer1M: 0.12,  outputPer1M: 0.12,  currency: "USD" },
  stability: { label: "Stability AI",     inputPer1M: 0,     outputPer1M: 0,     currency: "USD" },
};

function fmt(n: number): string {
  return (n ?? 0) >= 1_000_000 ? ((n ?? 0) / 1_000_000).toFixed(1) + "M"
       : (n ?? 0) >= 1_000     ? ((n ?? 0) / 1_000).toFixed(1) + "K"
       : String(n ?? 0);
}
function fmtCost(c: number): string {
  if (!c || c === 0) return "Free";
  if (c < 0.001) return "<$0.001";
  return "$" + (c ?? 0).toFixed(3);
}

const POS_KEY = "oiq-tok-pos";

export default function TokenBadge({
  defP,
  setDefP,
  keys,
  onOpen,
}: {
  defP: string;
  setDefP: (p: string) => void;
  keys: Record<string, string>;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<TokenRecord[]>([]);

  // ── DRAGGABLE STATE ──────────────────────────────────────────────────────
  const getInitPos = () => {
    try {
      const s = localStorage.getItem(POS_KEY);
      if (s) return JSON.parse(s);
    } catch {}
    return { x: Math.max(0, window.innerWidth - 200), y: Math.max(0, window.innerHeight - 60) };
  };
  const [pos, setPos] = useState<{ x: number; y: number }>(getInitPos);
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't interfere with button/select clicks
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "INPUT") return;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    setDragging(true);
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragStartPos.current.x);
      const dy = Math.abs(e.clientY - dragStartPos.current.y);
      if (dx > 4 || dy > 4) didDrag.current = true;
      const nx = Math.max(0, Math.min(window.innerWidth - 180, e.clientX - offset.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - 44, e.clientY - offset.current.y));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      setDragging(false);
      setPos(p => {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
        return p;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // ── DATA ─────────────────────────────────────────────────────────────────
  const reload = useCallback(() => setRecords(loadRecords()), []);
  useEffect(() => {
    reload();
    window.addEventListener("oiq-token-update", reload);
    return () => window.removeEventListener("oiq-token-update", reload);
  }, [reload]);

  const today = new Date().toDateString();
  const todayRec = records.filter(r => new Date(r.ts).toDateString() === today);
  const sessionStart = records.length > 0 ? new Date(records[records.length - 1].ts).getTime() : 0;

  const totalIn = records.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const totalOut = records.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  const totalCost = records.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const totalTok = totalIn + totalOut;

  const todayCost = todayRec.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const todayTok = todayRec.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);

  // Provider breakdown
  const byProvider: Record<string, { tokens: number; cost: number; calls: number }> = {};
  records.forEach(r => {
    if (!byProvider[r.provider]) byProvider[r.provider] = { tokens: 0, cost: 0, calls: 0 };
    byProvider[r.provider].tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
    byProvider[r.provider].cost += (r.costUsd ?? 0);
    byProvider[r.provider].calls++;
  });

  const activeKeys = Object.keys(keys).filter(k => keys[k]?.trim());

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9990,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {/* BADGE */}
      <button
        onClick={() => {
          if (didDrag.current) return; // ignore click if we dragged
          if (onOpen) { onOpen(); return; }
          setOpen(o => !o);
        }}
        style={{
          background: open ? "#14B8A6" : "#0F1829",
          border: "1px solid " + (open ? "#14B8A6" : "#1C2A40"),
          borderRadius: 24,
          padding: "7px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: dragging ? "grabbing" : "pointer",
          fontFamily: "'Inter',-apple-system,sans-serif",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          transition: "background 0.2s,border 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 14 }}>🔢</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: open ? "#0a0e1a" : "#F0F4FF" }}>
          {fmt(totalTok)} tokens
        </span>
        {totalCost > 0 && (
          <span style={{ fontSize: 10, color: open ? "#0a0e1a" : "#14B8A6", fontWeight: 600 }}>
            {fmtCost(totalCost)}
          </span>
        )}
      </button>

      {/* MINI PANEL — shows when open and onOpen not provided */}
      {open && !onOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "#0F1829",
            border: "1px solid #1C2A40",
            borderRadius: 12,
            padding: 16,
            fontFamily: "'Inter',-apple-system,sans-serif",
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            zIndex: 9991,
          }}
          onMouseDown={e => e.stopPropagation()} // don't drag when clicking panel
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F4FF" }}>🔢 Token Usage</div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4D6A8A", fontSize: 16, cursor: "pointer" }}>×</button>
          </div>

          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              ["Today", fmt(todayTok), fmtCost(todayCost), "#14B8A6"],
              ["All Time", fmt(totalTok), fmtCost(totalCost), "#8B5CF6"],
            ].map(([lb, tok, cost, c]) => (
              <div key={lb as string} style={{ background: "#141F33", borderRadius: 7, padding: "10px 8px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{lb}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: c as string }}>{tok}</div>
                <div style={{ fontSize: 10, color: "#8FA8CC" }}>{cost}</div>
              </div>
            ))}
          </div>

          {/* Provider breakdown */}
          {Object.keys(byProvider).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4D6A8A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>By Provider</div>
              {Object.entries(byProvider).map(([prov, d]) => (
                <div key={prov} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", borderBottom: "1px solid #1C2A40" }}>
                  <span style={{ color: "#8FA8CC", fontWeight: 600, textTransform: "uppercase" }}>{prov}</span>
                  <span style={{ color: "#F0F4FF" }}>{fmt(d.tokens)} · {fmtCost(d.cost)} · {d.calls} calls</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent calls */}
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {records.slice(0, 10).map(r => (
              <div key={r.id} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #1C2A40", fontSize: 10 }}>
                <span style={{ color: "#14B8A6", fontWeight: 600, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.feature?.slice(0, 18)}</span>
                <span style={{ color: "#4D6A8A", minWidth: 55 }}>{r.provider}</span>
                <span style={{ color: "#8FA8CC", flex: 1 }}>↑{fmt(r.inputTokens)} ↓{fmt(r.outputTokens)}</span>
                <span style={{ color: r.costUsd === 0 ? "#10B981" : "#F0F4FF", fontWeight: 600 }}>{fmtCost(r.costUsd)}</span>
              </div>
            ))}
          </div>

          {records.length === 0 && (
            <div style={{ fontSize: 10, color: "#2D4460", textAlign: "center", paddingTop: 8 }}>
              Use any AI feature to start tracking
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1C2A40", fontSize: 9, color: "#2D4460", textAlign: "center" }}>
            Drag to reposition · Click to go to full analytics
          </div>
        </div>
      )}
    </div>
  );
}
