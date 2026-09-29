import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionNumberContext } from "./AccordionSection";
import { OwnershipTitleSection } from "./OwnershipTitleSection";

const subject = "17071170240000";
const companion = "17071170250000";
const mortgage = (doc: string, pins: string[], blanket: boolean) => ({
  doc_number: doc,
  lender: "Example Bank",
  recording_date: "2025-08-28",
  effective_amount: 198000,
  documented_pins: pins,
  blanket,
  blanket_pins: blanket ? [companion] : [],
  position: 1,
});
const snap = (schema_version: number) => ({
  schema_version,
  active: [mortgage("SOLO", [subject], false), mortgage("BOTH", [subject, companion], true)],
  satisfied: [],
  cleared_by_sale: [],
  scopeChanges: [],
  combined_recorded_debt: 396000,
});
const render = (schema_version: number) => renderToStaticMarkup(
  <SectionNumberContext.Provider value={7}>
    <OwnershipTitleSection
      pinLookupData={{ pin: subject, saleHistory: [] }}
      lienData={{ pin: subject, ownerName: "Example Owner", liens: [], documents: [] }}
      debtSnapRec={{ snap: snap(schema_version) }}
      isDebtSnapshotFetched
      relatedParcels={[{ pin: companion, formattedAddress: "520 N CLAREMONT AVE" }]}
    />
  </SectionNumberContext.Provider>,
);

const html = render(4);
assert.ok(html.indexOf("Most recent declared sale") < html.indexOf("Ownership details"), "summary precedes ownership details");
assert.ok(html.indexOf("Ownership details") < html.indexOf("Example Owner"), "owner is inside ownership details");
assert.ok(html.indexOf("Example Owner") < html.indexOf("Parcel coverage"), "co-parcel belongs under ownership details");
assert.ok(!html.includes("Co-parcel title context"), "old explanatory banner is removed");
assert.match(html, /Co-parcel detected/);
assert.match(html, /ownership-loan-scope-SOLO[^]*?17-07-117-024[^]*?only this PIN identified for this loan/);
assert.match(html, /ownership-loan-scope-BOTH[^]*?17-07-117-024 · 17-07-117-025[^]*?multiple parcels/);
assert.ok(!render(3).includes("ownership-loan-scope-SOLO"), "obsolete snapshots do not render loan scope claims");
console.log("Ownership layout and per-loan PIN evidence checks passed");