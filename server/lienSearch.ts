import { db } from './db';
import { lienCache } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { LienDocument, LienResult } from '@shared/schema';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const CACHE_DURATION_DAYS = 30;

const workspaceBrowsersPath = path.join(process.cwd(), 'playwright-browsers');
const playwrightEnv = existsSync(workspaceBrowsersPath)
  ? { PLAYWRIGHT_BROWSERS_PATH: workspaceBrowsersPath }
  : {};

function normalizePin(pin: string): string {
  return pin.replace(/[^0-9]/g, '');
}

function formatPin(pin: string): string {
  const p = normalizePin(pin);
  if (p.length === 14) {
    return `${p.slice(0,2)}-${p.slice(2,4)}-${p.slice(4,7)}-${p.slice(7,10)}-${p.slice(10)}`;
  }
  return pin;
}

function buildRecorderUrl(pin: string): string {
  const normalized = normalizePin(pin);
  return `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${normalized}`;
}

function isCacheStale(cachedData: any): boolean {
  if (!cachedData?.scrapedAt) return true;
  const scraped = new Date(cachedData.scrapedAt);
  const staleAfter = new Date(Date.now() - CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return scraped < staleAfter;
}

function parseRecordedDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [month, day, year] = parts;
  return new Date(year, month - 1, day);
}

const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;

// Extract current owner name from recorder docs (grantee of most recent deed).
// Returns uppercased name string or null.
function extractOwnerFromDocs(documents: LienDocument[]): string | null {
  const deeds = documents
    .filter(d => d.category === 'deed' && d.grantee && d.grantee.trim().length > 1)
    .sort((a, b) => {
      const da = parseRecordedDate(a.recordedDate);
      const db2 = parseRecordedDate(b.recordedDate);
      if (!da && !db2) return 0;
      if (!da) return 1;
      if (!db2) return -1;
      return db2.getTime() - da.getTime();
    });
  if (deeds.length === 0) return null;
  const name = deeds[0].grantee.trim().toUpperCase();
  return name.length > 1 ? name : null;
}

