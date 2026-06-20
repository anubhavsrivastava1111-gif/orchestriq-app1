import React, { useState, useRef, useEffect, useCallback } from 'react';
const RefreshCw = () => <span style={{fontSize:10}}>↻</span>;
const ChevronDown = ({size}:{size?:number}) => <span style={{fontSize:10}}>▾</span>;
const ChevronUp = ({size}:{size?:number}) => <span style={{fontSize:10}}>▴</span>;
import type { NewsItem, MarketItem, NewsCategory } from '../../types/news';
import { ImpactBadge } from './ImpactBadge';
import { IntelligenceDrawer } from './IntelligenceDrawer';
import { useNewsFeed } from '../../hooks/useNewsFeed';
import { useMarketFeed } from '../../hooks/useMarketFeed';

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'markets', label: 'Markets' },
  { id: 'business', label: 'Business' },
  { id: 'ai', label: 'AI' },
  { id: 'world', label: 'World' },
  { id: 'india', label: 'India' },
  { id: 'commodities', label: 'Commodities' },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function GlobalTicker() {
  const { news, loading: newsLoading, lastUpdated, refetch } = useNewsFeed(60000);
  const { markets, loading: marketsLoading } = useMarketFeed(30000);
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all');
  const [paused, setPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<MarketItem | null>(null);
  const [drawerType, setDrawerType] = useState<'news' | 'market' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  const filteredNews = activeCategory === 'all' ? news : news.filter(n => n.category === activeCategory);
  const filteredMarkets = (activeCategory === 'all' || activeCategory === 'markets') ? markets : activeCategory === 'commodities' ? markets.filter(m => m.category === 'commodities') : markets;
  const loading = newsLoading || marketsLoading;

  const startAnimation = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const totalWidth = track.scrollWidth / 2;
    if (animRef.current) animRef.current.cancel();
    animRef.current = track.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(-${totalWidth}px)` }],
      { duration: totalWidth * 25, iterations: Infinity, easing: 'linear' }
    );
  }, []);

  useEffect(() => {
    if (!loading) setTimeout(startAnimation, 100);
  }, [loading, filteredNews, filteredMarkets, startAnimation]);

  useEffect(() => {
    if (animRef.current) animRef.current.playbackRate = paused ? 0 : 1;
  }, [paused]);

  const openNewsDrawer = (item: NewsItem) => {
    setSelectedNews(item); setSelectedMarket(null);
    setDrawerType('news'); setPaused(true);
  };

  const openMarketDrawer = (item: MarketItem) => {
    setSelectedMarket(item); setSelectedNews(null);
    setDrawerType('market'); setPaused(true);
  };

  const closeDrawer = () => {
    setSelectedNews(null); setSelectedMarket(null);
    setDrawerType(null); setPaused(false);
  };

  if (collapsed) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9990] flex justify-end">
        <button onClick={() => setCollapsed(false)} className="bg-[#070d1a] border border-zinc-800 border-t-0 rounded-b-md px-3 py-1 text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
          <ChevronDown size={12} /> Intelligence Ticker
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9990] bg-[#070d1a] border-b border-zinc-800/80 select-none" style={{ height: '36px' }}>
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
          <div className="flex items-center h-full">
            <div className="px-3 h-full flex items-center bg-[#002FA7] border-r border-blue-800">
              <span className="text-[10px] font-bold text-white tracking-widest uppercase">LIVE</span>
            </div>
            <button onClick={() => setShowFilters(v => !v)} className="px-3 h-full flex items-center gap-1 bg-zinc-900 border-r border-zinc-800 text-[10px] text-zinc-400 hover:text-white transition-colors uppercase tracking-wider whitespace-nowrap">
              Intelligence <ChevronDown size={10} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <div className="absolute left-[140px] right-[80px] top-0 bottom-0 overflow-hidden"
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {loading ? (
            <div className="flex items-center h-full gap-4 px-4">
              {[1,2,3,4,5].map(i => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse w-32 flex-shrink-0" />)}
            </div>
          ) : (
            <div ref={trackRef} className="flex items-center h-full whitespace-nowrap will-change-transform">
              {[...filteredMarkets, ...filteredMarkets].map((m, i) => (
                <button key={`m-${i}`} onClick={() => openMarketDrawer(m)}
                  onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
                  className="inline-flex items-center gap-1.5 px-4 cursor-pointer group focus:outline-none">
                  <span className="text-sm">{m.icon}</span>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">{m.name}</span>
                  <span className="text-xs font-semibold text-white whitespace-nowrap">{m.value}</span>
                  <span className={`text-[10px] font-medium whitespace-nowrap ${m.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {m.isPositive ? '▲' : '▼'}{m.changePercent}
                  </span>
                  <span className="text-zinc-700 ml-1">|</span>
                </button>
              ))}
              {[...filteredNews, ...filteredNews].map((n, i) => (
                <button key={`n-${i}`} onClick={() => openNewsDrawer(n)}
                  onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
                  className="inline-flex items-center gap-2 px-4 cursor-pointer group focus:outline-none">
                  <span className="text-sm">{n.icon}</span>
                  <ImpactBadge impact={n.impact} />
                  <span className="text-xs text-zinc-200 group-hover:text-white transition-colors whitespace-nowrap">{n.headline}</span>
                  <span className="text-[10px] text-zinc-600 whitespace-nowrap">{timeAgo(n.publishedAt)}</span>
                  <span className="text-zinc-700 ml-1">|</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="absolute right-0 top-0 bottom-0 flex items-center">
          <button onClick={() => refetch()} className="px-2 h-full flex items-center text-zinc-600 hover:text-zinc-400 transition-colors border-l border-zinc-800" title={lastUpdated ? `Updated ${timeAgo(lastUpdated.toISOString())}` : 'Refresh'}>
            <RefreshCw size={11} />
          </button>
          <button onClick={() => setCollapsed(true)} className="px-2 h-full flex items-center text-zinc-600 hover:text-zinc-400 transition-colors border-l border-zinc-800">
            <ChevronUp size={11} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="fixed top-[36px] left-0 z-[9989] bg-[#070d1a] border border-zinc-800 border-t-0 rounded-b-lg shadow-xl">
          <div className="flex items-center gap-1 p-2">
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setShowFilters(false); }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeCategory === cat.id ? 'bg-[#002FA7] text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {drawerType && (
        <IntelligenceDrawer
          item={drawerType === 'news' ? selectedNews : selectedMarket}
          itemType={drawerType}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
