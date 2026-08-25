import { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Mic, MicOff, Search, X } from "lucide-react";
import { Logo } from "@/components/Logo";

export interface FunnelAnswers {
  role: string | null;
  transactionType: string | null;
  projectType: string | null;
  freeformDescription: string | null;
  referralNeeds: string[] | null;
}

interface Props {
  address: string;
  onComplete: (answers: FunnelAnswers | null) => void;
  initialAnswers?: FunnelAnswers | null;
}

export const ROLES = [
  { id: "broker_buy", label: "Real Estate Broker — Buy Side" },
  { id: "broker_sell", label: "Real Estate Broker — Sell Side" },
  { id: "owner_operator", label: "Owner / Operator" },
  { id: "owner_primary", label: "Owner — Primary Residence" },
  { id: "renter", label: "Renter" },
  { id: "investor", label: "Investor / Developer" },
  { id: "lender", label: "Lender / Underwriter" },
];

export const REFERRAL_OPTIONS = [
  { id: "residential_lender", label: "Residential Lender Recommendations" },
  { id: "commercial_lender", label: "Commercial / SBA Lender Recommendations" },
  { id: "tax_attorney", label: "Tax Attorney Recommendations" },
  {
    id: "zoning_attorney",
    label: "Zoning Attorney Recommendations",
    note: "We automatically recommend attorneys familiar with your alderman when a variance or rezoning is required. Select this if you want a referral regardless.",
  },
];

export const TRANSACTION_TYPES = [
  { id: "purchasing", label: "Purchasing the Building" },
  { id: "leasing_commercial", label: "Leasing Commercial Space\n(as Tenant)" },
  { id: "leasing_residential", label: "Leasing a Residential Apartment\n(as Tenant)" },
  { id: "leasing_landlord", label: "Leasing Out Space\n(as Landlord)" },
];

const USE_TYPES = [
  "Not Applicable / Unknown",
  "Restaurant / Bar",
  "Bar / Tavern",
  "Fast Food / Quick Service",
  "Coffee Shop / Cafe",
  "Bakery",
  "Grocery Store",
  "Convenience Store",
  "Pharmacy / Drug Store",
  "Liquor Store",
  "Daycare / Child Care Center",
  "Preschool / Pre-K",
  "After-School Program",
  "Private School / Tutoring Center",
  "Medical / Dental Office",
  "Urgent Care Clinic",
  "Mental Health / Counseling",
  "Physical Therapy / Rehab",
  "Veterinary Clinic",
  "Gym / Fitness Center",
  "Yoga / Pilates Studio",
  "Martial Arts Studio",
  "Hair Salon / Barbershop",
  "Nail Salon / Spa",
  "Tattoo / Piercing Studio",
  "Retail Store (general)",
  "Clothing / Apparel",
  "Footwear",
  "Bookstore / Gift Shop",
  "Electronics Store",
  "Hardware / Home Goods",
  "Furniture Store",
  "Auto Parts / Accessories",
  "Cannabis Dispensary",
  "Cannabis Cultivation / Processing",
  "Hotel / Motel",
  "Bed & Breakfast",
  "Extended Stay / Hostel",
  "Office / Professional Services",
  "Co-Working Space",
  "Financial Services / Bank",
  "Insurance Office",
  "Law Office",
  "Accounting / Consulting",
  "Tech / Startup Office",
  "Creative Agency / Design Studio",
  "Recording Studio",
  "Art Gallery / Studio",
  "Photography / Film Studio",
  "Theater / Performance Space",
  "Event Space / Banquet Hall",
  "Nightclub / Entertainment Venue",
  "Escape Room / Entertainment",
  "Bowling / Arcade",
  "Light Industrial / Manufacturing",
  "Warehouse / Distribution",
  "Self-Storage",
  "Auto Repair / Body Shop",
  "Auto Sales / Rental",
  "Car Wash",
  "Parking / Garage",
  "Gas Station",
  "Multifamily / Apartment Building",
  "Mixed-Use (residential + commercial)",
  "Single-Family Residential",
  "Senior / Assisted Living",
  "Social Services / Non-Profit",
  "Church / Religious Organization",
  "Community Center",
  "Government / Municipal",
  "Laundromat / Dry Cleaner",
  "Printing / Copy Shop",
  "Shipping / Logistics",
  "Funeral Home",
  "Something Else",
];

