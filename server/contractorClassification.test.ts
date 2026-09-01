import assert from "node:assert/strict";
import {
  classifyPermitProjectScope,
  classifyPermitSpecialty,
  classifyPermitWorkTypes,
  extractContractorContacts,
} from "./utils/contractorClassification";

const cases = [
  {
    name: "narrow condo bathroom",
    description: "REMODEL EXISTING BATHROOM IN CONDO, REPLACE SHOWER, TOILET AND VANITY",
    scope: "bathroom",
    context: "condo",
    strictBathroom: true,
  },
  {
    name: "commercial restroom",
    description: "RENOVATION OF RETAIL STORE AND RESTROOM",
    scope: "commercial-industrial",
    context: "commercial-industrial",
    strictBathroom: false,
  },
  {
    name: "gut rehab mentioning rooms",
    description: "GUT REHAB OF EXISTING SINGLE FAMILY HOME INCLUDING KITCHEN AND BATH",
    scope: "gut-rehab",
    context: "single-family",
    strictBathroom: false,
  },
  {
    name: "combined kitchen and bath",
    description: "REMODEL KITCHEN AND TWO BATHROOMS IN CONDO UNIT",
    scope: "kitchen-bath",
    context: "condo",
    strictBathroom: false,
  },
  {
    name: "new construction",
    description: "NEW CONSTRUCTION OF 3 STORY SINGLE FAMILY RESIDENCE",
    scope: "ground-up",
    context: "single-family",
    strictBathroom: false,
  },
  {
    name: "basement underpinning",
    description: "UNDERPINNING AND LOWER BASEMENT FLOOR IN EXISTING 1 DU RESIDENCE",
    scope: "basement-excavation",
    context: "single-family",
    strictBathroom: false,
  },
  {
    name: "permit unit count",
    description: "REPAIR PLUMBING FIXTURES. LOCATIONS: 3 RESIDENTIAL UNITS, 0 NON-RESIDENTIAL UNITS",
    scope: "other",
    context: "multi-family",
    strictBathroom: false,
  },
] as const;

for (const fixture of cases) {
  const result = classifyPermitProjectScope({ work_description: fixture.description });
  assert.equal(result.primary, fixture.scope, `${fixture.name}: scope`);
  assert.equal(result.propertyContext, fixture.context, `${fixture.name}: context`);
  assert.equal(result.strictBathroom, fixture.strictBathroom, `${fixture.name}: strict bathroom`);
}

assert.deepEqual(
  classifyPermitWorkTypes({ work_description: "INSTALL ROUGH WOOD FRAMING AND CERAMIC TILE" }).sort(),
  ["framing", "tile"].sort(),
);
assert.ok(classifyPermitSpecialty({ work_type: "Electrical Work" }).all.includes("electrical"));
assert.ok(classifyPermitSpecialty({ work_description: "EXCAVATE AND UNDERPIN EXISTING BASEMENT" }).all.includes("excavation"));

const contacts = extractContractorContacts({
  contact_1_name: "Owner Name",
  contact_1_type: "OWNER AS GENERAL CONTRACTOR",
  contact_2_name: "Trade Co",
  contact_2_type: "ELECTRICAL CONTRACTOR",
  contact_15_name: "Frame Co",
  contact_15_type: "FRAMING CONTRACTOR",
});
assert.deepEqual(contacts.map(contact => contact.name).sort(), ["FRAME CO", "TRADE CO"]);
assert.equal(contacts.find(contact => contact.name === "FRAME CO")?.roles[0], "carpentry/framing");

console.log(`contractor classification rules passed (${cases.length} scope fixtures)`);