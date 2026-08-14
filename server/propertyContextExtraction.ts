/**
 * PROPERTY CONTEXT EXTRACTION — cache-only population of the memory context
 * ==========================================================================
 *
 * Reads ONLY already-cached or local data sources and writes structured,
 * source-linked facts into the 7-section property context for a run.
 *
 * HARD RULE: nothing in this module may trigger a live fetch or scraper.
 * - property_tax_cache and lien_cache are read DIRECTLY (any age) — never
 *   call getPropertyTax()/getLienData(), which spawn Playwright on miss.
 * - Geocode uses getGeocodeAnyAge (no re-fetch path).
 * - LoopNet/Peerspace use the readCached* helpers (file caches, no actor runs).
 * - Landmark + zoning reference checks are local datasets.
 *
 * Extraction is idempotent per run: each pass wipes previously-extracted
 * facts/derived/notes and rebuilds them from current cache state, while
 * preserving professionals, mini_summary, confidence, eligible_for_onepager,
 * and any source_index entries still referenced by surviving professionals.
 *
 * Failure model: every source read is individually guarded. A failed or
 * absent source records a note on the relevant section and downgrades
 * extraction_status to "partial" — extraction itself only throws if the run
 * or its context row is missing entirely.
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { sql as sqlTag } from "drizzle-orm";
import { propertyTaxCache, lienCache } from "@shared/schema";
import { storage } from "./storage";
import { readCachedCrexi } from "./crexi";
import { readCachedPeerspace } from "./peerspace";
import { checkLandmarkStatus } from "./gis";
import { getZoningInfo } from "@shared/zoningData";
import { applyContextBatch, type ContextBatchOps } from "./propertyContext";
import type { PropertyContext } from "@shared/propertyContext";
import { PROPERTY_CONTEXT_SECTIONS } from "@shared/propertyContext";

export interface ExtractionResult {
  status: "complete" | "partial";
  factCount: number;
  derivedCount: number;
  sourceCount: number;
  failures: string[];
}

const CRITICAL_LIEN_CATEGORIES = new Set([
  "foreclosure",
  "litigation",
  "lien",
  "mechanic",
  "judgment",
  "federal_tax",
  "state_tax",
  "support",
  "other_lien",
]);

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function dedupeLienDocs(docsRaw: any[]): any[] {
  const seen = new Set<string>();
  return docsRaw.filter((d: any) => {
    const key = d.documentNumber || `${d.documentType}|${d.recordedDate}|${d.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract facts from cached sources into the run's property context.
 * Never triggers live fetches. Throws only if the run or context row is missing.
 */
