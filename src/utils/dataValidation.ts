import type { NewsItem, MarketItem } from '../types/news';
import { TICKER } from '../styles/tokens';

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  const setA = new Set(normalise(a).split(' '));
  const setB = new Set(normalise(b).split(' '));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const threshold = TICKER.dedupeWindow;
  const kept: NewsItem[] = [];
  for (const item of items) {
    const isDuplicate = kept.some(k => similarity(k.headline, item.headline) >= threshold);
    if (!isDuplicate) kept.push(item);
    if (kept.length >= TICKER.maxItems) break;
  }
  return kept;
}

export function validateMarketItem(item: MarketItem): { valid: boolean; reason?: string } {
  if (!item.updatedAt) return { valid: false, reason: 'No timestamp' };
  const ageMs = Date.now() - new Date(item.updatedAt).getTime();
  if (ageMs > 6 * 3600 * 1000) return { valid: false, reason: 'Data older than 6 hours' };
  if (!item.value || item.value.trim() === '') return { valid: false, reason: 'Missing value' };
  const numericValue = parseFloat(item.value.replace(/[^0-9.-]/g, ''));
  if (!isNaN(numericValue)) {
    const sanityRanges: Record<string, [number, number]> = {
      NIFTY50:  [10_000, 35_000],
      SENSEX:   [30_000, 120_000],
      USDINR:   [70, 100],
      GOLD:     [50_000, 150_000],
      SILVER:   [50_000, 200_000],
      BTC:      [10_000, 200_000],
      CRUDE:    [30, 150],
    };
    const range = sanityRanges[item.symbol];
    if (range && (numericValue < range[0] || numericValue > range[1])) {
      return { valid: false, reason: `Value ${numericValue} outside expected range` };
    }
  }
  return { valid: true };
}

export function processMarketItems(items: MarketItem[]) {
  return items.map(item => {
    const { valid, reason } = validateMarketItem(item);
    return {
      ...item,
      displayValue: valid ? item.value : 'Unavailable',
      isUnavailable: !valid,
    };
  });
}

export function formatAge(iso: string, long = false): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (long) {
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (hrs < 24)  return `${hrs}h ago`;
    return `${days}d ago`;
  }
  if (mins < 1)  return 'now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24)  return `${hrs}h`;
  return `${days}d`;
}

export function formatUpdatedAt(date: Date | null): string {
  if (!date) return 'Never updated';
  return `Updated ${formatAge(date.toISOString(), true)}`;
}
