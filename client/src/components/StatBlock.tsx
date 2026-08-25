// KYP filled stat block — a color-block KPI (the anti-dead-space rule).
// value (big display-serif) + optional viz + label/detail. Never a lone
// number over a tiny label. Styling lives in kyp-base.css (.kyp-block).
import { type ReactNode } from "react";

export type BlockColor = "indigo" | "green" | "dark" | "slate";

const COLOR_CLASS: Record<BlockColor, string> = {
  indigo: "ind",
  green: "grn",
  dark: "dark",
  slate: "slate",
};

export interface StatBlockProps {
  color?: BlockColor;
  value: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  /** Optional mini-visual (trend arrow, micro-bars, chips, a status chip). */
  viz?: ReactNode;
  testId?: string;
}

export default function StatBlock({ color = "indigo", value, label, detail, viz, testId }: StatBlockProps) {
  return (
    <div className={`kyp-block ${COLOR_CLASS[color]}`} data-testid={testId}>
      <div className="bv">{value}</div>
      {viz}
      <div>
        <div className="bl">{label}</div>
        {detail != null && <div className="bd">{detail}</div>}
      </div>
    </div>
  );
}
