// THE canonical section takeaway (Part-B standard). Every section-level takeaway
// renders through this one component: same box, label, headline scale, bullet rows,
// and far-right jump chips. Styling lives in index.css (.crm-take family).
import { type ReactNode } from "react";

export type TakeawayTone = "good" | "caution" | "insight" | "plain";

export interface TakeawayRow {
  tone: TakeawayTone;
  body: ReactNode;
  /** Optional far-right jump chip; omit when the bullet has no destination. */
  chip?: { label: string; targetId: string };
  testId?: string;
}

const TONE_CLASS: Record<TakeawayTone, string> = {
  good: "g",
  caution: "c",
  insight: "i",
  plain: "n",
};

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .9 1.6l.1.7h6l.1-.7c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function JumpArrow() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export function jumpToSection(targetId: string, onBeforeJump?: (targetId: string) => void) {
  onBeforeJump?.(targetId);
  // Allow any just-opened collapsible to render before scrolling.
  setTimeout(() => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 60);
}

export interface TakeawayProps {
  headline: ReactNode;
  rows: TakeawayRow[];
  /** Optional overall verdict pill (right side of the label row). */
  rating?: { label: string; tone: "good" | "caution" | "neutral" };
  /** Called before scrolling a jump chip's target (e.g. to open its section). */
  onBeforeJump?: (targetId: string) => void;
  testId?: string;
  className?: string;
}

export default function Takeaway({ headline, rows, rating, onBeforeJump, testId, className }: TakeawayProps) {
  return (
    <div className={`crm-take${className ? ` ${className}` : ""}`} data-testid={testId}>
      <div className="crm-thead">
        <div className="crm-takeh">
          <LightbulbIcon />
          Takeaway
        </div>
        {rating && (
          <span className={`crm-rating${rating.tone === "neutral" ? "" : ` ${rating.tone}`}`}>
            <span className="d" />
            {rating.label}
          </span>
        )}
      </div>
      <div className="crm-taket">{headline}</div>
      <div className="crm-conn">
        {rows.map((row, i) => (
          <div key={i} className={`crm-cn ${TONE_CLASS[row.tone]}`} data-testid={row.testId}>
            <span className="dt" />
            <span className="txt">{row.body}</span>
            {row.chip && (
              <button type="button" className="crm-jump" onClick={() => jumpToSection(row.chip!.targetId, onBeforeJump)}>
                {row.chip.label} <JumpArrow />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
