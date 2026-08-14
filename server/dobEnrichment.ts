// DOB professional enrichment — citywide track record + MBE/WBE certification lookup.
// Match rule (spec §5): the permit API returns only name strings (no license numbers),
// so we use normalized-name matching with a strict confidence rule: the normalized name
// must match EXACTLY ONE entry in the dataset. Anything weaker = NO match — we suppress
// both the citywide stats and the certification chips rather than risk mis-attribution.

import { getArchitectRankings, getGeneralContractorRankings } from './architectRankings';
import { getMinorityContractorRankings } from './minorityContractors';

export interface FirmEnrichmentRequest {
  name: string;
  /** raw role/contact type from the permit record, e.g. "ARCHITECT", "GENERAL CONTRACTOR", "ELECTRICAL CONTRACTOR" */
  role: string;
}

export interface FirmEnrichment {
  name: string;
  matched: boolean;
  citywide: {
    permits: number;
    totalValue: number;
    lastActiveYear: number | null;
    mix: string; // e.g. "mostly renovations"
  } | null;
  certs: string[]; // e.g. ["MBE", "WBE"] — empty when no confident directory match
}

const SUFFIXES = new Set([
  'INC', 'LLC', 'LTD', 'CO', 'CORP', 'CORPORATION', 'COMPANY', 'INCORPORATED',
  'PC', 'PLLC', 'LP', 'LLP', 'NFP', 'GROUP',
]);

export function normalizeFirmName(raw: string): string {
  const tokens = (raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // strip trailing corporate suffixes (repeatedly, e.g. "X CO INC")
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

function mixLabel(e: {
  newConstructionCount?: number;
  renovationCount?: number;
  singleFamilyCount?: number;
  multiFamilyCount?: number;
  mixedUseCommercialCount?: number;
  industrialCount?: number;
}): string {
  const buckets: Array<[string, number]> = [
    ['mostly single-family', e.singleFamilyCount || 0],
    ['mostly multi-family', e.multiFamilyCount || 0],
    ['mostly mixed-use / commercial', e.mixedUseCommercialCount || 0],
    ['mostly industrial', e.industrialCount || 0],
  ];
  buckets.sort((a, b) => b[1] - a[1]);
  if (buckets[0][1] > 0) return buckets[0][0];
  // fall back to work-type mix
  if ((e.renovationCount || 0) >= (e.newConstructionCount || 0) && (e.renovationCount || 0) > 0) return 'mostly renovations';
  if ((e.newConstructionCount || 0) > 0) return 'mostly new construction';
  return 'mixed project types';
}

/** Build a normalized-name index; names that collide (2+ entries) are marked ambiguous and never match. */
function buildIndex<T extends { name: string }>(entries: T[]): Map<string, T | 'AMBIGUOUS'> {
  const idx = new Map<string, T | 'AMBIGUOUS'>();
  for (const e of entries) {
    const key = normalizeFirmName(e.name);
    if (!key) continue;
    idx.set(key, idx.has(key) ? 'AMBIGUOUS' : e);
  }
  return idx;
}

function isDesignRole(role: string): boolean {
  const r = (role || '').toUpperCase();
  return r.includes('ARCHITECT') || r.includes('ENGINEER');
}

export async function enrichFirms(firms: FirmEnrichmentRequest[]): Promise<FirmEnrichment[]> {
  // Fetch datasets in parallel; each source failing independently degrades to no-match
  // for that source rather than failing the whole request.
  const [archRes, gcRes, mbeRes] = await Promise.allSettled([
    getArchitectRankings(),
    getGeneralContractorRankings(),
    getMinorityContractorRankings(),
  ]);
  const archIdx = archRes.status === 'fulfilled' ? buildIndex(archRes.value) : new Map();
  const gcIdx = gcRes.status === 'fulfilled' ? buildIndex(gcRes.value) : new Map();
  const mbeIdx = mbeRes.status === 'fulfilled' ? buildIndex(mbeRes.value) : new Map();

  return firms.map((f) => {
    const key = normalizeFirmName(f.name);
    let citywide: FirmEnrichment['citywide'] = null;
    let rankingAmbiguous = false;
    if (key) {
      // Look in the role-appropriate leaderboard first; a design professional should not
      // pick up a same-named contractor's stats and vice versa.
      const primary = isDesignRole(f.role) ? archIdx : gcIdx;
      const hit = primary.get(key);
      if (hit === 'AMBIGUOUS') rankingAmbiguous = true;
      if (hit && hit !== 'AMBIGUOUS') {
        const e: any = hit;
        citywide = {
          permits: e.totalProjects ?? 0,
          totalValue: e.totalValue ?? 0,
          lastActiveYear: e.lastPermitDate ? parseInt(String(e.lastPermitDate).substring(0, 4), 10) : null,
          mix: mixLabel(e),
        };
      }
    }
    // One identity decision governs both stats and certs: if the name is ambiguous in the
    // role-gated ranking index, we can't be confident WHICH firm this is — suppress certs too.
    let certs: string[] = [];
    if (key && !rankingAmbiguous) {
      const hit = mbeIdx.get(key);
      if (hit && hit !== 'AMBIGUOUS') {
        const types = (hit as any).certTypes;
        if (Array.isArray(types)) {
          certs = Array.from(new Set(types.map((t: string) => String(t).toUpperCase()).filter((t: string) => ['MBE', 'WBE', 'DBE', 'VBE', 'BEPD'].includes(t))));
        }
      }
    }
    return { name: f.name, matched: !!citywide, citywide, certs };
  });
}
