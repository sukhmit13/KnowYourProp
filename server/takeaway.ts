// Takeaway generator (hardened pilot — Crime section).
// The model never computes or supplies a number: the backend pre-computes every
// figure and favor; the model only phrases them. Output is validated with
// deterministic guards (number tracing, favor matching, banned phrases) and we
// fail CLOSED — a missing takeaway is fine, a wrong one is not.
import Anthropic from '@anthropic-ai/sdk';

export type TakeawaySection = 'crime' | 'transit' | 'schools' | 'hmda';

export interface TakeawayBullet {
  text: string;
  favor: 'good' | 'neutral' | 'bad';
  metric: string;
}
export interface TakeawayResult {
  headline: string;
  bullets: TakeawayBullet[];
}

const SYSTEM_PROMPTS: Record<TakeawaySection, string> = {
  crime: `You write the one-paragraph "Takeaway" for the Area Crime Statistics section of a real-estate property report. You are given a JSON object with pre-computed crime figures for one address (this section's own CPD / Chicago Data Portal data). INTERPRET it into a short, grounded read — do not restate it, and do not calculate anything. Crime is a sensitive category — the guardrails are non-negotiable.

GOVERNING RULE — report-data-first: every figure comes from the provided JSON. No world knowledge, no external context, no other sections.

CRIME-SENSITIVITY GUARDRAILS:
A. Report the data; never characterize people or the neighborhood's residents. Speak only to incident counts, rates, rankings, trend, and crime-type mix. Never describe an area as "dangerous", "sketchy", "bad", or a "good/safe neighborhood" — use the percentile/ranking framing the data supports ("safer than X% of Chicago community areas"). No demographic, socioeconomic, or characterizing language of any kind.
B. Factual, not alarmist — in both directions. Favorable data (high safer-than percentile, falling trend) may be stated plainly. Unfavorable data (low percentile, rising trend, high counts) must ALSO be stated plainly and calmly — never sensationalized, never with fear language. The same calm, factual register regardless of what the numbers say.
C. Percentile + per-capita framing, not raw fear. Lead with the ranking ("safer than X%") and rates per 1,000, which are comparative and fair. A raw count alone without its radius and context is not a valid takeaway line — always attach the radius ("within a quarter mile").
D. Distinguish violent vs. property honestly. Give the violent share (it is usually the smaller part); never let a big theft number read as violent danger. A property-crime-dominated mix is the typical footprint of a busy corridor — frame it as the character of local incidents, not a danger level.
E. Commercial framing when applicable: ONLY if \`subjectIsCommercial\` is true, the radius-contrast bullet may name the actionable exposure (theft / burglary / criminal damage, drawn from the breakdown types actually present) as security-planning context — never a verdict on the location, never implying it is unsuitable. If \`subjectIsCommercial\` is false or absent, omit any commercial clause.
F. Word the trend as CRIME rising/falling, never as "safety trending up/down". Direction words modify the thing measured (crime, incidents), never the goal (safety): "crime is falling", "incidents fell 9% year-over-year", "reported crime rose".

STRUCTURE:
1. Use ONLY numbers that appear in the provided JSON. Never compute, estimate, or introduce a number that isn't already there. Copy figures exactly as given.
2. Never invent facts or context beyond the JSON. If something isn't in the data, don't mention it.
3. Write EXACTLY 2 to 4 bullets (aim for 3). Every bullet must cite a specific figure from the data, and its \`metric\` field must be the EXACT JSON path of that figure in the data object (e.g. "ranks.violent" or "trend.yoyPct") — never a prose name like "violent crime rate". A bullet with an invalid \`metric\` path is discarded, so copy the path from the JSON keys. Suggested shape (adapt to what the data actually says): (1) ranking percentiles + trend with the year figures; (2) the violent-vs-property mix with the violent share and leading type; (3) the radius contrast (block count vs. quarter-mile count), plus the commercial security-planning clause per guardrail E.
4. Do NOT decide favorability yourself. Each metric in the JSON has a \`favor\` value — use that metric's \`favor\` for the bullet about it. Set each bullet's \`favor\` to the value the data gives; unfavorable facts stay calm and factual.
5. Headline: one factual sentence capturing the ranking + the property-vs-violent character (e.g. favorable: "Safer than most of Chicago and improving — local exposure skews to property crime, mostly theft, not violence."; unfavorable, same calm register: "Higher reported crime than most of the city, concentrated in property offenses."). Write what THIS data says — another property may warrant the opposite headline.
6. NEVER issue a bare safety verdict. Report specific, data-anchored facts and let the reader judge. Keep violent and property crime as distinct facts; never collapse them into one label.
7. Descriptive first. At most one brief, grounded practical implication that follows directly from the data; no advice or opinions beyond that.
8. Tone: plain, confident, concise. No hedging, no marketing language. Bold each figure in \`text\` with markdown (e.g. **77%**).
9. Output ONLY the JSON object: { "headline": string, "bullets": [ { "text": string, "favor": "good"|"neutral"|"bad", "metric": string } ] }. Nothing else.

Self-check before returning: (a) zero characterizing/demographic language, ranking-and-rate framing only; (b) same calm register whether the data is favorable or not; (c) violent share stated so a big theft count isn't read as violence; (d) every number from the input, nothing invented; (e) commercial clause only when subjectIsCommercial is true; (f) trend worded as crime rising/falling, never "safety trending".`,

  transit: `You write the one-paragraph "Takeaway" for the Transit Access & Ridership section of a real-estate property report. You are given a JSON object with pre-computed transit facts for one address. INTERPRET it into a short, grounded read — do not restate it, and do not calculate anything. Rules:

1. Use ONLY numbers that appear in the provided JSON, copied EXACTLY as given. Never compute, estimate, convert, rescale, or round a figure — no turning 0.8 mi into "80%", no averaging, no derived percentages of any kind. A single number not present verbatim in the JSON voids the whole output.
2. Never invent facts or context beyond the JSON. If something isn't in the data, don't mention it (e.g. don't name destinations, lines, or frequencies not present).
3. Write EXACTLY 2 to 4 bullets — never more than 4. Every bullet must cite a specific figure from the data, and its \`metric\` field must be the EXACT JSON path of that figure in the data object (e.g. "accessTier" or "bus") — never a prose name. A bullet with an invalid \`metric\` path is discarded, so copy the path from the JSON keys.
4. Do NOT decide favorability yourself. The data carries \`favor\`/tier values computed in code — set each bullet's \`favor\` to the value given for the metric it cites.
5. The headline reflects the \`accessTier\` verdict (Strong / Moderate / Limited access) and the single most decisive fact behind it.
5b. The headline is the ONLY place the overall access verdict appears. Never write a bullet that restates the overall rating (e.g. "Overall transit access is rated Strong access") — it is redundant with the headline and the badge next to it. Every bullet must carry a specific fact (a stop, route, walk time, or ranking), not a summary verdict.
6. More transit access skews positive, but a quiet stop is not "bad" — describe low ridership or long walks neutrally, never as a defect.
7. Descriptive first. At most one brief, grounded practical implication that follows directly from the data; no advice beyond that.
8. Tone: plain, confident, concise. No hedging, no marketing language. Bold each figure in \`text\` with markdown (e.g. **9-min**, **#29 of 127**).
9. Output ONLY the JSON object: { "headline": string, "bullets": [ { "text": string, "favor": "good"|"neutral"|"bad", "metric": string } ] }. Nothing else.`,

  schools: `You write the one-paragraph "Takeaway" for the Schools section of a real-estate property report. You are given a JSON object with pre-computed school facts for one Chicago address — per-level verdicts (elementary / high school), the ASSIGNED boundary school for each level, its CPS quality rating (Level 1+ is best, Level 3 is lowest), counts of nearby schools, and distances. INTERPRET it into a short, grounded read — do not restate it, and do not calculate anything. Rules:

1. Use ONLY numbers that appear in the provided JSON, copied EXACTLY as given. Never compute, estimate, convert, rescale, or round a figure. A single number not present verbatim in the JSON voids the whole output.
2. Never invent facts or context beyond the JSON. Don't name schools, programs, or ratings not present. CPS "Level" ratings are quality tiers — never call them grade levels.
3. Write EXACTLY 2 to 4 bullets — never more than 4. Every bullet must cite a specific figure from the data, and its \`metric\` field must be the EXACT JSON path of that figure in the data object (e.g. "elementary" or "high") — never a prose name. A bullet with an invalid \`metric\` path is discarded, so copy the path from the JSON keys.
4. Do NOT decide favorability yourself. The data carries \`favor\`/verdict values computed in code — set each bullet's \`favor\` to the value given for the metric it cites.
5. The assigned (boundary) school is the default a family gets — lead each level's bullet with it; open-enrollment options are secondary context (they require application/lottery).
6. A Level 2 school is below-average, not failing — describe middling ratings factually, never as a defect. Never issue a bare verdict like "great schools" or "bad schools".
7. Descriptive first. At most one brief, grounded practical implication that follows directly from the data; no advice beyond that.
8. Tone: plain, confident, concise. No hedging, no marketing language. Bold each figure and rating in \`text\` with markdown (e.g. **Level 1+**, **0.21 mi**).
9. Output ONLY the JSON object: { "headline": string, "bullets": [ { "text": string, "favor": "good"|"neutral"|"bad", "metric": string } ] }. Nothing else.`,

  hmda: `You write the "Takeaway" for the Local Mortgage Market Activity section of a property-intelligence report. The section summarizes HMDA home-lending data for the census tract around a subject property, plus a benchmark of today's mortgage rate. Turn the JSON input into one headline and short plain-English bullets a non-expert buyer or owner can act on. Rules:

HARD RULE 1 — Fair-lending firewall. HMDA is regulated lending data. You may speak ONLY to: application counts, origination/denial rates, denial reasons (debt-to-income, credit, collateral), loan type (conventional/FHA/VA), occupancy (owner-occupied/investment), property type, financed value bands, interest rates, and lender names/competition. You must NEVER reference — or imply, or invite the reader to infer — race, ethnicity, national origin, sex, age as a protected trait, or any approval/denial outcome broken out by any protected class. These fields are not in your input and must never appear in your output. If unsure whether a phrasing touches a protected class, drop it.

HARD RULE 2 — Today's rate is provided data, never your knowledge. Echo \`rate_today.market_rate_today\` exactly as given. Use the provided \`rate_today.rate_direction\` and \`rate_today.rate_more_or_less\` phrases verbatim — never compute or reverse the direction yourself. Treat the comparison as directional and hedged, never a precise spread ("a bit more / a touch less", never "exactly X bps"). If \`rate_today\` is absent from the input, drop the today's-rate clause entirely and speak only to the area's own closed-loan average.

HARD RULE 3 — Honesty on small samples. When \`approvals.apps\` or \`approvals.closed_loan_n\` is small, give raw counts ("45 of 92") and lean on \`approvals.community_orig_rate\` as the broader cross-check rather than over-reading the tract.

1. Use ONLY numbers that appear in the provided JSON, copied EXACTLY as given. Never compute, estimate, convert, or round a figure. A single number not present verbatim in the JSON voids the whole output.
2. Never invent facts beyond the JSON. If a field is missing or null, omit the clause that needs it — never guess.
3. Headline: one sentence, ≤ 20 words, capturing the section's character (e.g. a stable, conventional, owner-occupied market where the named denial reason is the gate). If \`rate_today.rate_gap_material\` is true it may note financing has gotten meaningfully pricier than recent closings — factual, never alarmed. If \`caveat\` is present, the headline should note this is residential lending data around a subject parcel that is not residentially zoned.
4. Bullets, in this exact order, each ≤ 45 words, each with its \`metric\` set to the exact top-level JSON key it cites:
   - metric "approvals": approvals + rate + today's benchmark + denial reason. Pattern: originated of apps applications originated (orig_rate%), denied denied (denial_rate%), averaging area_avg_rate% on closed first-lien loans — {rate_direction} today's ~{market_rate_today}% 30-year benchmark, so a buyer financing now would likely pay {rate_more_or_less} than recent closings here. End with the leading denial reason and what it gates (e.g. affordability, not credit or collateral, only when top_denial_reason is "debt-to-income").
   - metric "profile": the owner-occupied / conventional profile from \`profile\` (loan type, occupancy, property type, top value band). Frame factually as the market's base, not FHA- or investor-driven unless the numbers say so.
   - metric "lenders": the competitive lender field from \`lenders\` (leaders, rate range); if no single lender dominates, note borrowers have options.
   - metric "caveat": ONLY if \`caveat\` is present in the input — HMDA is 1–4 unit / multifamily home-loan data and the subject parcel is not residentially zoned (its category is \`caveat.subject_zoning_category\`); treat the rate and approval odds as neighborhood context, not the terms for financing this parcel commercially. If \`caveat\` is absent, do NOT write this bullet.
5. Do NOT decide favorability yourself: each bullet's \`favor\` must equal the \`favor\` value the input gives for that block. Direction is not favorability — never call a rate move or volume level good or bad.
6. Voice: plain, concrete, second-person where natural ("a buyer financing now…"). No hedging filler, no "it's worth noting", no restating the section title. Bold the one key phrase or figure per bullet with markdown **bold**.
7. Output ONLY the JSON object: { "headline": string, "bullets": [ { "text": string, "favor": "good"|"neutral"|"bad", "metric": string } ] }. Nothing else.`,
};

