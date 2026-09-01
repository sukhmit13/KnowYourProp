import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SubscriberGate } from "@/components/SubscriberGate";
import { EthnicMortgageTrends } from "@/components/EthnicMortgageTrends";
import { TaxAppealAttorneyView } from "@/components/TaxAppealAttorneyView";
import { LenderRankingsView } from "@/components/LenderRankingsView";
import { ArchitectRankingsView } from "@/components/ArchitectRankingsView";
import { ExpeditorRankingsView } from "@/components/ExpeditorRankingsView";
import { GeneralContractorRankingsView } from "@/components/GeneralContractorRankingsView";
import { MinorityContractorDirectoryView } from "@/components/MinorityContractorDirectoryView";
import { CTARankingsView } from "@/components/CTARankingsView";
import { CommercialLenderRankingsView } from "@/components/CommercialLenderRankingsView";
import { WestTownTaxDelinquencyView } from "@/components/WestTownTaxDelinquencyView";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { 
  MapPin, 
  Building2, 
  Baby, 
  ChevronRight, 
  AlertTriangle,
  Users,
  Home,
  Scale,
  Award,
  Briefcase,
  CheckCircle,
  CheckCircle2,
  ExternalLink,
  Car,
  Zap,
  Hotel,
  ShoppingCart,
  Coffee,
  Fuel,
  Landmark,
  DollarSign,
  Hammer,
  Calculator,
  TrendingUp,
  Pencil,
  ClipboardList,
  HardHat,
  Menu,
  Train,
  Search
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TopCommunityArea {
  name: string;
  id: string;
  childrenUnder5: number;
  licensedSlots: number;
  childrenPerSlot: number | null;
  status: string;
}

interface TopZip {
  zipCode: string;
  childrenUnder5: number;
  licensedSlots: number;
  childrenPerSlot: number | null;
  status: string;
}

interface AttorneyData {
  name: string;
  totalCases: number;
  approvedCount: number;
  deniedCount: number;
  approvalRate: number | null;
  isVerifiedAttorney: boolean | null;
  mostRecentCaseDate?: string;
}

interface WardAttorneyData {
  ward: number;
  topAttorneys: AttorneyData[];
  totalCases: number;
}

interface AttorneyDiscoveryResponse {
  indexBuilt: boolean;
  byWard: WardAttorneyData[];
  citywide: AttorneyData[];
  totalCityCases?: number;
}

interface RankingsResponse {
  type: string;
  label: string;
  byZip: { zip: string; count: number }[];
  byCommunityArea: { communityArea: string; count: number }[];
  error?: string;
}

function useTopCommunities() {
  return useQuery<TopCommunityArea[]>({
    queryKey: ['/api/discovery/top-communities'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/top-communities', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch top communities');
      return res.json();
    }
  });
}

function useTopZips() {
  return useQuery<TopZip[]>({
    queryKey: ['/api/discovery/top-zips'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/top-zips', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch top ZIPs');
      return res.json();
    }
  });
}

