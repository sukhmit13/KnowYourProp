import React, { useEffect, useState, type ReactNode } from "react";
import CompetitorLicenseHistory from "@/components/report/CompetitorLicenseHistory";

const NEARBY_ACRONYMS = new Set("USA US UK LLC LLP LP INC LTD CO CORP BP EV DC AC HVAC BBQ".split(" "));
const STATE_ABBREVIATIONS = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

function titleCaseNearbyText(value: string, isAddress = false): string {
  const titled = value.toLocaleLowerCase("en-US").replace(
    /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
    (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase("en-US"),
  );
  return titled.replace(/[\p{L}\p{N}]+/gu, word => {
    const upper = word.toLocaleUpperCase("en-US");
    return NEARBY_ACRONYMS.has(upper) || (isAddress && STATE_ABBREVIATIONS.has(upper)) ? upper : word;
  });
}

export interface ProjectUseBusinessRowProps {
  name: string;
  address: string;
  distance: number | null;
  url?: string | null;
  meta?: ReactNode[];
  testId?: string;
  showDistance?: boolean;
  projectUse?: string;
  licenseNumber?: string;
}

function mapsSearchUrl(name: string, address: string): string {
  const query = encodeURIComponent(`${name}, ${address}, Chicago, IL`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function googleMapsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "maps.google.com" ||
      (parsed.hostname === "www.google.com" && /^\/maps(?:\/|$)/.test(parsed.pathname))) return url;
  } catch {
    // A source without a usable Google listing still gets a Maps search.
  }
  return null;
}

export function ProjectUseBusinessRow({
  name,
  address,
  distance,
  url,
  meta,
  testId,
  showDistance = true,
  projectUse,
  licenseNumber,
}: ProjectUseBusinessRowProps) {
  const mapsUrl = googleMapsUrl(url) ?? mapsSearchUrl(name, address);
  return (
    <div className="kyp-project-use-nearby-row" data-testid={testId}>
      <div className="kyp-project-use-nearby-content">
        <div className="kyp-project-use-nearby-details">
          <a className="kyp-project-use-nearby-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <b className="kyp-project-use-nearby-name">{titleCaseNearbyText(name)}</b><span className="kyp-project-use-nearby-ext" aria-hidden="true">↗</span>
          </a>
          <span className="kyp-project-use-nearby-address">{titleCaseNearbyText(address, true)}</span>
          {projectUse && <CompetitorLicenseHistory name={name} address={address} projectUse={projectUse} licenseNumber={licenseNumber} />}
          {!!meta?.length && (
            <div className="kyp-project-use-nearby-meta">
              {meta.map((item, index) => <span key={index}>{item}</span>)}
            </div>
          )}
        </div>
      </div>
      {showDistance && <span className="kyp-project-use-nearby-distance">
        {distance != null && Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : "distance unknown"}
      </span>}
    </div>
  );
}

export interface ProjectUseBusinessListRow {
  name: string;
  address: string;
  distance: number | null;
  url?: string | null;
  meta?: ReactNode[];
  testId?: string;
  showDistance?: boolean;
  projectUse?: string;
  licenseNumber?: string;
}

export interface ProjectUseBusinessListProps {
  rows: ProjectUseBusinessListRow[];
  initialLimit?: number;
  listKey?: string;
  projectUse?: string;
}

export function ProjectUseBusinessList({
  rows,
  initialLimit = 10,
  listKey,
  projectUse,
}: ProjectUseBusinessListProps) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [listKey]);

  const limit = Math.max(0, initialLimit);
  const isSliced = !expanded && rows.length > limit;
  const visibleRows = isSliced ? rows.slice(0, limit) : rows;

  return (
    <div className="kyp-project-use-nearby-list">
      {visibleRows.map((row, index) => (
        <ProjectUseBusinessRow key={`${row.testId ?? row.name}-${index}`} {...row} projectUse={row.projectUse ?? projectUse} />
      ))}
      {isSliced && (
        <>
          <div className="kyp-biz-overflow" aria-live="polite">
            Showing {visibleRows.length} of {rows.length}
          </div>
          <button className="kyp-morelink" type="button" onClick={() => setExpanded(true)}>
            + Show all {rows.length} →
          </button>
        </>
      )}
      {expanded && rows.length > limit && (
        <button className="kyp-morelink" type="button" onClick={() => setExpanded(false)}>
          Show less ↑
        </button>
      )}
    </div>
  );
}

