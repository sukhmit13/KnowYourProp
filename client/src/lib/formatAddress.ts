/**
 * Format an address for display with proper capitalization and punctuation.
 * Converts to uppercase and adds periods after common abbreviations.
 */
export function formatAddress(address: string): string {
  if (!address) return '';
  
  // Convert to uppercase first
  let formatted = address.toUpperCase();

  // Remove ", UNITED STATES" suffix if present
  formatted = formatted.replace(/,?\s*UNITED STATES$/i, '');

  // Strip Census geocoder unit codes that are letters-only (e.g. "UNIT ED", "UNIT A")
  // Real unit numbers contain digits (e.g. "UNIT 3B", "UNIT 12C") and are preserved
  formatted = formatted.replace(/,?\s+UNIT\s+[A-Z]{1,4}(?![A-Z0-9])/g, '');
  
  // Map of abbreviations that should have periods
  const abbreviations: Record<string, string> = {
    ' ST,': ' ST.,',
    ' ST ': ' ST. ',
    ' AVE,': ' AVE.,',
    ' AVE ': ' AVE. ',
    ' BLVD,': ' BLVD.,',
    ' BLVD ': ' BLVD. ',
    ' DR,': ' DR.,',
    ' DR ': ' DR. ',
    ' RD,': ' RD.,',
    ' RD ': ' RD. ',
    ' CT,': ' CT.,',
    ' CT ': ' CT. ',
    ' PL,': ' PL.,',
    ' PL ': ' PL. ',
    ' LN,': ' LN.,',
    ' LN ': ' LN. ',
    ' PKWY,': ' PKWY.,',
    ' PKWY ': ' PKWY. ',
    ' HWY,': ' HWY.,',
    ' HWY ': ' HWY. ',
    ' CIR,': ' CIR.,',
    ' CIR ': ' CIR. ',
    ' TER,': ' TER.,',
    ' TER ': ' TER. ',
    ' WAY,': ' WAY.,',
    ' WAY ': ' WAY. ',
    ' N ': ' N. ',
    ' S ': ' S. ',
    ' E ': ' E. ',
    ' W ': ' W. ',
    ' NE ': ' NE. ',
    ' NW ': ' NW. ',
    ' SE ': ' SE. ',
    ' SW ': ' SW. ',
    ' IL,': ' IL ',
    ' IL ': ' IL ',
  };
  
  // Apply abbreviation formatting
  for (const [search, replace] of Object.entries(abbreviations)) {
    formatted = formatted.split(search).join(replace);
  }
  
  // Handle street types at the very end of the string (before comma or end)
  formatted = formatted
    .replace(/ ST$/, ' ST.')
    .replace(/ AVE$/, ' AVE.')
    .replace(/ BLVD$/, ' BLVD.')
    .replace(/ DR$/, ' DR.')
    .replace(/ RD$/, ' RD.')
    .replace(/ CT$/, ' CT.')
    .replace(/ PL$/, ' PL.')
    .replace(/ LN$/, ' LN.')
    .replace(/ PKWY$/, ' PKWY.')
    .replace(/ HWY$/, ' HWY.')
    .replace(/ CIR$/, ' CIR.')
    .replace(/ TER$/, ' TER.')
    .replace(/ WAY$/, ' WAY.');
  
  // Clean up double commas
  formatted = formatted.replace(/,\s*,/g, ',');
  
  return formatted;
}

/**
 * Format just the street portion of an address for sidebar display
 */
export function formatStreetAddress(address: string): string {
  const street = address.split(',')[0];
  return formatAddress(street);
}
