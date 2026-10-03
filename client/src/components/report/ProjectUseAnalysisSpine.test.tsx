import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ProjectUseAreaControl,
  ProjectUseBusinessList,
  ProjectUseBusinessRow,
  ProjectUseCountBlocks,
  ProjectUseGoogleMaps,
} from "./ProjectUseAnalysisSpine";

test("business rows use one name link, a place URL or Chicago Maps search, plain address, and explicit unknown distance", () => {
  const place = renderToStaticMarkup(
    <ProjectUseBusinessRow name="Matchbox" address="770 N Milwaukee Ave" distance={0.24} url="https://www.google.com/maps/place/Matchbox" meta={["★ 4.5", "0 reviews"]} />,
  );
  assert.equal((place.match(/<a\b/g) ?? []).length, 1);
  assert.match(place, /href="https:\/\/www\.google\.com\/maps\/place\/Matchbox"/);
  assert.match(place, /class="kyp-project-use-nearby-address">770 N Milwaukee Ave<\/span>/);
  assert.match(place, /class="kyp-project-use-nearby-name">Matchbox<\/b>/);
  assert.match(place, /class="kyp-project-use-nearby-row"/);
  assert.match(place, /0\.2 mi/);
  assert.match(place, /0 reviews/);

  const search = renderToStaticMarkup(
    <ProjectUseBusinessRow name="Matchbox & Co" address="770 N Milwaukee Ave" distance={null} url={null} />,
  );
  assert.match(search, /google\.com\/maps\/search\/\?api=1&amp;query=Matchbox%20%26%20Co%2C%20770%20N%20Milwaukee%20Ave%2C%20Chicago%2C%20IL/);
  assert.match(search, /distance unknown/);
  assert.doesNotMatch(search, /999/);
});

test("shared nearby row typography is scoped and matches the approved compact scale", () => {
  const css = readFileSync("client/src/kyp-base.css", "utf8");
  assert.match(css, /\.kyp-project-use-nearby-name\{[^}]*font-size:13\.5px;font-weight:600/);
  assert.match(css, /\.kyp-project-use-nearby-address\{font-size:11\.5px;color:var\(--kyp-muted\)/);
  assert.match(css, /\.kyp-project-use-nearby-distance\{[^}]*font-size:11px/);
  assert.doesNotMatch(css, /\.kyp-biz-card\{[^}]*kyp-project-use-nearby/);
});

test("nearby names and addresses use title case with recognized acronyms, preserving source searches and metadata", () => {
  const cases = [
    ["AMOCO OIL COMPANY", "Amoco Oil Company"],
    ["BEST PLACE USA ROGERS PARK", "Best Place USA Rogers Park"],
    ["eDgElUx SPACE #5 · EDGELUX SPACE #6", "Edgelux Space #5 · Edgelux Space #6"],
    ["PATIO GAS- MARATHON / AUTOTECH LLC", "Patio Gas- Marathon / Autotech LLC"],
    ["BP EV CHARGING INC.", "BP EV Charging INC."],
    ["HVAC AND BBQ AT THE PARK", "HVAC And BBQ At The Park"],
    ["VISIT USa, uSa AND usa", "Visit USA, USA And USA"],
    ["McDONALD'S & O’BRIEN", "Mcdonald's & O’brien"],
    ["ÉLÈVE CAFÉ", "Élève Café"],
    ["HF HF-1", "Hf Hf-1"],
    ["8TH STREET", "8th Street"],
  ];
  const address = "5657 N BROADWAY, EDGEWATER, IL";
  for (const [name, expected] of cases) {
    const markup = renderToStaticMarkup(
      <ProjectUseBusinessRow name={name} address={address} distance={0.1} meta={["Network: ChargePoint", "Access: Mon–Sun 8am–10pm"]} />,
    );
    assert.ok(markup.includes(renderToStaticMarkup(<b className="kyp-project-use-nearby-name">{expected}</b>)));
    assert.match(markup, /5657 N Broadway, Edgewater, IL/);
    const query = encodeURIComponent(`${name}, ${address}, Chicago, IL`);
    assert.ok(markup.includes(`query=${query.replace(/'/g, "&#x27;")}`), "Maps search retains the original source spelling");
    assert.match(markup, /Network: ChargePoint/);
    assert.match(markup, /Access: Mon–Sun 8am–10pm/);
  }
});

test("business list caps initial rows and exposes the visible count and expand affordance", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    name: `Business ${index + 1}`,
    address: `${index + 1} Main St`,
    distance: index / 10,
  }));
  const markup = renderToStaticMarkup(<ProjectUseBusinessList rows={rows} />);
  assert.equal((markup.match(/class="kyp-project-use-nearby-row"/g) ?? []).length, 10);
  assert.equal((markup.match(/<a\b/g) ?? []).length, 10);
  assert.match(markup, /Showing 10 of 12/);
  assert.match(markup, /\+ Show all 12/);
});

