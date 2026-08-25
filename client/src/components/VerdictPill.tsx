// KYP verdict pill — the ONE pill. Solid, white text, mono uppercase.
// Color is STRICTLY semantic (never by section/family): good=green,
// attention=orange, bad=red, context/neutral=slate. Styling lives in
// kyp-base.css (.kyp-pill). Do not add per-section pill CSS.
import { type ReactNode } from "react";

export type VerdictTone = "good" | "attention" | "bad" | "context" | "neutral";

const TONE_CLASS: Record<VerdictTone, string> = {
  good: "good",
  attention: "att",
  bad: "bad",
  context: "ctx",
  neutral: "ctx",
};

export interface VerdictPillProps {
  tone?: VerdictTone;
  label: ReactNode;
  testId?: string;
}

export default function VerdictPill({ tone = "context", label, testId }: VerdictPillProps) {
  return (
    <span className={`kyp-pill ${TONE_CLASS[tone]}`} data-testid={testId}>
      {label}
    </span>
  );
}
