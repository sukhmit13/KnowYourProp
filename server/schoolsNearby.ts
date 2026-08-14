/**
 * Nearby CPS Schools
 * Data source: Chicago Data Portal - CPS School Profiles (kh4r-387c)
 * Free, no auth, updated annually by Chicago Public Schools
 */

export interface CpsSchool {
  schoolId: string;
  name: string;
  shortName: string;
  address: string;
  zip: string;
  lat: number;
  lon: number;
  primaryCategory: 'ES' | 'MS' | 'HS' | string;
  isHighSchool: boolean;
  isMiddleSchool: boolean;
  isElementarySchool: boolean;
  isPreSchool: boolean;
  gradesOffered: string;
  studentCount?: number;
  overallRating?: string;
  ratingStatement?: string;
  classificationDescription?: string;
  attendanceBoundary: boolean;
  phone?: string;
  website?: string;
  distanceMiles?: number;
}

export interface NearbySchoolsResult {
  elementary: CpsSchool[];
  middle: CpsSchool[];
  high: CpsSchool[];
  total: number;
  radiusMiles: number;
  dataSource: string;
}

// Rating display order (best first)
const RATING_ORDER: Record<string, number> = {
  'Level 1+': 5,
  'Level 1': 4,
  'Level 2+': 3,
  'Level 2': 2,
  'Level 3': 1,
};

function ratingScore(r?: string): number {
  if (!r) return 0;
  return RATING_ORDER[r] ?? 0;
}

function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let schoolCache: { schools: CpsSchool[]; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DATA_URL =
  'https://data.cityofchicago.org/resource/kh4r-387c.json?$limit=2000&$where=school_latitude+IS+NOT+NULL';

async function getAllSchools(): Promise<CpsSchool[]> {
  if (schoolCache && Date.now() - schoolCache.fetchedAt < CACHE_TTL) {
    return schoolCache.schools;
  }

  console.log('[SCHOOLS] Fetching CPS school data from Chicago Data Portal...');
  const resp = await fetch(DATA_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'ChicagoEligibilityScreener/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`CPS school API ${resp.status}`);
  const raw: any[] = await resp.json();

  const schools: CpsSchool[] = raw
    .filter(r => r.school_latitude && r.school_longitude)
    .map(r => ({
      schoolId: String(r.school_id || ''),
      name: (r.long_name || r.short_name || '').trim(),
      shortName: (r.short_name || '').trim(),
      address: (r.address || '').trim(),
      zip: (r.zip || '').trim(),
      lat: parseFloat(r.school_latitude),
      lon: parseFloat(r.school_longitude),
      primaryCategory: (r.primary_category || '').toUpperCase(),
      isHighSchool: r.is_high_school === 'Y' || r.is_high_school === true,
      isMiddleSchool: r.is_middle_school === 'Y' || r.is_middle_school === true,
      isElementarySchool: r.is_elementary_school === 'Y' || r.is_elementary_school === true,
      isPreSchool: r.is_pre_school === 'Y' || r.is_pre_school === true,
      gradesOffered: (r.grades_offered_all || r.grades_offered || '').trim(),
      studentCount: r.student_count_total ? parseInt(r.student_count_total) : undefined,
      overallRating: r.overall_rating || undefined,
      ratingStatement: r.rating_statement || undefined,
      classificationDescription: r.classification_description || undefined,
      attendanceBoundary: r.attendance_boundaries === true || r.attendance_boundaries === 'true',
      phone: r.phone || undefined,
      website: r.website || undefined,
    }));

  schoolCache = { schools, fetchedAt: Date.now() };
  console.log(`[SCHOOLS] Cached ${schools.length} CPS schools`);
  return schools;
}

export async function getNearbySchools(
  lat: number,
  lon: number,
  radiusMiles = 1.5,
): Promise<NearbySchoolsResult> {
  const all = await getAllSchools();

  const nearby = all
    .map(s => ({ ...s, distanceMiles: haversineDistanceMiles(lat, lon, s.lat, s.lon) }))
    .filter(s => s.distanceMiles <= radiusMiles)
    .sort((a, b) => {
      // Sort: best rating first, then by distance
      const ratingDiff = ratingScore(b.overallRating) - ratingScore(a.overallRating);
      if (ratingDiff !== 0) return ratingDiff;
      return a.distanceMiles - b.distanceMiles;
    });

  const elementary = nearby.filter(s => s.isElementarySchool || s.primaryCategory === 'ES');
  const middle = nearby.filter(s => s.isMiddleSchool || s.primaryCategory === 'MS');
  const high = nearby.filter(s => s.isHighSchool || s.primaryCategory === 'HS');

  return {
    elementary: elementary.slice(0, 6),
    middle: middle.slice(0, 4),
    high: high.slice(0, 4),
    total: nearby.length,
    radiusMiles,
    dataSource: 'Chicago Public Schools (Chicago Data Portal)',
  };
}
