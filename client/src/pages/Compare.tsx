import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SubscriberGate } from "@/components/SubscriberGate";
import { ReportChat } from "@/components/ReportChat";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { PrintHeader } from "@/components/PrintHeader";
import { useCompare } from "@/contexts/CompareContext";
import { useRun, useGeocodeLookup, useBusinessUses, useZoningInfo, useZoningCompatibility, useSbifEligibility, useNmtcEligibility, useMmrpEligibility, useTODStatus, useChildcareAccess, useCommunityAreaChildcareAccess, useGroceryAccess, useCannabisDispensariesByZip, useZbaWardSummary, useTransitProximity, useEVRegistrations, useEvStations, useGasStations, useCoffeeShops, useRestaurants, useHotels, useBars, useUpdateProjectType, usePropertyTax, usePinLookup, useNearbyDayCares, useCrimeStats, useLandmarkStatus, useElectionData, useChildcareCapacity, useChildcareCapacityZip, useVehicleOwnership, useSeniorsData, useChildcareEnhancedData, useLanguageData, useCensusACS, useProximityData, useMichelinNearby, useCombinedPermitViolations, useFairMarketRent, useCtaRidership, useCtaBusRidership, useNewConstruction, useVacantBuildingsNearby, useNeighborhoodNews, useCorridorNews, useNearbyBusinessLicenses, useMuralsNearby, useDesignatedLandmarksNearby, usePlacesOfWorship, useSchoolsNearby, useHmdaStats, useSBALoans, useComparableSales, useAirbnbStats, useRentcast, useUpcomingDevelopments } from "@/hooks/use-runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, MapPin, Building2, Layers, CheckCircle2, XCircle, AlertTriangle, DollarSign, Baby, ShoppingCart, Leaf, ArrowLeft, Scale, Train, Zap, Fuel, User, ExternalLink, Coffee, Utensils, Hotel, Wine, Printer, Settings2, Ruler, Home, Shield, Landmark, Vote, Calculator, Eye, EyeOff, FileText, Users, Globe, BarChart3, Navigation, Star, Car, HardHat, Menu } from "lucide-react";
import { ProjectTypeCombobox } from "@/components/ProjectTypeCombobox";
import { motion } from "framer-motion";
import { formatAddress } from "@/lib/formatAddress";
import { groupLicenseEstablishments, titleCaseBusiness } from "@shared/businessLicenses";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SectionId = 
  | 'location' 
  | 'zoning' 
  | 'buildingInfo'
  | 'assessedValue'
  | 'incentives' 
  | 'daycareRatios'
  | 'siteSpecificDaycare'
  | 'quickCashflow'
  | 'childcareAccess' 
  | 'groceryAccess' 
  | 'cannabisMarket' 
  | 'evMarket' 
  | 'gasStation' 
  | 'coffeeShops' 
  | 'restaurants' 
  | 'hotels' 
  | 'bars' 
  | 'zbaReps' 
  | 'transit'
  | 'crimeStats'
  | 'landmarkStatus'
  | 'todStatus'
  | 'electionData'
  | 'nearbyDaycares'
  | 'parcelInfo'
  | 'saleHistory'
  | 'propertyTax'
  | 'appealHistory'
  | 'aduEligibility'
  | 'sbifDetail'
  | 'nmtcDetail'
  | 'mmrpDetail'
  | 'permitHistory'
  | 'vehicleOwnership'
  | 'seniorPopulation'
  | 'childcareEnhanced'
  | 'languagesSpoken'
  | 'demographicTrends'
  | 'proximityInfo'
  | 'michelinRestaurants'
  | 'fairMarketRent'
  | 'ctaRidership'
  | 'ctaBusRidership'
  | 'newConstruction'
  | 'developmentPotential'
  | 'vacantBuildings'
  | 'neighborhoodNews'
  | 'corridorNews'
  | 'nearbyBusinessLicenses'
  | 'murals'
  | 'designatedLandmarks'
  | 'worship'
  | 'nearbySchools'
  | 'mortgageMarket'
  | 'sbaLoans'
  | 'recentlySoldComps'
  | 'airbnbMarket'
  | 'rentcastMarket'
  | 'upcomingDevelopments';

interface SectionConfig {
  id: SectionId;
  label: string;
  isDefault: boolean;
  requiresProjectType?: string[];
  alwaysAvailable?: boolean;
  group: string;
}

const ALL_SECTIONS: SectionConfig[] = [
  { id: 'location', label: 'Location', isDefault: true, alwaysAvailable: true, group: 'Location & Zoning' },
  { id: 'zoning', label: 'Zoning / FAR / Height', isDefault: true, alwaysAvailable: true, group: 'Location & Zoning' },
  { id: 'zbaReps', label: 'Zoning Change History', isDefault: false, alwaysAvailable: true, group: 'Location & Zoning' },
  { id: 'childcareAccess', label: 'Childcare Access', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'childcareEnhanced', label: 'Childcare Demographics', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'daycareRatios', label: 'Day Care Needs Estimator', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'siteSpecificDaycare', label: 'Site Specific Day Care', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'quickCashflow', label: 'Quick Cashflow', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'nearbyDaycares', label: 'Nearby Day Cares', isDefault: false, requiresProjectType: ['Day Care Center', 'School (Private)'], group: 'Project Use Analysis' },
  { id: 'groceryAccess', label: 'Grocery Access', isDefault: false, requiresProjectType: ['Grocery Store'], group: 'Project Use Analysis' },
  { id: 'vehicleOwnership', label: 'Auto Dependency', isDefault: false, requiresProjectType: ['Auto Service', 'Gas Station', 'EV Charging Station'], group: 'Project Use Analysis' },
  { id: 'seniorPopulation', label: 'Senior Population', isDefault: false, alwaysAvailable: true, group: 'Project Use Analysis' },
  { id: 'gasStation', label: 'Nearby Filling Stations', isDefault: false, requiresProjectType: ['Gas Station'], group: 'Project Use Analysis' },
  { id: 'evMarket', label: 'EV Registration Trends', isDefault: false, requiresProjectType: ['EV Charging Station'], group: 'Project Use Analysis' },
  { id: 'hotels', label: 'Nearby Hotels', isDefault: false, requiresProjectType: ['Hotel'], group: 'Project Use Analysis' },
  { id: 'restaurants', label: 'Nearby Restaurants', isDefault: false, requiresProjectType: ['Restaurant'], group: 'Project Use Analysis' },
  { id: 'coffeeShops', label: 'Nearby Coffee Shops', isDefault: false, requiresProjectType: ['Coffee Shop / Cafe'], group: 'Project Use Analysis' },
  { id: 'bars', label: 'Nearby Bars', isDefault: false, requiresProjectType: ['Bar / Tavern'], group: 'Project Use Analysis' },
  { id: 'cannabisMarket', label: 'Cannabis Dispensary Market', isDefault: false, requiresProjectType: ['Cannabis Dispensary'], group: 'Project Use Analysis' },
  { id: 'incentives', label: 'Eligible Incentives', isDefault: true, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'todStatus', label: 'TOD Status', isDefault: false, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'sbifDetail', label: 'SBIF Eligibility', isDefault: false, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'nmtcDetail', label: 'New Markets Tax Credit (NMTC)', isDefault: false, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'mmrpDetail', label: 'Micro-Market Recovery (MMRP)', isDefault: false, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'aduEligibility', label: 'ADU Eligibility', isDefault: false, alwaysAvailable: true, group: 'Location Based Incentives' },
  { id: 'buildingInfo', label: 'Dept. of Buildings Info', isDefault: true, alwaysAvailable: true, group: 'Property Details' },
  { id: 'permitHistory', label: 'Permits & Violations', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'newConstruction', label: 'New Construction Activity', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'landmarkStatus', label: 'Historic Landmark Status', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'parcelInfo', label: 'Parcel Information', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'saleHistory', label: 'Sale History', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'propertyTax', label: 'Property Tax Information', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'assessedValue', label: 'Property Tax', isDefault: true, alwaysAvailable: true, group: 'Property Details' },
  { id: 'appealHistory', label: 'Appeal History', isDefault: false, alwaysAvailable: true, group: 'Property Details' },
  { id: 'crimeStats', label: 'Area Crime Statistics', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'proximityInfo', label: 'Proximity Information', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'michelinRestaurants', label: 'Entertainment & Culture', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'murals', label: 'Murals', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'designatedLandmarks', label: 'Designated Landmarks', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'vacantBuildings', label: 'Vacant & Abandoned Buildings', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'worship', label: 'Places of Worship', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'nearbySchools', label: 'Nearby CPS Schools', isDefault: false, alwaysAvailable: true, group: 'Property Proximity Details' },
  { id: 'transit', label: 'Transit Access', isDefault: true, alwaysAvailable: true, group: 'Transit & Location' },
  { id: 'ctaRidership', label: 'CTA L Ridership', isDefault: false, alwaysAvailable: true, group: 'Transit & Location' },
  { id: 'ctaBusRidership', label: 'CTA Bus Ridership', isDefault: false, alwaysAvailable: true, group: 'Transit & Location' },
  { id: 'developmentPotential', label: 'Development Potential / FAR', isDefault: false, alwaysAvailable: true, group: 'Development Potential' },
  { id: 'fairMarketRent', label: 'Fair Market Rent (HUD)', isDefault: false, alwaysAvailable: true, group: 'Development Potential' },
  { id: 'languagesSpoken', label: 'Languages Spoken', isDefault: false, alwaysAvailable: true, group: 'Neighborhood People Profile' },
  { id: 'demographicTrends', label: 'Demographic Trends', isDefault: false, alwaysAvailable: true, group: 'Neighborhood People Profile' },
  { id: 'electionData', label: 'Voting Trends', isDefault: false, alwaysAvailable: true, group: 'Neighborhood People Profile' },
  { id: 'neighborhoodNews', label: 'Neighborhood News', isDefault: false, alwaysAvailable: true, group: 'Neighborhood Intelligence' },
  { id: 'corridorNews', label: 'Corridor Intelligence', isDefault: false, alwaysAvailable: true, group: 'Neighborhood Intelligence' },
  { id: 'nearbyBusinessLicenses', label: 'New Business Licenses', isDefault: false, alwaysAvailable: true, group: 'Neighborhood Intelligence' },
  { id: 'upcomingDevelopments', label: 'Upcoming Real Estate Developments', isDefault: false, alwaysAvailable: true, group: 'Neighborhood Intelligence' },
  { id: 'mortgageMarket', label: 'Local Mortgage Market (HMDA)', isDefault: false, alwaysAvailable: true, group: 'Market Data' },
  { id: 'sbaLoans', label: 'SBA Commercial Loans', isDefault: false, alwaysAvailable: true, group: 'Market Data' },
  { id: 'recentlySoldComps', label: 'Recently Sold Comps', isDefault: false, alwaysAvailable: true, group: 'Market Data' },
  { id: 'airbnbMarket', label: 'Short-Term Rental (Airbnb)', isDefault: false, alwaysAvailable: true, group: 'Market Data' },
  { id: 'rentcastMarket', label: 'Long-Term Rental Market (RentCast)', isDefault: false, alwaysAvailable: true, group: 'Market Data' },
];

function getDefaultSections(): Set<SectionId> {
  return new Set(ALL_SECTIONS.filter(s => s.isDefault).map(s => s.id));
}

interface PropertyColumnProps {
  runId: number;
  address: string;
  label?: string | null;
  initialProjectType?: string | null;
  onRemove: () => void;
  onProjectTypeChange: (projectType: string | null) => void;
  businessUsesData: { uses: { name: string; category: string; zoningCategory: string }[]; categories: string[] } | null;
  visibleSections: Set<SectionId>;
}

