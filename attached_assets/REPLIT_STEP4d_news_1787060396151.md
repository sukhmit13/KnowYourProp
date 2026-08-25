# KYP redesign — Step 4d: News (Site-Specific Coverage + Neighborhood News, merged) → hybrid

Behind `?hybrid=1`, replace the two legacy collapsibles — **News & Media Coverage** (`address-news`,
the `newswrap` layout) and **Neighborhood News** (`neighborhood-news`, the `nnwrap` layout) — with
ONE **News** section that holds them as two subsections, in the editorial-archive look with real
publisher logos. **Corridor Intelligence stays its own separate section** (not touched here).

- **Site-Specific Coverage** subsection — this parcel + adjacent, with the per-article record-check.
- **Neighborhood News** subsection — the momentum signal (score / articles / label) + the two
  category lists (Entertainment & Culture, Real Estate & Development).

Everything is the same **archive** treatment: publisher logo plate · serif headline · dateline ·
our one-line read · quiet record-check. Bold = editorial type + logos, not dashboard color.

## Flag gating / merge approach
- Flag OFF → today, unchanged: the two separate collapsibles render as they do now.
- Flag ON → render ONE new `News` collapsible (below) and **do not render** the two legacy
  collapsibles (wrap each legacy block in `{!isHybrid && ( … )}`). No data is lost — the combined
  block reads the same hooks (`newsTakeaway`, `nnTakeaway`, `neighborhoodNewsData`, `merged`).
