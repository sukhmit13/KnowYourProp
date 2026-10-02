import React from "react";

interface ChildcareData {
  status: string;
  statusLabel: string;
  zipCode?: string;
  childrenUnder5: number;
  licensedSlots: number;
  childrenPerSlot: number | null;
  centerSlots: number;
  familyHomeSlots: number;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

// Single computed classification drives BOTH the status badge and the active
// track segment — they can never disagree.
// Ratio = children under 5 per licensed slot, so lower = better.
type DcCategory = 'desert' | 'underserved' | 'adequate' | 'plentiful';

function classify(cps: number): DcCategory {
  if (cps > 3.0) return 'desert';
  if (cps >= 1.5) return 'underserved';
  if (cps >= 1.0) return 'adequate';
  return 'plentiful';
}

const CATEGORY_META: Record<DcCategory, { label: string; badge: 'good' | 'caution' | 'bad' }> = {
  desert: { label: 'Childcare desert', badge: 'bad' },
  underserved: { label: 'Underserved', badge: 'caution' },
  adequate: { label: 'Adequate', badge: 'good' },
  plentiful: { label: 'Plentiful', badge: 'good' },
};

const TRACK: Array<{ key: DcCategory; label: string; range: string }> = [
  { key: 'desert', label: 'Childcare desert', range: '>3.0' },
  { key: 'underserved', label: 'Underserved', range: '1.5–3.0' },
  { key: 'adequate', label: 'Adequate', range: '1.0–1.5' },
  { key: 'plentiful', label: 'Plentiful', range: '<1.0' },
];

export function ChildcareDemandMeter({
  data,
  locationLabel,
  supplyRank,
  showInterpretation = true,
}: {
  data: ChildcareData;
  locationLabel?: string;
  supplyRank?: string;
  showInterpretation?: boolean;
}) {
  const cps = data.childrenPerSlot;
  // Server contract (server/childcare.ts):
  //  - cps is a finite number (incl. 0 when no children but slots exist) → classify by ratio
  //  - cps === null with status 'desert' → children exist but ZERO licensed slots (worst case)
  //  - cps === null with status 'unknown' → genuinely no data
  const noSlotsDesert = cps == null && data.status === 'desert';
  const category: DcCategory | null =
    cps != null ? classify(cps) : noSlotsDesert ? 'desert' : null;
  const meta = category ? CATEGORY_META[category] : null;

  // Slot gap to reach the adequate threshold (1.5 children per slot)
  const targetSlots = Math.ceil(data.childrenUnder5 / 1.5);
  const gap = Math.max(0, targetSlots - data.licensedSlots);
  const ratioTone = !showInterpretation
    ? 'slate'
    : category === 'desert'
    ? 'red'
    : category === 'underserved'
      ? 'orange'
      : category
        ? 'grn'
        : 'ind';
  const ratioLabel = cps == null
    ? noSlotsDesert ? 'No licensed slots' : 'Ratio unavailable'
    : `${cps.toFixed(1)}`;

  return (
    <div data-testid="childcare-demand-meter">
      <div className="kyp-blocks hero">
        <div className={`kyp-block ${ratioTone}`}>
          <div className="bv">{ratioLabel}</div>
          <div className="bl">Children per licensed slot</div>
          {showInterpretation && meta && <div className="bd">{meta.label}</div>}
        </div>
        <div className="kyp-block slate">
          <div className="bv">{data.licensedSlots.toLocaleString()}</div>
          <div className="bl">Licensed slots</div>
          <div className="bd">{data.centerSlots.toLocaleString()} center · {data.familyHomeSlots.toLocaleString()} family-home</div>
        </div>
        <div className="kyp-block slate">
          <div className="bv">{data.childrenUnder5.toLocaleString()}</div>
          <div className="bl">Children under 5</div>
          {locationLabel && <div className="bd">{locationLabel}</div>}
          {supplyRank && <div className="chip rank">{supplyRank}</div>}
        </div>
      </div>

      {showInterpretation && (
        <>
          <div className="kyp-bands b4">
            {TRACK.map(seg => (
              <div key={seg.key} className={`kyp-band ${seg.key === "desert" ? "no" : seg.key === "underserved" ? "watch" : "ok"}${category === seg.key ? " on" : ""}`}>
                <div className="bar" />
                <div className="bl">{seg.label}</div>
                <div className="br">{seg.range}</div>
              </div>
            ))}
          </div>

          <div className="kyp-bandfoot">
            {gap > 0
              ? <>Slot gap to the 1.5-children-per-slot threshold: <b>{gap.toLocaleString()} additional licensed slots</b> (target {targetSlots.toLocaleString()}).</>
              : <>1.5-children-per-slot threshold met: {data.licensedSlots.toLocaleString()} licensed slots (target {targetSlots.toLocaleString()}).</>}
          </div>
        </>
      )}
      <div className="kyp-src">
        Area: {locationLabel || "unavailable"}.
        {showInterpretation && <> The four band thresholds are the published childcare-access thresholds.</>}
        {showInterpretation && noSlotsDesert && <> Children are counted but licensed slots are zero; the area is classified as a desert without assigning a zero ratio.</>}
        {showInterpretation && supplyRank && <> Rank compares the children-under-5 counts in the selected geography's childcare-access snapshot, not the separate enhanced demographic extract.</>}
        {" "}Sources: {data.sources.childrenSource} {data.sources.childrenYear} · {data.sources.childcareSource} {data.sources.childcareYear}.
      </div>
    </div>
  );
}
