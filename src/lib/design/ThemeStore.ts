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

// ── THEME APPLICATION ENGINE (v3) ──────────────────────────────────────────
//
// TWO SYSTEMS, ONE THEME.
//
// 1. OrchestrIQ.css already styles the chrome (sidebar, header, ticker, nerve
//    tabs) from CSS variables. That stylesheet IS the design system. We drive
//    every variable it consumes from the active theme, so the chrome changes
//    properly when the theme changes.
//
// 2. The module bodies are still inline-styled in App.tsx. React writes those
//    as rgb(), so CSS text-matching can never reach them. We walk the DOM and
//    swap them.
//
// The walk must NEVER repaint anything the stylesheet governs — previously it
// did, painting the sidebar's inline #0c1120 onto a near-white surface colour
// and overriding `background: var(--sb-bg)`. That is why every theme looked
// identical. Chrome now uses the sidebar palette; body uses the surface palette.

type RGB = [number, number, number];

const hexToRgb = (h: string): RGB => {
  const n = h.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const rgbStr = (h: string) => { const [r, g, b] = hexToRgb(h); return `rgb(${r}, ${g}, ${b})`; };
const rgba = (h: string, a: number) => { const [r, g, b] = hexToRgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };

const parseColour = (v: string): RGB | null => {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === "transparent" || s.indexOf("rgba(0, 0, 0, 0)") === 0) return null;
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  if (s.charAt(0) === "#") {
    const n = s.slice(1);
    if (n.length === 3) return [parseInt(n[0] + n[0], 16), parseInt(n[1] + n[1], 16), parseInt(n[2] + n[2], 16)];
    if (n.length >= 6) return hexToRgb(s);
  }
  return null;
};

const lum = (c: RGB) => {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: RGB, b: RGB) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// Elements the stylesheet owns. The walk treats these as the dark chrome.
const CHROME = ".oiq-sidebar,#oiq-sidebar,#oiq-header,.global-ticker,.oiq-nerve-tabs";

let observer: MutationObserver | null = null;
let timer = 0;

