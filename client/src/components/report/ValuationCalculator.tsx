import React, { useEffect, useMemo, useRef, useState } from "react";
import { computeBusinessIncome, computeDaycareScenarios, computeDscrLoanRatio, computeNoiModel, computeValuationMetrics, formatNumberInput, isSbaRealEstateDominant, parseFormattedNumber, type ValuationSnapshot } from "@/lib/valuation";
import { LedgerRow, ValuationLedger, ValuationTag } from "./ValuationLedger";
import { LOAN_PRESETS, ValuationInputs, type ValuationInputState } from "./ValuationInputs";
import { ValuationResults } from "./ValuationResults";
import { ValuationBands, ValuationCoverage } from "./ValuationCoverage";
import { SectionNumberContext } from "./AccordionSection";
import { validateSiteDetails } from "./siteDetailsValidation";
import { annualExpenseAtRatio, formatAnnualExpense, ratioForAnnualExpense } from "./daycareExpenseConversions";

export interface ValuationRentalSource {
  key: string;
  label: string;
  annualRent: number;
  source: string;
  basis: "actual" | "market" | "manual";
}

export interface ValuationCalculatorProps {
  runId: number | null;
  isDaycare?: boolean;
  buildingSqFt?: number;
  buildingAreaSource?: string;
  annualCountyTaxes?: number;
  annualInsuranceEstimate?: number;
  insuranceEstimated?: boolean;
  onTaxesChange?: (value: string) => void;
  onInsuranceChange?: (value: string) => void;
  taxesInput?: string;
  insuranceInput?: string;
  taxRecordLabel?: string;
  rentalSources?: ValuationRentalSource[];
  listingStatedNoi?: number | null;
  listingRevenue?: number | null;
  listingSde?: number | null;
  listingEbitda?: number | null;
  initialPurchasePrice?: string;
  listingListPrice?: number | null;
  onPurchasePriceChange?: (value: string) => void;
  onSavePrice?: () => void;
  savePending?: boolean;
  mortgageRate?: number | null;
  mortgageRateDate?: string | null;
  sbaBusinessRate?: number | null;
  sbaRealEstateRate?: number | null;
  initialLoanType?: ValuationInputState["loanType"];
  initialFinancing?: Partial<ValuationInputState>;
  initialUnitCount?: number;
  unitCountSource?: string;
  dscrLoanEligible?: boolean;
  commercialIncomeAllowed?: boolean;
  commercialOnly?: boolean;
  onLoanTypeChange?: (value: ValuationInputState["loanType"]) => void;
  onFinancingChange?: (value: ValuationInputState) => void;
  onSnapshot?: (snapshot: ValuationSnapshot) => void;
  onMetric?: (runId: number | null, metric: string | undefined) => void;
  daycareScenarioKey?: string;
  daycareRevenueRate?: string;
  onUpdateProperty?: (input: { id: number; data: Record<string, number | null> }) => Promise<unknown>;
}

const fmt = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
const parse = (v: string) => Math.max(0, parseFormattedNumber(v));
const entered = (v: string) => v.trim() !== "" && Number.isFinite(Number(v.replace(/,/g, "")));
const enteredCost = (v: string) => entered(v) && Number(v.replace(/,/g, "")) >= 0;
const optionalCost = (v: string) => v.trim() === "" || enteredCost(v);
const enteredPercent = (v: string) => enteredCost(v) && Number(v.replace(/,/g, "")) <= 100;
const parseSigned = (v: string) => parseFormattedNumber(v);
const inputCss = "kyp-input";
const businessExpenseBoundary = "Business expenses exclude occupancy, county taxes and building insurance — those are deducted once, here, in the property half. A blank line is unknown, not zero.";

function NumberField({ label, value, onChange, suffix, placeholder, tag }: {
  label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string; tag?: React.ReactNode;
}) {
  return <label className="kyp-field">
    <span>{label} {tag}</span>
    <span className={`kyp-inprefix ${suffix ? "suf" : ""}`}>
      <input aria-label={label} className={`${inputCss} num`} inputMode="decimal" value={value} placeholder={placeholder ?? "0"}
        onChange={(event) => onChange(formatNumberInput(event.currentTarget.value))} />
      {suffix && <span className="fx">{suffix}</span>}
    </span>
  </label>;
}

function Step({ number, title, note }: { number: number; title: string; note?: string }) {
  const sectionIndex = React.useContext(SectionNumberContext);
  const prefix = sectionIndex == null ? "valuation" : String(sectionIndex).padStart(2, "0");
  return <div id={`valuation-subsection-${prefix}-${number}`} className="kyp-calcstep"><span className="n">{sectionIndex == null ? number : `${prefix}.${number}`}</span><span className="t">{title}</span>{note && <span className="note">{note}</span>}</div>;
}

