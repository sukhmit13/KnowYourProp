// insightReportTemplate.ts
// Fixed HTML template for the one-page Property Insight Report.
// The AI supplies ONLY content (validated JSON); this file owns 100% of the
// layout, typography, and color — so the design is identical on every run.
// Visual reference: attached_assets/insight-report_1785774454475.html

export interface InsightReportContent {
  property_line: string;
  our_take: { headline: string; body: string };
  metadata: {
    last_sold: { value: string; date?: string | null };
    zoning: { value: string };
    property_taxes: { value: string; year?: string | null };
    title_status: { value: string; flagged: boolean };
    landmark: { value: string };
  };
  findings: Array<{ status: 'red' | 'yellow' | 'green'; title: string; body: string }>;
  steps: Array<{ title: string; body: string }>;
  sources: string;
}

const VALID_STATUSES = new Set(['red', 'yellow', 'green']);
const MARKERS: Record<string, string> = { red: '&times;', yellow: '!', green: '&#10003;' };

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function req(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`Insight report content invalid: ${msg}`);
}

// Length ceilings. Prompt limits are tighter; these are the hard caps at which
// worst-case content (8 max-length cards + max steps + max sources) still fits
// the fixed 1056px page — verified by scripts/test_report_template_fit.mjs.
// If content exceeds these, the page would clip silently, so we fail instead.
const LIMITS = {
  property_line: 160,
  take_headline: 100,
  take_body: 420,
  meta_value: 30,
  meta_small: 20,
  finding_title: 110,
  finding_body: 270,
  step_title: 60,
  step_body: 210,
  sources: 420,
};

function reqStr(v: unknown, max: number, label: string): void {
  req(typeof v === 'string' && v.trim().length > 0, `${label} missing or empty`);
  req((v as string).length <= max, `${label} too long (${(v as string).length} chars, max ${max}) — would clip the one-page layout`);
}

/** Validate the AI-supplied content. Throws on any structural problem or
 * over-length field — fail loudly, never render (or save) a clipped report. */
export function validateInsightReportContent(c: any): InsightReportContent {
  req(c && typeof c === 'object', 'content is not an object');
  reqStr(c.property_line, LIMITS.property_line, 'property_line');
  req(c.our_take && typeof c.our_take === 'object', 'our_take missing');
  reqStr(c.our_take.headline, LIMITS.take_headline, 'our_take.headline');
  reqStr(c.our_take.body, LIMITS.take_body, 'our_take.body');
  const m = c.metadata;
  req(m && typeof m === 'object', 'metadata missing');
  for (const k of ['last_sold', 'zoning', 'property_taxes', 'title_status', 'landmark'] as const) {
    req(m[k] && typeof m[k] === 'object', `metadata.${k} missing`);
    req(typeof m[k].value === 'string' && m[k].value.trim().length > 0, `metadata.${k}.value missing or empty`);
    // Metadata cells are single-line facts (e.g. a long landmark district name).
    // Over-length here is real-world data, not AI verbosity — truncate with an
    // ellipsis instead of failing the whole report.
    if (m[k].value.length > LIMITS.meta_value) {
      m[k].value = m[k].value.slice(0, LIMITS.meta_value - 1).trimEnd() + '…';
    }
  }
  if (m.last_sold.date != null) reqStr(m.last_sold.date, LIMITS.meta_small, 'metadata.last_sold.date');
  if (m.property_taxes.year != null) reqStr(m.property_taxes.year, LIMITS.meta_small, 'metadata.property_taxes.year');
  req(typeof m.title_status.flagged === 'boolean', 'metadata.title_status.flagged must be boolean');
  req(Array.isArray(c.findings) && c.findings.length >= 6 && c.findings.length <= 8, `findings must have 6-8 cards (got ${Array.isArray(c.findings) ? c.findings.length : 'none'})`);
  for (const f of c.findings) {
    req(f && typeof f === 'object', 'finding is not an object');
    req(VALID_STATUSES.has(f.status), `finding status "${f?.status}" is not red/yellow/green`);
    reqStr(f.title, LIMITS.finding_title, 'finding title');
    reqStr(f.body, LIMITS.finding_body, 'finding body');
  }
  req(Array.isArray(c.steps) && c.steps.length === 3, `steps must have exactly 3 items (got ${Array.isArray(c.steps) ? c.steps.length : 'none'})`);
  for (const s of c.steps) {
    req(s && typeof s === 'object', 'step is not an object');
    reqStr(s.title, LIMITS.step_title, 'step title');
    reqStr(s.body, LIMITS.step_body, 'step body');
  }
  reqStr(c.sources, LIMITS.sources, 'sources');
  return c as InsightReportContent;
}

