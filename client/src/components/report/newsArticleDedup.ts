type ArticleReference = { url?: string | null; title?: string | null; source?: string | null };

function articleKeys(article: ArticleReference): string[] {
  const keys: string[] = [];
  if (article.url) {
    try {
      const url = new URL(article.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const params = Array.from(url.searchParams.entries())
        .filter(([key]) => !/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key))
        .sort(([a], [b]) => a.localeCompare(b));
      const query = new URLSearchParams(params).toString();
      keys.push(`url:${url.hostname.replace(/^www\./, "")}${path}${query ? `?${query}` : ""}`);
    } catch {
      // A malformed URL can still be matched by its title below.
    }
  }
  const source = article.source?.split(" - ")[0].replace(/ Archives$/i, "").trim();
  const title = (article.title || "").toLowerCase()
    .replace(source ? new RegExp(`\\s*[-–|]\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : /$^/, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  if (title.length >= 25) keys.push(`title:${title}`);
  return keys;
}

/** The property/neighborhood News section owns shared stories; corridor coverage
 * shows only additional articles. Also show a multi-corridor article once. */
export function withoutRepeatedNews<T extends ArticleReference>(
  corridorArticles: T[],
  newsArticles: ArticleReference[],
): T[] {
  const seen = new Set(newsArticles.flatMap(articleKeys));
  return corridorArticles.filter((article) => {
    const keys = articleKeys(article);
    if (keys.some(key => seen.has(key))) return false;
    keys.forEach(key => seen.add(key));
    return true;
  });
}