const BANNED_PHRASES = [
  'unsafe', 'dangerous', 'safe neighborhood', 'safe area', 'good neighborhood',
  'bad neighborhood', 'sketchy', 'avoid this', 'crime-ridden',
  'safety trending', 'safety is trending', 'crime-infested', 'high-crime area',
  'rough area', 'rough neighborhood',
];

// Fair-lending firewall (HMDA section): deterministic output-boundary check.
// Prompt instructions alone are not a sufficient control — any reference to a
// protected class (or outcomes framed by one) rejects the whole output.
const HMDA_BANNED_PATTERNS: RegExp[] = [
  /\brace\b/i, /\bracial\b/i, /\bethnic/i, /\bnational origin\b/i,
  /\bsex\b/i, /\bgender\b/i, /\bage group\b/i, /\bby age\b/i, /\bage of\b/i,
  /\bhispanic\b/i, /\blatino\b/i, /\blatina\b/i, /\bblack\b/i, /\bwhite\b/i,
  /\basian\b/i, /\bminorit/i, /\bdemographic/i, /\bprotected class\b/i,
];

// Numbers the model may legitimately mention that aren't data values
// (radius label "250 ft", "per 1,000 residents").
const NUMBER_WHITELIST = [250, 1000];

/** Collect every numeric value that appears anywhere in the data object. */
function collectNumbers(value: any, out: Set<number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.add(value);
    // A value shown as 14.1 may be cited as "14.1"; a percent 13 as "13".
    // Also allow the absolute value (trend deltas may be signed).
    out.add(Math.abs(value));
  } else if (typeof value === 'string') {
    // Numbers embedded in data strings are citable too — e.g. bus route
    // "80 Irving Park" or line "Union Pacific Northwest 3".
    for (const n of extractNumbers(value)) out.add(n);
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectNumbers(v, out);
  }
}

