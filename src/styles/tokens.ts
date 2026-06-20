export const COLOR = {
  bg:        '#070C18',
  bgSurface: '#0B1120',
  bgPanel:   '#0F1829',
  bgElevated:'#141F33',
  bgHover:   '#1A2840',
  border:    '#1C2A40',
  borderMid: '#243350',
  borderAccent: 'rgba(59,130,246,0.25)',
  textPrimary:   '#F0F4FF',
  textSecondary: '#8FA8CC',
  textTertiary:  '#4D6A8A',
  textMuted:     '#2D4460',
  accent:    '#3B82F6',
  accentDim: 'rgba(59,130,246,0.12)',
  accentGlow:'rgba(59,130,246,0.06)',
  critical: '#EF4444',
  criticalDim: 'rgba(239,68,68,0.12)',
  high:     '#F97316',
  highDim:  'rgba(249,115,22,0.12)',
  medium:   '#EAB308',
  mediumDim:'rgba(234,179,8,0.12)',
  low:      '#22C55E',
  lowDim:   'rgba(34,197,94,0.12)',
  positive: '#10B981',
  positiveDim: 'rgba(16,185,129,0.12)',
  negative: '#F43F5E',
  negativeDim: 'rgba(244,63,94,0.12)',
  neutral:  '#94A3B8',
} as const;

export const SPACE = {
  px1:  '4px',
  px2:  '8px',
  px3:  '12px',
  px4:  '16px',
  px5:  '20px',
  px6:  '24px',
  px8:  '32px',
  px10: '40px',
  px12: '48px',
  px16: '64px',
} as const;

export const TYPE = {
  fontUI:   "'Inter', -apple-system, sans-serif",
  fontData: "'JetBrains Mono', 'Fira Code', monospace",
  size10: '10px',
  size11: '11px',
  size12: '12px',
  size13: '13px',
  size14: '14px',
  size16: '16px',
  size18: '18px',
  size20: '20px',
  size24: '24px',
  regular: '400',
  medium:  '500',
  semibold:'600',
  bold:    '700',
  black:   '800',
  tight:   '1.2',
  snug:    '1.4',
  normal:  '1.6',
  relaxed: '1.75',
  tight_ls:  '-0.02em',
  normal_ls: '0',
  wide_ls:   '0.04em',
  wider_ls:  '0.08em',
  caps_ls:   '0.12em',
} as const;

export const RADIUS = {
  none: '0',
  sm:   '4px',
  md:   '6px',
  lg:   '8px',
  xl:   '12px',
  full: '9999px',
} as const;

export const SHADOW = {
  sm:  '0 1px 3px rgba(0,0,0,0.4)',
  md:  '0 4px 12px rgba(0,0,0,0.5)',
  lg:  '0 8px 32px rgba(0,0,0,0.6)',
  glow:'0 0 20px rgba(59,130,246,0.15)',
} as const;

export const TRANSITION = {
  fast:   'all 0.12s ease',
  normal: 'all 0.2s ease',
  slow:   'all 0.35s ease',
} as const;

export const TICKER = {
  height:       '36px',
  scrollSpeed:  28,
  refreshMs:    300_000,
  maxItems:     10,
  dedupeWindow: 0.8,
} as const;
