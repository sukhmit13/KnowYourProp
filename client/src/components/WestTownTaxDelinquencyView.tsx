import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, ExternalLink, Landmark, Loader2, ReceiptText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type StatusFilter = 'all' | 'delinquent' | 'sold' | 'current' | 'unknown';

interface PilotSummary {
  geography: { name: string; communityAreaNumber: number; source: string };
  scanEnabled: boolean;
  universeSeededAt: string | null;
  lastScannerStartedAt: string | null;
  lastActivityAt: string | null;
  lastError: string | null;
  totalParcels: number;
  confirmedParcels: number;
  coveragePercent: number;
  pendingParcels: number;
  delinquentParcels: number;
  soldTaxParcels: number;
  currentParcels: number;
  unknownOrRetryingParcels: number;
  lastConfirmedAt: string | null;
}

interface PilotProperty {
  pin: string;
  address: string | null;
  zipCode: string | null;
  queueStatus: string;
  paymentStatus: 'current' | 'delinquent' | 'sold' | 'unknown' | null;
  amountDue: string | null;
  oldestUnpaidYear: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  statusSource: 'pilot_scan';
  treasurerBillUrl: string;
}

interface PropertyResponse {
  filter: StatusFilter;
  page: number;
  pageSize: number;
  total: number;
  properties: PilotProperty[];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrency(value: string | null) {
  if (value === null) return '—';
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
    : '—';
}

function formatDate(value: string | null) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Not available'
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(property: PilotProperty) {
  if (property.paymentStatus === 'delinquent') return 'Delinquent';
  if (property.paymentStatus === 'sold') return 'Sold tax';
  if (property.paymentStatus === 'current') return 'Current';
  return property.queueStatus === 'retry_wait' ? 'Unknown — retrying' : 'Unknown';
}

function statusClass(property: PilotProperty) {
  if (property.paymentStatus === 'delinquent') return 'border-red-200 bg-red-50 text-red-800';
  if (property.paymentStatus === 'sold') return 'border-orange-200 bg-orange-50 text-orange-800';
  if (property.paymentStatus === 'current') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function WestTownTaxDelinquencyView() {
  const { isSubscriber } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const summaryQuery = useQuery<PilotSummary>({
    queryKey: ['/api/discovery/west-town-tax-pilot'],
    queryFn: async () => {
      const response = await fetch('/api/discovery/west-town-tax-pilot', { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to load the West Town tax pilot.');
      return response.json();
    },
    enabled: isSubscriber,
    refetchInterval: 30_000,
  });

  const propertiesQuery = useQuery<PropertyResponse>({
    queryKey: ['/api/discovery/west-town-tax-pilot/properties', filter, page],
    queryFn: async () => {
      const response = await fetch(
        `/api/discovery/west-town-tax-pilot/properties?status=${filter}&page=${page}&pageSize=25`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error('Unable to load West Town tax records.');
      return response.json();
    },
    enabled: isSubscriber,
    refetchInterval: 30_000,
  });

  const summary = summaryQuery.data;
  const records = propertiesQuery.data;
  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / 25));
  const updateFilter = (nextFilter: StatusFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  if (summaryQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (summaryQuery.error || !summary) {
    return (
      <Card className="border border-border">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-semibold">West Town tax pilot unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-2xl">
                <ReceiptText className="h-6 w-6 text-[#2b3a9e]" />
                West Town Property-Tax Delinquency
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                A bounded pilot for official Chicago community area #{summary.geography.communityAreaNumber}. Results are verified against the Cook County Treasurer; unscanned and failed records are never treated as current.
              </p>
            </div>
            <Badge variant="outline" className={summary.scanEnabled
              ? 'w-fit border-blue-200 bg-blue-50 text-blue-800'
              : 'w-fit border-slate-200 bg-slate-50 text-slate-700'}
            >
              {summary.scanEnabled ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
              {summary.scanEnabled ? 'Scanner active' : 'Scanner paused'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Treasurer-confirmed coverage</span>
                <span className="font-jbmono text-xs text-muted-foreground">
                  {formatNumber(summary.confirmedParcels)} of {formatNumber(summary.totalParcels)} PINs · {summary.coveragePercent}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-[#2b3a9e] transition-all" style={{ width: `${Math.min(summary.coveragePercent, 100)}%` }} />
              </div>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              Last confirmed check: {formatDate(summary.lastConfirmedAt)}
            </p>
          </div>
          {!summary.scanEnabled && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              The worker is paused until an operator explicitly starts the CAPTCHA-backed Treasurer scan. The PIN universe can be prepared without running paid property checks.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border border-border">
          <CardContent className="pt-5">
            <p className="font-jbmono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Confirmed delinquent</p>
            <p className="mt-2 text-3xl font-semibold text-red-700">{formatNumber(summary.delinquentParcels)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-5">
            <p className="font-jbmono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sold taxes</p>
            <p className="mt-2 text-3xl font-semibold text-orange-700">{formatNumber(summary.soldTaxParcels)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-5">
            <p className="font-jbmono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Confirmed current</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{formatNumber(summary.currentParcels)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-5">
            <p className="font-jbmono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unknown / retrying</p>
            <p className="mt-2 text-3xl font-semibold text-slate-700">{formatNumber(summary.unknownOrRetryingParcels)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-5">
            <p className="font-jbmono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Not yet checked</p>
            <p className="mt-2 text-3xl font-semibold text-[#2b3a9e]">{formatNumber(summary.pendingParcels)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border">
        <CardHeader className="gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-jbmono text-sm font-bold uppercase tracking-[0.08em]">
              <Landmark className="h-4 w-4 text-[#2b3a9e]" />
              Treasurer-checked properties
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatNumber(records?.total ?? 0)} visible results. “Unknown” means the Treasurer check did not return enough bill detail; it is not a current-tax result.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['all', 'All'],
              ['delinquent', 'Delinquent'],
              ['sold', 'Sold tax'],
              ['current', 'Current'],
              ['unknown', 'Unknown'],
            ] as [StatusFilter, string][]).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                className={filter === value ? 'bg-[#2b3a9e] hover:bg-[#202a75]' : ''}
                onClick={() => updateFilter(value)}
                data-testid={`button-west-town-filter-${value}`}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {propertiesQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : propertiesQuery.error ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Unable to load the property list.</div>
          ) : records?.properties.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/40 font-jbmono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Property</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Amount due</th>
                      <th className="px-4 py-3 font-semibold">Oldest due year</th>
                      <th className="px-4 py-3 font-semibold">Last checked</th>
                       <th className="px-5 py-3 text-right font-semibold">Record source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.properties.map(property => (
                      <tr key={property.pin} className="hover:bg-muted/20">
                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">{property.address || 'Address not supplied by Assessor'}</p>
                          <p className="mt-0.5 font-jbmono text-xs text-muted-foreground">PIN {formatPin(property.pin)}{property.zipCode ? ` · ${property.zipCode}` : ''}</p>
                          {property.paymentStatus === 'unknown' && property.lastError && (
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{property.lastError}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="outline" className={statusClass(property)}>{statusLabel(property)}</Badge>
                        </td>
                        <td className="px-4 py-4 font-medium">{property.paymentStatus === 'unknown' ? '—' : formatCurrency(property.amountDue)}</td>
                        <td className="px-4 py-4">{property.oldestUnpaidYear ?? '—'}</td>
                        <td className="px-4 py-4 text-muted-foreground">{formatDate(property.lastCheckedAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Badge variant="outline" className="mb-2 border-slate-200 bg-slate-50 text-slate-700">
                            Pilot scan
                          </Badge>
                          <a
                            href={property.treasurerBillUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-[#2b3a9e] hover:underline"
                          >
                            Treasurer <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">Page {records.page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Next</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-5 py-14 text-center">
              <Landmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No {filter === 'all' ? 'Treasurer-checked' : filter} records yet</p>
              <p className="mt-1 text-sm text-muted-foreground">The property list grows only as Treasurer checks are completed.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-xs leading-5 text-muted-foreground">
        Source: Cook County Assessor parcel universe and Cook County Treasurer bill records. Tax-sale status is displayed separately from delinquency. This is public-record discovery data, not a claim about owner intent, creditworthiness, or investment suitability.
      </p>
    </div>
  );
}

function formatPin(pin: string) {
  return pin.length === 14
    ? `${pin.slice(0, 2)}-${pin.slice(2, 4)}-${pin.slice(4, 7)}-${pin.slice(7, 10)}-${pin.slice(10)}`
    : pin;
}