/** Extract every number from output text (commas and % stripped). */
function extractNumbers(text: string): number[] {
  const cleaned = text.replace(/(\d),(\d)/g, '$1$2').replace(/%/g, '');
  return (cleaned.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

/**
 * Resolve a bullet's cited metric against the caller-supplied canonical map.
 * The model may cite "ranks.violent", "violent.saferThanPct", or "trend.yoyPct";
 * a metric matches canonical path C when it equals C (with or without C's
 * leading container segment) or extends it with subkeys. Unresolvable → null.
 */
function favorForMetric(metricFavors: Record<string, string>, metric: string): string | null {
  if (typeof metric !== 'string' || !metric.trim()) return null;
  const m = metric.trim();
  for (const [canonical, favor] of Object.entries(metricFavors)) {
    const bases = [canonical];
    const dot = canonical.indexOf('.');
    if (dot > 0) bases.push(canonical.slice(dot + 1)); // "ranks.violent" → "violent"
    for (const base of bases) {
      if (m === base || m.startsWith(base + '.')) return favor;
    }
  }
  return null;
}

export interface TakeawayValidation {
  ok: boolean;
  reason?: string;
}

export function validateTakeaway(data: any, parsed: any, metricFavors: Record<string, string>, section?: TakeawaySection): TakeawayValidation {
  // 1. shape
  if (!parsed || typeof parsed.headline !== 'string' || !parsed.headline.trim()) {
    return { ok: false, reason: 'missing headline' };
  }
  if (!Array.isArray(parsed.bullets) || parsed.bullets.length < 2 || parsed.bullets.length > 4) {
    return { ok: false, reason: `bullet count ${parsed.bullets?.length ?? 0}` };
  }
  for (const b of parsed.bullets) {
    if (typeof b?.text !== 'string' || !b.text.trim()) return { ok: false, reason: 'empty bullet text' };
    if (!['good', 'neutral', 'bad'].includes(b?.favor)) return { ok: false, reason: `bad favor "${b?.favor}"` };
  }
  // 2. number tracing (anti-fabrication)
  const allowed = new Set<number>(NUMBER_WHITELIST);
  collectNumbers(data, allowed);
  const fullText = [parsed.headline, ...parsed.bullets.map((b: any) => b.text)].join(' ');
  for (const n of extractNumbers(fullText)) {
    if (!allowed.has(n)) return { ok: false, reason: `untraceable number ${n}` };
  }
  // 3. every bullet must cite a resolvable canonical metric, and its favor must
  // equal the code-computed favor for that metric — no exceptions.
  for (const b of parsed.bullets) {
    const expected = favorForMetric(metricFavors, b.metric);
    if (!expected) return { ok: false, reason: `unresolvable metric "${b.metric}"` };
    if (b.favor !== expected) {
      return { ok: false, reason: `favor mismatch on ${b.metric}: ${b.favor} != ${expected}` };
    }
  }
  // 4. banned phrases
  const lower = fullText.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return { ok: false, reason: `banned phrase "${phrase}"` };
  }
  // 5. fair-lending firewall — HMDA output must never touch a protected class
  if (section === 'hmda') {
    for (const re of HMDA_BANNED_PATTERNS) {
      if (re.test(fullText)) return { ok: false, reason: `fair-lending term matched ${re}` };
    }
  }
  return { ok: true };
}

async function callModel(section: TakeawaySection, data: any, allowedMetrics: string[]): Promise<any> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = SYSTEM_PROMPTS[section] +
    `\n\nThe ONLY valid \`metric\` values are: ${allowedMetrics.map(m => `"${m}"`).join(', ')}. Every bullet's \`metric\` MUST be one of these exact strings (subkeys like ".pct" may be appended). Any other value invalidates the whole answer.`;
  const msg = await client.messages.create({
    model: process.env.REPORT_MODEL || 'claude-sonnet-5',
    max_tokens: 1200, // thinking tokens count against max_tokens on this model
    system,
    messages: [{ role: 'user', content: JSON.stringify(data) }],
    ...({ thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } as any),
  });
  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  if (!text || msg.stop_reason === 'max_tokens') {
    throw new Error(`Empty/truncated takeaway (stop_reason=${msg.stop_reason})`);
  }
  return JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''));
}

/**
 * Generate a validated takeaway. Reject → retry once → null (fail closed).
 * Returns null when the model can't produce a valid takeaway; render nothing.
 */
export async function generateTakeaway(section: TakeawaySection, data: any, metricFavors: Record<string, string>): Promise<TakeawayResult | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callModel(section, data, Object.keys(metricFavors));
      const check = validateTakeaway(data, parsed, metricFavors, section);
      if (check.ok) {
        return {
          headline: parsed.headline.trim().slice(0, 220),
          bullets: parsed.bullets.map((b: any) => ({
            text: b.text.trim().slice(0, 400),
            favor: b.favor,
            metric: String(b.metric || ''),
          })),
        };
      }
      console.warn(`[TAKEAWAY:${section}] attempt ${attempt} rejected: ${check.reason} :: ${JSON.stringify(parsed).slice(0, 800)}`);
    } catch (err: any) {
      console.warn(`[TAKEAWAY:${section}] attempt ${attempt} failed: ${err?.message}`);
    }
  }
  return null; // fail closed — a missing takeaway is fine, a wrong one is not
}

// ============================================================================
// News / Editorial Coverage takeaway (site-specific) — separate output shape.
// Report-data-first with cross_reference_allowed: true (the editorial
// exception): verification reuses report_facts bound in code from the report's
// own sections; the model never fetches. Fail closed — null renders nothing.
// ============================================================================

export interface NewsArticleInput {
  id: string;
  tier: 'parcel' | 'adjacent';
  matched_address: string;
  title: string;
  snippet: string | null;
  source: string;
  date: string;      // YYYY-MM-DD
  url: string;
}

export interface NewsTakeawayInput {
  subject_address: string;
  cross_reference_allowed: true;
  articles: NewsArticleInput[];
  report_facts: {
    active_licenses_at_address: Array<{ type: string; status: string }>;
    listing_status: 'none_active' | 'for_lease' | 'for_sale' | 'unknown';
    permits_since: any[];
    licenses_section_anchor: string;
    listing_section_anchor: string;
  };
  as_of: string;
}

