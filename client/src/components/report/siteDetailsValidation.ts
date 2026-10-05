export interface SiteDetailsDraft {
  building: string;
  land: string;
  stories: string;
}

export interface ValidSiteDetails {
  manualBuildingSqFt: number;
  manualLandSqFt: number | null;
  manualStories: number | null;
}

export function validateSiteDetails(draft: SiteDetailsDraft): { value?: ValidSiteDetails; error?: string } {
  const building = Number(draft.building.replace(/,/g, ""));
  const land = draft.land === "" ? null : Number(draft.land.replace(/,/g, ""));
  const stories = draft.stories === "" ? null : Number(draft.stories.replace(/,/g, ""));
  if (!Number.isFinite(building) || building <= 0 ||
    (land != null && (!Number.isFinite(land) || land < 0)) ||
    (stories != null && (!Number.isInteger(stories) || stories <= 0))) {
    return { error: "Enter a positive building area, optional land area of zero or more, and a positive whole-number story count." };
  }
  return {
    value: {
      manualBuildingSqFt: Math.round(building),
      manualLandSqFt: land == null ? null : Math.round(land),
      manualStories: stories == null ? null : Math.round(stories),
    },
  };
}
