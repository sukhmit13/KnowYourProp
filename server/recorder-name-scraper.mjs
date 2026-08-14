// Standalone Playwright scraper for Cook County Clerk Recorder of Deeds — NAME search
// Run as child process: node recorder-name-scraper.mjs <ownerName>
// Output: JSON result on stdout (personal liens against the named person)
//
// Uses the simple GET search endpoint: /Search/Result?id1=<name>
// This searches all documents (grantor + grantee) for the given name.
// We then filter results to personal lien types only.

const ownerName = process.argv[2];
if (!ownerName || ownerName.trim().length < 2) {
  process.stdout.write(JSON.stringify({ error: 'No owner name provided' }));
  process.exit(1);
}

const PERSONAL_LIEN_TYPES = [
  'JUDGMENT', 'JUDGEMENT', 'CIVIL JUDGMENT', 'MONEY JUDGMENT',
  'FED TAX LIEN', 'FEDERAL TAX LIEN', 'IRS LIEN', 'INTERNAL REVENUE',
  'STATE TAX LIEN', 'IL TAX LIEN', 'ILLINOIS TAX', 'IDOR LIEN',
  'INCOME TAX LIEN', 'DEPT OF REVENUE', 'DEPT REVENUE',
  'IL DEPT REVENUE', 'REVENUE LIEN', 'DEPT OF REV',
  // Cook County Recorder files IL Dept of Revenue / state liens as "STATE LIEN"
  // "RELEASE STATE LIEN" also contains this substring, so both are captured
  'STATE LIEN',
  'MECHANICS LIEN', "MECHANIC'S LIEN", 'MATERIALMAN LIEN',
  'CHILD SUPPORT LIEN', 'CHILD SUPPORT', 'SPOUSAL SUPPORT',
  'NOTICE OF LIEN', 'LIEN NOTICE',
  'ATTACHMENT', 'GARNISHMENT',
];

function isPersonalLienType(docType) {
  const t = (docType || '').toUpperCase().trim();
  return PERSONAL_LIEN_TYPES.some(kw => t.includes(kw));
}

function categorizeOwnerLien(docType) {
  const t = (docType || '').toUpperCase().trim();
  if (t.includes('JUDGMENT') || t.includes('JUDGEMENT') || t.includes('ATTACHMENT') || t.includes('GARNISHMENT')) return 'judgment';
  if (t.includes('FED TAX') || t.includes('FEDERAL TAX') || t.includes('IRS') || t.includes('INTERNAL REVENUE') || t.includes('INCOME TAX')) return 'federal_tax';
  if (t.includes('STATE TAX') || t.includes('IL TAX') || t.includes('ILLINOIS TAX') || t.includes('IDOR') || t.includes('DEPT OF REVENUE') || t.includes('DEPT REVENUE') || t.includes('IL DEPT REVENUE') || t.includes('REVENUE LIEN') || t.includes('STATE LIEN')) return 'state_tax';
  if (t.includes('MECHANIC') || t.includes('MATERIALMAN')) return 'mechanic';
  if (t.includes('CHILD SUPPORT') || t.includes('SPOUSAL SUPPORT') || t.includes('ALIMONY')) return 'support';
  return 'other_lien';
}

const searchUrl = `https://crs.cookcountyclerkil.gov/Search/Result?id1=${encodeURIComponent(ownerName)}`;

