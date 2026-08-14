import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertScenarioSchema, PROJECT_TYPES, SPONSOR_TYPES, type Scenario } from "@shared/schema";
import { useDeleteScenario } from "@/hooks/use-runs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, TrendingUp, AlertCircle, CheckCircle2, Factory, Hammer, Users, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ScenarioCardProps {
  scenario: Scenario;
  runId: number;
}

export function ScenarioCard({ scenario, runId }: ScenarioCardProps) {
  const deleteScenario = useDeleteScenario();

  // Feasibility Logic (Frontend Display)
  const getFeasibility = (size: string) => {
    const amount = parseFloat(size);
    if (isNaN(amount)) return { label: "Unknown", color: "text-muted-foreground", bg: "bg-secondary", border: "border-border" };
    
    if (amount < 3000000) return { label: "Very unlikely", color: "text-foreground", bg: "bg-secondary", border: "border-border" };
    if (amount < 5000000) return { label: "Marginal (pooling only)", color: "text-foreground", bg: "bg-secondary", border: "border-orange-200" };
    if (amount < 7000000) return { label: "Moderate (pooling likely)", color: "text-foreground", bg: "bg-secondary", border: "border-border" };
    if (amount < 10000000) return { label: "Feasible", color: "text-foreground", bg: "bg-secondary", border: "border-border" };
    return { label: "Strong", color: "text-foreground", bg: "bg-secondary", border: "border-border" };
  };

  const feasibility = getFeasibility(scenario.projectSize);
  
  const formatCurrency = (val: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(val));
  };

  const activeFeatures = [
    { key: 'workforceTraining', label: 'Workforce Training', icon: Hammer },
    { key: 'reentryHiring', label: 'Re-entry Hiring', icon: Users },
    { key: 'onsiteManufacturing', label: 'Manufacturing', icon: Factory },
    { key: 'adaptiveReuse', label: 'Adaptive Reuse', icon: Home },
    { key: 'corridorImprovements', label: 'Corridor Impr.', icon: TrendingUp },
    { key: 'nonprofitAnchor', label: 'Non-profit', icon: Users },
    { key: 'jobCreationFocus', label: 'Job Creation', icon: Users },
  ].filter(f => scenario[f.key as keyof Scenario]);

  return (
    <Card className="overflow-hidden border-border/60 border-border hover:border-foreground transition-all duration-300 group">
      <CardHeader className="bg-muted pb-4 border-b border-border/40">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em]">{scenario.name}</CardTitle>
              <Badge variant="outline" className="text-xs font-normal bg-background/50 backdrop-blur-sm">
                {scenario.projectType}
              </Badge>
            </div>
            <CardDescription className="flex items-center gap-2 text-xs">
              <span>{scenario.sponsorType} Sponsor</span>
              <span>•</span>
              <span className="font-mono">{formatCurrency(scenario.projectSize)}</span>
            </CardDescription>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => deleteScenario.mutate({ id: scenario.id, runId })}
            disabled={deleteScenario.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 grid gap-6">
        {/* Feasibility Indicator */}
        <div className={`rounded-xl p-4 border ${feasibility.bg} ${feasibility.border}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-semibold uppercase tracking-wider ${feasibility.color}`}>
              NMTC Feasibility
            </span>
            {feasibility.label === "Strong" || feasibility.label === "Feasible" ? (
              <CheckCircle2 className={`w-5 h-5 ${feasibility.color}`} />
            ) : (
              <AlertCircle className={`w-5 h-5 ${feasibility.color}`} />
            )}
          </div>
          <p className={`text-2xl font-bold font-display ${feasibility.color}`}>
            {feasibility.label}
          </p>
          <p className="text-xs text-muted-foreground mt-2 opacity-80">
            Based on total project size of {formatCurrency(scenario.projectSize)}
          </p>
        </div>

        {/* Features Grid */}
        {activeFeatures.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Community Benefits
            </h4>
            <div className="flex flex-wrap gap-2">
              {activeFeatures.map((feat) => (
                <Badge key={feat.key} variant="secondary" className="px-3 py-1.5 flex items-center gap-1.5 bg-background border border-border/60">
                  <feat.icon className="w-3.5 h-3.5 text-primary/70" />
                  {feat.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
