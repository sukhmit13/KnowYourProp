// Property Insight Report — button → checklist modal → in-section report.
// The one slot below Ward/Zoning holds all four states, swapped in place:
//   A resting: section-width "Generate Insight Report" button
//   modal: pre-generate checklist (Project Use / Project Context / Valuation)
//   B generating: collapsed section with a REAL progress bar (streamed finding
//     completions from /progress — never a timer)
//   C ready: collapsible section embedding the EXISTING one-pager (unchanged
//     design + prompt) with in-header Export / Print PDF + Regenerate.
// Auto-skip: all three inputs complete ⇒ no modal, straight to tailored generate.

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, Check, Printer, RefreshCw, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface ChecklistItem {
  key: "project_type" | "project_context" | "valuation";
  title: string;
  subtitle: string;
  complete: boolean;
  onComplete: () => void;
}

interface Props {
  runId: number;
  canAccess: boolean;
  currentProjectType: string | null;
  projectTypeComplete: boolean;
  contextComplete: boolean;
  valuationComplete: boolean;
  onCompleteProjectType: () => void;
  onCompleteContext: () => void;
  onCompleteValuation: () => void;
  /** Parent registers the toolbar entry point here (scroll + trigger = one behavior, two entry points). */
  registerTrigger?: (fn: () => void) => void;
}

// Presentational copy only — names what the existing generator prioritizes for
// common uses; the actual prioritization lives in the generation prompt.
function prioritizedSectionsFor(use: string | null): string {
  const u = (use || "").toLowerCase();
  if (/restaurant|food|cafe|bar/.test(u)) return "Zoning use-fit, Licensing, Incentives, Corridor, Transit";
  if (/day\s*care|childcare|school/.test(u)) return "Zoning use-fit, Licensing, Demographics, Schools & childcare, Safety";
  if (/residential|apartment|multi|condo|adu/.test(u)) return "Zoning use-fit, FAR/density, Incentives, Market demand, Transit";
  if (/retail|store|shop/.test(u)) return "Zoning use-fit, Corridor, Foot traffic, Incentives, Transit";
  if (/office|medical|clinic/.test(u)) return "Zoning use-fit, Corridor, Transit, Demographics, Incentives";
  if (/industrial|warehouse|manufactur/.test(u)) return "Zoning use-fit, PMD/industrial corridor, Incentives, Access";
  return "Zoning use-fit, Title & records, Taxes, Incentives, Market demand";
}

