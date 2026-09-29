import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearch, useLocation, Link } from "wouter";
import {
  MapPin, ChevronDown, Lock, Map, Building2, BarChart3, Users, Train, Loader2,
  ExternalLink, Ruler, DollarSign, Newspaper, Globe,
  CheckCircle2, XCircle, Menu, Star,
  Layers, Navigation, HardHat, ClipboardList, Link2, Printer, Search, CreditCard,
  Eye, Landmark,
} from "lucide-react";
import { yearsTile, heightTile, parkingTile, zoningMeaningBullets } from "@/lib/wardZoningDisplay";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@/lib/formatAddress";
import { useQuery } from "@tanstack/react-query";
import { useZoningInfo } from "@/hooks/use-runs";
import { PropertyMap } from "@/components/PropertyMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar } from "@/components/Sidebar";
import { Logo } from "@/components/Logo";

const SECTION_BADGES: Record<string, string[]> = {
  "Location Based Incentives":     ["TOD: Not in TOD", "SBIF: Eligible", "NMTC: Not Eligible", "Enterprise Zone: Not in Zone", "ADU: Eligible by Zoning"],
  "Property Details":              ["Class C", "Built 1924", "4,200 sq ft", "5 Permits", "0 Open Violations", "Taxes Current"],
  "Development Potential":         ["Current FAR: 0.8", "Max FAR: 1.2", "2BR: $2,220/mo", "ADU Eligible"],
  "Property Proximity Details":    ["New Construction", "Crime Statistics", "Nearby Landmarks", "Environmental Factors", "Entertainment & Culture"],
  "Transit Access & Ridership":    ["5 CTA Rail Stations", "2 Metra Stations", "5 Bus Routes"],
  "Can I Finance This Property?":  ["LIKELY FINANCEABLE", "Score: 100/100", "SBA Active"],
  "Site-Specific Coverage":        ["6 Articles Found", "Recent 120-Day Coverage"],
  "Corridor Intelligence":         ["Milwaukee Ave (On corridor)", "3 Nearby Corridors", "16 New Permits", "8 New Business Licenses"],
  "Neighborhood News":             ["High Activity", "12 articles (past year)", "Score: 100/100"],
  "Upcoming Real Estate Developments": ["1 Project with Details", "19 Zoning Appeals"],
  "Neighborhood People Profile":   ["Pop: -3.0%", "Median Income: $119,796", "Moderate Diversity", "2BR FMR: $2,220/mo"],
  "Valuation Calculator":          ["Enter purchase price", "DSCR", "Cap Rate", "ROI"],
};

const SECTIONS = [
  { icon: <MapPin className="w-5 h-5" />,     title: "Location Based Incentives" },
  { icon: <Building2 className="w-5 h-5" />,  title: "Property Details" },
  { icon: <Landmark className="w-5 h-5" />,   title: "Development Potential" },
  { icon: <MapPin className="w-5 h-5" />,     title: "Property Proximity Details" },
  { icon: <Train className="w-5 h-5" />,      title: "Transit Access & Ridership" },
  { icon: <DollarSign className="w-5 h-5" />, title: "Can I Finance This Property?" },
  { icon: <Search className="w-5 h-5" />,     title: "Site-Specific Coverage" },
  { icon: <Navigation className="w-5 h-5" />, title: "Corridor Intelligence" },
  { icon: <Newspaper className="w-5 h-5" />,  title: "Neighborhood News" },
  { icon: <HardHat className="w-5 h-5" />,    title: "Upcoming Real Estate Developments" },
  { icon: <Users className="w-5 h-5" />,      title: "Neighborhood People Profile" },
  { icon: <BarChart3 className="w-5 h-5" />,  title: "Valuation Calculator" },
];

