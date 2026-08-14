import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "wouter";
import { motion } from "framer-motion";
import { 
  MapPin, 
  Building2, 
  Baby, 
  ChevronLeft,
  DollarSign,
  FileCheck,
  AlertTriangle,
  ExternalLink,
  Info,
  Map,
  Building,
  ShoppingCart,
  Fuel,
  Zap,
  TrendingUp,
  TrendingDown,
  Menu
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sidebar } from "@/components/Sidebar";
import { AreaMap } from "@/components/AreaMap";
import { useBusinessUses, useGroceryAccess, useCommunityAreaGroceryAccess, useEVRegistrations, useGasStationsByZip, useEVStationsByZip, useCoffeeShopsByZip, useHotelsByZip, useRestaurantsByZip, useBarsByZip, useLiquorStoresByZip, useDayCareByZip, useMassageSpaByZip, useAutoRepairByZip, usePetStoresByZip, useVetClinicsByZip, useNightclubsByZip, useEventVenuesByZip, useBreweriesByZip, useCannabisDispensariesByZip, useChildcareCapacity, useChildcareCapacityZip, useChildcareEnhancedData, useChildcareEnhancedZipData } from "@/hooks/use-runs";
import { Users, Award, CheckCircle2, Calculator } from "lucide-react";
import { Leaf } from "lucide-react";
import { Coffee, Hotel, UtensilsCrossed, Beer, Wine, Sparkles, Wrench, PawPrint, Stethoscope, Music, PartyPopper, Factory } from "lucide-react";

