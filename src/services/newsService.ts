import type { NewsItem, MarketItem } from '../types/news';
import { MOCK_NEWS, MOCK_MARKETS } from './mockData';

export interface NewsAdapter {
  fetchNews(): Promise<NewsItem[]>;
}

export interface MarketAdapter {
  fetchMarkets(): Promise<MarketItem[]>;
}

class MockNewsAdapter implements NewsAdapter {
  async fetchNews(): Promise<NewsItem[]> {
    await new Promise(r => setTimeout(r, 600));
    return MOCK_NEWS;
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

export const newsService = new MockNewsAdapter();
export const marketService = new MockMarketAdapter();
