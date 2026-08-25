# KYP redesign — Step 4c: Safety & Crime (Area Crime Statistics) → hybrid

Convert the **Area Crime Statistics** section to the hybrid look, behind `?hybrid=1`. This is
the first section built on the **fractal** model: ONE section headline (the AI takeaway) at the
top, then subsections that go straight into the highlight(s) that matter for that data. No
per-subsection one-liners — the visuals carry the read, so a second layer of prose would just
restate them.

In scope (inline in `RunDetail.tsx`, the `#section-crime` Collapsible, ~15718–15896):
- Collapsed-trigger badges (violent / property / trend)
- The takeaway headline
- **Around this address** — 250 ft / ¼ mi totals + breakdown-by-type + violent summary
- **Community area ranking** — per-capita percentiles (violent + property) + multi-year trend
- Source line

## Prerequisite
Steps 1 + 4b are in. This step **adds four new primitives** to `kyp-base.css` (below) — two
sub-eyebrow primitive (`.kyp-subhead`) used here for the first time, and two chart primitives
(`.kyp-hbar`, `.kyp-ytrend`). Everything else already exists (`.kyp-eyebrow`,
`.kyp-headline`, `.kyp-content`, `.kyp-block`, `.kyp-cmp`/`.kyp-track`, `.kyp-pill`, `.kyp-leg`,
`.kyp-charttitle`, `.kyp-src`, `.kyp-sec`).

---

## 0. Add to `kyp-base.css` (append — one definition, namespaced tokens)

```css
/* ===== fractal: sub-eyebrow (sub-section divider) ===== */
.kyp-subhead{display:flex;align-items:center;gap:10px;margin:26px 0 12px;scroll-margin-top:20px}
.kyp-subhead .lbl{font-family:var(--kyp-mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kyp-indigo)}
.kyp-subhead .ct{font-family:var(--kyp-mono);font-size:11px;font-weight:700;color:var(--kyp-muted)}
.kyp-subhead .rule{flex:1;height:1px;background:var(--kyp-line)}
.kyp-subhead.fam-green .lbl{color:var(--kyp-green)} .kyp-subhead.fam-orange .lbl{color:var(--kyp-orange)} .kyp-subhead.fam-slate .lbl{color:var(--kyp-slate)}

/* ===== horizontal magnitude bars — labeled distribution (crime by type, etc.) ===== */
.kyp-hbar{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--kyp-line)}
.kyp-hbar:last-of-type{border-bottom:none}
.kyp-hbar .hl{width:150px;font-size:13.5px;font-weight:600;color:var(--kyp-ink);display:flex;align-items:center;gap:8px}
.kyp-hbar .hl .tick{width:4px;height:16px;border-radius:2px;background:var(--kyp-muted);flex:none}
.kyp-hbar .hl .tick.ind{background:var(--kyp-indigoL)} .kyp-hbar .hl .tick.att{background:var(--kyp-orange)} .kyp-hbar .hl .tick.red{background:var(--kyp-bad)}
.kyp-hbar .htrack{position:relative;flex:1;height:9px;background:var(--kyp-wash);border-radius:5px;overflow:hidden}
.kyp-hbar .htrack i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--kyp-muted)}
.kyp-hbar .htrack i.ind{background:var(--kyp-indigoL)} .kyp-hbar .htrack i.att{background:var(--kyp-orange)} .kyp-hbar .htrack i.red{background:var(--kyp-bad)}
.kyp-hbar .hv{font-family:var(--kyp-mono);font-size:12.5px;font-weight:700;color:var(--kyp-ink2);width:34px;text-align:right}
.kyp-hsum{font-size:13px;color:var(--kyp-ink2);line-height:1.5;margin-top:12px;max-width:64ch}
.kyp-hsum b{color:var(--kyp-ink);font-weight:700}

/* red block variant (genuinely-bad crime tier) — pill.bad already exists */
.kyp-block.red{background:var(--kyp-bad)}
/* compact count/toggle variant — short row, no hero negative space */
.kyp-block.count{min-height:0;flex-direction:row;align-items:center;justify-content:flex-start;gap:16px;padding:15px 18px}
.kyp-block.count .bv{font-size:42px;flex:none;line-height:.9}
.kyp-block.count .bl{font-size:9.5px}

/* ===== year column trend — bars take verdict tone (good=falling, att=rising) ===== */
.kyp-ytrend{margin-top:6px}
.kyp-ytrend .yttop{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.kyp-ytrend .ytbars{display:flex;align-items:flex-end;gap:14px;height:112px;padding-top:6px}
.kyp-ytcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.kyp-ytcol .v{font-family:var(--kyp-mono);font-size:11px;font-weight:700;color:var(--kyp-ink2);margin-bottom:5px}
.kyp-ytcol .bar{width:100%;max-width:52px;border-radius:6px 6px 0 0;background:var(--kyp-green);opacity:.4}
.kyp-ytcol.cur .bar{opacity:1}
.kyp-ytcol.cur .v{color:var(--kyp-green)}
.kyp-ytrend.att .kyp-ytcol .bar{background:var(--kyp-orange)}
.kyp-ytrend.att .kyp-ytcol.cur .v{color:#c0651e}
.kyp-ytcol .yr{font-family:var(--kyp-mono);font-size:10px;font-weight:700;color:var(--kyp-muted);margin-top:7px}
```

