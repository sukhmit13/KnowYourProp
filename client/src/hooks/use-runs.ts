import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ListingClaim } from "@shared/listingChecks";
import { api, buildUrl, type RunInput, type ScenarioInput, type LookupInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { ZoningInfo, ChildcareAccessData, SbifEligibilityResult, NmtcEligibilityResult } from "@shared/schema";
import type { ZoningPermission } from "@shared/businessUses";
import type { NearbyLicensesResponse } from "@shared/businessLicenses";

// ============================================
// RUNS HOOKS
// ============================================

export function useRuns() {
  return useQuery({
    queryKey: [api.runs.list.path],
    queryFn: async () => {
      const token = localStorage.getItem("kyp_auth_token");
      const res = await fetch(api.runs.list.path, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch runs');
      return api.runs.list.responses[200].parse(await res.json());
    },
  });
}

export function useRun(id: number | null) {
  return useQuery({
    queryKey: [api.runs.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.runs.get.path, { id });
      const token = localStorage.getItem("kyp_auth_token");
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch run');
      return api.runs.get.responses[200].parse(await res.json());
    },
  });
}

export function usePublicRun(id: number | null) {
  return useQuery({
    queryKey: ['/api/public/run', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/public/run/${id}`);
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error('Failed to fetch report');
      return res.json();
    },
  });
}

export class RunCreateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function useCreateRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RunInput) => {
      // Send the bearer token too: iframe contexts can block session cookies.
      const token = localStorage.getItem('kyp_auth_token');
      const res = await fetch(api.runs.create.path, {
        method: api.runs.create.method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new RunCreateError(body.message || 'Failed to create run', res.status);
      }
      return api.runs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
    },
  });
}

export function useDeleteRun() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.runs.delete.path, { id });
      const res = await fetch(url, { method: api.runs.delete.method, credentials: "include" });
      if (!res.ok) throw new Error('Failed to delete run');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
      toast({
        title: "Run deleted",
        description: "The run has been removed successfully.",
      });
    },
  });
}

export function useDeleteAllRuns() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/runs', { method: 'DELETE', credentials: "include" });
      if (!res.ok) throw new Error('Failed to delete all runs');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
      toast({
        title: "All runs deleted",
        description: "All saved runs have been removed.",
      });
    },
    onError: (err) => {
      toast({
        title: "Error deleting runs",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/runs/${id}/favorite`, { 
        method: 'PATCH', 
        credentials: "include" 
      });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.runs.get.path, id] });
    },
  });
}

export function useUpdateRunLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string | null }) => {
      const res = await fetch(`/api/runs/${id}/label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
        credentials: "include"
      });
      if (!res.ok) throw new Error('Failed to update label');
      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData([api.runs.get.path, variables.id], data);
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
    },
  });
}

export function useUpdateProjectType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectType }: { id: number; projectType: string | null }) => {
      const res = await fetch(`/api/runs/${id}/project-type`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectType }),
        credentials: "include" 
      });
      if (!res.ok) throw new Error('Failed to update project use');
      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData([api.runs.get.path, variables.id], data);
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
    },
  });
}

export interface FunnelAnswers {
  role: string | null;
  transactionType: string | null;
  projectType: string | null;
  freeformDescription: string | null;
}

export function useUpdateFunnelAnswers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, answers }: { id: number; answers: FunnelAnswers }) => {
      const res = await fetch(`/api/runs/${id}/funnel-answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to update funnel answers');
      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData([api.runs.get.path, variables.id], data);
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
    },
  });
}

export interface ManualPropertyData {
  manualBuildingSqFt?: number | null;
  manualLandSqFt?: number | null;
  manualStories?: number | null;
  sourceListingUrl?: string | null;
  askingPrice?: number | null;
}

export function useUpdateManualProperty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ManualPropertyData }) => {
      const res = await fetch(`/api/runs/${id}/manual-property`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: "include" 
      });
      if (!res.ok) throw new Error('Failed to update property data');
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.runs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.runs.get.path, variables.id] });
      toast({
        title: "Property data saved",
        description: "Your manually entered property data has been saved.",
      });
    },
    onError: (err) => {
      toast({
        title: "Error saving property data",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

// ============================================
// SCENARIO HOOKS
// ============================================

export function useCreateScenario() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ScenarioInput) => {
      const res = await fetch(api.scenarios.create.path, {
        method: api.scenarios.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.scenarios.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error('Failed to create scenario');
      }
      return api.scenarios.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific run this scenario belongs to
      queryClient.invalidateQueries({ queryKey: [api.runs.get.path, variables.runId] });
      toast({
        title: "Scenario Added",
        description: "New scenario created successfully.",
      });
    },
    onError: (err) => {
      toast({
        title: "Error adding scenario",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, runId }: { id: number; runId: number }) => {
      const url = buildUrl(api.scenarios.delete.path, { id });
      const res = await fetch(url, { method: api.scenarios.delete.method, credentials: "include" });
      if (!res.ok) throw new Error('Failed to delete scenario');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.runs.get.path, variables.runId] });
      toast({
        title: "Scenario Deleted",
        description: "The scenario has been removed.",
      });
    },
  });
}

// ============================================
// GEOCODING HOOKS
// ============================================

export class OutsideChicagoError extends Error {
  constructor() {
    super('OUTSIDE_CHICAGO');
    this.name = 'OutsideChicagoError';
  }
}

export function useGeocodeLookup() {
  return useMutation({
    mutationFn: async (data: LookupInput) => {
      const res = await fetch(api.geocoding.lookup.path, {
        method: api.geocoding.lookup.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Too many requests. Please wait a moment.');
        }
        if (res.status === 422) {
          const body = await res.json().catch(() => ({}));
          if (body.message === 'OUTSIDE_CHICAGO') throw new OutsideChicagoError();
        }
        if (res.status === 400) {
          throw new Error('Invalid address format.');
        }
        throw new Error('Failed to lookup address');
      }
      return api.geocoding.lookup.responses[200].parse(await res.json());
    },
  });
}

export function useGeocodeAutocomplete(q: string) {
  return useQuery({
    queryKey: [api.geocoding.autocomplete.path, q],
    enabled: q.length >= 3,
    queryFn: async () => {
      const url = `${api.geocoding.autocomplete.path}?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return api.geocoding.autocomplete.responses[200].parse(await res.json());
    },
  });
}

// ============================================
// ZONING INFO HOOKS
// ============================================

export function useZoningInfo(code: string | null | undefined) {
  return useQuery<ZoningInfo | null>({
    queryKey: ['/api/zoning', code],
    enabled: !!code,
    queryFn: async () => {
      if (!code) return null;
      const res = await fetch(`/api/zoning/${encodeURIComponent(code)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch zoning info');
      return await res.json();
    },
  });
}

// ============================================
// BUSINESS USES HOOKS
// ============================================

interface BusinessUsesResponse {
  uses: { name: string; category: string; zoningCategory: string }[];
  categories: string[];
}

export function useBusinessUses() {
  return useQuery<BusinessUsesResponse>({
    queryKey: ['/api/business-uses'],
    queryFn: async () => {
      const res = await fetch('/api/business-uses', { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch business uses');
      return await res.json();
    },
  });
}

interface ZoningCompatibilityResult {
  permission: ZoningPermission;
  message: string;
}

export function useZoningCompatibility(businessUse: string | null, zoningCode: string | null) {
  return useQuery<ZoningCompatibilityResult | null>({
    queryKey: ['/api/zoning/check-compatibility', businessUse, zoningCode],
    enabled: !!businessUse && !!zoningCode,
    queryFn: async () => {
      if (!businessUse || !zoningCode) return null;
      const res = await fetch('/api/zoning/check-compatibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessUse, zoningCode }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to check compatibility');
      return await res.json();
    },
  });
}

// ============================================
// CHILDCARE ACCESS HOOKS
// ============================================

export function useChildcareAccess(zipCode: string | null | undefined) {
  return useQuery<ChildcareAccessData | null>({
    queryKey: ['/api/childcare', zipCode],
    enabled: !!zipCode && /^\d{5}$/.test(zipCode),
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/childcare/${zipCode}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch childcare data');
      return await res.json();
    },
  });
}

interface CommunityAreaChildcareData {
  communityArea: string;
  childrenUnder5: number;
  licensedSlots: number;
  centerSlots: number;
  familyHomeSlots: number;
  childrenPerSlot: number | null;
  status: 'desert' | 'underserved' | 'adequate' | 'unknown';
  statusLabel: string;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

export function useCommunityAreaChildcareAccess(communityArea: string | null | undefined) {
  return useQuery<CommunityAreaChildcareData | null>({
    queryKey: ['/api/childcare/community', communityArea],
    enabled: !!communityArea && communityArea !== 'N/A' && communityArea !== 'Unknown Community Area',
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/childcare/community/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch community area childcare data');
      return await res.json();
    },
  });
}

// ============================================
// GROCERY STORE ACCESS HOOKS
// ============================================

interface GroceryStore {
  name: string;
  address: string;
  squareFeet: number | null;
  distance: number;
}

interface GroceryAccessData {
  storeCount: number;
  stores: GroceryStore[];
  sources: {
    dataSource: string;
    dataYear: string;
  };
}

export function useGroceryAccess(zipCode: string | null | undefined, lat?: number | null, lon?: number | null) {
  return useQuery<GroceryAccessData | null>({
    queryKey: ['/api/grocery', zipCode, lat, lon],
    enabled: !!zipCode && /^\d{5}$/.test(zipCode),
    queryFn: async () => {
      if (!zipCode) return null;
      let url = `/api/grocery/${zipCode}`;
      if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
        url += `?lat=${lat}&lon=${lon}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch grocery data');
      return await res.json();
    },
  });
}

export function useCommunityAreaGroceryAccess(communityArea: string | null | undefined, lat?: number | null, lon?: number | null) {
  return useQuery<GroceryAccessData | null>({
    queryKey: ['/api/grocery/community', communityArea, lat, lon],
    enabled: !!communityArea && communityArea !== 'N/A' && communityArea !== 'Unknown Community Area',
    queryFn: async () => {
      if (!communityArea) return null;
      let url = `/api/grocery/community/${encodeURIComponent(communityArea)}`;
      if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
        url += `?lat=${lat}&lon=${lon}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch community area grocery data');
      return await res.json();
    },
  });
}

// ============================================
// SBIF ELIGIBILITY HOOKS
// ============================================

export function useSbifEligibility(tifName: string | null | undefined) {
  return useQuery<SbifEligibilityResult | null>({
    queryKey: ['/api/sbif/check', tifName],
    enabled: tifName !== undefined,
    queryFn: async () => {
      const res = await fetch('/api/sbif/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tifName: tifName || null }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to check SBIF eligibility');
      return await res.json();
    },
  });
}

// ============================================
// NMTC ELIGIBILITY HOOKS
// ============================================

export function useNmtcEligibility(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<NmtcEligibilityResult | null>({
    queryKey: ['/api/nmtc/check', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/nmtc/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to check NMTC eligibility');
      return await res.json();
    },
  });
}

// ============================================
// LOCATION INCENTIVES (Industrial Corridors, Enterprise Zones, etc.)
// ============================================

export interface LocationIncentivesResult {
  industrialCorridor: { inCorridor: boolean; name: string | null; region: string | null };
  enterpriseZone: { inZone: boolean; zoneName: string | null };
  empowermentZone: { inZone: boolean; zoneName: string | null };
  enterpriseCommunity: { inCommunity: boolean; name: string | null; type: string | null };
  investSouthWest: { inArea: boolean; communityArea: string | null; areaNumber: string | null };
  nofEligibleArea: { inEligibleArea: boolean; ward: string | null; zip: string | null; censusTract: string | null };
  checkedAt: string;
}

export function useLocationIncentives(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<LocationIncentivesResult | null>({
    queryKey: ['/api/location-incentives/check', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/location-incentives/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check location incentives');
      return await res.json();
    },
  });
}

// ============================================
// MICRO-MARKET RECOVERY PROGRAM (MMRP) ELIGIBILITY HOOKS
// ============================================

export interface MmrpEligibilityResult {
  inMmrpZone: boolean;
  zoneName: string | null;
  zoneType: string | null;
  source: string;
  description: string | null;
  benefits: string[] | null;
  learnMoreUrl: string;
  error?: string;
}

export function useMmrpEligibility(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<MmrpEligibilityResult | null>({
    queryKey: ['/api/mmrp/check', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/mmrp/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to check MMRP eligibility');
      return await res.json();
    },
  });
}

// ============================================
// SBA HUBZONE HOOKS
// ============================================

export interface HubZoneResult {
  eligible: boolean;
  zoneName: string | null;
  source: string;
  lastChecked: string;
}

export function useHubZoneEligibility(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<HubZoneResult | null>({
    queryKey: ['/api/hubzone/check', lat, lon],
    enabled: lat != null && lon != null,
    queryFn: async () => {
      if (lat == null || lon == null) return null;
      const res = await fetch('/api/hubzone/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check HUBZone eligibility');
      return await res.json();
    },
  });
}

// ============================================
// HUD QUALIFIED CENSUS TRACT (QCT) HOOKS
// ============================================

export interface QctResult {
  eligible: boolean;
  tractFips: string | null;
  source: string;
  lastChecked: string;
}

export function useQctEligibility(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<QctResult | null>({
    queryKey: ['/api/qct/check', lat, lon],
    enabled: lat != null && lon != null,
    queryFn: async () => {
      if (lat == null || lon == null) return null;
      const res = await fetch('/api/qct/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check QCT eligibility');
      return await res.json();
    },
  });
}

// ============================================
// CHA OPPORTUNITY AREA HOOKS
// ============================================

export interface ChaOpportunityResult {
  isOpportunityArea: boolean;
  povertyRate: number | null;
  tractFips: string | null;
  source: string;
  lastChecked: string;
}

export function useChaOpportunityArea(tractGeoid: string | null | undefined) {
  return useQuery<ChaOpportunityResult | null>({
    queryKey: ['/api/cha-opportunity/check', tractGeoid],
    enabled: !!tractGeoid,
    queryFn: async () => {
      if (!tractGeoid) return null;
      const res = await fetch('/api/cha-opportunity/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tractFips: tractGeoid }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check CHA Opportunity Area');
      return await res.json();
    },
  });
}

// ============================================
// LANDMARK STATUS HOOKS
// ============================================

export interface LandmarkStatusResult {
  isLandmark: boolean;
  isOfficialLandmark?: boolean | null;
  officialLandmarkName?: string | null;
  isLandmarkDistrict?: boolean | null;
  landmarkDistrictName?: string | null;
  landmarkDistrictId?: string | null;
  landmarkName: string | null;
  landmarkId: number | null;
  address: string | null;
  decade: number | null;
  designationDate: string | null;
  classId: number | null;
  className: string | null;
  colorId?: number | null;
  colorTag?: string | null;
  foundOnCoParcel?: string | null;
}

export function useLandmarkStatus(
  lat: number | null | undefined,
  lon: number | null | undefined,
  address?: string,
  additionalAddresses?: string[],
) {
  const addlKey = (additionalAddresses ?? []).join(',');
  return useQuery<LandmarkStatusResult | null>({
    queryKey: ['/api/landmark-status', lat, lon, address, addlKey],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/landmark-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, address, additionalAddresses: additionalAddresses ?? [] }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to check landmark status');
      return await res.json();
    },
  });
}

