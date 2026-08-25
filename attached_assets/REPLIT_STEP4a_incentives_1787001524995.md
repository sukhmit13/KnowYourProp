# KYP redesign — Step 4a: convert the Incentives section to the hybrid look

Restyle the **Location Based Incentives** section into the hybrid design language, behind a
flag, preserving ALL of its structure and behavior: the 3 states (Likely relevant / Needs
confirmation / Not applicable), the type sub-groups, the per-program cards with full detail,
the **CSS `order`-based interleaving**, the **per-group collapse**, and the **per-card
expand**. Only the visual classes change. Wired to the real `incMeta` data — nothing lost.

## Prerequisite
Step 1 is in (`client/src/kyp-base.css` imported in `main.tsx`).

## 🔒 Guardrails (live testers)
- **Gate on a `?hybrid=1` URL flag.** With the flag OFF, the section renders exactly as today.
  With it ON, it renders the hybrid look. Nothing else on the site changes.
- **Preserve the machinery, swap only classes.** Keep every `style={{ order }}`, the
  `incMeta.order(slug)` / `incMeta.hiddenCls(slug, groupOpen)` passthrough, the group-collapse
  state (`likelyIncOpen` etc.), and each card's own `open` state. Do NOT rewrite the layout or
  the data. If a group-collapse hide rule is scoped to `.inc`, add the same rule for
  `.kyp-inccard` so hybrid cards still hide when their group folds.
- **No data lost.** Every program, verdict, key-fact, column, link, and source that renders
  today must render in hybrid too.
- Preserve `data-testid`s and element `id`s (e.g. `print-section-tif`, `inc-group-relevant`).

---

## File 1 — append to `client/src/kyp-base.css`

Add these primitives at the end (namespaced `--kyp-*`; verified identical to the approved mock):

```css
/* ── incentives: orange StatBlock + warn group divider (Needs-confirmation state) ── */
.kyp-block.orange{background:var(--kyp-orange)}
.kyp-group.warn .kyp-gcount{background:var(--kyp-orange)} .kyp-group.warn .kyp-glabel{color:var(--kyp-ink)}

/* ── rich incentive program card (expandable) ── */
.kyp-inccard{border:1px solid var(--kyp-line);border-left:4px solid var(--kyp-slate);border-radius:12px;background:var(--kyp-card);margin-bottom:10px;transition:box-shadow .12s ease}
.kyp-inccard.good{border-left-color:var(--kyp-green)} .kyp-inccard.caution{border-left-color:var(--kyp-orange)}
.kyp-inccard.na{border-left-color:var(--kyp-slate);opacity:.7}
.kyp-inccard:hover{box-shadow:0 4px 14px rgba(20,20,20,.06)}
.kic-hd{display:flex;align-items:center;gap:11px;padding:14px 16px;cursor:pointer;flex-wrap:wrap}
.kic-nm{font-size:15px;font-weight:700;color:var(--kyp-ink)}
.kic-tp{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-ink2);background:var(--kyp-wash);border:1px solid var(--kyp-line);border-radius:5px;padding:3px 7px}
.kic-hd .kyp-pill{margin-left:auto}
.kic-chev{width:15px;height:15px;stroke:var(--kyp-muted);fill:none;stroke-width:2.4;flex:none;transition:transform .18s ease}
.kyp-inccard.open .kic-chev{transform:rotate(180deg)}
.kic-body{display:none;padding:0 16px 16px}
.kyp-inccard.open .kic-body{display:block}
.kic-v{border-radius:9px;padding:12px 14px;margin-bottom:12px}
.kyp-inccard.good .kic-v{background:#e9f4ec} .kyp-inccard.caution .kic-v{background:#fbf4e2} .kyp-inccard.na .kic-v{background:var(--kyp-wash)}
.kic-vt{font-size:13px;font-weight:600;color:var(--kyp-ink);line-height:1.5}
.kic-vs{font-size:12px;color:var(--kyp-ink2);line-height:1.5;margin-top:5px}
.kic-kf{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.kic-kfc{background:var(--kyp-wash);border-radius:11px;padding:13px 15px;min-width:122px}
.kic-kl{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-ink2);margin-bottom:7px}
.kic-kv{font-family:var(--kyp-disp);font-size:27px;line-height:1;color:var(--kyp-ink)}
.kic-kd{font-size:11px;color:var(--kyp-ink2);margin-top:7px;line-height:1.4;max-width:150px}
.kic-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:12px}
.kic-ch{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-muted);margin-bottom:6px}
.kic-cols ul{list-style:none;display:flex;flex-direction:column;gap:5px}
.kic-cols li{font-size:12px;color:var(--kyp-ink2);line-height:1.45;padding-left:13px;position:relative}
.kic-cols li::before{content:'';position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--kyp-indigo)}
.kic-ft{display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding-top:12px;border-top:1px solid var(--kyp-line)}
.kic-lnk{font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kyp-indigo);text-decoration:none;display:inline-flex;gap:5px;align-items:center}
.kic-src{margin-left:auto;font-family:var(--kyp-mono);font-size:9.5px;color:var(--kyp-muted)}
.kic-type{font-family:var(--kyp-mono);font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--kyp-ink2);margin:16px 0 9px}
/* group-collapse: mirror whatever hides .inc when its group folds, for hybrid cards */
.kyp-inccard.inc-hidden{display:none}
```

