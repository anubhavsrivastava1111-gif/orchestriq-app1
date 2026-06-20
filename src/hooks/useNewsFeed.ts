import { useState, useEffect, useCallback } from 'react';
import type { NewsItem } from '../types/news';
import { newsService } from '../services/newsService';

export function useNewsFeed(refreshInterval = 60000) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await newsService.fetchNews();
      setNews(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError('Failed to load news');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, refreshInterval);
    return () => clearInterval(interval);
  }, [fetch, refreshInterval]);

  return { news, loading, error, lastUpdated, refetch: fetch };
}