- **Companion change (small):** in the section registry / scan list (Step 3's `buildScanSections`),
  when hybrid, collapse the `address-news` + `neighborhood-news` entries into one `news` entry
  (anchor `print-section-news`). Corridor's entry is unchanged. If you'd rather ship the visual
  first, you can leave both scan entries pointing at the merged section and tidy the list after.

## Prerequisite
Steps 1 (+ 4c for `.kyp-subhead`) in. This step ships the **archive + logo** primitives and a small
`<LogoTile>` component. `.kyp-block` (used for the momentum stats) already exists.

---

## 0. Add to `kyp-base.css` (append — namespaced)

```css
/* sub-eyebrow — SKIP if already added in 4c */
.kyp-subhead{display:flex;align-items:center;gap:10px;margin:26px 0 12px;scroll-margin-top:20px}
.kyp-subhead .lbl{font-family:var(--kyp-mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--kyp-indigo)}
.kyp-subhead .ct{font-family:var(--kyp-mono);font-size:11px;font-weight:700;color:var(--kyp-muted)}
.kyp-subhead .rule{flex:1;height:1px;background:var(--kyp-line)}
.kyp-subhead.fam-slate .lbl{color:var(--kyp-slate)}

/* subsection headline (each news scope leads with its own takeaway) */
.kyp-subhl{font-family:var(--kyp-sans);font-weight:600;font-size:20px;line-height:1.3;letter-spacing:-.01em;color:var(--kyp-ink);margin:2px 0 16px;max-width:62ch}
.kyp-subhl em{font-family:var(--kyp-disp);font-style:italic;font-weight:400;font-size:1.1em;color:var(--kyp-indigo)}
.kyp-subhl em.grn{color:var(--kyp-green)}

/* ===== coverage ARCHIVE — editorial index (logo plate · serif headline · byline · read) ===== */
.kyp-arch{display:flex;flex-direction:column}
.kyp-archrow{display:flex;gap:20px;align-items:flex-start;padding:20px 0;border-bottom:1px solid var(--kyp-line)}
.kyp-archrow:last-child{border-bottom:none}
.kyp-archbody{flex:1;min-width:0}
.kyp-archlogo{width:112px;height:112px;border-radius:12px;flex:none;background:var(--kyp-card);border:1px solid var(--kyp-line);display:flex;align-items:center;justify-content:center;padding:14px;overflow:hidden}
.kyp-archlogo img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.kyp-archrow.lead .kyp-archlogo{width:146px;height:146px}
/* colored source-plate — fallback when no logo is available */
.kyp-archthumb{width:112px;height:112px;border-radius:12px;flex:none;display:flex;flex-direction:column;justify-content:space-between;padding:13px 14px;color:#fff}
.kyp-archthumb .tsrc{font-family:var(--kyp-disp);font-size:20px;line-height:1.02}
.kyp-archthumb .tdt{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase}
.kyp-archthumb.s-indigo{background:linear-gradient(150deg,#3140a6,#1d2670)}
.kyp-archthumb.s-green{background:linear-gradient(150deg,#357f45,#204f2b)}
.kyp-archthumb.s-slate{background:linear-gradient(150deg,#45443d,#262620)}
.kyp-archkick{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px}
.kyp-archdate{font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-ink2)}
.kyp-archtag{font-family:var(--kyp-mono);font-size:8px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--kyp-indigo);background:var(--kyp-indigoSoft);border-radius:5px;padding:2px 7px}
.kyp-archtag.adj{color:var(--kyp-ink2);background:var(--kyp-wash)}
.kyp-archage{font-family:var(--kyp-mono);font-size:8.5px;font-weight:700;color:#c0651e;background:#fdf3df;border:1px solid #f0d79a;border-radius:5px;padding:2px 6px}
.kyp-archstatus{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-family:var(--kyp-mono);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--kyp-ink2)}
.kyp-archstatus .d{width:7px;height:7px;border-radius:50%;background:var(--kyp-slate);flex:none}
.kyp-archstatus.good .d{background:var(--kyp-green)} .kyp-archstatus.att .d{background:var(--kyp-orange)} .kyp-archstatus.ctx .d{background:var(--kyp-slate)}
.kyp-archtitle{display:block;font-family:var(--kyp-disp);font-size:22px;line-height:1.2;color:var(--kyp-ink);text-decoration:none;margin-bottom:8px}
.kyp-archrow.lead .kyp-archtitle{font-size:24px}
.kyp-archtitle:hover{color:var(--kyp-indigo)}
.kyp-archsum{font-size:14.5px;color:var(--kyp-ink2);line-height:1.55;margin-bottom:8px;max-width:72ch}
.kyp-archattr{font-family:var(--kyp-mono);font-size:10px;color:var(--kyp-muted);margin-bottom:11px;line-height:1.45}
.kyp-archfoot{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.kyp-archrec{font-size:12.5px;color:var(--kyp-ink2);line-height:1.5}
.kyp-archrec b{color:var(--kyp-ink);font-weight:600}
.kyp-archrec a{color:var(--kyp-indigo);text-decoration:none;border-bottom:1.5px solid var(--kyp-indigoSoft);font-weight:600}
.kyp-archread{margin-left:auto;font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kyp-indigo);text-decoration:none;white-space:nowrap}

/* category header + dev-stage tag + corridor cross-ref (neighborhood dev list) */
.kyp-cath{display:flex;align-items:center;gap:8px;font-family:var(--kyp-mono);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kyp-ink2);margin:22px 0 4px}
.kyp-cath svg{width:14px;height:14px;stroke:var(--kyp-ink2);fill:none}
.kyp-stage{font-family:var(--kyp-mono);font-size:8px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:5px;padding:2px 7px}
.kyp-stage.perm{background:#e9f4ec;color:var(--kyp-green)} .kyp-stage.appr{background:#fbeede;color:#c0651e} .kyp-stage.prop{background:var(--kyp-wash);color:var(--kyp-ink2)}
.kyp-across{display:inline-flex;align-items:center;gap:5px;font-family:var(--kyp-mono);font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kyp-green);text-decoration:none}
.kyp-across svg{width:11px;height:11px;stroke:currentColor;fill:none}
```

## The `<LogoTile>` component (bundled logo → favicon → colored plate)
```tsx
// Bundle real logos in the repo, keyed by domain. Add files under /public/logos/*.svg.
const SOURCE_LOGOS: Record<string, string> = {
  'blockclubchicago.org': '/logos/block-club.svg',
  'chicagobusiness.com':  '/logos/crains.svg',
  'therealdeal.com':      '/logos/trd.svg',
  'chicagoyimby.com':     '/logos/yimby.svg',
  'chicagotribune.com':   '/logos/tribune.svg',
  'suntimes.com':         '/logos/sun-times.svg',
  'chicago.eater.com':    '/logos/eater.svg',
};
// deterministic colored-plate tone for the fallback, by source name
const PLATE_TONES = ['s-indigo','s-green','s-slate'];
const domainOf = (url?: string) => { try { return new URL(url!).hostname.replace(/^www\./,''); } catch { return ''; } };

function LogoTile({ url, source, date, lead }: { url?: string; source: string; date?: string; lead?: boolean }) {
  const dom = domainOf(url);
  const bundled = SOURCE_LOGOS[dom];
  const favicon = dom ? `https://www.google.com/s2/favicons?domain=${dom}&sz=128` : '';
  const [src, setSrc] = React.useState(bundled || favicon);
  const [failed, setFailed] = React.useState(!bundled && !favicon);
  if (failed) {                                   // colored source-plate fallback
    const tone = PLATE_TONES[(source.charCodeAt(0) + source.length) % PLATE_TONES.length];
    return (
      <div className={`kyp-archthumb ${tone}`} style={lead ? { width:146, height:146 } : undefined}>
        <div className="tsrc">{source}</div>{date && <div className="tdt">{date}</div>}
      </div>
    );
  }
  return (
    <div className={`kyp-archlogo${lead ? ' lead-logo' : ''}`}>
      <img src={src} alt={source}
        onError={() => { if (src !== favicon && favicon) setSrc(favicon); else setFailed(true); }} />
    </div>
  );
}
```
(The bundled map is the whole "Option A" decision — drop the six SVGs in `/public/logos/` and they
render pixel-perfect; anything not in the map tries a favicon, then the colored plate. Never blank.)

## 🔒 Guardrails
- Gate on `?hybrid=1`; flag off is byte-identical to today (two legacy sections intact).
- **Preserve every value, both scopes.** Site-Specific: takeaway title + rows, both tiers' articles,
  each card's source/date/age/tier/`takeaway`/`attribution`/verification(`state`+`text`+`source_anchor`).
  Neighborhood: takeaway title + rows, `kpis` (momentumScore, articleCount, momentumLabel), every
  `culture` article, every `dev` item (title/source/date/`stageLabel`/`oneLine`/`inPermitData`/`matchable`),
  and the sources line. The fallback (non-generated) branches still render.
- **Record-check → verdict dot:** consistent = good (green), appears_superseded = att (orange),
  no_update = ctx (slate). **Dev stage → tag:** permitted/under_construction/complete = `perm`
  (green), approved = `appr` (amber), proposed = `prop` (slate).
- **Momentum → block color:** `momentumScore >= 75 → grn`, `>= 50 → orange`, else `red` (same
  thresholds as the live badge). Article-count block is neutral `slate` (a count, not a verdict).
- Category icons stay the existing lucide icons (`Utensils`, `Building2`) inside `.kyp-cath`.
- Preserve `data-testid`s: `news-coverage-generated`, `news-takeaway`, `news-card-*`,
  `neighborhood-news-generated`, `nn-takeaway`, `text-news-score/articles/label`, `nn-culture-*`,
  `nn-dev-*`; and the jump anchors.

## Structure (hybrid)
```tsx
<div className="kyp-sec" id="print-section-news">
  <div className="kyp-eyebrow fam-slate"><span className="dot" />News</div>
  <div className="kyp-content">

    {/* ── Subsection 1: Site-Specific Coverage ── */}
    <div className="kyp-subhead fam-slate"><span className="lbl">Site-Specific Coverage</span><span className="ct">{parcelArts.length + adjArts.length}</span><span className="rule" /></div>
    {newsTakeaway?.section?.title && <div className="kyp-subhl">{newsTakeaway.section.title}</div>}
    <div className="kyp-arch">
      {[...parcelArts, ...adjArts].map((m, i) => <SiteCard key={m.id} m={m} g={genById.get(m.id)} lead={i === 0} />)}
    </div>

    {/* ── Subsection 2: Neighborhood News ── */}
    <div className="kyp-subhead fam-slate" style={{ marginTop: 34 }}><span className="lbl">Neighborhood News</span><span className="ct">{facts?.communityArea} · 120 days</span><span className="rule" /></div>
    {nn && <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:18 }}>
        <div className={`kyp-block count ${nn.kpis.momentumScore >= 75 ? 'grn' : nn.kpis.momentumScore >= 50 ? 'orange' : 'red'}`}>
          <div className="bv" data-testid="text-news-score">{nn.kpis.momentumScore}</div>
          <div><div className="bl">Momentum · <span data-testid="text-news-label">{nn.kpis.momentumLabel}</span></div><div className="bd">vs. Chicago community areas</div></div>
        </div>
        <div className="kyp-block count slate">
          <div className="bv" data-testid="text-news-articles">{nn.kpis.articleCount}</div>
          <div><div className="bl">Articles found</div><div className="bd">last 120 days</div></div>
        </div>
      </div>
      {nn.takeaway?.title && <div className="kyp-subhl">{nn.takeaway.title}</div>}

      <div className="kyp-cath"><Utensils className="w-3.5 h-3.5" />Entertainment &amp; Culture</div>
      <div className="kyp-arch">{nn.culture.map((a, i) => <NewsCard key={a.url||i} a={a} testid={`nn-culture-${i}`} />)}</div>

      <div className="kyp-cath"><Building2 className="w-3.5 h-3.5" />Real Estate &amp; Development</div>
      <div className="kyp-arch">{nn.dev.map((p, i) => <DevCard key={p.url||i} p={p} testid={`nn-dev-${i}`} />)}</div>
    </>}

    <div className="kyp-src">{/* the two sources lines, joined */}</div>
  </div>
