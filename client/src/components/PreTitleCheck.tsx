import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Home,
  Droplets,
  Building2,
  FileText,
  AlertCircle,
  Loader2,
  Info,
  ArrowRight,
  Scale
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PreTitleCheckProps {
  pin: string | null;
  address: string;
  openViolationsCount?: number;
  lienData?: any;
  propertyTaxData?: any;
  onScrollToSection?: (section: 'propertyTax' | 'liens' | 'saleHistory') => void;
  isOpen?: boolean;
  onIsOpenChange?: (v: boolean) => void;
}

interface PreTitleIssue {
  severity: 'critical' | 'high' | 'medium' | 'info';
  category: string;
  message: string;
  impact: string;
}

interface PreTitleVerdict {
  status: 'financeable' | 'difficult' | 'not_financeable';
  score: number;
  title: string;
  message: string;
  issues: PreTitleIssue[];
}

interface PreTitleCheckResult {
  success: boolean;
  fromCache: boolean;
  cacheAge?: string;
  verdict: PreTitleVerdict;
  details: {
    propertyTax: any;
    foreclosure: any;
    liens: any;
    waterBill: any;
    ownership: any;
  };
  disclaimers: string[];
  checkedItems: string[];
  notChecked: string[];
  nextSteps: { action: string; priority: string; cost?: string; timeline?: string }[];
  lastUpdated: string;
}

