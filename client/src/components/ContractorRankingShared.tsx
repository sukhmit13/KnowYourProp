import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Shared design primitives for the Contractor Rankings family:
// Top General Contractors, Top Permit Expeditors, Minority Contractor Directory.
// Styling-only module — no data or ranking logic lives here.

export const INDIGO = '#2b3a9e';
export const INDIGO_SOFT = '#ecedf9';
export const INK = '#141414';
export const INK2 = '#565651';
export const MUTED = '#8b8a84';
export const LINE = '#eae8e2';
export const PAPER = '#faf9f6';
export const NEUTRAL_PILL = '#f1efe9';

export function formatValue(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

export function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: ReactNode }) {
  return (
    <div>
      <div className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2" style={{ color: INK }}>
        <Icon className="w-4 h-4" style={{ color: INDIGO }} />
        {title}
      </div>
      <p className="text-sm mt-1" style={{ color: MUTED }}>{subtitle}</p>
    </div>
  );
}

export function FilterPill({
  active,
  onClick,
  icon: Icon,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon?: any;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors"
      style={{
        padding: '7px 13px',
        border: `1px solid ${active ? INDIGO : LINE}`,
        background: active ? INDIGO : '#ffffff',
        color: active ? '#ffffff' : INK2,
      }}
    >
      {Icon && <Icon className="w-3 h-3" style={{ color: active ? '#ffffff' : INK2 }} />}
      {children}
    </button>
  );
}

export function CertChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 font-jbmono text-[10px] font-bold"
      style={{ background: INDIGO_SOFT, color: INDIGO }}
    >
      {label}
    </span>
  );
}

export function CountPill({ icon: Icon, children, testId }: { icon?: any; children: ReactNode; testId?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: NEUTRAL_PILL, color: INK }}
      data-testid={testId}
    >
      {Icon && <Icon className="w-3 h-3" style={{ color: INK2 }} />}
      {children}
    </span>
  );
}

export function StatTiles({ tiles }: { tiles: { label: string; value: string; testId?: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {tiles.map(t => (
        <div key={t.label} className="rounded-[9px] px-3.5 py-2.5 text-center" style={{ background: PAPER, border: `1px solid ${LINE}` }}>
          <div className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] mb-1" style={{ color: MUTED }}>{t.label}</div>
          <div className="font-serif text-xl leading-none" style={{ color: INK }} data-testid={t.testId}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

export function MonoLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] mb-1.5" style={{ color: MUTED }}>{children}</p>
  );
}

export function PaperChip({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded" style={{ background: PAPER, border: `1px solid ${LINE}`, color: INK2 }}>
      {children}
    </span>
  );
}

// Shared ranked row: rank | name block | right side (metric pill + More/Less) with
// thin divider between rows; expanded detail renders full-width beneath.
export function RankedRow({
  rank,
  isFirst,
  nameBlock,
  subLine,
  pill,
  expandedContent,
  defaultExpanded = false,
  testId,
  expandTestId,
}: {
  rank: number;
  isFirst: boolean;
  nameBlock: ReactNode;
  subLine?: ReactNode;
  pill: ReactNode;
  expandedContent?: ReactNode;
  defaultExpanded?: boolean;
  testId?: string;
  expandTestId?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className={isFirst ? 'py-3' : 'py-3 border-t'} style={!isFirst ? { borderColor: LINE } : undefined} data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="font-jbmono text-xs font-bold shrink-0 pt-0.5" style={{ color: INDIGO, width: 34 }}>
            #{rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">{nameBlock}</div>
            {subLine && <p className="text-xs mt-0.5" style={{ color: MUTED }}>{subLine}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {pill}
          {expandedContent !== undefined && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-xs font-semibold"
              style={{ color: INDIGO }}
              data-testid={expandTestId}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>
      {expanded && expandedContent}
    </div>
  );
}
