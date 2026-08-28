# KYP — Step 9c DELTA: the four states Active Listing renders when there is no listing

**You have already applied Step 9c.** This is additive. Do not re-apply the original spec.

Step 9c described `status === 'active'` only. The section has **five** states and two of the other
four are wrong today. Nothing here changes the active-listing layout.

**Files touched:** `client/src/kyp-base.css` (append 3 rules) ·
`client/src/components/report/AccordionSection.tsx` (one optional prop) ·
`client/src/pages/RunDetail.tsx` (two edits).

---

## 0. First, confirm Step 9c landed

Open a report with a live listing. The third subhead should read:

> `02.3` **WHAT THE LISTING SAYS** — the broker's own words · {n} highlights

with the prose and the bullet list both under it. **If you still see two separate headers**
(`What the listing says` and `Listing highlights`), the merge in §3 of the original spec did not
land — fix that first, then come back here.

---

## 1. The state table

| State | Row today | Body today | Change |
|---|---|---|---|
| never checked | **shimmer, forever** | Check button + hint | fix the row only |
| `isPending` | shimmer | spinner + skeletons | none |
| error | fallback text | red box | none |
| `not_found` | `UNLISTED`, slate badge | **one bar, nothing else** | row-only, not expandable |
| `active` / `pending` / `off_market` | takeaway + badge | full body | none — Step 9c already did this |

---

## 2. The permanent shimmer — `RunDetail.tsx:3582`

```js
const listingStillChecking = generateListingSnapshot.isPending
  || (!listingSnapshot && !isListingSnapshotError);
```

The second clause is true on **every fresh report**. A lookup that has never been run renders a
loading skeleton in the trigger row that never resolves — sitting beside a button asking the reader
to start that lookup. It reads as a hung request, and it is the state every report opens in.

Split the two:

```js
const listingChecking = generateListingSnapshot.isPending;
const listingNeverChecked = !listingSnapshot && !isListingSnapshotError && !listingChecking;
```

- `listingChecking` → the `<Skeleton>` (as today).
- `listingNeverChecked` → the sentence below, no badge.

> Not yet checked — run the lookup to search listing sites for this address.

**The body does not change and the row stays expandable.** A button plus the explanation of what it
does is real content, not an empty state.

Update every other reference to `listingStillChecking` — including the `listingBadge` guard at
3600 — to use `listingChecking || listingNeverChecked` so behaviour is otherwise identical.

---

## 3. `not_found` — a finding, not a door — `RunDetail.tsx:4967`

```js
{listingSnapshot.status === 'not_found' ? null : <>…</>}
```

This suppresses the blocks, the disclosures, the record checks, the prose, the caveats and the
source line. The reader clicks a disclosure control and is handed one thin `.kyp-lstat` bar.

**Render no body at all, and stop making the row expandable.** Three edits:

### 3.1 The takeaway must bound the negative

Today: `Unlisted — no active listing found for this address.` That is unfalsifiable — the reader
cannot tell whether we searched four sites or gave up. Name them and date it:

> No public listing on Zillow, Redfin, LoopNet or Crexi. Checked {checkedDate}.

⚠️ **Build the site list from what the lookup actually searched.** Do not hardcode four names if the
backend searches three, or a different three. If the snapshot does not report which sources it hit,
say `No public listing found on the major listing sites. Checked {checkedDate}.` and open a ticket to
return the source list — a specific claim we cannot substantiate is worse than a general one.

This matters because a reader who sees "unlisted" and concludes "not for sale" is wrong. Pocket
listings, direct broker relationships and CoStar-only listings never surface in a public search.

### 3.2 The badge goes indigo

Pass `badgeTone="indigo"` rather than letting it fall through to the row's `verdict` colour.

Indigo is **"no claim"** in this palette. An unlisted property is not a bad property — it is an
off-market one, which is frequently the better position for a buyer to be in. Slate reads as a
shrug; orange would read as a problem. Neither is true.

### 3.3 Pass `collapsible={false}`

```jsx
<AccordionSection
  {...accProps("listing")}
  collapsible={listingSnapshot?.status !== 'not_found'}
>
```

---

## 4. `AccordionSection` — one new prop

⚠️ **This is the first change in the whole redesign that touches a shared component.** Every row in
the report renders through `client/src/components/report/AccordionSection.tsx`. Add the prop with a
default that preserves today's behaviour exactly, and change nothing else in that file.

```tsx
collapsible?: boolean;   // default true
```

Destructure as `collapsible = true`, then:

| Today | When `collapsible === false` |
|---|---|
| `const bodyOpen = open && !off` | `const bodyOpen = collapsible && open && !off` |
| `onClick={onToggle}` | omit the handler |
| `role="button"` | omit — it is not a button |
| `tabIndex={0}` | omit — nothing to focus |
| `onKeyDown={…}` | omit |
| `aria-expanded={bodyOpen}` | omit — invalid on a non-interactive element |
| `cls` array | push `"static"` |
| `<div className="kyp-accbody …">{children}</div>` | do not render the wrapper at all |

Keep the drag handle and the eye toggle working — a static row can still be re-ranked and hidden.
The eye's `stopPropagation` becomes redundant but harmless; leave it.

**Every existing call site is unaffected**, because `accProps` never passes `collapsible`. Only the
`listing` row passes it, and only when `status === 'not_found'`.

**Test note:** `data-testid="trigger-listing-snapshot"` is on `.kyp-acchd`. Any test that clicks it
to expand will no longer expand in the `not_found` case. That is intended — update the assertion,
do not weaken the component.

---

## 5. CSS — append `kyp-base-patch-9c-delta.css`

Three rules. **Append only this delta**; the 11 rules in `kyp-base-patch-9c.css` are unchanged and
already in place.

```css
.kyp-accrow.static .kyp-acchd{cursor:default}
.kyp-accrow.static .kyp-acchd .drag{cursor:grab}
.kyp-acchd .badge.r{background:var(--kyp-bad)}
```

There is no chevron element in `.kyp-acchd`, so the pointer cursor is the only affordance to remove.

**On the third rule — an unrelated defect.** `AccordionSectionProps` declares
`badgeTone?: "g" | "o" | "c" | "r" | "indigo"`, but `kyp-base.css` has **no `.kyp-acchd .badge.r`
rule**: a red badge would render white text on a transparent background. Nothing passes `"r"` today,
so this is latent, not live. Closing it now costs one line.

---

## 6. Noted, not fixed

`AccordionSection` picks the badge tone with a hardcoded section id:

```tsx
badgeTone ?? (id === "zoningHistory" ? "indigo" : v)
```

That is one section's business living inside the component every section shares. It should move up
into `accProps` as a per-row `badgeTone`. **Do not change it in this step** — `zoningHistory` is
already shipped and depends on it. Book it for when a third section needs a custom tone.

---

## ✅ Done-when

- [ ] `listingStillChecking` is split; a never-checked row shows a sentence, not a shimmer.
- [ ] The never-checked row still expands to the Check button.
- [ ] `not_found` renders **no body**; the row is not clickable, not focusable, has no `aria-expanded`.
- [ ] The `not_found` takeaway names the sources actually searched and the date checked.
- [ ] The `UNLISTED` badge is indigo.
- [ ] `AccordionSection` gained exactly one optional prop; every other row is byte-identical in behaviour.
- [ ] `active`, `pending` and `off_market` still expand to the full Step 9c body.
- [ ] 3 CSS rules appended, not 14.
