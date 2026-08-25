import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useLocation, Link } from "wouter";
import { PlusCircle, History, Trash2, MapPin, Star, Filter, Scale, X, ChevronDown, ChevronUp, Clock, Search, Compass, Info, HelpCircle, LogIn, LogOut, Lock, BookOpen, Menu } from "lucide-react";
import { FunnelModal, type FunnelAnswers } from "@/components/FunnelModal";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useRuns, useDeleteRun, useDeleteAllRuns, useToggleFavorite, useCreateRun, useGeocodeLookup } from "@/hooks/use-runs";
import { useQuery } from "@tanstack/react-query";
import { formatStreetAddress } from "@/lib/formatAddress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useCompare } from "@/contexts/CompareContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FilterMode = 'all' | 'favorites';

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout, login, isSubscriber, isSingleReport } = useAuth();
  const { data: runs, isLoading } = useRuns();
  const deleteRun = useDeleteRun();
  const deleteAllRuns = useDeleteAllRuns();
  const toggleFavorite = useToggleFavorite();
  const { 
    compareItems, 
    addToCompare, 
    removeFromCompare,
    isInCompare, 
    canAddMore, 
    clearCompare,
    compareHistory,
    loadFromHistory,
    deleteHistoryEntry,
    clearHistory,
    syncWithExistingRuns
  } = useCompare();
  const { toast } = useToast();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<{ id: number; address: string } | null>(null);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isRunActive = (id: number) => location === `/run/${id}`;

  const handleAddToCompare = (e: React.MouseEvent, run: { id: number; address: string; lastProjectType?: string | null; label?: string | null }) => {
    e.stopPropagation();
    if (isInCompare(run.id)) {
      removeFromCompare(run.id);
      toast({
        title: "Removed from compare",
        description: `${formatStreetAddress(run.address)} removed from comparison.`,
      });
      return;
    }
    if (!canAddMore) {
      toast({
        title: "Comparison full",
        description: "You can compare up to 3 properties. Remove one to add another.",
        variant: "destructive",
      });
      return;
    }
    const added = addToCompare({ runId: run.id, address: run.address, lastProjectType: run.lastProjectType, label: run.label });
    if (added) {
      toast({
        title: "Added to compare",
        description: `${formatStreetAddress(run.address)} added. ${3 - compareItems.length - 1} slot(s) remaining.`,
      });
    }
  };

  const sortedRuns = runs?.slice().sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const allFilteredRuns = sortedRuns?.filter(r => {
    if (filterMode === 'favorites' && !r.isFavorite) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const addr = (r.address || '').toLowerCase();
      const formatted = formatStreetAddress(r.address).toLowerCase();
      return addr.includes(q) || formatted.includes(q);
    }
    return true;
  });

  const FREE_RUN_LIMIT = 5;
  const isFreeUser = user && user.plan !== 'subscriber';
  const filteredRuns = isFreeUser && !searchQuery.trim()
    ? allFilteredRuns?.slice(0, FREE_RUN_LIMIT)
    : allFilteredRuns;
  const hiddenRunCount = isFreeUser && !searchQuery.trim()
    ? Math.max(0, (allFilteredRuns?.length || 0) - FREE_RUN_LIMIT)
    : 0;

  const handleDeleteClick = (e: React.MouseEvent, run: { id: number; address: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setRunToDelete(run);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (runToDelete) {
      deleteRun.mutate(runToDelete.id);
      // Remove from compare basket if it's in there
      if (isInCompare(runToDelete.id)) {
        removeFromCompare(runToDelete.id);
      }
      if (isRunActive(runToDelete.id)) {
        setLocation('/');
      }
    }
    setDeleteDialogOpen(false);
    setRunToDelete(null);
  };

  const confirmClearAll = () => {
    deleteAllRuns.mutate();
    clearCompare(); // Clear compare basket when all runs are deleted
    setLocation('/');
    setClearAllDialogOpen(false);
  };

  const [isSearching, setIsSearching] = useState(false);
  const [addressValue, setAddressValue] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ place_name: string; center: [number, number] }>>([]);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const suppressBlurRef = useRef(false);
  const createRun = useCreateRun();
  const geocode = useGeocodeLookup();

  const [showFunnel, setShowFunnel] = useState(false);
  const [funnelPendingAddress, setFunnelPendingAddress] = useState<string | null>(null);

  const { data: mapboxTokenData } = useQuery<{ token: string }>({ queryKey: ['/api/config/mapbox-token'] });

  useEffect(() => {
    if (!addressValue.trim() || addressValue.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      const token = mapboxTokenData?.token;
      if (!token) return;
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressValue.trim())}.json?access_token=${token}&types=address&country=US&bbox=-87.9401,41.6445,-87.5241,42.0230&proximity=-87.6298,41.8781&limit=5`
        );
        const data = await res.json();
        setSuggestions(data.features || []);
        setShowSuggestions(true);
        setHighlightedIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [addressValue, mapboxTokenData]);

  const clearSearch = () => {
    setIsSearching(false);
    setAddressValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightedIdx(-1);
  };

  const executeAddressSearch = async (addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    isSubmittingRef.current = true;
    setShowSuggestions(false);
    setSuggestions([]);
    try {
      const facts = await geocode.mutateAsync({ address: trimmed });
      const unitMatch = addressValue.match(/\s+(?:Unit|Apt|Ste|Suite|#)\b\s*(\S+)/i);
      let runAddress = facts.formattedAddress;
      if (unitMatch) {
        const unitNum = unitMatch[1].replace(/[,;]+$/, '').toUpperCase();
        runAddress = facts.formattedAddress.replace(/,/, ` Unit ${unitNum},`);
      }
      const run = await createRun.mutateAsync({ address: runAddress });
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
      clearSearch();
      setLocation(`/run/${run.id}`);
    } catch (err) {
      // keep search mode open on error so user can retry
      toast({
        title: "Could not create report",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const submitAddress = (addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    // Non-subscribers (logged-out or single-report) go to preview, no run created
    if (!user || isSingleReport) {
      clearSearch();
      setLocation('/preview?address=' + encodeURIComponent(trimmed));
      return;
    }
    isSubmittingRef.current = true;
    setFunnelPendingAddress(trimmed);
    setShowSuggestions(false);
    setSuggestions([]);
    setShowFunnel(true);
  };

  const handleFunnelComplete = (answers: FunnelAnswers | null) => {
    if (answers) {
      sessionStorage.setItem('funnelAnswers', JSON.stringify(answers));
    } else {
      sessionStorage.removeItem('funnelAnswers');
    }
    setShowFunnel(false);
    if (funnelPendingAddress) {
      // Keep isSubmittingRef true so the onBlur 150ms timer doesn't call
      // clearSearch() while executeAddressSearch is in flight.
      executeAddressSearch(funnelPendingAddress);
    } else {
      isSubmittingRef.current = false;
    }
  };

  const handleAddressSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const active = highlightedIdx >= 0 && suggestions[highlightedIdx]
      ? suggestions[highlightedIdx].place_name
      : addressValue;
    submitAddress(active);
  };

  const newAnalysisButton = (
    <button
      onClick={() => {
        setIsSearching(true);
        setTimeout(() => addressInputRef.current?.focus(), 0);
      }}
      className="w-full flex items-center justify-center gap-2 font-medium transition-opacity hover:opacity-90"
      style={{
        background: 'var(--ref-blue)', color: '#fff', border: 'none',
        borderRadius: '10px', padding: '11px 16px', fontSize: '13.5px',
        cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600
      }}
      data-testid="button-new-analysis"
    >
      <PlusCircle className="w-4 h-4" />
      New Analysis
    </button>
  );

  const addressSearchInput = (
    <form onSubmit={handleAddressSearch}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10" style={{color:'var(--sb-muted)'}} />
        <input
          ref={addressInputRef}
          type="text"
          value={addressValue}
          onChange={(e) => {
            setAddressValue(e.target.value);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!suppressBlurRef.current && !isSubmittingRef.current) {
                clearSearch();
              }
              suppressBlurRef.current = false;
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              clearSearch();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIdx(i => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightedIdx(i => Math.max(i - 1, -1));
            } else if (e.key === 'Tab') {
              setShowSuggestions(false);
            }
          }}
          placeholder="Enter address..."
          disabled={geocode.isPending || createRun.isPending}
          className="w-full h-12 pl-9 pr-8 font-body text-sm focus:outline-none"
          style={{background:'#fff', border:'1px solid var(--sb-line-2)', color:'var(--sb-ink)', borderRadius:'8px'}}
          autoComplete="off"
          autoFocus
          data-testid="input-address-search"
        />
        {(geocode.isPending || createRun.isPending) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:'var(--sb-line-2)', borderTopColor:'var(--sb-ink)'}} />
          </div>
        )}
        {showSuggestions && suggestions.length > 0 && !geocode.isPending && !createRun.isPending && (
          <div className="absolute top-full left-0 right-0 z-50 mt-0.5 overflow-hidden" style={{background:'#fff', border:'1px solid var(--sb-line)', borderRadius:'8px', boxShadow:'var(--shadow-m)'}}>
            {suggestions.map((s, i) => (
              <button
                key={s.place_name}
                type="button"
                onMouseDown={() => { suppressBlurRef.current = true; }}
                onClick={() => {
                  setAddressValue(s.place_name);
                  setShowSuggestions(false);
                  setSuggestions([]);
                  setHighlightedIdx(-1);
                  submitAddress(s.place_name);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-xs font-body flex items-start gap-2 transition-colors",
                  i === highlightedIdx
                    ? "bg-[#f5f3ef]"
                    : "hover:bg-[#faf9f6]"
                )}
                style={{color:'var(--sb-ink-2)'}}
                data-testid={`suggestion-${i}`}
              >
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" style={{color:'var(--sb-muted)'}} />
                <span className="leading-snug">{s.place_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );

  if (!user) {
    return (
      <div className="w-[246px] h-screen flex flex-col shrink-0 no-print border-r" style={{background:'var(--paper-2)', borderColor:'var(--sb-line)'}}>
        <div className="flex items-center gap-2" style={{padding:'18px 16px 17px', borderBottom:'1px solid var(--sb-line)'}}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="transition-colors p-1 shrink-0 hover:opacity-70" style={{color:'var(--sb-muted)'}} title="Menu">
                <Menu className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {[
                { href: "/discovery", label: "Market Discovery", icon: <Compass className="w-4 h-4" />, subscriberOnly: true },
                { href: "/compare", label: "Compare Properties", icon: <Scale className="w-4 h-4" />, subscriberOnly: true },
                { href: "/how-it-works", label: "How It Works", icon: <BookOpen className="w-4 h-4" />, subscriberOnly: false },
                { href: "/about", label: "About", icon: <Info className="w-4 h-4" />, subscriberOnly: false },
                { href: "/faq", label: "FAQ", icon: <HelpCircle className="w-4 h-4" />, subscriberOnly: false },
              ].map(({ href, label, icon, subscriberOnly }) => {
                const locked = subscriberOnly;
                return (
                  <DropdownMenuItem
                    key={href}
                    onClick={() => locked ? setLockedFeature(label) : setLocation(href)}
                    className="gap-2 cursor-pointer"
                  >
                    {icon}
                    <span className="flex-1">{label}</span>
                    {locked && <Lock className="w-3 h-3 shrink-0 text-muted-foreground" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setSignInEmail(''); setSignInPassword(''); setSignInError(''); setShowSignInModal(true); }} className="gap-2 cursor-pointer" data-testid="button-signin">
                <LogIn className="w-4 h-4" />
                Sign In
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-3 flex-1">
            <Logo size={36} className="shrink-0" />
            <h1 style={{fontFamily:'var(--font-serif)', fontSize:'22px', color:'var(--sb-ink)', margin:0, fontWeight:'normal'}}>
              KnowYourProp
            </h1>
          </div>
        </div>

        <div className="px-4 pb-4 pt-6">
          {isSearching ? addressSearchInput : newAnalysisButton}
        </div>

        <div className="flex-1" />

        <div className="p-4 space-y-3" style={{borderTop:'1px solid var(--sb-line)'}}>
          <p className="text-[11px] font-body text-center leading-relaxed" style={{color:'var(--sb-muted)'}}>
            Sign in to save your run history and access reports from any device.
          </p>
          <div className="text-xs text-center" style={{color:'var(--sb-muted)'}}>&copy; 2025 KNOW YOUR PROPERTY</div>
          <div className="text-[10px] text-center opacity-60" style={{color:'var(--sb-muted)'}} data-testid="text-build-id">build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</div>
        </div>

        {lockedFeature && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setLockedFeature(null); }}
          >
            <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-sm mx-4 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#eae8e2]">
                <span className="flex items-center gap-2.5 font-jbmono text-xs font-bold uppercase tracking-widest text-foreground"><Logo size={22} className="shrink-0" />Subscriber Feature</span>
                <button
                  onClick={() => setLockedFeature(null)}
                  className="text-[#8b8a84] hover:text-foreground transition-colors text-lg leading-none"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-[#2b3a9e] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <h2 className="font-jbmono text-xl font-bold text-foreground uppercase tracking-tight mb-3">
                  {lockedFeature}
                </h2>
                <p className="text-sm font-body text-gray-500 mb-6 leading-relaxed">
                  This feature is available to monthly subscribers. Upgrade for $99/month to unlock unlimited reports, saved history, and full market intelligence tools.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => { setLockedFeature(null); setLocation('/checkout?type=subscription'); }}
                    className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
                  >
                    View Plans — $99 / Month
                  </button>
                  <button
                    onClick={() => setLockedFeature(null)}
                    className="w-full border border-[#ddd9d0] rounded-[10px] text-foreground font-body text-sm py-3 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {showSignInModal && createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#eae8e2]">
                <span className="flex items-center gap-2.5 font-jbmono text-xs font-bold uppercase tracking-widest text-foreground"><Logo size={22} className="shrink-0" />Sign In</span>
                <button onClick={() => setShowSignInModal(false)} className="text-[#8b8a84] hover:text-foreground transition-colors text-lg leading-none" aria-label="Close">✕</button>
              </div>
              <form
                className="p-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSignInError('');
                  setSignInLoading(true);
                  try {
                    await login(signInEmail, signInPassword);
                    setShowSignInModal(false);
                  } catch (err: any) {
                    setSignInError(err.message || 'Invalid email or password.');
                  } finally {
                    setSignInLoading(false);
                  }
                }}
              >
                <div className="space-y-3">
                  <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                    <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Email</label>
                    <input type="email" required value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none" placeholder="you@example.com" autoComplete="email" data-testid="input-signin-email" />
                  </div>
                  <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                    <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Password</label>
                    <input type="password" required value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none" placeholder="••••••••" autoComplete="current-password" data-testid="input-signin-password" />
                  </div>
                </div>
                {signInError && <p className="text-xs font-body text-[#b3311f] border border-[#eae8e2] bg-[#faf9f6] rounded-lg px-3 py-2">{signInError}</p>}
                <button type="submit" disabled={signInLoading} className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-50" data-testid="button-signin-submit">
                  {signInLoading ? 'Signing In...' : 'Sign In →'}
                </button>
              </form>
              <div className="mt-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 border-t border-[#eae8e2]" />
                  <span className="text-[10px] uppercase tracking-widest text-[#8b8a84] font-body">or</span>
                  <div className="flex-1 border-t border-[#eae8e2]" />
                </div>
                <GoogleSignInButton />
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="w-[246px] h-screen flex flex-col shrink-0 no-print border-r" style={{background:'var(--paper-2)', borderColor:'var(--sb-line)'}}>
      {showFunnel && funnelPendingAddress && (
        <FunnelModal
          address={funnelPendingAddress}
          onComplete={handleFunnelComplete}
        />
      )}
      <div className="flex items-center gap-2" style={{padding:'18px 16px 17px', borderBottom:'1px solid var(--sb-line)'}}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="transition-colors p-1 shrink-0 hover:opacity-70" style={{color:'var(--sb-muted)'}} title="Menu">
              <Menu className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {[
              { href: "/discovery", label: "Market Discovery", icon: <Compass className="w-4 h-4" />, subscriberOnly: true },
              { href: "/compare", label: "Compare Properties", icon: <Scale className="w-4 h-4" />, subscriberOnly: true },
              { href: "/how-it-works", label: "How It Works", icon: <BookOpen className="w-4 h-4" />, subscriberOnly: false },
              { href: "/about", label: "About", icon: <Info className="w-4 h-4" />, subscriberOnly: false },
              { href: "/faq", label: "FAQ", icon: <HelpCircle className="w-4 h-4" />, subscriberOnly: false },
            ].map(({ href, label, icon, subscriberOnly }) => {
              const locked = subscriberOnly && !isSubscriber;
              return (
                <DropdownMenuItem
                  key={href}
                  onClick={() => locked ? setLockedFeature(label) : setLocation(href)}
                  className="gap-2 cursor-pointer"
                >
                  {icon}
                  <span className="flex-1">{label}</span>
                  {locked && <Lock className="w-3 h-3 shrink-0 text-muted-foreground" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => { await logout(); window.location.href = '/'; }} className="gap-2 cursor-pointer text-muted-foreground" data-testid="button-signout">
              <LogOut className="w-4 h-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-3 flex-1">
          <Logo size={36} className="shrink-0" />
          <h1 style={{fontFamily:'var(--font-serif)', fontSize:'22px', color:'var(--sb-ink)', margin:0, fontWeight:'normal'}}>
            KnowYourProp
          </h1>
        </div>
      </div>

      {user && (
        <div className="px-4 pb-4 pt-6">
          {isSearching ? addressSearchInput : newAnalysisButton}
        </div>
      )}

      <div className="px-6 py-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{color:'var(--sb-muted)'}}>
          <History className="w-3 h-3" />
          Previous Runs
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-[#f5f3ef]" style={{color:'var(--sb-muted)'}} data-testid="button-filter-runs">
              <Filter className={cn("w-3.5 h-3.5", filterMode === 'favorites' && "!text-[#2b3a9e]")} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setFilterMode('all')}
              className={filterMode === 'all' ? 'bg-accent' : ''}
              data-testid="menu-item-filter-all"
            >
              All Runs
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setFilterMode('favorites')}
              className={filterMode === 'favorites' ? 'bg-accent' : ''}
              data-testid="menu-item-filter-favorites"
            >
              Favorites Only
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:'var(--sb-muted)'}} />
          <Input
            placeholder="Search runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs placeholder:text-[#8b8a84]"
            style={{background:'#fff', border:'1px solid var(--sb-line-2)', color:'var(--sb-ink)'}}
            data-testid="input-search-runs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-60"
              style={{color:'var(--sb-muted)'}}
              data-testid="button-clear-search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-2 pb-4 pr-1">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg" style={{background:'var(--sb-line)'}} />
            ))
          ) : filteredRuns?.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm" style={{color:'var(--sb-muted)'}}>
                {searchQuery.trim() 
                  ? 'No runs match your search.' 
                  : filterMode === 'favorites' 
                    ? 'No favorite runs yet.' 
                    : 'No saved runs yet.'}
              </p>
            </div>
          ) : (
            filteredRuns?.map((run) => (
              <div
                key={run.id}
                className="group flex flex-col p-3 cursor-pointer transition-all"
                style={{
                  borderRadius: '8px',
                  background: isRunActive(run.id) ? '#ffffff' : 'transparent',
                  boxShadow: isRunActive(run.id) ? 'inset 3px 0 0 var(--ref-blue)' : 'none',
                }}
                onMouseEnter={e => { if (!isRunActive(run.id)) (e.currentTarget as HTMLElement).style.background = '#ffffff'; }}
                onMouseLeave={e => { if (!isRunActive(run.id)) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => setLocation(`/run/${run.id}`)}
                data-testid={`card-run-${run.id}`}
              >
                <span className="font-medium text-sm truncate" style={{color:'var(--sb-ink)'}}>
                  {formatStreetAddress(run.address)}
                </span>

                {run.label && (
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 mt-1 self-start" style={{background:'#eef0fb', color:'#2b3a9e'}} data-testid={`tag-run-label-${run.id}`}>
                    {run.label}
                  </span>
                )}

                {run.createdAt && (
                  <span className="text-xs font-jbmono mt-1" style={{color:'var(--sb-muted)'}}>
                    {format(new Date(run.createdAt), "MMM d, yyyy")}
                  </span>
                )}
                
                <div className="flex items-center gap-3 mt-2">
                  <button
                    className="p-1 transition-colors"
                    style={{color: isInCompare(run.id) ? 'var(--ref-blue)' : 'var(--sb-muted)'}}
                    onClick={(e) => handleAddToCompare(e, { id: run.id, address: run.address, lastProjectType: run.lastProjectType, label: run.label })}
                    title={isInCompare(run.id) ? "Remove from compare" : "Add to compare"}
                    data-testid={`button-compare-${run.id}`}
                  >
                    <Scale className="w-4 h-4" />
                  </button>
                  
                  <button
                    className="p-1 transition-colors"
                    style={{color: run.isFavorite ? 'var(--ref-blue)' : 'var(--sb-muted)'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite.mutate(run.id);
                    }}
                    title={run.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    data-testid={`button-favorite-${run.id}`}
                  >
                    <Star className={cn("w-4 h-4", run.isFavorite && "fill-current")} />
                  </button>
                  
                  <button
                    className="p-1 transition-colors"
                    style={{color:'var(--sb-muted)'}}
                    onClick={(e) => handleDeleteClick(e, { id: run.id, address: run.address })}
                    title="Delete run"
                    data-testid={`button-delete-${run.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {hiddenRunCount > 0 && (
        <div className="px-4 py-2" style={{borderTop:'1px solid var(--sb-line)'}}>
          <p className="text-[10px] font-body text-center" style={{color:'var(--sb-muted)'}}>
            +{hiddenRunCount} older {hiddenRunCount === 1 ? 'run' : 'runs'} — <button onClick={() => setLocation('/checkout?type=subscription')} className="underline transition-colors" style={{color:'var(--sb-ink-2)'}}>subscribe for full history</button>
          </p>
        </div>
      )}
      
      <div className="p-4 space-y-3" style={{borderTop:'1px solid var(--sb-line)'}}>
        {compareItems.length > 0 && (
          <div className="flex gap-2">
            <Button 
              variant="default" 
              size="sm" 
              className="flex-1"
              onClick={() => setLocation("/compare")}
              data-testid="button-go-to-compare"
            >
              <Scale className="w-4 h-4 mr-2" />
              Compare ({compareItems.length}/3)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCompare}
              data-testid="button-clear-compare"
              title="Clear compare basket"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        
        {compareHistory.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between hover:bg-[#f5f3ef]"
                style={{color:'var(--sb-ink-2)'}}
                data-testid="button-toggle-compare-history"
              >
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Compare History ({compareHistory.length})
                </span>
                {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              {compareHistory.slice(0, 5).map((entry) => (
                <div 
                  key={entry.id}
                  className="flex items-center gap-1 p-2 rounded transition-colors text-xs hover:bg-[#f5f3ef]"
                  style={{background:'var(--sb-line)'}}
                  title={(entry.addresses as string[]).map(a => formatStreetAddress(a).split(',')[0].toUpperCase()).join(' vs. ')}
                >
                  <button
                    className="flex-1 text-left truncate"
                    style={{color:'var(--sb-ink-2)'}}
                    onClick={() => {
                      loadFromHistory(entry);
                      setLocation("/compare");
                    }}
                    data-testid={`button-load-history-${entry.id}`}
                  >
                    {entry.addresses.slice(0, 2).map(a => formatStreetAddress(a).split(',')[0]).join(' vs ')}
                    {entry.addresses.length > 2 && ` +${entry.addresses.length - 2}`}
                  </button>
                  <button
                    className="p-1 rounded shrink-0 hover:opacity-70"
                    style={{color:'var(--sb-muted)'}}
                    onClick={() => deleteHistoryEntry(entry.id)}
                    data-testid={`button-delete-history-${entry.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs hover:bg-[#fbecea]"
                style={{color:'var(--sb-muted)'}}
                onClick={clearHistory}
                data-testid="button-clear-compare-history"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear History
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}
        
        {runs && runs.length > 0 && (
          <button
            className="w-full flex items-center justify-center gap-2 text-xs font-jbmono font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{
              background:'var(--sb-risk-bg)', color:'var(--sb-risk)',
              border:'1px solid var(--sb-risk-line)', borderRadius:'8px',
              padding:'9px', cursor:'pointer', fontFamily:'var(--font-jbmono)'
            }}
            onClick={() => setClearAllDialogOpen(true)}
            data-testid="button-clear-all-runs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All Runs
          </button>
        )}
        <div className="text-xs text-center" style={{color:'var(--sb-muted)'}}>
          &copy; 2025 KNOW YOUR PROPERTY
        </div>
        <div className="text-[10px] text-center opacity-60" style={{color:'var(--sb-muted)'}} data-testid="text-build-id-2">build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the analysis for {runToDelete?.address} and all its scenarios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all runs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {runs?.length || 0} saved runs and their scenarios. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmClearAll}
              data-testid="button-confirm-clear-all"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade modal portal — shown when a locked feature is clicked */}
      {lockedFeature && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setLockedFeature(null); }}
        >
          <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eae8e2]">
              <span className="flex items-center gap-2.5 font-jbmono text-xs font-bold uppercase tracking-widest text-foreground"><Logo size={22} className="shrink-0" />Subscriber Feature</span>
              <button
                onClick={() => setLockedFeature(null)}
                className="text-[#8b8a84] hover:text-foreground transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-[#2b3a9e] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <h2 className="font-jbmono text-xl font-bold text-foreground uppercase tracking-tight mb-3">
                {lockedFeature}
              </h2>
              <p className="text-sm font-body text-gray-500 mb-6 leading-relaxed">
                This feature is available to monthly subscribers. Upgrade for $99/month to unlock unlimited reports, saved history, and full market intelligence tools.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => { setLockedFeature(null); setLocation('/checkout?type=subscription'); }}
                  className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
                  data-testid="button-upgrade-modal-subscribe"
                >
                  View Plans — $99 / Month
                </button>
                <button
                  onClick={() => setLockedFeature(null)}
                  className="w-full border border-[#ddd9d0] rounded-[10px] text-foreground font-body text-sm py-3 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors"
                  data-testid="button-upgrade-modal-close"
                >
                  ← Back
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSignInModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eae8e2]">
              <span className="flex items-center gap-2.5 font-jbmono text-xs font-bold uppercase tracking-widest text-foreground"><Logo size={22} className="shrink-0" />Sign In</span>
              <button onClick={() => setShowSignInModal(false)} className="text-[#8b8a84] hover:text-foreground transition-colors text-lg leading-none" aria-label="Close">✕</button>
            </div>
            <form
              className="p-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setSignInError('');
                setSignInLoading(true);
                try {
                  await login(signInEmail, signInPassword);
                  setShowSignInModal(false);
                } catch (err: any) {
                  setSignInError(err.message || 'Invalid email or password.');
                } finally {
                  setSignInLoading(false);
                }
              }}
            >
              <div className="space-y-3">
                <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                  <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Email</label>
                  <input
                    type="email"
                    required
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                    placeholder="you@example.com"
                    autoComplete="email"
                    data-testid="input-signin-email"
                  />
                </div>
                <div className="border border-[#ddd9d0] rounded-lg bg-white focus-within:border-[#2b3a9e] focus-within:ring-2 focus-within:ring-[#2b3a9e]/20 transition-colors">
                  <label className="block px-3 pt-2 pb-0.5 font-jbmono text-[10px] font-bold uppercase tracking-widest text-[#8b8a84]">Password</label>
                  <input
                    type="password"
                    required
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    className="w-full px-3 pb-2 text-sm font-body text-foreground bg-transparent rounded-lg outline-none"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    data-testid="input-signin-password"
                  />
                </div>
              </div>
              {signInError && <p className="text-xs font-body text-[#b3311f] border border-[#eae8e2] bg-[#faf9f6] rounded-lg px-3 py-2">{signInError}</p>}
              <button
                type="submit"
                disabled={signInLoading}
                className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-50"
                data-testid="button-signin-submit"
              >
                {signInLoading ? 'Signing In...' : 'Sign In →'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
