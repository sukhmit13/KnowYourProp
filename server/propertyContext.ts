/**
 * PROPERTY MEMORY CONTEXT — storage + utility layer
 * ==================================================
 *
 * Durable storage for the canonical property_context object (see
 * shared/propertyContext.ts for the schema and consumption docs).
 *
 * WHERE IT IS STORED
 * ------------------
 * PostgreSQL table `property_contexts` — one row per run, with the full
 * context object in a JSONB column. Never kept only in memory.
 *
 * HOW FACTS AND SOURCE LINKS ARE ADDED
 * ------------------------------------
 * 1. `addSourceReference(runId, ref)` — register where evidence came from
 *    (report section, pages, snippet). Returns the source ref id.
 * 2. `addSectionFact(runId, section, fact)` — add a fact pointing at one or
 *    more source ref ids. Facts without valid source refs are automatically
 *    stored as unverified (rule 1).
 * 3. `addDerivedMetric(runId, section, metric)` — add a computed value that
 *    references its input fact ids. It is verified only if ALL inputs are
 *    verified (rule 2), and it inherits the union of input source refs.
 * 4. `validatePropertyContext(runId)` — integrity check across all rules.
 *
 * All write helpers load the row, mutate the JSON, revalidate invariants,
 * bump `updated_at`, and persist — so the stored object is always coherent.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { propertyContexts, pinLookupCache, type PropertyContextRow } from "@shared/schema";
import {
  PROPERTY_CONTEXT_SECTIONS,
  createEmptyPropertyContext,
  sourceReferenceSchema,
  propertyFactSchema,
  derivedMetricSchema,
  linkedProfessionalSchema,
  contextSectionSchema,
  propertyContextSchema,
  type PropertyContext,
  type PropertyContextSectionName,
  type SourceReference,
  type PropertyFact,
  type DerivedMetric,
  type LinkedProfessional,
  type SourceReferenceInput,
  type PropertyFactInput,
  type DerivedMetricInput,
  type LinkedProfessionalInput,
  type PropertySnapshot,
  type PropertyContextValidationResult,
} from "@shared/propertyContext";

// === ID + ADDRESS HELPERS ===

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** Normalized address fallback used for property_id when no PIN is available. */
export function normalizeAddressForPropertyId(address: string): string {
  return address.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Best-effort property_id resolution at run-creation time:
 * use the cached Cook County PIN if one exists for this address,
 * otherwise fall back to the normalized address.
 * (The PIN cache key is uppercase alphanumeric — same scheme as pinResolver.)
 */
export async function resolvePropertyIdForAddress(address: string): Promise<{ propertyId: string; pin: string | null }> {
  try {
    const cacheKey = address.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const [cached] = await db
      .select({ pin: pinLookupCache.pin })
      .from(pinLookupCache)
      .where(eq(pinLookupCache.addressHash, cacheKey))
      .limit(1);
    if (cached?.pin) return { propertyId: cached.pin, pin: cached.pin };
  } catch (err) {
    console.error("[PROPERTY CONTEXT] PIN cache lookup failed:", err);
  }
  return { propertyId: normalizeAddressForPropertyId(address), pin: null };
}

// === PER-RUN WRITE SERIALIZATION ===
// All context writes for a given run are chained onto a single in-process
// promise so concurrent load-mutate-save cycles cannot clobber each other's
// JSONB. (Single server process — no cross-process locking needed.)

const runLocks = new Map<number, Promise<unknown>>();

async function withRunLock<T>(runId: number, fn: () => Promise<T>): Promise<T> {
  const previous = runLocks.get(runId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  runLocks.set(runId, next);
  next.finally(() => {
    if (runLocks.get(runId) === next) runLocks.delete(runId);
  }).catch(() => {});
  return next;
}

// === INTERNAL LOAD/SAVE ===

async function loadRow(runId: number): Promise<PropertyContextRow | undefined> {
  const [row] = await db.select().from(propertyContexts).where(eq(propertyContexts.runId, runId)).limit(1);
  return row;
}

async function saveContext(runId: number, ctx: PropertyContext): Promise<PropertyContextRow> {
  ctx.updated_at = new Date().toISOString();
  recomputeSourceCoverage(ctx);
  const [updated] = await db
    .update(propertyContexts)
    .set({
      context: ctx,
      propertyId: ctx.property_id,
      canonicalPropertyKey: ctx.canonical_property_key,
      updatedAt: new Date(),
    })
    .where(eq(propertyContexts.runId, runId))
    .returning();
  return updated;
}

function requireContext(row: PropertyContextRow | undefined, runId: number): PropertyContext {
  if (!row) throw new Error(`No property_context exists for run ${runId}`);
  return row.context as PropertyContext;
}

function requireSection(ctx: PropertyContext, sectionName: string) {
  if (!PROPERTY_CONTEXT_SECTIONS.includes(sectionName as PropertyContextSectionName)) {
    throw new Error(
      `Unknown section "${sectionName}". Valid sections: ${PROPERTY_CONTEXT_SECTIONS.join(", ")}`
    );
  }
  return ctx.sections[sectionName as PropertyContextSectionName];
}

function allSourceRefIds(ctx: PropertyContext): Set<string> {
  return new Set(ctx.source_index.map((s) => s.id));
}

function findFactById(ctx: PropertyContext, factId: string): { fact: PropertyFact; section: PropertyContextSectionName } | null {
  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    const fact = ctx.sections[name].facts.find((f) => f.id === factId);
    if (fact) return { fact, section: name };
  }
  return null;
}

/** Recompute source_coverage_status from current facts (none/partial/full). */
function recomputeSourceCoverage(ctx: PropertyContext): void {
  let total = 0;
  let verified = 0;
  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    const section = ctx.sections[name];
    for (const f of section.facts) {
      total++;
      if (f.verified) verified++;
    }
    for (const d of section.derived) {
      total++;
      if (d.verified) verified++;
    }
  }
  ctx.source_coverage_status = total === 0 || verified === 0 ? "none" : verified === total ? "full" : "partial";
}

