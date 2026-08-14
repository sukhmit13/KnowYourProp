// City detection utility — determines which city's APIs to use based on address string

const PHILLY_ZIP_REGEX = /\b191\d{2}\b|\b190\d{2}\b|\b1920[0-9]\b/;

export type SupportedCity = 'chicago' | 'philadelphia';

export function detectCityFromAddress(address: string): SupportedCity {
  if (!address) return 'chicago';
  const upper = address.toUpperCase();
  if (
    upper.includes('PHILADELPHIA') ||
    upper.includes(' PHILA,') ||
    upper.includes(' PHILA ') ||
    upper.includes('PHILLY') ||
    (upper.includes(', PA') && PHILLY_ZIP_REGEX.test(upper)) ||
    (upper.includes(' PA ') && PHILLY_ZIP_REGEX.test(upper))
  ) {
    return 'philadelphia';
  }
  return 'chicago';
}
