import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Train, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StationRow {
  rank: number;
  stationId: string;
  name: string;
  total: number;
  weekdayTotal: number;
  weekendTotal: number;
  months: number;
}

interface YearBucket {
  total: StationRow[];
  weekday: StationRow[];
  weekend: StationRow[];
}

interface GrowthRow {
  stationId: string;
  name: string;
  totalFrom: number;
  totalTo: number;
  pctChange: number;
}

interface GrowthSlices {
  gains: GrowthRow[];
  declines: GrowthRow[];
}

interface GrowthPairResult {
  total: GrowthSlices;
  weekday: GrowthSlices;
  weekend: GrowthSlices;
  yearFrom: string;
  yearTo: string;
}

interface CTARankingsData {
  byYear: Record<string, YearBucket>;
  byGrowthPairs: Record<string, GrowthPairResult>;
  years: string[];
  growthPairKeys: string[];
}

type Slice = 'total' | 'weekday' | 'weekend';

function useCTARankings() {
  return useQuery<CTARankingsData>({
    queryKey: ['/api/cta-ridership/city-rankings'],
    queryFn: async () => {
      const res = await fetch('/api/cta-ridership/city-rankings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch CTA rankings');
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
  });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function isYtdYear(year: string): boolean {
  return year === '2025' || year === '2026';
}

function fmtWithMonth(n: number, months: number, year: string): string {
  const base = fmt(n);
  return isYtdYear(year) && months < 12 ? `${base} (${months}mo)` : base;
}

const SLICE_LABELS: Record<Slice, string> = { total: 'Total', weekday: 'Weekday', weekend: 'Weekend' };

function SliceToggle({ value, onChange }: { value: Slice; onChange: (s: Slice) => void }) {
  return (
    <div className="dsc-seg text-xs">
      {(['total', 'weekday', 'weekend'] as Slice[]).map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          data-testid={`toggle-${s}`}
          className={value === s ? 'active' : ''}
        >
          {SLICE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function EntryBar({ value, max }: { value: number; max: number; slice?: Slice }) {
  return (
    <div className="dsc-bar">
      <span style={{ width: `${Math.max((value / Math.max(max, 1)) * 100, 3)}%` }} />
    </div>
  );
}

function entryValue(row: StationRow, slice: Slice): number {
  return slice === 'weekday' ? row.weekdayTotal : slice === 'weekend' ? row.weekendTotal : row.total;
}

const GROWTH_PAIR_LABELS: Record<string, string> = {
  '2022-2023': '2022 → 2023',
  '2023-2024': '2023 → 2024',
  '2024-2025': '2024 → 2025',
};

export function CTARankingsView() {
  const { data, isLoading, error } = useCTARankings();
  const [selectedYear, setSelectedYear] = useState<string>('2025');
  const [entrySlice, setEntrySlice] = useState<Slice>('total');
  const [growthSlice, setGrowthSlice] = useState<Slice>('total');
  const [growthPairKey, setGrowthPairKey] = useState<string>('2024-2025');

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-muted-foreground mt-4">Unable to load CTA rankings.</p>;
  }

  // Entries tab
  const yearBucket = data.byYear[selectedYear];
  const list = yearBucket?.[entrySlice] ?? [];
  const maxVal = entryValue(list[0] ?? { total: 1, weekdayTotal: 1, weekendTotal: 1 } as StationRow, entrySlice) || 1;

  // Growth tab — use selected pair, fall back to most recent available
  const availablePairKeys = data.growthPairKeys ?? Object.keys(data.byGrowthPairs ?? {});
  const activePairKey = availablePairKeys.includes(growthPairKey)
    ? growthPairKey
    : availablePairKeys[availablePairKeys.length - 1] ?? '';
  const growthPair = data.byGrowthPairs?.[activePairKey];
  const growthBucket = growthPair?.[growthSlice];
  const gains = growthBucket?.gains ?? [];
  const declines = growthBucket?.declines ?? [];
  const maxGain = gains[0]?.pctChange || 1;
  const maxDecline = Math.abs(declines[0]?.pctChange || 1);
  const pairLabel = GROWTH_PAIR_LABELS[activePairKey] ?? activePairKey.replace('-', ' → ');
  const yearFrom = growthPair?.yearFrom ?? '';
  const yearTo = growthPair?.yearTo ?? '';

  return (
    <div className="space-y-6 mt-4">
      <Tabs defaultValue="by-entries">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="by-entries" className="data-[state=active]:bg-[#2b3a9e] data-[state=active]:text-white" data-testid="tab-by-entries">
            <Train className="w-3.5 h-3.5 mr-1.5" />
            Most Entries Per Year
          </TabsTrigger>
          <TabsTrigger value="by-growth" className="data-[state=active]:bg-[#2b3a9e] data-[state=active]:text-white" data-testid="tab-by-growth">
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
            Ridership Growth
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Entries ── */}
        <TabsContent value="by-entries" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SliceToggle value={entrySlice} onChange={setEntrySlice} />
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025 YTD</SelectItem>
                <SelectItem value="2026">2026 YTD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {list.length} CTA rail stations ranked by <strong>{SLICE_LABELS[entrySlice].toLowerCase()}</strong> entries
            {entrySlice !== 'total' && ' (rankings shift vs. total)'}
          </p>

          <div className="space-y-2.5">
            {list.map((station) => {
              const val = entryValue(station, entrySlice);
              return (
                <div key={station.stationId} className="dsc-row" data-testid={`row-cta-entries-${station.stationId}`}>
                  <span className="dsc-rk">{station.rank}</span>
                  <div className="dsc-bd">
                    <div className="dsc-nm truncate">{station.name}</div>
                    {entrySlice === 'total' && (
                      <div className="dsc-sub">{fmt(station.weekdayTotal)} wkday · {fmt(station.weekendTotal)} wkend</div>
                    )}
                    <EntryBar value={val} max={maxVal} slice={entrySlice} />
                  </div>
                  <span className="dsc-val">{fmtWithMonth(val, station.months, selectedYear)}</span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Source: CTA Ridership — weekday/weekend totals computed from average daily counts × actual calendar days.
            {isYtdYear(selectedYear) && ` ${selectedYear} figures are year-to-date.`}
          </p>
        </TabsContent>

        {/* ── TAB 2: Growth (selectable year pair) ── */}
        <TabsContent value="by-growth" className="space-y-5 pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SliceToggle value={growthSlice} onChange={setGrowthSlice} />
            <Select value={activePairKey} onValueChange={setGrowthPairKey}>
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-growth-pair">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePairKeys.map(k => (
                  <SelectItem key={k} value={k}>
                    {GROWTH_PAIR_LABELS[k] ?? k.replace('-', ' → ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Year-over-year % change — full-year {yearFrom} vs {yearTo}
          </p>

          {/* Gains */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-foreground flex-shrink-0" />
              <span className="text-sm font-semibold">Biggest Increases — {gains.length} stations</span>
            </div>
            {gains.map((s, i) => (
              <div key={s.stationId} className="dsc-row" data-testid={`row-cta-growth-${s.stationId}`}>
                <span className="dsc-rk">{i + 1}</span>
                <div className="dsc-bd">
                  <div className="dsc-nm truncate">{s.name}</div>
                  <div className="dsc-sub">{fmt(s.totalFrom)} → {fmt(s.totalTo)}</div>
                  <div className="dsc-bar"><span style={{ width: `${Math.min(Math.max((s.pctChange / Math.max(maxGain, 1)) * 100, 3), 100)}%` }} /></div>
                </div>
                <span className="dsc-val">+{s.pctChange.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* Declines */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-semibold">Biggest Declines — {declines.length} stations</span>
            </div>
            {declines.map((s, i) => (
              <div key={s.stationId} className="dsc-row" data-testid={`row-cta-decline-${s.stationId}`}>
                <span className="dsc-rk">{i + 1}</span>
                <div className="dsc-bd">
                  <div className="dsc-nm truncate">{s.name}</div>
                  <div className="dsc-sub">{fmt(s.totalFrom)} → {fmt(s.totalTo)}</div>
                  <div className="dsc-bar"><span style={{ opacity: .45, width: `${Math.min(Math.max((Math.abs(s.pctChange) / Math.max(maxDecline, 1)) * 100, 3), 100)}%` }} /></div>
                </div>
                <span className="dsc-val">{s.pctChange.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Source: CTA Ridership — full-year {yearFrom} vs {yearTo}, stations with ≥10 months of data in both years.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
