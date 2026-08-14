/**
 * Shared Google Places search-term derivation.
 *
 * Used by BOTH the client (RunDetail competitor search) and the server
 * (insight-report evidence builder) so the two sides derive identical terms
 * and hit the same Google Places cache keys. Do not fork this logic.
 */

/** Map a project type to a generic Places keyword ('' if none applies). */
export function projectTypeKeyword(projectType: string | null | undefined): string {
  const pt = (projectType || '').toLowerCase();
  if (pt.includes('restaurant') || pt.includes('bar') || pt.includes('tavern') || pt.includes('food')) return 'restaurant';
  if (pt.includes('hotel') || pt.includes('motel') || pt.includes('lodg')) return 'hotel';
  if (pt.includes('retail') || pt.includes('shop') || pt.includes('store')) return 'retail store';
  if (pt.includes('office') || pt.includes('cowork')) return 'office';
  if (pt.includes('gym') || pt.includes('fitness') || pt.includes('yoga')) return 'gym';
  if (pt.includes('salon') || pt.includes('spa') || pt.includes('beauty')) return 'salon';
  if (pt.includes('laundry') || pt.includes('dry clean')) return 'laundromat';
  return '';
}

export function isDaycareProjectType(projectType: string | null | undefined): boolean {
  return projectType === 'Day Care Center';
}

/**
 * Derive the Places search term from the selected project type and the
 * user's freeform concept description. Mirrors the RunDetail behavior:
 * - Day Care: "<freeform> daycare" or "daycare center"
 * - Other types: freeform split on commas, each term suffixed with the
 *   project-type keyword when not already present; falls back to the raw
 *   project type when no usable freeform text exists.
 * Returns null when no project type is set.
 */
export function derivePlacesSearchTerm(
  projectType: string | null | undefined,
  freeformDescription: string | null | undefined,
): string | null {
  if (!projectType) return null;

  if (isDaycareProjectType(projectType)) {
    const ff = (freeformDescription || '').trim();
    return ff ? `${ff} daycare` : 'daycare center';
  }

  const raw = (freeformDescription || '').trim();
  const searchDesc = raw && raw.length <= 80 ? raw : null;
  const keyword = projectTypeKeyword(projectType);

  const cleaned = searchDesc
    ? searchDesc
        .split(/[,;|]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => {
          const lower = t.toLowerCase();
          return keyword && !lower.includes(keyword.split(' ')[0]) ? `${t} ${keyword}` : t;
        })
        .join(', ')
    : null;

  return cleaned || projectType;
}
