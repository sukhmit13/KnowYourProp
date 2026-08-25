
import { inflateSync } from 'zlib';
import { db } from './db';
import { zbaCases } from '../shared/schema';
import { ilike, or, sql } from 'drizzle-orm';

const LEGISTAR_BASE = 'https://webapi.legistar.com/v1/chicago';

export interface ZoningContact {
  name: string;
  firm?: string;
  email?: string;
}

export interface ZoningHistoryItem {
  type: 'legistar' | 'zba';
  date: string;
  /** City Council filing and disposition dates are deliberately distinct. */
  introducedDate?: string;
  passedDate?: string;
  status?: string;
  actionType?: string;
  title: string;
  description: string;
  ordinanceId?: string;
  legistarUrl?: string;
  councilmaticUrl?: string;
  attachmentUrl?: string;
  fromZone?: string;
  toZone?: string;
  presentZoning?: string;
  proposedZoning?: string;
  applicationReason?: string;
  proposedUse?: string;
  existingPropertyContext?: string;
  /** Address named as the development site in the application, when extracted. */
  developmentAddress?: string;
  zoningAttorney?: ZoningContact;
  architect?: ZoningContact;
  applicant?: string;
  /** False means this filing was outside the bounded enrichment pass. */
  enriched?: boolean;
  /** Earlier hearing dates for a case whose final disposition is also present. */
  hearingDates?: string[];
  decision?: string;
  /** Exact address in the source record that matched this property. */
  matchedAddress?: string;
  source: string;
}

export interface ZoningHistoryCoverage {
  generatedAt: string;
  cityCouncil: {
    complete: boolean;
    note: string;
  };
  zba: {
    complete: boolean;
    checked?: boolean;
    earliestIndexedDate?: string;
    latestIndexedDate?: string;
    note: string;
  };
}

function normalizeStreetForSearch(address: string): { num: string; dir: string; street: string } | null {
  const cleaned = address
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  const num = parts[0];
  if (!/^\d+$/.test(num)) return null;

  const SUFFIXES = /^(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Place|Pl|Court|Ct|Lane|Ln|Way|Wy|Parkway|Pkwy)\.?$/i;
  const DIRECTIONS_FULL: Record<string, string> = {
    north: 'N', south: 'S', east: 'E', west: 'W',
  };
  const DIRECTIONS: Record<string, string> = { n: 'N', s: 'S', e: 'E', w: 'W' };

  let idx = 1;
  let dir = '';

  const maybeDir = parts[idx];
  if (maybeDir) {
    const low = maybeDir.toLowerCase().replace(/\.$/, '');
    if (DIRECTIONS_FULL[low]) { dir = DIRECTIONS_FULL[low]; idx++; }
    else if (DIRECTIONS[low] && low.length === 1) { dir = DIRECTIONS[low]; idx++; }
  }

  const streetParts: string[] = [];
  for (let i = idx; i < parts.length; i++) {
    if (!SUFFIXES.test(parts[i])) {
      streetParts.push(parts[i].charAt(0).toUpperCase() + parts[i].slice(1).toLowerCase());
    }
  }

  if (!streetParts.length) return null;
  return { num, dir, street: streetParts.join(' ') };
}

function normalizeAddressForMatch(addr: string): string {
  return addr.toUpperCase()
    .replace(/[,#]/g, ' ')
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .replace(/\b(AVENUE|AVE|STREET|ST|ROAD|RD|BOULEVARD|BLVD|DRIVE|DR|PLACE|PL|COURT|CT|LANE|LN|FLOOR|FL|SUITE|STE|UNIT)\b\.?/g, '')
    .replace(/(\d)\s*[\u2013\u2014/]\s*(\d)/g, '$1-$2') // en/em-dash or slash between numbers → hyphen
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when house number `target` is covered by `token` — a plain number
 *  ("522") or a Chicago-style range ("520-524", abbreviated "520-22").
 *  Ranges only cover the same side of the street (even/odd parity). */
export function houseNumberMatches(target: number, token: string): boolean {
  if (!isFinite(target)) return false;
  const m = token.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) {
    const n = parseInt(token, 10);
    return isFinite(n) && n === target;
  }
  const lo = parseInt(m[1], 10);
  let hi = parseInt(m[2], 10);
  // Abbreviated upper bound: "520-22" means 520–522 — borrow the leading digits
  if (m[2].length < m[1].length) hi = parseInt(m[1].slice(0, m[1].length - m[2].length) + m[2], 10);
  if (!isFinite(lo) || !isFinite(hi) || hi < lo || hi - lo > 200) return false;
  // Reject cross-parity ranges ("520-21" spans both street sides — malformed)
  if (lo % 2 !== hi % 2) return false;
  return target >= lo && target <= hi && (target - lo) % 2 === 0;
}

/** Either side may be a range: "522" matches "520-22" and vice versa. */
export function houseTokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a)) return houseNumberMatches(parseInt(a, 10), b);
  if (/^\d+$/.test(b)) return houseNumberMatches(parseInt(b, 10), a);
  return false;
}

export function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddressForMatch(a);
  const nb = normalizeAddressForMatch(b);
  if (!na || !nb) return false;
  const partsA = na.split(' ').filter(Boolean);
  const partsB = nb.split(' ').filter(Boolean);
  if (!houseTokensMatch(partsA[0], partsB[0])) return false;
  const directionA = /^[NSEW]$/.test(partsA[1]) ? partsA[1] : '';
  const directionB = /^[NSEW]$/.test(partsB[1]) ? partsB[1] : '';
  // A source record may omit the direction, but when both records include it,
  // N/S/E/W describe distinct Chicago streets and must agree.
  if (directionA && directionB && directionA !== directionB) return false;
  const streetA = partsA.slice(directionA ? 2 : 1).join(' ');
  const streetB = partsB.slice(directionB ? 2 : 1).join(' ');
  if (!streetA || !streetB) return false;
  return streetA.startsWith(streetB) || streetB.startsWith(streetA) || streetA.includes(streetB) || streetB.includes(streetA);
}

