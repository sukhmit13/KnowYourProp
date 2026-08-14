import { useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { ExternalLink, CalendarDays, Clock3, X, ChevronDown } from "lucide-react";

export type IncentiveState = "good" | "caution" | "na";
export type IncentiveFact = { label: ReactNode; value: ReactNode; detail?: ReactNode };
export type IncentiveColumn = { head: ReactNode; items: ReactNode[] };
export type IncentiveNote = { icon: "clock" | "calendar" | "x"; text: ReactNode };

export interface IncentiveCardProps {
  name: ReactNode;
  type: ReactNode;
  state: IncentiveState;
  pill_label: ReactNode;
  verdict: ReactNode;
  verdict_sub?: ReactNode;
  keyfacts?: IncentiveFact[];
  columns?: IncentiveColumn[];
  note?: IncentiveNote;
  links?: { label: ReactNode; href: string }[];
  source?: ReactNode;
  style?: CSSProperties;
  order?: number;
  id?: string;
  className?: string;
  children?: ReactNode;
  defaultOpen?: boolean;
}

function StateIcon({ state }: { state: IncentiveState }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {state === "good" && <path d="M20 6 9 17l-5-5" />}
    {state === "caution" && <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>}
    {state === "na" && <><path d="M18 6 6 18" /><path d="M6 6l12 12" /></>}
  </svg>;
}

function NoteIcon({ icon }: { icon: IncentiveNote["icon"] }) {
  if (icon === "calendar") return <CalendarDays />;
  if (icon === "x") return <X />;
  return <Clock3 />;
}

export function IncentiveCard({ name, type, state, pill_label, verdict, verdict_sub, keyfacts, columns, note, links, source, style, order, id, className, children, defaultOpen = false }: IncentiveCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article id={id} className={`inc ${state}${open ? " open" : ""}${className ? ` ${className}` : ""}`} style={{ ...style, ...(order === undefined ? {} : { order }) }}>
      <header
        className="inchd"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
      >
        <span className="sc"><StateIcon state={state} /></span>
        <span className="nm">{name}</span>
        <span className="tp">{type}</span>
        <span className="pill">{pill_label}</span>
        <span className="cvx" aria-hidden="true"><ChevronDown /></span>
      </header>
      <div className="incbody">
        <div className="inc-v">
          <div className="vt">{verdict}</div>
          {verdict_sub && <div className="vs">{verdict_sub}</div>}
        </div>
        {keyfacts?.length ? <div className="kf">{keyfacts.map((fact, i) => <div className="kfc" key={i}><div className="kl">{fact.label}</div><div className="kv">{fact.value}</div>{fact.detail && <div className="kd">{fact.detail}</div>}</div>)}</div> : null}
        {columns?.length ? <div className="inc-cols">{columns.map((column, i) => <div key={i}><div className="ch">{column.head}</div><ul>{column.items.map((item, j) => <li key={j}>{item}</li>)}</ul></div>)}</div> : null}
        {note && <div className="inc-note"><NoteIcon icon={note.icon} />{note.text}</div>}
        {children}
        <footer className="inc-ft">
          {links?.map((link, i) => <a className="inclink" key={i} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink /></a>)}
          <span className="incsrc">{source}</span>
        </footer>
      </div>
    </article>
  );
}

export default IncentiveCard;
