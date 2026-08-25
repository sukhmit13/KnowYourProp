// evidenceGating.ts
// Strips use-specific data blocks that don't match the selected project type.
// Call this immediately before serializing the payload.

/** Blocks that only make sense when that specific use is selected. */
export const USE_SPECIFIC_BLOCKS: Record<string, string[]> = {
  "Day Care Center": [
    "daycareAnalysis",
    "childcareAccess",
    "childcareDemographics",
    "parentsInLaborForce",
    "dayCareNeedsEstimator",
    "siteSpecificDayCare",
    "ccapParticipation",
    "nearbyDayCares",
    "nearbyDayCaresGoogle",
    "quickCashflowDaycare",
  ],
  // Add future uses here, e.g.:
  // "Restaurant": ["restaurantAnalysis", "liquorLicenseDensity", ...],
};

/** Uses for which a one-line amenity note is still relevant. */
export const RESIDENTIAL_USES = [
  "Single Family",
  "Two Flat",
  "Multi-Family",
  "Condo",
  "Residential",
  "Mixed-Use",
];

export function gateEvidenceByUse<T extends Record<string, any>>(evidence: T): T {
  const selected: string | null = evidence.projectType ?? null;

  for (const [use, blocks] of Object.entries(USE_SPECIFIC_BLOCKS)) {
    if (selected === use) continue; // keep — this IS the selected use

    // Preserve a single amenity line for residential buyers before deleting.
    if (use === "Day Care Center" && selected && RESIDENTIAL_USES.includes(selected)) {
      const c = evidence.childcareAccess;
      const ratio = c?.childrenPerSlot ?? c?.value?.childrenPerSlot;
      if (ratio != null) {
        evidence.neighborhoodAmenities = {
          ...(evidence.neighborhoodAmenities ?? {}),
          childcareAccess: `${ratio} children per licensed slot (${c?.label ?? "see source"})`,
          geography: c?.geography ?? "ZIP",
        };
      }
    }

    for (const key of blocks) {
      if (key in evidence) delete (evidence as any)[key];
    }
  }

  if (!selected) {
    console.log("[GATING] no projectType — all use-specific blocks stripped");
  }

  return evidence;
}

/*
USAGE:

  import { gateEvidenceByUse } from "./evidenceGating";
  evidence = gateEvidenceByUse(evidence);
  const payload = JSON.stringify(evidence);

NOTES:
- If projectType is null, every use-specific block is stripped and no amenity line is
  added. A use-agnostic report is correct; a guessed-use report is not.
- Do NOT infer the use from zoning or building characteristics. Example: 3014 W Irving
  Park is Assessor Class 212 "Three- to Six-Flat", 4 units — inferring "single family"
  from the building would be wrong. The funnel declares the use.
- If your evidence package is cached, gating here will NOT clear an already-stored
  package. Check that the package is rebuilt per run, or include projectType in the
  cache key (see runStore.ts).
*/