function parseActionType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('reclassif')) return 'Rezoning (map amendment)';
  if (t.includes('special use')) return 'Special use permit';
  if (t.includes('planned development') || t.includes(' pd ') || /\bpd\s*#/.test(t)) return 'Planned development';
  if (t.includes('variance')) return 'Zoning variance';
  if (t.includes('map amendment')) return 'Zoning map amendment';
  if (t.includes('landmark')) return 'Landmark designation';
  if (t.includes('text amendment')) return 'Zoning text amendment';
  return 'Zoning ordinance';
}

const ZONE_CODE_PATTERN = '[A-Z]{1,3}[0-9lL]?[-]?[0-9]{1,2}(?:\\.[0-9])?[A-Z]?';

function normalizeZoneCode(raw: string): string {
  // Fix OCR artifact: lowercase 'l' in digit position → '1'
  // e.g. "Bl-2" → "B1-2", "Cl-2" → "C1-2"; restore a missing OCR hyphen in "RS3".
  return raw
    .replace(/([A-Z])l(-?\d)/g, '$11$2')
    .replace(/([A-Z])L(-?\d)/g, '$11$2')
    .replace(/^([A-Z]{1,3})(\d)/, '$1-$2');
}

function extractZoneCodeList(text: string): string[] {
  const codes = [...text.matchAll(new RegExp(`(?<![A-Z0-9])(${ZONE_CODE_PATTERN})(?![A-Z0-9])`, 'gi'))]
    .map(m => normalizeZoneCode(m[1].toUpperCase()));
  return Array.from(new Set(codes));
}

function extractZonesFromPdfText(text: string): { fromZone?: string; toZone?: string } {
  // Chicago zone code pattern: 1-3 uppercase letters, optional digit/l, hyphen, 1-2 digits, optional decimal+digit, optional suffix letter
  const ZONE_PAT = ZONE_CODE_PATTERN;
  const fromToPattern = new RegExp(
    `from\\s+the\\s+(${ZONE_PAT})\\s.*?to\\s+the\\s+(${ZONE_PAT})\\s`,
    'i',
  );
  const m = text.match(fromToPattern);
  if (m) {
    return {
      fromZone: normalizeZoneCode(m[1]),
      toZone: normalizeZoneCode(m[2]),
    };
  }
  // Fallback: look for "Present Zoning District" / "Proposed Zoning District" pattern (application form)
  const presentMatch = text.match(/Present\s+Zoning\s+District\s+((?:[A-Z]{1,3}[0-9lL]?-[0-9]{1,2}(?:\.[0-9])?[A-Z]?))/i);
  const proposedMatch = text.match(/Proposed\s+Zoning\s+District\s+((?:[A-Z]{1,3}[0-9lL]?-[0-9]{1,2}(?:\.[0-9])?[A-Z]?))/i);
  if (presentMatch || proposedMatch) {
    return {
      fromZone: presentMatch ? normalizeZoneCode(presentMatch[1]) : undefined,
      toZone: proposedMatch ? normalizeZoneCode(proposedMatch[1]) : undefined,
    };
  }
  return {};
}

interface ZoningApplicationDetails {
  presentZoning?: string;
  proposedZoning?: string;
  applicationReason?: string;
  proposedUse?: string;
  existingPropertyContext?: string;
  developmentAddress?: string;
}

function extractApplicationDetails(text: string): ZoningApplicationDetails {
  const result: ZoningApplicationDetails = {};
  const presentMatch = text.match(
    /\bPresent\s+Zoning\s*:?\s*(.*?)(?=\s+\bProposed\s+Zoning\s*:)/i,
  );
  const proposedMatch = text.match(
    /\bProposed\s+Zoning\s*:?\s*(.*?)(?=\s+\bLot\s+size\b|\s+\bCurrent\s+Use\s+of\s+the\s+Property\b)/i,
  );
  const codes = (value?: string) => value ? extractZoneCodeList(value).join(' + ') || undefined : undefined;
  result.presentZoning = codes(presentMatch?.[1]);
  result.proposedZoning = codes(proposedMatch?.[1]);

  const reasonMatch = text.match(
    /\bReason\s+for\s+rezoning\s+the\s+property\s*:\s*(.*?)(?=\s+\bDescribe\s+the\s+proposed\s+use\b)/i,
  );
  result.applicationReason = reasonMatch?.[1]?.trim() || undefined;

  const currentUseMatch = text.match(
    /\bCurrent\s+Use\s+of\s+the\s+Property\s*:\s*(.*?)(?=\s+\bReason\s+for\s+rezoning\b)/i,
  );
  result.existingPropertyContext = currentUseMatch?.[1]?.trim() || undefined;

  const proposedUseMatch = text.match(
    /\bDescribe\s+the\s+proposed\s+use\b[^:]*:\s*(.*?)(?=\s+\bOn\s+May\s+\d{1,2},\s+\d{4}\b|\s+\bCOUNTY\s+OF\s+COOK\b)/i,
  );
  result.proposedUse = proposedUseMatch?.[0]?.trim() || undefined;

  // The application can describe a development on the companion parcel. This
  // must travel with the record so presentation never treats the subject
  // parcel's later permit count as evidence about a different address.
  const developmentMatch = text.match(
    /\b(?:to\s+develop|development\s+of|develop)\s+(\d{3,5}\s+[NSEW]\.?\s+[\w.'-]+(?:\s+[\w.'-]+)*\s+(?:Avenue|Ave\.?|Street|St\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln|Road|Rd|Way|Place|Pl|Court|Ct|Parkway|Pkwy)\b)/i,
  );
  result.developmentAddress = developmentMatch?.[1]?.replace(/\s+/g, ' ').trim();

  return result;
}

