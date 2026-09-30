import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip as ReTooltip } from "recharts";
import {
  Building2, TrendingUp, Users, DollarSign,
  ShieldAlert, CreditCard, BarChart3, Home, Landmark, Banknote
} from "lucide-react";
import type { HmdaStats, HmdaSubStats, HmdaBreakdownItem, HmdaLenderItem, HmdaData, HmdaCommunityRank, HmdaYear } from "@/hooks/use-runs";
import { getHmdaYearRateForScope, useMortgageRate } from "@/hooks/use-runs";

const YEARS = [2025, 2024, 2023] as const;

function availableHmdaYears(hmdaData: HmdaData | null | undefined): HmdaYear[] {
  return YEARS.filter((year) => {
    const data = hmdaData?.[year];
    return !!(data?.community || data?.tract);
  });
}

interface HMDAFinancingProps {
  hmdaData: HmdaData | null | undefined;
  communityArea: string | null | undefined;
  tractGeoid: string | null | undefined;
  isLoading: boolean;
}

interface HMDABuyerProps {
  hmdaData: HmdaData | null | undefined;
  label: string;
  communityArea?: string | null;
  tractGeoid?: string | null;
}

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  'FHA:First Lien': 'bg-secondary',
  'Conventional:First Lien': 'bg-secondary',
  'VA:First Lien': 'bg-secondary',
  'FSA/RHS:First Lien': 'bg-secondary',
  'Conventional:Subordinate Lien': 'bg-teal-500',
  'FHA:Subordinate Lien': 'bg-sky-400',
  'FSA/RHS:Subordinate Lien': 'bg-violet-400',
};

const RACE_COLORS: Record<string, string> = {
  'White': 'bg-blue-400',
  'Black or African American': 'bg-secondary',
  'Hispanic or Latino': 'bg-secondary',
  'Asian': 'bg-rose-400',
  'American Indian or Alaska Native': 'bg-teal-500',
  'Native Hawaiian or Other Pacific Islander': 'bg-violet-500',
  '2 or more minority races': 'bg-orange-400',
  'Joint': 'bg-slate-400',
  'Race Not Available': 'bg-secondary',
  'Free Form Text Only': 'bg-secondary',
};

const ETHNICITY_COLORS: Record<string, string> = {
  'Hispanic or Latino': 'bg-secondary',
  'Not Hispanic or Latino': 'bg-blue-400',
  'Ethnicity Not Available': 'bg-secondary',
  'Joint': 'bg-slate-400',
  'Free Form Text Only': 'bg-secondary',
};