test("business list rows and expansion controls stay inside one compact list container", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    name: `Business ${index + 1}`,
    address: `${index + 1} Main St`,
    distance: index / 10,
  }));
  const markup = renderToStaticMarkup(<ProjectUseBusinessList rows={rows} />);
  const listStart = markup.indexOf('<div class="kyp-project-use-nearby-list">');
  const listEnd = markup.lastIndexOf("</div>");
  const list = listStart >= 0 && listEnd > listStart
    ? markup.slice(listStart, listEnd + "</div>".length)
    : "";

  assert.ok(listStart >= 0, "business rows should have a dedicated list wrapper");
  assert.ok(listEnd > listStart, "the list wrapper should contain and close after its content");
  assert.equal((list.match(/class="kyp-project-use-nearby-row"/g) ?? []).length, 10);
  assert.match(list, /class="kyp-biz-overflow"/);
  assert.match(list, /\+ Show all 12/);
  assert.doesNotMatch(markup, /^<div class="kyp-project-use-nearby-row"/);
});

test("count blocks preserve zero, render null as a dash, and support text values", () => {
  const markup = renderToStaticMarkup(
    <ProjectUseCountBlocks counts={[
      { value: 0, label: "Within 1 mile" },
      { value: null, label: "Average rating" },
      { value: "bar", label: "Searched for", text: true },
    ]} />,
  );
  assert.match(markup, /<div class="bv">0<\/div>/);
  assert.match(markup, /<div class="bv">—<\/div>/);
  assert.match(markup, /<div class="bv txt">bar<\/div>/);
  assert.equal((markup.match(/kyp-block slate count/g) ?? []).length, 3);
});

