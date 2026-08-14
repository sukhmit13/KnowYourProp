import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Home, DollarSign, Percent, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface ClosedLender {
  rank: number;
  lei: string;
  name: string;
  closed: number;
  totalApps: number;
  winRate: number;
}

interface FHALender {
  rank: number;
  lei: string;
  name: string;
  fhaClosed: number;
  closed: number;
  fhaPct: number;
}

interface SubordinateLender {
  rank: number;
  lei: string;
  name: string;
  subordinateClosed: number;
  closed: number;
  subordinatePct: number;
}

interface LowestRateLender {
  rank: number;
  lei: string;
  name: string;
  avgFirstLienRate: number;
  firstLienRateCount: number;
  closed: number;
}

interface LenderRankingData {
  byClosed: ClosedLender[];
  byFHAClosed: FHALender[];
  bySubordinate: SubordinateLender[];
  byLowestRate: LowestRateLender[];
  byLowestRate2024: LowestRateLender[];
  byLowestRate2023: LowestRateLender[];
  yearsRange: string;
  builtAt: string;
}

type TabType = 'closed' | 'fha' | 'subordinate' | 'rate';

/**
 * Standard ranked row (matches Gas Stations / Childcare Discovery lists):
 * indigo mono rank · bold name + muted sub-line + indigo magnitude bar · big serif value + unit · chevron.
 * Pass barPct = null to omit the bar (Lowest Avg Rate — a longer bar would falsely read as "better").
 */
