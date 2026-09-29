import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { KypSubhead } from "@/components/report/AccordionSection";

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

function LenderBar({ name, count, totalAmount, max }: { name: string; count: number; totalAmount: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="kyp-hbar wide">
      <span className="hl" title={name}><i className="tick ind" />{name}</span>
      <span className="htrack"><i className="ind" style={{ width: `${pct}%` }}><span className="hbar-count">{count} loan{count !== 1 ? 's' : ''} · {fmt(totalAmount)}</span></i></span>
    </div>
  );
}

const SHOW_N = 4;

export function SBALoansView({ data, isLoading, zipCode, isError, onRetry }: SBALoansViewProps) {
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

  const { summary, loans7a = [], loans504 = [] } = data;

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

  return (
    <div className="pt-2" data-testid="sba-loans-view">
      <div className="kyp-body mb-2">SBA-guaranteed business &amp; commercial-real-estate loans in ZIP {zipCode} · FY2020–present</div>

      {/* KPI tiles */}
      <div className="kyp-cxtiles">
        <div className="kyp-cxtile"><div className="l">7(a) Loans</div><div className="n">{n7a}</div><div className="s">{amt7a} total</div></div>
        <div className="kyp-cxtile"><div className="l">504 · CRE</div><div className="n">{n504}</div><div className="s">{amt504} total</div></div>
        <div className="kyp-cxtile"><div className="l">Total Deployed</div><div className="n">{fmt(summary.totalAmount)}</div><div className="s">ZIP {zipCode}</div></div>
        <div className="kyp-cxtile"><div className="l">Active Lenders</div><div className="n">{nLenders}</div><div className="s">in this ZIP</div></div>
      </div>

      {/* SBA 504 */}
      {loans504.length > 0 && (
        <>
          <div id="sba504" className="flex items-center gap-2 my-2">
            <span className="ct">CRE Financing</span>
            <span className="kyp-pill ctx">{n504} loans · {amt504}</span>
          </div>
          <div className="kyp-loan-scope"><span>504 loan scope</span><b>504 loans fund owner-occupied commercial real estate. Read these rows as ZIP-level, not address-linked: the SBA FOIA 504 dataset discloses borrower entity, industry, loan amount, and CDC lender — not the financed property address. 7(a) records do carry a borrower street address.</b></div>

          <div>
            {shown504.map((loan: any, i: number) => {
              const mapsUrl = loan.borrowerName
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loan.borrowerName} ${loan.city || 'Chicago'} IL`)}`
                : null;
              return (
                <div key={i} className="kyp-loanrow">
                  <div className="lmain">
                    {mapsUrl ? (
                      <a className="lnm" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-504-maps-${i}`}>{niceName(loan.borrowerName)}</a>
                    ) : (
                      <div className="lnm">Undisclosed</div>
                    )}
                    {loan.naicsDescription && <div className="lmeta">{loan.naicsDescription}</div>}
                    {loan.lender && <div className="lvia">via {loan.lender}</div>}
                  </div>
                  <div className="lright">
                    <div className="lamt">{fmt(loan.amount)}</div>
                    <div className="ldate">{fmtDate(loan.approvalDate)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {by504Amount.length > SHOW_N && (
            <button type="button" className="kyp-morelink" onClick={() => setShowAll504(v => !v)} data-testid="more-504">
              {showAll504 ? '− show fewer 504 loans' : `+ ${by504Amount.length - SHOW_N} more 504 loans →`}
            </button>
          )}

          {top504.length > 0 && (
            <>
              <div className="kyp-charttitle">Top 504 lenders (CDCs)</div>
              <div>
                {top504.map((l: any, i: number) => <LenderBar key={i} {...l} max={top504Max} />)}
              </div>
            </>
          )}
        </>
      )}
      {loans504.length === 0 && (
        <p className="kyp-emptypanel">No SBA 504 loans found in ZIP {zipCode} (FY2020–present).</p>
      )}

      {/* SBA 7(a) */}
      <KypSubhead subsection={5}>
        <span className="lbl">Commercial Lending — SBA 7(a)</span>
        <span className="ct">small business</span>
      </KypSubhead>
      <p className="kyp-scopenote">Figures below describe <b>ZIP {zipCode}</b>, not this address</p>
      {loans7a.length > 0 && (
        <>
          <div id="sba7a" className="flex items-center gap-2 my-2">
            <span className="ct">Business Financing</span>
            <span className="kyp-pill ctx">{n7a} loans · {amt7a}</span>
          </div>
          <div className="kyp-body mt-2">Supports working capital, equipment, and expansion for small businesses. 7(a) records carry a borrower street address and jobs supported.</div>

          <div>
            {shown7a.map((loan: any, i: number) => {
              const query = loan.address
                ? `${loan.address} ${loan.city || 'Chicago'} IL`
                : `${loan.borrowerName} ${loan.city || 'Chicago'} IL`;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
              return (
                <div key={i} className="kyp-loanrow">
                  <div className="lmain">
                    <a className="lnm" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-7a-maps-${i}`}>{niceName(loan.borrowerName || 'Undisclosed')}</a>
                    {loan.address && <div className="lmeta">{loan.address}{loan.city ? `, ${loan.city}` : ''}</div>}
                    {loan.lender && <div className="lvia">via {loan.lender}</div>}
                  </div>
                  <div className="lright">
                    <div className="lamt">{fmt(loan.amount)}</div>
                    <div className="laux">
                      {loan.jobsSupported > 0 && <span className="ljobs">{loan.jobsSupported} job{loan.jobsSupported !== 1 ? 's' : ''}</span>}
                      <span className="ldate">{fmtDate(loan.approvalDate)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {by7aAmount.length > SHOW_N && (
            <button type="button" className="kyp-morelink" onClick={() => setShowAll7a(v => !v)} data-testid="more-7a">
              {showAll7a ? '− show fewer 7(a) loans' : `+ ${by7aAmount.length - SHOW_N} more 7(a) loans →`}
            </button>
          )}

          {top7a.length > 0 && (
            <>
              <div id="sba-lenders" className="kyp-charttitle">Top 7(a) lenders</div>
              <div>
                {top7a.map((l: any, i: number) => <LenderBar key={i} {...l} max={top7aMax} />)}
              </div>
            </>
          )}
        </>
      )}
      {loans7a.length === 0 && (
        <p className="kyp-emptypanel">No SBA 7(a) loans found in ZIP {zipCode} (FY2020–present).</p>
      )}

      <div className="kyp-src">Source: SBA FOIA 7(a) &amp; 504 loan data · FY2020–present · ZIP {zipCode}</div>
    </div>
  );
}
