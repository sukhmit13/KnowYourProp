import NodeCache from 'node-cache';
import crypto from 'crypto';

const CACHE_DURATIONS = {
  propertyTax: 30 * 24 * 60 * 60,
  foreclosure: 14 * 24 * 60 * 60,
  liens: 7 * 24 * 60 * 60,
  waterBill: 30 * 24 * 60 * 60,
  ownership: 14 * 24 * 60 * 60,
};

const cache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 });

export function getCacheDuration(category: keyof typeof CACHE_DURATIONS): number {
  return CACHE_DURATIONS[category];
}

export function hashAddress(address: string): string {
  const normalized = address.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

export function normalizePIN(pin: string): string {
  return pin.replace(/[^0-9]/g, '');
}

export function getCachedData<T>(key: string): T | null {
  const data = cache.get<T>(key);
  return data ?? null;
}

export function setCachedData<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, data, ttlSeconds);
}

export function isCacheExpired(checkedAt: Date | null, daysValid: number): boolean {
  if (!checkedAt) return true;
  const now = new Date();
  const diffMs = now.getTime() - checkedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > daysValid;
}

export function formatCacheAge(checkedAt: Date | null): string {
  if (!checkedAt) return 'Never checked';
  const now = new Date();
  const diffMs = now.getTime() - checkedAt.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return 'Just now';
}
