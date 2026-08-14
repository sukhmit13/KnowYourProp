import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Info, XCircle, ExternalLink, CalendarDays } from "lucide-react";

// ── Location incentives: shared availability-state visual primitives ──
// Three states only: 0 likely relevant (green), 1 needs confirmation (amber), 3 not applicable (MUTED red — a calm "no", never alarm red).
export const INC_STATE = {
  0: { mk: '✓', fg: '#2f7d3f', soft: '#edf6ef' },
  1: { mk: '!', fg: '#8f6a08', soft: '#fdf6cf' },
  3: { mk: '×', fg: '#b23c2f', soft: '#fbeceb' },
} as const;

export type IncAvail = 0 | 1 | 3;

type IncentiveStatus = IncAvail;

const statusIcon = (state: IncentiveStatus) => {
  if (state === 0) return CheckCircle2;
  if (state === 1) return Clock3;
  return XCircle;
};

export function IncentiveBanner({ state, finding, explanation, children, findingTestId }: {
  state: IncentiveStatus;
  finding: ReactNode;
  explanation?: ReactNode;
  children?: ReactNode;
  findingTestId?: string;
}) {
  const Icon = statusIcon(state);
  return (
    <div className={`inc-banner inc-banner-${state}`} role="status">
      <Icon className="inc-banner-icon" aria-hidden="true" />
      <div className="inc-banner-copy">
        <p className="inc-banner-finding" data-testid={findingTestId}>{finding}</p>
        {explanation && <p className="inc-banner-explanation">{explanation}</p>}
        {children}
      </div>
    </div>
  );
}

export function IncentiveStatTiles({ tiles }: {
  tiles: Array<{ value: ReactNode; label: ReactNode; qualifies?: boolean; identifier?: boolean }>;
}) {
  return <div className="inc-stiles">
    {tiles.map((tile, i) => <div className="inc-st" key={i}>
      <div className={tile.identifier ? "inc-st-value inc-st-identifier" : "inc-st-value"}>{tile.value}</div>
      <div className="inc-st-label">{tile.label}</div>
      {tile.qualifies && <span className="inc-st-qualifies">Qualifies</span>}
    </div>)}
  </div>;
}

export function IncentiveInfoTiles({ tiles, two = false }: {
  tiles: Array<{ title: ReactNode; description: ReactNode }>; two?: boolean;
}) {
  return <div className={`inc-itiles${two ? " inc-itiles-two" : ""}`}>
    {tiles.map((tile, i) => <div className="inc-it" key={i}>
      <p className="inc-it-title">{tile.title}</p><p className="inc-it-description">{tile.description}</p>
    </div>)}
  </div>;
}

export function IncentiveTifChip({ children }: { children: ReactNode }) {
  return <span className="inc-tifchip">{children}</span>;
}

export function IncentiveCols({ leftLabel = "Who Can Apply", rightLabel = "Eligibility Requirements", left, right }: {
  leftLabel?: ReactNode; rightLabel?: ReactNode; left: ReactNode; right: ReactNode;
}) {
  const list = (content: ReactNode) => Array.isArray(content)
    ? <ul>{content.map((item, i) => <li key={i}>{item}</li>)}</ul>
    : content;
  return <div className="inc-cols">
    <div className="inc-col"><p className="inc-col-label">{leftLabel}</p>{list(left)}</div>
    <div className="inc-col"><p className="inc-col-label">{rightLabel}</p>{list(right)}</div>
  </div>;
}

export function IncentiveNote({ children }: { children: ReactNode }) {
  return <p className="inc-note">{children}</p>;
}

export function IncentiveLinks({ links, source, timing }: {
  links?: Array<{ href: string; children: ReactNode; testId?: string }>; source?: ReactNode; timing?: ReactNode;
}) {
  return <div className="inc-link-wrap">
    {timing && <div className="inc-timing"><CalendarDays className="inc-link-icon" aria-hidden="true" />{timing}</div>}
    <div className="inc-links">
      <span className="inc-link-list">{links?.map((link, i) => <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" data-testid={link.testId}>{link.children}<ExternalLink className="inc-link-icon" aria-hidden="true" /></a>)}</span>
      {source && <span className="inc-source">{source}</span>}
    </div>
  </div>;
}

export function IncentiveCardRow({ state, name, badge, open }: { state: IncAvail; name: string; badge: string; open: boolean }) {
  const c = INC_STATE[state];
  return (
    <div className="flex items-center gap-3 cursor-pointer px-4 py-3 hover-elevate" data-testid={`inc-row-${name.slice(0, 20)}`}>
      <span className="w-4 text-center text-xs font-bold flex-none" style={{ color: c.fg }}>{c.mk}</span>
      <span className="text-sm font-bold text-left">{name}</span>
      <span className="ml-auto flex items-center gap-2.5 flex-none pl-2">
        <span className="text-[10px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ background: c.soft, color: c.fg }}>{badge}</span>
        <span className="text-muted-foreground text-xs">{open ? '▴' : '▾'}</span>
      </span>
    </div>
  );
}

export function IncentiveTypeLabel({ children, order }: { children: React.ReactNode; order: number }) {
  return <p className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground mt-2 print:hidden" style={{ order }}>{children}</p>;
}

export function IncentiveGroupHeader({ state, title, count, order }: { state: IncAvail; title: string; count: number; order: number }) {
  const c = INC_STATE[state];
  return (
    <div className="flex items-center gap-2.5 mt-4 print:hidden" style={{ order }}>
      <span className="w-2.5 h-2.5 rounded-[3px] flex-none" style={{ background: c.fg }} />
      <span className="font-jbmono text-xs font-bold uppercase tracking-[0.06em]">{title}</span>
      <span className="font-jbmono text-[11px] text-muted-foreground">· {count}</span>
    </div>
  );
}