interface ChildcareData {
  childrenUnder5: number;
  licensedSlots: number;
  centerSlots: number;
  familyHomeSlots: number;
  childrenPerSlot: number | null;
  status: string;
  statusLabel: string;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

interface SBIFZone {
  name: string;
  tifId?: string;
}

interface NMTCData {
  totalTracts: number;
  eligibleTracts: number;
  coveragePct: number;
}

interface AreaDetailData {
  type: 'zip' | 'community';
  id: string;
  name: string;
  childcare: ChildcareData | null;
  sbifZones: SBIFZone[];
  nmtc: NMTCData | null;
}

// Project types that have childcare-related data
const CHILDCARE_PROJECT_TYPES = ['Day Care Center', 'School (Private)'];

function useAreaDetail(type: 'zip' | 'community', id: string) {
  return useQuery<AreaDetailData>({
    queryKey: ['/api/area', type, id],
    queryFn: async () => {
      const endpoint = type === 'zip' 
        ? `/api/area/zip/${id}` 
        : `/api/area/community/${encodeURIComponent(id)}`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch area data');
      return res.json();
    },
    enabled: !!id
  });
}

function getStatusColor(status: string): string {
  if (status.toLowerCase().includes('desert')) return '';
  if (status.toLowerCase().includes('underserved')) return '';
  return '';
}

function getNmtcStatusColor(pct: number): string {
  return 'text-foreground';
}

interface AreaDetailPageProps {
  type: 'zip' | 'community';
}

export default function AreaDetail({ type }: AreaDetailPageProps) {
  const params = useParams();
  const searchString = useSearch();
  const id = type === 'zip' ? params.zipCode : params.communityId;
  const [selectedProjectType, setSelectedProjectType] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Parse query params to set default project type based on discovery page context
  useEffect(() => {
    const searchParams = new URLSearchParams(searchString);
    const fromDiscovery = searchParams.get('from');
    if (fromDiscovery === 'childcare' && !selectedProjectType) {
      setSelectedProjectType('Day Care Center');
    } else if (fromDiscovery === 'grocery' && !selectedProjectType) {
      setSelectedProjectType('Grocery Store');
    } else if (fromDiscovery === 'gas-stations' && !selectedProjectType) {
      setSelectedProjectType('Gas Station');
    } else if (fromDiscovery === 'coffee' && !selectedProjectType) {
      setSelectedProjectType('Coffee Shop / Cafe');
    } else if (fromDiscovery === 'hotels' && !selectedProjectType) {
      setSelectedProjectType('Hotel');
    }
  }, [searchString]);
  
  const { data, isLoading, error } = useAreaDetail(type, id || '');
  const { data: businessUsesData } = useBusinessUses();

  // Determine which additional data to fetch based on project type
  const isChildcare = selectedProjectType && CHILDCARE_PROJECT_TYPES.includes(selectedProjectType);
  const isDayCare = selectedProjectType === 'Day Care Center';
  const isGrocery = selectedProjectType === 'Grocery Store';
  const isGasStation = selectedProjectType === 'Gas Station';
  const isCoffeeShop = selectedProjectType === 'Coffee Shop / Cafe';
  const isHotel = selectedProjectType === 'Hotel';
  const isRestaurant = selectedProjectType === 'Restaurant (No Liquor)' || 
                       selectedProjectType === 'Restaurant (With Liquor)' || 
                       selectedProjectType === 'Bar / Tavern';
  const isLiquorStore = selectedProjectType === 'Liquor Store (Package Goods)';
  const isSpa = selectedProjectType === 'Spa / Massage';
  const isAutoRepair = selectedProjectType === 'Auto Repair Shop' || selectedProjectType === 'Auto Body Shop';
  const isPetStore = selectedProjectType === 'Pet Store';
  const isVetClinic = selectedProjectType === 'Veterinary Clinic';
  const isNightclub = selectedProjectType === 'Nightclub';
  const isEventVenue = selectedProjectType === 'Event Venue / Banquet Hall';
  const isBrewery = selectedProjectType === 'Brewery / Distillery (Production)';
  const isCannabis = selectedProjectType === 'Cannabis Dispensary';

  // Grocery data hooks - use ZIP code for ZIP areas, community area name for community areas
  const zipCode = type === 'zip' ? id : null;
  const communityArea = type === 'community' ? id : null;
  
  const { data: groceryData, isLoading: isLoadingGrocery } = useGroceryAccess(
    isGrocery ? zipCode : undefined
  );
  const { data: communityGroceryData, isLoading: isLoadingCommunityGrocery } = useCommunityAreaGroceryAccess(
    isGrocery ? communityArea : undefined
  );

  // EV registrations data - only available for ZIP codes
  const { data: evRegistrationsData, isLoading: isLoadingEvRegistrations } = useEVRegistrations(
    isGasStation && type === 'zip' ? zipCode : undefined,
    isGasStation && type === 'zip'
  );

  // Gas stations count by ZIP
  const { data: gasStationsData, isLoading: isLoadingGasStations } = useGasStationsByZip(
    isGasStation && type === 'zip' ? zipCode : undefined,
    isGasStation && type === 'zip'
  );

  // EV charging stations count by ZIP
  const { data: evStationsData, isLoading: isLoadingEvStations } = useEVStationsByZip(
    isGasStation && type === 'zip' ? zipCode : undefined,
    isGasStation && type === 'zip'
  );

  // Coffee shops by ZIP
  const { data: coffeeShopsData, isLoading: isLoadingCoffeeShops } = useCoffeeShopsByZip(
    isCoffeeShop && type === 'zip' ? zipCode : undefined,
    isCoffeeShop && type === 'zip'
  );

  // Hotels by ZIP
  const { data: hotelsData, isLoading: isLoadingHotels } = useHotelsByZip(
    isHotel && type === 'zip' ? zipCode : undefined,
    isHotel && type === 'zip'
  );

  // Restaurants by ZIP
  const { data: restaurantsData, isLoading: isLoadingRestaurants } = useRestaurantsByZip(
    isRestaurant && type === 'zip' ? zipCode : undefined,
    isRestaurant && type === 'zip'
  );

  // Bars by ZIP
  const { data: barsData, isLoading: isLoadingBars } = useBarsByZip(
    isRestaurant && type === 'zip' ? zipCode : undefined,
    isRestaurant && type === 'zip'
  );

  // Liquor stores by ZIP
  const { data: liquorStoresData, isLoading: isLoadingLiquorStores } = useLiquorStoresByZip(
    isLiquorStore && type === 'zip' ? zipCode : undefined,
    isLiquorStore && type === 'zip'
  );

  // Day care centers by ZIP (for Day Care Center project type with business license data)
  const { data: dayCareBusinessData, isLoading: isLoadingDayCareBusiness } = useDayCareByZip(
    !!isChildcare && type === 'zip' ? zipCode : undefined,
    !!isChildcare && type === 'zip'
  );

  // Childcare capacity data - for detailed demographics
  const { data: childcareCapacityData, isLoading: isLoadingCapacity } = useChildcareCapacity(
    isChildcare && type === 'community' ? communityArea : undefined
  );
  const { data: childcareCapacityZipData, isLoading: isLoadingCapacityZip } = useChildcareCapacityZip(
    isChildcare && type === 'zip' ? zipCode : undefined
  );
  const { data: childcareEnhancedData, isLoading: isLoadingEnhanced } = useChildcareEnhancedData(
    isChildcare && type === 'community' ? communityArea : undefined
  );
  const { data: childcareEnhancedZipData, isLoading: isLoadingEnhancedZip } = useChildcareEnhancedZipData(
    isChildcare && type === 'zip' ? zipCode : undefined
  );

  // Massage/Spa by ZIP
  const { data: massageSpaData, isLoading: isLoadingMassageSpa } = useMassageSpaByZip(
    isSpa && type === 'zip' ? zipCode : undefined,
    isSpa && type === 'zip'
  );

  // Auto repair by ZIP
  const { data: autoRepairData, isLoading: isLoadingAutoRepair } = useAutoRepairByZip(
    isAutoRepair && type === 'zip' ? zipCode : undefined,
    isAutoRepair && type === 'zip'
  );

  // Pet stores by ZIP
  const { data: petStoresData, isLoading: isLoadingPetStores } = usePetStoresByZip(
    isPetStore && type === 'zip' ? zipCode : undefined,
    isPetStore && type === 'zip'
  );

  // Veterinary clinics by ZIP
  const { data: vetClinicsData, isLoading: isLoadingVetClinics } = useVetClinicsByZip(
    isVetClinic && type === 'zip' ? zipCode : undefined,
    isVetClinic && type === 'zip'
  );

  // Nightclubs by ZIP
  const { data: nightclubsData, isLoading: isLoadingNightclubs } = useNightclubsByZip(
    isNightclub && type === 'zip' ? zipCode : undefined,
    isNightclub && type === 'zip'
  );

  // Event venues by ZIP
  const { data: eventVenuesData, isLoading: isLoadingEventVenues } = useEventVenuesByZip(
    isEventVenue && type === 'zip' ? zipCode : undefined,
    isEventVenue && type === 'zip'
  );

  // Breweries by ZIP
  const { data: breweriesData, isLoading: isLoadingBreweries } = useBreweriesByZip(
    isBrewery && type === 'zip' ? zipCode : undefined,
    isBrewery && type === 'zip'
  );

  // Cannabis dispensaries by ZIP
  const { data: cannabisData, isLoading: isLoadingCannabis } = useCannabisDispensariesByZip(
    isCannabis && type === 'zip' ? zipCode : undefined,
    isCannabis && type === 'zip'
  );

  if (!id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Invalid Area ID</h2>
          <Link href="/discovery">
            <Button variant="outline" className="mt-4">
              Back to Discovery
            </Button>
          </Link>
        </div>
      </div>
    );
  }

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
          <span className="font-display text-sm font-bold tracking-tight">Area Detail</span>
          <div className="w-6" />
        </div>

