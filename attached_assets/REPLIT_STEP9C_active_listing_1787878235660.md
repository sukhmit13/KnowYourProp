# KYP — Step 9c: Active Listing → match the locked mock

🔴 **Scope:** `RunDetail.tsx` **4871–5010** — the whole section, **140 lines, read at 100%.**
Ships after Step 13b and the 9c CSS patch.

🔴 **Supersedes `REPLIT_STEP9_active_listing.md` and `REPLIT_STEP9B_active_listing_fix.md`** for
everything below. Their data work — `buildListingChecks`, `classifyDisclosures`,
`daysOnMarketVerdict`, `listingClaimLabel` — is correct and **must not be re-derived**.

**Unlike Zoning History and Historic Status, this section partly landed.** It already uses
`.kyp-lstat`, `.kyp-blocks`, `.kyp-block`, `.kyp-disc`, `.kyp-xrow`, `.kyp-prov` and `.kyp-src`. The
gap is smaller and mostly presentational — but the two biggest items are not cosmetic.

---

## 1. The row header is doing no work

Today the collapsed row reads **`04 ACTIVE LISTING — Listed.`** with a badge reading **`LISTED`**.

That is the same information twice, and neither is a finding. The section's job is to check seller
claims against the record; the header should say what the check found.

**Takeaway** — `{price} — {n} days unsold, and {the strongest finding}.` Built in this order:

1. asking price, when `listPrice` exists
2. days on market, when `daysOnMarket` exists **and** `dom.tone` is orange or red
3. the strongest check result — a `wrong` before a `differs`

Where nothing is disputed: `Asking $1.29M — every claim we can check matches the record.`
Where no listing exists: `No active listing on record.` and **the row stays collapsed with no badge.**

**Badge** — counts findings, not status:

| State | Badge | Colour |
|---|---|---|
| any `wrong` | `{n} wrong · {m} to confirm` | red |
| `differs` only | `{m} to confirm` | orange |
| all checks pass | `all claims check out` | green |
| no checks ran | no badge | — |

`ACTIVELY LISTED` already renders inside the section on `.kyp-lstat .pill`. It does not need to be
the badge as well.

---

## 2. Three hero blocks, and what happens when two are missing

Today: `listPrice` renders block 1, the strongest disputed check renders block 2, `daysOnMarket`
renders block 3. On a LoopNet listing with *"Asking Price: Call for Details"* and no listed date,
**two of the three are null and the row renders one lone block** — which is what ships today on
2821 N Milwaukee.

| # | `.bv` | `.bl` | `.bd` | Class |
|---|---|---|---|---|
| 1 | `listPrice` | `Asking price` | `No verdict — we don't appraise; see Valuation` | `.ind` |
| 2 | the disputed claim | `{field} — county records {n}` | why the gap matters | `.orange`, or `.bad` when `wrong` |
| 3 | `daysOnMarket` | `Days on market` | the median and what to expect | `.ind` / `.orange` / `.bad` by `dom.tone` |

**Every block carries `.bclaim`** — `Claimed`, or `Claimed · disputed`, or `Claimed · 2.6× the city
median`. The number came from the seller; the chip says so before the reader reads the number.

**Block 1 takes no verdict colour.** We do not appraise, so an asking price is neither good nor bad.
Indigo, and the `.bd` says where valuation lives.

**When fewer than three blocks have data**, use `kyp-blocks two` / `one` so the row still fills its
width. A single block floating at one-third width reads as a rendering fault, which is how it reads
today.

---

## 3. Three numbered subheads

| n | Label | `.ct` | Renders when |
|---|---|---|---|
| .1 | `WHAT THE SELLER DISCLOSED` | `{n} items · {r} resolved, {o} outstanding` | `disclosures.length > 0` |
| .2 | `CLAIMS CHECKED AGAINST THE RECORD` | `{n} of {m} checked automatically` | `checks.length > 0` |
| .3 | `WHAT THE LISTING SAYS` | `the broker's own words · {n} highlights` | `remarksSummary` **or** `keyFacts.length > 0` |

**The prose and the bullets are one subsection.** `remarksSummary` and `keyFacts` are the same thing
from the same source — the broker's own description, once as a paragraph and once as a list. The mock
gave them separate headers; that was a split by format, not by subject, and it makes the reader cross
a divider to stay inside one voice.

