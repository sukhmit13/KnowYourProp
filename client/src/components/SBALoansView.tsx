import { useEffect, useState, useContext } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { KypSubhead } from "@/components/report/AccordionSection";
import { SectionNumberContext } from "@/components/report/AccordionSection";

interface SBALoansViewProps {
  data: any;
  isLoading: boolean;
  zipCode: string;
  isError?: boolean;
  onRetry?: () => void;
  /** true only when the subject parcel is positively known to be non-residentially zoned */
  subjectIsCommercial?: boolean;
  zoningCode?: string | null;
  hideKpis?: boolean;
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

const SHOW_N = 10;

export function SBAKpiStrip({ data, isLoading, zipCode }: Pick<SBALoansViewProps, 'data' | 'isLoading' | 'zipCode'>) {
  if (isLoading) return <div className="kyp-cxtiles opens" aria-label="Loading SBA lending summary">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  if (!data?.summary) return null;
  const { summary, loans7a = [], loans504 = [] } = data;
  const nLenders = new Set([...(summary.top7aLenders ?? []), ...(summary.top504Lenders ?? [])].map((l: any) => l.name)).size;
  return <div className="kyp-cxtiles opens">
    <div className="kyp-cxtile"><div className="l">7(a) Loans</div><div className="n">{summary.total7aLoans}</div><div className="s">{fmt(summary.total7aAmount)} total</div></div>
    <div className="kyp-cxtile"><div className="l">504 · CRE</div><div className="n">{summary.total504Loans}</div><div className="s">{fmt(summary.total504Amount)} total</div></div>
    <div className="kyp-cxtile"><div className="l">Total Deployed</div><div className="n">{fmt(summary.totalAmount)}</div><div className="s">ZIP {zipCode}</div></div>
    <div className="kyp-cxtile"><div className="l">Active Lenders</div><div className="n">{nLenders || new Set([...loans7a, ...loans504].map((l: any) => l.lender).filter(Boolean)).size}</div><div className="s">in this ZIP</div></div>
  </div>;
}

export function SBALoansView({ data, isLoading, zipCode, isError, onRetry, hideKpis = false }: SBALoansViewProps) {
  const [visible504, setVisible504] = useState(SHOW_N);
  const [visible7a, setVisible7a] = useState(SHOW_N);
  const [visible504Lenders, setVisible504Lenders] = useState(SHOW_N);
  const [visible7aLenders, setVisible7aLenders] = useState(SHOW_N);
  useEffect(() => {
    setVisible504(SHOW_N);
    setVisible7a(SHOW_N);
    setVisible504Lenders(SHOW_N);
    setVisible7aLenders(SHOW_N);
  }, [zipCode]);

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

  const top7a: any[] = summary.top7aLenders ?? [];
  const top504: any[] = summary.top504Lenders ?? [];
  const top7aMax = top7a[0]?.count ?? 1;
  const top504Max = top504[0]?.count ?? 1;

  const by504Amount = [...loans504].sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
  const by7aAmount = [...loans7a].sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
  return (
    <div className="kyp-sba-view pt-2" data-testid="sba-loans-view">
      {!hideKpis && <SBAKpiStrip data={data} isLoading={false} zipCode={zipCode} />}

      {/* SBA 504 */}
      {loans504.length > 0 && (
        <>
          <div>
            {by504Amount.map((loan: any, i: number) => {
              const mapsUrl = loan.borrowerName
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loan.borrowerName} ${loan.city || 'Chicago'} IL`)}`
                : null;
              return (
                <div key={i} className={`kyp-loanrow${i >= visible504 ? ' loan-overflow' : ''}`}>
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
          {visible504 < by504Amount.length && (
            <button type="button" className="kyp-morelink market-showmore" onClick={() => setVisible504(n => n + SHOW_N)} data-testid="more-504">
              + Show {Math.min(SHOW_N, by504Amount.length - visible504)} more 504 loans →
            </button>
          )}

          {top504.length > 0 && (
            <>
              <div className="kyp-charttitle">504 lenders (CDCs) · ranked by loans closed</div>
              <div>
                {top504.slice(0, visible504Lenders).map((l: any, i: number) => <LenderBar key={i} {...l} max={top504Max} />)}
                <div className="hidden print:block">{top504.slice(visible504Lenders).map((l: any, i: number) => <LenderBar key={i} {...l} max={top504Max} />)}</div>
              </div>
              {visible504Lenders < top504.length && <button type="button" className="kyp-morelink market-showmore" data-testid="more-504-lenders" onClick={() => setVisible504Lenders(n => n + SHOW_N)}>+ Show {Math.min(SHOW_N, top504.length - visible504Lenders)} more 504 lenders →</button>}
            </>
          )}
        </>
      )}
      {loans504.length === 0 && (
        <p className="kyp-emptypanel">No SBA 504 loans found in ZIP {zipCode} (FY2020–present).</p>
      )}

      {/* SBA 7(a) */}
      <KypSubhead subsection={8} id="sba7a">
        <span className="lbl">Commercial Lending — SBA 7(a)</span>
        <span className="ct">small business · borrower street address</span>
      </KypSubhead>
      {loans7a.length > 0 && (
        <>
          <div>
            {by7aAmount.map((loan: any, i: number) => {
              const query = loan.address
                ? `${loan.address} ${loan.city || 'Chicago'} IL`
                : `${loan.borrowerName} ${loan.city || 'Chicago'} IL`;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
              return (
                <div key={i} className={`kyp-loanrow${i >= visible7a ? ' loan-overflow' : ''}`}>
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
          {visible7a < by7aAmount.length && (
            <button type="button" className="kyp-morelink market-showmore" onClick={() => setVisible7a(n => n + SHOW_N)} data-testid="more-7a">
              + Show {Math.min(SHOW_N, by7aAmount.length - visible7a)} more 7(a) loans →
            </button>
          )}

          {top7a.length > 0 && (
            <>
              <div id="sba-lenders" className="kyp-charttitle">7(a) lenders · ranked by loans closed</div>
              <div>
                {top7a.slice(0, visible7aLenders).map((l: any, i: number) => <LenderBar key={i} {...l} max={top7aMax} />)}
                <div className="hidden print:block">{top7a.slice(visible7aLenders).map((l: any, i: number) => <LenderBar key={i} {...l} max={top7aMax} />)}</div>
              </div>
              {visible7aLenders < top7a.length && <button type="button" className="kyp-morelink market-showmore" data-testid="more-7a-lenders" onClick={() => setVisible7aLenders(n => n + SHOW_N)}>+ Show {Math.min(SHOW_N, top7a.length - visible7aLenders)} more 7(a) lenders →</button>}
            </>
          )}
        </>
      )}
      {loans7a.length === 0 && (
        <p className="kyp-emptypanel">No SBA 7(a) loans found in ZIP {zipCode} (FY2020–present).</p>
      )}

      <CommercialSourceFooter zipCode={zipCode} />
    </div>
  );
}

function CommercialSourceFooter({ zipCode }: { zipCode: string }) {
  const sectionNumber = useContext(SectionNumberContext);
  const base = sectionNumber == null ? null : String(sectionNumber).padStart(2, '0');
  return <div className="kyp-src">{base ? `${base}.7–${base}.8` : 'Commercial lending'} describe ZIP {zipCode}, not this address. Source: SBA FOIA 7(a) and 504 loan data, FY2020–present. The 504 file reports borrower, industry, amount and CDC lender — not the financed address, so 504 records are ZIP-level, not property matches. 7(a) records do carry a borrower street address. Lender bars rank by loans closed; the dollar total on each bar is the sum for that lender.</div>;
}