      <div className="max-w-4xl mx-auto p-6 md:p-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Link href="/discovery">
            <Button variant="ghost" size="sm" className="gap-1 mb-4" data-testid="link-back-discovery">
              <ChevronLeft className="w-4 h-4" />
              Back to Discovery
            </Button>
          </Link>

          {isLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : error ? (
            <div className="text-destructive">Error loading area data</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {type === 'zip' ? (
                  <MapPin className="w-8 h-8 text-foreground" />
                ) : (
                  <Building2 className="w-8 h-8 text-foreground" />
                )}
                <h1 className="text-3xl font-serif text-foreground" data-testid="text-area-name">
                  {data?.name}
                </h1>
              </div>
              <p className="text-muted-foreground mt-1 font-body">
                {type === 'zip' ? 'ZIP Code' : 'Community Area'} Detail
              </p>
            </>
          )}
        </motion.div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-[350px] w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Area Map */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                    <Map className="w-5 h-5 text-foreground" />
                    Area Map
                  </CardTitle>
                  <CardDescription>
                    Geographic boundaries with SBIF (TIF) zones and NMTC coverage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AreaMap 
                    type={data.type}
                    id={data.id}
                    sbifZones={data.sbifZones}
                    nmtcCoveragePct={data.nmtc?.coveragePct || 0}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Project Type Selector */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                    <Building className="w-5 h-5 text-foreground" />
                    Project Type
                  </CardTitle>
                  <CardDescription>
                    Select a project type to see additional relevant data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={selectedProjectType || ''} 
                    onValueChange={(val) => setSelectedProjectType(val)}
                  >
                    <SelectTrigger className="w-full max-w-md" data-testid="select-project-type">
                      <SelectValue placeholder="Select a project type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {businessUsesData?.categories.map((category) => (
                        <div key={category}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                            {category}
                          </div>
                          {businessUsesData?.uses
                            .filter((u) => u.category === category)
                            .map((use) => (
                              <SelectItem 
                                key={use.name} 
                                value={use.name} 
                                data-testid={`option-${use.name.replace(/\s+/g, '-').toLowerCase()}`}
                              >
                                {use.name}
                              </SelectItem>
                            ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </motion.div>

            {/* Childcare Section - Only shown when relevant project type selected */}
            {isChildcare && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Baby className="w-5 h-5 text-foreground" />
                      Childcare Desert Metrics
                    </CardTitle>
                    <CardDescription>
                      Analysis of childcare access for children under 5
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.childcare ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getStatusColor(data.childcare.statusLabel)} data-testid="badge-childcare-status">
                            {data.childcare.statusLabel}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {type === 'zip' ? `ZIP Code ${data.id}` : data.name}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Children Under 5</div>
                            <div className="text-2xl font-bold" data-testid="text-children-count">
                              {data.childcare.childrenUnder5.toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Children Per Slot</div>
                            <div className="text-2xl font-bold" data-testid="text-ratio">
                              {data.childcare.childrenPerSlot?.toFixed(2) || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="border border-border overflow-hidden">
                          <div className="bg-secondary px-4 py-2 border-b">
                            <h4 className="font-semibold text-sm">Licensed Childcare Slots</h4>
                          </div>
                          <div className="grid grid-cols-3 divide-x">
                            <div className="p-4 text-center">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Total Slots</div>
                              <div className="text-xl font-bold text-primary" data-testid="text-slots-count">
                                {data.childcare.licensedSlots.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-4 text-center">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Center-Based</div>
                              <div className="text-xl font-bold" data-testid="text-center-slots">
                                {data.childcare.centerSlots.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-4 text-center">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Family Homes</div>
                              <div className="text-xl font-bold" data-testid="text-family-slots">
                                {data.childcare.familyHomeSlots.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground space-y-1 pt-2">
                          <p>Children data: {data.childcare.sources.childrenSource} ({data.childcare.sources.childrenYear})</p>
                          <p>Childcare data: {data.childcare.sources.childcareSource} ({data.childcare.sources.childcareYear})</p>
                          <p className="italic">Thresholds: &gt;3.0 = Childcare desert; 1.5-3.0 = Underserved; &lt;1.5 = Adequate</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No childcare data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Childcare Capacity Demographics - Only shown when relevant project type selected */}
            {isChildcare && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Users className="w-5 h-5 text-foreground" />
                      Childcare Demographics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(isLoadingEnhanced || isLoadingEnhancedZip) ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : (() => {
                      const enhancedData = type === 'zip' ? childcareEnhancedZipData : childcareEnhancedData;
                      
                      if (!enhancedData) {
                        return (
                          <div className="text-center py-6 text-muted-foreground">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No demographic data available for this {type === 'zip' ? 'ZIP code' : 'community area'}
                          </div>
                        );
                      }
                      
                      const delta = enhancedData.laborForceDelta;
                      const deltaLevel = delta <= 5 ? 'small' : delta <= 10 ? 'moderate' : 'large';
                      
                      return (
                        <div className="space-y-6">
                          {/* Age Breakdown */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-secondary p-4 border border-border">
                              <p className="text-xs font-jbmono text-muted-foreground uppercase font-semibold">Ages 0-2 (Infants/Toddlers)</p>
                              <p className="text-2xl font-bold text-foreground">{enhancedData.children0to2.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{enhancedData.pct0to2}%</span> of under-5
                              </p>
                            </div>
                            <div className="bg-secondary p-4 border border-border">
                              <p className="text-xs font-jbmono text-muted-foreground uppercase font-semibold">Ages 3-4 (Preschool)</p>
                              <p className="text-2xl font-bold text-foreground">{enhancedData.children3to4.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{enhancedData.pct3to4}%</span> of under-5
                              </p>
                            </div>
                          </div>

                          {/* Labor Force Participation */}
                          <div className="border-t pt-4">
                            <h4 className="text-sm font-semibold mb-3">Parents in Labor Force (Both Parents or Single Parent Working)</h4>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div className="bg-secondary p-4 border border-border">
                                <p className="text-xs font-jbmono text-muted-foreground uppercase font-semibold">Children 0-5 Years</p>
                                <p className="text-2xl font-bold text-foreground">{enhancedData.parentsInLaborForcePct0to5}%</p>
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium text-foreground">{enhancedData.parentsInLaborForce0to5.toLocaleString()}</span> children
                                </p>
                              </div>
                              <div className="bg-secondary p-4 border border-border">
                                <p className="text-xs font-jbmono text-muted-foreground uppercase font-semibold">Children 6-17 Years</p>
                                <p className="text-2xl font-bold">{enhancedData.parentsInLaborForcePct6to17}%</p>
                                <p className="text-sm text-muted-foreground">Parents in labor force</p>
                              </div>
                            </div>
                            
                            {/* Labor Force Delta */}
                            <div className="p-4 border border-border bg-secondary">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold">Labor Force Delta:</span>
                                <Badge variant={deltaLevel === 'small' ? 'default' : deltaLevel === 'moderate' ? 'secondary' : 'destructive'}>
                                  {delta}%
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{enhancedData.deltaInterpretation}</p>
                            </div>
                          </div>
                          
                          <p className="text-xs text-muted-foreground pt-2">
                            Data source: American Community Survey 5-Year Estimates (B09001, B23008)<br/>
                            <span className="italic">Small delta = Parents work regardless of child age (higher daycare demand). Large delta = Many parents stay home with young children.</span>
                          </p>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Day Care Needs Estimator - Only shown when Day Care Center is selected */}
            {isDayCare && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-foreground" />
                      Day Care Needs Estimator
                    </CardTitle>
                    <CardDescription>
                      Estimated new daycares needed to reach 1:1 child-to-slot ratio
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(isLoadingEnhanced || isLoadingEnhancedZip || isLoadingCapacity || isLoadingCapacityZip) ? (
                      <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : (() => {
                      const enhancedData = type === 'zip' ? childcareEnhancedZipData : childcareEnhancedData;
                      const capacityData = type === 'zip' ? childcareCapacityZipData : childcareCapacityData;
                      
                      if (!enhancedData || !capacityData) {
                        return (
                          <div className="text-center py-6 text-muted-foreground">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Insufficient data to calculate estimate
                          </div>
                        );
                      }
                      
                      const childrenUnder5 = enhancedData.childrenUnder5;
                      const totalSlots = capacityData.total_capacity;
                      const gap = childrenUnder5 - totalSlots;
                      const avgDaycareCapacity = 78;
                      const estimatedDaycaresNeeded = gap > 0 ? Math.ceil(gap / avgDaycareCapacity) : 0;
                      const currentRatio = totalSlots > 0 ? (childrenUnder5 / totalSlots).toFixed(2) : 'N/A';
                      
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-secondary p-4 text-center border border-border">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Children Under 5</div>
                              <div className="text-2xl font-bold text-foreground" data-testid="text-children-under5">
                                {childrenUnder5.toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-secondary p-4 text-center border border-border">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Current Slots</div>
                              <div className="text-2xl font-bold text-foreground" data-testid="text-current-slots">
                                {totalSlots.toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-secondary p-4 text-center border border-border">
                              <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Slot Gap</div>
                              <div className="text-2xl font-bold text-foreground" data-testid="text-slot-gap">
                                {gap > 0 ? `-${gap.toLocaleString()}` : `+${Math.abs(gap).toLocaleString()}`}
                              </div>
                            </div>
                          </div>
                          
                          {gap > 0 ? (
                            <div className="bg-foreground text-background p-6 border border-foreground">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-background">Estimated Daycares Needed</div>
                                  <p className="text-xs text-background/70 mt-1">
                                    Based on avg. capacity of 78 children per daycare
                                  </p>
                                </div>
                                <div className="text-4xl font-bold text-background" data-testid="text-daycares-needed">
                                  {estimatedDaycaresNeeded}
                                </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-background/30 text-sm text-background/70">
                                Current ratio: <span className="font-semibold text-foreground">{currentRatio}</span> children per slot (goal: 1.0)
                              </div>
                            </div>
                          ) : (
                            <div className="bg-secondary p-6 border border-border">
                              <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-8 h-8 text-foreground" />
                                <div>
                                  <div className="text-sm font-semibold text-foreground">Adequate Capacity</div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    This area has sufficient childcare slots for children under 5
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground">
                            Formula: (Children under 5 - Total slots) ÷ 78 = Estimated daycares needed<br/>
                            <span className="italic">78 is the average daycare capacity in Chicago</span>
                          </p>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Grocery Store Section - Only shown when Grocery Store is selected */}
            {isGrocery && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5 text-foreground" />
                      Grocery Store Access
                    </CardTitle>
                    <CardDescription>
                      Food access analysis for this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(isLoadingGrocery || isLoadingCommunityGrocery) ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : (type === 'zip' && groceryData) ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={
                            groceryData.storeCount === 0 
                              ? ''
                              : ''
                          }>
                            {groceryData.storeCount === 0 
                              ? 'Food Desert (No Grocery Stores)' 
                              : groceryData.storeCount <= 2
                              ? 'Limited Grocery Access'
                              : 'Good Grocery Access'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Grocery Stores in ZIP</div>
                            <div className="text-2xl font-bold">{groceryData.storeCount}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>

                        {groceryData.stores.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Stores</h4>
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                              {groceryData.stores.slice(0, 5).map((store, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{store.name}</span>
                                  <span className="text-muted-foreground text-xs">{store.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (type === 'community' && communityGroceryData) ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={
                            communityGroceryData.storeCount === 0 
                              ? ''
                              : ''
                          }>
                            {communityGroceryData.storeCount === 0 
                              ? 'Food Desert (No Grocery Stores)' 
                              : communityGroceryData.storeCount <= 2
                              ? 'Limited Grocery Access'
                              : 'Good Grocery Access'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Grocery Stores in Neighborhood</div>
                            <div className="text-2xl font-bold">{communityGroceryData.storeCount}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Community Area</div>
                            <div className="text-lg font-bold">{id}</div>
                          </div>
                        </div>

                        {communityGroceryData.stores.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Stores</h4>
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                              {communityGroceryData.stores.slice(0, 5).map((store, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{store.name}</span>
                                  <span className="text-muted-foreground text-xs">{store.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No grocery data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Gas Station / EV Section - Only shown when Gas Station is selected */}
            {isGasStation && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Fuel className="w-5 h-5 text-foreground" />
                      Gas Station Market Analysis
                    </CardTitle>
                    <CardDescription>
                      Gas stations, EV charging infrastructure, and EV adoption trends
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Gas station data is only available at the ZIP code level.</p>
                        <p className="text-sm mt-2">Search by ZIP code or specific address to see market data.</p>
                      </div>
                    ) : (isLoadingGasStations || isLoadingEvStations || isLoadingEvRegistrations) ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-secondary p-4 text-center border border-border">
                            <Fuel className="w-6 h-6 mx-auto mb-2 text-foreground" />
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Gas Stations</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-gas-station-count">
                              {gasStationsData?.count ?? 0}
                            </div>
                          </div>
                          <div className="bg-secondary p-4 text-center border border-border">
                            <Zap className="w-6 h-6 mx-auto mb-2 text-foreground" />
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">EV Chargers</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-ev-station-count">
                              {evStationsData?.count ?? 0}
                            </div>
                          </div>
                          <div className="bg-secondary p-4 text-center border border-border">
                            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-foreground" />
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">EV Registrations</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-ev-registrations-latest">
                              {evRegistrationsData?.zipCodeData ? (() => {
                                const yearlyData: Record<number, number> = {};
                                evRegistrationsData.zipCodeData.forEach((d) => {
                                  yearlyData[d.year] = (yearlyData[d.year] || 0) + d.count;
                                });
                                const years = Object.keys(yearlyData).map(Number).sort((a, b) => b - a);
                                return yearlyData[years[0]]?.toLocaleString() || '0';
                              })() : '0'}
                            </div>
                          </div>
                        </div>

                        {/* EV Registration Trend Chart (2024 vs 2025) */}
                        {evRegistrationsData && evRegistrationsData.zipCodeData && evRegistrationsData.zipCodeData.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              EV Registration Trend (2024 vs 2025)
                            </h4>
                            {(() => {
                              const yearlyData: Record<number, number> = {};
                              evRegistrationsData.zipCodeData.forEach((d) => {
                                yearlyData[d.year] = (yearlyData[d.year] || 0) + d.count;
                              });
                              // Specifically show 2024 and 2025
                              const years = [2024, 2025].filter(y => yearlyData[y] !== undefined);
                              const maxCount = Math.max(...years.map(y => yearlyData[y] || 0));
                              
                              const count2025 = yearlyData[2025] || 0;
                              const count2024 = yearlyData[2024] || 0;
                              const yoyChange = count2024 > 0 
                                ? ((count2025 - count2024) / count2024) * 100 
                                : 0;

                              return (
                                <div className="space-y-3">
                                  {years.map((year) => (
                                    <div key={year} className="space-y-1">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{year}</span>
                                        <span className="text-muted-foreground">{(yearlyData[year] || 0).toLocaleString()} registrations</span>
                                      </div>
                                      <div className="w-full bg-secondary border border-border rounded-full h-3 overflow-hidden">
                                        <div 
                                          className="h-full bg-foreground transition-all duration-500"
                                          style={{ width: `${maxCount > 0 ? ((yearlyData[year] || 0) / maxCount) * 100 : 0}%` }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                  {count2024 > 0 && count2025 > 0 && (
                                    <div className={`flex items-center gap-1 text-sm text-foreground`}>
                                      {yoyChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                      <span>{yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}% year-over-year change</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        <div className="p-3 bg-secondary border border-border">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>This data helps assess gas station market viability. Growing EV adoption and charging infrastructure may impact future gas station demand.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Coffee Shop Section - Only shown when Coffee Shop / Cafe is selected */}
            {isCoffeeShop && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Coffee className="w-5 h-5 text-foreground" />
                      Coffee Shop Market
                    </CardTitle>
                    <CardDescription>
                      Coffee shops and cafes in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Coffee shop data is only available at the ZIP code level.</p>
                        <p className="text-sm mt-2">Search by ZIP code or specific address to see market data.</p>
                      </div>
                    ) : isLoadingCoffeeShops ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : coffeeShopsData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Coffee Shops in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-coffee-shop-count">{coffeeShopsData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>

                        {coffeeShopsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Coffee Shops (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {coffeeShopsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Coffee className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No coffee shop data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Hotel Section - Only shown when Hotel is selected */}
            {isHotel && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Hotel className="w-5 h-5 text-foreground" />
                      Hotel Market
                    </CardTitle>
                    <CardDescription>
                      Hotels and lodging in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Hotel data is only available at the ZIP code level.</p>
                        <p className="text-sm mt-2">Search by ZIP code or specific address to see market data.</p>
                      </div>
                    ) : isLoadingHotels ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : hotelsData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Hotels in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-hotel-count">{hotelsData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>

                        {hotelsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Hotels (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {hotelsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Hotel className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No hotel data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Restaurant / Bar Section - Only shown when Restaurant / Bar is selected */}
            {isRestaurant && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <UtensilsCrossed className="w-5 h-5 text-foreground" />
                      Restaurant & Bar Market
                    </CardTitle>
                    <CardDescription>
                      Restaurants and bars in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Restaurant data is only available at the ZIP code level.</p>
                        <p className="text-sm mt-2">Search by ZIP code or specific address to see market data.</p>
                      </div>
                    ) : (isLoadingRestaurants || isLoadingBars) ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : (restaurantsData || barsData) ? (
                      <div className="space-y-6">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 text-center border border-border">
                            <UtensilsCrossed className="w-6 h-6 mx-auto mb-2 text-foreground" />
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Restaurants</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-restaurant-count">
                              {restaurantsData?.count ?? 0}
                            </div>
                          </div>
                          <div className="bg-secondary p-4 text-center border border-border">
                            <Beer className="w-6 h-6 mx-auto mb-2 text-foreground" />
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Bars</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-bar-count">
                              {barsData?.count ?? 0}
                            </div>
                          </div>
                        </div>

                        {/* Restaurant List */}
                        {restaurantsData && restaurantsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <UtensilsCrossed className="w-4 h-4" />
                              Nearby Restaurants (up to 10)
                            </h4>
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                              {restaurantsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bar List */}
                        {barsData && barsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <Beer className="w-4 h-4" />
                              Nearby Bars (up to 10)
                            </h4>
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                              {barsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No restaurant or bar data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Liquor Store Section - Only shown when Liquor Store is selected */}
            {isLiquorStore && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Wine className="w-5 h-5 text-foreground" />
                      Liquor Store Market
                    </CardTitle>
                    <CardDescription>
                      Package goods / liquor stores in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Liquor store data is only available at the ZIP code level.</p>
                        <p className="text-sm mt-2">Search by ZIP code or specific address to see market data.</p>
                      </div>
                    ) : isLoadingLiquorStores ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : liquorStoresData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Liquor Stores in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-liquor-store-count">{liquorStoresData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>

                        {liquorStoresData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Liquor Stores (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {liquorStoresData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Wine className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No liquor store data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Spa / Massage Section */}
            {isSpa && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-foreground" />
                      Spa & Massage Market
                    </CardTitle>
                    <CardDescription>
                      Licensed massage establishments in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Spa/massage data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingMassageSpa ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : massageSpaData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Spas in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-spa-count">{massageSpaData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {massageSpaData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Spas (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {massageSpaData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No spa/massage data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Auto Repair Section */}
            {isAutoRepair && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-foreground" />
                      Auto Repair Market
                    </CardTitle>
                    <CardDescription>
                      Licensed auto repair shops in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Auto repair data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingAutoRepair ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : autoRepairData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Auto Shops in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-auto-repair-count">{autoRepairData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {autoRepairData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Auto Shops (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {autoRepairData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No auto repair data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Pet Store Section */}
            {isPetStore && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <PawPrint className="w-5 h-5 text-foreground" />
                      Pet Store Market
                    </CardTitle>
                    <CardDescription>
                      Licensed pet shops in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Pet store data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingPetStores ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : petStoresData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Pet Stores in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-pet-store-count">{petStoresData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {petStoresData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Pet Stores (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {petStoresData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <PawPrint className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No pet store data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Veterinary Clinic Section */}
            {isVetClinic && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Stethoscope className="w-5 h-5 text-foreground" />
                      Veterinary Market
                    </CardTitle>
                    <CardDescription>
                      Licensed veterinary hospitals in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Veterinary clinic data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingVetClinics ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : vetClinicsData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Vet Clinics in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-vet-clinic-count">{vetClinicsData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {vetClinicsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Vet Clinics (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {vetClinicsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No veterinary clinic data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Nightclub Section */}
            {isNightclub && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Music className="w-5 h-5 text-foreground" />
                      Nightclub Market
                    </CardTitle>
                    <CardDescription>
                      Late hour and music/dance venues in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Nightclub data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingNightclubs ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : nightclubsData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Nightclubs in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-nightclub-count">{nightclubsData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {nightclubsData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Nightclubs (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {nightclubsData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No nightclub data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Event Venue Section */}
            {isEventVenue && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <PartyPopper className="w-5 h-5 text-foreground" />
                      Event Venue Market
                    </CardTitle>
                    <CardDescription>
                      Public places of amusement and banquet halls in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Event venue data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingEventVenues ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : eventVenuesData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Event Venues in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-event-venue-count">{eventVenuesData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {eventVenuesData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Event Venues (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {eventVenuesData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <PartyPopper className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No event venue data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Brewery Section */}
            {isBrewery && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Factory className="w-5 h-5 text-foreground" />
                      Brewery / Distillery Market
                    </CardTitle>
                    <CardDescription>
                      Licensed breweries and distilleries in this area
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Brewery data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingBreweries ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : breweriesData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Breweries in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-brewery-count">{breweriesData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {breweriesData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Breweries (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {breweriesData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Factory className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No brewery data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Cannabis Dispensary Section */}
            {isCannabis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                      <Leaf className="w-5 h-5 text-foreground" />
                      Cannabis Dispensary Market
                    </CardTitle>
                    <CardDescription>
                      Licensed cannabis dispensaries in this area (Illinois IDFPR data)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {type !== 'zip' ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Cannabis dispensary data is only available at the ZIP code level.</p>
                      </div>
                    ) : isLoadingCannabis ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : cannabisData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-secondary p-4 border border-border">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">Dispensaries in ZIP</div>
                            <div className="text-2xl font-bold text-foreground" data-testid="text-cannabis-count">{cannabisData.count}</div>
                          </div>
                          <div className="bg-secondary rounded-xl border border-border p-4">
                            <div className="text-xs font-jbmono text-muted-foreground uppercase tracking-wide mb-1">ZIP Code</div>
                            <div className="text-2xl font-bold">{id}</div>
                          </div>
                        </div>
                        {cannabisData.locations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Nearby Dispensaries (up to 10)</h4>
                            <div className="grid gap-2 max-h-64 overflow-y-auto">
                              {cannabisData.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-border text-sm">
                                  <span className="font-medium">{loc.name}</span>
                                  <span className="text-muted-foreground text-xs">{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Leaf className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No cannabis dispensary data available for this area
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* SBIF Eligibility - Always visible */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-foreground" />
                    SBIF Eligibility
                  </CardTitle>
                  <CardDescription>
                    Small Business Improvement Fund zones overlapping this area
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.sbifZones.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="">
                          {data.sbifZones.length} TIF District{data.sbifZones.length !== 1 ? 's' : ''} with SBIF Potential
                        </Badge>
                      </div>
                      <div className="grid gap-2">
                        {data.sbifZones.map((zone, index) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-border"
                            data-testid={`sbif-zone-${index}`}
                          >
                            <div className="flex items-center gap-2">
                              <FileCheck className="w-4 h-4 text-foreground" />
                              <span className="font-medium">{zone.name}</span>
                            </div>
                            <a 
                              href="https://www.chicago.gov/city/en/sites/small-business-improvement-fund/home.html"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              SBIF Info <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-secondary border border-border">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>
                              <strong>Note:</strong> SBIF eligibility is based on TIF district boundaries. The listed TIF districts overlap this area and may have SBIF funding available.
                            </p>
                            <p>
                              SBIF funding availability varies by TIF district and time. Not all TIF districts have active SBIF programs. 
                              Check the <a href="https://www.chicago.gov/city/en/sites/small-business-improvement-fund/home/rollout-calendar.html" target="_blank" rel="noopener noreferrer" className="underline font-medium">official SBIF rollout calendar</a> for current funding availability.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No SBIF-eligible TIF districts overlap this area
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* NMTC Coverage - Always visible */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="font-jbmono text-xs font-bold uppercase tracking-[0.08em] flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-foreground" />
                    NMTC Coverage
                  </CardTitle>
                  <CardDescription>
                    New Markets Tax Credit eligible census tracts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.nmtc ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary border border-border">
                        <div>
                          <div className="text-sm text-muted-foreground">NMTC Eligible Tracts</div>
                          <div className="text-2xl font-bold" data-testid="text-nmtc-coverage">
                            <span className={getNmtcStatusColor(data.nmtc.coveragePct)}>
                              {data.nmtc.eligibleTracts}
                            </span>
                            <span className="text-muted-foreground"> of </span>
                            <span>{data.nmtc.totalTracts}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Coverage</div>
                          <div className={`text-3xl font-bold ${getNmtcStatusColor(data.nmtc.coveragePct)}`}>
                            {data.nmtc.coveragePct}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-full bg-secondary border border-border h-3 overflow-hidden">
                        <div 
                          className="h-full bg-foreground transition-all duration-500"
                          style={{ width: `${data.nmtc.coveragePct}%` }}
                        />
                      </div>
                      
                      <div className="p-3 bg-secondary border border-border">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>
                              <strong>Estimate:</strong> NMTC coverage shown is an estimate based on area demographics and historical eligibility patterns.
                            </p>
                            <p>
                              NMTC eligibility is tract-based. Individual projects must verify tract-level eligibility using official <a href="https://www.cdfifund.gov/mapping-system" target="_blank" rel="noopener noreferrer" className="underline font-medium">CDFI Fund CIMS data</a>.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No NMTC data available for this area
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        ) : null}
      </div>
      </main>
    </div>
  );
}
