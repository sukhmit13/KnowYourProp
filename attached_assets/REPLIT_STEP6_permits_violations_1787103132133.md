# KYP — Step 6: Permits & Violations → hybrid, promoted to a top-level section

Converts the **Department of Buildings Information** block to the hybrid design and pulls it out of
Property Details into its own top-level section. Match the attached mock exactly.

**Current location:** one `<Collapsible>` (`RunDetail.tsx:8955`, state key `dob`) nested inside the
Property Details card (`id="print-section-property-info"`, line 8391). Inside it: a computed takeaway
(`.crm-take`, 9008), `div#dob-permits` (permits + professionals), `div#dob-violations`, a Sidewalk
Cafe block (9303), and a source line.

---

## 0. CSS — append to `kyp-base.css` (namespaced)

```css
/* permit card */
.kyp-permit{border:1px solid var(--kyp-line);border-left:5px solid var(--kyp-slate);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:var(--kyp-card)}
.kyp-permit.good{border-left-color:var(--kyp-green)} .kyp-permit.att{border-left-color:var(--kyp-orange)}
.kyp-permit .ph{display:flex;align-items:baseline;justify-content:space-between;gap:14px}
.kyp-permit .pscope{font-size:15.5px;font-weight:700;color:var(--kyp-ink);line-height:1.35}
.kyp-permit .pcost{font-family:var(--kyp-disp);font-size:27px;color:var(--kyp-ink);flex:none;line-height:1}
.kyp-permit .ptags{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0 11px}
.kyp-permit .ptag{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:5px;padding:3px 7px;background:var(--kyp-wash);color:var(--kyp-ink2);border:1px solid var(--kyp-line)}
.kyp-permit .ptag.good{background:var(--kyp-green);color:#fff;border-color:var(--kyp-green)}
.kyp-permit .ptag.att{background:var(--kyp-orange);color:#fff;border-color:var(--kyp-orange)}
.kyp-permit .ptag.era{background:var(--kyp-slate);color:#fff;border-color:var(--kyp-slate)}
.kyp-permit .pmeta{display:grid;grid-template-columns:1fr 1fr;gap:9px 20px;padding-top:11px;border-top:1px solid var(--kyp-line)}
.kyp-permit .pml{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-muted);margin-bottom:3px}
.kyp-permit .pmv{font-size:13.5px;font-weight:600;color:var(--kyp-ink)}
.kyp-permit .pmv.dim{font-weight:400;color:var(--kyp-ink2)}

/* professional card */
.kyp-procard{border:1px solid var(--kyp-line);border-left:5px solid var(--kyp-indigoL);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:var(--kyp-card);transition:box-shadow .12s ease}
.kyp-procard.prior{border-left-color:var(--kyp-slate)}
.kyp-procard:hover{box-shadow:0 4px 14px rgba(20,20,20,.06)}
.kyp-procard .ptop{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.kyp-procard .prole{font-family:var(--kyp-mono);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--kyp-indigo);border-radius:5px;padding:3px 7px}
.kyp-procard .pnm{font-size:16.5px;font-weight:700;color:var(--kyp-ink)}
.kyp-procard .pera{margin-left:auto;font-family:var(--kyp-mono);font-size:9px;font-weight:700;text-transform:uppercase;color:var(--kyp-ink2);background:var(--kyp-wash);border:1px solid var(--kyp-line);border-radius:5px;padding:3px 7px}
.kyp-procard .phere{font-size:13.5px;color:var(--kyp-ink2)} .kyp-procard .phere b{color:var(--kyp-ink)}
.kyp-procard .phere .n{font-family:var(--kyp-disp);font-size:19px;color:var(--kyp-ink);line-height:1;margin-right:2px}
.kyp-procard .pcity{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--kyp-ink2);margin-top:9px;padding-top:9px;border-top:1px dashed var(--kyp-line)}
.kyp-procard .pview{font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kyp-indigo);text-decoration:none;white-space:nowrap}
.kyp-procard .kyp-pcerts{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.kyp-cert{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-green);background:#e9f4ec;border:1px solid #cfe6d5;border-radius:5px;padding:3px 7px}

/* violation row + caveat + era divider */
.kyp-viol{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid var(--kyp-line)}
.kyp-viol:last-of-type{border-bottom:none}
.kyp-viol .vchip{font-family:var(--kyp-mono);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:5px;padding:4px 9px;flex:none;white-space:nowrap;margin-top:1px;color:#fff}
.kyp-viol .vchip.open{background:var(--kyp-bad)} .kyp-viol .vchip.complied{background:var(--kyp-green)} .kyp-viol .vchip.stale{background:var(--kyp-slate)}
.kyp-viol .vbody{flex:1;min-width:0}
.kyp-viol .vsc{font-size:14.5px;font-weight:700;color:var(--kyp-ink);line-height:1.35}
.kyp-viol .vmeta{font-family:var(--kyp-mono);font-size:10px;color:var(--kyp-muted);margin-top:4px}
.kyp-caveat{font-size:12.5px;color:var(--kyp-ink2);line-height:1.5;background:var(--kyp-wash);border-radius:10px;padding:12px 14px;margin-top:14px}
.kyp-caveat b{color:var(--kyp-ink);font-weight:600}
.kyp-eradiv{display:flex;align-items:baseline;gap:10px;margin:22px 0 11px}
.kyp-eradiv .lbl{font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kyp-ink)}
.kyp-eradiv .meta{font-family:var(--kyp-mono);font-size:10px;color:var(--kyp-muted)}
.kyp-eradiv .ln{flex:1;height:1px;background:var(--kyp-line)}
.kyp-footnote{font-size:11.5px;color:var(--kyp-muted);line-height:1.5;margin-top:13px;padding-top:11px;border-top:1px dashed var(--kyp-line)}
.kyp-footnote b{color:var(--kyp-ink2);font-weight:600}
.kyp-morelink{font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kyp-indigo);cursor:pointer;margin-top:13px;display:inline-block}
```