function useAttorneyDiscovery() {
  const search = (() => {
    try { return new URLSearchParams(window.location.search).get('search')?.trim() || ''; } catch { return ''; }
  })();
  return useQuery<AttorneyDiscoveryResponse>({
    queryKey: ['/api/discovery/attorneys', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/discovery/attorneys${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch attorney data');
      return res.json();
    }
  });
}

function useRankings(type: string) {
  return useQuery<RankingsResponse>({
    queryKey: ['/api/discovery/rankings', type],
    queryFn: async () => {
      const res = await fetch(`/api/discovery/rankings/${type}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch rankings');
      return res.json();
    },
    enabled: !!type
  });
}

function getStatusColor(status: string): string {
  if (status.toLowerCase().includes('desert')) return '';
  if (status.toLowerCase().includes('underserved')) return '';
  return '';
}

function getArdcUrl(name: string): string {
  const parts = name.split(' ').filter(p => p.length > 0);
  const firstName = parts[0] || '';
  const lastName = parts[parts.length - 1] || '';
  return `https://www.iardc.org/Lawyer/Search?LastName=${encodeURIComponent(lastName)}&FirstName=${encodeURIComponent(firstName)}`;
}

function ChildcareView() {
  const { data: topCommunities, isLoading: loadingCommunities } = useTopCommunities();
  const { data: topZips, isLoading: loadingZips } = useTopZips();

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                <Building2 className="w-5 h-5" style={{ color: '#2b3a9e' }} />
                Community Areas with Childcare Shortage
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Areas with more children than slots (ratio &gt; 1:1)
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingCommunities ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : topCommunities?.length ? (
                (() => {
                  const maxRatio = Math.max(...topCommunities.map(c => c.childrenPerSlot || 0), 1);
                  return topCommunities.map((community, index) => (
                    <Link
                      key={community.id}
                      href={`/area/community/${encodeURIComponent(community.id)}?from=childcare`}
                    >
                      <div className="dsc-row hover-elevate cursor-pointer" data-testid={`card-community-${index}`}>
                        <span className="dsc-rk">{index + 1}</span>
                        <div className="dsc-bd">
                          <div className="dsc-nm truncate">{community.name}</div>
                          <div className="dsc-sub">{community.childrenUnder5.toLocaleString()} children · {community.licensedSlots.toLocaleString()} slots</div>
                          <div className="dsc-bar"><span style={{ width: `${Math.max(Math.round(((community.childrenPerSlot || 0) / maxRatio) * 100), 3)}%` }} /></div>
                        </div>
                        <div className="dsc-right">
                          <span className={community.status.toLowerCase().includes('desert') ? 'dsc-chip dsc-chip-amber' : 'dsc-chip'}>
                            {community.status.toLowerCase().includes('desert') ? 'Desert' : community.status}{community.childrenPerSlot != null ? ` · ${community.childrenPerSlot.toFixed(1)}/slot` : ''}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </Link>
                  ));
                })()
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No community area data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                <MapPin className="w-5 h-5" style={{ color: '#2b3a9e' }} />
                ZIP Codes with Childcare Shortage
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Areas with more children than slots (ratio &gt; 1:1)
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingZips ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : topZips?.length ? (
                (() => {
                  const maxRatio = Math.max(...topZips.map(z => z.childrenPerSlot || 0), 1);
                  return topZips.map((zip, index) => (
                    <Link
                      key={zip.zipCode}
                      href={`/area/zip/${zip.zipCode}?from=childcare`}
                    >
                      <div className="dsc-row hover-elevate cursor-pointer" data-testid={`card-zip-${index}`}>
                        <span className="dsc-rk">{index + 1}</span>
                        <div className="dsc-bd">
                          <div className="dsc-nm">{zip.zipCode}</div>
                          <div className="dsc-sub">{zip.childrenUnder5.toLocaleString()} children · {zip.licensedSlots.toLocaleString()} slots</div>
                          <div className="dsc-bar"><span style={{ width: `${Math.max(Math.round(((zip.childrenPerSlot || 0) / maxRatio) * 100), 3)}%` }} /></div>
                        </div>
                        <div className="dsc-right">
                          <span className={zip.status.toLowerCase().includes('desert') ? 'dsc-chip dsc-chip-amber' : 'dsc-chip'}>
                            {zip.status.toLowerCase().includes('desert') ? 'Desert' : zip.status}{zip.childrenPerSlot != null ? ` · ${zip.childrenPerSlot.toFixed(1)}/slot` : ''}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </Link>
                  ));
                })()
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No ZIP code data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-4 bg-secondary border border-border"
        data-testid="info-childcare-data"
      >
        <div className="flex items-start gap-3">
          <Baby className="w-5 h-5 text-foreground mt-0.5 shrink-0" />
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider" data-testid="text-childcare-info-title">About Childcare Shortage Areas</h3>
            <p className="text-sm text-muted-foreground mt-1 font-body">
              Only areas with a childcare shortage are shown (more than 1 child per licensed slot). 
              Areas with 3+ children per slot are "Childcare Deserts", 2-3 are "Underserved", and 1-2 are "Moderate Shortage". 
              Areas at 1:1 ratio or better have adequate childcare and are not listed.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Day Care Needs Estimator - Citywide Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
              <Calculator className="w-5 h-5" style={{ color: '#2b3a9e' }} />
              Chicago Day Care Needs Estimator
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Estimated new daycares needed in top shortage areas to reach 1:1 child-to-slot ratio
            </p>
          </CardHeader>
          <CardContent>
            {(loadingCommunities || loadingZips) ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (() => {
              const avgDaycareCapacity = 78;
              
              const communityTotals = topCommunities?.reduce((acc, c) => ({
                children: acc.children + c.childrenUnder5,
                slots: acc.slots + c.licensedSlots
              }), { children: 0, slots: 0 }) || { children: 0, slots: 0 };
              
              const zipTotals = topZips?.reduce((acc, z) => ({
                children: acc.children + z.childrenUnder5,
                slots: acc.slots + z.licensedSlots
              }), { children: 0, slots: 0 }) || { children: 0, slots: 0 };
              
              const communityGap = communityTotals.children - communityTotals.slots;
              const zipGap = zipTotals.children - zipTotals.slots;
              
              const communityDaycaresNeeded = communityGap > 0 ? Math.ceil(communityGap / avgDaycareCapacity) : 0;
              const zipDaycaresNeeded = zipGap > 0 ? Math.ceil(zipGap / avgDaycareCapacity) : 0;
              
              return (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* By Community Area */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      By Community Areas (Top 10 Shortage)
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="dsc-et">
                        <div className="dsc-et-l">Children</div>
                        <div className="dsc-et-n">{communityTotals.children.toLocaleString()}</div>
                      </div>
                      <div className="dsc-et">
                        <div className="dsc-et-l">Slots</div>
                        <div className="dsc-et-n">{communityTotals.slots.toLocaleString()}</div>
                      </div>
                      <div className="dsc-et">
                        <div className="dsc-et-l">Gap</div>
                        <div className="dsc-et-n">{communityGap > 0 ? `\u2212${communityGap.toLocaleString()}` : `+${Math.abs(communityGap).toLocaleString()}`}</div>
                      </div>
                    </div>
                    {communityGap > 0 ? (
                      <div className="dsc-needed">
                        <span className="dsc-needed-l">Daycares Needed</span>
                        <span className="dsc-needed-n" data-testid="text-community-daycares-needed">{communityDaycaresNeeded}</span>
                      </div>
                    ) : (
                      <div className="bg-secondary p-4 border border-border flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-foreground" />
                        <span className="text-sm text-foreground">Adequate capacity in these areas</span>
                      </div>
                    )}
                  </div>
                  
                  {/* By ZIP Code */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      By ZIP Codes (Top 10 Shortage)
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="dsc-et">
                        <div className="dsc-et-l">Children</div>
                        <div className="dsc-et-n">{zipTotals.children.toLocaleString()}</div>
                      </div>
                      <div className="dsc-et">
                        <div className="dsc-et-l">Slots</div>
                        <div className="dsc-et-n">{zipTotals.slots.toLocaleString()}</div>
                      </div>
                      <div className="dsc-et">
                        <div className="dsc-et-l">Gap</div>
                        <div className="dsc-et-n">{zipGap > 0 ? `\u2212${zipGap.toLocaleString()}` : `+${Math.abs(zipGap).toLocaleString()}`}</div>
                      </div>
                    </div>
                    {zipGap > 0 ? (
                      <div className="dsc-needed">
                        <span className="dsc-needed-l">Daycares Needed</span>
                        <span className="dsc-needed-n" data-testid="text-zip-daycares-needed">{zipDaycaresNeeded}</span>
                      </div>
                    ) : (
                      <div className="bg-secondary p-4 border border-border flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-foreground" />
                        <span className="text-sm text-foreground">Adequate capacity in these areas</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
              Formula: (Children under 5 - Total slots) ÷ 78 = Estimated daycares needed<br/>
              <span className="italic">78 is the average daycare capacity in Chicago. Based on Top 10 shortage areas only.</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

function AttorneyView() {
  const { data: attorneyData, isLoading } = useAttorneyDiscovery();

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-8">
        <Card className="border border-border">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!attorneyData?.indexBuilt) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">ZBA Data Not Available</h3>
        <p className="text-muted-foreground">
          The ZBA history index needs to be built first. Run the "Refresh ZBA index" script to populate attorney data.
        </p>
      </div>
    );
  }

  const INDIGO = '#2b3a9e';
  const INDIGO_SOFT = '#ecedf9';
  const NEUTRAL_PILL = '#f1efe9';
  const INK2 = '#565651';

  const ardcLink = (name: string, testid: string) => (
    <a
      href={getArdcUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs hover:underline shrink-0 font-medium"
      style={{ color: INDIGO }}
      data-testid={testid}
      onClick={(e) => e.stopPropagation()}
    >
      ARDC ↗
    </a>
  );

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8 items-start">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color: INDIGO }} />
                Top Attorneys by Ward
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Most active wards with their top zoning attorneys · ranked by case count
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {attorneyData.byWard?.length ? (
                attorneyData.byWard.map((ward) => (
                  <div 
                    key={ward.ward}
                    className="p-4 border rounded-lg"
                    style={{ borderColor: '#eae8e2' }}
                    data-testid={`card-ward-${ward.ward}`}
                  >
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b" style={{ borderColor: '#eae8e2' }}>
                      <span
                        className="font-jbmono text-[11px] font-bold tracking-wide px-2 py-0.5 rounded"
                        style={{ background: INDIGO_SOFT, color: INDIGO }}
                      >
                        WARD {ward.ward}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ward.totalCases} total cases
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {ward.topAttorneys.map((attorney, aIndex) => (
                        <div 
                          key={aIndex}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-jbmono text-xs font-bold shrink-0" style={{ color: INDIGO }}>
                              #{aIndex + 1}
                            </span>
                            <span className="truncate font-semibold">
                              {attorney.name}
                            </span>
                            {ardcLink(attorney.name, `link-ardc-ward-${ward.ward}-${aIndex}`)}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ background: NEUTRAL_PILL, color: INK2 }}
                            >
                              {attorney.totalCases} cases
                            </span>
                            {attorney.approvalRate !== null && (
                              <span className="text-xs text-muted-foreground">
                                {attorney.approvalRate.toFixed(0)}% approved
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No ward attorney data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                <Award className="w-4 h-4" style={{ color: INDIGO }} />
                Top Citywide Attorneys
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Most ZBA cases across Chicago · ranked by case count
                {attorneyData.totalCityCases && (
                  <span className="ml-1">({attorneyData.totalCityCases.toLocaleString()} total)</span>
                )}
              </p>
            </CardHeader>
            <CardContent>
              {attorneyData.citywide?.length ? (
                attorneyData.citywide.map((attorney, index) => (
                  <div 
                    key={index}
                    className={`py-3 ${index > 0 ? 'border-t' : ''}`}
                    style={index > 0 ? { borderColor: '#eae8e2' } : undefined}
                    data-testid={`card-attorney-citywide-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="font-jbmono text-xs font-bold mt-0.5 shrink-0" style={{ color: INDIGO }}>
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">
                              {attorney.name}
                            </span>
                            {ardcLink(attorney.name, `link-ardc-citywide-${index}`)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {attorney.totalCases} cases · {attorney.approvedCount} approved
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {attorney.approvalRate !== null && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ background: NEUTRAL_PILL, color: INK2 }}
                          >
                            {attorney.approvalRate.toFixed(0)}% approved
                          </span>
                        )}
                        {attorney.mostRecentCaseDate && (
                          <span className="text-xs text-muted-foreground">
                            Last {attorney.mostRecentCaseDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No attorney data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-4 border border-border rounded-lg"
        style={{ background: '#faf9f6' }}
        data-testid="info-attorney-data"
      >
        <div className="flex items-start gap-3">
          <Scale className="w-4 h-4 mt-0.5 shrink-0" style={{ color: INDIGO }} />
          <div>
            <h3 className="font-jbmono text-xs font-bold uppercase tracking-[0.08em]" data-testid="text-attorney-info-title">About Zoning Attorney Data</h3>
            <p className="text-sm text-muted-foreground mt-1 font-body">
              Factual public records from Chicago Zoning Board of Appeals resolutions over the past 5 years — not endorsements, rankings of quality, or predictions of outcome. Self-represented cases are excluded. Attorneys with fewer than 2 cases are not shown. Approval rates are historical and shown only for attorneys with 5+ decided cases; a high rate reflects past case mix, not a guarantee.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

type ViewType = 'childcare' | 'attorneys' | 'evs' | 'ev-stations' | 'hotels' | 'grocery' | 'coffee' | 'gas-stations' | 'sbif' | 'nmtc' | 'ethnic-mortgage' | 'tax-appeal-attorneys' | 'lender-rankings' | 'commercial-lender-rankings' | 'architect-rankings' | 'expeditor-rankings' | 'gc-rankings' | 'minority-contractors' | 'cta-rankings' | 'west-town-tax-delinquency';

const rankingViewConfig: Record<string, { icon: typeof Car; title: string; color: string; bgColor: string; countLabel?: string }> = {
  'evs': { icon: Car, title: 'EV Registrations', color: 'text-foreground', bgColor: 'bg-secondary' },
  'ev-stations': { icon: Zap, title: 'EV Charging Stations', color: 'text-foreground', bgColor: 'bg-secondary' },
  'hotels': { icon: Hotel, title: 'Hotels', color: 'text-foreground', bgColor: 'bg-secondary' },
  'grocery': { icon: ShoppingCart, title: 'Grocery Stores', color: 'text-foreground', bgColor: 'bg-secondary' },
  'coffee': { icon: Coffee, title: 'Coffee Shops & Cafes', color: 'text-foreground', bgColor: 'bg-secondary' },
  'gas-stations': { icon: Fuel, title: 'Gas Stations', color: 'text-foreground', bgColor: 'bg-secondary' },
  'sbif': { icon: Landmark, title: 'SBIF/TIF Districts', color: 'text-foreground', bgColor: 'bg-secondary', countLabel: 'zones' },
  'nmtc': { icon: DollarSign, title: 'NMTC Coverage', color: 'text-foreground', bgColor: 'bg-secondary', countLabel: '% coverage' },
};

function RankingsView({ type }: { type: string }) {
  const { data, isLoading, error } = useRankings(type);
  const config = rankingViewConfig[type] || rankingViewConfig['evs'];
  const IconComponent = config.icon;

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-8">
        <Card className="border border-border">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Data Not Available</h3>
        <p className="text-muted-foreground">
          {data?.error || 'Unable to load ranking data. Please try again later.'}
        </p>
      </div>
    );
  }

  const hasZipData = data?.byZip && data.byZip.length > 0;
  const hasCaData = data?.byCommunityArea && data.byCommunityArea.length > 0;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {hasZipData && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border border-border">
              <CardHeader className="pb-4">
                <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                  <MapPin className="w-5 h-5" style={{ color: '#2b3a9e' }} />
                  Top 10 ZIP Codes
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  By {data?.label || config.title}
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const maxCount = Math.max(...(data?.byZip.map(i => i.count) || [1]), 1);
                  return data?.byZip.map((item, index) => (
                    <Link 
                      key={item.zip}
                      href={`/area/zip/${item.zip}?from=${type}`}
                    >
                      <div className="dsc-row hover-elevate cursor-pointer" data-testid={`card-zip-${item.zip}`}>
                        <span className="dsc-rk">{index + 1}</span>
                        <div className="dsc-bd">
                          <div className="dsc-nm">{item.zip}</div>
                          <div className="dsc-bar"><span style={{ width: `${Math.max(Math.round((item.count / maxCount) * 100), 3)}%` }} /></div>
                        </div>
                        <div className="dsc-right">
                          <span className="dsc-val">{config.countLabel ? `${item.count}${config.countLabel.startsWith('%') ? '' : ' '}${config.countLabel}` : item.count.toLocaleString()}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ));
                })()}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {hasCaData && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border border-border">
              <CardHeader className="pb-4">
                <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                  <Building2 className="w-5 h-5" style={{ color: '#2b3a9e' }} />
                  Top 10 Community Areas
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  By {data?.label || config.title}
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const maxCount = Math.max(...(data?.byCommunityArea.map(i => i.count) || [1]), 1);
                  return data?.byCommunityArea.map((item, index) => (
                    <Link 
                      key={item.communityArea}
                      href={`/area/community/${encodeURIComponent(item.communityArea)}?from=${type}`}
                    >
                      <div className="dsc-row hover-elevate cursor-pointer" data-testid={`card-ca-${index}`}>
                        <span className="dsc-rk">{index + 1}</span>
                        <div className="dsc-bd">
                          <div className="dsc-nm capitalize">{item.communityArea.toLowerCase()}</div>
                          <div className="dsc-bar"><span style={{ width: `${Math.max(Math.round((item.count / maxCount) * 100), 3)}%` }} /></div>
                        </div>
                        <div className="dsc-right">
                          <span className="dsc-val">{config.countLabel ? `${item.count}${config.countLabel.startsWith('%') ? '' : ' '}${config.countLabel}` : item.count.toLocaleString()}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ));
                })()}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`mt-8 p-4 ${config.bgColor} border border-border`}
        data-testid="info-rankings-data"
      >
        <div className="flex items-start gap-3">
          <IconComponent className={`w-5 h-5 ${config.color} mt-0.5 shrink-0`} />
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider">About {config.title} Data</h3>
            <p className="text-sm text-muted-foreground mt-1 font-body">
              {type === 'evs' && 'EV registration data sourced from Illinois Secretary of State monthly reports. Shows registered electric vehicles as of January 2026.'}
              {type === 'ev-stations' && 'EV charging station data from Chicago Data Portal. Includes public charging locations with Level 2 and DC fast chargers.'}
              {type === 'hotels' && 'Hotel data from Chicago business licenses. Includes all licensed hotel establishments in the city.'}
              {type === 'grocery' && 'Grocery store data from Chicago Data Portal. Includes all retail food stores with valid business licenses.'}
              {type === 'coffee' && 'Coffee shop and cafe data from Chicago business licenses. Includes cafes, coffee shops, and similar establishments.'}
              {type === 'gas-stations' && 'Gas station data from Chicago business licenses. Includes all licensed filling stations in the city.'}
              {type === 'sbif' && 'SBIF (Small Business Improvement Fund) operates within TIF districts. Areas are ranked by number of overlapping TIF zones.'}
              {type === 'nmtc' && 'NMTC (New Markets Tax Credit) eligibility is estimated by census tract coverage. Higher percentages indicate greater likelihood of qualifying.'}
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

const validViewTypes: ViewType[] = ['childcare', 'attorneys', 'evs', 'ev-stations', 'hotels', 'grocery', 'coffee', 'gas-stations', 'sbif', 'nmtc', 'ethnic-mortgage', 'tax-appeal-attorneys', 'lender-rankings', 'commercial-lender-rankings', 'architect-rankings', 'expeditor-rankings', 'gc-rankings', 'minority-contractors', 'cta-rankings', 'west-town-tax-delinquency'];
const professionalViewTypes: ViewType[] = ['attorneys', 'tax-appeal-attorneys', 'architect-rankings', 'expeditor-rankings', 'gc-rankings', 'minority-contractors'];

const professionalSearchLabels: Partial<Record<ViewType, string>> = {
  attorneys: 'Search zoning attorneys by name',
  'tax-appeal-attorneys': 'Search tax appeal attorneys by name or firm',
  'architect-rankings': 'Search architects by name or firm',
  'expeditor-rankings': 'Search permit expeditors by name or firm',
  'gc-rankings': 'Search contractors by name or project work',
  'minority-contractors': 'Search contractors by name or capability',
};

export default function Discovery() {
  const { isSubscriber, isLoading: authLoading } = useAuth();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(searchString);
  const viewParam = urlParams.get('view');
  const urlSearch = urlParams.get('search') || '';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [professionalSearch, setProfessionalSearch] = useState(urlSearch);
  
  const [viewType, setViewType] = useState<ViewType>(
    validViewTypes.includes(viewParam as ViewType) ? (viewParam as ViewType) : 'childcare'
  );
  
  useEffect(() => {
    if (validViewTypes.includes(viewParam as ViewType)) {
      setViewType(viewParam as ViewType);
    }
  }, [viewParam]);

  useEffect(() => {
    setProfessionalSearch(urlSearch);
  }, [urlSearch]);

  const submitProfessionalSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchString);
    params.set('view', viewType);
    const value = professionalSearch.trim();
    if (value) params.set('search', value);
    else params.delete('search');
    params.delete('highlight');
    setLocation(`/discovery?${params.toString()}`);
  };

  if (!authLoading && !isSubscriber) return <SubscriberGate featureName="Market Discovery (Beta)" />;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 w-64 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col relative overflow-auto">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <button onClick={() => setSidebarOpen(true)} data-testid="button-mobile-menu">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-display text-sm font-bold tracking-tight">Discovery</span>
          <div className="w-6" />
        </div>

      <div className="max-w-6xl mx-auto p-6 md:p-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="link-back-home">
                <Home className="w-4 h-4" />
                Home
              </Button>
            </Link>
          </div>
          
          <h1 className="text-3xl font-serif text-foreground flex items-center gap-3">
            <MapPin className="w-8 h-8" style={{ color: '#2b3a9e' }} />
            Chicago Discovery
          </h1>
          <p className="text-muted-foreground mt-2 font-body">
            Explore Chicago areas by various metrics. Click on any area to view detailed eligibility information.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Select 
              value={viewType} 
              onValueChange={(value) => setViewType(value as ViewType)}
            >
              <SelectTrigger className="w-[280px] font-semibold" style={{ border: '1.5px solid #2b3a9e', borderRadius: '11px' }} data-testid="select-view-type">
                <SelectValue placeholder="Select data to view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="childcare" data-testid="select-item-childcare">
                  <div className="flex items-center gap-2">
                    <Baby className="w-4 h-4" />
                    Childcare Desert Data
                  </div>
                </SelectItem>
                <SelectItem value="attorneys" data-testid="select-item-attorneys">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    Zoning Attorney Data
                  </div>
                </SelectItem>
                <SelectItem value="evs" data-testid="select-item-evs">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    EV Registrations
                  </div>
                </SelectItem>
                <SelectItem value="ev-stations" data-testid="select-item-ev-stations">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    EV Charging Stations
                  </div>
                </SelectItem>
                <SelectItem value="hotels" data-testid="select-item-hotels">
                  <div className="flex items-center gap-2">
                    <Hotel className="w-4 h-4" />
                    Hotels
                  </div>
                </SelectItem>
                <SelectItem value="grocery" data-testid="select-item-grocery">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Grocery Stores
                  </div>
                </SelectItem>
                <SelectItem value="coffee" data-testid="select-item-coffee">
                  <div className="flex items-center gap-2">
                    <Coffee className="w-4 h-4" />
                    Coffee Shops & Cafes
                  </div>
                </SelectItem>
                <SelectItem value="gas-stations" data-testid="select-item-gas-stations">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4" />
                    Gas Stations
                  </div>
                </SelectItem>
                <SelectItem value="sbif" data-testid="select-item-sbif">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4" />
                    SBIF/TIF Districts
                  </div>
                </SelectItem>
                <SelectItem value="nmtc" data-testid="select-item-nmtc">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    NMTC Coverage
                  </div>
                </SelectItem>
                <SelectItem value="ethnic-mortgage" data-testid="select-item-ethnic-mortgage">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Ethnic Mortgage Trends
                  </div>
                </SelectItem>
                <SelectItem value="tax-appeal-attorneys" data-testid="select-item-tax-appeal-attorneys">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Tax Appeal Attorneys
                  </div>
                </SelectItem>
                <SelectItem value="lender-rankings" data-testid="select-item-lender-rankings">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4" />
                    Top Residential Lenders
                  </div>
                </SelectItem>
                <SelectItem value="commercial-lender-rankings" data-testid="select-item-commercial-lender-rankings">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Top Commercial Lenders
                  </div>
                </SelectItem>
                <SelectItem value="architect-rankings" data-testid="select-item-architect-rankings">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    Top Architects
                  </div>
                </SelectItem>
                <SelectItem value="expeditor-rankings" data-testid="select-item-expeditor-rankings">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    Top Permit Expeditors
                  </div>
                </SelectItem>
                <SelectItem value="gc-rankings" data-testid="select-item-gc-rankings">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4" />
                    Top General Contractors
                  </div>
                </SelectItem>
                <SelectItem value="minority-contractors" data-testid="select-item-minority-contractors">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Minority Contractor Directory
                  </div>
                </SelectItem>
                <SelectItem value="cta-rankings" data-testid="select-item-cta-rankings">
                  <div className="flex items-center gap-2">
                    <Train className="w-4 h-4" />
                    CTA Train Ridership Rankings
                  </div>
                </SelectItem>
                <SelectItem value="west-town-tax-delinquency" data-testid="select-item-west-town-tax-delinquency">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    West Town Property-Tax Delinquency
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            <Link href="/contractors">
              <Button variant="outline" className="gap-2" data-testid="link-contractor-discovery">
                <Hammer className="w-4 h-4" />
                Contractor Rankings
              </Button>
            </Link>
            {professionalViewTypes.includes(viewType) && (
              <form onSubmit={submitProfessionalSearch} className="flex min-w-[280px] flex-1 items-end gap-2 sm:max-w-xl" data-testid="form-professional-search">
                <div className="min-w-0 flex-1">
                  <label htmlFor="discovery-professional-search" className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    Find a person or firm
                  </label>
                  <div className="relative mt-1.5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="discovery-professional-search"
                      value={professionalSearch}
                      onChange={(event) => setProfessionalSearch(event.target.value)}
                      placeholder={professionalSearchLabels[viewType] || 'Search by name'}
                      className="pl-9"
                      data-testid="input-professional-search"
                    />
                  </div>
                </div>
                <Button type="submit" className="shrink-0" style={{ background: '#2b3a9e' }} data-testid="button-professional-search">
                  Search
                </Button>
              </form>
            )}
          </div>
        </motion.div>

        {viewType === 'childcare' && <ChildcareView />}
        {viewType === 'attorneys' && <AttorneyView key={`attorneys-${urlSearch}`} />}
        {(viewType === 'evs' || viewType === 'ev-stations' || viewType === 'hotels' || viewType === 'grocery' || viewType === 'coffee' || viewType === 'gas-stations' || viewType === 'sbif' || viewType === 'nmtc') && (
          <RankingsView type={viewType} />
        )}
        {viewType === 'ethnic-mortgage' && <EthnicMortgageTrends />}
        {viewType === 'tax-appeal-attorneys' && <TaxAppealAttorneyView key={`tax-appeal-attorneys-${urlSearch}`} />}
        {viewType === 'lender-rankings' && <LenderRankingsView />}
        {viewType === 'commercial-lender-rankings' && <CommercialLenderRankingsView />}
        {viewType === 'architect-rankings' && <ArchitectRankingsView key={`architect-rankings-${urlSearch}`} />}
        {viewType === 'expeditor-rankings' && <ExpeditorRankingsView key={`expeditor-rankings-${urlSearch}`} />}
        {viewType === 'gc-rankings' && <GeneralContractorRankingsView key={`gc-rankings-${urlSearch}`} />}
        {viewType === 'minority-contractors' && <MinorityContractorDirectoryView key={`minority-contractors-${urlSearch}`} />}
        {viewType === 'west-town-tax-delinquency' && <WestTownTaxDelinquencyView />}
        {viewType === 'cta-rankings' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                  <Train className="w-4 h-4" style={{ color: '#2b3a9e' }} />
                  CTA Rail Station Ridership Rankings
                </CardTitle>
                <p className="text-sm text-muted-foreground">All 144 CTA rail stations ranked by total entries — 2023, 2024, 2025, 2026 YTD, plus year-over-year ridership growth (2022–2025).</p>
              </CardHeader>
              <CardContent>
                <CTARankingsView />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
      </main>
    </div>
  );
}