/** Value cells: long text values render smaller, matching the reference (`.v.sm`). */
function valClass(value: string): string {
  return value.length > 9 || !/[$\d]/.test(value) ? 'v sm' : 'v';
}

export function renderInsightReport(
  address: string,
  generatedDate: string,
  content: InsightReportContent,
): string {
  const c = content;
  const m = c.metadata;

  const metaCells = [
    `<div class="mcell"><div class="l">LAST SOLD</div><div class="vrow"><span class="${valClass(m.last_sold.value)}">${esc(m.last_sold.value)}</span>${m.last_sold.date ? `<span class="dt">${esc(m.last_sold.date)}</span>` : ''}</div></div>`,
    `<div class="mcell"><div class="l">ZONING</div><div class="${valClass(m.zoning.value)}">${esc(m.zoning.value)}</div></div>`,
    `<div class="mcell"><div class="l">PROPERTY TAXES</div><div class="vrow"><span class="${valClass(m.property_taxes.value)}">${esc(m.property_taxes.value)}</span>${m.property_taxes.year ? `<span class="dt">${esc(m.property_taxes.year)}</span>` : ''}</div></div>`,
    `<div class="mcell"><div class="l">TITLE STATUS</div><div class="${valClass(m.title_status.value)}${m.title_status.flagged ? ' flag' : ''}">${esc(m.title_status.value)}</div></div>`,
    `<div class="mcell"><div class="l">LANDMARK</div><div class="${valClass(m.landmark.value)}">${esc(m.landmark.value)}</div></div>`,
  ].join('\n    ');

  const cards = c.findings
    .map(
      (f) => `<div class="fc ${f.status === 'yellow' ? 'amber' : f.status}"><span class="mk">${MARKERS[f.status]}</span><div class="fbd"><div class="ft">${esc(f.title)}</div>
      <div class="fb">${esc(f.body)}</div></div></div>`,
    )
    .join('\n\n    ');

  const steps = c.steps
    .map(
      (s, i) => `<div class="stp"><div class="num">${i + 1}</div><div class="st">${esc(s.title)}</div><div class="sb">${esc(s.body)}</div></div>`,
    )
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Property Insight Report — ${esc(address)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#141414;--ink2:#54544f;--muted:#8b8a84;--line:#e7e5df;--paper:#faf9f6;
    --navy:#232d6e;--indigo:#2b3a9e;--band:#3a49bd;--gold:#e0a615;
    --red:#b23b2e;--redSoft:#fbecea;--green:#2f7d3f;--greenSoft:#edf6ef;
    --amber:#c98400;--amberBd:#e6a70a;--amberSoft:#fdf6cf;
    --sans:"Inter",-apple-system,sans-serif;--disp:"Instrument Serif",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#d9d7d1;font-family:var(--sans);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:letter;margin:0}
  @media print{body{background:#fff}}
  .page{width:816px;height:1056px;overflow:hidden;margin:0 auto;background:#fff;padding:18px 30px 14px;display:flex;flex-direction:column;page-break-inside:avoid}
  .rhead{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:8px}

  /* HERO — address on top, Our Take stacked below a divider */
  .hero{background:var(--navy);border-bottom:3px solid var(--gold);border-radius:8px 8px 0 0;padding:15px 24px 14px;color:#fff;page-break-inside:avoid}
  .kicker{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.16em;color:#aab0d8;margin-bottom:5px}
  .addr{font-family:var(--disp);font-size:31px;line-height:1;margin-bottom:6px}
  .meta1{font-size:11px;color:#c9cde6;line-height:1.45}
  .hrule{border:0;border-top:1px solid rgba(255,255,255,.22);margin:11px 0 9px}
  .takelbl{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.16em;color:var(--gold);margin-bottom:5px}
  .takehd{font-family:var(--disp);font-size:19px;line-height:1.1;margin-bottom:6px}
  .takebody{font-size:10.5px;line-height:1.42;color:#dcdfef}

  /* METADATA STRIP — label + value only */
  .strip{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--line);border-top:0;border-radius:0 0 8px 8px;margin-bottom:10px}
  .mcell{padding:8px 11px;border-right:1px solid var(--line)}
  .mcell:last-child{border-right:0}
  .mcell .l{font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
  .mcell .v{font-family:var(--disp);font-size:20px;line-height:1;color:var(--ink)}
  .mcell .v.flag{color:var(--red)}
  .mcell .v.sm{font-size:15.5px}
  .vrow{display:flex;align-items:baseline;gap:6px}
  .mcell .dt{font-size:10px;color:var(--muted);white-space:nowrap}

  /* BAND */
  .band{background:var(--band);color:#fff;border-radius:7px;padding:5px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .band .bt{font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.1em}
  .band .bn{font-size:10px;color:#c9cde6}

  /* FINDINGS */
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:9px}
  .fc{border:1px solid var(--line);border-left-width:4px;border-radius:9px;padding:8px 12px;display:flex;gap:8px;page-break-inside:avoid}
  .fc.red{border-left-color:var(--red);background:var(--redSoft)}
  .fc.amber{border-left-color:var(--amberBd);background:var(--amberSoft)}
  .fc.green{border-left-color:var(--green);background:var(--greenSoft)}
  .mk{flex:none;margin-top:1px;font-size:12px;font-weight:700;line-height:1.15;width:13px;text-align:center}
  .fc.red .mk{color:var(--red)} .fc.amber .mk{color:var(--amber)} .fc.green .mk{color:var(--green)}
  .fbd{flex:1;min-width:0}
  .ft{font-size:11.5px;font-weight:700;line-height:1.22;color:var(--ink)}
  .fb{font-size:9.5px;line-height:1.32;color:var(--ink2);margin-top:4px}

  /* NEXT STEPS */
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}
  .stp{border:1px solid var(--line);border-radius:9px;padding:9px 12px;page-break-inside:avoid}
  .stp .num{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:var(--indigo);color:#fff;font-family:var(--mono);font-size:10.5px;font-weight:700;border-radius:6px;margin-bottom:7px}
  .stp .st{font-size:11.5px;font-weight:700;line-height:1.22;margin-bottom:4px;color:var(--ink)}
  .stp .sb{font-size:9.5px;line-height:1.36;color:var(--ink2)}

  /* SOURCES */
  .src{margin-top:auto;border-top:1px solid var(--line);padding-top:8px;page-break-inside:avoid}
  .src .g{font-family:var(--mono);font-size:8.5px;font-weight:700;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
  .src p{font-size:8.5px;color:var(--muted);line-height:1.45}
</style>
</head>
<body>
<div class="page">
  <div class="rhead"><span>Property Insight Report — ${esc(address)}</span><span>Generated ${esc(generatedDate)}</span></div>

  <div class="hero">
    <div class="kicker">PROPERTY INSIGHT REPORT</div>
    <div class="addr">${esc(address)}</div>
    <div class="meta1">${esc(c.property_line)}</div>
    <hr class="hrule">
    <div class="takelbl">OUR TAKE</div>
    <div class="takehd">${esc(c.our_take.headline)}</div>
    <div class="takebody">${esc(c.our_take.body)}</div>
  </div>

  <div class="strip">
    ${metaCells}
  </div>

  <div class="band"><span class="bt">WHAT THE PUBLIC RECORD SAYS ABOUT THIS ASSET</span><span class="bn">Independent of what you plan to do with it</span></div>

  <div class="cards">
    ${cards}
  </div>

  <div class="band"><span class="bt">BEFORE YOU MOVE FORWARD</span><span class="bn">Three things to confirm before you make an offer</span></div>

  <div class="steps">
    ${steps}
  </div>

  <div class="src">
    <div class="g">SOURCES</div>
    <p>${esc(c.sources)} This report is informational only and does not constitute legal, tax, or investment advice.</p>
  </div>
</div>
</body>
</html>`;
}