// === CORE UTILITIES (Phase 7) ===

/**
 * Create an empty context for a run. Idempotent — returns the existing row
 * if one already exists for this run.
 */
export async function createPropertyContext(
  runId: number,
  propertyId: string,
  opts?: { canonicalPropertyKey?: string | null }
): Promise<PropertyContextRow> {
  const existing = await loadRow(runId);
  if (existing) return existing;

  const ctx = createEmptyPropertyContext({
    reportId: String(runId),
    propertyId,
    canonicalPropertyKey: opts?.canonicalPropertyKey ?? null,
  });

  const [row] = await db
    .insert(propertyContexts)
    .values({
      runId,
      propertyId,
      canonicalPropertyKey: opts?.canonicalPropertyKey ?? null,
      context: ctx,
    })
    .onConflictDoNothing({ target: propertyContexts.runId })
    .returning();

  // onConflictDoNothing returns nothing when a concurrent insert won — reload
  return row ?? ((await loadRow(runId)) as PropertyContextRow);
}

export async function getPropertyContext(runId: number): Promise<PropertyContext | null> {
  const row = await loadRow(runId);
  return row ? (row.context as PropertyContext) : null;
}

/**
 * Update property_id / canonical_property_key after the fact — e.g. once the
 * PIN resolves during report generation. Keeps row columns and JSON in sync.
 */
export async function updatePropertyIdentity(
  runId: number,
  ids: { propertyId?: string; canonicalPropertyKey?: string | null }
): Promise<PropertyContext> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    if (ids.propertyId) ctx.property_id = ids.propertyId;
    if (ids.canonicalPropertyKey !== undefined) ctx.canonical_property_key = ids.canonicalPropertyKey;
    await saveContext(runId, ctx);
    return ctx;
  });
}

export async function updatePropertySnapshot(
  runId: number,
  snapshotData: Partial<PropertySnapshot>
): Promise<PropertyContext> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    ctx.property_snapshot = { ...ctx.property_snapshot, ...snapshotData };
    await saveContext(runId, ctx);
    return ctx;
  });
}

// === PURE MUTATORS ===
// All invariant rules live here, operating on an in-memory context object.
// The exported per-call helpers below and the batch API both delegate to
// these, so single writes and batched extraction share identical rules.

/** Pure: register a source reference. Assigns an id if missing. Returns the ref id. */
function applyAddSourceReference(
  ctx: PropertyContext,
  sourceRef: SourceReferenceInput
): string {
  const ref = sourceReferenceSchema.parse({ ...sourceRef, id: sourceRef.id ?? newId("src") });
  if (ctx.source_index.some((s) => s.id === ref.id)) {
    throw new Error(`Source reference id "${ref.id}" already exists`);
  }
  ctx.source_index.push(ref);
  ctx.status.sources_indexed = true;
  return ref.id;
}

/**
 * Pure: add a fact to a section. Rule 1: a fact is stored verified only if
 * every source_ref_id resolves to an existing source_index entry and there
 * is at least one. Otherwise it is downgraded to unverified.
 */
