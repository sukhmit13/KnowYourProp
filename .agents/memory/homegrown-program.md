---
name: HomeGrown Purchase Assistance Program
description: Chicago DOH down payment/closing cost grant — implementation notes for when user is ready to add it
---

# HomeGrown Purchase Assistance Program

**Source**: chicago.gov/homegrown  
**Launched**: June 8, 2026  
**Admin**: DOH + two CDFIs (NLS, TRP Lending)  
**Funding**: $21M from Mayor Johnson's Housing & Economic Development Bond (~300–400 buyers)

## Program Mechanics

- **Direct grant** (not a loan) for down payment + closing costs
- Two geographic zones determine the max grant amount:

| Zone | Definition | Max Grant | Income Limit |
|------|-----------|-----------|--------------|
| Zone B | FFIEC low-income tracts (70%+ families below 80% statewide MFI) | $50,000 | 150% AMI |
| Zone A | All other Chicago tracts | $70,000 | 120% AMI |

- Grant cannot exceed 25% of purchase price
- Buyer must contribute at least 1% from own funds

## Eligibility Gates (for automated check logic)

1. **Property type**: 1–2 unit only (SFH, condo, townhome, 2-flat). NOT eligible: 3–4 unit, ground-up new construction, City land-sale/redevelopment homes.
2. **Buyer**: Must NOT currently own a home. Must occupy as primary residence for 5 years.
3. **Mortgage**: Fixed-rate only (no ARM, interest-only, cash). DTI ≤ 38%. No co-signers.
4. **Education**: HUD-certified homebuyer ed (6–8 hrs in-person/live; self-paced online does NOT count).
5. **City compliance**: Scofflaw check (no unpaid city debts).

## Stacking Rules

- **CANNOT stack** with IHDA subsidy programs OR TaxSmart MCC (both bond-funded — HomeGrown is also bond-funded).
- **CAN stack** with Cook County assistance — up to ~$165K combined in some neighborhoods (e.g., Humboldt Park).
- CAN combine with other DPA programs as long as HomeGrown Recapture Agreement stays in second lien position.

## Zone Detection Implementation Plan

- **Zone B** = FFIEC geocoded low-income census tracts. Need Zone B tract list from FFIEC (https://ffiec.cfpb.gov/census/flat/2024/FFIEC_Census_Flat_2024.zip or similar). Field: `Low_Income_Area_Flag` or equivalent.
- **Zone A** = any Chicago tract NOT in Zone B (default for all Chicago tracts).
- Suggested `method`: `tract_lookup` with a `zone_b_tracts.json` file; result phrasing has two in-area variants: `inAreaZoneB` ($50K) and `inArea` ($70K).
- Property type check (1–2 units): can use `minUnits`/`maxUnits` gate already in config OR add a `maxUnits: 2` field.

## Administrators / Contacts

- **NLS (Neighborhood Lending Services)**: nhschicago.org/homegrown
- **TRP Lending LLC**: resurrectionproject.org/homegrown
- **DOH**: see official DOH contact page
- Homebuyers must pick ONE agency (cannot apply to both)

## Config Entry Sketch (for when ready)

```json
{
  "key": "homegrown",
  "name": "HomeGrown Purchase Assistance Program",
  "category": "Grant",
  "method": "tract_lookup",
  "implement": "now",
  "tractLookupFile": "homegrown_zone_b_tracts.json",
  "automatic": true,
  "priority": "HIGH",
  "maxUnits": 2,
  "resultPhrasing": {
    "inAreaHighNeed": "This property is in a HomeGrown Zone B tract — eligible for up to $50,000 in grant funds for down payment and closing costs (max 25% of purchase price). Income limit: 150% AMI. Administered by NLS (nhschicago.org/homegrown) or TRP Lending (resurrectionproject.org/homegrown). Cannot be combined with TaxSmart MCC.",
    "inArea": "This property is in a HomeGrown Zone A area — eligible for up to $70,000 in grant funds for down payment and closing costs (max 25% of purchase price). Income limit: 120% AMI. Administered by NLS (nhschicago.org/homegrown) or TRP Lending (resurrectionproject.org/homegrown). Cannot be combined with TaxSmart MCC.",
    "notInArea": "This property does not appear to be in a designated HomeGrown zone. HomeGrown grants are available throughout Chicago — confirm at chicago.gov/homegrown.",
    "manual": "Census tract unavailable — check zone eligibility at chicago.gov/homegrown using the Zone Lookup Tool."
  }
}
```

Note: Zone A = all Chicago tracts, Zone B = low-income FFIEC tracts. So `targeted_geoids` = all Chicago tracts (or could flip logic), `high_need_geoids` = Zone B tracts. The existing `inAreaHighNeed` / `inArea` distinction in the tract_lookup handler maps perfectly onto Zone B / Zone A.

## Data Needed Before Implementation

1. **Zone B census tract list** — from FFIEC Census flat file (2024). Filter for Illinois (state FIPS 17), Cook County (county FIPS 031), where `MSA_MD_Low_Inc_Flag = 1` or equivalent FFIEC low-income area designation.
2. Alternatively, City may publish a Zone B tract list directly at chicago.gov/homegrown — check that page when ready.
