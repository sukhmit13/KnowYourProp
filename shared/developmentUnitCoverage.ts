type UnitEvidence = { address?: string | null; units?: number | null; unitsAmbiguous?: boolean };

/** Retain street direction: 100 N State and 100 S State are different projects. */
export function normalizeDevelopmentAddress(address: string): string {
  return address.toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W')
    .replace(/\bAVENUE\b/g, 'AVE').replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD').replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR').replace(/\bPLACE\b/g, 'PL')
    .replace(/\bCOURT\b/g, 'CT').replace(/\bLANE\b/g, 'LN')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/[^A-Z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Each known project address contributes at most its largest reported count. */
export function summarizeDevelopmentUnits(
  items: UnitEvidence[],
  excludedAddresses: Iterable<string> = [],
): { total: number; projects: number; ambiguousProjects: number } {
  const excluded = new Set(Array.from(excludedAddresses, normalizeDevelopmentAddress));
  const byAddress = new Map<string, { units: number; ambiguous: boolean }>();
  for (const item of items) {
    if (!item.address || !Number.isFinite(item.units) || !item.units || item.units < 1 || item.units > 2000) continue;
    const key = normalizeDevelopmentAddress(item.address);
    if (!/^\d{1,5}(?:-\d{1,5})?\s+[NSEW]\s+\S+/.test(key) || excluded.has(key)) continue;
    const previous = byAddress.get(key);
    byAddress.set(key, {
      units: Math.max(item.units, previous?.units ?? 0),
      ambiguous: Boolean(item.unitsAmbiguous || previous?.ambiguous),
    });
  }
  const values = Array.from(byAddress.values());
  return {
    total: values.reduce((sum, item) => sum + item.units, 0),
    projects: values.length,
    ambiguousProjects: values.filter(item => item.ambiguous).length,
  };
}