## 🔒 Guardrails
- Gate every hybrid branch on `?hybrid=1`. Flag off → **identical to today** (leave the existing
  `crm-*` markup untouched in the `else`).
- **Preserve every value:** both radius totals (250 ft + ¼ mi), the full crimes-by-type
  breakdown, the violent-count summary, both per-capita percentiles + rates + tiers, the
  multi-year trend (each year's count + YoY + 3-yr), the community-area name, and the source
  footnote. Nothing dropped.
- **Preserve interactivity:** the 250 ft / ¼ mi **radius toggle** still works — the two count
  blocks become the toggle (`onClick` sets `crimeRadius`), and the breakdown reflects the
  selected radius.
- **🎨 Crime verdict scale = green → orange → red.** (This replaces the old "amber-never-red"
  rule per product direction — genuinely-bad crime should look bad.) Use a 3-tier helper keyed on
  `saferThanPercent`: **≥50 (at/above city median) → `good` (green), 30–49 (below median) → `att`
  (orange, "watch"), <30 (bottom third) → `bad` (red)**. A **falling** trend is green; a **rising**
  trend is orange. Thresholds are tunable — the two cutoffs in the one `crimeTier` helper.
- **Takeaway:** exactly ONE, at the top — section headline = `crimeTakeaway.headline`. Do **not**
  render the old AI **bullets** (`crimeTakeaway.bullets`), and do **not** add per-subsection
  one-liners; the visuals carry each subsection. (If `crimeTakeaway` is absent, omit the headline —
  the subsections still read on their own.)
- Preserve `data-testid`s (`crime-status-badge-*`, `crime-radius-250ft`, `crime-radius-quarter`,
  `crime-area-ranking`, `crime-takeaway`) and the `id`s (`crime-breakdown`, `crime-area-ranking`).

---

## Helpers (add once, near the crime render)

```tsx
// ONE crime verdict scale — green (safe) → orange (watch) → red (bad). Tune the two cutoffs here.
// ≥50 = at/above city median → green · 30–49 = below median → orange · <30 = bottom third → red
const crimeTier  = (p: number) => p >= 50 ? 'good' : p >= 30 ? 'att' : 'bad';
const tierFill   = (t: string) => t === 'good' ? 'var(--kyp-green)' : t === 'att' ? 'var(--kyp-orange)' : 'var(--kyp-bad)'; // track fill
const tierBlock  = (t: string) => t === 'good' ? 'grn' : t === 'att' ? 'orange' : 'red';                                   // filled block variant
// `.kyp-pill good|att|bad` already exist, so a pill just takes the tier string directly.
```

**Count blocks carry the safety verdict.** The two radius-count blocks are colored by the
**violent-crime percentile** (the safety-critical measure) via `tierBlock(crimeTier(...))`: safe →
green, watch → orange, genuinely bad → red. Never black. If `crimeTractData?.violent` is missing,
fall back to `slate`. Both blocks share the color (they're the same measure at two radii);
emphasis for the selected radius comes from the outline, not a different color.

**Breakdown bars encode category, not verdict:** property/petty → `ind` (blue), violent →
`red`. Red reads as "violent/danger" intuitively and matches the live section; this frees orange
to mean only "caution" in the verdict tracks.

## A. Collapsed-trigger badges → `.kyp-pill`
Under `?hybrid=1`, swap the `crm-bdg` badges for pills (same values, same favor logic):
```tsx
<span className={`kyp-pill ${crimeTier(crimeTractData.violent.saferThanPercent)}`} data-testid="crime-status-badge-violent">Violent · safer than {crimeTractData.violent.saferThanPercent}%</span>
<span className={`kyp-pill ${crimeTier(crimeTractData.property.saferThanPercent)}`} data-testid="crime-status-badge-property">Property · safer than {crimeTractData.property.saferThanPercent}%</span>
{crimeTractData.trend?.yoyPercent != null && (
  <span className={`kyp-pill ${crimeTractData.trend.yoyPercent <= 0 ? 'good' : 'att'}`} data-testid="crime-status-badge-trend">
    Trend {crimeTractData.trend.yoyPercent <= 0 ? '▼' : '▲'} {Math.abs(crimeTractData.trend.yoyPercent)}% YoY
  </span>
)}
```

## B. Section header (inside the expanded `seccard`, hybrid branch)
```tsx
<div className="kyp-sec">
  <div className="kyp-eyebrow fam-indigo"><span className="dot" />Safety &amp; Crime</div>
  {crimeTakeaway?.headline && <div className="kyp-headline">{crimeTakeaway.headline}</div>}
  <div className="kyp-content">
    {/* subsections below */}
  </div>
</div>
```
(`.kyp-sec` gives the universal indent; the eyebrow dot hangs in the gutter.)

## C. Subsection — Around this address
```tsx
{(() => {
  const CLIENT_VIOLENT = new Set(['HOMICIDE','CRIMINAL SEXUAL ASSAULT','CRIM SEXUAL ASSAULT','ROBBERY','ASSAULT','BATTERY','KIDNAPPING','HUMAN TRAFFICKING','SEX OFFENSE']);
  const isViol = (t: string) => CLIENT_VIOLENT.has(t.toUpperCase());
  const selected = crimeRadius === 'nearby' ? crimeData.nearby : crimeData.quarterMile;
  const radiusLabel = crimeRadius === 'nearby' ? '250 ft' : 'quarter mile';   // mono-safe (no ¼ glyph)
  const ranked = Object.entries(selected.crimesByType).sort(([,a],[,b]) => Number(b)-Number(a));
  const max = Number(ranked[0]?.[1] || 1);
  const violCount = ranked.filter(([t]) => isViol(t)).reduce((s,[,c]) => s+Number(c), 0);
  const violNames = ranked.filter(([t]) => isViol(t)).map(([t]) => t.toLowerCase()).join(', ');
  const qm = crimeData.quarterMile.totalCrimes, nb = crimeData.nearby.totalCrimes;
  const violPct = Math.round((violCount / Math.max(1, selected.totalCrimes)) * 100);
  const blk = crimeTractData?.violent ? tierBlock(crimeTier(crimeTractData.violent.saferThanPercent)) : 'slate';   // safety verdict → block color
  return (
   <div id="crime-breakdown">
    <div className="kyp-subhead"><span className="lbl">Around this address</span><span className="ct">trailing 12 mo</span><span className="rule" /></div>

    {/* two count blocks = the radius toggle. Both colored by the safety verdict (violent
        percentile). Emphasis for the selected radius = the outline, not a different color. */}
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:6 }}>
      <div className={`kyp-block count ${blk}`} data-testid="crime-radius-250ft" role="button" aria-pressed={crimeRadius==='nearby'} onClick={() => setCrimeRadius('nearby')}
           style={{ cursor:'pointer', outline: crimeRadius==='nearby' ? '2px solid var(--kyp-indigoL)' : 'none', outlineOffset:2 }}>
        <div className="bv">{nb.toLocaleString()}</div><div><div className="bl">Within 250 ft · my block</div><div className="bd">trailing 12 months</div></div>
      </div>
      <div className={`kyp-block count ${blk}`} data-testid="crime-radius-quarter" role="button" aria-pressed={crimeRadius==='quarterMile'} onClick={() => setCrimeRadius('quarterMile')}
           style={{ cursor:'pointer', outline: crimeRadius==='quarterMile' ? '2px solid var(--kyp-indigoL)' : 'none', outlineOffset:2 }}>
        <div className="bv">{qm.toLocaleString()}</div><div><div className="bl">Within quarter mile</div><div className="bd">trailing 12 months</div></div>
      </div>
    </div>

    {ranked.length === 0 ? (
      <p className="text-sm text-muted-foreground">No incidents within {radiusLabel} in the last 12 months.</p>
    ) : (<>
      <div className="kyp-charttitle">Breakdown by type · {radiusLabel}</div>
      <div className="kyp-leg">
        <span className="kyp-lg"><span className="ln" style={{ background:'var(--kyp-indigoL)' }} />Property / petty</span>
        <span className="kyp-lg"><span className="ln" style={{ background:'var(--kyp-bad)' }} />Violent</span>
      </div>
      {ranked.map(([type, count]) => {
        const cat = isViol(type) ? 'red' : 'ind';   // violent → red, property/petty → blue
        return (
          <div className="kyp-hbar" key={type} title={`${type}: ${count}`}>
            <span className="hl"><span className={`tick ${cat}`} />{type.charAt(0)+type.slice(1).toLowerCase()}</span>
            <span className="htrack"><i className={cat} style={{ width:`${(Number(count)/max)*100}%` }} /></span>
            <span className="hv">{count}</span>
          </div>
        );
      })}
      <div className="kyp-hsum">Violent types{violNames ? ` (${violNames})` : ''} make up <b>{violCount} of {selected.totalCrimes.toLocaleString()}</b> incidents — about <b>{violPct}%</b>.</div>
    </>)}
   </div>
  );
})()}
```

## D. Subsection — Community area ranking
```tsx
{crimeTractData?.violent && crimeTractData?.property && (
  <div id="crime-area-ranking" data-testid="crime-area-ranking">
    <div className="kyp-subhead">
      <span className="lbl">{facts?.communityArea ? `${facts.communityArea} community area` : 'Community area'}</span>
      <span className="ct">per capita · last full year</span><span className="rule" />
    </div>

    {/* two percentile tracks — fill colored by favor (amber never red) */}
    {[
      { key:'violent',  label:'Violent crime · per 1,000 residents',        d:crimeTractData.violent },
      { key:'property', label:'Property & other crime · per 1,000 residents', d:crimeTractData.property },
    ].map(({ key, label, d }) => {
      const t = crimeTier(d.saferThanPercent);
      return (
        <div className="kyp-cmp" key={key}>
          <div className="kyp-cmptop"><span className="kyp-cmplab">{label}</span><span className={`kyp-pill ${t}`}>{d.tier} · safer than {d.saferThanPercent}%</span></div>
          <div className="kyp-track">
            <div className="fill" style={{ width:`${d.saferThanPercent}%`, background:tierFill(t) }} />
            <div className="tick" style={{ left:'50%' }}><span className="tlab">City median</span></div>
          </div>
          {d.ratePer1000 != null && <div className="kyp-cap"><b>{d.ratePer1000} {key==='violent' ? 'violent' : 'property'} crimes per 1,000 residents</b> — safer than {d.saferThanPercent}% of all Chicago community areas.</div>}
        </div>
      );
    })}

    {/* multi-year trend — verdict-tone bars */}
    {crimeTractData.trend && crimeTractData.trend.years.length >= 2 && (() => {
      const years = crimeTractData.trend!.years;
      const yoy = crimeTractData.trend!.yoyPercent;
      const threeYr = crimeTractData.trend!.threeYearPercent;
      const maxCount = Math.max(...years.map(y => y.count), 1);
      const falling = yoy != null && yoy <= 0;
      return (
        <div className={`kyp-ytrend${falling ? '' : ' att'}`}>
          <div className="yttop">
            <span className="kyp-charttitle" style={{ margin:0 }}>All incidents · full calendar years</span>
            {yoy != null && (
              <span className={`kyp-pill ${falling ? 'good' : 'att'}`}>
                {falling ? '▼ Down' : '▲ Up'} {Math.abs(yoy)}% YoY{threeYr != null && ` · ${Math.abs(threeYr)}% since ${years[0].year}`}
              </span>
            )}
          </div>
          <div className="ytbars">
            {years.map((y, i) => (
              <div key={y.year} className={`kyp-ytcol${i === years.length-1 ? ' cur' : ''}`}>
                <span className="v">{y.count.toLocaleString()}</span>
                <span className="bar" style={{ height:`${Math.max(8, Math.round((y.count/maxCount)*100))}%` }} />
                <span className="yr">{y.year}</span>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
  </div>
)}
```

## E. Source
```tsx
<div className="kyp-src">Source: Chicago Data Portal — crimes reported to CPD{crimeTractData?.perCapita ? ' · rates per 2023 ACS population · rankings use the last full calendar year' : ''}.</div>
```

---

## ✅ Done-when checklist
- [ ] `?hybrid=1` → crime section shows: eyebrow + takeaway headline; **Around this address**
      subhead + two count blocks (colored by the violent-crime safety verdict —
      green safe / orange watch / red genuinely-bad, never black) that toggle the breakdown +
      the labeled type bars (violent = red, property/petty = blue) + violent summary;
      **Community area** subhead + two percentile tracks (green/orange/red fill by
      tier, City-median tick, rate + tier) + the multi-year trend bars (green if falling, orange
      if rising). Just ONE takeaway headline at the very top — no per-subsection one-liners.
      Flag off → identical to today.
- [ ] Both radius totals, the full type breakdown, the violent summary, both percentiles + rates +
      tiers, every trend year + YoY + 3-yr, the community-area name, and the source are all present.
- [ ] The **radius toggle** still switches the breakdown; selected block shows the outline.
- [ ] Verdict scale is green (safe, safer-than ≥50) → orange (watch, 30–49) → red (bad, <30),
      all from the one `crimeTier` helper. Falling trend = green, rising = orange.
      Breakdown bars are blue (property/petty) / red (violent) — never near-black.
- [ ] `data-testid`s and `id`s preserved.
- [ ] `git diff` limited to the `#section-crime` Collapsible in `RunDetail.tsx` + the four new
      blocks appended to `kyp-base.css`.

## After this
Crime is hybrid. Remaining clean sections on the same pattern: News, Corridor Intelligence,
Neighborhood & People, Nearby Development. Then the harder ones (Overview catch-all + IA reorg,
Local Market, Zoning, Valuation).
