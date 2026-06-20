import React, { useEffect } from 'react';
const X = () => <span>×</span>;
const Clock = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>🕐</span>;
const ExternalLink = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>↗</span>;
const TrendingUp = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>📈</span>;
const Zap = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>⚡</span>;
const Target = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>🎯</span>;
const Building2 = ({size}:{size?:number}) => <span style={{fontSize:size||12}}>🏢</span>;
import type { NewsItem, MarketItem } from '../../types/news';
import { ImpactBadge } from './ImpactBadge';

interface Props {
  item: NewsItem | MarketItem | null;
  itemType: 'news' | 'market' | null;
  onClose: () => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function IntelligenceDrawer({ item, itemType, onClose }: Props) {
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, onClose]);

  if (!item) return null;

  const isNews = itemType === 'news';
  const news = isNews ? (item as NewsItem) : null;
  const market = !isNews ? (item as MarketItem) : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-[#070d1a] border-l border-zinc-800 z-[9999] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="sticky top-0 bg-[#070d1a]/95 backdrop-blur border-b border-zinc-800 px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{isNews ? news!.icon : market!.icon}</span>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{isNews ? news!.category : 'Market Data'}</span>
              {isNews && <ImpactBadge impact={news!.impact} size="sm" />}
            </div>
            <h2 className="text-white font-semibold text-base leading-snug">
              {isNews ? news!.headline : `${market!.name} — Live Data`}
            </h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 flex-shrink-0" aria-label="Close panel">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {isNews && (
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><Clock size={12} />{timeAgo(news!.publishedAt)}</span>
              <span>Source: {news!.source}</span>
            </div>
          )}

          {!isNews && market && (
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <div className="text-3xl font-bold text-white mb-1">{market.value}</div>
              <div className={`text-sm font-medium ${market.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {market.isPositive ? '▲' : '▼'} {market.change} ({market.changePercent})
              </div>
              <div className="text-xs text-zinc-600 mt-2">Updated {timeAgo(market.updatedAt)}</div>
            </div>
          )}

          {isNews && news?.summary && (
            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Summary</h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{news.summary}</p>
            </div>
          )}

          {isNews && news?.aiAnalysis && (
            <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-blue-400" />
                <h3 className="text-xs text-blue-400 uppercase tracking-wider font-semibold">AI Analysis</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{news.aiAnalysis}</p>
            </div>
          )}

          {isNews && news?.businessImpact && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-zinc-400" />
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Business Impact</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{news.businessImpact}</p>
            </div>
          )}

          {isNews && news?.recommendedActions && news.recommendedActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target size={14} className="text-zinc-400" />
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Recommended Actions</h3>
              </div>
              <ul className="space-y-2">
                {news.recommendedActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">→</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isNews && news?.affectedIndustries && news.affectedIndustries.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={14} className="text-zinc-400" />
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Affected Industries</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {news.affectedIndustries.map((industry) => (
                  <span key={industry} className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded-full text-xs text-zinc-300">
                    {industry}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isNews && news?.relatedNews && news.relatedNews.length > 0 && (
            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Related</h3>
              <ul className="space-y-2">
                {news.relatedNews.map((rel, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                    <ExternalLink size={11} className="text-zinc-600 flex-shrink-0" />
                    {rel}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
