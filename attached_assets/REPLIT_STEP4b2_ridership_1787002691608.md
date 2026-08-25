# KYP redesign — Step 4b-2: Transit Ridership (CTA L / Metra / Bus) → hybrid

Convert the three **Ridership** sub-blocks to the hybrid look, behind `?hybrid=1`. This
completes transit. The headline change: the three separate weekday/Saturday/Sunday KPI tiles
become one **day-box** (weekday leads, Sat/Sun secondary, a mini bar-trio) — same three values,
better hierarchy.

In scope (inline in `RunDetail.tsx`):
- **CTA L Ridership** (~17411–17582) — per station (nearest 2)
- **Metra Ridership** (~17628–17858) — line-level YoY + station survey
- **CTA Bus Ridership** (~17903–18066) — per route (nearest 2)

## Prerequisite
Step 4b-1 is in. **No new CSS** — `.kyp-rhead`/`.kyp-rname`/`.kyp-rank`/`.kyp-trend`,
`.kyp-daybox`, `.kyp-cmp`/`.kyp-track`, `.kyp-mcard`/`.kyp-mline`, `.kyp-zone`/`.kyp-zb`,
`.kyp-block`, `.kyp-charttitle`, `.kyp-src`, `.kyp-linepill` all already exist.

## 🔒 Guardrails
- Gate on `?hybrid=1`. Flag off → identical to today.
- **Preserve every value:** the three day-type averages (weekday/Sat/Sun), the rank, the
  3-yr trend, the system median/average, the percentile/tier, Metra's per-line YoY + zone
  flows + survey years, and all source footnotes. Nothing dropped.
- **Keep the Recharts trend charts** (36-month L & bus, 24-month Metra line, survey-year Metra).
  They already color L by line (`getStationLineColor`) and bus by indigo shades — keep that.
  Only restyle the chart **title** (→ `.kyp-charttitle`) and **source** (→ `.kyp-src`).
- Preserve `data-testid`s and ids.

---

## A. CTA L Ridership — per station (repeat for each of the 2 stations)

**(1) Station header** `.tz-rhead` → `.kyp-rhead`:
```tsx
<div className="kyp-rhead">
  <span className="kyp-rname">{station.stationName}</span>
  {station.routes.map((r,i) => <span key={i} className="kyp-linepill" style={{ background: lineHex(r) }}>{r}</span>)}
  {station.weekdayRank > 0 && <span className="kyp-rank">#{station.weekdayRank} / {station.totalStationsRanked}</span>}
  {station.trendPct != null && <span className={`kyp-trend ${station.trendPct >= 0 ? "up" : "down"}`}>
    {station.trendPct >= 0 ? "▲" : "▼"} {Math.abs(station.trendPct)}% · 3-yr</span>}
</div>
```

**(2) The 3 KPI tiles (`.tz-kpis`) → ONE day-box.** Same three values; weekday leads. Bar
heights are each day-type as a % of weekday:
```tsx
{station.latest && (() => {
  const wd = station.latest.weekday, sa = station.latest.saturday, su = station.latest.sunday;
  const h = (n) => `${Math.max(6, Math.round((n / wd) * 100))}%`;
  return (
    <div className="kyp-daybox">
      <div className="kyp-daytop">
        <div><div className="kyp-dbig">{wd.toLocaleString()}</div><div className="kyp-dbl">Avg weekday · entries/day</div></div>
        <div className="kyp-dtri">
          <div className="kyp-dcell"><div className="dv">{sa.toLocaleString()}</div><div className="dl">Sat</div></div>
          <div className="kyp-dcell"><div className="dv">{su.toLocaleString()}</div><div className="dl">Sun/Hol</div></div>
        </div>
      </div>
      <div className="kyp-daybars"><i style={{ height: "100%" }} /><i className="sat" style={{ height: h(sa) }} /><i className="sun" style={{ height: h(su) }} /></div>
      <div className="kyp-dlab"><span>Weekday</span><span>Sat</span><span>Sun/Hol</span></div>
    </div>
  );
})()}
```

