interface ChildcareData {
  status: string;
  statusLabel: string;
  zipCode: string;
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
}: {
  data: ChildcareData;
  locationLabel?: string;
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
  const targetSlots = data.childrenUnder5 / 1.5;
  const gap = Math.round(targetSlots - data.licensedSlots);

  return (
    <div className="sch-dc" data-testid="childcare-demand-meter">
      <div className="sch-dchead">
        {meta && (
          <span className={`sch-badge ${meta.badge}`} data-testid="badge-childcare-status">
            <span className="bd"></span>{meta.label}
          </span>
        )}
        <span className="sch-dcnum">
          {cps != null ? (
            <><b>{cps.toFixed(1)}</b> children under 5 per licensed slot</>
          ) : noSlotsDesert ? (
            <><b>{data.childrenUnder5.toLocaleString()}</b> children under 5 — no licensed slots in this area</>
          ) : (
            'Children-per-slot data unavailable for this area.'
          )}
        </span>
      </div>

      <div className="sch-track">
        {TRACK.map(seg => (
          <div key={seg.key} className={`sch-seg ${seg.key}${category === seg.key ? ' on' : ''}`}>
            <div className="bar"></div>
            <div className="lb">{seg.label}</div>
            <div className="rg">{seg.range}</div>
          </div>
        ))}
      </div>

      <div className="sch-dcfacts">
        <b>{data.childrenUnder5.toLocaleString()}</b> children under 5 ·{' '}
        <b>{data.licensedSlots.toLocaleString()}</b> licensed slots ({data.centerSlots.toLocaleString()} center · {data.familyHomeSlots.toLocaleString()} home)
        {gap > 0
          ? <> · roughly a <b>{gap.toLocaleString()}-slot gap</b> to reach adequate coverage</>
          : <> · capacity meets the adequate threshold</>}
        <span className="sch-dcsrc">
          Source: {data.sources.childrenSource} {data.sources.childrenYear} · {data.sources.childcareSource} {data.sources.childcareYear}
        </span>
      </div>
    </div>
  );
}