function deriveResult(pin: string, documents: LienDocument[], scrapedAt: string | null, isStale: boolean, legalDescriptionPins: Array<{ pin: string; address: string }> = []): LienResult {
  const normalizedPin = normalizePin(pin);
  const recorderUrl = buildRecorderUrl(normalizedPin);
  const now = Date.now();

  // Belt-and-suspenders dedup: catches any duplicates already stored in the cache
  // so existing cached data is cleaned up on the next read without a forced re-scrape.
  const seenNums = new Set<string>();
  documents = documents.filter(d => {
    if (!d.documentNumber) return true;
    if (seenNums.has(d.documentNumber)) return false;
    seenNums.add(d.documentNumber);
    return true;
  });

  const mortgages = documents.filter(d => d.category === 'mortgage');
  const liens = documents.filter(d => d.category === 'lien');
  const releases = documents.filter(d => d.category === 'release');
  const deeds = documents.filter(d => d.category === 'deed');
  const foreclosures = documents.filter(d => d.category === 'foreclosure');
  const litigation = documents.filter(d => d.category === 'litigation');
  const other = documents.filter(d => d.category === 'other');

  // Fuzzy lender name match — handles abbreviations like "HUNTINGTON NATL BK" vs "HUNTINGTON NATIONAL BANK"
  function lenderNamesMatch(a: string, b: string): boolean {
    if (!a || !b) return true; // if either is missing, don't block the release
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
    const na = norm(a), nb = norm(b);
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    // Check significant word overlap (words > 3 chars)
    const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 3));
    for (const w of wordsA) if (wordsB.has(w)) return true;
    return false;
  }

  // Build set of released document numbers by reading each RELEASE's "Prior Documents" field.
  // This is populated by the scraper navigating to each release's detail page.
  // Secondary check: when a release claims to release a mortgage, verify the release's grantor
  // (the bank granting/executing the release) matches the mortgage's grantee (the lending bank).
  // This prevents a release from Lender A from incorrectly clearing Lender B's mortgage.
  const mortgageByDocNumber = new Map<string, LienDocument>(
    mortgages.filter(m => m.documentNumber).map(m => [m.documentNumber, m])
  );
  const releasedDocNumbers = new Set<string>();
  for (const release of releases) {
    if (!release.releasesDocNumbers || release.releasesDocNumbers.length === 0) continue;
    const releaseGrantor = release.grantor?.toUpperCase().trim() || '';
    for (const docNum of release.releasesDocNumbers) {
      const targetMortgage = mortgageByDocNumber.get(docNum);
      if (targetMortgage) {
        const mortgageGrantee = targetMortgage.grantee?.toUpperCase().trim() || '';
        if (lenderNamesMatch(releaseGrantor, mortgageGrantee)) {
          releasedDocNumbers.add(docNum);
        } else {
          console.log(`[lienSearch] Release ${release.documentNumber} skipped for mortgage ${docNum}: lender mismatch ("${releaseGrantor}" vs "${mortgageGrantee}")`);
        }
      } else {
        // Not a mortgage (lien, other) — add without name check
        releasedDocNumbers.add(docNum);
      }
    }
  }

  // Fallback: if a RELEASE has no Prior Documents scraped (page couldn't be parsed),
  // try matching it to a mortgage by lender name.
  // Logic: release.grantor (the bank executing the release) should match mortgage.grantee
  // (the bank that issued the loan), and the release must be recorded after the mortgage.
  // Only match if exactly one candidate mortgage is found — ambiguous cases are skipped.
  for (const release of releases) {
    if (release.releasesDocNumbers && release.releasesDocNumbers.length > 0) continue; // already handled via Prior Docs
    const releaseGrantor = release.grantor?.toUpperCase().trim() || '';
    if (!releaseGrantor) continue; // can't match without grantor name
    const releaseDate = parseRecordedDate(release.recordedDate);
    const candidates = mortgages.filter(m => {
      if (!m.documentNumber || releasedDocNumbers.has(m.documentNumber)) return false;
      const mortgageDate = parseRecordedDate(m.recordedDate);
      // Release must be recorded after the mortgage
      if (releaseDate && mortgageDate && mortgageDate >= releaseDate) return false;
      const mortgageLender = (m.grantee || '').toUpperCase().trim();
      return lenderNamesMatch(releaseGrantor, mortgageLender);
    });
    if (candidates.length === 1) {
      releasedDocNumbers.add(candidates[0].documentNumber!);
      console.log(`[lienSearch] Release ${release.documentNumber} matched mortgage ${candidates[0].documentNumber} by lender name ("${releaseGrantor}") — no Prior Documents found on release page`);
    } else if (candidates.length > 1) {
      console.log(`[lienSearch] Release ${release.documentNumber} grantor "${releaseGrantor}" matched ${candidates.length} mortgages — skipping ambiguous name match`);
    }
  }

  // Heuristic: if a lien/judgment has NO explicit release but subsequent mortgages were
  // recorded AFTER it AND those mortgages were later released, assume the lien was
  // resolved — lenders do title searches and would not lend on encumbered title.
  for (const lien of liens) {
    if (!lien.documentNumber || releasedDocNumbers.has(lien.documentNumber)) continue;
    const lienDate = parseRecordedDate(lien.recordedDate);
    if (!lienDate) continue;
    const hasSubsequentReleasedMortgage = mortgages.some(m => {
      if (!m.documentNumber || !releasedDocNumbers.has(m.documentNumber)) return false;
      const mortgageDate = parseRecordedDate(m.recordedDate);
      return mortgageDate !== null && mortgageDate > lienDate;
    });
    if (hasSubsequentReleasedMortgage) {
      releasedDocNumbers.add(lien.documentNumber);
      console.log(`[lienSearch] Lien ${lien.documentNumber} (${lien.recordedDate}) treated as resolved — subsequent released mortgages imply title was cleared`);
    }
  }

  // Same heuristic for lis pendens (litigation category): if a mortgage was recorded AND
  // later released AFTER the lis pendens filing, the lender cleared title → lis pendens resolved.
  for (const lit of litigation) {
    if (!lit.documentNumber || releasedDocNumbers.has(lit.documentNumber)) continue;
    const litDate = parseRecordedDate(lit.recordedDate);
    if (!litDate) continue;
    const hasSubsequentReleasedMortgage = mortgages.some(m => {
      if (!m.documentNumber || !releasedDocNumbers.has(m.documentNumber)) return false;
      const mortgageDate = parseRecordedDate(m.recordedDate);
      return mortgageDate !== null && mortgageDate > litDate;
    });
    if (hasSubsequentReleasedMortgage) {
      releasedDocNumbers.add(lit.documentNumber);
      console.log(`[lienSearch] Lis pendens ${lit.documentNumber} (${lit.recordedDate}) treated as resolved — subsequent released mortgages imply title was cleared`);
    }
  }

  // 2-year staleness heuristic: a lien with no explicit release that is >2 years old
  // is statistically unlikely to still be enforceable — if it were active the lienholder
  // would have typically pursued collection. Mark it as "probably cleared" so it doesn't
  // count as an active lien, but still surface it in the doc table with a distinct badge.
  const twoYearsAgo = Date.now() - TWO_YEARS_MS;
  const probablyClearedDocNumbers = new Set<string>();
  for (const lien of liens) {
    if (!lien.documentNumber) continue;
    if (releasedDocNumbers.has(lien.documentNumber)) continue; // already confirmed released
    const lienDate = parseRecordedDate(lien.recordedDate);
    if (lienDate && lienDate.getTime() < twoYearsAgo) {
      probablyClearedDocNumbers.add(lien.documentNumber);
      console.log(`[lienSearch] Lien ${lien.documentNumber} (${lien.recordedDate}) marked probably cleared — over 2 years old with no release on record`);
    }
  }

  // Mark each lien/mortgage as released if a release explicitly references its document number.
  // Falls back to active (isReleased = false) when prior-doc data couldn't be scraped.
  const liensWithStatus = liens.map(l => ({
    ...l,
    isReleased: l.documentNumber ? releasedDocNumbers.has(l.documentNumber) : false,
    isProbablyCleared: l.documentNumber ? probablyClearedDocNumbers.has(l.documentNumber) : false,
  }));

  // Staleness heuristic for mortgages: mark unreleased mortgages as "probably cleared" when
  // there is strong evidence of refinancing or a property sale. Three complementary rules:
  //
  // Rule 1 (grantor change): if a SUBSEQUENT mortgage has a DIFFERENT grantor (borrower),
  // the property was sold between the two recordings. A closing always pays off the seller's
  // mortgages — so any mortgage whose grantor doesn't match a later mortgage's grantor is
  // definitively cleared. This is the strongest signal and takes priority.
  //
  // Rule 2 (gap-to-next): if any subsequent mortgage was recorded 3+ years after this one
  // and the grantor didn't change, the earlier loan was almost certainly refinanced away.
  // Lenders always require clear title before funding, so a later loan implies payoff.
  // 3-year threshold: covers typical refinance cycles without clearing genuine 2nd mortgages.
  //
  // Rule 3 (gap-to-newest): if recorded 10+ years before the newest mortgage, apply the
  // more aggressive legacy heuristic for very old loans.

  // Normalize grantor/borrower names for comparison — handles punctuation and word-order swaps.
  function normalizeGrantor(s: string): string {
    return s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  }
  function grantorsDiffer(a: string, b: string): boolean {
    const na = normalizeGrantor(a), nb = normalizeGrantor(b);
    if (!na || !nb) return false; // can't determine without both names
    if (na === nb) return false;
    // Same words in different order (e.g. "JOHN SMITH" vs "SMITH JOHN") → same person
    const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    if (wordsA.size > 0 && overlap >= Math.min(wordsA.size, wordsB.size)) return false;
    return true;
  }

  const THREE_YEARS_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;
  const probablyClearedMortgageDocNumbers = new Set<string>();
  if (mortgages.length > 1) {
    const sortedByDate = [...mortgages].sort((a, b) => {
      const da = parseRecordedDate(a.recordedDate), db = parseRecordedDate(b.recordedDate);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return da.getTime() - db.getTime();
    });
    const newestDate = parseRecordedDate(sortedByDate[sortedByDate.length - 1].recordedDate);
    for (const m of sortedByDate.slice(0, -1)) {
      if (!m.documentNumber || releasedDocNumbers.has(m.documentNumber)) continue;
      const mDate = parseRecordedDate(m.recordedDate);
      if (!mDate) continue;

      // Rule 1: grantor (borrower) changed on a later mortgage → property was sold
      const laterWithDifferentGrantor = m.grantor
        ? sortedByDate.some(later => {
            if (later === m) return false;
            const laterDate = parseRecordedDate(later.recordedDate);
            if (!laterDate || laterDate.getTime() <= mDate.getTime()) return false;
            return later.grantor ? grantorsDiffer(m.grantor!, later.grantor) : false;
          })
        : false;
      if (laterWithDifferentGrantor) {
        probablyClearedMortgageDocNumbers.add(m.documentNumber);
        console.log(`[lienSearch] Mortgage ${m.documentNumber} (${m.recordedDate}) marked probably cleared — grantor changed on subsequent mortgage (property sold)`);
        continue;
      }

      // Rule 3: 10-year gap to newest
      if (newestDate) {
        const tenYearsLater = new Date(mDate.getFullYear() + 10, mDate.getMonth(), mDate.getDate());
        if (tenYearsLater < newestDate) {
          probablyClearedMortgageDocNumbers.add(m.documentNumber);
          console.log(`[lienSearch] Mortgage ${m.documentNumber} (${m.recordedDate}) marked probably cleared — 10+ years before newest mortgage`);
          continue;
        }
      }

      // Rule 2: any subsequent mortgage recorded 3+ years later (same or unknown grantor)
      const hasLaterRefinance = sortedByDate.some(later => {
        if (later === m) return false;
        const laterDate = parseRecordedDate(later.recordedDate);
        if (!laterDate || laterDate.getTime() <= mDate.getTime()) return false;
        return laterDate.getTime() - mDate.getTime() >= THREE_YEARS_MS;
      });
      if (hasLaterRefinance) {
        probablyClearedMortgageDocNumbers.add(m.documentNumber);
        console.log(`[lienSearch] Mortgage ${m.documentNumber} (${m.recordedDate}) marked probably cleared — subsequent mortgage recorded 3+ years later, likely refinanced`);
      }
    }
  }

  const mortgagesWithStatus = mortgages.map(m => ({
    ...m,
    isReleased: m.documentNumber ? releasedDocNumbers.has(m.documentNumber) : false,
    isProbablyCleared: m.documentNumber ? probablyClearedMortgageDocNumbers.has(m.documentNumber) : false,
  }));

  const litigationWithStatus = litigation.map(l => ({
    ...l,
    isReleased: l.documentNumber ? releasedDocNumbers.has(l.documentNumber) : false,
  }));

  // Foreclosure filings can be dismissed/released too — carry the release flag
  // so the client-side distress resolver sees explicit dismissals.
  const foreclosuresWithStatus = foreclosures.map(f => ({
    ...f,
    isReleased: f.documentNumber ? releasedDocNumbers.has(f.documentNumber) : false,
  }));

  // Detect water department liens: grantor contains WATER or is a city utility dept.
  const WATER_DEPT_KEYWORDS = ['WATER', 'DEPT OF WATER', 'WATER MANAGEMENT', 'WATER RECLAMATION'];
  function isWaterDeptLien(doc: LienDocument): boolean {
    if (!doc.grantor) return false;
    const g = doc.grantor.toUpperCase();
    return WATER_DEPT_KEYWORDS.some(kw => g.includes(kw));
  }

  // Mark in overall documents array too (for the document table in the UI)
  const documentsWithStatus = documents.map(d => {
    const isReleased = (d.category === 'lien' || d.category === 'mortgage' || d.category === 'litigation' || d.category === 'foreclosure')
      && !!d.documentNumber && releasedDocNumbers.has(d.documentNumber);
    const isProbablyCleared = d.category === 'lien' && !!d.documentNumber && probablyClearedDocNumbers.has(d.documentNumber);
    const waterDept = d.category === 'lien' && isWaterDeptLien(d);
    if (isReleased || isProbablyCleared || waterDept) {
      return { ...d, isReleased: isReleased || d.isReleased, isProbablyCleared, isWaterDept: waterDept };
    }
    return d;
  });

  // Active lien count excludes both explicitly released AND probably-cleared (2+ yr old) liens
  const activeLienCount = liensWithStatus.filter(l => !l.isReleased && !l.isProbablyCleared).length;
  const activeMortgageCount = mortgagesWithStatus.filter(m => !m.isReleased && !m.isProbablyCleared).length;
  const activeListPendensCount = litigationWithStatus.filter(l => !l.isReleased).length;
  const waterDeptLienCount = liensWithStatus.filter(l => !l.isReleased && !l.isProbablyCleared && isWaterDeptLien(l)).length;

  // Smart foreclosure status — checks:
  // 1. Was a deed recorded AFTER the most recent LIS PENDENS? → resolved (title transferred)
  // 2. Is the most recent LIS PENDENS 2+ years old with no subsequent activity? → stale/clear
  // 3. Otherwise → active foreclosure
  let hasForeclosure = false;
  if (foreclosures.length > 0) {
    const foreclosureDates = foreclosures
      .map(d => ({ doc: d, date: parseRecordedDate(d.recordedDate) }))
      .filter(x => x.date !== null) as { doc: LienDocument; date: Date }[];

    const mostRecentForeclosure = foreclosureDates.reduce(
      (best, x) => (!best || x.date > best.date ? x : best),
      null as { doc: LienDocument; date: Date } | null
    );

    if (mostRecentForeclosure) {
      const foreclosureTime = mostRecentForeclosure.date.getTime();

      // Check if any deed was recorded strictly after the most recent foreclosure filing
      const deedAfterForeclosure = deeds.some(d => {
        const date = parseRecordedDate(d.recordedDate);
        return date !== null && date.getTime() > foreclosureTime;
      });

      if (deedAfterForeclosure) {
        // Title transferred after foreclosure → resolved
        hasForeclosure = false;
      } else if (now - foreclosureTime >= TWO_YEARS_MS) {
        // Foreclosure is 2+ years old with no deed recorded after → stale, treat as clear
        hasForeclosure = false;
      } else {
        // Recent foreclosure with no subsequent deed → active
        hasForeclosure = true;
      }
    }
    // If none of the foreclosure docs had parseable dates, fall back to hasForeclosure = false (unknown)
  }

  let overallStatus: LienResult['overallStatus'] = 'unknown';
  if (documents.length === 0 && !isStale) {
    overallStatus = 'clear';
  } else if (hasForeclosure) {
    overallStatus = 'has_foreclosure';
  } else if (activeLienCount > 0) {
    overallStatus = 'has_liens';
  } else if (!isStale) {
    overallStatus = 'clear';
  }

  return {
    pin: normalizedPin,
    isStale,
    scrapedAt,
    fetchedAt: new Date().toISOString(),
    recorderUrl,
    documents: documentsWithStatus,
    mortgages: mortgagesWithStatus,
    liens: liensWithStatus,
    releases,
    deeds,
    foreclosures: foreclosuresWithStatus,
    litigation: litigationWithStatus,
    other,
    activeLienCount,
    activeMortgageCount,
    activeListPendensCount,
    waterDeptLienCount,
    hasForeclosure,
    overallStatus,
    // Owner liens populated separately
    ownerName: null,
    ownerLiens: [],
    ownerLienScrapedAt: null,
    ownerLienIsStale: false,
    legalDescriptionPins,
    deedGrantor: null,
    deedGrantee: null,
  };
}

