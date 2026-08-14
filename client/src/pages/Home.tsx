import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useGeocodeLookup, useCreateRun, useGeocodeAutocomplete, RunCreateError, OutsideChicagoError } from "@/hooks/use-runs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, ArrowRight, Loader2, Building2, Info, Globe, Map, Link2, ExternalLink, CheckCircle2, X, Scale, FileText, BarChart3, TrendingUp, Users, Landmark, Star, Home as HomeIcon, Sparkles, Lock } from "lucide-react";


import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { LandingHeader } from "@/components/LandingHeader";
import { Logo } from "@/components/Logo";
import { CloserSearchBar } from "@/components/CloserSearchBar";

interface AreaSuggestion {
  type: 'zip' | 'community';
  value: string;
  label: string;
}

function useAreaAutocomplete(query: string) {
  return useQuery<AreaSuggestion[]>({
    queryKey: ['/api/area-autocomplete', query],
    queryFn: async () => {
      if (!query || query.length < 1) return [];
      const res = await fetch(`/api/area-autocomplete?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: query.length >= 1,
    staleTime: 30000,
  });
}

function isUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const SUPPORTED_LISTING_DOMAINS: Record<string, string> = {
  'loopnet.com': 'LoopNet',
  'redfin.com': 'Redfin',
  'zillow.com': 'Zillow',
  'crexi.com': 'Crexi',
  'realtor.com': 'Realtor.com',
  'coldwellbanker.com': 'Coldwell Banker',
  'century21.com': 'Century 21',
  'kw.com': 'Keller Williams',
  'compass.com': 'Compass',
  'trulia.com': 'Trulia'
};

function isListingUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    const hostname = url.hostname.toLowerCase();
    const domains = Object.keys(SUPPORTED_LISTING_DOMAINS);
    return domains.some(domain => 
      hostname === domain || 
      hostname === `www.${domain}` || 
      hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function getListingSource(url: string): string | null {
  try {
    const hostname = new URL(url.trim()).hostname.toLowerCase();
    for (const [domain, name] of Object.entries(SUPPORTED_LISTING_DOMAINS)) {
      if (hostname === domain || 
          hostname === `www.${domain}` || 
          hostname.endsWith(`.${domain}`)) {
        return name;
      }
    }
  } catch {}
  return null;
}

const REPORT_FEATURES = [
  {
    icon: Scale,
    title: "Zoning & Compatibility",
    items: [
      { bold: "Zoning Compatibility", rest: "instant check for your intended use" },
      { bold: "Special Use Permits", rest: "approval requirements & process" },
      { bold: "Use-By-Right vs. Special Permit", rest: "side-by-side analysis" },
    ],
  },
  {
    icon: FileText,
    title: "Legal & Financial Intelligence",
    items: [
      { bold: "Lien Search", rest: "complete property & owner name search" },
      { bold: "Foreclosure History", rest: "full record from circuit court" },
      { bold: "Tax Delinquency", rest: "records & up-to-date billing" },
    ],
  },
  {
    icon: Building2,
    title: "Development Analysis",
    items: [
      { bold: "Permits & Construction History", rest: "every permit & build-out on the property" },
      { bold: "Building Violations", rest: "& code enforcement history" },
      { bold: "FAR Analysis", rest: "how much square footage can still be added" },
    ],
  },
  {
    icon: TrendingUp,
    title: "Market Intelligence",
    items: [
      { bold: "Crime Statistics", rest: "incident counts at 250 ft, 500 ft, and 1 mile" },
      { bold: "New Construction", rest: "activity within 1 mile" },
      { bold: "Business Licenses", rest: "new licenses issued nearby" },
      { bold: "Corridor Analysis", rest: "development activity on nearby corridors" },
      { bold: "Nearby Amenities", rest: "restaurants, retail, and schools" },
    ],
  },
  {
    icon: Users,
    title: "Professional Network",
    items: [
      { bold: "Architects", rest: "who've worked in your area" },
      { bold: "Residential & Commercial Lenders", rest: "with area experience" },
      { bold: "Tax Attorneys", rest: "for property tax appeals" },
      { bold: "Zoning Attorneys", rest: "for special use permits" },
    ],
  },
  {
    icon: Landmark,
    title: "Location-Based Incentives",
    items: [
      { bold: "TOD Eligibility", rest: "Transit-Oriented Development grants" },
      { bold: "SBIF & NMTC", rest: "grant eligibility & tax credit status" },
      { bold: "Opportunity Zone", rest: "federal tax deferral designation" },
      { bold: "Historic & LMI", rest: "district tax credits & area benefits" },
    ],
  },
  {
    icon: BarChart3,
    title: "Comparable Sales Analysis",
    items: [
      { bold: "Recent Sales", rest: "in your neighborhood (last 18 months)" },
      { bold: "Price Per Sq Ft", rest: "trends for your property class" },
      { bold: "Property Class Match", rest: "apples-to-apples comparisons" },
    ],
  },
  {
    icon: HomeIcon,
    title: "Rental Income Analysis",
    items: [
      { bold: "Airbnb", rest: "short-term rental rates & occupancy estimates" },
      { bold: "HUD Fair Market Rent", rest: "worst-case rental income floor" },
      { bold: "Live Rental Listings", rest: "current listings near the property" },
      { bold: "Underwriting Support", rest: "for purchase decisions & fallback planning" },
    ],
  },
  {
    icon: Sparkles,
    title: "AI Executive Summary",
    items: [
      { bold: "1-Page Summary", rest: "20+ pages of data synthesized" },
      { bold: "Risk Assessment", rest: "plain-language acquisition analysis" },
      { bold: "Investor-Ready", rest: "drop into business plans, pitch decks & OMs" },
      { bold: "15+ Data Sources", rest: "written for decision-makers" },
    ],
  },
];

const FEATURE_ACCENTS = [
  { icon: "bg-[#2b3a9e] text-white", dot: "bg-[#2b3a9e]" },
  { icon: "bg-[#d13b26] text-white", dot: "bg-[#d13b26]" },
  { icon: "bg-[#f3b31f] text-[#241a02]", dot: "bg-[#f3b31f]" },
  { icon: "bg-[#2f7d3f] text-white", dot: "bg-[#2f7d3f]" },
];

const USE_CASES: {
  key: string;
  iconBg: string;
  dotBg: string;
  icon: string;
  who: string;
  headline: string;
  lede: JSX.Element;
  bullets: JSX.Element[];
  highlighted?: boolean;
  pill?: string;
}[] = [
  {
    key: "operators",
    iconBg: "bg-[#2b3a9e]",
    dotBg: "bg-[#2b3a9e]",
    icon: "◱",
    who: "For operators & tenants",
    headline: "Can my business open here?",
    lede: <>Before you sign a lease, know if your use is <b className="font-semibold text-[#141414]">allowed by right</b>, whether the demand is there, and what money it unlocks.</>,
    bullets: [
      <>Zoning &amp; special-use check for <b className="font-semibold text-[#141414]">your</b> use</>,
      <>Use-specific demand — e.g. childcare deserts</>,
      <>Nearby competitors &amp; use-based grants</>,
    ],
  },
  {
    key: "investors",
    iconBg: "bg-[#2f7d3f]",
    dotBg: "bg-[#2f7d3f]",
    icon: "◈",
    who: "For investors",
    headline: "Is this actually a good deal?",
    lede: <>Underwrite in minutes — and catch the risks a listing quietly leaves out.</>,
    bullets: [
      <>ROI &amp; cap rate you can adjust live</>,
      <>Rent comps vs. HUD fair-market rent</>,
      <>Liens, foreclosure &amp; incentive eligibility</>,
    ],
  },
  {
    key: "developers",
    iconBg: "bg-[#e0a615]",
    dotBg: "bg-[#e0a615]",
    icon: "▲",
    who: "For developers",
    headline: "How much can I build?",
    lede: <>See the buildable upside on the lot before you make an offer.</>,
    bullets: [
      <>FAR analysis &amp; buildable square footage</>,
      <>Unit potential &amp; ADU eligibility</>,
      <>Corridor development activity nearby</>,
    ],
  },
  {
    key: "homebuyers",
    iconBg: "bg-[#d13b26]",
    dotBg: "bg-[#d13b26]",
    icon: "🔍",
    who: "For homebuyers",
    headline: "What am I really buying?",
    lede: <>Your inspection checks the house. <b className="font-semibold text-[#141414]">We check the paperwork</b> — run us alongside it.</>,
    bullets: [
      <>Liens, foreclosure filings &amp; title flags</>,
      <>Code violations &amp; permit history</>,
      <>Tax delinquency &amp; the true tax trajectory</>,
    ],
    highlighted: true,
    pill: "The inspection complement",
  },
  {
    key: "everyone",
    iconBg: "bg-[#0e8fa6]",
    dotBg: "bg-[#0e8fa6]",
    icon: "✦",
    who: "For everyone",
    headline: "Who do I even call?",
    lede: <>Not just what's wrong — the right local pros to fix it.</>,
    bullets: [
      <>Zoning &amp; tax attorneys with local wins</>,
      <>Architects &amp; lenders who work the area</>,
      <>Matched to your property &amp; its issues</>,
    ],
  },
  {
    key: "scouts",
    iconBg: "bg-[#e07a2e]",
    dotBg: "bg-[#e07a2e]",
    icon: "➤",
    who: "For scouts & agents",
    headline: "What's happening in this market?",
    lede: <>Discover the market, not just the property.</>,
    bullets: [
      <>Who's buying &amp; at what price</>,
      <>New construction &amp; heating-up corridors</>,
      <>Rental &amp; short-term-rental demand</>,
    ],
  },
];

type CellValue = true | false | 'partial';

const COMPARISON_ROWS: {
  feature: string;
  kyp: CellValue;
  zillow: CellValue;
  loopnet: CellValue;
  cityscape: CellValue;
  ownerly: CellValue;
}[] = [
  { feature: "Assessor-sourced building data (sq ft, year built, class)", kyp: true,    zillow: true,      loopnet: true,      cityscape: true,      ownerly: true      },
  { feature: "Current tax bill — assessed value, exemptions & PIN",        kyp: true,    zillow: 'partial', loopnet: 'partial', cityscape: 'partial', ownerly: 'partial' },
  { feature: "Tax appeal history — prior filings, outcomes & attorneys",   kyp: true,    zillow: false,     loopnet: false,     cityscape: false,     ownerly: false     },
  { feature: "Zoning code & project compatibility check",                  kyp: true,    zillow: 'partial', loopnet: 'partial', cityscape: true,      ownerly: false     },
  { feature: "TIF, TOD, SBIF & NMTC incentive eligibility",               kyp: true,    zillow: false,     loopnet: false,     cityscape: true,      ownerly: false     },
  { feature: "Open liens, title flags & building violations",              kyp: true,    zillow: false,     loopnet: false,     cityscape: 'partial', ownerly: false     },
  { feature: "Local mortgage market — HMDA lenders, rates & denial data",  kyp: true,    zillow: false,     loopnet: false,     cityscape: false,     ownerly: false     },
  { feature: "Development potential — FAR & buildable square footage",     kyp: true,    zillow: false,     loopnet: false,     cityscape: 'partial', ownerly: false     },
  { feature: "Real-time residential rental comps & active listings",       kyp: true,    zillow: 'partial', loopnet: false,     cityscape: false,     ownerly: false     },
  { feature: "Real-time commercial lease comps & active listings",         kyp: true,    zillow: false,     loopnet: 'partial', cityscape: false,     ownerly: false     },
  { feature: "Comparable sales with price-per-sqft analysis",              kyp: true,    zillow: 'partial', loopnet: 'partial', cityscape: false,     ownerly: 'partial' },
  { feature: "Professional referrals — architects, lenders, attorneys",    kyp: true,    zillow: false,     loopnet: false,     cityscape: false,     ownerly: false     },
  { feature: "AI executive summary ready for pitch decks & OMs",           kyp: true,    zillow: false,     loopnet: false,     cityscape: false,     ownerly: false     },
];

function CompCell({ value, invert = false }: { value: CellValue; invert?: boolean }) {
  if (value === true) {
    return <CheckCircle2 className={`w-5 h-5 ${invert ? 'text-white' : 'text-[#141414]'}`} />;
  }
  if (value === 'partial') {
    return (
      <span className={`font-jbmono text-[9.5px] font-bold uppercase tracking-[0.05em] ${invert ? 'text-white/70' : 'text-[#8b8a84]'}`}>
        Partial
      </span>
    );
  }
  return <X className={`w-4 h-4 ${invert ? 'text-white/40' : 'text-[#d4d1c8]'}`} />;
}


export default function Home() {
  const [address, setAddress] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);
  const [extractedAddress, setExtractedAddress] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [showOutsideChicago, setShowOutsideChicago] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingRunAddress, setPendingRunAddress] = useState<string | null>(null);
  const [paywallEmail, setPaywallEmail] = useState("");
  const [paywallPassword, setPaywallPassword] = useState("");
  const [paywallSigningIn, setPaywallSigningIn] = useState(false);
  const { user, login, isLoading: isAuthLoading } = useAuth();

  const redirectToMostRecentRun = async () => {
    try {
      const res = await fetch('/api/runs', { credentials: 'include' });
      if (!res.ok) return;
      const runs = await res.json();
      if (!Array.isArray(runs) || runs.length === 0) return;
      // Account-level recency: always open the newest search on the account,
      // regardless of which device it was made from (no device-local override).
      const sorted = runs.slice().sort((a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setLocation(`/run/${sorted[0].id}`);
    } catch {
    }
  };

  const [_, setLocation] = useLocation();
  const suggestionsRef = useRef<HTMLDivElement>(null);
  // Guards against double-firing when both mousedown and click handlers run.
  const suggestionPickedRef = useRef(false);
  const pickSuggestion = (addr: string) => {
    if (suggestionPickedRef.current) return;
    suggestionPickedRef.current = true;
    setTimeout(() => { suggestionPickedRef.current = false; }, 800);
    setAddress(addr);
    handleSearch(addr);
  };
  const areaSuggestionsRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  
  const inputIsUrl = isUrl(address);
  const inputIsSupportedUrl = isListingUrl(address);
  const listingSource = inputIsSupportedUrl ? getListingSource(address) : null;
  
  const { data: suggestions, isLoading: isLoadingSuggestions } = useGeocodeAutocomplete(
    inputIsUrl ? '' : address
  );
  const { data: areaSuggestions, isLoading: isLoadingAreaSuggestions } = useAreaAutocomplete(areaQuery);
  const geocode = useGeocodeLookup();
  const createRun = useCreateRun();
  
  interface ExtractedPropertyDetails {
    buildingSqFt?: number;
    landSqFt?: number;
    stories?: number;
    yearBuilt?: number;
    propertyType?: string;
  }
  
  interface ExtractAddressResponse {
    address: string;
    source: string;
    extractedFromUrl?: boolean;
    propertyDetails?: ExtractedPropertyDetails;
  }
  
  const extractAddress = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/extract-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to extract address');
      }
      return data as ExtractAddressResponse;
    },
    onSuccess: (data) => {
      setExtractedAddress(data.address);
      setExtractError(null);
    },
    onError: (error: Error) => {
      setExtractError(error.message || 'Failed to extract address');
      setExtractedAddress(null);
    }
  });

  // Auto-redirect any signed-in user to their last run when they land on /.
  // Skipped when an address is waiting to become a new run (carried over from
  // the preview page or a paywall sign-in) — otherwise this redirect races the
  // run creation and strands the user on an old report.
  useEffect(() => {
    if (!isAuthLoading && user && !pendingRunAddress && !sessionStorage.getItem('pendingAddress')) {
      redirectToMostRecentRun();
    }
  }, [isAuthLoading, user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
      if (areaSuggestionsRef.current && !areaSuggestionsRef.current.contains(event.target as Node)) {
        setShowAreaSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePaywallSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paywallEmail || !paywallPassword) return;
    setPaywallSigningIn(true);
    try {
      await login(paywallEmail, paywallPassword);
      setPaywallEmail("");
      setPaywallPassword("");
      setShowPaywall(false);
      if (!pendingRunAddress) {
        await redirectToMostRecentRun();
      }
    } catch (err: any) {
      toast({ title: err.message || "Sign in failed.", variant: "destructive" });
    } finally {
      setPaywallSigningIn(false);
    }
  };

  useEffect(() => {
    if (user && user.plan !== 'free' && pendingRunAddress) {
      const addr = pendingRunAddress;
      setPendingRunAddress(null);
      setShowPaywall(false);
      proceedWithSearch(addr);
      return;
    }
    // Address carried over from the preview page (set before/after sign-in
    // there). Paid users get their run created immediately.
    if (user && user.plan !== 'free') {
      const stored = sessionStorage.getItem('pendingAddress');
      if (stored) {
        sessionStorage.removeItem('pendingAddress');
        proceedWithSearch(stored);
      }
    }
  }, [user]);

  const proceedWithSearch = async (searchInput: string) => {
    if (!searchInput.trim()) return;

    if (!isAuthLoading && (!user || user.plan === 'free')) {
      sessionStorage.setItem('pendingAddress', searchInput.trim());
      setLocation(`/preview?address=${encodeURIComponent(searchInput.trim())}`);
      return;
    }

    if (isAuthLoading) return;

    setShowSuggestions(false);
    setExtractError(null);
    
    if (isUrl(searchInput)) {
      if (isListingUrl(searchInput)) {
        try {
          const result = await extractAddress.mutateAsync(searchInput);
          const facts = await geocode.mutateAsync({ address: result.address });
          const unitMatch = result.address.match(/\s+(?:Unit|Apt|Ste|Suite|#)\b\s*(\S+)/i);
          const unitNum = unitMatch ? unitMatch[1].replace(/[,;]+$/, '').toUpperCase() : null;
          // Accept unit numbers that contain a digit (e.g. "1", "2A", "12C") OR are a single
          // letter (e.g. "A", "B" for condo units). Reject 2+ letter codes like "ED" which are
          // Census TIGER feature-class artifacts, not real unit designations.
          const isRealUnit = !!unitNum && (/\d/.test(unitNum) || /^[A-Z]$/.test(unitNum));
          const runAddress = isRealUnit
            ? facts.formattedAddress.replace(/,/, ` Unit ${unitNum},`)
            : facts.formattedAddress;
          const run = await createRun.mutateAsync({ 
            address: runAddress 
          });
          
          if (run.id) {
            try {
              const funnelRaw = sessionStorage.getItem('funnelAnswers');
              sessionStorage.removeItem('funnelAnswers');
              if (funnelRaw) {
                const fa = JSON.parse(funnelRaw);
                await fetch(`/api/runs/${run.id}/funnel-answers`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role: fa.role || null,
                    transactionType: fa.transactionType || null,
                    projectType: fa.projectType || null,
                    freeformDescription: fa.freeformDescription || null,
                    referralNeeds: Array.isArray(fa.referralNeeds) ? fa.referralNeeds : null,
                  }),
                });
              }
            } catch {}
            const propertyDetails = result.propertyDetails || {};
            const { buildingSqFt, landSqFt, stories } = propertyDetails;
            try {
              await fetch(`/api/runs/${run.id}/manual-property`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  manualBuildingSqFt: buildingSqFt || null,
                  manualLandSqFt: landSqFt || null,
                  manualStories: stories || null,
                  sourceListingUrl: searchInput
                }),
              });
            } catch (saveErr) {
              console.error('Failed to save source URL and property details:', saveErr);
            }
            
            if (result.extractedFromUrl && !buildingSqFt && !landSqFt) {
              sessionStorage.setItem('showManualEntryToast', 'true');
            }
          }
          
          setLocation(`/run/${run.id}`);
        } catch (err) {
          console.error(err);
          if (err instanceof OutsideChicagoError) {
            setShowOutsideChicago(true);
          } else if (err instanceof RunCreateError && err.status === 401) {
            toast({ title: "Sign in required", description: "Please sign in to run a report.", variant: "destructive" });
          } else if (err instanceof Error) {
            toast({ title: "Could not create report", description: err.message, variant: "destructive" });
          }
        }
      } else {
        setExtractError("Unsupported website. Supported sites: LoopNet, Redfin, Zillow, Crexi, Realtor.com, and major MLS platforms.");
      }
    } else {
      try {
        const facts = await geocode.mutateAsync({ address: searchInput });
        const unitMatch = searchInput.match(/\s+(?:Unit|Apt|Ste|Suite|#)\b\s*(\S+)/i);
        let runAddress = facts.formattedAddress;
        if (unitMatch) {
          const unitNum = unitMatch[1].replace(/[,;]+$/, '').toUpperCase();
          // Accept digits (e.g. "1", "2A") or single letter (e.g. "A" for condo).
          // Reject 2+ letter codes like "ED" — Census TIGER artifacts, not real units.
          if (/\d/.test(unitNum) || /^[A-Z]$/.test(unitNum)) {
            runAddress = facts.formattedAddress.replace(/,/, ` Unit ${unitNum},`);
          }
        }
        const run = await createRun.mutateAsync({ 
          address: runAddress 
        });
        try {
          const funnelRaw = sessionStorage.getItem('funnelAnswers');
          sessionStorage.removeItem('funnelAnswers');
          if (funnelRaw) {
            const fa = JSON.parse(funnelRaw);
            await fetch(`/api/runs/${run.id}/funnel-answers`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: fa.role || null,
                transactionType: fa.transactionType || null,
                projectType: fa.projectType || null,
                freeformDescription: fa.freeformDescription || null,
                referralNeeds: Array.isArray(fa.referralNeeds) ? fa.referralNeeds : null,
              }),
            });
          }
        } catch {}
        setLocation(`/run/${run.id}`);
      } catch (err) {
        console.error(err);
        if (err instanceof OutsideChicagoError) {
          setShowOutsideChicago(true);
        } else if (err instanceof RunCreateError && err.status === 401) {
          toast({ title: "Sign in required", description: "Please sign in to run a report.", variant: "destructive" });
        } else if (err instanceof Error) {
          toast({ title: "Could not create report", description: err.message, variant: "destructive" });
        }
      }
    }
  };

  const handleSearch = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    const searchInput = (typeof e === 'string' ? e : address).trim();
    if (!searchInput) return;

    // Paid users skip the preview/paywall funnel entirely — create the run
    // directly and go straight to the report.
    if (user && user.plan !== 'free') {
      await proceedWithSearch(searchInput);
      return;
    }

    // For direct address input (not a listing URL), validate Chicago first
    // before opening the funnel so non-Chicago addresses are rejected immediately.
    if (!isUrl(searchInput)) {
      try {
        await geocode.mutateAsync({ address: searchInput });
      } catch (err) {
        if (err instanceof OutsideChicagoError) {
          setShowOutsideChicago(true);
          return;
        }
        // Other errors (bad format, not found, etc.) — let proceedWithSearch handle them
      }
    }

    setLocation(`/preview?address=${encodeURIComponent(searchInput)}`);
  };

  const handleAreaSelect = (suggestion: AreaSuggestion) => {
    setShowAreaSuggestions(false);
    if (suggestion.type === 'zip') {
      setLocation(`/area/zip/${suggestion.value}`);
    } else {
      setLocation(`/area/community/${encodeURIComponent(suggestion.value)}`);
    }
  };

  const isPaid = !!(user && user.plan !== 'free');

  // Hero scroll animation: floating cards drift down, shrink, and fade as the user scrolls
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isPaid) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const hero = heroRef.current;
    if (!hero) return;
    const cards = Array.from(hero.querySelectorAll<HTMLElement>('.float-card'));
    if (cards.length === 0) return;
    let ticking = false;
    let rafId = 0;
    const apply = () => {
      const S = window.pageYOffset || document.documentElement.scrollTop || 0;
      const H = (hero ? hero.offsetHeight : window.innerHeight) * 0.9;
      const p = Math.min(1, Math.max(0, S / H));
      const sc = 1 - p * 0.10;
      const op = 1 - p * 0.95;
      for (const c of cards) {
        const rot = parseFloat(c.getAttribute('data-rot') || '0');
        const depth = parseFloat(c.getAttribute('data-depth') || '0.3');
        const ty = S * depth;
        c.style.transform = `translateY(${ty.toFixed(1)}px) rotate(${rot}deg) scale(${sc.toFixed(3)})`;
        c.style.opacity = (op > 0 ? op : 0).toFixed(3);
      }
      ticking = false;
    };
    cards.forEach((c) => {
      const rot = parseFloat(c.getAttribute('data-rot') || '0');
      c.style.transform = `rotate(${rot}deg)`;
    });
    const onScroll = () => { if (!ticking) { rafId = requestAnimationFrame(apply); ticking = true; } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', apply, { passive: true });
    apply();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', apply);
      cancelAnimationFrame(rafId);
    };
  }, [isPaid, isAuthLoading]);

  const searchSection = (
    <>
      <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white border [border-color:#ddd9d0] rounded-[14px] p-2 [box-shadow:0_6px_20px_rgba(20,20,20,.09),0_1px_3px_rgba(20,20,20,.05)]">
        <div className="relative flex-1">
          {inputIsUrl ? (
            <Link2 className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] ${inputIsSupportedUrl ? 'text-foreground' : 'text-[#8b8a84]'}`} />
          ) : (
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#8b8a84]" />
          )}
          <input
            ref={addressInputRef}
            placeholder="Enter a Chicago address or paste a listing URL…"
            autoComplete="off"
            name="kyp-address-query"
            className="w-full pl-10 pr-4 h-11 sm:h-12 text-[15px] bg-transparent outline-none placeholder:text-[#8b8a84] font-body text-[#141414]"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setExtractedAddress(null);
              setExtractError(null);
              if (e.target.value.length >= 3 && !isUrl(e.target.value)) {
                setShowSuggestions(true);
              } else {
                setShowSuggestions(false);
              }
            }}
            onFocus={() => {
              if (!inputIsUrl) setShowSuggestions(true);
            }}
            autoFocus
            data-testid="input-address"
          />
          {inputIsUrl && (
            inputIsSupportedUrl && listingSource ? (
              <Badge
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                {listingSource}
              </Badge>
            ) : (
              <Badge
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider"
              >
                <Info className="w-3 h-3 mr-1" />
                Unsupported
              </Badge>
            )
          )}
        </div>
        <Button
          type="submit"
          className="h-11 sm:h-12 px-5 sm:px-7 text-sm font-semibold font-body bg-[#2b3a9e] hover:bg-[#3446bd] text-white rounded-[10px] border-0 transition-colors"
          disabled={geocode.isPending || createRun.isPending || extractAddress.isPending}
          data-testid="button-analyze"
        >
          {extractAddress.isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="hidden sm:inline">Extracting</span>
            </>
          ) : (geocode.isPending || createRun.isPending) ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="hidden sm:inline">Analyzing</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Analyze</span>
              <ArrowRight className="sm:ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>

      <AnimatePresence>
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <motion.div
            ref={suggestionsRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-2 bg-white border [border-color:#ddd9d0] rounded-xl z-[9999] overflow-hidden [box-shadow:0_20px_46px_rgba(20,20,20,.14),0_6px_16px_rgba(20,20,20,.08)]"
          >
            <div className="max-h-[300px] overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="w-full text-left px-5 py-3.5 hover:bg-[#faf9f6] transition-colors flex items-center gap-3 border-b [border-color:#eae8e2] last:border-0 font-body"
                  type="button"
                  onMouseDown={(e) => {
                    // Select on mousedown (not click) so a mid-click dropdown
                    // re-render or blur can't swallow the selection.
                    e.preventDefault();
                    pickSuggestion(suggestion.address);
                  }}
                  onTouchStart={() => pickSuggestion(suggestion.address)}
                  onClick={() => pickSuggestion(suggestion.address)}
                  data-testid={`suggestion-${index}`}
                >
                  <MapPin className="h-4 w-4 text-[#8b8a84] shrink-0" />
                  <span className="text-sm text-[#141414]">{suggestion.address}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(extractError || extractedAddress || inputIsUrl) && (
        <div className="mt-3 text-xs text-muted-foreground font-body space-y-1">
          {extractError && (
            <div className="flex items-center gap-2 text-destructive" data-testid="text-extract-error">
              <Info className="w-3.5 h-3.5" />
              <span>{extractError}</span>
            </div>
          )}
          {extractedAddress && (
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Found: {extractedAddress}</span>
            </div>
          )}
          {inputIsUrl && !extractError && !extractedAddress && (
            inputIsSupportedUrl ? (
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5" />
                <span>Click Analyze to extract the address from this listing</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                <span>Supported: LoopNet, Redfin, Zillow, Crexi, Realtor.com, Compass, Trulia</span>
              </div>
            )
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {showOutsideChicago && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowOutsideChicago(false)}>
          <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowOutsideChicago(false)}
              className="absolute top-4 right-4 text-[#8b8a84] hover:text-foreground transition-colors"
              data-testid="button-close-outside-chicago"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-8">
              <div className="flex items-center gap-2 mb-5">
                <MapPin className="w-5 h-5 flex-shrink-0 text-[#2b3a9e]" />
                <span className="font-jbmono font-bold text-xs uppercase tracking-[0.12em] text-[#8b8a84]">Service Area</span>
              </div>
              <p className="font-jbmono font-bold text-lg uppercase mb-2">Chicago Only</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                We are currently only serving the City of Chicago and will be expanding soon.
              </p>
              <Button
                onClick={() => setShowOutsideChicago(false)}
                className="w-full bg-[#2b3a9e] text-white hover:bg-[#3446bd] rounded-[10px] font-jbmono font-bold text-xs uppercase tracking-[0.12em]"
                data-testid="button-outside-chicago-ok"
              >
                Got It
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPaywall && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] max-w-md w-full relative overflow-hidden">
            <button
              onClick={() => setShowPaywall(false)}
              className="absolute top-4 right-4 text-[#8b8a84] hover:text-foreground transition-colors"
              data-testid="button-close-paywall"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 border-b border-[#eae8e2]">
              <div className="flex items-center gap-2.5 mb-3">
                <Logo size={22} className="shrink-0" />
                <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84]">Access Required</p>
              </div>
              <h2 className="font-jbmono text-xl font-bold uppercase tracking-tight text-foreground mb-2">
                Run This Report
              </h2>
              {pendingRunAddress && (
                <p className="text-xs font-body text-gray-500 bg-[#faf9f6] border border-[#eae8e2] rounded-lg px-3 py-2 truncate">
                  {pendingRunAddress}
                </p>
              )}
            </div>

            <div className="p-6 border-b border-[#eae8e2] space-y-3">
              <button
                onClick={() => {
                  if (pendingRunAddress) sessionStorage.setItem('pendingAddress', pendingRunAddress);
                  setLocation('/checkout?type=report');
                }}
                className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors flex items-center justify-between px-4"
                data-testid="button-paywall-single"
              >
                <span>Run This Report</span>
                <span className="font-body text-sm normal-case tracking-normal font-normal text-white/70">$29 one-time</span>
              </button>
              <button
                onClick={() => {
                  if (pendingRunAddress) sessionStorage.setItem('pendingAddress', pendingRunAddress);
                  setLocation('/checkout?type=subscription');
                }}
                className="w-full border border-[#ddd9d0] text-foreground font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors flex items-center justify-between px-4"
                data-testid="button-paywall-subscribe"
              >
                <span>Subscribe — Unlimited Reports</span>
                <span className="font-body text-sm normal-case tracking-normal font-normal text-gray-500">$99/mo</span>
              </button>
            </div>

            <div className="p-6">
              <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84] mb-4">Already have an account?</p>
              <form onSubmit={handlePaywallSignIn} className="space-y-3">
                <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                  <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Email</label>
                  <input
                    type="email"
                    required
                    value={paywallEmail}
                    onChange={(e) => setPaywallEmail(e.target.value)}
                    className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                    placeholder="you@example.com"
                    autoComplete="email"
                    data-testid="input-paywall-email"
                  />
                </div>
                <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                  <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Password</label>
                  <input
                    type="password"
                    required
                    value={paywallPassword}
                    onChange={(e) => setPaywallPassword(e.target.value)}
                    className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    data-testid="input-paywall-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={paywallSigningIn}
                  className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-50"
                  data-testid="button-paywall-signin"
                >
                  {paywallSigningIn ? "Signing In..." : "Sign In →"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <LandingHeader />

      <main className="flex-1 flex flex-col relative overflow-auto">
        {!isPaid && <div className="hero-grid-bg" aria-hidden="true" />}

        {isPaid ? (
          <div className="flex flex-col items-center px-4 sm:px-8 z-30 relative pt-16 md:pt-24">
            <div className="w-full max-w-4xl">
              <div className="mb-8">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3 font-body">New Analysis</p>
                <h1 className="text-2xl sm:text-3xl font-serif text-foreground leading-tight">
                  Enter an address to analyze.
                </h1>
              </div>
              <div className="relative">{searchSection}</div>
            </div>
          </div>
        ) : (
          <section ref={heroRef} className="hero-stage z-10 w-full">
            <div className="float-card float-f1" data-rot="-4" data-depth="0.30" aria-hidden="true">
              <div className="lbl">Childcare demand · 60660</div>
              <div className="big">3.2</div>
              <div className="delta down">Childcare desert — 476 slots, 1,502 kids</div>
            </div>
            <div className="float-card float-f2 c-green" data-rot="3.5" data-depth="0.20" aria-hidden="true">
              <div className="ins"><span className="mk"></span><div><div className="tt">Retail-corridor incentives available</div><div className="sm">SBIF authorized · NMTC deep distress · Class 7 zone.</div></div></div>
            </div>
            <div className="float-card float-f3" data-rot="4" data-depth="0.42" aria-hidden="true">
              <div className="lbl">Languages spoken · 60660</div>
              <div className="big">37.5%</div>
              <div className="delta">non-English at home · Spanish 16% · Chinese 4%</div>
            </div>
            <div className="float-card float-f4 c-red" data-rot="-3.5" data-depth="0.26" aria-hidden="true">
              <div className="ins"><span className="mk"></span><div><div className="tt">Foreclosure action on record</div><div className="sm">1 active lis pendens — title needs review.</div></div></div>
            </div>
            <div className="float-card float-f5" data-rot="-5" data-depth="0.45" aria-hidden="true">
              <div className="lbl">Local lending · avg first-lien rate</div>
              <div className="big">6.41%</div>
              <div className="delta">Top lender: Guaranteed Rate · 128 loans</div>
            </div>
            <div className="float-card float-f6" data-rot="4.5" data-depth="0.34" aria-hidden="true">
              <div className="lbl">Tax appeal history</div>
              <div className="big">6</div>
              <div className="delta up">assessment reductions won since 2010</div>
            </div>

            <div className="relative z-[3] w-full text-center px-5">
              <div className="inline-flex items-center gap-[9px] font-jbmono text-[11px] font-bold tracking-[0.1em] uppercase text-[#565651] mb-[22px]">
                <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
                <span>Cook County · <span className="border [border-color:#ddd9d0] rounded-md px-[7px] py-[2px] text-[#141414] bg-white tabular-nums">1,412,336</span> parcels indexed</span>
              </div>
              <h1 className="font-serif font-normal text-[clamp(44px,7vw,88px)] leading-[0.98] tracking-[-0.01em] max-w-[15ch] mx-auto text-[#141414]">
                <span className="block">Know before you <em className="italic text-[#2b3a9e]">buy</em>,</span>
                <span className="block"><em className="italic text-[#d13b26]">sell</em>,</span>
                <span className="block">or <em className="italic text-[#2f7d3f]">lease</em>.</span>
              </h1>
              <p className="font-body text-[clamp(16px,1.7vw,19px)] text-[#565651] max-w-[54ch] mx-auto mt-4">
                Every county record, permit, lien, and incentive on any Chicago property — synthesized into one clear, decision-ready brief.
              </p>
              <div className="relative max-w-[600px] mx-auto mt-6 text-left">
                {searchSection}
              </div>
              <div className="font-jbmono text-[11.5px] text-[#8b8a84] mt-3.5 tracking-[0.02em]">
                <b className="text-[#565651]">15+ OFFICIAL SOURCES</b> · <b className="text-[#565651]">20+ PAGES</b> · ONE BRIEF · SECONDS
              </div>

              <div className="mt-10 sm:mt-12" data-testid="text-serving-chicago">
                <div className="font-serif font-normal text-[clamp(22px,2.6vw,30px)] leading-tight text-[#141414]">
                  Serving the <em className="italic text-[#2b3a9e]">Chicago</em> market
                </div>
                <div className="font-jbmono text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8b8a84] mt-1.5">
                  Other major markets coming soon
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="flex-1 flex flex-col items-center px-4 sm:px-8 z-10 relative">

          {/* Know before / description — only shown to guests and free users */}
          {(!user || user.plan === 'free') && (
            <div className="w-full max-w-4xl mt-10 mb-4">
              <div className="mt-4 text-center">
                <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84] mb-3 flex items-center justify-center gap-2"><span className="w-[8px] h-[8px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>See a Real Report</p>
                <h2 className="font-serif font-normal text-3xl sm:text-4xl text-[#141414] leading-tight">This is what a search <em className="italic text-[#2b3a9e]">returns</em></h2>
                <p className="text-[15px] text-[#565651] font-body mt-3 max-w-[52ch] mx-auto leading-relaxed">Not a list of links — a synthesized brief that tells you what the public record actually means for your decision.</p>
              </div>

              {/* Sample report preview — bordered frame */}
              <div className="mt-8 rounded-[20px] border border-[#ddd9d0] bg-[#fafaf8] p-3 shadow-[0_6px_20px_rgba(20,20,20,0.09),0_1px_3px_rgba(20,20,20,0.05)]" data-testid="section-report-preview">
                <div className="flex items-center gap-2 font-jbmono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#8b8a84] px-1.5 pt-1 pb-3">
                  <span className="w-2 h-2 rounded-full bg-[#2f7d3f] shadow-[0_0_0_3px_rgba(47,125,63,0.16)]" aria-hidden="true"></span>
                  Live report · 2418 N. Milwaukee Ave
                </div>
                <div className="bg-white border border-[#eae8e2] rounded-[14px] overflow-hidden">
                  {/* Report header */}
                  <div className="grid grid-cols-1 md:grid-cols-[1.55fr_1fr] bg-[#1e2a6e] text-white text-left">
                    <div className="px-7 py-6">
                      <p className="font-jbmono text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9ec7e6]">Property Insight Report</p>
                      <h3 className="font-serif font-normal text-3xl sm:text-4xl leading-[0.98] tracking-[-0.01em] mt-2.5 mb-3">2418–2430<br/>N. Milwaukee Ave</h3>
                      <p className="text-[12.5px] text-[#c2d6e6] leading-normal">Logan Square · Chicago, IL 60647<br/>4-parcel assemblage · 28,905 SF · Built 1908</p>
                    </div>
                    <div className="px-7 py-6 border-t md:border-t-0 md:border-l border-white/20">
                      <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.1em] text-[#f3b31f]">Our take</p>
                      <p className="font-serif text-[20px] leading-[1.1] tracking-[-0.02em] mt-1.5 mb-2">Real potential — and real baggage.</p>
                      <p className="text-[12.5px] text-[#cddbe8] leading-[1.55]">The location and zoning are genuinely strong. But the owner is in active foreclosure, and the building carries legal, physical, and tax constraints a listing won't mention. Go in with eyes open.</p>
                    </div>
                  </div>
                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 md:grid-cols-5 border-b border-[#eae8e2] bg-white text-left">
                    {([
                      { k: "Last sold", v: "$4.78M", n: "April 2025", color: "text-[#141414]", num: true, cls: "border-r border-[#eae8e2]" },
                      { k: "Prior sale", v: "$5.83M", n: "2018 — took a loss", color: "text-[#d13b26]", num: true, cls: "border-[#eae8e2] border-r-0 md:border-r" },
                      { k: "Zoning", v: "C1-3", n: "Neighborhood comm.", color: "text-[#141414]", num: false, cls: "border-r border-[#eae8e2]" },
                      { k: "Taxes", v: "$125K", n: "/yr — fully paid", color: "text-[#141414]", num: true, cls: "border-[#eae8e2] border-r-0 md:border-r" },
                      { k: "Landmark", v: "Orange", n: "Exterior reviewed", color: "text-[#c98a12]", num: false, cls: "border-r-0" },
                    ]).map((s) => (
                      <div key={s.k} className={`px-4 py-[15px] ${s.cls}`} data-testid={`stat-preview-${s.k.toLowerCase().replace(/\s+/g, '-')}`}>
                        <p className="font-jbmono text-[9px] font-bold uppercase tracking-[0.06em] text-[#8b8a84]">{s.k}</p>
                        <p className={`font-serif font-bold text-[22px] leading-none tracking-[-0.02em] mt-1.5 ${s.color} ${s.num ? 'tabular-nums' : ''}`}>{s.v}</p>
                        <p className="text-[10.5px] text-[#565651] mt-[5px]">{s.n}</p>
                      </div>
                    ))}
                  </div>
                  {/* Banner */}
                  <div className="bg-[#fafaf8] text-[#565651] px-5 py-3 font-jbmono text-[10.5px] font-bold uppercase tracking-[0.05em] flex flex-wrap justify-between items-center gap-x-3 gap-y-1 border-b border-[#eae8e2] text-left">
                    What the public record says
                    <span className="font-body font-normal normal-case tracking-normal text-xs text-[#8b8a84]">Independent of what you plan to do with it</span>
                  </div>
                  {/* Insight cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-5 text-left">
                    {([
                      { tone: "red", bg: "bg-[#fbecea]", border: "border-[#f1cec8]", accent: "border-l-[#d13b26]", mk: "bg-[#d13b26]", h: "The owner is in foreclosure — 8 months after buying.", p: "J2 Hollander LLC paid $4.78M in April 2025; a foreclosure was filed by December and a mechanics lien in May. A seller in active distress — title is clouded until it resolves." },
                      { tone: "green", bg: "bg-[#eef5ef]", border: "border-[#cfe3d3]", accent: "border-l-[#2f7d3f]", mk: "bg-[#2f7d3f]", h: "Retail on the ground floor, housing above — no special permits.", p: "C1-3 zoning permits ground-floor retail with housing above as-of-right. No hearings, zoning board, or alderman approval. Your cleanest path." },
                      { tone: "amber", bg: "bg-[#fbf2da]", border: "border-[#eeddac]", accent: "border-l-[#c98a12]", mk: "bg-[#c98a12]", h: "The tax bill is $125K a year — and probably going up.", p: "The assessor values the property well below the last sale price; a reassessment on sale is likely. Filing a tax appeal on day one isn't optional." },
                      { tone: "green2", bg: "bg-[#eef5ef]", border: "border-[#cfe3d3]", accent: "border-l-[#2f7d3f]", mk: "bg-[#2f7d3f]", h: "Neighborhood demand is genuinely strong — this isn't hype.", p: "Logan Square ranks among Chicago's top areas for real-estate activity. Two Blue Line stops within half a mile, ridership up 20%+ over three years." },
                    ]).map((c) => (
                      <div key={c.tone} className={`rounded-xl px-[15px] py-3.5 border border-l-4 ${c.bg} ${c.border} ${c.accent}`} data-testid={`card-insight-${c.tone}`}>
                        <div className="flex gap-2 items-start font-body font-bold text-sm text-[#141414] leading-[1.28]">
                          <span className={`w-3.5 h-3.5 rounded-[3px] flex-none mt-[3px] ${c.mk}`} aria-hidden="true"></span>
                          {c.h}
                        </div>
                        <p className="text-[12.5px] text-[#565651] mt-2 leading-normal">{c.p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-center mt-7">
                <a
                  href="/sample-report.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-[10px] bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] px-7 py-3.5 hover:bg-[#3446bd] transition-colors whitespace-nowrap"
                  data-testid="link-sample-report-home"
                >
                  → View Sample Report
                </a>
              </div>

              <div className="relative overflow-hidden rounded-[20px] bg-[#1e2a6e] text-white px-8 py-12 sm:px-12 sm:py-14 text-center mt-14">
                <span className="absolute w-[150px] h-[150px] rounded-[3px] bg-[#f3b31f] -top-10 -right-8" aria-hidden="true"></span>
                <span className="absolute w-24 h-24 rounded-[3px] bg-[#d13b26] -bottom-8 -left-6" aria-hidden="true"></span>
                <span className="absolute w-14 h-14 rounded-[3px] bg-[#2f7d3f] opacity-90 top-7 left-10" aria-hidden="true"></span>
                <h2 className="relative z-[1] font-serif font-normal text-[clamp(26px,3.6vw,40px)] leading-[1.06] tracking-[-0.005em]">
                  Critical property data exists.<br />It's just <em className="italic text-[#f3b31f]">scattered</em> — and hard to reach.
                </h2>
                <p className="relative z-[1] text-white/85 font-body text-[15.5px] max-w-[56ch] mx-auto mt-4 leading-relaxed">
                  County recorders, municipal permit databases, state education boards, federal lending databases, and more — accessible only to those with insider knowledge or institutional budgets. We're changing that. We synthesize everything into one comprehensive, easy-to-understand report.
                </p>
              </div>
            </div>
          )}

          {/* What's in Every Report — only shown to guests and free users */}
          {(!user || user.plan === 'free') && <div className="w-full max-w-4xl mt-8 mb-16">

            {/* Use Cases */}
            <div className="mb-16" id="use-cases">
              <div className="text-center max-w-[720px] mx-auto mb-11">
                <span className="font-jbmono text-[11px] font-bold uppercase tracking-[0.12em] text-[#565651] inline-flex items-center gap-[9px]">
                  <span className="w-[9px] h-[9px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>
                  What can you do with it?
                </span>
                <h2 className="font-serif font-normal text-[clamp(32px,4.6vw,50px)] leading-[1.05] tracking-[-0.01em] text-[#141414] mt-3.5 mb-2.5">
                  One property. A <em className="italic text-[#2b3a9e]">different answer</em> for every plan.
                </h2>
                <p className="text-[17px] text-[#565651] font-body m-0">
                  The report adapts to what you'll actually do with the space — so you get the answer to your question, not a generic data dump.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="section-use-cases">
                {USE_CASES.map((uc) => (
                  <div
                    key={uc.key}
                    className={`bg-white rounded-[15px] px-[22px] py-6 transition-all hover:-translate-y-0.5 ${
                      uc.highlighted
                        ? "border border-[#c9d0ee] shadow-[0_0_0_1px_#c9d0ee,0_6px_20px_rgba(20,20,20,0.07),0_1px_3px_rgba(20,20,20,0.05)]"
                        : "border border-[#eae8e2] shadow-[0_1px_2px_rgba(20,20,20,0.05)] hover:border-[#ddd4c6] hover:shadow-[0_6px_20px_rgba(20,20,20,0.07),0_1px_3px_rgba(20,20,20,0.05)]"
                    }`}
                    data-testid={`card-usecase-${uc.key}`}
                  >
                    {uc.pill && (
                      <span className="inline-block font-jbmono text-[9px] font-bold uppercase tracking-[0.06em] text-[#2b3a9e] bg-[#ecedf9] rounded-[5px] px-[7px] py-[2px] mb-2.5">
                        {uc.pill}
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-[19px] text-white mb-[15px] ${uc.iconBg}`} aria-hidden="true">
                      {uc.icon}
                    </div>
                    <div className="font-jbmono text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8b8a84]">
                      {uc.who}
                    </div>
                    <h3 className="font-serif font-normal text-2xl leading-[1.06] tracking-[-0.01em] text-[#141414] mt-[5px] mb-[9px]">
                      {uc.headline}
                    </h3>
                    <p className="text-[13.5px] text-[#565651] font-body leading-[1.5] mb-3.5">
                      {uc.lede}
                    </p>
                    <ul className="border-t border-[#eae8e2] pt-3 space-y-0">
                      {uc.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-[11px] text-[12.5px] text-[#565651] font-body leading-[1.35] py-1">
                          <span className={`w-1.5 h-1.5 rounded-[2px] mt-[5px] shrink-0 ${uc.dotBg}`} aria-hidden="true"></span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* What's in Every Report */}
            <div className="mb-16" id="report-features">
              <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84] mb-3 flex items-center gap-2"><span className="w-[8px] h-[8px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>What's Inside Every Brief</p>
              <h3 className="font-serif font-normal text-2xl sm:text-3xl text-foreground mb-10 leading-tight">
                15+ sources. 20+ pages of data. <em className="italic text-[#2b3a9e]">One brief.</em>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="section-features">
                {REPORT_FEATURES.map((feature, fi) => {
                  const Icon = feature.icon;
                  const accent = FEATURE_ACCENTS[fi % FEATURE_ACCENTS.length];
                  return (
                    <div
                      key={feature.title}
                      className="bg-white border border-[#eae8e2] rounded-[14px] p-6 shadow-[0_1px_2px_rgba(20,20,20,0.05)] hover:border-[#ddd9d0] hover:-translate-y-0.5 transition-all"
                      data-testid={`feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className={`w-[38px] h-[38px] rounded-lg flex items-center justify-center mb-3.5 ${accent.icon}`}>
                        <Icon className="w-[18px] h-[18px]" />
                      </div>
                      <h4 className="font-serif font-normal text-[19px] leading-tight text-[#141414] mb-2.5">
                        {feature.title}
                      </h4>
                      <ul className="space-y-2">
                        {feature.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-[#565651] font-body leading-snug">
                            <span className={`w-1.5 h-1.5 rounded-[2px] mt-[6px] shrink-0 ${accent.dot}`} aria-hidden="true"></span>
                            {typeof item === 'string' ? (
                              <span>{item}</span>
                            ) : (
                              <span><span className="font-semibold text-[#141414]">{item.bold}</span> — {item.rest}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Competitor Comparison Table */}
            <div className="mb-16" id="comparison">
              <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84] mb-3 flex items-center gap-2"><span className="w-[8px] h-[8px] rounded-[2px] bg-[#2b3a9e]" aria-hidden="true"></span>Why Know Your Property?</p>
              <h3 className="font-serif font-normal text-2xl sm:text-3xl text-foreground mb-3 leading-tight">
                More than a <em className="italic text-[#2b3a9e]">listing</em>.
              </h3>
              <p className="text-sm text-muted-foreground font-body mb-8 leading-relaxed max-w-2xl">
                Listing sites tell you what's for sale. We tell you what you're actually buying — the zoning, the debt, the risk, and the upside.
              </p>

              {/* Desktop table */}
              <div className="hidden md:block rounded-[18px] border border-[#ddd9d0] overflow-hidden bg-white shadow-[0_6px_20px_rgba(20,20,20,0.09),0_1px_3px_rgba(20,20,20,0.05)]">
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-[#eae8e2]">
                  <div className="p-4 bg-[#fafaf8] border-r border-[#eae8e2]" />
                  <div className="p-4 bg-[#1e2a6e] text-white text-center border-r border-[#eae8e2]">
                    <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.05em] leading-tight">Know Your<br/>Property</p>
                  </div>
                  {["Zillow / Redfin", "LoopNet / Crexi", "Chicago Cityscape", "Ownerly"].map((name) => (
                    <div key={name} className="p-4 text-center bg-[#fafaf8] border-r last:border-r-0 border-[#eae8e2]">
                      <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.05em] text-[#565651] leading-tight">{name}</p>
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {COMPARISON_ROWS.map((row, i) => (
                  <div key={row.feature} className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b last:border-b-0 border-[#eae8e2] ${i % 2 === 1 ? 'bg-[#faf9f6]' : 'bg-white'}`}>
                    <div className="p-4 border-r border-[#eae8e2]">
                      <p className="text-sm font-body text-foreground leading-snug">{row.feature}</p>
                    </div>
                    <div className="p-4 flex items-center justify-center border-r border-[#eae8e2] bg-[#2b3a9e]">
                      <CompCell value={row.kyp} invert />
                    </div>
                    {([row.zillow, row.loopnet, row.cityscape, row.ownerly] as CellValue[]).map((val, j) => (
                      <div key={j} className="p-4 flex items-center justify-center border-r last:border-r-0 border-[#eae8e2]">
                        <CompCell value={val} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Mobile: card-per-feature */}
              <div className="md:hidden space-y-0 rounded-[14px] border border-[#ddd9d0] overflow-hidden bg-white shadow-[0_6px_20px_rgba(20,20,20,0.09),0_1px_3px_rgba(20,20,20,0.05)]">
                {COMPARISON_ROWS.map((row, i) => (
                  <div key={row.feature} className={`border-b last:border-b-0 border-[#eae8e2] ${i % 2 === 1 ? 'bg-[#faf9f6]' : 'bg-white'}`}>
                    <p className="px-4 pt-3 pb-1 text-sm font-body font-semibold text-foreground">{row.feature}</p>
                    <div className="grid grid-cols-3 gap-0 px-4 pb-3">
                      {([
                        { label: "KYP", val: row.kyp, invert: false },
                        { label: "Zillow", val: row.zillow, invert: false },
                        { label: "LoopNet", val: row.loopnet, invert: false },
                      ] as { label: string; val: CellValue; invert: boolean }[]).map(({ label, val, invert }) => (
                        <div key={label} className="flex flex-col items-center gap-1">
                          <span className={`font-jbmono text-[9px] font-bold uppercase tracking-widest ${label === 'KYP' ? 'text-[#2b3a9e]' : 'text-[#8b8a84]'}`}>{label}</span>
                          <CompCell value={val} invert={invert} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing Cards */}
            <div className="mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif text-foreground mb-10 leading-tight">
                Pricing
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]" data-testid="section-pricing">
                <div className="p-7 rounded-[14px] bg-white border border-[#eae8e2] shadow-[0_1px_2px_rgba(20,20,20,0.05)]" data-testid="card-single-report">
                  <p className="font-jbmono text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#8b8a84] mb-3">One-Time</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="font-serif font-normal text-[52px] leading-none text-[#141414]">$29</span>
                    <span className="text-[15px] text-[#8b8a84] font-medium font-body mb-1">/ report</span>
                  </div>
                  <p className="text-[13.5px] text-[#565651] font-body mb-6 leading-relaxed">
                    One complete property intelligence report. No subscription required.
                  </p>
                  <Button
                    className="w-full h-12 rounded-[10px] font-jbmono text-xs font-bold uppercase tracking-[0.12em] bg-[#2b3a9e] text-white hover:bg-[#3446bd] transition-colors"
                    data-testid="button-cta-single"
                    onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => addressInputRef.current?.focus(), 400); }}
                  >
                    Search a Property →
                  </Button>
                  <div className="mt-7 space-y-2.5">
                    <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.15em] text-[#8b8a84]">Includes</p>
                    {["Full zoning & compatibility analysis","Legal, lien & tax records","Development history & permits","Market & comparables intelligence","Professional referral network","All location-based incentives"].map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-[#2f7d3f] mt-0.5 shrink-0" />
                        <span className="text-[13.5px] text-[#565651] font-body">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-7 rounded-[14px] bg-white border border-[#2b3a9e] ring-1 ring-[#2b3a9e] relative" data-testid="card-subscription">
                  <div className="absolute top-[18px] right-[18px]">
                    <span className="font-jbmono text-[9px] font-bold uppercase tracking-[0.08em] bg-[#d13b26] text-white px-2.5 py-1 rounded-md">Best Value</span>
                  </div>
                  <p className="font-jbmono text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#8b8a84] mb-3">Monthly</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="font-serif font-normal text-[52px] leading-none text-[#141414]">$99</span>
                    <span className="text-[15px] text-[#8b8a84] font-medium font-body mb-1">/ month</span>
                  </div>
                  <p className="text-[13.5px] text-[#565651] font-body mb-6 leading-relaxed">
                    Unlimited reports, saved history, and multi-property comparison.
                  </p>
                  <Button
                    className="w-full h-12 rounded-[10px] font-jbmono text-xs font-bold uppercase tracking-[0.12em] bg-[#2b3a9e] text-white hover:bg-[#3446bd] transition-colors"
                    data-testid="button-cta-subscription"
                    onClick={() => setLocation('/checkout?type=subscription')}
                  >
                    Start Subscription →
                  </Button>
                  <div className="mt-7 space-y-2.5">
                    <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.15em] text-[#8b8a84]">Everything in Single, plus</p>
                    {["Unlimited property reports","Saved search history — revisit any report","Side-by-side comparison of up to 3 properties","Market discovery — Chicago contractors, MBEs, tax appeal & zoning attorneys","Report AI chat assistant"].map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-[#2f7d3f] mt-0.5 shrink-0" />
                        <span className="text-[13.5px] text-[#565651] font-body">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom CTA strip */}
            <div className="relative rounded-[20px] bg-[#141414] text-white p-8 sm:p-10 text-center" data-testid="section-cta-strip">
              <div className="absolute inset-0 overflow-hidden rounded-[20px]" aria-hidden="true">
                <span className="absolute w-20 h-20 rounded-[3px] bg-[#2b3a9e] -top-5 right-32"></span>
                <span className="absolute w-28 h-28 rounded-[3px] bg-[#f3b31f] -bottom-9 right-8 opacity-90"></span>
              </div>
              <div className="relative z-[1] mb-6">
                <h4 className="font-serif font-normal text-[28px] leading-tight text-white mb-1.5">Ready to run your first report?</h4>
                <p className="text-[15px] text-[#c7c7c1] font-body">Enter any Chicago address to get started.</p>
              </div>
              <div className="relative z-[1]">
                <CloserSearchBar variant="dark" page="home-bottom" />
              </div>
            </div>

            <div className="pb-12 flex flex-col items-center gap-3 mt-10">
              <div className="flex items-center gap-6">
                <Link href="/about" className="text-[11px] text-muted-foreground font-body uppercase tracking-widest hover:text-foreground transition-colors">
                  About Us
                </Link>
                <Link href="/faq" className="text-[11px] text-muted-foreground font-body uppercase tracking-widest hover:text-foreground transition-colors">
                  FAQ
                </Link>
              </div>
              <p className="text-[11px] text-muted-foreground font-body uppercase tracking-widest text-center">
                Chicago, IL · Cook County · Data updated regularly
              </p>
            </div>
          </div>}
        </div>
      </main>
    </div>
  );
}
