import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Home, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AreaRankEntry {
  rank: number;
  area: string;
  apps2025: number;
  apps2024: number;
  appsCombined: number;
  closed2025: number;
  closed2024: number;
  closedCombined: number;
}

interface GroupData {
  key: string;
  label: string;
  byApplications: AreaRankEntry[];
  byOriginated: AreaRankEntry[];
}

interface EthnicTrendsResponse {
  groups: GroupData[];
}

const GROUP_COLORS: Record<string, string> = {
  'Asian': 'bg-violet-100 text-violet-700 border-violet-200',
  'Black or African American': 'bg-amber-100 text-amber-700 border-amber-200',
  'White': 'bg-sky-100 text-sky-700 border-sky-200',
  'Hispanic or Latino': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'American Indian or Alaska Native': 'bg-orange-100 text-orange-700 border-orange-200',
  'Native Hawaiian or Other Pacific Islander': 'bg-teal-100 text-teal-700 border-teal-200',
  '2 or more minority races': 'bg-rose-100 text-rose-700 border-rose-200',
};

const GROUP_ACCENT: Record<string, string> = {
  'Asian': 'text-violet-600',
  'Black or African American': 'text-amber-600',
  'White': 'text-sky-600',
  'Hispanic or Latino': 'text-emerald-600',
  'American Indian or Alaska Native': 'text-orange-600',
  'Native Hawaiian or Other Pacific Islander': 'text-teal-600',
  '2 or more minority races': 'text-rose-600',
};

const GROUP_BAR: Record<string, string> = {
  'Asian': 'bg-violet-400',
  'Black or African American': 'bg-amber-400',
  'White': 'bg-sky-400',
  'Hispanic or Latino': 'bg-emerald-400',
  'American Indian or Alaska Native': 'bg-orange-400',
  'Native Hawaiian or Other Pacific Islander': 'bg-teal-400',
  '2 or more minority races': 'bg-rose-400',
};

const SHORT_LABELS: Record<string, string> = {
  'Asian': 'Asian',
  'Black or African American': 'Black / African American',
  'White': 'White',
  'Hispanic or Latino': 'Hispanic / Latino',
  'American Indian or Alaska Native': 'Am. Indian / Alaska Native',
  'Native Hawaiian or Other Pacific Islander': 'Native Hawaiian / Pacific Isl.',
  '2 or more minority races': '2+ Minority Races',
};

function RankedList({ entries, valueKey, label, groupKey, maxVal }: {
  entries: AreaRankEntry[];
  valueKey: 'appsCombined' | 'closedCombined';
  label: string;
  groupKey: string;
  maxVal: number;
}) {
  const barColor = GROUP_BAR[groupKey] || 'bg-indigo-400';
  const accentColor = GROUP_ACCENT[groupKey] || 'text-foreground';
  const is2024Key = valueKey === 'appsCombined' ? 'apps2025' : 'closed2025';
  const is2023Key = valueKey === 'appsCombined' ? 'apps2024' : 'closed2024';

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        {valueKey === 'appsCombined'
          ? <Users className={`w-3.5 h-3.5 ${accentColor}`} />
          : <Home className={`w-3.5 h-3.5 ${accentColor}`} />
        }
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-display">{label}</span>
      </div>
      <div className="space-y-2">
        {entries.map(entry => {
          const val = entry[valueKey];
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={entry.area} className="group" data-testid={`ethnic-trend-row-${entry.rank}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[11px] font-bold w-5 text-right shrink-0 ${accentColor}`}>
                  {entry.rank}
                </span>
                <span className="text-xs font-medium text-foreground truncate flex-1">{entry.area}</span>
                <span className={`text-xs font-semibold ${accentColor} shrink-0`}>{val.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} opacity-70`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {entry[is2024Key]}↗ / {entry[is2023Key]}↗
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EthnicMortgageTrends() {
  const [activeGroup, setActiveGroup] = useState('Asian');

  const { data, isLoading } = useQuery<EthnicTrendsResponse>({
    queryKey: ['/api/ethnic-mortgage-trends'],
  });

  const groups = data?.groups ?? [];
  const current = groups.find(g => g.key === activeGroup) ?? groups[0];

  const maxApps = current ? Math.max(...current.byApplications.map(e => e.appsCombined), 1) : 1;
  const maxClosed = current ? Math.max(...current.byOriginated.map(e => e.closedCombined), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold font-display">Ethnic Mortgage Trends</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Which community areas each group applied and closed loans in most — combined 2024 + 2025 HMDA data
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          HMDA 2024–2025
        </Badge>
      </div>

      {/* Group selector */}
      <div className="flex flex-wrap gap-2" data-testid="ethnic-group-selector">
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)
          : groups.map(g => (
            <button
              key={g.key}
              onClick={() => setActiveGroup(g.key)}
              data-testid={`button-group-${g.key.replace(/\s+/g, '-').toLowerCase()}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                activeGroup === g.key
                  ? GROUP_COLORS[g.key] || 'bg-secondary text-foreground border-border'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {SHORT_LABELS[g.key] ?? g.label}
            </button>
          ))
        }
      </div>

      {/* Ranked lists */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 10 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : current ? (
        <div>
          <div className="text-[11px] text-muted-foreground mb-4">
            Numbers shown as <span className="font-medium">combined (2025↗ / 2024↗)</span> counts per community area
          </div>
          <div className="flex gap-8">
            <RankedList
              entries={current.byApplications}
              valueKey="appsCombined"
              label="Most Applications"
              groupKey={current.key}
              maxVal={maxApps}
            />
            <div className="w-px bg-border shrink-0" />
            <RankedList
              entries={current.byOriginated}
              valueKey="closedCombined"
              label="Most Closed Loans"
              groupKey={current.key}
              maxVal={maxClosed}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No data available.</p>
      )}

      <p className="text-[10px] text-muted-foreground">
        Source: FFIEC HMDA Cook County data, 2024 &amp; 2025. Race groups from HMDA disclosure fields; Hispanic / Latino from ethnicity field. Excludes applicants who did not disclose race/ethnicity.
      </p>
    </div>
  );
}