// ============================================
// TRANSIT PROXIMITY HOOKS
// ============================================

export interface TransitResult {
  stopName: string;
  distance: number;
  routes: string[];
  agency: 'CTA' | 'Metra';
  type: 'rail' | 'bus';
  stationId?: string;
  direction?: 'NS' | 'EW'; // bus routes only — orientation derived server-side from stop spread
}

export interface TransitProximityData {
  ctaRail: TransitResult[];
  ctaBus: TransitResult[];
  metra: TransitResult[];
}

export function useTransitProximity(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<TransitProximityData | null>({
    queryKey: ['/api/transit/nearby', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    retry: 10,
    retryDelay: (attempt) => Math.min(5000 * (attempt + 1), 30000),
    refetchInterval: (query) => {
      if (query.state.error || (!query.state.data && !query.state.isFetching)) {
        return 15000;
      }
      return false;
    },
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/transit/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: "include",
      });
      if (res.status === 503) {
        throw new Error('Transit data still loading');
      }
      if (!res.ok) throw new Error('Failed to fetch transit data');
      return await res.json();
    },
  });
}

// ============================================
// TOD (TRANSIT-ORIENTED DEVELOPMENT) HOOKS
// ============================================

export interface TODStatus {
  inTOD: boolean;
  todType: 'Rail Station' | 'High-Frequency Bus' | null;
  nearestStation: string | null;
  stationType: 'CTA Rail' | 'Metra' | null;
  busRoute: string | null;
  busRouteName: string | null;
  distance: number | null;
  closestRailStation: { name: string; type: string; distance: number } | null;
  closestQualifyingBus: { name: string; route: string; routeName: string; distance: number } | null;
  qualifyingBusRoutes: string[];
}

export function useTODStatus(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<TODStatus | null>({
    queryKey: ['/api/tod/status', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    retry: 10,
    retryDelay: (attempt) => Math.min(5000 * (attempt + 1), 30000),
    staleTime: 1000 * 60 * 60,
    refetchInterval: (query) => {
      if (query.state.error || (!query.state.data && !query.state.isFetching)) {
        return 15000;
      }
      return false;
    },
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/tod/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: "include",
      });
      if (res.status === 503) {
        throw new Error('Transit data still loading');
      }
      if (!res.ok) throw new Error('Failed to fetch TOD status');
      return await res.json();
    },
  });
}

// ============================================
// EV CHARGING STATIONS HOOKS
// ============================================

export interface EvStation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  accessDays: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  evNetwork: string | null;
  evLevel2Count: number | null;
  dcFastCount: number | null;
  dateLastConfirmed: string | null;
}

export interface EvStationsData {
  stations: EvStation[];
  totalFound: number;
  within1Mile?: number;
  within2Miles?: number;
  within3Miles?: number;
}

export function useEvStations(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<EvStationsData | null>({
    queryKey: ['/api/ev-stations/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/ev-stations/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch EV stations');
      return await res.json();
    },
  });
}

// ============================================
// GAS STATIONS (FILLING STATIONS) HOOKS
// ============================================

export interface GasStation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  licenseNumber: string;
  communityArea: string | null;
  neighborhood: string | null;
  distanceMiles: number;
}

export interface GasStationsData {
  stations: GasStation[];
  totalFound: number;
  within1Mile?: number;
  within2Miles?: number;
  within3Miles?: number;
}

export function useGasStations(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<GasStationsData | null>({
    queryKey: ['/api/gas-stations/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/gas-stations/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch gas stations');
      return await res.json();
    },
  });
}

// ============================================
// HOTELS HOOKS
// ============================================

export interface BusinessLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  licenseNumber?: string;
  licenseDescription?: string;
  communityArea: string | null;
  neighborhood: string | null;
  distanceMiles: number;
}

export interface BusinessLocationsData {
  locations: BusinessLocation[];
  totalFound: number;
  within1Mile?: number;
  within2Miles?: number;
  within3Miles?: number;
}

export interface HotelsData extends BusinessLocationsData {
  shortTermRentals: {
    totalFound: number;
    within1Mile: number;
    within2Miles: number;
    within3Miles: number;
  };
}

export function useHotels(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<HotelsData | null>({
    queryKey: ['/api/hotels/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/hotels/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch hotels');
      return await res.json();
    },
  });
}

// ============================================
// RESTAURANTS HOOKS
// ============================================

export function useRestaurants(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationsData | null>({
    queryKey: ['/api/restaurants/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/restaurants/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return await res.json();
    },
  });
}

// ============================================
// COFFEE SHOPS HOOKS
// ============================================

export function useCoffeeShops(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationsData | null>({
    queryKey: ['/api/coffee-shops/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/coffee-shops/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch coffee shops');
      return await res.json();
    },
  });
}

// ============================================
// BARS/TAVERNS HOOKS
// ============================================

export function useBars(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationsData | null>({
    queryKey: ['/api/bars/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/bars/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch bars');
      return await res.json();
    },
  });
}

// ============================================
// DAY CARE CENTERS HOOKS
// ============================================

export function useNearbyDayCares(lat: number | null | undefined, lon: number | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationsData | null>({
    queryKey: ['/api/day-care/nearby', lat, lon],
    enabled: enabled && lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/day-care/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 3 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch nearby day care centers');
      return await res.json();
    },
  });
}

// ============================================
// EV REGISTRATIONS HOOKS
// ============================================

export interface EVDataPoint {
  year: number;
  month: number;
  count: number;
}

export interface EVRegistrationsData {
  zipCode: string;
  zipCodeData: EVDataPoint[] | null;
  cookCountyData: EVDataPoint[] | null;
  lastUpdated: string;
  sourceUrl: string;
  message?: string;
}

export function useEVRegistrations(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<EVRegistrationsData | null>({
    queryKey: ['/api/ev-registrations', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/ev-registrations/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch EV registrations');
      return await res.json();
    },
  });
}

// ============================================
// GAS STATIONS BY ZIP
// ============================================

export interface GasStationsByZipData {
  zipCode: string;
  count: number;
  stations: { name: string; address: string }[];
  message?: string;
}

export function useGasStationsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<GasStationsByZipData | null>({
    queryKey: ['/api/gas-stations/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/gas-stations/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch gas stations');
      return await res.json();
    },
  });
}

// ============================================
// EV CHARGING STATIONS BY ZIP
// ============================================

export interface EVStationsByZipData {
  zipCode: string;
  count: number;
  stations: { name: string; address: string }[];
  message?: string;
}

export function useEVStationsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<EVStationsByZipData | null>({
    queryKey: ['/api/ev-stations/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/ev-stations/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch EV charging stations');
      return await res.json();
    },
  });
}

// ============================================
// COFFEE SHOPS BY ZIP
// ============================================

export interface BusinessLocationByZipData {
  zipCode: string;
  count: number;
  locations: { name: string; address: string }[];
  message?: string;
}

export function useCoffeeShopsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/coffee-shops/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/coffee-shops/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch coffee shops');
      return await res.json();
    },
  });
}

// ============================================
// HOTELS BY ZIP
// ============================================

export function useHotelsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/hotels/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/hotels/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch hotels');
      return await res.json();
    },
  });
}

