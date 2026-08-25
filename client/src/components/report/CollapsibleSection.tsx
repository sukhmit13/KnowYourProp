import { type ReactNode, useRef } from "react";

export type VerdictTone = "good" | "attention" | "context";

const PILL_CLASS: Record<VerdictTone, string> = { good: "good", attention: "att", context: "ctx" };
const ROW_CLASS:  Record<VerdictTone, string> = { good: "kyp-v-good", attention: "kyp-v-att", context: "kyp-v-ctx" };
const SQ_VAR:     Record<VerdictTone, string> = { good: "--kyp-green", attention: "--kyp-orange", context: "--kyp-slate" };

export interface PreviewRow { tone: VerdictTone; body: ReactNode; }

export interface ScanSection {
  id: string;                 // stable key (never changes)
  anchorId?: string;          // element id of the full section to scroll to
  title: string;              // section name (the kicker)
  summary: string;            // ALWAYS present — "what this covers". Shown until a real takeaway exists.
  takeaway?: ReactNode;       // the finding one-liner; may include <em>. OMIT until determined -> falls back to summary.
  verdict?: { tone: VerdictTone; label: string }; // OMIT until determined -> no pill, row stays neutral (slate).
  hero?: { value: string; label: string };
  info: string[];             // "Contains" tooltip list
  preview?: PreviewRow[];     // rows shown when expanded (optional)
}

function Chevron() {
  return <svg className="kyp-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>;
}
function EyeIcon({ on }: { on: boolean }) {
  return on
    ? <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
    : <svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a15.8 15.8 0 0 1-3.1 3.9M6.6 6.6A15.9 15.9 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3-.5" /></svg>;
}

function InfoTip({ items }: { items: string[] }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const place = () => {
    const tip = tipRef.current;
    if (!tip || !tip.parentElement) return;
    const btn = tip.parentElement.getBoundingClientRect();
    const tw = 256, th = tip.offsetHeight;
    const left = Math.min(Math.max(8, btn.right - tw), window.innerWidth - tw - 8);
    let top = btn.bottom + 8;
    if (top + th > window.innerHeight - 8) top = Math.max(8, btn.top - th - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  return (
    <div
      className="kyp-info"
      onMouseEnter={() => { tipRef.current?.classList.add("show"); requestAnimationFrame(place); }}
      onMouseLeave={() => tipRef.current?.classList.remove("show")}
      onClick={(e) => e.stopPropagation()}
    >
      i
      <div className="kyp-tip" ref={tipRef}>
        <div className="tt">Contains</div>
        <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    </div>
  );
}

export interface CollapsibleSectionProps {
  section: ScanSection;
  index: number;
  open: boolean;
  off: boolean;
  onToggleOpen: () => void;
  onToggleOff: () => void;
  onOpenFull?: (anchorId?: string) => void;
  over?: boolean;
  dragging?: boolean;
  dragHandlers?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}

export default function CollapsibleSection({
  section, index, open, off, onToggleOpen, onToggleOff, onOpenFull, over, dragging, dragHandlers,
}: CollapsibleSectionProps) {
  const tone: VerdictTone = section.verdict?.tone ?? "context";   // no verdict -> neutral slate
  const isFallback = section.takeaway == null;                    // show muted summary until a takeaway exists
  const cls = ["kyp-scanrow", ROW_CLASS[tone], off && "off", open && "open", over && "over", dragging && "drag"]
    .filter(Boolean).join(" ");
  return (
    <div className={cls} {...dragHandlers}>
      <div className="accent" />
      <div className="kyp-drag">⠿</div>
      <div className="kyp-numb">{String(index + 1).padStart(2, "0")}</div>
      <div className="kyp-scanmain" onClick={onToggleOpen}>
        <div className="kyp-scankick">{section.title}</div>
        <div className="kyp-scantake" style={isFallback ? { fontWeight: 500, color: "var(--kyp-ink2)" } : undefined}>
          {section.takeaway ?? section.summary}
        </div>
        <div className="kyp-preview">
          {(section.preview ?? []).map((r, i) => (
            <div className="kyp-pvrow" key={i}>
              <span className="sq" style={{ background: `var(${SQ_VAR[r.tone]})` }} />
              <span>{r.body}</span>
            </div>
          ))}
          <div className="kyp-jump" onClick={(e) => { e.stopPropagation(); onOpenFull?.(section.anchorId); }}>
            Open full section →
          </div>
        </div>
      </div>
      <div className="kyp-scanright">
        {section.hero && (
          <div className="kyp-hero"><div className="hv">{section.hero.value}</div><div className="hl">{section.hero.label}</div></div>
        )}
        {section.verdict && <span className={`kyp-pill ${PILL_CLASS[section.verdict.tone]}`}>{section.verdict.label}</span>}
        <InfoTip items={section.info} />
        <div className="kyp-eye" title="Include / exclude" onClick={(e) => { e.stopPropagation(); onToggleOff(); }}>
          <EyeIcon on={!off} />
        </div>
        <span onClick={(e) => { e.stopPropagation(); onToggleOpen(); }}><Chevron /></span>
      </div>
    </div>
  );
}