export interface NewsTakeawayResult {
  section: {
    title: string;
    rows: Array<{ tone: 'insight' | 'caution'; html: string; chip: { label: string; href: string } | null }>;
  };
  articles: Array<{
    id: string;
    takeaway: string;
    attribution: string;
    headline_only: boolean;
    verification: { state: 'consistent' | 'appears_superseded' | 'no_update'; text: string; source_anchor: string } | null;
  }>;
}

const NEWS_SYSTEM_PROMPT = `You summarize local news coverage that names the subject parcel or an immediate co-parcel, for a property report. For each article you write ONE short takeaway (the "so what"), and for coverage about the subject parcel you add a "Current status" check that compares the reported claim to what the report's other sections currently show. Then one short section synthesis.

GOVERNING RULE — Report-Data-First (cross_reference_allowed: true for this section only): all facts come from the given input. Verification reuses report_facts values as-is — you are reusing, not re-deriving. Never invent, never override the report's records with an outside claim. If the report's data is silent on a point, stay silent or explicitly unverified — do not fill the gap from world knowledge or a guess.

HARD RULE 1 — Ground every takeaway ONLY in the text you are given. Per article you get some of: title, snippet, source, date, matched_address, tier. Summarize only from those. With a snippet, base the takeaway on it (+ title). Title-only → restate only what the headline asserts; invent nothing (no numbers, names, outcomes not in the title) and set "headline_only": true. A thin takeaway is correct; a fabricated one is not. No outside/world knowledge to embellish an article's contents.

HARD RULE 2 — Paraphrase, never reproduce (copyright). Own words; NO verbatim quotes (not even one). One sentence, ~20-35 words, a compression not a rewrite. One article → one takeaway; never reconstruct the article across takeaways. (Proper nouns in the title, e.g. a business name, are fine.)

HARD RULE 3 — Report as claim, not fact; flag age. Frame reported intentions as reported ("the owner said he wants to"), attributed to the source. If the article date is more than ~12 months before as_of, signal in the attribution that it is dated/unconfirmed. Never assert an outcome the article doesn't state ("wanted to revive" is not "revived").

HARD RULE 4 — Relevance tiering. tier is computed in code: "parcel" (IS the subject) or "adjacent" (a co-parcel/neighbor, not the subject). Write to the tier — an adjacent takeaway must not imply the story is about the subject. There is NO corridor tier and you must not mention corridors.

HARD RULE 5 — Current status verification = report-data-first, parcel-tier only. For each parcel-tier article that makes a checkable claim (occupancy/vacancy/use/re-tenanting/development/sale), produce a "verification" by cross-referencing report_facts in this priority order, stopping at the first that answers: (1) active_licenses_at_address — the cleanest occupancy/use signal; (2) listing_status — corroboration, often silent on occupancy, that's expected; (3) permits_since — permits dated after the article, if present. Set verification.state: "consistent" (report data agrees with the claim), "appears_superseded" (report data indicates the claim didn't proceed / the use changed), or "no_update" (report data silent or ambiguous — THIS IS THE DEFAULT; do not resolve from outside data). Rules: begin the text "As of {as_of formatted like Aug 2026}, …"; attribute to the report source ("the business licenses on file for this address show …"); phrase as "appears", never "did"; never assert cause-and-effect; set source_anchor to the anchor of the section the answer came from (licenses_section_anchor or listing_section_anchor). Adjacent-tier articles get verification: null. No checkable claim → verification: null.

HARD RULE 6 — The section box is META, not a restatement. Its title is one meta sentence leading with whether the subject itself is covered — never a restatement of an article. Its rows are exactly: (1) tone "insight" — the verdict: of the matched articles, how many name the subject parcel directly vs. a co-parcel, with chip {"label":"This parcel","href":"#parcel"} (drop the chip — null — if no parcel-tier article); (2) tone "caution" — the caveat: coverage is dated third-party signal, cross-checked against the report's own records where possible (pointing at the Current status lines); where the report is silent it stays unverified; headlines link to the original reporting. No other rows. No corridor row.

HARD RULE 7 — No sentiment editorializing. State what was reported and what records show; never rate the news as good or bad for the property.

OUTPUT — return ONLY the JSON object, no markdown fences, in this exact shape:
{"section":{"title":"…","rows":[{"tone":"insight","html":"…","chip":{"label":"This parcel","href":"#parcel"}},{"tone":"caution","html":"…","chip":null}]},"articles":[{"id":"…","takeaway":"…","attribution":"Reported by {source} · {age/status note}","headline_only":false,"verification":{"state":"no_update","text":"As of …","source_anchor":"…"}}]}
Every input article must appear exactly once in "articles", keyed by its input id. You may bold key phrases in html/text with <b>…</b> (rows.html) — takeaway/attribution/verification.text are plain text.

Self-check before returning: (1) every takeaway grounded only in the given title/snippet; (2) zero verbatim quotes, each a short paraphrase; (3) reported plans framed as reported, >12 mo flagged; (4) verification only on parcel-tier with a checkable claim, sourced from report_facts in priority order, default no_update, phrased "appears", traceable source_anchor, no outside data; (5) section box is meta (verdict + caveat), restates no card, mentions no corridor; (6) valid JSON in shape.`;

/** True when the candidate shares a contiguous run of `n` words with the source (verbatim-quote guard). */
function sharesWordRun(candidate: string, source: string, n = 10): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const cand = norm(candidate);
  const src = norm(source).join(' ');
  if (cand.length < n || !src) return false;
  for (let i = 0; i + n <= cand.length; i++) {
    if (src.includes(cand.slice(i, i + n).join(' '))) return true;
  }
  return false;
}

/**
 * XSS hard-stop for the ONLY html-rendered field (section rows): escape
 * everything, then restore bare <b>/</b>. Model markup beyond bold — tags,
 * attributes, entities smuggled via prompt-injected article titles — becomes
 * inert text. Applied before persistence; the client renders the result raw.
 */
export function sanitizeRowHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;(\/?)b&gt;/gi, '<$1b>');
}

