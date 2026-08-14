import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, TrendingUp, DollarSign, Award, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface CommercialLender {
  name: string;
  dealCount: number;
  totalAmount: number;
  avgAmount: number;
  yearRange: string;
}

interface CommercialLenderData {
  by7aDeals: CommercialLender[];
  by504Deals: CommercialLender[];
  by7aAvg: CommercialLender[];
  by504Avg: CommercialLender[];
  summary: {
    total7aLenders: number;
    total504Lenders: number;
    total7aDeals: number;
    total504Deals: number;
    yearsRange: string;
  };
  builtAt: string;
}

type TabType = '7a-deals' | '504-deals' | '7a-avg' | '504-avg';

function fmt(n: number) {
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

function BarFill({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[100px]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function LenderCard({
  lender,
  rank,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  barValue,
  barMax,
  primaryColor,
  barColor,
}: {
  lender: CommercialLender;
  rank: number;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  barValue: number;
  barMax: number;
  primaryColor: string;
  barColor: string;
}) {
  return (
    <div
      className="flex gap-3 items-start py-3 border-b border-border last:border-0"
      data-testid={`commercial-lender-${rank}`}
    >
      <div className="pt-0.5">
        <RankBadge rank={rank} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground leading-snug">{lender.name}</p>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold ${primaryColor}`}>{primaryValue}</p>
            <p className="text-[10px] text-muted-foreground">{primaryLabel}</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <BarFill value={barValue} max={barMax} color={barColor} />
          <span className="text-[10px] text-muted-foreground">{secondaryValue} {secondaryLabel}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{lender.yearRange}</span>
        </div>
      </div>
    </div>
  );
}

const TABS: { id: TabType; label: string; icon: typeof Trophy; activeColor: string }[] = [
  { id: '7a-deals', label: 'Most 7(a) Deals', icon: Trophy, activeColor: 'border-foreground text-foreground font-medium' },
  { id: '504-deals', label: 'Most 504 Deals', icon: Building2, activeColor: 'border-foreground text-foreground font-medium' },
  { id: '7a-avg', label: 'Highest Avg 7(a)', icon: TrendingUp, activeColor: 'border-foreground text-foreground font-medium' },
  { id: '504-avg', label: 'Highest Avg 504', icon: DollarSign, activeColor: 'border-foreground text-foreground font-medium' },
];

const TAB_DESC: Record<TabType, string> = {
  '7a-deals': 'Ranked by total SBA 7(a) loans approved in Cook County over the last 5 fiscal years. 7(a) loans fund small business working capital, equipment, and real estate purchases up to $5M.',
  '504-deals': 'Ranked by total SBA 504 loans approved in Cook County over the last 5 fiscal years. 504 loans are specifically designed for owner-occupied commercial real estate and major equipment, funded through Certified Development Companies (CDCs).',
  '7a-avg': 'Ranked by highest average 7(a) loan size in Cook County (minimum 3 deals). A higher average indicates the lender targets larger, more complex commercial transactions.',
  '504-avg': 'Ranked by highest average 504 loan size in Cook County (minimum 2 deals). Larger 504 deals typically signal commercial real estate acquisitions or major capital projects.',
};

export function CommercialLenderRankingsView() {
  const [tab, setTab] = useState<TabType>('7a-deals');

  const { data, isLoading, error } = useQuery<CommercialLenderData>({
    queryKey: ['/api/discovery/commercial-lender-rankings'],
    staleTime: 60 * 60 * 1000,
  });

  const currentList: CommercialLender[] = data
    ? tab === '7a-deals' ? data.by7aDeals
    : tab === '504-deals' ? data.by504Deals
    : tab === '7a-avg' ? data.by7aAvg
    : data.by504Avg
    : [];

  const maxBarValue = currentList.length > 0
    ? Math.max(...currentList.map(l => tab.endsWith('-deals') ? l.dealCount : l.avgAmount))
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Top Commercial Lenders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cook County SBA lending activity {data?.summary.yearsRange || 'last 5 years'} —
            {data && ` ${data.summary.total7aDeals.toLocaleString()} 7(a) deals · ${data.summary.total504Deals.toLocaleString()} 504 deals`}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          SBA FOIA Data
        </Badge>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '7(a) Lenders', value: data.summary.total7aLenders, color: 'text-foreground' },
            { label: '504 Lenders (CDCs)', value: data.summary.total504Lenders, color: 'text-foreground' },
            { label: '7(a) Deals', value: data.summary.total7aDeals.toLocaleString(), color: 'text-foreground' },
            { label: '504 Deals', value: data.summary.total504Deals.toLocaleString(), color: 'text-foreground' },
          ].map(stat => (
            <div key={stat.label} className="bg-muted rounded-lg border border-border p-3 text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto" data-testid="commercial-lender-tabs">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-commercial-${t.id}`}
              className={`text-xs px-4 py-2 border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                isActive ? t.activeColor : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground -mt-2">{TAB_DESC[tab]}</p>

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
            Failed to load commercial lender data.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && currentList.length > 0 && (
        <div>
          {currentList.map((lender, i) => {
            const rank = i + 1;
            const is7a = tab.startsWith('7a');
            const isDeals = tab.endsWith('-deals');
            return (
              <LenderCard
                key={`${lender.name}-${tab}`}
                lender={lender}
                rank={rank}
                primaryLabel={isDeals ? 'deals' : 'avg loan'}
                primaryValue={isDeals ? lender.dealCount.toLocaleString() : fmt(lender.avgAmount)}
                secondaryLabel={isDeals ? 'total deployed' : 'deals'}
                secondaryValue={isDeals ? fmt(lender.totalAmount) : lender.dealCount.toLocaleString()}
                barValue={isDeals ? lender.dealCount : lender.avgAmount}
                barMax={maxBarValue}
                primaryColor={
                  tab === '7a-deals' ? 'text-foreground' :
                  tab === '504-deals' ? 'text-foreground' :
                  tab === '7a-avg' ? 'text-foreground' :
                  'text-foreground'
                }
                barColor={
                  tab === '7a-deals' ? 'bg-emerald-400' :
                  tab === '504-deals' ? 'bg-blue-400' :
                  tab === '7a-avg' ? 'bg-violet-400' :
                  'bg-amber-400'
                }
              />
            );
          })}
        </div>
      )}

      {!isLoading && !error && currentList.length === 0 && data && (
        <p className="text-sm text-muted-foreground text-center py-8">No data available for this view.</p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Award className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <p className="text-[10px] text-muted-foreground">
          Source: U.S. Small Business Administration FOIA loan data — 7(a) (FY2020–present) and 504 (FY2010–present), filtered to Cook County, IL. 504 loans are originated through Certified Development Companies (CDCs). Data refreshes weekly.
        </p>
      </div>
    </div>
  );
}
