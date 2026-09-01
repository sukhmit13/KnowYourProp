import { useState, useEffect, useRef } from 'react';
import { normalizeFirmName } from '@/lib/firmName';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pencil,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface ArchitectEntry {
  name: string;
  citywideRank?: number;
  isSelfCert: boolean;
  hasSelfCert: boolean;
  totalProjects: number;
  totalValue: number;
  newConstructionCount: number;
  renovationCount: number;
  selfCertCount: number;
  singleFamilyCount: number;
  multiFamilyCount: number;
  mixedUseCommercialCount: number;
  industrialCount: number;
  lastPermitDate: string | null;
}

interface ArchitectResponse {
  total: number;
  architects: ArchitectEntry[];
  sortBy: string;
  dataWindow: string;
  source: string;
}

type SortKey =
  | 'total_projects'
  | 'total_value'
  | 'new_construction'
  | 'renovation'
  | 'self_cert'
  | 'single_family'
  | 'multi_family'
  | 'mixed_use'
  | 'industrial';

const SORT_OPTIONS: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: 'total_projects', label: 'Total Projects', shortLabel: 'Total' },
  { key: 'total_value', label: 'Total Value', shortLabel: '$ Value' },
  { key: 'new_construction', label: 'New Construction', shortLabel: 'New Const.' },
  { key: 'renovation', label: 'Renovation', shortLabel: 'Reno' },
  { key: 'self_cert', label: 'Self-Certified', shortLabel: 'Self-Cert' },
  { key: 'single_family', label: 'Single Family', shortLabel: 'SFR' },
  { key: 'multi_family', label: 'Multi-Family', shortLabel: 'Multi-Fam' },
  { key: 'mixed_use', label: 'Mixed-Use / Commercial', shortLabel: 'Commercial' },
  { key: 'industrial', label: 'Industrial', shortLabel: 'Industrial' },
];

// Fixed project-type mix order — do not reorder (orange and amber must never sit adjacent)
const MIX_COLORS = [
  { key: 'singleFamilyCount' as const, label: 'Single Family', color: '#3f51c5' },
  { key: 'multiFamilyCount' as const, label: 'Multi-Family', color: '#f4610a' },
  { key: 'mixedUseCommercialCount' as const, label: 'Commercial', color: '#7c4dcf' },
  { key: 'industrialCount' as const, label: 'Industrial', color: '#e0a615' },
];

const MIX_TAKEAWAY: Record<string, string> = {
  singleFamilyCount: 'Mostly single-family',
  multiFamilyCount: 'Mostly multi-family',
  mixedUseCommercialCount: 'Mostly commercial',
  industrialCount: 'Mostly industrial',
};

