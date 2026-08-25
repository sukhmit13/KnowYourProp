// reportPdf.ts
// Server-side PDF export of a property report — a purpose-built paper document,
// NOT a print of the webpage. Phase 1 (review draft): cover, table of contents,
// executive summary (the one-page insight report), Property Snapshot, and
// Zoning & Ward. Later phases add the remaining sections + appendix.
//
// Design language matches the website: paper tones, navy/indigo accents,
// Instrument Serif display + Inter body (same fonts as the insight report).

import { chromium } from 'playwright';
import { chromiumLaunchOverrides } from './playwrightEnv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage';
import { getPropertyTax } from './propertyTax';
import { resolvePinFromAddress } from './pinResolver';
import { getZoningInfo } from '@shared/zoningData';
import { findNearestTransit, initTransit, isTransitInitialized } from './transit';
import { getNearbySchools, type NearbySchoolsResult, type CpsSchool } from './schoolsNearby';
import { getCommunityAreaChildcareAccess } from './childcare';
import { checkIncentives, type CheckResult } from './incentivesChecker';
import { getGeneralContractorRankings, getArchitectRankings, type GeneralContractorEntry, type ArchitectEntry } from './architectRankings';
import { getDemographicTrends, type DemographicTrends } from './demographics';
import { fetchPermitHistory, fetchViolationHistory, fetchCrimeStats, fetchCrimeTractRanking } from './permits';
import { getSBALoans } from './sbaLoans';
import { getComparableSales, type CompsResult } from './comparableSales';
import { getAirbnbStats, type AirbnbNeighborhoodStats } from './airbnbStats';
import { getGroceryAccessByCommunityArea, type GroceryAccessData } from './grocery-stores';
import { checkTODStatus, type TODStatus } from './transit';
import { checkNmtcEligibility } from './nmtc';
import { getUpcomingDevelopments, type UpcomingDevelopment } from './upcomingDevelopments';
import { getNearbyNewConstruction } from './newConstruction';
import { getVehicleOwnership, getSeniorsData, type VehicleOwnershipEntry, type SeniorsEntry } from './localDemographics';
import { findNearbyRestaurants, findNearbyCoffeeShops, findNearbyBars, findNearbyHotels, findNearbyGasStations, findNearbyEvStations } from './ev-stations';
import { getNearbyBusinessLicenses } from './businessLicenses';
import { buildListingChecks, classifyDisclosures, hasValidatedArmLengthSaleAfterFinding } from './listingChecks';

/** GET/POST against our own free local-data routes (no auth, no paid calls). */
async function localApi<T = any>(pathname: string, body?: unknown): Promise<T | null> {
  const port = process.env.PORT || 5000;
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}
import type { Run, PropertyTaxResult } from '@shared/schema';

const __pdfDirname = path.dirname(fileURLToPath(import.meta.url));

export interface WardInfo {
  ward: string | null;
  alderman: string | null;
  aldermanPhone?: string | null;
  aldermanEmail?: string | null;
}

