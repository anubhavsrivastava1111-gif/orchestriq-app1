// OrchestrIQ Design Control Centre — Theme Store
// Themes derived from ui-ux-pro-max (MIT licence, Next Level Builder):
// professionally specified palettes with WCAG-checked contrast, plus curated
// Google Font pairings. Every module reads from here — one source of truth.

export interface Theme {
  id: string;
  name: string;
  icon: string;
  desc: string;
  mode: "light" | "dark";
  swatch: string[];              // 4 colours for the preview strip
  fonts: { heading: string; body: string };
  c: {
    // Canvas
    bg: string; surface: string; surface2: string; border: string;
    // Sidebar / chrome
    sbBg: string; sbBorder: string; sbText: string; sbDim: string;
    sbActive: string; sbActiveText: string;
    // Text
    ink: string; body: string; muted: string; faint: string;
    // Brand + semantic
    accent: string; accentText: string;
    success: string; warning: string; danger: string; info: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: "editorial", name: "Executive Editorial", icon: "📜", mode: "light",
    desc: "Warm cream with forest green and gold. Serif headings. Reads as a considered consulting deliverable.",
    swatch: ["#1C2A24", "#C9A961", "#FBFAF8", "#E4E0D8"],
    fonts: { heading: "Fraunces", body: "Inter" },
    c: { bg:"#EDEAE3", surface:"#FFFFFF", surface2:"#F7F5F1", border:"#E4E0D8",
      sbBg:"#1C2A24", sbBorder:"#2C3D35", sbText:"#B9C9C0", sbDim:"#7E9689",
      sbActive:"#C9A961", sbActiveText:"#1C2A24",
      ink:"#1C2A24", body:"#4A453D", muted:"#8A8378", faint:"#B5AEA2",
      accent:"#C9A961", accentText:"#1C2A24",
      success:"#3D6B4E", warning:"#8A6A24", danger:"#B54A3A", info:"#2F5D7C" },
  },
  {
    id: "consulting", name: "Consulting Navy", icon: "🏛", mode: "light",
    desc: "Deep navy with blue accent on white. The classic strategy-firm readout.",
    swatch: ["#0F172A", "#2563EB", "#FFFFFF", "#E2E8F0"],
    fonts: { heading: "Inter", body: "Inter" },
    c: { bg:"#F8FAFC", surface:"#FFFFFF", surface2:"#F1F5F9", border:"#E2E8F0",
      sbBg:"#0F172A", sbBorder:"#1E293B", sbText:"#CBD5E1", sbDim:"#94A3B8",
      sbActive:"#2563EB", sbActiveText:"#FFFFFF",
      ink:"#0F172A", body:"#334155", muted:"#64748B", faint:"#94A3B8",
      accent:"#2563EB", accentText:"#FFFFFF",
      success:"#059669", warning:"#D97706", danger:"#DC2626", info:"#0369A1" },
  },
  {
    id: "analytics", name: "Analytics Blue", icon: "📊", mode: "light",
    desc: "Bright analytical blue with amber highlights. Built for charts and comparison.",
    swatch: ["#1E40AF", "#D97706", "#FFFFFF", "#DBEAFE"],
    fonts: { heading: "Lexend", body: "Source Sans 3" },
    c: { bg:"#F8FAFC", surface:"#FFFFFF", surface2:"#F1F6FC", border:"#DBEAFE",
      sbBg:"#1E3A8A", sbBorder:"#1E40AF", sbText:"#C7D9F5", sbDim:"#8FAEDD",
      sbActive:"#D97706", sbActiveText:"#FFFFFF",
      ink:"#1E3A8A", body:"#334155", muted:"#64748B", faint:"#94A3B8",
      accent:"#1E40AF", accentText:"#FFFFFF",
      success:"#059669", warning:"#D97706", danger:"#DC2626", info:"#3B82F6" },
  },
  {
    id: "banking", name: "Institutional Gold", icon: "🏦", mode: "light",
    desc: "Near-black navy with restrained gold. Traditional finance authority.",
    swatch: ["#0F172A", "#A16207", "#FFFFFF", "#E8ECF1"],
    fonts: { heading: "EB Garamond", body: "Lato" },
    c: { bg:"#F8FAFC", surface:"#FFFFFF", surface2:"#F1F4F8", border:"#E2E8F0",
      sbBg:"#0F172A", sbBorder:"#1E3A8A", sbText:"#CBD5E1", sbDim:"#8FA3BC",
      sbActive:"#A16207", sbActiveText:"#FFFFFF",
      ink:"#020617", body:"#334155", muted:"#64748B", faint:"#94A3B8",
      accent:"#A16207", accentText:"#FFFFFF",
      success:"#059669", warning:"#D97706", danger:"#DC2626", info:"#1E3A8A" },
  },
  {
    id: "swiss", name: "Swiss Minimal", icon: "⬜", mode: "light",
    desc: "Monochrome, generous whitespace, sharp corners. Content leads, interface disappears. WCAG AAA.",
    swatch: ["#000000", "#1A1A1A", "#FFFFFF", "#E5E5E5"],
    fonts: { heading: "Inter", body: "Inter" },
    c: { bg:"#FFFFFF", surface:"#FFFFFF", surface2:"#F5F5F5", border:"#E5E5E5",
      sbBg:"#000000", sbBorder:"#262626", sbText:"#D4D4D4", sbDim:"#8A8A8A",
      sbActive:"#FFFFFF", sbActiveText:"#000000",
      ink:"#0A0A0A", body:"#1A1A1A", muted:"#6B6B6B", faint:"#9A9A9A",
      accent:"#1A1A1A", accentText:"#FFFFFF",
      success:"#166534", warning:"#854D0E", danger:"#991B1B", info:"#1E3A8A" },
  },
  {
    id: "midnight", name: "Midnight", icon: "🌙", mode: "dark",
    desc: "The dark theme you have today. Low-light focus, preserved exactly.",
    swatch: ["#0F1117", "#14B8A6", "#151C2C", "#1E2537"],
    fonts: { heading: "Inter", body: "Inter" },
    c: { bg:"#0C0F18", surface:"#151C2C", surface2:"#111826", border:"#1E2537",
      sbBg:"#0F1117", sbBorder:"#1E2537", sbText:"#A0AAC0", sbDim:"#5A6480",
      sbActive:"#14B8A6", sbActiveText:"#0A0E1A",
      ink:"#F1F5F9", body:"#A0AAC0", muted:"#5A6480", faint:"#3A4060",
      accent:"#14B8A6", accentText:"#0A0E1A",
      success:"#10B981", warning:"#F59E0B", danger:"#EF4444", info:"#3B82F6" },
  },
  {
    id: "finance-dark", name: "Financial Terminal", icon: "📈", mode: "dark",
    desc: "Deep slate with profit-green accents. Trading-desk density for numbers.",
    swatch: ["#020617", "#22C55E", "#0E1223", "#334155"],
    fonts: { heading: "Inter", body: "Inter" },
    c: { bg:"#020617", surface:"#0E1223", surface2:"#151B30", border:"#334155",
      sbBg:"#0B0F1C", sbBorder:"#1E293B", sbText:"#CBD5E1", sbDim:"#7C8CA5",
      sbActive:"#22C55E", sbActiveText:"#0F172A",
      ink:"#F8FAFC", body:"#CBD5E1", muted:"#94A3B8", faint:"#64748B",
      accent:"#22C55E", accentText:"#0F172A",
      success:"#22C55E", warning:"#F59E0B", danger:"#EF4444", info:"#3B82F6" },
  },
  {
    id: "slate", name: "Neutral Slate", icon: "🗿", mode: "light",
    desc: "Restrained greys with a quiet accent. Nothing competes with your data.",
    swatch: ["#1E293B", "#475569", "#FFFFFF", "#E2E8F0"],
    fonts: { heading: "Plus Jakarta Sans", body: "Plus Jakarta Sans" },
    c: { bg:"#F1F5F9", surface:"#FFFFFF", surface2:"#F8FAFC", border:"#E2E8F0",
      sbBg:"#1E293B", sbBorder:"#334155", sbText:"#CBD5E1", sbDim:"#94A3B8",
      sbActive:"#475569", sbActiveText:"#FFFFFF",
      ink:"#0F172A", body:"#334155", muted:"#64748B", faint:"#94A3B8",
      accent:"#475569", accentText:"#FFFFFF",
      success:"#059669", warning:"#D97706", danger:"#DC2626", info:"#0284C7" },
  },
];

