---
name: Mortgage market view context
description: Why the closed-loan view retains an application-based denial-reasons chart
---

The originated-loan view deliberately retains one application-level denial-reasons chart alongside originated property values. Its scope and year follow the shared control, but its denominator is applications, not originated loans.

**Why:** the supplied mortgage-market target explicitly retains both bar blocks in the default closed-loan view. Originated records do not carry denial reasons, so using the originated breakdown silently removes that chart.

**How to apply:** use the selected scope/year's parent application breakdown for this context chart, keep its application denominator explicit, and never describe it as reasons for denying originated loans.