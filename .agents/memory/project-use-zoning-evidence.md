---
name: Project-use zoning evidence
description: Guardrails for labeling allowed project uses and Planned Development zoning.
---

Do not label a project use “allowed by right” from its category alone. Only an explicit district-specific permission result supports that claim. For Planned Development (PD) districts, do not treat a generic `special_use` result as a ZBA path; the adopted PD ordinance controls what is allowed.

**Why:** The project-use list available to the report omits permission details, and the generic compatibility matrix uses `special_use` as a conservative placeholder for PD codes rather than reading the parcel's ordinance. Presenting those values as verified advice would mislead users.

**How to apply:** When adding use chips or expanding zoning verdicts, trace the exact district and permission source. For PD parcels without ordinance-level evidence, show an explicit unknown state rather than a by-right or Special Use claim.