export function ValuationCalculator({
  runId, isDaycare = false, buildingSqFt = 0, buildingAreaSource = "No site-area record",
  annualCountyTaxes, annualInsuranceEstimate, insuranceEstimated = true,
  onTaxesChange, onInsuranceChange, taxesInput, insuranceInput, taxRecordLabel = "Cook County record",
  rentalSources = [], listingStatedNoi = null, listingRevenue = null, listingSde = null, listingEbitda = null,
  initialPurchasePrice = "", listingListPrice = null, onPurchasePriceChange, onSavePrice, savePending,
  mortgageRate, mortgageRateDate, sbaBusinessRate, sbaRealEstateRate,
  initialLoanType = "conventional", initialFinancing, initialUnitCount = 1, unitCountSource = "unit-count estimate", dscrLoanEligible = false, commercialIncomeAllowed = false, commercialOnly = false, onLoanTypeChange, onFinancingChange, onSnapshot, onMetric,
  daycareScenarioKey: liftedDaycareScenarioKey, daycareRevenueRate: liftedDaycareRevenueRate,
  onUpdateProperty,
}: ValuationCalculatorProps) {
  const initialFinance = initialFinancing ?? {};
  const [loan, setLoan] = useState<ValuationInputState>({
    businessPrice: "", realEstatePrice: "",
    interestRate: String(mortgageRate ?? 7.5), businessDown: "10", businessTerm: isSbaRealEstateDominant(parse(initialFinance.businessPrice ?? ""), parse(initialFinance.realEstatePrice ?? "")) && initialLoanType === "sba_biz_re" ? "25" : "10",
    businessRate: String(sbaBusinessRate ?? 10.25), realEstateDown: "10",
    realEstateTerm: "25", realEstateRate: String(sbaRealEstateRate ?? 6),
    ...initialFinance, loanType: initialFinance.loanType ?? initialLoanType, purchasePrice: initialPurchasePrice,
  });
  const [rentSource, setRentSource] = useState(rentalSources[0]?.key ?? (listingStatedNoi != null ? "listing_noi" : "direct"));
  const lastBuildUpSource = useRef(rentalSources[0]?.key);
  if (rentalSources.some((source) => source.key === rentSource)) lastBuildUpSource.current = rentSource;
  const [hasChosenRentSource, setHasChosenRentSource] = useState(false);
  const [tier, setTier] = useState<"simple" | "advanced">(!isDaycare && initialPurchasePrice ? "advanced" : "simple");
  const [directNoi, setDirectNoi] = useState("");
  const [ownNoiOverride, setOwnNoiOverride] = useState("");
  const [rentalOverride, setRentalOverride] = useState("");
  const [commercialRent, setCommercialRent] = useState("");
  const [otherIncome, setOtherIncome] = useState("");
  const [vacancyResidential, setVacancyResidential] = useState("5");
  const [vacancyCommercial, setVacancyCommercial] = useState("10");
  const [managementPct, setManagementPct] = useState("6");
  const [repairs, setRepairs] = useState("");
  const [utilities, setUtilities] = useState("");
  const [reservesPerUnit, setReservesPerUnit] = useState("250");
  const [daycareRevenueRateLocal] = useState("2,275");
  const [daycareExpense, setDaycareExpense] = useState("");
  const [daycareExpenseRatio, setDaycareExpenseRatio] = useState(initialLoanType === "sba_business" ? "75" : "60");
  const [daycareExpenseRatioEdited, setDaycareExpenseRatioEdited] = useState(false);
  const [daycareDetail, setDaycareDetail] = useState<"simple" | "detailed">("simple");
  const [businessExpense, setBusinessExpense] = useState("");
  const [leasedOccupancy, setLeasedOccupancy] = useState("");
  const [leasedSpaceRent, setLeasedSpaceRent] = useState("");
  const [leasedUnitCount, setLeasedUnitCount] = useState("");
  const [businessRevenue, setBusinessRevenue] = useState("");
  const [businessRevenueSource, setBusinessRevenueSource] = useState<"listing" | "own">(listingRevenue != null ? "listing" : "own");
  const [cogs, setCogs] = useState("");
  const [payroll, setPayroll] = useState("");
  const [otherBusinessExpenses, setOtherBusinessExpenses] = useState("");
  const [ownerSalary, setOwnerSalary] = useState("");
  const [ownerPersonal, setOwnerPersonal] = useState("");
  const [oneTimeItems, setOneTimeItems] = useState("");
  const [managerSalary, setManagerSalary] = useState("");
  const [businessDetail, setBusinessDetail] = useState<"simple" | "detailed">("simple");
  const [daycareChoiceLocal] = useState("100_efficient");
  const [daycareRevenueSource, setDaycareRevenueSource] = useState<"derived" | "own">("derived");
  const [daycareRevenueOverride, setDaycareRevenueOverride] = useState("");
  const [businessExpenseRatio, setBusinessExpenseRatio] = useState(initialLoanType === "sba_biz_re" ? "60" : "75");
  const [businessExpenseRatioEdited, setBusinessExpenseRatioEdited] = useState(false);
  const [buildingDraft, setBuildingDraft] = useState(String(buildingSqFt || ""));
  const [siteSaveError, setSiteSaveError] = useState("");
  const purchaseTouched = useRef(false);
  const previousListingPrice = useRef<number | null>(listingListPrice);
  const daycareRevenueRate = liftedDaycareRevenueRate ?? daycareRevenueRateLocal;
  const daycareChoice = liftedDaycareScenarioKey ?? daycareChoiceLocal;
  const buildingDraftDirty = Number(buildingDraft.replace(/,/g, "")) !== Number(buildingSqFt || 0);
  const listingPriceText = listingListPrice == null ? "" : formatNumberInput(String(Math.round(listingListPrice)));
  const purchasePrefilledFromListing = !purchaseTouched.current && !!listingPriceText && (
    loan.loanType === "sba_biz_re" ? loan.realEstatePrice === listingPriceText : loan.purchasePrice === listingPriceText
  );
  const [taxEdited, setTaxEdited] = useState(false);
  const [insuranceEdited, setInsuranceEdited] = useState(false);
  const [taxString, setTaxString] = useState(taxesInput ?? String(annualCountyTaxes ?? ""));
  const [insuranceString, setInsuranceString] = useState(insuranceInput ?? String(annualInsuranceEstimate ?? ""));
  const onSnapshotRef = useRef(onSnapshot);
  const onMetricRef = useRef(onMetric);
  onSnapshotRef.current = onSnapshot;
  onMetricRef.current = onMetric;

  useEffect(() => {
    setLoan((current) => ({
      ...current, ...initialFinance,
      loanType: initialLoanType,
      purchasePrice: purchaseTouched.current ? current.purchasePrice : (initialPurchasePrice || (initialLoanType.startsWith("sba_") ? current.purchasePrice : listingPriceText)),
      realEstatePrice: initialLoanType === "sba_biz_re"
        ? (purchaseTouched.current ? current.realEstatePrice : initialFinance.realEstatePrice || listingPriceText)
        : (initialFinance.realEstatePrice ?? current.realEstatePrice),
      interestRate: initialFinance.interestRate?.trim() ? initialFinance.interestRate : (current.interestRate || String(mortgageRate ?? 7.5)),
    }));
  }, [runId, initialPurchasePrice, initialLoanType, mortgageRate,
    initialFinance.businessPrice, initialFinance.realEstatePrice, initialFinance.interestRate,
    initialFinance.businessDown, initialFinance.businessTerm, initialFinance.businessRate,
    initialFinance.realEstateDown, initialFinance.realEstateTerm, initialFinance.realEstateRate]);
  useEffect(() => {
    const previous = previousListingPrice.current == null ? "" : formatNumberInput(String(Math.round(previousListingPrice.current)));
    const next = listingListPrice == null ? "" : formatNumberInput(String(Math.round(listingListPrice)));
    if (!purchaseTouched.current && next && (!previous || (loan.loanType === "sba_biz_re" ? loan.realEstatePrice === previous : loan.purchasePrice === previous))) {
      setLoan((current) => current.loanType === "sba_biz_re"
        ? { ...current, realEstatePrice: next }
        : { ...current, purchasePrice: initialPurchasePrice || next });
    }
    previousListingPrice.current = listingListPrice;
  }, [listingListPrice, loan.loanType, initialPurchasePrice]);
  useEffect(() => {
    setTaxString(taxesInput ?? String(annualCountyTaxes ?? ""));
  }, [runId, taxesInput, annualCountyTaxes]);
  useEffect(() => {
    setInsuranceString(insuranceInput ?? String(annualInsuranceEstimate ?? ""));
  }, [runId, insuranceInput, annualInsuranceEstimate]);
  useEffect(() => {
    if (sbaBusinessRate) setLoan((current) => current.businessRate === "10.25" ? { ...current, businessRate: String(sbaBusinessRate) } : current);
  }, [sbaBusinessRate]);
  useEffect(() => {
    if (sbaRealEstateRate) setLoan((current) => current.realEstateRate === "6" ? { ...current, realEstateRate: String(sbaRealEstateRate) } : current);
  }, [sbaRealEstateRate]);
  useEffect(() => {
    if (rentSource === "own_rent") return;
    if (rentSource === "own_noi" && listingStatedNoi != null) return;
    if (rentSource === "direct" && hasChosenRentSource) return;
    if (rentSource === "listing_noi" && listingStatedNoi != null) return;
    if (rentalSources.some((source) => source.key === rentSource)) return;
    setRentSource(rentalSources[0]?.key ?? (listingStatedNoi != null ? "listing_noi" : "direct"));
  }, [runId, rentSource, hasChosenRentSource, rentalSources, listingStatedNoi]);

  const selectedSource = rentalSources.find((source) => source.key === rentSource) ?? rentalSources[0];
  const selectedSourceHref = selectedSource?.key.startsWith("listing_") ? "#section-listing"
    : selectedSource?.key.startsWith("rentcast_") || selectedSource?.key.startsWith("fmr_") ? "#section-rentcast" : null;
  const isSba = loan.loanType.startsWith("sba_");
  const sbaOnly = loan.loanType === "sba_business";
  const combined = loan.loanType === "sba_biz_re";
  const isListingNoi = rentSource === "listing_noi" && listingStatedNoi != null;
  const isDirect = rentSource === "direct";
  const isOwnRent = rentSource === "own_rent";
  const isOwnNoi = rentSource === "own_noi";
  const primaryNoIncomePath = !isDaycare && !isSba && isDirect && !entered(directNoi);
  const daycareLeases = isDaycare && sbaOnly;
  const businessRevenueValue = businessRevenueSource === "listing" && listingRevenue != null
    ? listingRevenue
    : parse(businessRevenue);
  const businessRevenueInput = businessRevenueSource === "listing" && listingRevenue != null
    ? formatNumberInput(String(Math.round(listingRevenue)))
    : businessRevenue;
  const units = Math.max(1, initialUnitCount);
  const effectiveRent = isOwnRent ? parse(rentalOverride)
    : isDirect || isListingNoi || isOwnNoi ? 0 : (selectedSource?.annualRent ?? 0);
  const rentalModel = useMemo(() => computeNoiModel({
    residentialRentAnnual: commercialOnly ? 0 : effectiveRent,
    commercialRentAnnual: commercialOnly && commercialRent === "" && selectedSource?.basis === "actual" ? effectiveRent : commercialIncomeAllowed ? parse(commercialRent) : 0,
    otherIncomeAnnual: parse(otherIncome),
    vacancyResiPct: Number(vacancyResidential) || 0,
    vacancyCommPct: Number(vacancyCommercial) || 0,
    annualTaxes: parse(taxString),
    annualInsurance: parse(insuranceString),
    managementPctOfEgi: Number(managementPct) || 0,
    repairsAnnual: repairs === "" ? units * 1250 : parse(repairs),
    utilitiesAnnual: utilities === "" ? units * 750 : parse(utilities),
    reservesAnnual: parse(reservesPerUnit) * units,
  }), [effectiveRent, commercialRent, commercialIncomeAllowed, commercialOnly, selectedSource?.basis, otherIncome, vacancyResidential, vacancyCommercial, taxString, insuranceString, managementPct, repairs, utilities, reservesPerUnit, units]);

  const scenarios = useMemo(() => computeDaycareScenarios({ buildingSqFt, revenuePerChildMonthly: parse(daycareRevenueRate) }), [buildingSqFt, daycareRevenueRate]);
  const scenarioOrder = ["100_efficient", "75_efficient", "100_comfortable", "75_comfortable"];
  const orderedScenarios = scenarioOrder.map((key) => scenarios.find((scenario: any) => scenario.key === key)).filter(Boolean);
  const daycareScenario = scenarios.find((scenario: any) => scenario.key === daycareChoice) ?? scenarios[0];
  const daycareDerivedRevenue = daycareScenario?.annualRevenue ?? 0;
  const daycareDerivedAvailable = buildingSqFt > 0 && enteredCost(daycareRevenueRate);
  const daycareRevenue = daycareRevenueSource === "own" ? parse(daycareRevenueOverride) : daycareDerivedRevenue;
  const daycareRevenueKnown = daycareRevenueSource === "derived"
    ? daycareDerivedAvailable
    : enteredCost(daycareRevenueOverride);
  const daycareExpenseValue = daycareDetail === "simple"
    ? annualExpenseAtRatio(daycareRevenue, Number(daycareExpenseRatio.replace(/,/g, "")) || 0) ?? 0
    : parse(daycareExpense);
  const daycareBusinessExpenseKnown = daycareRevenueKnown &&
    (daycareDetail === "simple" ? enteredCost(daycareExpenseRatio) : enteredCost(daycareExpense));
  const daycareBusinessIncome = daycareBusinessExpenseKnown ? daycareRevenue - daycareExpenseValue : 0;
  const daycarePropertyNoi = daycareLeases ? 0 : -(parse(taxString) + parse(insuranceString));
  const daycareAllInExpenseRatio = daycareRevenueKnown && daycareRevenue > 0 && enteredCost(daycareExpenseRatio) &&
    (daycareLeases || [taxString, insuranceString].every(enteredCost))
    ? Number(daycareExpenseRatio.replace(/,/g, "")) + (daycareLeases ? 0 : (parse(taxString) + parse(insuranceString)) / daycareRevenue * 100)
    : null;
  const simpleBusinessExpense = businessRevenueValue * (Number(businessExpenseRatio) || 0) / 100;
  const effectiveBusinessExpense = businessDetail === "simple" ? simpleBusinessExpense : (businessExpense === "" ? 0 : parse(businessExpense));
  const businessAllInExpensePct = enteredCost(businessRevenueInput) && enteredCost(businessExpenseRatio) && businessRevenueValue > 0 &&
    (sbaOnly || [taxString, insuranceString].every(enteredCost))
    ? Number(businessExpenseRatio) + (sbaOnly ? 0 : (parse(taxString) + parse(insuranceString)) / businessRevenueValue * 100)
    : null;
  const businessIncome = computeBusinessIncome({
    detailMode: businessDetail, revenueAnnual: businessRevenueValue,
    operatingExpensesAnnual: effectiveBusinessExpense,
    costOfGoodsSoldAnnual: parse(cogs), payrollAnnual: parse(payroll),
    otherOperatingExpensesAnnual: parse(otherBusinessExpenses), ownerSalaryAnnual: parse(ownerSalary),
    ownerPersonalExpensesAnnual: parse(ownerPersonal), oneTimeItemsAnnual: parse(oneTimeItems),
    managerSalaryAnnual: parse(managerSalary),
  });
  const businessInputs = {
    detailMode: businessDetail, revenueAnnual: businessRevenueValue,
    operatingExpensesAnnual: effectiveBusinessExpense,
    costOfGoodsSoldAnnual: parse(cogs), payrollAnnual: parse(payroll),
    otherOperatingExpensesAnnual: parse(otherBusinessExpenses), ownerSalaryAnnual: parse(ownerSalary),
    ownerPersonalExpensesAnnual: parse(ownerPersonal), oneTimeItemsAnnual: parse(oneTimeItems),
    managerSalaryAnnual: parse(managerSalary),
  };
  const businessExpenseKnown = businessDetail === "detailed"
    ? [businessRevenueInput, cogs, payroll, otherBusinessExpenses, managerSalary].every(enteredCost)
    : enteredCost(businessRevenueInput) && enteredCost(businessExpenseRatio);
  const leasedExpense = parse(leasedOccupancy);
  const rentalNoi = isListingNoi ? (listingStatedNoi ?? 0) : isOwnNoi ? parseSigned(ownNoiOverride) : isDirect ? parseSigned(directNoi) : rentalModel.noi;
  const businessNoi = businessIncome.businessOperatingIncome;
  const leasedUnits = leasedUnitCount === "" ? (parse(leasedSpaceRent) > 0 ? 1 : 0) : Math.floor(parse(leasedUnitCount));
  const leasedPropertyModel = computeNoiModel({
    residentialRentAnnual: 0, commercialRentAnnual: parse(leasedSpaceRent),
    otherIncomeAnnual: parse(otherIncome), vacancyResiPct: 0, vacancyCommPct: Number(vacancyCommercial) || 0,
    annualTaxes: parse(taxString), annualInsurance: parse(insuranceString),
    managementPctOfEgi: Number(managementPct) || 0,
    repairsAnnual: repairs === "" ? leasedUnits * 1250 : parse(repairs),
    utilitiesAnnual: utilities === "" ? leasedUnits * 750 : parse(utilities),
    reservesAnnual: parse(reservesPerUnit) * leasedUnits,
  });
  const sbaPropertyNoi = combined
    ? leasedPropertyModel.noi
    : businessDetail === "simple" ? 0 : -parse(leasedOccupancy);
  const selectedNoi = isDaycare
    ? daycarePropertyNoi + (daycareBusinessExpenseKnown ? daycareBusinessIncome : 0)
    : isSba ? (businessExpenseKnown ? businessNoi + sbaPropertyNoi : Math.min(0, sbaPropertyNoi))
    : (rentalSources.length || isDirect || isListingNoi || isOwnNoi) ? rentalNoi : parse(directNoi);
  const fullNetNoi = isDaycare || isSba || isListingNoi || isOwnNoi || (isDirect && entered(directNoi)) || (!isDirect && !isListingNoi && !isOwnNoi && !!selectedSource);
  const incomeComplete = isDaycare ? daycareBusinessExpenseKnown
    : isSba ? businessExpenseKnown && (combined ? enteredCost(leasedSpaceRent) : businessDetail === "simple" || enteredCost(leasedOccupancy))
    : isListingNoi ? listingStatedNoi != null : isOwnNoi ? entered(ownNoiOverride) : isDirect ? entered(directNoi) : isOwnRent ? enteredCost(rentalOverride) : commercialOnly ? enteredCost(commercialRent) || selectedSource?.basis === "actual" : !!selectedSource;
  const propertyCostsComplete = isDaycare
    ? daycareLeases || [taxString, insuranceString].every(enteredCost)
    : primaryNoIncomePath ? [taxString, insuranceString].every(enteredCost)
      : sbaOnly || isListingNoi || isOwnNoi || isDirect || [taxString, insuranceString].every(enteredCost);
  const financingComplete = isSba
    ? enteredPercent(loan.businessRate) && enteredPercent(loan.businessDown) && enteredCost(loan.businessTerm) && Number(loan.businessTerm) >= 1 && Number(loan.businessTerm) <= 100
      && (!combined || enteredPercent(loan.realEstateRate) && enteredPercent(loan.realEstateDown) && enteredCost(loan.realEstateTerm) && Number(loan.realEstateTerm) >= 1 && Number(loan.realEstateTerm) <= 100)
    : enteredPercent(loan.interestRate);
  const propertyAssumptionsComplete = isDaycare || sbaOnly || isDirect || isListingNoi || isOwnNoi
    || [managementPct, ...(!combined && !commercialOnly ? [vacancyResidential] : []), ...(combined || commercialIncomeAllowed ? [vacancyCommercial] : [])].every(enteredPercent)
      && [repairs, utilities, otherIncome, commercialRent, rentalOverride, leasedUnitCount].every(optionalCost)
      && enteredCost(reservesPerUnit);
  const businessAssumptionsComplete = !isSba || [ownerSalary, ownerPersonal, oneTimeItems, leasedOccupancy].every(optionalCost);
  const priceComplete = isSba ? enteredCost(loan.businessPrice) && (!combined || enteredCost(loan.realEstatePrice)) : enteredCost(loan.purchasePrice);
  const calculationComplete = incomeComplete && propertyCostsComplete && financingComplete && priceComplete && propertyAssumptionsComplete && businessAssumptionsComplete;
  const incomeStatementComplete = incomeComplete && propertyCostsComplete && propertyAssumptionsComplete && businessAssumptionsComplete;
  const metrics = computeValuationMetrics({
    loanType: loan.loanType,
    purchasePriceInput: loan.purchasePrice,
    interestRateInput: loan.interestRate,
    presetDownPaymentPercent: LOAN_PRESETS[loan.loanType].down,
    presetTermYears: LOAN_PRESETS[loan.loanType].term,
    sbaBusinessPrice: loan.businessPrice, sbaRealEstatePrice: loan.realEstatePrice,
    sbaBusinessDownPercent: loan.businessDown, sbaBusinessTermYears: loan.businessTerm, sbaBusinessInterestRate: loan.businessRate,
    sbaRealEstateDownPercent: loan.realEstateDown, sbaRealEstateTermYears: loan.realEstateTerm, sbaRealEstateInterestRate: loan.realEstateRate,
    selectedNoi, annualTaxesInput: taxString, annualInsuranceInput: insuranceString,
    noiIncludesPropertyExpenses: fullNetNoi,
  });
  const monthlyPaymentKnown = primaryNoIncomePath && priceComplete && financingComplete &&
    [taxString, insuranceString].every(enteredCost);
  const monthlyPaymentReadout = monthlyPaymentKnown ? fmt(metrics.monthlyPITI) : "—";
  const dscrLoanRatio = dscrLoanEligible && !isSba && !isDirect && !isListingNoi && !isOwnNoi && !!selectedSource && metrics.annualDebtService > 0
    ? computeDscrLoanRatio(effectiveRent, metrics.annualDebtService, parse(taxString), parse(insuranceString))
    : null;
  const noiSource = isDaycare ? `daycare_cashflow:${daycareRevenueSource}:${daycareChoice}` : isSba ? (combined ? "sba_business_and_property" : "sba_business_only") : isListingNoi ? "listing_noi" : isDirect ? "direct" : `noi_model:${rentSource}`;
  const snapshot: ValuationSnapshot = {
    calculationComplete, selectedNoi, noiSource, metrics,
    noiModel: !isSba && !isDaycare && !isListingNoi && !isDirect ? {
      tier, mode: "investor",
      inputs: {
        residentialRentAnnual: commercialOnly ? 0 : effectiveRent, commercialRentAnnual: commercialOnly && commercialRent === "" && selectedSource?.basis === "actual" ? effectiveRent : commercialIncomeAllowed ? parse(commercialRent) : 0, otherIncomeAnnual: parse(otherIncome),
        vacancyResiPct: Number(vacancyResidential) || 0, vacancyCommPct: Number(vacancyCommercial) || 0,
        annualTaxes: parse(taxString), annualInsurance: parse(insuranceString), managementPctOfEgi: Number(managementPct) || 0,
        repairsAnnual: repairs === "" ? units * 1250 : parse(repairs), utilitiesAnnual: utilities === "" ? units * 750 : parse(utilities),
        reservesAnnual: parse(reservesPerUnit) * units,
      },
      result: rentalModel, dscrLoanRatio: dscrLoanRatio == null ? null : Math.round(dscrLoanRatio * 100) / 100, manualOverride: false,
    } : null,
    businessIncomeModel: isSba ? { detailMode: businessDetail, inputs: businessInputs, result: businessIncome } : null,
    daycareModel: isDaycare ? { buildingSqFt, revenuePerChildMonthly: parse(daycareRevenueRate), scenarios } : null,
    inputSnapshot: {
      calculationComplete, loan, taxString, insuranceString, taxEdited, insuranceEdited, unitCount: units, unitCountSource,
      metricDefinitions: { yield: isSba ? "Business/combined operating yield, not a real-estate cap rate" : "Real-estate NOI / purchase price", cashFlow: "Fully net NOI minus debt service, property expenses charged once" },
       rentSource, rentalOverride, directNoi: isDirect ? directNoi : null, ownNoiOverride: isOwnNoi ? ownNoiOverride : null,
      listingStatedNoi: isListingNoi ? listingStatedNoi : null,
      rental: {
        selectedAnnualRent: effectiveRent, commercialIncomeAllowed,
        commercialRent: commercialIncomeAllowed ? parse(commercialRent) : null,
        otherIncome: parse(otherIncome), vacancyResidential: Number(vacancyResidential) || 0,
        vacancyCommercial: Number(vacancyCommercial) || 0, managementPct: Number(managementPct) || 0,
        repairs: repairs === "" ? units * 1250 : parse(repairs),
        utilities: utilities === "" ? units * 750 : parse(utilities),
        reservesPerUnit: parse(reservesPerUnit),
      },
      business: {
        ...businessInputs, expensesEntered: businessExpenseKnown,
        revenueInput: businessRevenue, revenueSource: businessRevenueSource, simpleExpensesInput: businessExpense,
        simpleExpenseRatioInput: businessExpenseRatio,
        cogsInput: cogs, payrollInput: payroll, otherExpensesInput: otherBusinessExpenses,
        ownerSalaryInput: ownerSalary, ownerPersonalInput: ownerPersonal,
        oneTimeItemsInput: oneTimeItems, managerSalaryInput: managerSalary,
        leasedOccupancy: isSba && !combined && businessDetail === "detailed" && enteredCost(leasedOccupancy) ? parse(leasedOccupancy) : null,
        leasedSpaceRent: combined ? (enteredCost(leasedSpaceRent) ? parse(leasedSpaceRent) : null) : null,
        leasedUnitCount: combined ? leasedUnits : null,
        leasedPropertyModel: combined && calculationComplete ? leasedPropertyModel : null,
      },
      daycare: {
        choice: daycareChoice, revenuePerChildMonthly: parse(daycareRevenueRate),
        revenueSource: daycareRevenueSource, revenueOverride: daycareRevenueOverride || null,
        expenses: daycareBusinessExpenseKnown ? daycareExpenseValue : null,
        expenseRatio: daycareDetail === "simple" && enteredCost(daycareExpenseRatio) ? Number(daycareExpenseRatio.replace(/,/g, "")) : null,
        tier: daycareDetail,
      },
      selectedNoi, noiSource, fullyNetOfPropertyExpenses: fullNetNoi,
      grossIncomeForReport: isDaycare ? (daycareRevenueKnown ? daycareRevenue : null)
        : isSba ? (businessRevenueInput === "" ? null : businessRevenueValue + (combined ? leasedPropertyModel.grossIncome : 0))
        : isListingNoi ? null
        : isDirect || isOwnNoi ? null : rentalModel.grossIncome,
    },
  };
  useEffect(() => {
    onSnapshotRef.current?.(snapshot);
    const badge = calculationComplete && metrics.purchasePrice > 0 && metrics.annualDebtService > 0 ? `Estimate at your inputs · DSCR ${metrics.dscr.toFixed(2)}×` : undefined;
    onMetricRef.current?.(runId, badge);
  }, [runId, selectedNoi, noiSource, metrics, rentalModel, tier, loan, daycareExpenseRatio, daycareExpense, daycareRevenueSource, daycareRevenueOverride, daycareDetail, businessDetail, businessRevenue, businessRevenueSource, ownNoiOverride, directNoi]);

  const dominant = isSbaRealEstateDominant(parse(loan.businessPrice), sbaOnly ? 0 : parse(loan.realEstatePrice));
  const setTax = (value: string) => { setTaxEdited(true); setTaxString(value); onTaxesChange?.(value); };
  const setInsurance = (value: string) => { setInsuranceEdited(true); setInsuranceString(value); onInsuranceChange?.(value); };
  const onLoanInputChange = (next: ValuationInputState) => {
    let updated = next;
    if (next.loanType !== loan.loanType && !businessExpenseRatioEdited) {
      setBusinessExpenseRatio(next.loanType === "sba_biz_re" ? "60" : "75");
    }
    if (isDaycare && next.loanType !== loan.loanType && !daycareExpenseRatioEdited) {
      setDaycareExpenseRatio(next.loanType === "sba_business" ? "75" : "60");
    }
    if (next.purchasePrice !== loan.purchasePrice || next.realEstatePrice !== loan.realEstatePrice) purchaseTouched.current = true;
    if (!purchaseTouched.current && listingPriceText && next.loanType === "sba_biz_re" && !next.realEstatePrice) {
      updated = { ...next, realEstatePrice: listingPriceText };
    } else if (!purchaseTouched.current && listingPriceText && !next.loanType.startsWith("sba_") && !next.purchasePrice) {
      updated = { ...next, purchasePrice: listingPriceText };
    }
    if (next.loanType.startsWith("sba_") && (next.loanType !== loan.loanType || next.businessPrice !== loan.businessPrice || next.realEstatePrice !== loan.realEstatePrice)) {
      const reDominant = isSbaRealEstateDominant(parse(updated.businessPrice), updated.loanType === "sba_business" ? 0 : parse(updated.realEstatePrice));
      updated = {
        ...updated,
        businessDown: "10",
        businessTerm: updated.realEstatePrice && reDominant ? "25" : "10",
        realEstateDown: "10",
        realEstateTerm: "25",
      };
    }
    setLoan(updated);
    onLoanTypeChange?.(updated.loanType);
    onFinancingChange?.(updated);
    if (updated.loanType.startsWith("sba_")) {
      const sbaPrice = parse(updated.businessPrice) + (updated.loanType === "sba_biz_re" ? parse(updated.realEstatePrice) : 0);
      const saved = updated.businessPrice || updated.realEstatePrice ? String(sbaPrice) : "";
      onPurchasePriceChange?.(saved);
    } else onPurchasePriceChange?.(updated.purchasePrice);
  };
  const saveBuildingArea = async () => {
    setSiteSaveError("");
    if (!runId || !onUpdateProperty) { setSiteSaveError("Site details cannot be updated for this record."); return; }
    const checked = validateSiteDetails({ building: buildingDraft, land: "", stories: "" });
    if (!checked.value) { setSiteSaveError(checked.error ?? "Enter a positive building area."); return; }
    try {
      await onUpdateProperty({ id: runId, data: { manualBuildingSqFt: checked.value.manualBuildingSqFt } });
    } catch {
      setSiteSaveError("Property details could not be saved. Try again.");
    }
  };
  useEffect(() => {
    if (!buildingDraftDirty) setBuildingDraft(String(buildingSqFt || ""));
  }, [runId, buildingSqFt]);

  const businessRevenueControl = listingRevenue == null
    ? <NumberField label="Annual business revenue" value={businessRevenue} onChange={setBusinessRevenue}
        tag={<ValuationTag kind="assume">{businessRevenue ? "Entered" : "Unknown"}</ValuationTag>} />
    : <>
      <label className="kyp-field"><span>Business revenue source</span>
        <select aria-label="Business revenue source" className="kyp-input kyp-select" value={businessRevenueSource}
          onChange={(event) => setBusinessRevenueSource(event.currentTarget.value as "listing" | "own")}>
          <option value="listing">Active listing · seller claim</option>
          <option value="own">Enter my own</option>
        </select>
      </label>
      {businessRevenueSource === "listing"
        ? <div className="kyp-lock wide"><span className="ic">Derived</span> {fmt(listingRevenue)} annual revenue · active listing seller claim
            <a href="#section-listing">View listing source</a>
          </div>
        : <div className="kyp-dealfields two">
          <NumberField label="Annual business revenue" value={businessRevenue} onChange={setBusinessRevenue}
            tag={<ValuationTag kind="assume">{businessRevenue ? "Entered" : "Unknown"}</ValuationTag>} />
          <div className="kyp-ourest"><span className="cl">Our estimate</span><span className="cv">{fmt(listingRevenue)}</span>
            <span className="cd">Active listing seller claim{businessRevenue && listingRevenue !== 0 ? ` · ${((parse(businessRevenue) / listingRevenue - 1) * 100).toFixed(1)}% variance` : " · available if you want it"}</span>
            <a href="#section-listing">View listing source</a>
            <button type="button" className="kyp-btn ghost sm" onClick={() => setBusinessRevenueSource("listing")}>Use ours instead</button>
          </div>
        </div>}
    </>;
  const switchDaycareDetail = (next: "simple" | "detailed") => {
    if (next === daycareDetail) return;
    if (next === "detailed") {
      if (daycareBusinessExpenseKnown) {
        setDaycareExpense(formatAnnualExpense(daycareExpenseValue));
      }
      setDaycareDetail("detailed");
      return;
    }
    if (daycareBusinessExpenseKnown) {
      setDaycareExpenseRatio(ratioForAnnualExpense(daycareExpenseValue, daycareRevenue) ?? "");
      setDaycareExpenseRatioEdited(true);
    }
    setDaycareDetail("simple");
  };

  return <div id="valuation-calculator-section" data-testid="valuation-calculator" className="kyp-valuation">
    <Step number={1} title="Deal Inputs" note="purchase · financing" />
    <ValuationInputs value={loan} onChange={onLoanInputChange} onSavePrice={onSavePrice} savePending={savePending}
      hasNoi={incomeStatementComplete && !primaryNoIncomePath}
      noiValue={incomeStatementComplete && !primaryNoIncomePath ? fmt(selectedNoi) : "—"}
      monthlyPayment={monthlyPaymentReadout}
      showPropertyCosts={loan.loanType === "fha_va" || primaryNoIncomePath}
      annualTaxes={taxString} annualInsurance={insuranceString} onTaxesChange={setTax} onInsuranceChange={setInsurance}
      taxesTag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : taxRecordLabel}</ValuationTag>}
      insuranceTag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : insuranceEstimated ? "Floor-area estimate" : "Estimate"}</ValuationTag>}
      listingPricePrefill={purchasePrefilledFromListing} />
    <div className="kyp-src"><p>{primaryNoIncomePath
      ? "No income basis is entered, so this path shows the monthly payment instead of NOI."
      : isSba ? (sbaOnly ? "Business-only financing models one business note; property taxes and insurance are set to zero on this path." : dominant ? "Real estate is at least 51% of the combined price, so both notes use the real-estate term convention." : "Real estate is below 51% of the combined price, so the business and real-estate notes use separate term conventions.")
      : "Conventional/FHA use the displayed preset down payment and 30-year term."}</p>
      <p>Rates and terms are estimates, not lender offers.{!isSba && mortgageRate != null ? ` Benchmark: Freddie Mac 30-year average ${mortgageRate}%${mortgageRateDate ? ` · ${mortgageRateDate}` : ""}.` : !isSba ? " 7.5% is an editable default without a benchmark." : ""}{loan.loanType === "fha_va" ? " FHA mortgage insurance is not included." : ""} Only the price is saved on reload.</p></div>

    {!isDaycare && (primaryNoIncomePath ? <>
      <Step number={2} title="Monthly Payment" note="principal, interest, taxes, insurance" />
      <div className="kyp-selectrow">
        <label className="kyp-field" htmlFor="primary-income-basis"><span>Income basis · optional</span>
          <select id="primary-income-basis" aria-label="Income basis" className="kyp-input kyp-select" value="direct"
            onChange={(event) => { setHasChosenRentSource(true); setRentSource(event.currentTarget.value); }}>
            {rentalSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
            {listingStatedNoi != null && <option value="listing_noi">Listing-stated NOI · seller claim</option>}
            <option value="direct">No income · primary residence</option>
            {rentalSources.length > 0 && <option value="own_rent">{listingStatedNoi != null ? "Enter my own rent" : "Enter my own"}</option>}
            {listingStatedNoi != null
              ? <option value="own_noi">Enter my own</option>
              : rentalSources.length === 0 ? <option value="own_rent">Enter my own</option> : null}
          </select>
        </label>
      </div>
      {isDirect && <NumberField label="Annual NOI · leave blank for no-income view" value={directNoi} onChange={setDirectNoi}
        tag={<ValuationTag kind="assume">{entered(directNoi) ? "Entered" : "Unknown"}</ValuationTag>} />}
      <div className="kyp-blocks three">
        <div className="kyp-block ind"><span className="bv">{monthlyPaymentKnown ? fmt(metrics.monthlyPITI) : "—"}</span><span className="bl">Total monthly payment</span><span className="bd">principal + interest + taxes + insurance</span></div>
        <div className="kyp-block slate"><span className="bv">{priceComplete && financingComplete ? fmt(metrics.monthlyPI) : "—"}</span><span className="bl">Principal &amp; interest</span><span className="bd">{loan.interestRate}% over {LOAN_PRESETS[loan.loanType].term} years</span></div>
        <div className="kyp-block slate"><span className="bv">{priceComplete ? fmt(metrics.downPayment) : "—"}</span><span className="bl">Cash at closing</span><span className="bd">{LOAN_PRESETS[loan.loanType].down}% down · before fees</span></div>
      </div>
      <ValuationLedger title="What makes up the payment">
        <LedgerRow label="Principal & interest" detail={`${priceComplete ? fmt(metrics.loanAmount) : "Unknown"} loan balance at ${loan.interestRate}%`} value={priceComplete && financingComplete ? fmt(metrics.monthlyPI) : "Unknown"} />
        <LedgerRow label="Property taxes" detail="Cook County record ÷ 12" value={enteredCost(taxString) ? fmt(parse(taxString) / 12) : "Unknown"} />
        <LedgerRow label="Building insurance" detail="Annual estimate ÷ 12" value={enteredCost(insuranceString) ? fmt(parse(insuranceString) / 12) : "Unknown"} />
        <LedgerRow label="Total monthly payment" variant="total" value={monthlyPaymentKnown ? fmt(metrics.monthlyPITI) : "Unknown"} />
      </ValuationLedger>
      <div className="kyp-src"><p>Mortgage insurance, HOA dues and closing costs are not included.</p>
        <p>An estimate at the inputs shown, not a loan offer or a qualification decision.</p></div>
      <Step number={3} title="How It’s Calculated" note="monthly payment receipt" />
      <div className="kyp-receipt">
        P&amp;I = {priceComplete && financingComplete ? fmt(metrics.monthlyPI) : "Unknown"} monthly. PITI = P&amp;I + {enteredCost(taxString) ? fmt(parse(taxString) / 12) : "unknown"} monthly taxes + {enteredCost(insuranceString) ? fmt(parse(insuranceString) / 12) : "unknown"} monthly insurance = <b>{monthlyPaymentKnown ? fmt(metrics.monthlyPITI) : "Unknown"} a month.</b>
      </div>
      <div className="kyp-src"><p>Payment components use the entered price, preset down payment and loan rate, plus county taxes and building insurance.</p></div>
    </> : <>
      <Step number={2} title="Income → NOI" note="one statement, sourced lines" />
      {isSba ? <>
        <div className="kyp-calcgrid two">
          <div className="kyp-calccol"><div className="ch">Business half</div>
            {listingRevenue != null && <p className="kyp-calchelp">Revenue prefilled from active listing · seller claim</p>}
            <div className="kyp-segrow">
              <div className="kyp-seg">
                <button type="button" className={businessDetail === "simple" ? "on" : ""} aria-pressed={businessDetail === "simple"} onClick={() => {
                  if (businessDetail === "detailed" && businessRevenueValue > 0) {
                    const detailCost = parse(cogs) + parse(payroll) + parse(otherBusinessExpenses) + parse(managerSalary) + parse(leasedOccupancy)
                      - parse(ownerSalary) - parse(ownerPersonal) - parse(oneTimeItems);
                    setBusinessExpenseRatio(String(Number(Math.max(0, detailCost / businessRevenueValue * 100).toFixed(6))));
                  }
                  setBusinessDetail("simple");
                }}>Simple</button>
                <button type="button" className={businessDetail === "detailed" ? "on" : ""} aria-pressed={businessDetail === "detailed"} onClick={() => {
                  if (businessDetail === "simple" && ![cogs, payroll, otherBusinessExpenses, managerSalary].some((field) => field !== "")) {
                    const totalCosts = businessRevenueValue * Number(businessExpenseRatio) / 100;
                    const occupancy = sbaOnly ? Math.min(totalCosts, businessRevenueValue * 0.15) : 0;
                    const businessCosts = Math.max(0, totalCosts - occupancy);
                    setCogs(formatNumberInput(String(Math.round(businessCosts))));
                    setPayroll("0");
                    setOtherBusinessExpenses("0");
                    setManagerSalary("0");
                    if (sbaOnly) setLeasedOccupancy(formatNumberInput(String(Math.round(occupancy))));
                  }
                  setBusinessDetail("detailed");
                }}>Detailed</button>
              </div>
              <div className="spacer" />
              <div className="kyp-scopenote">Business income basis</div>
            </div>
            {businessDetail === "simple" ? <>
              {businessRevenueControl}
              <NumberField label="Operating expenses · % of revenue" value={businessExpenseRatio} onChange={(value) => { setBusinessExpenseRatio(value); setBusinessExpenseRatioEdited(true); }} suffix="%" tag={<ValuationTag kind="assume">{combined ? "60% default · owns property" : "75% default · rent included"}</ValuationTag>} />
              <div className="kyp-band2">
                <b>{businessAllInExpensePct == null ? "All-in expense ratio unavailable" : `${businessAllInExpensePct.toFixed(1)}% all-in`}</b>{" "}
                {sbaOnly ? "Property taxes and insurance are set to $0 on the business-only path." : `Includes county taxes (${enteredCost(taxString) ? fmt(parse(taxString)) : "unknown"}) and building insurance (${enteredCost(insuranceString) ? fmt(parse(insuranceString)) : "unknown"}).`}
                {" "}Compare with an operator P&amp;L ratio, which usually includes occupancy.
                <s>Across 425 day cares sold 2021–2025, median revenue was $584,126 against median owner earnings of $132,779 (22.7% SDE margin; 77.3% expenses with rent inside). Excluding occupancy, that places this input near 62–68% as context only. <a href="https://www.bizbuysell.com/learning-center/industry/child-day-care/" target="_blank" rel="noreferrer">BizBuySell valuation benchmarks</a> · sold listings · SDE is before owner compensation.</s>
              </div>
            </> : <>
              {businessRevenueControl}
              <NumberField label="Cost of goods sold" value={cogs} onChange={setCogs} />
              <NumberField label="Payroll" value={payroll} onChange={setPayroll} />
              <NumberField label="Other operating expenses" value={otherBusinessExpenses} onChange={setOtherBusinessExpenses} />
              <LedgerRow label="Book operating profit" variant="sub" tag={<ValuationTag kind="assume">Derived from entered costs</ValuationTag>} value={[businessRevenueInput, cogs, payroll, otherBusinessExpenses].every(enteredCost) ? fmt(businessIncome.bookOperatingProfit) : "Unknown"} />
              <NumberField label="Add back · owner salary (seller claim)" value={ownerSalary} onChange={setOwnerSalary} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <NumberField label="Add back · owner personal expenses (seller claim)" value={ownerPersonal} onChange={setOwnerPersonal} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <NumberField label="Add back · one-time items (seller claim)" value={oneTimeItems} onChange={setOneTimeItems} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <LedgerRow label="Seller’s discretionary earnings (SDE)" variant="sub" tag={<ValuationTag kind="assume">Claimed add-backs</ValuationTag>} value={[businessRevenueInput, cogs, payroll, otherBusinessExpenses].every(enteredCost) ? fmt(businessIncome.sde) : "Unknown"} />
              <NumberField label="Less · market manager salary" value={managerSalary} onChange={setManagerSalary} />
              {!combined && <NumberField label="Leased-occupancy expense (annual)" value={leasedOccupancy} onChange={setLeasedOccupancy} />}
              <LedgerRow label="Business operating income (adjusted EBITDA)" variant="total" tag={<ValuationTag kind="assume">Derived</ValuationTag>} value={businessExpenseKnown ? fmt(businessIncome.businessOperatingIncome) : "Unknown"} />
              {(listingSde != null || listingEbitda != null) && <p className="kyp-calchelp">Listing seller claims · SDE {listingSde == null ? "not stated" : fmt(listingSde)} · EBITDA {listingEbitda == null ? "not stated" : fmt(listingEbitda)}. Claims are not verified or used as expense lines.</p>}
            </>}
          </div>
          <div className="kyp-calccol"><div className="ch">Property half · leased space only</div>
            {combined && <>
              <NumberField label="Third-party leased-space rent · annual" value={leasedSpaceRent} onChange={setLeasedSpaceRent} />
              <NumberField label="Units leased to others · expense model" value={leasedUnitCount} onChange={setLeasedUnitCount} placeholder="Default: 1 when rent is entered, otherwise 0" />
              <NumberField label="Leased-space vacancy" value={vacancyCommercial} onChange={setVacancyCommercial} suffix="%" />
              <NumberField label="Leased-space other income · annual" value={otherIncome} onChange={setOtherIncome} />
              <NumberField label="Leased-space management" value={managementPct} onChange={setManagementPct} suffix="%" />
              <NumberField label="Leased-space repairs · annual" value={repairs} onChange={setRepairs} placeholder={`Default ${fmt(leasedUnits * 1250)}`} />
              <NumberField label="Leased-space utilities · annual" value={utilities} onChange={setUtilities} placeholder={`Default ${fmt(leasedUnits * 750)}`} />
              <NumberField label="Leased-space reserves per unit · annual" value={reservesPerUnit} onChange={setReservesPerUnit} />
            </>}
            {combined && <>
              <NumberField label="Annual property taxes · Cook County" value={taxString} onChange={setTax} />
              <NumberField label="Annual building insurance" value={insuranceString} onChange={setInsurance} />
            </>}
            {combined && <LedgerRow label="Rent from third-party leased space" tag={<ValuationTag kind={leasedSpaceRent === "" ? "assume" : "rec"}>{leasedSpaceRent === "" ? "Unknown · no rent imputed" : "Entered"}</ValuationTag>} value={enteredCost(leasedSpaceRent) ? fmt(parse(leasedSpaceRent)) : "Unknown"} />}
            {combined ? <>
              <LedgerRow label="Property taxes" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : taxRecordLabel}</ValuationTag>} value={enteredCost(taxString) ? `−${fmt(parse(taxString))}` : "Unknown"} negative />
              <LedgerRow label="Building insurance" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Estimated"}</ValuationTag>} value={enteredCost(insuranceString) ? `−${fmt(parse(insuranceString))}` : "Unknown"} negative />
            </> : <>
              <LedgerRow label="Property taxes · business-only path" tag={<ValuationTag kind="assume">Set to zero</ValuationTag>} value="$0" />
              <LedgerRow label="Building insurance · business-only path" tag={<ValuationTag kind="assume">Set to zero</ValuationTag>} value="$0" />
            </>}
            <LedgerRow label="Business operating income" tag={<ValuationTag kind={businessExpenseKnown ? "assume" : "est"}>{businessExpenseKnown ? "Entered expenses" : "Unknown expenses"}</ValuationTag>} value={businessExpenseKnown ? fmt(businessNoi) : "Unknown"} />
            {!combined && businessDetail === "detailed" && <LedgerRow label="Leased-occupancy expense" tag={<ValuationTag kind={leasedOccupancy === "" ? "assume" : "rec"}>{leasedOccupancy === "" ? "Unknown · none imputed" : "Entered"}</ValuationTag>} value={`−${fmt(leasedExpense)}`} negative={leasedExpense > 0} />}
            {combined && <ValuationLedger title="Leased-space property statement">
              <LedgerRow label="Gross income" value={enteredCost(leasedSpaceRent) ? fmt(leasedPropertyModel.grossIncome) : "Unknown"} tag={<ValuationTag kind="assume">Entered leased space</ValuationTag>} />
              <LedgerRow label="Less vacancy" value={propertyAssumptionsComplete && enteredCost(leasedSpaceRent) ? `−${fmt(leasedPropertyModel.vacancyLoss)}` : "Unknown"} tag={<ValuationTag kind="est">Assumption · {vacancyCommercial}%</ValuationTag>} />
              <LedgerRow label="Effective gross income" value={propertyAssumptionsComplete && enteredCost(leasedSpaceRent) ? fmt(leasedPropertyModel.egi) : "Unknown"} />
              <LedgerRow label="Management" value={propertyAssumptionsComplete && enteredCost(leasedSpaceRent) ? `−${fmt(leasedPropertyModel.management)}` : "Unknown"} tag={<ValuationTag kind="est">Imputed · {managementPct}%</ValuationTag>} />
              <LedgerRow label="Other operating costs" detail="County taxes, building insurance, repairs, utilities, and replacement reserves" value={propertyCostsComplete && propertyAssumptionsComplete ? `−${fmt(leasedPropertyModel.totalExpenses - leasedPropertyModel.management)}` : "Unknown"} tag={<ValuationTag kind="est">Inputs and defaults</ValuationTag>} />
              <LedgerRow label="Real estate NOI" variant="total" value={enteredCost(leasedSpaceRent) && propertyCostsComplete && propertyAssumptionsComplete ? fmt(sbaPropertyNoi) : "Unknown"} negative={sbaPropertyNoi < 0} />
            </ValuationLedger>}
            <div className="kyp-blocks three">
              <div className="kyp-block wash"><span className="bl">Business operating income</span><span className="bv">{businessExpenseKnown ? fmt(businessNoi) : "—"}</span></div>
              <div className="kyp-block wash"><span className="bl">{combined ? "Real estate NOI" : "Leased occupancy cost"}</span><span className="bv">{combined && !enteredCost(leasedSpaceRent) ? "—" : fmt(sbaPropertyNoi)}</span></div>
              <div className="kyp-block ind"><span className="bl">Total NOI · at these inputs</span><span className="bv">{incomeStatementComplete ? fmt(selectedNoi) : "—"}</span></div>
            </div>
          </div>
        </div>
        <div className="kyp-src"><p>{businessExpenseBoundary}</p>
          <p>Business-only Simple includes leased occupancy in its ratio; Detailed separates it. No rent is imputed for operator-occupied space. SDE add-backs remain seller claims.</p>
        </div>
      </> : <>
        <div className="kyp-calcgrid two">
          <div className="kyp-calccol"><div className="ch">Income basis</div>
            <label className="kyp-field"><span>NOI source</span><select aria-label="NOI source" className="kyp-input kyp-select" value={isDirect ? "direct" : rentSource} onChange={(event) => { setHasChosenRentSource(true); setRentSource(event.currentTarget.value); }}>
              {rentalSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
              {listingStatedNoi != null && <option value="listing_noi">Listing-stated NOI · seller claim</option>}
              <option value="direct">Enter NOI directly</option>
              {rentalSources.length > 0 && <option value="own_rent">{listingStatedNoi != null ? "Enter my own rent" : "Enter my own"}</option>}
              {listingStatedNoi != null
                ? <option value="own_noi">Enter my own</option>
                : rentalSources.length === 0 ? <option value="own_rent">Enter my own</option> : null}
            </select></label>
            {isListingNoi ? <><LedgerRow label="Listing-stated NOI" detail="Broker figure · shown as stated, not verified" tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} value={fmt(listingStatedNoi ?? 0)} /><a href="#section-listing">View listing source</a></> :
              isOwnNoi ? <div className="kyp-dealfields two">
                <NumberField label="Annual NOI · manual" value={ownNoiOverride} onChange={setOwnNoiOverride}
                  tag={<ValuationTag kind="assume">{ownNoiOverride ? "Entered" : "Unknown"}</ValuationTag>} />
                <div className="kyp-ourest"><span className="cl">Our estimate</span><span className="cv">{fmt(listingStatedNoi ?? 0)}</span>
                  <span className="cd">Listing-stated NOI · seller claim{ownNoiOverride && listingStatedNoi ? ` · ${((parseSigned(ownNoiOverride) / listingStatedNoi - 1) * 100).toFixed(1)}% variance` : " · available if you want it"}</span>
                  <a href="#section-listing">View listing source</a>
                  <button type="button" className="kyp-btn ghost sm" onClick={() => setRentSource("listing_noi")}>Use ours instead</button>
                </div>
              </div> :
              isDirect ? <NumberField label="Annual NOI entered directly" value={directNoi} onChange={setDirectNoi} /> :
              isOwnRent ? <div className="kyp-dealfields two">
                <NumberField label="Annual gross rent · manual" value={rentalOverride} onChange={setRentalOverride} tag={<ValuationTag kind="assume">{rentalOverride ? "Entered" : "Unknown"}</ValuationTag>} />
                <div className="kyp-ourest"><span className="cl">Our estimate</span><span className="cv">{selectedSource ? fmt(selectedSource.annualRent) : "Unavailable"}</span>
                  <span className="cd">{selectedSource?.source ?? "No automated estimate"}{rentalOverride && selectedSource?.annualRent ? ` · ${((parse(rentalOverride) / selectedSource.annualRent - 1) * 100).toFixed(1)}% variance` : " · available if you want it"}</span>
                  {selectedSourceHref && <a href={selectedSourceHref}>View rent source</a>}
                  <button type="button" className="kyp-btn ghost sm" onClick={() => { setRentalOverride(""); setRentSource(lastBuildUpSource.current ?? rentalSources[0]?.key ?? "direct"); }}>Use ours instead</button>
                </div>
              </div> :
              <><LedgerRow label="Selected rent basis" detail={selectedSource?.source ?? "No rent source"} tag={<ValuationTag kind={selectedSource?.basis === "actual" ? "rec" : "est"}>{selectedSource?.basis === "actual" ? "Derived · listing data" : selectedSource?.basis === "market" ? "Derived · market estimate" : "Manual source"}</ValuationTag>} value={fmt(effectiveRent)} />
                {selectedSourceHref && <a href={selectedSourceHref}>View rent source</a>}</>}
            {commercialOnly && !isDirect && !isListingNoi && !isOwnNoi && <p className="kyp-calchelp">The existing property is commercial-only. Residential market-rent estimates are not counted; enter commercial rent in Detailed, or use an actual listing income basis.</p>}
            {tier === "advanced" && !isListingNoi && !isDirect && !isOwnNoi && <>
              {commercialIncomeAllowed && <NumberField label="Commercial rent · annual" value={commercialRent} onChange={setCommercialRent} />}
              <NumberField label="Other income · annual" value={otherIncome} onChange={setOtherIncome} />
              <NumberField label="Residential vacancy" value={vacancyResidential} onChange={setVacancyResidential} suffix="%" />
              <NumberField label="Commercial vacancy" value={vacancyCommercial} onChange={setVacancyCommercial} suffix="%" />
              <NumberField label="Management" value={managementPct} onChange={setManagementPct} suffix="%" />
              <NumberField label="Repairs · annual" value={repairs} onChange={setRepairs} placeholder={`Default ${fmt(units * 1250)}`} />
              <NumberField label="Utilities · annual" value={utilities} onChange={setUtilities} placeholder={`Default ${fmt(units * 750)}`} />
              <NumberField label="Reserves per unit · annual" value={reservesPerUnit} onChange={setReservesPerUnit} />
            </>}
            <div className="kyp-segrow">
              <div className="kyp-seg">
                <button type="button" className={tier === "simple" ? "on" : ""} aria-pressed={tier === "simple"} onClick={() => setTier("simple")}>Simple</button>
                <button type="button" className={tier === "advanced" ? "on" : ""} aria-pressed={tier === "advanced"} onClick={() => setTier("advanced")}>Detailed</button>
              </div>
              <div className="spacer" />
              <div className="kyp-scopenote">Edit assumptions in Detailed.</div>
            </div>
          </div>
          <div className="kyp-calccol"><div className="ch">Property costs</div>
            <LedgerRow label="County property taxes" tag={<ValuationTag kind={taxEdited ? "assume" : enteredCost(taxString) ? "rec" : "est"}>{taxEdited ? "Edited" : enteredCost(taxString) ? "From record" : "Unavailable"}</ValuationTag>} value={enteredCost(taxString) ? fmt(parse(taxString)) : "Unknown"} />
            <NumberField label="Annual property taxes" value={taxString} onChange={setTax} />
            <NumberField label="Annual building insurance" value={insuranceString} onChange={setInsurance} />
          </div>
        </div>
        {!isListingNoi && !isDirect && !isOwnNoi && <ValuationLedger title="Property & income statement">
          <LedgerRow label="Gross income" tag={<ValuationTag kind={selectedSource?.basis === "actual" ? "rec" : "est"}>{selectedSource?.source ?? "Selected basis"}</ValuationTag>} value={incomeComplete ? fmt(rentalModel.grossIncome) : "Unknown"} />
          <LedgerRow label="Vacancy" value={incomeComplete && propertyAssumptionsComplete ? `−${fmt(rentalModel.vacancyLoss)}` : "Unknown"} negative />
          <LedgerRow label="Effective gross income" variant="sub" value={incomeComplete && propertyAssumptionsComplete ? fmt(rentalModel.egi) : "Unknown"} />
          <LedgerRow label="Property taxes" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : "County record"}</ValuationTag>} value={enteredCost(taxString) ? `−${fmt(parse(taxString))}` : "Unknown"} negative />
          <LedgerRow label="Building insurance" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Floor-area estimate"}</ValuationTag>} value={enteredCost(insuranceString) ? `−${fmt(parse(insuranceString))}` : "Unknown"} negative />
          <LedgerRow label="Management" tag={<ValuationTag kind="assume">{enteredPercent(managementPct) ? `${managementPct}% · imputed` : "Unknown"}</ValuationTag>} value={enteredPercent(managementPct) ? `−${fmt(rentalModel.management)}` : "Unknown"} negative />
          <LedgerRow label="Repairs" tag={<ValuationTag kind="assume">{repairs === "" ? "Per-unit default" : "Edited"}</ValuationTag>} value={optionalCost(repairs) ? `−${fmt(repairs === "" ? units * 1250 : parse(repairs))}` : "Unknown"} negative />
          <LedgerRow label="Utilities" tag={<ValuationTag kind="assume">{utilities === "" ? "Per-unit default" : "Edited"}</ValuationTag>} value={optionalCost(utilities) ? `−${fmt(utilities === "" ? units * 750 : parse(utilities))}` : "Unknown"} negative />
          <LedgerRow label="Replacement reserves" tag={<ValuationTag kind="assume">Per-unit assumption</ValuationTag>} value={enteredCost(reservesPerUnit) ? `−${fmt(parse(reservesPerUnit) * units)}` : "Unknown"} negative />
          <LedgerRow label="Total operating expenses" variant="sub" value={propertyCostsComplete && propertyAssumptionsComplete ? `−${fmt(rentalModel.totalExpenses)}` : "Unknown"} negative />
          <LedgerRow label="Net operating income" variant="total" value={incomeStatementComplete ? fmt(rentalModel.noi) : "Unknown"} negative={rentalModel.noi < 0} />
        </ValuationLedger>}
        {tier === "simple" && !isListingNoi && !isDirect && !isOwnNoi && <div className="kyp-ledger">
          <div className="lh">Assumptions in use · same arithmetic as Detailed</div>
          <LedgerRow label="Residential vacancy" tag={<ValuationTag kind="assume">{enteredPercent(vacancyResidential) ? "Assumption" : "Unknown"}</ValuationTag>} value={enteredPercent(vacancyResidential) ? `${vacancyResidential}%` : "Unknown"} />
          {commercialIncomeAllowed && <LedgerRow label="Commercial vacancy" tag={<ValuationTag kind="assume">{enteredPercent(vacancyCommercial) ? "Assumption" : "Unknown"}</ValuationTag>} value={enteredPercent(vacancyCommercial) ? `${vacancyCommercial}%` : "Unknown"} />}
          <LedgerRow label="Management" tag={<ValuationTag kind="assume">{enteredPercent(managementPct) ? "Imputed" : "Unknown"}</ValuationTag>} value={enteredPercent(managementPct) ? `${managementPct}% of EGI` : "Unknown"} />
          <LedgerRow label="Repairs, utilities, reserves" tag={<ValuationTag kind="assume">{repairs === "" && utilities === "" ? "Unit-based defaults" : "Edited inputs"}</ValuationTag>} value={`${fmt(repairs === "" ? units * 1250 : parse(repairs))} · ${fmt(utilities === "" ? units * 750 : parse(utilities))} · ${fmt(parse(reservesPerUnit) * units)}`} />
        </div>}
        {directNoi && isDirect && rentalSources.length > 0 && <button type="button" className="kyp-btn" onClick={() => { setDirectNoi(""); setRentSource(rentalSources.find(source => source.key === lastBuildUpSource.current)?.key ?? rentalSources[0].key); setHasChosenRentSource(true); }}>Restore build-up</button>}
        <div className="kyp-src"><p>County taxes come from the Cook County record, never a listing tax figure. Insurance is an estimate until replaced by a quote.</p>
          <p>Direct NOI is fully net of taxes and insurance; property income includes only space leased to others. Unit count: {unitCountSource}. Simple and Detailed share one NOI model.</p>
        </div>
      </>}
    </>)}

    {isDaycare && <>
      <Step number={2} title="Income → NOI" note="one operating statement, scenario-linked" />
      <div className="kyp-lock wide"><span className="ic">Site area</span> {buildingSqFt > 0 ? `${buildingSqFt.toLocaleString()} sq ft` : "Unknown"} · {buildingAreaSource}
        {buildingDraftDirty && <span className="kyp-dirty">Unsaved · §17.5 shows {fmt(buildingSqFt)}</span>}
        <a href="#print-section-site-daycare-details">Edit in §17.5</a>
      </div>
      <div className="kyp-dealfields two">
        <label className="kyp-field"><span>Building sq ft · shared site record</span>
          <input aria-label="Building square feet for daycare valuation" className="kyp-input num" inputMode="decimal" value={buildingDraft}
            onChange={(event) => setBuildingDraft(formatNumberInput(event.currentTarget.value))} />
        </label>
        <div className="kyp-calccol">
          <button type="button" className="kyp-btn" disabled={!buildingDraftDirty || savePending || !onUpdateProperty} onClick={saveBuildingArea}>
            {savePending ? "Saving…" : "Save building area"}
          </button>
          {siteSaveError && <div role="alert" className="kyp-status-empty">{siteSaveError}</div>}
        </div>
      </div>
      <div className="kyp-segrow">
        <div className="kyp-seg">
          <button type="button" className={daycareDetail === "simple" ? "on" : ""} aria-pressed={daycareDetail === "simple"} onClick={() => switchDaycareDetail("simple")}>Simple</button>
          <button type="button" className={daycareDetail === "detailed" ? "on" : ""} aria-pressed={daycareDetail === "detailed"} onClick={() => switchDaycareDetail("detailed")}>Detailed</button>
        </div>
        <div className="spacer" />
        <div className="kyp-scopenote">Simple is a revenue ratio; Detailed is an equivalent annual dollar amount.</div>
      </div>
      <label className="kyp-field"><span>Revenue source</span>
        <select aria-label="Daycare annual revenue source" className="kyp-input kyp-select" value={daycareRevenueSource}
          onChange={(event) => setDaycareRevenueSource(event.currentTarget.value as "derived" | "own")}>
          <option value="derived">{daycareScenario?.label ?? "Site scenario"} · {daycareDerivedAvailable ? `${daycareScenario?.children ?? 0} children · ${fmt(daycareDerivedRevenue)}/yr` : "revenue unavailable"}</option>
          <option value="own">Enter my own</option>
        </select>
      </label>
      {daycareRevenueSource === "derived" ? <div className="kyp-lock wide"><span className="ic">Derived</span> {daycareDerivedAvailable ? fmt(daycareDerivedRevenue) : "Unknown"} annual revenue · {daycareScenario?.label ?? "No site scenario"}
        <a className="kyp-wrap-link" href="#print-section-site-daycare-details">Edit capacity, enrollment &amp; rate in §17.5</a>
      </div> : <div className="kyp-dealfields two">
        <NumberField label="Annual revenue · manual" value={daycareRevenueOverride} onChange={setDaycareRevenueOverride}
          tag={<ValuationTag kind="assume">{daycareRevenueOverride ? "Entered" : "Unknown"}</ValuationTag>} />
        <div className="kyp-ourest"><span className="cl">Our estimate</span><span className="cv">{daycareDerivedAvailable ? fmt(daycareDerivedRevenue) : "Unavailable"}</span>
          <span className="cd">{daycareScenario?.label ?? "No site scenario"} · {daycareRevenueOverride && daycareDerivedAvailable && daycareDerivedRevenue ? `${((parse(daycareRevenueOverride) / daycareDerivedRevenue - 1) * 100).toFixed(1)}% variance` : "available if you want it"}</span>
          <a href="#print-section-site-daycare-details">View site-capacity source</a>
          <button type="button" className="kyp-btn ghost sm" onClick={() => { setDaycareRevenueOverride(""); setDaycareRevenueSource("derived"); }}>Use ours instead</button>
        </div>
      </div>}
      {daycareDetail === "simple" ? <>
        <NumberField label="Business operating expenses · % of revenue" value={daycareExpenseRatio} suffix="%"
          onChange={(value) => { setDaycareExpenseRatio(value); setDaycareExpenseRatioEdited(true); }}
          tag={<ValuationTag kind="assume">{daycareExpenseRatioEdited ? "Edited ratio" : daycareLeases ? "Default 75% · leased site" : "Default 60% · owns site"}</ValuationTag>} />
        <div className="kyp-band2">
          <b>{daycareAllInExpenseRatio == null ? "All-in expense ratio unavailable" : `${daycareAllInExpenseRatio.toFixed(1)}% all-in`}</b>{" "}
          {daycareLeases
            ? "Leased occupancy is already inside this expense ratio; landlord property taxes and insurance are not deducted."
            : daycareAllInExpenseRatio == null
              ? "Enter revenue, county taxes and building insurance to include the property half."
              : `Adds county taxes (${fmt(parse(taxString))}) and building insurance (${fmt(parse(insuranceString))}) to the business ratio.`}
          {" "}Compare with an operator P&amp;L ratio, which usually includes occupancy.
          <s>Across 425 day cares sold 2021–2025, median revenue was $584,126 against median owner earnings of $132,779 — SDE at 22.7% of revenue, so expenses ran 77.3% with rent inside. Excluding occupancy, that places this input near 62–68% as context only. <a href="https://www.bizbuysell.com/learning-center/industry/child-day-care/" target="_blank" rel="noreferrer">BizBuySell valuation benchmarks</a>, sold listings · SDE is before owner compensation. No published cut points are implied.</s>
        </div>
      </> : <NumberField label="Annual business operating expenses" value={daycareExpense} onChange={setDaycareExpense}
        tag={<ValuationTag kind="assume">{daycareExpense === "" ? "Unknown" : "Entered"}</ValuationTag>} />}
      {daycareDetail === "detailed" ? <>
      <ValuationLedger title="Business half">
      <LedgerRow label="Revenue" tag={<ValuationTag kind={daycareRevenueSource === "own" ? "assume" : "est"}>{daycareRevenueSource === "own" ? daycareRevenueOverride ? "Entered" : "Unknown" : "Derived from §17.5"}</ValuationTag>} value={daycareRevenueKnown ? fmt(daycareRevenue) : "Unknown"} />
      <LedgerRow label="Business expenses" tag={<ValuationTag kind={daycareBusinessExpenseKnown ? "assume" : "est"}>{daycareBusinessExpenseKnown ? "Entered annual amount" : "Unknown"}</ValuationTag>} value={daycareBusinessExpenseKnown ? `−${fmt(daycareExpenseValue)}` : "Unknown"} negative={daycareBusinessExpenseKnown} />
      <LedgerRow label="Business operating income" variant="sub" value={daycareBusinessExpenseKnown ? fmt(daycareBusinessIncome) : "Unknown"} />
      </ValuationLedger>
       <ValuationLedger title="Property half">
       {daycareLeases ? <>
         <LedgerRow label="Leased occupancy" detail="Included in business expenses" tag={<ValuationTag kind="assume">Rent inside ratio / annual amount</ValuationTag>} value="Inside business costs" />
         <LedgerRow label="Landlord property costs" detail="Not deducted on this business-only path" tag={<ValuationTag kind="assume">Outside this deal</ValuationTag>} value="—" />
         <LedgerRow label="Property NOI" variant="total" value={fmt(daycarePropertyNoi)} />
       </> : <>
         <LedgerRow label="Rent from leased space" tag={<ValuationTag kind="assume">Owner-occupied convention</ValuationTag>} value="$0" />
         <LedgerRow label="Property taxes · county record" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : taxRecordLabel}</ValuationTag>} value={enteredCost(taxString) ? `−${fmt(parse(taxString))}` : "Unknown"} negative />
         <LedgerRow label="Building insurance · estimate" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Floor-area estimate"}</ValuationTag>} value={enteredCost(insuranceString) ? `−${fmt(parse(insuranceString))}` : "Unknown"} negative />
         <LedgerRow label="Property NOI" variant="total" value={propertyCostsComplete ? fmt(daycarePropertyNoi) : "Unknown"} negative />
       </>}
      </ValuationLedger>
      </> : null}
      <div className="kyp-blocks three">
        <div className="kyp-block wash"><span className="bl">Business operating income</span><span className="bv">{daycareBusinessExpenseKnown ? fmt(daycareBusinessIncome) : "—"}</span></div>
        <div className="kyp-block wash"><span className="bl">Property NOI</span><span className="bv">{propertyCostsComplete ? fmt(daycarePropertyNoi) : "—"}</span></div>
        <div className="kyp-block ind"><span className="bl">Total NOI</span><span className="bv">{incomeStatementComplete ? fmt(selectedNoi) : "—"}</span></div>
      </div>
      {!daycareLeases && <div className="kyp-calcgrid two">
        <NumberField label="Annual property taxes · Cook County record" value={taxString} onChange={setTax} />
        <NumberField label="Annual building insurance estimate" value={insuranceString} onChange={setInsurance} />
      </div>}
      <div className="kyp-src"><p>{daycareLeases
        ? "Leased-space rent belongs in business expenses; landlord property costs stay outside this business-only statement."
        : businessExpenseBoundary}</p>
        <p>Detailed annual expenses stay fixed when enrollment changes; Simple expenses scale with revenue. {daycareLeases ? "The 75% default includes occupancy." : "The 60% default excludes rent; property taxes and insurance are deducted once."} Taxes may change after sale, and insurance is an estimate until replaced by a quote.</p>
      </div>
    </>}
    {!primaryNoIncomePath && <>
    <Step number={3} title="Deal at a Glance" note="derived from inputs" />
    {calculationComplete ? <ValuationResults metrics={metrics} blended={combined} businessOnly={sbaOnly} /> : <div className="kyp-empty">Enter the remaining inputs above to calculate deal metrics.</div>}
    {calculationComplete && metrics.annualDebtService > 0 && <ValuationBands dscr={metrics.dscr} />}
    <div className="kyp-src"><p>{combined || sbaOnly ? "Blended yield includes business goodwill and is not a real-estate cap rate." : "Cap rate is NOI ÷ purchase price at the inputs shown."}</p>
      <p>Estimates at the inputs shown. Not investment, legal, tax or financing advice.</p></div>

    <Step number={4} title="Coverage Check" note="NOI vs. debt service" />
    {calculationComplete && <ValuationCoverage metrics={metrics} selectedNoi={selectedNoi} isFha={loan.loanType === "fha_va"} />}
    {dscrLoanRatio != null && <div className="kyp-receipt"><b>DSCR-loan ratio</b> = selected gross residential rent {fmt(effectiveRent)} ÷ PITIA {fmt(metrics.annualDebtService + parse(taxString) + parse(insuranceString))} = <b>{dscrLoanRatio.toFixed(2)}×</b>. This 1–4 unit loan convention differs from economic NOI coverage; both use the same tax and insurance inputs.</div>}
    <div className="kyp-src"><p>Coverage compares NOI with debt service at these inputs.</p>
      <p>Verify all terms with a lender; this is not financing advice.</p></div>
    <Step number={5} title="How It’s Calculated" note="formula receipt" />
    {calculationComplete && <div className="kyp-blocks three">
      <div className="kyp-block wash"><span className="bl">Annual NOI</span><span className="bv">{fmt(selectedNoi)}</span></div>
      <div className="kyp-block wash"><span className="bl">Annual debt service</span><span className="bv">{fmt(metrics.annualDebtService)}</span></div>
      <div className="kyp-block wash"><span className="bl">Annual cash flow</span><span className="bv">{fmt(metrics.annualCashFlow)}</span></div>
    </div>}
    <div className="kyp-receipt">
      {!calculationComplete ? "NOI = operating income minus property expenses. Cash flow = NOI minus debt service. Enter the missing assumptions above to resolve these formulas." : <>
      <b>Annual debt service</b> = {fmt(metrics.annualDebtService)} · monthly P&amp;I = {fmt(metrics.monthlyPI)}{isSba ? ` · business note ${fmt(metrics.sbaBusinessMonthly)}${combined ? ` + real-estate note ${fmt(metrics.sbaRealEstateMonthly)}` : ""}` : ""}.
      {" "}<b>Cash flow</b> = {fmt(selectedNoi)} NOI − {fmt(metrics.annualDebtService)} debt service{metrics.noiCoversExpenses ? " − $0 (property costs are already in NOI)" : ` − ${fmt(metrics.annualOperatingCosts)} taxes and insurance`} = {fmt(metrics.annualCashFlow)} annually ({fmt(metrics.annualCashFlow / 12)}/mo).
      {" "}<b>{combined ? "Blended yield" : sbaOnly ? "Business yield" : "Cap rate"}</b> = {fmt(selectedNoi)} ÷ {fmt(metrics.purchasePrice)} = {metrics.purchasePrice > 0 ? `${metrics.capRate.toFixed(2)}%` : "not applicable without a price"}. <b>Cash-on-cash</b> = {fmt(metrics.annualCashFlow)} ÷ {fmt(metrics.downPayment)} = {metrics.downPayment > 0 ? `${metrics.roi.toFixed(2)}%` : "not applicable without cash invested"}. {(combined || sbaOnly) && "SBA yield is not a real-estate cap rate; business goodwill is included in its price."}
      </>}
    </div>
    <div className="kyp-src"><p>Source: inputs, Cook County taxes, listing or market rent. Verify before acting.</p></div>
    </>}
  </div>;
}

export default ValuationCalculator;
export const ValuationSection = ValuationCalculator;