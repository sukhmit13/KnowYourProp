---
name: Valuation NOI model
description: Transparent NOI build-up in the valuation calculator — one model, tier/mode rules, dual DSCR conventions.
---

# Valuation model rules

Every deal has two income halves. Property taxes and building insurance belong only in the property half. Combined business + real-estate operating expenses exclude occupancy, property taxes, and building insurance. Business-only Simple expenses include leased occupancy; Detailed separates that cost. Debt service is subtracted once, after NOI. Space occupied by the business produces no property rent; leased-space income covers only space leased to others.

**Why:** The user's valuation specifications require an auditable model without charging occupancy or property costs twice. The complete rebuild explicitly permits editable planning defaults of 75% for business-only leases and 60% for business + real estate, distinguished from verified operator costs.

**How to apply:** Preserve one resolved NOI, including negative values, across statements, metrics, saved reports, and exports. Rental detail tiers and daycare detail tiers are views of identical arithmetic. SBA Simple versus Detailed selects different explicitly entered income models; seller add-backs are claims, not verified earnings. A business-inclusive yield is not a comparable real-estate cap rate.

Property taxes always come from the Cook County record, never a listing's tax figure. Existing property composition controls applicable income streams; zoning permissions do not establish existing residential or commercial space.

**Why:** The user stated these as standing evidence rules; a seller's current bill and allowable zoning do not establish buyer expenses or existing income.

**How to apply:** Keep edited assumptions distinct from records. Housing-rent estimates must not become warehouse or other wholly commercial rent. Economic DSCR and the eligible residential rent/PITIA loan convention must share the same expense inputs, but remain explicitly different ratios.

Unknown inputs must stay unknown, not become assumed zero expenses, zero purchase prices, or underwriting results.

**Why:** Empty business expense fields can otherwise produce apparently positive income and misleading coverage classifications.

**How to apply:** An explicit zero is a valid assumption; an empty required field is not. Consumers of incomplete calculator snapshots may retain raw inputs but must not treat numerical outputs as evidence. Classify calculated coverage against reference thresholds without predicting financing approval.

Presentation rebuilds must preserve the existing calculation formulas and numerical daycare scenarios by key; reference HTML supplies layout, not numerical inputs.

**Why:** The user explicitly required “No arithmetic changes” in the complete rebuild, while requesting new labels and density-grouped presentation order.

**How to apply:** Capture numerical baselines before changing presentation. Simple percentage and Detailed dollar views must resolve to the same NOI for equivalent expenses. Treat the supplied BizBuySell SDE figures as neutral reference context, not underwriting targets or verified property costs.

Manual income drafts survive automation refreshes and source switching. Building-area changes take effect in both sections only after saving the existing shared property override.

**Why:** The user required that typed values never be silently discarded or overwritten, and specified “on save, not per keystroke” for shared area updates.

**How to apply:** Keep derived estimates visible beside manual income, distinguish empty overrides from explicit zero, and use one persisted building-area owner with shared validation.