function extractContactsFromPdfText(text: string): { zoningAttorney?: ZoningContact; architect?: ZoningContact } {
  const result: { zoningAttorney?: ZoningContact; architect?: ZoningContact } = {};

  // ── Zoning Attorney ────────────────────────────────────────────────────────
  // The Chicago DPD application form has a dedicated section introduced by
  // "representative for the rezoning". This disambiguates from other lawyers
  // (e.g., corporate counsel, EDS preparers).
  const attorneySection = text.match(
    /representative for the rezoning[\s\S]{0,500}?\bATTORNEY\s*:?\s*(.*?)\s+ADDRESS/i,
  );
  if (attorneySection) {
    const raw = attorneySection[1].trim();
    // Strip trailing OCR artifacts (alphanumeric garbage before real text ends)
    const cleaned = raw.replace(/\s*[a-z0-9,]{3,12}v\d+\s*$/, '').trim();
    // Split on " - " or " – " to separate names from firm
    const dashIdx = cleaned.indexOf(' - ');
    const eName = dashIdx >= 0 ? cleaned.slice(0, dashIdx).trim() : cleaned;
    const eFirm = dashIdx >= 0 ? cleaned.slice(dashIdx + 3).trim() : undefined;
    // Some application forms identify the individual as a contact person
    // immediately before "Attorney for Applicant", while the ATTORNEY field
    // contains only the law office. Prefer the named individual in that case.
    const contactMatch = text.match(
      /CONTACT\s+PERSON\s*:?\s*([A-Z][^\r\n]{2,80}?)\s+Attorney\s+for\s+Applicant/i,
    );
    const contactName = contactMatch?.[1]
      ?.replace(/\s+/g, ' ')
      .replace(/\.\s*(Esq\.?)$/i, ', $1')
      .trim();
    const firmFromForm = cleaned.replace(/\b([A-Za-z]+)\s+([A-Za-z])$/, (match, word, repeatedLetter) =>
      word[word.length - 1]?.toLowerCase() === repeatedLetter.toLowerCase() ? word : match,
    );

    // Extract email: look in the chunk just after ATTORNEY ... up to next major section
    const afterAttorney = text.slice(text.indexOf(raw));
    const emailMatch = afterAttorney.match(
      /EMAIL\s+([\w.+%-]+@[\w.-]+\.[A-Za-z]{2,})/i,
    );
    const rawEmail = emailMatch?.[1]?.replace(/,/g, '') ?? undefined;

    result.zoningAttorney = {
      name: contactName || eName,
      firm: contactName ? firmFromForm : eFirm,
      email: rawEmail,
    };
  }

  // ── Architect ──────────────────────────────────────────────────────────────
  // Pattern 1: explicit ARCHITECT form field (appears in PD / complex rezonings)
  const archField = text.match(
    /\bARCHITECT\s+((?!OF\s+RECORD)[A-Z][^A-Z\n]{3,80}?)\s+(?:ADDRESS|PHONE|EMAIL|CONTACT)/i,
  );
  if (archField) {
    const raw = archField[1].trim();
    const dashIdx = raw.indexOf(' - ');
    result.architect = {
      name: dashIdx >= 0 ? raw.slice(0, dashIdx).trim() : raw,
      firm: dashIdx >= 0 ? raw.slice(dashIdx + 3).trim() : undefined,
    };
  }

  // Pattern 2: "architect of record" / "architect with [firm]" in narrative
  if (!result.architect) {
    const archNarrative = text.match(
      /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+),?\s+(?:the\s+)?(?:project\s+)?architect(?:\s+of\s+record)?\s+(?:with|at|for)?\s+([A-Z][A-Za-z &,.']+(?:LLC|LLP|Inc|AIA|Architecture|Architects|Design|Studio)?)/i,
    );
    if (archNarrative) {
      result.architect = {
        name: archNarrative[1].trim(),
        firm: archNarrative[2].trim(),
      };
    }
  }

  // Pattern 3: "Prepared by [firm]" with AIA/Architecture in the name
  if (!result.architect) {
    const prepBy = text.match(
      /Prepared\s+by\s*:?\s*([A-Z][A-Za-z &,.']+(?:Architects?|Architecture|Design|AIA|Studio)[A-Za-z &,.']*)/i,
    );
    if (prepBy) {
      result.architect = { name: prepBy[1].trim() };
    }
  }

  return result;
}

async function extractZonesFromPdf(pdfUrl: string, maxBytes = 4_000_000): Promise<{
  fromZone?: string; toZone?: string;
  presentZoning?: string; proposedZoning?: string;
  applicationReason?: string; proposedUse?: string; existingPropertyContext?: string; developmentAddress?: string;
  zoningAttorney?: ZoningContact; architect?: ZoningContact;
}> {
  try {
    // Check size first via HEAD to avoid downloading large agenda PDFs
    const head = await fetch(pdfUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    const contentLength = parseInt(head.headers.get('content-length') || '0', 10);
    if (contentLength > 0 && contentLength > maxBytes) return {};

    const resp = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return {};
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > maxBytes) return {};
    const bufStr = buf.toString('binary');

    let allText = '';
    let searchPos = 0;

    while (searchPos < bufStr.length) {
      const s1 = bufStr.indexOf('stream\r\n', searchPos);
      const s2 = bufStr.indexOf('stream\n', searchPos);
      let sPos = -1;
      if (s1 >= 0 && s2 >= 0) sPos = s1 < s2 ? s1 + 8 : s2 + 7;
      else if (s1 >= 0) sPos = s1 + 8;
      else if (s2 >= 0) sPos = s2 + 7;
      else break;

      const endPos = bufStr.indexOf('endstream', sPos);
      if (endPos < 0 || endPos - sPos > 200_000) { searchPos = sPos + 1; continue; }

      const streamData = buf.slice(sPos, endPos);
      try {
        const decompressed = inflateSync(streamData).toString('utf8');
        const texts = [...decompressed.matchAll(/\(([^)]{1,200})\)\s*Tj/g)].map(m => m[1]);
        if (texts.length > 0) allText += texts.join(' ') + ' ';
      } catch { /* stream not deflate-compressed, skip */ }
      searchPos = sPos + 1;
    }

    if (!allText.trim()) return {};
    // Normalize whitespace (PDF tokens can contain literal \n, \r escape sequences)
    const normalizedText = allText.replace(/\s+/g, ' ').trim();
    const zones = extractZonesFromPdfText(normalizedText);
    const contacts = extractContactsFromPdfText(normalizedText);
    return { ...zones, ...extractApplicationDetails(normalizedText), ...contacts };
  } catch {
    return {};
  }
}

