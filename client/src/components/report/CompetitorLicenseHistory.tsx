import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CompetitorHistoryInput, CompetitorHistoryResult } from "../../../../shared/competitorHistory";

const HISTORY_ENDPOINT = "/api/competitor-license-history";
const HISTORY_CAVEAT = "City license history can help identify an earlier operator, but it cannot prove an actual opening date or net capacity.";

export interface CompetitorLicenseHistoryDisplayProps {
  result?: CompetitorHistoryResult;
  failed?: boolean;
  loading?: boolean;
}

function safeSourceUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatLicenseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const month = new Date(`${value}-01T00:00:00Z`);
    if (!Number.isNaN(month.getTime())) return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", timeZone: "UTC" }).format(month);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

export function CompetitorLicenseHistoryDisplay({ result, failed = false, loading = false }: CompetitorLicenseHistoryDisplayProps) {
  if (loading) return <span className="kyp-license-history-loading" role="status">Checking City license history…</span>;
  if (failed || !result || result.classification === "unknown") {
    const sourceUrl = safeSourceUrl(result?.sourceUrl);
    return (
      <div className="kyp-license-history-unknown-wrap">
        {result?.firstLicenseDate && <span className="kyp-license-history-date">Earliest license: {formatLicenseDate(result.firstLicenseDate)}</span>}
        <span className="kyp-license-history-unknown" title={result?.detail || HISTORY_CAVEAT}>
          History unavailable or insufficient evidence
          {sourceUrl && <> · <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>}
        </span>
        {result?.detail && <span className="kyp-license-history-detail">{result.detail}</span>}
        <span className="kyp-license-history-caveat">{HISTORY_CAVEAT}</span>
      </div>
    );
  }

  const sourceUrl = safeSourceUrl(result.sourceUrl);
  const date = formatLicenseDate(result.firstLicenseDate);
  return (
    <div className={`kyp-license-history ${result.classification}`} aria-label="Competitor license history">
      <div className="kyp-license-history-top">
        <span className="kyp-license-history-tag">
          {result.classification === "additional" ? "Additional location" : "Replacement"}
        </span>
        {result.classification === "additional" && <span className="kyp-license-history-qualification">Within available City license history</span>}
        {date && <span className="kyp-license-history-date">Earliest license: {date}</span>}
      </div>
      {result.classification === "replacement" && result.previousBusinesses.length > 0 && (
        <div className="kyp-license-history-previous">Prior operator{result.previousBusinesses.length > 1 ? "s" : ""}: {result.previousBusinesses.join(", ")}</div>
      )}
      <div className="kyp-license-history-detail">
        <span title={result.detail}>{result.detail || HISTORY_CAVEAT}</span>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open City license-history source">Source</a>}
      </div>
      <div className="kyp-license-history-caveat">{HISTORY_CAVEAT}</div>
    </div>
  );
}

export interface CompetitorLicenseHistoryProps extends CompetitorHistoryInput {}

function CompetitorLicenseHistoryQuery({ input }: { input: CompetitorHistoryInput }) {
  const query = useQuery<CompetitorHistoryResult>({
    queryKey: ["competitor-license-history", input.name, input.address, input.projectUse, input.licenseNumber ?? ""],
    staleTime: (query) => query.state.data?.classification === "unknown" ? 60000 : 1000 * 60 * 60 * 6,
    retry: 1,
    queryFn: async () => {
      const token = localStorage.getItem("kyp_auth_token");
      const response = await fetch(HISTORY_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("License history request failed");
      const result = await response.json();
      if (!["additional", "replacement", "unknown"].includes(result?.classification)
        || !Array.isArray(result.previousBusinesses) || typeof result.detail !== "string") {
        throw new Error("Invalid license history response");
      }
      return result as CompetitorHistoryResult;
    },
  });

  return (
    <CompetitorLicenseHistoryDisplay
      result={query.data}
      failed={query.isError}
      loading={query.isPending || query.isFetching}
    />
  );
}

export default function CompetitorLicenseHistory(props: CompetitorLicenseHistoryProps) {
  const [visible, setVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={elementRef} className="kyp-license-history-wrap">
      {visible
        ? <CompetitorLicenseHistoryQuery input={{
            name: props.name,
            address: props.address,
            projectUse: props.projectUse,
            ...(props.licenseNumber ? { licenseNumber: props.licenseNumber } : {}),
          }} />
        : <CompetitorLicenseHistoryDisplay loading />}
    </div>
  );
}
