import { useState, useEffect, useRef } from 'react';
import { normalizeFirmName } from '@/lib/firmName';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Hammer,
  DollarSign,
  HardHat,
  Wrench,
  Home,
  Building2,
  Store,
  Factory,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  SectionHeader,
  FilterPill,
  CountPill,
  RankedRow,
  StatTiles,
  CertChip,
  formatValue,
  INDIGO,
  LINE,
  MUTED,
} from '@/components/ContractorRankingShared';

interface GCEntry {
  name: string;
  isOwnerGC: boolean;
  totalProjects: number;
  totalValue: number;
  newConstructionCount: number;
  renovationCount: number;
  singleFamilyCount: number;
  multiFamilyCount: number;
  mixedUseCommercialCount: number;
  industrialCount: number;
  lastPermitDate: string | null;
}

interface GCResponse {
  total: number;
  contractors: GCEntry[];
  sortBy: string;
  dataWindow: string;
  source: string;
}

type SortKey =
  | 'total_projects'
  | 'total_value'
  | 'new_construction'
  | 'renovation'
  | 'single_family'
  | 'multi_family'
  | 'mixed_use'
  | 'industrial';

const SORT_OPTIONS: { key: SortKey; label: string; icon: any; shortLabel: string }[] = [
  { key: 'total_projects', label: 'Total Projects', shortLabel: 'Total', icon: Hammer },
  { key: 'total_value', label: 'Total Value', shortLabel: 'Value', icon: DollarSign },
  { key: 'new_construction', label: 'New Construction', shortLabel: 'New Const.', icon: HardHat },
  { key: 'renovation', label: 'Renovation', shortLabel: 'Reno', icon: Wrench },
  { key: 'single_family', label: 'Single Family', shortLabel: 'SFR', icon: Home },
  { key: 'multi_family', label: 'Multi-Family', shortLabel: 'Multi-Fam', icon: Building2 },
  { key: 'mixed_use', label: 'Mixed-Use / Commercial', shortLabel: 'Commercial', icon: Store },
  { key: 'industrial', label: 'Industrial', shortLabel: 'Industrial', icon: Factory },
];

function getSortValue(entry: GCEntry, sortBy: SortKey): number {
  switch (sortBy) {
    case 'total_value': return entry.totalValue;
    case 'new_construction': return entry.newConstructionCount;
    case 'renovation': return entry.renovationCount;
    case 'single_family': return entry.singleFamilyCount;
    case 'multi_family': return entry.multiFamilyCount;
    case 'mixed_use': return entry.mixedUseCommercialCount;
    case 'industrial': return entry.industrialCount;
    default: return entry.totalProjects;
  }
}

function formatSortValue(entry: GCEntry, sortBy: SortKey): string {
  if (sortBy === 'total_value') return formatValue(entry.totalValue);
  return getSortValue(entry, sortBy).toLocaleString();
}

function GCRow({ entry, rank, sortBy, highlighted }: { entry: GCEntry; rank: number; sortBy: SortKey; highlighted?: boolean }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && rowRef.current) {
      const t = setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
      return () => clearTimeout(t);
    }
  }, [highlighted]);
  const option = SORT_OPTIONS.find(o => o.key === sortBy)!;
  const Icon = option.icon;

  const hasLastDate = entry.lastPermitDate && !isNaN(Date.parse(entry.lastPermitDate));
  const lastDateStr = hasLastDate
    ? new Date(entry.lastPermitDate!).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const displayName = entry.name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return (
    <div ref={rowRef} className={highlighted ? 'rounded-xl ring-2 ring-[#2b3a9e]/40' : undefined}>
    <RankedRow
      rank={rank}
      isFirst={rank === 1}
      testId={`card-gc-${rank}`}
      expandTestId={`btn-gc-expand-${rank}`}
      nameBlock={
        <>
          <span className="font-semibold text-sm" style={{ color: '#141414' }} data-testid={`text-gc-name-${rank}`}>
            {displayName}
          </span>
          {entry.isOwnerGC && <CertChip label="Owner-GC" />}
        </>
      }
      subLine={lastDateStr ? `Last permit: ${lastDateStr}` : undefined}
      pill={
        <CountPill icon={Icon} testId={`badge-gc-primary-${rank}`}>
          {formatSortValue(entry, sortBy)}
        </CountPill>
      }
      expandedContent={
        <div className="mt-3 space-y-3">
          <StatTiles
            tiles={[
              { label: 'Total Permits', value: entry.totalProjects.toLocaleString(), testId: `text-gc-total-${rank}` },
              { label: 'Reported Value', value: formatValue(entry.totalValue) },
              { label: 'New Construction', value: entry.newConstructionCount.toLocaleString() },
              { label: 'Renovation', value: entry.renovationCount.toLocaleString() },
            ]}
          />
          <StatTiles
            tiles={[
              { label: 'Single Family', value: entry.singleFamilyCount.toLocaleString() },
              { label: 'Multi-Family', value: entry.multiFamilyCount.toLocaleString() },
              { label: 'Commercial', value: entry.mixedUseCommercialCount.toLocaleString() },
              { label: 'Industrial', value: entry.industrialCount.toLocaleString() },
            ]}
          />
          <div className="flex justify-end">
            <a
              href="https://www.illinois.gov/services/service.building-contractor-license-lookup.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold hover:underline"
              style={{ color: INDIGO }}
              data-testid={`link-gc-license-${rank}`}
            >
              ↗ Verify IL License
            </a>
          </div>
        </div>
      }
    />
    </div>
  );
}

export function GeneralContractorRankingsView() {
  const [sortBy, setSortBy] = useState<SortKey>('total_projects');
  // Deep-link highlight: /discovery?view=gc-rankings&highlight=<firm name>
  const highlightNorm = (() => {
    try {
      const h = new URLSearchParams(window.location.search).get('highlight');
      return h ? normalizeFirmName(h) : null;
    } catch { return null; }
  })();

  const { data, isLoading, error } = useQuery<GCResponse>({
    queryKey: ['/api/discovery/general-contractors', sortBy],
    queryFn: async () => {
      const res = await fetch(`/api/discovery/general-contractors?sortBy=${sortBy}&limit=100`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch general contractor rankings');
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border" style={{ borderColor: LINE }}>
        <CardHeader className="pb-3 space-y-3">
          <SectionHeader
            icon={Hammer}
            title="Top Chicago General Contractors"
            subtitle="Ranked by permit activity — last 5 years (2020–present). Source: Chicago Building Permits."
          />
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map(opt => (
              <FilterPill
                key={opt.key}
                active={sortBy === opt.key}
                onClick={() => setSortBy(opt.key)}
                icon={opt.icon}
                testId={`btn-sort-gc-${opt.key}`}
              >
                {opt.shortLabel}
              </FilterPill>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 15 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: MUTED }} />
              <p style={{ color: MUTED }}>Failed to load contractor rankings. Please try again.</p>
            </div>
          ) : (
            <motion.div key={sortBy} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {data?.contractors.map((entry, i) => (
                <GCRow key={entry.name} entry={entry} rank={i + 1} sortBy={sortBy} highlighted={!!highlightNorm && normalizeFirmName(entry.name) === highlightNorm} />
              ))}
              {data && (
                <p className="text-xs text-center pt-2" style={{ color: MUTED }}>
                  Showing top {data.contractors.length} of {data.total.toLocaleString()} contractors · {data.dataWindow}
                </p>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
