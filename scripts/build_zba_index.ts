import { db } from '../server/db';
import { zbaCases, zbaIndexRuns } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as cheerio from 'cheerio';

const ZBA_RESOLUTIONS_URL = 'https://www.chicago.gov/city/en/depts/dcd/zoning-board-of-appeals/ZBA-resolutions.html';
const YEARS_TO_FETCH = 5;

async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  // Use pdfjs-dist directly for text extraction
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;
  
  const textParts: string[] = [];
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str || '')
      .join(' ');
    textParts.push(pageText);
  }
  
  return textParts.join('\n');
}

function normalizeRepName(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .toUpperCase()
    .replace(/,?\s*(ESQ\.?|ATTORNEY|ATTY\.?|JR\.?|SR\.?|III|II|IV)/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function parseOutcome(text: string): 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'OTHER' {
  const upper = text.toUpperCase();
  if (upper.includes('GRANTED') || upper.includes('APPROVED')) return 'APPROVED';
  if (upper.includes('DENIED') || upper.includes('REJECTED')) return 'DENIED';
  if (upper.includes('WITHDRAWN')) return 'WITHDRAWN';
  return 'OTHER';
}

function parseDateFromFilename(url: string): Date | null {
  const filename = url.split('/').pop() || '';
  const monthMap: Record<string, number> = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
  };
  
  const match = filename.match(/(\d{1,2})([A-Z]{3})(\d{4})/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = monthMap[match[2].toUpperCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  
  // Older archive format: "2005_08AUG_signed_resolutions_OCR.pdf" (year first,
  // month number + name, no day — use the 1st of the month)
  const oldMatch = filename.match(/(\d{4})_(\d{1,2})([A-Z]{3,})/i);
  if (oldMatch) {
    const year = parseInt(oldMatch[1], 10);
    const month = monthMap[oldMatch[3].toUpperCase().slice(0, 3)] ?? (parseInt(oldMatch[2], 10) - 1);
    if (year >= 1990 && year <= 2100 && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }
  return null;
}

function isWithinYears(date: Date | null, years: number): boolean {
  // Exclude if the date can't be parsed — undated cases are invisible to the
  // 5-year ranking window anyway, and unparseable names are the old pre-2015
  // archive. (Both known naming formats are handled above.)
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return date >= cutoff;
}

interface ParsedCase {
  caseId: string | null;
  applicantName: string | null;
  representativeRaw: string | null;
  representativeNorm: string | null;
  propertyAddress: string | null;
  ward: number | null;
  outcome: 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'OTHER';
  rawText: string;
}

function extractCleanAddress(text: string): string | null {
  // Look for "PREMISES AFFECTED:" followed by a Chicago address
  // Format is usually like: "1234 N. Street Name" or "1234-56 W. Street Ave."
  // Stop at "NATURE" or "ACTION" or end of address
  const premisesMatch = text.match(/PREMISES\s+AFFECTED[:\s]+(\d+[\d\-]*\s+[NSEW]\.?\s+[A-Za-z]+[A-Za-z\s\.]*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Place|Pl|Court|Ct|Way|Lane|Ln|Terrace|Ter|Highway|Hwy)\.?)/i);
  
  if (premisesMatch) {
    let addr = premisesMatch[1].trim();
    // Remove extra whitespace and OCR artifacts
    addr = addr.replace(/\s+/g, ' ');
    // Fix common OCR issues: "A venue" -> "Avenue"
    addr = addr.replace(/\bA\s+venue\b/gi, 'Avenue');
    // Remove any trailing text that shouldn't be there
    addr = addr.replace(/\s*(NATURE|ACTION|APPLICATION).*$/i, '');
    // Add Chicago, IL if not present
    if (!addr.toUpperCase().includes('CHICAGO')) {
      addr = `${addr}, CHICAGO, IL`;
    }
    return addr;
  }
  
  return null;
}

function extractRepresentativeName(text: string): string | null {
  // Look for "FOR: [Name]" or "APPEARANCE FOR: [Name]" pattern
  // Names are typically 2-3 words, proper case
  const forMatch = text.match(/(?:APPEARANCE\s+)?FOR[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/);
  if (forMatch) {
    return forMatch[1].trim();
  }
  
  // Fallback: Look for name before "MINUTES OF MEETING"
  const beforeMinutes = text.match(/FOR[:\s]+([A-Za-z]+\s+[A-Za-z]+)\s+MINUTES/i);
  if (beforeMinutes) {
    return beforeMinutes[1].trim();
  }
  
  return null;
}

function parseCasesFromText(text: string): ParsedCase[] {
  const cases: ParsedCase[] = [];
  
  // Split on case number patterns (e.g., "123-24-S" or "CAL NO")
  const caseBlocks = text.split(/(?=\d{2,5}-\d{2,4}-[SZV])/i);
  
  for (const block of caseBlocks) {
    if (block.trim().length < 200) continue;
    
    // Extract case ID
    const caseIdMatch = block.match(/^(\d{2,5}-\d{2,4}-[SZV])/i);
    const caseId = caseIdMatch ? caseIdMatch[1].trim() : null;
    if (!caseId) continue; // Skip blocks without valid case IDs
    
    // Extract clean address
    const propertyAddress = extractCleanAddress(block);
    
    // Extract clean representative name
    let representativeRaw = extractRepresentativeName(block);
    
    // Handle "Same as Applicant" - mark as self-represented
    if (block.toUpperCase().includes('SAME AS APPLICANT')) {
      representativeRaw = 'SELF-REPRESENTED';
    }
    
    const representativeNorm = normalizeRepName(representativeRaw);
    
    const outcome = parseOutcome(block);
    
    // Only add if we have case ID and address (need address for geocoding)
    if (caseId && propertyAddress) {
      cases.push({
        caseId,
        applicantName: null,
        representativeRaw,
        representativeNorm,
        propertyAddress,
        ward: null, // Will be geocoded later
        outcome,
        rawText: block.substring(0, 1500),
      });
    }
  }
  
  return cases;
}

async function fetchPdfLinks(): Promise<string[]> {
  console.log(`Fetching ZBA resolutions page: ${ZBA_RESOLUTIONS_URL}`);
  
  const response = await fetch(ZBA_RESOLUTIONS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ZBA page: ${response.status}`);
  }
  
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const pdfLinks: string[] = [];
  
  $('a[href$=".pdf"]').each((_, el) => {
    let href = $(el).attr('href');
    if (href) {
      if (href.startsWith('/')) {
        href = `https://www.chicago.gov${href}`;
      }
      if (href.includes('Resolutions') || href.includes('resolution') || href.includes('ZBA')) {
        pdfLinks.push(href);
      }
    }
  });
  
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - YEARS_TO_FETCH);
  
  const filteredLinks = pdfLinks.filter(url => {
    const date = parseDateFromFilename(url);
    return isWithinYears(date, YEARS_TO_FETCH);
  });
  
  console.log(`Found ${filteredLinks.length} PDF links within last ${YEARS_TO_FETCH} years`);
  return [...new Set(filteredLinks)];
}