// ============================================
// RESTAURANTS BY ZIP
// ============================================

export function useRestaurantsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/restaurants/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/restaurants/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return await res.json();
    },
  });
}

// ============================================
// BARS BY ZIP
// ============================================

export function useBarsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/bars/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/bars/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch bars');
      return await res.json();
    },
  });
}

// ============================================
// LIQUOR STORES BY ZIP
// ============================================

export function useLiquorStoresByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/liquor-stores/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/liquor-stores/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch liquor stores');
      return await res.json();
    },
  });
}

// ============================================
// DAY CARE BY ZIP
// ============================================

export function useDayCareByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/day-care/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/day-care/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch day care centers');
      return await res.json();
    },
  });
}

// ============================================
// MASSAGE/SPA BY ZIP
// ============================================

export function useMassageSpaByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/massage-spa/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/massage-spa/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch massage/spa establishments');
      return await res.json();
    },
  });
}

// ============================================
// AUTO REPAIR BY ZIP
// ============================================

export function useAutoRepairByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/auto-repair/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/auto-repair/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch auto repair shops');
      return await res.json();
    },
  });
}

// ============================================
// PET STORES BY ZIP
// ============================================

export function usePetStoresByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/pet-stores/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/pet-stores/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch pet stores');
      return await res.json();
    },
  });
}

// ============================================
// VET CLINICS BY ZIP
// ============================================

export function useVetClinicsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/vet-clinics/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/vet-clinics/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch veterinary clinics');
      return await res.json();
    },
  });
}

// ============================================
// NIGHTCLUBS BY ZIP
// ============================================

export function useNightclubsByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/nightclubs/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/nightclubs/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch nightclubs');
      return await res.json();
    },
  });
}

// ============================================
// EVENT VENUES BY ZIP
// ============================================

export function useEventVenuesByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/event-venues/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/event-venues/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch event venues');
      return await res.json();
    },
  });
}

// ============================================
// BREWERIES BY ZIP
// ============================================

export function useBreweriesByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/breweries/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/breweries/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch breweries');
      return await res.json();
    },
  });
}

// ============================================
// CANNABIS DISPENSARIES BY ZIP
// ============================================

export function useCannabisDispensariesByZip(zipCode: string | null | undefined, enabled: boolean = true) {
  return useQuery<BusinessLocationByZipData | null>({
    queryKey: ['/api/cannabis-dispensaries/by-zip', zipCode],
    enabled: enabled && !!zipCode,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/cannabis-dispensaries/by-zip/${encodeURIComponent(zipCode)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch cannabis dispensaries');
      return await res.json();
    },
  });
}

// ============================================
// MAP POLYGON HOOKS
// ============================================

export function useZipPolygon(zipCode: string | null | undefined) {
  return useQuery<GeoJSON.Feature | null>({
    queryKey: ['/api/polygons/zip', zipCode],
    enabled: !!zipCode,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/polygons/zip/${encodeURIComponent(zipCode)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch ZIP polygon');
      return await res.json();
    },
  });
}

export function useCommunityAreaPolygon(communityArea: string | null | undefined) {
  return useQuery<GeoJSON.Feature | null>({
    queryKey: ['/api/polygons/community', communityArea],
    enabled: !!communityArea && communityArea !== 'N/A' && communityArea !== 'Unknown Community Area',
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/polygons/community/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch community area polygon');
      return await res.json();
    },
  });
}

