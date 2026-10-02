# §Project Use Analysis — Day Care Center: every live field, and where it lands

Source of truth: `RunDetail.tsx` **6226–7169** at `5855bc9`, plus `childcareAccessTabs`
(`3858–3919`) and `ChildcareDemandMeter.tsx`. Every field the live section renders is listed.
Nothing is dropped silently — anything removed has a reason in the right-hand column.

---

## P2 — Childcare Access (Estimated) → **17.1 Childcare Supply**

| Live field | Lands in | Note |
|---|---|---|
| ZIP / Neighborhood tab strip | the one shared scope control | was one of **two** writers of `childcareViewMode`; now one |
| `.sch-ctx` ZIP · Neighborhood · Ward line | inline beside the control | it describes the control, so it sits with the control |
| status badge (`Underserved`) | the hero block's `.bd` + the lit band | |
| `childrenPerSlot` | hero block `.bv`, coloured by band | **green / orange / red** |
| 4-band track (desert / underserved / adequate / plentiful) | `.kyp-bands b4` | the band cut points are published, not ours |
| `childrenUnder5` | block 3 | |
| `licensedSlots`, `centerSlots`, `familyHomeSlots` | block 2 `.bv` + `.bd` | |
| slot gap to the adequate threshold | `.kyp-bandfoot` | only fact not already in the three blocks |
| `sources.*` | closing `.kyp-src` | |
| `noSlotsDesert` state (children, zero slots) | stated in the closing `.kyp-src` | the state still renders; the footer says what it means |

## P3 — Childcare Demographics → **17.2 (first half)**

| Live field | Lands in |
|---|---|
| second ZIP / Neighborhood tab strip | **removed** — folded into the one shared control |
| `children0to2`, `pct0to2` | block 1 |
| `children3to4`, `pct3to4` | block 2 |
| ACS B09001 source line | closing `.kyp-src` |

## P4 — Parents in Labor Force → **17.2 (second half)**

| Live field | Lands in | Note |
|---|---|---|
| `parentsInLaborForcePct0to5` | `.kyp-hbar` row 1 | |
| `parentsInLaborForcePct6to17` | `.kyp-hbar` row 2 | |
| `parentsInLaborForce0to5` (count) | block 2 | |
| `laborForceDelta` | block 1, coloured by band | **green / orange / red** — new |
| the ≤5 / ≤12 / >12 icon branch | `.kyp-bands b3` | the icons already encoded three states; this draws them |
| `deltaInterpretation` (prose) | **removed** | it is a takeaway. The bands say which state it is; the reader decides what it means |
| B23008 source + small/large delta explainer | closing `.kyp-src` | |

> **Flag.** The 5-point and 12-point cut points are the product's own, not a published
> standard — unlike 17.1's bands. Colouring them is a deliberate exception to the rule that a
> verdict colour needs an outside authority, and the footer says so in one line. If that reads
> as overclaiming, the alternative is to keep the three bands and draw them all in slate: the
> position still shows, the polarity doesn't.

## P5 — Day Care Needs Estimator → **17.3 Slot Gap Estimator** ◄ liftable

| Live field | Lands in |
|---|---|
| `totalChildren`, `totalSlots`, `childrenPerSlot` tiles | `.kyp-facts` strip (subordinated, not three heroes) |
| 1:1 — daycares needed | block 1 `.bv` |
| 1:1 — slot gap | block 1 `.bd` |
| 1:1.5 — daycares needed / slot gap | block 2 |
| 1:1.75 — daycares needed / slot gap | block 3 |
| "Already Met" + check icon state | green `Met` block with the slots-vs-target numbers |
| formula string | closing `.kyp-src` |
| "Insufficient data for estimator." | unchanged empty state |

## P6 — Site Specific Day Care Details → **17.5 Site Capacity**

| Live field | Lands in |
|---|---|
| efficient capacity (75 sq ft) | block 1 |
| comfortable capacity (90 sq ft) | block 2 |
| building size, building type | `.kyp-dtab` |
| land size, footprint, outdoor space | `.kyp-dtab` |
| stories note (`4,980 ÷ 2`) | `.kyp-dtab` sub-text |
| 3 × `<Input>` + Save / Cancel | `.kyp-form` / `.kyp-field` / `.kyp-input` / `.kyp-btn` — **new primitives** |
| Edit Building Details button | the form is always present, so the separate edit button goes |
| "no building record" warning state | unchanged; the form is the panel body in that state |
| DCFS 35 / 75–90 / 75-outdoor caveats | closing `.kyp-src` (three caveats merged into one footer) |

## P7 — CCAP Participation → **17.4** ◄ liftable

| Live field | Lands in | Note |
|---|---|---|
| third ZIP / Neighborhood tab strip | **removed** — the shared control | was the **other** writer of `childcareViewMode` |
| `pct_slots_ccap` | block 1 | |
| `citywide_pct_ccap` | block 2 | **the hard-coded `55` fallback goes** — if no citywide figure is published, the comparison is omitted |
| diff / above / below badge | block 2 `.bd` | |
| "at the city average" state | block 2 `.bd` | |
| DCFS FY2024 source | closing `.kyp-src` | |

## P8 — Nearby Day Care Centers → **17.6 Licensed Competitors**

| Live field | Lands in |
|---|---|
| within 1 / 2 / 3 mile pills | `.kyp-facts` |
| `totalFound` | subhead count |
| 10 rows: name, address, distance | `.kyp-biz-card` |
| "Showing 10 of N" | `.kyp-morelink` → shows all |
| empty state | unchanged |

## P9 — Nearby Day Care Competitors (Google Maps) → **17.7 Google Maps Competitors**

| Live field | Lands in |
|---|---|
| `count` | `.kyp-facts` tile 1 + subhead count |
| `avgRating` | `.kyp-facts` tile 2 |
| `daycareSearchTerm` | `.kyp-facts` tile 3 |
| rows: name, address, distance, reviews, rating | `.kyp-biz-card` |
| pending / failed / none-found states | unchanged |
| Google Maps source line | closing `.kyp-src` |

> **Why 17.6 and 17.7 stay separate.** They look like the same list but they are not the same
> question. 17.6 is "who holds a DCFS licence within 3 miles" — the regulatory field. 17.7 is
> "who a parent finds when they search" — it picks up home-based and unlicensed operators the
> licence list misses, and drops licensed centers with no Maps presence. Merging them would
> make a single list that is wrong about both. The 17.7 footer says this.

---

## Behaviour changes, not just layout

1. **One scope control, seven readers.** Live, `childcareViewMode` is read by five panels and
   written by two, so the estimator silently follows whichever tab the user last touched in a
   different panel. One control at the top fixes that.
2. **The estimator stops recomputing 17.1's numbers.** Live, `:6239` and `:6493` compute the
   same ratio and `:6465`/`:6497` the same gap, independently. One source.
3. **The `55` CCAP fallback goes.** A hard-coded citywide average presented as data is a
   fabricated comparison when the real figure is missing.
4. **Three dead conditional branches removed** (panels 4, 5, 7): each has a three-way class
   expression whose arms are all `bg-secondary border-border`.
5. **`deltaInterpretation` is deleted, not moved.** It is the only prose takeaway in the section.