test("area control reflects the selected scope and includes available boundary details", () => {
  const markup = renderToStaticMarkup(
    <ProjectUseAreaControl value="community" onChange={() => {}} zipCode="60622" communityArea="West Town" ward={1} />,
  );
  assert.match(markup, /ZIP 60622/);
  assert.match(markup, /West Town/);
  assert.match(markup, /Ward <b>1<\/b>/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.equal((markup.match(/type="button"/g) ?? []).length, 2);
});

test("Google Places counts verified distances, retains unknown rows separately, and omits known results beyond one mile", () => {
  const places = [
    { name: "Nearby", address: "1 Lake St", distanceMiles: 0.6, rating: 4.6, reviewsCount: 0 },
    { name: "No distance", address: "2 Lake St", distanceMiles: null, rating: null, reviewsCount: 17 },
    { name: "Outside", address: "3 Lake St", distanceMiles: 1.01, rating: 4.9, reviewsCount: 99 },
  ];
  const markup = renderToStaticMarkup(
    <ProjectUseGoogleMaps
      confirmed
      data={{ status: "complete", places, count: 3, avgRating: 4.8, searchTerm: "bar" }}
    />,
  );
  assert.match(markup, /<div class="bv">1<\/div><div class="bl">Within 1 mile/);
  assert.match(markup, /★ 4\.6/);
  assert.match(markup, /Searched for/);
  assert.match(markup, /distance unknown/);
  assert.match(markup, /0 reviews/);
  assert.match(markup, /17 reviews/);
  assert.doesNotMatch(markup, /Outside|99 reviews/);
  assert.equal((markup.match(/class="kyp-src"/g) ?? []).length, 1);
  assert.match(markup, /not included in the within-1-mile count/);
  assert.match(markup, /1 returned place has an unknown distance/);
  assert.doesNotMatch(markup, /class="kyp-scopenote"/);
});

test("Google Places subsection content keeps the px-4 inset in ready and every availability state", () => {
  const states = [
    <ProjectUseGoogleMaps contentInset confirmed data={{ places: [{ name: "Cafe", address: "1 Main St", distanceMiles: 0.4 }], count: 1 }} />,
    <ProjectUseGoogleMaps contentInset />,
    <ProjectUseGoogleMaps contentInset confirmed isLoading />,
    <ProjectUseGoogleMaps contentInset confirmed isError />,
    <ProjectUseGoogleMaps contentInset confirmed data={{ places: [], totalFound: 0 }} />,
  ];
  for (const state of states) {
    const markup = renderToStaticMarkup(state);
    assert.match(markup, /^<div class="px-4">/);
    assert.match(markup, /class="kyp-src"/);
  }
});

test("Google Places caps at ten and reports unconfirmed, pending, error, and empty states without false zero blocks", () => {
  const places = Array.from({ length: 12 }, (_, index) => ({
    name: `Place ${index + 1}`,
    address: `${index + 1} Main St`,
    distanceMiles: 0.4,
    rating: 4.3,
    reviewsCount: 2,
  }));
  const populated = renderToStaticMarkup(
    <ProjectUseGoogleMaps confirmed data={{ places, count: 12, avgRating: null }} />,
  );
  assert.equal((populated.match(/class="kyp-project-use-nearby-row"/g) ?? []).length, 10);
  assert.match(populated, /Showing 10 of 12/);
  assert.match(populated, /Average rating/);
  assert.match(populated, /<div class="bv">—<\/div>/);

  const unconfirmed = renderToStaticMarkup(<ProjectUseGoogleMaps />);
  assert.match(unconfirmed, /Confirm a project-use concept/);
  assert.doesNotMatch(unconfirmed, /kyp-blocks/);

  const pending = renderToStaticMarkup(<ProjectUseGoogleMaps confirmed isLoading />);
  assert.match(pending, /results are loading/);
  const error = renderToStaticMarkup(<ProjectUseGoogleMaps confirmed isError />);
  assert.match(error, /could not be loaded/);
  assert.match(error, /role="alert"/);
  const empty = renderToStaticMarkup(<ProjectUseGoogleMaps confirmed data={{ places: [], totalFound: 0 }} />);
  assert.match(empty, /No Google Maps places were found/);
  assert.doesNotMatch(empty, /kyp-blocks/);
});

test("Google Places accepts a source-specific footer and derives average after radius filtering", () => {
  const markup = renderToStaticMarkup(
    <ProjectUseGoogleMaps
      confirmed
      data={{
        places: [
          { name: "Near", address: "1 Main St", distanceMiles: 0.4, rating: 4 },
          { name: "Far", address: "2 Main St", distanceMiles: 1.2, rating: 2 },
        ],
        count: 2,
        avgRating: 3,
      }}
      footer={<>Source-specific daycare records and scope.</>}
    />,
  );
  assert.match(markup, /★ 4\.0/);
  assert.doesNotMatch(markup, /★ 3\.0/);
  assert.match(markup, /Source-specific daycare records and scope/);
  assert.match(markup, /farther and unknown-distance places are excluded/);
  assert.equal((markup.match(/class="kyp-src"/g) ?? []).length, 1);
});