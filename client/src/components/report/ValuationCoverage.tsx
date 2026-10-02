import React from "react";
import type { ValuationMetrics } from "@/lib/valuation";

const money = (value: number) => `${value < 0 ? "−" : ""}$${Math.round(Math.abs(value)).toLocaleString()}`;

export function ValuationBands({ dscr }: { dscr: number }) {
  const tier = dscr < 1 ? "no" : dscr < 1.25 ? "watch" : "ok";
  const bands = [
    { state: "no", title: "Below 1.00×", text: "NOI is below annual debt service." },
    { state: "watch", title: "1.00× to <1.25×", text: "NOI covers debt service; below the common commercial floor." },
    { state: "ok", title: "1.25× and above", text: "At or above a commonly used commercial lender floor." },
  ];
  return (
    <div className="kyp-bands b3" aria-label="Debt service coverage bands">
      {bands.map((band) => <div key={band.state} className={`kyp-band ${tier === band.state ? `on ${band.state}` : ""}`}>
        <div className="bar" />
        <div className="bl">{band.title}</div>
        <div className="br">{band.text}</div>
      </div>)}
    </div>
  );
}

export function ValuationCoverage({ metrics, selectedNoi, isFha }: {
  metrics: ValuationMetrics;
  selectedNoi: number;
  isFha: boolean;
}) {
  if (metrics.annualDebtService <= 0) return <div className="kyp-empty">No debt service is modeled at these inputs. A debt-coverage ratio is not applicable.</div>;
  return <>
    <div className="kyp-cov">
      <div className="kyp-covhd"><span className="l">Your NOI</span><span className="v">{money(selectedNoi)}</span><span className="kyp-scopenote">per year</span></div>
      <div className="kyp-covrow"><span className="rl">Your debt payment<s>1.00× — what the loan actually costs</s></span><span className="need">{money(metrics.annualDebtService)}</span><span className={`kyp-pill ${selectedNoi >= metrics.annualDebtService ? "good" : "bad"}`}>{money(selectedNoi - metrics.annualDebtService)}</span></div>
      <div className="kyp-covrow"><span className="rl">Lender minimum<s>1.25× — the floor most commercial lenders underwrite to</s></span><span className="need">{money(metrics.annualDebtService * 1.25)}</span><span className={`kyp-pill ${metrics.dscr >= 1.25 ? "good" : metrics.dscr >= 1 ? "att" : "bad"}`}>{money(selectedNoi - metrics.annualDebtService * 1.25)}</span></div>
      <div className="kyp-receipt"><b>DSCR</b> = annual NOI {money(selectedNoi)} ÷ annual debt service {money(metrics.annualDebtService)} = <b>{metrics.dscr.toFixed(2)}×</b>. {isFha ? "The 1.25× commercial comparison is not FHA/VA lender qualification; these are owner-occupant products." : "This reference is not a financing decision or qualification."}</div>
    </div>
  </>;
}