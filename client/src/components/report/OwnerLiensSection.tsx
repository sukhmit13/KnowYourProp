import React, { useState } from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { KypSubhead } from "@/components/report/AccordionSection";
import { useOwnerLienSearch } from "@/hooks/use-runs";

export function OwnerLiensSection({
  pin,
  city,
  lienData,
  subsection,
  DocRefComponent,
}: {
  pin?: string | null;
  city?: string | null;
  lienData?: any;
  subsection: number;
  DocRefComponent: ComponentType<any>;
}) {
  const [isEditingOwnerName, setIsEditingOwnerName] = useState(false);
  const [ownerNameInput, setOwnerNameInput] = useState("");
  const ownerLienSearch = useOwnerLienSearch();
  const recordedOwnerName = lienData?.ownerName || "";
  const ownerLiens = lienData?.ownerLiens || [];
  const ownerSearchComplete = !!lienData?.ownerLienScrapedAt && !lienData?.ownerLienIsStale;

  const submitOwnerSearch = () => {
    const ownerName = ownerNameInput.trim() || recordedOwnerName;
    if (!pin || ownerName.length < 2 || ownerLienSearch.isPending) return;
    ownerLienSearch.mutate({ pin, ownerName, city });
    setIsEditingOwnerName(false);
  };

  if (!lienData) return null;

  return (
    <div id="owner-liens" className="kyp-owner-liens" data-testid="owner-liens-card">
      <KypSubhead subsection={subsection}>
        <span className="lbl">Owner liens</span>
        <span className="ct">Owner-name records · follows the owner, not this parcel</span>
        <span className="rule" />
      </KypSubhead>

      <div className="kyp-owner-lien-tools">
        <div>
          <span className="tool-label">Name searched</span>
          <b>{recordedOwnerName || "Owner name unavailable"}</b>
        </div>
        <div className="kyp-owner-lien-actions no-print">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!pin || (!recordedOwnerName && !isEditingOwnerName) || ownerLienSearch.isPending}
            onClick={() => {
              if (isEditingOwnerName) {
                submitOwnerSearch();
              } else if (recordedOwnerName && pin) {
                ownerLienSearch.mutate({ pin, ownerName: recordedOwnerName, city });
              }
            }}
            data-testid="button-owner-lien-search"
          >
            {ownerLienSearch.isPending ? "Searching..." : ownerSearchComplete ? "Search again" : "Search owner liens"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOwnerNameInput(recordedOwnerName);
              setIsEditingOwnerName((current) => !current);
            }}
            data-testid="button-owner-name-edit"
          >
            {isEditingOwnerName ? "Cancel" : "Use another name"}
          </Button>
        </div>
      </div>

      {isEditingOwnerName && (
        <div className="kyp-owner-lien-editor no-print">
          <input
            value={ownerNameInput}
            onChange={(event) => setOwnerNameInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitOwnerSearch();
              if (event.key === "Escape") setIsEditingOwnerName(false);
            }}
            placeholder="LAST, FIRST or COMPANY NAME"
            aria-label="Owner name for lien search"
            data-testid="input-owner-name-override"
          />
          <Button type="button" size="sm" disabled={ownerNameInput.trim().length < 2 || ownerLienSearch.isPending} onClick={submitOwnerSearch}>
            Search
          </Button>
        </div>
      )}

      {ownerLiens.length > 0 ? (
        <>
          <p className="kyp-owner-lien-summary">
            <b>{ownerLiens.length} personal lien record{ownerLiens.length === 1 ? "" : "s"} found.</b> Confirm identity, payoff, and release before using these records in a closing decision.
          </p>
          {ownerLiens.slice(0, 10).map((doc: any, index: number) => (
            <div className="kyp-xact claim" key={doc.documentNumber || index} data-testid={`row-owner-lien-${index}`}>
              <div className="xtop"><span className="xttl">{doc.documentType || doc.category || "Personal lien record"}</span></div>
              <div className="xgrid">
                <div className="xf"><span className="k">Against</span><span className="v">{recordedOwnerName || ownerNameInput || "Name not recorded"}</span></div>
                <div className="xf"><span className="k">Status</span><span className="v">Confirm identity and release</span></div>
              </div>
              <DocRefComponent documentNumber={doc.documentNumber || doc.docNo} viewLink={doc.viewLink} recordedDate={doc.recordingDate || doc.recordedDate} />
            </div>
          ))}
        </>
      ) : ownerLienSearch.isPending ? (
        <div className="kyp-status-empty unknown">Searching owner-name records...</div>
      ) : ownerLienSearch.isError ? (
        <div className="kyp-status-empty unknown">
          Owner lien search failed: {ownerLienSearch.error instanceof Error ? ownerLienSearch.error.message : "Please try again."}
        </div>
      ) : ownerSearchComplete ? (
        <div className="kyp-status-empty clear">
          No personal lien record was found for <b>{recordedOwnerName || ownerNameInput}</b> in the last completed search.
        </div>
      ) : (
        <div className="kyp-status-empty">
          Owner-name liens are a separate search. Run it before closing if the recorded owner is known.
        </div>
      )}
    </div>
  );
}