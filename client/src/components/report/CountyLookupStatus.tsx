import React from "react";
import type { CountyLookupState } from "@/lib/countyLookupState";

export function CountyLookupStatus({ state, onRetry }: {
  state: CountyLookupState;
  onRetry: () => void;
}) {
  return (
    <div className="kyp-tax-state" data-testid="county-lookup-status" role="status">
      <span>{state.detail}</span>
      {state.retry && (
        <>{" "}<button type="button" className="kyp-morelink no-print" onClick={onRetry} data-testid="button-retry-county-lookup">
          {state.retry === "pin" ? "Retry PIN lookup" : "Retry tax lookup"}
        </button></>
      )}
    </div>
  );
}