function applyAddSectionFact(
  ctx: PropertyContext,
  sectionName: string,
  factObject: PropertyFactInput
): PropertyFact {
  const section = requireSection(ctx, sectionName);
  const fact = propertyFactSchema.parse({ ...factObject, id: factObject.id ?? newId("fact") });

  const known = allSourceRefIds(ctx);
  const broken = fact.source_ref_ids.filter((id) => !known.has(id));
  if (broken.length > 0) {
    throw new Error(`Fact "${fact.field}" references unknown source_ref_ids: ${broken.join(", ")}`);
  }
  if (fact.verified && fact.source_ref_ids.length === 0) {
    fact.verified = false; // rule 1: no source linkage => unverified
  }
  if (section.facts.some((f) => f.id === fact.id)) {
    throw new Error(`Fact id "${fact.id}" already exists in section "${sectionName}"`);
  }

  section.facts.push(fact);
  return fact;
}

/**
 * Pure: add a derived metric. Rule 2: verified only if all referenced input
 * facts exist and are verified. Inherits the union of input facts' source refs.
 */
function applyAddDerivedMetric(
  ctx: PropertyContext,
  sectionName: string,
  derivedObject: DerivedMetricInput
): DerivedMetric {
  const section = requireSection(ctx, sectionName);
  const metric = derivedMetricSchema.parse({
    ...derivedObject,
    id: derivedObject.id ?? newId("drv"),
    fact_type: "derived_metric",
  });

  if (metric.derived_from_fact_ids.length === 0) {
    metric.verified = false; // no inputs => cannot be verified
  }

  const inputRefs = new Set<string>(metric.source_ref_ids);
  let allInputsVerified = metric.derived_from_fact_ids.length > 0;
  for (const factId of metric.derived_from_fact_ids) {
    const found = findFactById(ctx, factId);
    if (!found) {
      throw new Error(`Derived metric "${metric.field}" references unknown fact id "${factId}"`);
    }
    if (!found.fact.verified) allInputsVerified = false;
    for (const refId of found.fact.source_ref_ids) inputRefs.add(refId);
  }

  metric.source_ref_ids = Array.from(inputRefs);
  const known = allSourceRefIds(ctx);
  const broken = metric.source_ref_ids.filter((id) => !known.has(id));
  if (broken.length > 0) {
    throw new Error(`Derived metric "${metric.field}" references unknown source_ref_ids: ${broken.join(", ")}`);
  }
  if (!allInputsVerified) metric.verified = false; // rule 2

  if (section.derived.some((d) => d.id === metric.id)) {
    throw new Error(`Derived metric id "${metric.id}" already exists in section "${sectionName}"`);
  }

  section.derived.push(metric);
  ctx.status.derived_metrics_computed = true;
  return metric;
}

/**
 * Pure: add a property-linked professional (Phase 6). Factual public-record
 * references only — verified requires source linkage, same as facts.
 */
function applyAddLinkedProfessional(
  ctx: PropertyContext,
  entry: LinkedProfessionalInput
): LinkedProfessional {
  const section = ctx.sections.property_linked_professionals;
  const professional = linkedProfessionalSchema.parse({ ...entry, id: entry.id ?? newId("pro") });

  const known = allSourceRefIds(ctx);
  const broken = professional.source_ref_ids.filter((id) => !known.has(id));
  if (broken.length > 0) {
    throw new Error(`Professional "${professional.name}" references unknown source_ref_ids: ${broken.join(", ")}`);
  }
  if (professional.verified && professional.source_ref_ids.length === 0) {
    professional.verified = false;
  }

  section.professionals = section.professionals ?? [];
  if (section.professionals.some((p) => p.id === professional.id)) {
    throw new Error(`Professional id "${professional.id}" already exists`);
  }
  section.professionals.push(professional);
  return professional;
}

// === PER-CALL WRAPPERS (load → apply → save, serialized per run) ===

/** Register a source reference. Assigns an id if missing. Returns the ref id. */
export async function addSourceReference(
  runId: number,
  sourceRef: SourceReferenceInput
): Promise<string> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const refId = applyAddSourceReference(ctx, sourceRef);
    await saveContext(runId, ctx);
    return refId;
  });
}

/** Add a fact to a section (rule 1 enforced — see applyAddSectionFact). */
export async function addSectionFact(
  runId: number,
  sectionName: string,
  factObject: PropertyFactInput
): Promise<PropertyFact> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const fact = applyAddSectionFact(ctx, sectionName, factObject);
    await saveContext(runId, ctx);
    return fact;
  });
}

