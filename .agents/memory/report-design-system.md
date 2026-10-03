---
name: Report design system
description: Durable rules for report styling, evidence-scoped section names, and browser verification
---

# Report design system

## Neutral measurement comparisons

A measurement block takes a verdict color only when an outside authority has classified the value and established its polarity. If whether a change is good or bad depends on the reader's intended use, keep the block slate and do not add an arrow glyph.

**Why:** The user explained that nearby permit growth can mean momentum to a developer but competing supply to an owner; a positive percentage is not itself an authoritative favorable verdict.

**How to apply:** Distinguish a signed numerical change from a judgment. Preserve the actual value and named comparison set without inventing thresholds or favorable/unfavorable meanings.

## Controls versus headline statistics

Use compact segmented controls for Simple/Detailed switches, not filled headline-statistic cards.

**Why:** The user identified statistic cards used as view controls as the main visual mismatch in the valuation report.

**How to apply:** Keep control state and accessibility intact while reusing existing segmented-control styles. Reserve headline-statistic blocks for displayed metrics; choosing the right primitive should not require new CSS.

Restyles must reuse the shared primitives already in the global stylesheet (section headers, stat tiles, viz lists, directory fact tiles/rows, market tables/ladders) — grep the stylesheet before inventing new classes. Style via explicit classes on JSX; broad legacy-Tailwind descendant selectors or `!important` overrides get failed in review as scope leaks.

**Trend/delta colors are sign-based only:** green #2f7d3f positive, red #d13b26 negative — never amber/magnitude thresholds. Exclusion-type markers (e.g. "doesn't count toward FAR") are muted, not red. Labels/column headers use dark ink #565651 wt 600–700; faint #8b8a84 is reserved for source lines and secondary qualifiers.

**Charts/bars:** if a bar's position is computed from live data, its axis labels must be derived from the same scale — hard-coded axis labels alongside computed geometry is flagged as a misleading data-logic change.

**Why:** multiple architect reviews failed rounds on exactly these points (scope-leaking CSS, hardcoded axis vs computed bars, magnitude-colored badges, JSX string-transforms like title-casing being treated as logic changes — use CSS `text-transform` instead).

**How to apply (after any design-subagent pass):** subagents have repeatedly broken the build (mismatched JSX tags, lucide imports shadowing UI components, unimported icons). Always: run tsc and compare against the pre-existing error baseline (do not expect zero); check the workflow actually reloaded; visually verify each touched section with a headless-browser screenshot (expand all sections first; some headings need text locators, not h3).

**Mock HTML beats thumbnail dimensions:** attached small PNG previews may be scaled-down images of much wider HTML mocks; never infer live CSS pixel sizes from the thumbnail. **Why:** copying thumbnail-scale typography made a report section unreadably tiny despite resembling the preview at first glance. **How to apply:** compare the mock's original HTML/CSS dimensions and inspect a representative rendered layout at desktop and mobile widths before claiming parity.

**Expanded-section alignment:** Safety & Crime is the user's reference for the content inset and outer spacing of every expanded report section. **Why:** per-section padding overrides made otherwise matching sections visibly start farther left in the published report. **How to apply:** keep the accordion's outer gutter shared; don't add section-specific accordion-body padding or a second inset to its first content wrapper. Compare computed first-content positions across sections at desktop and mobile widths.

**Train-line badge lettering:** Use white lettering for every colored CTA and Metra route identifier, including light yellow, gold, and pastel lines; a subtle dark shadow can aid legibility. **Why:** mixed dark/white lettering within the same route-badge pattern looks inconsistent to the user. **How to apply:** preserve actual route colors while keeping the foreground consistent across lists, station details, and ridership summaries; don't apply this rule to chart strokes or plain route names.

**Orange summary tiles:** Use Syracuse's dark-orange variant for tiles with white numbers and small white labels, rather than the brighter standard orange. **Why:** the standard Syracuse orange offers only about 3:1 contrast with white, insufficient for small tile labels; the dark-orange variant reaches about 4.5:1 and keeps all summary-tile text consistent. **How to apply:** check computed foreground and background on any new orange stat tile, including its caption, instead of assuming inherited white text survives a variant override.

When the user supplies CSS to append verbatim, preserve it even if it explicitly uses bright orange and documents a contrast limitation. **Why:** silently darkening a supplied patch would contradict the user's exact-style requirement. **How to apply:** raise the small-white-text contrast issue separately rather than modifying the supplied patch.

## Specificity trap: .subsection-text
Report sections wrap content in `.subsection-text`, whose `.subsection-text p, .subsection-text li` font-size rule (0-1-1) silently beats single-class primitives (0-1-0) on `<p>` elements — the rule parses fine and font-family may still show, so it looks like a partial CSS failure. Fix by adding `.subsection-text p.<class>` variants to the primitive selector, never `!important`. Also: verify custom tokens exist before using (`var(--sb-paper)` was referenced before being defined; undefined vars fail silently to transparent).