export function applyDesign(p: Prefs) {
  const t = getTheme(p.themeId);
  const d = DENSITY[p.density], cr = CORNERS[p.corners], ts = TEXT_SIZE[p.textSize];
  const r = document.documentElement;
  const set = (k: string, v: string) => r.style.setProperty(k, v);

  Object.entries(t.c).forEach(([k, v]) => set(`--oiq-${k}`, v as string));

  // ── Every variable OrchestrIQ.css consumes, driven by the theme ──
  set("--main-bg", t.c.surface); set("--panel", t.c.surface);
  set("--bdr", t.c.border);
  set("--t1", t.c.ink); set("--t2", t.c.body); set("--t3", t.c.muted); set("--t4", t.c.faint);
  set("--accent", t.c.accent);
  set("--accent-10", rgba(t.c.accent, 0.12));
  set("--accent-20", rgba(t.c.accent, 0.22));
  set("--sb-bg", t.c.sbBg); set("--sb-bdr", t.c.sbBorder);
  set("--font", `'${t.fonts.body}',-apple-system,system-ui,sans-serif`);
  set("--font-head", `'${t.fonts.heading}',Georgia,serif`);
  set("--r-sm", Math.max(2, cr.r - 4) + "px");
  set("--r-md", cr.r + "px");
  set("--r-lg", (cr.r + 3) + "px");
  set("--r-xl", (cr.r + 7) + "px");

  // Legacy aliases still referenced elsewhere
  set("--bg", t.c.bg); set("--bg2", t.c.surface2); set("--panel2", t.c.surface2);
  set("--border", t.c.border); set("--border2", t.c.border);
  set("--text", t.c.ink); set("--text2", t.c.body); set("--text3", t.c.body);
  set("--muted", t.c.muted); set("--muted2", t.c.faint);
  set("--code", t.c.surface2); set("--scroll", t.c.border);
  set("--oiq-radius", cr.r + "px");
  set("--oiq-scale", String(ts.scale * d.scale));
  r.setAttribute("data-oiq-theme", t.id);
  r.setAttribute("data-oiq-mode", t.mode);
  document.body.style.setProperty("background", t.c.bg, "important");

  const light = t.mode === "light";
  const inkRGB = parseColour(t.c.ink) as RGB;
  const bodyRGB = parseColour(t.c.body) as RGB;
  const surfRGB = parseColour(t.c.surface) as RGB;
  const bgRGB = parseColour(t.c.bg) as RGB;
  const sbTextRGB = parseColour(t.c.sbText) as RGB;
  const sbDimRGB = parseColour(t.c.sbDim) as RGB;

  // ── BODY map: module content → surface palette ──
  const M: Record<string, string> = {};
  const add = (from: string, to: string) => { M[from.toLowerCase()] = to; M[rgbStr(from)] = to; };
  add("#0a0e1a", t.c.bg);      add("#0c1120", t.c.surface2); add("#131825", t.c.surface);
  add("#1a2030", t.c.border);  add("#14192a", t.c.border);   add("#080c18", t.c.surface2);
  add("#0E1523", t.c.surface); add("#0B1120", t.c.bg);       add("#070C18", t.c.bg);
  add("#0d1829", t.c.surface2); add("#111827", t.c.surface); add("#0F1829", t.c.surface);
  add("#141F33", t.c.surface2); add("#1C2A40", t.c.border);  add("#1E2D3D", t.c.border);
  add("#243044", t.c.border);  add("#0F1117", t.c.sbBg);     add("#151C2C", t.c.surface);
  add("#F1F5F9", t.c.ink);     add("#F0F4FF", t.c.ink);      add("#E8EFF8", t.c.ink);
  add("#A0AAC0", t.c.body);    add("#8FA8CC", t.c.body);     add("#8892B0", t.c.body);
  add("#94A3B8", t.c.body);    add("#5A6480", t.c.muted);    add("#4D6A8A", t.c.muted);
  add("#64748B", t.c.muted);   add("#3A4060", t.c.faint);
  // The house teal. 117 uses across App.tsx — the single biggest reason every
  // theme looked the same. Route it to the theme accent.
  add("#14B8A6", t.c.accent);  add("#0D9488", t.c.accent);   add("#2DD4BF", t.c.accent);

  // ── CHROME map: sidebar / header / ticker → sidebar palette ──
  const S: Record<string, string> = {};
  const addS = (from: string, to: string) => { S[from.toLowerCase()] = to; S[rgbStr(from)] = to; };
  addS("#0c1120", t.c.sbBg);   addS("#0a0e1a", t.c.sbBg);    addS("#080c18", t.c.sbBg);
  addS("#0F1117", t.c.sbBg);   addS("#131825", t.c.sbBorder); addS("#14192a", t.c.sbBorder);
  addS("#1a2030", t.c.sbBorder); addS("#151C2C", t.c.sbBorder);
  addS("#F1F5F9", t.c.sbText); addS("#F0F4FF", t.c.sbText);  addS("#E8EFF8", t.c.sbText);
  addS("#A0AAC0", t.c.sbText); addS("#8892B0", t.c.sbDim);   addS("#94A3B8", t.c.sbDim);
  addS("#5A6480", t.c.sbDim);  addS("#3A4060", t.c.sbDim);
  addS("#14B8A6", t.c.sbActive); addS("#0D9488", t.c.sbActive); addS("#2DD4BF", t.c.sbActive);

  const root = document.getElementById("oiq-root");
  if (!root) return;

  // Remember the source colour, so switching theme A → B still resolves
  // against the original value rather than theme A's output.
  const orig = (el: HTMLElement, key: string, live: string): string => {
    const had = el.dataset[key];
    if (had !== undefined) return had;
    el.dataset[key] = live || "";
    return live || "";
  };

  const behind = (el: HTMLElement): RGB => {
    let n: HTMLElement | null = el;
    for (let i = 0; i < 12 && n; i++) {
      const c = parseColour(getComputedStyle(n).backgroundColor);
      if (c) return c;
      n = n.parentElement;
    }
    return bgRGB;
  };

  const paint = () => {
    const all = root.querySelectorAll<HTMLElement>("*");

    all.forEach(el => {
      const s = el.style;
      const chrome = !!el.closest(CHROME);
      const TABLE = chrome ? S : M;

      const move = (prop: "backgroundColor" | "color" | "borderColor", css: string, key: string) => {
        const src = orig(el, key, s[prop]);
        if (!src) return;
        const hit = TABLE[src.toLowerCase()];
        if (hit) { s.setProperty(css, hit, "important"); return; }
        const c = parseColour(src);
        if (!c) return;
        const L = lum(c);
        if (chrome) {
          // Chrome stays dark in every theme. Only rescue into sidebar colours.
          if (prop === "backgroundColor" && L < 0.10) s.setProperty(css, t.c.sbBg, "important");
          if (prop === "borderColor" && L < 0.14) s.setProperty(css, t.c.sbBorder, "important");
          if (prop === "color" && L > 0.75) s.setProperty(css, t.c.sbText, "important");
          return;
        }
        if (light) {
          if (prop === "backgroundColor" && L < 0.10) s.setProperty(css, t.c.surface, "important");
          if (prop === "borderColor" && L < 0.14) s.setProperty(css, t.c.border, "important");
        } else {
          if (prop === "backgroundColor" && L > 0.85) s.setProperty(css, t.c.surface, "important");
          if (prop === "borderColor" && L > 0.80) s.setProperty(css, t.c.border, "important");
        }
      };
      move("backgroundColor", "background-color", "oiqBg");
      move("color", "color", "oiqFg");
      move("borderColor", "border-color", "oiqBd");

      const gsrc = orig(el, "oiqGrad", s.backgroundImage);
      if (gsrc && gsrc.indexOf("gradient") >= 0) {
        let out = gsrc;
        Object.keys(TABLE).forEach(k => { if (k.indexOf("rgb") === 0) out = out.split(k).join(TABLE[k]); });
        const stops = out.match(/rgba?\([^)]*\)/g) || [];
        stops.forEach(st => {
          const c = parseColour(st);
          if (!c) return;
          const L = lum(c);
          if (chrome && L < 0.10) out = out.split(st).join(t.c.sbBg);
          else if (!chrome && light && L < 0.10) out = out.split(st).join(t.c.surface2);
          else if (!chrome && !light && L > 0.85) out = out.split(st).join(t.c.surface2);
        });
        if (out !== gsrc) s.setProperty("background-image", out, "important");
      }
    });

    root.style.setProperty("background", t.c.bg, "important");
    root.style.setProperty("color", t.c.body, "important");

    // ── Contrast repair: measure, don't guess ──
    all.forEach(el => {
      if (!el.firstChild) return;
      let hasText = false;
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3 && (n.textContent || "").trim().length > 0) { hasText = true; break; }
      }
      if (!hasText) return;

      const cs = getComputedStyle(el);
      const fg = parseColour(cs.color);
      if (!fg) return;
      const bg = behind(el);
      if (contrast(fg, bg) >= 4.0) return;

      const options: RGB[] = el.closest(CHROME)
        ? [sbTextRGB, sbDimRGB, [255, 255, 255], [17, 17, 17]]
        : [inkRGB, bodyRGB, surfRGB, [255, 255, 255], [17, 17, 17]];
      let best = options[0], bestC = 0;
      options.forEach(o => { const c = contrast(o, bg); if (c > bestC) { bestC = c; best = o; } });
      el.style.setProperty("color", `rgb(${best[0]}, ${best[1]}, ${best[2]})`, "important");
    });
  };

  paint();

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (timer) return;
    timer = window.setTimeout(() => { timer = 0; paint(); }, 90);
  });
  observer.observe(root, { childList: true, subtree: true });

  // Fonts
  const fid = "oiq-font-link";
  const fam = [t.fonts.heading, t.fonts.body].filter((v, i, a) => a.indexOf(v) === i)
    .map(f => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700;800").join("&");
  let link = document.getElementById(fid) as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = fid; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
