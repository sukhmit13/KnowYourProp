
import { inflateSync } from 'zlib';

const LEGISTAR_BASE = 'https://webapi.legistar.com/v1/chicago';

export interface ZoningContact {
  name: string;
  firm?: string;
  email?: string;
}

export interface ZoningHistoryItem {
  type: 'legistar' | 'zba';
  date: string;
  title: string;
  description: string;
  ordinanceId?: string;
  legistarUrl?: string;
  councilmaticUrl?: string;
  attachmentUrl?: string;
  fromZone?: string;
  toZone?: string;
  zoningAttorney?: ZoningContact;
  architect?: ZoningContact;
  decision?: string;
  source: string;
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
    .replace(/\b(NORTH|SOUTH|EAST|WEST)\b/g, '')
    .replace(/\b(N|S|E|W)\.?\b/g, '')
    .replace(/\b(AVENUE|AVE|STREET|ST|ROAD|RD|BOULEVARD|BLVD|DRIVE|DR|PLACE|PL|COURT|CT|LANE|LN|FLOOR|FL|SUITE|STE|UNIT)\b\.?/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddressForMatch(a);
  const nb = normalizeAddressForMatch(b);
  if (!na || !nb) return false;
  const partsA = na.split(' ').filter(Boolean);
  const partsB = nb.split(' ').filter(Boolean);
  if (partsA[0] !== partsB[0]) return false;
  const streetA = partsA.slice(1).join(' ');
  const streetB = partsB.slice(1).join(' ');
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

function normalizeZoneCode(raw: string): string {
  // Fix OCR artifact: lowercase 'l' in digit position → '1'
  // e.g. "Bl-2" → "B1-2", "Cl-2" → "C1-2"
  return raw.replace(/([A-Z])l(-\d)/g, '$11$2').replace(/([A-Z])L(-\d)/g, '$11$2');
}

function extractZonesFromPdfText(text: string): { fromZone?: string; toZone?: string } {
  // Chicago zone code pattern: 1-3 uppercase letters, optional digit/l, hyphen, 1-2 digits, optional decimal+digit, optional suffix letter
  const ZONE_PAT = '[A-Z]{1,3}[0-9lL]?-[0-9]{1,2}(?:\\.[0-9])?[A-Z]?';
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

function extractContactsFromPdfText(text: string): { zoningAttorney?: ZoningContact; architect?: ZoningContact } {
  const result: { zoningAttorney?: ZoningContact; architect?: ZoningContact } = {};

  // ── Zoning Attorney ────────────────────────────────────────────────────────
  // The Chicago DPD application form has a dedicated section introduced by
  // "representative for the rezoning". This disambiguates from other lawyers
  // (e.g., corporate counsel, EDS preparers).
  const attorneySection = text.match(
    /representative for the rezoning[\s\S]{0,300}?ATTORNEY\s+(.*?)\s+ADDRESS/i,
  );
  if (attorneySection) {
    const raw = attorneySection[1].trim();
    // Strip trailing OCR artifacts (alphanumeric garbage before real text ends)
    const cleaned = raw.replace(/\s*[a-z0-9,]{3,12}v\d+\s*$/, '').trim();
    // Split on " - " or " – " to separate names from firm
    const dashIdx = cleaned.indexOf(' - ');
    const eName = dashIdx >= 0 ? cleaned.slice(0, dashIdx).trim() : cleaned;
    const eFirm = dashIdx >= 0 ? cleaned.slice(dashIdx + 3).trim() : undefined;

    // Extract email: look in the chunk just after ATTORNEY ... up to next major section
    const afterAttorney = text.slice(text.indexOf(raw));
    const emailMatch = afterAttorney.match(
      /EMAIL\s+([\w.+%-]+@[\w.-]+\.[A-Za-z]{2,})/i,
    );
    const rawEmail = emailMatch?.[1]?.replace(/,/g, '') ?? undefined;

    result.zoningAttorney = {
      name: eName,
      firm: eFirm,
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

async function extractZonesFromPdf(pdfUrl: string, maxBytes = 4_000_000): Promise<{ fromZone?: string; toZone?: string; zoningAttorney?: ZoningContact; architect?: ZoningContact }> {
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
    return { ...zones, ...contacts };
  } catch {
    return {};
  }
}

interface CouncilmaticResult {
  url: string;
  pdfUrls: string[];
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

    // Extract PDF links from proxy.councilmatic.org
    const pdfUrls: string[] = [];
    const proxyPattern = /href="(https:\/\/proxy\.councilmatic\.org\/\?url=https:\/\/occprodstoragev1\.blob\.core\.usgovcloudapi\.net\/matterattachmentspublic\/[^"]+\.pdf)"/gi;
    let m;
    while ((m = proxyPattern.exec(html)) !== null) {
      // Use the direct blob URL (avoids the proxy layer)
      const directUrl = m[1].replace('https://proxy.councilmatic.org/?url=', '');
      pdfUrls.push(directUrl);
    }

    return { url, pdfUrls };
  } catch {
    return null;
  }
}

async function fetchMatterAttachmentUrl(matterId: number): Promise<string | undefined> {
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

async function fetchLegistarOrdinances(address: string): Promise<ZoningHistoryItem[]> {
  const parsed = normalizeStreetForSearch(address);
  if (!parsed) return [];

  const searchTerm = parsed.dir
    ? `${parsed.num} ${parsed.dir} ${parsed.street}`
    : `${parsed.num} ${parsed.street}`;

  const escaped = searchTerm.replace(/'/g, "''");
  const filterClause = `substringof('${escaped}',MatterTitle)`;
  const url = `${LEGISTAR_BASE}/Matters?$filter=${encodeURIComponent(filterClause)}&$orderby=MatterIntroDate%20desc&$top=25`;

  let data: any[];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    data = await resp.json();
  } catch {
    return [];
  }

  if (!Array.isArray(data)) return [];

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
    zoningAttorney?: ZoningContact; architect?: ZoningContact;
  };
  const pdfResults: PdfData[] = new Array(top5.length).fill({});
  let pdfFetches = 0;
  const pdfPromises = top5.map(async (m: any, idx: number) => {
    const cm = councilmaticResults[idx];
    if (!cm || cm.pdfUrls.length === 0 || pdfFetches >= 3) return {};
    pdfFetches++;
    // Two-pass strategy: try small PDFs first (≤1MB, likely the application form
    // with structured attorney/zone info), then fall back to larger files.
    let combined: PdfData = {};
    for (const maxBytes of [1_000_000, 4_000_000]) {
      for (const pdfUrl of cm.pdfUrls) {
        const data = await extractZonesFromPdf(pdfUrl, maxBytes);
        combined = { ...combined, ...data };
        if (combined.fromZone && combined.toZone && combined.zoningAttorney) break;
      }
      if (combined.fromZone || combined.zoningAttorney) break;
    }
    return combined;
  });
  const resolvedPdf = await Promise.all(pdfPromises);
  resolvedPdf.forEach((d, i) => { pdfResults[i] = d; });

  return filtered.map((m: any, idx: number) => {
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
      title: title.length > 120 ? title.slice(0, 117) + '…' : title,
      description,
      ordinanceId,
      legistarUrl,
      councilmaticUrl,
      attachmentUrl,
      fromZone: pdfData.fromZone,
      toZone: pdfData.toZone,
      zoningAttorney: pdfData.zoningAttorney,
      architect: pdfData.architect,
      source: 'Chicago City Clerk (Legistar)',
    };
  });
}

export async function getZoningHistory(params: {
  address: string;
  ward?: number | null;
}): Promise<{ items: ZoningHistoryItem[]; address: string }> {
  const { address, ward } = params;

  const [legistarItems, zbaItems] = await Promise.allSettled([
    fetchLegistarOrdinances(address),
    fetchAddressZba(address, ward),
  ]);

  const items: ZoningHistoryItem[] = [];

  if (legistarItems.status === 'fulfilled') {
    items.push(...legistarItems.value);
  }
  if (zbaItems.status === 'fulfilled') {
    items.push(...zbaItems.value);
  }

  items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return { items, address };
}

async function fetchAddressZba(address: string, ward?: number | null): Promise<ZoningHistoryItem[]> {
  try {
    const { getZbaApprovals } = await import('./zbaApprovals');
    const wardNum = ward ?? 1;
    const all = await getZbaApprovals(wardNum);

    const matched = all.filter(a => addressesMatch(a.address, address));
    return matched.map(a => ({
      type: 'zba' as const,
      date: a.meetingDate || '',
      title: a.subject || `ZBA Case ${a.caseNumber}`,
      description: `${a.applicant || ''}`,
      ordinanceId: a.caseNumber,
      decision: a.decision,
      source: 'Zoning Board of Appeals',
    }));
  } catch {
    return [];
  }
}