---

## 1. Promote to a top-level section
- Move the DOB block out of the Property Details card into its own `<AccordionSection>` at **03**
  (after Property Overview, before Ownership & Sales History).
- **Row header** per the Step 5d contract: `03 · PERMITS & VIOLATIONS — {takeaway} · [badge]`.
  - Takeaway = the existing computed headline (8994-9007), trimmed to ~70 chars, e.g.
    *"$248K of permitted work since 2011 — no open violations."*
  - Badge: `openViolations === 0 && notClosedCount === 0` → green **"Clean record"**;
    `openViolations > 0` → red **"{N} open"**; else orange **"{N} not closed"**.
- **DELETE from the body:** the `.crm-take` takeaway card and its bullet rows, the `chead` title,
  and the old collapsible trigger. Keep the *data* from any bullet that exists nowhere else by
  moving it into the relevant subsection.
- Register in `PRINT_SECTIONS` as its own top-level entry (it currently has **none** — it only
  prints as a child of `property-info`). Add the new collapsible to the print force-open path
  (`localCollapsiblesRef`, 768-783 / 2795-2800) or it prints collapsed.
- Keep `id="dob-permits"`, `id="dob-violations"`, and every `data-testid`
  (`badge-dob-count`, `permit-item-{i}`, `dob-professionals`, `dob-pro-{i}`, `dob-violations-hero`,
  `dob-open-violation-{i}`, `button-toggle-older-violations`, `dob-hist-violation-{i}`,
  `dob-violations-caveat`). Update the quick-nav action (3207) to open `dob` directly rather than
  `propertyDetails` → `dob`.

## 2. Body layout — three subsections

### A. Permit History (`kyp-subhead` + count + year range)
Co-parcel banner first when `coParcelAddress` exists (same copy as today).

**Three filled blocks** (`kyp-block count`), replacing `.dob-msnap`:
`ind` **{allPermits.length}** "Permits on record" / "{earliest} – {latest} · 15-yr window" ·
`dark` **{fmt$(totalCost)}** "Declared value" / "across all permitted work" ·
`orange` **{notClosedCount}** "Not closed out" / "no final inspection recorded" — **render only when
`notClosedCount > 0`**; with 0, show two blocks.

Then the **era grouping exactly as today** — `kyp-eradiv` with "Under current ownership" /
"since {saleLabel} · {N} permits · {fmt$(currentCost)}", then prior. Keep the no-sale-date fallback
copy and the flat single list. Keep sort = issueDate DESC.