async function runScraper(pin: string): Promise<{ documents: LienDocument[]; scrapedAt: string; ownerName: string | null; legalDescriptionPins: Array<{ pin: string; address: string }>; deedGrantor: string | null; deedGrantee: string | null } | null> {
  return new Promise((resolve) => {
    const scraperPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'recorder-scraper.mjs');
    const normalizedPin = normalizePin(pin);

    console.log(`[lienSearch] Spawning recorder scraper for PIN ${normalizedPin}`);
    const child = spawn('node', [scraperPath, normalizedPin], {
      env: { ...process.env, ...playwrightEnv },
      timeout: 120000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      process.stderr.write(`[recorder-scraper] ${d.toString()}`);
    });

    child.on('close', (code: number) => {
      console.log(`[lienSearch] Scraper exited code ${code}, stdout length: ${stdout.length}`);
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.error(`[lienSearch] Scraper error: ${result.error}`);
          resolve(null);
          return;
        }
        const documents: LienDocument[] = (result.documents || []).map((d: any) => ({
          documentNumber: d.documentNumber || '',
          documentType: d.documentType || '',
          recordedDate: d.recordedDate || '',
          grantor: d.grantor || '',
          grantee: d.grantee || '',
          amount: typeof d.amount === 'number' ? d.amount : 0,
          category: d.category || 'other',
          // Preserve release-to-prior-document links scraped from detail pages
          ...(Array.isArray(d.releasesDocNumbers) && d.releasesDocNumbers.length > 0
            ? { releasesDocNumbers: d.releasesDocNumbers }
            : {}),
          // Preserve direct link to Cook County Recorder document detail page
          ...(d.viewLink ? { viewLink: d.viewLink } : {}),
          // Preserve maturity date scraped from mortgage document text
          ...(d.maturityDate ? { maturityDate: d.maturityDate } : {}),
        }));
        // ownerName from recorder advanced search (primary); may be null if unavailable
        // Reject the Recorder's disclaimer text which appears when names are hidden
        const rawOwnerName = typeof result.ownerName === 'string' ? result.ownerName.trim().toUpperCase() : null;
        const isDisclaimer = rawOwnerName && /^NAME,|PROPERTY INDEX NUMBER|ADDRESS IS ONLY FOR INFORMATIONAL/i.test(rawOwnerName);
        const ownerName = rawOwnerName && rawOwnerName.length > 1 && !isDisclaimer ? rawOwnerName : null;
        if (ownerName) console.log(`[lienSearch] Owner name from recorder advanced search: "${ownerName}"`);
        else if (isDisclaimer) console.log(`[lienSearch] Rejected disclaimer text as owner name`);
        const legalDescriptionPins: Array<{ pin: string; address: string }> = Array.isArray(result.legalDescriptionPins) ? result.legalDescriptionPins : [];
        if (legalDescriptionPins.length > 0) console.log(`[lienSearch] Legal description PINs for ${normalizedPin}: ${legalDescriptionPins.map(p => p.pin).join(', ')}`);
        const deedGrantor = typeof result.deedGrantor === 'string' && result.deedGrantor.trim() ? result.deedGrantor.trim().toUpperCase() : null;
        const deedGrantee = typeof result.deedGrantee === 'string' && result.deedGrantee.trim() ? result.deedGrantee.trim().toUpperCase() : null;
        if (deedGrantor) console.log(`[lienSearch] Deed grantor (seller): "${deedGrantor}"`);
        if (deedGrantee) console.log(`[lienSearch] Deed grantee (buyer): "${deedGrantee}"`);
        // Deduplicate by documentNumber — the Recorder's HTML can return the same row twice
        // (e.g. when the same instrument covers multiple parties listed on one page).
        // We keep the first occurrence and drop subsequent identical document numbers.
        const seenDocNums = new Set<string>();
        const uniqueDocuments = documents.filter(d => {
          if (!d.documentNumber) return true;
          if (seenDocNums.has(d.documentNumber)) return false;
          seenDocNums.add(d.documentNumber);
          return true;
        });
        if (uniqueDocuments.length < documents.length) {
          console.log(`[lienSearch] Deduped ${documents.length - uniqueDocuments.length} duplicate doc(s) for ${normalizedPin}`);
        }
        resolve({ documents: uniqueDocuments, scrapedAt: result.scrapedAt || new Date().toISOString(), ownerName, legalDescriptionPins, deedGrantor, deedGrantee });
      } catch (e) {
        console.error(`[lienSearch] Failed to parse scraper output: ${e}`);
        resolve(null);
      }
    });

    child.on('error', (err: Error) => {
      console.error(`[lienSearch] Scraper spawn error: ${err.message}`);
      resolve(null);
    });
  });
}

