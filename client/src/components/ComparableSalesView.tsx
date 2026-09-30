import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Home,
  Calendar,
  MapPin,
  Bed,
  Bath,
  Square,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface Comparable {
  pin: string;
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number | null;
  beds: number | null;
  fullBaths: number | null;
  halfBaths: number | null;
  distanceMiles: number;
  pricePerSqft: number | null;
  similarityScore: number;
  propertyClass: string;
  buyerName: string | null;
}

interface MarketAnalysis {
  estimatedValue: number | null;
  medianSalePrice: number | null;
  medianPricePerSqft: number | null;
  priceRange: { low: number; high: number } | null;
  basedOnComps: number;
  confidence: 'High' | 'Medium' | 'Low' | 'None';
}

interface CompsData {
  comparables: Comparable[];
  marketAnalysis: MarketAnalysis;
  searchParams: { radiusMiles: number; monthsBack: number; propertyClass: string };
  totalCandidates: number;
  rawSalesCount: number;
  matchedCharacteristics: number;
  geocodedSalesCount: number;
  nearbySalesCount: number;
  error: string | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}

function daysAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mo ago' : `${months} mo ago`;
}

function saleMonth(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const CONFIDENCE_CLASS = {
  High: 'cmp-conf-high',
  Medium: 'cmp-conf-med',
  Low: 'cmp-conf-low',
  None: 'cmp-conf-none',
};

const CONFIDENCE_LABEL = {
  High: 'High Confidence',
  Medium: 'Medium Confidence',
  Low: 'Low Confidence',
  None: 'No Comps Found',
};

// Tier thresholds match the confidence model in server/comparableSales.ts:
// avg score >= 55 supports High confidence, >= 40 Medium — so per-comp
// green >= 55 (strong), amber 40–54 (usable), red < 40 (weak).
function matchTier(score: number): string {
  if (score >= 55) return 'cmp-match-g';
  if (score >= 40) return 'cmp-match-a';
  return 'cmp-match-r';
}

function CompCard({ comp, rank }: { comp: Comparable; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="cmp-card"
      data-testid={`card-comp-${rank}`}
      role="group"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`Comparable sale ${rank}: ${comp.address || `PIN ${comp.pin}`}. Press Enter or Space to ${expanded ? 'hide' : 'show'} details.`}
      onClick={() => {
        // Don't toggle when the click ends a text selection
        if (window.getSelection()?.toString()) return;
        setExpanded(!expanded);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        setExpanded((open) => !open);
      }}
    >
      <div className="cmp-crow">
        <span className="cmp-rk">#{rank}</span>
        <div className="cmp-bd">
          <div className="cmp-addr">
            {comp.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${comp.address}, Chicago, IL`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
                data-testid={`text-comp-address-${rank}`}
              >
                {comp.address}
              </a>
            ) : (
              <span data-testid={`text-comp-address-${rank}`}>PIN {comp.pin}</span>
            )}
          </div>
          <div className="cmp-meta">
            <span className="cmp-m">
              <MapPin className="w-3 h-3" />
              {comp.distanceMiles < 0.1 ? '< 0.1 mi' : `${comp.distanceMiles} mi`}
            </span>
            <span className="cmp-m">
              <Calendar className="w-3 h-3" />
              {saleMonth(comp.saleDate)} · {daysAgo(comp.saleDate)}
            </span>
          </div>
        </div>
        <div className="cmp-right">
          <div className="cmp-price" data-testid={`text-comp-price-${rank}`}>{fmt(comp.salePrice)}</div>
          {comp.pricePerSqft && <div className="cmp-ppsf">${comp.pricePerSqft}/sqft</div>}
        </div>
        <span
          className={`cmp-chev ${expanded ? 'cmp-chev-open' : ''}`}
          data-testid={`btn-comp-expand-${rank}`}
        >
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>

      <div className="cmp-cbot">
        <div className="cmp-specs">
          {comp.sqft && (
            <span className="cmp-sp">
              <Square className="w-3 h-3" />
              {comp.sqft.toLocaleString()} sqft
            </span>
          )}
          {comp.beds !== null && (
            <span className="cmp-sp">
              <Bed className="w-3 h-3" />
              {comp.beds} bd
            </span>
          )}
          {comp.fullBaths !== null && (
            <span className="cmp-sp">
              <Bath className="w-3 h-3" />
              {comp.fullBaths}{comp.halfBaths ? `.${comp.halfBaths > 0 ? '5' : '0'}` : ''} ba
            </span>
          )}
        </div>
        <div className={`cmp-match ${matchTier(comp.similarityScore)}`}>
          <span className="cmp-ml">Match</span>
          <span className="cmp-mt"><span style={{ width: `${Math.min(Math.max(comp.similarityScore, 0), 100)}%` }} /></span>
          <span className="cmp-mv">{comp.similarityScore}</span>
        </div>
      </div>

      {expanded && (
        <div className="cmp-detail" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span style={{ fontWeight: 600, color: '#141414' }}>Sale Price:</span> {fmtFull(comp.salePrice)}</div>
            {comp.pricePerSqft && <div><span style={{ fontWeight: 600, color: '#141414' }}>$/Sqft:</span> ${comp.pricePerSqft}</div>}
            {comp.sqft && <div><span style={{ fontWeight: 600, color: '#141414' }}>Size:</span> {comp.sqft.toLocaleString()} sqft</div>}
            <div><span style={{ fontWeight: 600, color: '#141414' }}>Class:</span> {comp.propertyClass}</div>
            <div><span style={{ fontWeight: 600, color: '#141414' }}>Distance:</span> {comp.distanceMiles} mi</div>
            <div><span style={{ fontWeight: 600, color: '#141414' }}>Sold:</span> {saleMonth(comp.saleDate)}</div>
            {comp.buyerName && <div className="col-span-2"><span style={{ fontWeight: 600, color: '#141414' }}>Buyer:</span> {comp.buyerName}</div>}
          </div>
          <a
            href={`https://www.cookcountyassessor.com/pin/${comp.pin.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline mt-2"
            style={{ color: '#2b3a9e', fontWeight: 500 }}
            data-testid={`link-comp-assessor-${rank}`}
          >
            View on Assessor <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

interface Props {
  compsData: CompsData | null | undefined;
  isLoading: boolean;
  subjectSqft?: number | null;
}

export function ComparableSalesView({ compsData, isLoading, subjectSqft }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (!compsData) return null;

  const { comparables, marketAnalysis, searchParams, totalCandidates } = compsData;
  const displayComps = showAll ? comparables : comparables.slice(0, 5);
  const suppressIndicatedValue = marketAnalysis.confidence === 'Low' || searchParams.radiusMiles > 1.5;

  return (
    <div className="kyp-comps-view space-y-3 pt-1">
      {/* Market Analysis Summary */}
      <div className="cmp-summary">
        <div className="cmp-stop">
          <span className={`cmp-conf ${CONFIDENCE_CLASS[marketAnalysis.confidence]}`}>
            ◎ {CONFIDENCE_LABEL[marketAnalysis.confidence]}
          </span>
          <span className="cmp-pill">
            {marketAnalysis.basedOnComps} comp{marketAnalysis.basedOnComps !== 1 ? 's' : ''}
          </span>
        </div>

        {(marketAnalysis.estimatedValue || marketAnalysis.medianSalePrice || marketAnalysis.medianPricePerSqft) && (
          <div className="cmp-stats">
            <div>
              {suppressIndicatedValue ? (
                <>
                  <div className="cmp-st-l">Indicated Value</div>
                  <div className="cmp-st-s">No value estimate — comps are {searchParams.radiusMiles} mi out, too far to support one.</div>
                </>
              ) : marketAnalysis.estimatedValue ? (
                <>
                  <div className="cmp-st-l">Indicated Value</div>
                  <div className="cmp-st-n" data-testid="text-comps-indicated-value">
                    {fmtFull(marketAnalysis.estimatedValue)}
                  </div>
                  <div className="cmp-st-s">median $/sqft × subject sqft</div>
                </>
              ) : (
                <>
                  <div className="cmp-st-l">Indicated Value</div>
                  <div className="cmp-st-s">Insufficient data for a value estimate — sqft data unavailable for comps.</div>
                </>
              )}
            </div>
            {marketAnalysis.medianSalePrice && (
              <div>
                <div className="cmp-st-l">Median Sale Price</div>
                <div className="cmp-st-n">{fmt(marketAnalysis.medianSalePrice)}</div>
              </div>
            )}
            {marketAnalysis.medianPricePerSqft && (
              <div>
                <div className="cmp-st-l">Median $/Sqft</div>
                <div className="cmp-st-n">${marketAnalysis.medianPricePerSqft}</div>
              </div>
            )}
          </div>
        )}
        {marketAnalysis.priceRange && (
          <div className="cmp-range">
            Range: {fmt(marketAnalysis.priceRange.low)} – {fmt(marketAnalysis.priceRange.high)}
            {' · '}{searchParams.radiusMiles} mi radius · last {searchParams.monthsBack} months · {totalCandidates} total nearby sales
          </div>
        )}
        {compsData.error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4" />
            {compsData.error}
          </div>
        ) : marketAnalysis.basedOnComps === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4" />
            {compsData.rawSalesCount === 0
              ? `No sales of class ${searchParams.propertyClass} were returned in the countywide recent-sales query for the last ${searchParams.monthsBack} months. This does not confirm that none occurred near this address.`
              : compsData.matchedCharacteristics === 0
                ? `${compsData.rawSalesCount} countywide class ${searchParams.propertyClass} sales were returned in the recent-sales sample, but the county characteristics file has no record for them. Their distance from this address cannot be confirmed; this affects commercial and recently-assessed parcels.`
                : compsData.geocodedSalesCount === 0
                  ? `${compsData.rawSalesCount} countywide candidate sales were returned; characteristics matched ${compsData.matchedCharacteristics}, but none had usable coordinates to establish proximity to this address.`
                  : `None of the ${compsData.geocodedSalesCount} geocoded sales among ${compsData.rawSalesCount} countywide class ${searchParams.propertyClass} candidates in the recent-sales sample fell within ${searchParams.radiusMiles} mi. Sales outside the sample or without usable characteristics cannot be ruled out.`}
          </div>
        )}
      </div>

      {/* Expanded radius notice */}
      {searchParams.radiusMiles > 0.75 && comparables.length > 0 && (
        <div className="cmp-note">
          <AlertTriangle className="w-3.5 h-3.5" />
          <div>
            No comps found within 0.75 mi — expanded search to <strong>{searchParams.radiusMiles} mi</strong> to find the nearest sales. These comps are further away and may be less representative.
          </div>
        </div>
      )}

      {/* Comp Cards */}
      {comparables.length > 0 && (
        <div className="space-y-2">
          {displayComps.map((comp, i) => (
            <CompCard key={comp.pin + comp.saleDate} comp={comp} rank={i + 1} />
          ))}
          {comparables.length > 5 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => setShowAll(!showAll)}
              data-testid="btn-comps-show-all"
            >
              {showAll ? 'Show Top 5' : `Show All ${comparables.length} Comps`}
            </Button>
          )}
        </div>
      )}

      <div className="kyp-src">Describes sales within {searchParams.radiusMiles} miles, not this address. Source: Cook County Assessor sales records; same property class required for matching. Informational only — not a certified appraisal.</div>

      {comparables.length === 0 && marketAnalysis.basedOnComps === 0 && !compsData.error && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <Home className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No comparable sales found within the search parameters.</p>
          <p className="text-xs mt-1">Try checking back — data refreshes as new sales are recorded.</p>
        </div>
      )}
    </div>
  );
}
