export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low';

export type NewsCategory =
  | 'all'
  | 'markets'
  | 'business'
  | 'ai'
  | 'world'
  | 'india'
  | 'commodities';

export interface NewsItem {
  id: string;
  category: NewsCategory;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  impact: ImpactLevel;
  icon: string;
  aiAnalysis?: string;
  businessImpact?: string;
  recommendedActions?: string[];
  affectedIndustries?: string[];
  relatedNews?: string[];
}

export interface MarketItem {
  id: string;
  symbol: string;
  name: string;
  value: string;
  change: string;
  changePercent: string;
  isPositive: boolean;
  icon: string;
  category: NewsCategory;
  updatedAt: string;
}

export type TickerItem =
  | ({ type: 'news' } & NewsItem)
  | ({ type: 'market' } & MarketItem);