async function runOwnerLienScraper(ownerName: string): Promise<{ ownerLiens: LienDocument[]; scrapedAt: string } | null> {
  return new Promise((resolve) => {
    const scraperPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'recorder-name-scraper.mjs');
    console.log(`[lienSearch] Spawning owner lien scraper for: ${ownerName}`);
    const child = spawn('node', [scraperPath, ownerName], {
      env: { ...process.env, ...playwrightEnv },
      timeout: 120000,
    });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { process.stderr.write(`[name-scraper] ${d.toString()}`); });
    child.on('close', (code: number) => {
      console.log(`[lienSearch] Name scraper exited code ${code}, stdout length: ${stdout.length}`);
      try {
        const result = JSON.parse(stdout);
        if (result.error) { console.error(`[lienSearch] Name scraper error: ${result.error}`); resolve(null); return; }
        const ownerLiens: LienDocument[] = (result.ownerLiens || []).map((d: any) => ({
          documentNumber: d.documentNumber || '',
          documentType: d.documentType || '',
          recordedDate: d.recordedDate || '',
          grantor: d.grantor || '',
          grantee: d.grantee || '',
          amount: typeof d.amount === 'number' ? d.amount : 0,
          category: d.category || 'other_lien',
          ...(d.viewLink ? { viewLink: d.viewLink } : {}),
        }));
        resolve({ ownerLiens, scrapedAt: result.scrapedAt || new Date().toISOString() });
      } catch (e) {
        console.error(`[lienSearch] Failed to parse name scraper output: ${e}`);
        resolve(null);
      }
    });
    child.on('error', (err: Error) => { console.error(`[lienSearch] Name scraper spawn error: ${err.message}`); resolve(null); });
  });
}

