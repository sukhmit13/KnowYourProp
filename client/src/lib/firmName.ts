// Client-side mirror of server/dobEnrichment.ts normalizeFirmName — keep in sync.
// Used to match a DOB professional's name against rankings entries for deep-link highlighting.
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
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}