function BlurredSection({ icon, title }: { icon: React.ReactNode; title: string }) {
  const badges = SECTION_BADGES[title] ?? ["Data loaded", "Analysis ready", "View details"];
  return (
    <Card className="border border-border overflow-visible">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="chead">
            {title}
          </CardTitle>
          <span className="text-muted-foreground text-sm">▶</span>
        </div>
        <div
          className="flex flex-wrap gap-2 mt-2"
          style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}
        >
          {badges.map((b, i) => (
            <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>
          ))}
        </div>
      </CardHeader>
    </Card>
  );
}

export default function AddressPreview() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const rawAddress = params.get("address") || "";
  const address = rawAddress ? formatAddress(rawAddress) : "";

  const [, setLocation] = useLocation();
  const { user, login, register } = useAuth();
  const { toast } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pvWardOpen, setPvWardOpen] = useState(false);
  const [pvZoningOpen, setPvZoningOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  // Paid users never belong on the preview/paywall page — bounce them to the
  // home page, which creates the run for the carried-over address immediately.
  useEffect(() => {
    if (user && user.plan !== 'free') {
      if (rawAddress) sessionStorage.setItem('pendingAddress', rawAddress);
      setLocation('/');
    }
  }, [user, rawAddress]);

  // Deep-link support: scroll to #element-id in the URL hash once content renders
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    let attempts = 12;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
      } else if (--attempts > 0) {
        setTimeout(tryScroll, 400);
      }
    };
    setTimeout(tryScroll, 400);
  }, []);

  const switchMode = (next: 'signin' | 'register') => {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
  };

  const { data: geo, isLoading: isLoadingGeo } = useQuery<any>({
    queryKey: ['/api/geocoding/lookup', rawAddress],
    queryFn: async () => {
      if (!rawAddress) return null;
      const res = await fetch('/api/geocoding/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: rawAddress }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!rawAddress,
    staleTime: 1000 * 60 * 10,
  });

  const { data: zoningInfo, isLoading: isLoadingZoning } = useZoningInfo(geo?.zoning);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await login(email, password);
      if (rawAddress) sessionStorage.setItem('pendingAddress', rawAddress);
      setLocation('/');
    } catch (err: any) {
      toast({ title: err.message || "Sign in failed.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password);
      if (rawAddress) sessionStorage.setItem('pendingAddress', rawAddress);
      setLocation('/');
    } catch (err: any) {
      toast({ title: err.message || "Registration failed.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoggedInCheckout = async (type: 'report' | 'subscription') => {
    if (type === 'subscription') {
      if (rawAddress) sessionStorage.setItem('pendingAddress', rawAddress);
      setLocation('/checkout?type=subscription');
      return;
    }
    setIsCreatingRun(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: rawAddress }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Could not create run');
      }
      const run = await res.json();
      const checkoutParams = new URLSearchParams({
        type: 'report',
        runId: String(run.id),
        address: rawAddress,
      });
      setLocation(`/checkout?${checkoutParams.toString()}`);
    } catch (err: any) {
      toast({ title: err.message || "Could not start checkout.", variant: "destructive" });
    } finally {
      setIsCreatingRun(false);
    }
  };

  const goToCheckout = (type: 'report' | 'subscription') => {
    if (rawAddress) sessionStorage.setItem('pendingAddress', rawAddress);
    const p = new URLSearchParams({ type, ...(rawAddress ? { address: rawAddress } : {}) });
    setLocation(`/checkout?${p.toString()}`);
  };

  const hasGeo = !!geo?.lat;

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 w-64 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content column */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <button onClick={() => setSidebarOpen(true)} data-testid="button-mobile-menu-preview">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-display text-sm font-bold tracking-tight">KNOW YOUR PROPERTY</span>
          <div className="w-6" />
        </div>

        {/* Dark header — identical to RunDetail */}
        <div className="flex-shrink-0 bg-foreground text-background border-b border-border z-10">
          <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h1 className="text-2xl md:text-3xl font-serif text-background flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-background/70 flex-shrink-0" />
                    {address || "Property Analysis"}
                  </h1>
                </div>
                <div className="flex items-center gap-2 flex-wrap opacity-40 pointer-events-none select-none">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-background/30 text-background hover:bg-background/10"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span className="hidden sm:inline">Project Context</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-background/30 text-background hover:bg-background/10"
                  >
                    <ChevronDown className="w-4 h-4" />
                    <span className="hidden sm:inline">Expand All</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-background/30 text-background hover:bg-background/10"
                  >
                    <Link2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Share</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-background/30 text-background hover:bg-background/10"
                  >
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">Print / Save PDF</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-background/30 text-background hover:bg-background/10"
                  >
                    <Search className="w-4 h-4" />
                    <span className="hidden sm:inline">Find Section</span>
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Facts bar — Neighborhood / Tract / TIF / Zoning / Opp Zone / Save */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2"
            >
              {isLoadingGeo ? (
                <>
                  {["Neighborhood", "Tract", "TIF", "Zoning", "Opp Zone"].map((label) => (
                    <div key={label} className="border border-background/20 p-2 animate-pulse">
                      <div className="flex items-center gap-1 text-background/60 mb-1">
                        <span className="font-display text-sm font-bold uppercase tracking-wider">{label}</span>
                      </div>
                      <div className="h-5 bg-background/10 w-16" />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="border border-background/20 p-2">
                    <div className="flex items-center gap-1 text-background/60 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span className="font-display text-sm font-bold uppercase tracking-wider">Neighborhood</span>
                    </div>
                    <div className="font-display font-bold text-base truncate text-background">
                      {hasGeo
                        ? (geo.neighborhood && geo.neighborhood.toLowerCase() !== geo.communityArea?.toLowerCase()
                          ? `${geo.communityArea} - ${geo.neighborhood}`
                          : geo.communityArea || "N/A")
                        : "—"}
                    </div>
                  </div>
                  <div className="border border-background/20 p-2">
                    <div className="flex items-center gap-1 text-background/60 mb-1">
                      <Map className="w-3 h-3" />
                      <span className="font-display text-sm font-bold uppercase tracking-wider">Tract</span>
                    </div>
                    <div className="font-display font-bold text-base truncate text-background">
                      {hasGeo ? (geo.tractGeoid || "N/A") : "—"}
                    </div>
                  </div>
                  <div className="border border-background/20 p-2">
                    <div className="flex items-center gap-1 text-background/60 mb-1">
                      <Layers className="w-3 h-3" />
                      <span className="font-display text-sm font-bold uppercase tracking-wider">TIF</span>
                    </div>
                    <div className="font-display font-bold text-base truncate text-background">
                      {hasGeo ? (geo.tifName || "None") : "—"}
                    </div>
                  </div>
                  <div className="border border-background/20 p-2">
                    <div className="flex items-center gap-1 text-background/60 mb-1">
                      <Ruler className="w-3 h-3" />
                      <span className="font-display text-sm font-bold uppercase tracking-wider">Zoning</span>
                    </div>
                    <div className="font-display font-bold text-base truncate text-background">
                      {hasGeo ? (geo.zoning || "N/A") : "—"}
                    </div>
                  </div>
                  <div className="border border-background/20 p-2">
                    <div className="flex items-center gap-1 text-background/60 mb-1">
                      <Building2 className="w-3 h-3" />
                      <span className="font-display text-sm font-bold uppercase tracking-wider">Opp Zone</span>
                    </div>
                    <div className="font-display font-bold text-base truncate text-background">
                      {hasGeo ? (geo.opportunityZone ? "Yes" : "No") : "—"}
                    </div>
                  </div>
                  <div className="border border-background/20 p-2 flex flex-col items-center justify-center opacity-30">
                    <Star className="w-5 h-5 text-background/60" />
                    <span className="text-xs font-display font-bold mt-0.5 text-background/60">Save</span>
                  </div>
                </>
              )}
            </motion.div>

          </div>
        </div>

        {/* Scrollable report content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden subsection-text relative">

          {/* Sticky paywall banner — same as RunDetail's !isReportUnlocked bar */}
          <div className="sticky top-0 z-20 bg-white border-b-2 border-black">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-widest font-body text-muted-foreground mb-0.5">Full Report</div>
                <h2 className="font-display text-base font-bold text-foreground">Unlock This Analysis</h2>
                <p className="text-xs font-body text-muted-foreground mt-0.5 hidden sm:block">
                  Purchase one-time access or subscribe for unlimited reports.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {user ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleLoggedInCheckout('subscription')}
                      disabled={isCreatingRun}
                      className="font-display text-sm border-black text-foreground hover:bg-secondary"
                      data-testid="button-preview-subscribe"
                    >
                      Unlimited — $99/mo
                    </Button>
                    <Button
                      onClick={() => handleLoggedInCheckout('report')}
                      disabled={isCreatingRun}
                      className="bg-foreground text-background hover:bg-foreground/90 font-display font-bold text-sm"
                      data-testid="button-preview-single"
                    >
                      {isCreatingRun && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                      <CreditCard className="w-4 h-4 mr-2" />
                      {isCreatingRun ? 'Preparing...' : 'Single Report — $29'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowAuthForm((v) => !v)}
                      className="font-display text-sm border-black text-foreground hover:bg-secondary"
                      data-testid="button-preview-signin-toggle"
                    >
                      Sign In
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => goToCheckout('subscription')}
                      className="font-display text-sm border-black text-foreground hover:bg-secondary"
                      data-testid="button-preview-subscribe"
                    >
                      Unlimited — $99/mo
                    </Button>
                    <Button
                      onClick={() => goToCheckout('report')}
                      className="bg-foreground text-background hover:bg-foreground/90 font-display font-bold text-sm"
                      data-testid="button-preview-single"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Single Report — $29
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Sign-in form (inline under the banner, same portal approach) */}
            {showAuthForm && !user && createPortal(
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) setShowAuthForm(false); }}
                data-testid="modal-signin-overlay"
              >
                <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-sm mx-4 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#eae8e2]">
                    <span className="flex items-center gap-2.5 font-jbmono text-sm font-bold uppercase tracking-widest text-foreground">
                      <Logo size={22} className="shrink-0" />
                      {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </span>
                    <button
                      onClick={() => setShowAuthForm(false)}
                      className="text-[#8b8a84] hover:text-foreground transition-colors text-lg leading-none"
                      data-testid="button-modal-close"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex border-b border-[#eae8e2]">
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className={`flex-1 py-2.5 font-jbmono text-xs font-bold uppercase tracking-widest transition-colors ${mode === 'signin' ? 'bg-[#2b3a9e] text-white' : 'bg-white text-foreground hover:text-[#2b3a9e] hover:bg-[#2b3a9e]/5'}`}
                      data-testid="tab-signin"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className={`flex-1 py-2.5 font-jbmono text-xs font-bold uppercase tracking-widest border-l border-[#eae8e2] transition-colors ${mode === 'register' ? 'bg-[#2b3a9e] text-white' : 'bg-white text-foreground hover:text-[#2b3a9e] hover:bg-[#2b3a9e]/5'}`}
                      data-testid="tab-register"
                    >
                      Create Account
                    </button>
                  </div>
                  <div className="p-5">
                    {mode === 'signin' ? (
                      <form onSubmit={handleSignIn} className="space-y-0">
                        <div className="space-y-3">
                          <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                            <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Email</label>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                              placeholder="you@example.com"
                              autoComplete="email"
                              autoFocus
                              data-testid="input-preview-email"
                            />
                          </div>
                          <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                            <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Password</label>
                            <input
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full px-3 pb-2 text-sm font-body text-black bg-white outline-none"
                              placeholder="••••••••"
                              autoComplete="current-password"
                              data-testid="input-preview-password"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 mt-4 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-50"
                          data-testid="button-preview-signin"
                        >
                          {submitting ? "Signing In..." : "Sign In →"}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleRegister} className="space-y-0">
                        <div className="space-y-3">
                          <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                            <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Email</label>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                              placeholder="you@example.com"
                              autoComplete="email"
                              autoFocus
                              data-testid="input-preview-reg-email"
                            />
                          </div>
                          <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                            <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Password</label>
                            <input
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                              placeholder="••••••••"
                              autoComplete="new-password"
                              data-testid="input-preview-reg-password"
                            />
                          </div>
                          <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                            <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Confirm Password</label>
                            <input
                              type="password"
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full px-3 pb-2 text-sm font-body text-black bg-white outline-none"
                              placeholder="••••••••"
                              autoComplete="new-password"
                              data-testid="input-preview-reg-confirm"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 mt-4 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-50"
                          data-testid="button-preview-register"
                        >
                          {submitting ? "Creating Account..." : "Create Account →"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            , document.body)}
          </div>

          {/* Report sections */}
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">

            {/* Location Map */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="chead flex items-center gap-2">
                    Location Map
                  </CardTitle>
                  {hasGeo && (
                    <div className="flex items-center gap-3">
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${geo.lat},${geo.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 hover:underline"
                      >
                        <Eye className="w-4 h-4" />
                        Street View
                      </a>
                      <a
                        href={`https://www.google.com/maps/@${geo.lat},${geo.lon},200m/data=!3m1!1e3`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 hover:underline"
                      >
                        <Globe className="w-4 h-4" />
                        Google Earth
                      </a>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {hasGeo ? (
                  <PropertyMap
                    lat={geo.lat}
                    lon={geo.lon}
                    zipCode={geo.zipCode}
                    communityArea={geo.communityArea}
                    ward={geo.ward}
                    address={address}
                    neighborhood={geo.neighborhood}
                    tractGeoid={geo.tractGeoid}
                  />
                ) : (
                  <div className="h-[400px] rounded-xl border border-border bg-secondary animate-pulse" />
                )}
              </CardContent>
            </Card>

            {/* Ward & Alderperson + Zoning Details — side by side */}
            {hasGeo && (geo.alderman || geo.zoning) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {geo.alderman && (
                  <div className="kyp-ctxc" id="preview-section-ward">
                    <div className="top" role="button" tabIndex={0} aria-expanded={pvWardOpen}
                      onClick={() => setPvWardOpen((o) => !o)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPvWardOpen((o) => !o); } }}
                      data-testid="toggle-ward-card">
                      <div className="crest"><span className="n">{geo.ward}</span><span className="u">Ward</span></div>
                      <div className="mid">
                        <div className="k">Alderperson</div>
                        <div className="nm">{geo.alderman}</div>
                        <div className="sub">
                          {geo.aldermanYearsInOffice && <><b>{yearsTile(geo.aldermanYearsInOffice).n} yrs</b> in office</>}
                          {geo.aldermanYearsInOffice && geo.aldermanAttendance && <> · </>}
                          {geo.aldermanAttendance && <>{geo.aldermanAttendance} attendance</>}
                          {!geo.aldermanYearsInOffice && !geo.aldermanAttendance && (geo.aldermanWardOffice || null)}
                        </div>
                      </div>
                      <div className="chev">{pvWardOpen ? '⌃' : '⌄'}</div>
                    </div>
                    <div className={`body${pvWardOpen ? '' : ' closed'}`}>
                      <div className="kyp-cxrows">
                        {geo.aldermanPhone && (
                          <div className="kyp-cxrow"><span className="i">✆</span><a href={`tel:${geo.aldermanPhone.replace(/[^0-9+]/g, '')}`}>{geo.aldermanPhone}</a></div>
                        )}
                        {geo.aldermanEmail && (
                          <div className="kyp-cxrow"><span className="i">✉</span><a href={`mailto:${geo.aldermanEmail}`}>{geo.aldermanEmail}</a></div>
                        )}
                        {geo.aldermanWardOffice && (
                          <div className="kyp-cxrow"><span className="i">⌖</span><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(geo.aldermanWardOffice)}`} target="_blank" rel="noopener noreferrer">{geo.aldermanWardOffice}</a></div>
                        )}
                      </div>
                      {(geo.aldermanYearsInOffice || geo.aldermanAttendance) && (
                        <div className="kyp-cxstats">
                          {geo.aldermanYearsInOffice && (
                            <div className="kyp-cxstat ind">
                              <span className="n" data-testid="text-alderman-years">{yearsTile(geo.aldermanYearsInOffice).n}</span>
                              <span><div className="l">Years in office</div><div className="s">{yearsTile(geo.aldermanYearsInOffice).sub}</div></span>
                            </div>
                          )}
                          {geo.aldermanAttendance && (
                            <div className="kyp-cxstat dark">
                              <span className="n" data-testid="text-alderman-attendance">{geo.aldermanAttendance}</span>
                              <span><div className="l">Attendance</div><div className="s">this council session</div></span>
                            </div>
                          )}
                        </div>
                      )}
                      <a className="kyp-cxcta" href={geo.aldermanCouncilmaticUrl || "https://chicago.councilmatic.org/compare-council-members/"} target="_blank" rel="noopener noreferrer" data-testid="link-alderman-councilmatic">
                        <span><span className="h" style={{display:'block'}}>Legislation &amp; donors</span><span className="s" style={{display:'block'}}>Voting record &amp; campaign finance · via Councilmatic</span></span>
                        <span className="arr">↗</span>
                      </a>
                      <div className="kyp-cxwtm">
                        <div className="kyp-cxwtmh">Why this matters</div>
                        <div className="kyp-cxb"><span className="dot"></span><span><b>Zoning changes start here.</b> Your alderperson introduces the rezoning or Planned Development ordinance, and City Council almost always follows their lead — a custom known as aldermanic prerogative.</span></div>
                        <div className="kyp-cxb"><span className="dot"></span><span><b>Local permits need their support.</b> Special-use permits, liquor licenses, signs, sidewalk cafés, and curb cuts.</span></div>
                        <div className="kyp-cxb"><span className="dot"></span><span><b>They control $1.5M a year</b> in discretionary ward funds for streets, lighting, and sidewalks.</span></div>
                        <div className="kyp-cxb"><span className="dot"></span><span><b>It's custom, not law.</b> By-right projects don't need their approval — DPD, the Zoning Board of Appeals, and the Plan Commission make the official decisions.</span></div>
                      </div>
                      {geo.aldermanUrl && (
                        <a className="kyp-cxlink" href={geo.aldermanUrl} target="_blank" rel="noopener noreferrer">View full Ward {geo.ward} page ↗</a>
                      )}
                    </div>
                  </div>
                )}
                {geo.zoning && (
                  <div className="kyp-ctxc">
                    <div className="top" role="button" tabIndex={0} aria-expanded={pvZoningOpen}
                      onClick={() => setPvZoningOpen((o) => !o)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPvZoningOpen((o) => !o); } }}
                      data-testid="toggle-zoning-card">
                      <div className="crest zone"><span className="n">{geo.zoning}</span><span className="u">Zoning</span></div>
                      <div className="mid">
                        <div className="k">Zoning district</div>
                        <div className="nm">{zoningInfo?.name || geo.zoning}</div>
                        {zoningInfo && (
                          <div className="sub">
                            {[zoningInfo.residentialAllowed && 'residential', zoningInfo.commercialAllowed && 'commercial', zoningInfo.industrialAllowed && 'industrial'].filter(Boolean).join(' + ').replace(/^./, (c: string) => c.toUpperCase())}
                            {zoningInfo.maxFAR && <> · <b>{zoningInfo.maxFAR} FAR</b></>}
                          </div>
                        )}
                      </div>
                      <div className="chev">{pvZoningOpen ? '⌃' : '⌄'}</div>
                    </div>
                    <div className={`body${pvZoningOpen ? '' : ' closed'}`}>
                      {isLoadingZoning ? (
                        <div className="space-y-3 pt-4">
                          <Skeleton className="h-6 w-2/3" />
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : zoningInfo ? (
                        <>
                          <div className="kyp-cxrows">
                            {[
                              { label: 'Residential', allowed: zoningInfo.residentialAllowed, note: zoningInfo.residentialAllowed && zoningInfo.commercialAllowed && (zoningInfo.allowedUses || []).join(' ').toLowerCase().includes('above') ? '— above ground floor' : null },
                              { label: 'Commercial', allowed: zoningInfo.commercialAllowed, note: null },
                              { label: 'Industrial', allowed: zoningInfo.industrialAllowed, note: null },
                            ].map(({ label, allowed, note }) => (
                              <div key={label} className={`kyp-cxrow${allowed ? ' on' : ''}`}>
                                <span className="mk">{allowed ? '✓' : '✕'}</span>
                                <span className="w">{label}</span>
                                {note && <span className="note">{note}</span>}
                              </div>
                            ))}
                          </div>
                          <div className="kyp-cxtiles">
                            <div className="kyp-cxtile">
                              <div className="l">Max FAR</div>
                              <div className="n">{zoningInfo.maxFAR || 'None'}</div>
                              <div className="s">{zoningInfo.maxFAR ? 'floor-area ratio' : 'not specified'}</div>
                            </div>
                            <div className="kyp-cxtile dark">
                              <div className="l">Max Height</div>
                              <div className="n">{zoningInfo.maxHeight ? heightTile(zoningInfo.maxHeight).n : 'None'}</div>
                              <div className="s">{zoningInfo.maxHeight ? (heightTile(zoningInfo.maxHeight).sub || 'max height') : 'not specified'}</div>
                            </div>
                            <div className="kyp-cxtile slate">
                              <div className="l">Parking</div>
                              <div className="n">{zoningInfo.parkingMin ? parkingTile(zoningInfo.parkingMin).n : 'None'}</div>
                              <div className="s">{zoningInfo.parkingMin ? (parkingTile(zoningInfo.parkingMin).sub || 'minimum') : 'not specified'}</div>
                            </div>
                            <div className="kyp-cxtile slate">
                              <div className="l">Min Lot Area</div>
                              <div className="n">{zoningInfo.minLotAreaPerUnit != null ? zoningInfo.minLotAreaPerUnit.toLocaleString() : 'None'}</div>
                              <div className="s">{zoningInfo.minLotAreaPerUnit != null ? 'sq ft per unit' : 'not specified'}</div>
                            </div>
                          </div>
                          {zoningInfo.allowedUses?.length > 0 && (
                            <>
                              <div className="kyp-cxlbl">Allowed uses — as of right</div>
                              <div className="kyp-cxuses">
                                {zoningInfo.allowedUses.map((use: string, i: number) => (
                                  <span key={i} className="kyp-cxuse">{use}</span>
                                ))}
                              </div>
                            </>
                          )}
                          <div className="kyp-cxwtm">
                            <div className="kyp-cxwtmh">What this zoning means</div>
                            {zoningMeaningBullets(zoningInfo).map((b: { bold: string; text: string }, i: number) => (
                              <div key={i} className="kyp-cxb"><span className="dot"></span><span><b>{b.bold}</b> {b.text}</span></div>
                            ))}
                          </div>
                          <div className="kyp-cxfoot">
                            Data may not reflect recent rezonings.{' '}
                            <a href="https://gisapps.chicago.gov/ZoningMapWeb/?liab=1&config=zoning" target="_blank" rel="noopener noreferrer">Verify on the official map</a>
                            {geo.tractGeoid ? <> — search by <span className="pin">{geo.tractGeoid}</span></> : ''}
                          </div>
                          <a className="kyp-cxlink" href="https://codelibrary.amlegal.com/codes/chicago/latest/chicagozoning_il/0-0-0-48750" target="_blank" rel="noopener noreferrer">Chicago Zoning Code — Use Standards ↗</a>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground pt-4">
                          Zoning information not available for this code. Check with Chicago DPD for details.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All blurred sections — in exact RunDetail order */}
            {SECTIONS.map(({ icon, title }) => (
              <BlurredSection key={title} icon={icon} title={title} />
            ))}

          </div>
        </div>
      </div>
    </div>
  );
}
