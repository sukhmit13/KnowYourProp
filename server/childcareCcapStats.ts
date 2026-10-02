export function childcareCitywideCcapStats(data: readonly Record<string, unknown>[]) {
  const complete = data.length > 0 && data.every(area =>
    typeof area.ccap_children_total === "number" && Number.isFinite(area.ccap_children_total) && area.ccap_children_total >= 0 &&
    typeof area.total_capacity === "number" && Number.isFinite(area.total_capacity) && area.total_capacity >= 0,
  );
  if (!complete) return {
    citywide_ccap_children: null,
    citywide_capacity: null,
    citywide_pct_ccap: null,
  };
  const children = data.reduce((sum, area) => sum + (area.ccap_children_total as number), 0);
  const capacity = data.reduce((sum, area) => sum + (area.total_capacity as number), 0);
  return {
    citywide_ccap_children: children,
    citywide_capacity: capacity,
    citywide_pct_ccap: capacity > 0 ? Math.round(children / capacity * 100) : null,
  };
}