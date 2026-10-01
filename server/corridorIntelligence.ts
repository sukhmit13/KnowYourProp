import {
  groupLicenseEstablishments,
  LICENSE_CATEGORY_LABEL,
  licenseEstablishmentKey,
  type NearbyLicense,
} from "@shared/businessLicenses";
import { withoutRepeatedNews } from "@shared/newsArticleDedup";
import { buildDevelopmentPipeline, getDevelopmentCorridor } from "./developmentPipeline";
import { Buffer } from "node:buffer";

export interface CorridorNewsInput {
  lat: number;
  lng: number;
  address: string;
  neighborhood: string;
  communityArea: string;
  excludeArticles: Array<{ url?: string; title?: string; source?: string }>;
}

type CorridorRef = { key: string; name: string; tier: number };
type SourceStatus = "available" | "partial" | "unavailable";
type Coverage = { status: SourceStatus; refreshing?: boolean; note?: string };
// Match the legacy corridor-news DPD radius; permit and zoning evidence use 1 mile.
const CORRIDOR_DPD_RADIUS_MILES = 0.5;

export function dpdCoverageStatus(coverage: { successfulPageCount: number }): SourceStatus {
  return coverage.successfulPageCount > 0 ? "partial" : "unavailable";
}
type Card = {
  key: string;
  name: string;
  tier: number;
  tierLabel: string;
  distanceMi: number;
  onCorridor: boolean;
  blurb: string;
  licenses: Array<{ name: string; address: string; date: string | null; tags: string[] }>;
  construction: Array<{
    address: string; date: string | null; use: string | null; stories: number | null;
    units: number | null; parking: number | null; cost: number | null; distanceMi: number | null;
    architect: string | null; gc: string | null; cityClass: string | null;
  }>;
  coverage: Array<{ title: string; url: string; source: string; date: string | null; summary: string }>;
  zoning: Array<{
    address: string; kind: string; zone: string | null; caseNo: string | null; date: string | null;
    status: string; distanceMi: number | null; use: string;
  }>;
  dpdApplications: Array<{
    address: string; applicationType: string; applicant: string | null; status: string;
    hearingDate: string | null; proposal: string; applicationUrl: string | null; hearingUrl: string;
    distanceMi: number | null;
  }>;
  counts: {
    licenses: number | null; permits: number | null; zoningAppeals: number | null;
    dpdApplications: number | null; articles: number | null;
  };
};

interface RollupRecords {
  licenses?: NearbyLicense[];
  permits?: any[];
  zoning?: any[];
  dpdApplications?: any[];
  articles?: any[];
  sourceCoverage: Record<"permits" | "licenses" | "articles" | "zoningAppeals" | "dpdApplications", Coverage>;
  corridors: Array<{
    corridorKey: string; corridorName: string; tier: number; description: string; distanceMiles: number;
  }>;
  exclusions?: Array<{ url?: string; title?: string; source?: string }>;
}

const validPoint = (latitude: unknown, longitude: unknown): latitude is number =>
  typeof latitude === "number" && Number.isFinite(latitude) &&
  typeof longitude === "number" && Number.isFinite(longitude) &&
  latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

function sourceCount(status: Coverage | undefined, count: number): number | null {
  return status?.status === "unavailable" || (status?.status === "partial" && count === 0)
    ? null
    : count;
}