</div>
```

### `SiteCard` (parcel/adjacent, with record-check)
```tsx
function SiteCard({ m, g, lead }) {
  return (
    <div className="kyp-archrow" data-testid={`news-card-${m.tier}-${m.id}`}>
      <LogoTile url={m.url} source={m.source} date={fmtD(m.date)} lead={lead} />
      <div className="kyp-archbody">
        <div className="kyp-archkick">
          <span className="kyp-archdate">{fmtD(m.date)}</span>
          <span className={`kyp-archtag ${m.tier === 'parcel' ? '' : 'adj'}`}>{m.tier === 'parcel' ? 'This parcel' : `Adjacent · ${m.matched_address}`}</span>
          {m.age_flag && <span className="kyp-archage">{m.age_flag}</span>}
          {g?.verification && <span className={`kyp-archstatus ${vClass(g.verification.state)}`}><span className="d" />{stateLabel[g.verification.state]}</span>}
        </div>
        <a className="kyp-archtitle" href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>
        {g?.takeaway && <div className="kyp-archsum">{g.takeaway}</div>}
        {g?.attribution && <div className="kyp-archattr">{g.attribution}</div>}
        <div className="kyp-archfoot">
          {g?.verification && <span className="kyp-archrec">{g.verification.text} <a href={g.verification.source_anchor}>View records</a></span>}
          {m.url && <a className="kyp-archread" href={m.url} target="_blank" rel="noopener noreferrer">Read at {m.source} ↗</a>}
        </div>
      </div>
    </div>
  );
}
```

### `NewsCard` (culture — light) and `DevCard` (development — stage + cross-ref)
```tsx
function NewsCard({ a, testid }) {
  return (
    <div className="kyp-archrow" data-testid={testid}>
      <LogoTile url={a.url} source={a.source} date={fmtD(a.date)} />
      <div className="kyp-archbody">
        <div className="kyp-archkick"><span className="kyp-archdate">{fmtD(a.date)}</span></div>
        <a className="kyp-archtitle" href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
        <div className="kyp-archfoot"><a className="kyp-archread" href={a.url} target="_blank" rel="noopener noreferrer">Read at {a.source} ↗</a></div>
      </div>
    </div>
  );
}
function DevCard({ p, testid }) {
  return (
    <div className="kyp-archrow" data-testid={testid}>
      <LogoTile url={p.url} source={p.source} date={fmtD(p.date)} />
      <div className="kyp-archbody">
        <div className="kyp-archkick"><span className="kyp-archdate">{fmtD(p.date)}</span><span className={`kyp-stage ${statusCls(p.stage)}`}>{p.stageLabel}</span></div>
        <a className="kyp-archtitle" href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>
        {p.oneLine && <div className="kyp-archsum">{p.oneLine}</div>}
        <div className="kyp-archfoot">
          {p.inPermitData && <a className="kyp-across" href="#print-section-corridor-news" onClick={goCorridor}><svg viewBox="0 0 24 24" strokeWidth="2.2"><path d="M20 6 9 17l-5-5"/></svg>Same project in Corridor permit data — counted once</a>}
          {p.url && <a className="kyp-archread" href={p.url} target="_blank" rel="noopener noreferrer">Read at {p.source} ↗</a>}
        </div>
      </div>
    </div>
  );
}
```
(`vClass`, `stateLabel`, `statusCls`, `fmtD`, `goCorridor`, `genById`, `parcelArts`, `adjArts` are
the same helpers/derivations already in the two legacy blocks — lift them up so the merged block can
use both. `nn = nnTakeaway`.)

---

## ✅ Done-when checklist
- [ ] `?hybrid=1` → one **News** section: **Site-Specific Coverage** (takeaway + parcel/adjacent
      archive rows with logo plate · record-check dot · View records · Read at), then **Neighborhood
      News** (momentum block colored by score + article-count block, takeaway, **Culture** and
      **Development** archives; dev rows show stage tag + "counted once" cross-link). Corridor
      untouched. Flag off → the two legacy sections render exactly as today.
- [ ] Real logos render for the bundled outlets; unknown outlets fall back to favicon then colored
      plate — never blank.
- [ ] Every article/dev item, both takeaways + rows, the KPIs, all stages/attributions/verification
      text + anchors, and both sources lines are present. Fallback branches still render.
- [ ] Record-check dot + dev-stage tag + momentum color all match the mapping above.
- [ ] `data-testid`s preserved; legacy blocks are hidden (not deleted) under the flag.
- [ ] `git diff` scoped to the two news blocks in `RunDetail.tsx` + the appended `kyp-base.css` +
      `/public/logos/*` + the small scan-list companion change.

## After this
**Corridor Intelligence** is the next section — it reuses this exact archive + `<LogoTile>` for its
news, plus its business-license data. Then Neighborhood & People, Nearby Development.
```
