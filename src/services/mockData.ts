import type { NewsItem, MarketItem } from '../types/news';

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1', category: 'world',
    headline: 'US Federal Reserve Holds Interest Rates at 5.25%',
    summary: 'The Federal Reserve announced no change to benchmark interest rates for the third consecutive meeting, citing persistent inflation concerns balanced against labor market resilience.',
    source: 'Reuters', publishedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    impact: 'critical', icon: '🚨',
    aiAnalysis: 'Rate hold signals the Fed is data-dependent. Equity markets may see short-term relief rally. INR could face modest depreciation pressure as USD stays elevated.',
    businessImpact: 'Companies with floating-rate debt benefit. Consumer spending may remain constrained. Export-oriented Indian firms face USD/INR headwinds.',
    recommendedActions: ['Monitor USD/INR over next 48 hours', 'Review interest-rate-sensitive sector exposure', 'Track equity market volatility'],
    affectedIndustries: ['Banking', 'Technology', 'Financial Services', 'Real Estate'],
    relatedNews: ['Fed signals two cuts possible in 2026', 'Treasury yields fall on rate hold news']
  },
  {
    id: 'n2', category: 'ai',
    headline: 'OpenAI Releases GPT-5 with Multimodal Reasoning',
    summary: 'OpenAI launched GPT-5, featuring enhanced multimodal reasoning, real-time data access, and significantly improved performance on complex analytical tasks.',
    source: 'TechCrunch', publishedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    impact: 'high', icon: '🤖',
    aiAnalysis: 'This release compresses the competitive timeline for enterprise AI adoption. Businesses not integrating AI risk widening capability gap with AI-native competitors.',
    businessImpact: 'SaaS companies with AI features see immediate competitive pressure. Consulting firms face disruption as analytical tasks become more automatable.',
    recommendedActions: ['Evaluate GPT-5 against current AI toolstack', 'Assess which workflows can be upgraded', 'Review competitive positioning'],
    affectedIndustries: ['Technology', 'Consulting', 'Legal', 'Finance'],
    relatedNews: ['Microsoft Copilot integrates GPT-5', 'Enterprise AI spending hits $200B']
  },
  {
    id: 'n3', category: 'india',
    headline: 'RBI Maintains Repo Rate at 6.5%, Upgrades GDP Forecast to 7.2%',
    summary: 'The Reserve Bank of India kept the repo rate unchanged while upgrading GDP growth forecast for FY2027, signaling a shift toward growth-supportive monetary policy.',
    source: 'Economic Times', publishedAt: new Date(Date.now() - 90 * 60000).toISOString(),
    impact: 'high', icon: '🇮🇳',
    aiAnalysis: 'RBI growth upgrade with stable rates creates favorable environment for Indian equities and startup ecosystem. SME lending conditions likely to ease in H2 2026.',
    businessImpact: 'Favorable for Indian startups seeking growth capital. Real estate sector likely to see improved demand.',
    recommendedActions: ['Review credit facilities — rates unlikely to rise', 'Consider accelerating India market expansion', 'Monitor Nifty 50 banking sector'],
    affectedIndustries: ['Banking', 'Real Estate', 'Consumer', 'Startups'],
    relatedNews: ['Indian GDP forecast upgraded by IMF', 'FII inflows hit 3-month high']
  },
  {
    id: 'n4', category: 'business',
    headline: 'India Startup Funding Surges 40% YoY in Q2 2026',
    summary: 'Indian startups raised $4.2 billion in Q2 2026, a 40% increase year-over-year, driven by AI, fintech, and deep tech investments.',
    source: 'Mint', publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    impact: 'medium', icon: '📈',
    aiAnalysis: 'Funding surge reflects global VC confidence in India\'s AI ecosystem. B2B SaaS and AI-first products attracting premium valuations.',
    businessImpact: 'Competitive talent market will intensify. Good time for founders to initiate fundraising conversations.',
    recommendedActions: ['Prepare pitch materials while sentiment is positive', 'Network with active VCs', 'Document growth metrics clearly'],
    affectedIndustries: ['Venture Capital', 'Technology', 'Fintech', 'AI/ML'],
    relatedNews: ['Peak XV closes new $2.8B India fund', 'Y Combinator increases India cohort']
  },
  {
    id: 'n5', category: 'world',
    headline: 'G7 Leaders Agree on AI Governance Framework',
    summary: 'G7 nations reached consensus on a voluntary AI governance framework requiring transparency in AI systems used in critical infrastructure.',
    source: 'BBC', publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    impact: 'medium', icon: '🌐',
    aiAnalysis: 'Voluntary frameworks typically precede binding regulation by 18-24 months. AI companies should prepare compliance infrastructure now.',
    businessImpact: 'AI product companies need to invest in explainability and audit trails. Compliance costs rise but market access improves.',
    recommendedActions: ['Review AI systems for transparency', 'Document AI decision-making processes', 'Monitor regulatory developments'],
    affectedIndustries: ['AI/Technology', 'Healthcare', 'Finance', 'Government'],
    relatedNews: ['EU AI Act enforcement begins Q3 2026', 'India drafts AI regulation policy']
  },
  {
    id: 'n6', category: 'business',
    headline: 'Global Shipping Costs Normalize, Supply Chain Pressures Ease',
    summary: 'Container shipping rates have fallen 35% from 2025 peaks with major trade routes stabilizing.',
    source: 'Bloomberg', publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    impact: 'low', icon: '🚢',
    aiAnalysis: 'Normalized shipping costs reduce input cost pressures. Retail and manufacturing margins likely to improve Q3 onwards.',
    businessImpact: 'E-commerce and retail see margin improvement. Manufacturing input costs decrease.',
    recommendedActions: ['Renegotiate supply contracts while rates are low', 'Review inventory strategy', 'Assess pricing strategy'],
    affectedIndustries: ['Retail', 'Manufacturing', 'E-commerce', 'Logistics'],
    relatedNews: ['Red Sea shipping lanes partially reopened', 'Maersk reinstates normal routing']
  }
];