interface CouncilmaticResult {
  url: string;
  pdfUrls: string[];
  fromZone?: string;
  toZone?: string;
  presentZoning?: string;
  proposedZoning?: string;
  applicationReason?: string;
  proposedUse?: string;
  existingPropertyContext?: string;
  developmentAddress?: string;
  zoningAttorney?: ZoningContact;
  architect?: ZoningContact;
}

async function fetchCouncilmaticData(fileNumber: string): Promise<CouncilmaticResult | null> {
  try {
    const slug = fileNumber.toLowerCase().replace(/\s+/g, '-');
    const url = `https://chicago.councilmatic.org/legislation/${slug}/`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Councilmatic's embedded legislation text can include the original
    // zoning application even when its PDF link is missing or expired.
    // Strip markup/entities so the same evidence-based parsers can handle it.
    const recordText = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const htmlApplication = extractApplicationDetails(recordText);
    const htmlZones = extractZonesFromPdfText(recordText);
    const htmlContacts = extractContactsFromPdfText(recordText);
    if (!htmlZones.fromZone) htmlZones.fromZone = htmlApplication.presentZoning;
    if (!htmlZones.toZone) htmlZones.toZone = htmlApplication.proposedZoning;

    // Extract PDF links from proxy.councilmatic.org
    const pdfUrls: string[] = [];
    const proxyPattern = /href="(https:\/\/proxy\.councilmatic\.org\/\?url=https:\/\/occprodstoragev1\.blob\.core\.usgovcloudapi\.net\/matterattachmentspublic\/[^"]+\.pdf)"/gi;
    let m;
    while ((m = proxyPattern.exec(html)) !== null) {
      // Use the direct blob URL (avoids the proxy layer)
      const directUrl = m[1].replace('https://proxy.councilmatic.org/?url=', '');
      pdfUrls.push(directUrl);
    }

    return { url, pdfUrls, ...htmlZones, ...htmlApplication, ...htmlContacts };
  } catch {
    return null;
  }
}

/** Backup source: Councilmatic's own search index (mirrors City Council records
 *  via its own database, so it stays up when the Legistar web API is down).
 *  Returns pseudo-matter objects shaped like Legistar rows for the shared pipeline. */
async function fetchCouncilmaticSearch(
  streetTerm: string,
  deadline: number,
): Promise<{ rows: any[]; complete: boolean; partialReason?: string }> {
  const rows: any[] = [];
  const q = encodeURIComponent(`"${streetTerm}"`);
  for (let page = 1; ; page++) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) {
      console.warn(`[zoningHistory] Councilmatic search for "${streetTerm}" stopped at page ${page}: request deadline reached`);
      return {
        rows,
        complete: false,
        partialReason: 'The Councilmatic search reached its time limit before every matching page could be read.',
      };
    }
    let html: string;
    try {
      const resp = await fetch(
        `https://chicago.councilmatic.org/search/?q=${q}&sort_by=date&order_by=desc${page > 1 ? `&page=${page}` : ''}`,
        { signal: AbortSignal.timeout(Math.min(10000, remaining)), headers: { 'User-Agent': 'Mozilla/5.0' } },
      );
      if (!resp.ok) {
        console.warn(`[zoningHistory] Councilmatic search HTTP ${resp.status} for "${streetTerm}" page ${page}`);
        return {
          rows,
          complete: false,
          partialReason: `Councilmatic stopped responding while page ${page} was being read.`,
        };
      }
      html = await resp.text();
    } catch (e) {
      console.warn(`[zoningHistory] Councilmatic search failed for "${streetTerm}" page ${page}:`, (e as Error)?.message);
      return {
        rows,
        complete: false,
        partialReason: `Councilmatic could not be reached while page ${page} was being read.`,
      };
    }
    const blocks = html.split('<p class="h4">').slice(1);
    if (blocks.length === 0) {
      // A successful page with results advertised but no parseable blocks means
      // the site template changed — say so loudly instead of a silent empty history.
      if (/\d+\s+legislation results/i.test(html) && !/\b0\s+legislation results/i.test(html)) {
        console.error(`[zoningHistory] Councilmatic page for "${streetTerm}" returned results but none parsed — site template may have changed`);
      }
      return {
        rows,
        complete: false,
        partialReason: 'Councilmatic returned results in an unexpected format, so the archive search is incomplete.',
      };
    }
    let parsedThisPage = 0;
    for (const block of blocks) {
      const link = block.match(/<a href="\/legislation\/([^/"]+)\/">\s*(?:Ordinance|Order|Resolution|Claim|Appointment|Report|Communication)?\s*([^<]+)</i);
      if (!link) continue;
      const fileNum = link[2].trim();
      const status = block.match(/<span class='label[^']*'>([^<]+)<\/span>/)?.[1]?.trim() || '';
      const title = block.match(/<p class="search-result">\s*([\s\S]*?)\s*<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '';
      const dateRaw = block.match(/fa-calendar"><\/i>\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1];
      let isoDate = '';
      if (dateRaw) {
        const [mo, d, y] = dateRaw.split('/').map((x) => parseInt(x, 10));
        if (y && mo && d) isoDate = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      if (!title) continue;
      rows.push({
        MatterId: null,
        MatterGuid: '',
        MatterFile: fileNum,
        MatterTitle: title,
        MatterStatusName: status,
        MatterBodyName: '',
        MatterIntroDate: isoDate,
        MatterPassedDate: status.toLowerCase() === 'passed' ? isoDate : '',
        MatterEnactmentNumber: '',
      });
      parsedThisPage++;
    }
    if (parsedThisPage === 0) {
      console.error(`[zoningHistory] Councilmatic page ${page} for "${streetTerm}" had result blocks but none parsed — site template may have changed`);
      return {
        rows,
        complete: false,
        partialReason: 'Councilmatic returned an unreadable results page, so the archive search is incomplete.',
      };
    }
    // Stop when the page advertises no next page
    if (!html.includes(`page=${page + 1}`)) {
      return { rows, complete: true };
    }
  }
}