// Lightweight ward resolution: Census geocode -> point-in-polygon against the
// local ward boundary file. (The old version ran the full property lookup —
// zoning/TIF/parcel APIs per case — which made rebuilds take hours.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';

const __zbaDirname = path.dirname(fileURLToPath(import.meta.url));
let wardFeatures: any[] | null = null;

function loadWards(): any[] {
  if (!wardFeatures) {
    const p = path.join(__zbaDirname, '..', 'server', 'data', 'chicago_wards.geojson');
    wardFeatures = JSON.parse(fs.readFileSync(p, 'utf-8')).features;
    console.log(`Loaded ${wardFeatures!.length} ward boundaries`);
  }
  return wardFeatures!;
}

const wardCache = new Map<string, number | null>();

async function resolveWard(address: string | null): Promise<number | null> {
  if (!address) return null;
  const key = address.toUpperCase().replace(/\s+/g, ' ').trim();
  if (wardCache.has(key)) return wardCache.get(key)!;

  let ward: number | null = null;
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (resp.ok) {
      const data = await resp.json() as any;
      const match = data?.result?.addressMatches?.[0];
      if (match) {
        const pt = turf.point([match.coordinates.x, match.coordinates.y]);
        for (const feature of loadWards()) {
          if (turf.booleanPointInPolygon(pt, feature)) {
            const w = parseInt(String(feature.properties?.ward ?? '').replace(/\D/g, ''), 10);
            ward = isNaN(w) ? null : w;
            break;
          }
        }
      }
    }
  } catch {
    // leave ward null — case is still counted, just not ward-filterable
  }
  wardCache.set(key, ward);
  return ward;
}

// Sanity floor: a rebuild that finds far fewer cases than the last good index
// indicates a scrape/parse failure (page layout change, PDFs unreachable).
// In that case we fail hard and KEEP the existing index (atomic rebuild).
const MIN_PDFS = 10;
const MIN_CASES = 200;

