// Standalone Playwright scraper for Cook County Clerk Recorder of Deeds
// Run as child process: node recorder-scraper.mjs <pin>
// Output: JSON result on stdout
// 
// Goes directly to ResultByPin page — no CAPTCHA, no form submission required.
// Table columns: [0: empty, 1: "View" link, 2: Doc Number, 3: Doc Recorded, 4: Doc Executed, 5: Doc Type]

const pin = process.argv[2];
if (!pin) {
  process.stdout.write(JSON.stringify({ error: 'No PIN provided' }));
  process.exit(1);
}

function normalizePin(rawPin) {
  return rawPin.replace(/[^0-9]/g, '');
}

function categorizeDocType(docType) {
  const t = (docType || '').toLowerCase().trim();
  if (t.includes('mortgage') || t.includes('mtg') || t.includes('deed of trust') || t === 'trust deed') return 'mortgage';
  if (t.includes('release') || t.includes('satisfaction') || t.includes('discharge') || t.includes('reconveyance') || t.includes('rls') || t.includes('rel ')) return 'release';
  if (t.includes('foreclos') || t.includes('notice of default') || t.includes('notice of sale')) return 'foreclosure';
  if (t.includes('lis pendens') || t.includes('lispend')) return 'litigation';
  if (t.includes('judgment') || t.includes('judgement') || t.includes('levy') || t === 'fed tax lien' || t.includes('federal tax')) return 'lien';
  if (t.includes('lien') || t.includes('mechanic') || t.includes('water') || t.includes('sewer') || t.includes('hoa') || t.includes('assessment lien')) return 'lien';
  if (t.includes('deed') || t.includes('grant') || t.includes('quitclaim') || t.includes('quit claim') || t.includes('warranty') || t === 'wd' || t === 'qcd') return 'deed';
  if (t.includes('assignment') || t.includes('modification') || t.includes('subordination') || t.includes('extension')) return 'other';
  return 'other';
}

const normalizedPin = normalizePin(pin);
const directUrl = `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${normalizedPin}`;