/** Pure rollup builder: all source rows have already been fetched and bounded. */
export function buildCorridorRollup(records: RollupRecords): {
  cards: Card[];
  kpis: {
    permits: number | null; permitUnits: string | null; licenses: number | null;
    articles: number | null; zoningAppeals: number | null; dpdApplications: number | null;
  };
} {
  const corridorKeys = new Set(records.corridors.map(corridor => corridor.corridorKey));
  const dedupBy = <T>(items: T[], keyFor: (item: T) => string): T[] =>
    Array.from(new Map(items.map(item => [keyFor(item), item])).values());
  const permits = dedupBy((records.permits || []).filter(item =>
    validPoint(item.latitude, item.longitude) &&
    records.corridors.some(c => c.corridorKey === (item.corridor as CorridorRef | null)?.key),
  ), item => String(item.permitNumber || `${item.address}|${item.issueDate || ""}`));
  const licensesByCorridor = new Map<string, NearbyLicense[]>();
  for (const license of records.licenses || []) {
    const key = license.corridor?.key;
    if (!key || !corridorKeys.has(key)) continue;
    const rows = licensesByCorridor.get(key) || [];
    rows.push(license);
    licensesByCorridor.set(key, rows);
  }
  const zoning = dedupBy((records.zoning || []).filter(item =>
    validPoint(item.lat ?? item.latitude, item.lon ?? item.longitude) &&
    records.corridors.some(c => c.corridorKey === (item.corridor as CorridorRef | null)?.key),
  ), item => String(item.caseNumber || `${item.address}|${item.meetingDate || item.hearingDate || ""}`));
  const dpdApplications = dedupBy((records.dpdApplications || []).filter(item =>
    validPoint(item.latitude, item.longitude) &&
    records.corridors.some(c => c.corridorKey === (item.corridor as CorridorRef | null)?.key),
  ), item => String(item.id || `${item.address}|${item.hearingDate || ""}|${item.applicationType || ""}`));
  const articles = withoutRepeatedNews(records.articles || [], records.exclusions || []);
  const cards = records.corridors.map(corridor => {
    const key = corridor.corridorKey;
    const corridorPermits = permits.filter(item => (item.corridor as CorridorRef | null)?.key === key);
    const corridorLicenses = groupLicenseEstablishments(licensesByCorridor.get(key) || []);
    const corridorZoning = zoning.filter(item => (item.corridor as CorridorRef | null)?.key === key);
    const corridorDpd = dpdApplications.filter(item => (item.corridor as CorridorRef | null)?.key === key);
    // Unlocated articles retain text-scoped reporting associations. These keys
    // are a coverage association only; `corridor` itself is coordinate-validated.
    const corridorArticles = articles.filter(article =>
      (article.corridor as CorridorRef | null)?.key === key ||
      (!article.corridor && Array.isArray(article.corridorKeys) && article.corridorKeys[0] === key),
    );
    const licenseCount = sourceCount(
      records.sourceCoverage.licenses,
      new Set((licensesByCorridor.get(key) || []).map(licenseEstablishmentKey)).size,
    );
    return {
      key,
      name: corridor.corridorName,
      tier: corridor.tier,
      tierLabel: corridor.tier === 1 ? "Primary" : "Secondary",
      distanceMi: corridor.distanceMiles,
      onCorridor: corridor.distanceMiles === 0,
      blurb: corridor.description,
      licenses: corridorLicenses.map(item => ({
        name: item.name,
        address: item.address,
        date: item.licenses[0]?.startDate || null,
        tags: Array.from(new Set(item.licenses.map(license => LICENSE_CATEGORY_LABEL[license.licenseCategory]))),
      })),
      construction: corridorPermits.map(item => ({
        address: item.address,
        date: item.issueDate || null,
        use: item.buildingUse || null,
        stories: item.stories ?? null,
        units: item.units ?? null,
        parking: item.parkingSpaces ?? null,
        cost: item.reportedCost || null,
        distanceMi: item.distanceMiles ?? null,
        architect: item.architectName || null,
        gc: item.contractorName || null,
        cityClass: null,
      })),
      coverage: corridorArticles.map(article => ({
        title: article.title || "",
        url: article.url || "",
        source: article.source || "",
        date: article.published ? String(article.published).slice(0, 10) : null,
        summary: article.summary || "",
      })),
      zoning: corridorZoning.map(item => ({
        address: item.address,
        kind: item.hearingDate ? "Upcoming hearing" : "Decision",
        zone: item.zoningDistrict || null,
        caseNo: item.caseNumber || null,
        date: item.hearingDate || item.meetingDate || null,
        status: item.decision || "Upcoming",
        distanceMi: item.distanceMi ?? null,
        use: item.subject || "",
      })),
      dpdApplications: corridorDpd.map(item => ({
        address: item.address,
        applicationType: item.applicationType || "",
        applicant: item.applicant || null,
        status: item.status || "",
        hearingDate: item.hearingDate || null,
        proposal: item.proposal || "",
        applicationUrl: item.applicationUrl || null,
        hearingUrl: item.hearingUrl || "",
        distanceMi: item.distanceMi ?? null,
      })),
      counts: {
        licenses: licenseCount,
        permits: sourceCount(records.sourceCoverage.permits, corridorPermits.length),
        zoningAppeals: sourceCount(records.sourceCoverage.zoningAppeals, corridorZoning.length),
        dpdApplications: sourceCount(records.sourceCoverage.dpdApplications, corridorDpd.length),
        articles: sourceCount(records.sourceCoverage.articles, corridorArticles.length),
      },
    };
  });

  const corridorArticleCount = withoutRepeatedNews(
    cards.flatMap(card => card.coverage),
    [],
  ).length;
  const pipelinePermits = permits.flatMap(item =>
    validPoint(item.latitude, item.longitude) ? [{
      permitNumber: String(item.permitNumber || ""),
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      units: item.units ?? null,
      unitsAmbiguous: !!item.unitsAmbiguous,
      issueDate: item.issueDate,
    }] : [],
  );
  const pipeline = buildDevelopmentPipeline({
    permits: pipelinePermits,
    dpdApplications: [],
    recentApprovals: [],
    upcomingCases: [],
    developments: [],
  });
  const permitUnits = records.sourceCoverage.permits.status !== "available" ||
    pipeline.metrics.unitsUnderConstruction == null
    ? null
    : `~${pipeline.metrics.unitsUnderConstruction} units`;
  return {
    cards,
    kpis: {
      permits: sourceCount(records.sourceCoverage.permits, cards.reduce((sum, card) => sum + (card.counts.permits || 0), 0)),
      permitUnits,
      licenses: sourceCount(records.sourceCoverage.licenses, cards.reduce((sum, card) => sum + (card.counts.licenses || 0), 0)),
      articles: sourceCount(records.sourceCoverage.articles, corridorArticleCount),
      zoningAppeals: sourceCount(records.sourceCoverage.zoningAppeals, cards.reduce((sum, card) => sum + (card.counts.zoningAppeals || 0), 0)),
      dpdApplications: sourceCount(records.sourceCoverage.dpdApplications, cards.reduce((sum, card) => sum + (card.counts.dpdApplications || 0), 0)),
    },
  };
}