## File 2 — `IncentiveCard.tsx`: add a `variant` prop with a hybrid render branch

Keep the existing component 100% intact for `variant="current"` (the default). Add a
`variant?: "current" | "hybrid"` prop; when `"hybrid"`, render the `.kic-*` markup. Same
props, same internal `open` state, same `id`/`className`/`style` passthrough.

```tsx
// add to IncentiveCardProps:
//   variant?: "current" | "hybrid";
// and default it in the destructure: variant = "current"

// map state -> verdict pill tone
const PILL_TONE = { good: "good", caution: "att", na: "ctx" } as const;

// inside the component, BEFORE the existing return, add:
if (variant === "hybrid") {
  return (
    <article id={id} className={`kyp-inccard ${state}${open ? " open" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...style, ...(order === undefined ? {} : { order }) }}>
      <div className="kic-hd" role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}>
        <span className="kic-nm">{name}</span>
        <span className="kic-tp">{type}</span>
        <span className={`kyp-pill ${PILL_TONE[state]}`}>{pill_label}</span>
        <svg className="kic-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </div>
      <div className="kic-body">
        <div className="kic-v">
          <div className="kic-vt">{verdict}</div>
          {verdict_sub && <div className="kic-vs">{verdict_sub}</div>}
        </div>
        {keyfacts?.length ? <div className="kic-kf">{keyfacts.map((f, i) =>
          <div className="kic-kfc" key={i}><div className="kic-kl">{f.label}</div><div className="kic-kv">{f.value}</div>{f.detail && <div className="kic-kd">{f.detail}</div>}</div>)}</div> : null}
        {columns?.length ? <div className="kic-cols">{columns.map((c, i) =>
          <div key={i}><div className="kic-ch">{c.head}</div><ul>{c.items.map((it, j) => <li key={j}>{it}</li>)}</ul></div>)}</div> : null}
        {note && <div className="kic-v" style={{ background: "var(--kyp-wash)" }}><div className="kic-vs">{note.text}</div></div>}
        {children}
        <div className="kic-ft">
          {links?.map((l, i) => <a className="kic-lnk" key={i} href={l.href} target="_blank" rel="noopener noreferrer">{l.label} →</a>)}
          <span className="kic-src">{source}</span>
        </div>
      </div>
    </article>
  );
}
// ...existing current-variant return stays below, unchanged.
```

> Note: the current `IncentiveCheckerCards` (in `IncentivesCheckerSection.tsx`) also renders
> `IncentiveCard`s. Thread the same `variant` through to them (add a `variant` prop to
> `IncentiveCheckerCards` and pass it down), so the checker cards match.

## File 3 — `RunDetail.tsx`: gate the summary + group headers, and pass `variant`

Near the incentives section, derive the flag once:

```tsx
const hybridInc = new URLSearchParams(window.location.search).has("hybrid");
```

**(a) Summary — replace the `.buckets` block** (RD ~7332) so that when `hybridInc`, the three
count buckets render as filled StatBlocks (keep the same `order: -1`, same `incMeta.counts`):

```tsx
{hybridInc ? (
  <div className="kyp-blocks" style={{ order: -1 }}>
    <div className="kyp-block grn"><div className="bv">{incMeta.counts.likely}</div>
      <div><div className="bl">Likely relevant</div><div className="bd">of {incMeta.counts.likely + incMeta.counts.confirm + incMeta.counts.na} checked</div></div></div>
    <div className="kyp-block orange"><div className="bv">{incMeta.counts.confirm}</div><span className="chip">Verify to claim</span>
      <div><div className="bl">Needs confirmation</div><div className="bd">may qualify</div></div></div>
    <div className="kyp-block slate"><div className="bv">{incMeta.counts.na}</div><span className="chip">No fit</span>
      <div><div className="bl">Not applicable</div><div className="bd">parcel / project data</div></div></div>
  </div>
) : (
  /* existing .buckets block stays here unchanged */
)}
```

Leave the `.take` takeaway block (RD ~7325) as-is for now — it renders fine and isn't the
focus of this pass; we restyle it in a later polish if wanted.

**(b) Group headers — restyle when `hybridInc`.** Keep them as buttons with the SAME onClick,
`aria-expanded`, `id`, `data-testid`, `style={{ order }}`, and open-state — only swap the inner
classes/markup. Map state→variant: likely→`on`, confirm→`warn`, na→`off`. Example for the
"Likely relevant" header (do the same for confirm/na):

```tsx
<button type="button" id="inc-group-relevant"
  className={hybridInc ? `kyp-group on${likelyIncOpen ? " openg" : ""}` : `grouph good${likelyIncOpen ? " openg" : ""}`}
  style={{ order: 999 }} onClick={() => setLikelyIncOpen(o => !o)}
  aria-expanded={likelyIncOpen} data-testid="button-toggle-likely-incentives">
  {hybridInc ? (<>
    <span className="kyp-gcount">{incMeta.counts.likely}</span>
    <span className="kyp-glabel">Likely relevant</span>
    <span className="kyp-grule" />
    <svg className="chev" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:8,width:14,height:14,stroke:"var(--kyp-muted)",fill:"none"}}><path d="m6 9 6 6 6-6" /></svg>
  </>) : (<>
    <span className="gd" />Likely relevant <span className="ct">· {incMeta.counts.likely}</span>
    <svg className="chev" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  </>)}