Order inside `.3`: the paragraph, then `.kyp-hl`, then the `Show all {n} highlights →` control.
Where only one of the two exists, the subhead still renders and `.ct` drops the clause it cannot
fill.

Numbers derive from `accProps.index` and renumber sequentially over the subheads that render.

⚠️ **One deliberate deviation from the mock.** The mock predates Step 13b and shows unnumbered
headers with a trailing rule. 13b made subheads numbered with a rule above, and Permits, Transit and
News already ship that form. **Use the 13b form** so this section matches the rest of the report —
that is the only place this spec does not copy the mock exactly. Say so if you would rather have the
mock's form; it is a one-line change and the rest of the report would then need it too.

---

## 4. Disclosures — `.kyp-disc`, already built

`classifyDisclosures` already returns `kind`, `text`, `consequence` and `resolution`. The component
already has `.noted` (indigo) and `.cleared` (green). Two changes:

**Bold the disclosure, plain the consequence.** Today `text` is bold and `consequence` is a `<span>`
on the same run. Break them: the claim on its own line in bold, the consequence beneath in body
weight. A reader scans the bold line and reads the second only if it matters.

**`resolution.because` gets the evidence and the link.** *"The record shows one masonry citation from
Sep 2009 — it predates the arm's-length sale in Mar 2013 and the $248K of permitted work recorded
since."* Then `See Permits & Violations ↓`, in the green of the `.cleared` rule. A resolution the
reader cannot follow is an assertion.

`.kyp-disc` bare (orange, a live finding) keeps its current treatment.

---

## 5. Claims — the two label changes that matter

The `.kyp-xrow` grid is right. Change what the columns are called:

**Left label becomes `THE LISTING CLAIMS`**, not the field name. Today it reads `Year built ·
Claimed` — the field name in the label and a `Claimed` chip beside it. The row's whole point is
claim-versus-record, so name the sides: `THE LISTING CLAIMS` | `COOK COUNTY ASSESSOR`. The field name
is carried by the value itself (`Built 1904`, `Taxes $8,400/yr`). **Drop the `.kyp-prov claimed`
chip** — the column header says it now.

**Add a fifth verdict, `PERMITTED`.** `6 units` against `up to 7 dwelling units` is not a match — the
zoning permits the claim. Green, own word, `.res.perm`.

**`unavailable` renders `CAN'T CHECK`**, not `Unavailable`. Plain language, and it says whose limit
it is.

Verdicts stay: `MATCHES` green, `DIFFERS` orange, `WRONG` red, `PERMITTED` green, `CAN'T CHECK` grey.

### 5.1 The note under the table is required, not decorative

The distinction between **wrong** and **differs** is the section's central claim, and nothing on
screen explains it. Add a `.kyp-note` directly beneath the rows:

> **Red means the record settles it. Orange means it doesn't.** The tax figure is **wrong** — the
> Treasurer's bill *is* the tax. The unit count is **unconfirmed**, not wrong: the assessor counts
> apartments, which is not the same as legal dwelling units. And a missing permit is not proof that
> work was unpermitted — indexes are incomplete. **Get the certificate of occupancy and the current
> tax bill before you price this.**

Written from the actual results — name the fields that came back wrong and differs, and close with
the diligence step. Where every check matches, it reads: *"Every claim we can check against a public
record matches it. That is not a clean bill of health — rents, condition and lease terms are not
public."*

---

## 6. Highlights, and the two notes that replace the amber box

**Highlights go two columns** — `.kyp-hl`, inside `.3` directly under the prose. Six shown,
`Show all {n} highlights →` beneath. Today it is one column, `.slice(0, 10)`, with a grey `+3 more`
that is not a control.

**Delete the amber `.verify` box.** Amber is not in the palette, and it currently fuses two unrelated
statements. Split it into two `.kyp-note` blocks:

**`This is the seller's side.`** — everything above is listing marketing, not official data; what
`can't check` means; and the rule that a claim is only marked **wrong** where the public record is
authoritative on that exact question.

**`How we read days on market.`** — in `.kyp-method`, above the source line. State the 46-day median
and the 45-day convention, **and both limits we cannot yet remove**: the median is all-residential
with no public 2–4 / 5+ unit split, and it is citywide while Wicker Park runs 21–35 days and New
Eastside 28–60. A benchmark whose limits are hidden is worse than no benchmark.