function StatBar({ item, colorClass, showCount = true }: {
  item: HmdaBreakdownItem;
  colorClass?: string;
  showCount?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[60%]">{item.label}</span>
        <span className="font-medium tabular-nums">
          {item.pct}%{showCount && <span className="text-muted-foreground ml-1">({item.count.toLocaleString()})</span>}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass || 'bg-primary'}`}
          style={{ width: `${Math.min(item.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-jbmono">
      <Icon className="w-3.5 h-3.5" />
      {title}
    </div>
  );
}

// Nine-color pie palette (pies/donuts only). High-contrast per-chart pairings;
// never pair pale light-blue #90b8f0 or mid-teal #68c0b0 as the two dominant slices.
const PIE_PALETTE = ['#4068d0', '#e8b018', '#f87058', '#68c0b0', '#38a850', '#f888b0', '#a060f0', '#90b8f0', '#986848'];
const LOAN_TYPE_HEX: Record<string, string> = { 'Conventional': '#4068d0', 'FHA': '#e8b018', 'VA': '#f87058', 'FSA/RHS': '#a060f0' };
const OCCUPANCY_HEX: Record<string, string> = { 'Principal Residence': '#a060f0', 'Investment Property': '#e8b018', 'Second Residence': '#38a850' };
const PRODUCT_TYPE_HEX: Record<string, string> = {
  'Conventional:First Lien': '#38a850', 'Conventional:Subordinate Lien': '#f87058',
  'FHA:First Lien': '#4068d0', 'VA:First Lien': '#e8b018',
  'FSA/RHS:First Lien': '#a060f0', 'FHA:Subordinate Lien': '#90b8f0', 'FSA/RHS:Subordinate Lien': '#986848',
};
const RACE_HEX: Record<string, string> = {
  'White': '#60a5fa', 'Black or African American': '#10b981', 'Hispanic or Latino': '#f59e0b',
  'Asian': '#fb7185', 'American Indian or Alaska Native': '#14b8a6',
  'Native Hawaiian or Other Pacific Islander': '#8b5cf6', '2 or more minority races': '#f97316', 'Joint': '#94a3b8',
};
const ETHNICITY_HEX: Record<string, string> = {
  'Hispanic or Latino': '#f59e0b', 'Not Hispanic or Latino': '#60a5fa', 'Joint': '#94a3b8',
};
const SEX_HEX: Record<string, string> = { 'Male': '#60a5fa', 'Female': '#f472b6', 'Joint': '#94a3b8' };
const AGE_COLORS_HEX = ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1', '#3b82f6'];
const INCOME_COLORS_HEX = ['#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46'];
const DTI_COLORS_HEX = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'];
// Sequential indigo ramp — ordered distributions rendered as bars (lowest → highest band)
const PROP_VALUE_RAMP = ['#cdd3f0', '#aab4e8', '#8290db', '#5a68c4', '#3f4ba8', '#2b3a8c'];
const PROP_TYPE_COLORS_HEX = ['#f87058', '#4068d0', '#68c0b0'];
// Red family ramp — denial reasons rendered as ranked bars (top reasons darkest)
const DENIAL_RAMP = ['#d13b26', '#d13b26', '#d95c4a', '#d95c4a', '#e58a78', '#e58a78', '#eeb0a4', '#eeb0a4'];
const FALLBACK_COLORS = PIE_PALETTE;

function MiniPieChart({ items, colorMap, fallbackColors, title, icon: Icon, note }: {
  items: HmdaBreakdownItem[];
  colorMap?: Record<string, string>;
  fallbackColors?: string[];
  title: string;
  icon: any;
  note?: string;
}) {
  const palette = fallbackColors ?? FALLBACK_COLORS;
  const data = items.map((item, i) => ({
    ...item,
    fill: colorMap?.[item.label] ?? palette[i % palette.length],
  }));

  return (
    <div className="kyp-mixcard">
      <div className="mh"><Icon className="w-3.5 h-3.5" />{title}</div>
      <div className="kyp-donut">
        <PieChart width={88} height={88}>
          <Pie data={data} cx={40} cy={40} innerRadius={24} outerRadius={40} paddingAngle={1.5} dataKey="pct" isAnimationActive={false} nameKey="label">
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
          </Pie>
          <ReTooltip
            formatter={(val: number, name: string) => [`${val}%`, name]}
            contentStyle={{ fontSize: '10px', padding: '2px 6px', lineHeight: '1.4' }}
            itemStyle={{ margin: 0 }}
          />
        </PieChart>
        <div className="dlegend">
          {data.map((entry) => (
            <div key={entry.key} className="kyp-mixrow">
              <span className="sw" style={{ backgroundColor: entry.fill }} />
              <span className="nm">{entry.label}</span>
              <span className="pc">{entry.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      {note && <p className="text-xs text-muted-foreground mt-2">{note}</p>}
    </div>
  );
}

// Horizontal bar block — for ordered distributions (sequential ramp) and
// ranked lists (descending); deliberate: tiny slices are unreadable as donuts.
function HmdaBarBlock({ items, ramp, title, icon: Icon, headNote, ranked = false }: {
  items: HmdaBreakdownItem[];
  ramp: string[];
  title: string;
  icon: any;
  headNote?: string;
  ranked?: boolean;
}) {
  const rows = ranked ? [...items].sort((a, b) => b.pct - a.pct) : items;
  const maxPct = Math.max(...rows.map(r => r.pct), 0.1);
  return (
    <div className="kyp-mixcard">
      <div className="mh"><Icon className="w-3.5 h-3.5" />{title}{headNote && <span className="note"> · {headNote}</span>}</div>
      <div>
        {rows.map((item, i) => (
          <div key={item.key} className={`kyp-hbar${ranked ? '' : ' ind'}`}>
            <span className="hl"><i className="tick ind" />{item.label}</span>
            <span className="htrack"><i style={{ width: item.pct > 0 ? `${Math.max((item.pct / maxPct) * 100, 2)}%` : '0%', background: ranked ? 'var(--kyp-indigoL)' : ramp[Math.min(i, ramp.length - 1)] }}><span className="hbar-count">{item.pct}%</span></i></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LenderTable({ lenders, view = 'all' }: { lenders: HmdaLenderItem[]; view?: 'all' | 'closed' | 'denied' }) {
  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => { setVisibleCount(10); }, [lenders, view]);
  const sorted = [...lenders].sort((a, b) => {
    if (view === 'closed') return (b.closedCount ?? 0) - (a.closedCount ?? 0);
    if (view === 'denied') return (b.deniedCount ?? 0) - (a.deniedCount ?? 0);
    return b.count - a.count;
  });

  const hasRates = (view === 'all' || view === 'closed') && lenders.some(l => l.avgFirstLienRate != null);

  const maxVal = view === 'closed'
    ? Math.max(...lenders.map(l => l.closedCount ?? 0), 1)
    : view === 'denied'
    ? Math.max(...lenders.map(l => l.deniedCount ?? 0), 1)
    : 100;

  // Neutral activity data — indigo volume bars regardless of view
  const maxBar = view === 'all' ? Math.max(...sorted.map(l => l.pct), 0.1) : maxVal;

  const renderRow = (l: HmdaLenderItem) => {
    const metric = view === 'closed' ? (l.closedCount ?? 0) : view === 'denied' ? (l.deniedCount ?? 0) : l.count;
    const barWidth = view === 'all' ? Math.round((l.pct / maxBar) * 100) : Math.round((metric / maxVal) * 100);
    const label = view === 'all' ? `${l.pct}% (${l.count})` : `${metric} ${view === 'closed' ? 'closed' : 'denied'}`;
    return (
      <div key={l.lei} className="kyp-hbar wide" data-testid={`row-hmda-lender-${l.lei}`}>
        <span className="hl" title={l.name}><i className="tick ind" />{l.name}</span>
        {hasRates && <span style={{ width: 52, flex: 'none', fontSize: 10, color: 'var(--kyp-muted)', textAlign: 'right' }}>{l.avgFirstLienRate ? `${l.avgFirstLienRate.toFixed(2)}%` : '—'}</span>}
        <span className="htrack"><i className="ind" style={{ width: metric > 0 ? `${Math.max(barWidth, 2)}%` : '0%' }}><span className="hbar-count">{label}</span></i></span>
      </div>
    );
  };

  return (
    <div>
      {sorted.slice(0, visibleCount).map(renderRow)}
      {visibleCount < sorted.length && <button type="button" className="hmda-showall market-showmore" data-testid="show-more-hmda-lenders" onClick={() => setVisibleCount(n => n + 10)}>Show {Math.min(10, sorted.length - visibleCount)} more lenders →</button>}
      {visibleCount > 10 && <button type="button" className="hmda-showall market-showmore ml-4" onClick={() => setVisibleCount(10)}>Show fewer</button>}
      <div className="hidden print:block">{sorted.slice(visibleCount).map(renderRow)}</div>
    </div>
  );
}

function StatsPanel({ stats, label, view = 'all' }: { stats: HmdaStats; label: string; view?: BuyerView }) {
  const fha = stats.byLoanType.find(a => a.key === '2');
  const conventional = stats.byLoanType.find(a => a.key === '1');
  const va = stats.byLoanType.find(a => a.key === '3');
  const principalRes = stats.byOccupancy.find(a => a.key === '1');
  const investment = stats.byOccupancy.find(a => a.key === '3');
  return (
    <div className="kyp-hmda-panel">
      {/* ALL view */}
      {view === 'all' && (
        <>
          <div className="kyp-mix">
            <MiniPieChart items={[fha, conventional, va].filter(Boolean) as HmdaBreakdownItem[]} colorMap={LOAN_TYPE_HEX} title="Loan Type" icon={Home} />
            <MiniPieChart items={[principalRes, investment].filter(Boolean) as HmdaBreakdownItem[]} colorMap={OCCUPANCY_HEX} title="Occupancy" icon={Building2} />
          </div>

          {((stats.byProductType?.length ?? 0) > 0 || (stats.byDwellingCategory?.length ?? 0) > 0) && (
            <div className="kyp-mix">
              {(stats.byProductType?.length ?? 0) > 0 && (
                <MiniPieChart items={stats.byProductType} colorMap={PRODUCT_TYPE_HEX} title="Loan Product Type" icon={BarChart3} />
              )}
              {(stats.byDwellingCategory?.length ?? 0) > 0 && (
                <MiniPieChart items={stats.byDwellingCategory} fallbackColors={PROP_TYPE_COLORS_HEX} title="Property Type" icon={Home} />
              )}
            </div>
          )}

          {((stats.byPropertyValueBin?.length ?? 0) > 0 || (stats.byDenialReason?.length ?? 0) > 0) && (
            <div className="kyp-mix">
              {(stats.byPropertyValueBin?.length ?? 0) > 0 && (
                <HmdaBarBlock items={stats.byPropertyValueBin} ramp={PROP_VALUE_RAMP} title="Property Value" icon={DollarSign} headNote="distribution" />
              )}
              {(stats.byDenialReason?.length ?? 0) > 0 && (
                <HmdaBarBlock items={[...stats.byDenialReason.filter(i => i.key !== '1111')].sort((a, b) => b.pct - a.pct).slice(0, 6)} ramp={DENIAL_RAMP} title="Denial Reasons" icon={ShieldAlert} headNote="% of applications" ranked />
              )}
            </div>
          )}

          {(stats.byLender?.length ?? 0) > 0 && (
            <div className="kyp-mixcard" id="hmda-lenders">
              <div className="mh">Active Lenders · top by application volume</div>
              <LenderTable lenders={stats.byLender} view="all" />
            </div>
          )}
        </>
      )}

      {/* CLOSED view */}
      {view === 'closed' && (
        <>
          {stats.originated && (() => {
            const orig = stats.originated;
            const origFha = orig.byLoanType?.find(a => a.label === 'FHA');
            const origConv = orig.byLoanType?.find(a => a.label === 'Conventional');
            const origVa  = orig.byLoanType?.find(a => a.label === 'VA');
            const origPri = orig.byOccupancy?.find(a => a.key === '1');
            const origInv = orig.byOccupancy?.find(a => a.key === '3');
            return (
              <>
                <div className="kyp-mix">
                  {[origFha, origConv, origVa].filter(Boolean).length > 0 && (
                    <MiniPieChart items={[origFha, origConv, origVa].filter(Boolean) as HmdaBreakdownItem[]} colorMap={LOAN_TYPE_HEX} title="Loan Type" icon={Home} />
                  )}
                  {[origPri, origInv].filter(Boolean).length > 0 && (
                    <MiniPieChart items={[origPri, origInv].filter(Boolean) as HmdaBreakdownItem[]} colorMap={OCCUPANCY_HEX} title="Occupancy" icon={Building2} />
                  )}
                </div>

                {(orig.byProductType?.length || orig.byDwellingCategory?.length) ? (
                  <div className="kyp-mix">
                    {orig.byProductType && orig.byProductType.length > 0 && (
                      <MiniPieChart items={orig.byProductType} colorMap={PRODUCT_TYPE_HEX} title="Loan Product Type" icon={BarChart3} />
                    )}
                    {orig.byDwellingCategory && orig.byDwellingCategory.length > 0 && (
                      <MiniPieChart items={orig.byDwellingCategory} fallbackColors={PROP_TYPE_COLORS_HEX} title="Property Type" icon={Home} />
                    )}
                  </div>
                ) : null}

                {orig.byPropertyValueBin && orig.byPropertyValueBin.length > 0 && (
                  <div className="kyp-mix">
                    <HmdaBarBlock items={orig.byPropertyValueBin} ramp={PROP_VALUE_RAMP} title="Property Value at Origination" icon={DollarSign} headNote="distribution" />
                  </div>
                )}

                <DemographicsPanel sub={orig} showDemographics={false} />
              </>
            );
          })()}

          {(stats.byLender?.length ?? 0) > 0 && (
            <div className="kyp-mixcard">
              <div className="mh">Active Lenders · ranked by loans originated</div>
              <LenderTable lenders={stats.byLender} view="closed" />
            </div>
          )}
        </>
      )}

      {/* DENIED view */}
      {view === 'denied' && (
        <>
          {stats.denied && (() => {
            const denied = stats.denied;
            const deniedPri = denied.byOccupancy?.find(a => a.key === '1');
            const deniedInv = denied.byOccupancy?.find(a => a.key === '3');
            return (
              <>
                <div className="kyp-mix">
                  {(deniedPri || deniedInv) && (
                    <MiniPieChart items={[deniedPri, deniedInv].filter(Boolean) as HmdaBreakdownItem[]} colorMap={OCCUPANCY_HEX} title="Occupancy of Denied Apps" icon={Building2} />
                  )}
                  {denied.byProductType && denied.byProductType.length > 0 && (
                    <MiniPieChart items={denied.byProductType} colorMap={PRODUCT_TYPE_HEX} title="Loan Product Type Applied For" icon={BarChart3} />
                  )}
                </div>

                <DemographicsPanel sub={denied} colorPrefix="red" showDemographics={false} />
              </>
            );
          })()}

          {(stats.byLender?.length ?? 0) > 0 && (
            <div className="kyp-mixcard">
              <div className="mh">Active Lenders · ranked by applications denied</div>
              <LenderTable lenders={stats.byLender} view="denied" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SEX_COLORS: Record<string, string> = {
  'Male': 'bg-blue-400',
  'Female': 'bg-rose-400',
  'Joint': 'bg-slate-400',
};

type BuyerView = 'all' | 'closed' | 'denied';

function DemographicsPanel({ sub, colorPrefix, year, showDemographics = true }: { sub: HmdaSubStats; colorPrefix?: string; year?: number; showDemographics?: boolean }) {
  const ageOrder = ['<25', '25-34', '35-44', '45-54', '55-64', '65-74', '>74'];
  const sortedAge = [...(sub.byAge ?? [])].sort((a, b) => ageOrder.indexOf(a.key) - ageOrder.indexOf(b.key));
  const dtiColors = colorPrefix === 'red' ? ['#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626'] : DTI_COLORS_HEX;
  const ageColors = colorPrefix === 'red' ? ['#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'] : AGE_COLORS_HEX;
  const incomeColors = colorPrefix === 'red' ? ['#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c'] : INCOME_COLORS_HEX;

  return (
    <div className="space-y-4">
      {showDemographics && (sub.bySex?.length || sub.byRace?.length) ? (
        <div className="kyp-mix">
          {sub.bySex && sub.bySex.length > 0 && (
            <MiniPieChart items={sub.bySex} colorMap={SEX_HEX} title="Sex / Gender" icon={Users} note="Joint = co-applicants of different sex." />
          )}
          {sub.byRace && sub.byRace.length > 0 && (
            <MiniPieChart items={sub.byRace.filter(r => r.label !== 'Race Not Available' && r.label !== 'Free Form Text Only')} colorMap={RACE_HEX} title="Race" icon={Users} />
          )}
        </div>
      ) : null}

      {showDemographics && (sub.byEthnicity?.length || sortedAge.length) ? (
        <div className="kyp-mix">
          {sub.byEthnicity && sub.byEthnicity.length > 0 && (
            <MiniPieChart items={sub.byEthnicity.filter(e => e.label !== 'Ethnicity Not Available' && e.label !== 'Free Form Text Only')} colorMap={ETHNICITY_HEX} title="Ethnicity" icon={Users} />
          )}
          {sortedAge.length > 0 && (
            <MiniPieChart items={sortedAge} fallbackColors={ageColors} title="Age Group" icon={TrendingUp} />
          )}
        </div>
      ) : null}

      {showDemographics && (sub.byIncomeBin?.length || sub.byDti?.length) ? (
        <div className="kyp-mix">
          {sub.byIncomeBin && sub.byIncomeBin.length > 0 && (
            <MiniPieChart items={sub.byIncomeBin} fallbackColors={incomeColors} title="Income" icon={Banknote} />
          )}
          {sub.byDti && sub.byDti.length > 0 && (
            <MiniPieChart items={sub.byDti} fallbackColors={dtiColors} title="Debt-to-Income" icon={CreditCard} note="Among applications with reported DTI" />
          )}
        </div>
      ) : null}

      {sub.byDenialReason && sub.byDenialReason.length > 0 && (
        <HmdaBarBlock items={sub.byDenialReason.filter(i => i.key !== '1111')} ramp={DENIAL_RAMP} title="Top Denial Reasons" icon={ShieldAlert} headNote="% of applications" ranked />
      )}

      {year ? (
        <p className="text-xs text-muted-foreground">
          Source: FFIEC/CFPB {year} HMDA loan-level data. Cook County (FIPS 17031).
        </p>
      ) : null}
    </div>
  );
}

export function HMDABuyerProfile({ hmdaData, label, communityArea, tractGeoid }: HMDABuyerProps) {
  const [year, setYear] = useState<HmdaYear>(2025);
  const [scope, setScope] = useState<'community' | 'tract'>('community');
  const [view, setView] = useState<BuyerView>('all');

  const availableYears = availableHmdaYears(hmdaData);
  const activeYear = availableYears.includes(year) ? year : availableYears[0] ?? year;
  const yearData = hmdaData?.[activeYear];
  const hasCommunity = !!yearData?.community;
  const hasTract = !!yearData?.tract;
  const stats = scope === 'community' ? (yearData?.community ?? yearData?.tract) : (yearData?.tract ?? yearData?.community);

  if (!stats) return null;

  const originatedAction = stats.byAction.find((a: HmdaBreakdownItem) => a.key === '1');
  const deniedAction = stats.byAction.find((a: HmdaBreakdownItem) => a.key === '3');
  const closedCount = originatedAction?.count ?? 0;
  const closedPct = originatedAction?.pct ?? 0;
  const deniedCount = deniedAction?.count ?? 0;
  const deniedPct = deniedAction?.pct ?? 0;

  const allSubStats: HmdaSubStats = {
    total: stats.total,
    byRace: stats.byRace,
    byEthnicity: stats.byEthnicity,
    bySex: (stats as any).bySex ?? [],
    byAge: stats.byAge,
    byIncomeBin: (stats as any).byIncomeBin ?? [],
    medianIncome: (stats as any).medianIncome ?? null,
    byDti: (stats as any).byDti ?? [],
  };

  return (
    <div className="kyp-hmda-buyer">
      {/* Year + scope controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {hasCommunity && hasTract ? (
          <div className="kyp-seg">
            <button
              onClick={() => setScope('community')}
              className={scope === 'community' ? 'on' : ''}
              aria-pressed={scope === 'community'}
              data-testid="button-hmda-buyer-scope-community"
            >
              {communityArea || 'Community Area'}
            </button>
            <button
              onClick={() => setScope('tract')}
              className={scope === 'tract' ? 'on' : ''}
              aria-pressed={scope === 'tract'}
              data-testid="button-hmda-buyer-scope-tract"
            >
              Census Tract {tractGeoid?.slice(-6)}
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{stats.total.toLocaleString()} applications in {activeYear}</span>
        )}
        {availableYears.length > 1 && (
          <div className="kyp-seg ml-auto">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={activeYear === y ? 'on' : ''}
                aria-pressed={activeYear === y}
                data-testid={`button-hmda-buyer-year-${y}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clickable stat boxes as view switcher */}
      <div className="kyp-blocks">
        <button
          type="button"
          onClick={() => setView('all')}
          className="kyp-block ind text-left border-0 cursor-pointer"
          aria-pressed={view === 'all'}
          data-testid="button-hmda-buyer-view-all"
        >
          <div className="bv">{stats.total.toLocaleString()}</div>
          <div className="bl">All Applications</div>
        </button>
        <button
          type="button"
          onClick={() => setView('closed')}
          className="kyp-block grn text-left border-0 cursor-pointer"
          aria-pressed={view === 'closed'}
          data-testid="button-hmda-buyer-view-closed"
        >
          <div className="bv">{closedCount.toLocaleString()}</div>
          <div className="bl">Originated · {closedPct}%</div>
        </button>
        <button
          type="button"
          onClick={() => setView('denied')}
          className="kyp-block slate text-left border-0 cursor-pointer"
          aria-pressed={view === 'denied'}
          data-testid="button-hmda-buyer-view-denied"
        >
          <div className="bv">{deniedCount.toLocaleString()}</div>
          <div className="bl">Denied · {deniedPct}%</div>
        </button>
      </div>

      {/* Demographics panel */}
      {view === 'all' && <DemographicsPanel sub={allSubStats} year={activeYear} />}
      {view === 'closed' && stats.originated && (
        <DemographicsPanel sub={stats.originated} year={activeYear} />
      )}
      {view === 'closed' && !stats.originated && (
        <p className="text-sm text-muted-foreground py-2">Breakdown not available.</p>
      )}
      {view === 'denied' && stats.denied && (
        <DemographicsPanel sub={stats.denied} colorPrefix="red" year={activeYear} />
      )}
      {view === 'denied' && !stats.denied && (
        <p className="text-sm text-muted-foreground py-2">Breakdown not available.</p>
      )}

      {/* Lender table */}
      {(stats.byLender?.length ?? 0) > 0 && (
        <div className="kyp-mixcard">
          <div className="mh">
            Active Lenders · {view === 'closed' ? 'ranked by loans originated' : view === 'denied' ? 'ranked by applications denied' : 'top by application volume'}
          </div>
          <LenderTable lenders={stats.byLender} view={view === 'denied' ? 'denied' : view === 'closed' ? 'closed' : 'all'} />
        </div>
      )}
    </div>
  );
}

export function HMDAFinancingStats({ hmdaData, communityArea, tractGeoid, isLoading }: HMDAFinancingProps) {
  // Same react-query cache entry the valuation calculator uses — one source, no second fetch.
  const { data: todayRate } = useMortgageRate();
  const [scope, setScope] = useState<'community' | 'tract'>('community');
  const [year, setYear] = useState<HmdaYear>(2025);
  const [view, setView] = useState<BuyerView>('all');

  if (isLoading) {
    return (
      <div className="space-y-2 pl-6 pt-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    );
  }

  const availableYears = availableHmdaYears(hmdaData);
  const activeYear = availableYears.includes(year) ? year : availableYears[0] ?? year;
  const yearData = hmdaData?.[activeYear];
  const tractStats = yearData?.tract ?? null;
  const communityStats = yearData?.community ?? null;
  const hasCommunity = !!communityStats;
  const hasTract = !!tractStats;

  if (!hasCommunity && !hasTract && !isLoading && hmdaData !== undefined) {
    return (
      <p className="text-sm text-muted-foreground pl-6 py-2">
        No HMDA mortgage data available for this location.
      </p>
    );
  }

  if (!hmdaData && !isLoading) return null;

  const activeScope = scope === 'community'
    ? (communityStats ? 'community' : 'tract')
    : (tractStats ? 'tract' : 'community');
  const activeStats = activeScope === 'community' ? communityStats : tractStats;
  const closed = activeStats?.byAction.find(a => a.key === '1');
  const denied = activeStats?.byAction.find(a => a.key === '3');
  const rateSummary = getHmdaYearRateForScope(hmdaData?.rates, activeScope, activeYear);
  const validRate = typeof rateSummary?.avgFirstLienRate === 'number'
    && Number.isFinite(rateSummary.avgFirstLienRate)
    && rateSummary.avgFirstLienRate > 0
    && rateSummary.firstLienRateCount > 0;
  return (
        <div className="kyp-hmda-financing pb-2">
          {/* Scope + year controls */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            {hasCommunity && hasTract && (
              <div className="kyp-seg">
                <button
                  onClick={() => setScope('community')}
                  className={scope === 'community' ? 'on' : ''}
                  aria-pressed={scope === 'community'}
                  data-testid="button-hmda-scope-community"
                >
                  {communityArea || 'Community Area'}
                </button>
                <button
                  onClick={() => setScope('tract')}
                  className={scope === 'tract' ? 'on' : ''}
                  aria-pressed={scope === 'tract'}
                  data-testid="button-hmda-scope-tract"
                >
                  Census Tract {tractGeoid?.slice(-6)}
                </button>
              </div>
            )}
            {availableYears.length > 1 && (
              <div className="kyp-seg ml-auto">
                {availableYears.map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    className={activeYear === y ? 'on' : ''}
                    aria-pressed={activeYear === y}
                    data-testid={`button-hmda-year-${y}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeStats && (
            <div className="kyp-hmda-hero">
              <div className="kyp-blocks hero two">
                <button type="button" onClick={() => setView('all')} className="kyp-block ind text-left border-0 cursor-pointer" aria-pressed={view === 'all'} data-testid="stat-hmda-total">
                  <div className="bv">{activeStats.total.toLocaleString()}</div>
                  <div className="bl">All applications</div>
                </button>
                <button type="button" onClick={() => setView('closed')} className="kyp-block grn text-left border-0 cursor-pointer" aria-pressed={view === 'closed'} data-testid="stat-hmda-originated">
                  <div className="bv">{(closed?.count ?? 0).toLocaleString()}</div>
                  <div className="bl">Originated · {closed?.pct ?? 0}%</div>
                </button>
              </div>
              <div className="kyp-blocks hero two">
                <button type="button" onClick={() => setView('denied')} className="kyp-block slate text-left border-0 cursor-pointer" aria-pressed={view === 'denied'} data-testid="stat-hmda-denied">
                  <div className="bv">{(denied?.count ?? 0).toLocaleString()}</div>
                  <div className="bl">Denied · {denied?.pct ?? 0}%</div>
                </button>
                <div className="kyp-block dark" data-testid="hmda-rate-summary">
                  <div className="bv">{validRate ? `${rateSummary!.avgFirstLienRate!.toFixed(2)}%` : '—'}</div>
                  <div className="bl">Avg rate, closed first-lien · {activeYear}</div>
                </div>
              </div>
            </div>
          )}

          {/* Community Rankings */}
          {(() => {
            const r2024 = hmdaData?.[2025]?.communityRank;
            const r2023 = hmdaData?.[2024]?.communityRank;
            if (!r2024 && !r2023) return null;
            const rankLabel = (rank: number | null, outOf: number) =>
              rank ? `#${rank} of ${outOf}` : '—';
            const trendIcon = (curr: number | null, prev: number | null) => {
              if (!curr || !prev) return null;
              if (curr < prev) return <span className="up ml-1">▲</span>;
              if (curr > prev) return <span className="dn ml-1">▼</span>;
              return null;
            };
            return (
              <div className="kyp-rankcard">
                <div className="rl">
                  City Ranking — {communityArea || 'Community Area'} vs. 77 Community Areas
                </div>
                <div className="kyp-rankgrid">
                  <span />
                  <span className="h">2025</span>
                  <span className="h">2024</span>

                  <span className="k">Applications</span>
                  <span className="v">
                    {rankLabel(r2024?.byTotal.rank ?? null, r2024?.byTotal.outOf ?? 77)}
                    {trendIcon(r2024?.byTotal.rank ?? null, r2023?.byTotal.rank ?? null)}
                  </span>
                  <span className="v prior">
                    {rankLabel(r2023?.byTotal.rank ?? null, r2023?.byTotal.outOf ?? 77)}
                  </span>

                  <span className="k">Closed Loans</span>
                  <span className="v">
                    {rankLabel(r2024?.byOriginated.rank ?? null, r2024?.byOriginated.outOf ?? 77)}
                    {trendIcon(r2024?.byOriginated.rank ?? null, r2023?.byOriginated.rank ?? null)}
                  </span>
                  <span className="v prior">
                    {rankLabel(r2023?.byOriginated.rank ?? null, r2023?.byOriginated.outOf ?? 77)}
                  </span>
                </div>
                <div className="kyp-rankfoot"><span className="up">▲</span> improved rank vs. prior year · <span className="dn">▼</span> declined</div>
              </div>
            );
          })()}

          {/* Avg Interest Rate Block */}
          {(() => {
            const r = getHmdaYearRateForScope(hmdaData?.rates, activeScope, activeYear);
            const locationLabel = activeScope === 'tract'
              ? `Census Tract ${tractGeoid?.slice(-6) || 'selected'}`
              : `Community Area ${communityArea || 'selected'}`;
            const yearLabel = `${activeYear}`;
            if (
              typeof r?.avgFirstLienRate !== 'number' ||
              !Number.isFinite(r.avgFirstLienRate) ||
              r.avgFirstLienRate <= 0 ||
              r.firstLienRateCount <= 0
            ) {
              return (
                <div className="kyp-ratecmp" data-testid="hmda-ratecard">
                  <div className="rh">Avg Interest Rate — {activeYear} Closed First-Lien Loans</div>
                  <div className="side">
                    <span className="lab">Selected scope · {locationLabel}</span>
                    <span className="v" data-testid={`stat-hmda-avg-rate-${activeYear}`}>Not available</span>
                    <span className="s" data-testid="hmda-rate-unavailable">
                      Year-specific first-lien rates are not available for {locationLabel} in {activeYear}. No other year or combined average is substituted.
                    </span>
                  </div>
                  <div className="fine">Includes conventional, FHA, and VA first-lien originations reported in HMDA. Excludes HELOCs and second mortgages.</div>
                </div>
              );
            }
            const areaRate = r.avgFirstLienRate;

            // Today's rate — same react-query cache entry the valuation calculator uses (Freddie Mac PMMS 30-yr
            // via FRED, percent units). Fail closed: no fresh benchmark → no comparison, fall back to simple card.
            const todayInfo = (() => {
              const rt = todayRate?.rate;
              if (typeof rt !== 'number' || !Number.isFinite(rt) || rt <= 0 || !todayRate?.date) return null;
              const asOf = new Date(todayRate.date + 'T00:00:00');
              if (isNaN(asOf.getTime()) || Date.now() - asOf.getTime() > 14 * 24 * 60 * 60 * 1000 || todayRate.stale) return null;
              return { rate: rt, asOfLabel: asOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
            })();

            if (!todayInfo) {
              return (
                <div className="kyp-ratecmp">
                  <div className="rh">
                    Avg Interest Rate — {activeYear} Closed First-Lien Loans
                  </div>
                  <div className="side">
                    <span className="v" data-testid={`stat-hmda-avg-rate-${activeYear}`}>{areaRate.toFixed(3)}%</span>
                    <span className="s">
                      avg rate across {r.firstLienRateCount.toLocaleString()} closed first-lien loans in {locationLabel}
                    </span>
                  </div>
                  <div className="fine">Includes conventional, FHA, and VA first-lien originations reported in HMDA. Excludes HELOCs and second mortgages.</div>
                </div>
              );
            }

            // All comparison logic computed in code — never model-generated.
            const MATERIAL_GAP_PT = 1.00; // caution appears only when today is ≥ 1 pt above area closings
            const diff = todayInfo.rate - areaRate;
            const isCaution = diff >= MATERIAL_GAP_PT;
            const inLine = Math.abs(diff) < 0.05;
            const higher = diff > 0;
            const signedDelta = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}`;
            const bps = Math.round(Math.abs(diff) * 100 / 5) * 5; // hedged, rounded to nearest 5 bps
            const explain = isCaution
              ? <><b>Financing has gotten meaningfully pricier.</b> Today's benchmark sits a full point-plus above what loans here closed at in {yearLabel} — a real "rates have moved" signal worth flagging.</>
              : Math.abs(diff) < 0.05
                ? <><b>Loans here closed right around today's market.</b> The {yearLabel} average (a full-year blend of conventional, FHA and VA first-lien loans) is roughly in line with the current 30-year benchmark — a buyer financing now would likely pay about what recent closings here did.</>
                : higher
                  ? <><b>Loans here closed just below today's market.</b> The {yearLabel} average (a full-year blend of conventional, FHA and VA first-lien loans) is about {bps} bps under the current 30-year benchmark — so a buyer financing now would likely pay a touch more than recent closings here.</>
                  : <><b>Loans here closed just above today's market.</b> The {yearLabel} average (a full-year blend of conventional, FHA and VA first-lien loans) is about {bps} bps over the current 30-year benchmark — so a buyer financing now would likely pay a bit less than recent closings here.</>;
            return (
              <div className="kyp-ratecmp" data-testid="hmda-ratecard">
                <div className="rh">
                  <svg className="inline-block h-4 w-4 mr-1 align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  Interest rates — this area vs. today
                </div>
                <div className="cmp">
                  <div className="side">
                    <span className="lab">This area · {yearLabel} closed</span>
                    <div className="v" data-testid={`stat-hmda-avg-rate-${activeYear}`}>{areaRate.toFixed(2)}%</div>
                    <div className="s">Avg across {r.firstLienRateCount.toLocaleString()} closed first-lien loans in {locationLabel}</div>
                  </div>
                  <div className="delta" data-testid="hmda-rate-delta">
                    <div className="amt">{signedDelta} pts</div>
                    <div className="lbl">{inLine ? <>in line<br/>today</> : <>{higher ? 'higher' : 'lower'}<br/>today</>}</div>
                  </div>
                  <div className="side today">
                    <span className="lab">Today · market benchmark</span>
                    <div className="v" data-testid="hmda-rate-today">{todayInfo.rate.toFixed(2)}%</div>
                    <div className="s">30-yr fixed · <b>Freddie Mac PMMS</b>, as of {todayInfo.asOfLabel}</div>
                  </div>
                </div>
                <div className="kyp-body">{explain}</div>
                <div className="fine">HMDA first-lien originations only · excludes HELOCs and second mortgages. Today's benchmark is a national 30-yr snapshot, not a local quote.</div>
              </div>
            );
          })()}

          {activeStats && <StatsPanel stats={activeStats} label={scope} view={view} />}
        </div>
  );
}