function LenderRow({
  rank, name, subLine, barPct, value, unit, testId,
}: {
  rank: number;
  name: string;
  subLine: string;
  barPct: number | null;
  value: string;
  unit: string;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-[#eae8e2] last:border-0" data-testid={testId}>
      <span className="font-jbmono text-xs font-bold text-[#2b3a9e] w-[30px] shrink-0">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#141414] truncate">{name}</p>
        <p className="text-xs text-[#8b8a84] mt-0.5">{subLine}</p>
        {barPct !== null && (
          <div className="h-1.5 max-w-[340px] rounded-full bg-[#efeee9] mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3f51c5]"
              style={{ width: `${Math.min(Math.max(barPct, 2), 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="text-right shrink-0 flex items-center gap-2">
        <span className="flex flex-col items-end leading-tight">
          <span className="font-serif text-xl text-[#141414]">
            {value} <span className="font-sans text-[11px] text-[#8b8a84]">{unit}</span>
          </span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-[#8b8a84]" />
      </div>
    </div>
  );
}

const TABS: { id: TabType; label: string; icon: typeof Trophy }[] = [
  { id: 'closed', label: 'Most Closed Loans', icon: Trophy },
  { id: 'fha', label: 'Most FHA Closed', icon: Home },
  { id: 'subordinate', label: 'Most HELOC / Equity', icon: DollarSign },
  { id: 'rate', label: 'Lowest Avg Rate', icon: Percent },
];

const TAB_DESC: Record<TabType, string> = {
  closed: 'Ranked by total loans originated (closed) in Cook County across both 2023 and 2024. Approval rate shown as percentage of applications that resulted in a closed loan.',
  fha: 'Ranked by total FHA-insured loans originated in Cook County across 2023 and 2024. FHA loans are government-backed and commonly used by first-time and lower-income buyers. Percentage shown is share of each lender\'s closed loans that were FHA.',
  subordinate: 'Ranked by total subordinate-lien loans originated — including HELOCs, home equity loans, and second mortgages. These are loans secured by equity in an already-mortgaged property. Percentage shown is share of closed loans that are subordinate liens.',
  rate: 'Ranked by average interest rate on closed first-lien loans (conventional, FHA, and VA) in Cook County, 2023–2024. Lenders must have at least 100 closed first-lien loans to qualify. HELOCs and second mortgages are excluded. Rates come from HMDA disclosures.',
};

export function LenderRankingsView() {
  const [tab, setTab] = useState<TabType>('closed');
  const [rateYear, setRateYear] = useState<'2024' | '2023' | 'combined'>('2024');

  const { data, isLoading, error } = useQuery<LenderRankingData>({
    queryKey: ['/api/discovery/lender-rankings'],
    staleTime: 5 * 60 * 1000,
  });

  const rateList = rateYear === '2024' ? data?.byLowestRate2024
    : rateYear === '2023' ? data?.byLowestRate2023
    : data?.byLowestRate;

  const topClosed = data?.byClosed[0]?.closed || 0;
  const topFha = data?.byFHAClosed[0]?.fhaClosed || 0;
  const topSub = data?.bySubordinate[0]?.subordinateClosed || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-jbmono text-[13px] font-bold uppercase tracking-[0.05em] text-[#141414]">Top Residential Lenders</h2>
          <p className="text-sm text-[#8b8a84] mt-0.5">
            Cook County HMDA mortgage data {data?.yearsRange || '2023–2024'} — ranked by closed loans, FHA volume, and HELOC/home equity originations
          </p>
        </div>
        <span className="font-jbmono text-[9.5px] uppercase tracking-[0.05em] text-[#8b8a84] border border-[#eae8e2] rounded-full px-2.5 py-1">
          FFIEC HMDA
        </span>
      </div>

      <div className="flex gap-1 border-b border-[#eae8e2] pb-0 flex-wrap" data-testid="lender-tabs">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-lender-${t.id}`}
              className={`font-jbmono text-xs px-4 py-2 border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'border-[#2b3a9e] text-[#141414] font-bold'
                  : 'border-transparent text-[#8b8a84] hover:text-[#141414]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#2b3a9e]' : ''}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[#8b8a84] -mt-2">{TAB_DESC[tab]}</p>

      {tab === 'rate' && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex rounded-lg border border-[#eae8e2] bg-[#f3f2ec] p-0.5">
            {(['2024', '2023', 'combined'] as const).map(yr => (
              <button
                key={yr}
                onClick={() => setRateYear(yr)}
                data-testid={`rate-year-${yr}`}
                className={`font-jbmono text-xs px-3.5 py-1 rounded-md transition-colors ${
                  rateYear === yr
                    ? 'bg-[#2b3a9e] text-white font-bold'
                    : 'text-[#565651] hover:text-[#141414]'
                }`}
              >
                {yr === 'combined' ? '2023 + 2024' : yr}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[#8b8a84]">
            {rateYear === 'combined' ? 'min 100 loans' : 'min 50 loans'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start py-3">
              <Skeleton className="w-6 h-4 mt-1" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-2 w-28" />
              </div>
              <Skeleton className="w-24 h-8" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-border bg-secondary">
          <CardContent className="pt-4 text-sm text-foreground">
            Failed to load lender ranking data.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && data && (
        <div>
          {tab === 'closed' && data.byClosed.map(l => (
            <LenderRow
              key={l.lei}
              rank={l.rank}
              name={l.name}
              subLine={`${l.totalApps.toLocaleString()} total apps · ${l.winRate}% approval`}
              barPct={topClosed > 0 ? (l.closed / topClosed) * 100 : null}
              value={l.closed.toLocaleString()}
              unit="closed"
              testId={`lender-closed-${l.rank}`}
            />
          ))}
          {tab === 'fha' && data.byFHAClosed.map(l => (
            <LenderRow
              key={l.lei}
              rank={l.rank}
              name={l.name}
              subLine={`${l.fhaPct}% of all closed loans · ${l.closed.toLocaleString()} total closed`}
              barPct={topFha > 0 ? (l.fhaClosed / topFha) * 100 : null}
              value={l.fhaClosed.toLocaleString()}
              unit="FHA closed"
              testId={`lender-fha-${l.rank}`}
            />
          ))}
          {tab === 'subordinate' && data.bySubordinate.map(l => (
            <LenderRow
              key={l.lei}
              rank={l.rank}
              name={l.name}
              subLine={`${l.subordinatePct}% of closed are HELOC/equity · ${l.closed.toLocaleString()} total closed`}
              barPct={topSub > 0 ? (l.subordinateClosed / topSub) * 100 : null}
              value={l.subordinateClosed.toLocaleString()}
              unit="subordinate"
              testId={`lender-subordinate-${l.rank}`}
            />
          ))}
          {tab === 'rate' && (rateList || []).map(l => (
            <LenderRow
              key={`${l.lei}-${rateYear}`}
              rank={l.rank}
              name={l.name}
              subLine={`${l.firstLienRateCount.toLocaleString()} first-lien loans rated · ${l.closed.toLocaleString()} total closed (incl. HELOCs)`}
              barPct={null}
              value={`${l.avgFirstLienRate.toFixed(3)}%`}
              unit="first-lien avg"
              testId={`lender-rate-${l.rank}`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-[#eae8e2]">
        <p className="text-[10px] text-[#8b8a84]">
          Source: Federal Financial Institutions Examination Council (FFIEC) Home Mortgage Disclosure Act (HMDA) data for Cook County (FIPS 17031), covering activity years 2023 and 2024. Includes all residential mortgage applications with a recorded action. Subordinate lien includes open-end lines of credit (HELOCs) and closed-end second mortgages.
        </p>
      </div>
    </div>
  );
}
