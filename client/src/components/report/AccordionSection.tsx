import React, { createContext, useContext, type ReactNode, type HTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export type AccVerdict = "good" | "watch" | "context";
const VCLASS: Record<AccVerdict, string> = { good: "g", watch: "o", context: "c" };

export const SectionNumberContext = createContext<number | null>(null);

export function buildSubsectionNumbers(headings: Array<[string, boolean]>): Record<string, number> {
  return headings.reduce<Record<string, number>>((numbers, [key, rendered]) => {
    if (rendered) numbers[key] = Object.keys(numbers).length + 1;
    return numbers;
  }, {});
}

interface KypSubheadProps extends HTMLAttributes<HTMLDivElement> {
  subsection?: number;
  children: ReactNode;
}

export function KypSubhead({ subsection, children, className, ...props }: KypSubheadProps) {
  const sectionNumber = useContext(SectionNumberContext);
  const number = sectionNumber != null && subsection != null
    ? `${String(sectionNumber).padStart(2, "0")}.${subsection}`
    : null;

  return (
    <div {...props} className={["kyp-subhead", subsection === 1 && "first", className].filter(Boolean).join(" ")}>
      {number && <span className="n">{number}</span>}
      {children}
    </div>
  );
}

export interface AccordionSectionProps {
  index: number;               // 1-based visual position (renders "01", "02", …)
  id: string;                  // stable row id (also DOM id `section-${id}`)
  order: number;               // CSS flex order — rows reorder without moving JSX
  eyebrow: string;
  takeaway: ReactNode;         // finding one-liner, or summary fallback
  verdict: AccVerdict;
  badge?: string;
  badgeTone?: "g" | "o" | "c" | "r" | "indigo";
  collapsible?: boolean;
  info?: string;
  open: boolean;
  onToggle: () => void;
  off?: boolean;               // user hid this section (dimmed, collapsed)
  onToggleOff?: () => void;
  dragHandlers?: HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
  over?: boolean;
  children: ReactNode;
}

export function AccordionSection({
  index, id, order, eyebrow, takeaway, verdict, badge, badgeTone, info,
  open, onToggle, off, onToggleOff, dragHandlers, dragging, over, children,
  collapsible = true,
}: AccordionSectionProps) {
  const v = VCLASS[verdict];
  const cls = ["kyp-accrow", v, !collapsible && "static", off && "offrow", dragging && "dragrow", over && "overrow"]
    .filter(Boolean).join(" ");
  const bodyOpen = collapsible && open && !off;
  return (
    <div className={cls} id={`section-${id}`} data-testid={`accsec-${id}`} style={{ order }} {...dragHandlers}>
      <div
        className="kyp-acchd"
        data-testid={id === "listing" ? "trigger-listing-snapshot" : undefined}
        title={info}
        {...(collapsible ? {
          onClick: onToggle,
          role: "button" as const,
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          },
          "aria-expanded": bodyOpen,
        } : {})}
      >
        <span className="drag" title="Drag to re-rank" onClick={(e) => e.stopPropagation()}>⠿</span>
        <span className="num">{String(index).padStart(2, "0")}</span>
        <div className="mid">
          <span className="eb">{eyebrow}</span>
          <span className="tk">{takeaway}</span>
        </div>
        {badge && !off && <span className={`badge ${badgeTone ?? (id === "zoningHistory" ? "indigo" : v)}`}>{badge}</span>}
        {onToggleOff && (
          <span
            className="ico"
            title={off ? "Show section" : "Hide section"}
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleOff(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleOff(); } }}
            data-testid={`acchide-${id}`}
          >
            {off ? <EyeOff /> : <Eye />}
          </span>
        )}
      </div>
      {collapsible && (
        <SectionNumberContext.Provider value={index}>
          <div className={`kyp-accbody${bodyOpen ? "" : " closed"}`}>{children}</div>
        </SectionNumberContext.Provider>
      )}
    </div>
  );
}
