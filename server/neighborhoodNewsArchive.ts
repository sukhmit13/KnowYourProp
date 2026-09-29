import { createHash } from "node:crypto";
import { pool } from "./db";
import { findRelevantArticles } from "./newsMonitor";
import { NEIGHBORHOOD_NEWS_DAYS } from "@shared/newsWindows";

export type ArchivedNewsArticle = {
  title: string;
  url: string;
  summary: string;
  published: string;
  source: string;
};

/** Keep matching feed items for one rolling year even after a publisher's RSS feed rotates them out. */
export async function getNeighborhoodNewsArchive(neighborhood: string): Promise<ArchivedNewsArticle[]> {
  const key = neighborhood.toLowerCase().trim();
  if (!key || key.length > 120) throw new Error("Invalid neighborhood");
  const live = await findRelevantArticles(neighborhood, NEIGHBORHOOD_NEWS_DAYS, Infinity);
  const cutoff = Date.now() - NEIGHBORHOOD_NEWS_DAYS * 86400000;
  const incoming = live.flatMap(article => {
    const published = new Date(article.published);
    if (!Number.isFinite(published.getTime()) || published.getTime() < cutoff) return [];
    if (!/^https?:\/\//i.test(article.url)) return [];
    return [{
      url_hash: createHash("sha256").update(article.url).digest("hex"),
      url: article.url,
      title: article.title,
      summary: article.summary,
      source: article.source,
      published_at: published.toISOString(),
    }];
  });
  if (incoming.length) {
    await pool.query(`
      INSERT INTO neighborhood_news_archive (neighborhood, url_hash, url, title, summary, source, published_at)
      SELECT $1, a.url_hash, a.url, a.title, a.summary, a.source, a.published_at::timestamptz
      FROM jsonb_to_recordset($2::jsonb) AS a(url_hash text, url text, title text, summary text, source text, published_at text)
      ON CONFLICT (neighborhood, url_hash) DO UPDATE SET
        title = EXCLUDED.title, summary = EXCLUDED.summary,
        source = EXCLUDED.source, published_at = EXCLUDED.published_at
    `, [key, JSON.stringify(incoming)]);
  }
  const { rows } = await pool.query<{
    title: string; url: string; summary: string; source: string; published_at: Date;
  }>(`
    SELECT title, url, summary, source, published_at
    FROM neighborhood_news_archive
    WHERE neighborhood = $1 AND published_at >= $2
    ORDER BY published_at DESC, url_hash
  `, [key, new Date(cutoff)]);
  return rows.map(row => ({
    title: row.title,
    url: row.url,
    summary: row.summary,
    source: row.source,
    published: row.published_at.toISOString(),
  }));
}