**Permit card** (`kyp-permit`), left rail by `permit.eff`: `complete` → `.good`, `expired` → `.att`,
`open` → default slate.
- `.pscope` = `permit.workDescription || cleanType(permit.permitType)` — **the full scope of work**,
  wrapping to as many lines as it needs. Sentence-case the raw all-caps DOB text for legibility
  (display-only; do not alter stored data).
- `.pcost` = `fmt$(permit.estimatedCost)` when `> 0`.
- `.ptags` = status chip (`good`/`att`, text "Complete" / "Expired · not closed" / "Open") ·
  era chip (`.era`, "Current owner" / "Prior owner") · type chip (`cleanType(permitType)`).
- `.pmeta` 2×2 = **Permit no.** (`permitNumber` + " · " + `fmtDate(issueDate)`) ·
  **Owner of record** (`ownerName`) · **Architect** (`architectName`, or "— (not required)" when it
  equals ownerName) · **{contractor role}** (the GC from `contractors[]`, or the first contractor —
  label the row with that contractor's actual `type`, e.g. "Electrical contractor").
- `kyp-morelink` "Show all {N} permits →" when the list is truncated.

### B. Professionals who worked on this building (`kyp-subhead` + count + "most recent first")
Card per firm from the existing `dobDerived.professionals` aggregation — **do not change the
derivation** (name normalization, dedupe, owner-as-architect suppression, sort by latestYear →
permit count → value).

`kyp-procard`, left rail `.prior` when `pro.era === 'prior'`:
- `.prole` = `pro.role` · `.pnm` = `pro.name` · `.pera` = era chip (omit when era is null)
- `.phere` = **Here:** `<span class="n">{permitIds.size}</span> permit(s)` · `<span class="n">{fmt$(value)}</span>` (when > 0) · `latest {latestYear}`
- `.pcerts` = certification chips (see below)
- `.pcity` matched = **Citywide · 5 yr** — {permits} permits · last active {lastActiveYear} · {mix},
  with `.pview` link. Unmatched = "No confident citywide match — showing this property's record only."

**Certification chips (NEW — this is the only added data point in Step 6).**
`enrichFirms` in `server/dobEnrichment.ts` already fetches and returns `certs[]`, filtered to
`MBE|WBE|DBE|VBE|BEPD`. It is currently fetched and thrown away — nothing renders it. Render it.

```jsx
{pro.enrichment?.certs?.length > 0 && (
  <div className="kyp-pcerts">
    {pro.enrichment.certs.map(c => <span key={c} className="kyp-cert">{c}</span>)}
  </div>
)}
```

Rules:
- Render **only** when the firm has a confident citywide match. Certs come from the same
  name-matched enrichment record as the citywide stats — if the match is unconfident (the
  "No confident citywide match" branch), suppress the chips entirely. Attributing an MBE
  certification to the wrong firm is worse than showing nothing.
- Omit the whole `.pcerts` div when `certs[]` is empty. **No "not certified" state, ever** —
  absence of a certification is not a finding, and rendering an empty/negative chip would turn
  a credential into a verdict.
- Chips are **neutral-positive green** (`kyp-cert`), not verdict green. A certification is a
  designation — identity, not a judgment — same rule as the indigo zoning crest. Green here reads
  as "credential," and it's the only green on the card, so it can't be confused with a verdict scale.
- Display the raw designation text as returned (`MBE`, `WBE`, `DBE`, `VBE`, `BEPD`,
  `City-certified`). Do not expand acronyms inline; put the expansion in the section ⓘ tooltip.
- Dead CSS for this already exists at `index.css:1916-1917` — delete it, don't extend it.

**Ranking deep-links (keep and extend).** The link target stays
`/discovery?view={rankingView}&highlight={encodeURIComponent(pro.name)}`, opened in a new tab.
Map role → view: design roles (`/ARCHITECT|ENGINEER/i`) → `architect-rankings`; general/trade
contractors → `gc-rankings`. **Add an expediter mapping** — expediters currently get `gc-rankings`,
which lands on the wrong list; point them at the expediter rankings view if one exists, otherwise
render the card with no link rather than a wrong one. Label the link **"View in rankings →"**.

Footnote (`kyp-footnote`) — keep the existing copy but **fix one factual error**: it says matches are
made "by license number"; `dobEnrichment.ts` matches by **normalized firm name**. Change to
"matches are made by firm name".

### C. Building Violations (`kyp-subhead` + "{N} open · {M} historical")
Two filled blocks replacing `.dob-vhero`:
`grn` when `openCount === 0` (`bad` when > 0) **{openCount}** "Open violations" / the existing sub
copy · `slate` **{older.length}** "Historical records" / "{earliestYear} – {latestYear} · {era note}"
— second block only when `older.length > 0`.

Open violations → `kyp-viol` with `.vchip.open` "Open", `.vsc` = `violationDescription`,
`.vmeta` = "Issued {date}" + " · {violationCode}".

Historical list behind `kyp-morelink` "Show {N} historical records · older than 5 years →" (this is a
list-length control, not a section collapse — allowed). Rows use `.vchip.complied` "Complied" or
`.vchip.stale` "Open · {year}"; `.vmeta` = "Issued {date} · {complied|last status} {statusDate} ·
{era}". **Keep `hidden print:block` behavior so historical rows print expanded.**

Then `kyp-caveat` — the stale-open caveat, copy verbatim, when `staleOpenCount > 0`.

### D. Keep as-is
The **Sidewalk Cafe Permits** block (9303-9343) still renders after violations — same fields
(`doingBusinessAs`/`legalName`, Active/Expired badge, issued, expires, permit number). Single
`kyp-src` source line closes the section.

---

## 🔒 Guardrails
- Chrome-only + relocation. **No data removed** except the `.crm-take` card (its headline moves to
  the row header; any bullet-only datum moves into the relevant subsection).
- Do not change `dobDerived`, the enrichment query, or any derivation logic.
- Bold treatment runs the **whole** section — filled blocks top and bottom, colored rails and filled
  chips through the records. Nothing drops to plain-text styling mid-section.
- Print, deep links, and quick-nav must still resolve.

## Bugs found while mapping — fix if cheap, otherwise log
1. **Enrichment has no loading state.** The query destructures only `data`, so while in flight every
   firm shows "No confident citywide match" — a false negative. Destructure `isLoading` and show a
   neutral "Checking citywide records…" instead.
2. **Self-certified permits are invisible.** Line 2979 reads
   `p.architectType === 'Self-Certified' ? 'Architect' : 'Architect'` — a no-op ternary, so
   self-certification never surfaces. Worth a chip on the permit card.
3. **Footnote misstates matching** (license number vs firm name) — see above.
4. **`generalContractorName` doesn't exist** on the server type (permits.ts:10-26); the fallback at
   9095 is dead. Use `contractors[]` only.

## Unused data available (not in scope, worth noting)
`permits.byType` (new construction / renovation / repair / demolition histogram),
`violations.statusBreakdown` + `violationsByType`,
`enrichment.citywide.totalValue`, `permit.expediterName` on the card, full `contractors[]`.

(`enrichment.certs[]` was on this list — it has been **moved into scope**, see §2.B.)

## ✅ Done-when
- [ ] Permits & Violations is its own top-level section at 03, openable without Property Details.
- [ ] Row header: one title, one ~70-char takeaway, one badge. Body starts with the co-parcel banner
      or the Permit History subhead — no `.crm-take`, no duplicate title.
- [ ] Permit cards show the **full scope of work**, status-colored left rail, filled status/era
      chips, serif cost, and the 2×2 meta grid with the correct contractor role label.
- [ ] Professionals: filled role chip, era rail, serif "Here" counts, citywide line, and a working
      **View in rankings →** deep link with the correct view per role.
- [ ] Professionals: `certs[]` chips (MBE/WBE/DBE/VBE/BEPD) render on matched firms, are absent —
      not negative — on firms with no certs, and are suppressed on unmatched firms. Old dead cert
      CSS at `index.css:1916-1917` deleted.
- [ ] Violations: filled blocks, filled status chips, historical behind show-more (printing
      expanded), caveat intact.
- [ ] Sidewalk cafe block and source line preserved; all testids, ids, print entries resolve.
