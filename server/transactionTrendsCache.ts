import { pool } from './db';
import type { TransactionTrendsCache } from './transactionTrends';

// Bump this key when changing the year window, class mapping, or response shape.
const CACHE_VERSION = '2022-2025-v1';

export const persistentTransactionTrendsCache: TransactionTrendsCache = {
  async read(zip) {
    const { rows } = await pool.query<{ data: any; fetched_at: Date }>(
      'SELECT data, fetched_at FROM transaction_trends_cache WHERE cache_key = $1',
      [`${CACHE_VERSION}:${zip}`],
    );
    return rows[0] ? { result: rows[0].data, fetchedAt: rows[0].fetched_at.getTime() } : null;
  },
  async write(zip, result, fetchedAt) {
    await pool.query(
      `INSERT INTO transaction_trends_cache (cache_key, data, fetched_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
       WHERE transaction_trends_cache.fetched_at <= EXCLUDED.fetched_at`,
      [`${CACHE_VERSION}:${zip}`, JSON.stringify(result), new Date(fetchedAt)],
    );
  },
};