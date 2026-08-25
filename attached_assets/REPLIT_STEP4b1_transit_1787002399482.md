# KYP redesign — Step 4b-1: Transit (Glance + station lists + Street Traffic) → hybrid

Convert the **lower-risk** transit sub-blocks to the hybrid look, behind the same `?hybrid=1`
flag. This is the first of two transit passes; **4b-2** handles the ridership blocks (CTA L /
Metra / Bus with their day-boxes, comparison bars, and trend charts).

In scope here (all inline in `RunDetail.tsx`, the transit section ~17182–18190):
- **Glance → "Closest by mode"** mode tiles (the walk-time redesign)
- **CTA Rail Stations** list
- **Metra Stations** list
- **CTA Bus Routes** list
- **Street Traffic Volume** (StatTiles + city-comparison bar + ADT chart)

NOT in scope (leave exactly as-is): the AI **Takeaway** card at the top of Glance, and the
three **Ridership** sub-blocks (that's 4b-2).

## Prerequisite
Steps 1 + 4a are in (`kyp-base.css` imported; the incentive primitives already appended).

## 🔒 Guardrails
- Gate everything on the existing `?hybrid=1` flag. Flag OFF → transit renders exactly as
  today. Reuse the flag variable from Step 4a; if none, add once near the section:
  `const hybrid = new URLSearchParams(window.location.search).has("hybrid");`
- **Preserve all machinery and data:** the Collapsibles, the collapsed-state summary badges,
  every station/route/segment, distances, line names, and the **real CTA line colors**
  (`ctaLineColorMap[line].hex`). Only classes/markup restyle.
- Keep the **ADT Recharts chart** working (it's fine as-is; optional: set its line stroke to
  `#e07a2e`). Keep all `data-testid`s and element `id`s.

---

## File 1 — update `client/src/kyp-base.css`

Replace the existing `.kyp-mtile` block (the old airy one) with the reorganized mode-tile
primitive (walk time as a left marker panel):

```css
/* ===== MODE TILES (walk time as a left marker panel) — replaces the old .kyp-mtile ===== */
.kyp-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.kyp-mtile{display:flex;border:1px solid var(--kyp-line);border-radius:13px;overflow:hidden;background:var(--kyp-card)}
.kyp-mtw{flex:none;width:74px;background:var(--kyp-indigoSoft);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 8px;border-right:1px solid var(--kyp-line)}
.kyp-mtw .big{font-family:var(--kyp-disp);font-size:38px;line-height:.85;color:var(--kyp-indigo)}
.kyp-mtw .u{font-family:var(--kyp-mono);font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kyp-indigo);opacity:.82;margin-top:4px;text-align:center}
.kyp-mtbody{padding:13px 15px;min-width:0}
.kyp-mth{font-family:var(--kyp-mono);font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kyp-indigo);margin-bottom:5px}
.kyp-mtn{font-size:15px;font-weight:700;color:var(--kyp-ink)}
.kyp-mtpills{margin-top:6px}
.kyp-mts{font-size:11px;color:var(--kyp-ink2);margin-top:7px;line-height:1.35}
```

All other classes used below (`.kyp-title`, `.kyp-row`/`.kyp-rbar`/`.kyp-rn`/`.kyp-rd`,
`.kyp-linepill`, `.kyp-block`, `.kyp-cmp`/`.kyp-track`, `.kyp-pill`) already exist in
`kyp-base.css`. No other CSS needed.

---

## Conversions (each gated `{hybrid ? (…hybrid…) : (…current…)}`)

### 1. Glance — "Closest by mode"
- The `<div className="tz-glabel">Closest by mode</div>` label → `className="kyp-title"` when hybrid.
- Each `.tz-mode` tile → the Option-A `.kyp-mtile`. For each mode you already have the mode
  label, the station/route name, the line pills (`ctaLineColorMap[line].hex`), the **walk
  minutes** (`Math.max(1, Math.round(distance*20))`), and the sub-caption. Emit:

```tsx
<div className="kyp-mtile">
  <div className="kyp-mtw"><span className="big">{walkMin}</span><span className="u">min walk</span></div>
  <div className="kyp-mtbody">
    <div className="kyp-mth">{modeLabel}{/* "CTA Bus" | "CTA L" | "Metra" */}</div>
    <div className="kyp-mtn">{stationOrRouteName}</div>
    {lines?.length ? <div className="kyp-mtpills">
      {lines.map((ln,i) => <span key={i} className="kyp-linepill" style={{ background: lineHex(ln) }}>{ln}</span>)}
    </div> : null}
    <div className="kyp-mts">{subCaption}{/* "0.30 mi · nearest of 5" or "Covers N–S & E–W" */}</div>
  </div>
</div>
```
(Leave the empty-mode fallbacks — "No L stations within 2 mi" etc. — as-is.)

### 2. CTA Rail Stations list — each `.tz-rrow` row → `.kyp-row`
```tsx
<div className="kyp-row">
  <span className="kyp-rbar" style={{ background: lineHex(stop.routes[0]) }} />
  <span className="kyp-rn">{stop.stopName}{" "}
    {stop.routes.map((r,i) => <span key={i} className="kyp-linepill" style={{ background: lineHex(r) }}>{r}</span>)}
  </span>
  <span className="kyp-rd">{stop.distance} mi</span>
</div>
```
Keep the section heading + collapsed-state badges; just restyle the heading text with
`className="kyp-title"` when hybrid if you like (optional).

### 3. Metra Stations list — same pattern
`.kyp-row` with `.kyp-rbar` = the Metra line hex (`getMetraRouteHex`), `.kyp-linepill`s for the
lines, `.kyp-rd` = distance. If a zone is shown, render it as `<span className="kyp-zb">Zone {z}</span>`
inside `.kyp-rn`.

### 4. CTA Bus Routes list — same pattern
`.kyp-row`; `.kyp-rbar` can use the brand indigo (`var(--kyp-indigo)`) since bus routes have no
color; `.kyp-rn` = `#{route}` + a muted "at {stopName}"; `.kyp-rd` = distance.

### 5. Street Traffic Volume
- Segment line → `<div className="kyp-title" style={{fontSize:15}}>{roadName} ({direction}) — {from} to {to}</div>`
  and the "Nearest monitored segment · {ft} ft away · trend {…}" as a plain sub-line
  (`font-family:var(--kyp-sans); font-size:12px; color:var(--kyp-ink2)`).
- The three `<StatTile>`s → three `.kyp-block`s (keep the same values/labels):
```tsx
<div className="kyp-blocks">
  <div className="kyp-block ind"><div className="bv">{latestCount.toLocaleString()}</div><div><div className="bl">Daily vehicles</div><div className="bd">vehicles/day</div></div></div>
  <div className="kyp-block dark"><div className="bv">#{cityRank}</div><div><div className="bl">City rank</div><div className="bd">of {cityTotal} segments</div></div></div>
  <div className="kyp-block grn"><div className="bv">{percentile}<span style={{fontSize:18}}>th</span></div><div><div className="bl">Percentile</div><div className="bd">busier than {percentile}%</div></div></div>
</div>
```
- City-comparison bar (`.tz-cmp` / `.tz-track.flat`) → `.kyp-cmp`:
```tsx
<div className="kyp-cmp">
  <div className="kyp-cmptop"><span className="kyp-cmplab">vs. all monitored segments citywide</span></div>
  <div className="kyp-track"><div className="fill" style={{ width: `${percentile}%`, background: "var(--kyp-orange)" }} />
    <div className="tick" style={{ left: `${percentile}%` }}><span className="tlab">This segment</span></div></div>
  <div className="kyp-cap">Busier isn't better or worse — high-visibility retail wants traffic; quiet residential doesn't.</div>
</div>
```
- Keep the **Annual ADT Recharts chart** as-is (optional: line stroke `#e07a2e`). Its title →
  `<div className="kyp-charttitle">Annual average daily traffic</div>`.

---

## ✅ Done-when checklist
- [ ] `?hybrid=1` → Glance mode tiles show the walk time in the left marker panel; rail/Metra/bus
      lists render as `.kyp-row` with CTA-colored accent bars + real line pills; Street Traffic
      shows the three filled blocks + orange comparison bar. Flag off → identical to today.
- [ ] All stations/routes/segments, distances, line names, walk times, and the **real CTA colors**
      are preserved. No data dropped.
- [ ] Collapsibles still open/close; collapsed-state summary badges unchanged; ADT chart still renders.
- [ ] The AI Takeaway card and the three Ridership sub-blocks are **untouched** (they're 4b-2).
- [ ] `git diff` limited to `kyp-base.css` (the `.kyp-mtile` block) + the guarded blocks in the
      transit section of `RunDetail.tsx`.

## Next
4b-2: CTA L / Metra / Bus **Ridership** — the station/route header (rank + 3-yr trend), the
weekday/Sat/Sun **day-box**, the system-comparison bar, and the 36-month trend charts (recolored
to the hybrid palette / real line colors).
