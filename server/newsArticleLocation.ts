import { addressesMatchForPipeline, normalizeAddrForMatch } from "./developmentPipeline";

export interface CachedArticlePoint {
  address: string;
  lat: string | number;
  lon: string | number;
}

export interface ArticlePointIdentity {
  address: string;
  latitude: number;
  longitude: number;
  identity: "matched-address" | "article-address";
}

const STREET_SUFFIX = "(?:AVENUE|AVE|STREET|ST|ROAD|RD|BOULEVARD|BLVD|DRIVE|DR|PLACE|PL|COURT|CT|LANE|LN|PARKWAY|PKWY|WAY|TERRACE|TER|CIRCLE|CIR)";
const ARTICLE_ADDRESS_PATTERN = new RegExp(
  `\\b\\d{1,5}(?:\\s*[-–]\\s*\\d{1,5})?\\s+(?:(?:N|S|E|W|NORTH|SOUTH|EAST|WEST)\\.?\\s+)?[A-Z0-9][A-Z0-9.'’&-]*(?:\\s+[A-Z0-9][A-Z0-9.'’&-]*){0,4}\\s+${STREET_SUFFIX}\\.?\\b`,
  "gi",
);

const firstLine = (value: string) => value.split(",")[0].trim();
const normalizeArticleText = (value: string) => value
  .toUpperCase()
  .replace(/[.,#]/g, " ")
  .replace(/[’']/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Require an explicit exact address identity in article-owned text. */
export function articleTextMentionsAddress(text: string, address: string): boolean {
  const target = normalizeAddrForMatch(firstLine(address));
  if (!target) return false;
  const variants = new Set([target]);
  const directional = target.match(/^(\d+(?:-\d+)?)\s+(N|S|E|W)\s+(.+)$/);
  if (directional) {
    const fullDirection: Record<string, string> = { N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST" };
    variants.add(`${directional[1]} ${fullDirection[directional[2]]} ${directional[3]}`);
  }
  const escaped = (value: string) => value.split(/\s+/).map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const textValue = normalizeArticleText(text);
  return Array.from(variants).some(variant => {
    const pattern = new RegExp(
      `(?:^|[^A-Z0-9])${escaped(variant)}(?:\\s+${STREET_SUFFIX})?(?=$|[^A-Z0-9])`,
    );
    return pattern.test(textValue);
  });
}

/** Extract only explicit street addresses appearing in article title/snippet text. */
export function filterArticlesMentioningAddress<T extends { title?: string; summary?: string; snippet?: string | null }>(articles: T[], address: string): T[] {
  return articles.filter(article => articleTextMentionsAddress(`${article.title ?? ""} ${article.summary ?? article.snippet ?? ""}`, address));
}

/** Cached search associations cannot establish parcel identity on their own. */
export function cachedNewsHasAddressEvidence(snapshot: any, subjectAddress: string): boolean {
  if (!Array.isArray(snapshot?.meta)) return false;
  return snapshot.meta.every((item: any) => {
    if (item.tier !== "parcel" && item.tier !== "adjacent") return false;
    const target = item.tier === "parcel" ? subjectAddress : item.matched_address;
    return typeof target === "string" && articleTextMentionsAddress(
      `${item.title ?? ""} ${item.addressEvidenceSnippet ?? ""}`, target,
    );
  });
}

export function extractArticleAddresses(text: string, limit = 5): string[] {
  const matches = Array.from(text.matchAll(ARTICLE_ADDRESS_PATTERN), match => match[0].replace(/\s+/g, " ").trim());
  const unique = new Map<string, string>();
  for (const address of matches) {
    const key = normalizeAddrForMatch(address);
    if (key && !unique.has(key)) unique.set(key, address);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

function cacheLookupKeys(address: string): string[] {
  const value = address.trim();
  const street = firstLine(value);
  const stripUnit = (input: string) => input
    .replace(/\s+(?:APT|UNIT|STE|SUITE|#|FL|FLOOR)\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(new Set([
    value.toLowerCase(),
    stripUnit(value).toLowerCase(),
    street.toLowerCase(),
    `${street}, chicago, il`.toLowerCase(),
  ])).slice(0, 4);
}

/**
 * Resolve an article-owned address to already-cached coordinates only. It
 * never geocodes and never substitutes the subject point for a co-parcel story.
 */
export async function resolveArticleAddressPoint(
  input: {
    text: string;
    matchedAddress: string;
    tier: "parcel" | "adjacent";
    subjectAddress: string;
  },
  readCachedGeocode: (addressKey: string) => Promise<CachedArticlePoint | undefined>,
): Promise<ArticlePointIdentity | null> {
  const candidates: Array<{ address: string; identity: ArticlePointIdentity["identity"] }> = [];
  if (articleTextMentionsAddress(input.text, input.matchedAddress)) {
    candidates.push({ address: input.matchedAddress, identity: "matched-address" });
  }
  for (const address of extractArticleAddresses(input.text)) {
    candidates.push({ address, identity: "article-address" });
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const identityKey = normalizeAddrForMatch(firstLine(candidate.address));
    if (!identityKey || seen.has(identityKey)) continue;
    seen.add(identityKey);
    if (input.tier === "adjacent" &&
      addressesMatchForPipeline(firstLine(candidate.address), firstLine(input.subjectAddress))) continue;
    for (const lookupKey of cacheLookupKeys(candidate.address)) {
      let cached: CachedArticlePoint | undefined;
      try {
        cached = await readCachedGeocode(lookupKey);
      } catch {
        cached = undefined;
      }
      if (!cached || !addressesMatchForPipeline(firstLine(candidate.address), firstLine(cached.address))) continue;
      const latitude = Number(cached.lat);
      const longitude = Number(cached.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
      return { address: candidate.address, latitude, longitude, identity: candidate.identity };
    }
  }
  return null;
}