import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, TrendingDown, Award, Building2, Home, Users, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface TaxAppealAttorney {
  rank: number;
  name: string;
  firm: string;
  totalAppeals: number;
  wins: number;
  winRate: number;
  avgReduction: number;
  totalReduction: number;
}

interface CategoryData {
  byWins: TaxAppealAttorney[];
  byAvgReduction: TaxAppealAttorney[];
}

interface TaxAppealData {
  byWins: TaxAppealAttorney[];
  byAvgReduction: TaxAppealAttorney[];
  residential?: CategoryData;
  multifamily?: CategoryData;
  commercial?: CategoryData;
  yearsRange: string;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-bold text-sm w-6 text-right shrink-0">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-bold text-sm w-6 text-right shrink-0">🥈</span>;
  if (rank === 3) return <span className="text-orange-400 font-bold text-sm w-6 text-right shrink-0">🥉</span>;
  return <span className="text-xs font-semibold text-muted-foreground w-6 text-right shrink-0">#{rank}</span>;
}

function WinRateBar({ rate }: { rate: number }) {
  if (!rate) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{rate}% win rate</span>
    </div>
  );
}

function AttorneyCard({ attorney, metric }: { attorney: TaxAppealAttorney; metric: 'wins' | 'avgReduction' }) {
  return (
    <div className="flex gap-3 items-start py-3 border-b border-border last:border-0" data-testid={`tax-appeal-attorney-${attorney.rank}`}>
      <div className="pt-0.5"><RankBadge rank={attorney.rank} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{attorney.name}</p>
            <p className="text-xs text-muted-foreground truncate">{attorney.firm}</p>
          </div>
          <div className="text-right shrink-0">
            {metric === 'wins' ? (
              <>
                <p className="text-sm font-bold text-foreground">{attorney.wins.toLocaleString()} wins</p>
                <p className="text-[10px] text-muted-foreground">{attorney.totalAppeals.toLocaleString()} total appeals</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">{fmtK(attorney.avgReduction)} avg</p>
                <p className="text-[10px] text-muted-foreground">{attorney.wins.toLocaleString()} wins</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <WinRateBar rate={attorney.winRate} />
          <span className="text-[10px] text-muted-foreground">{fmtK(attorney.totalReduction)} total saved</span>
        </div>
      </div>
    </div>
  );
}

type PropertyTab = 'all' | 'residential' | 'multifamily' | 'commercial';
type MetricTab = 'wins' | 'avgReduction';

const PROPERTY_TABS: { id: PropertyTab; label: string; icon: typeof Home; color: string; activeColor: string; description: string }[] = [
  { id: 'all',          label: 'All',                  icon: Trophy,    color: 'border-slate-500 text-slate-700',    activeColor: 'border-slate-500',   description: 'All property types combined.' },
  { id: 'residential',  label: 'Residential',          icon: Home,      color: 'border-emerald-500 text-emerald-700', activeColor: 'border-emerald-500', description: 'Single-family homes and small residential properties (Class 200–214).' },
  { id: 'multifamily',  label: 'Multi-Family',         icon: Users,     color: 'border-amber-500 text-foreground',     activeColor: 'border-amber-500',   description: 'Larger multi-family residential buildings (6+ units, Class 211–318).' },
  { id: 'commercial',   label: 'Commercial/Industrial', icon: Building2, color: 'border-blue-500 text-foreground',        activeColor: 'border-blue-500',    description: 'Commercial, industrial, and incentive-class properties (Class 5xx/6xx).' },
];

export function TaxAppealAttorneyView() {
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('all');
  const [metricTab, setMetricTab] = useState<MetricTab>('wins');
  const [search, setSearch] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('search') || ''; } catch { return ''; }
  });

  const { data, isLoading, error } = useQuery<TaxAppealData>({
    queryKey: ['/api/discovery/tax-appeal-attorneys'],
    staleTime: 60 * 60 * 1000,
  });

  const hasSplit = !!(data?.residential || data?.multifamily || data?.commercial);

  function getSource(): CategoryData | undefined {
    if (!data) return undefined;
    if (propertyTab === 'residential' && data.residential) return data.residential;
    if (propertyTab === 'multifamily' && data.multifamily) return data.multifamily;
    if (propertyTab === 'commercial' && data.commercial) return data.commercial;
    return { byWins: data.byWins, byAvgReduction: data.byAvgReduction };
  }

  const source = getSource();
  const attorneys = metricTab === 'wins' ? source?.byWins : source?.byAvgReduction;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredAttorneys = attorneys?.filter(attorney =>
    !normalizedSearch || `${attorney.name} ${attorney.firm}`.toLowerCase().includes(normalizedSearch)
  );
  const activeTabInfo = PROPERTY_TABS.find(t => t.id === propertyTab)!;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Top Tax Appeal Attorneys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cook County Board of Review appeal outcomes {data?.yearsRange || '2019–2024'} — ranked by win volume and average assessed value reduction
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Cook County BOR
        </Badge>
      </div>
        <div>
          <label htmlFor="tax-appeal-attorney-search" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Find an attorney or firm
          </label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="tax-appeal-attorney-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or firm"
              className="pl-9"
              data-testid="input-tax-appeal-attorney-search"
            />
          </div>
        </div>

      {/* Property type tabs */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Property Type</p>
        <div className="flex flex-wrap gap-1 border-b border-border pb-0" data-testid="property-type-tabs">
          {PROPERTY_TABS.map(tab => {
            const available = tab.id === 'all' || hasSplit;
            const active = propertyTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => available && setPropertyTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                disabled={!available}
                className={`text-xs px-3 py-2 border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                  active
                    ? `${tab.activeColor} ${tab.color} font-medium`
                    : available
                    ? 'border-transparent text-muted-foreground hover:text-foreground'
                    : 'border-transparent text-muted-foreground/30 cursor-not-allowed'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {!available && tab.id !== 'all' && (
                  <span className="text-[9px] opacity-50">(updating)</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metric tabs */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Ranking Method</p>
        <div className="flex gap-1 border-b border-border pb-0" data-testid="metric-tabs">
          <button
            onClick={() => setMetricTab('wins')}
            data-testid="tab-most-wins"
            className={`text-xs px-4 py-2 border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              metricTab === 'wins'
                ? 'border-emerald-500 text-emerald-700 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Most Appeals Won
          </button>
          <button
            onClick={() => setMetricTab('avgReduction')}
            data-testid="tab-avg-reduction"
            className={`text-xs px-4 py-2 border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              metricTab === 'avgReduction'
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Highest Avg $ Reduction
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground -mt-1">
        <span className="font-medium">{activeTabInfo.description}</span>{' '}
        {metricTab === 'wins'
          ? "Ranked by total appeals resulting in a decrease. Win rate = wins ÷ all filed appeals."
          : `Ranked by average dollar reduction per winning appeal (min. 200 wins${propertyTab !== 'all' ? ' in this category' : ''}). High-value commercial wins can skew this metric — use the property type filter to compare fairly.`}
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start py-3">
              <Skeleton className="w-6 h-4 mt-1" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-24" />
              </div>
              <Skeleton className="w-20 h-8" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-border bg-secondary">
          <CardContent className="pt-4 text-sm text-foreground">
            Failed to load tax appeal data. The Cook County data portal may be temporarily unavailable.
          </CardContent>
        </Card>
      )}

      {/* Attorney list */}
       {!isLoading && !error && filteredAttorneys && filteredAttorneys.length > 0 && (
        <div>
           {filteredAttorneys.map(attorney => (
            <AttorneyCard key={`${attorney.name}-${attorney.firm}`} attorney={attorney} metric={metricTab} />
          ))}
        </div>
      )}

       {!isLoading && !error && filteredAttorneys && filteredAttorneys.length === 0 && (
         <p className="text-sm text-muted-foreground text-center py-6">
           {normalizedSearch ? `No tax appeal attorney or firm matched “${search.trim()}”.` : 'No data available for this category yet.'}
         </p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Award className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <p className="text-[10px] text-muted-foreground">
          Source: Cook County Board of Review (BOR) via Cook County Open Data Portal (resource 7pny-nedm). A "win" = any appeal with an assessment decrease. Residential = BOR class "Residential". Multi-Family = BOR class "Multi Family / Multi Family Incentive". Commercial/Industrial = "Commercial and Industrial", "Commercial Incentive", "Commercial/Industrial Incentive", and "Industrial Incentive." Data covers {data?.yearsRange || '2019–2024'}.
        </p>
      </div>
    </div>
  );
}