// ── Density + radius options (from the styles dataset) ──
export const DENSITY = {
  compact:     { name: "Compact",     scale: 0.92, gap: 8,  pad: 10 },
  comfortable: { name: "Comfortable", scale: 1.0,  gap: 12, pad: 16 },
  spacious:    { name: "Spacious",    scale: 1.08, gap: 18, pad: 22 },
} as const;

export const CORNERS = {
  sharp:   { name: "Sharp",   r: 2 },
  rounded: { name: "Rounded", r: 10 },
  soft:    { name: "Soft",    r: 16 },
} as const;

export const TEXT_SIZE = {
  small:   { name: "Small",   scale: 0.92 },
  default: { name: "Default", scale: 1.0 },
  large:   { name: "Large",   scale: 1.12 },
} as const;

const K = "oiq-design-prefs";

export interface Prefs {
  themeId: string;
  density: keyof typeof DENSITY;
  corners: keyof typeof CORNERS;
  textSize: keyof typeof TEXT_SIZE;
}

export const DEFAULT_PREFS: Prefs = {
  themeId: "midnight", density: "comfortable", corners: "rounded", textSize: "default",
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(K);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(K, JSON.stringify(p)); } catch {}
}

export function getTheme(id: string): Theme {
  return THEMES.find(t => t.id === id) || THEMES.find(t => t.id === "midnight")!;
}

