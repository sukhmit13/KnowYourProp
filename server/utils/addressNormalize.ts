/**
 * Canonical address normalization utilities.
 *
 * One place for Census geocoder artifact stripping — import from here, nowhere else.
 */

/**
 * Returns true when the user explicitly typed a unit number in their address,
 * e.g. "Unit 2", "Apt 12C", "#304".
 *
 * Critically, the keyword match uses \b on BOTH sides so "United States" is
 * never mistaken for a unit designation (the historical root-cause bug).
 *
 * Only unit codes that contain at least one digit are considered "user-specified"
 * because real Chicago unit numbers always include a digit.
 */
export function hasUserSpecifiedUnit(address: string): boolean {
  return /\b(?:unit|apt\.?|ste\.?|suite|#)\b\s*[a-z0-9]*\d[a-z0-9]*/i.test(address);
}

/**
 * Strips letter-only UNIT codes injected by the Census TIGER geocoder
 * (e.g. "UNIT ED", "UNIT FL") from a matched address string.
 *
 * Real unit numbers always contain at least one digit ("Unit 2", "Unit 12C")
 * and are left untouched.  Single-letter condo designations ("Unit A") are
 * preserved because they ARE legitimate unit identifiers.
 *
 * The negative lookahead (?![A-Z0-9]) ensures we only remove codes that are
 * entirely letters — two or more uppercase letters with no trailing digit.
 */
export function stripCensusUnitArtifact(address: string): string {
  return address
    .replace(/,?\s+UNIT\s+[A-Z]{2,4}(?![A-Z0-9])/i, '')
    .trim();
}