## Content-only pipeline (insight report)
- The shareable insight report is no longer AI-written HTML: the model returns validated JSON content only; `server/insightReportTemplate.ts` owns 100% of the design and escapes everything.
- **Why:** full-HTML generation was slow (2-3 min), design drifted run to run, and truncation could save broken HTML.
- **How to apply:** restyle by editing the template, never the prompt; content length caps in the template's LIMITS must keep worst-case content on one 1056px page — verify with `node scripts/test_report_template_fit.mjs` after any template or LIMITS change.

## Browser fixtures using live Vite modules
Use the served app HTML as a fixture's shell, retain its React Refresh bootstrap, and match the transformed dependency imports rather than copying source-level imports.

**Why:** bare intercepted HTML fails before rendering live components when the React Refresh preamble is absent. Raw Vite-prebundled CommonJS modules can expose only a default export even when the source uses named imports.

**How to apply:** when testing a report fragment outside the authenticated page, preserve the generated shell, dependency interop, and required app providers before diagnosing product failures. Optimized dependency paths may include an absolute `/@fs/` prefix; use the transformed path verbatim. Explicitly load the shared stylesheet normally imported by the enclosing page.

## Verify that reused styles actually apply
Preserve the production ancestor/wrapper arrangement in browser fixtures, and check computed styles and rendered geometry—not just the presence of shared class names.

**Why:** Worship rows had the expected school-style classes, but the styles required a schools-only ancestor. Earlier row-count/class assertions passed while the live list remained unstyled.

**How to apply:** When reusing another section's visual primitives, verify weight, text sizes, spacing, dividers, and mobile wrapping without adding the donor section's wrapper to the fixture.

## Source attribution in supplied mocks
Match a mock's visual treatment, but keep source labels consistent with the actual data provider and response metadata.

**Why:** a supplied worship-list mock attributed records to OpenStreetMap while the existing endpoint used Google Places. Copying the footer literally would create a false attribution despite leaving the data untouched.

**How to apply:** verify the current provider before replacing source text. Honor provided source metadata and otherwise name the known provider; do not change queries or datasets merely to match a mock's label.

## Evidence-scoped section names
Distinguish subject-address license history from nearby new issuances, and current zoning/use rules from recorded zoning actions. Keep radius and time-window qualifiers in scope text rather than long titles.

**Why:** The user explicitly approved this distinction across the report, navigation, and print options. License records do not prove current operation, and available zoning filings do not establish a complete history or approval to build.

**How to apply:** Preserve those distinctions when revising labels, use the same canonical title on each surface, and leave official dataset/source names unchanged.

## Whole-section navigation and print targets
Section-level navigation and print selection must target the actual accordion row, including its header, and remain available through loading, error, empty, and populated states. Treat standalone context cards as separate targets.

**Why:** A matching zoning label concealed a target pointing to the district summary card rather than the full section; success-only nearby-license anchors also disappeared when no records were available.

**How to apply:** Check the actual target's DOM scope, verify include/exclude behavior for the whole row, and confirm unrelated context cards and sibling sections remain unaffected.

## Source-footer consistency
Keep the light-gray source citations and section-ending explanations at one consistent, readable size throughout the report.

**Why:** The user requested a size just above the smaller News example and below the oversized Professional Record example, applied to every section rather than tuned individually.

**How to apply:** Reuse the shared source-note treatment for new sections; check both direct text and nested paragraphs, including print, without shrinking ordinary body text.

## Qualification placement
The top of a report section should contain summary badges and data. Qualifications and clarifications belong at the bottom.

**Why:** The user explicitly rejected the Professional Record coverage notice above its summary badges.

**How to apply:** Keep retrieval limitations and refresh qualifications in the section's source footer rather than adding a notice above populated data.

## Nearby-place list standard
Use the compact entertainment/culture, murals, architectural-landmark and nearby-school row style for nearby places and competitors across selected project uses, including EV charging, licensed filling stations and childcare/daycare lists.

**Why:** The user approved this visual reference and explicitly limited this standardization to those lists; other list types will be reviewed independently.

**How to apply:** Keep names prominent, supporting information muted, and distance right-aligned, while retaining source-specific details. Do not extend this approval to professional, news, financial, transit or other record lists without a new request.

## Compact access schedules
Consolidate repeated daily opening hours into consecutive-day ranges rather than listing every day separately.

**Why:** The user identified the Whole Foods charging-station schedule as unnecessarily causing multiple lines and requested a concise day-range presentation.

**How to apply:** Combine only days with matching reported hours; retain different weekend hours, closed days and access qualifications. This is a presentation change, not permission to infer missing hours or omit source details.

## Nearby-list capitalization
Display nearby-list names and addresses in title case, but preserve recognized acronyms and abbreviations in uppercase.

**Why:** The user requested consistent title case, then clarified that USA represents an acronym and acronyms/abbreviations should stay capitalized.

**How to apply:** Apply this presentation rule to the accepted shared nearby lists. Recognize known acronyms rather than treating all source-uppercase words as acronyms. Preserve source strings for record matching and Maps searches; do not expand the rule to unrelated sections.