// Applies the theme. Writes BOTH variable sets:
//  1. --oiq-*  for new components
//  2. --bg/--panel/--text/... which App.tsx's existing applyTheme engine reads,
//     so every module restyles through the mechanism already in the app.
export function applyDesign(p: Prefs) {
  const t = getTheme(p.themeId);
  const d = DENSITY[p.density], cr = CORNERS[p.corners], ts = TEXT_SIZE[p.textSize];
  const r = document.documentElement;
  const set = (k: string, v: string) => r.style.setProperty(k, v);

  // New-style tokens
  Object.entries(t.c).forEach(([k, v]) => set(`--oiq-${k}`, v as string));

  // Bridge to the app's existing theme variables
  set("--bg",      t.c.bg);
  set("--bg2",     t.c.surface2);
  set("--panel",   t.c.surface);
  set("--panel2",  t.c.surface2);
  set("--border",  t.c.border);
  set("--border2", t.c.border);
  set("--text",    t.c.ink);
  set("--text2",   t.c.body);
  set("--text3",   t.c.body);
  set("--muted",   t.c.muted);
  set("--muted2",  t.c.faint);
  set("--accent",  t.c.accent);
  set("--code",    t.c.surface2);
  set("--scroll",  t.c.border);
  // Sidebar-specific
  set("--sb-bg",   t.c.sbBg);
  set("--sb-bdr",  t.c.sbBorder);

  set("--oiq-radius", cr.r + "px");
  set("--oiq-gap", d.gap + "px");
  set("--oiq-pad", d.pad + "px");
  set("--oiq-scale", String(ts.scale * d.scale));
  set("--oiq-font-heading", `'${t.fonts.heading}', Georgia, serif`);
  set("--oiq-font-body", `'${t.fonts.body}', system-ui, sans-serif`);
  r.setAttribute("data-oiq-theme", t.id);
  r.setAttribute("data-oiq-mode", t.mode);

  // Remap the app's hardcoded inline hex colours to the active theme.
  // Covers App.tsx AND every module file (CommandCenter, AgenticWorkflows,
  // AIAgents, Ledger, Dispatch, Funding, ActionTracker, Pulse, etc.).
  const map: Array<[string, string]> = [
    ["#0a0e1a", t.c.bg],   ["#0c1120", t.c.surface2], ["#131825", t.c.surface],
    ["#1a2030", t.c.border], ["#14192a", t.c.border], ["#080c18", t.c.surface2],
    ["#0B1120", t.c.bg],   ["#070C18", t.c.bg],       ["#0d1829", t.c.surface2],
    ["#111827", t.c.surface], ["#0F1829", t.c.surface], ["#141F33", t.c.surface2],
    ["#1C2A40", t.c.border], ["#1E2D3D", t.c.border],  ["#243044", t.c.border],
    ["#F1F5F9", t.c.ink],  ["#F0F4FF", t.c.ink],      ["#E8EFF8", t.c.ink],
    ["#A0AAC0", t.c.body], ["#8FA8CC", t.c.body],     ["#8892B0", t.c.body],
    ["#94A3B8", t.c.body], ["#5A6480", t.c.muted],    ["#4D6A8A", t.c.muted],
    ["#64748B", t.c.muted],["#3A4060", t.c.faint],
  ];

  let css = "";
  const sel = "#oiq-root";
  map.forEach(([from, to]) => {
    const f = from.toLowerCase(), F = from.toUpperCase();
    [f, F, from].forEach(v => {
      css += `${sel} [style*="background:${v}"],${sel} [style*="background: ${v}"],${sel} [style*="background-color:${v}"],${sel} [style*="backgroundColor:${v}"]{background-color:${to}!important}`;
      css += `${sel} [style*="color:${v}"]:not([style*="background"]){color:${to}!important}`;
      css += `${sel} [style*="1px solid ${v}"],${sel} [style*="borderColor:${v}"],${sel} [style*="border-color:${v}"]{border-color:${to}!important}`;
    });
  });
  css += `${sel}{background:${t.c.bg};color:${t.c.body};font-family:'${t.fonts.body}',system-ui,sans-serif}`;
  css += `${sel} input,${sel} textarea,${sel} select{background:${t.c.surface}!important;color:${t.c.ink}!important;border-color:${t.c.border}!important}`;

  let el = document.getElementById("oiq-design-override") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "oiq-design-override"; document.head.appendChild(el); }
  el.textContent = css;

  // Fonts
  const fid = "oiq-font-link";
  const fam = [t.fonts.heading, t.fonts.body].filter((v, i, a) => a.indexOf(v) === i)
    .map(f => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700;800").join("&");
  let link = document.getElementById(fid) as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = fid; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
