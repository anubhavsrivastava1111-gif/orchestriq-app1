import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { NewsItem, MarketItem, NewsCategory } from '../../types/news';
import { useNewsFeed } from '../../hooks/useNewsFeed';
import { useMarketFeed } from '../../hooks/useMarketFeed';
import { deduplicateNews, processMarketItems, formatAge, formatUpdatedAt } from '../../utils/dataValidation';
import { COLOR, TYPE, SPACE, RADIUS, TICKER, TRANSITION } from '../../styles/tokens';

const IMPACT = {
  critical: { label: 'CRITICAL', color: COLOR.critical,  bg: COLOR.criticalDim, dot: true  },
  high:     { label: 'HIGH',     color: COLOR.high,       bg: COLOR.highDim,     dot: false },
  medium:   { label: 'MEDIUM',   color: COLOR.medium,     bg: COLOR.mediumDim,   dot: false },
  low:      { label: 'LOW',      color: COLOR.low,        bg: COLOR.lowDim,      dot: false },
} as const;

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'all',         label: 'All'         },
  { id: 'markets',     label: 'Markets'     },
  { id: 'india',       label: 'India'       },
  { id: 'business',    label: 'Business'    },
  { id: 'ai',          label: 'AI'          },
  { id: 'world',       label: 'World'       },
  { id: 'commodities', label: 'Commodities' },
];

