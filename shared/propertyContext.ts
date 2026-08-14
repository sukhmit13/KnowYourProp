/**
 * PROPERTY MEMORY CONTEXT — canonical evidence layer
 * ===================================================
 *
 * One `property_context` object exists per report run. It is the single
 * source of truth that later AI prompts consume when generating the
 * one-page PROPERTY INSIGHT REPORT. Prompts must read structured facts
 * from this object — never chat history or freeform memory.
 *
 * Core principle: every material fact traces back to a source reference
 * (report section + page). Every derived metric references the facts it
 * was computed from. Anything without source linkage is unverified.
 *
 * HOW LATER PROMPTS SHOULD CONSUME THIS OBJECT
 * --------------------------------------------
 * 1. Load the context via `getPropertyContext(runId)` (server/propertyContext.ts).
 * 2. Filter to `verified === true` facts/derived metrics for claims that will
 *    appear in user-facing output. Unverified items may be listed only as
 *    open diligence items.
 * 3. When citing a fact, resolve its `source_ref_ids` against `source_index`
 *    to render "per {source_section}, p.{source_page_start}" style citations.
 * 4. Section `mini_summary`, `confidence`, and `eligible_for_onepager` are
 *    placeholders — future summarization prompts write them, the one-pager
 *    prompt reads them to rank `onepager_context.top_cards`.
 *
 * IDENTITY MODEL
 * --------------
 * - `report_id`  = the run ID (one context per run).
 * - `property_id` = Cook County PIN when available, otherwise a normalized
 *   address fallback (uppercase, collapsed whitespace).
 * - `canonical_property_key` = optional stable key for grouping multiple
 *   runs of the same property later, without changing this structure.
 */

import { z } from "zod";

// === CONSTANTS ===

export const PROPERTY_CONTEXT_VERSION = 1;

export const PROPERTY_CONTEXT_SECTIONS = [
  "title_distress",
  "zoning_use",
  "taxes_assessment",
  "physical_constraints",
  "sale_history",
  "market_demand",
  "property_linked_professionals",
] as const;

export type PropertyContextSectionName = (typeof PROPERTY_CONTEXT_SECTIONS)[number];

export const FACT_TYPES = ["confirmed_fact", "open_diligence_item", "reported_context"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const EXTRACTION_STATUSES = ["not_started", "in_progress", "partial", "complete"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const SOURCE_COVERAGE_STATUSES = ["none", "partial", "full"] as const;
export type SourceCoverageStatus = (typeof SOURCE_COVERAGE_STATUSES)[number];

export const PROFESSIONAL_ROLE_TYPES = ["zoning_attorney", "tax_attorney", "architect", "other"] as const;
export type ProfessionalRoleType = (typeof PROFESSIONAL_ROLE_TYPES)[number];

// === SOURCE INDEX (Phase 4) ===

export const sourceReferenceSchema = z.object({
  id: z.string().min(1),
  source_document: z.string().min(1),
  source_section: z.string().min(1),
  source_page_start: z.number().int().nullable().default(null),
  source_page_end: z.number().int().nullable().default(null),
  source_anchor: z.string().nullable().default(null),
  source_snippet: z.string().nullable().default(null),
  source_url: z.string().nullable().default(null),
  source_type: z.string().nullable().default(null),
});
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

// === FACT OBJECTS (Phase 2) ===

export const propertyFactSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1), // stable machine-readable key, e.g. "annual_tax_2024"
  value: z.any(),
  display_value: z.string().nullable().default(null), // user-facing exact formatting
  fact_type: z.enum(FACT_TYPES),
  verified: z.boolean().default(false), // true only with >=1 valid source reference
  source_ref_ids: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type PropertyFact = z.infer<typeof propertyFactSchema>;

// === DERIVED METRIC OBJECTS (Phase 3) ===

export const derivedMetricSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  value: z.any(),
  display_value: z.string().nullable().default(null),
  fact_type: z.literal("derived_metric"),
  derived_from_fact_ids: z.array(z.string()).default([]), // exact input fact records
  formula: z.string().nullable().default(null), // readable, e.g. "annual_tax_2024 / 12"
  verified: z.boolean().default(false), // true only if ALL input facts are verified
  source_ref_ids: z.array(z.string()).default([]), // union of input facts' source refs
  tags: z.array(z.string()).default([]),
});
export type DerivedMetric = z.infer<typeof derivedMetricSchema>;

// === PROPERTY-LINKED PROFESSIONALS (Phase 6) ===
// Factual public-record references only. NOT a recommendation engine —
// never label anyone recommended/top/preferred/best.

export const linkedProfessionalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role_type: z.enum(PROFESSIONAL_ROLE_TYPES),
  linked_record_type: z.string().min(1), // e.g. "zoning_application", "tax_appeal"
  display_context: z.string().nullable().default(null), // neutral factual phrasing
  verified: z.boolean().default(false),
  source_ref_ids: z.array(z.string()).default([]),
  activity_context: z
    .object({
      citywide_record_count: z.number().nullable().default(null),
      recent_activity_window: z.string().nullable().default(null),
    })
    .default({ citywide_record_count: null, recent_activity_window: null }),
});
export type LinkedProfessional = z.infer<typeof linkedProfessionalSchema>;

// === WRITE-INPUT TYPES ===
// zod .default() fields are optional on input; ids are assigned when omitted.

export type SourceReferenceInput = Omit<z.input<typeof sourceReferenceSchema>, "id"> & { id?: string };
export type PropertyFactInput = Omit<z.input<typeof propertyFactSchema>, "id"> & { id?: string };
export type DerivedMetricInput = Omit<z.input<typeof derivedMetricSchema>, "id" | "fact_type"> & {
  id?: string;
  fact_type?: "derived_metric";
};
export type LinkedProfessionalInput = Omit<z.input<typeof linkedProfessionalSchema>, "id"> & { id?: string };