export function PreTitleCheck({ pin, address, openViolationsCount = 0, lienData, propertyTaxData, onScrollToSection, isOpen: isOpenProp, onIsOpenChange, children }: PreTitleCheckProps & { children?: React.ReactNode }) {
  const [isSectionOpenLocal, setIsSectionOpenLocal] = useState(false);
  const isSectionOpen = isOpenProp !== undefined ? isOpenProp : isSectionOpenLocal;
  const setIsSectionOpen = (v: boolean) => { setIsSectionOpenLocal(v); onIsOpenChange?.(v); };

  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  const { data, isLoading, error } = useQuery<PreTitleCheckResult>({
    queryKey: ['/api/pre-title-check', pin, address],
    queryFn: async () => {
      if (!pin) throw new Error('PIN required');
      const response = await apiRequest('POST', '/api/pre-title-check', {
        pin,
        address,
        openViolationsCount,
      });
      return response.json();
    },
    enabled: !!pin && !!address,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  if (!pin) {
    return (
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="bg-muted pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CardTitle className="chead">Can I Finance This Property?</CardTitle>
          </div>
          <CardDescription>PIN required to check financing eligibility</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Property PIN is needed to check public records for financing eligibility.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="bg-muted pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CardTitle className="chead">Can I Finance This Property?</CardTitle>
          </div>
          <CardDescription>Checking public records...</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Checking property tax, liens, foreclosures, and more...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="bg-muted pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CardTitle className="chead">Can I Finance This Property?</CardTitle>
          </div>
          <CardDescription>Unable to complete check</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Please verify records manually using the links below:
          </p>
          <div className="grid gap-2">
            <a href="https://www.cookcountytreasurer.com/setsearchparameters.aspx" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid="link-manual-property-tax">
              <ExternalLink className="h-4 w-4" />Cook County Treasurer (Property Tax)
            </a>
            <a href="https://ccrecorder.org/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid="link-manual-liens">
              <ExternalLink className="h-4 w-4" />Cook County Recorder (Liens & Deeds)
            </a>
            <a href="https://www.cookcountyclerkofcourt.org/CourtCaseSearch/DocketSearch" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid="link-manual-foreclosure">
              <ExternalLink className="h-4 w-4" />Cook County Circuit Court (Foreclosures)
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { verdict: rawVerdict, details, disclaimers, checkedItems, notChecked, nextSteps, fromCache, cacheAge } = data;

  // Adjust the server-calculated score using real property tax bill data if available.
  // The server doesn't see the Cook County tax bill scrape, so delinquent taxes may be
  // missed. Apply a graduated deduction based on how many installments are behind.
  const verdict = (() => {
    if (propertyTaxData?.paymentStatus !== 'delinquent') return rawVerdict;

    // Count delinquent installments across all tax years
    let delinquentInstallments = 0;
    const taxYears: { year: number; status: string; amountDue: number; installment1: number; installment2: number }[] =
      propertyTaxData.taxYears || [];
    const today = new Date();
    for (const yr of taxYears) {
      if (!yr.amountDue || yr.amountDue <= 0) continue;
      const taxYear = yr.year || 0;
      // Cook County installment due dates for tax year Y:
      //   First installment:  April 1 of year Y+1
      //   Second installment: August 1 of year Y+1 (approx — can vary)
      const firstDue  = new Date(taxYear + 1, 3, 1);  // April 1
      const secondDue = new Date(taxYear + 1, 7, 1);  // August 1
      const inst1Overdue = today >= firstDue;
      const inst2Overdue = today >= secondDue;

      if (yr.status === 'unpaid') {
        if (yr.installment1 > 0 && inst1Overdue) delinquentInstallments++;
        if (yr.installment2 > 0 && inst2Overdue) delinquentInstallments++;
      } else if (yr.status === 'partial') {
        const totalBilled = (yr.installment1 || 0) + (yr.installment2 || 0);
        const paid = totalBilled - yr.amountDue;
        // If less was paid than installment1, both installments are at least partially behind
        if (yr.installment1 > 0 && paid < yr.installment1) {
          if (inst1Overdue) delinquentInstallments++;
          if (yr.installment2 > 0 && inst2Overdue) delinquentInstallments++;
        } else if (inst2Overdue) {
          delinquentInstallments += 1;
        }
      }
    }
    // Graduated deduction: 10 / 15 / 20 / 25 points
    const deduction = delinquentInstallments <= 1 ? 10
      : delinquentInstallments === 2 ? 15
      : delinquentInstallments === 3 ? 20
      : 25;

    const adjustedScore = Math.max(0, rawVerdict.score - deduction);

    const installmentLabel = delinquentInstallments === 1 ? '1 installment' : `${delinquentInstallments} installments`;
    const taxIssue = {
      severity: 'high' as const,
      category: 'Property Tax',
      message: `Delinquent property taxes — ${installmentLabel} behind`,
      impact: 'Must be paid at closing — lenders require clear tax status',
    };

    const alreadyHasTaxIssue = rawVerdict.issues.some(i => i.category === 'Property Tax');
    const issues = alreadyHasTaxIssue ? rawVerdict.issues : [taxIssue, ...rawVerdict.issues];

    let status: 'financeable' | 'difficult' | 'not_financeable';
    let title: string;
    let message: string;
    if (adjustedScore >= 80) {
      status = 'financeable'; title = 'LIKELY FINANCEABLE'; message = 'Public records mostly clear, but verify delinquent taxes before proceeding.';
    } else if (adjustedScore >= 50) {
      status = 'difficult'; title = 'FINANCING MAY BE DIFFICULT'; message = 'Delinquent taxes may complicate financing. Review details carefully.';
    } else {
      status = 'not_financeable'; title = 'NOT FINANCEABLE'; message = 'Critical issues found. Resolve before seeking financing.';
    }

    return { ...rawVerdict, score: adjustedScore, status, title, message, issues };
  })();

  const getVerdictColors = (status: string) => {
    switch (status) {
      case 'financeable': return { bg: 'bg-emerald-600/10', border: 'border-emerald-600', text: 'text-emerald-700', icon: CheckCircle2 };
      case 'difficult': return { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-700', icon: AlertTriangle };
      case 'not_financeable': return { bg: 'bg-red-600/10', border: 'border-red-600', text: 'text-red-700', icon: XCircle };
      default: return { bg: 'bg-muted', border: 'border-border', text: 'text-foreground', icon: Info };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high': return <Badge className="bg-amber-500 text-white text-xs">High</Badge>;
      case 'medium': return <Badge className="bg-amber-400 text-white text-xs">Medium</Badge>;
      default: return <Badge variant="secondary" className="text-xs">Info</Badge>;
    }
  };

  const verdictColors = getVerdictColors(verdict.status);
  const VerdictIcon = verdictColors.icon;

  // Build enriched detail text from real Property Details data
  const taxDetail = (() => {
    if (!propertyTaxData) {
      return details.propertyTax?.status === 'current' ? 'Taxes appear current' : details.propertyTax?.message || 'Check manually';
    }
    const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const years: { year: number; billed: number; installment1: number; status: string }[] =
      (propertyTaxData.taxYears || []).slice().sort((a: any, b: any) => b.year - a.year);
    const mostRecent = years[0];   // e.g. 2025
    const priorYear  = years[1];   // e.g. 2024
    const parts: string[] = [];
    if (priorYear?.billed > 0)        parts.push(`${priorYear.year} full: ${fmt(priorYear.billed)}`);
    if (mostRecent?.installment1 > 0) parts.push(`${mostRecent.year} 1st inst: ${fmt(mostRecent.installment1)}`);
    const amountText = parts.length > 0 ? ` · ${parts.join(' · ')}` : '';

    if (propertyTaxData.paymentStatus === 'current') {
      return `Taxes current${amountText}`;
    }
    if (propertyTaxData.paymentStatus === 'delinquent') {
      return `Delinquent taxes${amountText}`;
    }
    return `Taxes${amountText || ' — verify status'}`;
  })();

  const taxStatus: 'good' | 'warning' | 'bad' | 'unknown' =
    propertyTaxData?.paymentStatus === 'current' ? 'good' :
    propertyTaxData?.paymentStatus === 'delinquent' ? 'bad' :
    details.propertyTax?.status === 'current' ? 'good' :
    details.propertyTax?.error ? 'unknown' : 'warning';

  const foreclosureDetail = (() => {
    if (lienData?.hasForeclosure === false) return 'No active foreclosure recorded';
    if (lienData?.hasForeclosure === true) return 'Active foreclosure case found';
    return details.foreclosure?.hasActiveForeclosure ? 'Active foreclosure case' : details.foreclosure?.message || 'No active foreclosure';
  })();

  const foreclosureStatus: 'good' | 'warning' | 'bad' | 'unknown' =
    lienData ? (lienData.hasForeclosure ? 'bad' : 'good') :
    details.foreclosure?.hasActiveForeclosure ? 'bad' :
    details.foreclosure?.error ? 'unknown' : 'good';

  const lienDetail = (() => {
    if (lienData) {
      const active = lienData.activeLienCount ?? 0;
      const mortgages = lienData.activeMortgageCount ?? 0;
      const parts: string[] = [];
      if (active > 0) parts.push(`${active} active ${active === 1 ? 'lien' : 'liens'}`);
      if (mortgages > 0) parts.push(`${mortgages} ${mortgages === 1 ? 'mortgage' : 'mortgages'}`);
      return parts.length > 0 ? parts.join(' · ') : 'No active liens or mortgages';
    }
    return details.liens?.hasTaxLien ? 'Tax lien on property' :
           details.liens?.hasJudgmentLien ? 'Judgment lien on property' :
           details.liens?.message || 'No active liens found';
  })();

  const lienStatus: 'good' | 'warning' | 'bad' | 'unknown' =
    lienData ? (
      lienData.hasForeclosure || lienData.activeLienCount > 0 ? 'warning' : 'good'
    ) :
    details.liens?.hasTaxLien || details.liens?.hasJudgmentLien ? 'bad' :
    details.liens?.error ? 'unknown' : 'good';

  // Detect water department liens from the recorder lien data (client-side, using lienData prop)
  const WATER_KEYWORDS = ['WATER', 'DEPT OF WATER', 'WATER MANAGEMENT', 'WATER RECLAMATION'];
  const waterDeptLiens = (lienData?.liens ?? []).filter((l: any) => {
    if (l.isReleased || l.isProbablyCleared) return false;
    const g = (l.grantor || '').toUpperCase();
    return WATER_KEYWORDS.some(kw => g.includes(kw));
  });
  const hasWaterDeptLien = waterDeptLiens.length > 0;

  // Lis pendens — active count uses the new activeListPendensCount field, falls back to total
  const activeListPendensCount = lienData?.activeListPendensCount ?? lienData?.litigation?.length ?? 0;
  const lisPendensDetail = (() => {
    const total = (lienData?.foreclosures?.length ?? 0) + (lienData?.litigation?.length ?? 0);
    const active = (lienData?.foreclosures?.length ?? 0) + activeListPendensCount;
    if (total === 0) return null;
    if (total > 0 && active === 0) return `${total} historic lis pendens — likely resolved (subsequent mortgages recorded)`;
    return `${active} active lis pendens`;
  })();

  const ownershipDetail = (() => {
    if (lienData?.ownerName) return `Owner on record: ${lienData.ownerName}`;
    return details.ownership?.currentOwner ?
      `Current owner since ${details.ownership.currentOwnerSince || 'unknown'}` :
      details.ownership?.message || 'Check ownership history';
  })();

  const ownershipStatus: 'good' | 'warning' | 'bad' | 'unknown' =
    details.ownership?.redFlags?.length > 0 ? 'warning' :
    details.ownership?.error ? 'unknown' : 'good';

  return (
    <Collapsible open={isSectionOpen} onOpenChange={setIsSectionOpen}>
      <Card className="border border-border overflow-visible" data-testid="card-pre-title-check">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="chead flex items-center gap-2">
                Can I Finance This Property?
              </CardTitle>
              <span className="text-muted-foreground text-sm">{isSectionOpen ? '▼' : '▶'}</span>
            </div>
            {!isSectionOpen && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={`text-xs ${verdict.status === 'financeable' ? 'bg-emerald-600 text-white' : verdict.status === 'difficult' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}>
                  {verdict.title}
                </Badge>
                <Badge variant="outline" className="text-xs">Score: {verdict.score}/100</Badge>
                {verdict.issues.length > 0 && (
                  <Badge className="text-xs bg-red-600 text-white">{verdict.issues.length} Issue{verdict.issues.length !== 1 ? 's' : ''}</Badge>
                )}
              </div>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-6">
            <div className={`rounded-xl p-5 border ${verdictColors.bg} ${verdictColors.border}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold uppercase tracking-wider ${verdictColors.text}`}>Financing Assessment</span>
                <VerdictIcon className={`h-6 w-6 ${verdictColors.text}`} />
              </div>
              <p className={`text-2xl font-bold font-jbmono ${verdictColors.text}`} data-testid="text-verdict-title">{verdict.title}</p>
              <p className="text-sm text-muted-foreground mt-2">{verdict.message}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score:</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${verdict.score >= 80 ? 'bg-emerald-600' : verdict.score >= 50 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${verdict.score}%` }} />
                </div>
                <span className="text-xs font-medium">{verdict.score}/100</span>
              </div>
            </div>

            {verdict.issues.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-jbmono text-[11px] font-bold uppercase tracking-[0.14em] text-[#565651] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Issues Found ({verdict.issues.length})
                </h4>
                <div className="space-y-2">
                  {verdict.issues.map((issue, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border/40" data-testid={`issue-${index}`}>
                      <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getSeverityBadge(issue.severity)}
                          <span className="text-xs text-muted-foreground">{issue.category}</span>
                        </div>
                        <p className="text-sm font-medium mt-1">{issue.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{issue.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3">
              <DetailRow
                icon={<FileText className="h-4 w-4" />}
                label="Property Taxes"
                status={taxStatus}
                detail={taxDetail}
                onScrollToSection={onScrollToSection ? () => onScrollToSection('propertyTax') : undefined}
                externalLink={!onScrollToSection ? details.propertyTax?.manualCheckUrl : undefined}
              />
              <DetailRow
                icon={<Building2 className="h-4 w-4" />}
                label="Foreclosure"
                status={foreclosureStatus}
                detail={foreclosureDetail}
                onScrollToSection={onScrollToSection ? () => onScrollToSection('liens') : undefined}
                externalLink={!onScrollToSection ? details.foreclosure?.manualCheckUrl : undefined}
              />
              <DetailRow
                icon={<Scale className="h-4 w-4" />}
                label="Liens & Mortgages"
                status={lienStatus}
                detail={lienDetail}
                onScrollToSection={onScrollToSection ? () => onScrollToSection('liens') : undefined}
                externalLink={!onScrollToSection ? details.liens?.manualCheckUrl : undefined}
              />
              <DetailRow
                icon={<Droplets className="h-4 w-4" />}
                label="Water Bill"
                status={hasWaterDeptLien ? 'warning' : details.waterBill?.isDelinquent ? 'warning' : details.waterBill?.error ? 'unknown' : 'good'}
                detail={hasWaterDeptLien
                  ? `${waterDeptLiens.length} Water Dept lien${waterDeptLiens.length !== 1 ? 's' : ''} on record — outstanding water charges attach to the property`
                  : details.waterBill?.isDelinquent
                    ? `$${details.waterBill.balance?.toLocaleString()} outstanding`
                    : details.waterBill?.message || 'No outstanding balance'
                }
                externalLink={details.waterBill?.manualCheckUrl}
                onScrollToSection={hasWaterDeptLien && onScrollToSection ? () => onScrollToSection('liens') : undefined}
              />
              {lisPendensDetail && (
                <DetailRow
                  icon={<Scale className="h-4 w-4" />}
                  label="Lis Pendens"
                  status={activeListPendensCount > 0 ? 'warning' : 'good'}
                  detail={lisPendensDetail}
                  onScrollToSection={onScrollToSection ? () => onScrollToSection('liens') : undefined}
                />
              )}
              <DetailRow
                icon={<Home className="h-4 w-4" />}
                label="Ownership"
                status={ownershipStatus}
                detail={ownershipDetail}
                onScrollToSection={onScrollToSection ? () => onScrollToSection('saleHistory') : undefined}
                externalLink={!onScrollToSection ? details.ownership?.manualCheckUrl : undefined}
              />
            </div>

            <Separator />

            <Collapsible open={isDisclaimerOpen} onOpenChange={setIsDisclaimerOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-disclaimer">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Important Disclaimer
                  </span>
                  <span className="text-muted-foreground text-sm">{isDisclaimerOpen ? '▼' : '▶'}</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div className="p-4 rounded-lg bg-secondary border border-border">
                  <p className="text-sm font-medium text-foreground mb-3">
                    This is a PRELIMINARY check using publicly available records only.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">What we checked:</p>
                      <ul className="space-y-1">
                        {checkedItems.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">What we CANNOT check:</p>
                      <ul className="space-y-1">
                        {notChecked.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                            <XCircle className="h-3 w-3 text-red-500" />{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {children && (
              <div className="border-t border-border/40 pt-4 mt-2">
                {children}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DetailRow({ 
  icon, label, status, detail, onScrollToSection, externalLink
}: { 
  icon: React.ReactNode; 
  label: string; 
  status: 'good' | 'warning' | 'bad' | 'unknown'; 
  detail: string; 
  onScrollToSection?: () => void;
  externalLink?: string;
}) {
  const statusColors = {
    good: 'text-foreground',
    warning: 'text-foreground',
    bad: 'text-foreground',
    unknown: 'text-muted-foreground',
  };

  const statusIcons = {
    good: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    bad: <XCircle className="h-4 w-4 text-red-500" />,
    unknown: <Info className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border/30">
      <div className={statusColors[status]}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusIcons[status]}
        {onScrollToSection && (
          <button
            onClick={onScrollToSection}
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
            title="View in Property Details"
          >
            View <ArrowRight className="h-3 w-3" />
          </button>
        )}
        {externalLink && (
          <a href={externalLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="Verify manually">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