process.stderr.write(`[recorder] Fetching documents for PIN: ${normalizedPin}\n`);
process.stderr.write(`[recorder] URL: ${directUrl}\n`);

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

  await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  process.stderr.write(`[recorder] Page loaded: ${page.url()}\n`);

  const bodyText = await page.evaluate(() => document.body.innerText);

  // Check for no results
  if (/no records|no results|no documents/i.test(bodyText) && !(await page.locator('table tr').count() > 2)) {
    process.stderr.write('[recorder] No documents found\n');
    process.stdout.write(JSON.stringify({ success: true, documents: [], noResults: true, scrapedAt: new Date().toISOString() }));
    process.exit(0);
  }

  // Parse the table
  // Expected: [0: empty checkbox, 1: "View" link, 2: Doc Number, 3: Doc Recorded, 4: Doc Executed, 5: Doc Type]
  const documents = await page.evaluate(() => {
    const rows = [];
    const table = document.querySelector('table');
    if (!table) return rows;

    const allRows = table.querySelectorAll('tr');
    // Detect header row to determine column offsets
    const headerRow = allRows[0];
    const headerCells = Array.from(headerRow ? headerRow.querySelectorAll('th, td') : []).map(c => c.innerText.trim().toLowerCase());
    
    const docNumIdx = headerCells.findIndex(h => h.includes('doc number') || h.includes('doc num') || h.includes('document number'));
    const recordedIdx = headerCells.findIndex(h => h.includes('recorded'));
    const executedIdx = headerCells.findIndex(h => h.includes('executed'));
    const typeIdx = headerCells.findIndex(h => h.includes('type') || h.includes('doc type'));
    const grantorIdx = headerCells.findIndex(h => h.includes('grantor'));
    const granteeIdx = headerCells.findIndex(h => h.includes('grantee'));
    const amountIdx = headerCells.findIndex(h => h.includes('amount') || h.includes('consideration'));

    // Fallback to known positions for ResultByPin page: [empty, View, DocNum, Recorded, Executed, DocType]
    const useDocNum = docNumIdx >= 0 ? docNumIdx : 2;
    const useRecorded = recordedIdx >= 0 ? recordedIdx : 3;
    const useExecuted = executedIdx >= 0 ? executedIdx : 4;
    const useType = typeIdx >= 0 ? typeIdx : 5;
    const useGrantor = grantorIdx >= 0 ? grantorIdx : -1;
    const useGrantee = granteeIdx >= 0 ? granteeIdx : -1;
    const useAmount = amountIdx >= 0 ? amountIdx : -1;

    for (let i = 1; i < allRows.length; i++) {
      const cells = Array.from(allRows[i].querySelectorAll('td'));
      if (cells.length < 3) continue;
      const texts = cells.map(c => c.innerText.trim());

      const docNumber = useDocNum < texts.length ? texts[useDocNum] : '';
      const docType = useType < texts.length ? texts[useType] : '';
      const recorded = useRecorded < texts.length ? texts[useRecorded] : '';
      const executed = useExecuted < texts.length ? texts[useExecuted] : '';
      const grantor = useGrantor >= 0 && useGrantor < texts.length ? texts[useGrantor] : '';
      const grantee = useGrantee >= 0 && useGrantee < texts.length ? texts[useGrantee] : '';
      const amountText = useAmount >= 0 && useAmount < texts.length ? texts[useAmount] : '';

      // Capture the "View" link href from column 1 (for deed detail lookup)
      // Decode HTML entities that may appear in href (&amp; → &)
      const viewLink = cells[1] ? (cells[1].querySelector('a')?.href || '').replace(/&amp;/g, '&') : '';

      if (!docNumber && !docType) continue;

      rows.push({
        documentNumber: docNumber,
        documentType: docType,
        recordedDate: recorded,
        executedDate: executed,
        grantor,
        grantee,
        amountText,
        viewLink,
      });
    }
    return rows;
  });

  process.stderr.write(`[recorder] Parsed ${documents.length} documents\n`);

  const enriched = documents.map(doc => {
    const amt = doc.amountText ? parseFloat(doc.amountText.replace(/[$,\s]/g, '')) : 0;
    return {
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      recordedDate: doc.recordedDate,
      grantor: doc.grantor,
      grantee: doc.grantee,
      amount: isNaN(amt) ? 0 : amt,
      category: categorizeDocType(doc.documentType),
      viewLink: doc.viewLink || '',
    };
  });

  process.stderr.write(`[recorder] Categories: ${JSON.stringify(enriched.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {}))}\n`);

  // --- Parallel detail page lookups ---
  // Owner name + all RELEASE Prior Documents are fetched simultaneously in separate browser tabs.
  // This replaces the old sequential approach (one page at a time) and the unreliable Advanced Search.
  // Concurrency: up to 5 tabs open at once.

  const PAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Extract grantor or grantee name from an already-loaded detail page.
  // Uses innerText parsing — finds the "Grantors" or "Grantees" section label in the
  // rendered page text, then reads the first non-header name line beneath it.
  async function extractNameFromPage(p, field) {
    const sectionLabel = field === 'grantee' ? 'Grantees' : 'Grantors';
    const name = await p.evaluate((sectionLabel) => {
      const text = document.body.innerText || '';
      // Case-insensitive search for the section heading
      const re = new RegExp(sectionLabel + '[\\s\\r\\n]', 'i');
      const match = re.exec(text);
      if (!match) return null;
      const afterLabel = text.slice(match.index + match[0].length);
      const lines = afterLabel.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        // Skip column header rows like "Name  Trust#"
        if (/^Name(\s+Trust#?)?$/i.test(line)) continue;
        // Stop if we hit a different section heading
        if (/^Grantors?$/i.test(line) || /^Grantees?$/i.test(line) ||
            /^Legal Description/i.test(line) || /^Document Type/i.test(line)) break;
        // Skip navigation / UI chrome
        if (/^(Back|View|Submit|Add To Cart|Order|Search|Home|Account)$/i.test(line)) continue;
        // Take the first real name line (1-100 chars)
        if (line.length > 1 && line.length < 100) return line.toUpperCase();
      }
      return null;
    }, sectionLabel);
    return name || null;
  }

  // Extract prior document numbers from an already-loaded release detail page.
  // Looks for any heading matching "Prior Documents", "Related Instruments", etc.
  // Falls back to scanning all tables for document-number-shaped cells.
  async function extractPriorDocsFromPage(p) {
    return await p.evaluate(() => {
      const docNumbers = [];

      // Labels that Cook County Recorder uses for prior/related document sections
      const PRIOR_LABELS = /prior\s+doc|related\s+instrument|original\s+doc|releases?\s+doc|referenced\s+doc|prior\s+instrument/i;

      const allElements = Array.from(document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,th,caption,.panel-title,.card-title,strong,b,label,dt,td'
      ));

      let priorTable = null;

      for (const el of allElements) {
        if (!PRIOR_LABELS.test(el.textContent || '')) continue;

        // Walk up to find a TABLE ancestor
        let ancestor = el.parentElement;
        while (ancestor && ancestor.tagName !== 'TABLE' && ancestor.tagName !== 'BODY') ancestor = ancestor.parentElement;
        if (ancestor && ancestor.tagName === 'TABLE') { priorTable = ancestor; break; }

        // Walk next siblings
        let sibling = el.nextElementSibling;
        while (sibling && sibling.tagName !== 'TABLE') sibling = sibling.nextElementSibling;
        if (sibling && sibling.tagName === 'TABLE') { priorTable = sibling; break; }

        // Walk parent chain's next siblings
        let parent = el.parentElement;
        while (parent && !priorTable) {
          let pSibling = parent.nextElementSibling;
          while (pSibling && pSibling.tagName !== 'TABLE') {
            const innerTable = pSibling.querySelector('table');
            if (innerTable) { priorTable = innerTable; break; }
            pSibling = pSibling.nextElementSibling;
          }
          if (!priorTable && pSibling && pSibling.tagName === 'TABLE') priorTable = pSibling;
          if (priorTable) break;
          parent = parent.parentElement;
        }
        if (priorTable) break;
      }

      if (priorTable) {
        const rows = priorTable.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td'));
          for (const cell of cells) {
            const text = (cell.innerText || cell.textContent || '').trim();
            if (/^\d{7,12}$/.test(text)) { docNumbers.push(text); break; }
          }
        }
        if (docNumbers.length > 0) return docNumbers;
      }

      // Fallback: scan ALL tables on the page for doc-number-shaped cells that appear
      // near a heading matching our label pattern
      const allTables = document.querySelectorAll('table');
      for (const tbl of allTables) {
        // Check if any heading directly before this table matches our labels
        let prev = tbl.previousElementSibling;
        let prevText = '';
        while (prev && !prevText) {
          prevText = (prev.textContent || '').trim();
          if (PRIOR_LABELS.test(prevText)) break;
          prevText = '';
          prev = prev.previousElementSibling;
        }
        if (!PRIOR_LABELS.test(prevText)) continue;
        const rows = tbl.querySelectorAll('tr');
        for (let i = 0; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td'));
          for (const cell of cells) {
            const text = (cell.innerText || cell.textContent || '').trim();
            if (/^\d{7,12}$/.test(text)) { docNumbers.push(text); break; }
          }
        }
        if (docNumbers.length > 0) return docNumbers;
      }

      // Debug: return the headings found so the server can log them
      const headingTexts = Array.from(document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,.panel-title,.card-title'
      )).map(e => (e.textContent || '').trim()).filter(t => t.length > 0 && t.length < 60);
      return { __debug_headings: headingTexts };
    });
  }

  // Extract co-parcel PINs and addresses from the "Legal Description and Subdivision" table
  // on a deed document detail page. PINs are formatted as NN-NN-NNN-NNN-NNNN links.
  async function extractLegalDescriptionFromPage(p) {
    return await p.evaluate(() => {
      const results = [];
      const PIN_RE = /\b(\d{2}-\d{2}-\d{3}-\d{3}-\d{4})\b/;

      // Find the "Legal Description and Subdivision" section heading
      const allEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,th,td,div,p,span,button,summary'));
      let legalSection = null;
      for (const el of allEls) {
        if (/legal\s+description/i.test(el.textContent || '')) {
          legalSection = el;
          break;
        }
      }
      if (!legalSection) return results;

      // Walk forward to find the table that contains PIN links
      let target = legalSection.nextElementSibling;
      let safetyLimit = 20;
      while (target && safetyLimit-- > 0) {
        // Found a table — look for PIN-formatted links inside
        const tables = target.tagName === 'TABLE' ? [target] : Array.from(target.querySelectorAll('table'));
        for (const tbl of tables) {
          const rows = Array.from(tbl.querySelectorAll('tr'));
          // Detect header row: look for "PIN" or "Property Index" in header cells
          let headerRow = null;
          let pinColIdx = -1;
          let addrColIdx = -1;
          for (let ri = 0; ri < Math.min(3, rows.length); ri++) {
            const headers = Array.from(rows[ri].querySelectorAll('th,td')).map((c, i) => ({ text: (c.innerText || '').trim().toLowerCase(), idx: i }));
            const pinHeader = headers.find(h => h.text.includes('pin') || h.text.includes('property index'));
            const addrHeader = headers.find(h => h.text.includes('address') || h.text.includes('addr'));
            if (pinHeader) {
              headerRow = ri;
              pinColIdx = pinHeader.idx;
              addrColIdx = addrHeader ? addrHeader.idx : pinColIdx + 1;
              break;
            }
          }
          // Fallback: if no header, scan all rows for PIN-shaped links
          const startRow = headerRow !== null ? headerRow + 1 : 0;
          for (let ri = startRow; ri < rows.length; ri++) {
            const cells = Array.from(rows[ri].querySelectorAll('td'));
            if (cells.length === 0) continue;
            // Look for a PIN link in the expected column or any cell
            let pin = null;
            let address = '';
            if (pinColIdx >= 0 && pinColIdx < cells.length) {
              const cellText = (cells[pinColIdx].innerText || '').trim();
              const m = PIN_RE.exec(cellText);
              if (m) pin = m[1];
              if (addrColIdx >= 0 && addrColIdx < cells.length) {
                address = (cells[addrColIdx].innerText || '').trim().toUpperCase();
              }
            }
            // Fallback: scan all cells for a PIN-shaped value
            if (!pin) {
              for (let ci = 0; ci < cells.length; ci++) {
                const text = (cells[ci].innerText || '').trim();
                const m = PIN_RE.exec(text);
                if (m) {
                  pin = m[1];
                  if (ci + 1 < cells.length) {
                    address = (cells[ci + 1].innerText || '').trim().toUpperCase();
                  }
                  break;
                }
              }
            }
            if (pin) {
              // Normalize: remove hyphens → 14-digit
              const rawPin = pin.replace(/[^0-9]/g, '').padEnd(14, '0');
              // De-duplicate by PIN
              if (!results.some(r => r.pin === rawPin)) {
                results.push({ pin: rawPin, address: address.split('\n')[0].trim() });
              }
            }
          }
          if (results.length > 0) return results;
        }
        // Also search parent containers
        if (target.tagName !== 'TABLE') {
          const innerTables = Array.from(target.querySelectorAll('table'));
          for (const tbl of innerTables) {
            const rows = Array.from(tbl.querySelectorAll('tr'));
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll('td'));
              for (let ci = 0; ci < cells.length; ci++) {
                const text = (cells[ci].innerText || '').trim();
                const m = PIN_RE.exec(text);
                if (m) {
                  const rawPin = m[1].replace(/[^0-9]/g, '').padEnd(14, '0');
                  const address = ci + 1 < cells.length ? (cells[ci + 1].innerText || '').trim().toUpperCase().split('\n')[0].trim() : '';
                  if (!results.some(r => r.pin === rawPin)) {
                    results.push({ pin: rawPin, address });
                  }
                }
              }
            }
          }
          if (results.length > 0) return results;
        }
        target = target.nextElementSibling;
      }
      // Last-resort: scan the whole page for PIN-shaped links near "Legal Description"
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const link of allLinks) {
        const text = (link.innerText || '').trim();
        const m = PIN_RE.exec(text);
        if (m) {
          const rawPin = m[1].replace(/[^0-9]/g, '').padEnd(14, '0');
          // Try to find adjacent address text in parent row
          let address = '';
          const parentRow = link.closest('tr');
          if (parentRow) {
            const cells = Array.from(parentRow.querySelectorAll('td'));
            const linkCellIdx = cells.findIndex(c => c.contains(link));
            if (linkCellIdx >= 0 && linkCellIdx + 1 < cells.length) {
              address = (cells[linkCellIdx + 1].innerText || '').trim().toUpperCase().split('\n')[0].trim();
            }
          }
          if (!results.some(r => r.pin === rawPin)) {
            results.push({ pin: rawPin, address });
          }
        }
      }
      return results;
    });
  }

  // Extract maturity date from a mortgage document detail page.
  // Looks for phrases like "Maturity Date, which is AUGUST 15, 2055"
  async function extractMaturityDateFromPage(p) {
    return await p.evaluate(() => {
      const text = document.body.innerText || '';
      const patterns = [
        /maturity\s+date[,\s]+which\s+is\s+([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
        /not\s+later\s+than\s+(?:the\s+)?maturity\s+date[,\s]+which\s+is\s+([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
        /maturity\s+date[:\s]+([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
        /balloon\s+(?:payment\s+)?(?:due|date)[:\s]+([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
        /(?:loan|note)\s+(?:matures?|due)[:\s]+([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
      ];
      for (const re of patterns) {
        const m = re.exec(text);
        if (m) return m[1].replace(/,/g, '').trim();
      }
      return null;
    });
  }

  // Extract consideration/sale amount from a deed detail page.
  // Looks for labels like "Consideration", "Document Amount", "Sale Price", etc.
  async function extractConsiderationFromPage(p) {
    const result = await p.evaluate(() => {
      const text = document.body.innerText || '';
      // Capture a snippet for debugging
      const debugSnippet = text.slice(0, 3000);
      const patterns = [
        /consideration[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
        /document\s+amount[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
        /sale\s+price[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
        /transfer\s+amount[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
        /amount[:\s]+\$?([\d,]+(?:\.\d{2})?)/i,
      ];
      for (const re of patterns) {
        const m = re.exec(text);
        if (m) {
          const val = parseFloat(m[1].replace(/,/g, ''));
          if (!isNaN(val) && val > 0) return { amount: val, debug: null };
        }
      }
      // Also check table cells
      const rows = Array.from(document.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => (c.innerText || '').trim());
        for (let i = 0; i < cells.length - 1; i++) {
          if (/consideration|doc.*amount|amount/i.test(cells[i])) {
            const val = parseFloat(cells[i + 1].replace(/[$,\s]/g, ''));
            if (!isNaN(val) && val > 0) return { amount: val, debug: null };
          }
        }
      }
      return { amount: 0, debug: debugSnippet };
    });
    if (result.debug !== null) {
      process.stderr.write(`[recorder] Consideration page debug snippet:\n${result.debug}\n---END---\n`);
    }
    return result.amount;
  }

  // Navigate the main search results page to a document's detail page by clicking its View link.
  // Document/Detail URLs use session-scoped tokens (hId) that only work when navigated via click
  // from the CCRD search results page — direct tab navigation always fails with 404.
  async function navigateToDoc(doc) {
    try {
      // Find the row containing this document number and click its first link (View)
      const rows = page.locator('table tr');
      const rowCount = await rows.count();
      for (let r = 1; r < rowCount; r++) {
        const row = rows.nth(r);
        const rowText = await row.innerText().catch(() => '');
        if (rowText.includes(doc.documentNumber)) {
          const link = row.locator('a').first();
          if (await link.count() > 0) {
            await link.click();
            await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() =>
              page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
            );
            await page.waitForTimeout(600);
            const heading = await page.locator('h1, h2').first().innerText().catch(() => '');
            if (/error|not found|resource cannot/i.test(heading)) {
              process.stderr.write(`[recorder] Detail page error for ${doc.documentNumber}: ${heading}\n`);
              return false;
            }
            return true;
          }
          break;
        }
      }
      process.stderr.write(`[recorder] Could not find row for doc ${doc.documentNumber}\n`);
      return false;
    } catch (e) {
      process.stderr.write(`[recorder] navigateToDoc error (${doc.documentNumber}): ${e.message}\n`);
      return false;
    }
  }

  // Return to the main PIN search results page after visiting a detail page
  async function returnToSearch() {
    await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
  }

  // --- Serial detail-page extraction on the main page ---
  // All detail tasks click through the search results page to avoid session-token issues
  // with direct Document/Detail navigation.

  const deedDoc = enriched.find(d => d.category === 'deed');
  const mortgageDocForOwner = enriched.find(d => d.category === 'mortgage');
  const foreDoc = enriched.find(d => d.category === 'foreclosure' || d.category === 'litigation');

  function parseRecordedDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])).getTime();
  }

  const deedDate = deedDoc ? parseRecordedDate(deedDoc.recordedDate) : 0;
  const mortgageDate = mortgageDocForOwner ? parseRecordedDate(mortgageDocForOwner.recordedDate) : 0;
  const deedIsNewer = deedDate >= mortgageDate;
  process.stderr.write(`[recorder] Deed date: ${deedDoc?.recordedDate || 'none'} (${deedDate}), Mortgage date: ${mortgageDocForOwner?.recordedDate || 'none'} (${mortgageDate}), deedIsNewer: ${deedIsNewer}\n`);

  // --- Deeds ---
  let legalDescriptionPins = [];
  let deedGrantor = null;
  let deedGrantee = null;
  const deedDocuments = enriched.filter(d => d.category === 'deed');
  for (let i = 0; i < deedDocuments.length; i++) {
    const doc = deedDocuments[i];
    const ok = await navigateToDoc(doc);
    if (ok) {
      if (i === 0) {
        // Most recent deed: consideration + legal desc PINs + party names
        const [amount, legalDescPins, grantor, grantee] = await Promise.all([
          extractConsiderationFromPage(page),
          extractLegalDescriptionFromPage(page),
          extractNameFromPage(page, 'grantor'),
          extractNameFromPage(page, 'grantee'),
        ]);
        if (amount > 0) { doc.amount = amount; process.stderr.write(`[recorder] Deed ${doc.documentNumber} consideration: $${amount.toLocaleString()}\n`); }
        legalDescriptionPins = Array.isArray(legalDescPins) ? legalDescPins : [];
        deedGrantor = grantor;
        deedGrantee = grantee;
        process.stderr.write(`[recorder] Deed ${doc.documentNumber} legal description PINs: ${JSON.stringify(legalDescriptionPins)}\n`);
        if (deedGrantor) process.stderr.write(`[recorder] Deed ${doc.documentNumber} grantor (seller): ${deedGrantor}\n`);
        if (deedGrantee) process.stderr.write(`[recorder] Deed ${doc.documentNumber} grantee (buyer): ${deedGrantee}\n`);
      } else {
        const amount = await extractConsiderationFromPage(page);
        if (amount > 0) { doc.amount = amount; process.stderr.write(`[recorder] Deed ${doc.documentNumber} consideration: $${amount.toLocaleString()}\n`); }
      }
      await returnToSearch();
    }
  }

  // --- Releases ---
  const releaseDocuments = enriched.filter(d => d.category === 'release');
  for (const doc of releaseDocuments) {
    const ok = await navigateToDoc(doc);
    if (ok) {
      const priorNums = await extractPriorDocsFromPage(page);
      if (priorNums && priorNums.__debug_headings) {
        process.stderr.write(`[recorder] Release ${doc.documentNumber} page headings: ${JSON.stringify(priorNums.__debug_headings)}\n`);
        doc.releasesDocNumbers = [];
      } else if (Array.isArray(priorNums) && priorNums.length > 0) {
        doc.releasesDocNumbers = priorNums;
        process.stderr.write(`[recorder] Release ${doc.documentNumber} clears: ${priorNums.join(', ')}\n`);
      } else {
        process.stderr.write(`[recorder] Release ${doc.documentNumber}: no prior docs found\n`);
      }
      await returnToSearch();
    }
  }

  // --- Mortgages ---
  const mortgageDocuments = enriched.filter(d => d.category === 'mortgage');
  for (const doc of mortgageDocuments) {
    const ok = await navigateToDoc(doc);
    if (ok) {
      const [maturityDate, lenderName, borrowerName, amount] = await Promise.all([
        extractMaturityDateFromPage(page),
        extractNameFromPage(page, 'grantee'),
        extractNameFromPage(page, 'grantor'),
        extractConsiderationFromPage(page),
      ]);
      if (maturityDate) {
        doc.maturityDate = maturityDate;
        process.stderr.write(`[recorder] Mortgage ${doc.documentNumber} maturity date: ${maturityDate}\n`);
      } else {
        process.stderr.write(`[recorder] Mortgage ${doc.documentNumber}: maturity date not found\n`);
      }
      if (lenderName) {
        doc.grantee = lenderName;
        process.stderr.write(`[recorder] Mortgage ${doc.documentNumber} lender: ${lenderName}\n`);
      }
      if (borrowerName) {
        doc.grantor = borrowerName;
        process.stderr.write(`[recorder] Mortgage ${doc.documentNumber} borrower: ${borrowerName}\n`);
      }
      if (amount > 0) {
        doc.amount = amount;
        process.stderr.write(`[recorder] Mortgage ${doc.documentNumber} amount: $${amount.toLocaleString()}\n`);
      }
      await returnToSearch();
    }
  }

  // --- Owner name ---
  // Derived from the deed/mortgage detail pages we already visited above.
  let ownerName = null;
  if (deedIsNewer) {
    ownerName = deedGrantee || mortgageDocuments[0]?.grantor || null;
  } else {
    ownerName = mortgageDocuments[0]?.grantor || deedGrantee || null;
  }
  // Fore/lit fallback
  if (!ownerName && foreDoc) {
    const okFore = await navigateToDoc(foreDoc);
    if (okFore) {
      ownerName = await extractNameFromPage(page, 'grantor');
      await returnToSearch();
    }
  }
  if (ownerName) process.stderr.write(`[recorder] Owner name: ${ownerName}\n`);
  else process.stderr.write(`[recorder] Could not determine owner name from any document\n`);

  process.stdout.write(JSON.stringify({
    success: true,
    documents: enriched,
    ownerName,
    legalDescriptionPins,
    deedGrantor,
    deedGrantee,
    pageUrl: directUrl,
    scrapedAt: new Date().toISOString(),
  }));
} catch (err) {
  process.stderr.write(`[recorder] Error: ${err.message}\n${err.stack}\n`);
  process.stdout.write(JSON.stringify({ error: err.message }));
} finally {
  await browser.close();
}
