/**
 * One-off verification script for the property memory context system.
 * Exercises every utility function and validation rule against a real run,
 * then resets that run's context back to empty.
 *
 * Run: npx tsx scripts/test_property_context.ts <runId>
 */
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { propertyContexts } from "../shared/schema";
import {
  createPropertyContext,
  getPropertyContext,
  updatePropertySnapshot,
  updatePropertyIdentity,
  addSourceReference,
  addSectionFact,
  addDerivedMetric,
  addLinkedProfessional,
  markFactVerified,
  markFactUnverified,
  setSectionMiniSummary,
  setSectionEligibility,
  validatePropertyContext,
  resolvePropertyIdForAddress,
} from "../server/propertyContext";

const runId = parseInt(process.argv[2] || "0");
if (!runId) throw new Error("Usage: npx tsx scripts/test_property_context.ts <runId>");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
async function expectThrow(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected an error but none was thrown");
  } catch {
    check(label, true);
  }
}

async function main() {
  // Clean slate
  await db.delete(propertyContexts).where(eq(propertyContexts.runId, runId));

  // --- resolvePropertyIdForAddress
  const resolved = await resolvePropertyIdForAddress("2001 N California Ave, Chicago, IL 60647");
  console.log(`\nresolvePropertyIdForAddress => ${JSON.stringify(resolved)}`);
  check("property_id resolved (PIN or normalized address)", resolved.propertyId.length > 0);

  // --- create (idempotent)
  const row1 = await createPropertyContext(runId, resolved.propertyId);
  const row2 = await createPropertyContext(runId, "SHOULD_NOT_OVERWRITE");
  check("createPropertyContext creates row", !!row1.id);
  check("createPropertyContext is idempotent", row2.id === row1.id && row2.propertyId === row1.propertyId);

  let ctx = await getPropertyContext(runId);
  check("getPropertyContext returns context", !!ctx && ctx.report_id === String(runId));
  check("context has all 7 sections", !!ctx && Object.keys(ctx.sections).length === 7);
  check("new fields present", !!ctx && ctx.run_version === 1 && ctx.context_version === 1 && ctx.extraction_status === "not_started" && ctx.source_coverage_status === "none");

  // --- identity + snapshot
  await updatePropertyIdentity(runId, { canonicalPropertyKey: "test-canonical-key" });
  await updatePropertySnapshot(runId, { address: "2001 N California Ave", city: "Chicago", state: "IL" });
  ctx = await getPropertyContext(runId);
  check("canonical_property_key updated", ctx?.canonical_property_key === "test-canonical-key");
  check("snapshot updated", ctx?.property_snapshot.address === "2001 N California Ave");

  // --- source refs
  const srcId = await addSourceReference(runId, {
    source_document: "property_report.pdf",
    source_section: "Taxes & Assessment",
    source_page_start: 4,
    source_page_end: 4,
    source_anchor: "taxes-assessment",
    source_snippet: "2024 total tax billed: $18,240.00",
    source_url: null,
    source_type: "taxes",
  });
  check("addSourceReference returns id", srcId.startsWith("src_"));
  ctx = await getPropertyContext(runId);
  check("status.sources_indexed flipped", ctx?.status.sources_indexed === true);

  // --- facts
  const fact1 = await addSectionFact(runId, "taxes_assessment", {
    field: "annual_tax_2024",
    value: 18240,
    display_value: "$18,240.00",
    fact_type: "confirmed_fact",
    verified: true,
    source_ref_ids: [srcId],
    tags: ["taxes"],
  });
  check("verified fact with valid source ref stays verified", fact1.verified === true);

  const fact2 = await addSectionFact(runId, "taxes_assessment", {
    field: "assessment_appeal_pending",
    value: true,
    display_value: null,
    fact_type: "reported_context",
    verified: true, // should be downgraded — no source refs
    source_ref_ids: [],
    tags: [],
  });
  check("rule 1: fact without source refs auto-downgraded to unverified", fact2.verified === false);

  await expectThrow("fact with broken source_ref_id throws", () =>
    addSectionFact(runId, "taxes_assessment", {
      field: "bad_fact",
      value: 1,
      display_value: null,
      fact_type: "confirmed_fact",
      verified: false,
      source_ref_ids: ["src_nonexistent"],
      tags: [],
    })
  );
  await expectThrow("unknown section name throws", () =>
    addSectionFact(runId, "not_a_section", {
      field: "x", value: 1, display_value: null, fact_type: "confirmed_fact", verified: false, source_ref_ids: [], tags: [],
    })
  );

  // --- derived metrics
  const drv1 = await addDerivedMetric(runId, "taxes_assessment", {
    field: "monthly_tax_2024",
    value: 1520,
    display_value: "$1,520.00/mo",
    derived_from_fact_ids: [fact1.id],
    formula: "annual_tax_2024 / 12",
    verified: true,
    source_ref_ids: [],
    tags: [],
  });
  check("rule 2: derived from verified fact is verified", drv1.verified === true);
  check("derived inherits union of input source refs", drv1.source_ref_ids.includes(srcId));

  const drv2 = await addDerivedMetric(runId, "taxes_assessment", {
    field: "derived_from_unverified",
    value: 0,
    display_value: null,
    derived_from_fact_ids: [fact2.id],
    formula: "n/a",
    verified: true, // should be downgraded
    source_ref_ids: [],
    tags: [],
  });
  check("rule 2: derived from unverified fact is downgraded", drv2.verified === false);

  await expectThrow("derived referencing missing fact id throws", () =>
    addDerivedMetric(runId, "taxes_assessment", {
      field: "bad_derived", value: 0, display_value: null,
      derived_from_fact_ids: ["fact_nonexistent"], formula: null, verified: false, source_ref_ids: [], tags: [],
    })
  );

  // --- verification toggles + cascade
  await expectThrow("rule 1: markFactVerified without source refs throws", () => markFactVerified(runId, fact2.id));

  await markFactUnverified(runId, fact1.id);
  ctx = await getPropertyContext(runId);
  let drv = ctx?.sections.taxes_assessment.derived.find((d) => d.id === drv1.id);
  check("cascade: unverifying input fact unverifies derived metric", drv?.verified === false);

  await markFactVerified(runId, fact1.id);
  ctx = await getPropertyContext(runId);
  drv = ctx?.sections.taxes_assessment.derived.find((d) => d.id === drv1.id);
  check("cascade: re-verifying input fact re-verifies derived metric", drv?.verified === true);
  check("source_coverage_status is partial (mixed verified)", ctx?.source_coverage_status === "partial");

  // --- placeholders
  await setSectionMiniSummary(runId, "taxes_assessment", "Taxes are current; 2024 bill $18,240.");
  await setSectionEligibility(runId, "taxes_assessment", true);
  ctx = await getPropertyContext(runId);
  check("mini_summary set", ctx?.sections.taxes_assessment.mini_summary !== null);
  check("eligible_for_onepager set", ctx?.sections.taxes_assessment.eligible_for_onepager === true);
  check("status.section_summaries_generated flipped", ctx?.status.section_summaries_generated === true);

  // --- professionals
  const pro = await addLinkedProfessional(runId, {
    name: "Jane Example",
    role_type: "tax_attorney",
    linked_record_type: "tax_appeal",
    display_context: "Filed the 2023 assessment appeal for this PIN",
    verified: true,
    source_ref_ids: [srcId],
    activity_context: { citywide_record_count: 42, recent_activity_window: "2022-2024" },
  });
  check("linked professional added verified with source ref", pro.verified === true);

  // --- full validation
  const validation = await validatePropertyContext(runId);
  console.log(`\nvalidatePropertyContext => valid=${validation.valid}, errors=${validation.errors.length}, warnings=${validation.warnings.length}`);
  for (const e of validation.errors) console.log(`    error: ${e}`);
  for (const w of validation.warnings) console.log(`    warning: ${w}`);
  check("populated context validates clean", validation.valid === true);
  check("unsourced fact produces rule-3 warning", validation.warnings.some((w) => w.includes("rule 3")));

  // --- corrupt on purpose, validation must catch it
  const corrupted = (await getPropertyContext(runId))!;
  corrupted.sections.taxes_assessment.facts[1].verified = true; // no source refs
  corrupted.sections.taxes_assessment.facts[0].source_ref_ids = ["src_broken"];
  await db.update(propertyContexts).set({ context: corrupted }).where(eq(propertyContexts.runId, runId));
  const badValidation = await validatePropertyContext(runId);
  check("validation catches verified-without-source (rule 1)", badValidation.errors.some((e) => e.includes("rule 1")));
  check("validation catches broken source_ref_ids", badValidation.errors.some((e) => e.includes("broken source_ref_ids")));
  check("corrupted context is invalid", badValidation.valid === false);

  // --- reset to a clean empty context (leave no fake data behind)
  await db.delete(propertyContexts).where(eq(propertyContexts.runId, runId));
  await createPropertyContext(runId, resolved.propertyId);
  const finalValidation = await validatePropertyContext(runId);
  check("reset: empty context validates clean", finalValidation.valid === true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
