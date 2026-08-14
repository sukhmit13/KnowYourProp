// Display helpers for the Schools section — derived states only, never hardcoded.

export interface SchoolLike {
  schoolId: string;
  name: string;
  overallRating?: string;
  attendanceBoundary: boolean;
  distanceMiles?: number;
  gradesOffered?: string;
}

// CPS rating tiers (best first). Mirrors server-side RATING_ORDER.
const RATING_SCORE: Record<string, number> = {
  'Level 1+': 5,
  'Level 1': 4,
  'Level 2+': 3,
  'Level 2': 2,
  'Level 3': 1,
};

export function ratingScore(r?: string): number {
  return r ? RATING_SCORE[r] ?? 0 : 0;
}

/** Badge tier for a single school's own rating: green for Level 1+/1, marigold for Level 2+, red for Level 2/3. */
export function ratingTier(r?: string): 'good' | 'caution' | 'bad' | null {
  const s = ratingScore(r);
  if (s === 0) return null;
  if (s >= 4) return 'good';
  if (s === 3) return 'caution';
  return 'bad';
}

/**
 * 4-tier favorability for a CPS level — used for the assigned-school dot/text.
 * Level 1+/1 → good, Level 2+ → neutral, Level 2 → caution, Level 3 → bad.
 * (A Level 2 school is below-average, not failing — never blanket red.)
 */
export function ratingFavor(r?: string): 'good' | 'neu' | 'cau' | 'bad' | null {
  const s = ratingScore(r);
  if (s === 0) return null;
  if (s >= 4) return 'good';
  if (s === 3) return 'neu';
  if (s === 2) return 'cau';
  return 'bad';
}

/**
 * Per-level verdict computed from nearby schools' CPS levels AND the assigned
 * (closest boundary) school, which is weighed heavily — it's the default option.
 * Rules: Strong requires the assigned school at Level 1+/1 plus 2+ strong nearby
 * options; an assigned school at Level 2+/2 caps the verdict at Mixed; Limited =
 * assigned Level 3 (or majority-weak field) with fewer than 2 strong options.
 * No rated schools → null (no badge).
 */
export function levelRating(schools: SchoolLike[], assigned?: SchoolLike | null): { label: 'Strong' | 'Mixed' | 'Limited'; badge: 'good' | 'caution' | 'bad' } | null {
  const rated = schools.filter(s => ratingScore(s.overallRating) > 0);
  if (rated.length === 0) return null;
  const strong = rated.filter(s => ratingScore(s.overallRating) >= 4).length;
  const weak = rated.filter(s => ratingScore(s.overallRating) <= 2).length;
  const aScore = assigned ? ratingScore(assigned.overallRating) : 0;

  if (aScore >= 4 && strong >= 2) return { label: 'Strong', badge: 'good' };
  if (aScore === 1 && strong < 2) return { label: 'Limited', badge: 'bad' };
  if (aScore > 0) return { label: 'Mixed', badge: 'caution' };

  // No rated assigned school — fall back to the majority rule.
  if (strong * 2 > rated.length) return { label: 'Strong', badge: 'good' };
  if (weak * 2 > rated.length) return { label: 'Limited', badge: 'bad' };
  return { label: 'Mixed', badge: 'caution' };
}

/** Closest school of a level (by distance). */
export function closestSchool<T extends SchoolLike>(schools: T[]): T | null {
  if (schools.length === 0) return null;
  return schools.reduce((a, b) => ((a.distanceMiles ?? Infinity) <= (b.distanceMiles ?? Infinity) ? a : b));
}

/** Closest school that operates an attendance boundary — the likely zoned school.
 * (Data confirms the school has a boundary, not that this address is inside it.) */
export function closestBoundarySchool<T extends SchoolLike>(schools: T[]): T | null {
  return closestSchool(schools.filter(s => s.attendanceBoundary));
}

const RD_COLORS: Record<'good' | 'caution' | 'bad', string> = {
  good: '#2f7d3f',
  caution: '#f0a41c',
  bad: '#d13b26',
};

export function ratingDotColor(r?: string): string | null {
  const tier = ratingTier(r);
  return tier ? RD_COLORS[tier] : null;
}
