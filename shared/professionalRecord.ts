export type ProfessionKey =
  | "contractors"
  | "design"
  | "expediters"
  | "zoningAttorneys"
  | "taxAttorneys"
  | "lenders";

export interface ProfessionalEntry {
  /** Display name, in the spelling of the most recent record. */
  name: string;
  /** Normalized key used for grouping. Never shown. */
  key: string;
  /** Role or professional classification recorded by the source. */
  role: string;
  firm?: string;
  /** ISO date of the most recent record here. */
  lastSeen: string;
  /** Granularity of lastSeen — tax appeals are year-only. */
  lastSeenPrecision: "day" | "month" | "year";
  recordCount: number;
  /** Up to two short facts. */
  facts: string[];
  /** Outcome of the matter, in the deciding body's words. */
  outcome?: string;
  tag?: string;
  position?: "Current" | "Prior";
  discoveryUrl?: string;
}

export interface ProfessionalRecord {
  groups: Array<{
    key: ProfessionKey;
    label: string;
    note?: string;
    entries: ProfessionalEntry[];
  }>;
  totalNames: number;
  groupCount: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Retrieval status: successful empty results are available, not partial. */
  sourceCoverage: Record<string, { status: "available" | "partial" | "unavailable" }>;
}