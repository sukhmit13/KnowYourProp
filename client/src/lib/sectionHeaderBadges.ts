export interface HeaderBadgeState {
  /** A finding derived from this section's existing data, never an invented default. */
  label?: string;
  hasData?: boolean;
  loading?: boolean;
  error?: boolean;
  checked?: boolean;
  applicable?: boolean;
  incomplete?: boolean;
  /** Only used after a successful response. */
  emptyLabel?: string;
}

export interface SummaryHeaderBadge {
  label: string;
  tone: "c" | "indigo";
}

/** Used only when the existing header badge is absent. Findings stay neutral. */
export function fallbackSummaryBadge(state: HeaderBadgeState = {}): SummaryHeaderBadge {
  const badge = (label: string, tone: SummaryHeaderBadge["tone"] = "c") => ({ label, tone });
  if (state.applicable === false) return badge("Not applicable");
  if (state.checked === false) return badge("Not checked");
  // A background refresh must not erase a previously returned finding.
  if (state.loading && !state.hasData) return badge("Checking", "indigo");
  if (state.error && !state.hasData) return badge("Unavailable");
  if (state.incomplete) return badge("Data incomplete");
  if (state.label?.trim()) return badge(state.label);
  if (state.hasData) return badge(state.emptyLabel || "Status not verified");
  return badge("Unavailable");
}

export function headerBadgeNumber(value: unknown): number | null {
  if (value == null || (typeof value === "string" && !value.trim()) || typeof value === "boolean") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Recorded county facts only: prefer a valid year, then a positive building area. */
export function headerCountyRecordBadge(
  inputs: { years: readonly unknown[]; buildingAreas: readonly unknown[] },
  currentYear = new Date().getFullYear(),
): string | undefined {
  for (const value of inputs.years) {
    const year = headerBadgeNumber(value);
    if (year != null && Number.isInteger(year) && year >= 1700 && year <= currentYear) {
      return `Built ${year}`;
    }
  }
  for (const value of inputs.buildingAreas) {
    const area = headerBadgeNumber(value);
    if (area != null && area > 0) return `${area.toLocaleString("en-US")} sq ft`;
  }
  return undefined;
}

export interface HeaderFarCeilingInputs {
  lotSf: unknown;
  maxFar: unknown;
  hasCompanion?: boolean;
  companionLotSf?: unknown;
  /** The report treats a manual lot-area override as the full selected lot area. */
  manualCombinedLot?: boolean;
}

export function headerFarCeilingBadge(inputs: HeaderFarCeilingInputs): string | undefined {
  const lotSf = headerBadgeNumber(inputs.lotSf);
  const maxFar = headerBadgeNumber(inputs.maxFar);
  if (lotSf == null || lotSf <= 0 || maxFar == null || maxFar <= 0) return undefined;
  const companionLotSf = headerBadgeNumber(inputs.companionLotSf);
  const companionKnown = companionLotSf != null && companionLotSf > 0;
  const combined = !!inputs.hasCompanion && (!!inputs.manualCombinedLot || companionKnown);
  const totalLotSf = lotSf + (inputs.hasCompanion && !inputs.manualCombinedLot && companionKnown ? companionLotSf : 0);
  const ceilingSf = Math.floor(totalLotSf * maxFar);
  if (!Number.isFinite(ceilingSf)) return undefined;
  const scope = combined ? "combined ceiling" : inputs.hasCompanion ? "subject ceiling" : "FAR ceiling";
  return `Est. ${scope} ${ceilingSf.toLocaleString("en-US")} SF`;
}

export function headerCountyUnitCount(apartments: unknown, commercialUnits: unknown): number | null {
  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const text = typeof apartments === "string" ? apartments.trim().toLowerCase() : "";
  const recorded = headerBadgeNumber(text in words ? words[text] : apartments);
  if (recorded != null && Number.isInteger(recorded)) return recorded;
  const commercial = headerBadgeNumber(commercialUnits);
  return commercial != null && commercial > 0 && Number.isInteger(commercial) ? commercial : null;
}