export interface HmdaRankMetric {
  rank: number | null;
  outOf: number;
  count: number | null;
  leader: { name: string; count: number | null } | null;
}

export interface HmdaRankings {
  byTotal: HmdaRankMetric;
  byOriginated: HmdaRankMetric;
  areaLabel?: string;
}

interface HmdaRankStats {
  total?: number | string | null;
  originated?: { total?: number | string | null } | null;
}

function validCount(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getHmdaRankings(
  data: Record<string, HmdaRankStats> | null | undefined,
  subjectName: string,
  areaLabel: string,
  includedNames?: ReadonlySet<string>,
): HmdaRankings | null {
  if (!data) return null;

  const entries = Object.entries(data).filter(([name]) => !includedNames || includedNames.has(name));
  const subject = data[subjectName];

  const makeMetric = (
    countFor: (stats: HmdaRankStats) => number | string | null | undefined,
  ): HmdaRankMetric => {
    const sorted = entries
      .map(([name, stats]) => [name, validCount(countFor(stats))] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null)
      .sort(([, a], [, b]) => b - a);
    const rankIndex = sorted.findIndex(([name]) => name === subjectName);
    const leader = sorted[0];
    return {
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      outOf: sorted.length,
      count: subject ? validCount(countFor(subject)) : null,
      leader: leader ? { name: leader[0], count: leader[1] } : null,
    };
  };

  return {
    byTotal: makeMetric(stats => stats.total),
    byOriginated: makeMetric(stats => stats.originated?.total),
    areaLabel,
  };
}