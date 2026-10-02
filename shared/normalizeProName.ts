/** Canonical grouping key only; always display the original record's spelling. */
export function normalizeProName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toUpperCase()
    .replace(/\b(?:ESQ|ATTORNEY|ATTY|JR|SR|III|II|IV)\b\.?/g, "")
    .replace(/\b(?:INC|LLC|LLP|LTD|CO|CORP|COMPANY|PC|PLLC)\b\.?/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}