function isValidUpcomingDate(value: unknown, today: string): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= today;
}

function haversineDistanceMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function corridorFromPoint(address: string, latitude: number | null | undefined, longitude: number | null | undefined): CorridorRef | null {
  if (!validPoint(latitude, longitude)) return null;
  // Shared Step 27 resolver is the sole record-level classifier.
  return getDevelopmentCorridor(address, latitude, longitude);
}

/** Shared GET/POST corridor-news implementation. Source failures stay unknown. */
export async function getCorridorNews(input: CorridorNewsInput) {
  const {
    findNearbyCorridors, findCorridorArticlesWithCoverage, findCorridorPodcasts,
    articleMentionsCorridor, articleMentionsNeighborhood, getBorderingAreas,
    articleMentionsExplicitNonLocalNeighborhood,
  } = await import("./newsMonitor");
  const corridors = findNearbyCorridors(input.lat, input.lng, input.address);
  const corridorKeys = corridors.map(corridor => corridor.corridorKey);
  const [licenseResult, permitResult, zbaResult, dpdResult, articlesResult, podcastsResult] = await Promise.allSettled([
    import("./businessLicenses").then(({ getNearbyBusinessLicenses }) => getNearbyBusinessLicenses(input.lat, input.lng, 1)),
    import("./newConstruction").then(({ getNearbyNewConstruction }) => getNearbyNewConstruction(input.lat, input.lng, input.communityArea, 1)),
    import("./zbaApprovals").then(({ getAllZbaActivitySnapshot }) => getAllZbaActivitySnapshot()),
    import("./dpdApplications").then(({ getDpdApplications }) => getDpdApplications()),
    corridorKeys.length
      ? findCorridorArticlesWithCoverage(corridorKeys, 90)
      : Promise.resolve({ articles: [], coverage: { status: "unavailable" as const, successfulFeeds: 0, totalFeeds: 0 } }),
    corridorKeys.length ? findCorridorPodcasts(corridorKeys, 90) : Promise.resolve([]),
  ]);
  const sourceCoverage = {
    permits: {
      status: permitResult.status === "fulfilled" ? "available" as const : "unavailable" as const,
      note: "Permit counts are corridor-matched records. The unit estimate is an 18-month deduplicated pipeline proxy from permit descriptions and is suppressed when units are incomplete.",
    },
    licenses: { status: licenseResult.status === "fulfilled" ? "available" as const : "unavailable" as const },
    // RSS coverage functions do not report per-feed completeness, so successful
    // rows are useful but cannot justify an all-clear completeness claim.
    articles: articlesResult.status === "fulfilled"
      ? { status: articlesResult.value.coverage.status }
      : { status: "unavailable" as const },
    zoningAppeals: zbaResult.status === "fulfilled"
      ? { status: zbaResult.value.coverage.status, refreshing: zbaResult.value.coverage.refreshing }
      : { status: "unavailable" as const },
    // DPD explicitly reports an incomplete six-month sample, even when rows exist.
    dpdApplications: dpdResult.status === "fulfilled"
      ? { status: dpdCoverageStatus(dpdResult.value.coverage) }
      : { status: "unavailable" as const },
  };
  const licenses = licenseResult.status === "fulfilled"
    ? licenseResult.value.licenses.map(license => ({
      ...license,
      corridor: corridorFromPoint(license.address, license.latitude, license.longitude),
    }))
    : [];
  const permits = permitResult.status === "fulfilled"
    ? permitResult.value.permits.map(permit => ({
      ...permit,
      corridor: corridorFromPoint(permit.address, permit.latitude, permit.longitude),
    }))
    : [];

  const zbaItems = zbaResult.status === "fulfilled"
    ? [
      ...zbaResult.value.recentApprovals,
      ...zbaResult.value.upcomingCases.filter(item => isValidUpcomingDate(item.hearingDate, new Date().toISOString().slice(0, 10))),
    ]
    : [];
  const zbaByCase = new Map<string, any>();
  for (const item of zbaItems) {
    const latitude = item.lat ?? (item as any).latitude;
    const longitude = item.lon ?? (item as any).longitude;
    if (!validPoint(latitude, longitude)) continue;
    const distanceMi = haversineDistanceMi(input.lat, input.lng, latitude, longitude as number);
    if (distanceMi > 1) continue;
    const corridor = corridorFromPoint(item.address, latitude, longitude);
    if (!corridor || !corridorKeys.includes(corridor.key)) continue;
    zbaByCase.set(item.caseNumber, { ...item, latitude, longitude, corridor, distanceMi: Math.round(distanceMi * 100) / 100 });
  }
  const zoning = [...zbaByCase.values()];

  const dpdApplications = dpdResult.status === "fulfilled"
    ? dpdResult.value.applications.flatMap(application => {
      const latitude = application.latitude;
      const longitude = application.longitude;
      if (!validPoint(latitude, longitude)) return [];
      const distanceMi = haversineDistanceMi(input.lat, input.lng, latitude, longitude as number);
      if (distanceMi > CORRIDOR_DPD_RADIUS_MILES) return [];
      const corridor = corridorFromPoint(application.address, latitude, longitude);
      return corridor && corridorKeys.includes(corridor.key)
        ? [{ ...application, corridor, corridorKeys: [corridor.key], distanceMi: Math.round(distanceMi * 100) / 100 }]
        : [];
    })
    : [];

  const rawArticles = articlesResult.status === "fulfilled" ? articlesResult.value.articles : [];
  const allowedAreas = new Set<string>();
  if (input.neighborhood) allowedAreas.add(input.neighborhood.toLowerCase());
  if (input.communityArea) allowedAreas.add(input.communityArea.toLowerCase());
  getBorderingAreas(input.neighborhood, input.communityArea).forEach(area => allowedAreas.add(area));
  const taggedArticles = rawArticles.map((article: any) => {
    const matchedCorridors = corridorKeys.filter(key => articleMentionsCorridor(article, key));
    const mentionsNeighborhood = !!(input.neighborhood || input.communityArea) &&
      articleMentionsNeighborhood(article, input.neighborhood, input.communityArea);
    if (allowedAreas.size > 0 && articleMentionsExplicitNonLocalNeighborhood(article, allowedAreas)) return null;
    const corridor = corridorFromPoint(article.address, article.latitude ?? article.lat, article.longitude ?? article.lon);
    return {
      ...article,
      corridor,
      corridorKeys: matchedCorridors,
      mentionsNeighborhood,
      corridorAssociation: corridor ? "verified coordinates" : "text-scoped coverage association; address not verified",
    };
  }).filter((article: any) => article && (article.corridorKeys.length > 0 || article.mentionsNeighborhood));
  const dedupedArticles = withoutRepeatedNews(taggedArticles, input.excludeArticles);
  const articles = dedupedArticles.slice(0, 30);
  const podcasts = podcastsResult.status === "fulfilled" ? podcastsResult.value : [];
  const rollup = buildCorridorRollup({
    corridors, licenses, permits, zoning, dpdApplications, articles: dedupedArticles,
    sourceCoverage, exclusions: [],
  });
  return {
    is_near_corridor: corridors.length > 0,
    corridors,
    news_count: articles.length,
    articles,
    podcasts,
    dpdApplications,
    dpdCoverage: dpdResult.status === "fulfilled" ? dpdResult.value.coverage : null,
    cards: rollup.cards,
    kpis: rollup.kpis,
    sourceCoverage,
  };
}