export async function extractPropertyContext(runId: number): Promise<ExtractionResult> {
  const run = await storage.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const failures: string[] = [];
  const absences: Array<{ section: string; note: string }> = [];

  // ---- GATHER (reads only, all guarded) ----

  let geo: any = null;
  try {
    geo = (await storage.getGeocodeAnyAge(run.address.trim().toLowerCase())) ?? null;
  } catch (e: any) {
    failures.push(`geocode_cache: ${e?.message || e}`);
  }

  let pin: string | null = null;
  try {
    const addressHash = run.address.toUpperCase().replace(/[^A-Z0-9]/g, "");
    pin = await storage.getPinForAddress(addressHash);
  } catch (e: any) {
    failures.push(`pin_lookup_cache: ${e?.message || e}`);
  }

  let taxRow: typeof propertyTaxCache.$inferSelect | null = null;
  if (pin) {
    try {
      const [row] = await db.select().from(propertyTaxCache).where(eq(propertyTaxCache.pin, pin)).limit(1);
      taxRow = row ?? null;
    } catch (e: any) {
      failures.push(`property_tax_cache: ${e?.message || e}`);
    }
  }

  let lienRow: typeof lienCache.$inferSelect | null = null;
  if (pin) {
    try {
      const [row] = await db.select().from(lienCache).where(eq(lienCache.pin, pin)).limit(1);
      lienRow = row ?? null;
    } catch (e: any) {
      failures.push(`lien_cache: ${e?.message || e}`);
    }
  }

  let rentcast: any = null;
  if (geo?.zipCode) {
    try {
      const rows = await db.execute(
        sqlTag`SELECT data FROM rentcast_cache WHERE cache_key = ${geo.zipCode} AND cache_type = 'market' LIMIT 1`
      );
      const anyRows: any = rows;
      const rcRow = anyRows.rows?.[0] || anyRows[0];
      if (rcRow?.data) {
        rentcast = typeof rcRow.data === "string" ? JSON.parse(rcRow.data) : rcRow.data;
      }
    } catch (e: any) {
      failures.push(`rentcast_cache: ${e?.message || e}`);
    }
  }

  let crexi: any = null;
  let peerspace: any = null;
  if (geo?.zipCode) {
    try {
      const c = readCachedCrexi(geo.zipCode);
      if (c && c.status === "complete") crexi = c;
    } catch (e: any) {
      failures.push(`loopnet_cache: ${e?.message || e}`);
    }
    try {
      const p = readCachedPeerspace(geo.zipCode);
      if (p && p.status === "complete") peerspace = p;
    } catch (e: any) {
      failures.push(`peerspace_cache: ${e?.message || e}`);
    }
  }

  let landmark: any = null;
  const glat = geo ? parseFloat(String(geo.lat)) : NaN;
  const glon = geo ? parseFloat(String(geo.lon)) : NaN;
  if (!isNaN(glat) && !isNaN(glon)) {
    try {
      // No address passed on purpose: providing one enables checkLandmarkStatus's
      // live city-API fallback, and extraction must stay cache/local-only.
      landmark = await checkLandmarkStatus(glat, glon);
    } catch (e: any) {
      failures.push(`landmark_local: ${e?.message || e}`);
    }
  }

  const zoningInfo = geo?.zoning ? getZoningInfo(geo.zoning) : null;
  const listing = (run as any).listingData as any;

  // ---- APPLY (single load-mutate-save, serialized per run) ----

  const now = new Date().toISOString();
  const stamp = now.slice(0, 10);

  const counts = await applyContextBatch(runId, (ctx: PropertyContext, ops: ContextBatchOps) => {
    // Wipe previously-extracted content, preserving professionals + placeholders
    const keptRefIds = new Set<string>();
    for (const p of ctx.sections.property_linked_professionals.professionals ?? []) {
      for (const refId of p.source_ref_ids) keptRefIds.add(refId);
    }
    ctx.source_index = ctx.source_index.filter((s) => keptRefIds.has(s.id));
    for (const name of PROPERTY_CONTEXT_SECTIONS) {
      const section = ctx.sections[name];
      section.facts = [];
      section.derived = [];
      section.notes = [];
    }

    // Identity: prefer PIN once cached
    if (pin && ctx.property_id !== pin) ctx.property_id = pin;

    // --- Source references ---
    const srcGeo = geo
      ? ops.addSourceReference({
          source_document: "geocode_cache",
          source_section: "U.S. Census Geocoder + Chicago GIS lookups (cached)",
          source_type: "cached_api",
          source_snippet: `zoning=${geo.zoning ?? "?"} tif=${geo.tifName ?? "none"} zip=${geo.zipCode ?? "?"}`,
        })
      : null;

    const srcTax = taxRow
      ? ops.addSourceReference({
          source_document: "property_tax_cache",
          source_section: "Cook County Treasurer property tax record (cached scrape)",
          source_type: "cached_scrape",
          source_url: taxRow.treasurerBillUrl ?? null,
          source_snippet: pin ? `PIN ${pin}` : null,
        })
      : null;

    const srcLien = lienRow
      ? ops.addSourceReference({
          source_document: "lien_cache",
          source_section: "Cook County Clerk Recorder of Deeds (cached scrape)",
          source_type: "cached_scrape",
          source_snippet: pin ? `PIN ${pin}` : null,
        })
      : null;

    const srcRentcast = rentcast
      ? ops.addSourceReference({
          source_document: "rentcast_cache",
          source_section: `RentCast rental market data, ZIP ${geo?.zipCode} (cached API)`,
          source_type: "cached_api",
        })
      : null;

    const srcLoopnet = crexi
      ? ops.addSourceReference({
          source_document: "loopnet_cache",
          source_section: `LoopNet commercial for-lease listings, ZIP ${geo?.zipCode} (cached scrape)`,
          source_type: "cached_scrape",
        })
      : null;

    const srcPeerspace = peerspace
      ? ops.addSourceReference({
          source_document: "peerspace_cache",
          source_section: `Peerspace hourly space listings, ZIP ${geo?.zipCode} (cached scrape)`,
          source_type: "cached_scrape",
        })
      : null;

    const srcLandmark = landmark
      ? ops.addSourceReference({
          source_document: "chicago_landmarks_local",
          source_section: "Chicago Landmarks & Historic Resources Survey (local dataset)",
          source_type: "local_dataset",
        })
      : null;

    const srcZoningRef = zoningInfo
      ? ops.addSourceReference({
          source_document: "zoning_reference",
          source_section: `Chicago zoning code reference data for ${geo?.zoning} (local dataset)`,
          source_type: "local_dataset",
        })
      : null;

    const hasRunRecord = Boolean(
      (run as any).manualBuildingSqFt || (run as any).manualLandSqFt || (run as any).manualStories ||
      (run as any).askingPrice || listing
    );
    const srcRun = hasRunRecord
      ? ops.addSourceReference({
          source_document: "run_record",
          source_section: "Run record: user-entered property data and scraped listing details",
          source_type: "run_record",
          source_url: (run as any).sourceListingUrl ?? null,
        })
      : null;

    // --- zoning_use ---
    if (srcGeo) {
      if (geo.zoning) {
        ops.addSectionFact("zoning_use", {
          field: "zoning_code",
          value: geo.zoning,
          display_value: String(geo.zoning),
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcGeo],
        });
      }
      ops.addSectionFact("zoning_use", {
        field: "tif_district",
        value: geo.tifName ?? null,
        display_value: geo.tifName ? String(geo.tifName) : "Not in a TIF district",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcGeo],
      });
      ops.addSectionFact("zoning_use", {
        field: "opportunity_zone",
        value: Boolean(geo.opportunityZone),
        display_value: geo.opportunityZone ? "Yes — federal Opportunity Zone" : "No",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcGeo],
      });
      if (geo.communityArea) {
        ops.addSectionFact("zoning_use", {
          field: "community_area",
          value: geo.communityArea,
          display_value: String(geo.communityArea),
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcGeo],
        });
      }
    }

    let maxFarFactId: string | null = null;
    if (srcZoningRef && zoningInfo) {
      const maxFARParsed = zoningInfo.maxFAR ? parseFloat(String(zoningInfo.maxFAR)) : NaN;
      if (!isNaN(maxFARParsed)) {
        const f = ops.addSectionFact("zoning_use", {
          field: "zoning_max_far",
          value: maxFARParsed,
          display_value: `Max FAR ${maxFARParsed}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcZoningRef],
        });
        maxFarFactId = f.id;
      }
      if (zoningInfo.maxHeight) {
        ops.addSectionFact("zoning_use", {
          field: "zoning_max_height",
          value: zoningInfo.maxHeight,
          display_value: String(zoningInfo.maxHeight),
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcZoningRef],
        });
      }
    }

    // --- physical_constraints ---
    const buildingSf: number | null = (run as any).manualBuildingSqFt || null;
    const landSf: number | null = (run as any).manualLandSqFt || null;
    const stories: number | null = (run as any).manualStories ? Number((run as any).manualStories) : null;

    let buildingSfFactId: string | null = null;
    let landSfFactId: string | null = null;
    if (srcRun && buildingSf) {
      const f = ops.addSectionFact("physical_constraints", {
        field: "building_sf",
        value: buildingSf,
        display_value: `${buildingSf.toLocaleString()} sf building (user-entered)`,
        fact_type: "reported_context",
        verified: true,
        source_ref_ids: [srcRun],
      });
      buildingSfFactId = f.id;
    }
    if (srcRun && landSf) {
      const f = ops.addSectionFact("physical_constraints", {
        field: "lot_sf",
        value: landSf,
        display_value: `${landSf.toLocaleString()} sf lot (user-entered)`,
        fact_type: "reported_context",
        verified: true,
        source_ref_ids: [srcRun],
      });
      landSfFactId = f.id;
    }
    if (srcRun && stories) {
      ops.addSectionFact("physical_constraints", {
        field: "stories",
        value: stories,
        display_value: `${stories} stories (user-entered)`,
        fact_type: "reported_context",
        verified: true,
        source_ref_ids: [srcRun],
      });
    }

    if (srcLandmark && landmark) {
      ops.addSectionFact("physical_constraints", {
        field: "official_landmark",
        value: Boolean(landmark.isOfficialLandmark),
        display_value: landmark.isOfficialLandmark
          ? `Designated Chicago Landmark${landmark.officialLandmarkName ? `: ${landmark.officialLandmarkName}` : ""}`
          : "Not a designated Chicago Landmark",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcLandmark],
      });
      ops.addSectionFact("physical_constraints", {
        field: "landmark_district",
        value: Boolean(landmark.isLandmarkDistrict),
        display_value: landmark.isLandmarkDistrict
          ? `In a landmark district${landmark.districtName ? `: ${landmark.districtName}` : ""}`
          : "Not in a landmark district",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcLandmark],
      });
      if (landmark.landmarkName || landmark.colorTag) {
        ops.addSectionFact("physical_constraints", {
          field: "chrs_survey_entry",
          value: {
            name: landmark.landmarkName ?? null,
            classification: landmark.className ?? null,
            colorTag: landmark.colorTag ?? null,
          },
          display_value: `CHRS survey: ${[landmark.landmarkName, landmark.className, landmark.colorTag].filter(Boolean).join(" — ")}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcLandmark],
        });
      }
    }

    // Derived: FAR capacity (needs lot size + zoning max FAR)
    if (landSfFactId && maxFarFactId && landSf) {
      const maxFar = parseFloat(String(zoningInfo!.maxFAR));
      const maxBuildable = Math.floor(landSf * maxFar);
      ops.addDerivedMetric("zoning_use", {
        field: "max_buildable_sf",
        value: maxBuildable,
        display_value: `${maxBuildable.toLocaleString()} sf max buildable floor area`,
        derived_from_fact_ids: [landSfFactId, maxFarFactId],
        formula: "lot_sf × zoning_max_far",
        verified: true, // rule 2 downgrades if any input fact is unverified
      });
      if (buildingSfFactId && buildingSf) {
        ops.addDerivedMetric("zoning_use", {
          field: "current_far",
          value: Number((buildingSf / landSf).toFixed(2)),
          display_value: `Current FAR ${(buildingSf / landSf).toFixed(2)}`,
          derived_from_fact_ids: [buildingSfFactId, landSfFactId],
          formula: "building_sf / lot_sf",
          verified: true, // rule 2 downgrades if any input fact is unverified
        });
      }
    }

    // --- taxes_assessment ---
    let annualTaxFactId: string | null = null;
    let annualTax: number | null = null;
    if (srcTax && taxRow) {
      if (taxRow.totalAnnualTaxAmount != null) {
        annualTax = Number(taxRow.totalAnnualTaxAmount);
        const f = ops.addSectionFact("taxes_assessment", {
          field: "annual_tax_amount",
          value: annualTax,
          display_value: `${fmtUsd(annualTax)}${taxRow.taxYearMostRecent ? ` (tax year ${taxRow.taxYearMostRecent})` : ""}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcTax],
        });
        annualTaxFactId = f.id;
      }
      if (taxRow.paymentStatus) {
        ops.addSectionFact("taxes_assessment", {
          field: "tax_payment_status",
          value: taxRow.paymentStatus,
          display_value: `Payment status: ${taxRow.paymentStatus}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcTax],
          tags: taxRow.paymentStatus !== "current" ? ["distress_signal"] : [],
        });
      }
      const taxYears = Array.isArray(taxRow.taxYearsJson) ? (taxRow.taxYearsJson as any[]) : [];
      if (taxYears.length > 0) {
        const recent = taxYears.slice(0, 5);
        ops.addSectionFact("taxes_assessment", {
          field: "tax_history",
          value: recent,
          display_value: recent
            .map((y: any) => `${y.year}: ${fmtUsd(Number(y.billed || y.amountDue || 0))}`)
            .join(", "),
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcTax],
        });
      }
      if (annualTaxFactId && annualTax != null) {
        ops.addDerivedMetric("taxes_assessment", {
          field: "monthly_tax_amount",
          value: Math.round(annualTax / 12),
          display_value: `${fmtUsd(annualTax / 12)}/month`,
          derived_from_fact_ids: [annualTaxFactId],
          formula: "annual_tax_amount / 12",
          verified: true, // rule 2 downgrades if any input fact is unverified
        });
      }
    }

    // --- title_distress + sale_history (recorder of deeds) ---
    if (srcLien && lienRow) {
      if (lienRow.ownerName) {
        ops.addSectionFact("title_distress", {
          field: "owner_name",
          value: lienRow.ownerName,
          display_value: `Current owner: ${lienRow.ownerName}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcLien],
        });
      }

      const docs = dedupeLienDocs(Array.isArray(lienRow.documentsJson) ? (lienRow.documentsJson as any[]) : []);
      const parseDate = (s: any) => {
        const t = Date.parse(s || "");
        return isNaN(t) ? 0 : t;
      };
      const sorted = [...docs].sort((a, b) => parseDate(b.recordedDate) - parseDate(a.recordedDate));

      const critical = sorted.filter(
        (d: any) =>
          CRITICAL_LIEN_CATEGORIES.has(d.category) ||
          (d.documentType || "").toUpperCase().includes("LIS PENDENS")
      );
      const foreclosureCount = critical.filter(
        (d: any) =>
          d.category === "foreclosure" || (d.documentType || "").toUpperCase().includes("LIS PENDENS")
      ).length;
      const activeLiens = critical.filter((d: any) => !d.isReleased);

      ops.addSectionFact("title_distress", {
        field: "foreclosure_lis_pendens_count",
        value: foreclosureCount,
        display_value:
          foreclosureCount > 0
            ? `${foreclosureCount} foreclosure/lis pendens record(s) on file`
            : "No foreclosure or lis pendens records found in recorder data",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcLien],
        tags: foreclosureCount > 0 ? ["distress_signal"] : [],
      });
      ops.addSectionFact("title_distress", {
        field: "unreleased_lien_count",
        value: activeLiens.length,
        display_value:
          activeLiens.length > 0
            ? `${activeLiens.length} unreleased lien/judgment record(s): ${activeLiens
                .slice(0, 5)
                .map((d: any) => `${d.documentType}${d.amount ? ` (${fmtUsd(Number(d.amount))})` : ""}`)
                .join("; ")}${activeLiens.length > 5 ? "; …" : ""}`
            : "No unreleased liens or judgments found in recorder data",
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcLien],
        tags: activeLiens.length > 0 ? ["distress_signal"] : [],
      });

      const ownerLiens = Array.isArray(lienRow.ownerLiensJson) ? (lienRow.ownerLiensJson as any[]) : [];
      if (ownerLiens.length > 0) {
        ops.addSectionFact("title_distress", {
          field: "owner_personal_lien_count",
          value: ownerLiens.length,
          display_value: `${ownerLiens.length} personal lien record(s) against the owner`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcLien],
          tags: ["distress_signal"],
        });
      }

      // sale_history
      const deeds = sorted.filter((d: any) => d.category === "deed");
      if (deeds.length > 0) {
        const deed: any = deeds[0];
        const grantor = deed.grantor || lienRow.deedGrantor || null;
        const grantee = deed.grantee || lienRow.deedGrantee || null;
        ops.addSectionFact("sale_history", {
          field: "most_recent_deed",
          value: {
            documentType: deed.documentType ?? "DEED",
            recordedDate: deed.recordedDate ?? null,
            amount: deed.amount != null ? Number(deed.amount) : null,
            grantor,
            grantee,
          },
          display_value: `${deed.documentType || "DEED"} recorded ${deed.recordedDate || "date unknown"}${
            deed.amount ? ` — ${fmtUsd(Number(deed.amount))}` : ""
          }${grantor ? ` — grantor: ${grantor}` : ""}${grantee ? ` — grantee: ${grantee}` : ""}`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcLien],
        });
      }
      if (docs.length > 0) {
        ops.addSectionFact("sale_history", {
          field: "recorded_document_count",
          value: docs.length,
          display_value: `${docs.length} recorded document(s) in Cook County recorder data`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcLien],
        });
      }
    }

    // --- market_demand ---
    if (srcRentcast && rentcast?.overall) {
      const ov = rentcast.overall;
      if (ov.avgRent) {
        ops.addSectionFact("market_demand", {
          field: "zip_avg_rent",
          value: Number(ov.avgRent),
          display_value: `${fmtUsd(Number(ov.avgRent))}/month average rent (ZIP ${geo?.zipCode})`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcRentcast],
        });
      }
      if (ov.medianRent) {
        ops.addSectionFact("market_demand", {
          field: "zip_median_rent",
          value: Number(ov.medianRent),
          display_value: `${fmtUsd(Number(ov.medianRent))}/month median rent (ZIP ${geo?.zipCode}, ${ov.totalListings || "?"} listings sampled)`,
          fact_type: "confirmed_fact",
          verified: true,
          source_ref_ids: [srcRentcast],
        });
      }
    }
    if (srcLoopnet && crexi) {
      ops.addSectionFact("market_demand", {
        field: "commercial_lease_market",
        value: {
          listingCount: crexi.count,
          avgPricePerSqFtYear: crexi.avgPricePerSqFtYear,
          medianSqFt: crexi.medianSqFt,
        },
        display_value: `${crexi.count} commercial for-lease listing(s) in ZIP ${geo?.zipCode}${
          crexi.avgPricePerSqFtYear ? `, avg $${crexi.avgPricePerSqFtYear}/SF/yr` : ""
        }`,
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcLoopnet],
      });
    }
    if (srcPeerspace && peerspace) {
      ops.addSectionFact("market_demand", {
        field: "hourly_space_market",
        value: {
          venueCount: peerspace.count,
          avgPricePerHour: peerspace.avgPricePerHour,
        },
        display_value: `${peerspace.count} hourly venue(s) on Peerspace in ZIP ${geo?.zipCode}${
          peerspace.avgPricePerHour ? `, avg $${peerspace.avgPricePerHour}/hr` : ""
        }`,
        fact_type: "confirmed_fact",
        verified: true,
        source_ref_ids: [srcPeerspace],
      });
    }
    if (srcRun && (run as any).askingPrice) {
      ops.addSectionFact("market_demand", {
        field: "asking_price",
        value: Number((run as any).askingPrice),
        display_value: `${fmtUsd(Number((run as any).askingPrice))} asking price`,
        fact_type: "reported_context",
        verified: true,
        source_ref_ids: [srcRun],
      });
    }
    if (srcRun && listing) {
      if (listing.unitCount) {
        ops.addSectionFact("market_demand", {
          field: "listing_unit_count",
          value: Number(listing.unitCount),
          display_value: `${listing.unitCount} unit(s) per listing`,
          fact_type: "reported_context",
          verified: true,
          source_ref_ids: [srcRun],
        });
      }
      if (listing.totalMonthlyRent) {
        ops.addSectionFact("market_demand", {
          field: "listing_total_monthly_rent",
          value: Number(listing.totalMonthlyRent),
          display_value: `${fmtUsd(Number(listing.totalMonthlyRent))}/month total rent per listing`,
          fact_type: "reported_context",
          verified: true,
          source_ref_ids: [srcRun],
        });
      }
    }

    // --- Absence notes (per-source, on the section that would have held the data) ---
    if (!geo) absences.push({ section: "zoning_use", note: "geocode not cached — zoning/TIF/opportunity-zone facts unavailable" });
    if (!pin) absences.push({ section: "taxes_assessment", note: "no cached PIN for this address — tax and recorder facts unavailable" });
    if (pin && !taxRow) absences.push({ section: "taxes_assessment", note: "no cached property tax record for this PIN" });
    if (pin && !lienRow) absences.push({ section: "title_distress", note: "no cached recorder of deeds data for this PIN" });
    if (geo?.zipCode && !rentcast) absences.push({ section: "market_demand", note: `no cached rental market data for ZIP ${geo.zipCode}` });

    const sectionForFailure = (label: string): string => {
      if (label.startsWith("property_tax")) return "taxes_assessment";
      if (label.startsWith("lien")) return "title_distress";
      if (label.startsWith("rentcast") || label.startsWith("loopnet") || label.startsWith("peerspace")) return "market_demand";
      if (label.startsWith("landmark")) return "physical_constraints";
      return "zoning_use";
    };
    for (const f of failures) {
      ctx.sections[sectionForFailure(f) as keyof typeof ctx.sections].notes.push(
        `[extraction ${stamp}] source read FAILED: ${f} — data unread, not absent from the public record`
      );
    }
    for (const a of absences) {
      ctx.sections[a.section as keyof typeof ctx.sections].notes.push(
        `[extraction ${stamp}] ${a.note} — data unread, not absent from the public record`
      );
    }

    // --- Snapshot + UI context (same batch) ---
    ctx.property_snapshot = {
      ...ctx.property_snapshot,
      address: run.address,
      city: "Chicago",
      state: "IL",
      zip: geo?.zipCode ?? ctx.property_snapshot.zip,
      neighborhood: geo?.communityArea ?? ctx.property_snapshot.neighborhood,
      building_sf: buildingSf ?? ctx.property_snapshot.building_sf,
      lot_sf: landSf ?? ctx.property_snapshot.lot_sf,
    };
    ctx.ui_context = {
      ...ctx.ui_context,
      project_type: (run as any).lastProjectType ?? ctx.ui_context.project_type,
      user_goal: (run as any).lastFreeformDescription ?? ctx.ui_context.user_goal,
    };

    // --- Status ---
    // source_coverage_status is intentionally NOT set here: saveContext()
    // always recomputes it (verified-facts-ratio semantic) via
    // recomputeSourceCoverage — a second, availability-based write here would
    // be dead code that silently loses.
    ctx.extraction_status = failures.length === 0 && absences.length === 0 ? "complete" : "partial";
    ctx.status.report_parsed = true;
    ctx.last_extracted_at = now;

    let factCount = 0;
    let derivedCount = 0;
    for (const name of PROPERTY_CONTEXT_SECTIONS) {
      factCount += ctx.sections[name].facts.length;
      derivedCount += ctx.sections[name].derived.length;
    }
    return { factCount, derivedCount, sourceCount: ctx.source_index.length };
  });

  return {
    status: failures.length === 0 && absences.length === 0 ? "complete" : "partial",
    factCount: counts.factCount,
    derivedCount: counts.derivedCount,
    sourceCount: counts.sourceCount,
    failures,
  };
}
