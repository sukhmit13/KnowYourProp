import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, RefreshCw, ArrowLeft, FileText, AlertTriangle } from "lucide-react";
import { useRun, usePublicRun } from "@/hooks/use-runs";
import { useLocation } from "wouter";

export default function InsightReport() {
  const [, params] = useRoute("/runs/:id/insight-report");
  const [, publicParams] = useRoute("/report/:id/insight-report");
  const runId = parseInt(params?.id || publicParams?.id || "0");
  const [, navigate] = useLocation();
  const { isSubscriber } = useAuth();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPublicRoute = !!publicParams?.id;

  const { data: privateRun } = useRun(isPublicRoute ? 0 : runId);
  const { data: publicRun } = usePublicRun(isPublicRoute ? runId : 0);
  const run = privateRun || publicRun;

  const hasPurchased = !!(run as any)?.purchasedAt;
  const canAccess = isSubscriber || hasPurchased;

  const { data: cached, isLoading: loadingCached } = useQuery<any, Error, { html: string; generatedAt: string; generatedForProjectType: string | null | undefined } | undefined>({
    queryKey: [`/api/runs/${runId}/insight-report`],
    enabled: !!runId && canAccess,
    retry: false,
    select: (data: any) => {
      // Handle both old JSON format ({content:{html:...}}) and new flat format ({html:...})
      const html = data?.html || data?.content?.html;
      const generatedAt = data?.generatedAt;
      // generatedForProjectType: undefined = legacy report (unknown, no banner);
      // null = generated with no project type selected; string = generated for that type
      const src = data?.content && typeof data.content === "object" ? data.content : data;
      const generatedForProjectType =
        src && typeof src === "object" && "generatedForProjectType" in src
          ? (src.generatedForProjectType ?? null)
          : undefined;
      const mode = src && typeof src === "object" && typeof src.mode === "string" ? src.mode : null;
      return html ? { html, generatedAt, generatedForProjectType, mode } : undefined;
    },
  });

  const [html, setHtml] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string | null | undefined>(undefined);
  const [reportMode, setReportMode] = useState<string | null>(null);

  useEffect(() => {
    if (cached?.html) {
      setHtml(cached.html);
      setGeneratedAt(cached.generatedAt ?? null);
      setGeneratedFor(cached.generatedForProjectType);
      setReportMode((cached as any).mode ?? null);
    }
  }, [cached]);

  const generateMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/runs/${runId}/insight-report/generate`)).json(),
    onSuccess: (data: any) => {
      const newHtml = data?.html || data?.content?.html;
      if (newHtml) setHtml(newHtml);
      setGeneratedAt(data?.generatedAt ?? null);
      setGeneratedFor(data?.generatedForProjectType ?? null);
      setReportMode(data?.mode ?? null);
      queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}/insight-report`] });
      toast({ title: "Insight report generated" });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  // Auto-generate on first visit: if there's no saved report, kick off
  // generation immediately — no extra click needed.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!runId || !canAccess || loadingCached) return;
    if (cached?.html || html) return;
    autoStartedRef.current = true;
    generateMutation.mutate();
  }, [runId, canAccess, loadingCached, cached, html]);

  // Stale flag: the run's project type changed since this report was generated.
  // Legacy reports (generatedFor === undefined) never show the banner.
  // As-is (public record) reports intentionally have no project type — never stale.
  const currentProjectType = (run as any)?.lastProjectType ?? null;
  const isStaleProjectType = !!html && reportMode !== "as_is" && generatedFor !== undefined && generatedFor !== currentProjectType;

  const handleOpenFull = () => {
    window.open(`/api/runs/${runId}/insight-report/view`, "_blank");
  };

  const isGenerating = generateMutation.isPending;

  if (!runId) {
    return <div className="p-8 font-mono text-sm">Invalid report ID.</div>;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white text-foreground px-4 py-3 flex items-center gap-3 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => navigate(isPublicRoute ? `/report/${runId}` : `/run/${runId}`)}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Report</span>
        </Button>

        <div className="flex-1 min-w-0">
          <span className="font-mono text-xs text-muted-foreground truncate block">
            PROPERTY INSIGHT REPORT
            {generatedAt && (
              <span className="ml-2 text-muted-foreground/70">
                — Generated {new Date(generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canAccess && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={isGenerating}
              data-testid="button-regenerate-insight"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="hidden sm:inline">{html ? "Regenerate" : "Generate"}</span>
            </Button>
          )}
          {html && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleOpenFull}
              data-testid="button-open-full-insight"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open / Print</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stale project type banner */}
      {html && !isGenerating && isStaleProjectType && (
        <div className="bg-secondary border-b border-border px-4 py-2 flex items-center gap-2 font-mono text-xs" data-testid="banner-stale-report">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            This report was generated {generatedFor ? `for "${generatedFor}"` : "before a project type was selected"}
            {" — "}the project type is now {currentProjectType ? `"${currentProjectType}"` : "unset"}. Regenerate to reflect the current project type.
          </span>
        </div>
      )}

      {/* Loading */}
      {loadingCached && (
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!loadingCached && !html && !isGenerating && (
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-8 text-center gap-6">
          <FileText className="w-12 h-12 text-muted-foreground" />
          <div className="space-y-2">
            <h2 className="font-mono text-xl font-bold">No insight report yet</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              {canAccess
                ? "Generate a one-page AI-powered analysis of this property — zoning, title, taxes, market demand, and three concrete next steps."
                : "A purchase or active subscription is required to generate insight reports."}
            </p>
          </div>
          {canAccess && (
            <Button
              onClick={() => generateMutation.mutate()}
              className="gap-2 font-mono"
              data-testid="button-generate-insight-empty"
            >
              <FileText className="w-4 h-4" />
              Generate Insight Report
            </Button>
          )}
        </div>
      )}

      {/* Generating spinner */}
      {isGenerating && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-mono text-sm">Analyzing property data…</p>
          <p className="text-xs text-muted-foreground/60">This takes about 30–60 seconds</p>
        </div>
      )}

      {/* HTML report in iframe */}
      {html && !isGenerating && (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="flex-1 w-full border-0"
          style={{ minHeight: "calc(100vh - 53px)" }}
          title="Property Insight Report"
          sandbox="allow-same-origin allow-popups"
        />
      )}
    </div>
  );
}
