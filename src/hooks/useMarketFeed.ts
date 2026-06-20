import { useState, useEffect, useCallback } from 'react';
import type { MarketItem } from '../types/news';
import { marketService } from '../services/newsService';

export function useMarketFeed(refreshInterval = 30000) {
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await marketService.fetchMarkets();
      setMarkets(data);
      setError(null);
    } catch (e) {
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, refreshInterval);
    return () => clearInterval(interval);
  }, [fetch, refreshInterval]);

  return { markets, loading, error, refetch: fetch };
}