const FUNNEL_DRILL_TYPES: Record<string, { prompt: string; chips: string[]; placeholder: string }> = {
  "Restaurant / Bar":               { prompt: "What type of cuisine or concept?",    chips: ["Indian restaurant", "Mexican restaurant", "Italian restaurant", "Chinese restaurant", "Japanese restaurant", "American restaurant", "Thai restaurant", "Mediterranean restaurant", "Soul food", "Caribbean restaurant"], placeholder: "e.g. Korean BBQ, Peruvian, Ethiopian…" },
  "Bar / Tavern":                   { prompt: "What type of bar?",                   chips: ["Sports bar", "Cocktail bar", "Wine bar", "Dive bar", "Craft beer bar", "Rooftop bar"], placeholder: "e.g. karaoke bar, jazz lounge…" },
  "Fast Food / Quick Service":      { prompt: "What food concept?",                  chips: ["Taco shop", "Pizza spot", "Burger joint", "Wing spot", "Sandwich shop", "Fried chicken"], placeholder: "e.g. poke bowl, ramen counter…" },
  "Coffee Shop / Cafe":             { prompt: "Any specific concept?",               chips: ["Specialty coffee shop", "Bakery cafe", "Tea house", "Juice & smoothie bar", "Boba tea shop"], placeholder: "e.g. dessert cafe, crepe shop…" },
  "Bakery":                         { prompt: "What type of bakery?",                chips: ["Mexican bakery", "Artisan bread bakery", "Donut shop", "Cake & pastry shop", "Polish bakery"], placeholder: "e.g. gluten-free bakery, Filipino bakery…" },
  "Grocery Store":                  { prompt: "What type of grocery?",               chips: ["Mexican grocery", "Asian grocery", "Natural & organic", "Corner market", "International foods", "Halal market"], placeholder: "e.g. African grocery, Indian market…" },
  "Medical / Dental Office":        { prompt: "What type of practice?",              chips: ["Dental office", "Urgent care", "Primary care", "Mental health clinic", "Physical therapy", "Dermatology"], placeholder: "e.g. chiropractic, ophthalmology…" },
  "Urgent Care Clinic":             { prompt: "What type of clinic?",                chips: ["Urgent care", "Walk-in clinic", "Occupational health", "Pediatric urgent care"], placeholder: "e.g. telehealth clinic…" },
  "Mental Health / Counseling":     { prompt: "What type of practice?",              chips: ["Individual therapy", "Group therapy", "Substance abuse counseling", "Child & adolescent therapy"], placeholder: "e.g. trauma-focused therapy, couples counseling…" },
  "Physical Therapy / Rehab":       { prompt: "What type of practice?",              chips: ["Physical therapy", "Occupational therapy", "Sports rehab", "Post-surgical rehab"], placeholder: "e.g. neurological rehab…" },
  "Gym / Fitness Center":           { prompt: "What type of facility?",              chips: ["CrossFit gym", "Boxing gym", "Yoga studio", "Martial arts gym", "Dance studio", "Pilates studio"], placeholder: "e.g. wrestling gym, swim school…" },
  "Retail Store (general)":         { prompt: "What will you sell?",                 chips: ["Clothing store", "Sneaker shop", "Gift shop", "Beauty supply", "Home goods", "Electronics"], placeholder: "e.g. toy store, comic book shop…" },
  "Hotel / Motel":                  { prompt: "What type of property?",              chips: ["Boutique hotel", "Extended stay hotel", "Budget motel", "Hostel", "Bed & breakfast"], placeholder: "e.g. micro-hotel, apart-hotel…" },
  "Auto Repair / Body Shop":        { prompt: "What type of shop?",                  chips: ["Tire shop", "Collision repair", "Oil change", "General auto repair", "Electric vehicle repair"], placeholder: "e.g. transmission shop, detailing…" },
  "Nail Salon / Spa":               { prompt: "Nail salon or spa?",                  chips: ["Nail salon", "Day spa", "Massage therapy", "Waxing studio", "Med spa"], placeholder: "e.g. Korean spa, eyelash studio…" },
  "Hair Salon / Barbershop":        { prompt: "Salon or barbershop?",                chips: ["Barbershop", "Hair salon", "Hair braiding salon", "Locs & natural hair", "Dominican salon"], placeholder: "e.g. blowout bar, wig studio…" },
  "Event Space / Banquet Hall":     { prompt: "What type of events?",                chips: ["Wedding venue", "Corporate event space", "Birthday & party venue", "Quinceañera hall", "Community space"], placeholder: "e.g. concert venue, art event space…" },
  "Nightclub / Entertainment Venue":{ prompt: "What type of venue?",                 chips: ["Nightclub", "Comedy club", "Music venue", "Karaoke bar", "Jazz club", "Latin club"], placeholder: "e.g. drag show venue, dance hall…" },
  "Cannabis Dispensary":            { prompt: "Any additional detail?",              chips: ["Recreational dispensary", "Medical dispensary", "Recreational & medical"], placeholder: "e.g. delivery-only dispensary…" },
};