interface GatheredData {
  lat: number | null;
  lon: number | null;
  zoning: string | null;
  zoningName: string | null;
  zoningDescription: string | null;
  communityArea: string | null;
  tifName: string | null;
  opportunityZone: boolean;
  tractGeoid: string | null;
  zipCode: string | null;
  pin: string | null;
  tax: PropertyTaxResult | null;
  insightHtml: string | null;
  insightGeneratedAt: Date | null;
  listing: any | null;
  transit: { ctaRail: any[]; ctaBus: any[]; metra: any[] } | null;
  schools: NearbySchoolsResult | null;
  childcare: Awaited<ReturnType<typeof getCommunityAreaChildcareAccess>> | null;
  incentives: CheckResult[] | null;
  contractors: GeneralContractorEntry[] | null;
  architects: ArchitectEntry[] | null;
  demographics: DemographicTrends | null;
  languages: { topLanguages: Array<{ language: string; pct: number }>; nonEnglishPct: number } | null;
  pinDetail: any | null;           // saleHistory / assessedValues / appealHistory / exemptionHistory
  permits: any | null;
  violations: any | null;
  crime: any | null;
  crimeRank: any | null;
  hmda: any | null;
  sba: any | null;
  comps: CompsResult | null;
  airbnb: AirbnbNeighborhoodStats | null;
  grocery: GroceryAccessData | null;
  tod: TODStatus | null;
  nmtc: any | null;
  sbif: any | null;
  mmrp: any | null;
  lodes: any | null;
  elections: any | null;
  vehicle: VehicleOwnershipEntry | null;
  seniors: SeniorsEntry | null;
  amenities: Record<string, { total: number; within1: number; names: string[] }> | null;
  licenses: any | null;
  traffic: any | null;
  developments: UpcomingDevelopment[] | null;
  construction: Awaited<ReturnType<typeof getNearbyNewConstruction>> | null;
  landmark: any | null;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

function fmtMoney(n: number | null | undefined): string {
  return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
}

/** Tax-year cells arrive as numbers or numeric strings; render as dollars. */
function fmtMoneyish(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : esc(v);
}

function fmtPin(pin: string): string {
  const p = pin.replace(/[^0-9]/g, '');
  return p.length === 14
    ? `${p.slice(0, 2)}-${p.slice(2, 4)}-${p.slice(4, 7)}-${p.slice(7, 10)}-${p.slice(10)}`
    : pin;
}

function titleCaseAddress(addr: string): string {
  return addr.replace(/\w\S*/g, (w) =>
    /^(IL|USA|US|NE|NW|SE|SW|N|S|E|W)$/i.test(w) && w === w.toUpperCase()
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

/** Cache-only geocode read, mirroring the geocode route's normalization. */
async function readGeocodeFromCache(address: string) {
  const cleaned = address
    .replace(/,?\s*(United States|USA|US)$/i, '')
    .replace(/,\s*Illinois\b/gi, ', IL')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const stripped = cleaned.replace(/\s+(APT|UNIT|STE|SUITE|#|FL|FLOOR)\s*\S+/gi, '').replace(/\s+/g, ' ').trim();
  return (await storage.getGeocodeAnyAge(stripped)) ?? (await storage.getGeocodeAnyAge(cleaned));
}

async function gatherData(run: Run, ward?: WardInfo): Promise<GatheredData> {
  const d: GatheredData = {
    lat: null, lon: null, zoning: null, zoningName: null, zoningDescription: null,
    communityArea: null, tifName: null, opportunityZone: false, tractGeoid: null,
    zipCode: null, pin: null, tax: null, insightHtml: null, insightGeneratedAt: null,
    listing: null, transit: null, schools: null, childcare: null, incentives: null,
    contractors: null, architects: null, demographics: null, languages: null,
    pinDetail: null, permits: null, violations: null, crime: null, crimeRank: null,
    hmda: null, sba: null, comps: null, airbnb: null, grocery: null, tod: null,
    nmtc: null, sbif: null, mmrp: null, lodes: null, elections: null, vehicle: null,
    seniors: null, amenities: null, licenses: null, traffic: null, developments: null,
    landmark: null, construction: null,
  };

  const geo = await readGeocodeFromCache(run.address).catch(() => undefined);
  if (geo) {
    d.lat = parseFloat(geo.lat);
    d.lon = parseFloat(geo.lon);
    d.zoning = geo.zoning ?? null;
    d.communityArea = geo.communityArea ?? null;
    d.tifName = geo.tifName ?? null;
    d.opportunityZone = !!geo.opportunityZone;
    d.tractGeoid = geo.tractGeoid ?? null;
    d.zipCode = geo.zipCode ?? null;
  }

  if (d.zoning) {
    const zi = getZoningInfo(d.zoning);
    if (zi) {
      d.zoningName = (zi as any).name ?? null;
      d.zoningDescription = (zi as any).description ?? null;
    }
  }

  try {
    const pinResult = await resolvePinFromAddress(run.address, d.lat ?? undefined, d.lon ?? undefined);
    d.pin = (pinResult as any)?.pin ?? null;
    d.pinDetail = pinResult ?? null;
  } catch (err) {
    console.error('[REPORT PDF] PIN resolution failed:', (err as Error).message);
  }

  if (d.pin) {
    try {
      d.tax = await getPropertyTax(d.pin, { address: run.address });
    } catch (err) {
      console.error('[REPORT PDF] Property tax fetch failed:', (err as Error).message);
    }
  }

  const insight = (run as any).insightReportContent;
  if (insight?.html) {
    d.insightHtml = insight.html as string;
    d.insightGeneratedAt = (run as any).insightReportGeneratedAt ?? null;
  }

  // Stored listing snapshot (no live/paid fetch from the PDF path)
  d.listing = (run as any).listingSnapshot ?? null;

  // The remaining sections are independent — gather in parallel; each failure
  // logs and leaves the section explicitly marked unavailable.
  const soft = <T,>(p: Promise<T>, label: string): Promise<T | null> =>
    Promise.race([
      p,
      new Promise<null>((resolve) => setTimeout(() => { console.error(`[REPORT PDF] ${label} timed out after 25s`); resolve(null); }, 25_000).unref?.()),
    ]).catch((err) => { console.error(`[REPORT PDF] ${label} failed:`, (err as Error).message); return null; });

  const [transit, schools, childcare, incentives, contractors, architects, demographics] = await Promise.all([
    d.lat != null && d.lon != null
      ? soft((async () => { if (!isTransitInitialized()) await initTransit(); return findNearestTransit(d.lat!, d.lon!, 5); })(), 'transit')
      : null,
    d.lat != null && d.lon != null ? soft(getNearbySchools(d.lat, d.lon), 'schools') : null,
    d.communityArea ? soft(getCommunityAreaChildcareAccess(d.communityArea), 'childcare') : null,
    d.lat != null && d.lon != null
      ? soft(checkIncentives({ lat: d.lat, lon: d.lon, tractGeoid: d.tractGeoid, zipCode: d.zipCode, zoningCode: d.zoning }), 'incentives')
      : null,
    soft(getGeneralContractorRankings(), 'contractors'),
    soft(getArchitectRankings(), 'architects'),
    d.communityArea ? soft(getDemographicTrends(d.communityArea), 'demographics') : null,
  ]);
  d.transit = transit as any;
  d.schools = schools;
  d.childcare = childcare;
  d.incentives = incentives;
  d.contractors = contractors;
  d.architects = architects;
  d.demographics = demographics;

  // --- Second wave: everything else (free/local/public sources only) ---
  const hasGeo = d.lat != null && d.lon != null;
  const t0 = d.tax;
  let permitsCombined: Promise<any> | null = null;
  const [permits, violations, crime, crimeRank, hmda, sba, comps, developments, licenses, landmark, nmtc, sbif, mmrp, lodes, elections, traffic] = await Promise.all([
    (permitsCombined ??= soft(localApi('/api/permits-violations-combined', { primaryAddress: run.address }), 'permits')).then((r: any) => r?.permitsData ?? r?.permits ?? null),
    (permitsCombined ??= soft(localApi('/api/permits-violations-combined', { primaryAddress: run.address }), 'violations')).then((r: any) => r?.violationsData ?? r?.violations ?? null),
    hasGeo ? soft(fetchCrimeStats(d.lat!, d.lon!), 'crime') : null,
    d.communityArea ? soft(fetchCrimeTractRanking(d.communityArea), 'crime ranking') : null,
    (d.tractGeoid || d.communityArea)
      ? soft(localApi(`/api/hmda-stats?${d.tractGeoid ? `tract=${encodeURIComponent(d.tractGeoid)}&` : ''}${d.communityArea ? `communityArea=${encodeURIComponent(d.communityArea)}` : ''}`), 'hmda')
      : null,
    d.zipCode ? soft(getSBALoans(d.zipCode), 'sba') : null,
    hasGeo && t0?.propertyClass
      ? soft(getComparableSales(d.lat!, d.lon!, t0.propertyClass, t0.buildingSquareFeet ?? null, null, null), 'comps')
      : null,
    soft(getUpcomingDevelopments(), 'developments'),
    hasGeo ? soft(getNearbyBusinessLicenses(d.lat!, d.lon!, 1), 'licenses') : null,
    hasGeo ? soft(localApi('/api/landmark-status', { lat: d.lat, lon: d.lon, address: run.address }), 'landmark') : null,
    hasGeo ? soft(checkNmtcEligibility(d.lat!, d.lon!), 'nmtc') : null,
    d.tifName ? soft(localApi('/api/sbif/check', { tifName: d.tifName }), 'sbif') : null,
    hasGeo ? soft(localApi('/api/mmrp/check', { lat: d.lat, lon: d.lon }), 'mmrp') : null,
    d.tractGeoid ? soft(localApi(`/api/lodes?tractGeoid=${encodeURIComponent(d.tractGeoid)}`), 'lodes') : null,
    d.communityArea ? soft(localApi(`/api/elections/${encodeURIComponent(d.communityArea)}`), 'elections') : null,
    hasGeo ? soft(localApi(`/api/traffic-count?lat=${d.lat}&lon=${d.lon}`), 'traffic') : null,
  ]);
  d.permits = permits; d.violations = violations; d.crime = crime; d.crimeRank = crimeRank;
  d.hmda = hmda; d.sba = sba; d.comps = comps; d.licenses = licenses; d.landmark = landmark;
  d.nmtc = nmtc; d.sbif = sbif; d.mmrp = mmrp; d.lodes = lodes; d.elections = elections; d.traffic = traffic;
  d.developments = developments && ward?.ward
    ? developments.filter((dev) => dev.ward != null && String(dev.ward) === String(ward.ward)).slice(0, 12)
    : null;
  if (hasGeo) d.construction = await soft(getNearbyNewConstruction(d.lat!, d.lon!, d.communityArea || undefined, 1), 'new construction');

  // Local-data reads
  try { if (d.communityArea) d.airbnb = await getAirbnbStats(d.communityArea); } catch (e) { console.error('[REPORT PDF] airbnb failed:', (e as Error).message); }
  try { if (d.communityArea && hasGeo) d.grocery = getGroceryAccessByCommunityArea(d.communityArea, d.lat!, d.lon!); } catch (e) { console.error('[REPORT PDF] grocery failed:', (e as Error).message); }
  try { if (d.transit) d.tod = checkTODStatus(d.transit as any); } catch (e) { console.error('[REPORT PDF] tod failed:', (e as Error).message); }
  try { d.vehicle = getVehicleOwnership(d.communityArea); } catch (e) { console.error('[REPORT PDF] vehicle failed:', (e as Error).message); }
  try { d.seniors = getSeniorsData(d.communityArea); } catch (e) { console.error('[REPORT PDF] seniors failed:', (e as Error).message); }
  if (hasGeo) {
    const amen: NonNullable<GatheredData['amenities']> = {};
    const grab = (label: string, fn: () => any, listKey: 'locations' | 'stations' | 'hotels') => {
      try {
        const r = fn();
        if (!r) return;
        const list = (r[listKey] ?? r.locations ?? r.stations ?? []) as any[];
        amen[label] = { total: r.totalFound ?? list.length, within1: r.within1Mile ?? 0, names: list.slice(0, 4).map((x: any) => x.name) };
      } catch (e) { console.error(`[REPORT PDF] amenity ${label} failed:`, (e as Error).message); }
    };
    grab('Restaurants', () => findNearbyRestaurants(d.lat!, d.lon!, 1), 'locations');
    grab('Coffee shops', () => findNearbyCoffeeShops(d.lat!, d.lon!, 1), 'locations');
    grab('Bars & lounges', () => findNearbyBars(d.lat!, d.lon!, 1), 'locations');
    grab('Hotels', () => findNearbyHotels(d.lat!, d.lon!, 3), 'hotels');
    grab('Gas stations', () => findNearbyGasStations(d.lat!, d.lon!, 3), 'stations');
    grab('EV charging', () => findNearbyEvStations(d.lat!, d.lon!, 3), 'stations');
    d.amenities = Object.keys(amen).length ? amen : null;
  }

  if (d.communityArea) {
    try {
      const langs = JSON.parse(fs.readFileSync(path.join(__pdfDirname, 'data/demographics/languages.json'), 'utf-8'));
      const row = Object.values(langs as Record<string, any>).find(
        (r: any) => r.communityArea?.toUpperCase() === d.communityArea!.toUpperCase(),
      );
      if (row) d.languages = { topLanguages: row.topLanguages ?? [], nonEnglishPct: row.nonEnglishPct };
    } catch (err) {
      console.error('[REPORT PDF] languages load failed:', (err as Error).message);
    }
  }

  return d;
}

/** One labeled fact cell used across sections. */
function fact(label: string, value: string, note?: string): string {
  return `<div class="cell"><div class="cl">${esc(label)}</div><div class="cv">${esc(value)}</div>${note ? `<div class="cn">${esc(note)}</div>` : ''}</div>`;
}

/** Small badge for school ratings / statuses. */
function tag(text: string, cls: string): string {
  return `<span class="tg ${cls}">${esc(text)}</span>`;
}

function schoolRows(list: CpsSchool[], max: number): string {
  return list.slice(0, max).map((s) => `
      <tr>
        <td>${esc(s.name)}${s.attendanceBoundary ? ' ' + tag('Boundary', 'tg-bd') : ''}</td>
        <td>${s.overallRating ? tag(s.overallRating, 'tg-lv') : '—'}</td>
        <td>${esc(s.gradesOffered || '—')}</td>
        <td>${s.distanceMiles != null ? s.distanceMiles.toFixed(2) + ' mi' : '—'}</td>
      </tr>`).join('');
}

export function buildReportPdfHtml(run: Run, d: GatheredData, ward: WardInfo, opts: { preparedFor?: string } = {}): string {
  const address = titleCaseAddress(run.address);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const mapboxKey = process.env.MAPBOX_PUBLIC_KEY;
  const mapUrl = mapboxKey && d.lat != null && d.lon != null
    ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2b3a9e(${d.lon},${d.lat})/${d.lon},${d.lat},14.6,0/660x330@2x?access_token=${mapboxKey}&attribution=false&logo=false`
    : null;

  // --- Cover ---
  const cover = `
  <section class="cover">
    <div class="cov-brand"><span class="cov-mark">KnowYourProp</span><span class="cov-tag">Chicago Property Intelligence</span></div>
    <div class="cov-hero">
      <div class="cov-kicker">PROPERTY REPORT</div>
      <h1 class="cov-addr">${esc(address)}</h1>
      <div class="cov-sub">${esc([d.communityArea, ward.ward ? `Ward ${ward.ward}` : null, d.zipCode ? `Chicago, IL ${d.zipCode}` : 'Chicago, IL'].filter(Boolean).join(' • '))}</div>
    </div>
    ${mapUrl ? `<img class="cov-map" src="${mapUrl}" alt="Location map">` : ''}
    <div class="cov-meta">
      <div><div class="cl">REPORT DATE</div><div class="cv sm">${esc(today)}</div></div>
      ${d.pin ? `<div><div class="cl">PARCEL (PIN)</div><div class="cv sm">${esc(fmtPin(d.pin))}</div></div>` : ''}
      ${opts.preparedFor ? `<div><div class="cl">PREPARED FOR</div><div class="cv sm">${esc(opts.preparedFor)}</div></div>` : ''}
    </div>
    <div class="cov-foot">Compiled from Chicago &amp; Cook County public records • knowyourprop.com</div>
  </section>`;

  // Sections are assembled as {title, html} so the TOC and numbering stay in sync.
  const sections: Array<{ title: string; html: (no: string) => string }> = [];

  // --- Executive summary: the one-page insight report, embedded at scale ---
  sections.push({
    title: 'Executive Summary — Our Take',
    html: (no) => d.insightHtml
      ? `
  <section class="page-break exec">
    <iframe class="insight-frame" sandbox="allow-same-origin" srcdoc="${esc(d.insightHtml)}" scrolling="no"></iframe>
  </section>`
      : `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Executive Summary</h2>
    <p class="unavail">No insight report has been generated for this property yet. Generate one from the web report to include it here.</p>
  </section>`,
  });

  // --- Property snapshot ---
  const t = d.tax;
  sections.push({ title: 'Property Snapshot', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Property Snapshot</h2>
    <div class="grid3">
      ${fact('Parcel (PIN)', d.pin ? fmtPin(d.pin) : 'Unavailable')}
      ${fact('Owner of record', t?.mailingOwnerName ?? 'Unavailable', t?.mailingOwnerName ? 'Per Cook County Treasurer mailing record' : undefined)}
      ${fact('Property class', t?.propertyClass ?? '—')}
      ${fact('Building sq ft', fmtNum(t?.buildingSquareFeet))}
      ${fact('Land sq ft', fmtNum(t?.landSquareFeet))}
      ${fact('Year built', t?.yearBuilt != null ? String(t.yearBuilt) : '—')}
      ${fact('Building type', t?.buildingType ?? '—')}
      ${fact('Stories', t?.stories != null ? String(t.stories) : '—')}
      ${fact('Use', t?.buildingUse ?? '—')}
    </div>
    <h3 class="sub-h">Property Taxes</h3>
    <div class="grid3">
      ${fact('Most recent bill', fmtMoney(t?.totalAnnualTaxAmount), t?.taxYearMostRecent ? `Tax year ${t.taxYearMostRecent}` : undefined)}
      ${fact('Payment status', t?.paymentStatus ? t.paymentStatus.charAt(0).toUpperCase() + t.paymentStatus.slice(1) : '—')}
      ${fact('Assessor record', t?.assessorUrl ? 'cookcountyassessor.com' : '—')}
    </div>
    ${t?.taxYears?.length ? `
    <table class="dt">
      <thead><tr><th>Tax year</th><th>Billed</th><th>Amount due</th></tr></thead>
      <tbody>
        ${t.taxYears.slice(0, 5).map((y: any) => `<tr><td>${esc(y.year)}</td><td>${fmtMoneyish(y.billed)}</td><td>${fmtMoneyish(y.amountDue)}</td></tr>`).join('')}
      </tbody>
    </table>` : ''}
    ${t?.coParcelPin ? `<p class="fn">Building characteristics from sibling parcel ${esc(fmtPin(t.coParcelPin))} (multi-lot property).</p>` : ''}
    ${d.landmark ? `<h3 class="sub-h">Landmark Status</h3><p class="body-p">${
      d.landmark.isOfficialLandmark ? `Official Chicago Landmark${d.landmark.officialLandmarkName ? `: ${esc(d.landmark.officialLandmarkName)}` : ''}.`
      : d.landmark.isLandmarkDistrict ? `Within the ${esc(d.landmark.landmarkDistrictName ?? 'a')} landmark district.`
      : 'No landmark designation detected for this property.'}</p>` : ''}
    ${d.pinDetail?.saleHistory?.length ? `
    <h3 class="sub-h">Sale History</h3>
    <table class="dt">
      <thead><tr><th>Date</th><th>Price</th><th>Buyer</th><th>Seller</th><th>Deed</th></tr></thead>
      <tbody>${d.pinDetail.saleHistory.slice(0, 6).map((s: any) => `<tr><td>${esc(s.saleDate?.slice(0, 10) ?? '—')}</td><td>${s.salePrice ? fmtMoney(s.salePrice) : '—'}</td><td>${esc(s.buyerName || '—')}</td><td>${esc(s.sellerName || '—')}</td><td>${esc(s.deedType || '—')}</td></tr>`).join('')}</tbody>
    </table>` : ''}
    ${d.pinDetail?.assessedValues?.length ? `
    <h3 class="sub-h">Assessed Values</h3>
    <table class="dt">
      <thead><tr><th>Year</th><th>Class</th><th>Land</th><th>Building</th><th>Total (certified)</th></tr></thead>
      <tbody>${d.pinDetail.assessedValues.slice(0, 5).map((a: any) => `<tr><td>${esc(a.year)}</td><td>${esc(a.propertyClass || '—')}</td><td>${fmtMoney(a.certifiedLand || a.mailedLand)}</td><td>${fmtMoney(a.certifiedBuilding || a.mailedBuilding)}</td><td>${fmtMoney(a.certifiedTotal || a.mailedTotal)}</td></tr>`).join('')}</tbody>
    </table>` : ''}
    ${d.pinDetail?.appealHistory?.length ? `
    <h3 class="sub-h">Assessment Appeals</h3>
    <table class="dt">
      <thead><tr><th>Tax year</th><th>Type</th><th>Assessor total</th><th>Board total</th><th>Result</th></tr></thead>
      <tbody>${d.pinDetail.appealHistory.slice(0, 5).map((a: any) => `<tr><td>${esc(a.taxYear)}</td><td>${esc(a.appealType || '—')}</td><td>${fmtMoney(a.assessorTotalValue)}</td><td>${fmtMoney(a.borTotalValue)}</td><td>${esc(a.result || '—')}</td></tr>`).join('')}</tbody>
    </table>` : ''}
  </section>` });

  // --- New construction ---
  const NC = d.construction;
  sections.push({ title: 'New Construction', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> New Construction</h2>
    ${NC ? `
      <div class="grid3">
        ${fact('Nearby qualifying permits', fmtNum(NC.subject.totalPermits), 'Within one mile · three-year source period')}
        ${fact('Likely still building', fmtNum(NC.activePermitCount), 'Issued within 18 months; proxy only')}
        ${fact('Median reported cost', fmtMoney(NC.subject.medianReportedCost))}
      </div>
      <p class="body-p">${esc(`By type: single family ${NC.subject.byCategory.singleFamily} • multifamily ${NC.subject.byCategory.multifamily} • commercial ${NC.subject.byCategory.commercial}`)}</p>
      <p class="body-p">${NC.trend.suppressed ? esc(`12-month trend not shown: only ${NC.trend.current12Months + NC.trend.prior12Months} permits across both comparison windows.`) : esc(`Trailing 12 months: ${NC.trend.current12Months}; prior 12 months: ${NC.trend.prior12Months} (${NC.trend.changePct! > 0 ? '+' : ''}${NC.trend.changePct}%).`)}</p>
      ${NC.permits.length ? `<table class="dt"><thead><tr><th>Address</th><th>Type</th><th>Issued</th><th>Distance</th><th>Units</th></tr></thead><tbody>${NC.permits.slice(0, 10).map((p) => `<tr><td>${esc(p.address)}</td><td>${esc(p.category)}</td><td>${esc(p.issueDate || '—')}</td><td>${p.distanceMiles.toFixed(2)} mi</td><td>${p.units ?? '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="unavail">No qualifying new-construction permits were found within one mile.</p>'}
      <p class="fn">Source: Chicago Building Permits. Accessory and temporary structures are excluded. “Likely still building” is not a verified construction-status claim.</p>
    ` : '<p class="unavail">New construction permit data unavailable.</p>'}
  </section>` });

  // --- Permits, violations & area development ---
  const P = d.permits, V = d.violations;
  sections.push({ title: 'Permits, Violations & Development Activity', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Permits, Violations &amp; Development Activity</h2>
    ${P && !P.apiError ? `
    <div class="grid3">
      ${fact('Building permits', fmtNum(P.totalPermits), P.mostRecent ? `Most recent: ${P.mostRecent.date?.slice(0, 10)} (${P.mostRecent.type})` : undefined)}
      ${fact('Total estimated cost', fmtMoney(P.totalEstimatedCost))}
      ${fact('Expired / incomplete', fmtNum(P.expiredOrIncomplete))}
    </div>
    <p class="body-p">By type: ${esc(`new construction ${P.byType?.newConstruction ?? 0} • renovation ${P.byType?.renovation ?? 0} • repair ${P.byType?.repair ?? 0} • demolition ${P.byType?.demolition ?? 0} • other ${P.byType?.other ?? 0}`)}</p>
    ${(() => {
      const rows = [...(P.permits ?? []), ...(P.olderPermits ?? [])].slice(0, 10);
      return rows.length ? `
    ${P.olderPermitsSummary ? `<p class="fn">Plus ${P.olderPermitsSummary.count} older permits (${P.olderPermitsSummary.earliestYear}–${P.olderPermitsSummary.latestYear}, ${fmtMoney(P.olderPermitsSummary.totalEstimatedCost)} estimated) included below.</p>` : ''}
    <table class="dt">
      <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Cost</th><th>Scope</th></tr></thead>
      <tbody>${rows.map((p: any) => `<tr><td>${esc((p.issueDate ?? p.date ?? '').slice(0, 10) || '—')}</td><td>${esc(String(p.permitType ?? p.type ?? '—').replace(/^PERMIT[ –-]+/i, ''))}</td><td>${esc(p.status || '—')}</td><td>${p.estimatedCost != null ? fmtMoney(p.estimatedCost) : '—'}</td><td class="wrap">${esc(String(p.workDescription ?? p.description ?? '—').slice(0, 110))}</td></tr>`).join('')}</tbody>
    </table>` : '';
    })()}` : '<p class="unavail">Permit history unavailable.</p>'}
    <h3 class="sub-h">Building Violations</h3>
    ${V && !V.apiError ? `
    <div class="grid3">
      ${fact('Open violations', fmtNum(V.openViolations))}
      ${fact('Last 5 years', fmtNum(V.totalViolationsLast5Years))}
      ${fact('Complied', fmtNum(V.statusBreakdown?.complied))}
    </div>` : '<p class="unavail">Violation history unavailable.</p>'}
    <h3 class="sub-h">Upcoming Developments — Ward ${esc(String(ward.ward ?? '—'))}</h3>
    ${d.developments?.length ? `
    <table class="dt">
      <thead><tr><th>Project</th><th>Address</th><th>Units</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${d.developments.slice(0, 8).map((dev) => `<tr><td class="wrap">${esc(dev.title.slice(0, 80))}</td><td>${esc(dev.address ?? '—')}</td><td>${dev.units ?? '—'}</td><td>${esc(dev.status)}</td><td>${esc(dev.publishDate?.slice(0, 10) ?? '—')}</td></tr>`).join('')}</tbody>
    </table>` : '<p class="unavail">No tracked upcoming developments in this ward.</p>'}
  </section>` });

  // --- Zoning & ward ---
  sections.push({ title: 'Zoning & Ward', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Zoning &amp; Ward</h2>
    <div class="z-hero">
      <div class="z-code">${esc(d.zoning ?? '—')}</div>
      <div class="z-name">
        <div class="z-title">${esc(d.zoningName ?? 'Zoning unavailable')}</div>
        ${d.zoningDescription ? `<div class="z-desc">${esc(d.zoningDescription)}</div>` : ''}
      </div>
    </div>
    <div class="grid3">
      ${fact('Ward', ward.ward ? `Ward ${ward.ward}` : '—')}
      ${fact('Alderman', ward.alderman ?? '—', ward.aldermanPhone ?? undefined)}
      ${fact('Community area', d.communityArea ?? '—')}
      ${fact('TIF district', d.tifName ?? 'Not in a TIF district')}
      ${fact('Opportunity Zone', d.opportunityZone ? 'Yes' : 'No')}
      ${fact('Census tract', d.tractGeoid ?? '—')}
    </div>
    <div class="grid3">
      ${d.tod ? fact('Transit-Oriented Development', d.tod.inTOD ? 'Qualifies' : 'Does not qualify', d.tod.inTOD ? `${d.tod.todType}${d.tod.nearestStation ? ` — ${d.tod.nearestStation}` : ''}${d.tod.distance != null ? ` (${d.tod.distance.toFixed(2)} mi)` : ''}` : d.tod.closestRailStation ? `Nearest rail: ${d.tod.closestRailStation.name} (${d.tod.closestRailStation.distance.toFixed(2)} mi)` : undefined) : fact('Transit-Oriented Development', 'Unavailable')}
      ${d.mmrp && typeof d.mmrp.inMmrpZone === 'boolean' ? fact('MMRP zone', d.mmrp.inMmrpZone ? `In zone${d.mmrp.zoneName ? ` — ${d.mmrp.zoneName}` : ''}` : 'Not in zone') : ''}
      ${d.nmtc ? fact('NMTC eligibility', d.nmtc.eligible ? 'Eligible tract' : 'Not eligible', d.nmtc.severeDistress ? 'Severe distress criteria met' : undefined) : ''}
    </div>
  </section>` });

  // --- Active listing (stored snapshot only — never a live paid fetch) ---
  const L = d.listing;
  if (L) {
    const checkRows = L.status === 'not_found' ? [] : buildListingChecks(L.claims, {
      annualTaxes: d.tax?.totalAnnualTaxAmount ?? null,
      lotSizeSf: d.tax?.landSquareFeet ?? null,
      assessorApartments: (() => {
        const n = Number(d.tax?.apartments);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      yearBuilt: d.tax?.yearBuilt ?? null,
      permitYears: (d.permits?.permits ?? []).map((p: any) => new Date(p.issueDate).getFullYear()).filter(Number.isFinite),
    });
    const pdfViolationDates = (d.violations?.violations ?? [])
      .map((violation: any) => new Date(violation.violationDate || violation.date || violation.openDate).getTime())
      .filter((time: number) => Number.isFinite(time));
    const pdfLatestFinding = pdfViolationDates.length ? Math.max(...pdfViolationDates) : null;
    const pdfArmLengthSale = pdfLatestFinding !== null
      && hasValidatedArmLengthSaleAfterFinding(d.pinDetail?.saleHistory, pdfLatestFinding);
    const pdfDisclosures = L.status === 'not_found' ? [] : classifyDisclosures(L.disclosures, {
      hasArmLengthSaleAfterFinding: pdfArmLengthSale,
      hasPermittedWorkAfterFinding: false,
    });
    sections.push({ title: 'Active Listing', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Active Listing</h2>
    <div class="grid3">
      ${fact('Status', L.statusLabel ?? L.status ?? '—')}
      ${fact('List price', L.listPrice != null ? fmtMoney(L.listPrice) : '—', L.daysOnMarket != null ? `${L.daysOnMarket} days on market` : undefined)}
      ${fact('Source', L.sourceName ?? '—', L.listedDate ? `Listed ${L.listedDate}` : undefined)}
      ${L.soldPrice != null && (L.status === 'off_market' || L.status === 'pending') ? fact('Sold price', fmtMoney(L.soldPrice), L.soldDate ?? undefined) : ''}
      ${L.unitCount != null ? fact('Units', String(L.unitCount)) : ''}
      ${L.grossAnnualIncome != null ? fact('Gross annual income', fmtMoney(L.grossAnnualIncome)) : ''}
      ${L.statedNoi != null ? fact('Stated NOI', fmtMoney(L.statedNoi)) : ''}
    </div>
    ${L.remarksSummary ? `<h3 class="sub-h">Listing Summary</h3><p class="body-p">${esc(L.remarksSummary)}</p>` : ''}
    ${checkRows.length ? `<h3 class="sub-h">Claims Checked Against the Record</h3><table class="dt"><thead><tr><th>Claim</th><th>Record</th><th>Result</th></tr></thead><tbody>${checkRows.map((check) => `<tr><td>${esc(check.claimLabel)}</td><td>${esc(check.recordLabel)}${check.note ? `<br><small>${esc(check.note)}</small>` : ''}</td><td>${esc(check.result)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${L.keyFacts?.length ? `<h3 class="sub-h">Key Facts</h3><ul class="bl">${L.keyFacts.slice(0, 10).map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul>${L.keyFacts.length > 10 ? `<p class="fn">+${L.keyFacts.length - 10} more listing highlights in the web report.</p>` : ''}` : ''}
    ${pdfDisclosures.length ? `<h3 class="sub-h">Seller Disclosures</h3><ul class="bl">${pdfDisclosures.map((item) => `<li><b>${esc(item.text)}</b> — ${esc(item.resolution?.because ?? item.consequence)}</li>`).join('')}</ul>` : ''}
    ${L.rentRoll?.length ? `
    <h3 class="sub-h">Rent Roll</h3>
    <table class="dt">
      <thead><tr><th>Unit</th><th>Beds</th><th>Baths</th><th>Monthly rent</th></tr></thead>
      <tbody>${L.rentRoll.map((u: any) => `<tr><td>${esc(u.unit)}</td><td>${esc(u.beds ?? '—')}</td><td>${esc(u.baths ?? '—')}</td><td>${u.monthlyRent != null ? fmtMoney(u.monthlyRent) : '—'}</td></tr>`).join('')}</tbody>
    </table>` : ''}
    <p class="fn"><b>Seller-side listing claims, not verified property facts.</b> Record checks compare only claims the listing made and do not replace inspection, title review, lease diligence, or a current tax bill. Snapshot checked ${esc(L.checkedAt ? new Date(L.checkedAt).toLocaleDateString('en-US') : '—')} • ${L.sourceUrl ? esc(L.sourceUrl) : 'source link on the web report'}</p>
  </section>` });
  }

  // --- Market & valuation ---
  const C = d.comps, A = d.airbnb;
  sections.push({ title: 'Market & Valuation', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Market &amp; Valuation</h2>
    ${C?.marketAnalysis ? `
    <div class="grid3">
      ${fact('Estimated value', C.marketAnalysis.estimatedValue ? fmtMoney(C.marketAnalysis.estimatedValue) : '—', `Based on ${C.marketAnalysis.basedOnComps} comps • ${C.marketAnalysis.confidence} confidence`)}
      ${fact('Median sale price', fmtMoney(C.marketAnalysis.medianSalePrice))}
      ${fact('Median $/sq ft', C.marketAnalysis.medianPricePerSqft ? '$' + Math.round(C.marketAnalysis.medianPricePerSqft) : '—')}
    </div>
    ${C.comparables?.length ? `
    <h3 class="sub-h">Recently Sold Comparables (${esc(String(C.searchParams.radiusMiles))} mi, last ${esc(String(C.searchParams.monthsBack))} months)</h3>
    <table class="dt">
      <thead><tr><th>Address</th><th>Sold</th><th>Price</th><th>Sq ft</th><th>$/sq ft</th><th>Dist</th></tr></thead>
      <tbody>${C.comparables.slice(0, 10).map((c) => `<tr><td>${esc(c.address)}</td><td>${esc(c.saleDate?.slice(0, 10) ?? '—')}</td><td>${fmtMoney(c.salePrice)}</td><td>${fmtNum(c.sqft)}</td><td>${c.pricePerSqft ? '$' + Math.round(c.pricePerSqft) : '—'}</td><td>${c.distanceMiles.toFixed(2)} mi</td></tr>`).join('')}</tbody>
    </table>` : ''}` : '<p class="unavail">Comparable sales unavailable (requires property class from tax records).</p>'}
    <h3 class="sub-h">Short-Term Rental Market${A ? ` — ${esc(A.neighbourhood)}` : ''}</h3>
    ${A ? `
    <div class="grid3">
      ${fact('Active listings', fmtNum(A.totalListings), `${fmtNum(A.hostCount)} hosts`)}
      ${A.entireHome ? fact('Entire home median rate', A.entireHome.medianListedPrice != null ? fmtMoney(A.entireHome.medianListedPrice) + '/night' : '—', A.entireHome.count != null ? `${A.entireHome.count} listings • ${A.entireHome.avgOccupancyPct != null ? A.entireHome.avgOccupancyPct + '% avg occupancy' : ''}` : undefined) : ''}
      ${fact('Peak months', A.peakMonths?.length ? A.peakMonths.join(', ') : '—')}
    </div>
    <p class="fn">Airbnb data as of ${esc(A.dataDate ?? '—')} (Inside Airbnb).</p>` : '<p class="unavail">Short-term rental data unavailable for this community area.</p>'}
  </section>` });

  // --- Financing & lending ---
  const H = d.hmda?.['2025']?.community ?? d.hmda?.['2024']?.community ?? null;
  const Ht = d.hmda?.['2025']?.tract ?? d.hmda?.['2024']?.tract ?? null;
  const Hy = d.hmda?.['2025']?.community || d.hmda?.['2025']?.tract ? '2025' : '2024';
  const S = d.sba;
  sections.push({ title: 'Financing & Lending', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Financing &amp; Lending</h2>
    <h3 class="sub-h">Local Mortgage Market (HMDA ${esc(Hy)})${d.communityArea ? ` — ${esc(d.communityArea)}` : ''}</h3>
    ${H ? `
    <div class="grid3">
      ${fact('Applications', fmtNum(H.total))}
      ${fact('Originated', (() => { const o = (H.byAction ?? []).find((a: any) => a.label === 'Originated'); return o ? `${fmtNum(o.count)} (${o.pct}%)` : '—'; })())}
      ${fact('Denied', (() => { const o = (H.byAction ?? []).find((a: any) => a.label === 'Denied'); return o ? `${fmtNum(o.count)} (${o.pct}%)` : '—'; })())}
    </div>
    ${H.byProductType?.length ? `<p class="body-p">Product mix: ${esc(H.byProductType.slice(0, 4).map((p: any) => `${p.label} ${p.pct}%`).join(' • '))}</p>` : ''}
    ${Ht ? `<p class="fn">Census tract level: ${fmtNum(Ht.total)} applications.</p>` : ''}` : '<p class="unavail">Mortgage lending data unavailable for this location.</p>'}
    <h3 class="sub-h">SBA Commercial Lending${d.zipCode ? ` — ZIP ${esc(d.zipCode)}` : ''}</h3>
    ${S?.summary ? `
    <div class="grid3">
      ${fact('SBA loans', fmtNum(S.summary.totalLoans), S.summary.yearRange?.min ? `${S.summary.yearRange.min}–${S.summary.yearRange.max}` : undefined)}
      ${fact('Total approved', fmtMoney(S.summary.totalAmount))}
      ${fact('7(a) / 504 split', `${fmtNum(S.summary.total7aLoans)} / ${fmtNum(S.summary.total504Loans)}`)}
    </div>
    ${(S.loans7a ?? []).concat(S.loans504 ?? []).length ? `
    <table class="dt">
      <thead><tr><th>Borrower</th><th>Amount</th><th>Approved</th><th>Lender</th><th>Industry</th></tr></thead>
      <tbody>${[...(S.loans7a ?? []), ...(S.loans504 ?? [])].sort((a: any, b: any) => (b.approvalDate || '').localeCompare(a.approvalDate || '')).slice(0, 8).map((l: any) => `<tr><td>${esc(l.borrowerName)}</td><td>${fmtMoney(l.amount)}</td><td>${esc(l.approvalDate?.slice(0, 10) ?? '—')}</td><td class="wrap">${esc(String(l.lender).slice(0, 40))}</td><td class="wrap">${esc(String(l.naicsDescription).slice(0, 45))}</td></tr>`).join('')}</tbody>
    </table>` : ''}` : '<p class="unavail">SBA lending data unavailable for this ZIP.</p>'}
  </section>` });

  // --- Crime & safety ---
  const cr = d.crime, cRank = d.crimeRank;
  sections.push({ title: 'Crime & Safety', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Crime &amp; Safety</h2>
    ${cr && !cr.apiError ? `
    <div class="grid3">
      ${fact('Reported crimes', fmtNum(cr.totalCrimes), `Within ¼ mile • ${cr.timeframe ?? 'last 12 months'}`)}
      ${cRank?.violent ? fact('Violent crime ranking', `Safer than ${cRank.violent.saferThanPercent}%`, `of community areas${cRank.perCapita ? ' per 1,000 residents' : ''} • ${cRank.violent.tier}`) : cRank ? fact('Area safety ranking', `Safer than ${cRank.saferThanPercent}%`, `of Chicago community areas • ${cRank.tier}`) : ''}
      ${cRank?.property ? fact('Property crime ranking', `Safer than ${cRank.property.saferThanPercent}%`, `of community areas${cRank.perCapita ? ' per 1,000 residents' : ''} • ${cRank.property.tier}`) : cRank ? fact('Area incident count', fmtNum(cRank.tractCount), `City median: ${fmtNum(cRank.cityMedianCount)}`) : ''}
    </div>
    ${cr.crimesByType && Object.keys(cr.crimesByType).length ? `<p class="body-p">Top categories: ${esc(Object.entries(cr.crimesByType as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' • '))}</p>` : ''}` : '<p class="unavail">Crime data unavailable for this location.</p>'}
  </section>` });

  // --- Neighborhood amenities ---
  const G = d.grocery;
  sections.push({ title: 'Neighborhood Amenities', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Neighborhood Amenities</h2>
    <h3 class="sub-h">Grocery Access${d.communityArea ? ` — ${esc(d.communityArea)}` : ''}</h3>
    ${G ? `
    <p class="body-p">${fmtNum(G.storeCount)} grocery stores serve this community area.${G.stores?.length ? ` Nearest: ${esc(G.stores.slice(0, 3).map((s: any) => `${s.name}${s.distance != null ? ` (${s.distance.toFixed(2)} mi)` : ''}`).join(' • '))}` : ''}</p>` : '<p class="unavail">Grocery access data unavailable.</p>'}
    <h3 class="sub-h">Nearby Businesses &amp; Services</h3>
    ${d.amenities ? `
    <table class="dt">
      <thead><tr><th>Category</th><th>Within radius</th><th>Within 1 mi</th><th>Closest examples</th></tr></thead>
      <tbody>${Object.entries(d.amenities).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${fmtNum(v.total)}</td><td>${fmtNum(v.within1)}</td><td class="wrap">${esc(v.names.join(', '))}</td></tr>`).join('')}</tbody>
    </table>
    <p class="fn">Restaurants, coffee, and bars counted within 1 mile; hotels, gas, and EV charging within 3 miles. Local licensed-business datasets.</p>` : '<p class="unavail">Nearby business data unavailable.</p>'}
    ${d.licenses?.licenses?.length ? `<p class="body-p">${fmtNum(d.licenses.totalCount)} new business${d.licenses.totalCount === 1 ? '' : 'es'} within 1 mile in the past 12 months, from ${fmtNum(d.licenses.licenseCount)} new issuance${d.licenses.licenseCount === 1 ? '' : 's'}.</p>` : ''}
    ${d.traffic?.latestCount ? `<p class="body-p">Street traffic: ${fmtNum(d.traffic.latestCount)} vehicles/day${d.traffic.roadName ? ` on ${esc(d.traffic.roadName)}` : ''}${d.traffic.percentile ? ` — busier than ${esc(String(d.traffic.percentile))}% of measured Chicago segments` : ''}${d.traffic.latestDate ? ` (counted ${esc(String(d.traffic.latestDate).slice(0, 10))})` : ''}.</p>` : ''}
  </section>` });

  // --- Location & transit ---
  const tr = d.transit;
  const transitTable = (rows: any[], label: string) => rows?.length ? `
    <h3 class="sub-h">${label}</h3>
    <table class="dt">
      <thead><tr><th>Stop / Station</th><th>Lines / Routes</th><th>Distance</th></tr></thead>
      <tbody>${rows.slice(0, 5).map((s: any) => `<tr><td>${esc(s.stopName)}</td><td>${esc((s.routes ?? []).join(', ') || '—')}</td><td>${s.distance != null ? s.distance.toFixed(2) + ' mi' : '—'}</td></tr>`).join('')}</tbody>
    </table>` : '';
  sections.push({ title: 'Location & Transit', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Location &amp; Transit</h2>
    ${tr ? `
    ${transitTable(tr.ctaRail, 'CTA Rail')}
    ${transitTable(tr.metra, 'Metra')}
    ${transitTable(tr.ctaBus, 'CTA Bus')}` : '<p class="unavail">Transit data unavailable for this location.</p>'}
    <h3 class="sub-h">Auto Dependency${d.communityArea ? ` — ${esc(d.communityArea)}` : ''}</h3>
    ${d.vehicle ? `<p class="body-p">${esc(String(d.vehicle.pctNoVehicle))}% of households have no vehicle (${fmtNum(d.vehicle.totalHouseholds)} households, avg ${esc(String(d.vehicle.avgVehiclesPerHousehold))} vehicles each) — ${esc(String(d.vehicle.autoDependencyLevel ?? '')).toLowerCase()} auto dependency.</p>` : '<p class="unavail">Vehicle ownership data unavailable.</p>'}
    ${d.demographics ? `
    <h3 class="sub-h">Neighborhood Trends — ${esc(d.demographics.communityArea)} (2010 → 2023)</h3>
    <table class="dt">
      <thead><tr><th>Metric</th><th>2010</th><th>2023</th><th>Change</th></tr></thead>
      <tbody>${d.demographics.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td>${esc(m.year2010)}</td><td>${esc(m.year2023)}</td><td class="${m.isPositive ? 'pos' : 'neg'}">${esc(m.change)}</td></tr>`).join('')}</tbody>
    </table>` : `
    <h3 class="sub-h">Neighborhood Trends</h3><p class="unavail">Demographic trend data unavailable for this location.</p>`}
    <h3 class="sub-h">Languages Spoken at Home</h3>
    ${d.languages?.topLanguages?.length
      ? `<p class="body-p">${esc(d.languages.topLanguages.slice(0, 5).map((l) => `${l.language} ${l.pct}%`).join(' • '))}${d.languages.nonEnglishPct != null ? ` — ${esc(String(d.languages.nonEnglishPct))}% speak a language other than English` : ''}</p>`
      : '<p class="unavail">Language data unavailable for this community area.</p>'}
    <h3 class="sub-h">Senior Population</h3>
    ${d.seniors ? `<p class="body-p">${esc(String(d.seniors.pct65Plus))}% of residents are 65+ (${fmtNum(d.seniors.population65Plus)} of ${fmtNum(d.seniors.totalPopulation)}); ${esc(String(d.seniors.pctSeniorsLivingAlone))}% of seniors live alone.</p>` : '<p class="unavail">Senior population data unavailable.</p>'}
    <h3 class="sub-h">Local Employment (Census LODES)</h3>
    ${d.lodes ? `<p class="body-p">${fmtNum(d.lodes.workersInTract)} people work in this census tract. Jobs by sector: healthcare ${fmtNum(d.lodes.healthcareJobs)} • food service ${fmtNum(d.lodes.foodServiceJobs)} • retail ${fmtNum(d.lodes.retailJobs)} • arts &amp; entertainment ${fmtNum(d.lodes.artsEntertainmentJobs)}. ${fmtNum(d.lodes.highEarners)} workers earn $40K+.</p>` : '<p class="unavail">Employment data unavailable for this tract.</p>'}
    <h3 class="sub-h">Political Profile</h3>
    ${d.elections ? (() => {
      const races: string[] = [];
      const e = d.elections;
      const pres = e.presidential ?? e.president ?? null;
      const mayor = e.mayoral ?? e.mayor ?? null;
      for (const [label, r] of [['Presidential', pres], ['Mayoral', mayor]] as const) {
        if (r && typeof r === 'object') {
          const yr = r.year ? ` ${r.year}` : '';
          const winner = r.winner ?? r.topCandidate ?? null;
          const pct = r.winnerPct ?? r.topPct ?? null;
          const turnout = r.turnout ?? r.turnoutPct ?? null;
          if (winner) races.push(`${label}${yr}: ${winner}${pct ? ` ${pct}%` : ''}${turnout ? ` (turnout ${turnout}%)` : ''}`);
        }
      }
      return races.length ? `<p class="body-p">${esc(races.join(' • '))}</p>` : '<p class="body-p">Election results for this community area are available on the web report.</p>';
    })() : '<p class="unavail">Election data unavailable.</p>'}
  </section>` });

  // --- Schools & childcare ---
  const sch = d.schools;
  const cc = d.childcare;
  // Childcare copy honors the server contract: childrenPerSlot === null with
  // status 'desert' means zero licensed slots; null with 'unknown' = no data.
  const ccLine = !cc ? null
    : cc.status === 'unknown' ? 'Childcare data unavailable for this community area.'
    : cc.childrenPerSlot === null
      ? `${cc.statusLabel} — no licensed childcare slots for ${fmtNum(cc.childrenUnder5)} children under 5.`
      : `${cc.statusLabel} — ${cc.childrenPerSlot} children under 5 per licensed slot (${fmtNum(cc.childrenUnder5)} children, ${fmtNum(cc.licensedSlots)} slots: ${fmtNum(cc.centerSlots)} center + ${fmtNum(cc.familyHomeSlots)} family home).`;
  sections.push({ title: 'Schools & Childcare', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Schools &amp; Childcare</h2>
    ${sch ? `
    <p class="body-p">${sch.total} CPS schools within ${sch.radiusMiles} miles.</p>
    ${sch.elementary.length ? `<h3 class="sub-h">Elementary</h3><table class="dt"><thead><tr><th>School</th><th>Rating</th><th>Grades</th><th>Distance</th></tr></thead><tbody>${schoolRows(sch.elementary, 8)}</tbody></table>` : ''}
    ${sch.middle.length ? `<h3 class="sub-h">Middle</h3><table class="dt"><thead><tr><th>School</th><th>Rating</th><th>Grades</th><th>Distance</th></tr></thead><tbody>${schoolRows(sch.middle, 6)}</tbody></table>` : ''}
    ${sch.high.length ? `<h3 class="sub-h">High School</h3><table class="dt"><thead><tr><th>School</th><th>Rating</th><th>Grades</th><th>Distance</th></tr></thead><tbody>${schoolRows(sch.high, 8)}</tbody></table>` : ''}
    <p class="fn">“Boundary” marks schools with an attendance boundary near this address — confirm assignment with CPS. Source: ${esc(sch.dataSource)}.</p>`
    : '<p class="unavail">School data unavailable for this location.</p>'}
    <h3 class="sub-h">Childcare Access${cc ? ` — ${esc(cc.communityArea)}` : ''}</h3>
    ${ccLine ? `<p class="body-p">${esc(ccLine)}</p>` : '<p class="unavail">Childcare data unavailable.</p>'}
  </section>` });

  // --- Incentives & grants (one availability hierarchy, matching the web report) ---
  const inc = d.incentives;
  if (inc) {
    const active = inc.filter((i) => i.status === 'in_area' || i.status === 'potentially_eligible');
    const manual = inc.filter((i) => i.status === 'manual_check' || i.status === 'data_pending');
    const notAvail = inc.filter((i) => i.status === 'not_in_area' || i.status === 'not_applicable');
    sections.push({ title: 'Incentives & Grants', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Incentives &amp; Grants</h2>
    <p class="body-p">${active.length} program${active.length === 1 ? '' : 's'} available or potentially available at this location; ${manual.length} need${manual.length === 1 ? 's' : ''} project details or a manual check.</p>
    ${active.length ? `<h3 class="sub-h">Available / Potentially Eligible</h3>${active.map((i) => `
    <div class="inc ${i.status === 'in_area' ? 'inc-yes' : 'inc-maybe'}">
      <div class="inc-h"><span class="inc-name">${esc(i.name)}</span>${tag(i.status === 'in_area' ? 'In area' : 'Potentially eligible', i.status === 'in_area' ? 'tg-lv' : 'tg-am')}</div>
      <div class="inc-b">${esc(i.statement)}</div>
      ${i.applicationDates ? `<div class="inc-n">Application window: ${esc(i.applicationDates)}</div>` : ''}
    </div>`).join('')}` : ''}
    ${manual.length ? `<h3 class="sub-h">Needs Project Details / Manual Check</h3>${manual.map((i) => `
    <div class="inc inc-manual">
      <div class="inc-h"><span class="inc-name">${esc(i.name)}</span></div>
      <div class="inc-b">${esc(i.statement)}</div>
    </div>`).join('')}` : ''}
    ${d.sbif?.sbif ? `<h3 class="sub-h">SBIF (Small Business Improvement Fund)</h3>
    <div class="inc ${d.sbif.sbif.authorized ? 'inc-yes' : 'inc-manual'}">
      <div class="inc-h"><span class="inc-name">${esc(d.sbif.sbif.statusLabel ?? (d.sbif.sbif.authorized ? 'Authorized in this TIF' : 'Not currently authorized'))}</span></div>
      ${d.sbif.sbif.notes ? `<div class="inc-b">${esc(d.sbif.sbif.notes)}</div>` : ''}
    </div>` : ''}
    ${notAvail.length ? `<h3 class="sub-h">Not Available / Not Applicable Here</h3><p class="fn">${esc(notAvail.map((i) => i.name).join(' • '))}</p>` : ''}
  </section>` });
  } else {
    sections.push({ title: 'Incentives & Grants', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Incentives &amp; Grants</h2>
    <p class="unavail">Incentive screening unavailable for this location.</p>
  </section>` });
  }

  // --- Market discovery ---
  const gcRows = (rows: GeneralContractorEntry[] | ArchitectEntry[] | null, max: number) => (rows ?? []).slice(0, max).map((c, i) => `
      <tr><td class="rk">${i + 1}</td><td>${esc(c.name)}</td><td>${fmtNum(c.totalProjects)}</td><td>${fmtMoney(c.totalValue)}</td><td>${c.lastPermitDate ? esc(c.lastPermitDate.slice(0, 10)) : '—'}</td></tr>`).join('');
  sections.push({ title: 'Market Discovery', html: (no) => `
  <section class="chap">
    <h2 class="sec-h"><span class="sec-no">${no}</span> Market Discovery</h2>
    <p class="body-p">Most active firms on Chicago building permits over the last 5 years. Full rankings and trade-specific searches are on the web report.</p>
    ${d.contractors?.length ? `<h3 class="sub-h">Top General Contractors</h3>
    <table class="dt"><thead><tr><th></th><th>Firm</th><th>Projects</th><th>Total value</th><th>Last permit</th></tr></thead><tbody>${gcRows(d.contractors, 10)}</tbody></table>` : '<p class="unavail">Contractor rankings unavailable.</p>'}
    ${d.architects?.length ? `<h3 class="sub-h">Top Architects</h3>
    <table class="dt"><thead><tr><th></th><th>Firm</th><th>Projects</th><th>Total value</th><th>Last permit</th></tr></thead><tbody>${gcRows(d.architects, 10)}</tbody></table>` : '<p class="unavail">Architect rankings unavailable.</p>'}
  </section>` });

  // --- Table of contents + numbered section bodies ---
  const toc = `
  <section class="page-break toc">
    <h2 class="sec-h"><span class="sec-no">Contents</span></h2>
    <ol class="toc-list">
      ${sections.map((s) => `<li><span>${esc(s.title)}</span></li>`).join('\n      ')}
    </ol>
  </section>`;
  const sectionHtml = sections.map((s, i) => s.html(String(i + 1).padStart(2, '0'))).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#141414;--ink2:#54544f;--muted:#8b8a84;--line:#e7e5df;--paper:#faf9f6;
    --navy:#232d6e;--indigo:#2b3a9e;--indigo-soft:#ecedf9;--gold:#e0a615;
    --green:#2f7d3f;--red:#d13b26;
    --sans:"Inter",-apple-system,sans-serif;--disp:"Instrument Serif",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);font-size:10.5px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page-break{page-break-before:always}
  section{page-break-inside:auto}

  /* Cover */
  .cover{display:flex;flex-direction:column;height:9.2in}
  .cov-brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--navy);padding-bottom:10px}
  .cov-mark{font-family:var(--disp);font-size:19px;color:var(--navy)}
  .cov-tag{font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;color:var(--muted)}
  .cov-hero{background:var(--navy);border-bottom:3px solid var(--gold);border-radius:10px;color:#fff;padding:34px 34px 30px;margin-top:34px}
  .cov-kicker{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.18em;color:#aab0d8;margin-bottom:10px}
  .cov-addr{font-family:var(--disp);font-weight:400;font-size:37px;line-height:1.05;margin-bottom:10px}
  .cov-sub{font-size:12px;color:#c9cde6}
  .cov-map{width:100%;height:330px;object-fit:cover;border:1px solid var(--line);border-radius:10px;margin-top:16px}
  .cov-meta{display:flex;gap:44px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}
  .cov-foot{margin-top:auto;font-size:9px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px}

  /* Section headers */
  .sec-h{font-family:var(--disp);font-weight:400;font-size:23px;color:var(--ink);border-bottom:2px solid var(--navy);padding-bottom:8px;margin-bottom:16px;display:flex;align-items:baseline;gap:12px}
  .sec-no{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--indigo);letter-spacing:.08em}
  .sub-h{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin:16px 0 8px}

  /* TOC */
  .toc-list{list-style:none;counter-reset:toc;margin-top:6px}
  .toc-list li{counter-increment:toc;display:flex;justify-content:space-between;align-items:baseline;padding:9px 2px;border-bottom:1px solid var(--line);font-size:12px}
  .toc-list li::before{content:counter(toc,decimal-leading-zero);font-family:var(--mono);font-size:10px;font-weight:700;color:var(--indigo);margin-right:12px}
  .toc-list li span:first-of-type{flex:1}
  .toc-pending{color:var(--muted)}
  .toc-note{font-size:9px;color:var(--muted);font-style:italic}
  .toc-caveat{margin-top:14px;font-size:9.5px;color:var(--muted);background:var(--indigo-soft);border-radius:7px;padding:9px 12px}

  /* Insight report embed: 816px-wide fixed page scaled to the 700px print column */
  /* Window is exactly one scaled insight page (1056 * 0.857) — older stored
     reports can run slightly long; anything past page 1 is clipped. */
  .exec{height:905px;overflow:hidden}
  .insight-frame{width:816px;height:1056px;border:0;transform:scale(0.857);transform-origin:top left}

  /* Fact grids */
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px}
  .cell{border:1px solid var(--line);border-radius:8px;background:var(--paper);padding:8px 11px;page-break-inside:avoid}
  .cl{font-family:var(--mono);font-size:7.5px;font-weight:700;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:3px}
  .cv{font-family:var(--disp);font-size:16px;line-height:1.15;color:var(--ink)}
  .cv.sm{font-size:13px}
  .cn{font-size:8.5px;color:var(--muted);margin-top:3px}

  /* Tables */
  .dt{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5px}
  .dt th{font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;border-bottom:1.5px solid var(--navy);padding:5px 8px}
  .dt td{border-bottom:1px solid var(--line);padding:5px 8px}
  .dt tr{page-break-inside:avoid}

  /* Zoning hero */
  .z-hero{display:flex;gap:16px;align-items:center;background:var(--indigo-soft);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin-bottom:12px;page-break-inside:avoid}
  .z-code{font-family:var(--disp);font-size:34px;color:var(--indigo);flex:none}
  .z-title{font-weight:600;font-size:12.5px}
  .z-desc{font-size:10px;color:var(--ink2);margin-top:3px}

  /* Tags */
  .tg{display:inline-block;font-family:var(--mono);font-size:7.5px;font-weight:700;letter-spacing:.04em;border-radius:5px;padding:1.5px 6px;vertical-align:1px;margin-left:5px}
  .tg-lv{background:#edf6ef;color:var(--green)}
  .tg-bd{background:var(--indigo-soft);color:var(--indigo)}
  .tg-am{background:#fdf6cf;color:#96600a}

  /* Incentive cards */
  .inc{border:1px solid var(--line);border-left-width:4px;border-radius:8px;padding:8px 12px;margin-bottom:7px;page-break-inside:avoid}
  .inc-yes{border-left-color:var(--green);background:#f3f9f4}
  .inc-maybe{border-left-color:#e6a70a;background:#fefaf0}
  .inc-manual{border-left-color:var(--line);background:var(--paper)}
  .inc-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  .inc-name{font-weight:600;font-size:10.5px}
  .inc-b{font-size:9.5px;color:var(--ink2);margin-top:3px;line-height:1.4}
  .inc-n{font-size:8.5px;color:var(--muted);margin-top:3px}

  .body-p{font-size:10.5px;color:var(--ink2);margin-bottom:6px}
  .bl{margin:2px 0 4px 16px;font-size:9.5px;color:var(--ink2)}
  .bl li{margin-bottom:2px}
  .pos{color:var(--green)} .neg{color:var(--red)}
  .rk{font-family:var(--mono);font-size:8.5px;color:var(--muted);width:18px}
  .wrap{word-break:break-word}
  .chap{margin-top:30px}
  .chap .sec-h{page-break-after:avoid}
  .sub-h{page-break-after:avoid}
  .fn{font-size:8.5px;color:var(--muted);margin-top:8px}
  .unavail{color:var(--muted);font-style:italic}
</style>
</head>
<body>
${cover}
${toc}
${sectionHtml}
</body>
</html>`;
}

// Only these hosts may be fetched while rendering (fonts + static map).
// Everything else — including anything a stored insight HTML might reference —
// is blocked, so the render browser can never reach internal services.
const ALLOWED_RENDER_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'api.mapbox.com']);

// At most one Chromium render at a time; extra requests queue here rather than
// launching parallel browsers. Simple promise-chain semaphore.
let renderQueue: Promise<unknown> = Promise.resolve();
const RENDER_TIMEOUT_MS = 90_000;

/** Render the full PDF for a run. Throws on hard failures (no browser, etc). */
export async function renderRunPdf(run: Run, ward: WardInfo, opts: { preparedFor?: string } = {}): Promise<Buffer> {
  const job = renderQueue.then(() => renderRunPdfNow(run, ward, opts));
  renderQueue = job.catch(() => {}); // keep the chain alive on failure
  return job;
}

async function renderRunPdfNow(run: Run, ward: WardInfo, opts: { preparedFor?: string } = {}): Promise<Buffer> {
  const data = await gatherData(run, ward);
  const html = buildReportPdfHtml(run, data, ward, opts);
  const address = titleCaseAddress(run.address);

  const browser = await chromium.launch({ headless: true, ...chromiumLaunchOverrides(chromium) });
  const killer = setTimeout(() => { browser.close().catch(() => {}); }, RENDER_TIMEOUT_MS);
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === 'data:' || url.protocol === 'about:' || ALLOWED_RENDER_HOSTS.has(url.hostname)) {
        return route.continue();
      }
      return route.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
    // Give web fonts a beat to settle before rasterizing
    await page.evaluate(() => (document as any).fonts?.ready);
    // Scale the embedded insight page to fit ONE pdf page exactly. Stored
    // insight HTML varies by template generation (some run taller than the
    // nominal 1056px), so wait for the srcdoc frame, then measure the real
    // content and fit it to the printable area (700.8 x ~945px inside margins).
    await page.waitForFunction(() => {
      const f = document.querySelector('.insight-frame') as HTMLIFrameElement | null;
      return !f || (f.contentDocument?.readyState === 'complete' && !!f.contentDocument.body);
    }, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => {
      const frame = document.querySelector('.insight-frame') as HTMLIFrameElement | null;
      const wrap = document.querySelector('.exec') as HTMLElement | null;
      if (!frame || !wrap) return;
      const doc = frame.contentDocument;
      const inner = (doc?.querySelector('.page') as HTMLElement | null) ?? doc?.body ?? null;
      const contentH = Math.max(inner?.scrollHeight ?? 0, 1056);
      const scale = Math.min(700 / 816, 930 / contentH);
      frame.style.height = contentH + 'px';
      frame.style.transform = `scale(${scale})`;
      wrap.style.height = Math.ceil(contentH * scale) + 'px';
    });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '0.55in', bottom: '0.6in', left: '0.6in', right: '0.6in' },
      headerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#8b8a84;padding:0 0.6in;display:flex;justify-content:space-between;"><span>${esc(address)}</span><span>Property Report</span></div>`,
      footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#8b8a84;padding:0 0.6in;display:flex;justify-content:space-between;"><span>Generated by KnowYourProp • knowyourprop.com</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    return pdf;
  } finally {
    clearTimeout(killer);
    await browser.close().catch(() => {});
  }
}
