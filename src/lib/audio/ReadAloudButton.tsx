// ReadAloudButton — the universal, drop-in Read Aloud control.
// Any module renders: <ReadAloudButton text={aiResponse} id="unique-id" />
// It shows a speaker icon; clicking opens inline playback controls.
// Only one narration plays app-wide (enforced by the shared engine).

import React, { useState } from "react";
import { Volume2, Pause, Play, Square, RotateCcw, ChevronsRight, ChevronsLeft } from "lucide-react";
import { useReadAloud } from "../lib/audio/useReadAloud";
import { SPEED_OPTIONS } from "../lib/audio/VoiceManager";

interface Props {
  text: string;
  id: string;               // stable unique id for this content block
  compact?: boolean;        // icon-only until playing
  className?: string;
}

export const ReadAloudButton: React.FC<Props> = ({ text, id, compact = true, className }) => {
  const ra = useReadAloud();
  const [open, setOpen] = useState(false);
  const clean = (text || "").trim();
  if (!clean) return null;                 // button appears only when readable text exists
  if (!ra.isAvailable) return null;        // no engine → no button (graceful)

  const active = ra.status.sessionId === id;
  const playing = active && ra.status.state === "playing";
  const paused = active && ra.status.state === "paused";
  const pct = active && ra.status.charTotal
    ? Math.min(100, Math.round((ra.status.charSpoken / ra.status.charTotal) * 100))
    : 0;
  const eta = active ? ra.status.etaSeconds : 0;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const onPrimary = () => {
    if (playing) ra.pause();
    else if (paused) ra.resume();
    else { ra.play(clean, id); setOpen(true); }
  };

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 6, border: "1px solid #1a2030",
    background: "transparent", color: "#94A3B8", cursor: "pointer",
  };

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={onPrimary}
        aria-label={playing ? "Pause narration" : "Read aloud"}
        title={playing ? "Pause" : "Read aloud"}
        style={{ ...iconBtn, color: active ? "#14B8A6" : "#94A3B8",
                 borderColor: active ? "#14B8A6" : "#1a2030" }}
      >
        {playing ? <Pause size={15} /> : paused ? <Play size={15} /> : <Volume2 size={15} />}
      </button>

      {active && (open || playing || paused) && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                       padding: "3px 6px", borderRadius: 8, background: "#0a0e1a",
                       border: "1px solid #1a2030" }}>
          <button onClick={ra.skipBack} aria-label="Back 12 seconds" title="Back 12s" style={iconBtn}><ChevronsLeft size={14} /></button>
          <button onClick={ra.restart} aria-label="Restart" title="Restart" style={iconBtn}><RotateCcw size={13} /></button>
          <button onClick={ra.skipForward} aria-label="Forward 12 seconds" title="Forward 12s" style={iconBtn}><ChevronsRight size={14} /></button>
          <button onClick={ra.stop} aria-label="Stop" title="Stop" style={iconBtn}><Square size={12} /></button>
          <span style={{ fontSize: 10, color: "#64748B", minWidth: 66, textAlign: "center" }}>
            {pct}% · {mmss(eta)} left
          </span>
          <select
            value={ra.status ? undefined : undefined}
            onChange={(e) => ra.setRate(parseFloat(e.target.value))}
            defaultValue={String(ra.prefs.getRate())}
            aria-label="Playback speed"
            title="Speed"
            style={{ fontSize: 10, background: "#0a0e1a", color: "#A0AAC0",
                     border: "1px solid #1a2030", borderRadius: 5, padding: "2px 4px", cursor: "pointer" }}
          >
            {SPEED_OPTIONS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </span>
      )}
      {active && ra.status.error && (
        <span style={{ fontSize: 10, color: "#DC2626" }}>{ra.status.error}</span>
      )}
    </span>
  );
};

export default ReadAloudButton;
