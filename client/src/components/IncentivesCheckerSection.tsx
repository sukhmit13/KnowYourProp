import { Skeleton } from "@/components/ui/skeleton";
import { IncentiveCard, type IncentiveState } from "@/components/IncentiveCard";

export interface CheckResult {
  key: string;
  name: string;
  category: string;
  status: 'in_area' | 'not_in_area' | 'potentially_eligible' | 'not_applicable' | 'manual_check' | 'data_pending';
  statement: string;
  automatic: boolean;
  actionRequired: boolean;
  priority?: string;
  isRequirement?: boolean;
  zoningInferred?: boolean;
  awaitingProjectType?: boolean;
  grantType?: string;
  applicationDates?: string;
  nextRoundNote?: string;
  learnMoreUrl?: string;
  lenders?: Array<{ name: string; contact: string; phone: string }>;
}
export type IncAvail = 0 | 1 | 3;

interface Props {
  results: CheckResult[] | null | undefined;
  isLoading: boolean;
  hasProjectType: boolean;
  zoningCode?: string | null;
}

// ─── Colors matching reference design ───────────────────────────────────────
const C = {
  good:        '#2f7d3f',
  goodBg:      '#eef5ef',
  goodLine:    '#cfe3d3',
  caution:     '#c98a12',
  cautionBg:   '#fbf2da',
  cautionLine: '#eeddac',
  muted:       '#8b8a84',
  ink:         '#141414',
  ink2:        '#565651',
  line:        '#eae8e2',
  line2:       '#ddd9d0',
  paper2:      '#fafaf8',
};

// ─── Existing detail-card components ────────────────────────────────────────
function grantTypeLabel(gt: string) {
  if (gt === 'grant') return 'Grant';
  if (gt === 'tax_credit') return 'Tax Credit';
  if (gt === 'incentive') return 'Incentive';
  return gt;
}

function ProgramCard({ result, order, id, className }: { result: CheckResult; order: number; id: string; className?: string }) {
  const state: IncentiveState = result.status === "in_area" || result.status === "potentially_eligible" ? "good" : result.status === "manual_check" || result.status === "data_pending" ? "caution" : "na";
  const columns = result.lenders?.length ? [{ head: "Participating lenders", items: result.lenders.map(l => `${l.name} · ${l.contact} · ${l.phone}`) }] : undefined;
  const datesText = (result.status === 'potentially_eligible' || result.status === 'in_area')
    ? [result.applicationDates, result.nextRoundNote].filter(Boolean).join(" — ")
    : "";
  const noteText = [datesText || null, result.actionRequired ? "Requires application / approval — not automatic." : null].filter(Boolean).join(" · ");
  return (
    <IncentiveCard id={id} order={order} className={className} name={result.name} type={grantTypeLabel(result.grantType || result.category)} state={state} pill_label={checkerBadge(result)} verdict={result.statement} verdict_sub={state === "na" ? "The available location data does not establish eligibility for this program." : undefined} columns={columns} note={noteText ? { icon: datesText ? "calendar" : "clock", text: noteText } : undefined} links={result.learnMoreUrl ? [{ label: "Program info", href: result.learnMoreUrl }] : []} />
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
// ─── Flattened cards: slot config-driven checker programs into the parent
//     availability→type hierarchy (used by RunDetail's Location Based Incentives) ───

/** Availability state: 0 likely relevant, 1 needs confirmation, 3 not applicable. */
export function checkerAvail(r: CheckResult): IncAvail {
  if (r.awaitingProjectType) return 1;
  if (r.status === 'in_area' || r.status === 'potentially_eligible') return 0;
  if (r.status === 'manual_check' || r.status === 'data_pending') return 1;
  return 3;
}

/** Type group: 1 Property Tax · 2 Financing & Investor Credits · 3 Grants & Direct Funding · 4 Zoning & Development Rights · 5 Context / Clean Energy. */
export function checkerTypeGroup(category: string): 1 | 2 | 3 | 4 | 5 {
  const c = category.toLowerCase();
  if (c.includes('property tax')) return 1;
  if (c.includes('clean energy') || c.includes('context')) return 5;
  if (c.includes('zoning') || c.includes('density') || c.includes('affordability')) return 4;
  if (c.includes('credit') || c.includes('designation') || c.includes('financing')) return 2;
  return 3; // grants and everything grant-like
}

function checkerBadge(r: CheckResult): string {
  if (r.awaitingProjectType) return 'Awaiting Project Type';
  if (r.isRequirement) return 'Requirement';
  if (r.status === 'in_area') return 'In Area';
  if (r.status === 'potentially_eligible') return 'Potentially Eligible';
  if (r.status === 'manual_check') return 'Manual Check';
  if (r.status === 'data_pending') return 'Pending Data';
  return 'Not Applicable';
}

export function IncentiveCheckerCards({ results, isLoading, naOpen, likelyOpen = true, confirmOpen = true }: { results: CheckResult[] | null | undefined; isLoading: boolean; naOpen: boolean; likelyOpen?: boolean; confirmOpen?: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-[10px]" style={{ order: 1050 }} />;
  }
  if (!results || results.length === 0) return null;
  // display:contents wrappers keep the parent flex ordering intact so these cards interleave with the hand-built ones
  return (
    <>
      {results.map((r, i) => {
        const s = checkerAvail(r);
        const t = checkerTypeGroup(r.category);
        // Within Likely Relevant / Needs Confirmation: location-confirmed programs (in-area,
        // requirements) sort with the hand-built cards (strength 0); generic "potentially
        // eligible" ones drop below them (strength 400). +25 offset keeps checker cards after
        // hand-built cards within the same strength+type bucket. Not Applicable keeps the
        // legacy type*100 spacing to align with its 3100–3500 type labels.
        const strength = r.status === 'in_area' || r.isRequirement ? 0 : 400;
        const order = s === 3
          ? 3000 + t * 100 + 50 + i
          : (s === 0 ? 1000 : 2000) + strength + t * 50 + 25 + Math.min(i, 24);
        // NA stays 'hidden' in print too (parity with hand-built cards); good/caution use 'ghide',
        // which is display:none on screen but prints even when the group is screen-collapsed.
        const hiddenCls = s === 3 ? (naOpen ? "" : "hidden") : s === 0 ? (likelyOpen ? "" : "ghide") : (confirmOpen ? "" : "ghide");
        return (
          <ProgramCard key={r.key} result={r} id={`print-section-checker-${r.key}`} order={order} className={hiddenCls} />
        );
      })}
    </>
  );
}
