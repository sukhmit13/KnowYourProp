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

**Mock HTML beats thumbnail dimensions:** attached small PNG previews may be scaled-down images of much wider HTML mocks; never infer live CSS pixel sizes from the thumbnail. **Why:** copying thumbnail-scale typography made a report section unreadably tiny despite resembling the preview at first glance. **How to apply:** compare the mock's original HTML/CSS dimensions and inspect a representative rendered layout at desktop and mobile widths before claiming parity.

**Expanded-section alignment:** Safety & Crime is the user's reference for the content inset and outer spacing of every expanded report section. **Why:** per-section padding overrides made otherwise matching sections visibly start farther left in the published report. **How to apply:** keep the accordion's outer gutter shared; don't add section-specific accordion-body padding or a second inset to its first content wrapper. Compare computed first-content positions across sections at desktop and mobile widths.

**Train-line badge lettering:** Use white lettering for every colored CTA and Metra route identifier, including light yellow, gold, and pastel lines; a subtle dark shadow can aid legibility. **Why:** mixed dark/white lettering within the same route-badge pattern looks inconsistent to the user. **How to apply:** preserve actual route colors while keeping the foreground consistent across lists, station details, and ridership summaries; don't apply this rule to chart strokes or plain route names.

**Orange summary tiles:** Use Syracuse's dark-orange variant for tiles with white numbers and small white labels, rather than the brighter standard orange. **Why:** the standard Syracuse orange offers only about 3:1 contrast with white, insufficient for small tile labels; the dark-orange variant reaches about 4.5:1 and keeps all summary-tile text consistent. **How to apply:** check computed foreground and background on any new orange stat tile, including its caption, instead of assuming inherited white text survives a variant override.

## Specificity trap: .subsection-text
Report sections wrap content in `.subsection-text`, whose `.subsection-text p, .subsection-text li` font-size rule (0-1-1) silently beats single-class primitives (0-1-0) on `<p>` elements — the rule parses fine and font-family may still show, so it looks like a partial CSS failure. Fix by adding `.subsection-text p.<class>` variants to the primitive selector, never `!important`. Also: verify custom tokens exist before using (`var(--sb-paper)` was referenced before being defined; undefined vars fail silently to transparent).

## Content-only pipeline (insight report)
- The shareable insight report is no longer AI-written HTML: the model returns validated JSON content only; `server/insightReportTemplate.ts` owns 100% of the design and escapes everything.
- **Why:** full-HTML generation was slow (2-3 min), design drifted run to run, and truncation could save broken HTML.
- **How to apply:** restyle by editing the template, never the prompt; content length caps in the template's LIMITS must keep worst-case content on one 1056px page — verify with `node scripts/test_report_template_fit.mjs` after any template or LIMITS change.

## Browser fixtures using live Vite modules
Use the served app HTML as a fixture's shell, retain its React Refresh bootstrap, and match the transformed dependency imports rather than copying source-level imports.

**Why:** bare intercepted HTML fails before rendering live components when the React Refresh preamble is absent. Raw Vite-prebundled CommonJS modules can expose only a default export even when the source uses named imports.

**How to apply:** when testing a report fragment outside the authenticated page, preserve the generated shell, dependency interop, and required app providers before diagnosing product failures.

## Source attribution in supplied mocks
Match a mock's visual treatment, but keep source labels consistent with the actual data provider and response metadata.

**Why:** a supplied worship-list mock attributed records to OpenStreetMap while the existing endpoint used Google Places. Copying the footer literally would create a false attribution despite leaving the data untouched.

**How to apply:** verify the current provider before replacing source text. Honor provided source metadata and otherwise name the known provider; do not change queries or datasets merely to match a mock's label.