export function validateNewsTakeaway(input: NewsTakeawayInput, parsed: any): TakeawayValidation {
  const s = parsed?.section;
  if (!s || typeof s.title !== 'string' || !s.title.trim()) return { ok: false, reason: 'missing section title' };
  // Exact contract: row 1 = insight verdict, row 2 = caution caveat. Nothing else.
  if (!Array.isArray(s.rows) || s.rows.length !== 2) return { ok: false, reason: `section rows ${s.rows?.length ?? 0}` };
  if (s.rows[0]?.tone !== 'insight' || s.rows[1]?.tone !== 'caution') return { ok: false, reason: 'rows must be [insight, caution]' };
  const allowedAnchors = new Set([
    input.report_facts.licenses_section_anchor,
    input.report_facts.listing_section_anchor,
  ]);
  for (const r of s.rows) {
    if (typeof r?.html !== 'string' || !r.html.trim()) return { ok: false, reason: 'empty row html' };
    if (r.chip != null && (typeof r.chip.label !== 'string' || r.chip.href !== '#parcel')) return { ok: false, reason: 'bad row chip' };
  }
  const hasParcelTier = input.articles.some(a => a.tier === 'parcel');
  if (!hasParcelTier && s.rows.some((r: any) => r.chip != null)) return { ok: false, reason: 'parcel chip without parcel-tier article' };
  if (hasParcelTier && s.rows[0].chip == null) return { ok: false, reason: 'verdict row missing parcel chip' };
  if (s.rows[1].chip != null) return { ok: false, reason: 'caution row must not carry a chip' };
  const sectionText = [s.title, ...s.rows.map((r: any) => r.html)].join(' ').toLowerCase();
  if (sectionText.includes('corridor')) return { ok: false, reason: 'corridor mention in section box' };
  if (!Array.isArray(parsed.articles)) return { ok: false, reason: 'missing articles' };
  const inputById = new Map(input.articles.map(a => [a.id, a]));
  const seen = new Set<string>();
  for (const a of parsed.articles) {
    const src = inputById.get(a?.id);
    if (!src) return { ok: false, reason: `unknown article id "${a?.id}"` };
    if (seen.has(a.id)) return { ok: false, reason: `duplicate article id "${a.id}"` };
    seen.add(a.id);
    if (typeof a.takeaway !== 'string' || !a.takeaway.trim() || a.takeaway.length > 420) return { ok: false, reason: `bad takeaway for ${a.id}` };
    if (typeof a.attribution !== 'string' || !a.attribution.trim()) return { ok: false, reason: `bad attribution for ${a.id}` };
    // Verbatim-quote guard against the snippet we supplied
    if (src.snippet && sharesWordRun(a.takeaway, src.snippet)) return { ok: false, reason: `verbatim run in ${a.id}` };
    if (a.verification != null) {
      if (src.tier !== 'parcel') return { ok: false, reason: `verification on non-parcel ${a.id}` };
      if (!['consistent', 'appears_superseded', 'no_update'].includes(a.verification.state)) return { ok: false, reason: `bad verification state for ${a.id}` };
      if (typeof a.verification.text !== 'string' || !a.verification.text.trim()) return { ok: false, reason: `empty verification text for ${a.id}` };
      if (!/^as of /i.test(a.verification.text.trim())) return { ok: false, reason: `verification not dated ("As of …") for ${a.id}` };
      if (a.verification.state === 'appears_superseded' && !/appear/i.test(a.verification.text)) return { ok: false, reason: `superseded verdict must say "appears" for ${a.id}` };
      if (!allowedAnchors.has(a.verification.source_anchor)) return { ok: false, reason: `bad source_anchor for ${a.id}` };
    }
  }
  if (seen.size !== input.articles.length) return { ok: false, reason: `article coverage ${seen.size}/${input.articles.length}` };
  return { ok: true };
}

/** Generate the validated news-coverage takeaway. Reject → retry once → null (fail closed). */
export async function generateNewsTakeaway(input: NewsTakeawayInput): Promise<NewsTakeawayResult | null> {
  if (input.articles.length === 0) return null; // fail-closed: zero coverage → render nothing
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await client.messages.create({
        model: process.env.REPORT_MODEL || 'claude-sonnet-5',
        max_tokens: 3000, // thinking tokens count against max_tokens on this model
        system: NEWS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        ...({ thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } as any),
      });
      const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
      if (!text || msg.stop_reason === 'max_tokens') throw new Error(`Empty/truncated news takeaway (stop_reason=${msg.stop_reason})`);
      const parsed = JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''));
      const check = validateNewsTakeaway(input, parsed);
      if (check.ok) {
        return {
          section: {
            title: parsed.section.title.trim(),
            rows: parsed.section.rows.map((r: any) => ({ tone: r.tone, html: sanitizeRowHtml(r.html.trim()), chip: r.chip ?? null })),
          },
          articles: parsed.articles.map((a: any) => ({
            id: a.id,
            takeaway: a.takeaway.trim(),
            attribution: a.attribution.trim(),
            headline_only: !!a.headline_only,
            verification: a.verification ? {
              state: a.verification.state,
              text: a.verification.text.trim(),
              source_anchor: a.verification.source_anchor,
            } : null,
          })),
        };
      }
      console.warn(`[TAKEAWAY:news] attempt ${attempt} rejected: ${check.reason} :: ${text.slice(0, 400)}`);
    } catch (err: any) {
      console.warn(`[TAKEAWAY:news] attempt ${attempt} failed: ${err.message}`);
    }
  }
  return null;
}

// ============================================================================
// Neighborhood News takeaway — two-stage pipeline:
//   Stage 1  (LLM, batched): read each article's title+summary and extract
//            structured development facts (address, units, stage) — grounded,
//            null-when-absent, never fabricated.
//   Stage 1.5 (code): normalize addresses, dedup article↔article and
//            article↔permit-record into single project entities (report-data-
//            first: permits from the report's own nearby-construction data).
//   Stage 2  (LLM): phrase the section takeaway from code-computed facts only;
//            numbers are traced back to the input, invalid output → null.
// ============================================================================

export interface NnArticleInput {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  date: string;      // YYYY-MM-DD
  url: string;
}

export interface NnExtraction {
  id: string;
  is_development: boolean;
  address: string | null;
  address_confidence: 'high' | 'low' | null;
  unit_count: number | null;
  building_count: number | null;
  use: string | null;
  stage: 'proposed' | 'approved' | 'permitted' | 'under_construction' | 'complete' | null;
  stage_evidence: string | null;
  one_line: string | null;
  matchable: boolean;
}

const NN_EXTRACT_PROMPT = `You read local news items about a Chicago neighborhood and, for each, extract structured real-estate-development facts. For every input article you are given its title and summary (the RSS excerpt — treat it as the only body text you have). Extract ONLY from that text.

Rules:
1. Grounded only in the given text. No outside knowledge, no assumptions from the neighborhood or the source. Absent field → null. Never guess or infer an address or a unit count that isn't written in the text.
2. The address is the priority field. Dev-tracking sources (YIMBY, The Real Deal, Crain's) often state it in the title or summary — extract the specific street address if present. Intersection or block only → capture it and set "address_confidence":"low".
3. Never fabricate an address or unit count. No stated street address → "matchable": false — that is a correct, useful result, not a failure.
4. "one_line": paraphrase in your own words, no verbatim quote, or null if the text gives nothing beyond the title.
5. Classify "stage" from the text's own language and put the justifying phrase in "stage_evidence": proposed ("plans/proposed/filed/seeking approval/wants to build"), approved ("approved/Plan Commission approves/City Council approves/greenlit"), permitted ("permit issued/permitted/building permit"), under_construction ("breaks ground/under construction/topped out"), complete ("opens/opened/now open/completed").
6. "is_development": false when the item is not a development/construction story (restaurant review, best-of list, concert, culture piece) — those fields then stay null.
7. "matchable": true only when "address" is a real street address (not null, not intersection-only).

OUTPUT — return ONLY a JSON array, one object per input article, same order, shape:
[{"id":"a1","is_development":true,"address":"2400 N Milwaukee Ave","address_confidence":"high","unit_count":48,"building_count":3,"use":"residential","developer":null,"project_name":null,"cost":null,"stage":"approved","stage_evidence":"City Council approved the project","one_line":"…","matchable":true}]

Self-check: every field grounded in the given text; nothing invented; absent → null; address extracted when stated and matchable set accordingly; one_line paraphrased.`;