export function validateCorridorNewsInput(value: any): CorridorNewsInput | null {
  const coordinate = (raw: unknown) => typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  const lat = coordinate(value?.lat);
  const lng = coordinate(value?.lng);
  if (!validPoint(lat, lng)) return null;
  const boundedString = (text: unknown, max: number) =>
    typeof text === "string" && text.length <= max ? text.trim() : null;
  const address = boundedString(value?.address ?? "", 200);
  const neighborhood = boundedString(value?.neighborhood ?? "", 100);
  const communityArea = boundedString(value?.communityArea ?? "", 100);
  if (address === null || neighborhood === null || communityArea === null) return null;
  const rawExclusions = value?.excludeArticles ?? [];
  if (!Array.isArray(rawExclusions) || rawExclusions.length > 750 ||
    Buffer.byteLength(JSON.stringify(rawExclusions), "utf8") > 72_000) return null;
  const excludeArticles: CorridorNewsInput["excludeArticles"] = [];
  for (const item of rawExclusions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const url = boundedString(item.url ?? "", 2_000);
    const title = boundedString(item.title ?? "", 300);
    const source = boundedString(item.source ?? "", 120);
    if (url === null || title === null || source === null || (!url && !title)) return null;
    excludeArticles.push({ ...(url ? { url } : {}), ...(title ? { title } : {}), ...(source ? { source } : {}) });
  }
  return { lat, lng, address, neighborhood, communityArea, excludeArticles };
}