**(3) System-comparison bar** `.tz-cmp` → `.kyp-cmp`. Reuse your existing `scaleMax`
(`max*1.15`), `systemStats.median/average`, tier, and percentile:
```tsx
<div className="kyp-cmp">
  <div className="kyp-cmptop">
    <span className="kyp-cmplab">vs. all {station.totalStationsRanked} L stations · weekday avg</span>
    <span className={`kyp-pill ${tier === "Strong" ? "good" : "ctx"}`}>{tier} activity</span>
  </div>
  <div className="kyp-track">
    <div className="fill" style={{ width: `${(wd / scaleMax) * 100}%` }} />
    <div className="tick" style={{ left: `${(systemStats.median / scaleMax) * 100}%` }}><span className="tlab">Median</span></div>
    <div className="tick" style={{ left: `${(systemStats.average / scaleMax) * 100}%` }}><span className="tlab">Sys avg</span></div>
  </div>
  <div className="kyp-cap"><b>This station {wd.toLocaleString()}</b> · Median {systemStats.median.toLocaleString()} · System avg {systemStats.average.toLocaleString()} — busier than {pctile}% of stations.</div>
</div>
```
(tier: >70 pctile = "Strong", 30–70 = "Moderate", <30 = "Limited"; only "Strong" → green pill,
the rest → slate `ctx` — activity level isn't a good/bad verdict.)

**(4) Trend chart** — keep the Recharts `LineChart` as-is; wrap its title in
`<div className="kyp-charttitle">Weekday trend · 36 months</div>` and the footnote in
`<div className="kyp-src">…</div>`. Optionally render a `.kyp-leg` legend above it:
```tsx
<div className="kyp-leg">{topStations.map((s,i) =>
  <span className="kyp-lg" key={i}><span className="ln" style={{ background: lineHex(s.routes[0]) }} />{s.stationName}</span>)}
</div>
```

## B. CTA Bus Ridership — per route
**Identical to A**, with these text swaps: header shows `#{route} {routeName}`; rank label
"routes" not "stations"; day-box detail "riders/day" not "entries/day"; comparison label
"vs. all {totalRoutesRanked} bus routes · weekday avg" and "{tier} activity"; chart legend
uses the indigo shades (`#2b3a9e`, `#93a0da`). Everything else the same.

## C. Metra Ridership

**(1) Line-level card** (per nearby station) → `.kyp-mcard`:
```tsx
<div className="kyp-mcard">
  <div className="kyp-mctop">
    <span className="kyp-rname" style={{ fontSize: 15 }}>{stationName}</span>
    <span className="kyp-rd">{distance} mi</span>
    {zone && <span className="kyp-zb">Zone {zone}</span>}
  </div>
  {lines.map((ld) => (
    <div className="kyp-mline" key={ld.name}>
      <span><span className="kyp-linepill" style={{ background: metraHex(ld.name) }}>{ld.name}</span>{" "}<b>{ld.latest.rides}</b> riders/mo</span>
      <span className={`kyp-trend ${ld.yoyPct >= 0 ? "up" : "down"}`}>{ld.yoyPct >= 0 ? "▲" : "▼"} {Math.abs(ld.yoyPct)}% YoY</span>
    </div>
  ))}
</div>
```
Zone-flow note → `<div className="kyp-zone">{…the same sentence…}</div>`. Keep the 24-month line
chart (title → `.kyp-charttitle`, source → `.kyp-src`).

**(2) Station-level survey** — header + three stat blocks:
```tsx
<div className="kyp-title" style={{ fontSize: 14 }}>Station-level detail <span className="qual">· {surveyYear} survey</span></div>
<div className="kyp-rhead">
  <span className="kyp-rank">#{rank} / {totalStations}</span>
  {sincePct != null && <span className={`kyp-trend ${sincePct >= 0 ? "up" : "down"}`}>{sincePct >= 0 ? "▲" : "▼"} {Math.abs(sincePct)}% since 2016</span>}
</div>
<div className="kyp-blocks">
  <div className="kyp-block ind"><div className="bv">{boards2018}</div><div><div className="bl">Daily boardings</div><div className="bd">avg weekday · {surveyYear}</div></div></div>
  <div className="kyp-block dark"><div className="bv">#{rank}</div><div><div className="bl">Station rank</div><div className="bd">of {totalStations} stations</div></div></div>
  {boards2006 > 0 && <div className="kyp-block grn"><div className="bv">{boards2006}</div><div><div className="bl">2006 baseline</div><div className="bd">boardings/day</div></div></div>}
</div>
```
Keep the survey-year trend chart (title → `.kyp-charttitle`, source → `.kyp-src`).

---

## ✅ Done-when checklist
- [ ] `?hybrid=1` → each ridership block shows: the `.kyp-rhead` header (name · line pills · rank ·
      ▲/▼ 3-yr), the **day-box** (weekday big, Sat/Sun secondary, bar-trio), the `.kyp-cmp`
      comparison bar (labeled ticks + tier pill), and the trend chart. Flag off → identical to today.
- [ ] The three day-type averages, rank, 3-yr trend, median/average, percentile/tier, Metra
      per-line YoY, zone flows, and survey years are all present. Nothing dropped.
- [ ] Recharts trend charts still render (L by line color, bus indigo shades, Metra line/survey).
- [ ] "Strong" activity → green pill; Moderate/Limited → slate. Up trend green, down red.
- [ ] `git diff` limited to the three ridership blocks in the transit section of `RunDetail.tsx`.

## Transit is now fully converted.
With 4b-1 + 4b-2 in and looking right behind the flag, transit + incentives are both hybrid.
Flip `?hybrid=1` on when you're happy, then the remaining sections convert one at a time on the
same pattern (each: mock from `kyp-base.css` → faithful side-by-side → flag-gated spec).