async function updateLienCache(
  pin: string,
  documents: LienDocument[],
  scrapedAt: string,
  ownerUpdate?: { ownerName: string; ownerLiens: LienDocument[]; ownerLienScrapedAt: string },
  legalDescriptionPins?: Array<{ pin: string; address: string }>,
  deedParties?: { deedGrantor: string | null; deedGrantee: string | null }
): Promise<void> {
  const normalizedPin = normalizePin(pin);
  const now = new Date();
  const existing = await db.select().from(lienCache).where(eq(lienCache.pin, normalizedPin)).limit(1);

  const baseFields: any = {
    documentsJson: documents as any,
    scrapedAt: new Date(scrapedAt),
    fetchedAt: now,
  };
  if (ownerUpdate) {
    baseFields.ownerName = ownerUpdate.ownerName;
    baseFields.ownerLiensJson = ownerUpdate.ownerLiens as any;
    baseFields.ownerLienScrapedAt = new Date(ownerUpdate.ownerLienScrapedAt);
  }
  if (legalDescriptionPins && legalDescriptionPins.length > 0) {
    baseFields.legalDescriptionPinsJson = legalDescriptionPins as any;
  }
  if (deedParties) {
    if (deedParties.deedGrantor) baseFields.deedGrantor = deedParties.deedGrantor;
    if (deedParties.deedGrantee) baseFields.deedGrantee = deedParties.deedGrantee;
  }

  if (existing.length > 0) {
    await db.update(lienCache).set(baseFields).where(eq(lienCache.pin, normalizedPin));
  } else {
    await db.insert(lienCache).values({ pin: normalizedPin, ...baseFields });
  }
}

