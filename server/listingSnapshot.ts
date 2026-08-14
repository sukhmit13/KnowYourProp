// Listing Snapshot — on-demand AI web-search lookup of the active listing for an address.
// Reads what the listing (Zillow/Redfin/LoopNet/etc.) publicly claims: price, status,
// remarks, disclosures. This is THIRD-PARTY LISTING CONTENT, not verified data — the UI
// must label it as such. Fails loudly (throws) rather than guessing.

const MODEL = process.env.REPORT_MODEL || "claude-sonnet-5";

export interface ListingSnapshot {
  status: 'active' | 'pending' | 'off_market' | 'not_found';
  /** Human label, e.g. "Active", "Under Contract", "Sold Mar 2026", "Delisted" */
  statusLabel: string;
  sourceName: string | null;
  sourceUrl: string | null;
  listPrice: number | null;
  daysOnMarket: number | null;
  listedDate: string | null;
  soldDate: string | null;
  soldPrice: number | null;
  /** 2-4 sentence neutral summary of the listing remarks */
  remarksSummary: string | null;
  /** Agent-disclosed issues: as-is sale, known violations, tenant occupancy, estate sale, etc. */
  disclosures: string[];
  /** Extra notable facts from the listing (beds/baths/sqft claims, taxes quoted, HOA, etc.) */
  keyFacts: string[];
  /** For off_market/not_found: one sentence of currency EVIDENCE (why this reads as historical) — dated MLS record, no newer listing found, current occupant, etc. */
  whyHistorical: string | null;
  /** Number of units the LISTING states (not tax records) */
  unitCount: number | null;
  /** Per-unit rent roll if the listing publishes one */
  rentRoll: Array<{ unit: string | null; beds: number | null; baths: number | null; monthlyRent: number | null }>;
  /** Gross annual income the listing itself states */
  grossAnnualIncome: number | null;
  /** NOI the listing itself states */
  statedNoi: number | null;
  checkedAt: string;
}

export async function fetchListingSnapshot(address: string): Promise<ListingSnapshot> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Search the web for the current real-estate listing for this exact address:

${address}

Look for the property on Zillow, Redfin, Realtor.com, LoopNet, Crexi, or brokerage sites.

IMPORTANT — commercial buildings are often listed under an ADDRESS RANGE, not the single street number. Also search range variants of this address (e.g. for "2821 N Milwaukee Ave" also try "2821-2823 N Milwaukee Ave" and nearby ranges that include the number). A listing whose range includes this street number IS a listing for this property. The same property can have MULTIPLE listing pages over time: an old delisted page does NOT mean the property is off-market — before reporting "off_market", search specifically for a NEWER listing (including range variants) and only conclude delisted if no currently-active listing exists anywhere.

REQUIRED SEARCH STRATEGY — run ALL of these searches before concluding ANY final status:
1. "<address> for sale"
2. "<address>" site:redfin.com
3. "<address>" site:zillow.com
4. "<address>" site:loopnet.com OR site:crexi.com (for commercial/mixed-use)
Compare the MLS numbers across every result you see. The same property gets a NEW MLS number each time it is re-listed — a search result whose title or snippet shows a newer MLS number than an older sold/delisted page means there is a NEWER listing, and the older page's sold/delisted status is obsolete. Brokerage archive pages (atproperties.com, compass.com, coldwellbankerhomes.com sold archives, etc.) showing an old sale price do NOT establish current status — they keep sold pages up forever.

