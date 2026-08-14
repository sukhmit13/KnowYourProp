import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface IncentiveProgram {
  key: string;
  name: string;
  category: string;
  method: 'chicago_polygon' | 'use_based' | 'conditional' | 'federal_tract' | 'federal_zcta' | 'manual' | 'derived' | 'tract_lookup' | 'zoning_check' | 'project_type_check';
  implement: 'now' | 'needs_data' | 'stub' | 'discontinued';
  geojsonEndpoint?: string;
  featureNameProp?: string[];
  featureNumberProp?: string[];
  requiresCategoryPrefix?: string[];
  requiresZoningPrefix?: string[];
  requiresProjectType?: string[];
  zoningFallback?: boolean;
  requiresLandmark?: boolean;
  requiresOfficialLandmark?: boolean;
  isRequirement?: boolean;
  minUnits?: number;
  maxUnits?: number;
  skipUnitCheckForNewConstruction?: boolean;
  residentialOnly?: boolean;
  automatic: boolean;
  priority?: string;
  tractLookupFile?: string;
  grantType?: string;
  applicationDates?: string;
  nextRoundNote?: string;
  learnMoreUrl?: string;
  lenders?: Array<{ name: string; contact: string; phone: string }>;
  resultPhrasing: {
    inArea?: string;
    inAreaHighNeed?: string;
    notInArea?: string;
    potentiallyEligible?: string;
    potentiallyEligibleGrandfathered?: string;
    zoningInferred?: string;
    notApplicableUnits?: string;
    notApplicable?: string;
    pending?: string;
    manual?: string;
    discontinued?: string;
  };
}

interface IncentivesConfig {
  programs: IncentiveProgram[];
}

export interface CheckResult {
  key: string;
  name: string;
  category: string;
  status: 'in_area' | 'not_in_area' | 'potentially_eligible' | 'not_applicable' | 'manual_check' | 'data_pending';
  statement: string;
  automatic: boolean;
  actionRequired: boolean;
  priority?: string;
  isRequirement?: boolean;
  zoningInferred?: boolean;
  awaitingProjectType?: boolean;
  grantType?: string;
  applicationDates?: string;
  nextRoundNote?: string;
  learnMoreUrl?: string;
  lenders?: Array<{ name: string; contact: string; phone: string }>;
}

export interface IncentivesCheckInput {
  isOfficialLandmark?: boolean | null;
  isLandmarkDistrict?: boolean | null;
  landmarkDistrictName?: string | null;
  lat: number;
  lon: number;
  projectCategory?: string | null;
  projectType?: string | null;
  isLandmark?: boolean | null;
  tractGeoid?: string | null;
  zipCode?: string | null;
  zoningCode?: string | null;
  unitCount?: number | null;
}

let config: IncentivesConfig | null = null;
const geojsonCache = new Map<string, any>();
let initPromise: Promise<void> | null = null;