async function updateOwnerLienCache(pin: string, ownerName: string, ownerLiens: LienDocument[], scrapedAt: string): Promise<void> {
  const normalizedPin = normalizePin(pin);
  const now = new Date();
  const existing = await db.select().from(lienCache).where(eq(lienCache.pin, normalizedPin)).limit(1);
  const fields = { ownerName, ownerLiensJson: ownerLiens as any, ownerLienScrapedAt: new Date(scrapedAt), fetchedAt: now };
  if (existing.length > 0) {
    await db.update(lienCache).set(fields).where(eq(lienCache.pin, normalizedPin));
  } else {
    await db.insert(lienCache).values({ pin: normalizedPin, ...fields });
  }
}

// Runs just the owner name lien search with an explicitly-provided name (user override).
// Does NOT re-scrape the property documents. Updates only the ownerName + ownerLiens in cache.
export async function searchOwnerLiensOnly(pin: string, ownerName: string): Promise<LienResult | null> {
  const normalizedPin = normalizePin(pin);
  const cleanName = ownerName.trim().toUpperCase();
  if (!cleanName) return null;

  const cached = await db.select().from(lienCache).where(eq(lienCache.pin, normalizedPin)).limit(1);
  const cachedData = cached[0];
  if (!cachedData) return null;

  console.log(`[lienSearch] Owner-only search for PIN ${normalizedPin} using name: "${cleanName}"`);
  const ownerScraped = await runOwnerLienScraper(cleanName);
  if (!ownerScraped) return null;

  await updateOwnerLienCache(normalizedPin, cleanName, ownerScraped.ownerLiens, ownerScraped.scrapedAt);

  const docs = (cachedData.documentsJson as LienDocument[]) || [];
  const baseResult = deriveResult(normalizedPin, docs, cachedData.scrapedAt ? cachedData.scrapedAt.toISOString() : null, false);
  return {
    ...baseResult,
    ownerName: cleanName,
    ownerLiens: ownerScraped.ownerLiens,
    ownerLienScrapedAt: ownerScraped.scrapedAt,
    ownerLienIsStale: false,
  };
}

// Track in-progress background scrapes
const backgroundScrapes = new Set<string>();
const backgroundOwnerScrapes = new Set<string>();

const OWNER_CACHE_DURATION_DAYS = 30;