Redfin, Zillow, and Realtor.com often BLOCK page fetches. If a search result from one of those listing sites shows in its title/snippet an EXPLICIT current status signal — an asking price presented as the current price, "For Sale", or "Active" — that IS sufficient evidence to report "active"; use the metadata from the search result (price, MLS#, URL) and note in keyFacts that the listing page itself could not be opened. A newer MLS number ALONE is NOT status evidence — it only proves a later marketing record exists (which may itself be pending, withdrawn, or sold); treat it as reason to discard all older records and keep searching for that newer listing's current status. Never let an unfetchable current listing lose to a fetchable stale archive page. If MULTIPLE current listing pages exist for the property (e.g. LoopNet + Redfin), report the one whose search metadata shows the most complete data (asking price, MLS#, status) as the primary source, and mention the other listing URLs in keyFacts.

CRITICAL — pick the NEWEST listing, not the most detailed stale one:
- MLS numbers increase over time. When different pages show different MLS numbers for this address, the HIGHEST MLS number is the current listing; every page tied to a lower MLS number (whatever site it is on) is a prior marketing period and must NOT be used for status, price, or listedDate.
- Never report "active" from a page whose own listed date is more than 18 months in the past unless that page currently confirms active status. Aggregators (realty.com, compass.com, atproperties.com, xome.com) republish old MLS records indefinitely and often mislabel them "for sale".
- It is BETTER to report "active" with listPrice null from a confirmed-current source than to attach a stale price and date from an obsolete MLS record. Do not mix fields across listings: price, listedDate, and remarks must all come from the SAME (newest) listing.

Then respond with ONLY a JSON object (no markdown fences, no commentary) matching exactly this shape:

{
  "status": "active" | "pending" | "off_market" | "not_found",
  "statusLabel": "short human label, e.g. 'Active', 'Under Contract', 'Sold Jan 2026', 'Delisted', 'No listing found'",
  "sourceName": "site the info came from, e.g. 'Zillow'" | null,
  "sourceUrl": "direct URL to the listing page" | null,
  "listPrice": number | null,
  "daysOnMarket": number | null,
  "listedDate": "YYYY-MM-DD or approximate like '2026-05'" | null,
  "soldDate": string | null,
  "soldPrice": number | null,
  "remarksSummary": "2-5 sentence neutral summary of what the listing description claims" | null,
  "disclosures": ["each issue the listing itself discloses: as-is sale, known violations, tenant occupancy, estate/short sale, cash only, etc."],
  "keyFacts": ["EVERY concrete fact the listing states, one string each — see rules"],
  "whyHistorical": "ONLY when status is off_market or not_found: 1-2 sentences of EVIDENCE for why no active listing exists — e.g. 'the MLS record is dated 2017; no newer active listing could be verified on Zillow, Redfin, LoopNet or Crexi; the address currently appears occupied by a business'. This is currency evidence, NOT a listing claim — do not repeat it in keyFacts." | null,
  "unitCount": number | null,
  "rentRoll": [{"unit": "unit label like '1F' or 'Unit 2'" | null, "beds": number | null, "baths": number | null, "monthlyRent": number | null}],
  "grossAnnualIncome": number | null,
  "statedNoi": number | null
}

Rules:
- "active" = currently for sale; "pending" = under contract/contingent; "off_market" = you found a recent listing but it is sold or delisted (fill in what you found, including soldDate/soldPrice if shown); "not_found" = no listing for this address surfaced at all.
- Once you locate the listing, OPEN AND READ the actual listing page itself (and its facts/details table) — do not answer from search-result snippets alone. If a commercial listing exists on LoopNet or Crexi, prefer it and read its full "Property Facts" / financial section.
- keyFacts must be COMPREHENSIVE: include every concrete claim the listing makes, e.g. price per SF, cap rate, GRM, NOI or gross income, number of units and unit mix (beds/baths per unit), current rents, building sqft, lot size, year built / renovated, number of stories, stated zoning, parking, quoted taxes, HOA, occupancy/tenancy, utilities/mechanicals, and the listing brokerage/agent name. One short string per fact.
- unitCount / rentRoll / grossAnnualIncome / statedNoi: fill ONLY from what the LISTING states (not tax records or third-party estimates). rentRoll: one entry per unit if the listing shows per-unit beds/baths/rents (current or projected rents count — note "projected" in keyFacts if so). If the listing states annual gross income or NOI, put the numbers in grossAnnualIncome / statedNoi. Use null / [] when not published.
- Do NOT report "off_market"/delisted based on search-result snippets, cached previews, or aggregator pages — those are often stale. Only call a listing delisted/off-market if the CURRENT listing page itself (or the source site's own status banner on that page) confirms it. If you cannot open the listing page to confirm, and a recent listing exists, prefer "active" with a note in keyFacts that the status could not be re-verified.
- Report only what listings actually say. Do NOT infer, estimate, or fill gaps — use null / empty arrays when the information is not shown.
- Always include sourceUrl when you found a listing.`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 } as any],
    ...({ thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } } as Record<string, unknown>),
  });
  const response = await stream.finalMessage();
  console.log(`[LISTING SNAPSHOT] "${address}" tokens in=${response.usage?.input_tokens} out=${response.usage?.output_tokens} stop=${response.stop_reason}`);

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Listing snapshot response was truncated (max_tokens)');
  }
  // claude-sonnet-5: join ALL text blocks (thinking/tool blocks interleave)
  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text || '')
    .join('')
    .trim();
  if (!raw) throw new Error('Listing snapshot returned empty output');

  // Extract the JSON object: try each '{' start position until one parses whole.
  // (Model prose may contain braces before the object; fail loudly if none parse.)
  let parsed: any = null;
  const lastEnd = raw.lastIndexOf('}');
  for (let start = raw.indexOf('{'); start !== -1 && start < lastEnd; start = raw.indexOf('{', start + 1)) {
    try { parsed = JSON.parse(raw.slice(start, lastEnd + 1)); break; } catch { /* try next */ }
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Listing snapshot output contained no parseable JSON object');

  const statuses = ['active', 'pending', 'off_market', 'not_found'];
  if (!statuses.includes(parsed.status)) throw new Error(`Listing snapshot returned invalid status: ${parsed.status}`);

  return {
    status: parsed.status,
    statusLabel: typeof parsed.statusLabel === 'string' && parsed.statusLabel ? parsed.statusLabel : parsed.status,
    sourceName: parsed.sourceName ?? null,
    sourceUrl: typeof parsed.sourceUrl === 'string' && /^https?:\/\//i.test(parsed.sourceUrl) ? parsed.sourceUrl : null,
    listPrice: typeof parsed.listPrice === 'number' ? parsed.listPrice : null,
    daysOnMarket: typeof parsed.daysOnMarket === 'number' ? parsed.daysOnMarket : null,
    listedDate: parsed.listedDate ?? null,
    soldDate: parsed.soldDate ?? null,
    soldPrice: typeof parsed.soldPrice === 'number' ? parsed.soldPrice : null,
    remarksSummary: parsed.remarksSummary ?? null,
    disclosures: Array.isArray(parsed.disclosures) ? parsed.disclosures.filter((d: unknown) => typeof d === 'string') : [],
    keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts.filter((d: unknown) => typeof d === 'string') : [],
    whyHistorical: typeof parsed.whyHistorical === 'string' && parsed.whyHistorical.trim() ? parsed.whyHistorical.trim() : null,
    unitCount: Number.isFinite(parsed.unitCount) && parsed.unitCount > 0 && parsed.unitCount <= 1000 ? Math.round(parsed.unitCount) : null,
    rentRoll: Array.isArray(parsed.rentRoll)
      ? parsed.rentRoll
          .filter((u: any) => u && typeof u === 'object')
          .map((u: any) => ({
            unit: typeof u.unit === 'string' && u.unit.trim() ? u.unit.trim() : null,
            beds: Number.isFinite(u.beds) && u.beds >= 0 && u.beds <= 20 ? u.beds : null,
            baths: Number.isFinite(u.baths) && u.baths >= 0 && u.baths <= 20 ? u.baths : null,
            monthlyRent: Number.isFinite(u.monthlyRent) && u.monthlyRent > 0 && u.monthlyRent < 1000000 ? u.monthlyRent : null,
          }))
          .filter((u: any) => u.unit !== null || u.beds !== null || u.baths !== null || u.monthlyRent !== null)
      : [],
    grossAnnualIncome: Number.isFinite(parsed.grossAnnualIncome) && parsed.grossAnnualIncome > 0 ? parsed.grossAnnualIncome : null,
    statedNoi: Number.isFinite(parsed.statedNoi) && parsed.statedNoi > 0 ? parsed.statedNoi : null,
    checkedAt: new Date().toISOString(),
  };
}
