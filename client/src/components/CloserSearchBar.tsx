import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGeocodeLookup, useGeocodeAutocomplete, OutsideChicagoError } from "@/hooks/use-runs";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

function isUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

interface CloserSearchBarProps {
  variant?: "dark" | "light";
  page: string;
}

export function CloserSearchBar({ variant = "dark", page }: CloserSearchBarProps) {
  const [address, setAddress] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showOutsideChicago, setShowOutsideChicago] = useState(false);
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards against double-firing when both mousedown and click handlers run.
  const suggestionPickedRef = useRef(false);
  const pickSuggestion = (addr: string) => {
    if (suggestionPickedRef.current) return;
    suggestionPickedRef.current = true;
    setTimeout(() => { suggestionPickedRef.current = false; }, 800);
    setAddress(addr);
    handleSearch(addr);
  };

  const inputIsUrl = isUrl(address);
  const { data: suggestions } = useGeocodeAutocomplete(inputIsUrl ? "" : address);
  const geocode = useGeocodeLookup();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Same submit path as the homepage hero: validate Chicago for direct
  // addresses, then route into the preview/funnel flow.
  const handleSearch = async (e: React.FormEvent | string) => {
    if (typeof e !== "string") e.preventDefault();
    const searchInput = (typeof e === "string" ? e : address).trim();
    if (!searchInput) return;
    setShowSuggestions(false);

    if (!isUrl(searchInput)) {
      try {
        await geocode.mutateAsync({ address: searchInput });
      } catch (err) {
        if (err instanceof OutsideChicagoError) {
          setShowOutsideChicago(true);
          return;
        }
        // Other errors (bad format, not found, etc.) — let the preview flow handle them
      }
    }

    setLocation(`/preview?address=${encodeURIComponent(searchInput)}`);
  };

  const fieldClasses =
    variant === "dark"
      ? "flex items-center gap-2 bg-white rounded-[14px] p-2 [box-shadow:0_14px_34px_rgba(0,0,0,.45),0_2px_6px_rgba(0,0,0,.3)]"
      : "flex items-center gap-2 bg-white border [border-color:#e5e2da] rounded-[14px] p-2 [box-shadow:0_6px_20px_rgba(20,20,20,.07),0_1px_3px_rgba(20,20,20,.04)]";

  return (
    <div ref={containerRef} className="relative w-full max-w-[560px] mx-auto text-left">
      <form onSubmit={handleSearch} className={fieldClasses}>
        <div className="relative flex-1">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#2b3a9e]" />
          <input
            placeholder="Enter a Chicago property address…"
            autoComplete="off"
            name="kyp-address-query"
            className="w-full pl-10 pr-3 h-11 sm:h-12 text-[15px] bg-transparent outline-none placeholder:text-[#8b8a84] font-body text-[#141414]"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (e.target.value.length >= 3 && !isUrl(e.target.value)) {
                setShowSuggestions(true);
              } else {
                setShowSuggestions(false);
              }
            }}
            onFocus={() => {
              if (!inputIsUrl && address.length >= 3) setShowSuggestions(true);
            }}
            data-testid={`input-closer-address-${page}`}
          />
        </div>
        <Button
          type="submit"
          className="h-11 sm:h-12 px-5 sm:px-6 text-sm font-semibold font-body bg-[#2b3a9e] hover:bg-[#3446bd] text-white rounded-[10px] border-0 transition-colors whitespace-nowrap"
          disabled={geocode.isPending}
          data-testid={`button-closer-run-${page}`}
        >
          {geocode.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Checking</span>
            </>
          ) : (
            <>Run report&nbsp;→</>
          )}
        </Button>
      </form>

      {variant === "dark" && (
        <p className="font-body text-[13px] text-white/50 text-center mt-3 mb-0">
          Any Chicago or Cook County address · answer in minutes
        </p>
      )}

      <AnimatePresence>
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute left-0 right-0 bottom-full mb-2 bg-white border [border-color:#ddd9d0] rounded-xl z-[9999] overflow-hidden [box-shadow:0_20px_46px_rgba(20,20,20,.14),0_6px_16px_rgba(20,20,20,.08)]"
          >
            <div className="max-h-[300px] overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  className="w-full text-left px-5 py-3.5 hover:bg-[#faf9f6] transition-colors flex items-center gap-3 border-b [border-color:#eae8e2] last:border-0 font-body"
                  onMouseDown={(e) => {
                    // Select on mousedown (not click) so a mid-click dropdown
                    // re-render or blur can't swallow the selection.
                    e.preventDefault();
                    pickSuggestion(suggestion.address);
                  }}
                  onTouchStart={() => pickSuggestion(suggestion.address)}
                  onClick={() => pickSuggestion(suggestion.address)}
                  data-testid={`suggestion-closer-${page}-${index}`}
                >
                  <MapPin className="h-4 w-4 text-[#8b8a84] shrink-0" />
                  <span className="text-sm text-[#141414]">{suggestion.address}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showOutsideChicago && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowOutsideChicago(false)}>
          <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] max-w-sm w-full relative text-left" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowOutsideChicago(false)}
              className="absolute top-4 right-4 text-[#8b8a84] hover:text-foreground transition-colors"
              data-testid={`button-close-outside-chicago-${page}`}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-8">
              <div className="flex items-center gap-2 mb-5">
                <MapPin className="w-5 h-5 flex-shrink-0 text-[#2b3a9e]" />
                <span className="font-jbmono font-bold text-xs uppercase tracking-[0.12em] text-[#8b8a84]">Service Area</span>
              </div>
              <p className="font-jbmono font-bold text-lg uppercase mb-2 text-[#141414]">Chicago Only</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                We are currently only serving the City of Chicago and will be expanding soon.
              </p>
              <Button
                type="button"
                onClick={() => setShowOutsideChicago(false)}
                className="w-full bg-[#2b3a9e] text-white hover:bg-[#3446bd] rounded-[10px] font-jbmono font-bold text-xs uppercase tracking-[0.12em]"
                data-testid={`button-outside-chicago-ok-${page}`}
              >
                Got It
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
