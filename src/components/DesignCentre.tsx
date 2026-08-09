// Design Centre — the single place to control how OrchestrIQ looks.
// Renders inside Settings → Theme. Reads themes from lib/design/ThemeStore.
// Purely visual: it sets CSS variables and never touches app logic or data.

import React, { useState, useEffect } from "react";
import {
  THEMES, DENSITY, CORNERS, TEXT_SIZE,
  loadPrefs, savePrefs, applyDesign, Prefs,
} from "../lib/design/ThemeStore";

interface Props { onApplied?: (themeId: string) => void; }

export const DesignCentre: React.FC<Props> = ({ onApplied }) => {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  useEffect(() => { applyDesign(prefs); }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
    applyDesign(next);
    if (patch.themeId && onApplied) onApplied(patch.themeId);
  };

  const L: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: "#8892B0",
    letterSpacing: "0.09em", textTransform: "uppercase",
    marginBottom: 10, display: "block",
  };
  const OPT = (on: boolean): React.CSSProperties => ({
    padding: "7px 13px", borderRadius: 6,
    border: "1px solid " + (on ? "#14B8A6" : "#1a2030"),
    background: on ? "rgba(20,184,166,0.10)" : "transparent",
    color: on ? "#14B8A6" : "#8892B0",
    fontSize: 11.5, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div>
      <p style={{ fontSize: 11.5, color: "#8892B0", marginBottom: 14, lineHeight: 1.65 }}>
        Change how OrchestrIQ looks. Applies instantly across every module and is saved
        for future sessions. Layout, features and data are never changed.
      </p>

      {/* THEMES */}
      <label style={L}>Theme</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
        {THEMES.map(t => {
          const on = prefs.themeId === t.id;
          return (
            <button key={t.id} onClick={() => update({ themeId: t.id })}
              style={{
                display: "flex", flexDirection: "column", gap: 0, padding: 0,
                borderRadius: 9, overflow: "hidden", cursor: "pointer",
                border: "1px solid " + (on ? "#14B8A6" : "#1a2030"),
                background: on ? "rgba(20,184,166,0.06)" : "#0a0e1a",
                fontFamily: "inherit", textAlign: "left",
              }}>
              <div style={{ display: "flex", height: 26 }}>
                {t.swatch.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
              </div>
              <div style={{ padding: "9px 11px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: on ? "#14B8A6" : "#F1F5F9", marginBottom: 3 }}>
                  {t.icon} {t.name}{on ? " ✓" : ""}
                </div>
                <div style={{ fontSize: 9.5, color: "#5A6480", lineHeight: 1.45 }}>{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ADJUSTMENTS */}
      <label style={L}>Text size</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(Object.keys(TEXT_SIZE) as Array<keyof typeof TEXT_SIZE>).map(k => (
          <button key={k} onClick={() => update({ textSize: k })} style={OPT(prefs.textSize === k)}>
            {TEXT_SIZE[k].name}
          </button>
        ))}
      </div>

      <label style={L}>Density</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(Object.keys(DENSITY) as Array<keyof typeof DENSITY>).map(k => (
          <button key={k} onClick={() => update({ density: k })} style={OPT(prefs.density === k)}>
            {DENSITY[k].name}
          </button>
        ))}
      </div>

      <label style={L}>Corners</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {(Object.keys(CORNERS) as Array<keyof typeof CORNERS>).map(k => (
          <button key={k} onClick={() => update({ corners: k })} style={OPT(prefs.corners === k)}>
            {CORNERS[k].name}
          </button>
        ))}
      </div>

      <div style={{
        background: "#0a0e1a", border: "1px solid #1a2030", borderRadius: 8,
        padding: "11px 13px", fontSize: 10.5, color: "#5A6480", lineHeight: 1.6,
      }}>
        Themes are built from professionally specified palettes with checked colour
        contrast. More themes can be added later without changing any module code.
      </div>
    </div>
  );
};

export default DesignCentre;
