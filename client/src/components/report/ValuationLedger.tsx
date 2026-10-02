import React from "react";

export function ValuationTag({ kind, children }: { kind: "rec" | "est" | "assume"; children: React.ReactNode }) {
  return <span className={`kyp-tag ${kind}`}>{children}</span>;
}

export function LedgerRow({ label, detail, tag, value, negative = false, input, variant }: {
  label: string;
  detail?: string;
  tag?: React.ReactNode;
  value?: string;
  negative?: boolean;
  input?: React.ReactNode;
  variant?: "sub" | "total";
}) {
  return <div className={`kyp-lrow${variant ? ` ${variant}` : ""}`}>
    <div className="l">{label}{detail && <s>{detail}</s>}</div>
    {tag ?? <span />}
    {input ?? <div className={`v ${negative ? "neg" : ""}`}>{value}</div>}
  </div>;
}

export function ValuationLedger({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="kyp-ledger">
    <div className="lh">{title}</div>
    {children}
  </div>;
}