async function buildZbaIndex(): Promise<void> {
  console.log('Starting ZBA index build...');
  
  const [run] = await db.insert(zbaIndexRuns).values({
    status: 'processing',
  }).returning();
  
  let pdfsProcessed = 0;
  let casesExtracted = 0;
  
  try {
    const pdfLinks = await fetchPdfLinks();
    
    // Phase 1: collect all rows in memory — nothing touches the live table yet
    type NewRow = typeof zbaCases.$inferInsert;
    const rows: NewRow[] = [];
    
    for (const pdfUrl of pdfLinks) {
      try {
        console.log(`Processing: ${pdfUrl}`);
        
        const pdfBuffer = await downloadPdf(pdfUrl);
        const text = await extractTextFromPdf(pdfBuffer);
        
        const decisionDate = parseDateFromFilename(pdfUrl);
        const parsedCases = parseCasesFromText(text);
        
        console.log(`  Found ${parsedCases.length} cases`);
        
        for (const parsed of parsedCases) {
          let ward = parsed.ward;
          if (!ward && parsed.propertyAddress) {
            ward = await resolveWard(parsed.propertyAddress);
          }
          
          rows.push({
            decisionDate,
            caseId: parsed.caseId,
            ward,
            propertyAddress: parsed.propertyAddress,
            applicantName: parsed.applicantName,
            representativeRaw: parsed.representativeRaw,
            representativeNorm: parsed.representativeNorm,
            outcome: parsed.outcome,
            pdfUrl,
            rawCaseText: parsed.rawText,
          });
        }
        
        pdfsProcessed++;
      } catch (err) {
        console.error(`Error processing ${pdfUrl}:`, err);
      }
    }
    
    casesExtracted = rows.length;
    
    // Sanity check before swapping — never replace a good index with a bad scrape
    if (pdfsProcessed < MIN_PDFS || casesExtracted < MIN_CASES) {
      throw new Error(`Sanity check failed: only ${pdfsProcessed} PDFs / ${casesExtracted} cases parsed (need >= ${MIN_PDFS} PDFs and >= ${MIN_CASES} cases). Existing index left untouched.`);
    }
    
    // Ward-coverage floor: a Census geocoder outage would leave wards null across
    // the board — that index would be useless for ward-level rankings, so keep the old one.
    const wardResolved = rows.filter(r => r.ward != null).length;
    const wardRate = wardResolved / rows.length;
    console.log(`Ward resolution: ${wardResolved}/${rows.length} (${Math.round(wardRate * 100)}%)`);
    if (wardRate < 0.7) {
      throw new Error(`Ward resolution rate too low (${Math.round(wardRate * 100)}% < 70%) — likely a geocoder outage. Existing index left untouched.`);
    }
    
    // Phase 2: atomic swap — delete old rows and insert new ones in one transaction
    await db.transaction(async (tx) => {
      await tx.delete(zbaCases);
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        await tx.insert(zbaCases).values(rows.slice(i, i + BATCH));
      }
    });
    
    // Write a snapshot file that ships with each deploy. Production (autoscale)
    // can't run this hour-long scrape — it imports this snapshot at startup instead.
    try {
      const fs = await import('fs');
      const path = await import('path');
      const snapPath = path.join(import.meta.dirname, '..', 'server', 'data', 'zba_snapshot.json');
      fs.writeFileSync(snapPath, JSON.stringify({
        builtAt: new Date().toISOString(),
        pdfsProcessed,
        cases: rows.map(r => ({ ...r, decisionDate: r.decisionDate ? r.decisionDate.toISOString() : null })),
      }));
      console.log(`Snapshot written: ${snapPath} (${rows.length} cases)`);
    } catch (snapErr) {
      console.error('Snapshot write failed (non-fatal):', snapErr);
    }
    
    await db.update(zbaIndexRuns)
      .set({
        status: 'completed',
        pdfsProcessed,
        casesExtracted,
        completedAt: new Date(),
      })
      .where(eq(zbaIndexRuns.id, run.id));
    
    console.log(`\nBuild complete: ${pdfsProcessed} PDFs processed, ${casesExtracted} cases extracted`);
    
  } catch (err) {
    console.error('Build failed:', err);
    
    await db.update(zbaIndexRuns)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(zbaIndexRuns.id, run.id));
    
    throw err;
  }
}

buildZbaIndex()
  .then(() => {
    console.log('ZBA index build finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('ZBA index build failed:', err);
    process.exit(1);
  });