function formatValue(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function getSortValue(entry: ArchitectEntry, sortBy: SortKey): number {
  switch (sortBy) {
    case 'total_value': return entry.totalValue;
    case 'new_construction': return entry.newConstructionCount;
    case 'renovation': return entry.renovationCount;
    case 'self_cert': return entry.selfCertCount;
    case 'single_family': return entry.singleFamilyCount;
    case 'multi_family': return entry.multiFamilyCount;
    case 'mixed_use': return entry.mixedUseCommercialCount;
    case 'industrial': return entry.industrialCount;
    default: return entry.totalProjects;
  }
}

const SORT_UNIT: Record<SortKey, string> = {
  total_projects: 'projects',
  total_value: 'reported value',
  new_construction: 'new const.',
  renovation: 'renovations',
  self_cert: 'self-certified',
  single_family: 'single-family',
  multi_family: 'multi-family',
  mixed_use: 'commercial',
  industrial: 'industrial',
};

function ArchitectCard({ entry, rank, sortBy, highlighted }: { entry: ArchitectEntry; rank: number; sortBy: SortKey; highlighted?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && cardRef.current) {
      const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
      return () => clearTimeout(t);
    }
  }, [highlighted]);

  const hasLastDate = entry.lastPermitDate && !isNaN(Date.parse(entry.lastPermitDate));
  const lastDateStr = hasLastDate
    ? new Date(entry.lastPermitDate!).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const ildocsUrl = `https://www.idfpr.illinois.gov/LicenseLookUp/LicenseLookup.asp`;

  const mixTotal = MIX_COLORS.reduce((s, m) => s + entry[m.key], 0);
  const dominant = mixTotal > 0
    ? MIX_COLORS.reduce((best, m) => (entry[m.key] > entry[best.key] ? m : best), MIX_COLORS[0])
    : null;

  const displayName = entry.name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const tiles = [
    { label: 'Reported Value', value: formatValue(entry.totalValue) },
    { label: 'New Construction', value: entry.newConstructionCount.toLocaleString() },
    { label: 'Renovation', value: entry.renovationCount.toLocaleString() },
    { label: 'Self-Certified', value: entry.selfCertCount.toLocaleString() },
  ];

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border bg-white px-5 py-4 ${highlighted ? 'border-[#2b3a9e] ring-2 ring-[#2b3a9e]/25' : 'border-[#eae8e2]'}`}
      data-testid={`card-architect-${rank}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-jbmono text-sm font-bold text-[#2b3a9e] shrink-0">#{rank}</span>
        <span className="font-semibold text-[15px] text-[#141414]" data-testid={`text-architect-name-${rank}`}>
          {displayName}
        </span>
        {entry.hasSelfCert && (
          <span className="inline-flex items-center rounded-md bg-[#ecedf9] px-2 py-0.5 font-jbmono text-[10px] font-bold text-[#2b3a9e]">
            Self-Cert
          </span>
        )}
        {lastDateStr && (
          <span className="text-xs text-[#8b8a84]">Last permit {lastDateStr}</span>
        )}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="flex items-baseline gap-1.5" data-testid={`badge-architect-primary-${rank}`}>
            <span className="font-serif text-2xl leading-none text-[#141414]">
              {sortBy === 'total_value' ? formatValue(entry.totalValue) : getSortValue(entry, sortBy).toLocaleString()}
            </span>
            <span className="text-[11px] text-[#8b8a84]">{SORT_UNIT[sortBy]}</span>
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 text-xs font-semibold text-[#2b3a9e]"
            data-testid={`btn-architect-expand-${rank}`}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {tiles.map(t => (
              <div key={t.label} className="rounded-[9px] border border-[#eae8e2] bg-[#faf9f6] px-3.5 py-2.5">
                <div className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#8b8a84] mb-1">{t.label}</div>
                <div className="font-serif text-xl leading-none text-[#141414]">{t.value}</div>
              </div>
            ))}
          </div>

          {mixTotal > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#8b8a84]">Project-Type Mix</span>
                {dominant && (
                  <span className="text-xs font-bold text-[#2b3a9e]">{MIX_TAKEAWAY[dominant.key]}</span>
                )}
              </div>
              <div className="flex h-3.5 w-full overflow-hidden rounded-md gap-px">
                {MIX_COLORS.filter(m => entry[m.key] > 0).map(m => (
                  <div
                    key={m.key}
                    style={{
                      backgroundColor: m.color,
                      width: `${Math.max((entry[m.key] / mixTotal) * 100, 1.5)}%`,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {MIX_COLORS.map(m => (
                  <span key={m.key} className="flex items-center gap-1.5 text-xs text-[#565651]">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: m.color }} />
                    {m.label} <b className="text-[#141414]">{entry[m.key].toLocaleString()}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <a
              href={ildocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-[#2b3a9e]"
              data-testid={`link-architect-license-${rank}`}
            >
              <ArrowUpRight className="w-3 h-3" />
              Verify IL License
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArchitectRankingsView() {
  const [sortBy, setSortBy] = useState<SortKey>('total_projects');
  // Deep-link highlight: /discovery?view=architect-rankings&highlight=<firm name>
  const highlightNorm = (() => {
    try {
      const h = new URLSearchParams(window.location.search).get('highlight');
      return h ? normalizeFirmName(h) : null;
    } catch { return null; }
  })();

  const { data, isLoading, error } = useQuery<ArchitectResponse>({
    queryKey: ['/api/discovery/architects', sortBy, highlightNorm],
    queryFn: async () => {
      const params = new URLSearchParams({ sortBy, limit: '100' });
      if (highlightNorm) params.set('search', new URLSearchParams(window.location.search).get('highlight') || highlightNorm);
      const res = await fetch(`/api/discovery/architects?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch architect rankings');
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-[#2b3a9e]" />
          <h2 className="font-jbmono text-[12.5px] font-bold uppercase tracking-[0.06em] text-[#141414]">
            Top Chicago Architects
          </h2>
        </div>
        <p className="text-sm text-[#8b8a84] mt-1">
          Ranked by permit activity — last 5 years (2020–present). Source: Chicago Building Permits.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SORT_OPTIONS.map(opt => {
            const active = sortBy === opt.key;
            return (
              <button
                key={opt.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[#2b3a9e] bg-[#2b3a9e] text-white'
                    : 'border-[#eae8e2] bg-white text-[#565651] hover:border-[#d7dcf3]'
                }`}
                onClick={() => setSortBy(opt.key)}
                data-testid={`btn-sort-architect-${opt.key}`}
              >
                {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                {opt.shortLabel}
              </button>
            );
          })}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="text-muted-foreground">Failed to load architect rankings. Please try again.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
          {data?.architects.map((entry, i) => (
            <ArchitectCard key={entry.name} entry={entry} rank={entry.citywideRank ?? i + 1} sortBy={sortBy} highlighted={!!highlightNorm && normalizeFirmName(entry.name) === highlightNorm} />
          ))}
          {data && (
            <p className="text-xs text-[#8b8a84] text-center pt-2">
              Showing top {data.architects.length} of {data.total.toLocaleString()} architects · {data.dataWindow}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
