import type { NewsItem, MarketItem } from '../types/news';

const NEWS_API   = 'https://api.gorakhai.com/api/public/news-feed';
const MARKET_API = 'https://api.gorakhai.com/api/public/market-feed';

export interface NewsAdapter   { fetchNews(): Promise<NewsItem[]>; }
export interface MarketAdapter { fetchMarkets(): Promise<MarketItem[]>; }

class LiveNewsAdapter implements NewsAdapter {
  async fetchNews(): Promise<NewsItem[]> {
    try {
      const res = await fetch(NEWS_API);
      if (!res.ok) throw new Error('Feed unavailable');
      const data = await res.json();
      return (data.items || []) as NewsItem[];
    } catch (err) {
      console.warn('[OrchestrIQ] News feed unavailable:', err);
      return [];
    }
  }
}

class LiveMarketAdapter implements MarketAdapter {
  async fetchMarkets(): Promise<MarketItem[]> {
    try {
      const res = await fetch(MARKET_API);
      if (!res.ok) throw new Error('Market feed unavailable');
      const data = await res.json();
      return (data.items || []) as MarketItem[];
    } catch (err) {
      console.warn('[OrchestrIQ] Market feed unavailable:', err);
      return [];
    }
  }
}

export const newsService   = new LiveNewsAdapter();
export const marketService = new LiveMarketAdapter();
