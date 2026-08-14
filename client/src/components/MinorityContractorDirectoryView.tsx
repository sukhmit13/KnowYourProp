import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  HardHat,
  Wrench,
  DollarSign,
  SortAsc,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Search,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  SectionHeader,
  FilterPill,
  CountPill,
  RankedRow,
  StatTiles,
  CertChip,
  MonoLabel,
  PaperChip,
  formatValue,
  INDIGO,
  LINE,
  MUTED,
  INK2,
  PAPER,
  NEUTRAL_PILL,
} from '@/components/ContractorRankingShared';

interface ContractorEntry {
  name: string;
  certTypes: string[];
  ethnicity: string;
  capability: string;
  ward: string;
  communityArea: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  permitCount: number;
  permitValue: number;
  newConstructionCount: number;
  renovationCount: number;
  lastPermitDate: string | null;
}

interface DirectoryResponse {
  total: number;
  contractors: ContractorEntry[];
  sortBy: string;
  ethnicities: string[];
  dataWindow: string;
  source: string;
}

type SortKey = 'permit_count' | 'permit_value' | 'new_construction' | 'renovation' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string; icon: any }[] = [
  { key: 'permit_count', label: 'Permits', icon: HardHat },
  { key: 'permit_value', label: 'Value', icon: DollarSign },
  { key: 'new_construction', label: 'New Const.', icon: HardHat },
  { key: 'renovation', label: 'Renovation', icon: Wrench },
  { key: 'name', label: 'A–Z', icon: SortAsc },
];