process.stderr.write(`[name-scraper] Searching owner liens for: ${ownerName}\n`);
process.stderr.write(`[name-scraper] URL: ${searchUrl}\n`);

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  });

  // Direct GET request — no form submission, no CSRF, no navigation race conditions
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const resultUrl = page.url();
  process.stderr.write(`[name-scraper] Result URL: ${resultUrl}\n`);

  // Check for no-results message
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasNoResults = /no records|no results|no documents found/i.test(bodyText);

  if (hasNoResults) {
    process.stderr.write(`[name-scraper] No results found for: ${ownerName}\n`);
    process.stdout.write(JSON.stringify({
      success: true,
      ownerName,
      ownerLiens: [],
      totalDocsReturned: 0,
      scrapedAt: new Date().toISOString(),
    }));
    process.exit(0);
  }

  // Parse the results table
  const rawDocs = await page.evaluate(() => {
    const rows = [];
    const table = document.querySelector('table');
    if (!table) return rows;

    const allRows = table.querySelectorAll('tr');
    if (allRows.length < 2) return rows;

    const headerCells = Array.from(allRows[0].querySelectorAll('th, td')).map(c => c.innerText.trim().toLowerCase());

    const docNumIdx = headerCells.findIndex(h => h.includes('doc number') || h.includes('doc num') || h.includes('document number'));
    const recordedIdx = headerCells.findIndex(h => h.includes('recorded'));
    const typeIdx = headerCells.findIndex(h => h.includes('type') || h.includes('doc type'));
    const grantorIdx = headerCells.findIndex(h => h.includes('grantor'));
    const granteeIdx = headerCells.findIndex(h => h.includes('grantee'));

    const useDocNum = docNumIdx >= 0 ? docNumIdx : 2;
    const useRecorded = recordedIdx >= 0 ? recordedIdx : 3;
    const useType = typeIdx >= 0 ? typeIdx : 5;
    const useGrantor = grantorIdx >= 0 ? grantorIdx : -1;
    const useGrantee = granteeIdx >= 0 ? granteeIdx : -1;

    for (let i = 1; i < allRows.length; i++) {
      const cells = Array.from(allRows[i].querySelectorAll('td'));
      if (cells.length < 3) continue;
      const texts = cells.map(c => c.innerText.trim());
      const docNumber = useDocNum < texts.length ? texts[useDocNum] : '';
      const docType = useType < texts.length ? texts[useType] : '';
      const recorded = useRecorded < texts.length ? texts[useRecorded] : '';
      const grantor = useGrantor >= 0 && useGrantor < texts.length ? texts[useGrantor] : '';
      const grantee = useGrantee >= 0 && useGrantee < texts.length ? texts[useGrantee] : '';
      if (!docNumber && !docType) continue;
      // Extract the direct link to the document detail page from the doc number cell anchor
      const docCell = useDocNum < cells.length ? cells[useDocNum] : null;
      const viewLink = docCell ? (docCell.querySelector('a')?.href || '').replace(/&amp;/g, '&') : '';
      rows.push({ documentNumber: docNumber, documentType: docType, recordedDate: recorded, grantor, grantee, viewLink });
    }
    return rows;
  });

  process.stderr.write(`[name-scraper] Raw documents found: ${rawDocs.length}\n`);

  // Filter to personal lien types only
  const personalLiens = rawDocs
    .filter(d => isPersonalLienType(d.documentType))
    .map(d => ({
      documentNumber: d.documentNumber,
      documentType: d.documentType,
      recordedDate: d.recordedDate,
      grantor: d.grantor,
      grantee: d.grantee,
      amount: 0,
      category: categorizeOwnerLien(d.documentType),
    }));

  process.stderr.write(`[name-scraper] Personal liens found: ${personalLiens.length} of ${rawDocs.length} total docs\n`);
  if (personalLiens.length > 0) {
    process.stderr.write(`[name-scraper] Types: ${personalLiens.map(d => d.documentType).join(', ')}\n`);
  }
  if (rawDocs.length > 0) {
    const allTypes = [...new Set(rawDocs.map(d => d.documentType))];
    process.stderr.write(`[name-scraper] All doc types seen: ${allTypes.join(', ')}\n`);
  }

  process.stdout.write(JSON.stringify({
    success: true,
    ownerName,
    ownerLiens: personalLiens,
    totalDocsReturned: rawDocs.length,
    scrapedAt: new Date().toISOString(),
  }));
} catch (err) {
  process.stderr.write(`[name-scraper] Error: ${err.message}\n${err.stack}\n`);
  process.stdout.write(JSON.stringify({ error: err.message, ownerName }));
} finally {
  await browser.close();
}