function loadConfig(): IncentivesConfig {
  if (config) return config;
  const configPath = path.join(__dirname, 'data/incentives-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw) as IncentivesConfig;
  return config;
}

interface TractSets { targeted: Set<string>; highNeed: Set<string> }
const tractDataCache = new Map<string, TractSets>();
function loadTractData(filename: string): TractSets {
  if (tractDataCache.has(filename)) return tractDataCache.get(filename)!;
  const filePath = path.join(__dirname, 'data', filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as { targeted_geoids: string[]; high_need_geoids?: string[] };
  const sets: TractSets = {
    targeted: new Set(data.targeted_geoids),
    highNeed: new Set(data.high_need_geoids ?? []),
  };
  tractDataCache.set(filename, sets);
  return sets;
}

function getFeatureProp(props: Record<string, any>, candidates: string[]): string | null {
  for (const key of candidates) {
    const val = props[key];
    if (val != null && val !== '') return String(val);
  }
  const lowerProps: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    lowerProps[k.toLowerCase()] = v;
  }
  for (const key of candidates) {
    const val = lowerProps[key.toLowerCase()];
    if (val != null && val !== '') return String(val);
  }
  return null;
}

async function fetchAndCacheGeoJSON(key: string, endpoint: string): Promise<any> {
  if (geojsonCache.has(key)) return geojsonCache.get(key);
  // Support local file paths (relative to server/data/) as well as remote URLs
  const isLocal = !endpoint.startsWith('http://') && !endpoint.startsWith('https://');
  if (isLocal) {
    const filePath = path.join(__dirname, 'data', endpoint.replace(/^\.?\/?data\//, ''));
    console.log(`[incentivesChecker] Loading local GeoJSON for ${key}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    geojsonCache.set(key, data);
    console.log(`[incentivesChecker] Cached ${data.features?.length ?? 0} features for ${key} (local)`);
    return data;
  }
  console.log(`[incentivesChecker] Fetching GeoJSON for ${key}`);
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    geojsonCache.set(key, data);
    console.log(`[incentivesChecker] Cached ${data.features?.length ?? 0} features for ${key}`);
    return data;
  } catch (err: any) {
    console.warn(`[incentivesChecker] Failed to fetch GeoJSON for ${key}: ${err.message}`);
    throw err;
  }
}

export function initIncentivesChecker(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = loadConfig();
    const polygonPrograms = cfg.programs.filter(
      p => p.method === 'chicago_polygon' && p.implement === 'now' && p.geojsonEndpoint
    );
    await Promise.allSettled(
      polygonPrograms.map(p => fetchAndCacheGeoJSON(p.key, p.geojsonEndpoint!))
    );
    console.log(`[incentivesChecker] Init complete for ${polygonPrograms.length} polygon layer(s)`);
  })();
  return initPromise;
}

/**
 * Check whether a zoning code matches any of the given prefixes.
 * Handles multi-character prefixes like "PMD" before single-char "P".
 */
function zoningMatchesPrefixes(zoningUpper: string, prefixes: string[]): boolean {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  return sorted.some(p => zoningUpper.startsWith(p.toUpperCase()));
}

/**
 * Return the typical maximum residential units permitted by a Chicago zoning code.
 * Used for grandfathering detection (actual units > this → likely grandfathered).
 * Returns null for zoning types where this is not a meaningful constraint.
 */
function getZoningTypicalMaxUnits(zoningUpper: string): number | null {
  // Normalize "RT-4", "RM-4.5", "RS 3" → "RT4", "RM45", "RS3" so hyphenated
  // codes from the zoning API match (previously "RT-4" fell to the catch-all).
  const z = zoningUpper.replace(/[-.\s]/g, '');
  if (z.startsWith('RS1') || z.startsWith('RS2') || z.startsWith('RS3')) return 2;
  if (z.startsWith('RT3')) return 3;
  if (z.startsWith('RT4')) return 4;
  if (z.startsWith('RM4')) return 3;   // RM4.5 — ~1,750 sq ft/unit; typical Chicago lot ~3,500 sq ft = ~2 units
  if (z.startsWith('RM5') || z.startsWith('RM6')) return 999;
  if (z.startsWith('R')) return 2;      // catch-all for other RS/RT variants
  return null; // non-residential — no applicable unit cap
}

export async function checkIncentives(input: IncentivesCheckInput): Promise<CheckResult[]> {
  const cfg = loadConfig();
  const results: CheckResult[] = [];
  const pt = turf.point([input.lon, input.lat]);

  const hasProjectCategory = !!(input.projectCategory);
  const zoningUpper = input.zoningCode?.toUpperCase() ?? '';
  const hasZoning = zoningUpper.length > 0;

  for (const program of cfg.programs) {

    // ── Universal gate: residential-only programs ──────────────────────────────
    // Suppress for clearly non-residential zoning (B, C, M, DC, DX, DS).
    // If zoning is unknown we let the program through and rely on result phrasing.
    if (program.residentialOnly && hasZoning) {
      const isNonResidential = (
        zoningUpper.startsWith('B') ||
        zoningUpper.startsWith('C') ||
        zoningUpper.startsWith('M') ||
        zoningUpper.startsWith('DC') ||
        zoningUpper.startsWith('DX') ||
        zoningUpper.startsWith('DS')
      ) && !zoningUpper.startsWith('DR'); // DR = Downtown Residential — keep
      if (isNonResidential) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_applicable',
          statement: program.resultPhrasing.notApplicable ?? `${program.name} is available for residential properties only. Commercial and industrial zoning designations are not eligible.`,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
        continue;
      }
    }

    // ── Universal gate: max-units cap ─────────────────────────────────────────
    // If a program is limited to a maximum unit count and we know the actual
    // unit count exceeds that cap, suppress as not applicable.
    if (program.maxUnits != null && input.unitCount != null && !isNaN(input.unitCount)) {
      if (input.unitCount > program.maxUnits) {
        const stmt = (program.resultPhrasing.notApplicableUnits ?? `${program.name} is available for properties with up to {maxUnits} unit(s). This property has {unitCount} unit(s).`)
          .replace('{maxUnits}', String(program.maxUnits))
          .replace('{unitCount}', String(input.unitCount));
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_applicable', statement: stmt,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
        continue;
      }
    }

    // ── Geographic polygon check ──────────────────────────────────────────────
    if (program.method === 'chicago_polygon' && program.implement === 'now') {
      let geojson: any;
      try {
        geojson = await fetchAndCacheGeoJSON(program.key, program.geojsonEndpoint!);
      } catch {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'data_pending',
          statement: `${program.name} check temporarily unavailable — layer could not be loaded.`,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
        continue;
      }

      let matched = false;
      let matchedProps: Record<string, any> = {};
      for (const feature of geojson.features ?? []) {
        try {
          if (turf.booleanPointInPolygon(pt, feature)) {
            matched = true;
            matchedProps = feature.properties ?? {};
            break;
          }
        } catch { /* skip malformed features */ }
      }

      if (matched) {
        let stmt = program.resultPhrasing.inArea ?? `In a ${program.name} area.`;
        const name = getFeatureProp(matchedProps, program.featureNameProp ?? ['name', 'NAME']) ?? '';
        const number = getFeatureProp(matchedProps, program.featureNumberProp ?? []) ?? '';
        stmt = stmt.replace('{name}', name).replace('{number}', number).replace('{corridorName}', name);
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'in_area', statement: stmt,
          automatic: program.automatic, actionRequired: !program.automatic, priority: program.priority,
        });
      } else {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_in_area',
          statement: program.resultPhrasing.notInArea ?? `Not in a ${program.name} area.`,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
      }

    // ── Use-based check (project type + zoning inference + unit count) ──────────
    } else if (program.method === 'use_based' && program.implement === 'now') {

      const knownUnitCount = (input.unitCount != null && !isNaN(input.unitCount)) ? input.unitCount : null;
      const minUnits = program.minUnits ?? null;
      // Programs can downgrade their positive result (e.g. Class 8 is geographically
      // limited to five south-suburban townships — in Chicago it needs manual confirmation).
      const eligibleStatus: 'potentially_eligible' | 'manual_check' =
        (program as any).eligibleStatus === 'manual_check' ? 'manual_check' : 'potentially_eligible';

      // ── Step 0: zoning-capacity gate (when unit count is unknown) ──
      // If the program needs a minimum unit count and the zoning district's typical
      // maximum is below that threshold, the program is not applicable as-is —
      // e.g. RT-4 tops out around 4 units, so LIHTC's 7+ requirement can't be met
      // without a zoning change or an existing legal nonconforming building.
      if (minUnits != null && knownUnitCount == null && hasZoning) {
        const zoningCap = getZoningTypicalMaxUnits(zoningUpper);
        if (zoningCap != null && zoningCap < minUnits) {
          const stmt = ((program.resultPhrasing as any).notApplicableZoningCap ?? `Not applicable as-is — ${program.name} requires {minUnits}+ units, but {zoning} zoning typically allows a maximum of {zoningMax} unit(s). An existing legal nonconforming building with {minUnits}+ units or a zoning change could still qualify — verify the actual unit count.`)
            .replace(/\{minUnits\}/g, String(minUnits))
            .replace(/\{zoningMax\}/g, String(zoningCap))
            .replace(/\{zoning\}/g, input.zoningCode ?? zoningUpper);
          results.push({
            key: program.key, name: program.name, category: program.category,
            status: 'not_applicable', statement: stmt,
            automatic: program.automatic, actionRequired: false,
            priority: program.priority,
            isRequirement: program.isRequirement,
          });
          continue;
        }
      }

      // ── Step 1: unit count gate (when we have parcel data and a min-unit threshold) ──
      // If the existing parcel unit count is known and below the program's minimum,
      // the program is not applicable — regardless of project type or zoning.
      // Exception: grandfathered parcels (more units than zoning normally allows)
      // still pass through if their unit count meets the threshold.
      if (minUnits != null && knownUnitCount != null) {
        const zoningMax = getZoningTypicalMaxUnits(zoningUpper);
        const isGrandfathered = zoningMax != null && knownUnitCount > zoningMax;

        if (knownUnitCount < minUnits) {
          // Unit count too low — not applicable (grandfathering doesn't help here because
          // the parcel still doesn't have enough units to meet the program threshold)
          const stmt = (program.resultPhrasing.notApplicableUnits ?? `Not applicable — ${program.name} requires ${minUnits}+ units; this parcel has {unitCount} unit(s).`)
            .replace('{unitCount}', String(knownUnitCount))
            .replace('{zoning}', input.zoningCode ?? zoningUpper);
          results.push({
            key: program.key, name: program.name, category: program.category,
            status: 'not_applicable',
            statement: stmt,
            automatic: program.automatic, actionRequired: false,
            priority: program.priority,
            isRequirement: program.isRequirement,
          });
          continue;
        }

        // Unit count meets threshold — check category / zoning as usual, but note if grandfathered
        if (hasProjectCategory) {
          const cat = input.projectCategory!;
          const categoryQualifies = (program.requiresCategoryPrefix ?? []).some(prefix =>
            cat.toLowerCase().startsWith(prefix.toLowerCase())
          );
          // If program opts in with zoningFallback:true, also accept zoning match when
          // category doesn't match (e.g. Day Care Center in B3-5 qualifies for commercial
          // grants even though its project category is "Public and Civic", not "Commercial").
          // NOT applied to residential programs to avoid false positives (Day Care is
          // permitted in R zones but shouldn't qualify for Class 9 / LIHTC / ARO).
          const zoningAlsoQualifies = program.zoningFallback === true && hasZoning && (program.requiresZoningPrefix ?? []).length > 0
            ? zoningMatchesPrefixes(zoningUpper, program.requiresZoningPrefix!)
            : false;
          const qualifies = categoryQualifies || zoningAlsoQualifies;
          let stmt: string;
          if (qualifies) {
            stmt = isGrandfathered
              ? (program.resultPhrasing.potentiallyEligibleGrandfathered ?? program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`)
                .replace('{unitCount}', String(knownUnitCount))
                .replace('{zoning}', input.zoningCode ?? zoningUpper)
              : (program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`);
          } else {
            stmt = program.resultPhrasing.notApplicable ?? `Not applicable for this project type.`;
          }
          results.push({
            key: program.key, name: program.name, category: program.category,
            status: qualifies ? eligibleStatus : 'not_applicable',
            statement: stmt,
            automatic: program.automatic,
            actionRequired: qualifies ? !program.automatic : false,
            priority: program.priority,
            isRequirement: program.isRequirement,
          });
          continue;
        }

        // No project type — zoning inference with known unit count (meets threshold)
        if (hasZoning && (program.requiresZoningPrefix ?? []).length > 0) {
          const zoningQualifies = zoningMatchesPrefixes(zoningUpper, program.requiresZoningPrefix!);
          let stmt: string;
          if (zoningQualifies) {
            stmt = isGrandfathered
              ? (program.resultPhrasing.potentiallyEligibleGrandfathered ?? program.resultPhrasing.zoningInferred ?? `Potentially eligible for ${program.name} (grandfathered building).`)
                .replace('{unitCount}', String(knownUnitCount))
                .replace('{zoning}', input.zoningCode ?? zoningUpper)
              : (program.resultPhrasing.zoningInferred ?? program.resultPhrasing.potentiallyEligible ?? `Zoning suggests ${program.name} may apply.`)
                .replace('{zoning}', input.zoningCode ?? zoningUpper);
          } else {
            stmt = program.resultPhrasing.notApplicable ?? `Not applicable — zoning does not match.`;
          }
          results.push({
            key: program.key, name: program.name, category: program.category,
            status: zoningQualifies ? eligibleStatus : 'not_applicable',
            statement: stmt,
            automatic: program.automatic,
            actionRequired: zoningQualifies ? !program.automatic : false,
            priority: program.priority,
            isRequirement: program.isRequirement,
            zoningInferred: zoningQualifies,
          });
          continue;
        }

        // Meets threshold but no project type / zoning to refine further
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: eligibleStatus,
          statement: program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`,
          automatic: program.automatic, actionRequired: !program.automatic,
          priority: program.priority, isRequirement: program.isRequirement,
        });
        continue;
      }

      // ── Step 2: standard path (no unit count constraint or unknown count) ─────
      if (hasProjectCategory) {
        // Project type is set — use category matching, with zoning fallback when both are configured
        const cat = input.projectCategory!;
        const categoryQualifies = (program.requiresCategoryPrefix ?? []).some(prefix =>
          cat.toLowerCase().startsWith(prefix.toLowerCase())
        );
        // If program opts in with zoningFallback:true, also accept zoning match when
        // category doesn't match (e.g. Day Care Center in B3-5 qualifies for commercial
        // grants even though its project category is "Public and Civic", not "Commercial").
        // NOT applied to residential programs to avoid false positives.
        const zoningAlsoQualifies = program.zoningFallback === true && hasZoning && (program.requiresZoningPrefix ?? []).length > 0
          ? zoningMatchesPrefixes(zoningUpper, program.requiresZoningPrefix!)
          : false;
        const qualifies = categoryQualifies || zoningAlsoQualifies;
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: qualifies ? eligibleStatus : 'not_applicable',
          statement: qualifies
            ? (program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`)
            : (program.resultPhrasing.notApplicable ?? `Not applicable for this project type.`),
          automatic: program.automatic,
          actionRequired: qualifies ? !program.automatic : false,
          priority: program.priority,
          isRequirement: program.isRequirement,
        });

      } else if (hasZoning && (program.requiresZoningPrefix ?? []).length > 0) {
        // No project type yet — infer from zoning designation
        const zoningQualifies = zoningMatchesPrefixes(zoningUpper, program.requiresZoningPrefix!);
        let stmt: string;
        if (zoningQualifies) {
          stmt = (program.resultPhrasing.zoningInferred ?? program.resultPhrasing.potentiallyEligible ?? `Zoning suggests ${program.name} may apply.`)
            .replace('{zoning}', input.zoningCode ?? zoningUpper);
        } else {
          stmt = program.resultPhrasing.notApplicable ?? `Not applicable — zoning designation (${input.zoningCode}) does not match this program's requirements.`;
        }
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: zoningQualifies ? eligibleStatus : 'not_applicable',
          statement: stmt,
          automatic: program.automatic,
          actionRequired: zoningQualifies ? !program.automatic : false,
          priority: program.priority,
          isRequirement: program.isRequirement,
          zoningInferred: zoningQualifies,
        });

      } else {
        // No project type, no usable zoning — show as awaiting
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'data_pending',
          statement: `Set a project type to check ${program.name} eligibility.`,
          automatic: program.automatic, actionRequired: false,
          priority: program.priority,
          isRequirement: program.isRequirement,
          awaitingProjectType: true,
        });
      }

    // ── Conditional (landmark-gated) ──────────────────────────────────────────
    } else if (program.method === 'conditional' && program.implement === 'now') {
      if (program.requiresLandmark) {
        const isLandmark = !!input.isLandmark;
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: isLandmark ? 'potentially_eligible' : 'not_applicable',
          statement: isLandmark
            ? (program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`)
            : (program.resultPhrasing.notApplicable ?? `Not applicable — landmark designation required.`),
          automatic: program.automatic,
          actionRequired: isLandmark ? !program.automatic : false,
          priority: program.priority,
        });
      } else if (program.requiresOfficialLandmark) {
        const isOfficial = !!input.isOfficialLandmark;
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: isOfficial ? 'potentially_eligible' : 'not_applicable',
          statement: isOfficial
            ? (program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`)
            : (program.resultPhrasing.notApplicable ?? `Not applicable — official Chicago Landmark designation required.`),
          automatic: program.automatic,
          actionRequired: isOfficial ? !program.automatic : false,
          priority: program.priority,
        });
      }

    // ── Federal tract / ZCTA (needs_data) ────────────────────────────────────
    } else if (
      (program.method === 'federal_tract' || program.method === 'federal_zcta') &&
      program.implement === 'needs_data'
    ) {
      results.push({
        key: program.key, name: program.name, category: program.category,
        status: 'data_pending',
        statement: program.resultPhrasing.pending ?? `${program.name} check pending — dataset not yet loaded.`,
        automatic: program.automatic, actionRequired: false, priority: program.priority,
      });

    // ── Discontinued federal program ──────────────────────────────────────────
    } else if (program.implement === 'discontinued') {
      results.push({
        key: program.key, name: program.name, category: program.category,
        status: 'manual_check',
        statement: program.resultPhrasing.discontinued ?? `${program.name} was discontinued — manual check required.`,
        automatic: false, actionRequired: true, priority: program.priority,
      });

    // ── Tract lookup (local JSON set) ─────────────────────────────────────────
    } else if (program.method === 'tract_lookup' && program.implement === 'now') {
      const tractFile = program.tractLookupFile;
      if (!tractFile) continue;
      let sets: TractSets;
      try {
        sets = loadTractData(tractFile);
      } catch {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'data_pending',
          statement: `${program.name} check temporarily unavailable — dataset could not be loaded.`,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
        continue;
      }
      const lenders = program.lenders;
      if (!input.tractGeoid) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'manual_check',
          statement: program.resultPhrasing.manual ?? `${program.name}: census tract not available — manual check required.`,
          automatic: false, actionRequired: true, priority: program.priority,
          ...(lenders ? { lenders } : {}),
        });
      } else if (sets.targeted.has(input.tractGeoid)) {
        const isHighNeed = sets.highNeed.size > 0 && sets.highNeed.has(input.tractGeoid);
        const stmt = isHighNeed && program.resultPhrasing.inAreaHighNeed
          ? program.resultPhrasing.inAreaHighNeed
          : (program.resultPhrasing.inArea ?? `${program.name}: property is in a targeted area.`);
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'in_area', statement: stmt,
          automatic: program.automatic, actionRequired: !program.automatic, priority: program.priority,
          ...(lenders ? { lenders } : {}),
        });
      } else {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_in_area',
          statement: program.resultPhrasing.notInArea ?? `${program.name}: property is not in a targeted area.`,
          automatic: program.automatic, actionRequired: false, priority: program.priority,
          ...(lenders ? { lenders } : {}),
        });
      }

    // ── Zoning-only check ─────────────────────────────────────────────────────
    } else if (program.method === 'zoning_check' && program.implement === 'now') {
      const prefixes = program.requiresZoningPrefix ?? [];
      if (!hasZoning) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'manual_check',
          statement: program.resultPhrasing.manual ?? `${program.name}: zoning data unavailable — manual check required.`,
          automatic: false, actionRequired: true, priority: program.priority,
        });
      } else if (zoningMatchesPrefixes(zoningUpper, prefixes)) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'potentially_eligible',
          statement: (program.resultPhrasing.potentiallyEligible ?? `${program.name}: zoning ${input.zoningCode} qualifies.`)
            .replace('{zoning}', input.zoningCode ?? zoningUpper),
          automatic: program.automatic, actionRequired: !program.automatic, priority: program.priority,
        });
      } else {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_applicable',
          statement: (program.resultPhrasing.notApplicable ?? `${program.name}: zoning ${input.zoningCode} is not eligible.`)
            .replace('{zoning}', input.zoningCode ?? zoningUpper),
          automatic: program.automatic, actionRequired: false, priority: program.priority,
        });
      }

    // ── Project type exact match ──────────────────────────────────────────────
    } else if (program.method === 'project_type_check' && program.implement === 'now') {
      const projectType = input.projectType ?? null;
      const allowedTypes = program.requiresProjectType ?? [];
      if (!projectType) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'data_pending',
          statement: `Select a project type to check ${program.name} eligibility.`,
          automatic: program.automatic, actionRequired: false,
          priority: program.priority, awaitingProjectType: true,
        });
      } else if (allowedTypes.some(t => t.toLowerCase() === projectType.toLowerCase())) {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'potentially_eligible',
          statement: program.resultPhrasing.potentiallyEligible ?? `Potentially eligible for ${program.name}.`,
          automatic: program.automatic, actionRequired: !program.automatic,
          priority: program.priority,
        });
      } else {
        results.push({
          key: program.key, name: program.name, category: program.category,
          status: 'not_applicable',
          statement: program.resultPhrasing.notApplicable ?? `Not applicable — project type does not qualify for ${program.name}.`,
          automatic: program.automatic, actionRequired: false,
          priority: program.priority,
        });
      }

    // ── Manual / stub ─────────────────────────────────────────────────────────
    } else if (
      (program.method === 'manual' || program.method === 'derived') &&
      (program.implement === 'stub' || program.implement === 'now')
    ) {
      results.push({
        key: program.key, name: program.name, category: program.category,
        status: 'manual_check',
        statement: program.resultPhrasing.manual ?? `Manual check required for ${program.name}.`,
        automatic: program.automatic, actionRequired: true, priority: program.priority,
      });
    }
  }

  // Post-process: attach grantType / applicationDates / nextRoundNote from config to each result
  const programMap = new Map(cfg.programs.map(p => [p.key, p]));
  for (const result of results) {
    const prog = programMap.get(result.key);
    if (prog) {
      if (prog.grantType) result.grantType = prog.grantType;
      if (prog.applicationDates) result.applicationDates = prog.applicationDates;
      if (prog.nextRoundNote) result.nextRoundNote = prog.nextRoundNote;
      if (prog.learnMoreUrl) result.learnMoreUrl = prog.learnMoreUrl;
    }
  }

  return results;
}