---

## 7. Every label and field

**8 rendered labels, 26 data fields.** Nothing dropped.

| Renders today | Becomes |
|---|---|
| `Claimed` (`.bclaim`) | kept on every block, extended — `Claimed · disputed`, `Claimed · 2.6× the city median` |
| `Asking price` | block 1 `.bl` |
| `Seller's current asking price` | **replaced** — `No verdict — we don't appraise; see Valuation`, which says more |
| `Days on market` | block 3 `.bl` |
| `Record check` (block 2 fallback) | **replaced** — when no claim is disputed, block 2 does not render; the row falls back to `two` |
| `What the seller disclosed` | subhead `.1`, with the counts in `.ct` |
| `Claims checked against the record` | subhead `.2`, with `{n} of {m} checked` in `.ct` |
| `What the listing says` | subhead `.3` |
| `Listing highlights` | folded into subhead `.3`; the count moves to its `.ct` |

| Field | Where |
|---|---|
| `listPrice` | block 1 + takeaway |
| `daysOnMarket` | block 3 + takeaway, via `daysOnMarketVerdict` |
| `unitCount` | block 2 when disputed; also feeds `displayUnits` for the DOM threshold |
| `status`, `statusLabel` | `.kyp-lstat .pill` |
| `listedDate`, `checkedAt` | `.kyp-lstat` meta line |
| `sourceName`, `sourceUrl` | `.kyp-lstat` link and `.kyp-src` |
| `claims` | input to `buildListingChecks` |
| `disclosures` | input to `classifyDisclosures` → `.1` |
| `remarksSummary` | `.3` |
| `keyFacts` | `.3`, under the prose — two columns, six shown, count in the "show all" control |
| `soldPrice`, `soldDate` | the `off_market` / `pending` line, kept as-is |
| `whyHistorical` | the `off_market` line, kept as-is |
| `check.claimLabel` / `recordLabel` / `recordSource` / `result` / `field` / `note` | the `.kyp-xrow` columns; `note` sits under the record value |
| `disclosure.kind` / `text` / `consequence` / `resolution` | `.kyp-disc` per §4 |
| `annualTaxes`, `lotSizeSf`, `assessorApartments`, `yearBuilt`, `zoningMaxUnits`, `permitYears` | unchanged inputs to `buildListingChecks` |
| `validatedArmLengthSale` | unchanged input to `classifyDisclosures` |

**Cut: 1.** `Seller's current asking price` — it restates the label above it.

---

## 8. Pull it out into its own section

`ACTIVE LISTING` is **already a top-level row** at 4871. Nothing to move.

⚠️ **But there is a second one.** `Listing Details` at **11008–11072** sits nested inside
`02 · Property Overview` → `Property Details` — 64 lines rendering the same subject. Merge anything
it shows that this section does not into the row at 4871, then delete it. **Keep every field**; this
step drops nothing.

---

## 9. This section owns the claims-vs-record comparison

County Record, Zoning History and Historic Status all defer here. **The county record is the
baseline; the section holding the competing record does the comparing.** If a reconciliation panel
appears in any of those sections, it is a duplicate and belongs here.

---

## ✅ Done-when

- [ ] The row header carries a finding, not `Listed.`; the badge counts findings.
- [ ] Three hero blocks, falling back to `two` / `one` — never one block at a third width.
- [ ] Block 1 is indigo and takes no verdict colour.
- [ ] Every block carries a `.bclaim` chip.
- [ ] Three numbered subheads; prose and highlights share `.3`, not two headers.
- [ ] Disclosures bold the claim and plain the consequence; a resolution carries its evidence and link.
- [ ] Claim rows read `THE LISTING CLAIMS` | `{record source}`; the `.kyp-prov` chip is gone.
- [ ] `PERMITTED` and `CAN'T CHECK` render as verdicts.
- [ ] The wrong-versus-differs note renders under the table, written from the actual results.
- [ ] Highlights are two columns with a working `Show all {n}` control.
- [ ] The amber `.verify` box is gone, replaced by two `.kyp-note` blocks and `.kyp-method`.
- [ ] `Listing Details` at 11008 is merged in and deleted; no field lost.
- [ ] All 8 labels and 26 fields accounted for; the only cut is the one in §7.
