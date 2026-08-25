// verify.ts
// After generation, flag numbers in the report that don't trace back to provenance.
// This flags CANDIDATES for review — it is not proof of fabrication.

import type { RunProvenance } from "./runStore";

function normalizeNum(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suffix = m[2]?.toUpperCase();
  const mult = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return n * mult;
}

function knownValues(run: RunProvenance): Set<number> {
  const known = new Set<number>();
  for (const rec of Object.values(run.facts)) {
    if (typeof rec.value === "number") known.add(rec.value);
    if (rec.kind === "computed") {
      for (const i of rec.inputs) {
        if (typeof i.value === "number") known.add(i.value);
      }
    }
  }
  return known;
}

export function verifyReportNumbers(reportText: string, run: RunProvenance): string[] {
  const known = knownValues(run);
  const tokens = reportText.match(/\$?\d[\d,]*(?:\.\d+)?\s?[KMB]?/gi) ?? [];
  const untraceable: string[] = [];

  for (const t of tokens) {
    const n = normalizeNum(t);
    if (n === null) continue;
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue; // years
    if (n <= 12) continue; // small counts, list numbers, months

    const ok = [...known].some(
      (k) => Math.abs(k - n) <= Math.max(1, Math.abs(k) * 0.005), // 0.5% rounding tolerance
    );
    if (!ok) untraceable.push(t.trim());
  }

  const unique = [...new Set(untraceable)];
  if (unique.length) {
    console.warn("[VERIFY] numbers not traceable to provenance:", unique);
  } else {
    console.log("[VERIFY] all numbers traceable");
  }
  return unique;
}

/*
USAGE:

  import { verifyReportNumbers } from "./verify";
  const flagged = verifyReportNumbers(generatedReportText, run);

HONEST LIMITS:
- Percentages, ratios, and legitimately derived figures will surface until you register
  them as computed provenance records. Expect noise on the first few runs.
- Treat a non-empty list as "look at these", not "these are fabricated".
- The fix for a false positive is usually to add the derivation as a compute() record,
  which also makes it auditable in the report.
*/
