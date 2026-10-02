export const CHILDCARE_RANK_METRICS = [
  "childrenUnder5",
  "pct0to2",
  "laborForceDelta",
  "parentsInLaborForcePct0to5",
] as const;

export type ChildcareRankMetric = typeof CHILDCARE_RANK_METRICS[number];
export type ChildcareRank = { rank: number; total: number; sourceValue?: number } | null;
export type ChildcareRanks = Record<ChildcareRankMetric, ChildcareRank>;

type RankableRecord = Record<string, unknown>;

function getGeoIdentity(record: RankableRecord, geoKey: string): string | null {
  const value = record[geoKey];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized.toLowerCase() : null;
}

function getFiniteMetric(record: RankableRecord, metric: ChildcareRankMetric): number | null {
  const value = record[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Make ranking-only records with childrenUnder5 aligned to the access dataset.
 * Missing access records/metrics become null rather than falling back to the
 * enhanced dataset's independently sourced count.
 */
export function alignChildcareChildrenUnder5<T extends RankableRecord>(
  records: readonly T[],
  accessRecords: readonly RankableRecord[],
  geoKey: string,
): Array<Omit<T, "childrenUnder5"> & { childrenUnder5: number | null }> {
  const accessByIdentity = new Map<string, number | null>();
  for (const record of accessRecords) {
    const identity = getGeoIdentity(record, geoKey);
    if (identity !== null && !accessByIdentity.has(identity)) {
      accessByIdentity.set(identity, getFiniteMetric(record, "childrenUnder5"));
    }
  }

  return records.map(record => {
    const identity = getGeoIdentity(record, geoKey);
    return {
      ...record,
      childrenUnder5: identity === null ? null : accessByIdentity.get(identity) ?? null,
    };
  });
}

/**
 * Rank one record against the complete already-loaded geography dataset.
 * Duplicate geography keys count once, invalid metric values do not rank, and the
 * supplied records are never sorted or otherwise modified.
 */
export function getChildcareEnhancedRanks<T extends RankableRecord>(
  records: readonly T[],
  target: T,
  geoKey: string,
): { ranks: ChildcareRanks; comparisonTotal: number } {
  const uniqueRecords = new Map<string, T>();
  for (const record of records) {
    const identity = getGeoIdentity(record, geoKey);
    if (identity !== null && !uniqueRecords.has(identity)) {
      uniqueRecords.set(identity, record);
    }
  }

  const targetIdentity = getGeoIdentity(target, geoKey);
  const uniqueTarget = targetIdentity === null ? undefined : uniqueRecords.get(targetIdentity);
  const ranks = {} as ChildcareRanks;

  for (const metric of CHILDCARE_RANK_METRICS) {
    const targetValue = uniqueTarget ? getFiniteMetric(uniqueTarget, metric) : null;
    if (targetValue === null) {
      ranks[metric] = null;
      continue;
    }

    const values: number[] = [];
    for (const record of Array.from(uniqueRecords.values())) {
      const value = getFiniteMetric(record, metric);
      if (value !== null) values.push(value);
    }

    const rank: Exclude<ChildcareRank, null> = {
      rank: values.filter(value => value > targetValue).length + 1,
      total: values.length,
    };
    if (metric === "childrenUnder5") rank.sourceValue = targetValue;
    ranks[metric] = rank;
  }

  return { ranks, comparisonTotal: uniqueRecords.size };
}