export const MOCK_MARKETS: MarketItem[] = [
  { id: 'm1', symbol: 'NIFTY50', name: 'Nifty 50', value: '24,892', change: '+187.3', changePercent: '+0.76%', isPositive: true, icon: '📈', category: 'markets', updatedAt: new Date().toISOString() },
  { id: 'm2', symbol: 'SENSEX', name: 'Sensex', value: '81,654', change: '+612.4', changePercent: '+0.76%', isPositive: true, icon: '📊', category: 'markets', updatedAt: new Date().toISOString() },
  { id: 'm3', symbol: 'USDINR', name: 'USD/INR', value: '₹83.42', change: '-0.18', changePercent: '-0.22%', isPositive: false, icon: '💱', category: 'markets', updatedAt: new Date().toISOString() },
  { id: 'm4', symbol: 'GOLD', name: 'Gold', value: '₹98,450', change: '+320', changePercent: '+0.33%', isPositive: true, icon: '🥇', category: 'commodities', updatedAt: new Date().toISOString() },
  { id: 'm5', symbol: 'SILVER', name: 'Silver', value: '₹1,12,300', change: '-450', changePercent: '-0.40%', isPositive: false, icon: '🥈', category: 'commodities', updatedAt: new Date().toISOString() },
  { id: 'm6', symbol: 'BTC', name: 'Bitcoin', value: '$67,842', change: '+1,243', changePercent: '+1.87%', isPositive: true, icon: '₿', category: 'markets', updatedAt: new Date().toISOString() },
  { id: 'm7', symbol: 'CRUDE', name: 'Crude Oil', value: '$78.32', change: '-0.84', changePercent: '-1.06%', isPositive: false, icon: '🛢️', category: 'commodities', updatedAt: new Date().toISOString() }
];
