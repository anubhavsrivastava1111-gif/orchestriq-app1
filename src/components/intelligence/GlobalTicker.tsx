import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { NewsItem, NewsCategory } from '../../types/news';
import { useNewsFeed } from '../../hooks/useNewsFeed';
import { deduplicateNews, formatAge, formatUpdatedAt } from '../../utils/dataValidation';
import { COLOR, TYPE, SPACE, RADIUS, TICKER, TRANSITION } from '../../styles/tokens';

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'all',         label: 'All'         },
  { id: 'markets',     label: 'Markets'     },
  { id: 'india',       label: 'India'       },
  { id: 'business',    label: 'Business'    },
  { id: 'ai',          label: 'AI'          },
  { id: 'world',       label: 'World'       },
  { id: 'commodities', label: 'Commodities' },
];

const IMPACT = {
  critical: { label: 'CRITICAL', color: COLOR.critical,  bg: COLOR.criticalDim, dot: true  },
  high:     { label: 'HIGH',     color: COLOR.high,       bg: COLOR.highDim,     dot: false },
  medium:   { label: 'MEDIUM',   color: COLOR.medium,     bg: COLOR.mediumDim,   dot: false },
  low:      { label: 'LOW',      color: COLOR.low,        bg: COLOR.lowDim,      dot: false },
} as const;