function PropertyColumn({ runId, address, label, initialProjectType, onRemove, onProjectTypeChange, businessUsesData, visibleSections }: PropertyColumnProps) {
  const [, setLocation] = useLocation();
  const [selectedProjectType, setSelectedProjectType] = useState<string | null>(initialProjectType || null);
  const geocode = useGeocodeLookup();
  const updateProjectType = useUpdateProjectType();
  
  useEffect(() => {
    setSelectedProjectType(initialProjectType || null);
  }, [initialProjectType]);
  
  const handleProjectTypeChange = (value: string | null) => {
    setSelectedProjectType(value);
    onProjectTypeChange(value);
  };
  
  useEffect(() => {
    if (address) {
      geocode.reset();
      geocode.mutate({ address });
    }
  }, [address]);

  const facts = geocode.data;
  const isLoadingFacts = geocode.isPending;

  const { data: zoningInfo, isLoading: isLoadingZoning } = useZoningInfo(facts?.zoning);
  const { data: compatibility } = useZoningCompatibility(selectedProjectType, facts?.zoning || null);
  const { data: sbifData, isLoading: isLoadingSbif } = useSbifEligibility(facts?.tifName);
  const { data: nmtcData, isLoading: isLoadingNmtc } = useNmtcEligibility(facts?.lat, facts?.lon);
  const { data: mmrpData, isLoading: isLoadingMmrp } = useMmrpEligibility(facts?.lat, facts?.lon);
  const { data: todData, isLoading: isLoadingTod } = useTODStatus(facts?.lat, facts?.lon);
  
  const isDaycareOrSchool = selectedProjectType === 'Day Care Center' || selectedProjectType === 'School (Private)';
  const { data: childcareData, isLoading: isLoadingChildcare } = useChildcareAccess(isDaycareOrSchool ? facts?.zipCode : undefined);
  const { data: communityChildcareData } = useCommunityAreaChildcareAccess(isDaycareOrSchool ? facts?.communityArea : undefined);
  
  const isGrocery = selectedProjectType === 'Grocery Store';
  const { data: groceryData, isLoading: isLoadingGrocery } = useGroceryAccess(isGrocery ? facts?.zipCode : undefined, facts?.lat, facts?.lon);
  
  const isCannabis = selectedProjectType === 'Cannabis Dispensary';
  const { data: cannabisData, isLoading: isLoadingCannabis } = useCannabisDispensariesByZip(isCannabis ? facts?.zipCode : undefined, isCannabis);
  
  const wardNumber = facts?.ward ? parseInt(facts.ward.replace(/\D/g, ''), 10) : null;
  const requiresZoningChange = compatibility && compatibility.permission !== 'permitted';
  const { data: zbaWardData, isLoading: isLoadingZba } = useZbaWardSummary(requiresZoningChange && wardNumber ? wardNumber : null);
  
  const { data: transitData, isLoading: isLoadingTransit } = useTransitProximity(facts?.lat, facts?.lon);

  const closest2CtaRail = transitData?.ctaRail?.slice(0, 2) || [];
  const { data: ctaRidershipData, isLoading: isLoadingRidership } = useCtaRidership(
    closest2CtaRail.length > 0 ? closest2CtaRail : undefined
  );

  const ctaLineHexMap: Record<string, string> = {
    'Red': '#c60c30', 'Blue': '#00a1de', 'Brown': '#62361b', 'Green': '#009b3a',
    'Orange': '#f9461c', 'Pink': '#e27ea6', 'Purple': '#522398', 'Yellow': '#f9e300',
  };
  const getStationHex = (stationId: string) => {
    const stop = closest2CtaRail.find((s: any) => s.stationId === stationId);
    if (!stop?.routes?.length) return '#6b7280';
    const lineName = stop.routes[0].replace(/ Line$/i, '');
    return ctaLineHexMap[lineName] || '#6b7280';
  };
  
  const nearbyBusRouteNumbers = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const stop of (transitData?.ctaBus || [])) {
      const match = stop.routes?.[0]?.match(/^(X?\d+[A-Z]?)/i);
      const num = match ? match[1].toUpperCase() : null;
      if (num && !seen.has(num)) {
        seen.add(num);
        result.push(num);
        if (result.length >= 2) break;
      }
    }
    return result.length > 0 ? result : undefined;
  })();
  const { data: ctaBusRidershipData, isLoading: isLoadingBusRidership } = useCtaBusRidership(nearbyBusRouteNumbers);
  const { data: newConstructionData, isLoading: isLoadingNewConstruction } = useNewConstruction(facts?.lat, facts?.lon, facts?.communityArea || undefined);

  const isEvStation = selectedProjectType === 'EV Charging Station';
  const { data: evRegData, isLoading: isLoadingEvReg } = useEVRegistrations(isEvStation ? facts?.zipCode : undefined, isEvStation);
  const { data: evStationData, isLoading: isLoadingEvStations } = useEvStations(facts?.lat, facts?.lon, isEvStation);
  
  const isGasStation = selectedProjectType === 'Gas Station';
  const { data: gasStationData, isLoading: isLoadingGasStations } = useGasStations(facts?.lat, facts?.lon, isGasStation);
  
  const isCoffeeShop = selectedProjectType === 'Coffee Shop / Cafe';
  const { data: coffeeShopsData, isLoading: isLoadingCoffeeShops } = useCoffeeShops(facts?.lat, facts?.lon, isCoffeeShop);
  
  const isRestaurant = selectedProjectType === 'Restaurant';
  const { data: restaurantsData, isLoading: isLoadingRestaurants } = useRestaurants(facts?.lat, facts?.lon, isRestaurant);
  
  const isHotel = selectedProjectType === 'Hotel';
  const { data: hotelsData, isLoading: isLoadingHotels } = useHotels(facts?.lat, facts?.lon, isHotel);
  
  const isBar = selectedProjectType === 'Bar / Tavern';
  const { data: barsData, isLoading: isLoadingBars } = useBars(facts?.lat, facts?.lon, isBar);

  const { data: pinLookupData } = usePinLookup(address, facts?.lat, facts?.lon);
  const pin = pinLookupData?.pin;
  const { data: propertyTaxData } = usePropertyTax(pin);
  
  const { data: runData } = useRun(runId);
  
  const { data: crimeData, isLoading: isLoadingCrime } = useCrimeStats(
    visibleSections.has('crimeStats') ? facts?.lat : undefined,
    visibleSections.has('crimeStats') ? facts?.lon : undefined
  );
  
  const { data: landmarkData, isLoading: isLoadingLandmark } = useLandmarkStatus(
    visibleSections.has('landmarkStatus') ? facts?.lat : undefined,
    visibleSections.has('landmarkStatus') ? facts?.lon : undefined,
    address
  );
  
  const { data: electionData, isLoading: isLoadingElection } = useElectionData(
    visibleSections.has('electionData') ? facts?.communityArea : undefined
  );

  const { data: nearbyDaycaresData, isLoading: isLoadingNearbyDaycares } = useNearbyDayCares(
    facts?.lat, facts?.lon,
    visibleSections.has('nearbyDaycares') && isDaycareOrSchool
  );

  const { data: childcareCapacityData } = useChildcareCapacity(isDaycareOrSchool ? facts?.communityArea : undefined);
  const { data: childcareCapacityZipData } = useChildcareCapacityZip(isDaycareOrSchool ? facts?.zipCode : undefined);

  const isAutoService = selectedProjectType === 'Auto Service' || selectedProjectType === 'Gas Station' || selectedProjectType === 'EV Charging Station';

  const { data: vehicleData, isLoading: isLoadingVehicle } = useVehicleOwnership(
    visibleSections.has('vehicleOwnership') && isAutoService ? facts?.communityArea : undefined
  );

  const { data: seniorsData, isLoading: isLoadingSeniors } = useSeniorsData(
    visibleSections.has('seniorPopulation') ? facts?.communityArea : undefined
  );

  const { data: childcareEnhancedData, isLoading: isLoadingChildcareEnhanced } = useChildcareEnhancedData(
    visibleSections.has('childcareEnhanced') && isDaycareOrSchool ? facts?.communityArea : undefined
  );

  const { data: languageData, isLoading: isLoadingLanguage } = useLanguageData(
    visibleSections.has('languagesSpoken') ? facts?.communityArea : undefined
  );

  const { data: censusACSData, isLoading: isLoadingDemographics } = useCensusACS(
    visibleSections.has('demographicTrends') ? facts?.tractGeoid : undefined,
    visibleSections.has('demographicTrends') ? facts?.zipCode : undefined
  );

  const { data: proximityResponse, isLoading: isLoadingProximity } = useProximityData(
    visibleSections.has('proximityInfo') ? pin : undefined
  );

  const { data: michelinData, isLoading: isLoadingMichelin } = useMichelinNearby(
    visibleSections.has('michelinRestaurants') ? facts?.lat : undefined,
    visibleSections.has('michelinRestaurants') ? facts?.lon : undefined
  );

  const { data: combinedPermitViolations, isLoading: isLoadingPermitsViolations } = useCombinedPermitViolations(
    visibleSections.has('permitHistory') ? address : undefined,
    visibleSections.has('permitHistory') && pin ? [pin] : undefined
  );

  const { data: fmrData, isLoading: isLoadingFmr } = useFairMarketRent(
    visibleSections.has('fairMarketRent') ? facts?.zipCode : undefined
  );

  const { data: vacantBuildingsData, isLoading: isLoadingVacantBuildings } = useVacantBuildingsNearby(
    visibleSections.has('vacantBuildings') ? facts?.lat : undefined,
    visibleSections.has('vacantBuildings') ? facts?.lon : undefined
  );

  const { data: neighborhoodNewsData, isLoading: isLoadingNeighborhoodNews } = useNeighborhoodNews(
    visibleSections.has('neighborhoodNews') ? facts?.communityArea : undefined
  );

  const { data: corridorNewsData, isLoading: isLoadingCorridorNews } = useCorridorNews(
    visibleSections.has('corridorNews') ? facts?.lat : undefined,
    visibleSections.has('corridorNews') ? facts?.lon : undefined
  );

  const { data: nearbyBusinessLicensesData, isLoading: isLoadingBusinessLicenses } = useNearbyBusinessLicenses(
    visibleSections.has('nearbyBusinessLicenses') ? facts?.lat : undefined,
    visibleSections.has('nearbyBusinessLicenses') ? facts?.lon : undefined
  );

  const { data: muralsData, isLoading: isLoadingMurals } = useMuralsNearby(
    visibleSections.has('murals') ? facts?.lat : undefined,
    visibleSections.has('murals') ? facts?.lon : undefined
  );

  const { data: designatedLandmarksData, isLoading: isLoadingDesignatedLandmarks } = useDesignatedLandmarksNearby(
    visibleSections.has('designatedLandmarks') ? facts?.lat : undefined,
    visibleSections.has('designatedLandmarks') ? facts?.lon : undefined
  );

  const { data: worshipData, isLoading: isLoadingWorship } = usePlacesOfWorship(
    visibleSections.has('worship') ? facts?.lat : undefined,
    visibleSections.has('worship') ? facts?.lon : undefined
  );

  const { data: nearbySchoolsData, isLoading: isLoadingNearbySchools } = useSchoolsNearby(
    visibleSections.has('nearbySchools') ? facts?.lat : undefined,
    visibleSections.has('nearbySchools') ? facts?.lon : undefined
  );

  const { data: hmdaStatsData, isLoading: isLoadingHmdaStats } = useHmdaStats(
    visibleSections.has('mortgageMarket') ? (facts?.tractGeoid || null) : null,
    visibleSections.has('mortgageMarket') ? (facts?.communityArea || null) : null
  );

  const { data: sbaLoansData, isLoading: isLoadingSbaLoans } = useSBALoans(
    visibleSections.has('sbaLoans') ? facts?.zipCode : undefined
  );

  const { data: comparableSalesData, isLoading: isLoadingComparableSales } = useComparableSales(
    visibleSections.has('recentlySoldComps') ? facts?.lat : undefined,
    visibleSections.has('recentlySoldComps') ? facts?.lon : undefined,
    visibleSections.has('recentlySoldComps') ? (propertyTaxData?.propertyClass || null) : null,
    null, null, null
  );

  const { data: airbnbMarketData, isLoading: isLoadingAirbnbMarket } = useAirbnbStats(
    visibleSections.has('airbnbMarket') ? (facts?.communityArea || undefined) : undefined
  );

  const { data: rentcastMarketData, isLoading: isLoadingRentcastMarket } = useRentcast(
    visibleSections.has('rentcastMarket') ? (facts?.zipCode || undefined) : undefined
  );

  const { data: upcomingDevsData, isLoading: isLoadingUpcomingDevs } = useUpcomingDevelopments(
    visibleSections.has('upcomingDevelopments') ? (facts?.neighborhood || undefined) : undefined,
    visibleSections.has('upcomingDevelopments') ? (facts?.communityArea || undefined) : undefined
  );

  const getChildcareServiceLevel = (childrenPerSlot: number | null | undefined) => {
    if (childrenPerSlot === null || childrenPerSlot === undefined) return null;
    if (childrenPerSlot > 3.0) return { label: 'Childcare Desert', color: '' };
    if (childrenPerSlot >= 1.5) return { label: 'Underserved', color: '' };
    return { label: 'Adequate', color: '' };
  };

  const buildingSqFt = runData?.manualBuildingSqFt || propertyTaxData?.buildingSquareFeet || pinLookupData?.commercialData?.bldgSf || 0;
  const landSqFt = runData?.manualLandSqFt || propertyTaxData?.landSquareFeet || pinLookupData?.commercialData?.landSf || 0;
  const stories = (runData?.manualStories ? parseFloat(String(runData.manualStories)) : null) || propertyTaxData?.stories || 1;

  return (
    <div className="flex flex-col border border-[#eae8e2] rounded-[14px] overflow-hidden bg-white">
      <div className="p-4 bg-[#1e2a6e] text-white flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a 
            href={`/run/${runId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              updateProjectType.mutate({ id: runId, projectType: selectedProjectType });
            }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity group text-left"
            data-testid={`link-run-detail-${runId}`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="font-serif text-base truncate group-hover:underline">
              {formatAddress(address)}
            </span>
            {label && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{background:'#eef0fb', color:'#2b3a9e'}} data-testid={`tag-compare-label-${runId}`}>
                {label}
              </span>
            )}
            <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
          </a>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          onClick={onRemove}
          data-testid={`button-remove-compare-${runId}`}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="p-4 border-b border-[#eae8e2]">
        <label className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] mb-2 block">Project Use</label>
        <div className="flex items-center gap-1">
          {businessUsesData ? (
            <ProjectTypeCombobox
              uses={businessUsesData.uses}
              categories={businessUsesData.categories}
              value={selectedProjectType}
              onValueChange={handleProjectTypeChange}
              placeholder="Select project use..."
            />
          ) : (
            <Skeleton className="h-9 w-full" />
          )}
          {selectedProjectType && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleProjectTypeChange(null)}
              data-testid={`button-clear-project-type-${runId}`}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoadingFacts ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {visibleSections.has('location') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Location</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 truncate">
                    <span className="text-xs text-muted-foreground">Ward: </span>
                    <span className="font-medium">{facts?.ward || "N/A"}</span>
                    {facts?.alderman && (
                      <span className="font-medium"> - Ald. {facts.alderman}</span>
                    )}
                  </div>
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 truncate">
                    <span className="text-xs text-muted-foreground">Community: </span>
                    <span className="font-medium">{facts?.communityArea || "N/A"}</span>
                  </div>
                </div>
              </div>
            )}
            
            {visibleSections.has('zoning') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Zoning
                </h4>
                {isLoadingZoning ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <>
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-sm truncate">
                      <span className="font-semibold">{facts?.zoning || "N/A"}</span>
                      {zoningInfo?.description && (
                        <span className="text-muted-foreground">: {zoningInfo.description}</span>
                      )}
                    </div>
                    {(zoningInfo?.maxFAR || zoningInfo?.maxHeight) && (
                      <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                        {zoningInfo.maxFAR && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Max FAR:</span>
                            <span className="font-medium">{zoningInfo.maxFAR}</span>
                          </div>
                        )}
                        {zoningInfo.maxHeight && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Max Height:</span>
                            <span className="font-medium">{zoningInfo.maxHeight}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                
                <div className={`rounded-lg p-2 flex items-center gap-2 border ${
                  !selectedProjectType ? 'bg-white border-[#eae8e2]' :
                  compatibility?.permission === 'permitted' ? 'bg-green-50 border-green-300' :
                  'bg-red-50 border-red-300'
                }`}>
                  {!selectedProjectType ? (
                    <span className="text-xs text-muted-foreground">Select project use</span>
                  ) : compatibility?.permission === 'permitted' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-xs font-medium text-green-700">Permitted</span>
                    </>
                  ) : compatibility?.permission === 'special_use' ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="text-xs font-medium text-red-700">Special Use</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="text-xs font-medium text-red-700">Not Permitted</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {visibleSections.has('buildingInfo') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  Building Info
                </h4>
                <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Building Sq Ft:</span>
                    <span className="font-medium">{buildingSqFt ? buildingSqFt.toLocaleString() : 'N/A'}</span>
                  </div>
                  {landSqFt > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Land Sq Ft:</span>
                      <span className="font-medium">{landSqFt.toLocaleString()}</span>
                    </div>
                  )}
                  {stories > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stories:</span>
                      <span className="font-medium">{stories}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {visibleSections.has('assessedValue') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Property Tax
                </h4>
                {propertyTaxData?.taxYears && propertyTaxData.taxYears.length > 0 ? (() => {
                  const recent = propertyTaxData.taxYears[0];
                  const prior = propertyTaxData.taxYears[1];
                  const isPartial = recent.installment1 && !recent.installment2;
                  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Tax {recent.year}{isPartial ? ' (1st Inst.)' : ''}:</span>
                        <div className="text-right">
                          <span className="font-bold">{fmt(recent.billed)}</span>
                          {recent.status === 'paid' && <span className="ml-1 text-muted-foreground">Paid</span>}
                          {recent.status === 'unpaid' && <span className="ml-1 font-medium">Unpaid</span>}
                        </div>
                      </div>
                      {isPartial && (
                        <div className="text-muted-foreground italic">2nd installment not yet billed</div>
                      )}
                      {prior && (
                        <div className="flex justify-between items-start border-t border-[#eae8e2] pt-1">
                          <span className="text-muted-foreground">Tax {prior.year}:</span>
                          <div className="text-right">
                            <span className="font-medium">{fmt(prior.billed)}</span>
                            {prior.status === 'paid' && <span className="ml-1 text-muted-foreground">Paid</span>}
                            {prior.status === 'unpaid' && <span className="ml-1 font-medium">Unpaid</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">No tax data</p>
                )}
              </div>
            )}
            
            {visibleSections.has('incentives') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Eligible Incentives
                </h4>
                {(() => {
                  const eligibleIncentives: { name: string; detail: string; color: string }[] = [];
                  
                  if (sbifData?.sbif.authorized && (sbifData.sbif.status === 'open' || sbifData.sbif.status === 'upcoming')) {
                    eligibleIncentives.push({
                      name: 'SBIF',
                      detail: sbifData.sbif.statusLabel || 'Eligible',
                      color: ''
                    });
                  }
                  if (nmtcData?.eligible) {
                    eligibleIncentives.push({
                      name: 'NMTC',
                      detail: nmtcData.distressLabel || 'Likely Eligible',
                      color: ''
                    });
                  }
                  if (mmrpData?.inMmrpZone) {
                    eligibleIncentives.push({
                      name: 'MMRP',
                      detail: mmrpData.zoneName || 'Eligible',
                      color: ''
                    });
                  }
                  if (todData?.inTOD) {
                    eligibleIncentives.push({
                      name: 'TOD',
                      detail: todData.todType || 'Eligible',
                      color: ''
                    });
                  }
                  if (facts?.aduZone) {
                    eligibleIncentives.push({
                      name: 'ADU',
                      detail: facts.aduZone === 'Zoning-Eligible'
                        ? `Eligible by Zoning (${facts.zoning || ''})`
                        : `RS Area: ${facts.aduZone}`,
                      color: ''
                    });
                  }
                  
                  if (isLoadingSbif || isLoadingNmtc || isLoadingMmrp || isLoadingTod) {
                    return <Skeleton className="h-10 w-full" />;
                  }
                  
                  if (eligibleIncentives.length === 0) {
                    return (
                      <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs text-muted-foreground">
                        No eligible incentives found
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-1">
                      {eligibleIncentives.map((inc) => (
                        <div key={inc.name} className={`rounded p-2 text-xs ${inc.color}`}>
                          <span className="font-medium">{inc.name}:</span> {inc.detail}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {visibleSections.has('childcareAccess') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Baby className="w-3 h-3" />
                  Childcare Access
                </h4>
                {isLoadingChildcare ? (
                  <Skeleton className="h-6 w-full" />
                ) : childcareData ? (
                  (() => {
                    const serviceLevel = getChildcareServiceLevel(childcareData.childrenPerSlot);
                    return serviceLevel ? (
                      <Badge className={`${serviceLevel.color} text-xs`}>
                        {serviceLevel.label}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">No status available</p>
                    );
                  })()
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}

            {visibleSections.has('daycareRatios') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Calculator className="w-3 h-3" />
                  Day Care Needs Estimator
                </h4>
                {isLoadingChildcare ? (
                  <Skeleton className="h-16 w-full" />
                ) : (() => {
                  const accessData = childcareData || communityChildcareData;
                  if (!accessData) return <p className="text-xs text-muted-foreground">No data available</p>;
                  
                  const totalChildren = accessData.childrenUnder5;
                  const totalSlots = accessData.licensedSlots;
                  const childrenPerSlot = totalSlots > 0 ? totalChildren / totalSlots : 0;
                  const avgCapacity = 78;
                  
                  const gap1to1 = totalChildren - totalSlots;
                  const daycares1to1 = gap1to1 > 0 ? Math.ceil(gap1to1 / avgCapacity) : 0;
                  
                  const targetSlots1to1_5 = totalChildren / 1.5;
                  const gap1to1_5 = targetSlots1to1_5 - totalSlots;
                  const daycares1to1_5 = gap1to1_5 > 0 ? Math.ceil(gap1to1_5 / avgCapacity) : 0;
                  
                  const targetSlots1to1_75 = totalChildren / 1.75;
                  const gap1to1_75 = targetSlots1to1_75 - totalSlots;
                  const daycares1to1_75 = gap1to1_75 > 0 ? Math.ceil(gap1to1_75 / avgCapacity) : 0;
                  
                  return (
                    <div className="space-y-2">
                      <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Children Under 5:</span>
                          <span className="font-medium text-foreground">{totalChildren.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Slots:</span>
                          <span className="font-medium text-foreground">{totalSlots.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Children per Slot:</span>
                          <span className={`font-bold ${childrenPerSlot > 3 ? 'text-muted-foreground' : childrenPerSlot >= 1.5 ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {childrenPerSlot > 0 ? childrenPerSlot.toFixed(1) : 'N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div className={`rounded p-1.5 text-center ${daycares1to1 > 0 ? 'bg-[#2b3a9e]/10' : 'bg-white border border-[#eae8e2]'}`}>
                          <p className="text-[10px] text-muted-foreground font-semibold">1:1</p>
                          <p className={`text-sm font-bold ${daycares1to1 > 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {daycares1to1 > 0 ? `~${daycares1to1}` : 'Met'}
                          </p>
                        </div>
                        <div className={`rounded p-1.5 text-center ${daycares1to1_5 > 0 ? 'bg-[#2b3a9e]/10' : 'bg-white border border-[#eae8e2]'}`}>
                          <p className="text-[10px] text-muted-foreground font-semibold">1:1.5</p>
                          <p className={`text-sm font-bold ${daycares1to1_5 > 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {daycares1to1_5 > 0 ? `~${daycares1to1_5}` : 'Met'}
                          </p>
                        </div>
                        <div className={`rounded p-1.5 text-center ${daycares1to1_75 > 0 ? 'bg-[#2b3a9e]/10' : 'bg-white border border-[#eae8e2]'}`}>
                          <p className="text-[10px] text-muted-foreground font-semibold">1:1.75</p>
                          <p className={`text-sm font-bold ${daycares1to1_75 > 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {daycares1to1_75 > 0 ? `~${daycares1to1_75}` : 'Met'}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">Daycares needed (avg 78 capacity)</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {visibleSections.has('siteSpecificDaycare') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Site Day Care Details
                </h4>
                {buildingSqFt > 0 ? (() => {
                  const efficientCapacity = Math.floor(buildingSqFt / 75);
                  const comfortableCapacity = Math.floor(buildingSqFt / 90);
                  
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>Building:</span>
                        <span className="font-medium">{buildingSqFt.toLocaleString()} sq ft</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Efficient (75 sf/child):</span>
                        <span className="font-bold text-foreground">{efficientCapacity} children</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Comfortable (90 sf/child):</span>
                        <span className="font-bold text-foreground">{comfortableCapacity} children</span>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">No building data - enter on property page</p>
                )}
              </div>
            )}
            
            {visibleSections.has('quickCashflow') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Quick Cashflow
                </h4>
                {buildingSqFt > 0 ? (() => {
                  const efficientCapacity = Math.floor(buildingSqFt / 75);
                  const comfortableCapacity = Math.floor(buildingSqFt / 90);
                  const revenuePerChild = 2275;
                  const expensePercent = 75;

                  const occupancy = 0.75;
                  const efficientMonthlyRevenue = Math.round(efficientCapacity * revenuePerChild * occupancy);
                  const comfortableMonthlyRevenue = Math.round(comfortableCapacity * revenuePerChild * occupancy);
                  const efficientMonthlyExpense = Math.round(efficientMonthlyRevenue * (expensePercent / 100));
                  const comfortableMonthlyExpense = Math.round(comfortableMonthlyRevenue * (expensePercent / 100));
                  const efficientMonthlyCashflow = efficientMonthlyRevenue - efficientMonthlyExpense;
                  const comfortableMonthlyCashflow = comfortableMonthlyRevenue - comfortableMonthlyExpense;

                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-2">
                      <p className="text-[10px] text-muted-foreground">$2,275/child/mo | 75% expenses | 75% occupancy</p>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-foreground">Efficient ({efficientCapacity} children)</p>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly</span>
                          <span className={`font-bold ${efficientMonthlyCashflow >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>${efficientMonthlyCashflow.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annual</span>
                          <span className={`font-bold ${efficientMonthlyCashflow >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>${(efficientMonthlyCashflow * 12).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1 border-t border-[#eae8e2] pt-1">
                        <p className="text-[10px] font-semibold text-foreground">Comfortable ({comfortableCapacity} children)</p>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly</span>
                          <span className={`font-bold ${comfortableMonthlyCashflow >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>${comfortableMonthlyCashflow.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annual</span>
                          <span className={`font-bold ${comfortableMonthlyCashflow >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>${(comfortableMonthlyCashflow * 12).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">No building data available</p>
                )}
              </div>
            )}

            {visibleSections.has('groceryAccess') && isGrocery && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" />
                  Grocery Access
                </h4>
                {isLoadingGrocery ? (
                  <Skeleton className="h-10 w-full" />
                ) : groceryData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{groceryData.storeCount}</span> stores in ZIP {facts?.zipCode}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('cannabisMarket') && isCannabis && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Leaf className="w-3 h-3" />
                  Cannabis Market
                </h4>
                {isLoadingCannabis ? (
                  <Skeleton className="h-10 w-full" />
                ) : cannabisData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{cannabisData.count}</span> dispensar{cannabisData.count === 1 ? 'y' : 'ies'} in ZIP
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('evMarket') && isEvStation && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  EV Market
                </h4>
                {isLoadingEvReg || isLoadingEvStations ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {evRegData?.zipCodeData && evRegData.zipCodeData.length > 0 && (
                      <div className="flex justify-between">
                        <span>EV Registrations:</span>
                        <span className="font-medium">{evRegData.zipCodeData[evRegData.zipCodeData.length - 1]?.count?.toLocaleString() || 'N/A'}</span>
                      </div>
                    )}
                    {evStationData && (
                      <div className="flex justify-between">
                        <span>Nearby Chargers:</span>
                        <span className="font-medium">{evStationData.stations?.length || 0} within 1mi</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {visibleSections.has('gasStation') && isGasStation && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Fuel className="w-3 h-3" />
                  Gas Station Market
                </h4>
                {isLoadingGasStations ? (
                  <Skeleton className="h-10 w-full" />
                ) : gasStationData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{gasStationData.stations?.length || 0}</span> stations within 1mi
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('coffeeShops') && isCoffeeShop && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Coffee className="w-3 h-3" />
                  Nearby Coffee Shops
                </h4>
                {isLoadingCoffeeShops ? (
                  <Skeleton className="h-10 w-full" />
                ) : coffeeShopsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{coffeeShopsData.within1Mile || 0}</span> coffee shops within 1mi
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('restaurants') && isRestaurant && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Utensils className="w-3 h-3" />
                  Nearby Restaurants
                </h4>
                {isLoadingRestaurants ? (
                  <Skeleton className="h-10 w-full" />
                ) : restaurantsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{restaurantsData.within1Mile || 0}</span> restaurants within 1mi
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('hotels') && isHotel && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Hotel className="w-3 h-3" />
                  Nearby Hotels
                </h4>
                {isLoadingHotels ? (
                  <Skeleton className="h-10 w-full" />
                ) : hotelsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{hotelsData.within1Mile || 0}</span> hotels within 1mi
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('bars') && isBar && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Wine className="w-3 h-3" />
                  Nearby Bars
                </h4>
                {isLoadingBars ? (
                  <Skeleton className="h-10 w-full" />
                ) : barsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs">
                    <span className="font-medium">{barsData.within1Mile || 0}</span> bars within 1mi
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available</p>
                )}
              </div>
            )}
            
            {visibleSections.has('zbaReps') && requiresZoningChange && wardNumber && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <User className="w-3 h-3" />
                  ZBA Representatives
                </h4>
                {isLoadingZba ? (
                  <Skeleton className="h-16 w-full" />
                ) : zbaWardData && zbaWardData.indexBuilt && zbaWardData.representatives.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Ward {wardNumber} cases:</span>
                      <span className="font-medium text-foreground">{zbaWardData.totalCases}</span>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {zbaWardData.representatives.slice(0, 3).map((rep) => {
                        const isSelfRep = rep.representativeNorm === 'self' || rep.representativeDisplay.toLowerCase().includes('self');
                        return (
                          <div key={rep.representativeNorm} className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs">{rep.representativeDisplay}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-foreground">{rep.approvedCount}</span>
                              <span>/</span>
                              <span className="text-muted-foreground">{rep.deniedCount}</span>
                              {!isSelfRep && (
                                <a
                                  href={`https://www.iardc.org/Lawyer/Search?LastName=${encodeURIComponent(rep.representativeDisplay.split(' ').pop() || '')}&FirstName=${encodeURIComponent(rep.representativeDisplay.split(' ')[0] || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-foreground underline text-xs"
                                >
                                  ARDC
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No ZBA data for Ward {wardNumber}</p>
                )}
              </div>
            )}
            
            {visibleSections.has('transit') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Train className="w-3 h-3" />
                  Transit (0.5 mi)
                </h4>
                {isLoadingTransit ? (
                  <Skeleton className="h-20 w-full" />
                ) : transitData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-2">
                    {(() => {
                      const busStops = transitData.ctaBus?.filter(s => s.distance <= 0.5) || [];
                      const ctaRailStops = transitData.ctaRail?.filter(s => s.distance <= 0.5) || [];
                      const metraStops = transitData.metra?.filter(s => s.distance <= 0.5) || [];
                      
                      const busLines = Array.from(new Set(busStops.flatMap(s => s.routes || []))).map(r => {
                        const match = r.match(/^(X?\d+[A-Z]?)/i);
                        return match ? match[1] : r;
                      });
                      const ctaRailLines = Array.from(new Set(ctaRailStops.flatMap(s => s.routes || [])));
                      const metraLines = Array.from(new Set(metraStops.flatMap(s => s.routes || [])));
                      
                      const closestBus = transitData.ctaBus?.[0];
                      const closestRail = transitData.ctaRail?.[0];
                      const closestMetra = transitData.metra?.[0];
                      
                      // Bus ridership lookup for nearest routes
                      const busRidershipByRoute: Record<string, any> = {};
                      if (ctaBusRidershipData?.routes) {
                        for (const r of ctaBusRidershipData.routes) {
                          busRidershipByRoute[String(r.route).toUpperCase()] = r;
                        }
                      }
                      // Rail ridership for closest station
                      const railRidership = ctaRidershipData?.stations?.[0];

                      return (
                        <>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>CTA Bus:</span>
                              <span className="font-medium">{busStops.length} stop{busStops.length !== 1 ? 's' : ''}</span>
                            </div>
                            {closestBus && (
                              <div className="text-muted-foreground pl-2 truncate">
                                Nearest: {closestBus.stopName} ({closestBus.distance.toFixed(2)} mi)
                              </div>
                            )}
                            {busLines.length > 0 && (
                              <div className="text-muted-foreground pl-2 truncate">
                                Lines: {busLines.join(', ')}
                              </div>
                            )}
                            {busLines.slice(0, 2).map(lineNum => {
                              const rd = busRidershipByRoute[lineNum.toUpperCase()];
                              if (!rd?.latest) return null;
                              return (
                                <div key={lineNum} className="pl-2 text-muted-foreground">
                                  Rt. {lineNum}: {Math.round(rd.latest.weekday).toLocaleString()}/day
                                  {rd.weekdayRank > 0 && <span> · #{rd.weekdayRank} of {rd.totalRoutesRanked}</span>}
                                </div>
                              );
                            })}
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>CTA Rail:</span>
                              <span className="font-medium">{ctaRailStops.length} station{ctaRailStops.length !== 1 ? 's' : ''}</span>
                            </div>
                            {closestRail && (
                              <div className="text-muted-foreground pl-2 truncate">
                                Nearest: {closestRail.stopName} ({closestRail.distance.toFixed(2)} mi)
                              </div>
                            )}
                            {ctaRailLines.length > 0 && (
                              <div className="pl-2 truncate">
                                {ctaRailLines.map((line, li) => {
                                  const lName = line.replace(/ Line$/i, '');
                                  const hex = ctaLineHexMap[lName] || '#6b7280';
                                  return <span key={li}>{li > 0 && ', '}<span style={{ color: hex, fontWeight: 500 }}>{line}</span></span>;
                                })}
                              </div>
                            )}
                            {railRidership?.latest && (
                              <div className="pl-2 text-muted-foreground">
                                {Math.round(railRidership.latest.weekday).toLocaleString()}/day
                                {railRidership.weekdayRank > 0 && <span> · #{railRidership.weekdayRank} of {railRidership.totalStationsRanked}</span>}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Metra:</span>
                              <span className="font-medium">{metraStops.length} station{metraStops.length !== 1 ? 's' : ''}</span>
                            </div>
                            {closestMetra && (
                              <div className="text-muted-foreground pl-2 truncate">
                                Nearest: {closestMetra.stopName} ({closestMetra.distance.toFixed(2)} mi)
                              </div>
                            )}
                            {metraLines.length > 0 && (
                              <div className="text-muted-foreground pl-2 truncate">
                                {metraLines.join(', ')}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No transit data</p>
                )}
              </div>
            )}

            {visibleSections.has('ctaRidership') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  CTA L Ridership
                </h4>
                {isLoadingRidership ? <Skeleton className="h-10 w-full" /> : ctaRidershipData?.stations?.length ? (
                  <div className="space-y-2">
                    {ctaRidershipData.stations.slice(0, 2).map((station: any, sIdx: number) => {
                      const stHex = getStationHex(station.stationId);
                      return (
                      <div key={sIdx} className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1" style={{ borderLeft: `3px solid ${stHex}` }}>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Station:</span>
                          <span className="font-medium truncate ml-1">{station.stationName}</span>
                        </div>
                        {station.latest && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Weekday Avg:</span>
                              <span className="font-medium">{station.latest.weekday.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Saturday Avg:</span>
                              <span className="font-medium">{station.latest.saturday.toLocaleString()}</span>
                            </div>
                          </>
                        )}
                        {station.weekdayRank > 0 && (
                          <div className="flex justify-between pt-1 border-t" style={{ borderTopColor: `${stHex}33` }}>
                            <span className="text-muted-foreground">Rank:</span>
                            <span className="font-medium">#{station.weekdayRank} of {station.totalStationsRanked}</span>
                          </div>
                        )}
                        {station.trendPct !== null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Trend:</span>
                            <span className={`font-medium ${station.trendPct >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {station.trendPct >= 0 ? '+' : ''}{station.trendPct}%
                            </span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No ridership data</p>
                )}
              </div>
            )}

            {visibleSections.has('ctaBusRidership') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  CTA Bus Ridership
                </h4>
                {isLoadingBusRidership ? <Skeleton className="h-10 w-full" /> : ctaBusRidershipData?.routes?.length ? (
                  <div className="space-y-2">
                    {ctaBusRidershipData.routes.map((route: any, rIdx: number) => (
                      <div key={rIdx} className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Route:</span>
                          <span className="font-medium truncate ml-1">{route.route} {route.routeName}</span>
                        </div>
                        {route.latest && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Weekday Avg:</span>
                              <span className="font-medium">{Math.round(route.latest.weekday).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Saturday Avg:</span>
                              <span className="font-medium">{Math.round(route.latest.saturday).toLocaleString()}</span>
                            </div>
                          </>
                        )}
                        {route.weekdayRank > 0 && (
                          <div className="flex justify-between pt-1 border-t border-[#eae8e2]">
                            <span className="text-muted-foreground">Rank:</span>
                            <span className="font-medium">#{route.weekdayRank} of {route.totalRoutesRanked}</span>
                          </div>
                        )}
                        {route.trendPct !== null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Trend:</span>
                            <span className={`font-medium ${route.trendPct >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {route.trendPct >= 0 ? '+' : ''}{route.trendPct}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Route-wide totals, not stop-specific</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No bus ridership data</p>
                )}
              </div>
            )}

            {visibleSections.has('newConstruction') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <HardHat className="w-3 h-3" />
                  New Construction Activity
                </h4>
                {isLoadingNewConstruction ? <Skeleton className="h-10 w-full" /> : newConstructionData ? (() => {
                  const stats = newConstructionData.subject;
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-2">
                      {stats && (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Within 1 mile</div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Total Permits:</span><span className="font-medium">{stats.totalPermits}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Single Family:</span><span className="font-medium text-foreground">{stats.byCategory.singleFamily}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Multifamily:</span><span className="font-medium text-foreground">{stats.byCategory.multifamily}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Commercial:</span><span className="font-medium text-muted-foreground">{stats.byCategory.commercial}</span></div>
                        </div>
                      )}
                      {!stats && <span className="text-muted-foreground">No data available</span>}
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">No construction data</p>
                )}
              </div>
            )}

            {visibleSections.has('crimeStats') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Crime Statistics
                </h4>
                {isLoadingCrime ? (
                  <Skeleton className="h-16 w-full" />
                ) : crimeData?.nearby && crimeData?.quarterMile ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span>250 ft radius:</span>
                      <span className="font-bold text-muted-foreground">{crimeData.nearby.totalCrimes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>0.25 mi radius:</span>
                      <span className="font-bold">{crimeData.quarterMile.totalCrimes.toLocaleString()}</span>
                    </div>
                    {Object.entries(crimeData.quarterMile.crimesByType).slice(0, 3).map(([type, count]) => (
                      <div key={type} className="flex justify-between pl-2 text-muted-foreground">
                        <span className="truncate">{type}</span>
                        <span className="shrink-0 ml-1">{(count as number).toLocaleString()}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Last 12 months - Chicago Data Portal</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No crime data available</p>
                )}
              </div>
            )}

            {visibleSections.has('landmarkStatus') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Landmark className="w-3 h-3" />
                  Landmark Status
                </h4>
                {isLoadingLandmark ? (
                  <Skeleton className="h-10 w-full" />
                ) : landmarkData ? (
                  <div className={`rounded-lg p-2 text-xs bg-white border border-[#eae8e2]`}>
                    {landmarkData.isLandmark ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Landmark className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">Historic Landmark</span>
                        </div>
                        {landmarkData.landmarkName && (
                          <p className="text-muted-foreground truncate">{landmarkData.landmarkName}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not a landmark</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            )}

            {visibleSections.has('todStatus') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Train className="w-3 h-3" />
                  TOD Status
                </h4>
                {isLoadingTod ? (
                  <Skeleton className="h-10 w-full" />
                ) : todData ? (
                  <div className={`rounded-lg p-2 text-xs bg-white border border-[#eae8e2]`}>
                    {todData.inTOD ? (
                      <div className="space-y-1">
                        <span className="font-medium">In TOD Zone</span>
                        {todData.todType && <p className="text-muted-foreground">{todData.todType}</p>}
                        {todData.nearestStation && <p className="text-muted-foreground truncate">Near: {todData.nearestStation}</p>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not in TOD zone</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            )}

            {visibleSections.has('electionData') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Vote className="w-3 h-3" />
                  Election Data
                </h4>
                {isLoadingElection ? (
                  <Skeleton className="h-10 w-full" />
                ) : electionData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Classification:</span>
                      <span className="font-medium">{electionData.classification}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Dem Margin:</span>
                      <span className="font-medium">{electionData.avg_dem_margin.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trend:</span>
                      <span className="font-medium">{electionData.trend}</span>
                    </div>
                    {electionData.presidential?.['2024'] && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>2024 Pres. (D):</span>
                        <span>{electionData.presidential['2024'].democratic_pct.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No election data</p>
                )}
              </div>
            )}

            {visibleSections.has('nearbyDaycares') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Baby className="w-3 h-3" />
                  Nearby Day Cares
                </h4>
                {isLoadingNearbyDaycares ? (
                  <Skeleton className="h-10 w-full" />
                ) : nearbyDaycaresData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Within 1 mi:</span>
                      <span className="font-medium">{nearbyDaycaresData.within1Mile || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Within 3 mi:</span>
                      <span className="font-medium">{nearbyDaycaresData.totalFound || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            )}

            {visibleSections.has('parcelInfo') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Parcel Information
                </h4>
                <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">PIN:</span><span className="font-medium">{pin || 'N/A'}</span></div>
                  {pinLookupData?.propertyType && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Type:</span><span className="font-medium">{pinLookupData.propertyType}</span></div>
                  )}
                  {pinLookupData?.commercialData?.marketValue && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Est. Value:</span><span className="font-medium">${Number(pinLookupData.commercialData.marketValue).toLocaleString()}</span></div>
                  )}
                  {pinLookupData?.commercialData?.bldgSf && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Bldg SF:</span><span className="font-medium">{pinLookupData.commercialData.bldgSf.toLocaleString()}</span></div>
                  )}
                </div>
              </div>
            )}

            {visibleSections.has('saleHistory') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Sale History
                </h4>
                {pinLookupData?.saleHistory && pinLookupData.saleHistory.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                    {pinLookupData.saleHistory.slice(0, 5).map((sale, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="text-muted-foreground">{sale.saleDate ? new Date(sale.saleDate).toLocaleDateString() : 'N/A'}</span>
                        <span className="font-medium shrink-0">{sale.salePrice > 0 ? `$${sale.salePrice.toLocaleString()}` : 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No sale history available</p>
                )}
              </div>
            )}

            {visibleSections.has('propertyTax') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Property Tax
                </h4>
                {propertyTaxData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {propertyTaxData.totalAnnualTaxAmount !== null && (
                      <div className="flex justify-between items-center pb-1 mb-1 border-b border-[#eae8e2]">
                        <span className="text-muted-foreground">Annual Tax Bill:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-sm">${propertyTaxData.totalAnnualTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          {propertyTaxData.paymentStatus && (
                            <span className={`px-1 rounded text-[10px] font-medium ${
                              propertyTaxData.paymentStatus === 'current' ? 'bg-green-600 text-white' :
                              propertyTaxData.paymentStatus === 'delinquent' ? 'bg-red-600 text-white' :
                              propertyTaxData.paymentStatus === 'sold' ? 'bg-red-700 text-white' :
                              'bg-[#faf9f6] text-muted-foreground border border-[#eae8e2]'
                            }`}>
                              {propertyTaxData.paymentStatus === 'current' ? '✓' : propertyTaxData.paymentStatus === 'delinquent' ? '⚠' : propertyTaxData.paymentStatus === 'sold' ? '🚨' : '?'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {propertyTaxData.taxYearMostRecent && <div className="flex justify-between"><span className="text-muted-foreground">Assessor Year:</span><span className="font-medium">{propertyTaxData.taxYearMostRecent}</span></div>}
                    {propertyTaxData.yearBuilt && <div className="flex justify-between"><span className="text-muted-foreground">Year Built:</span><span className="font-medium">{propertyTaxData.yearBuilt}</span></div>}
                    {propertyTaxData.buildingSquareFeet && <div className="flex justify-between"><span className="text-muted-foreground">Bldg SF:</span><span className="font-medium">{propertyTaxData.buildingSquareFeet.toLocaleString()}</span></div>}
                    {propertyTaxData.landSquareFeet && <div className="flex justify-between"><span className="text-muted-foreground">Land SF:</span><span className="font-medium">{propertyTaxData.landSquareFeet.toLocaleString()}</span></div>}
                    {propertyTaxData.stories && <div className="flex justify-between"><span className="text-muted-foreground">Stories:</span><span className="font-medium">{propertyTaxData.stories}</span></div>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tax data available</p>
                )}
              </div>
            )}

            {visibleSections.has('appealHistory') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Scale className="w-3 h-3" />
                  Appeal History
                </h4>
                {pinLookupData?.appealHistory && pinLookupData.appealHistory.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                    {pinLookupData.appealHistory.map((appeal, i) => (
                      <div key={i} className="flex justify-between items-center gap-1">
                        <span className="text-muted-foreground">{appeal.taxYear}</span>
                        <div className="flex items-center gap-1">
                          {appeal.attorneyLastName && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{appeal.attorneyLastName}</span>
                          )}
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${appeal.result === 'Granted' || appeal.result === 'Reduced' ? 'border-green-600 text-green-700' : 'border-[#ddd9d0] text-muted-foreground'}`}>
                            {appeal.result || 'Pending'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No appeal history</p>
                )}
              </div>
            )}

            {visibleSections.has('aduEligibility') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  ADU Eligibility
                </h4>
                {(() => {
                  const zoning = facts?.zoning || '';
                  const isAduEligible = /^RS-[1-3]$/i.test(zoning) || /^RT/i.test(zoning);
                  return (
                    <div className={`rounded-lg p-2 text-xs bg-white border border-[#eae8e2]`}>
                      {isAduEligible ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-foreground" />
                          <span className="font-medium">ADU Eligible Zone ({zoning})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not in ADU eligible zone ({zoning || 'N/A'})</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {visibleSections.has('sbifDetail') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  SBIF Detail
                </h4>
                {isLoadingSbif ? <Skeleton className="h-10 w-full" /> : sbifData?.sbif ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">TIF District:</span><span className="font-medium truncate ml-1">{facts?.tifName || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-medium">{sbifData.sbif.statusLabel || sbifData.sbif.status || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Authorized:</span>
                      <span className={`font-medium ${sbifData.sbif.authorized ? 'text-foreground' : 'text-muted-foreground'}`}>{sbifData.sbif.authorized ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not in a TIF district</p>
                )}
              </div>
            )}

            {visibleSections.has('nmtcDetail') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  NMTC Detail
                </h4>
                {isLoadingNmtc ? <Skeleton className="h-10 w-full" /> : nmtcData ? (
                  <div className={`rounded-lg p-2 text-xs bg-white border border-[#eae8e2]`}>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status:</span>
                      <span className={`font-medium ${nmtcData.eligible && nmtcData.distressLevel === 'deep_distress' ? 'text-foreground' : nmtcData.eligible && nmtcData.distressLevel === 'severe_distress' ? 'text-muted-foreground' : nmtcData.eligible ? 'text-foreground' : nmtcData.status === 'unknown' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{nmtcData.distressLabel || nmtcData.statusLabel}</span>
                    </div>
                    {nmtcData.eligible && nmtcData.distressDetails && (
                      <>
                        {nmtcData.distressDetails.povertyRate !== null && (
                          <div className="flex justify-between mt-1"><span className="text-muted-foreground">Poverty Rate:</span><span className="font-medium">{nmtcData.distressDetails.povertyRate}%</span></div>
                        )}
                        {nmtcData.distressDetails.pctMedianFamilyIncome !== null && (
                          <div className="flex justify-between mt-1"><span className="text-muted-foreground">Median Income:</span><span className="font-medium">{nmtcData.distressDetails.pctMedianFamilyIncome}% of area</span></div>
                        )}
                        {nmtcData.distressDetails.unemploymentRate !== null && (
                          <div className="flex justify-between mt-1"><span className="text-muted-foreground">Unemployment:</span><span className="font-medium">{nmtcData.distressDetails.unemploymentRate}%</span></div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No NMTC data</p>
                )}
              </div>
            )}

            {visibleSections.has('mmrpDetail') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  MMRP Detail
                </h4>
                {isLoadingMmrp ? <Skeleton className="h-10 w-full" /> : mmrpData ? (
                  <div className={`rounded-lg p-2 text-xs bg-white border border-[#eae8e2]`}>
                    <div className="flex justify-between"><span className="text-muted-foreground">In Zone:</span>
                      <span className={`font-medium ${mmrpData.inMmrpZone ? 'text-foreground' : 'text-muted-foreground'}`}>{mmrpData.inMmrpZone ? 'Yes' : 'No'}</span>
                    </div>
                    {mmrpData.zoneName && (
                      <div className="flex justify-between mt-1"><span className="text-muted-foreground">Zone:</span><span className="font-medium truncate ml-1">{mmrpData.zoneName}</span></div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No MMRP data</p>
                )}
              </div>
            )}

            {visibleSections.has('permitHistory') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Permits & Violations
                </h4>
                {isLoadingPermitsViolations ? <Skeleton className="h-10 w-full" /> : combinedPermitViolations ? (() => {
                  const d = combinedPermitViolations as any;
                  const totalPermits = d.permits?.totalPermits || 0;
                  const totalViolations = d.violations?.totalViolationsLast5Years || 0;
                  const openViolations = d.violations?.openViolations || 0;
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Permits (5 yr):</span><span className="font-medium">{totalPermits}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Violations (5 yr):</span>
                        <span className={`font-medium ${totalViolations > 0 ? 'text-muted-foreground' : ''}`}>{totalViolations}</span>
                      </div>
                      {openViolations > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Open:</span>
                          <span className="font-bold text-muted-foreground">{openViolations}</span>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground">No permit data</p>
                )}
              </div>
            )}

            {visibleSections.has('vehicleOwnership') && isAutoService && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Car className="w-3 h-3" />
                  Vehicle Ownership
                </h4>
                {isLoadingVehicle ? <Skeleton className="h-10 w-full" /> : vehicleData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {vehicleData.totalHouseholds && <div className="flex justify-between"><span className="text-muted-foreground">Households:</span><span className="font-medium">{vehicleData.totalHouseholds.toLocaleString()}</span></div>}
                    {vehicleData.avgVehiclesPerHousehold && <div className="flex justify-between"><span className="text-muted-foreground">Avg Vehicles/HH:</span><span className="font-medium">{vehicleData.avgVehiclesPerHousehold.toFixed(2)}</span></div>}
                    {vehicleData.pctNoVehicle !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">No Vehicle:</span><span className="font-medium">{vehicleData.pctNoVehicle}%</span></div>}
                    {vehicleData.autoDependencyLevel && <div className="flex justify-between"><span className="text-muted-foreground">Auto Dependency:</span><span className={`font-medium ${vehicleData.autoDependencyLevel === 'high' ? 'text-foreground' : vehicleData.autoDependencyLevel === 'moderate' ? 'text-muted-foreground' : ''}`}>{vehicleData.autoDependencyLevel}</span></div>}
                    {vehicleData.comparedToCityAvg && <div className="flex justify-between"><span className="text-muted-foreground">vs City Avg:</span><span className="font-medium">{vehicleData.comparedToCityAvg}</span></div>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No vehicle data</p>
                )}
              </div>
            )}

            {visibleSections.has('seniorPopulation') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Senior Population
                </h4>
                {isLoadingSeniors ? <Skeleton className="h-10 w-full" /> : seniorsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {seniorsData.population65Plus !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Seniors (65+):</span><span className="font-medium">{seniorsData.population65Plus.toLocaleString()}</span></div>}
                    {seniorsData.pct65Plus !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Senior %:</span><span className="font-medium">{seniorsData.pct65Plus}%</span></div>}
                    {seniorsData.seniorsLivingAlone !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Living Alone:</span><span className="font-medium">{seniorsData.seniorsLivingAlone.toLocaleString()} ({seniorsData.pctSeniorsLivingAlone}%)</span></div>}
                    {seniorsData.seniorDemandLevel && <div className="flex justify-between"><span className="text-muted-foreground">Demand Level:</span><span className={`font-medium ${seniorsData.seniorDemandLevel === 'high' ? 'text-muted-foreground' : seniorsData.seniorDemandLevel === 'moderate' ? 'text-muted-foreground' : 'text-foreground'}`}>{seniorsData.seniorDemandLevel}</span></div>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No senior data</p>
                )}
              </div>
            )}

            {visibleSections.has('childcareEnhanced') && isDaycareOrSchool && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Childcare Demographics
                </h4>
                {isLoadingChildcareEnhanced ? <Skeleton className="h-10 w-full" /> : childcareEnhancedData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {childcareEnhancedData.children0to2 !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Children 0-2:</span><span className="font-medium">{childcareEnhancedData.children0to2.toLocaleString()} ({childcareEnhancedData.pct0to2}%)</span></div>
                    )}
                    {childcareEnhancedData.children3to4 !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Children 3-4:</span><span className="font-medium">{childcareEnhancedData.children3to4.toLocaleString()} ({childcareEnhancedData.pct3to4}%)</span></div>
                    )}
                    {childcareEnhancedData.parentsInLaborForcePct0to5 !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Parents in Labor Force (0-5):</span><span className="font-medium">{childcareEnhancedData.parentsInLaborForcePct0to5}%</span></div>
                    )}
                    {childcareEnhancedData.laborForceDelta !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Labor Force Delta:</span>
                        <span className={`font-medium ${childcareEnhancedData.laborForceDelta <= 5 ? 'text-foreground' : childcareEnhancedData.laborForceDelta <= 12 ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{childcareEnhancedData.laborForceDelta}%</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            )}

            {visibleSections.has('languagesSpoken') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Languages Spoken
                </h4>
                {isLoadingLanguage ? <Skeleton className="h-10 w-full" /> : languageData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {languageData.nonEnglishPct !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Non-English:</span><span className="font-medium">{languageData.nonEnglishPct}%</span></div>
                    )}
                    {languageData.topLanguages?.slice(0, 4).map((lang: any, i: number) => (
                      <div key={i} className="flex justify-between"><span className="text-muted-foreground truncate">{lang.language}</span><span className="font-medium shrink-0 ml-1">{lang.pct}%</span></div>
                    ))}
                    {languageData.linguisticDiversity && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Diversity:</span><span className={`font-medium ${languageData.linguisticDiversity === 'high' ? 'text-foreground' : ''}`}>{languageData.linguisticDiversity}</span></div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No language data</p>
                )}
              </div>
            )}

            {visibleSections.has('demographicTrends') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Demographic Trends
                </h4>
                {isLoadingDemographics ? <Skeleton className="h-10 w-full" /> : censusACSData?.zip?.metrics?.length ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {censusACSData.zip.metrics.slice(0, 5).map((metric, idx) => (
                      <div key={idx} className="flex justify-between gap-1">
                        <span className="text-muted-foreground truncate">{metric.label}:</span>
                        <span className="font-medium shrink-0">{metric.value ?? 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No demographic data</p>
                )}
              </div>
            )}

            {visibleSections.has('fairMarketRent') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  Fair Market Rent (HUD)
                </h4>
                {isLoadingFmr ? <Skeleton className="h-10 w-full" /> : fmrData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ZIP:</span>
                      <span className="font-medium">{fmrData.zipCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efficiency:</span>
                      <span className="font-medium">${fmrData.rents.efficiency.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">1 Bed:</span>
                      <span className="font-medium">${fmrData.rents.oneBed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">2 Bed:</span>
                      <span className="font-medium">${fmrData.rents.twoBed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">3 Bed:</span>
                      <span className="font-medium">${fmrData.rents.threeBed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">4 Bed:</span>
                      <span className="font-medium">${fmrData.rents.fourBed.toLocaleString()}</span>
                    </div>
                    {fmrData.ranking && (
                      <div className="flex justify-between pt-1 border-t border-emerald-200">
                        <span className="text-muted-foreground">Rank:</span>
                        <span className="font-medium">#{fmrData.ranking.rank} of {fmrData.ranking.total}</span>
                      </div>
                    )}
                    {fmrData.cityStats && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">City Median (2BR):</span>
                        <span className="font-medium">${fmrData.cityStats.median.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No FMR data</p>
                )}
              </div>
            )}

            {visibleSections.has('proximityInfo') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  Proximity Information
                </h4>
                {isLoadingProximity ? <Skeleton className="h-10 w-full" /> : (() => {
                  const pData = (proximityResponse as any)?.found ? (proximityResponse as any).data : null;
                  if (!pData) return <p className="text-xs text-muted-foreground">No proximity data</p>;
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                      {pData.park && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground truncate">{pData.park.name}</span><span className="font-medium shrink-0">{(pData.park.distanceFt / 5280).toFixed(2)} mi</span></div>
                      )}
                      {pData.schools && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground">Schools (0.5 mi)</span><span className="font-medium shrink-0">{pData.schools.countInHalfMile}</span></div>
                      )}
                      {pData.hospital && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground truncate">{pData.hospital.name}</span><span className="font-medium shrink-0">{(pData.hospital.distanceFt / 5280).toFixed(2)} mi</span></div>
                      )}
                      {pData.highway && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground truncate">{pData.highway.name}</span><span className="font-medium shrink-0">{(pData.highway.distanceFt / 5280).toFixed(2)} mi</span></div>
                      )}
                      {pData.foreclosures && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground">Foreclosures (0.5 mi, 5yr)</span><span className={`font-medium shrink-0 ${pData.foreclosures.countInHalfMilePast5Years > 20 ? 'text-muted-foreground' : pData.foreclosures.countInHalfMilePast5Years > 5 ? 'text-muted-foreground' : ''}`}>{pData.foreclosures.countInHalfMilePast5Years}</span></div>
                      )}
                      {pData.lakeMichigan && (
                        <div className="flex justify-between gap-1"><span className="text-muted-foreground">Lake Michigan</span><span className="font-medium shrink-0">{(pData.lakeMichigan.distanceFt / 5280).toFixed(2)} mi</span></div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {visibleSections.has('michelinRestaurants') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Michelin Restaurants
                </h4>
                {isLoadingMichelin ? <Skeleton className="h-10 w-full" /> : michelinData?.restaurants && michelinData.restaurants.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                    {michelinData.restaurants.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="text-muted-foreground truncate">{r.name}</span>
                        <span className="font-medium shrink-0">{r.distanceMiles?.toFixed(2)} mi</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-muted-foreground pt-1 border-t border-red-200">
                      <span>Total nearby:</span>
                      <span className="font-medium text-foreground">{michelinData.restaurants.length}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No Michelin restaurants nearby</p>
                )}
              </div>
            )}

            {visibleSections.has('murals') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Landmark className="w-3 h-3" />
                  Murals
                </h4>
                {isLoadingMurals ? <Skeleton className="h-10 w-full" /> : muralsData && (muralsData as any).murals?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nearby Murals:</span>
                      <span className="font-medium">{(muralsData as any).murals.length}</span>
                    </div>
                    {(muralsData as any).murals.slice(0, 3).map((m: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{m.artworkTitle || m.artist || 'Untitled'}</span>
                        <span className="shrink-0">{m.distanceMiles?.toFixed(2)} mi</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No murals nearby</p>
                )}
              </div>
            )}

            {visibleSections.has('designatedLandmarks') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Landmark className="w-3 h-3" />
                  Designated Landmarks
                </h4>
                {isLoadingDesignatedLandmarks ? <Skeleton className="h-10 w-full" /> : designatedLandmarksData && (designatedLandmarksData as any).landmarks?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nearby Landmarks:</span>
                      <span className="font-medium">{(designatedLandmarksData as any).landmarks.length}</span>
                    </div>
                    {(designatedLandmarksData as any).landmarks.slice(0, 3).map((l: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{l.landmark_name || l.address || 'Unknown'}</span>
                        <span className="shrink-0">{l.distanceMiles?.toFixed(2)} mi</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No designated landmarks nearby</p>
                )}
              </div>
            )}

            {visibleSections.has('vacantBuildings') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Vacant & Abandoned Buildings
                </h4>
                {isLoadingVacantBuildings ? <Skeleton className="h-10 w-full" /> : vacantBuildingsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Violations:</span>
                      <span className="font-medium">{(vacantBuildingsData as any).totalViolations || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Addresses (¼ mi):</span>
                      <span className="font-medium">{(vacantBuildingsData as any).uniqueAddressesQuarterMile || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Addresses (½ mi):</span>
                      <span className="font-medium">{(vacantBuildingsData as any).uniqueAddressesHalfMile || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No vacant building data</p>
                )}
              </div>
            )}

            {visibleSections.has('developmentPotential') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Ruler className="w-3 h-3" />
                  Development Potential
                </h4>
                {(() => {
                  const bSqFt = runData?.manualBuildingSqFt || propertyTaxData?.buildingSquareFeet || pinLookupData?.commercialData?.bldgSf || 0;
                  const lSqFt = runData?.manualLandSqFt || propertyTaxData?.landSquareFeet || pinLookupData?.commercialData?.landSf || 0;
                  const maxFAR = zoningInfo?.maxFAR || null;
                  const currentFAR = (bSqFt && lSqFt) ? bSqFt / lSqFt : null;
                  const farUtilization = (currentFAR && maxFAR) ? (currentFAR / maxFAR) * 100 : null;
                  const remainingFAR = (maxFAR && currentFAR) ? maxFAR - currentFAR : null;
                  const additionalSqFt = (remainingFAR && lSqFt && remainingFAR > 0) ? Math.floor(remainingFAR * lSqFt) : 0;
                  const farStatus = farUtilization !== null
                    ? farUtilization > 105 ? 'Over-Built' : farUtilization >= 90 ? 'Maxed Out' : 'Under-Built'
                    : null;
                  
                  if (!currentFAR && !maxFAR) return <p className="text-xs text-muted-foreground">No FAR data available</p>;
                  
                  return (
                    <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                      {farStatus && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span className={`font-medium ${farStatus === 'Under-Built' ? 'text-foreground' : farStatus === 'Over-Built' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{farStatus}</span>
                        </div>
                      )}
                      {currentFAR !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current FAR:</span>
                          <span className="font-medium">{currentFAR.toFixed(2)}</span>
                        </div>
                      )}
                      {maxFAR !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max FAR:</span>
                          <span className="font-medium">{maxFAR}</span>
                        </div>
                      )}
                      {farUtilization !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Utilization:</span>
                          <span className="font-medium">{farUtilization.toFixed(0)}%</span>
                        </div>
                      )}
                      {additionalSqFt > 0 && (
                        <div className="flex justify-between pt-1 border-t border-[#eae8e2]">
                          <span className="text-muted-foreground">Additional Sq Ft:</span>
                          <span className="font-medium text-foreground">+{additionalSqFt.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {visibleSections.has('neighborhoodNews') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Neighborhood News
                </h4>
                {isLoadingNeighborhoodNews ? <Skeleton className="h-10 w-full" /> : neighborhoodNewsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Articles (120 days):</span>
                      <span className="font-medium">{neighborhoodNewsData.article_count || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Momentum:</span>
                      <span className="font-medium">{neighborhoodNewsData.momentum_label || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Score:</span>
                      <span className="font-medium">{neighborhoodNewsData.momentum_score || 0}/100</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No neighborhood news data</p>
                )}
              </div>
            )}

            {visibleSections.has('corridorNews') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  Corridor Intelligence
                </h4>
                {isLoadingCorridorNews ? <Skeleton className="h-10 w-full" /> : corridorNewsData?.corridors?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nearby Corridors:</span>
                      <span className="font-medium">{corridorNewsData.corridors.length}</span>
                    </div>
                    {corridorNewsData.corridors.slice(0, 3).map((c: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{c.corridorName || c.name}</span>
                        <span className="shrink-0">{c.articleCount || c.article_count || 0} articles</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No corridor data</p>
                )}
              </div>
            )}

            {visibleSections.has('nearbyBusinessLicenses') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  New Business Licenses
                </h4>
                {isLoadingBusinessLicenses ? <Skeleton className="h-10 w-full" /> : nearbyBusinessLicensesData?.licenses?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Businesses:</span>
                      <span className="font-medium">{nearbyBusinessLicensesData.totalCount}</span>
                    </div>
                    {groupLicenseEstablishments(nearbyBusinessLicensesData.licenses).slice(0, 3).map((l, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{titleCaseBusiness(l.name) || 'Business'}</span>
                        <span className="shrink-0">{l.distanceMiles?.toFixed(2)} mi</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No recent business licenses nearby</p>
                )}
              </div>
            )}

            {visibleSections.has('worship') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Landmark className="w-3 h-3" />
                  Places of Worship
                </h4>
                {isLoadingWorship ? <Skeleton className="h-10 w-full" /> : worshipData && (worshipData as any).totalCount > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Within 1 mile:</span>
                      <span className="font-medium">{(worshipData as any).totalCount}</span>
                    </div>
                    {(worshipData as any).byType?.slice(0, 3).map((t: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{t.type || 'Religious org.'}</span>
                        <span className="shrink-0">{t.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No places of worship nearby</p>
                )}
              </div>
            )}

            {visibleSections.has('nearbySchools') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Nearby CPS Schools
                </h4>
                {isLoadingNearbySchools ? <Skeleton className="h-10 w-full" /> : nearbySchoolsData && (nearbySchoolsData as any).total > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total schools (1.5mi):</span>
                      <span className="font-medium">{(nearbySchoolsData as any).total}</span>
                    </div>
                    {(nearbySchoolsData as any).elementary?.length > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Elementary:</span>
                        <span>{(nearbySchoolsData as any).elementary.length}</span>
                      </div>
                    )}
                    {(nearbySchoolsData as any).high?.length > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>High Schools:</span>
                        <span>{(nearbySchoolsData as any).high.length}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No CPS schools within 1.5 miles</p>
                )}
              </div>
            )}

            {visibleSections.has('upcomingDevelopments') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <HardHat className="w-3 h-3" />
                  Upcoming Real Estate Developments
                </h4>
                {isLoadingUpcomingDevs ? <Skeleton className="h-10 w-full" /> : upcomingDevsData && (upcomingDevsData as any).developments?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Planned projects:</span>
                      <span className="font-medium">{(upcomingDevsData as any).developments.length}</span>
                    </div>
                    {(upcomingDevsData as any).developments.slice(0, 3).map((d: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{d.projectName || d.address || 'Development'}</span>
                        <span className="shrink-0 capitalize">{d.status || ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No upcoming developments found</p>
                )}
              </div>
            )}

            {visibleSections.has('mortgageMarket') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Local Mortgage Market
                </h4>
                {isLoadingHmdaStats ? <Skeleton className="h-10 w-full" /> : hmdaStatsData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {hmdaStatsData.totalApplications != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total applications:</span>
                        <span className="font-medium">{hmdaStatsData.totalApplications?.toLocaleString()}</span>
                      </div>
                    )}
                    {hmdaStatsData.approvalRate != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Approval rate:</span>
                        <span className="font-medium">{hmdaStatsData.approvalRate?.toFixed(1)}%</span>
                      </div>
                    )}
                    {hmdaStatsData.medianLoanAmount != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median loan:</span>
                        <span className="font-medium">${(hmdaStatsData.medianLoanAmount / 1000).toFixed(0)}k</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No HMDA data available</p>
                )}
              </div>
            )}

            {visibleSections.has('sbaLoans') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  SBA Commercial Loans
                </h4>
                {isLoadingSbaLoans ? <Skeleton className="h-10 w-full" /> : sbaLoansData && (sbaLoansData as any).loans?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recent SBA loans:</span>
                      <span className="font-medium">{(sbaLoansData as any).loans.length}</span>
                    </div>
                    {(sbaLoansData as any).totalAmount != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total amount:</span>
                        <span className="font-medium">${((sbaLoansData as any).totalAmount / 1000000).toFixed(1)}M</span>
                      </div>
                    )}
                    {(sbaLoansData as any).loans.slice(0, 2).map((l: any, i: number) => (
                      <div key={i} className="flex justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{l.borrowerName || 'Business'}</span>
                        <span className="shrink-0">${(l.grossApproval / 1000).toFixed(0)}k</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No SBA loans found in this ZIP</p>
                )}
              </div>
            )}

            {visibleSections.has('recentlySoldComps') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  Recently Sold Comps
                </h4>
                {isLoadingComparableSales ? <Skeleton className="h-10 w-full" /> : comparableSalesData && (comparableSalesData as any).sales?.length > 0 ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comparable sales:</span>
                      <span className="font-medium">{(comparableSalesData as any).sales.length}</span>
                    </div>
                    {(comparableSalesData as any).medianPrice != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median price:</span>
                        <span className="font-medium">${((comparableSalesData as any).medianPrice / 1000).toFixed(0)}k</span>
                      </div>
                    )}
                    {(comparableSalesData as any).medianPricePerSqFt != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">$/sq ft:</span>
                        <span className="font-medium">${(comparableSalesData as any).medianPricePerSqFt?.toFixed(0)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No comparable sales data available</p>
                )}
              </div>
            )}

            {visibleSections.has('airbnbMarket') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  Short-Term Rental (Airbnb)
                </h4>
                {isLoadingAirbnbMarket ? <Skeleton className="h-10 w-full" /> : airbnbMarketData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {airbnbMarketData.totalListings != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total listings:</span>
                        <span className="font-medium">{airbnbMarketData.totalListings?.toLocaleString()}</span>
                      </div>
                    )}
                    {airbnbMarketData.medianNightlyRate != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median nightly rate:</span>
                        <span className="font-medium">${airbnbMarketData.medianNightlyRate}</span>
                      </div>
                    )}
                    {airbnbMarketData.medianOccupancyRate != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median occupancy:</span>
                        <span className="font-medium">{(airbnbMarketData.medianOccupancyRate * 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No Airbnb data for this area</p>
                )}
              </div>
            )}

            {visibleSections.has('rentcastMarket') && (
              <div className="space-y-2 p-3 rounded-xl bg-[#faf9f6] border border-[#eae8e2]">
                <h4 className="font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Long-Term Rental Market
                </h4>
                {isLoadingRentcastMarket ? <Skeleton className="h-10 w-full" /> : rentcastMarketData ? (
                  <div className="bg-white border border-[#eae8e2] rounded-lg p-2 text-xs space-y-1">
                    {rentcastMarketData.overall?.medianRent != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Median rent (ZIP):</span>
                        <span className="font-medium">${rentcastMarketData.overall.medianRent?.toLocaleString()}/mo</span>
                      </div>
                    )}
                    {rentcastMarketData.overall?.avgRent != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg rent:</span>
                        <span className="font-medium">${rentcastMarketData.overall.avgRent?.toLocaleString()}/mo</span>
                      </div>
                    )}
                    {rentcastMarketData.overall?.totalListings != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active listings:</span>
                        <span className="font-medium">{rentcastMarketData.overall.totalListings}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No rental market data for this ZIP</p>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}

export default function Compare() {
  const { isSubscriber, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { compareItems, removeFromCompare, clearCompare, saveToHistory, updateItemProjectType } = useCompare();
  const [historySaved, setHistorySaved] = useState(false);
  const compareKey = compareItems.map(i => i.runId).sort().join('-');

  const [visibleSections, setVisibleSections] = useState<Set<SectionId>>(() => {
    if (compareKey) {
      try {
        const saved = localStorage.getItem(`compare-sections-${compareKey}`);
        if (saved) {
          const arr = JSON.parse(saved) as SectionId[];
          if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
        }
      } catch {}
    }
    return getDefaultSections();
  });
  
  useEffect(() => {
    if (compareKey) {
      localStorage.setItem(`compare-sections-${compareKey}`, JSON.stringify(Array.from(visibleSections)));
    }
  }, [visibleSections, compareKey]);

  useEffect(() => {
    if (compareKey) {
      try {
        const saved = localStorage.getItem(`compare-sections-${compareKey}`);
        if (saved) {
          const arr = JSON.parse(saved) as SectionId[];
          if (Array.isArray(arr)) {
            setVisibleSections(new Set(arr));
            return;
          }
        }
      } catch {}
      setVisibleSections(getDefaultSections());
    }
  }, [compareKey]);

  useEffect(() => {
    if (compareItems.length >= 2 && !historySaved) {
      saveToHistory();
      setHistorySaved(true);
    }
  }, [compareKey, historySaved, saveToHistory, compareItems.length]);
  
  useEffect(() => {
    setHistorySaved(false);
  }, [compareKey]);
  
  const { data: businessUsesData } = useBusinessUses();
  
  const printAddresses = compareItems.map(item => formatAddress(item.address));
  const printProjectTypes = compareItems.map(item => item.lastProjectType || null);

  const toggleSection = (sectionId: SectionId) => {
    setVisibleSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleProjectTypeChangeWithSections = (runId: number, projectType: string | null) => {
    updateItemProjectType(runId, projectType);
    if (projectType) {
      const sectionsToAdd = ALL_SECTIONS
        .filter(s => s.requiresProjectType?.includes(projectType))
        .map(s => s.id);
      if (sectionsToAdd.length > 0) {
        setVisibleSections(prev => {
          const next = new Set(prev);
          sectionsToAdd.forEach(id => next.add(id));
          return next;
        });
      }
    }
  };

  const activeCount = visibleSections.size;
  const totalCount = ALL_SECTIONS.length;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!authLoading && !isSubscriber) return <SubscriberGate featureName="Compare Properties" />;

  return (
    <div className="flex h-screen bg-background print:block">
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

      <main className="flex-1 flex flex-col overflow-auto print:overflow-visible">
        <PrintHeader 
          title="Property Comparison Report"
          addresses={printAddresses}
          projectTypes={printProjectTypes}
        />

        <div className="md:hidden flex items-center justify-between p-4 border-b border-[#eae8e2] bg-white no-print">
          <button onClick={() => setSidebarOpen(true)} data-testid="button-mobile-menu-compare">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-jbmono text-xs font-bold uppercase tracking-widest">Compare</span>
          <div className="w-6" />
        </div>

        <div className="p-4 sm:p-6 border-b border-[#eae8e2] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              className="text-foreground hover:bg-[#faf9f6]"
              onClick={() => setLocation("/")}
              data-testid="button-back-from-compare"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-jbmono text-sm sm:text-base font-bold uppercase tracking-[0.12em] text-foreground flex items-center gap-2">
                Compare Properties
              </h1>
              <p className="text-sm text-[#8b8a84] font-body">
                Side-by-side analysis of up to 3 properties
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 border-[#ddd9d0] rounded-[10px] bg-white text-foreground hover:border-[#2b3a9e] hover:text-[#2b3a9e] hover:bg-white" data-testid="button-sections-dropdown">
                  <Settings2 className="w-4 h-4" />
                  Sections ({activeCount}/{totalCount})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                {(() => {
                  const groups = Array.from(new Set(ALL_SECTIONS.map(s => s.group)));
                  const getShortLabel = (pt: string) => {
                    if (pt === 'Day Care Center') return 'Daycare';
                    if (pt === 'Coffee Shop / Cafe') return 'Coffee';
                    if (pt === 'Cannabis Dispensary') return 'Cannabis';
                    if (pt === 'EV Charging Station') return 'EV';
                    if (pt === 'Bar / Tavern') return 'Bar';
                    if (pt === 'Auto Service') return 'Auto';
                    return pt;
                  };
                  return groups.map((groupName, gi) => (
                    <div key={groupName}>
                      <DropdownMenuLabel>{groupName}</DropdownMenuLabel>
                      {ALL_SECTIONS.filter(s => s.group === groupName).map(section => (
                        <DropdownMenuCheckboxItem
                          key={section.id}
                          checked={visibleSections.has(section.id)}
                          onCheckedChange={() => toggleSection(section.id)}
                          onSelect={(e) => e.preventDefault()}
                          data-testid={`checkbox-section-${section.id}`}
                        >
                          <span className="flex items-center gap-2">
                            {section.label}
                            {section.requiresProjectType && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {getShortLabel(section.requiresProjectType[0])}
                              </Badge>
                            )}
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                      {gi < groups.length - 1 && <DropdownMenuSeparator />}
                    </div>
                  ));
                })()}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => setVisibleSections(new Set(ALL_SECTIONS.map(s => s.id)))}
                    data-testid="button-show-all-sections"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    All
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => setVisibleSections(getDefaultSections())}
                    data-testid="button-reset-sections"
                  >
                    Reset
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => setVisibleSections(new Set())}
                    data-testid="button-hide-all-sections"
                  >
                    <EyeOff className="w-3 h-3 mr-1" />
                    None
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            {compareItems.length >= 2 && (
              <Button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-[#2b3a9e] hover:bg-[#3446bd] text-white rounded-[10px] border-0"
                data-testid="button-print-compare"
              >
                <Printer className="w-4 h-4" />
                Print / Save PDF
              </Button>
            )}
            {compareItems.length > 0 && (
              <Button 
                variant="outline" 
                onClick={clearCompare}
                className="border-[#ddd9d0] rounded-[10px] bg-white text-foreground hover:border-[#2b3a9e] hover:text-[#2b3a9e] hover:bg-white"
                data-testid="button-clear-compare"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          {compareItems.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <Scale className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold text-muted-foreground mb-2">
                No Properties to Compare
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6 flex flex-wrap items-center justify-center gap-1">
                Add properties from your run history by clicking the compare icon <Scale className="w-3.5 h-3.5 inline-block" />. You can compare up to 3 properties side by side.
              </p>
              <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-to-search">
                ← Back
              </Button>
            </motion.div>
          ) : (
            <div className={`grid gap-4 sm:gap-6 print-compare-grid ${
              compareItems.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' :
              compareItems.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {compareItems.map((item) => (
                <PropertyColumn
                  key={item.runId}
                  runId={item.runId}
                  address={item.address}
                  label={item.label}
                  initialProjectType={item.lastProjectType}
                  onRemove={() => removeFromCompare(item.runId)}
                  onProjectTypeChange={(pt) => handleProjectTypeChangeWithSections(item.runId, pt)}
                  businessUsesData={businessUsesData || null}
                  visibleSections={visibleSections}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {compareItems.length > 0 && (
        <ReportChat
          runIds={compareItems.map(i => i.runId)}
          address={compareItems.map(i => i.address.split(',')[0]).join(' vs ')}
          projectType={compareItems[0]?.lastProjectType}
        />
      )}
    </div>
  );
}