function isOwnerLienCacheStale(cachedData: any): boolean {
  if (!cachedData?.ownerLienScrapedAt) return true;
  const scraped = new Date(cachedData.ownerLienScrapedAt);
  const staleAfter = new Date(Date.now() - OWNER_CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return scraped < staleAfter;
}

function attachOwnerLiens(result: LienResult, cachedData: any): LienResult {
  const ownerLiens = (cachedData?.ownerLiensJson as LienDocument[]) || [];
  const ownerLienScrapedAt = cachedData?.ownerLienScrapedAt
    ? new Date(cachedData.ownerLienScrapedAt).toISOString()
    : null;
  const ownerLienIsStale = isOwnerLienCacheStale(cachedData);
  const legalDescriptionPins = (cachedData?.legalDescriptionPinsJson as Array<{ pin: string; address: string }>) || result.legalDescriptionPins || [];
  return {
    ...result,
    ownerName: cachedData?.ownerName || null,
    ownerLiens,
    ownerLienScrapedAt,
    ownerLienIsStale,
    legalDescriptionPins,
    deedGrantor: cachedData?.deedGrantor || result.deedGrantor || null,
    deedGrantee: cachedData?.deedGrantee || result.deedGrantee || null,
  };
}

export async function getLienData(pin: string, options: { forceRefresh?: boolean; ownerName?: string | null } = {}): Promise<LienResult> {
  const normalizedPin = normalizePin(pin);
  const { forceRefresh = false, ownerName } = options;

  const cached = await db.select().from(lienCache).where(eq(lienCache.pin, normalizedPin)).limit(1);
  const cachedData = cached[0];
  const hasCache = !!cachedData?.scrapedAt;
  const isStaleCache = isCacheStale(cachedData);

  // -- PROPERTY DOCUMENTS SECTION --

  // Background scrape: stale cache + not forceRefresh + not already in progress
  const shouldBackground = hasCache && isStaleCache && !forceRefresh && !backgroundScrapes.has(normalizedPin);
  if (shouldBackground) {
    backgroundScrapes.add(normalizedPin);
    console.log(`[lienSearch] Returning stale cache for ${normalizedPin}, background scrape starting`);
    // Capture the sale-history name passed in so the background closure can use it
    const saleHistoryName = ownerName || null;
    setImmediate(async () => {
      try {
        const scraped = await runScraper(normalizedPin);
        if (scraped) {
          // Priority: recorder advanced search name > cached name > sale history fallback
          const freshOwnerName = scraped.ownerName || cachedData?.ownerName || saleHistoryName || null;
          const ownerNameChanged = freshOwnerName && freshOwnerName !== cachedData?.ownerName;
          // Update documents; include owner name if we got a better one from the recorder
          const deedParties1 = { deedGrantor: scraped.deedGrantor, deedGrantee: scraped.deedGrantee };
          await updateLienCache(normalizedPin, scraped.documents, scraped.scrapedAt,
            freshOwnerName ? { ownerName: freshOwnerName, ownerLiens: (cachedData?.ownerLiensJson as LienDocument[]) || [], ownerLienScrapedAt: cachedData?.ownerLienScrapedAt ? cachedData.ownerLienScrapedAt.toISOString() : new Date().toISOString() } : undefined,
            scraped.legalDescriptionPins, deedParties1
          );
          console.log(`[lienSearch] Background scrape complete for ${normalizedPin}: ${scraped.documents.length} docs, ownerName: ${freshOwnerName || 'none'}`);
          // If owner name improved (recorder gave us better data), re-run owner lien search
          if (ownerNameChanged && freshOwnerName) {
            console.log(`[lienSearch] Owner name updated to "${freshOwnerName}", triggering fresh owner lien search`);
            const ownerScraped = await runOwnerLienScraper(freshOwnerName);
            if (ownerScraped) {
              await updateLienCache(normalizedPin, scraped.documents, scraped.scrapedAt, {
                ownerName: freshOwnerName,
                ownerLiens: ownerScraped.ownerLiens,
                ownerLienScrapedAt: ownerScraped.scrapedAt,
              }, scraped.legalDescriptionPins, deedParties1);
            }
          }
        }
      } catch (e) {
        console.error(`[lienSearch] Background scrape failed for ${normalizedPin}:`, e);
      } finally {
        backgroundScrapes.delete(normalizedPin);
      }
    });

    const docs = (cachedData.documentsJson as LienDocument[]) || [];
    const baseResult = deriveResult(normalizedPin, docs, cachedData.scrapedAt ? cachedData.scrapedAt.toISOString() : null, true);
    // Use previously-stored recorder name if available; fall back to sale history name passed in
    const effectiveOwnerName = cachedData?.ownerName || ownerName || null;
    maybeRunOwnerLienSearch(normalizedPin, effectiveOwnerName, cachedData, forceRefresh);
    return attachOwnerLiens(baseResult, { ...cachedData, ownerName: effectiveOwnerName });
  }

  // Fresh cache and not forcing refresh → return immediately
  if (hasCache && !isStaleCache && !forceRefresh) {
    const docs = (cachedData.documentsJson as LienDocument[]) || [];

    // Trigger a silent background re-scrape if:
    // 1. Cached docs are missing viewLinks (added after initial release), OR
    // 2. Legal description PINs are missing (newly added feature) and there are deed documents, OR
    // 3. Deed grantor/grantee are missing (added after initial release) and there are deed documents
    const missingViewLinks = docs.length > 0 && docs.some(d => d.documentNumber && !d.viewLink);
    const missingLegalPins = !cachedData.legalDescriptionPinsJson && docs.some(d => d.category === 'deed');
    const missingDeedParties = !cachedData.deedGrantor && !cachedData.deedGrantee && docs.some(d => d.category === 'deed');
    // Also re-scrape if any mortgage is missing lender name or amount (populated by detail-page navigation)
    const missingMortgageDetail = docs.some(d => d.category === 'mortgage' && d.documentNumber && !d.grantee && !d.amount);
    if ((missingViewLinks || missingLegalPins || missingDeedParties || missingMortgageDetail) && !backgroundScrapes.has(normalizedPin)) {
      backgroundScrapes.add(normalizedPin);
      const missingReason = missingViewLinks ? 'viewLinks' : missingLegalPins ? 'legalDescPins' : missingDeedParties ? 'deedParties' : 'mortgageDetail';
      console.log(`[lienSearch] Cache missing ${missingReason} for ${normalizedPin}, background re-scrape triggered`);
      const saleHistoryName = ownerName || null;
      setImmediate(async () => {
        try {
          const scraped = await runScraper(normalizedPin);
          if (scraped) {
            const freshOwnerName = scraped.ownerName || cachedData?.ownerName || saleHistoryName || null;
            await updateLienCache(normalizedPin, scraped.documents, scraped.scrapedAt,
              freshOwnerName ? { ownerName: freshOwnerName, ownerLiens: (cachedData?.ownerLiensJson as LienDocument[]) || [], ownerLienScrapedAt: cachedData?.ownerLienScrapedAt ? cachedData.ownerLienScrapedAt.toISOString() : new Date().toISOString() } : undefined,
              scraped.legalDescriptionPins, { deedGrantor: scraped.deedGrantor, deedGrantee: scraped.deedGrantee }
            );
            console.log(`[lienSearch] viewLink backfill complete for ${normalizedPin}: ${scraped.documents.length} docs`);
          }
        } catch (e) {
          console.error(`[lienSearch] viewLink backfill failed for ${normalizedPin}:`, e);
        } finally {
          backgroundScrapes.delete(normalizedPin);
        }
      });
    }

    const baseResult = deriveResult(normalizedPin, docs, cachedData.scrapedAt ? cachedData.scrapedAt.toISOString() : null, false);
    // Use previously-stored recorder name if available; fall back to sale history name passed in
    const effectiveOwnerName = cachedData?.ownerName || ownerName || null;
    maybeRunOwnerLienSearch(normalizedPin, effectiveOwnerName, cachedData, forceRefresh);
    return attachOwnerLiens(baseResult, { ...cachedData, ownerName: effectiveOwnerName });
  }

  // No cache or force refresh → synchronous scrape (run both property + owner lien in parallel)
  if (!backgroundScrapes.has(normalizedPin)) {
    backgroundScrapes.add(normalizedPin);
    try {
      // Run property scrape first to extract owner name from recorder docs
      const scraped = await runScraper(normalizedPin);

      if (scraped) {
        // Priority order: 1) deed detail page grantee (from recorder), 2) fallback from sale history
        const effectiveOwnerName = scraped.ownerName || ownerName || null;
        if (effectiveOwnerName) {
          console.log(`[lienSearch] Owner name resolved for ${normalizedPin}: "${effectiveOwnerName}" (from ${scraped.ownerName ? 'recorder advanced search' : 'sale history fallback'})`);
        }

        // Run owner lien scrape with the resolved name
        const ownerScraped = effectiveOwnerName && !backgroundOwnerScrapes.has(normalizedPin)
          ? await runOwnerLienScraper(effectiveOwnerName)
          : null;

        const deedPartiesFresh = { deedGrantor: scraped.deedGrantor, deedGrantee: scraped.deedGrantee };
        if (ownerScraped && effectiveOwnerName) {
          await updateLienCache(normalizedPin, scraped.documents, scraped.scrapedAt, {
            ownerName: effectiveOwnerName,
            ownerLiens: ownerScraped.ownerLiens,
            ownerLienScrapedAt: ownerScraped.scrapedAt,
          }, scraped.legalDescriptionPins, deedPartiesFresh);
        } else {
          await updateLienCache(normalizedPin, scraped.documents, scraped.scrapedAt,
            effectiveOwnerName ? { ownerName: effectiveOwnerName, ownerLiens: [], ownerLienScrapedAt: new Date().toISOString() } : undefined,
            scraped.legalDescriptionPins, deedPartiesFresh
          );
        }

        const baseResult = deriveResult(normalizedPin, scraped.documents, scraped.scrapedAt, false, scraped.legalDescriptionPins);
        const freshCachedData = {
          ownerName: effectiveOwnerName,
          ownerLiensJson: ownerScraped?.ownerLiens || null,
          ownerLienScrapedAt: ownerScraped ? new Date(ownerScraped.scrapedAt) : null,
          legalDescriptionPinsJson: scraped.legalDescriptionPins,
          deedGrantor: scraped.deedGrantor,
          deedGrantee: scraped.deedGrantee,
        };
        return attachOwnerLiens(baseResult, freshCachedData);
      }
    } finally {
      backgroundScrapes.delete(normalizedPin);
    }
  }

  // Scrape failed or already in progress — return empty/stale
  const existingDocs = (cachedData?.documentsJson as LienDocument[]) || [];
  const effectiveOwnerNameFallback = extractOwnerFromDocs(existingDocs) || ownerName || null;
  const baseResult = deriveResult(normalizedPin, existingDocs, cachedData?.scrapedAt ? cachedData.scrapedAt.toISOString() : null, true);
  maybeRunOwnerLienSearch(normalizedPin, effectiveOwnerNameFallback, cachedData, forceRefresh);
  return attachOwnerLiens(baseResult, { ...cachedData, ownerName: effectiveOwnerNameFallback ?? cachedData?.ownerName ?? null });
}

// Trigger owner lien search in background if stale or new owner name provided
function maybeRunOwnerLienSearch(
  normalizedPin: string,
  ownerName: string | null | undefined,
  cachedData: any,
  forceRefresh: boolean
): void {
  if (!ownerName) return;
  const ownerChanged = cachedData?.ownerName !== ownerName;
  const ownerStale = isOwnerLienCacheStale(cachedData);
  // Also re-scrape if cached owner liens are missing viewLinks (added after initial release)
  const cachedOwnerLiens = (cachedData?.ownerLiensJson as LienDocument[]) || [];
  const ownerLiensMissingViewLinks = cachedOwnerLiens.length > 0 && cachedOwnerLiens.some(d => d.documentNumber && !d.viewLink);
  if ((!ownerStale && !ownerChanged && !forceRefresh && !ownerLiensMissingViewLinks) || backgroundOwnerScrapes.has(normalizedPin)) return;

  backgroundOwnerScrapes.add(normalizedPin);
  setImmediate(async () => {
    try {
      const ownerScraped = await runOwnerLienScraper(ownerName);
      if (ownerScraped) {
        await updateOwnerLienCache(normalizedPin, ownerName, ownerScraped.ownerLiens, ownerScraped.scrapedAt);
        console.log(`[lienSearch] Owner lien search complete for ${ownerName}: ${ownerScraped.ownerLiens.length} liens`);
      }
    } catch (e) {
      console.error(`[lienSearch] Owner lien search failed for ${ownerName}:`, e);
    } finally {
      backgroundOwnerScrapes.delete(normalizedPin);
    }
  });
}