const STEP_QUESTIONS: Record<number, string> = {
  0: "Who are you?",
  1: "What are you doing with this property?",
  2: "What type of use are you considering?",
  3: "What professional help are you looking for?",
  4: "Anything to add?",
};

const STEP_SUBTITLES: Record<number, string> = {
  0: "Your answers customize the analysis report.",
  1: "Your answers customize the analysis report.",
  2: "We'll tailor zoning, incentives, and market data to your use.",
  3: "We'll surface relevant professional referrals in your report.",
  4: "Optional — any extra detail helps refine the report.",
};

const TOTAL_STEPS = 5;

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -56 : 56, opacity: 0 }),
};

export function FunnelModal({ address, onComplete, initialAnswers }: Props) {
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [role, setRole] = useState<string | null>(initialAnswers?.role ?? null);
  const [transactionType, setTransactionType] = useState<string | null>(initialAnswers?.transactionType ?? null);
  const [projectType, setProjectType] = useState<string | null>(initialAnswers?.projectType ?? null);

  const [useTypeSearch, setUseTypeSearch] = useState(initialAnswers?.projectType ?? "");
  const [useTypeSelected, setUseTypeSelected] = useState(initialAnswers?.projectType != null);
  const [showUseDropdown, setShowUseDropdown] = useState(false);
  const [drillDownActive, setDrillDownActive] = useState(false);
  const [drillDownValue, setDrillDownValue] = useState("");
  const [description, setDescription] = useState(initialAnswers?.freeformDescription ?? "");
  const [referralNeeds, setReferralNeeds] = useState<string[]>(initialAnswers?.referralNeeds ?? []);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const useTypeInputRef = useRef<HTMLInputElement>(null);

  const hasSpeech =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const stopDictation = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const toggleDictation = () => {
    if (isListening) {
      stopDictation();
      return;
    }
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    rec.onresult = (ev: any) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      setDescription(text);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  };

  const filteredUseTypes = USE_TYPES.filter((t) =>
    t.toLowerCase().includes(useTypeSearch.toLowerCase())
  );

  const goBack = () => {
    if (drillDownActive) {
      setDrillDownActive(false);
      return;
    }
    setDirection(-1);
    if (step === 3 && projectType && FUNNEL_DRILL_TYPES[projectType]) {
      setDrillDownActive(true);
      setStep(2);
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  };

  const goForward = () => {
    setDirection(1);
    setStep((s) => s + 1);
  };

  const selectRole = (r: string) => {
    setRole(r);
    setTimeout(() => { setDirection(1); setStep(1); }, 160);
  };

  const selectTransaction = (t: string) => {
    setTransactionType(t);
    setTimeout(() => { setDirection(1); setStep(2); }, 160);
  };

  const selectUseType = (t: string) => {
    const isNA = t === "Not Applicable / Unknown";
    setProjectType(isNA ? null : t);
    setUseTypeSearch(isNA ? "" : t);
    setUseTypeSelected(true);
    setShowUseDropdown(false);
    if (!isNA && FUNNEL_DRILL_TYPES[t]) {
      setDrillDownValue("");
      setDrillDownActive(true);
    } else {
      setDrillDownActive(false);
      setDirection(1);
      setStep(3);
    }
  };

  const toggleReferral = (id: string) => {
    setReferralNeeds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const finalize = () => {
    stopDictation();
    onComplete({
      role,
      transactionType,
      projectType: projectType || (useTypeSearch.trim() || null),
      freeformDescription: drillDownValue.trim() || description.trim() || null,
      referralNeeds: referralNeeds.length > 0 ? referralNeeds : null,
    });
  };

  // Skip everything. If the user already answered something, keep those answers;
  // otherwise treat it as a full skip.
  const handleSkip = () => {
    stopDictation();
    const answeredAnything = !!(
      role || transactionType || projectType || useTypeSearch.trim() ||
      drillDownValue.trim() || description.trim() || referralNeeds.length > 0
    );
    if (answeredAnything) {
      finalize();
    } else {
      onComplete(null);
    }
  };

  // Skip just the current question and move on — clearing whatever was
  // entered on this step so a "skipped" answer is never persisted.
  const skipQuestion = () => {
    if (step === 0) setRole(null);
    if (step === 1) setTransactionType(null);
    if (step === 2 && !drillDownActive) { setProjectType(null); setUseTypeSearch(""); setUseTypeSelected(false); }
    if (step === 2 && drillDownActive) setDrillDownValue("");
    if (step === 3) setReferralNeeds([]);
    if (step === 4) setDescription("");
    if (step === 2 && drillDownActive) {
      setDrillDownActive(false);
      setDirection(1);
      setStep(3);
      return;
    }
    if (step >= TOTAL_STEPS - 1) {
      finalize();
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const modal = (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="bg-white border border-[#eae8e2] rounded-[14px] shadow-[0_20px_46px_rgba(20,20,20,0.12),0_6px_16px_rgba(20,20,20,0.06)] w-full max-w-lg relative overflow-hidden">

        {showIntro ? (
          /* Intro screen */
          <div className="px-8 py-10 flex flex-col items-center text-center gap-6 relative">
            <button
              onClick={handleSkip}
              className="absolute top-0 right-0 p-2 text-[#8b8a84] hover:text-foreground transition-colors"
              data-testid="button-funnel-intro-close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <Logo size={22} className="shrink-0" />
            <div>
              <h2 className="font-jbmono text-lg font-bold uppercase tracking-[0.06em] text-foreground mb-3">
                Customize Your Report
              </h2>
              <p className="text-sm font-body text-gray-500 leading-relaxed">
                These next <strong className="text-black">5 quick questions</strong> help us tailor zoning incentives, financing options, and market data specifically to your project. You can skip any question — or skip them all.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => setShowIntro(false)}
                className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
                data-testid="button-funnel-intro-continue"
              >
                Continue →
              </button>
              <button
                onClick={handleSkip}
                className="w-full border border-[#ddd9d0] rounded-[10px] text-foreground font-body text-sm py-3 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors"
                data-testid="button-funnel-intro-skip"
              >
                Skip — show me the data
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="border-b border-[#eae8e2] px-4 py-3 flex items-center justify-between gap-3">
          {/* Back button — only shown from step 1 onward */}
          <button
            onClick={goBack}
            className={`flex items-center gap-1 text-xs font-body text-foreground border border-[#ddd9d0] rounded-lg px-2.5 py-1.5 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors flex-shrink-0 ${step === 0 ? "invisible pointer-events-none" : ""}`}
            data-testid="button-funnel-back"
            aria-hidden={step === 0}
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          {/* Step counter */}
          <p className="text-xs font-jbmono font-bold uppercase tracking-widest text-[#8b8a84] flex-1 text-center">
            {step + 1} / {TOTAL_STEPS}
          </p>

          {/* Skip current question / skip everything */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={skipQuestion}
              className="text-xs font-body text-foreground border border-[#ddd9d0] rounded-lg px-2.5 py-1.5 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors whitespace-nowrap"
              data-testid="button-funnel-skip"
            >
              Skip question
            </button>
            <button
              onClick={handleSkip}
              className="text-xs font-body text-[#8b8a84] px-1.5 py-1.5 hover:text-[#2b3a9e] transition-colors whitespace-nowrap"
              data-testid="button-funnel-skip-all"
            >
              Skip all
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-0.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 transition-all duration-300 ${
                i <= step ? "bg-[#2b3a9e]" : "bg-[#eae8e2]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 pt-5 pb-6 min-h-[300px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: "easeInOut" }}
            >
              <h2 className="font-jbmono text-lg font-bold uppercase tracking-tight text-foreground mb-1">
                {step === 2 && drillDownActive && projectType && FUNNEL_DRILL_TYPES[projectType]
                  ? FUNNEL_DRILL_TYPES[projectType].prompt
                  : STEP_QUESTIONS[step]}
              </h2>
              <p className="text-xs font-body text-gray-400 mb-5">
                {step === 2 && drillDownActive
                  ? "Pick one or type your own below."
                  : STEP_SUBTITLES[step]}
              </p>

              {/* Step 0: Role */}
              {step === 0 && (
                <div className="flex flex-col gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectRole(r.id)}
                      className={`text-left border rounded-[10px] px-4 py-2.5 text-sm font-body transition-colors ${role === r.id ? "bg-[#2b3a9e] text-white border-[#2b3a9e]" : "border-[#ddd9d0] hover:border-[#2b3a9e] hover:bg-[#2b3a9e]/5"}`}
                      data-testid={`button-funnel-role-${r.id}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 1: Transaction type */}
              {step === 1 && (
                <div className="flex flex-col gap-2">
                  {TRANSACTION_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTransaction(t.id)}
                      className={`text-left border rounded-[10px] px-4 py-2.5 text-sm font-body transition-colors whitespace-pre-line ${transactionType === t.id ? "bg-[#2b3a9e] text-white border-[#2b3a9e]" : "border-[#ddd9d0] hover:border-[#2b3a9e] hover:bg-[#2b3a9e]/5"}`}
                      data-testid={`button-funnel-transaction-${t.id}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2a: Searchable use type dropdown */}
              {step === 2 && !drillDownActive && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      ref={useTypeInputRef}
                      type="text"
                      value={useTypeSearch}
                      onChange={(e) => {
                        setUseTypeSearch(e.target.value);
                        setProjectType(null);
                        setShowUseDropdown(true);
                      }}
                      onFocus={() => setShowUseDropdown(true)}
                      placeholder="Search or type a use type..."
                      className="w-full bg-white border border-[#ddd9d0] rounded-lg pl-9 pr-9 py-3 text-sm font-body outline-none focus:border-[#2b3a9e] focus:ring-2 focus:ring-[#2b3a9e]/20 transition-colors"
                      autoFocus
                      data-testid="input-funnel-use-type"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && useTypeSearch.trim()) {
                          const typed = useTypeSearch.trim();
                          setProjectType(typed);
                          setShowUseDropdown(false);
                          if (FUNNEL_DRILL_TYPES[typed]) {
                            setDrillDownValue("");
                            setDrillDownActive(true);
                          } else {
                            setDirection(1);
                            setStep(3);
                          }
                        }
                        if (e.key === "Escape") setShowUseDropdown(false);
                      }}
                    />
                    {useTypeSearch && (
                      <button
                        type="button"
                        onClick={() => { setUseTypeSearch(""); setProjectType(null); setShowUseDropdown(false); useTypeInputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8a84] hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {showUseDropdown && filteredUseTypes.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#eae8e2] rounded-lg shadow-[0_12px_28px_rgba(20,20,20,0.10)] z-10 max-h-52 overflow-y-auto">
                        {filteredUseTypes.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectUseType(t)}
                            className="w-full text-left px-4 py-2.5 text-sm font-body hover:bg-[#2b3a9e]/5 hover:text-[#2b3a9e] transition-colors border-b border-gray-100 last:border-0"
                            data-testid={`option-funnel-use-${t.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const typed = useTypeSearch.trim();
                      if (typed) setProjectType(typed);
                      setShowUseDropdown(false);
                      if (typed && FUNNEL_DRILL_TYPES[typed]) {
                        setDrillDownValue("");
                        setDrillDownActive(true);
                      } else {
                        setDirection(1);
                        setStep(3);
                      }
                    }}
                    disabled={!useTypeSelected && !useTypeSearch.trim()}
                    className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors disabled:opacity-30"
                    data-testid="button-funnel-use-type-next"
                  >
                    Next →
                  </button>
                  <button
                    onClick={() => { setProjectType(null); setUseTypeSelected(false); setDirection(1); setStep(3); }}
                    className="w-full text-xs font-body text-foreground border border-[#ddd9d0] rounded-[10px] py-2.5 hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors text-center"
                    data-testid="button-funnel-use-type-skip"
                  >
                    Skip this step
                  </button>
                </div>
              )}

              {/* Step 2b: Drill-down sub-step (shown after selecting a drillable type) */}
              {step === 2 && drillDownActive && projectType && FUNNEL_DRILL_TYPES[projectType] && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {FUNNEL_DRILL_TYPES[projectType].chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setDrillDownValue(drillDownValue === chip ? "" : chip)}
                        className={`border rounded-full px-3 py-1.5 text-xs font-body transition-colors ${
                          drillDownValue === chip
                            ? "bg-[#2b3a9e] text-white border-[#2b3a9e]"
                            : "border-[#ddd9d0] hover:border-[#2b3a9e] hover:text-[#2b3a9e]"
                        }`}
                        data-testid={`button-funnel-drill-${chip.toLowerCase().replace(/[\s/]+/g, "-")}`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={drillDownValue}
                    onChange={(e) => setDrillDownValue(e.target.value)}
                    placeholder={FUNNEL_DRILL_TYPES[projectType].placeholder}
                    className="w-full bg-white border border-[#ddd9d0] rounded-lg px-4 py-3 text-sm font-body outline-none focus:border-[#2b3a9e] focus:ring-2 focus:ring-[#2b3a9e]/20 transition-colors"
                    autoFocus={false}
                    data-testid="input-funnel-drill-custom"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setDirection(1); setStep(3); }
                    }}
                  />
                  <button
                    onClick={() => { setDirection(1); setStep(3); }}
                    className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
                    data-testid="button-funnel-drill-next"
                  >
                    {drillDownValue.trim() ? "Next →" : "Skip →"}
                  </button>
                </div>
              )}

              {/* Step 3: Referral preferences (multi-select) */}
              {step === 3 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-body text-gray-500 -mt-2 mb-1">Select all that apply — or none if you don't need referrals.</p>
                  {REFERRAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => toggleReferral(opt.id)}
                      className={`text-left border rounded-[10px] px-4 py-3 text-sm font-body transition-colors ${
                        referralNeeds.includes(opt.id)
                          ? "bg-[#2b3a9e] text-white border-[#2b3a9e]"
                          : "border-[#ddd9d0] hover:border-[#2b3a9e] hover:bg-[#2b3a9e]/5"
                      }`}
                      data-testid={`button-funnel-referral-${opt.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 w-4 h-4 shrink-0 border rounded flex items-center justify-center text-xs font-bold ${referralNeeds.includes(opt.id) ? "border-white bg-white text-[#2b3a9e]" : "border-[#ddd9d0]"}`}>
                          {referralNeeds.includes(opt.id) ? "✓" : ""}
                        </span>
                        <div>
                          <div>{opt.label}</div>
                          {(opt as any).note && (
                            <div className={`text-xs mt-1 leading-relaxed ${referralNeeds.includes(opt.id) ? "text-white/70" : "text-gray-400"}`}>
                              {(opt as any).note}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => { setDirection(1); setStep(4); }}
                    className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors mt-1"
                    data-testid="button-funnel-referral-next"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Step 4: Freeform description */}
              {step === 4 && (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        projectType?.toLowerCase().includes('restaurant') ||
                        projectType?.toLowerCase().includes('food') ||
                        projectType?.toLowerCase().includes('cafe') ||
                        projectType?.toLowerCase().includes('bar') ||
                        projectType?.toLowerCase().includes('bakery')
                          ? "Specify the cuisine or concept — e.g. Indian restaurant, Italian bistro, Mexican taqueria, cocktail bar…"
                          : "Describe your vision for this space..."
                      }
                      className="w-full bg-white border border-[#ddd9d0] rounded-lg px-4 py-3 text-sm font-body outline-none focus:border-[#2b3a9e] focus:ring-2 focus:ring-[#2b3a9e]/20 transition-colors resize-none h-28 pr-10"
                      data-testid="input-funnel-freeform"
                      autoFocus
                    />
                    {hasSpeech && (
                      <button
                        type="button"
                        onClick={toggleDictation}
                        className={`absolute right-3 bottom-3 transition-colors ${
                          isListening
                            ? "text-[#2b3a9e] animate-pulse"
                            : "text-gray-400 hover:text-[#2b3a9e]"
                        }`}
                        data-testid="button-funnel-dictate"
                      >
                        {isListening ? (
                          <MicOff className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {isListening && (
                    <p className="text-[11px] font-body text-gray-400 animate-pulse">
                      Listening... speak now
                    </p>
                  )}
                  <button
                    onClick={finalize}
                    className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
                    data-testid="button-funnel-complete"
                  >
                    Show Me the Report →
                  </button>
                  <button
                    onClick={finalize}
                    className="w-full text-xs font-body text-[#8b8a84] hover:text-[#2b3a9e] transition-colors text-center pt-1"
                    data-testid="button-funnel-skip-freeform"
                  >
                    Skip — show me the data
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
          </>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
