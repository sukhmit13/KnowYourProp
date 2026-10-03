---
name: Report section hierarchy
description: Visual hierarchy rules for the property report's top-level rows and nested subsections.
---

Each top-level accordion row should have one visible row header, not an additional collapsible title repeating its name. Its numbered subsections should be visible directly beneath that row rather than individually collapsed. Nested subsection labels should follow the shared report subhead treatment with a full-width rule; avoid pairing a separate decorative icon and short solid divider with the standard subhead. Do not wrap an entire row's content in a second rounded, gray-bordered panel unless that panel represents a distinct piece of content.

Body wrappers beneath a standard numbered subsection heading should not add another top divider or stack their own top margin/padding onto the heading's existing spacing.

**Why:** Duplicate headers, mixed short rules, and an extra outer frame made recently added education and culture rows look structurally different from the surrounding report. Borrower charts also showed a redundant gray divider and oversized gap from a legacy body wrapper.
**How to apply:** When promoting older panels into report rows or adding new sections, keep the accordion as the only section-level toggle and use the standard subsection pattern for content below it. Local controls such as year/scope selectors and "show 10 more" lists may remain interactive. Preserve intentional borders on individual data cards and controls.

All report subsection content should align flush with its heading, like the original Nearby Gas Station · Google Maps subsection, rather than use the EV-registration/EV-charging body inset.

**Why:** The user reversed the indentation direction and clarified: “I only want to just fix the indent and make it flush for every subsection.”
**How to apply:** Do not add an extra subsection-level horizontal inset. Preserve padding inside individual cards and controls, and check all content states when applying the flush layout.

Expanded subsections should primarily present records and measurements, not repeat an interpretation or tell users to perform obvious actions. The one-sentence takeaway belongs in the accordion header; deeper insights belong in the separately generated report. Keep factual scope, missing-evidence qualifiers, and cross-PIN loan/collateral context when they prevent misleading interpretations.

**Why:** repeated gray instructions next to visible tax bills and released lien records cluttered the report and implied an unresolved state the evidence did not establish.
**How to apply:** before removing explanatory copy, distinguish redundant advice from material source limitations, and preserve document/status facts without inferring release or payoff from a title alone.

Supporting commentary and geographic context notes should use the same light-gray footer treatment as other report sections, alongside source information, rather than separate green-shaded callouts between charts.

**Why:** The user wants these details at the bottom without giving them the visual prominence of primary findings.
**How to apply:** Preserve meaningful comparison windows, geographic scope, and evidence caveats, but use the shared source-note typography and spacing without a colored background or decorative icon. For Nearby Development & Construction, the user subsequently distinguished measured permit trends and named community-area comparisons from commentary: those belong beside the other measurements, not buried in the footer. Keep facts about the number beside it and explanations of how it was obtained once at the end.

Every report row needs a summary badge even when the section has no findings, has not been checked, is unavailable, or is not applicable. A data/applicability guard should not remove the entire row header.

**Why:** The user explicitly wants complete header summaries regardless of whether information was retrieved or the section applies. During badge-coverage changes, they want existing nonempty wording and colors preserved rather than silently rewritten.
**How to apply:** Fill blank summaries with scoped facts or honest state labels; never infer zero from missing data. Keep applicability guards around body content, and keep a hidden/dimmed row's badge visible.

Missing companion-parcel records should not hide a supported subject-parcel summary. Show the available measurement with its parcel scope rather than implying that the user must enter missing inputs.

**Why:** The user approved retaining the known subject-lot FAR ceiling when companion data was unavailable; a blanket “Inputs needed” badge contradicted the visible calculation.
**How to apply:** Distinguish subject-only findings from complete combined-area findings. Missing data for an additional parcel is a scope limitation, not absence of evidence for the subject.