export interface ProjectUseCountBlock {
  value: number | string | null;
  label: string;
  text?: boolean;
  meta?: ReactNode;
}

export function ProjectUseCountBlocks({ counts, className }: { counts: ProjectUseCountBlock[]; className?: string }) {
  return (
    <div className={["kyp-blocks", className].filter(Boolean).join(" ")}>
      {counts.map(({ value, label, text, meta }, index) => (
        <div className="kyp-block slate count" key={`${label}-${index}`}>
          <div>
            <div className={`bv${text ? " txt" : ""}`}>{value == null ? "—" : value}</div>
            <div className="bl">{label}</div>
            {meta && <div className="chip rank">{meta}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ProjectUseAreaControlProps {
  value: "zip" | "community";
  onChange: (value: "zip" | "community") => void;
  zipCode?: string | null;
  communityArea?: string | null;
  ward?: string | number | null;
}

export function ProjectUseAreaControl({
  value,
  onChange,
  zipCode,
  communityArea,
  ward,
}: ProjectUseAreaControlProps) {
  const zipLabel = zipCode || "ZIP unavailable";
  const communityLabel = communityArea || "Community area unavailable";
  return (
    <div className="kyp-segrow">
      <div className="kyp-seg">
        <button
          type="button"
          className={value === "zip" ? "on" : ""}
          aria-pressed={value === "zip"}
          onClick={() => onChange("zip")}
        >
          ZIP {zipCode || "—"}
        </button>
        <button
          type="button"
          className={value === "community" ? "on" : ""}
          aria-pressed={value === "community"}
          onClick={() => onChange("community")}
        >
          {communityArea || "Community area"}
        </button>
      </div>
      <div className="spacer" />
      <div className="kyp-scopenote">
        ZIP <b>{zipLabel}</b> · Neighborhood <b>{communityLabel}</b>
        {ward != null && ward !== "" ? <> · Ward <b>{ward}</b></> : null} — boundaries differ
      </div>
    </div>
  );
}

export interface ProjectUseGooglePlace {
  name?: string | null;
  address?: string | null;
  distanceMiles?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  url?: string | null;
  [key: string]: unknown;
}

export interface ProjectUseGoogleMapsData {
  status?: string;
  places?: ProjectUseGooglePlace[];
  count?: number;
  totalFound?: number;
  avgRating?: number | null;
  averageRating?: number | null;
  searchTerm?: string;
  fetchedAt?: string;
}

export interface ProjectUseGoogleMapsProps {
  data?: ProjectUseGoogleMapsData;
  isLoading?: boolean;
  isError?: boolean;
  confirmed?: boolean;
  searchTerm?: string;
  footer?: ReactNode;
  onRetry?: () => void;
  projectUse?: string;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function placeDistance(place: ProjectUseGooglePlace): number | null {
  const distance = finiteNumber(place.distanceMiles);
  return distance != null && distance >= 0 ? distance : null;
}

function placeMeta(place: ProjectUseGooglePlace): ReactNode[] {
  const meta: ReactNode[] = [];
  const rating = finiteNumber(place.rating);
  const reviews = finiteNumber(place.reviewsCount ?? place.user_ratings_total);
  if (rating != null && rating > 0 && rating <= 5) meta.push(`★ ${rating.toFixed(1)}`);
  if (reviews != null && reviews >= 0) meta.push(`${Math.trunc(reviews).toLocaleString()} reviews`);
  return meta;
}

function GoogleMapsSource({ footer, adjustedRating, unknownCount }: {
  footer?: ReactNode;
  adjustedRating: boolean;
  unknownCount: number;
}) {
  return (
    <div className="kyp-src">
      {footer ?? <>Describes Google Maps search results, not this address. Source: Google Maps Places. Ratings are Google user ratings, not a quality or licensing measure.</>}
      {" "}Business names use a supplied Google Maps place URL when available; otherwise they link to a Google Maps search for the name and address.
      {" "}Places with no distance on record are listed as unknown rather than dropped and are not included in the within-1-mile count.
      {unknownCount > 0 && <> {unknownCount.toLocaleString()} returned {unknownCount === 1 ? "place has" : "places have"} an unknown distance.</>}
      {adjustedRating && <> Adjusted average rating includes listed places with a known distance within 1 mile and a Google rating; farther and unknown-distance places are excluded.</>}
    </div>
  );
}

export function ProjectUseGoogleMaps({
  data,
  isLoading = false,
  isError = false,
  confirmed = false,
  searchTerm,
  footer,
  onRetry,
  projectUse,
}: ProjectUseGoogleMapsProps) {
  const status = data?.status?.toLowerCase();
  const places = Array.isArray(data?.places) ? data.places : null;
  const resultCount = data?.count ?? data?.totalFound;
  const withinOneMile = places?.filter((place) => {
    const distance = placeDistance(place);
    return distance == null || distance <= 1;
  }) ?? [];
  const resolvedSearchTerm = searchTerm ?? data?.searchTerm;
  const unknownCount = withinOneMile.filter(place => placeDistance(place) == null).length;
  const knownWithinOneMile = withinOneMile.filter(place => placeDistance(place) != null);
  const adjustedRating = (places?.length ?? 0) > knownWithinOneMile.length || unknownCount > 0;
  const averageRating = adjustedRating
    ? (() => {
      const ratings = knownWithinOneMile.map((place) => finiteNumber(place.rating)).filter((rating): rating is number => rating != null && rating > 0 && rating <= 5);
      return ratings.length
        ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1))
        : null;
    })()
    : data?.avgRating ?? data?.averageRating ?? null;

  let stateMessage: string | null = null;
  let stateRole: "status" | "alert" = "status";
  if (!confirmed) {
    stateMessage = "Confirm a project-use concept to fetch Google Maps results.";
  } else if (isError || status === "error" || status === "failed") {
    stateMessage = "Google Maps results could not be loaded.";
    stateRole = "alert";
  } else if (isLoading || status === "pending" || status === "loading") {
    stateMessage = "Google Maps results are loading.";
  } else if (!places) {
    stateMessage = resultCount != null
      ? resultCount > 0
        ? `Google Maps returned ${resultCount} results, but place rows are not available yet.`
        : "No Google Maps places were found in this search."
      : "Waiting for Google Maps Places results.";
  } else if (places.length === 0) {
    stateMessage = resultCount === 0
      ? "No Google Maps places were found in this search."
      : resultCount != null && resultCount > 0
        ? `Google Maps returned ${resultCount} results, but no place rows are available.`
        : "No Google Maps place rows were returned.";
  }

  const ready = confirmed && !stateMessage && places != null;
  const loading = confirmed && !isError && (isLoading || status === "pending" || status === "loading");

  return (
    <>
      {ready ? (
        <>
          <ProjectUseCountBlocks counts={[
            { value: knownWithinOneMile.length, label: "Within 1 mile" },
            {
              value: averageRating == null || !Number.isFinite(averageRating) || averageRating <= 0 || averageRating > 5 ? null : `★ ${averageRating.toFixed(1)}`,
              label: "Average rating",
            },
            { value: resolvedSearchTerm || null, label: "Searched for", text: true },
          ]} />
          <ProjectUseBusinessList
            listKey={`google-maps-${resolvedSearchTerm ?? ""}`}
            initialLimit={10}
            rows={withinOneMile.map((place, index) => ({
              name: place.name || "Name unavailable",
              address: place.address || "Address unavailable",
              distance: placeDistance(place),
              url: place.url,
              meta: placeMeta(place),
              testId: `google-place-${index}`,
              projectUse,
            }))}
          />
        </>
      ) : (
        loading ? (
          <div className="space-y-3" role="status" aria-label="Loading Google Maps results">
            <span>{stateMessage}</span>
            <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div aria-hidden="true" className="h-10 w-4/5 animate-pulse rounded-md bg-muted" />
          </div>
        ) : (
          <div className="kyp-status-empty" role={stateRole}>
            {stateMessage}
            {stateRole === "alert" && <div className="kyp-btnrow"><button type="button" className="kyp-btn ghost" disabled={!onRetry} onClick={onRetry}>Retry</button></div>}
          </div>
        )
      )}
      <GoogleMapsSource footer={footer} adjustedRating={adjustedRating} unknownCount={unknownCount} />
    </>
  );
}