/** Add a derived metric (rule 2 enforced — see applyAddDerivedMetric). */
export async function addDerivedMetric(
  runId: number,
  sectionName: string,
  derivedObject: DerivedMetricInput
): Promise<DerivedMetric> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const metric = applyAddDerivedMetric(ctx, sectionName, derivedObject);
    await saveContext(runId, ctx);
    return metric;
  });
}

/** Add a property-linked professional (verified requires source linkage). */
export async function addLinkedProfessional(
  runId: number,
  entry: LinkedProfessionalInput
): Promise<LinkedProfessional> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const professional = applyAddLinkedProfessional(ctx, entry);
    await saveContext(runId, ctx);
    return professional;
  });
}

// === BATCH API (one load, one save — used by the extraction phase) ===

export interface ContextBatchOps {
  addSourceReference(ref: SourceReferenceInput): string;
  addSectionFact(sectionName: string, fact: PropertyFactInput): PropertyFact;
  addDerivedMetric(
    sectionName: string,
    metric: DerivedMetricInput
  ): DerivedMetric;
  addLinkedProfessional(entry: LinkedProfessionalInput): LinkedProfessional;
}

/**
 * Apply many mutations against a run's context in a single load-mutate-save
 * cycle, serialized with all other writes for that run. The builder receives
 * the live context object (for reads and direct field updates like
 * extraction_status) plus ops bound to the same invariant rules as the
 * per-call helpers. If the builder throws, nothing is saved.
 */
export async function applyContextBatch<T>(
  runId: number,
  builder: (ctx: PropertyContext, ops: ContextBatchOps) => T | Promise<T>
): Promise<T> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const ops: ContextBatchOps = {
      addSourceReference: (ref) => applyAddSourceReference(ctx, ref),
      addSectionFact: (sectionName, fact) => applyAddSectionFact(ctx, sectionName, fact),
      addDerivedMetric: (sectionName, metric) => applyAddDerivedMetric(ctx, sectionName, metric),
      addLinkedProfessional: (entry) => applyAddLinkedProfessional(ctx, entry),
    };
    const result = await builder(ctx, ops);
    await saveContext(runId, ctx);
    return result;
  });
}

/** Mark a fact verified — allowed only if it has >=1 valid source reference. */
export async function markFactVerified(runId: number, factId: string): Promise<PropertyFact> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const found = findFactById(ctx, factId);
    if (!found) throw new Error(`Fact "${factId}" not found in any section`);

    const known = allSourceRefIds(ctx);
    const validRefs = found.fact.source_ref_ids.filter((id) => known.has(id));
    if (validRefs.length === 0) {
      throw new Error(`Fact "${factId}" cannot be verified: it has no valid source references (rule 1)`);
    }

    found.fact.verified = true;
    // Re-evaluate derived metrics that depend on this fact
    refreshDerivedVerification(ctx);
    await saveContext(runId, ctx);
    return found.fact;
  });
}

/** Mark a fact unverified. Cascades: dependent derived metrics become unverified. */
export async function markFactUnverified(runId: number, factId: string): Promise<PropertyFact> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const found = findFactById(ctx, factId);
    if (!found) throw new Error(`Fact "${factId}" not found in any section`);

    found.fact.verified = false;
    refreshDerivedVerification(ctx);
    await saveContext(runId, ctx);
    return found.fact;
  });
}

/** Recompute verified flags on all derived metrics from their input facts. */
function refreshDerivedVerification(ctx: PropertyContext): void {
  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    for (const metric of ctx.sections[name].derived) {
      if (metric.derived_from_fact_ids.length === 0) {
        metric.verified = false;
        continue;
      }
      metric.verified = metric.derived_from_fact_ids.every((factId) => {
        const found = findFactById(ctx, factId);
        return !!found && found.fact.verified;
      });
    }
  }
}

/** Placeholder writer for later summarization prompts. */
export async function setSectionMiniSummary(
  runId: number,
  sectionName: string,
  summaryText: string | null
): Promise<PropertyContext> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const section = requireSection(ctx, sectionName);
    section.mini_summary = summaryText;
    ctx.status.section_summaries_generated = PROPERTY_CONTEXT_SECTIONS.some(
      (name) => ctx.sections[name].mini_summary !== null
    );
    await saveContext(runId, ctx);
    return ctx;
  });
}

/** Placeholder writer for later one-pager ranking. */
export async function setSectionEligibility(
  runId: number,
  sectionName: string,
  eligibleBoolean: boolean | null
): Promise<PropertyContext> {
  return withRunLock(runId, async () => {
    const ctx = requireContext(await loadRow(runId), runId);
    const section = requireSection(ctx, sectionName);
    section.eligible_for_onepager = eligibleBoolean;
    await saveContext(runId, ctx);
    return ctx;
  });
}