</button>
```

(Confirm header → `kyp-group warn`, count `incMeta.counts.confirm`, label "Needs confirmation".
NA header → `kyp-group off`, count `incMeta.counts.na`, label "Not applicable".)

**(c) Type sub-labels** — when `hybridInc`, render `<span className="kic-type" style={{order}}>` in
place of `<IncentiveTypeLabel>` (same text, same `order`). Simplest: give `IncentiveTypeLabel` a
`variant` prop that switches its className to `kic-type`.

**(d) Cards** — pass `variant={hybridInc ? "hybrid" : "current"}` to every `<IncentiveCard>` and
to `<IncentiveCheckerCards>` in this section. Keep `state`, `className={incMeta.hiddenCls(...)}`,
`style={{ order: incMeta.order(...) }}` exactly as they are.

---

## ✅ Done-when checklist
- [ ] `?hybrid=1` on a report → Incentives renders the hybrid look (filled count blocks,
      count-badge group dividers, `.kyp-inccard` program cards, semantic pills). Without the
      flag → identical to today.
- [ ] All 3 states present; type sub-groups intact; every program card shows the same verdict,
      key-facts, columns, links, source as the current variant.
- [ ] **Group collapse still works** (clicking a group header folds/unfolds its cards) and the
      **CSS `order` interleaving is unchanged** (cards sit under the right group). If hybrid cards
      don't hide on fold, confirm the `.kyp-inccard.inc-hidden` rule matches `incMeta.hiddenCls`.
- [ ] Each card still expands/collapses its own body.
- [ ] `data-testid`s and ids (`print-section-tif`, `inc-group-relevant`, the toggle buttons) unchanged.
- [ ] `git diff` limited to: `kyp-base.css` (appended CSS), `IncentiveCard.tsx` (variant branch),
      `IncentivesCheckerSection.tsx` (variant passthrough), and the guarded blocks in `RunDetail.tsx`.

## Next
Ship behind the flag, compare old vs new live, gather reactions. Then either flip the flag on
for everyone or tweak (e.g. calmer "Needs confirmation" block, tuck "Not applicable" behind a
"Show N" toggle). Transit is the next section (Step 4b) once this pattern is proven.