const S = {
  bar: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0,
    height: TICKER.height,
    background: COLOR.bg,
    borderBottom: `1px solid ${COLOR.border}`,
    display: 'flex',
    alignItems: 'center',
    zIndex: 9990,
    fontFamily: TYPE.fontUI,
    userSelect: 'none' as const,
    overflow: 'hidden',
  },
  liveBadge: {
    flexShrink: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${SPACE.px3}`,
    background: COLOR.accent,
    borderRight: `1px solid rgba(59,130,246,0.4)`,
    gap: SPACE.px1,
  },
  liveDot: {
    width: 5, height: 5,
    borderRadius: RADIUS.full,
    background: '#fff',
    animation: 'oiq-pulse 1.4s ease-in-out infinite',
    flexShrink: 0,
  },
  liveLabel: {
    fontSize: TYPE.size10,
    fontWeight: TYPE.black,
    color: '#fff',
    letterSpacing: TYPE.wider_ls,
    textTransform: 'uppercase' as const,
  },
  filterBtn: (active: boolean) => ({
    flexShrink: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${SPACE.px3}`,
    background: active ? COLOR.accentDim : COLOR.bgSurface,
    borderRight: `1px solid ${COLOR.border}`,
    fontSize: TYPE.size10,
    fontWeight: TYPE.semibold,
    color: active ? COLOR.accent : COLOR.textTertiary,
    cursor: 'pointer',
    border: 'none',
    letterSpacing: TYPE.wide_ls,
    textTransform: 'uppercase' as const,
    gap: SPACE.px1,
    transition: TRANSITION.fast,
    fontFamily: TYPE.fontUI,
  }),
  viewport: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  track: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap' as const,
    willChange: 'transform' as const,
  },
  controls: {
    flexShrink: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    borderLeft: `1px solid ${COLOR.border}`,
  },
  ctrlBtn: {
    width: 32,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRight: `1px solid ${COLOR.border}`,
    color: COLOR.textTertiary,
    fontSize: 11,
    cursor: 'pointer',
    transition: TRANSITION.fast,
    fontFamily: TYPE.fontUI,
  },
  skeleton: {
    height: 12,
    background: `linear-gradient(90deg, ${COLOR.bgPanel} 25%, ${COLOR.bgElevated} 50%, ${COLOR.bgPanel} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'oiq-shimmer 1.5s infinite',
    borderRadius: RADIUS.sm,
    flexShrink: 0,
  },
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(4,8,16,0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 9998,
  },
  drawer: {
    position: 'fixed' as const,
    top: 0, right: 0,
    width: '100%',
    maxWidth: 520,
    height: '100%',
    background: COLOR.bgPanel,
    borderLeft: `1px solid ${COLOR.border}`,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    fontFamily: TYPE.fontUI,
  },
  drawerHeader: {
    padding: `${SPACE.px4} ${SPACE.px5}`,
    borderBottom: `1px solid ${COLOR.border}`,
    background: COLOR.bgElevated,
    flexShrink: 0,
  },
  drawerBody: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: `${SPACE.px5}`,
  },
  sectionLabel: {
    fontSize: TYPE.size10,
    fontWeight: TYPE.black,
    color: COLOR.textTertiary,
    letterSpacing: TYPE.caps_ls,
    textTransform: 'uppercase' as const,
    marginBottom: SPACE.px2,
    display: 'block',
  },
  actionTag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `3px 8px`,
    borderRadius: RADIUS.full,
    fontSize: TYPE.size11,
    fontWeight: TYPE.medium,
    background: COLOR.accentDim,
    color: COLOR.accent,
    border: `1px solid ${COLOR.borderAccent}`,
  },
};

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
      {cfg.dot && (
        <span style={{
          width: 4, height: 4,
          borderRadius: RADIUS.full,
          background: cfg.color,
          animation: 'oiq-pulse 1s ease-in-out infinite',
        }} />
      )}
      {cfg.label}
    </span>
  );
}

function MarketChip({ item, onClick, onMouseEnter, onMouseLeave }: {
  item: ReturnType<typeof processMarketItems>[0];
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: SPACE.px2,
        padding: `0 ${SPACE.px4}`, height: TICKER.height,
        background: 'none', border: 'none',
        borderRight: `1px solid ${COLOR.border}`,
        cursor: 'pointer', fontFamily: TYPE.fontUI, flexShrink: 0,
      }}
      aria-label={`${item.name}: ${item.displayValue}`}
    >
      <span style={{ fontSize: 12 }}>{item.icon}</span>
      <span style={{ fontSize: TYPE.size11, fontWeight: TYPE.medium, color: COLOR.textTertiary, letterSpacing: TYPE.wide_ls }}>
        {item.symbol}
      </span>
      {item.isUnavailable ? (
        <span style={{ fontSize: TYPE.size11, color: COLOR.textMuted, fontStyle: 'italic' }}>Unavailable</span>
      ) : (
        <>
          <span style={{ fontSize: TYPE.size12, fontWeight: TYPE.bold, color: COLOR.textPrimary, fontFamily: TYPE.fontData }}>
            {item.displayValue}
          </span>
          <span style={{ fontSize: TYPE.size10, fontWeight: TYPE.semibold, color: item.isPositive ? COLOR.positive : COLOR.negative, fontFamily: TYPE.fontData }}>
            {item.isPositive ? '▲' : '▼'} {item.changePercent}
          </span>
        </>
      )}
    </button>
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
        padding: `0 ${SPACE.px4}`, height: TICKER.height,
        background: 'none', border: 'none',
        borderRight: `1px solid ${COLOR.border}`,
        cursor: 'pointer', fontFamily: TYPE.fontUI, flexShrink: 0,
      }}
      aria-label={item.headline}
    >
      <span style={{ fontSize: 12, flexShrink: 0 }}>{item.icon}</span>
      <ImpactBadge level={item.impact} />
      <span style={{ fontSize: TYPE.size12, fontWeight: TYPE.medium, color: COLOR.textSecondary, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.headline}
      </span>
      <span style={{ fontSize: TYPE.size10, color: COLOR.textMuted, fontFamily: TYPE.fontData, flexShrink: 0 }}>
        {formatAge(item.publishedAt)}
      </span>
    </button>
  );
}

function IntelligenceDrawer({ news, market, onClose }: {
  news: NewsItem | null;
  market: ReturnType<typeof processMarketItems>[0] | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isNews = !!news;
  const item = news ?? market;
  if (!item) return null;
  const impactCfg = isNews ? IMPACT[(news!.impact as keyof typeof IMPACT)] ?? IMPACT.low : null;

  return (
    <>
      <div style={S.backdrop} onClick={onClose} aria-hidden />
      <div style={S.drawer} role="dialog" aria-modal aria-label="Intelligence Detail">
        <div style={S.drawerHeader}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.px4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.px2, marginBottom: SPACE.px2 }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontSize: TYPE.size10, fontWeight: TYPE.black, color: COLOR.textTertiary, letterSpacing: TYPE.caps_ls, textTransform: 'uppercase' }}>
                  {isNews ? (news as NewsItem).category : 'Market Data'}
                </span>
                {isNews && impactCfg && <ImpactBadge level={(news as NewsItem).impact as keyof typeof IMPACT} />}
              </div>
              <h2 style={{ fontSize: TYPE.size16, fontWeight: TYPE.bold, color: COLOR.textPrimary, lineHeight: TYPE.snug, margin: 0 }}>
                {isNews ? (news as NewsItem).headline : `${(market!).name} — Live`}
              </h2>
              {isNews && (
                <div style={{ display: 'flex', gap: SPACE.px4, marginTop: SPACE.px2, fontSize: TYPE.size11, color: COLOR.textTertiary }}>
                  <span>{formatAge((news as NewsItem).publishedAt, true)}</span>
                  <span style={{ color: COLOR.borderMid }}>·</span>
                  <span>{(news as NewsItem).source}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.textTertiary, cursor: 'pointer', fontSize: 14, flexShrink: 0, fontFamily: TYPE.fontUI }}>×</button>
          </div>
        </div>

        <div style={S.drawerBody}>
          {!isNews && market && (
            <div style={{ background: COLOR.bgElevated, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.lg, padding: SPACE.px5, marginBottom: SPACE.px6 }}>
              <div style={{ fontSize: TYPE.size24, fontWeight: TYPE.black, color: COLOR.textPrimary, fontFamily: TYPE.fontData, marginBottom: SPACE.px1 }}>
                {market.isUnavailable ? <span style={{ color: COLOR.textMuted, fontSize: TYPE.size16, fontStyle: 'italic' }}>Data temporarily unavailable</span> : market.displayValue}
              </div>
              {!market.isUnavailable && (
                <div style={{ fontSize: TYPE.size13, fontWeight: TYPE.semibold, color: market.isPositive ? COLOR.positive : COLOR.negative, fontFamily: TYPE.fontData }}>
                  {market.isPositive ? '▲' : '▼'} {market.change} ({market.changePercent})
                </div>
              )}
              <div style={{ fontSize: TYPE.size11, color: COLOR.textMuted, marginTop: SPACE.px2 }}>{formatAge(market.updatedAt, true)}</div>
            </div>
          )}

          {isNews && news && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.px6 }}>
              {news.summary && (
                <div>
                  <span style={S.sectionLabel}>Summary</span>
                  <p style={{ fontSize: TYPE.size13, lineHeight: TYPE.relaxed, color: COLOR.textSecondary, margin: 0 }}>{news.summary}</p>
                </div>
              )}
              {news.aiAnalysis && (
                <div style={{ background: COLOR.accentGlow, border: `1px solid ${COLOR.borderAccent}`, borderRadius: RADIUS.lg, padding: SPACE.px4 }}>
                  <span style={{ ...S.sectionLabel, color: COLOR.accent }}>⚡ AI Analysis</span>
                  <p style={{ fontSize: TYPE.size13, lineHeight: TYPE.relaxed, color: COLOR.textSecondary, margin: 0 }}>{news.aiAnalysis}</p>
                </div>
              )}
              {news.businessImpact && (
                <div>
                  <span style={S.sectionLabel}>Business Impact</span>
                  <p style={{ fontSize: TYPE.size13, lineHeight: TYPE.relaxed, color: COLOR.textSecondary, margin: 0 }}>{news.businessImpact}</p>
                </div>
              )}
              {news.recommendedActions && news.recommendedActions.length > 0 && (
                <div>
                  <span style={S.sectionLabel}>Recommended Actions</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.px2 }}>
                    {news.recommendedActions.map((action, i) => (
                      <div key={i} style={{ display: 'flex', gap: SPACE.px3, alignItems: 'flex-start', padding: `${SPACE.px2} ${SPACE.px3}`, background: COLOR.bgElevated, borderRadius: RADIUS.md, borderLeft: `2px solid ${COLOR.accent}` }}>
                        <span style={{ color: COLOR.accent, fontSize: TYPE.size12, flexShrink: 0, marginTop: 1 }}>→</span>
                        <span style={{ fontSize: TYPE.size12, lineHeight: TYPE.normal, color: COLOR.textSecondary }}>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {news.affectedIndustries && news.affectedIndustries.length > 0 && (
                <div>
                  <span style={S.sectionLabel}>Affected Industries</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.px2 }}>
                    {news.affectedIndustries.map(ind => <span key={ind} style={S.actionTag}>{ind}</span>)}
                  </div>
                </div>
              )}
              {news.relatedNews && news.relatedNews.length > 0 && (
                <div>
                  <span style={S.sectionLabel}>Related</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.px1 }}>
                    {news.relatedNews.map((rel, i) => (
                      <div key={i} style={{ fontSize: TYPE.size12, color: COLOR.textTertiary, lineHeight: TYPE.normal, paddingLeft: SPACE.px3, borderLeft: `1px solid ${COLOR.border}` }}>{rel}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FilterDropdown({ active, onChange, onClose }: {
  active: NewsCategory;
  onChange: (cat: NewsCategory) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', top: TICKER.height, left: 0, background: COLOR.bgPanel, border: `1px solid ${COLOR.border}`, borderTop: 'none', borderRadius: `0 0 ${RADIUS.lg} ${RADIUS.lg}`, padding: SPACE.px2, display: 'flex', gap: SPACE.px1, zIndex: 9989, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      {CATEGORIES.map(cat => (
        <button key={cat.id} onClick={() => { onChange(cat.id); onClose(); }}
          style={{ padding: `${SPACE.px1} ${SPACE.px3}`, borderRadius: RADIUS.md, fontSize: TYPE.size11, fontWeight: active === cat.id ? TYPE.bold : TYPE.medium, background: active === cat.id ? COLOR.accentDim : 'none', border: `1px solid ${active === cat.id ? COLOR.borderAccent : 'transparent'}`, color: active === cat.id ? COLOR.accent : COLOR.textTertiary, cursor: 'pointer', fontFamily: TYPE.fontUI, transition: TRANSITION.fast }}>
          {cat.label}
        </button>
      ))}
    </div>
  );
}
function TradingViewTicker() {
  return (
    <div style={{ flex: 1, overflow: 'hidden', height: '36px' }}>
      <iframe
        scrolling="no"
        allowTransparency={true}
        frameBorder="0"
        src="https://s.tradingview.com/embed-widget/ticker-tape/?locale=en#%7B%22symbols%22%3A%5B%7B%22proName%22%3A%22BSE%3ASENSEX%22%2C%22title%22%3A%22Sensex%22%7D%2C%7B%22proName%22%3A%22NSE%3ANIFTY%22%2C%22title%22%3A%22Nifty%2050%22%7D%2C%7B%22proName%22%3A%22FX_IDC%3AUSDINR%22%2C%22title%22%3A%22USD%2FINR%22%7D%2C%7B%22proName%22%3A%22FX_IDC%3AEURINR%22%2C%22title%22%3A%22EUR%2FINR%22%7D%2C%7B%22proName%22%3A%22FX_IDC%3AGBPINR%22%2C%22title%22%3A%22GBP%2FINR%22%7D%2C%7B%22proName%22%3A%22FX_IDC%3AJPYINR%22%2C%22title%22%3A%22JPY%2FINR%22%7D%2C%7B%22proName%22%3A%22FX_IDC%3AAEDINR%22%2C%22title%22%3A%22AED%2FINR%22%7D%2C%7B%22proName%22%3A%22MCX%3AGOLD1%21%22%2C%22title%22%3A%22Gold%22%7D%2C%7B%22proName%22%3A%22MCX%3ASILVER1%21%22%2C%22title%22%3A%22Silver%22%7D%2C%7B%22proName%22%3A%22MCX%3ACRUDEOIL1%21%22%2C%22title%22%3A%22Crude%20Oil%22%7D%2C%7B%22proName%22%3A%22BITSTAMP%3ABTCUSD%22%2C%22title%22%3A%22Bitcoin%22%7D%2C%7B%22proName%22%3A%22BITSTAMP%3AETHUSD%22%2C%22title%22%3A%22Ethereum%22%7D%5D%2C%22showSymbolLogo%22%3Afalse%2C%22isTransparent%22%3Atrue%2C%22displayMode%22%3A%22compact%22%2C%22colorTheme%22%3A%22dark%22%2C%22locale%22%3A%22en%22%7D"
        style={{
          width: '100%',
          height: '36px',
          display: 'block',
        }}
      />
    </div>
  );
}
export function GlobalTicker() {
  const { news: rawNews, loading: newsLoading, lastUpdated, refetch } = useNewsFeed(TICKER.refreshMs);
  const { markets: rawMarkets, loading: marketsLoading } = useMarketFeed(TICKER.refreshMs / 2);

  const [category, setCategory]           = useState<NewsCategory>('all');
  const [paused, setPaused]               = useState(false);
  const [collapsed, setCollapsed]         = useState(false);
  const [showFilters, setShowFilters]     = useState(false);
  const [selectedNews, setSelectedNews]   = useState<NewsItem | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<ReturnType<typeof processMarketItems>[0] | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const animRef  = useRef<Animation | null>(null);
  const loading  = newsLoading || marketsLoading;

  const news = useMemo(() => {
    const filtered = category === 'all' ? rawNews : rawNews.filter(n => n.category === category);
    return deduplicateNews(filtered);
  }, [rawNews, category]);

  const markets = useMemo(() => {
    const all = processMarketItems(rawMarkets);
    if (category === 'all' || category === 'markets') return all;
    if (category === 'commodities') return all.filter(m => m.category === 'commodities');
    return [];
  }, [rawMarkets, category]);

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

  useEffect(() => { if (!loading) setTimeout(startAnimation, 80); }, [loading, news, markets, startAnimation]);
  useEffect(() => { if (animRef.current) animRef.current.playbackRate = paused ? 0 : 1; }, [paused]);

  const openNews    = (item: NewsItem) => { setSelectedNews(item); setSelectedMarket(null); setPaused(true); };
  const openMarket  = (item: ReturnType<typeof processMarketItems>[0]) => { setSelectedMarket(item); setSelectedNews(null); setPaused(true); };
  const closeDrawer = () => { setSelectedNews(null); setSelectedMarket(null); setPaused(false); };

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
      <div style={S.bar} role="marquee" aria-label="Live intelligence feed">

        <div style={S.liveBadge}>
          <span style={S.liveDot} />
          <span style={S.liveLabel}>Live</span>
        </div>

        <button onClick={() => setShowFilters(v => !v)} style={S.filterBtn(showFilters)} aria-expanded={showFilters}>
          {CATEGORIES.find(c => c.id === category)?.label ?? 'All'}
          <span style={{ fontSize: 8, marginLeft: 2 }}>{showFilters ? '▴' : '▾'}</span>
        </button>

        <div style={S.viewport} onMouseEnter={() => setPaused(true)} onMouseLeave={() => !selectedNews && !selectedMarket && setPaused(false)}>
          {loading ? (
            <div style={{ display: 'flex', gap: SPACE.px4, padding: `0 ${SPACE.px4}` }}>
              {[120, 90, 160, 80, 140].map((w, i) => <div key={i} style={{ ...S.skeleton, width: w }} />)}
            </div>
          ) : (
            <div ref={trackRef} style={S.track}>
              {news.map((n, i) => <NewsChip key={`n1-${i}`} item={n} onClick={() => openNews(n)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} />)}
              {news.map((n, i) => <NewsChip key={`n2-${i}`} item={n} onClick={() => openNews(n)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} />)}
            </div>
          )}
        </div>

        <div style={S.controls}>
          <div style={{ padding: `0 ${SPACE.px3}`, fontSize: TYPE.size10, color: COLOR.textMuted, borderRight: `1px solid ${COLOR.border}`, whiteSpace: 'nowrap', fontFamily: TYPE.fontData }}>
            {formatUpdatedAt(lastUpdated)}
          </div>
          <button onClick={() => refetch()} style={S.ctrlBtn} title="Refresh" aria-label="Refresh">↻</button>
          <button onClick={() => setCollapsed(true)} style={S.ctrlBtn} title="Collapse" aria-label="Collapse">▴</button>
        </div>
      </div>

      {showFilters && <FilterDropdown active={category} onChange={setCategory} onClose={() => setShowFilters(false)} />}

      {(selectedNews || selectedMarket) && <IntelligenceDrawer news={selectedNews} market={selectedMarket} onClose={closeDrawer} />}

      <style>{`
        @keyframes oiq-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes oiq-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </>
  );
}
