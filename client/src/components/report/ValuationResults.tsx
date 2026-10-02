import type { ValuationMetrics } from "@/lib/valuation";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;

export function ValuationResults({ metrics, blended, businessOnly }: {
  metrics: ValuationMetrics; blended: boolean; businessOnly: boolean;
}) {
  const monthlyFlow = metrics.annualCashFlow / 12;
  const flowTone = Math.abs(monthlyFlow) <= 250 ? "wash" : monthlyFlow > 250 ? "grn" : "red";
  const coverageTone = metrics.annualDebtService <= 0 ? "slate" : metrics.dscr >= 1.25 ? "grn" : metrics.dscr >= 1 ? "orange" : "red";
  return <>
    <div className="kyp-blocks four" data-testid="valuation-glance">
      <div className="kyp-block ind-deep"><div className="bv">{metrics.purchasePrice > 0 ? `${metrics.capRate.toFixed(2)}%` : "—"}</div><div className="bl">{blended ? "Blended yield" : businessOnly ? "Business yield" : "Cap rate"}</div></div>
      <div className="kyp-block ind-deep"><div className="bv">{metrics.downPayment > 0 ? `${metrics.roi.toFixed(2)}%` : "—"}</div><div className="bl">Cash-on-cash</div></div>
      <div className={`kyp-block ${flowTone}`}><div className="bv">{money(monthlyFlow)}</div><div className="bl">{flowTone === "wash" ? "Within ±$250/mo break-even" : "Monthly cash flow"}</div></div>
      <div className={`kyp-block ${coverageTone}`}><div className="bv">{metrics.annualDebtService > 0 ? `${metrics.dscr.toFixed(2)}×` : "—"}</div><div className="bl">Debt service coverage</div></div>
    </div>
  </>;
}