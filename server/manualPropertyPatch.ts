import { z } from "zod";
import type { ManualPropertyData } from "./storage";

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

const measurement = (positive: boolean, integer: boolean) => z.preprocess(
  value => typeof value === "string" ? (value.trim() === "" ? null : Number(value)) : value,
  (integer ? z.number().int() : z.number())
    .finite()
    .min(positive ? Number.MIN_VALUE : 0)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
);

export const manualPropertyPatchSchema = z.object({
  manualBuildingSqFt: measurement(true, true),
  manualLandSqFt: measurement(false, true),
  manualStories: measurement(true, false),
  askingPrice: measurement(false, true),
  sourceListingUrl: z.preprocess(blankToNull, z.string().url().refine(
    value => /^https?:\/\//i.test(value),
    "Listing URLs must use http or https",
  ).nullable().optional()),
}).refine(patch => Object.values(patch).some(value => value !== undefined), {
  message: "Provide at least one property field to update",
});

// PATCH semantics: an omitted field is unchanged; explicit null clears it.
// In particular, saving capacity measurements must not clear listing metadata.
export function manualPropertyColumns(data: Partial<ManualPropertyData>) {
  return {
    ...(data.manualBuildingSqFt !== undefined ? { manualBuildingSqFt: data.manualBuildingSqFt } : {}),
    ...(data.manualLandSqFt !== undefined ? { manualLandSqFt: data.manualLandSqFt } : {}),
    ...(data.manualStories !== undefined ? { manualStories: data.manualStories == null ? null : String(data.manualStories) } : {}),
    ...(data.sourceListingUrl !== undefined ? { sourceListingUrl: data.sourceListingUrl } : {}),
    ...(data.askingPrice !== undefined ? { askingPrice: data.askingPrice } : {}),
  };
}