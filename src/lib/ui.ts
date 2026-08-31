// src/lib/ui.ts
// ─────────────────────────────────────────────────────────────────────────────
// ONE PLACE FOR TABLE AND PANEL STYLING
//
// Why this file exists: AdminConsole, MyAccount and SupportWidget each declared
// their own colours and their own table styles. Three copies of the same
// intention drift apart the moment one is edited, which is exactly why columns
// looked different from screen to screen and numbers did not line up.
//
// The rules encoded here are the ones that separate a considered interface from
// an amateur one:
//
//  1. FIXED COLUMN LAYOUT. Without tableLayout:"fixed" a browser sizes columns
//     from whatever happens to be inside them, so the same table jumps around
//     as data changes. Fixed layout means a heading and its column stay in the
//     same place, always.
//  2. NUMBERS RIGHT-ALIGNED, TEXT LEFT-ALIGNED. Right-aligned figures line up
//     on their units, so 9 and 1,240 are instantly comparable. Left-aligned
//     numbers are the single most common reason a table looks wrong.
//  3. TABULAR FIGURES. Most fonts give "1" less width than "8", so columns of
//     numbers look ragged. font-variant-numeric fixes that.
//  4. ONE ROW HEIGHT, ONE PADDING, EVERYWHERE.
//  5. NO WRAPPING IN NARROW CELLS. A wrapped cell pushes its whole row taller
//     and breaks the horizontal rhythm.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  bg:     "#070B14",
  panel:  "#0F1420",
  raised: "#0A0E1A",
  line:   "#1A2030",
  ink:    "#F1F5F9",
  dim:    "#A0AAC0",
  faint:  "#5A6480",
  teal:   "#14B8A6",
  amber:  "#F59E0B",
  red:    "#EF4444",
  green:  "#22C55E",
};

const MONO = '"SF Mono",Menlo,Consolas,monospace';

/** Page wrapper. Scrolls on its own so long screens are never cut off. */
export const page: React.CSSProperties = {
  flex: 1, height: "100%", overflowY: "auto",
  padding: 16, background: C.bg, color: C.ink,
  fontFamily: "Manrope,system-ui,sans-serif",
};

export const card: React.CSSProperties = {
  background: C.panel, border: "1px solid " + C.line, borderRadius: 8,
  padding: 14, marginBottom: 14, color: C.ink,
};

export const h1: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 3 };
export const sub: React.CSSProperties = { fontSize: 9.5, color: C.faint, marginBottom: 12, lineHeight: 1.55 };
export const label: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase",
  letterSpacing: 0.6, display: "block", marginBottom: 4,
};

/** Wrap every table in this. It is what stops a wide table breaking the page. */
export const tableWrap: React.CSSProperties = {
  overflowX: "auto", border: "1px solid " + C.line, borderRadius: 6,
  background: C.panel,
};

export const table: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  // The rule that keeps a heading above its own column.
  tableLayout: "fixed",
  background: C.panel, color: C.ink,
  fontVariantNumeric: "tabular-nums",
};

/** Header cell. `align` should match the cell beneath it, always. */
export const th = (align: "left" | "right" | "center" = "left", width?: number | string): React.CSSProperties => ({
  fontSize: 8.5, fontWeight: 800, color: C.dim, background: C.raised,
  textTransform: "uppercase", letterSpacing: 0.6,
  textAlign: align, padding: "8px 10px",
  borderBottom: "1px solid " + C.line,
  width, whiteSpace: "nowrap",
  position: "sticky", top: 0, zIndex: 1,
});

/** Body cell. Pass "right" for anything numeric. */
export const td = (align: "left" | "right" | "center" = "left", opts: { mono?: boolean; wrap?: boolean; dim?: boolean } = {}): React.CSSProperties => ({
  fontSize: 10.5, padding: "9px 10px", textAlign: align,
  borderBottom: "1px solid " + C.line,
  color: opts.dim ? C.dim : C.ink,
  verticalAlign: "middle",
  fontFamily: opts.mono ? MONO : undefined,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: opts.wrap ? "normal" : "nowrap",
  overflow: opts.wrap ? undefined : "hidden",
  textOverflow: opts.wrap ? undefined : "ellipsis",
  lineHeight: 1.5,
});

export const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: C.raised,
  border: "1px solid " + C.line, borderRadius: 5,
  color: C.ink, fontSize: 11, boxSizing: "border-box",
  fontFamily: "inherit",
};

export const btn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 5, fontSize: 10.5, fontWeight: 700,
  cursor: "pointer", border: "1px solid " + C.line,
  background: C.raised, color: C.ink, fontFamily: "inherit", whiteSpace: "nowrap",
};

export const btnPrimary: React.CSSProperties = {
  ...btn, background: C.teal, color: "#04070F",
  border: "1px solid " + C.teal, fontWeight: 800,
};

/**
 * A headline number with its caption. Used for the figures at the top of a
 * panel. Fixed minimum width so a row of them stays evenly spaced instead of
 * shuffling as the numbers change length.
 */
export const stat = { minWidth: 96 } as React.CSSProperties;
export const statValue = (colour = C.ink): React.CSSProperties => ({
  fontSize: 20, fontWeight: 800, color: colour,
  fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
});
export const statLabel: React.CSSProperties = {
  fontSize: 8.5, color: C.faint, textTransform: "uppercase",
  letterSpacing: 0.6, marginTop: 2, whiteSpace: "nowrap",
};
export const statRow: React.CSSProperties = {
  display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-start",
};

/** Thousands separators, and never the word "NaN" in front of a customer. */
export const num = (v: any): string => {
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString("en-IN") : "0";
};

export const money = (v: any, sym = "\u20B9"): string => {
  const x = Number(v);
  if (!Number.isFinite(x)) return sym + "0";
  return sym + x.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export const pill = (tone: "teal" | "amber" | "faint" | "green" | "red" = "faint"): React.CSSProperties => {
  const col = tone === "teal" ? C.teal : tone === "amber" ? C.amber
            : tone === "green" ? C.green : tone === "red" ? C.red : C.faint;
  return {
    fontSize: 8.5, fontWeight: 800, padding: "2px 7px", borderRadius: 3,
    background: col + "22", color: col, whiteSpace: "nowrap",
    letterSpacing: 0.4, display: "inline-block",
  };
};

export default { C, page, card, h1, sub, label, tableWrap, table, th, td,
                 input, btn, btnPrimary, stat, statValue, statLabel, statRow,
                 num, money, pill };
