import { useState } from "react";
import CollapsibleSection, { type ScanSection } from "./CollapsibleSection";

export interface SectionScanProps {
  sections: ScanSection[];
  /** localStorage key to persist the user's order + hidden set (e.g. `kyp-scan-${runId}`). */
  storageKey?: string;
  /** Default scrolls to the section's anchorId. Override to expand inline instead. */
  onOpenFull?: (anchorId?: string) => void;
}

function readPersist(key?: string): { order?: string[]; hidden?: string[] } {
  if (!key) return {};
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}

export default function SectionScan({ sections, storageKey, onOpenFull }: SectionScanProps) {
  const persisted = readPersist(storageKey);
  const [order, setOrder]   = useState<string[]>(persisted.order ?? sections.map((s) => s.id));
  const [hidden, setHidden] = useState<Set<string>>(new Set(persisted.hidden ?? []));
  const [open, setOpen]     = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = new Map(sections.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as ScanSection[];

  const persist = (o: string[], h: Set<string>) => {
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify({ order: o, hidden: Array.from(h) })); } catch { /* ignore */ } }
  };
  const move = (from: string, to: string) => {
    if (from === to) return;
    const o = [...order];
    o.splice(o.indexOf(from), 1);
    o.splice(o.indexOf(to), 0, from);
    setOrder(o); persist(o, hidden);
  };
  const toggleOpen = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleOff  = (id: string) => setHidden((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); persist(order, n); return n; });
  const reset = () => { const o = sections.map((s) => s.id); setOrder(o); setHidden(new Set()); setOpen(new Set()); persist(o, new Set()); };

  const openFull = onOpenFull ?? ((anchorId?: string) => {
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const chip = (color: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <i style={{ width: 11, height: 11, borderRadius: 3, background: `var(${color})`, display: "inline-block" }} />{label}
    </span>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
                    fontFamily: "var(--kyp-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".04em",
                    textTransform: "uppercase", color: "var(--kyp-ink2)", margin: "0 2px 16px" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {chip("--kyp-green", "Good")}{chip("--kyp-orange", "Needs a look")}{chip("--kyp-slate", "Context")}
        </div>
        <button onClick={reset}
          style={{ fontFamily: "var(--kyp-mono)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em",
                   textTransform: "uppercase", color: "var(--kyp-ink2)", background: "var(--kyp-card)",
                   border: "1px solid var(--kyp-line)", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
          ↺ Reset order
        </button>
      </div>

      <div className="kyp-scan">
        {ordered.map((s, i) => (
          <CollapsibleSection
            key={s.id}
            section={s}
            index={i}
            open={open.has(s.id)}
            off={hidden.has(s.id)}
            onToggleOpen={() => toggleOpen(s.id)}
            onToggleOff={() => toggleOff(s.id)}
            onOpenFull={openFull}
            over={overId === s.id}
            dragging={dragId === s.id}
            dragHandlers={{
              draggable: true,
              onDragStart: () => setDragId(s.id),
              onDragEnd: () => { setDragId(null); setOverId(null); },
              onDragOver: (e) => { e.preventDefault(); setOverId(s.id); },
              onDragLeave: () => setOverId((o) => (o === s.id ? null : o)),
              onDrop: (e) => { e.preventDefault(); if (dragId) move(dragId, s.id); setOverId(null); },
            }}
          />
        ))}
      </div>
    </div>
  );
}