// === SECTION CONTAINERS (Phases 1 & 5) ===

export const contextSectionSchema = z
  .object({
    facts: z.array(propertyFactSchema).default([]),
    derived: z.array(derivedMetricSchema).default([]),
    mini_summary: z.string().nullable().default(null), // placeholder for later
    confidence: z.string().nullable().default(null), // placeholder for later
    eligible_for_onepager: z.boolean().nullable().default(null), // placeholder for later
    notes: z.array(z.string()).default([]),
    // property_linked_professionals additionally carries `professionals`
    professionals: z.array(linkedProfessionalSchema).optional(),
  })
  .passthrough(); // extensible: future prompts may add takeaways, corridor trends, etc.
export type ContextSection = z.infer<typeof contextSectionSchema>;

// === TOP-LEVEL CONTEXT (Phase 1) ===

export const propertyContextStatusSchema = z.object({
  report_parsed: z.boolean().default(false),
  sources_indexed: z.boolean().default(false),
  derived_metrics_computed: z.boolean().default(false),
  section_summaries_generated: z.boolean().default(false),
  onepager_ready: z.boolean().default(false),
});
export type PropertyContextStatus = z.infer<typeof propertyContextStatusSchema>;

export const propertySnapshotSchema = z.object({
  address: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  zip: z.string().nullable().default(null),
  neighborhood: z.string().nullable().default(null),
  ward: z.string().nullable().default(null),
  parcel_count: z.number().nullable().default(null),
  building_sf: z.number().nullable().default(null),
  lot_sf: z.number().nullable().default(null),
  year_built: z.number().nullable().default(null),
});
export type PropertySnapshot = z.infer<typeof propertySnapshotSchema>;

export const uiContextSchema = z.object({
  project_type: z.string().nullable().default(null),
  project_subtype: z.string().nullable().default(null),
  user_goal: z.string().nullable().default(null),
  requested_focus_areas: z.array(z.string()).default([]),
  show_zoning_attorneys: z.boolean().default(false),
  show_tax_attorneys: z.boolean().default(false),
});
export type UiContext = z.infer<typeof uiContextSchema>;

export const onepagerContextSchema = z.object({
  top_cards: z.array(z.any()).default([]), // future: ranked cards for the one-pager
  our_take_verdict: z.string().nullable().default(null),
  our_take_body: z.string().nullable().default(null),
});
export type OnepagerContext = z.infer<typeof onepagerContextSchema>;

export const propertyContextSchema = z
  .object({
    property_id: z.string().min(1),
    report_id: z.string().min(1), // run ID as string
    canonical_property_key: z.string().nullable().default(null),
    run_version: z.number().int().default(1),
    context_version: z.number().int().default(PROPERTY_CONTEXT_VERSION),
    extraction_status: z.enum(EXTRACTION_STATUSES).default("not_started"),
    source_coverage_status: z.enum(SOURCE_COVERAGE_STATUSES).default("none"),
    last_extracted_at: z.string().nullable().default(null),
    created_at: z.string(),
    updated_at: z.string(),
    status: propertyContextStatusSchema,
    property_snapshot: propertySnapshotSchema,
    ui_context: uiContextSchema,
    sections: z.object({
      title_distress: contextSectionSchema,
      zoning_use: contextSectionSchema,
      taxes_assessment: contextSectionSchema,
      physical_constraints: contextSectionSchema,
      sale_history: contextSectionSchema,
      market_demand: contextSectionSchema,
      property_linked_professionals: contextSectionSchema,
    }),
    onepager_context: onepagerContextSchema,
    source_index: z.array(sourceReferenceSchema).default([]),
  })
  .passthrough();
export type PropertyContext = z.infer<typeof propertyContextSchema>;

// === FACTORY ===

function emptySection(withProfessionals = false): ContextSection {
  const section: ContextSection = {
    facts: [],
    derived: [],
    mini_summary: null,
    confidence: null,
    eligible_for_onepager: null,
    notes: [],
  };
  if (withProfessionals) section.professionals = [];
  return section;
}

export function createEmptyPropertyContext(params: {
  reportId: string;
  propertyId: string;
  canonicalPropertyKey?: string | null;
}): PropertyContext {
  const now = new Date().toISOString();
  return {
    property_id: params.propertyId,
    report_id: params.reportId,
    canonical_property_key: params.canonicalPropertyKey ?? null,
    run_version: 1,
    context_version: PROPERTY_CONTEXT_VERSION,
    extraction_status: "not_started",
    source_coverage_status: "none",
    last_extracted_at: null,
    created_at: now,
    updated_at: now,
    status: {
      report_parsed: false,
      sources_indexed: false,
      derived_metrics_computed: false,
      section_summaries_generated: false,
      onepager_ready: false,
    },
    property_snapshot: {
      address: null,
      city: null,
      state: null,
      zip: null,
      neighborhood: null,
      ward: null,
      parcel_count: null,
      building_sf: null,
      lot_sf: null,
      year_built: null,
    },
    ui_context: {
      project_type: null,
      project_subtype: null,
      user_goal: null,
      requested_focus_areas: [],
      show_zoning_attorneys: false,
      show_tax_attorneys: false,
    },
    sections: {
      title_distress: emptySection(),
      zoning_use: emptySection(),
      taxes_assessment: emptySection(),
      physical_constraints: emptySection(),
      sale_history: emptySection(),
      market_demand: emptySection(),
      property_linked_professionals: emptySection(true),
    },
    onepager_context: {
      top_cards: [],
      our_take_verdict: null,
      our_take_body: null,
    },
    source_index: [],
  };
}

// === VALIDATION RESULT SHAPE ===

export interface PropertyContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
