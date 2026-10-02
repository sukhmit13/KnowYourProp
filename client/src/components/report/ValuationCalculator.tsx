import React, { useEffect, useMemo, useRef, useState } from "react";
import { computeBusinessIncome, computeDaycareScenarios, computeDscrLoanRatio, computeNoiModel, computeValuationMetrics, isSbaRealEstateDominant, parseFormattedNumber, type ValuationSnapshot } from "@/lib/valuation";
import { LedgerRow, ValuationLedger, ValuationTag } from "./ValuationLedger";
import { LOAN_PRESETS, ValuationInputs, type ValuationInputState } from "./ValuationInputs";
import { ValuationResults } from "./ValuationResults";
import { ValuationBands, ValuationCoverage } from "./ValuationCoverage";
import { SectionNumberContext } from "./AccordionSection";

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
}

const fmt = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
const parse = (v: string) => Math.max(0, parseFormattedNumber(v));
const entered = (v: string) => v.trim() !== "" && Number.isFinite(Number(v.replace(/,/g, "")));
const enteredCost = (v: string) => entered(v) && Number(v.replace(/,/g, "")) >= 0;
const optionalCost = (v: string) => v.trim() === "" || enteredCost(v);
const enteredPercent = (v: string) => enteredCost(v) && Number(v.replace(/,/g, "")) <= 100;
const parseSigned = (v: string) => parseFormattedNumber(v);
const inputCss = "kyp-input";

function NumberField({ label, value, onChange, suffix, placeholder, tag }: {
  label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string; tag?: React.ReactNode;
}) {
  return <label className="kyp-field">
    <span>{label} {tag}</span>
    <span className={`kyp-inprefix ${suffix ? "suf" : ""}`}>
      <input aria-label={label} className={inputCss} inputMode="decimal" value={value} placeholder={placeholder ?? "0"}
        onChange={(event) => onChange(event.currentTarget.value)} />
      {suffix && <span className="fx">{suffix}</span>}
    </span>
  </label>;
}

function Step({ number, title, note }: { number: number; title: string; note?: string }) {
  const sectionIndex = React.useContext(SectionNumberContext);
  return <div className="kyp-calcstep"><span className="n">{sectionIndex == null ? number : `${String(sectionIndex).padStart(2, "0")}.${number}`}</span><span className="t">{title}</span>{note && <span className="note">{note}</span>}</div>;
}