function ImpactBadge({ level }: { level: keyof typeof IMPACT }) {
  const cfg = IMPACT[level] ?? IMPACT.low;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 5px',
      borderRadius: RADIUS.sm,
      fontSize: TYPE.size10,
      fontWeight: TYPE.black,
      letterSpacing: TYPE.wide_ls,
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.color}30`,
      flexShrink: 0,
    }}>
      {cfg.dot && <span style={{ width: 4, height: 4, borderRadius: RADIUS.full, background: cfg.color, animation: 'oiq-pulse 1s ease-in-out infinite' }} />}
      {cfg.label}
    </span>
  );
}

function NewsChip({ item, onClick, onMouseEnter, onMouseLeave }: {
  item: NewsItem;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: SPACE.px2,
        padding: `0 ${SPACE.px4}`, height: '36px',
        background: 'none', border: 'none',
        borderRight: `1px solid ${COLOR.border}`,
        cursor: 'pointer', fontFamily: TYPE.fontUI, flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, flexShrink: 0 }}>{item.icon}</span>
      <ImpactBadge level={item.impact as keyof typeof IMPACT} />
      <span style={{ fontSize: TYPE.size12, fontWeight: TYPE.medium, color: COLOR.textSecondary, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.headline}
      </span>
      <span style={{ fontSize: TYPE.size10, color: COLOR.textMuted, fontFamily: TYPE.fontData, flexShrink: 0 }}>
        {formatAge(item.publishedAt)}
      </span>
    </button>
  );
}

function IntelligenceDrawer({ news, onClose }: { news: NewsItem | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!news) return null;
  const impactCfg = IMPACT[news.impact as keyof typeof IMPACT] ?? IMPACT.low;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,16,0.7)', backdropFilter: 'blur(4px)', zIndex: 9998 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: 520, height: '100%', background: COLOR.bgPanel, borderLeft: `1px solid ${COLOR.border}`, zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: TYPE.fontUI }} role="dialog" aria-modal>
        <div style={{ padding: `${SPACE.px4} ${SPACE.px5}`, borderBottom: `1px solid ${COLOR.border}`, background: COLOR.bgElevated, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.px4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.px2, marginBottom: SPACE.px2 }}>
                <span style={{ fontSize: 14 }}>{news.icon}</span>
                <span style={{ fontSize: TYPE.size10, fontWeight: TYPE.black, color: COLOR.textTertiary, letterSpacing: TYPE.caps_ls, textTransform: 'uppercase' }}>{news.category}</span>
                <ImpactBadge level={news.impact as keyof typeof IMPACT} />
              </div>
              <h2 style={{ fontSize: TYPE.size16, fontWeight: TYPE.bold, color: COLOR.textPrimary, lineHeight: TYPE.snug, margin: 0 }}>{news.headline}</h2>
              <div style={{ display: 'flex', gap: SPACE.px4, marginTop: SPACE.px2, fontSize: TYPE.size11, color: COLOR.textTertiary }}>
                <span>{formatAge(news.publishedAt, true)}</span>
                <span style={{ color: COLOR.borderMid }}>·</span>
                <span>{news.source}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.textTertiary, cursor: 'pointer', fontSize: 14, fontFamily: TYPE.fontUI }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: SPACE.px5 }}>
          {news.summary && (
            <div style={{ marginBottom: SPACE.px6 }}>
              <span style={{ fontSize: TYPE.size10, fontWeight: TYPE.black, color: COLOR.textTertiary, letterSpacing: TYPE.caps_ls, textTransform: 'uppercase', marginBottom: SPACE.px2, display: 'block' }}>Summary</span>
              <p style={{ fontSize: TYPE.size13, lineHeight: TYPE.relaxed, color: COLOR.textSecondary, margin: 0 }}>{news.summary}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── MARKET STRIP ────────────────────────────────────────────────────────────
// Replaces the TradingView iframe. That widget rendered inside a sandboxed
// frame, so no theme could reach it, and its 56px content was being clipped
// into a 36px bar. This renders the reference layout from our own live feed.
type Quote = { label: string; value: string; delta?: number; freshness?: 'live' | 'delayed' | 'daily' };

function useMarkets(): { quotes: Quote[]; feedMeta: { updatedAt: string; providers: any } | null } {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [feedMeta, setFeedMeta] = useState<{ updatedAt: string; providers: any } | null>(null);

  useEffect(() => {
    let alive = true;

    // One server-side endpoint aggregates every source. The browser cannot
    // call most market APIs directly (CORS), and an API key in front-end code
    // would be public. See functions/api/market.ts.
    const load = async () => {
      try {
        const r = await fetch('/api/market', { cache: 'no-store' });
        if (!r.ok) throw new Error('feed ' + r.status);
        const d = await r.json();
        if (!alive || !Array.isArray(d?.items)) return;
        setQuotes(d.items.map((q: any) => ({
          label: q.label,
          value: q.value,
          delta: typeof q.delta === 'number' ? q.delta : undefined,
          freshness: q.freshness,
        })));
        setFeedMeta({ updatedAt: d.updatedAt, providers: d.providers });
      } catch {
        // Endpoint not deployed yet, or offline. Fall back to the direct
        // calls so the strip degrades rather than disappearing.
        const out: Quote[] = [];
        try {
          const fx = await fetch('https://open.er-api.com/v6/latest/INR').then(r => r.json());
          ([['USD/INR','USD',2],['EUR/INR','EUR',2],['GBP/INR','GBP',2],['AED/INR','AED',3],['JPY/INR','JPY',4]] as Array<[string,string,number]>)
            .forEach(([label, code, dp]) => {
              const rate = fx?.rates?.[code];
              if (rate) out.push({ label, value: (1 / rate).toFixed(dp), freshness: 'daily' });
            });
        } catch { /* strip degrades, never blocks */ }
        try {
          const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true').then(r => r.json());
          if (cg?.bitcoin) out.push({ label: 'BTC', value: Math.round(cg.bitcoin.usd).toLocaleString('en-US'), delta: cg.bitcoin.usd_24h_change, freshness: 'live' });
          if (cg?.ethereum) out.push({ label: 'ETH', value: Math.round(cg.ethereum.usd).toLocaleString('en-US'), delta: cg.ethereum.usd_24h_change, freshness: 'live' });
        } catch { /* same */ }
        if (alive && out.length) setQuotes(out);
      }
    };

    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { quotes, feedMeta };
}

function MarketStrip() {
  const { quotes } = useMarkets();
  // Duplicated once so the track loops seamlessly — the second copy is
  // already on screen when the first scrolls out.
  const track = quotes.length ? [...quotes, ...quotes] : [];
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 36, zIndex: 9991,
      background: 'var(--sb-bg)', borderBottom: '1px solid var(--sb-bdr)',
      display: 'flex', alignItems: 'stretch', overflow: 'hidden',
    }}>
      <style>{`@keyframes oiq-mkt { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .oiq-mkt-track { animation: oiq-mkt 45s linear infinite; }
        .oiq-mkt-track:hover { animation-play-state: paused; }`}</style>
      <div style={{ width: 70, background: 'var(--oiq-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--oiq-accentText)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Markets</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        {quotes.length === 0
          ? <span style={{ fontSize: 11, color: 'var(--oiq-sbDim)', paddingLeft: 18 }}>Loading live rates…</span>
          : (
            <div className="oiq-mkt-track" style={{ display: 'flex', alignItems: 'center', gap: 26, paddingLeft: 18, width: 'max-content', flexShrink: 0 }}>
              {track.map((q, i) => (
                <div key={q.label + i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--oiq-sbDim)', letterSpacing: '.06em', textTransform: 'uppercase', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {q.freshness && (
                      <span title={q.freshness === 'live' ? 'Live - updates continuously' : q.freshness === 'delayed' ? 'Intraday - refreshed through the day' : 'Updates once a day - not a live rate'}
                        style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                          background: q.freshness === 'live' ? '#6EE7B7' : q.freshness === 'delayed' ? '#FBBF24' : '#8b98a5' }} />
                    )}
                    {q.label}
                  </span>
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums',
                    color: q.delta === undefined ? 'var(--oiq-sbText)' : q.delta >= 0 ? '#6EE7B7' : '#FCA5A5',
                  }}>{q.value}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export function GlobalTicker() {
  const { news: rawNews, loading, lastUpdated, refetch } = useNewsFeed(TICKER.refreshMs);
  const [category, setCategory] = useState<NewsCategory>('all');
  const [paused, setPaused]     = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const animRef  = useRef<Animation | null>(null);

  const news = useMemo(() => {
    const filtered = category === 'all' ? rawNews : rawNews.filter(n => n.category === category);
    return deduplicateNews(filtered);
  }, [rawNews, category]);

  const startAnimation = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    const totalW = track.scrollWidth / 2;
    if (totalW <= 0) return;
    animRef.current?.cancel();
    animRef.current = track.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(-${totalW}px)` }],
      { duration: totalW * (1000 / TICKER.scrollSpeed), iterations: Infinity, easing: 'linear' }
    );
  }, []);

  useEffect(() => { if (!loading) setTimeout(startAnimation, 80); }, [loading, news, startAnimation]);
  useEffect(() => { if (animRef.current) animRef.current.playbackRate = paused ? 0 : 1; }, [paused]);

  const openNews    = (item: NewsItem) => { setSelectedNews(item); setPaused(true); };
  const closeDrawer = () => { setSelectedNews(null); setPaused(false); };

  if (collapsed) {
    return (
      <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 9990 }}>
        <button onClick={() => setCollapsed(false)} style={{ background: COLOR.bgPanel, border: `1px solid ${COLOR.border}`, borderTop: 'none', borderRight: 'none', borderRadius: `0 0 0 ${RADIUS.md}`, padding: `${SPACE.px1} ${SPACE.px3}`, fontSize: TYPE.size10, color: COLOR.textTertiary, cursor: 'pointer', fontFamily: TYPE.fontUI, display: 'flex', alignItems: 'center', gap: SPACE.px1 }}>
          ▾ Intelligence Feed
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── ROW 1: MARKET STRIP (own markup, themed, live feed) ── */}
      <MarketStrip />

      {/* ── ROW 2: NEWS TICKER ── */}
      <div style={{
        position: 'fixed', top: '36px', left: 0, right: 0,
        height: '36px',
        zIndex: 9990,
        background: COLOR.bgSurface,
        borderBottom: `1px solid ${COLOR.border}`,
        display: 'flex',
        alignItems: 'center',
        fontFamily: TYPE.fontUI,
        userSelect: 'none',
        overflow: 'hidden',
      }} role="marquee" aria-label="Live news feed">

        {/* LIVE badge */}
        <div style={{ flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', padding: `0 ${SPACE.px3}`, background: '#EF4444', borderRight: `1px solid rgba(239,68,68,0.4)`, gap: SPACE.px1 }}>
          <span style={{ width: 5, height: 5, borderRadius: RADIUS.full, background: '#fff', animation: 'oiq-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
          <span style={{ fontSize: TYPE.size10, fontWeight: TYPE.black, color: '#fff', letterSpacing: TYPE.wider_ls, textTransform: 'uppercase' }}>News</span>
        </div>

        {/* Category filter */}
        <button onClick={() => setShowFilters(v => !v)}
          style={{ flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', padding: `0 ${SPACE.px3}`, background: showFilters ? COLOR.accentDim : COLOR.bgSurface, borderRight: `1px solid ${COLOR.border}`, fontSize: TYPE.size10, fontWeight: TYPE.semibold, color: showFilters ? COLOR.accent : COLOR.textTertiary, cursor: 'pointer', border: 'none', letterSpacing: TYPE.wide_ls, textTransform: 'uppercase', gap: SPACE.px1, fontFamily: TYPE.fontUI }}>
          {CATEGORIES.find(c => c.id === category)?.label ?? 'All'}
          <span style={{ fontSize: 8, marginLeft: 2 }}>{showFilters ? '▴' : '▾'}</span>
        </button>

        {/* Scroll viewport */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => !selectedNews && setPaused(false)}>
          {loading ? (
            <div style={{ display: 'flex', gap: SPACE.px4, padding: `0 ${SPACE.px4}` }}>
              {[120, 90, 160, 80, 140].map((w, i) => (
                <div key={i} style={{ height: 12, width: w, background: `linear-gradient(90deg, ${COLOR.bgPanel} 25%, ${COLOR.bgElevated} 50%, ${COLOR.bgPanel} 75%)`, backgroundSize: '200% 100%', animation: 'oiq-shimmer 1.5s infinite', borderRadius: RADIUS.sm, flexShrink: 0 }} />
              ))}
            </div>
          ) : (
            <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', willChange: 'transform' }}>
              {news.map((n, i) => <NewsChip key={`n1-${i}`} item={n} onClick={() => openNews(n)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} />)}
              {news.map((n, i) => <NewsChip key={`n2-${i}`} item={n} onClick={() => openNews(n)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} />)}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', borderLeft: `1px solid ${COLOR.border}` }}>
          <div style={{ padding: `0 ${SPACE.px3}`, fontSize: TYPE.size10, color: COLOR.textMuted, borderRight: `1px solid ${COLOR.border}`, whiteSpace: 'nowrap', fontFamily: TYPE.fontData }}>
            {formatUpdatedAt(lastUpdated)}
          </div>
          <button onClick={() => refetch()} style={{ width: 32, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRight: `1px solid ${COLOR.border}`, color: COLOR.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: TYPE.fontUI }} title="Refresh">↻</button>
          <button onClick={() => setCollapsed(true)} style={{ width: 32, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: COLOR.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: TYPE.fontUI }} title="Collapse">▴</button>
        </div>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div style={{ position: 'fixed', top: '72px', left: 0, background: COLOR.bgPanel, border: `1px solid ${COLOR.border}`, borderTop: 'none', borderRadius: `0 0 ${RADIUS.lg} ${RADIUS.lg}`, padding: SPACE.px2, display: 'flex', gap: SPACE.px1, zIndex: 9989, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setCategory(cat.id); setShowFilters(false); }}
              style={{ padding: `${SPACE.px1} ${SPACE.px3}`, borderRadius: RADIUS.md, fontSize: TYPE.size11, fontWeight: category === cat.id ? TYPE.bold : TYPE.medium, background: category === cat.id ? COLOR.accentDim : 'none', border: `1px solid ${category === cat.id ? COLOR.borderAccent : 'transparent'}`, color: category === cat.id ? COLOR.accent : COLOR.textTertiary, cursor: 'pointer', fontFamily: TYPE.fontUI }}>
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Intelligence Drawer */}
      {selectedNews && <IntelligenceDrawer news={selectedNews} onClose={closeDrawer} />}

      <style>{`
        @keyframes oiq-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes oiq-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </>
  );
}
