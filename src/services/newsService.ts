import type { NewsItem, MarketItem } from '../types/news';
import { MOCK_MARKETS } from './mockData';

const NEWS_API = 'https://api.gorakhai.com/api/public/news-feed';

export interface NewsAdapter {
  fetchNews(): Promise<NewsItem[]>;
}

export interface MarketAdapter {
  fetchMarkets(): Promise<MarketItem[]>;
}

class LiveNewsAdapter implements NewsAdapter {
  async fetchNews(): Promise<NewsItem[]> {
    try {
      const res = await fetch(NEWS_API);
      if (!res.ok) throw new Error('Feed unavailable');
      const data = await res.json();
      return (data.items || []) as NewsItem[];
    } catch (err) {
      console.warn('[OrchestrIQ] News feed unavailable, using fallback:', err);
      return [];
    }
  }
}

class MockMarketAdapter implements MarketAdapter {
  async fetchMarkets(): Promise<MarketItem[]> {
    await new Promise(r => setTimeout(r, 400));
    return MOCK_MARKETS.map(m => ({
      ...m,
      updatedAt: new Date().toISOString()
    }));
  }
}

export const newsService = new LiveNewsAdapter();
export const marketService = new MockMarketAdapter();