export function ValuationCalculator({
  runId, isDaycare = false, buildingSqFt = 0, buildingAreaSource = "Cook County building record",
  annualCountyTaxes, annualInsuranceEstimate, insuranceEstimated = true,
  onTaxesChange, onInsuranceChange, taxesInput, insuranceInput, taxRecordLabel = "Cook County record",
  rentalSources = [], listingStatedNoi = null, listingRevenue = null, listingSde = null, listingEbitda = null,
  initialPurchasePrice = "", onPurchasePriceChange, onSavePrice, savePending,
  mortgageRate, mortgageRateDate, sbaBusinessRate, sbaRealEstateRate,
  initialLoanType = "conventional", initialFinancing, initialUnitCount = 1, unitCountSource = "unit-count estimate", dscrLoanEligible = false, commercialIncomeAllowed = false, commercialOnly = false, onLoanTypeChange, onFinancingChange, onSnapshot, onMetric,
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
  const [rentalOverride, setRentalOverride] = useState("");
  const [commercialRent, setCommercialRent] = useState("");
  const [otherIncome, setOtherIncome] = useState("");
  const [vacancyResidential, setVacancyResidential] = useState("5");
  const [vacancyCommercial, setVacancyCommercial] = useState("10");
  const [managementPct, setManagementPct] = useState("6");
  const [repairs, setRepairs] = useState("");
  const [utilities, setUtilities] = useState("");
  const [reservesPerUnit, setReservesPerUnit] = useState("250");
  const [daycareRevenueRate, setDaycareRevenueRate] = useState("2275");
  const [daycareExpense, setDaycareExpense] = useState("");
  const [businessExpense, setBusinessExpense] = useState("");
  const [leasedOccupancy, setLeasedOccupancy] = useState("");
  const [leasedSpaceRent, setLeasedSpaceRent] = useState("");
  const [leasedUnitCount, setLeasedUnitCount] = useState("");
  const [businessRevenue, setBusinessRevenue] = useState(listingRevenue != null ? String(listingRevenue) : "");
  const [cogs, setCogs] = useState("");
  const [payroll, setPayroll] = useState("");
  const [otherBusinessExpenses, setOtherBusinessExpenses] = useState("");
  const [ownerSalary, setOwnerSalary] = useState("");
  const [ownerPersonal, setOwnerPersonal] = useState("");
  const [oneTimeItems, setOneTimeItems] = useState("");
  const [managerSalary, setManagerSalary] = useState("");
  const [businessDetail, setBusinessDetail] = useState<"simple" | "detailed">("simple");
  const [daycareChoice, setDaycareChoice] = useState("100_efficient");
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
      loanType: initialLoanType, purchasePrice: initialPurchasePrice,
      interestRate: initialFinance.interestRate?.trim() ? initialFinance.interestRate : (current.interestRate || String(mortgageRate ?? 7.5)),
    }));
  }, [runId, initialPurchasePrice, initialLoanType, mortgageRate,
    initialFinance.businessPrice, initialFinance.realEstatePrice, initialFinance.interestRate,
    initialFinance.businessDown, initialFinance.businessTerm, initialFinance.businessRate,
    initialFinance.realEstateDown, initialFinance.realEstateTerm, initialFinance.realEstateRate]);
  useEffect(() => {
    setTaxString(taxesInput ?? String(annualCountyTaxes ?? ""));
  }, [runId, taxesInput, annualCountyTaxes]);
  useEffect(() => {
    setInsuranceString(insuranceInput ?? String(annualInsuranceEstimate ?? ""));
  }, [runId, insuranceInput, annualInsuranceEstimate]);
  useEffect(() => {
    if (listingRevenue != null) setBusinessRevenue((current) => current || String(listingRevenue));
  }, [runId, listingRevenue]);
  useEffect(() => {
    if (sbaBusinessRate) setLoan((current) => current.businessRate === "10.25" ? { ...current, businessRate: String(sbaBusinessRate) } : current);
  }, [sbaBusinessRate]);
  useEffect(() => {
    if (sbaRealEstateRate) setLoan((current) => current.realEstateRate === "6" ? { ...current, realEstateRate: String(sbaRealEstateRate) } : current);
  }, [sbaRealEstateRate]);
  useEffect(() => {
    if (rentSource === "direct" && hasChosenRentSource) return;
    if (rentSource === "listing_noi" && listingStatedNoi != null) return;
    if (rentalSources.some((source) => source.key === rentSource)) return;
    setRentSource(rentalSources[0]?.key ?? (listingStatedNoi != null ? "listing_noi" : "direct"));
  }, [runId, rentSource, hasChosenRentSource, rentalSources, listingStatedNoi]);

  const selectedSource = rentalSources.find((source) => source.key === rentSource) ?? rentalSources[0];
  const isSba = loan.loanType.startsWith("sba_");
  const sbaOnly = loan.loanType === "sba_business";
  const combined = loan.loanType === "sba_biz_re";
  const isListingNoi = rentSource === "listing_noi" && listingStatedNoi != null;
  const isDirect = rentSource === "direct";
  const units = Math.max(1, initialUnitCount);
  const effectiveRent = rentalOverride !== "" ? parse(rentalOverride) : (selectedSource?.annualRent ?? 0);
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
  const daycareScenario = scenarios.find((scenario: any) => scenario.key === daycareChoice) ?? scenarios[0];
  const daycareBusinessExpenseKnown = enteredCost(daycareExpense) && buildingSqFt > 0 && enteredCost(daycareRevenueRate);
  const daycareBusinessIncome = daycareBusinessExpenseKnown && daycareScenario ? daycareScenario.annualRevenue - parse(daycareExpense) : 0;
  const daycarePropertyNoi = -(parse(taxString) + parse(insuranceString));
  const businessIncome = computeBusinessIncome({
    detailMode: businessDetail, revenueAnnual: parse(businessRevenue),
    operatingExpensesAnnual: businessExpense === "" ? 0 : parse(businessExpense),
    costOfGoodsSoldAnnual: parse(cogs), payrollAnnual: parse(payroll),
    otherOperatingExpensesAnnual: parse(otherBusinessExpenses), ownerSalaryAnnual: parse(ownerSalary),
    ownerPersonalExpensesAnnual: parse(ownerPersonal), oneTimeItemsAnnual: parse(oneTimeItems),
    managerSalaryAnnual: parse(managerSalary),
  });
  const businessInputs = {
    detailMode: businessDetail, revenueAnnual: parse(businessRevenue),
    operatingExpensesAnnual: businessExpense === "" ? 0 : parse(businessExpense),
    costOfGoodsSoldAnnual: parse(cogs), payrollAnnual: parse(payroll),
    otherOperatingExpensesAnnual: parse(otherBusinessExpenses), ownerSalaryAnnual: parse(ownerSalary),
    ownerPersonalExpensesAnnual: parse(ownerPersonal), oneTimeItemsAnnual: parse(oneTimeItems),
    managerSalaryAnnual: parse(managerSalary),
  };
  const businessExpenseKnown = businessDetail === "detailed"
    ? [businessRevenue, cogs, payroll, otherBusinessExpenses, managerSalary].every(enteredCost)
    : [businessRevenue, businessExpense].every(enteredCost);
  const leasedExpense = parse(leasedOccupancy);
  const rentalNoi = isListingNoi ? (listingStatedNoi ?? 0) : isDirect ? parseSigned(directNoi) : rentalModel.noi;
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
    : -parse(leasedOccupancy);
  const selectedNoi = isDaycare
    ? daycarePropertyNoi + (daycareBusinessExpenseKnown ? daycareBusinessIncome : 0)
    : isSba ? (businessExpenseKnown ? businessNoi + sbaPropertyNoi : Math.min(0, sbaPropertyNoi))
    : (rentalSources.length || isDirect || isListingNoi) ? rentalNoi : parse(directNoi);
  const fullNetNoi = isDaycare || isSba || isListingNoi || (isDirect && directNoi !== "") || (!isDirect && !isListingNoi && !!selectedSource);
  const incomeComplete = isDaycare ? daycareBusinessExpenseKnown
    : isSba ? businessExpenseKnown && (combined ? enteredCost(leasedSpaceRent) : enteredCost(leasedOccupancy))
    : isListingNoi ? listingStatedNoi != null : isDirect ? entered(directNoi) : commercialOnly ? enteredCost(commercialRent) || selectedSource?.basis === "actual" : !!selectedSource || enteredCost(rentalOverride);
  const propertyCostsComplete = sbaOnly || isListingNoi || isDirect || [taxString, insuranceString].every(enteredCost);
  const financingComplete = isSba
    ? enteredPercent(loan.businessRate) && enteredPercent(loan.businessDown) && enteredCost(loan.businessTerm) && Number(loan.businessTerm) >= 1 && Number(loan.businessTerm) <= 100
      && (!combined || enteredPercent(loan.realEstateRate) && enteredPercent(loan.realEstateDown) && enteredCost(loan.realEstateTerm) && Number(loan.realEstateTerm) >= 1 && Number(loan.realEstateTerm) <= 100)
    : enteredPercent(loan.interestRate);
  const propertyAssumptionsComplete = isDaycare || sbaOnly || isDirect || isListingNoi
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
  const dscrLoanRatio = dscrLoanEligible && !isSba && !isDirect && !isListingNoi && !!selectedSource && metrics.annualDebtService > 0
    ? computeDscrLoanRatio(effectiveRent, metrics.annualDebtService, parse(taxString), parse(insuranceString))
    : null;
  const noiSource = isDaycare ? `daycare_cashflow:${daycareChoice}` : isSba ? "sba_business_and_property" : isListingNoi ? "listing_noi" : isDirect ? "direct" : `noi_model:${rentSource}`;
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
      rentSource, rentalOverride, directNoi: isDirect ? directNoi : null,
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
        ...businessInputs, expensesEntered: businessExpense !== "",
        revenueInput: businessRevenue, simpleExpensesInput: businessExpense,
        cogsInput: cogs, payrollInput: payroll, otherExpensesInput: otherBusinessExpenses,
        ownerSalaryInput: ownerSalary, ownerPersonalInput: ownerPersonal,
        oneTimeItemsInput: oneTimeItems, managerSalaryInput: managerSalary,
        leasedOccupancy: isSba && !combined ? parse(leasedOccupancy) : null,
        leasedSpaceRent: combined ? (enteredCost(leasedSpaceRent) ? parse(leasedSpaceRent) : null) : null,
        leasedUnitCount: combined ? leasedUnits : null,
        leasedPropertyModel: combined && calculationComplete ? leasedPropertyModel : null,
      },
      daycare: {
        choice: daycareChoice, revenuePerChildMonthly: parse(daycareRevenueRate),
        expenses: daycareExpense === "" ? null : parse(daycareExpense), tier,
      },
      selectedNoi, noiSource, fullyNetOfPropertyExpenses: fullNetNoi,
      grossIncomeForReport: isDaycare ? daycareScenario?.annualRevenue
        : isSba ? (businessRevenue === "" ? null : parse(businessRevenue) + (combined ? leasedPropertyModel.grossIncome : 0))
        : isListingNoi ? selectedSource?.annualRent ?? null
        : isDirect ? null : rentalModel.grossIncome,
    },
  };
  useEffect(() => {
    onSnapshotRef.current?.(snapshot);
    const badge = calculationComplete && metrics.purchasePrice > 0 && metrics.annualDebtService > 0 ? `Estimate at your inputs · DSCR ${metrics.dscr.toFixed(2)}×` : undefined;
    onMetricRef.current?.(runId, badge);
  }, [runId, selectedNoi, noiSource, metrics, rentalModel, tier, loan]);

  const dominant = isSbaRealEstateDominant(parse(loan.businessPrice), sbaOnly ? 0 : parse(loan.realEstatePrice));
  const setTax = (value: string) => { setTaxEdited(true); setTaxString(value); onTaxesChange?.(value); };
  const setInsurance = (value: string) => { setInsuranceEdited(true); setInsuranceString(value); onInsuranceChange?.(value); };
  const onLoanInputChange = (next: ValuationInputState) => {
    let updated = next;
    if (next.loanType.startsWith("sba_") && (next.loanType !== loan.loanType || next.businessPrice !== loan.businessPrice || next.realEstatePrice !== loan.realEstatePrice)) {
      const reDominant = isSbaRealEstateDominant(parse(next.businessPrice), next.loanType === "sba_business" ? 0 : parse(next.realEstatePrice));
      updated = {
        ...next,
        businessDown: "10",
        businessTerm: next.realEstatePrice && reDominant ? "25" : "10",
        realEstateDown: "10",
        realEstateTerm: "25",
      };
    }
    setLoan(updated);
    onLoanTypeChange?.(updated.loanType);
    onFinancingChange?.(updated);
    if (updated.loanType.startsWith("sba_")) {
      const saved = updated.businessPrice ? String(parse(updated.businessPrice) + (updated.loanType === "sba_biz_re" ? parse(updated.realEstatePrice) : 0)) : "";
      onPurchasePriceChange?.(saved);
    } else onPurchasePriceChange?.(updated.purchasePrice);
  };
  const siteCashflow = isDaycare ? <>
    <Step number={1} title="Site Cashflow" note="revenue scenarios" />
    <div className="kyp-calcgrid two">
      <div className="kyp-calccol"><div className="ch">Revenue &amp; costs</div>
        <NumberField label="Monthly revenue per child" value={daycareRevenueRate} onChange={setDaycareRevenueRate} />
        <p className="kyp-calchelp">Default only — not a published average.</p>
      </div>
      <div className="kyp-calccol"><div className="ch">Site capacity estimate</div>
        <span className="kyp-lock"><span className="ic">Locked</span> {buildingSqFt.toLocaleString()} sq ft · {buildingAreaSource}</span>
      </div>
    </div>
    <div className="kyp-blocks two" data-testid="daycare-scenarios">
      {scenarios.map((scenario: any) => <button type="button" key={scenario.key}
        aria-pressed={daycareChoice === scenario.key}
        className={`kyp-block ${daycareChoice === scenario.key ? "ind" : "wash"}`}
        onClick={() => setDaycareChoice(scenario.key)}>
        <span className="bl">{scenario.label} · {scenario.children} children</span>
        <span className="bv">{fmt(scenario.monthlyRevenue)}<small>/mo</small></span>
        <span className="bd">{fmt(scenario.annualRevenue)} annually · revenue only</span>
        <span className="bbreak">{scenario.children} children × {fmt(parse(daycareRevenueRate))}/month</span>
      </button>)}
    </div>
    {scenarios.length > 0 && <div className="kyp-bandfoot">
      Annual revenue range: {fmt(Math.min(...scenarios.map((scenario: any) => scenario.annualRevenue)))}–{fmt(Math.max(...scenarios.map((scenario: any) => scenario.annualRevenue)))} across four capacity and enrollment assumptions. Selected: {daycareScenario?.label ?? "none"}.
    </div>}
    {!buildingSqFt && <div className="kyp-empty">Building square footage is needed to estimate site capacity. Enter it in Day Care Details above; no enrollment capacity is inferred here.</div>}
    <div className="kyp-src">Planning scenarios vary capacity and enrollment only. The default monthly rate is not a published average. Capacity uses floor area ÷ 75 or 90 sq ft/child, planning conventions above the DCFS 35 sq ft minimum, not a licensed capacity. The 75% scenarios round enrollment down to whole children. {buildingAreaSource} supplies the area; co-parcel area, where used, is not this parcel's verified usable space. No revenue or expense verdict is implied.</div>
  </> : null;

  return <div id="valuation-calculator-section" data-testid="valuation-calculator">
    {siteCashflow}
    <Step number={isDaycare ? 2 : 1} title="Deal Inputs" note="purchase · financing" />
    <div className="kyp-calcsub">Inputs are assumptions unless labeled otherwise. Save price only; other calculator assumptions are not restored on reload.</div>
    <ValuationInputs value={loan} onChange={onLoanInputChange} onSavePrice={onSavePrice} savePending={savePending}
      rateDate={mortgageRateDate} fhaRateNote={loan.loanType === "fha_va"} incomeSummary={incomeStatementComplete ? `${fmt(selectedNoi)} annual NOI · at these inputs` : "Income → NOI is incomplete; blank inputs are unknown."} />
    {isSba && <div className="kyp-calcsub">
        {sbaOnly ? "Business-only financing models one business note; property taxes and insurance are set to zero in this path." :
        dominant ? "Real estate is at least 51% of the combined price; both notes use the real-estate term convention." : "Real estate is below 51% of the combined price; business and real-estate notes use separate term conventions."}
    </div>}
    <div className="kyp-src">Conventional/FHA use their displayed preset down payment and 30-year term; rates and all financing terms are estimates, not lender offers. {!isSba && mortgageRate != null && `Benchmark: Freddie Mac conventional 30-year average ${mortgageRate}%${mortgageRateDate ? ` · ${mortgageRateDate}` : ""}; an edited input is not that benchmark.`} {loan.loanType === "fha_va" && "FHA/VA uses the conventional Freddie Mac 30-year average, not an FHA/VA quote. FHA mortgage insurance is not included."} {!isSba && mortgageRate == null && "Without a benchmark, 7.5% is an editable default, not a published rate."} {isSba && "SBA rate defaults are estimates, not lender quotes; an unavailable benchmark is not a verified current rate."}</div>

    {!isDaycare && <>
      <Step number={isDaycare ? 3 : 2} title="Income → NOI" note="one statement, sourced lines" />
      {isSba ? <>
        <div className="kyp-calcgrid two">
          <div className="kyp-calccol"><div className="ch">Business half</div>
            {listingRevenue != null && <p className="kyp-calchelp">Revenue prefilled from active listing · seller claim</p>}
            <div className="kyp-segrow">
              <div className="kyp-seg">
                <button type="button" className={businessDetail === "simple" ? "on" : ""} aria-pressed={businessDetail === "simple"} onClick={() => setBusinessDetail("simple")}>Simple</button>
                <button type="button" className={businessDetail === "detailed" ? "on" : ""} aria-pressed={businessDetail === "detailed"} onClick={() => setBusinessDetail("detailed")}>Detailed</button>
              </div>
              <div className="spacer" />
              <div className="kyp-scopenote">Business income basis</div>
            </div>
            {businessDetail === "simple" ? <>
              <NumberField label="Annual business revenue" value={businessRevenue} onChange={setBusinessRevenue} />
              <NumberField label="Annual operating expenses" value={businessExpense} onChange={setBusinessExpense} />
              {!combined && <NumberField label="Leased-occupancy expense (annual)" value={leasedOccupancy} onChange={setLeasedOccupancy} />}
            <p className="kyp-calchelp">Excludes occupancy, property taxes and building insurance. Blank expenses are unknown, not verified zeros.</p>
            {businessExpense === "" && <p className="kyp-calchelp">No operating NOI is shown until expenses are entered or an explicit 0 assumption is entered.</p>}
            </> : <>
              <p className="kyp-calchelp">Business operating costs exclude occupancy, property taxes, and building insurance. Enter them only in the property half.</p>
              <NumberField label="Annual business revenue" value={businessRevenue} onChange={setBusinessRevenue} />
              <NumberField label="Cost of goods sold" value={cogs} onChange={setCogs} />
              <NumberField label="Payroll" value={payroll} onChange={setPayroll} />
              <NumberField label="Other operating expenses" value={otherBusinessExpenses} onChange={setOtherBusinessExpenses} />
              <LedgerRow label="Book operating profit" variant="sub" tag={<ValuationTag kind="assume">Derived from entered costs</ValuationTag>} value={[businessRevenue, cogs, payroll, otherBusinessExpenses].every(enteredCost) ? fmt(businessIncome.bookOperatingProfit) : "Unknown"} />
              <NumberField label="Add back · owner salary (seller claim)" value={ownerSalary} onChange={setOwnerSalary} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <NumberField label="Add back · owner personal expenses (seller claim)" value={ownerPersonal} onChange={setOwnerPersonal} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <NumberField label="Add back · one-time items (seller claim)" value={oneTimeItems} onChange={setOneTimeItems} tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} />
              <LedgerRow label="Seller’s discretionary earnings (SDE)" variant="sub" tag={<ValuationTag kind="assume">Claimed add-backs</ValuationTag>} value={[businessRevenue, cogs, payroll, otherBusinessExpenses].every(enteredCost) ? fmt(businessIncome.sde) : "Unknown"} />
              <NumberField label="Less · market manager salary" value={managerSalary} onChange={setManagerSalary} />
              {!combined && <NumberField label="Leased-occupancy expense (annual)" value={leasedOccupancy} onChange={setLeasedOccupancy} />}
              <LedgerRow label="Business operating income (adjusted EBITDA)" variant="total" tag={<ValuationTag kind="assume">Derived</ValuationTag>} value={businessExpenseKnown ? fmt(businessIncome.businessOperatingIncome) : "Unknown"} />
              <p className="kyp-calchelp">Enter a market manager salary, including an explicit 0 assumption if appropriate. Empty add-back fields assume none; entered add-backs remain seller claims.</p>
              {(listingSde != null || listingEbitda != null) && <p className="kyp-calchelp">Listing seller claims · SDE {listingSde == null ? "not stated" : fmt(listingSde)} · EBITDA {listingEbitda == null ? "not stated" : fmt(listingEbitda)}. Claims are not verified or used as expense lines.</p>}
            </>}
          </div>
          <div className="kyp-calccol"><div className="ch">Property half · leased space only</div>
            <p className="kyp-calchelp">The business-occupied portion produces no rent here; its operating costs stay with the business. This model never imputes whole-building market rent.</p>
            {combined && <>
              <NumberField label="Third-party leased-space rent · annual" value={leasedSpaceRent} onChange={setLeasedSpaceRent} />
              <p className="kyp-calchelp">Enter 0 explicitly if no space is leased to others. Never include the operator-occupied portion.</p>
              <NumberField label="Units leased to others · expense model" value={leasedUnitCount} onChange={setLeasedUnitCount} placeholder="Default: 1 when rent is entered, otherwise 0" />
              <NumberField label="Leased-space vacancy" value={vacancyCommercial} onChange={setVacancyCommercial} suffix="%" />
              <NumberField label="Leased-space other income · annual" value={otherIncome} onChange={setOtherIncome} />
              <NumberField label="Leased-space management" value={managementPct} onChange={setManagementPct} suffix="%" />
              <NumberField label="Leased-space repairs · annual" value={repairs} onChange={setRepairs} placeholder={`Default ${fmt(leasedUnits * 1250)}`} />
              <NumberField label="Leased-space utilities · annual" value={utilities} onChange={setUtilities} placeholder={`Default ${fmt(leasedUnits * 750)}`} />
              <NumberField label="Leased-space reserves per unit · annual" value={reservesPerUnit} onChange={setReservesPerUnit} />
            </>}
            {!combined && <p className="kyp-calchelp">Enter the business-only leased-occupancy expense, including an explicit 0 if none applies. A blank is unknown and prevents a total NOI; no occupancy default is invented.</p>}
            {combined && <>
              <NumberField label="Annual property taxes · Cook County" value={taxString} onChange={setTax} />
              <NumberField label="Annual building insurance" value={insuranceString} onChange={setInsurance} />
            </>}
            {combined && <LedgerRow label="Rent from third-party leased space" tag={<ValuationTag kind={leasedSpaceRent === "" ? "assume" : "rec"}>{leasedSpaceRent === "" ? "Unknown · no rent imputed" : "Entered"}</ValuationTag>} value={fmt(parse(leasedSpaceRent))} />}
            {combined ? <>
              <LedgerRow label="Property taxes" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : taxRecordLabel}</ValuationTag>} value={`−${fmt(parse(taxString))}`} negative />
              <LedgerRow label="Building insurance" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Estimated"}</ValuationTag>} value={`−${fmt(parse(insuranceString))}`} negative />
            </> : <>
              <LedgerRow label="Property taxes · business-only path" tag={<ValuationTag kind="assume">Set to zero</ValuationTag>} value="$0" />
              <LedgerRow label="Building insurance · business-only path" tag={<ValuationTag kind="assume">Set to zero</ValuationTag>} value="$0" />
            </>}
            <LedgerRow label="Business operating income" tag={<ValuationTag kind={businessExpenseKnown ? "assume" : "est"}>{businessExpenseKnown ? "Entered expenses" : "Unknown expenses"}</ValuationTag>} value={businessExpenseKnown ? fmt(businessNoi) : "Unknown"} />
            {!combined && <LedgerRow label="Optional leased-occupancy expense" tag={<ValuationTag kind={leasedOccupancy === "" ? "assume" : "rec"}>{leasedOccupancy === "" ? "Unknown · none imputed" : "Entered"}</ValuationTag>} value={`−${fmt(leasedExpense)}`} negative={leasedExpense > 0} />}
            {combined && <ValuationLedger title="Leased-space property statement">
              <LedgerRow label="Gross income" value={enteredCost(leasedSpaceRent) ? fmt(leasedPropertyModel.grossIncome) : "Unknown"} tag={<ValuationTag kind="assume">Entered leased space</ValuationTag>} />
              <LedgerRow label="Less vacancy" value={`−${fmt(leasedPropertyModel.vacancyLoss)}`} tag={<ValuationTag kind="est">Assumption · {vacancyCommercial}%</ValuationTag>} />
              <LedgerRow label="Effective gross income" value={fmt(leasedPropertyModel.egi)} />
              <LedgerRow label="Management" value={`−${fmt(leasedPropertyModel.management)}`} tag={<ValuationTag kind="est">Imputed · {managementPct}%</ValuationTag>} />
              <LedgerRow label="Other operating costs" detail="County taxes, building insurance, repairs, utilities, and replacement reserves" value={`−${fmt(leasedPropertyModel.totalExpenses - leasedPropertyModel.management)}`} tag={<ValuationTag kind="est">Inputs and defaults</ValuationTag>} />
              <LedgerRow label="Real estate NOI" variant="total" value={enteredCost(leasedSpaceRent) && propertyCostsComplete ? fmt(sbaPropertyNoi) : "Unknown"} negative={sbaPropertyNoi < 0} />
            </ValuationLedger>}
            <div className="kyp-blocks three">
              <div className="kyp-block wash"><span className="bl">Business operating income</span><span className="bv">{businessExpenseKnown ? fmt(businessNoi) : "—"}</span></div>
              <div className="kyp-block wash"><span className="bl">{combined ? "Real estate NOI" : "Leased occupancy cost"}</span><span className="bv">{combined && !enteredCost(leasedSpaceRent) ? "—" : fmt(sbaPropertyNoi)}</span></div>
              <div className="kyp-block ind"><span className="bl">Total NOI · at these inputs</span><span className="bv">{incomeStatementComplete ? fmt(selectedNoi) : "—"}</span></div>
            </div>
          </div>
        </div>
        <div className="kyp-src">SBA 7(a) income commonly considers SDE less a market manager salary; add-backs are seller claims pending quality-of-earnings review. Business occupancy produces no property rent. Property expenses cover the leased portion only, except the full building's county taxes and building insurance, charged once. {combined && "Property defaults: 10% vacancy, 6% management imputed even if self-managed, $1,250 repairs, $750 utilities and $250 reserves per leased unit/year. A blank leased-unit field assumes one unit only when leased rent is positive; otherwise zero. Adjust these assumptions to the leased portion."} County taxes may change after sale; insurance is an estimate until replaced by a quote.</div>
      </> : <>
        <div className="kyp-calcgrid two">
          <div className="kyp-calccol"><div className="ch">Income basis</div>
            <label className="kyp-field"><span>NOI source</span><select aria-label="NOI source" className="kyp-input" value={isDirect ? "direct" : rentSource} onChange={(event) => { setHasChosenRentSource(true); setRentSource(event.currentTarget.value); }}>
              {rentalSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
              {listingStatedNoi != null && <option value="listing_noi">Listing-stated NOI · seller claim</option>}
              <option value="direct">Enter NOI directly</option>
            </select></label>
            {isListingNoi ? <LedgerRow label="Listing-stated NOI" detail="Broker figure · shown as stated, not verified" tag={<ValuationTag kind="assume">Seller claim</ValuationTag>} value={fmt(listingStatedNoi ?? 0)} /> :
              isDirect ? <><NumberField label="Annual NOI entered directly" value={directNoi} onChange={setDirectNoi} /><p className="kyp-calchelp">Blank is unknown and not a reported zero. An entered NOI is treated as fully net of property taxes and insurance.</p></> :
              <LedgerRow label="Selected rent basis" detail={selectedSource?.source ?? "No rent source"} tag={<ValuationTag kind={selectedSource?.basis === "actual" ? "rec" : "est"}>{selectedSource?.basis === "actual" ? "Actual · listing" : selectedSource?.basis === "market" ? "Market estimate" : "Manual"}</ValuationTag>} value={fmt(effectiveRent)} />}
            {!isDirect && !isListingNoi && <NumberField label="Residential rent override · annual" value={rentalOverride} onChange={setRentalOverride} />}
            {commercialOnly && !isDirect && !isListingNoi && <p className="kyp-calchelp">The existing property is commercial-only. Residential market-rent estimates are not counted; enter commercial rent in Detailed, or use an actual listing income basis.</p>}
            {tier === "advanced" && !isListingNoi && !isDirect && <>
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
            <p className="kyp-calchelp">Current Cook County bill; reassessment after sale may change taxes. Tax figure remains visible when listing NOI bypasses this deduction.</p>
            <NumberField label="Annual property taxes" value={taxString} onChange={setTax} />
            <NumberField label="Annual building insurance" value={insuranceString} onChange={setInsurance} />
            <p className="kyp-calchelp">{insuranceEdited ? "Edited assumption." : insuranceEstimated ? "Floor-area estimate; verify with an insurance quote." : "Insurance input."}</p>
            {isListingNoi && <p className="kyp-calchelp">Listing-stated NOI is shown as reported and is not adjusted for county taxes or insurance.</p>}
          </div>
        </div>
        {!isListingNoi && !isDirect && <ValuationLedger title="Property & income statement">
          <LedgerRow label="Gross income" tag={<ValuationTag kind={selectedSource?.basis === "actual" ? "rec" : "est"}>{selectedSource?.source ?? "Selected basis"}</ValuationTag>} value={fmt(rentalModel.grossIncome)} />
          <LedgerRow label="Vacancy" value={`−${fmt(rentalModel.vacancyLoss)}`} negative />
          <LedgerRow label="Effective gross income" variant="sub" value={fmt(rentalModel.egi)} />
          <LedgerRow label="Property taxes" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : "County record"}</ValuationTag>} value={`−${fmt(parse(taxString))}`} negative />
          <LedgerRow label="Building insurance" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Floor-area estimate"}</ValuationTag>} value={`−${fmt(parse(insuranceString))}`} negative />
          <LedgerRow label="Management" tag={<ValuationTag kind="assume">{managementPct}% · imputed</ValuationTag>} value={`−${fmt(rentalModel.management)}`} negative />
          <LedgerRow label="Repairs" tag={<ValuationTag kind="assume">{repairs === "" ? "Per-unit default" : "Edited"}</ValuationTag>} value={`−${fmt(repairs === "" ? units * 1250 : parse(repairs))}`} negative />
          <LedgerRow label="Utilities" tag={<ValuationTag kind="assume">{utilities === "" ? "Per-unit default" : "Edited"}</ValuationTag>} value={`−${fmt(utilities === "" ? units * 750 : parse(utilities))}`} negative />
          <LedgerRow label="Replacement reserves" tag={<ValuationTag kind="assume">Per-unit assumption</ValuationTag>} value={`−${fmt(parse(reservesPerUnit) * units)}`} negative />
          <LedgerRow label="Total operating expenses" variant="sub" value={`−${fmt(rentalModel.totalExpenses)}`} negative />
          <LedgerRow label="Net operating income" variant="total" value={incomeStatementComplete ? fmt(rentalModel.noi) : "Unknown"} negative={rentalModel.noi < 0} />
        </ValuationLedger>}
        {tier === "simple" && !isListingNoi && !isDirect && <div className="kyp-ledger">
          <div className="lh">Assumptions in use · same arithmetic as Detailed</div>
          <LedgerRow label="Residential vacancy" tag={<ValuationTag kind="assume">Assumption</ValuationTag>} value={`${vacancyResidential}%`} />
          {commercialIncomeAllowed && <LedgerRow label="Commercial vacancy" tag={<ValuationTag kind="assume">Assumption</ValuationTag>} value={`${vacancyCommercial}%`} />}
          <LedgerRow label="Management" tag={<ValuationTag kind="assume">Imputed</ValuationTag>} value={`${managementPct}% of EGI`} />
          <LedgerRow label="Repairs, utilities, reserves" tag={<ValuationTag kind="assume">{repairs === "" && utilities === "" ? "Unit-based defaults" : "Edited inputs"}</ValuationTag>} value={`${fmt(repairs === "" ? units * 1250 : parse(repairs))} · ${fmt(utilities === "" ? units * 750 : parse(utilities))} · ${fmt(parse(reservesPerUnit) * units)}`} />
        </div>}
        {directNoi && isDirect && rentalSources.length > 0 && <button type="button" className="kyp-btn" onClick={() => { setDirectNoi(""); setRentSource(rentalSources.find(source => source.key === lastBuildUpSource.current)?.key ?? rentalSources[0].key); setHasChosenRentSource(true); }}>Restore build-up</button>}
        {isDirect && <p className="kyp-calchelp">Direct NOI is treated as fully net of property taxes and insurance; the county figure remains visible for comparison.</p>}
        <div className="kyp-src">County taxes are the property record, never a listing tax figure. Insurance is a floor-area estimate until replaced by a quote. Space leased to others generates property rent; owner-occupied space does not. Unit count: {unitCountSource}; property-class counts are estimates within a class range, not an exact record. Simple and Detailed are views of the same arithmetic.</div>
      </>}
    </>}

    {isDaycare && <>
      <Step number={isDaycare ? 3 : 2} title="Income → NOI" note="selected scenario and property costs" />
      <div className="kyp-segrow">
        <div className="kyp-seg">
          <button type="button" className={tier === "simple" ? "on" : ""} aria-pressed={tier === "simple"} onClick={() => setTier("simple")}>Simple</button>
          <button type="button" className={tier === "advanced" ? "on" : ""} aria-pressed={tier === "advanced"} onClick={() => setTier("advanced")}>Detailed</button>
        </div>
        <div className="spacer" />
        <div className="kyp-scopenote">Simple and Detailed show the same arithmetic. Detailed exposes the two income halves.</div>
      </div>
      <NumberField label="Annual business operating expenses" value={daycareExpense} onChange={setDaycareExpense} tag={<ValuationTag kind="assume">{daycareBusinessExpenseKnown ? "Entered" : "Unknown"}</ValuationTag>} />
      <p className="kyp-calchelp">Excluding occupancy, property taxes and building insurance. Blank is unknown; enter 0 only as an explicit assumption.</p>
      {tier === "advanced" ? <>
      <ValuationLedger title="Business half">
      <LedgerRow label="Scenario revenue" tag={<ValuationTag kind="assume">Planning estimate</ValuationTag>} value={fmt(daycareScenario?.annualRevenue ?? 0)} />
      <LedgerRow label="Business expenses" detail="Excludes occupancy, property taxes and building insurance" tag={<ValuationTag kind={daycareBusinessExpenseKnown ? "assume" : "est"}>{daycareBusinessExpenseKnown ? "Entered assumption" : "Unknown"}</ValuationTag>} value={daycareBusinessExpenseKnown ? `−${fmt(parse(daycareExpense))}` : "Unknown"} negative={daycareBusinessExpenseKnown} />
      <LedgerRow label="Business operating income" variant="sub" value={daycareBusinessExpenseKnown ? fmt(daycareBusinessIncome) : "Unknown"} />
      </ValuationLedger>
      <ValuationLedger title="Property half">
      <LedgerRow label="Rent from leased space" tag={<ValuationTag kind="assume">Owner-occupied convention</ValuationTag>} value="$0" />
      <LedgerRow label="Property taxes · county record" tag={<ValuationTag kind={taxEdited ? "assume" : "rec"}>{taxEdited ? "Edited" : taxRecordLabel}</ValuationTag>} value={`−${fmt(parse(taxString))}`} negative />
      <LedgerRow label="Building insurance · estimate" tag={<ValuationTag kind={insuranceEdited ? "assume" : "est"}>{insuranceEdited ? "Edited" : "Floor-area estimate"}</ValuationTag>} value={`−${fmt(parse(insuranceString))}`} negative />
      <LedgerRow label="Property NOI" variant="total" value={propertyCostsComplete ? fmt(daycarePropertyNoi) : "Unknown"} negative />
      </ValuationLedger>
      </> : null}
      <div className="kyp-blocks three">
        <div className="kyp-block wash"><span className="bl">Business operating income</span><span className="bv">{daycareBusinessExpenseKnown ? fmt(daycareBusinessIncome) : "—"}</span></div>
        <div className="kyp-block wash"><span className="bl">Property NOI</span><span className="bv">{propertyCostsComplete ? fmt(daycarePropertyNoi) : "—"}</span></div>
        <div className="kyp-block ind"><span className="bl">Total NOI</span><span className="bv">{incomeStatementComplete ? fmt(selectedNoi) : "—"}</span></div>
      </div>
      <div className="kyp-calcgrid two">
        <NumberField label="Annual property taxes · Cook County record" value={taxString} onChange={setTax} />
        <NumberField label="Annual building insurance estimate" value={insuranceString} onChange={setInsurance} />
      </div>
      <div className="kyp-src">Revenue is the selected site scenario; entered business expenses exclude occupancy, property taxes, and building insurance. The annual expense input stays fixed when enrollment changes; it does not automatically fall with revenue. The property half earns no rent because the business occupies the building. County taxes and estimated building insurance are deducted here once. Taxes may change after sale; insurance is an estimate, not a quote.</div>
    </>}
    <Step number={isDaycare ? 4 : 3} title="Deal at a Glance" note="derived from inputs" />
    {calculationComplete ? <ValuationResults metrics={metrics} blended={combined} businessOnly={sbaOnly} /> : <div className="kyp-empty">Enter the missing income, expenses, property costs, and rate inputs to calculate deal metrics. Blank inputs are unknown, not zero.</div>}
    {calculationComplete && metrics.annualDebtService > 0 && <ValuationBands dscr={metrics.dscr} />}
    <div className="kyp-src">Estimate at the inputs shown; this is not investment, legal, tax, insurance, or financing advice. The ±$250/month break-even window is a product display convention, not a lender standard. {loan.loanType === "fha_va" && "FHA/VA are owner-occupant products; the 1.25× commercial floor is not their qualification test."} {combined || sbaOnly ? "Business/blended yield includes goodwill and is not a comparable real-estate cap rate." : calculationComplete && metrics.capRate > 10 ? "A real-estate cap rate above 10% is unusual." : null}</div>

    <Step number={isDaycare ? 5 : 4} title="Coverage Check" note="NOI vs. debt service" />
    {calculationComplete && <ValuationCoverage metrics={metrics} selectedNoi={selectedNoi} isFha={loan.loanType === "fha_va"} />}
    {dscrLoanRatio != null && <div className="kyp-receipt"><b>DSCR-loan ratio</b> = selected gross residential rent {fmt(effectiveRent)} ÷ PITIA {fmt(metrics.annualDebtService + parse(taxString) + parse(insuranceString))} = <b>{dscrLoanRatio.toFixed(2)}×</b>. This 1–4 unit loan convention differs from economic NOI coverage; both use the same tax and insurance inputs.</div>}
    <div className="kyp-src">Coverage compares the entered/derived NOI with debt service at these loan assumptions. Verify terms with a lender. It is not investment or financing advice.</div>
    <Step number={isDaycare ? 6 : 5} title="How It’s Calculated" note="formula receipt" />
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
    <div className="kyp-src">Source and scope: inputs selected above, Cook County property tax record, and stated listing or market-rent source where shown. Calculator estimates only; verify records, rent, expenses, and financing independently.</div>
  </div>;
}

export default ValuationCalculator;
export const ValuationSection = ValuationCalculator;