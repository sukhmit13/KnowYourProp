import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface SBALoansViewProps {
  data: any;
  isLoading: boolean;
  zipCode: string;
  isError?: boolean;
  onRetry?: () => void;
  /** true only when the subject parcel is positively known to be non-residentially zoned */
  subjectIsCommercial?: boolean;
  zoningCode?: string | null;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// Some SBA borrower names arrive with HTML entities (e.g. "Josephine&#39;s Market")
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch { return d; }
}

// Title-case an ALL-CAPS borrower name; leave mixed-case names untouched
function niceName(raw: string): string {
  const s = decodeEntities(raw);
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-\/("'.])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(Llc|Inc|Ltd|Pc|Sc|Nfp|Ii|Iii|Iv)\b\.?/g, m => m.toUpperCase());
}

const ChipArrow = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
);

function jump(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function LenderBar({ name, count, totalAmount, max }: { name: string; count: number; totalAmount: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="lb">
      <div className="lbtop"><span className="nm" title={name}>{name}</span><span className="val"><b>{count}</b> loan{count !== 1 ? 's' : ''} · {fmt(totalAmount)}</span></div>
      <div className="track"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

const SHOW_N = 4;

export function SBALoansView({ data, isLoading, zipCode, isError, onRetry, subjectIsCommercial, zoningCode }: SBALoansViewProps) {
  const [showAll504, setShowAll504] = useState(false);
  const [showAll7a, setShowAll7a] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pt-2 text-center py-8 text-muted-foreground text-sm" data-testid="sba-loans-error">
        Couldn't load SBA lending data right now.
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-2 underline text-[#2b3a9e]" data-testid="button-sba-loans-retry">
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pt-2 text-center py-8 text-muted-foreground text-sm">
        No SBA loan data available for ZIP {zipCode}.
      </div>
    );
  }

  const { summary, loans7a, loans504 } = data;
  if (summary.totalLoans === 0) {
    return (
      <div className="pt-2 text-center py-8 text-muted-foreground text-sm">
        No SBA loans found in ZIP {zipCode} (FY2020–present).
      </div>
    );
  }

  const n7a: number = summary.total7aLoans;
  const n504: number = summary.total504Loans;
  const amt7a = fmt(summary.total7aAmount);
  const amt504 = fmt(summary.total504Amount);
  const top7a: any[] = summary.top7aLenders ?? [];
  const top504: any[] = summary.top504Lenders ?? [];
  const nLenders = new Set([...top7a, ...top504].map((l: any) => l.name)).size;
  const top7aMax = top7a[0]?.count ?? 1;
  const top504Max = top504[0]?.count ?? 1;

  const by504Amount = [...loans504].sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
  const by7aAmount = [...loans7a].sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
  const shown504 = showAll504 ? by504Amount : by504Amount.slice(0, SHOW_N);
  const shown7a = showAll7a ? by7aAmount : by7aAmount.slice(0, SHOW_N);

  // ---- deterministic takeaway content (all figures computed here) ----
  const ex504Names = by504Amount.slice(0, 3).map((l: any) => niceName(l.borrowerName || '')).filter(Boolean);
  const ex7a = by7aAmount[0];
  const top2Share = n504 > 0 && top504.length >= 2 ? Math.round(((top504[0].count + top504[1].count) / n504) * 100) : null;

  return (
    <div className="sbawrap pt-2" data-testid="sba-loans-view">
      <div className="secsub">SBA-guaranteed business &amp; commercial-real-estate loans in ZIP {zipCode} · FY2020–present</div>

      {/* STANDARD TAKEAWAY */}
      <div className="take" data-testid="sba-takeaway">
        <div className="take-head">
          <span className="take-label">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .9 1.6l.1.7h6l.1-.7c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2z"/></svg>
            Takeaway
          </span>
        </div>
        <div className="take-title">
          {subjectIsCommercial
            ? 'The commercially relevant lending picture — and SBA 504 is the owner-occupier financing path for a parcel like this one.'
            : `How actively small businesses and owner-occupiers borrow in ZIP ${zipCode}.`}
        </div>

        {n504 > 0 && (
          <div className="take-row insight">
            <span className="dot" /><span className="body">
              {subjectIsCommercial ? (
                <><b>This is the commercial counterpart to the residential mortgage data.</b> SBA <b>504</b> loans fund owner-occupied commercial real estate — the exact profile of this {zoningCode ? `${zoningCode} ` : ''}parcel. <b>{n504} loans ({amt504})</b> closed across ZIP {zipCode} since FY2020{ex504Names.length > 0 ? <>, financing owner-occupants like {ex504Names.slice(0, 3).join(', ')}</> : null}. For a buyer planning to occupy, 504 is a real, actively-used path here.</>
              ) : (
                <><b>Owner-occupiers finance commercial buildings here.</b> SBA <b>504</b> loans fund owner-occupied commercial real estate: <b>{n504} loans ({amt504})</b> closed across ZIP {zipCode} since FY2020{ex504Names.length > 0 ? <>, including {ex504Names.slice(0, 3).join(', ')}</> : null} — neighborhood commercial context alongside the residential mortgage data.</>
              )}
            </span>
            <a className="take-chip" href="#sba504" onClick={jump('sba504')} data-testid="chip-sba504">504 loans <ChipArrow /></a>
          </div>
        )}

        {n7a > 0 && (
          <div className="take-row insight">
            <span className="dot" /><span className="body">
              <b>A busy small-business corridor.</b> On the <b>7(a)</b> side, <b>{n7a} loans ({amt7a})</b> funded working capital and expansion{ex7a ? <> — including {niceName(ex7a.borrowerName || '')}'s {fmt(ex7a.amount)}{ex7a.jobsSupported ? ` / ${ex7a.jobsSupported}-job` : ''} loan</> : null} — steady credit flow that signals an economically active area supporting local commercial demand.
            </span>
            <a className="take-chip" href="#sba7a" onClick={jump('sba7a')} data-testid="chip-sba7a">7(a) loans <ChipArrow /></a>
          </div>
        )}

        {(top504.length > 0 || top7a.length > 0) && (
          <div className="take-row insight">
            <span className="dot" /><span className="body">
              <b>Concrete lenders you can approach.</b>{' '}
              {top504.length >= 2 && top2Share !== null ? <>504 is concentrated in two CDCs — {top504[0].name} and {top504[1].name}, together ~{top2Share}% of local 504 loans{top7a.length > 0 ? '; ' : '. '}</> : null}
              {top7a.length > 0 ? <>7(a) is led by {top7a[0].name} ({top7a[0].count} loans). </> : null}
              Real names to start a financing conversation, not an abstract "market."
            </span>
            <a className="take-chip" href="#sba-lenders" onClick={jump('sba-lenders')} data-testid="chip-sba-lenders">Lenders <ChipArrow /></a>
          </div>
        )}

        <div className="take-row caution">
          <span className="dot" /><span className="body">
            <b>Read the 504 rows as ZIP-level, not address-linked.</b> The SBA FOIA 504 dataset discloses the borrower, industry, amount and CDC — but <b>not the financed property address</b> — so 504 activity is neighborhood context, not proof any specific building traded. (7(a) records do carry a borrower street address.)
          </span>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="kpis">
        <div className="kpi"><div className="n">{n7a}</div><div className="l">7(a) Loans</div><div className="s">{amt7a} total</div></div>
        <div className="kpi"><div className="n">{n504}</div><div className="l">504 · CRE</div><div className="s">{amt504} total</div></div>
        <div className="kpi"><div className="n">{fmt(summary.totalAmount)}</div><div className="l">Total Deployed</div><div className="s">ZIP {zipCode}</div></div>
        <div className="kpi"><div className="n">{nLenders}</div><div className="l">Active Lenders</div><div className="s">in this ZIP</div></div>
      </div>

      {/* SBA 504 */}
      {loans504.length > 0 && (
        <>
          <div id="sba504" className="ssh">
            <svg className="hic" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>
            <span className="t">SBA 504 — Commercial Real Estate</span><span className="tag">CRE Financing</span>
            <span className="chip">{n504} loans · {amt504}</span>
          </div>
          <div className="ssnote">Funds owner-occupied commercial real estate. The SBA FOIA 504 dataset discloses borrower entity, industry, loan amount, and CDC lender — <b>not</b> the financed property address.</div>

          <div className="loans">
            {shown504.map((loan: any, i: number) => {
              const mapsUrl = loan.borrowerName
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loan.borrowerName} ${loan.city || 'Chicago'} IL`)}`
                : null;
              return (
                <div key={i} className="loan">
                  <div className="main">
                    {mapsUrl ? (
                      <a className="nm block truncate" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-504-maps-${i}`}>{niceName(loan.borrowerName)}</a>
                    ) : (
                      <div className="nm truncate">Undisclosed</div>
                    )}
                    {loan.naicsDescription && <div className="meta truncate">{loan.naicsDescription}</div>}
                    {loan.lender && <div className="via">via {loan.lender}</div>}
                  </div>
                  <div className="right">
                    <div className="amt">{fmt(loan.amount)}</div>
                    <div className="date">{fmtDate(loan.approvalDate)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {by504Amount.length > SHOW_N && (
            <button type="button" className="morelink" onClick={() => setShowAll504(v => !v)} data-testid="more-504">
              {showAll504 ? '− show fewer 504 loans' : `+ ${by504Amount.length - SHOW_N} more 504 loans →`}
            </button>
          )}

          {top504.length > 0 && (
            <>
              <div className="lh">Top 504 lenders (CDCs)</div>
              <div className="lbars">
                {top504.map((l: any, i: number) => <LenderBar key={i} {...l} max={top504Max} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* SBA 7(a) */}
      {loans7a.length > 0 && (
        <>
          <div id="sba7a" className="ssh">
            <svg className="hic" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M4 21V8h16v13"/><path d="M9 21v-5h6v5"/><path d="M8 4h8l1 4H7z"/></svg>
            <span className="t">SBA 7(a) — Small Business</span><span className="tag">Business Financing</span>
            <span className="chip">{n7a} loans · {amt7a}</span>
          </div>
          <div className="ssnote">Supports working capital, equipment, and expansion for small businesses. 7(a) records carry a borrower street address and jobs supported.</div>

          <div className="loans">
            {shown7a.map((loan: any, i: number) => {
              const query = loan.address
                ? `${loan.address} ${loan.city || 'Chicago'} IL`
                : `${loan.borrowerName} ${loan.city || 'Chicago'} IL`;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
              return (
                <div key={i} className="loan">
                  <div className="main">
                    <a className="nm block truncate" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-7a-maps-${i}`}>{niceName(loan.borrowerName || 'Undisclosed')}</a>
                    {loan.address && <div className="meta truncate">{loan.address}{loan.city ? `, ${loan.city}` : ''}</div>}
                    {loan.lender && <div className="via">via {loan.lender}</div>}
                  </div>
                  <div className="right">
                    <div className="amt">{fmt(loan.amount)}</div>
                    <div className="aux">
                      {loan.jobsSupported > 0 && <span className="jobs">{loan.jobsSupported} job{loan.jobsSupported !== 1 ? 's' : ''}</span>}
                      <span className="date">{fmtDate(loan.approvalDate)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {by7aAmount.length > SHOW_N && (
            <button type="button" className="morelink" onClick={() => setShowAll7a(v => !v)} data-testid="more-7a">
              {showAll7a ? '− show fewer 7(a) loans' : `+ ${by7aAmount.length - SHOW_N} more 7(a) loans →`}
            </button>
          )}

          {top7a.length > 0 && (
            <>
              <div id="sba-lenders" className="lh">Top 7(a) lenders</div>
              <div className="lbars">
                {top7a.map((l: any, i: number) => <LenderBar key={i} {...l} max={top7aMax} />)}
              </div>
            </>
          )}
        </>
      )}

      <div className="src">Source: SBA FOIA 7(a) &amp; 504 loan data · FY2020–present · ZIP {zipCode}</div>
    </div>
  );
}