async function fetchMatterAttachmentUrl(matterId: number | null): Promise<string | undefined> {
  if (!matterId) return undefined;
  try {
    const resp = await fetch(`${LEGISTAR_BASE}/Matters/${matterId}/Attachments`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return undefined;
    const attachments: any[] = await resp.json();
    if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
    const pdf = attachments.find(
      (a: any) => (a.MatterAttachmentName || '').toLowerCase().endsWith('.pdf') && a.MatterAttachmentHyperlink,
    );
    return pdf?.MatterAttachmentHyperlink;
  } catch {
    return undefined;
  }
}

interface CityCouncilLookup {
  items: ZoningHistoryItem[];
  coverage: ZoningHistoryCoverage['cityCouncil'];
}

async function fetchLegistarOrdinances(addresses: string[]): Promise<CityCouncilLookup> {
  // Group target addresses by street (subject + any co-parcel usually share one);
  // each group runs ONE street query and accepts any of its house numbers.
  const groups = new Map<string, { streetTerm: string; nums: string[] }>();
  for (const address of addresses) {
    const parsed = normalizeStreetForSearch(address);
    if (!parsed) continue;
    const streetTerm = parsed.dir ? `${parsed.dir} ${parsed.street}` : parsed.street;
    const g = groups.get(streetTerm.toUpperCase()) || { streetTerm, nums: [] };
    if (!g.nums.includes(parsed.num)) g.nums.push(parsed.num);
    groups.set(streetTerm.toUpperCase(), g);
  }
  if (groups.size === 0) {
    return {
      items: [],
      coverage: { complete: true, note: 'No searchable street address was supplied for the City Council archive.' },
    };
  }

  // End-to-end budget across all sources/groups so a source outage can't
  // stack serial timeouts into a multi-minute request.
  const deadline = Date.now() + 45000;

  let data: any[] = [];
  const seen = new Set<string>();
  let complete = true;
  const coverageNotes: string[] = [];
  const groupValues = Array.from(groups.values());
  if (groupValues.length > 4) {
    complete = false;
    coverageNotes.push('Only the first four distinct streets could be searched.');
  }
  for (const { streetTerm, nums } of groupValues.slice(0, 4)) {
    // Search by street (dir + name) only — ordinance titles often use a hyphenated
    // range ("520-22 N Claremont Ave"), so an exact house-number substring misses.
    // House numbers are verified locally with range-aware matching below.
    const escaped = streetTerm.replace(/'/g, "''");
    const filterClause = `substringof('${escaped}',MatterTitle)`;

    // Councilmatic is the preferred source because its legislation page can
    // include the original application text (zones, project purpose, existing
    // structures, and attorney) that the Legistar matter API omits.
    const councilmatic = await fetchCouncilmaticSearch(streetTerm, deadline);
    let rows = councilmatic.rows;
    let retrievalSource: 'councilmatic' | 'legistar' = 'councilmatic';
    if (!councilmatic.complete) {
      complete = false;
      if (councilmatic.partialReason) coverageNotes.push(councilmatic.partialReason);
    }

    // Fallback: if Councilmatic is unavailable or returns no usable rows,
    // search the official Legistar API so a source outage does not erase the
    // zoning history section.
    if (rows.length === 0) {
      retrievalSource = 'legistar';
      try {
        let fallbackComplete = false;
        // Fetch every available page. The shared deadline is the safety bound,
        // and its result is reported to the user as partial coverage.
        for (let skip = 0; ; skip += 200) {
          const remaining = deadline - Date.now();
          if (remaining < 2000) {
            complete = false;
            coverageNotes.push('The City Clerk fallback reached its time limit before every matching page could be read.');
            break;
          }
          const url = `${LEGISTAR_BASE}/Matters?$filter=${encodeURIComponent(filterClause)}&$orderby=MatterIntroDate%20desc&$top=200&$skip=${skip}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(Math.min(8000, remaining)) });
          if (!resp.ok) {
            complete = false;
            coverageNotes.push(`The City Clerk fallback stopped responding while reading results for ${streetTerm}.`);
            break;
          }
          const page = await resp.json();
          if (!Array.isArray(page) || page.length === 0) {
            fallbackComplete = true;
            break;
          }
          rows = rows.concat(page);
          if (page.length < 200) {
            fallbackComplete = true;
            break;
          }
        }
        if (!fallbackComplete && rows.length === 0) {
          complete = false;
        }
      } catch {
        complete = false;
        coverageNotes.push(`The City Clerk fallback could not finish the search for ${streetTerm}.`);
      }
    }

    if (retrievalSource === 'councilmatic') {
      console.log(`[zoningHistory] Using Councilmatic as primary source for "${streetTerm}"`);
    } else if (rows.length > 0) {
      console.warn(`[zoningHistory] Councilmatic returned no rows for "${streetTerm}"; using Legistar fallback`);
    }
    rows = rows.map(row => ({ ...row, retrievalSource }));

    // Keep only matters whose title contains a house number (or range) covering
    // one of ours, immediately before the searched street term.
    const targetNums = nums.map((n) => parseInt(n, 10));
    const numBeforeStreet = new RegExp(
      // (?<![\d-]) guard: "1522 N Claremont" must not re-match as "522 N Claremont"
      `(?<![\\d-])(\\d+(?:\\s*[-\\u2013\\u2014/]\\s*\\d+)?)\\s+${streetTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`,
      'gi',
    );
    for (const m of rows) {
      // Dedupe key: MatterId, falling back to GUID/file number, then title+date
      const dedupeKey = m?.MatterId != null ? `id:${m.MatterId}`
        : m?.MatterGuid ? `guid:${m.MatterGuid}`
        : m?.MatterFile ? `file:${m.MatterFile}`
        : `t:${String(m?.MatterTitle || '').replace(/\s+/g, ' ').trim()}|${String(m?.MatterIntroDate || '')}`;
      if (seen.has(dedupeKey)) continue;
      const title = String(m?.MatterTitle || '').replace(/\s+/g, ' ');
      let match: RegExpExecArray | null;
      let hit = false;
      numBeforeStreet.lastIndex = 0;
      while ((match = numBeforeStreet.exec(title)) !== null) {
        const token = match[1].replace(/\s*[\u2013\u2014/]\s*/g, '-').replace(/\s*-\s*/g, '-');
        if (nums.some((n, i) => houseTokensMatch(n, token) || houseNumberMatches(targetNums[i], token))) { hit = true; break; }
      }
      if (hit) {
        seen.add(dedupeKey);
        data.push(m);
      }
    }
  }
  const coverage: ZoningHistoryCoverage['cityCouncil'] = {
    complete,
    note: complete
      ? 'All matching pages available from the City Council source were searched.'
      : Array.from(new Set(coverageNotes)).join(' ') || 'The City Council archive search could not be completed.',
  };
  if (data.length === 0) return { items: [], coverage };
  // Newest first across merged groups
  data.sort((a: any, b: any) => String(b?.MatterIntroDate || '').localeCompare(String(a?.MatterIntroDate || '')));

  const ZONING_KEYWORDS = [
    'zoning', 'rezoning', 'rezone', 'map amendment', 'special use', 'variance',
    'planned development', 'pd ', ' pd', 'use district', 'bulk', 'setback',
  ];

  const filtered = data.filter((m: any) => {
    const title = (m.MatterTitle || '').toLowerCase();
    return ZONING_KEYWORDS.some(kw => title.includes(kw));
  });

  const top5 = filtered.slice(0, 5);

  // Fetch Legistar attachment URLs and Councilmatic data in parallel
  const [attachmentUrlResults, councilmaticResults] = await Promise.all([
    Promise.all(top5.map((m: any) => fetchMatterAttachmentUrl(m.MatterId))),
    Promise.all(top5.map((m: any) => {
      const fileNum = (m.MatterFile || '').trim();
      return fileNum ? fetchCouncilmaticData(fileNum) : Promise.resolve(null);
    })),
  ]);

  // For each matter with Councilmatic PDFs, extract zone codes + contacts.
  // Limit to 3 PDF fetches to keep response time reasonable.
  type PdfData = {
    fromZone?: string; toZone?: string;
    presentZoning?: string; proposedZoning?: string;
    applicationReason?: string; proposedUse?: string; existingPropertyContext?: string; developmentAddress?: string;
    zoningAttorney?: ZoningContact; architect?: ZoningContact;
    enriched?: boolean;
  };
  const pdfResults: PdfData[] = new Array(top5.length).fill({});
  let pdfFetches = 0;
  const pdfPromises = top5.map(async (m: any, idx: number) => {
    const cm = councilmaticResults[idx];
    if (!cm) return {};
    let combined: PdfData = {
      fromZone: cm.fromZone,
      toZone: cm.toZone,
      presentZoning: cm.presentZoning,
      proposedZoning: cm.proposedZoning,
      applicationReason: cm.applicationReason,
      proposedUse: cm.proposedUse,
      existingPropertyContext: cm.existingPropertyContext,
      developmentAddress: cm.developmentAddress,
      zoningAttorney: cm.zoningAttorney,
      architect: cm.architect,
    };
    // Councilmatic itself is a completed enrichment pass when it has no
    // attachments. A filing beyond the PDF cap must remain visibly "not
    // checked", rather than letting absent contacts read as a finding.
    if (cm.pdfUrls.length === 0) return { ...combined, enriched: true };
    if (pdfFetches >= 3) return { ...combined, enriched: false };
    pdfFetches++;
    // Two-pass strategy: try small PDFs first (≤1MB, likely the application form
    // with structured attorney/zone info), then fall back to larger files.
    for (const maxBytes of [1_000_000, 4_000_000]) {
      for (const pdfUrl of cm.pdfUrls) {
        const data = await extractZonesFromPdf(pdfUrl, maxBytes);
        combined = { ...combined, ...data };
        if (combined.fromZone && combined.toZone && combined.zoningAttorney) break;
      }
      if (combined.fromZone && combined.toZone && combined.zoningAttorney) break;
    }
    return { ...combined, enriched: true };
  });
  const resolvedPdf = await Promise.all(pdfPromises);
  resolvedPdf.forEach((d, i) => { pdfResults[i] = d; });

  const items = filtered.map((m: any, idx: number) => {
    const matterId = m.MatterId;
    const matterGuid = m.MatterGuid || '';
    const ordinanceId = m.MatterFile || '';
    const title = m.MatterTitle || '';
    const statusName: string = m.MatterStatusName || m.MatterStatus || '';
    const bodyName: string = m.MatterBodyName || '';
    const introDate = m.MatterIntroDate ? m.MatterIntroDate.slice(0, 10) : '';
    const passedDate = m.MatterPassedDate ? m.MatterPassedDate.slice(0, 10) : '';
    const enactmentNumber: string = m.MatterEnactmentNumber || '';
    const legistarUrl = matterId
      ? `https://chicago.legistar.com/LegislationDetail.aspx?ID=${matterId}&GUID=${matterGuid}`
      : undefined;

    const isTop5 = idx < 5;
    const legistarAttUrl = isTop5 ? attachmentUrlResults[idx] : undefined;
    const cm = isTop5 ? councilmaticResults[idx] : null;
    const pdfData = isTop5 ? pdfResults[idx] : {};

    // Pick best PDF URL: prefer Councilmatic blob URL (more reliable than Legistar ord.legistar.com)
    const councilmaticPdfUrl = cm?.pdfUrls?.[0];
    const attachmentUrl = councilmaticPdfUrl || legistarAttUrl;
    const councilmaticUrl = cm?.url;
    const source = m.retrievalSource === 'councilmatic'
      ? 'Chicago Councilmatic (City Council record)'
      : 'Chicago City Clerk (Legistar)';

    const actionType = parseActionType(title);
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let description = '';
    if (enactmentNumber) {
      description = `${actionType} enacted as ${enactmentNumber}`;
      if (passedDate) description += ` on ${fmt(passedDate)}`;
    } else if (passedDate) {
      description = `${actionType} passed by City Council on ${fmt(passedDate)}`;
    } else if (bodyName) {
      description = statusName === 'Introduced'
        ? `${actionType} introduced — referred to ${bodyName}`
        : `${actionType} — ${statusName} · ${bodyName}`;
    } else {
      description = `${actionType} — ${statusName}`;
    }

    return {
      type: 'legistar' as const,
      date: introDate,
      introducedDate: introDate || undefined,
      passedDate: passedDate || undefined,
      status: statusName || undefined,
      actionType,
      title: title.length > 120 ? title.slice(0, 117) + '…' : title,
      description,
      ordinanceId,
      legistarUrl,
      councilmaticUrl,
      attachmentUrl,
      fromZone: pdfData.fromZone,
      toZone: pdfData.toZone,
      presentZoning: pdfData.presentZoning,
      proposedZoning: pdfData.proposedZoning,
      applicationReason: pdfData.applicationReason,
      proposedUse: pdfData.proposedUse,
      existingPropertyContext: pdfData.existingPropertyContext,
      developmentAddress: pdfData.developmentAddress,
      zoningAttorney: pdfData.zoningAttorney,
      architect: pdfData.architect,
      enriched: pdfData.enriched ?? false,
      source,
    };
  });
  return { items, coverage };
}

interface ZbaLookup {
  items: ZoningHistoryItem[];
  coverage: ZoningHistoryCoverage['zba'];
}

function isoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function zbaDecisionLabel(outcome: string | null | undefined): string {
  const normalized = String(outcome || '').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'denied') return 'Denied';
  if (normalized === 'withdrawn') return 'Withdrawn';
  if (normalized === 'continued') return 'Continued';
  return 'Recorded';
}

function zbaReliefSummary(rawText: string | null | undefined): string | undefined {
  if (!rawText) return undefined;
  const text = rawText.replace(/\s+/g, ' ').trim();
  const nature = text.match(
    /\bNATURE\s+OF\s+REQUEST\s*:?\s*(.*?)(?=\s+\bACTION\s+OF\s+(?:THE\s+)?BOARD\b|\s+\bTHE\s+RESOLUTION\b|\s+\bWHEREAS\b|$)/i,
  )?.[1]?.trim();
  if (!nature) return undefined;
  return nature.length > 520 ? `${nature.slice(0, 517).trimEnd()}…` : nature;
}

function canonicalZbaAddress(address: string | null | undefined): string {
  if (!address) return '';
  const parsed = normalizeStreetForSearch(address);
  if (parsed) return `${parsed.num}|${parsed.dir}|${parsed.street.toUpperCase()}`;
  return normalizeAddressForMatch(address);
}

async function fetchAddressZba(addresses: string[]): Promise<ZbaLookup> {
  const streetTerms = Array.from(new Set(
    addresses
      .map(normalizeStreetForSearch)
      .filter((parsed): parsed is NonNullable<typeof parsed> => !!parsed)
      .map(parsed => parsed.street),
  ));
  const defaultCoverage: ZoningHistoryCoverage['zba'] = {
    complete: false,
    checked: false,
    note: 'No searchable street address was supplied for the Zoning Board of Appeals archive.',
  };
  if (!streetTerms.length) return { items: [], coverage: defaultCoverage };
  let historicRows: Array<typeof zbaCases.$inferSelect> = [];
  let earliestIndexedDate: string | undefined;
  let latestIndexedDate: string | undefined;
  let historicError: string | undefined;
  try {
    const conditions = streetTerms.map(street => ilike(zbaCases.propertyAddress, `%${street}%`));
    const [rows, bounds] = await Promise.all([
      db.select().from(zbaCases).where(or(...conditions)),
      db.select({
        earliest: sql<unknown>`min(${zbaCases.decisionDate})`,
        latest: sql<unknown>`max(${zbaCases.decisionDate})`,
      }).from(zbaCases),
    ]);
    historicRows = rows;
    earliestIndexedDate = isoDate(bounds[0]?.earliest);
    latestIndexedDate = isoDate(bounds[0]?.latest);
  } catch (error) {
    historicError = error instanceof Error ? error.message : 'The historic ZBA index could not be read.';
  }

  let currentRows: Awaited<ReturnType<typeof import('./zbaApprovals')['getAllZbaApprovals']>> = [];
  let currentError: string | undefined;
  try {
    const { getAllZbaApprovals } = await import('./zbaApprovals');
    currentRows = await getAllZbaApprovals();
  } catch (error) {
    currentError = error instanceof Error ? error.message : 'The current ZBA decisions could not be read.';
  }

  const items: ZoningHistoryItem[] = [];
  const seen = new Set<string>();
  const addItem = (item: ZoningHistoryItem) => {
    // Historic rows can contain legitimate continuation and final-decision
    // events for the same case, so their source date remains part of the key.
    const key = `${item.ordinanceId || item.title}|${item.date}|${canonicalZbaAddress(item.matchedAddress)}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const row of historicRows) {
    if (!row.propertyAddress || !addresses.some(address => addressesMatch(row.propertyAddress!, address))) continue;
    const decision = zbaDecisionLabel(row.outcome);
    const relief = zbaReliefSummary(row.rawCaseText);
    addItem({
      type: 'zba',
      date: isoDate(row.decisionDate) || '',
      title: row.caseId ? `ZBA Case ${row.caseId}` : 'ZBA decision',
      description: relief || 'Historic Zoning Board of Appeals decision record.',
      ordinanceId: row.caseId || undefined,
      attachmentUrl: row.pdfUrl,
      decision,
      enriched: true,
      matchedAddress: row.propertyAddress,
      source: 'Chicago Zoning Board of Appeals (historic resolution)',
    });
  }

  for (const row of currentRows) {
    if (!addresses.some(address => addressesMatch(row.address, address))) continue;
    const canonicalAddress = canonicalZbaAddress(row.address);
    // The monthly feed may use a fallback meeting date while the signed
    // resolution carries its actual date. Prefer the signed resolution when
    // it records the same case and decision; keep a distinct continued/final
    // pair because those are separate timeline events.
    const alreadyInHistoricArchive = items.some(item =>
      item.ordinanceId === row.caseNumber
      && canonicalZbaAddress(item.matchedAddress) === canonicalAddress
      && item.decision === row.decision,
    );
    if (alreadyInHistoricArchive) continue;
    addItem({
      type: 'zba',
      date: row.meetingDate || '',
      title: row.subject || `ZBA Case ${row.caseNumber}`,
      description: row.subject || 'Current Zoning Board of Appeals decision record.',
      ordinanceId: row.caseNumber,
      attachmentUrl: row.sourceUrl,
      decision: row.decision,
      applicant: row.applicant || undefined,
      enriched: true,
      matchedAddress: row.address,
      source: 'Chicago Zoning Board of Appeals (current monthly decisions)',
    });
  }

  const indexRange = earliestIndexedDate && latestIndexedDate
    ? `${earliestIndexedDate} through ${latestIndexedDate}`
    : 'an unknown date range';
  const issues = [historicError, currentError].filter(Boolean);
  return {
    items,
    coverage: {
      complete: false,
      checked: true,
      earliestIndexedDate,
      latestIndexedDate,
      note: issues.length
        ? `ZBA coverage is partial: ${issues.join(' ')}`
        : `Historic ZBA decisions are indexed from ${indexRange}; current monthly decisions are checked separately. The City's public archive does not establish complete coverage before the earliest indexed date.`,
    },
  };
}

export async function getZoningHistory(params: {
  address: string;
  /** Retained for backwards-compatible callers; ZBA history is matched by address, never by current ward. */
  ward?: number | null;
  /** Co-parcel / companion addresses (verified assemblage) searched alongside the subject. */
  altAddresses?: string[];
}): Promise<{ items: ZoningHistoryItem[]; address: string; coverage: ZoningHistoryCoverage }> {
  const { address, altAddresses } = params;
  const targets = [address, ...(altAddresses || [])].filter(Boolean).slice(0, 4);

  const [cityCouncilResult, zbaResult] = await Promise.allSettled([
    fetchLegistarOrdinances(targets),
    fetchAddressZba(targets),
  ]);

  const cityCouncilCoverage: ZoningHistoryCoverage['cityCouncil'] = cityCouncilResult.status === 'fulfilled'
    ? cityCouncilResult.value.coverage
    : { complete: false, note: 'The City Council archive could not be searched.' };
  const zbaCoverage: ZoningHistoryCoverage['zba'] = zbaResult.status === 'fulfilled'
    ? zbaResult.value.coverage
    : { complete: false, note: 'The Zoning Board of Appeals archive could not be searched.' };

  const deduped = new Map<string, ZoningHistoryItem>();
  for (const item of [
    ...(cityCouncilResult.status === 'fulfilled' ? cityCouncilResult.value.items : []),
    ...(zbaResult.status === 'fulfilled' ? zbaResult.value.items : []),
  ]) {
    const key = item.type === 'zba'
      ? `zba:${item.ordinanceId || item.title}|${item.date}|${item.matchedAddress || ''}`
      : `council:${item.ordinanceId || item.title}|${item.date}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  const items = Array.from(deduped.values());
  items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return {
    items,
    address,
    coverage: {
      generatedAt: new Date().toISOString(),
      cityCouncil: cityCouncilCoverage,
      zba: zbaCoverage,
    },
  };
}