// === VALIDATION (Phases 7 & 8) ===

export async function validatePropertyContext(runId: number): Promise<PropertyContextValidationResult> {
  const row = await loadRow(runId);
  if (!row) {
    return { valid: false, errors: [`No property_context exists for run ${runId}`], warnings: [] };
  }
  return validateContextObject(row.context as PropertyContext);
}

/** Pure validation of a context object (also used by the inspection endpoint). */
export function validateContextObject(ctx: PropertyContext): PropertyContextValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Top-level shape
  const parsed = propertyContextSchema.safeParse(ctx);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 10)) {
      errors.push(`Schema: ${issue.path.join(".")} — ${issue.message}`);
    }
  }

  // Required sections exist and are well-formed
  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    const section = (ctx.sections as Record<string, unknown>)?.[name];
    if (!section) {
      errors.push(`Missing required section "${name}"`);
      continue;
    }
    const sectionParsed = contextSectionSchema.safeParse(section);
    if (!sectionParsed.success) {
      errors.push(`Section "${name}" is malformed: ${sectionParsed.error.issues[0]?.message}`);
    }
  }

  // Source index entries well-formed + unique ids
  const seenRefIds = new Set<string>();
  for (const ref of ctx.source_index ?? []) {
    const refParsed = sourceReferenceSchema.safeParse(ref);
    if (!refParsed.success) {
      errors.push(`Source reference "${(ref as { id?: string })?.id ?? "?"}" is malformed`);
    }
    if (ref?.id) {
      if (seenRefIds.has(ref.id)) errors.push(`Duplicate source reference id "${ref.id}"`);
      seenRefIds.add(ref.id);
    }
  }

  const factIndex = new Map<string, PropertyFact>();
  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    const section = ctx.sections?.[name];
    if (!section) continue;

    for (const fact of section.facts ?? []) {
      factIndex.set(fact.id, fact);
      const broken = (fact.source_ref_ids ?? []).filter((id) => !seenRefIds.has(id));
      if (broken.length > 0) {
        errors.push(`Fact "${fact.field}" (${name}) has broken source_ref_ids: ${broken.join(", ")}`);
      }
      // Rule 1: verified requires >=1 valid source ref
      if (fact.verified && (fact.source_ref_ids ?? []).filter((id) => seenRefIds.has(id)).length === 0) {
        errors.push(`Fact "${fact.field}" (${name}) is verified but has no valid source references (rule 1)`);
      }
      if (!fact.verified && (fact.source_ref_ids ?? []).length === 0) {
        warnings.push(`Fact "${fact.field}" (${name}) has no source linkage — treated as unverified (rule 3)`);
      }
    }
  }

  for (const name of PROPERTY_CONTEXT_SECTIONS) {
    const section = ctx.sections?.[name];
    if (!section) continue;

    for (const metric of section.derived ?? []) {
      const brokenRefs = (metric.source_ref_ids ?? []).filter((id) => !seenRefIds.has(id));
      if (brokenRefs.length > 0) {
        errors.push(`Derived "${metric.field}" (${name}) has broken source_ref_ids: ${brokenRefs.join(", ")}`);
      }
      const missingFacts = (metric.derived_from_fact_ids ?? []).filter((id) => !factIndex.has(id));
      if (missingFacts.length > 0) {
        errors.push(`Derived "${metric.field}" (${name}) references missing fact ids: ${missingFacts.join(", ")}`);
      }
      if (metric.verified) {
        // Rule 2: all inputs must exist and be verified
        const inputs = metric.derived_from_fact_ids ?? [];
        if (inputs.length === 0) {
          errors.push(`Derived "${metric.field}" (${name}) is verified but has no input facts (rule 2)`);
        } else if (!inputs.every((id) => factIndex.get(id)?.verified)) {
          errors.push(`Derived "${metric.field}" (${name}) is verified but has unverified input facts (rule 2)`);
        }
      }
    }

    for (const pro of section.professionals ?? []) {
      const broken = (pro.source_ref_ids ?? []).filter((id) => !seenRefIds.has(id));
      if (broken.length > 0) {
        errors.push(`Professional "${pro.name}" has broken source_ref_ids: ${broken.join(", ")}`);
      }
      if (pro.verified && (pro.source_ref_ids ?? []).filter((id) => seenRefIds.has(id)).length === 0) {
        errors.push(`Professional "${pro.name}" is verified but has no valid source references`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
