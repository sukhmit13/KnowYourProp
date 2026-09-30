import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
const render = (schema_version: number, { historical = false, noTimeline = false } = {}) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <SectionNumberContext.Provider value={7}>
      <OwnershipTitleSection
        pinLookupData={{ pin: subject, saleHistory: [] }}
        lienData={{
          pin: subject,
          ownerName: "Example Owner",
          liens: historical ? [{ documentNumber: "OLD-LIEN", documentType: "Released lien", isReleased: true, recordingDate: "2021-01-01" }] : [],
          documents: [],
          ownerLiens: [{ documentNumber: "OWNER-LIEN-123", documentType: "Judgment lien", viewLink: "https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=17071170240000" }],
        }}
        debtSnapRec={{ snap: noTimeline ? { ...snap(schema_version), active: [] } : snap(schema_version) }}
        isDebtSnapshotFetched
        relatedParcels={[{ pin: companion, formattedAddress: "520 N CLAREMONT AVE" }]}
      />
    </SectionNumberContext.Provider>
  </QueryClientProvider>,
);

const html = render(4);
assert.ok(html.indexOf("Most recent declared sale") < html.indexOf("Ownership details"), "summary precedes ownership details");
assert.ok(html.indexOf("Ownership details") < html.indexOf("Example Owner"), "owner is inside ownership details");
assert.ok(html.indexOf("Example Owner") < html.indexOf("Parcel coverage"), "co-parcel belongs under ownership details");
assert.ok(!html.includes("Co-parcel title context"), "old explanatory banner is removed");
assert.match(html, /Co-parcel detected/);
assert.match(html, /ownership-loan-scope-SOLO[^]*?17-07-117-024[^]*?only this PIN identified for this loan/);
assert.match(html, /ownership-loan-scope-BOTH[^]*?17-07-117-024 · 17-07-117-025[^]*?multiple parcels/);
assert.ok(html.indexOf("Other Recorder instruments") < html.indexOf("Owner liens"), "owner liens follows the existing title subsections");
assert.match(html, /<span class="n">07\.7<\/span><span class="lbl">Owner liens<\/span>/, "owner liens receives the next subsection number");
assert.match(html, /button-owner-lien-search/);
assert.match(html, /button-owner-name-edit/);
assert.match(html, /Judgment lien/);
assert.match(html, /OWNER-LIEN-123/);
assert.match(html, /crs\.cookcountyclerkil\.gov\/Search\/ResultByPin\?id1=17071170240000/);
assert.ok(!render(3).includes("ownership-loan-scope-SOLO"), "obsolete snapshots do not render loan scope claims");
const numbers = (markup: string) => [...markup.matchAll(/<span class="n">07\.(\d+)<\/span>/g)].map((match) => Number(match[1]));
for (const markup of [html, render(4, { historical: true }), render(4, { noTimeline: true })]) {
  const actual = numbers(markup);
  assert.deepEqual(actual, actual.map((_, index) => index + 1), "visible ownership subsection numbers are consecutive and unique");
}
assert.match(render(4, { historical: true }), /<span class="n">07\.6<\/span><span class="lbl">Historical filings<\/span>/);
assert.match(render(4, { noTimeline: true }), /<span class="n">07\.5<\/span><span class="lbl">Other Recorder instruments<\/span>/);
console.log("Ownership layout, owner liens, and per-loan PIN evidence checks passed");