export default function InsightReportSection(props: Props) {
  const { runId, canAccess, currentProjectType } = props;
  const { toast } = useToast();

  // ---- saved report (same cache key as the standalone page) ----------------
  const { data: cached, isLoading: loadingCached } = useQuery<any, Error, { html: string; generatedAt: string | null; generatedForProjectType: string | null | undefined; mode: string | null } | undefined>({
    queryKey: [`/api/runs/${runId}/insight-report`],
    enabled: !!runId && canAccess,
    retry: false,
    select: (data: any) => {
      const src = data?.content && typeof data.content === "object" ? data.content : data;
      const html = data?.html || data?.content?.html;
      const generatedForProjectType = src && typeof src === "object" && "generatedForProjectType" in src ? (src.generatedForProjectType ?? null) : undefined;
      const mode = src && typeof src === "object" && typeof src.mode === "string" ? src.mode : null;
      return html ? { html, generatedAt: data?.generatedAt ?? null, generatedForProjectType, mode } : undefined;
    },
  });

  // ---- generation ----------------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMode, setGenMode] = useState<"tailored" | "as_is">("tailored");

  const generateMutation = useMutation({
    mutationFn: async (mode: "tailored" | "as_is") => (await apiRequest("POST", `/api/runs/${runId}/insight-report/generate`, { mode })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}/insight-report`] });
      setGenerating(false);
      setOpen(true); // State C auto-expands
      toast({ title: "Insight report ready" });
    },
    onError: (err: any) => {
      setGenerating(false);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const startGenerate = useCallback((mode: "tailored" | "as_is") => {
    setModalOpen(false);
    setGenMode(mode);
    setGenerating(true);
    setOpen(true); // State B starts expanded (progress visible), still collapsible
    generateMutation.mutate(mode);
  }, [generateMutation]);

  // REAL progress — polls streamed finding completions while generating; also
  // checked once on mount so a still-running server generation resumes State B.
  const { data: progress } = useQuery<any>({
    queryKey: [`/api/runs/${runId}/insight-report/progress`],
    enabled: !!runId && canAccess,
    refetchInterval: generating ? 2000 : false,
    retry: false,
  });
  useEffect(() => {
    if (!generating && progress?.status === "running" && !generateMutation.isPending) {
      // a generation kicked off earlier (other tab / before reload) is still running
      setGenerating(true);
      setGenMode(progress.mode === "as_is" ? "as_is" : "tailored");
    }
    if (generating && !generateMutation.isPending && (progress?.status === "ready" || progress?.status === "error")) {
      setGenerating(false);
      if (progress.status === "ready") {
        queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}/insight-report`] });
        setOpen(true);
      }
    }
  }, [progress, generating, generateMutation.isPending, runId]);

  // ---- collapse persistence per run ----------------------------------------
  const [open, setOpenState] = useState<boolean>(() => {
    try { return localStorage.getItem(`kyp_insight_open_${runId}`) !== "0"; } catch { return true; }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try { localStorage.setItem(`kyp_insight_open_${runId}`, v ? "1" : "0"); } catch {}
  };

  // ---- checklist -----------------------------------------------------------
  const items: ChecklistItem[] = [
    { key: "project_type", title: "Project Use / intended use", subtitle: "Sets which sections get prioritized", complete: props.projectTypeComplete, onComplete: props.onCompleteProjectType },
    { key: "project_context", title: "Project Context", subtitle: "Your goals & constraints for this deal", complete: props.contextComplete, onComplete: props.onCompleteContext },
    { key: "valuation", title: "Valuation Calculator", subtitle: props.valuationComplete ? "Deal terms & DSCR — already completed" : "Deal terms & DSCR", complete: props.valuationComplete, onComplete: props.onCompleteValuation },
  ];
  const allComplete = items.every(i => i.complete);

  // One behavior, two entry points (slot button + toolbar):
  const trigger = useCallback(() => {
    if (generating) return;             // already in State B
    if (cached?.html) return;           // State C — toolbar already scrolled here
    if (allComplete) startGenerate("tailored"); // 🔴 auto-skip: no modal
    else setModalOpen(true);
  }, [generating, cached?.html, allComplete, startGenerate]);
  useEffect(() => { props.registerTrigger?.(trigger); }, [trigger]);

  if (!canAccess) return null;

  const done = Math.max(1, Math.min(Number(progress?.done ?? 1), 9));
  const total = Number(progress?.total ?? 9);
  // While running, the server's progress entry is authoritative for the label
  // (a project-type edit mid-generation must not relabel the active attempt)
  const activeMode = progress?.status === "running" ? (progress.mode === "as_is" ? "as_is" : "tailored") : genMode;
  const activeUse = progress?.status === "running" ? (progress.use ?? null) : currentProjectType;
  const useLabel = activeMode === "as_is" ? "Public record" : (activeUse || "your plan");
  const savedMode = cached?.mode === "as_is" ? "as_is" : "tailored";
  const readyDate = cached?.generatedAt
    ? new Date(cached.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  // ---------------------------------------------------------------- resting A
  const resting = !cached?.html && !generating;

  return (
    <div id="insight-report-section" style={{ scrollMarginTop: 90 }} className="no-print">
      {resting && !loadingCached && (
        <button
          type="button"
          onClick={trigger}
          data-testid="button-generate-insight-section"
          className="w-full flex flex-col rounded-xl text-left overflow-hidden hover-elevate"
          style={{ background: "#2b3a9e", boxShadow: "0 3px 14px rgba(43,58,158,.25)" }}
        >
          <span className="flex items-center gap-3 px-5 py-4">
            <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: "rgba(255,255,255,.14)" }}>
              <FileText className="w-4 h-4 text-white" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Generate Insight Report</span>
              <span className="block text-xs mt-0.5" style={{ color: "#c3caf0" }}>A one-page synthesis, tailored to your plan</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold shrink-0 text-white">
              Generate <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </span>
          <span className="block w-full" style={{ height: 4, background: "linear-gradient(90deg,#d13b26,#f3b31f,#2f7d3f)" }} />
        </button>
      )}

      {/* ------------------------------------------------------- States B & C */}
      {(generating || cached?.html) && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <Card className="border-0 overflow-hidden" style={{ boxShadow: "0 3px 14px rgba(43,58,158,.25)" }}>
            <CardHeader className="py-3 px-4" style={{ background: "#2b3a9e" }}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 24, height: 24, background: "rgba(255,255,255,.14)" }}>
                  <FileText className="w-3.5 h-3.5 text-white" />
                </span>
                <span className="font-mono text-xs font-bold tracking-wide uppercase text-white">Property Insight Report</span>
                {generating ? (
                  <span data-testid="chip-insight-generating" className="font-mono text-[9px] font-bold uppercase rounded-full px-2.5 py-0.5 border" style={{ color: "#f0c85a", background: "rgba(240,164,28,.12)", borderColor: "rgba(240,164,28,.4)" }}>
                    Generating · {useLabel}
                  </span>
                ) : (
                  <span data-testid="chip-insight-ready" className="font-mono text-[9px] font-bold uppercase rounded-full px-2.5 py-0.5 border" style={{ color: "#7ee0a0", background: "rgba(126,224,160,.12)", borderColor: "rgba(126,224,160,.4)" }}>
                    Ready{readyDate ? ` · ${readyDate}` : ""}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  {!generating && cached?.html && (
                    <>
                      <button type="button" data-testid="button-insight-export" className="text-xs font-semibold inline-flex items-center gap-1.5 text-white" 
                        onClick={() => window.open(`/api/runs/${runId}/insight-report/view`, "_blank")}>
                        <Printer className="w-3 h-3" /> Export / Print PDF
                      </button>
                      <button type="button" data-testid="button-insight-regenerate" className="text-xs font-semibold inline-flex items-center gap-1.5 text-white" 
                        onClick={() => setModalOpen(true)}>
                        <RefreshCw className="w-3 h-3" /> Regenerate
                      </button>
                    </>
                  )}
                  <CollapsibleTrigger asChild>
                    <button type="button" data-testid="trigger-insight-section" style={{ color: "#c3caf0" }}>
                      {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </CollapsibleTrigger>
                </span>
              </div>
            </CardHeader>
            {generating && (
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-3" data-testid="insight-progress">
                  {/* Segmented progress — one bar per section, logo colors red → gold → green */}
                  <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                    {Array.from({ length: total }, (_, i) => {
                      // Interpolate logo colors across the row: red → gold → green
                      const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
                      const hex = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
                      const RED: [number, number, number] = [209, 59, 38];   // #d13b26
                      const GOLD: [number, number, number] = [243, 179, 31]; // #f3b31f
                      const GREEN: [number, number, number] = [47, 125, 63]; // #2f7d3f
                      const t = total > 1 ? i / (total - 1) : 1;
                      const mix = (a: [number, number, number], b: [number, number, number], u: number): [number, number, number] =>
                        [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
                      const color = hex(t <= 0.5 ? mix(RED, GOLD, t * 2) : mix(GOLD, GREEN, (t - 0.5) * 2));
                      const filled = i < done;
                      const active = i === done && done < total;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-700 ${active ? "animate-pulse" : ""}`}
                          style={{ height: 8, background: filled ? color : active ? color : "#e6e4dd", opacity: filled ? 1 : active ? 0.55 : 1 }}
                          data-testid={`progress-segment-${i}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                    <span><b className="text-foreground">{done} of {total}</b> prioritized sections synthesized</span>
                    <span>~1–2 min · runs in background</span>
                  </div>
                  <div className="text-[11px] mt-2 text-muted-foreground">
                    <span className="font-mono text-[9px] font-bold uppercase rounded px-1.5 py-0.5 mr-1.5 border" style={{ color: "#2b3a9e", background: "#eef0fb", borderColor: "#dfe3f7" }}>
                      Prioritized for {useLabel}
                    </span>
                    {genMode === "as_is" ? "Public-record read — no user deal inputs." : `${prioritizedSectionsFor(currentProjectType)} — ahead of lower-relevance sections.`} Keep scrolling.
                  </div>
                </div>
              </CollapsibleContent>
            )}
            {!generating && cached?.html && (
              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4 border-t">
                  <div className="pt-3">
                    <span data-testid="badge-insight-tailored" className="inline-block text-[10px] font-semibold rounded-md px-2.5 py-1 mb-2" style={{ background: savedMode === "as_is" ? "#f4f2ec" : "#eef0fb", color: savedMode === "as_is" ? "#54544f" : "#2b3a9e" }}>
                      {savedMode === "as_is" ? "▸ Public record" : `▸ Tailored for: ${cached.generatedForProjectType || "your plan"}`}
                    </span>
                    <iframe
                      srcDoc={(() => {
                        // White-on-white: kill the report page's grey backdrop & gutters
                        const override = `<style>html,body{background:#fff!important;margin:0!important;padding:0!important}.page{box-shadow:none!important;margin:0 auto!important}</style>`;
                        return cached.html.includes("</head>")
                          ? cached.html.replace("</head>", `${override}</head>`)
                          : override + cached.html;
                      })()}
                      onLoad={(e) => {
                        // Fit-to-size: scale the fixed-width report page to the section
                        // width and grow the iframe to the real content height
                        const f = e.currentTarget;
                        try {
                          const doc = f.contentDocument;
                          if (!doc?.body) return;
                          const page = doc.querySelector(".page") as HTMLElement | null;
                          const naturalW = page?.offsetWidth || doc.documentElement.scrollWidth || 816;
                          const w = f.clientWidth;
                          // Shrink to fit narrow sections, but never scale up past
                          // 100% — enlarging the fixed 816px page blows it out of the box
                          if (w > 0 && naturalW > 0 && w < naturalW - 4) {
                            (doc.body.style as unknown as { zoom: string }).zoom = String(w / naturalW);
                          }
                          f.style.height = `${Math.ceil(doc.documentElement.scrollHeight) + 4}px`;
                        } catch { /* cross-origin or detached — keep fallback height */ }
                      }}
                      title="Property Insight Report"
                      sandbox="allow-same-origin allow-popups"
                      className="w-full bg-white"
                      style={{ height: 1120 }}
                      data-testid="iframe-insight-report"
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            )}
            <div style={{ height: 4, background: "linear-gradient(90deg,#d13b26,#f3b31f,#2f7d3f)" }} />
          </Card>
        </Collapsible>
      )}

      {/* -------------------------------------------------- checklist modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[460px]" data-testid="dialog-insight-checklist">
          <DialogHeader>
            <div className="font-mono text-[9px] font-bold tracking-wide uppercase" style={{ color: "#2b3a9e" }}>Property Insight Report</div>
            <DialogTitle className="text-xl" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Sharpen your report</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Complete these for a report tailored to your plan — the more you fill in, the more it prioritizes what matters to you. Or skip for a public-record read.
            </DialogDescription>
          </DialogHeader>
          <div>
            {items.map((it, i) => (
              <div key={it.key} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" data-testid={`checklist-row-${it.key}`}>
                <span className="flex items-center justify-center rounded-md text-xs font-bold shrink-0" style={{ width: 26, height: 26, background: it.complete ? "#e9f4ec" : "#eef0fb", color: it.complete ? "#2f7d3f" : "#2b3a9e" }}>
                  {it.complete ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{it.title}</span>
                  <span className="block text-[10.5px] text-muted-foreground">{it.subtitle}</span>
                </span>
                {it.complete ? (
                  <span className="text-[11px] font-semibold" style={{ color: "#2f7d3f" }}>Done</span>
                ) : (
                  <button type="button" data-testid={`button-complete-${it.key}`} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#2b3a9e" }}
                    onClick={() => { setModalOpen(false); it.onComplete(); }}>
                    Complete <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 pt-1">
            <Button variant="outline" size="sm" data-testid="button-skip-generate-asis" onClick={() => startGenerate("as_is")}>
              Skip &amp; generate as-is
            </Button>
            <Button size="sm" className="ml-auto gap-1.5" style={{ background: "#2b3a9e" }} data-testid="button-generate-tailored" onClick={() => startGenerate("tailored")}>
              <Sparkles className="w-3.5 h-3.5" /> Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
