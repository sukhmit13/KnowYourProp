# KYP — Step 6A: MBE/WBE certification chips on professional cards

Small follow-on to Step 6. **Nothing in Step 6 changes** — no re-derivation, no layout change, no
new plumbing. This adds one already-fetched field to the professional card and deletes dead CSS.

## Context

`enrichFirms` in `server/dobEnrichment.ts` already fetches and returns `certs: string[]` on every
professional (`dobEnrichment.ts:25`). The server already uppercases and filters it to exactly
`['MBE','WBE','DBE','VBE','BEPD']`, and — importantly — already returns an **empty array when the
firm name match was ambiguous**, by the same identity decision that governs the citywide stats
(see the comment at `dobEnrichment.ts:114-116`). So the client does not need to guard for that;
just don't render an empty array.

The field is fetched and thrown away today. Nothing renders it.

## 1. CSS — append to `kyp-base.css`

```css
.kyp-procard .kyp-pcerts{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.kyp-cert{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-green);background:#e9f4ec;border:1px solid #cfe6d5;border-radius:5px;padding:3px 7px}
```

## 2. Delete dead CSS

`.dob-cert` and `.dob-cert svg` in `client/src/index.css` (just above `.dob-profind`). They were
written for this feature, never referenced by any component, and the new chips have no icon.
Delete both rules — do not extend them.

## 3. Render — `kyp-procard`, between `.phere` and `.pcity`

```jsx
{pro.enrichment?.certs?.length > 0 && (
  <div className="kyp-pcerts">
    {pro.enrichment.certs.map(c => (
      <span key={c} className="kyp-cert" data-testid={`cert-${c.toLowerCase()}`}>{c}</span>
    ))}
  </div>
)}
```

That is the whole change. Order the chips as returned; do not sort or re-label.

## 🔒 Guardrails

- **No "not certified" state.** When `certs` is empty, render nothing — no placeholder chip, no
  "—", no "Not certified". Absence of a certification is absence of data, not a finding. Rendering
  a negative state turns a credential into a judgment about the firm, which this report has no
  basis to make.
- **Never render certs on an unmatched firm.** The server already handles this by returning `[]`,
  but do not add any client-side fallback that infers certs from another source. Attaching an MBE
  certification to the wrong firm is the worst failure mode this feature has.
- **Green here is not verdict green.** A certification is a designation — identity, not a
  judgment — the same rule that keeps the zoning code crest indigo. Use the `.kyp-cert` chip style
  as specified (light fill, green text, chip weight). Do not promote it to a filled block, do not
  reuse `.kyp-block.grn`, and do not add orange/red counterparts.
- Do not expand the acronyms inline. If the section ⓘ tooltip exists, add one line there:
  *"MBE/WBE/DBE/VBE/BEPD are City of Chicago vendor certifications (minority-, women-,
  disadvantaged-, veteran-owned, and business enterprises owned by people with disabilities).
  We show them as reported by the city directory; we do not verify current standing."*

## ✅ Done-when

- [ ] Chips render on professionals whose enrichment returned certs.
- [ ] Professionals with no certs show no chips and no empty gap.
- [ ] Professionals with "No confident citywide match" show no chips.
- [ ] `.dob-cert` / `.dob-cert svg` are gone from `index.css`.
- [ ] Print view includes the chips (they're inline text, no interaction to lose).
