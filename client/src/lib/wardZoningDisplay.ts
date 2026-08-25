// Display helpers shared by the Ward & Alderperson and Zoning Details cards
// (RunDetail + AddressPreview). Formatting only — no data changes.

export interface ZoningInfoLike {
  residentialAllowed: boolean;
  commercialAllowed: boolean;
  industrialAllowed: boolean;
  allowedUses?: string[] | null;
  maxHeight?: string | null;
  parkingMin?: string | null;
}

/** "7" -> { n: "7", sub: "since 2019" }; non-numeric (e.g. "<1") -> generic sub */
export function yearsTile(yearsInOffice: string | number): { n: string; sub: string } {
  const raw = String(yearsInOffice).trim();
  const parsed = parseInt(raw.replace(/[^\d]/g, ""), 10);
  if (/^\d+$/.test(raw) && !isNaN(parsed) && parsed > 0) {
    return { n: raw, sub: `since ${new Date().getFullYear() - parsed}` };
  }
  return { n: raw, sub: "on City Council" };
}

/** "38 feet (3 stories)" -> { n: "38 ft", sub: "≈ 3 stories" }; fallback keeps raw text */
export function heightTile(maxHeight: string): { n: string; sub: string | null } {
  const m = String(maxHeight).match(/^\s*([\d.]+)\s*(?:feet|ft)\.?\s*(?:\((.*?)\))?/i);
  if (m) return { n: `${m[1]} ft`, sub: m[2] ? `≈ ${m[2]}` : null };
  return { n: String(maxHeight), sub: null };
}

/** "1 space / unit" -> { n: "1", sub: "space / unit" }; fallback keeps raw text */
export function parkingTile(parkingMin: string): { n: string; sub: string | null } {
  const m = String(parkingMin).match(/^\s*([\d.]+)\s+(.*)$/);
  if (m) return { n: m[1], sub: m[2] };
  return { n: String(parkingMin), sub: null };
}

/** Three "What This Zoning Means" bullets derived from the real allowed/not-allowed data. */
export function zoningMeaningBullets(z: ZoningInfoLike): { bold: string; text: string }[] {
  const usesText = (z.allowedUses || []).join(" ").toLowerCase();
  const bullets: { bold: string; text: string }[] = [];

  if (z.commercialAllowed) {
    bullets.push({
      bold: "Retail, office & mixed-use are by right.",
      text: "A shopping center, retail store, or offices can be built outright — no special approval needed.",
    });
  } else if (z.residentialAllowed) {
    bullets.push({
      bold: "Housing is by right.",
      text: "Homes that meet this district's standards can be built outright — no special approval needed.",
    });
  } else {
    bullets.push({
      bold: "The listed uses are by right.",
      text: "Projects matching the allowed uses can be built outright — no special approval needed.",
    });
  }

  if (z.commercialAllowed && z.residentialAllowed && usesText.includes("above")) {
    bullets.push({
      bold: "Residential is allowed, but not at street level.",
      text: "Apartments are permitted above the ground floor; the ground floor stays commercial to keep the street active.",
    });
  } else if (z.residentialAllowed && !z.commercialAllowed) {
    bullets.push({
      bold: "Commercial isn't allowed here.",
      text: "Shops or offices would need a rezoning approved by City Council.",
    });
  } else if (z.commercialAllowed && !z.residentialAllowed) {
    bullets.push({
      bold: "Residential isn't allowed here.",
      text: "Housing would require a zoning change approved by City Council.",
    });
  } else if (z.commercialAllowed && z.residentialAllowed) {
    bullets.push({
      bold: "Residential and commercial can mix.",
      text: "Both are permitted in this district by right.",
    });
  } else {
    bullets.push({
      bold: "Residential isn't allowed here.",
      text: "Housing would require a zoning change approved by City Council.",
    });
  }

  bullets.push({
    bold: "Confirm it fits your plan.",
    text: "Check the Project Use and Development Potential sections to confirm this zoning is compatible with what you want to build.",
  });

  return bullets;
}
