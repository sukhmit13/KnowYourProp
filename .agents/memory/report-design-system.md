---
name: Report design system
description: Durable rules for restyling report pages and verifying design-subagent passes
---

# Report design system

Restyles must reuse the shared primitives already in the global stylesheet (section headers, stat tiles, viz lists, directory fact tiles/rows, market tables/ladders) — grep the stylesheet before inventing new classes. Style via explicit classes on JSX; broad legacy-Tailwind descendant selectors or `!important` overrides get failed in review as scope leaks.

**Trend/delta colors are sign-based only:** green #2f7d3f positive, red #d13b26 negative — never amber/magnitude thresholds. Exclusion-type markers (e.g. "doesn't count toward FAR") are muted, not red. Labels/column headers use dark ink #565651 wt 600–700; faint #8b8a84 is reserved for source lines and secondary qualifiers.

**Charts/bars:** if a bar's position is computed from live data, its axis labels must be derived from the same scale — hard-coded axis labels alongside computed geometry is flagged as a misleading data-logic change.

**Why:** multiple architect reviews failed rounds on exactly these points (scope-leaking CSS, hardcoded axis vs computed bars, magnitude-colored badges, JSX string-transforms like title-casing being treated as logic changes — use CSS `text-transform` instead).

**How to apply (after any design-subagent pass):** subagents have repeatedly broken the build (mismatched JSX tags, lucide imports shadowing UI components, unimported icons). Always: run tsc and compare against the pre-existing error baseline (do not expect zero); check the workflow actually reloaded; visually verify each touched section with a headless-browser screenshot (expand all sections first; some headings need text locators, not h3).

## Specificity trap: .subsection-text
Report sections wrap content in `.subsection-text`, whose `.subsection-text p, .subsection-text li` font-size rule (0-1-1) silently beats single-class primitives (0-1-0) on `<p>` elements — the rule parses fine and font-family may still show, so it looks like a partial CSS failure. Fix by adding `.subsection-text p.<class>` variants to the primitive selector, never `!important`. Also: verify custom tokens exist before using (`var(--sb-paper)` was referenced before being defined; undefined vars fail silently to transparent).

## Content-only pipeline (insight report)
- The shareable insight report is no longer AI-written HTML: the model returns validated JSON content only; `server/insightReportTemplate.ts` owns 100% of the design and escapes everything.
- **Why:** full-HTML generation was slow (2-3 min), design drifted run to run, and truncation could save broken HTML.
- **How to apply:** restyle by editing the template, never the prompt; content length caps in the template's LIMITS must keep worst-case content on one 1056px page — verify with `node scripts/test_report_template_fit.mjs` after any template or LIMITS change.