function ContractorRow({ entry, rank }: { entry: ContractorEntry; rank: number }) {
  const hasPermits = entry.permitCount > 0;
  const hasLastDate = entry.lastPermitDate && !isNaN(Date.parse(entry.lastPermitDate));
  const lastDateStr = hasLastDate
    ? new Date(entry.lastPermitDate!).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const caps = entry.capability
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <RankedRow
      rank={rank}
      isFirst={rank === 1}
      testId={`card-minority-contractor-${rank}`}
      expandTestId={`btn-contractor-expand-${rank}`}
      nameBlock={
        <>
          <span className="font-semibold text-sm" style={{ color: '#141414' }} data-testid={`text-contractor-name-${rank}`}>
            {entry.name}
          </span>
          {entry.certTypes.map(ct => (
            <CertChip key={ct} label={ct} />
          ))}
          {entry.ethnicity && (
            <span className="text-xs" style={{ color: INK2 }}>{entry.ethnicity}</span>
          )}
        </>
      }
      subLine={hasPermits && lastDateStr ? `Last permit: ${lastDateStr}` : undefined}
      pill={
        hasPermits ? (
          <CountPill icon={HardHat} testId={`badge-contractor-permits-${rank}`}>
            {entry.permitCount} permits
          </CountPill>
        ) : (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs"
            style={{ background: NEUTRAL_PILL, color: MUTED }}
          >
            No permit history
          </span>
        )
      }
      expandedContent={
        <div className="mt-3 space-y-3">
          {hasPermits && (
            <StatTiles
              tiles={[
                { label: 'Total Permits', value: entry.permitCount.toLocaleString() },
                { label: 'Reported Value', value: formatValue(entry.permitValue) },
                { label: 'New Construction', value: entry.newConstructionCount.toLocaleString() },
                { label: 'Renovation', value: entry.renovationCount.toLocaleString() },
              ]}
            />
          )}

          {caps.length > 0 && (
            <div>
              <MonoLabel>Capabilities</MonoLabel>
              <div className="flex flex-wrap gap-1">
                {caps.map((cap, i) => (
                  <PaperChip key={i}>{cap}</PaperChip>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1 text-xs" style={{ color: INK2 }}>
            {(entry.address && entry.city) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0" style={{ color: INDIGO }} />
                <span>{entry.address}, {entry.city}, {entry.state} {entry.zip}</span>
              </div>
            )}
            {entry.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 shrink-0" style={{ color: INDIGO }} />
                <a href={`tel:${entry.phone}`} className="hover:underline">{entry.phone}</a>
              </div>
            )}
            {entry.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 shrink-0" style={{ color: INDIGO }} />
                <a href={`mailto:${entry.email}`} className="hover:underline truncate">{entry.email}</a>
              </div>
            )}
          </div>

          {(entry.ward && entry.ward !== 'N/A') && (
            <div className="flex gap-2 text-xs" style={{ color: MUTED }}>
              <span>Ward {entry.ward}</span>
              {entry.communityArea && entry.communityArea !== 'N/A' && (
                <span>· {entry.communityArea}</span>
              )}
            </div>
          )}

          {hasPermits && (
            <div className="flex justify-end">
              <a
                href={`https://data.cityofchicago.org/resource/ydr8-5enu.json?$where=contact_1_name=%27${encodeURIComponent(entry.name)}%27&$limit=10`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold hover:underline"
                style={{ color: INDIGO }}
                data-testid={`link-contractor-permits-${rank}`}
              >
                ↗ View permits
              </a>
            </div>
          )}
        </div>
      }
    />
  );
}

export function MinorityContractorDirectoryView() {
  const [sortBy, setSortBy] = useState<SortKey>('permit_count');
  const [certFilter, setCertFilter] = useState('');
  const [ethnicityFilter, setEthnicityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, error } = useQuery<DirectoryResponse>({
    queryKey: ['/api/discovery/minority-contractors', sortBy, certFilter, ethnicityFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ sortBy, limit: '100' });
      if (certFilter) params.set('certType', certFilter);
      if (ethnicityFilter) params.set('ethnicity', ethnicityFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/discovery/minority-contractors?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch minority contractor directory');
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });

  const handleSearch = () => setSearch(searchInput.trim());

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border" style={{ borderColor: LINE }}>
        <CardHeader className="pb-3 space-y-3">
          <SectionHeader
            icon={Users}
            title="Minority Contractor Directory"
            subtitle="City of Chicago certified MBE / WBE / VBE / BEPD contractors, cross-referenced with building-permit history (2020–present)."
          />

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: MUTED }} />
              <input
                placeholder="Search by name, capability, area…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full h-9 pl-9 pr-3 text-sm outline-none"
                style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 10, color: '#141414' }}
                data-testid="input-contractor-search"
              />
            </div>
            <button
              onClick={handleSearch}
              className="h-9 px-4 text-sm font-semibold rounded-[10px]"
              style={{ background: INDIGO, color: '#ffffff' }}
              data-testid="btn-contractor-search"
            >
              Search
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['', 'MBE', 'WBE', 'VBE', 'BEPD'] as const).map(ct => (
              <FilterPill
                key={ct}
                active={certFilter === ct}
                onClick={() => setCertFilter(ct)}
                testId={`btn-filter-cert-${ct || 'all'}`}
              >
                {ct || 'All Certs'}
              </FilterPill>
            ))}
          </div>

          {data?.ethnicities && data.ethnicities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={ethnicityFilter === ''}
                onClick={() => setEthnicityFilter('')}
                testId="btn-filter-ethnicity-all"
              >
                All Ethnicities
              </FilterPill>
              {data.ethnicities.map(eth => (
                <FilterPill
                  key={eth}
                  active={ethnicityFilter === eth}
                  onClick={() => setEthnicityFilter(eth)}
                  testId={`btn-filter-ethnicity-${eth.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {eth}
                </FilterPill>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map(opt => (
              <FilterPill
                key={opt.key}
                active={sortBy === opt.key}
                onClick={() => setSortBy(opt.key)}
                icon={opt.icon}
                testId={`btn-sort-contractor-${opt.key}`}
              >
                {opt.label}
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
              <p style={{ color: MUTED }}>Failed to load directory. Please try again.</p>
            </div>
          ) : (
            <motion.div key={`${sortBy}|${certFilter}|${ethnicityFilter}|${search}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {data?.contractors.map((entry, i) => (
                <ContractorRow key={entry.name} entry={entry} rank={i + 1} />
              ))}
              {data && (
                <p className="text-xs text-center pt-2" style={{ color: MUTED }}>
                  Showing {data.contractors.length} of {data.total.toLocaleString()} certified contractors · {data.dataWindow}
                </p>
              )}
              {data && (
                <p className="text-xs text-center pb-2" style={{ color: MUTED }}>
                  Source: {data.source}
                </p>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
