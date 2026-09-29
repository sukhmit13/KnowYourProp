/** Neighborhood articles and podcasts shown in the report. Property-address
 * coverage has its own, longer window and is intentionally unchanged. */
export const NEIGHBORHOOD_NEWS_DAYS = 365;

export function hasCurrentNeighborhoodWindow(record: { window_days?: number } | null | undefined): boolean {
  return record?.window_days === NEIGHBORHOOD_NEWS_DAYS;
}