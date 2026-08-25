// provenance.ts
// How a single fact is represented. Every value the model sees comes from here.

export type FieldStatus =
  | "present"
  | "absent_in_source" // source genuinely has no such record
  | "extraction_error" // we failed to read it — NOT a fact about the property
  | "not_applicable"; // structurally inapplicable to this asset

export interface SourceRef {
  section: string; // "Sale History"
  locator?: string; // "row 1" | "PIN 13-25-326-010-0000"
  raw?: string; // verbatim source string — never normalized
  asOf?: string; // snapshot date for this data
}

export interface Quoted<T> {
  kind: "quoted";
  status: FieldStatus;
  value: T | null;
  source: SourceRef;
}

export interface ComputedInput {
  ref?: string; // key of another provenance record, if any
  value: number | string;
  source: SourceRef;
}

export interface Computed<T> {
  kind: "computed";
  status: FieldStatus;
  value: T | null;
  formula: string; // "2807 / 75"
  explain: string; // inline audit string shown in the report
  inputs: ComputedInput[];
  basis?: string; // assumptions / caveats
}

export type Provenanced<T> = Quoted<T> | Computed<T>;

/* ---------- constructors ---------- */

export function quote<T>(
  value: T,
  source: SourceRef,
): Quoted<T> {
  return { kind: "quoted", status: "present", value, source };
}

export function absent<T>(source: SourceRef): Quoted<T> {
  return { kind: "quoted", status: "absent_in_source", value: null, source };
}

export function extractionError<T>(source: SourceRef): Quoted<T> {
  return { kind: "quoted", status: "extraction_error", value: null, source };
}

export function notApplicable<T>(source: SourceRef): Quoted<T> {
  return { kind: "quoted", status: "not_applicable", value: null, source };
}

export function compute<T>(args: {
  value: T | null;
  formula: string;
  explain: string;
  inputs: ComputedInput[];
  basis?: string;
}): Computed<T> {
  return {
    kind: "computed",
    status: args.value === null ? "extraction_error" : "present",
    value: args.value,
    formula: args.formula,
    explain: args.explain,
    inputs: args.inputs,
    basis: args.basis,
  };
}

/* ---------- safe extraction ---------- */
// Wrap every parse so a failure is LABELED, not silently nulled.

export function safeExtract<T>(
  fn: () => T | null | undefined,
  source: SourceRef,
): Quoted<T> {
  try {
    const v = fn();
    if (v === undefined || v === null) return extractionError<T>(source);
    if (typeof v === "number" && Number.isNaN(v)) return extractionError<T>(source);
    return quote(v as T, source);
  } catch (e) {
    console.error(`[EXTRACT FAIL] ${source.section}:`, e);
    return extractionError<T>(source);
  }
}

/* ---------- money parsing (a common silent-null cause) ---------- */

export function parseMoney(s: unknown): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s !== "string") return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suffix = m[2]?.toUpperCase();
  const mult = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return n * mult;
}

/* ---------- example ----------

facts["sale.lastPrice"] = safeExtract(
  () => parseMoney(report.saleHistory?.[0]?.price),
  { section: "Sale History", locator: "row 1", raw: report.saleHistory?.[0]?.priceRaw },
);

facts["dayCare.outdoorCapacity"] = compute({
  value: 37,
  formula: "2807 / 75",
  explain: "outdoor 2,807 sq ft / 75 sq ft per child (DCFS) = ~37 children",
  inputs: [
    { ref: "site.outdoorSqFt", value: 2807, source: { section: "Site Specific Day Care Details" } },
    { ref: "dcfs.outdoorSqFtPerChild", value: 75, source: { section: "Site Specific Day Care Details" } },
  ],
  basis: "Before any outdoor area allocated to parking or drop-off.",
});

------------------------------- */