/** Canonical street-address form for dedup joins: uppercase, no punctuation, short directionals + suffixes, unit/suite stripped. */
export function normalizeStreetAddress(addr: string): string {
  let s = addr.toUpperCase().split(',')[0].replace(/[.#]/g, ' ').trim();
  s = s.replace(/\b(UNIT|SUITE|STE|APT)\s+\S+$/g, '').trim();
  const words = s.split(/\s+/).map(w => {
    const dir: Record<string, string> = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' };
    const suf: Record<string, string> = { AVENUE: 'AVE', AVE: 'AVE', STREET: 'ST', ST: 'ST', BOULEVARD: 'BLVD', BLVD: 'BLVD', DRIVE: 'DR', DR: 'DR', ROAD: 'RD', RD: 'RD', PLACE: 'PL', PL: 'PL', COURT: 'CT', CT: 'CT', LANE: 'LN', LN: 'LN', TERRACE: 'TER', TER: 'TER', PARKWAY: 'PKWY', PKWY: 'PKWY', WAY: 'WAY', CIRCLE: 'CIR', CIR: 'CIR' };
    return dir[w] || suf[w] || w;
  });
  return words.join(' ');
}

const NN_STAGE_RANK: Record<string, number> = { proposed: 1, approved: 2, permitted: 3, under_construction: 4, complete: 5 };

export interface NnProject {
  articleIds: string[];
  address: string | null;          // display form (first seen)
  normalizedAddress: string | null;
  stage: string;                   // furthest-along across sources
  unitCount: number | null;
  buildingCount: number | null;
  use: string | null;
  oneLine: string | null;
  firstReported: string;           // earliest article date
  inPermitData: boolean;           // matched a nearby permit record
  permitDate: string | null;
  matchable: boolean;
}

/** Stage 1.5 — code-side dedup: articles↔articles and articles↔permits by normalized address. */
export function dedupDevProjects(
  extractions: NnExtraction[],
  articles: NnArticleInput[],
  permitRecords: Array<{ address: string; date?: string | null }>,
): NnProject[] {
  const artById = new Map(articles.map(a => [a.id, a]));
  const permitByAddr = new Map<string, { address: string; date?: string | null }>();
  for (const p of permitRecords) {
    if (p.address) permitByAddr.set(normalizeStreetAddress(p.address), p);
  }
  const byAddr = new Map<string, NnProject>();
  const unmatched: NnProject[] = [];
  for (const ex of extractions) {
    if (!ex.is_development) continue;
    const art = artById.get(ex.id);
    if (!art) continue;
    const usable = ex.matchable && ex.address && ex.address_confidence === 'high';
    const norm = usable ? normalizeStreetAddress(ex.address!) : null;
    if (norm && byAddr.has(norm)) {
      // article↔article merge: same address = one project, stage = furthest along
      const proj = byAddr.get(norm)!;
      proj.articleIds.push(ex.id);
      if ((NN_STAGE_RANK[ex.stage || ''] || 0) > (NN_STAGE_RANK[proj.stage] || 0)) proj.stage = ex.stage || proj.stage;
      if (ex.unit_count != null && proj.unitCount == null) proj.unitCount = ex.unit_count;
      if (art.date && art.date < proj.firstReported) proj.firstReported = art.date;
      continue;
    }
    const permitHit = norm ? permitByAddr.get(norm) : undefined;
    const proj: NnProject = {
      articleIds: [ex.id],
      address: ex.address,
      normalizedAddress: norm,
      // permit outranks a news approval for stage
      stage: permitHit && (NN_STAGE_RANK[ex.stage || ''] || 0) < NN_STAGE_RANK.permitted ? 'permitted' : (ex.stage || 'proposed'),
      unitCount: ex.unit_count,
      buildingCount: ex.building_count,
      use: ex.use,
      oneLine: ex.one_line,
      firstReported: art.date || '',
      inPermitData: !!permitHit,
      permitDate: permitHit?.date ?? null,
      matchable: !!norm,
    };
    if (norm) byAddr.set(norm, proj); else unmatched.push(proj);
  }
  return [...Array.from(byAddr.values()), ...unmatched];
}

export interface NnTakeawayResult {
  title: string;
  rows: Array<{ tone: 'insight' | 'caution' | 'good'; html: string; chip: { label: string; href: string } | null }>;
}

const NN_TAKEAWAY_PROMPT = `You write the "Takeaway" box for the Neighborhood News section of a Chicago property report. You are given code-computed facts: article counts by category, momentum score/level, and a de-duplicated list of development projects (address, units, stage, whether each also appears in the report's permit data). The code computed every number — you only phrase them.

Rules:
1. Report-data-first: use ONLY numbers and facts present in the input. Never introduce a number, project, address, or unit count that is not in the input. Quantify only projects the input marks matchable; describe unmatched ones generically ("plus additional approvals reported without a specific address").
2. Title: one serif-style sentence naming the neighborhood and characterizing the news cycle from the given mix (e.g. active dining scene + development pipeline). No hype words ("booming", "exploding", "hot").
3. Rows: 3-4 bullets, each starting with a short <b>bold lead-in.</b> Cover: (a) the overall activity split across categories with the article count; (b) the development pipeline with specific matched projects (units + street) when present; (c) REQUIRED when any project has inPermitData true OR devProjects is non-empty — a "caution" row explaining that news often leads permit records, projects are matched by address across this section and the Corridor/permit data, and each project counts once; give it chip {"label":"Corridor","href":"#corridor"}; (d) optionally the culture/dining side as amenity signal. All other rows tone "insight" (or "good" only if the input's momentum_level is High). No sentiment editorializing beyond that.
4. Bold with <b>…</b> only. No other markup.

OUTPUT — JSON only: {"title":"…","rows":[{"tone":"insight","html":"<b>Active on two fronts.</b> …","chip":null},{"tone":"caution","html":"…","chip":{"label":"Corridor","href":"#corridor"}}]}`;

export function validateNnTakeaway(input: any, parsed: any): TakeawayValidation {
  if (!parsed || typeof parsed.title !== 'string' || !parsed.title.trim()) return { ok: false, reason: 'missing title' };
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 2 || parsed.rows.length > 5) return { ok: false, reason: `rows ${parsed.rows?.length ?? 0}` };
  for (const r of parsed.rows) {
    if (!['insight', 'caution', 'good'].includes(r?.tone)) return { ok: false, reason: `bad tone "${r?.tone}"` };
    if (typeof r?.html !== 'string' || !r.html.trim()) return { ok: false, reason: 'empty row html' };
    if (r.chip != null && (typeof r.chip.label !== 'string' || r.chip.href !== '#corridor')) return { ok: false, reason: 'bad chip' };
    if (r.tone === 'good' && input.momentum_level !== 'High') return { ok: false, reason: 'good tone without High momentum' };
  }
  // number tracing (anti-fabrication) against the code-computed facts
  const allowed = new Set<number>(NUMBER_WHITELIST);
  collectNumbers(input, allowed);
  const fullText = [parsed.title, ...parsed.rows.map((r: any) => r.html)].join(' ');
  for (const n of extractNumbers(fullText)) {
    if (!allowed.has(n)) return { ok: false, reason: `untraceable number ${n}` };
  }
  const lower = fullText.toLowerCase();
  for (const phrase of ['booming', 'exploding', 'skyrocket', 'red-hot', 'hot market']) {
    if (lower.includes(phrase)) return { ok: false, reason: `banned phrase "${phrase}"` };
  }
  return { ok: true };
}

async function nnModelCall(system: string, payload: any, maxTokens: number): Promise<any> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.REPORT_MODEL || 'claude-sonnet-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    ...({ thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } as any),
  });
  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  if (!text || msg.stop_reason === 'max_tokens') throw new Error(`Empty/truncated output (stop_reason=${msg.stop_reason})`);
  return JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''));
}