export function useWardPolygon(ward: string | null | undefined) {
  return useQuery<GeoJSON.Feature | null>({
    queryKey: ['/api/polygons/ward', ward],
    enabled: !!ward,
    queryFn: async () => {
      if (!ward) return null;
      const res = await fetch(`/api/polygons/ward/${encodeURIComponent(ward)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch ward polygon');
      return await res.json();
    },
  });
}

export function useNeighborhoodPolygon(neighborhood: string | null | undefined) {
  return useQuery<GeoJSON.Feature | null>({
    queryKey: ['/api/polygons/neighborhood', neighborhood],
    enabled: !!neighborhood,
    queryFn: async () => {
      if (!neighborhood) return null;
      const res = await fetch(`/api/polygons/neighborhood/${encodeURIComponent(neighborhood)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch neighborhood polygon');
      return await res.json();
    },
  });
}

export function useTractPolygon(tractGeoid: string | null | undefined) {
  return useQuery<GeoJSON.Feature | null>({
    queryKey: ['/api/polygons/tract', tractGeoid],
    enabled: !!tractGeoid && /^\d{11}$/.test(tractGeoid),
    queryFn: async () => {
      if (!tractGeoid) return null;
      const res = await fetch(`/api/polygons/tract/${encodeURIComponent(tractGeoid)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch tract polygon');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
  });
}

// ============================================
// PROPERTY TAX HOOKS
// ============================================

import type { PropertyTaxResult } from "@shared/schema";

export function usePropertyTax(pin: string | null | undefined, city?: string | null, address?: string | null) {
  const isValidPin = !!pin && (
    pin.replace(/[^0-9]/g, '').length === 14 || // Cook County
    (city === 'philadelphia' && pin.replace(/[^0-9A-Z\-]/gi, '').length >= 6) // OPA account number
  );
  return useQuery<PropertyTaxResult | null>({
    queryKey: ['/api/property-tax', pin, city || null],
    enabled: isValidPin,
    // Poll when stale (background refresh) OR when paymentStatus is null (first-time Treasurer scrape running in background)
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.isStale) return 15000;
      if (data.paymentStatus === null && city !== 'philadelphia') return 8000;
      return false;
    },
    queryFn: async () => {
      if (!pin) return null;
      const res = await fetch('/api/property-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, city: city || undefined, address: address || undefined }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch property tax data');
      return await res.json();
    },
  });
}

export function useRefreshPropertyTax() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pin: string) => {
      const res = await fetch('/api/property-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, refresh: true }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to refresh property tax data');
      return await res.json();
    },
    onSuccess: (_, pin) => {
      queryClient.invalidateQueries({ queryKey: ['/api/property-tax', pin] });
      toast({
        title: "Tax data refreshed",
        description: "Property tax information has been updated.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not refresh",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useClearTaxCache() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/property-tax/cache');
      if (!res.ok) throw new Error('Failed to clear tax cache');
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Tax cache cleared",
        description: `Cleared cached data for ${data.cleared} propert${data.cleared === 1 ? 'y' : 'ies'}. Fresh data will be fetched on next lookup.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not clear cache",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

// ============================================
// LIEN SEARCH HOOKS
// ============================================

import type { LienResult } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useLienSearch(pin: string | null | undefined, ownerName?: string | null, city?: string | null) {
  const isValidPin = !!pin && (
    pin.replace(/[^0-9]/g, '').length === 14 || // Cook County
    (city === 'philadelphia' && pin.replace(/[^0-9A-Z\-]/gi, '').length >= 6) // OPA account number
  );
  return useQuery<LienResult | null>({
    queryKey: ['/api/lien-search', pin, ownerName || null, city || null],
    enabled: isValidPin,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (city === 'philadelphia') return false;
      return (data?.isStale || data?.ownerLienIsStale) ? 30000 : false;
    },
    queryFn: async () => {
      if (!pin) return null;
      const res = await fetch('/api/lien-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, ownerName: ownerName || undefined, city: city || undefined }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch lien data');
      return await res.json();
    },
  });
}

export function useRefreshLienSearch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pin, ownerName }: { pin: string; ownerName?: string | null }) => {
      const res = await fetch('/api/lien-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, refresh: true, ownerName: ownerName || undefined }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to refresh lien data');
      return await res.json();
    },
    onSuccess: (data, { pin }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lien-search', pin] });
      toast({
        title: 'Lien data refreshed',
        description: `Found ${data.documents?.length ?? 0} recorded document(s).`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useOwnerLienSearch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pin, ownerName }: { pin: string; ownerName: string; city?: string | null }) => {
      const res = await fetch('/api/lien-search/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, ownerName }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to search owner liens');
      }
      return await res.json();
    },
    onSuccess: (data, { pin, ownerName, city }) => {
      // Invalidate all lien search queries for this PIN so UI refreshes
      queryClient.invalidateQueries({ queryKey: ['/api/lien-search', pin] });
      queryClient.setQueryData(['/api/lien-search', pin, ownerName || null, city || null], data);
      toast({
        title: 'Owner lien search complete',
        description: `Found ${data.ownerLiens?.length ?? 0} personal lien record(s) for ${data.ownerName}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Owner search failed', description: err.message, variant: 'destructive' });
    },
  });
}

// PIN Resolution Hook
interface CommercialData {
  keypin?: string;
  pins?: string;
  propertyTypeUse?: string;
  bldgSf?: number;
  landSf?: number;
  yearBuilt?: number;
  marketValue?: number;
  marketValuePerSf?: number;
  marketValuePerUnit?: number;
  township?: string;
  taxDistrict?: string;
  address?: string;
  classEstimate?: string;
  investmentRating?: string;
  sheet?: string;
  assessmentYear?: string;
  noi?: number;
  egi?: number;
  pgi?: number;
  expenseRatio?: number;
  totalExpenses?: number;
  capRate?: number;
  vacancyRate?: number;
  adjustedRentPerSf?: number;
  commercialSf?: number;
  totalUnits?: number;
  studioUnits?: number;
  oneBrUnits?: number;
  twoBrUnits?: number;
  threeBrUnits?: number;
  fourBrUnits?: number;
  excessLandArea?: number;
  excessLandValue?: number;
}

interface PinLookupResult {
  pin: string | null;
  source: 'assessor_api' | 'assessor_api+commercial' | 'commercial_api' | 'cache' | 'none';
  confidence: 'high' | 'medium' | 'low' | 'none';
  error?: string;
  propertyType?: string;
  commercialData?: CommercialData;
  characteristicsData?: {
    yearBuilt?: number;
    buildingSf?: number;
    landSf?: number;
    bedrooms?: number;
    rooms?: number;
    fullBaths?: number;
    halfBaths?: number;
    fireplaces?: number;
    buildingType?: string;
    constructionQuality?: string;
    use?: string;
    garageSize?: string;
    garageConstruction?: string;
    garageAttached?: boolean;
    basement?: string;
    basementFinish?: string;
    atticType?: string;
    atticFinish?: string;
    exteriorWall?: string;
    roofConstruction?: string;
    heating?: string;
    airConditioning?: string;
    repairCondition?: string;
    porch?: string;
    propertyClass?: string;
    assessmentYear?: string;
  };
  saleHistory?: {
    saleDate: string;
    salePrice: number;
    sellerName: string;
    buyerName: string;
    deedType: string;
    docNo: string;
    year: string;
  }[];
  assessedValues?: {
    year: string;
    propertyClass: string;
    mailedLand: number;
    mailedBuilding: number;
    mailedTotal: number;
    certifiedLand: number;
    certifiedBuilding: number;
    certifiedTotal: number;
    boardLand?: number;
    boardBuilding?: number;
    boardTotal?: number;
  }[];
  appealHistory?: {
    taxYear: string;
    appealType: string;
    appealReason: string;
    result: string;
    assessorLandValue: number;
    assessorImprovementValue: number;
    assessorTotalValue: number;
    borLandValue: number;
    borImprovementValue: number;
    borTotalValue: number;
    changeReason?: string;
    attorneyFirstName?: string;
    attorneyLastName?: string;
    attorneyFirmName?: string;
    appellant: string;
  }[];
  exemptionHistory?: {
    year: string;
    homeowner: number | null;
    longtimeHomeowner: number | null;
    senior: number | null;
    seniorFreeze: number | null;
    disabledPersons: number | null;
    disabledVeterans: number | null;
    returningVeterans: number | null;
    homeImprovement: number | null;
  }[];
}

export function usePinLookup(address: string | null | undefined, lat?: number, lon?: number) {
  return useQuery<PinLookupResult | null>({
    queryKey: ['/api/pins/resolve', address, lat ?? null, lon ?? null],
    enabled: !!address && address.length > 5,
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch('/api/pins/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, lat, lon }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to resolve PIN');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
  });
}

// ============================================
// PROXIMITY DATA HOOK
// ============================================

export interface ProximityData {
  dataYear: string;
  numPinsInHalfMile: number;
  foreclosures: {
    countInHalfMilePast5Years: number;
    per1000Pins: number;
    dataYear: string;
  };
  schools: {
    countInHalfMile: number;
    dataYear: string;
  };
  park: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  hospital: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  university: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  stadium: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  highway: {
    name: string;
    distanceFt: number;
    dailyTraffic: number;
    dataYear: string;
  } | null;
  vacantLand: {
    distanceFt: number;
    nearestPin: string;
    dataYear: string;
  } | null;
  ctaStop: {
    name: string;
    distanceFt: number;
    routeName: string;
    dataYear: string;
  } | null;
  metraStop: {
    name: string;
    distanceFt: number;
    routeName: string;
    dataYear: string;
  } | null;
  bikeTrail: {
    distanceFt: number;
    dataYear: string;
  } | null;
  water: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  lakeMichigan: {
    distanceFt: number;
    dataYear: string;
  } | null;
  airportNoise: number | null;
  busStops: {
    countInHalfMile: number;
    dataYear: string;
  };
}

export interface ProximityResponse {
  found: boolean;
  data?: ProximityData;
  message?: string;
}

export function useProximityData(pin: string | null | undefined) {
  return useQuery<ProximityResponse | null>({
    queryKey: ['/api/proximity', pin],
    enabled: !!pin && pin.length >= 10,
    queryFn: async () => {
      if (!pin) return null;
      const res = await fetch('/api/proximity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch proximity data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
  });
}

// ============================================
// CITY-OWNED LOTS HOOKS
// ============================================

export interface CityOwnedLot {
  pin: string | null;
  address: string | null;
  salesStatus: string;
  saleOfferingStatus: string | null;
  sqFt: number | null;
  landValue: number | null;
  zoning: string | null;
  ward: string | null;
  communityArea: string | null;
  applicationUrl: string | null;
  distanceFt: number;
}

export interface CityOwnedLotsResult {
  count: number;
  lots: CityOwnedLot[];
}

export function useCityOwnedLots(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<CityOwnedLotsResult | null>({
    queryKey: ['/api/city-owned-lots/nearby', lat, lon],
    enabled: lat !== null && lat !== undefined && lon !== null && lon !== undefined,
    queryFn: async () => {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
      const res = await fetch('/api/city-owned-lots/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch city-owned lots');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// MICHELIN RESTAURANTS HOOKS
// ============================================

export interface MichelinRestaurant {
  name: string;
  address: string;
  zip: string;
  rating: string;
  cuisine: string;
  price: string;
  neighborhood: string;
  lat: number;
  lon: number;
  distanceMiles: number;
}

export interface MichelinResponse {
  total: number;
  radiusMiles: number;
  restaurants: MichelinRestaurant[];
}

export function useMichelinNearby(lat: number | undefined, lon: number | undefined) {
  return useQuery<MichelinResponse | null>({
    queryKey: ['/api/michelin/nearby', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      if (!lat || !lon) return null;
      const res = await fetch('/api/michelin/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 1 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch Michelin restaurant data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// MURALS REGISTRY HOOKS
// ============================================

export interface NearbyMural {
  title: string;
  artist: string;
  address: string;
  yearInstalled: string | null;
  media: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
}

export interface MuralsResponse {
  total: number;
  radiusMiles: number;
  murals: NearbyMural[];
}

export function useMuralsNearby(lat: number | undefined, lon: number | undefined) {
  return useQuery<MuralsResponse | null>({
    queryKey: ['/api/murals/nearby', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      if (!lat || !lon) return null;
      const res = await fetch('/api/murals/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 0.5 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch mural data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// DESIGNATED LANDMARKS HOOKS
// ============================================

export interface NearbyDesignatedLandmark {
  name: string;
  address: string;
  architect: string | null;
  dateBuilt: string | null;
  landmarkDate: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
}

export interface DesignatedLandmarksResponse {
  total: number;
  radiusMiles: number;
  landmarks: NearbyDesignatedLandmark[];
}

export function useDesignatedLandmarksNearby(lat: number | undefined, lon: number | undefined) {
  return useQuery<DesignatedLandmarksResponse | null>({
    queryKey: ['/api/landmarks-designated/nearby', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      if (!lat || !lon) return null;
      const res = await fetch('/api/landmarks-designated/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, radiusMiles: 1 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch designated landmark data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

// ============================================
// ZBA SUMMARY HOOKS
// ============================================

export interface RepresentativeSummary {
  representativeNorm: string;
  representativeDisplay: string;
  totalCases: number;
  approvedCount: number;
  deniedCount: number;
  withdrawnCount: number;
  otherCount: number;
  approvalRate: number | null;
  verificationStatus: 'verified_attorney' | 'not_attorney' | 'unknown';
  likelyAttorneyHeuristic: 'likely_attorney' | 'likely_not_attorney' | null;
  mostRecentCaseDate: string | null;
  isSelfRep: boolean;
  isVerifiedAttorney: boolean | null;
}

export interface ZbaSummaryResponse {
  representatives: RepresentativeSummary[];
  totalCases: number;
  totalRepresentatives: number;
  selfRepCaseCount: number;
  indexBuilt: boolean;
}

export function useZbaWardSummary(ward: number | null | undefined) {
  return useQuery<ZbaSummaryResponse | null>({
    queryKey: ['/api/zba/ward-summary', ward],
    enabled: ward !== null && ward !== undefined && ward > 0,
    queryFn: async () => {
      if (ward === null || ward === undefined) return null;
      const res = await fetch(`/api/zba/ward-summary?ward=${ward}`, {
        credentials: "include",
      });
      if (res.status === 503) {
        const data = await res.json();
        return { representatives: [], totalCases: 0, totalRepresentatives: 0, selfRepCaseCount: 0, indexBuilt: false };
      }
      if (!res.ok) throw new Error('Failed to fetch ZBA ward summary');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export function useZbaCitySummary(enabled: boolean = true) {
  return useQuery<ZbaSummaryResponse | null>({
    queryKey: ['/api/zba/city-summary'],
    enabled,
    queryFn: async () => {
      const res = await fetch('/api/zba/city-summary', {
        credentials: "include",
      });
      if (res.status === 503) {
        return { representatives: [], totalCases: 0, totalRepresentatives: 0, selfRepCaseCount: 0, indexBuilt: false };
      }
      if (!res.ok) throw new Error('Failed to fetch ZBA city summary');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

// ============================================
// DEMOGRAPHICS TRENDS HOOKS
// ============================================

export interface TrendMetric {
  label: string;
  year2010: string;
  year2023: string;
  change: string;
  direction: 'up' | 'down' | 'stable';
  isPositive: boolean;
}

export interface ChartDataPoint {
  name: string;
  value2010: number | null;
  value2023: number | null;
}

export interface ACSGeoData {
  geoid: string;
  name: string;
  metrics: { label: string; value: string; rawValue: number | null }[];
  priorMetrics: { label: string; value: string; rawValue: number | null }[] | null;
  dataYear: number;
  source: string;
}

export interface CensusACSData {
  tract: ACSGeoData | null;
  zip: ACSGeoData | null;
}

export function useCensusACS(tractGeoid: string | null | undefined, zipCode: string | null | undefined) {
  return useQuery<CensusACSData | null>({
    queryKey: ['/api/census-acs', tractGeoid, zipCode],
    enabled: !!(tractGeoid || zipCode),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tractGeoid) params.set('tractGeoid', tractGeoid);
      if (zipCode) params.set('zipCode', zipCode);
      const res = await fetch(`/api/census-acs?${params.toString()}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export interface VehicleOwnershipData {
  communityArea: string;
  communityNumber: number;
  totalHouseholds: number;
  noVehicle: number;
  oneVehicle: number;
  twoVehicles: number;
  threePlusVehicles: number;
  avgVehiclesPerHousehold: number;
  pctNoVehicle: number;
  pctWithVehicle: number;
  autoDependencyLevel: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
}

export function useVehicleOwnership(communityArea: string | null | undefined) {
  return useQuery<VehicleOwnershipData | null>({
    queryKey: ['/api/vehicle-ownership', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/vehicle-ownership/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch vehicle ownership data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface SeniorsData {
  communityArea: string;
  communityNumber: number;
  totalPopulation: number;
  population65Plus: number;
  pct65Plus: number;
  age65to74: number;
  age75to84: number;
  age85Plus: number;
  seniorsLivingAlone: number;
  pctSeniorsLivingAlone: number;
  seniorDemandLevel: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

export function useSeniorsData(communityArea: string | null | undefined) {
  return useQuery<SeniorsData | null>({
    queryKey: ['/api/seniors', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/seniors/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch seniors data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface SeniorsZipData {
  zipCode: string;
  totalPopulation: number;
  population65Plus: number;
  pct65Plus: number;
  age65to74: number;
  age75to84: number;
  age85Plus: number;
  seniorsLivingAlone: number;
  pctSeniorsLivingAlone: number;
  seniorDemandLevel: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

export function useSeniorsZipData(zipCode: string | null | undefined) {
  return useQuery<SeniorsZipData | null>({
    queryKey: ['/api/seniors-zip', zipCode],
    enabled: !!zipCode,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/seniors-zip/${zipCode}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch seniors ZIP data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface LanguageData {
  communityArea: string;
  communityNumber: number;
  population5Plus: number;
  englishOnlyPct: number;
  nonEnglishPct: number;
  topLanguages: Array<{
    language: string;
    count: number;
    pct: number;
  }>;
  limitedEnglishProficiency: {
    count: number;
    pct: number;
  };
  linguisticDiversity: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

export function useLanguageData(communityArea: string | null | undefined) {
  return useQuery<LanguageData | null>({
    queryKey: ['/api/languages', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/languages/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch language data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface LanguageZipData {
  zipCode: string;
  population5Plus: number;
  englishOnlyPct: number;
  nonEnglishPct: number;
  topLanguages: Array<{
    language: string;
    count: number;
    pct: number;
  }>;
  limitedEnglishProficiency: {
    count: number;
    pct: number;
  };
  linguisticDiversity: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

export function useLanguageZipData(zipCode: string | null | undefined) {
  return useQuery<LanguageZipData | null>({
    queryKey: ['/api/languages-zip', zipCode],
    enabled: !!zipCode,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/languages-zip/${encodeURIComponent(zipCode)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch language ZIP data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface ChildcareEnhancedData {
  communityArea: string;
  communityNumber: number;
  childrenUnder5: number;
  children0to2: number;
  children3to4: number;
  pct0to2: number;
  pct3to4: number;
  parentsInLaborForce0to5: number;
  parentsInLaborForcePct0to5: number;
  parentsInLaborForce6to17: number;
  parentsInLaborForcePct6to17: number;
  laborForceDelta: number;
  deltaInterpretation: string;
  daycareOpportunityScore: 'excellent' | 'good' | 'moderate' | 'low';
  marketInsight: string;
}

export function useChildcareEnhancedData(communityArea: string | null | undefined) {
  return useQuery<ChildcareEnhancedData | null>({
    queryKey: ['/api/childcare-enhanced', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/childcare-enhanced/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch enhanced childcare data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface ChildcareEnhancedZipData {
  zipCode: string;
  childrenUnder5: number;
  children0to2: number;
  children3to4: number;
  pct0to2: number;
  pct3to4: number;
  parentsInLaborForce0to5: number;
  parentsInLaborForcePct0to5: number;
  parentsInLaborForcePct6to17: number;
  laborForceDelta: number;
  deltaInterpretation: string;
  daycareOpportunityScore: 'excellent' | 'good' | 'moderate' | 'low';
  marketInsight: string;
}

export function useChildcareEnhancedZipData(zipCode: string | null | undefined) {
  return useQuery<ChildcareEnhancedZipData | null>({
    queryKey: ['/api/childcare-enhanced-zip', zipCode],
    enabled: !!zipCode,
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/childcare-enhanced-zip/${encodeURIComponent(zipCode)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch enhanced childcare ZIP data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export interface BuildingPermit {
  id: string;
  permitNumber: string;
  permitType: string;
  workDescription: string;
  issueDate: string;
  estimatedCost: number | null;
  status: string;
  streetNumber: string;
  streetDirection: string;
  streetName: string;
  ownerName: string | null;
  architectName: string | null;
  architectType: string | null;
  generalContractorName: string | null;
  expediterName: string | null;
}

export interface PermitSummary {
  totalPermits: number;
  mostRecent: {
    date: string;
    type: string;
    status: string;
    cost: number | null;
  } | null;
  byType: {
    newConstruction: number;
    renovation: number;
    repair: number;
    demolition: number;
    other: number;
  };
  totalEstimatedCost: number;
  expiredOrIncomplete: number;
  permits: BuildingPermit[];
  olderPermitsSummary?: {
    count: number;
    earliestYear: number;
    latestYear: number;
    totalEstimatedCost: number;
  } | null;
  olderPermits?: BuildingPermit[];
  parseError?: boolean;
  apiError?: boolean;
  parsedAddress?: { streetNumber: string; streetDirection: string; streetName: string };
}

export interface ViolationSummary {
  openViolations: number;
  totalViolationsLast5Years: number;
  violationsByType: Record<string, number>;
  statusBreakdown: {
    open: number;
    complied: number;
    other: number;
  };
  parseError?: boolean;
  apiError?: boolean;
  parsedAddress?: { streetNumber: string; streetDirection: string; streetName: string };
}

export function usePermitHistory(address: string | null | undefined) {
  return useQuery<PermitSummary | null>({
    queryKey: ['/api/permits', address],
    enabled: !!address,
    queryFn: async () => {
      if (!address) return null;
      const encodedAddress = encodeURIComponent(address);
      const res = await fetch(`/api/permits?address=${encodedAddress}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useViolationHistory(address: string | null | undefined) {
  return useQuery<ViolationSummary | null>({
    queryKey: ['/api/violations', address],
    enabled: !!address,
    queryFn: async () => {
      if (!address) return null;
      const encodedAddress = encodeURIComponent(address);
      const res = await fetch(`/api/violations?address=${encodedAddress}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

// Combined Permits/Violations for associated PINs
export interface CombinedPermitViolation {
  addresses: string[];
  permits: PermitSummary & {
    addressBreakdown: Record<string, { count: number; totalCost: number }>;
  };
  violations: ViolationSummary & {
    addressBreakdown: Record<string, { open: number; total: number }>;
  };
}

// Cache version - increment to invalidate cached data after API changes
const CACHE_VERSION = 4;

export function useCombinedPermitViolations(
  address: string | null | undefined,
  associatedPins: string[] | null | undefined,
  city?: string | null
) {
  return useQuery<CombinedPermitViolation | null>({
    queryKey: ['/api/permits-violations-combined', address, associatedPins, CACHE_VERSION, city || null],
    enabled: !!address,
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch('/api/permits-violations-combined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryAddress: address,
          associatedPins: associatedPins || [],
          city: city || undefined,
        }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

// Crime Statistics
export interface CrimeStatsRadius {
  totalCrimes: number;
  crimesByType: Record<string, number>;
  timeframe: string;
  radius: string;
  apiError?: boolean;
}

interface CrimeStats {
  nearby: CrimeStatsRadius;
  quarterMile: CrimeStatsRadius;
}

export function useCrimeStats(lat: number | null | undefined, lng: number | null | undefined) {
  return useQuery<CrimeStats | null>({
    queryKey: ['/api/crime-stats', lat, lng, CACHE_VERSION],
    enabled: lat != null && lng != null && !isNaN(lat) && !isNaN(lng),
    queryFn: async () => {
      if (lat == null || lng == null) return null;
      const res = await fetch(`/api/crime-stats?lat=${lat}&lng=${lng}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

interface CrimeCategoryRanking {
  count: number;
  ratePer1000: number | null;
  saferThanPercent: number;
  tier: string;
}

interface CrimeTractRanking {
  tractCount: number;
  saferThanPercent: number;
  cityMedianCount: number;
  totalTracts: number;
  tier: string;
  population?: number | null;
  perCapita?: boolean;
  violent?: CrimeCategoryRanking;
  property?: CrimeCategoryRanking;
  trend?: { years: { year: number; count: number }[]; yoyPercent: number | null; threeYearPercent: number | null } | null;
}

export function useCrimeTractRanking(communityArea: string | null | undefined) {
  return useQuery<CrimeTractRanking | null>({
    queryKey: ['/api/crime-tract-ranking', communityArea],
    enabled: !!communityArea && communityArea.length >= 3,
    queryFn: async () => {
      const res = await fetch(`/api/crime-tract-ranking?communityArea=${encodeURIComponent(communityArea!)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export interface ElectionResult {
  democratic_pct: number;
  republican_pct: number;
  other_pct: number;
  margin: string;
  total_votes: number;
}

export interface MayoralResult {
  winner: string;
  winner_label: string;
  winner_pct: number;
  opponent: string;
  opponent_label: string;
  opponent_pct: number;
}

export interface Referendum {
  question: string;
  year: number;
  yes_pct: number;
  no_pct: number;
  passed: boolean;
}

export interface ElectionData {
  name: string;
  number: number;
  presidential: {
    '2024': ElectionResult;
    '2020': ElectionResult;
    '2016': ElectionResult;
  };
  mayoral: {
    '2023': MayoralResult;
    '2019': MayoralResult;
  };
  referendums: Referendum[];
  classification: string;
  avg_dem_margin: number;
  trend: string;
  data_sources: string[];
  notes: string;
  last_updated: string;
}

export function useElectionData(communityArea: string | null | undefined) {
  return useQuery<ElectionData | null>({
    queryKey: ['/api/elections', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/elections/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch election data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

// === CHILDCARE CAPACITY DATA ===

export interface ChildcareCapacityData {
  community_area: string;
  pop_age_1_under: number;
  pop_age_2: number;
  pop_ages_3_4: number;
  pop_age_5: number;
  pop_5_under: number;
  ccap_licensed_centers: number;
  ccap_exempt_centers: number;
  ccap_licensed_family: number;
  ccap_exempt_family: number;
  ccap_total: number;
  ccap_children_total: number;
  num_centers: number;
  num_family_homes: number;
  total_providers: number;
  center_capacity_0_23mo: number;
  center_capacity_2yr: number;
  center_capacity_3_K: number;
  center_total_capacity: number;
  family_capacity_0_23mo: number;
  family_capacity_2yr: number;
  family_capacity_3_K: number;
  family_total_capacity: number;
  avg_family_home_size: number;
  capacity_0_23mo: number;
  capacity_2yr: number;
  capacity_3_K: number;
  total_capacity: number;
  capacity_0_2_total: number;
  avg_center_size: number;
  excelrate_sites: number;
  excelrate_circle: number;
  excelrate_bronze: number;
  excelrate_silver: number;
  excelrate_gold: number;
  pct_ccap: number;
  pct_excelrate: number;
  pct_slots_ccap: number;
  citywide_pct_ccap: number;
  citywide_capacity: number;
}

export function useChildcareCapacity(communityArea: string | null | undefined) {
  return useQuery<ChildcareCapacityData | null>({
    queryKey: ['/api/childcare-capacity', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      if (!communityArea) return null;
      const res = await fetch(`/api/childcare-capacity/${encodeURIComponent(communityArea)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch childcare capacity data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export interface ChildcareCapacityZipData {
  zip_code: string;
  pop_age_1_under: number;
  pop_age_2: number;
  pop_ages_3_4: number;
  pop_age_5: number;
  pop_5_under: number;
  ccap_licensed_centers: number;
  ccap_exempt_centers: number;
  ccap_licensed_family: number;
  ccap_exempt_family: number;
  ccap_total: number;
  ccap_children_total: number;
  num_centers: number;
  num_family_homes: number;
  total_providers: number;
  center_capacity_0_23mo: number;
  center_capacity_2yr: number;
  center_capacity_3_K: number;
  center_total_capacity: number;
  family_capacity_0_23mo: number;
  family_capacity_2yr: number;
  family_capacity_3_K: number;
  family_total_capacity: number;
  avg_family_home_size: number;
  capacity_0_23mo: number;
  capacity_2yr: number;
  capacity_3_K: number;
  total_capacity: number;
  capacity_0_2_total: number;
  avg_center_size: number;
  excelrate_sites: number;
  excelrate_circle: number;
  excelrate_bronze: number;
  excelrate_silver: number;
  excelrate_gold: number;
  pct_ccap: number;
  pct_excelrate: number;
  pct_slots_ccap: number;
  citywide_pct_ccap: number;
  citywide_capacity: number;
}

export function useChildcareCapacityZip(zipCode: string | null | undefined) {
  return useQuery<ChildcareCapacityZipData | null>({
    queryKey: ['/api/childcare-capacity-zip', zipCode],
    enabled: !!zipCode && /^\d{5}$/.test(zipCode),
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/childcare-capacity-zip/${zipCode}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch childcare capacity ZIP data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export interface FairMarketRentData {
  zipCode: string;
  fiscalYear: number;
  rents: {
    efficiency: number;
    oneBed: number;
    twoBed: number;
    threeBed: number;
    fourBed: number;
  };
  ranking: {
    rank: number;
    total: number;
    percentile: number;
  } | null;
  cityStats: {
    median: number;
    min: number;
    max: number;
    totalZips: number;
  };
}

export function useFairMarketRent(zipCode: string | null | undefined) {
  return useQuery<FairMarketRentData | null>({
    queryKey: ['/api/fmr', zipCode],
    enabled: !!zipCode && /^\d{5}$/.test(zipCode),
    queryFn: async () => {
      if (!zipCode) return null;
      const res = await fetch(`/api/fmr/${zipCode}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch fair market rent data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export interface CtaRidershipStation {
  stationName: string;
  stationId: string;
  latestMonth: string;
  latest: {
    weekday: number;
    saturday: number;
    sunday: number;
    total: number;
  } | null;
  weekdayRank: number;
  totalStationsRanked: number;
  trendPct: number | null;
  monthlyData: Array<{
    month: string;
    weekday: number;
    saturday: number;
    sunday: number;
    total: number;
  }>;
}

export interface CtaRidershipData {
  stations: CtaRidershipStation[];
  systemStats: {
    median: number;
    average: number;
    totalStations: number;
    latestMonth: string;
  };
}

export interface CtaBusRidershipRoute {
  route: string;
  routeName: string;
  latestMonth: string;
  latest: {
    weekday: number;
    saturday: number;
    sunday: number;
    total: number;
  } | null;
  weekdayRank: number;
  totalRoutesRanked: number;
  trendPct: number | null;
  monthlyData: Array<{
    month: string;
    weekday: number;
    saturday: number;
    sunday: number;
    total: number;
  }>;
}

export interface CtaBusRidershipData {
  routes: CtaBusRidershipRoute[];
  systemStats: {
    median: number;
    average: number;
    totalRoutes: number;
    latestMonth: string;
  };
}

export function useNewConstruction(lat: number | undefined, lon: number | undefined, communityArea?: string) {
  return useQuery<any>({
    queryKey: ['/api/new-construction', lat, lon, communityArea],
    enabled: lat != null && lon != null,
    queryFn: async () => {
      const res = await fetch('/api/new-construction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ communityArea, lat, lng: lon }),
      });
      if (!res.ok) throw new Error('Failed to fetch new construction data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useNearbyNewConstruction(lat: number | undefined, lon: number | undefined, communityArea?: string) {
  return useQuery<any>({
    queryKey: ['/api/new-construction-nearby', lat, lon, communityArea],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      const res = await fetch('/api/new-construction-nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng: lon, communityArea }),
      });
      if (!res.ok) throw new Error('Failed to fetch nearby new construction data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useCtaBusRidership(routeNumbers: string[] | undefined) {
  return useQuery<CtaBusRidershipData | null>({
    queryKey: ['/api/cta-bus-ridership', routeNumbers],
    enabled: !!routeNumbers && routeNumbers.length > 0,
    queryFn: async () => {
      if (!routeNumbers || routeNumbers.length === 0) return null;
      const res = await fetch('/api/cta-bus-ridership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ routes: routeNumbers }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch CTA bus ridership data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useCtaRidership(
  stationNameOrStations: string | null | undefined | Array<{ stopName: string; routes?: string[]; stationId?: string; distance?: number }>,
  routes?: string[] | undefined,
  stationId?: string
) {
  const isArray = Array.isArray(stationNameOrStations);
  const stationsArray = isArray ? stationNameOrStations : null;
  const stationName = isArray ? null : stationNameOrStations;
  const enabled = isArray ? stationsArray!.length > 0 : !!stationName;
  const queryKey = isArray
    ? ['/api/cta-ridership', 'multi', stationsArray!.map(s => s.stationId || s.stopName)]
    : ['/api/cta-ridership', stationName, routes, stationId];

  return useQuery<CtaRidershipData | null>({
    queryKey,
    enabled,
    queryFn: async () => {
      const body = isArray
        ? { stations: stationsArray }
        : { stationName, routes: routes || [], stationId };
      const res = await fetch('/api/cta-ridership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch CTA ridership data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useMetraRidership(stationName: string | null | undefined) {
  return useQuery<{ stationName: string; rank: number; totalStations: number; surveyYear: number; boards2018: number; boards2016: number | null; boards2014: number | null; boards2006: number | null } | null>({
    queryKey: ['/api/metra-ridership', stationName],
    enabled: !!stationName,
    queryFn: async () => {
      const res = await fetch(`/api/metra-ridership?station=${encodeURIComponent(stationName!)}`, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch Metra ridership data');
      return await res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export interface MetraLineRidership {
  meta: { source: string; sourceUrl: string; updatedThrough: string; zoneNotes: string };
  lines: { name: string; latest: { year: number; month: number; rides: number }; yoyPct: number | null; monthly: { month: string; rides: number }[] }[];
  stationZones: Record<string, number>;
  stationZonesById: Record<string, number>;
  zoneFlows: { month: string; pairs: Record<string, number> } | null;
}

export function useMetraLineRidership(enabled: boolean) {
  return useQuery<MetraLineRidership | null>({
    queryKey: ['/api/metra-line-ridership'],
    enabled,
    queryFn: async () => {
      const res = await fetch('/api/metra-line-ridership', { credentials: 'include' });
      if (res.status === 404 || res.status === 503) return null;
      if (!res.ok) throw new Error('Failed to fetch Metra line ridership data');
      return await res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useNearbyBusinessLicenses(lat: number | undefined, lon: number | undefined) {
  return useQuery<NearbyLicensesResponse>({
    queryKey: ['/api/nearby-business-licenses', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      const res = await fetch('/api/nearby-business-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng: lon }),
      });
      if (!res.ok) throw new Error('Failed to fetch nearby business licenses');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useNearbyArtGalleries(lat: number | undefined, lon: number | undefined) {
  return useQuery<any>({
    queryKey: ['/api/nearby-art-galleries', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      const res = await fetch('/api/nearby-art-galleries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng: lon }),
      });
      if (!res.ok) throw new Error('Failed to fetch nearby art galleries');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function usePlacesOfWorship(lat: number | undefined, lon: number | undefined) {
  return useQuery<any>({
    queryKey: ['/api/places-of-worship', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      const res = await fetch('/api/places-of-worship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng: lon }),
      });
      if (!res.ok) throw new Error('Failed to fetch places of worship');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useAddressNews(address: string | undefined) {
  return useQuery<{ address: string; article_count: number; articles: Array<{ title: string; url: string; summary: string; published: string; source: string }> } | null>({
    queryKey: ['/api/address-news', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/address-news?address=${encodeURIComponent(address!)}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
  });
}

export function useNeighborhoodNews(neighborhood: string | undefined) {
  return useQuery<any>({
    queryKey: ['/api/neighborhood-news', neighborhood],
    enabled: !!neighborhood,
    queryFn: async () => {
      const res = await fetch(`/api/neighborhood-news?neighborhood=${encodeURIComponent(neighborhood!)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch neighborhood news');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export interface VacantBuildingViolation {
  address: string;
  issuedDate: string | null;
  lastHearingDate: string | null;
  violationType: string;
  disposition: string;
  entity: string;
  totalFines: number;
  currentAmountDue: number;
  docketNumber: string;
  latitude: number;
  longitude: number;
}

export interface VacantBuildingsData {
  quarterMile: {
    violations: VacantBuildingViolation[];
    totalViolations: number;
    uniqueAddresses: number;
  };
  halfMile: {
    violations: VacantBuildingViolation[];
    totalViolations: number;
    uniqueAddresses: number;
  };
  totalViolations: number;
  totalUniqueAddresses: number;
}

export function useVacantBuildingsNearby(lat: number | undefined, lng: number | undefined) {
  return useQuery<VacantBuildingsData | null>({
    queryKey: ['/api/vacant-buildings/nearby', lat, lng, CACHE_VERSION],
    enabled: lat !== undefined && lng !== undefined,
    queryFn: async () => {
      if (lat === undefined || lng === undefined) return null;
      const res = await fetch('/api/vacant-buildings/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon: lng }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useCorridorNews(
  lat: number | undefined,
  lng: number | undefined,
  address?: string,
  neighborhood?: string,
  communityArea?: string,
) {
  return useQuery<any>({
    queryKey: ['/api/corridor-news', lat, lng, address, neighborhood, communityArea],
    enabled: lat !== undefined && lng !== undefined,
    queryFn: async () => {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (address) params.set('address', address);
      if (neighborhood) params.set('neighborhood', neighborhood);
      if (communityArea) params.set('communityArea', communityArea);
      const res = await fetch(
        `/api/corridor-news?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch corridor news');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

export interface ZbaApproval {
  caseNumber: string;
  ward: number;
  zoningDistrict: string;
  address: string;
  applicant: string;
  subject: string;
  decision: 'Approved' | 'Denied' | 'Continued' | 'Withdrawn';
  meetingDate: string;
  meetingMonth: string;
  lat?: number;
  lon?: number;
}

export interface ZbaUpcoming {
  caseNumber: string;
  ward: number;
  zoningDistrict: string;
  address: string;
  applicant: string;
  subject: string;
  hearingDate: string;
  hearingMonth: string;
  lat?: number;
  lon?: number;
}

export function useZbaApprovals(ward: number | null | undefined) {
  return useQuery<{ approvals: ZbaApproval[]; upcoming: ZbaUpcoming[] }>({
    queryKey: ['/api/zba-approvals', ward],
    enabled: !!ward,
    queryFn: async () => {
      const res = await fetch(`/api/zba-approvals?ward=${ward}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch ZBA approvals');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24 * 7,
    refetchOnWindowFocus: false,
  });
}

export interface MortgageRateData {
  rate: number;
  date: string;
  fetchedAt: number;
  stale?: boolean;
}

export function useMortgageRate() {
  return useQuery<MortgageRateData | null>({
    queryKey: ['/api/mortgage-rate'],
    queryFn: async () => {
      const res = await fetch('/api/mortgage-rate', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
  });
}

export interface HmdaBreakdownItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface HmdaLenderItem {
  lei: string;
  name: string;
  count: number;
  pct: number;
  avgFirstLienRate?: number | null;
  closedCount?: number;
  deniedCount?: number;
}

export interface HmdaSubStats {
  total: number;
  byRace: HmdaBreakdownItem[];
  byEthnicity: HmdaBreakdownItem[];
  bySex: HmdaBreakdownItem[];
  byAge: HmdaBreakdownItem[];
  byIncomeBin?: HmdaBreakdownItem[];
  medianIncome?: number | null;
  byDti?: HmdaBreakdownItem[];
  byDenialReason?: HmdaBreakdownItem[];
  byProductType?: HmdaBreakdownItem[];
  byLoanType?: HmdaBreakdownItem[];
  byOccupancy?: HmdaBreakdownItem[];
  byDwellingCategory?: HmdaBreakdownItem[];
  byPropertyValueBin?: HmdaBreakdownItem[];
  medianPropertyValue?: number | null;
}

export interface HmdaStats {
  total: number;
  byAction: HmdaBreakdownItem[];
  byProductType: HmdaBreakdownItem[];
  byOccupancy: HmdaBreakdownItem[];
  byLoanType: HmdaBreakdownItem[];
  byEthnicity: HmdaBreakdownItem[];
  byRace: HmdaBreakdownItem[];
  byAge: HmdaBreakdownItem[];
  byDenialReason: HmdaBreakdownItem[];
  originated?: HmdaSubStats;
  denied?: HmdaSubStats;
  byCreditScoreType: HmdaBreakdownItem[];
  byDwellingCategory: HmdaBreakdownItem[];
  byPropertyValueBin: HmdaBreakdownItem[];
  medianPropertyValue: number | null;
  byLender: HmdaLenderItem[];
  byIncomeBin: HmdaBreakdownItem[];
  medianIncome: number | null;
  byDti: HmdaBreakdownItem[];
  bySex?: HmdaBreakdownItem[];
}

export interface HmdaCommunityRank {
  byTotal: { rank: number | null; outOf: number };
  byOriginated: { rank: number | null; outOf: number };
}

export interface HmdaYearData {
  tract: HmdaStats | null;
  community: HmdaStats | null;
  communityRank?: HmdaCommunityRank | null;
}

export interface HmdaYearRate {
  avgFirstLienRate: number | null;
  firstLienRateCount: number;
}

export interface HmdaRates {
  avgRate: number | null;
  avgFirstLienRate: number | null;
  rateCount: number;
  firstLienRateCount: number;
  y2025?: HmdaYearRate | null;
  y2024?: HmdaYearRate | null;
  y2023?: HmdaYearRate | null;
}

export interface HmdaData {
  2025: HmdaYearData;
  2024: HmdaYearData;
  rates?: { tract: HmdaRates | null; community: HmdaRates | null };
}

export function useHmdaStats(tract: string | null | undefined, communityArea: string | null | undefined) {
  return useQuery<HmdaData | null>({
    queryKey: ['/api/hmda-stats', tract, communityArea],
    enabled: !!(tract || communityArea),
    queryFn: async () => {
      if (!tract && !communityArea) return null;
      const params = new URLSearchParams();
      if (tract) params.set('tract', tract);
      if (communityArea) params.set('communityArea', communityArea);
      const res = await fetch(`/api/hmda-stats?${params}`, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useSBALoans(zipCode: string | null | undefined) {
  return useQuery<any>({
    queryKey: ['/api/sba-loans', zipCode],
    enabled: !!(zipCode && /^\d{5}$/.test(zipCode)),
    queryFn: async () => {
      const res = await fetch(`/api/sba-loans?zip=${zipCode}`, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`SBA loans request failed (${res.status})`); // retryable — do NOT cache a transient failure as "no data"
      return await res.json();
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useComparableSales(
  lat: number | null | undefined,
  lng: number | null | undefined,
  propertyClass: string | null | undefined,
  sqft: number | null | undefined,
  beds: number | null | undefined,
  baths: number | null | undefined,
) {
  return useQuery<any>({
    queryKey: ['/api/comparable-sales', lat, lng, propertyClass],
    enabled: !!(lat && lng && propertyClass),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('lat', String(lat));
      params.set('lng', String(lng));
      params.set('propertyClass', String(propertyClass));
      if (sqft) params.set('sqft', String(sqft));
      if (beds) params.set('beds', String(beds));
      if (baths) params.set('baths', String(baths));
      const res = await fetch(`/api/comparable-sales?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch comparable sales');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useSchoolsNearby(lat: number | undefined, lon: number | undefined) {
  return useQuery<any>({
    queryKey: ['/api/schools-nearby', lat, lon],
    enabled: !!(lat && lon),
    queryFn: async () => {
      const res = await fetch(`/api/schools-nearby?lat=${lat}&lon=${lon}&radius=1.5`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch school data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useUpcomingDevelopments(
  neighborhood: string | undefined,
  communityArea: string | undefined,
  lat?: number | null,
  lon?: number | null,
  radiusMi: 0.5 | 1 = 0.5,
) {
  return useQuery<any>({
    queryKey: ['/api/upcoming-developments', neighborhood, communityArea, lat, lon, radiusMi],
    enabled: !!(neighborhood || communityArea),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (neighborhood) params.set('neighborhood', neighborhood);
      if (communityArea) params.set('communityArea', communityArea);
      if (lat != null) params.set('lat', String(lat));
      if (lon != null) params.set('lon', String(lon));
      params.set('radiusMi', String(radiusMi));
      const res = await fetch(`/api/upcoming-developments?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch upcoming developments');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
  });
}

export function useAirbnbStats(communityArea: string | undefined) {
  return useQuery<any>({
    queryKey: ['/api/airbnb-stats', communityArea],
    enabled: !!communityArea,
    queryFn: async () => {
      const res = await fetch(`/api/airbnb-stats?communityArea=${encodeURIComponent(communityArea!)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch Airbnb data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24 * 7,
    refetchOnWindowFocus: false,
  });
}

export function useRentcast(zipCode: string | undefined) {
  return useQuery<any>({
    queryKey: ['/api/rentcast', zipCode],
    enabled: !!zipCode && /^\d{5}$/.test(zipCode),
    queryFn: async () => {
      const res = await fetch(`/api/rentcast?zipCode=${zipCode}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch RentCast data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useRentcastRadius(lat: number | undefined, lng: number | undefined, zipCode?: string) {
  return useQuery<any>({
    queryKey: ['/api/rentcast/radius', lat?.toFixed(4), lng?.toFixed(4)],
    enabled: typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng),
    queryFn: async () => {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (zipCode) params.set('zipCode', zipCode);
      const res = await fetch(`/api/rentcast/radius?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch radius rental data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useRelatedParcels(
  address: string | undefined,
  primaryPin: string | null | undefined,
  ownerName: string | null | undefined,
  primaryDocNos?: string[],
  legalDescriptionPins?: Array<{ pin: string; address: string }>
) {
  const legalKey = (legalDescriptionPins ?? []).map(p => p.pin).join(',');
  return useQuery({
    queryKey: ['/api/related-parcels', primaryPin, (primaryDocNos ?? []).join(','), legalKey],
    queryFn: async () => {
      const res = await fetch('/api/related-parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address, primaryPin, ownerName, primaryDocNos: primaryDocNos ?? [], legalDescriptionPins: legalDescriptionPins ?? [] }),
      });
      if (!res.ok) return { relatedParcels: [] };
      return res.json() as Promise<{
        relatedParcels: Array<{
          formattedAddress: string;
          pin: string;
          ownerName: string;
          saleHistory: Array<{
            saleDate: string;
            salePrice: number;
            sellerName: string;
            buyerName: string;
            deedType: string;
            docNo: string;
            year: string;
          }>;
          matchReason: string;
        }>;
        fromCache?: boolean;
      }>;
    },
    enabled: !!address && !!primaryPin && (!!ownerName || (legalDescriptionPins ?? []).length > 0),
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useJBANearby(lat: number | undefined, lon: number | undefined) {
  return useQuery<any | null>({
    queryKey: ["/api/jba/nearby", lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      if (!lat || !lon) return null;
      const res = await fetch("/api/jba/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radiusMiles: 1 }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch JBA restaurant data");
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useGooglePlaces(
  lat: number | undefined,
  lon: number | undefined,
  searchTerm: string | undefined | null,
  enabled: boolean = true,
) {
  return useQuery<any>({
    queryKey: ['/api/google-places', lat?.toFixed(3), lon?.toFixed(3), searchTerm],
    enabled:
      enabled &&
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      !!searchTerm,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('lat', String(lat));
      params.set('lon', String(lon));
      params.set('searchTerm', searchTerm!);
      const res = await fetch(`/api/google-places?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch Google Places data');
      return await res.json();
    },
    staleTime: 0,
    refetchInterval: (query: any) =>
      (!query.state.data || query.state.data.status === 'pending') ? 20000 : false,
    refetchOnWindowFocus: false,
  });
}

export function usePeerspace(
  lat: number | undefined,
  lon: number | undefined,
  zipCode: string | undefined,
  enabled: boolean = true,
) {
  return useQuery<any>({
    queryKey: ['/api/peerspace', lat?.toFixed(4), lon?.toFixed(4), zipCode],
    enabled:
      enabled &&
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      !!zipCode,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('lat', String(lat));
      params.set('lon', String(lon));
      if (zipCode) params.set('zipCode', zipCode);
      const res = await fetch(`/api/peerspace?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch Peerspace data');
      return await res.json();
    },
    staleTime: 0,
    refetchInterval: (query: any) =>
      (!query.state.data || query.state.data.status === 'pending') ? 30000 : false,
    refetchOnWindowFocus: false,
  });
}

export function useLoopNet(
  lat: number | undefined,
  lon: number | undefined,
  zipCode: string | undefined,
  address: string | undefined,
  enabled: boolean = true,
) {
  return useQuery<any>({
    queryKey: ['/api/loopnet', lat?.toFixed(4), lon?.toFixed(4), zipCode],
    enabled:
      enabled &&
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      !!zipCode,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('lat', String(lat));
      params.set('lon', String(lon));
      if (zipCode) params.set('zipCode', zipCode);
      if (address) params.set('address', address);
      const res = await fetch(`/api/loopnet?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch LoopNet data');
      return await res.json();
    },
    staleTime: 0,
    refetchInterval: (query: any) =>
      (!query.state.data || query.state.data.status === 'pending') ? 25000 : false,
    refetchOnWindowFocus: false,
  });
}

export function useTransactionTrends(zip: string | undefined | null) {
  return useQuery<any>({
    queryKey: ['/api/transaction-trends', zip],
    enabled: !!zip && /^\d{5}$/.test(zip),
    queryFn: async () => {
      const res = await fetch(`/api/transaction-trends?zip=${zip}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch transaction trends');
      return await res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useBusinessLicenseHistory(address: string | undefined) {
  return useQuery<any>({
    queryKey: ['/api/business-license-history', address],
    enabled: !!address,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (address) params.set('address', address);
      const res = await fetch(`/api/business-license-history?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch business license history');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useSidewalkCafe(address: string | undefined) {
  return useQuery<any>({
    queryKey: ['/api/sidewalk-cafe', address],
    enabled: !!address,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (address) params.set('address', address);
      const res = await fetch(`/api/sidewalk-cafe?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch sidewalk cafe permits');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useZoningHistory(address: string | undefined, ward?: number | null, altAddresses?: string[]) {
  return useQuery<any>({
    queryKey: ['/api/zoning-history', address, ward, (altAddresses || []).join('|')],
    enabled: !!address,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (address) params.set('address', address);
      if (ward != null) params.set('ward', String(ward));
      for (const alt of altAddresses || []) params.append('alt', alt);
      const res = await fetch(`/api/zoning-history?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch zoning history');
      return await res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export interface TrafficCountData {
  segmentId: string;
  roadName: string;
  direction: string;
  fromSegment: string;
  toSegment: string;
  distanceFt: number;
  latestCount: number;
  latestDate: string;
  cityRank: number;
  cityTotal: number;
  percentile: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  yearlyAverages: { year: number; avgCount: number }[];
}

export interface LodesData {
  tractGeoid: string;
  workersInTract: number;
  residentsWhoWork: number;
  highEarners: number;
  retailJobs: number;
  healthcareJobs: number;
  artsEntertainmentJobs: number;
  foodServiceJobs: number;
}

export function useLodesData(tractGeoid: string | null | undefined) {
  return useQuery<LodesData | null>({
    queryKey: ['/api/lodes', tractGeoid],
    enabled: !!tractGeoid,
    queryFn: async () => {
      const res = await fetch(`/api/lodes?tractGeoid=${tractGeoid}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch LODES data');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}

export function useTrafficCount(lat: number | null | undefined, lon: number | null | undefined) {
  return useQuery<TrafficCountData | null>({
    queryKey: ['/api/traffic-count', lat, lon],
    enabled: !!lat && !!lon,
    queryFn: async () => {
      const res = await fetch(`/api/traffic-count?lat=${lat}&lon=${lon}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch traffic count');
      return await res.json();
    },
    staleTime: 1000 * 60 * 60 * 6,
    refetchOnWindowFocus: false,
  });
}

export function useListingData(runId: number | null | undefined) {
  return useQuery<any>({
    queryKey: ['/api/runs', runId, 'listing-data'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/listing-data`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch listing data');
      const data = await res.json();
      // Don't treat null as a permanent result — throw so React Query retries
      if (data === null) throw new Error('no-listing-data');
      return data;
    },
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days once we have real data
    retry: (failureCount, error: any) => {
      // Only retry "no data yet" errors a couple times, not real errors
      if (error?.message === 'no-listing-data') return failureCount < 2;
      return false;
    },
    retryDelay: 3000,
    refetchOnWindowFocus: false,
  });
}

// Listing Snapshot — cached AI web-search lookup of the active listing (on-demand).
// Sends the bearer token too: iframe contexts can block session cookies.
function listingSnapshotAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('kyp_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ListingSnapshotData {
  status: 'active' | 'pending' | 'off_market' | 'not_found';
  statusLabel: string;
  sourceName: string | null;
  sourceUrl: string | null;
  listPrice: number | null;
  daysOnMarket: number | null;
  listedDate: string | null;
  soldDate: string | null;
  soldPrice: number | null;
  remarksSummary: string | null;
  disclosures: string[];
  keyFacts: string[];
  claims: ListingClaim[];
  whyHistorical: string | null;
  unitCount: number | null;
  rentRoll: Array<{ unit: string | null; beds: number | null; baths: number | null; monthlyRent: number | null }>;
  grossAnnualIncome: number | null;
  statedNoi: number | null;
  checkedAt: string;
}

export function useListingSnapshot(runId: number | null | undefined) {
  return useQuery<ListingSnapshotData | null>({
    queryKey: ['/api/runs', runId, 'listing-snapshot'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/listing-snapshot`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || (res.status === 401 ? 'Sign in to view the listing check.' : 'Failed to fetch listing snapshot'));
      }
      return res.json();
    },
    staleTime: Infinity, // only changes when the user explicitly refreshes
    refetchOnWindowFocus: false,
  });
}

export function useGenerateListingSnapshot(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { force?: boolean }) => {
      const res = await fetch(`/api/runs/${runId}/listing-snapshot`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({ force: !!opts?.force }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Listing lookup failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'listing-snapshot'], data);
    },
  });
}

// Crime Takeaway — cached AI summary rendered atop the crime section.
// GET returns stored JSON; POST generates only when the crime data changed.
export interface CrimeTakeaway {
  headline: string | null; // null = generation failed validation; render nothing
  bullets: { tone: 'good' | 'neu' | 'bad'; text: string; metric?: string }[];
  dataHash: string;
  generatedAt: string;
}

export function useCrimeTakeaway(runId: number | null | undefined) {
  return useQuery<CrimeTakeaway | null>({
    queryKey: ['/api/runs', runId, 'crime-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/crime-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateCrimeTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives all crime figures itself from the run's address.
      const res = await fetch(`/api/runs/${runId}/crime-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'crime-takeaway'], data);
    },
  });
}

export interface TransitTakeaway {
  headline: string | null; // null = generation failed validation; render nothing
  bullets: { tone: 'good' | 'neu' | 'bad'; text: string; metric?: string }[];
  accessTier?: 'Strong' | 'Moderate' | 'Limited';
  dataHash: string;
  generatedAt: string;
}

export function useTransitTakeaway(runId: number | null | undefined) {
  return useQuery<TransitTakeaway | null>({
    queryKey: ['/api/runs', runId, 'transit-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/transit-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateTransitTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives all transit figures itself from the run's address.
      const res = await fetch(`/api/runs/${runId}/transit-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'transit-takeaway'], data);
    },
  });
}

export interface SchoolsTakeaway {
  headline: string | null; // null = generation failed validation; render nothing
  bullets: { tone: 'good' | 'neu' | 'bad'; text: string; metric?: string }[];
  dataHash: string;
  generatedAt: string;
}

export function useSchoolsTakeaway(runId: number | null | undefined) {
  return useQuery<SchoolsTakeaway | null>({
    queryKey: ['/api/runs', runId, 'schools-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/schools-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateSchoolsTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives all schools figures itself from the run's address.
      const res = await fetch(`/api/runs/${runId}/schools-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'schools-takeaway'], data);
    },
  });
}

export interface HmdaTakeaway {
  headline: string | null; // null = generation failed validation; render nothing
  bullets: { tone: 'good' | 'neu' | 'bad'; text: string; metric?: string }[];
  dataHash: string;
  generatedAt: string;
}

export function useHmdaTakeaway(runId: number | null | undefined) {
  return useQuery<HmdaTakeaway | null>({
    queryKey: ['/api/runs', runId, 'hmda-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/hmda-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateHmdaTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives all HMDA figures itself from the run's address.
      const res = await fetch(`/api/runs/${runId}/hmda-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'hmda-takeaway'], data);
    },
  });
}

export interface NewsTakeaway {
  section: { title: string; rows: Array<{ tone: 'insight' | 'caution'; html: string; chip: { label: string; href: string } | null }> } | null;
  articles: Array<{ id: string; takeaway: string; attribution: string; headline_only: boolean; verification: { state: 'consistent' | 'appears_superseded' | 'no_update'; text: string; source_anchor: string } | null }>;
  meta: Array<{ id: string; tier: 'parcel' | 'adjacent'; matched_address: string; title: string; source: string; date: string; url: string; age_flag: string | null }>;
  subjectAddress?: string;
  coParcelAddress?: string | null;
  sources_line?: string;
  generatedAt?: string;
}

export function useNewsTakeaway(runId: number | null | undefined) {
  return useQuery<NewsTakeaway | null>({
    queryKey: ['/api/runs', runId, 'news-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/news-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateNewsTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { coParcelAddress?: string | null }) => {
      // Trigger-only: the server fetches the coverage and report facts itself.
      // coParcelAddress is only an extra article-search term, never a data source.
      const res = await fetch(`/api/runs/${runId}/news-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'news-takeaway'], data);
    },
  });
}

export interface NeighborhoodNewsTakeaway {
  takeaway: { title: string; rows: Array<{ tone: 'insight' | 'caution' | 'good'; html: string; chip: { label: string; href: string } | null }> } | null;
  kpis?: { momentumScore: number; articleCount: number; momentumLabel: string };
  culture: Array<{ id: string; title: string; source: string; date: string; url: string }>;
  dev: Array<{ title: string; source: string; date: string; url: string; articleCount: number; stage: string; stageLabel: string; address: string | null; unitCount: number | null; oneLine: string | null; inPermitData: boolean; matchable: boolean }>;
  neighborhood?: string;
  sources_line?: string;
  generatedAt?: string;
}

export function useNeighborhoodNewsTakeaway(runId: number | null | undefined) {
  return useQuery<NeighborhoodNewsTakeaway | null>({
    queryKey: ['/api/runs', runId, 'neighborhood-news-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/neighborhood-news-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export interface PeopleTakeawayRecord {
  takeaway: {
    title: string;
    rows: Array<{ tone: 'good' | 'caution' | 'insight' | 'neutral'; html: string; chip: string | null }>;
    context_note: string | null;
  } | null;
  dataHash?: string;
  generatedAt?: string;
}

export function usePeopleTakeaway(runId: number | null | undefined) {
  return useQuery<PeopleTakeawayRecord | null>({
    queryKey: ['/api/runs', runId, 'people-takeaway'],
    enabled: !!runId,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/people-takeaway`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useGeneratePeopleTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives every input from the run's own address.
      const res = await fetch(`/api/runs/${runId}/people-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'people-takeaway'], data);
    },
  });
}

export function useGenerateNeighborhoodNewsTakeaway(runId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Trigger-only: the server derives neighborhood, articles, and permit
      // records itself from the run's own address.
      const res = await fetch(`/api/runs/${runId}/neighborhood-news-takeaway`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message || 'Takeaway generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/runs', runId, 'neighborhood-news-takeaway'], data);
    },
  });
}

// === DEBT SNAPSHOT (Stage 3) — resolved lien stack + AI takeaway from the same snap ===
export interface DebtSnapshotRecord {
  pin: string;
  snap: {
    schema_version?: number;
    current_owner: string | null; ownership_acquired: string | null; acquired_via: string;
    active: any[]; satisfied?: any[]; cleared_by_sale: any[]; distress: any[]; foreclosure_active: boolean;
    liens: any[]; flags: string[]; docs_total: number;
    scopeChanges?: any[];
    combined_recorded_debt?: number | null;
  };
  snapHash: string;
  takeaway: { title: string; rows: Array<{ tone: 'good' | 'caution' | 'insight' | 'bad'; html: string; chip: string | null }> } | null;
  generatedAt: string | null;
}

export function useDebtSnapshot(pin: string | null | undefined) {
  const normalized = (pin ?? '').replace(/\D/g, '');
  return useQuery<DebtSnapshotRecord | null>({
    queryKey: ['/api/debt-snapshot', normalized],
    enabled: normalized.length === 14,
    queryFn: async () => {
      const res = await fetch(`/api/debt-snapshot/${normalized}`, { credentials: 'include', headers: listingSnapshotAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useBuildDebtSnapshot(pin: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalized = (pin ?? '').replace(/\D/g, '');
  return useMutation({
    mutationFn: async (body: { estimatedValue?: number | null; isCommercial?: boolean | null; coParcels?: Array<{ pin: string; estimatedValue?: number | null }> }) => {
      // Trigger + whitelisted report cross-references only (estimated value,
      // commercial flag) — all debt facts are derived server-side from the record.
      const res = await fetch('/api/debt-snapshot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...listingSnapshotAuthHeaders() },
        body: JSON.stringify({ pin: normalized, ...body }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message || 'Debt snapshot build failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/debt-snapshot', normalized], data);
    },
  });
}

export function useSbaRates() {
  return useQuery<{ sevenARate: number; fiveOhFourRate: number; fiveOhFourSpread?: number; primeRate: number; treasury10: number; asOf: string; stale?: boolean }>({
    queryKey: ['/api/sba-rates'],
    staleTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch('/api/sba-rates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch SBA rates');
      return res.json();
    },
  });
}

export function useIncentivesCheck(
  lat: number | null | undefined,
  lon: number | null | undefined,
  projectCategory: string | null | undefined,
  projectType: string | null | undefined,
  isLandmark: boolean | null | undefined,
  tractGeoid?: string | null,
  zipCode?: string | null,
  zoningCode?: string | null,
  unitCount?: number | null
) {
  return useQuery<{ results: any[] }>({
    queryKey: ['/api/incentives', lat, lon, projectCategory ?? null, projectType ?? null, !!isLandmark, zoningCode ?? null, unitCount ?? null],
    enabled: !!lat && !!lon,
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch('/api/incentives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lon, projectCategory, projectType, isLandmark, tractGeoid, zipCode, zoningCode, unitCount }),
      });
      if (!res.ok) throw new Error('Failed to check incentives');
      return res.json();
    },
  });
}