/** Stage 1 — batched grounded extraction. Invalid rows are dropped, not repaired. */
export async function extractDevFacts(articles: NnArticleInput[]): Promise<NnExtraction[]> {
  if (articles.length === 0) return [];
  const raw = await nnModelCall(NN_EXTRACT_PROMPT, { articles }, 4000);
  if (!Array.isArray(raw)) throw new Error('extraction output not an array');
  const artById = new Map(articles.map(a => [a.id, a]));
  const seen = new Set<string>();
  const out: NnExtraction[] = [];
  for (const e of raw) {
    if (!e || typeof e.id !== 'string') continue;
    const art = artById.get(e.id);
    if (!art || seen.has(e.id)) continue; // one result per input id, ids must exist
    seen.add(e.id);
    const stageOk = e.stage == null || ['proposed', 'approved', 'permitted', 'under_construction', 'complete'].includes(e.stage);
    if (!stageOk) continue;
    // Deterministic grounding vs the actual article text (anti prompt-injection /
    // anti-fabrication): extracted values must literally occur in title+summary.
    const srcText = `${art.title} ${art.summary || ''}`.toUpperCase();
    let address = typeof e.address === 'string' && e.address.trim() ? e.address.trim() : null;
    if (address) {
      // number + a street-name token must both appear in the source text
      const norm = normalizeStreetAddress(address);
      const parts = norm.split(/\s+/);
      const num = parts[0];
      const nameTokens = parts.slice(1).filter(w => w.length > 2 && !['AVE', 'ST', 'BLVD', 'DR', 'RD', 'PL', 'CT', 'LN', 'TER', 'PKWY', 'WAY', 'CIR'].includes(w));
      const numOk = /^\d/.test(num) && srcText.includes(num);
      const nameOk = nameTokens.length === 0 || nameTokens.some(tok => srcText.includes(tok));
      if (!numOk || !nameOk) address = null; // unverifiable → drop, never promote
    }
    let unitCount = Number.isFinite(e.unit_count) ? e.unit_count : null;
    if (unitCount != null) {
      const unitWords: Record<number, string[]> = { 1: ['ONE'], 2: ['TWO'], 3: ['THREE'], 4: ['FOUR'], 5: ['FIVE'], 6: ['SIX'], 7: ['SEVEN'], 8: ['EIGHT'], 9: ['NINE'], 10: ['TEN'], 12: ['TWELVE'] };
      const inText = srcText.includes(String(unitCount)) || (unitWords[unitCount] || []).some(w => srcText.includes(w));
      if (!inText) unitCount = null; // number not in the article → drop it
    }
    out.push({
      id: e.id,
      is_development: !!e.is_development,
      address,
      address_confidence: address ? (e.address_confidence === 'low' ? 'low' : 'high') : null,
      unit_count: unitCount,
      building_count: Number.isFinite(e.building_count) ? e.building_count : null,
      use: typeof e.use === 'string' ? e.use : null,
      stage: e.stage ?? null,
      stage_evidence: typeof e.stage_evidence === 'string' ? e.stage_evidence : null,
      one_line: typeof e.one_line === 'string' && e.one_line.trim() ? e.one_line.trim().slice(0, 240) : null,
      matchable: !!e.matchable && !!address,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Neighborhood People Profile takeaway (fair-housing critical)
// ---------------------------------------------------------------------------

export interface PeopleTakeawayResult {
  title: string;
  rows: Array<{ tone: 'good' | 'caution' | 'insight' | 'neutral'; html: string; chip: string | null }>;
  context_note: string | null;
}

const PEOPLE_CHIP_WHITELIST = new Set(['ACS 5-yr', 'ACS', 'HMDA', 'HMDA 2025', 'Elections', 'LEHD', 'Verify basis']);

// Protected-class / steering firewall for RATED content (title + rows).
// Deterministic — prompt instructions alone are not a sufficient control.
const PEOPLE_PROTECTED_PATTERNS: RegExp[] = [
  /\brace\b/i, /\bracial\b/i, /\bethnic/i, /\bnational origin\b/i,
  /\bhispanic\b/i, /\blatino\b/i, /\blatina\b/i, /\blatinx\b/i,
  /\bblack\b/i, /\bwhite\b/i, /\basian\b/i, /\bbipoc\b/i, /\bminorit/i,
  /\breligio/i, /\bchurch/i, /\bmosque/i, /\bsynagogue/i, /\bchristian\b/i,
  /\bmuslim\b/i, /\bjewish\b/i, /\bcatholic\b/i, /\bimmigrant/i,
  /\bdisabilit/i, /\bdisabled\b/i, /\bfamilial\b/i, /\bprotected class\b/i,
  /\bsex\b/i, /\bgender\b/i, /\bsexual orientation\b/i, /\blgbt/i, /\bgay\b/i,
  /\blesbian\b/i, /\btransgender\b/i, /\bqueer\b/i,
  /\bcolor\b/i, /\bancestry\b/i, /\bmarital\b/i, /\bfamily status\b/i,
  /\bafrican\b/i, /\bcaucasian\b/i, /\bindigenous\b/i, /\bnative american\b/i,
  /\bpacific islander\b/i, /\bnon-?white\b/i, /\bpeople of color\b/i, /\bpersons of color\b/i,
  /\barab\b/i, /\bjew\b/i, /\bjews\b/i, /\bhindu\b/i, /\bbuddhist\b/i,
  /\bsegregat/i, /\bdivers/i, /\bhomogeneous\b/i, /\bmulticultural\b/i,
  /\brefugee/i, /\bforeign-?born\b/i, /\bcitizenship\b/i, /\bnationalit/i,
  // partisan framing is Tier C — context-note only
  /\bdemocrat/i, /\brepublican\b/i, /\bgop\b/i, /\bdnc\b/i, /\brnc\b/i, /\bmaga\b/i,
  /\bprogressive\b/i, /\bconservative\b/i, /\bliberal\b/i, /\bpartisan\b/i,
  /\bleft[- ](?:leaning|wing)\b/i, /\bright[- ](?:leaning|wing)\b/i,
  /\bblue (?:state|city|ward|area)\b/i, /\bred (?:state|city|ward|area)\b/i,
  /\bpolitical\b/i, /\belectorate\b/i, /\bvoting bloc\b/i,
];

// Coded change-language and neighborhood-quality labels — banned EVERYWHERE
// (title, rows, and context note).
const PEOPLE_CODED_PATTERNS: RegExp[] = [
  /up[- ]and[- ]coming/i, /\btransitional\b/i, /\btransitioning\b/i,
  /revitaliz/i, /\bpioneer/i, /\bemerging\b/i, /gentrif/i, /displac/i,
  /\bdesirable\b/i, /\bundesirable\b/i, /\bsafe\b/i, /\bunsafe\b/i, /\bsafer\b/i,
  /\brough\b/i, /\bsketchy\b/i, /\bimproving neighborhood\b/i,
  /\bgood neighborhood\b/i, /\bbad neighborhood\b/i, /\bnice (?:area|neighborhood)\b/i,
  /\bbooming\b/i, /\bexploding\b/i, /\bhot market\b/i,
];

const PEOPLE_TAKEAWAY_PROMPT = `You write "The Takeaway" box for the Neighborhood People Profile (demographics) section of a Chicago property report read by investors and business owners. The code computed every number — you only phrase them. Fair-housing compliance is non-negotiable.

TIER RULES:
- Tier A (rate freely as good/caution/insight/neutral): incomes, income change, tenure (owner/renter mix), vacancy, home values, rents, mortgage-market volume/approval/denial/borrower age band/income/DTI, daytime worker economy (LEHD), population change.
- Tier B (allowed only framed as a neutral business-operations signal, tone "insight" or "neutral"): language mix (frame as customer/tenant communication signal, e.g. bilingual signage or lease translations); ballot-measure results (frame as local cost/policy signal only — e.g. a transfer-tax measure's local yes/no share).
- Tier C (NEVER in rated rows; only in "context_note", reported not rated): partisan lean, racial/ethnic composition. The context_note is plain factual reporting with no advice, no evaluation, no linkage to investment merit.

HARD PROHIBITIONS (rated rows and title): any mention of race, ethnicity, religion, places of worship, national origin, immigration, sex, gender, disability, familial status, or political parties/lean. Never use HMDA race/ethnicity/sex data (not provided). No coded change-language ("up-and-coming", "transitional", "revitalizing", "gentrifying") and no neighborhood quality labels ("good/bad/safe area") anywhere, including the context note. Never tone "bad". Use ONLY numbers present in the input — never compute, extrapolate, or introduce new figures. Do not reference data from other report sections.

OUTPUT — JSON only, 4-6 rows plus optional context_note:
{"title":"one serif-style sentence characterizing the area's economic profile","rows":[{"tone":"good|caution|insight|neutral","html":"<b>Short lead-in.</b> sentence citing input numbers","chip":"ACS 5-yr"|"HMDA 2025"|"Elections"|"LEHD"|"Verify basis"|null}],"context_note":"1-2 factual sentences (Tier C reporting) or null"}
- Bold with <b>…</b> only; no other markup.
- chip = data-source label for the row's primary figure; use "Verify basis" only for a row that flags something the reader should confirm independently.
- Cover a spread: income/values trajectory, tenure/vacancy, mortgage-market demand, daytime economy, and at most one Tier B row.`;

export function validatePeopleTakeaway(input: any, parsed: any): TakeawayValidation {
  if (!parsed || typeof parsed.title !== 'string' || !parsed.title.trim()) return { ok: false, reason: 'missing title' };
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 3 || parsed.rows.length > 6) return { ok: false, reason: `rows ${parsed.rows?.length ?? 0}` };
  for (const r of parsed.rows) {
    if (!['good', 'caution', 'insight', 'neutral'].includes(r?.tone)) return { ok: false, reason: `bad tone "${r?.tone}"` };
    if (typeof r?.html !== 'string' || !r.html.trim()) return { ok: false, reason: 'empty row html' };
    if (r.chip != null && (typeof r.chip !== 'string' || !PEOPLE_CHIP_WHITELIST.has(r.chip))) return { ok: false, reason: `bad chip "${r.chip}"` };
  }
  if (parsed.context_note != null && (typeof parsed.context_note !== 'string' || !parsed.context_note.trim())) {
    return { ok: false, reason: 'bad context_note' };
  }
  const ratedText = [parsed.title, ...parsed.rows.map((r: any) => r.html)].join(' ');
  const allText = ratedText + ' ' + (parsed.context_note || '');
  // number tracing (anti-fabrication) across everything, including the context
  // note. Empty baseline — every number must come from this section's input;
  // the generic whitelist (250/1000) has no legitimate use here.
  const allowed = new Set<number>();
  collectNumbers(input, allowed);
  for (const n of extractNumbers(allText)) {
    if (!allowed.has(n)) return { ok: false, reason: `untraceable number ${n}` };
  }
  // fair-housing firewall: protected classes & partisan framing never rated
  for (const re of PEOPLE_PROTECTED_PATTERNS) {
    if (re.test(ratedText)) return { ok: false, reason: `protected/partisan term in rated text: ${re}` };
  }
  // coded language & quality labels banned everywhere
  for (const re of PEOPLE_CODED_PATTERNS) {
    if (re.test(allText)) return { ok: false, reason: `coded language: ${re}` };
  }
  return { ok: true };
}

/** Strip ALL markup from the context note — it renders as plain text. */
function sanitizePlainText(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

/** Validated People Profile takeaway from code-computed facts. Reject → retry once → null (fail closed). */
export async function generatePeopleTakeaway(facts: any): Promise<PeopleTakeawayResult | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await nnModelCall(PEOPLE_TAKEAWAY_PROMPT, facts, 3500);
      const check = validatePeopleTakeaway(facts, parsed);
      if (check.ok) {
        return {
          title: sanitizePlainText(parsed.title),
          rows: parsed.rows.map((r: any) => ({ tone: r.tone, html: sanitizeRowHtml(r.html.trim()), chip: r.chip ?? null })),
          context_note: parsed.context_note ? sanitizePlainText(parsed.context_note) : null,
        };
      }
      console.warn(`[TAKEAWAY:people] attempt ${attempt} rejected: ${check.reason}`);
    } catch (err: any) {
      console.warn(`[TAKEAWAY:people] attempt ${attempt} failed: ${err.message}`);
    }
  }
  return null;
}

/** Stage 2 — validated section takeaway from code-computed facts. Reject → retry once → null. */
export async function generateNnTakeaway(facts: any): Promise<NnTakeawayResult | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await nnModelCall(NN_TAKEAWAY_PROMPT, facts, 2500);
      const check = validateNnTakeaway(facts, parsed);
      if (check.ok) {
        return {
          title: parsed.title.trim(),
          rows: parsed.rows.map((r: any) => ({ tone: r.tone, html: sanitizeRowHtml(r.html.trim()), chip: r.chip ?? null })),
        };
      }
      console.warn(`[TAKEAWAY:nn] attempt ${attempt} rejected: ${check.reason}`);
    } catch (err: any) {
      console.warn(`[TAKEAWAY:nn] attempt ${attempt} failed: ${err.message}`);
    }
  }
  return null;
}
