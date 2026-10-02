// Pure valuation math shared between the RunDetail calculator UI and the
// report-context save handler, so the numbers saved for the AI report are
// exactly the numbers shown on screen.

export function parseFormattedNumber(value: string): number {
  const parsed = parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// PMT helper - rate is passed as percentage (e.g., 6.0 for 6%)
export function calculatePMT(principal: number, rate: number, years: number): number {
  const safePrincipal = Number.isFinite(principal) ? Math.max(0, principal) : 0;
  const safeYears = Number.isFinite(years) ? Math.min(100, Math.max(1, years)) : 1;
  const safeRate = Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0;
  const monthlyRate = safeRate / 100 / 12;
  const numPayments = safeYears * 12;
  if (safePrincipal <= 0) return 0;
  if (monthlyRate > 0) {
    const denominator = 1 - Math.exp(-numPayments * Math.log1p(monthlyRate));
    const payment = (safePrincipal * monthlyRate) / denominator;
    return Number.isFinite(payment) ? payment : safePrincipal;
  }
  return safePrincipal / numPayments;
}

function finiteInput(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteOutput(value: number): number {
  if (Number.isFinite(value)) return value;
  if (Number.isNaN(value)) return 0;
  return value < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

function parsedInput(value: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return Math.min(maximum, Math.max(minimum, valid ? parsed : fallback));
}

function parsePercentageInput(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(100, parsed)
    : fallback;
}

function parseDownPaymentPercent(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, parsed))
    : fallback;
}

function resolveDownPaymentPercent(value: number): number {
  return Math.min(100, Math.max(0, finiteInput(value, 20)));
}

function resolveTermYears(value: number, fallback: number): number {
  const valid = Number.isFinite(value) && value >= 1;
  return Math.min(100, Math.max(1, valid ? value : fallback));
}

export interface ValuationInputs {
  loanType: string;
  // Non-SBA inputs (formatted strings straight from state)
  purchasePriceInput: string;
  interestRateInput: string;
  presetDownPaymentPercent: number;
  presetTermYears: number;
  // SBA inputs (formatted strings straight from state)
  sbaBusinessPrice: string;
  sbaRealEstatePrice: string;
  sbaBusinessDownPercent: string;
  sbaBusinessTermYears: string;
  sbaBusinessInterestRate: string;
  sbaRealEstateDownPercent: string;
  sbaRealEstateTermYears: string;
  sbaRealEstateInterestRate: string;
  // Resolved NOI (daycare cashflow option, manual entry, or rental-derived)
  selectedNoi: number;
  annualTaxesInput: string;
  annualInsuranceInput: string;
  /** True when selectedNoi already includes property taxes and insurance. */
  noiIncludesPropertyExpenses?: boolean;
}

export interface ValuationMetrics {
  purchasePrice: number;
  downPayment: number;
  loanAmount: number;
  annualDebtService: number;
  sbaBusinessMonthly: number;
  sbaRealEstateMonthly: number;
  annualTaxes: number;
  annualInsurance: number;
  annualOperatingCosts: number;
  monthlyPI: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyPITI: number;
  annualCashFlow: number;
  dscr: number;
  capRate: number;
  roi: number;
  hasNoi: boolean;
  noiCoversExpenses: boolean;
}

export function computeValuationMetrics(i: ValuationInputs): ValuationMetrics {
  const isSba = i.loanType === 'sba_business' || i.loanType === 'sba_biz_re';
  const isSbaBusinessOnly = i.loanType === 'sba_business';

  const annualTaxesRaw = Math.max(0, parseFormattedNumber(i.annualTaxesInput));
  const annualInsuranceRaw = Math.max(0, parseFormattedNumber(i.annualInsuranceInput));
  const selectedNoi = finiteInput(i.selectedNoi, 0);

  let purchasePrice: number;
  let downPayment: number;
  let loanAmount: number;
  let annualDebtService: number;
  let sbaBusinessMonthly = 0;
  let sbaRealEstateMonthly = 0;

  if (isSba) {
    // SBA loan with separate business and real estate components
    const businessPrice = Math.max(0, parseFormattedNumber(i.sbaBusinessPrice));
    // Only include RE price if not business-only mode
    const realEstatePrice = isSbaBusinessOnly ? 0 : Math.max(0, parseFormattedNumber(i.sbaRealEstatePrice));
    purchasePrice = businessPrice + realEstatePrice;

    const businessDownPct = parseDownPaymentPercent(i.sbaBusinessDownPercent, 10) / 100;
    const businessTermYrs = parsedInput(i.sbaBusinessTermYears, 10, 1, 100);
    const businessRate = parsePercentageInput(i.sbaBusinessInterestRate, 10.25); // Business uses prime + 2.75%
    const realEstateDownPct = parseDownPaymentPercent(i.sbaRealEstateDownPercent, 10) / 100;
    const realEstateTermYrs = parsedInput(i.sbaRealEstateTermYears, 25, 1, 100);
    const realEstateRate = parsePercentageInput(i.sbaRealEstateInterestRate, 6.0); // SBA 504 rate

    const businessDown = businessPrice * businessDownPct;
    const realEstateDown = realEstatePrice * realEstateDownPct;
    downPayment = businessDown + realEstateDown;

    const businessLoan = businessPrice - businessDown;
    const realEstateLoan = realEstatePrice - realEstateDown;
    loanAmount = businessLoan + realEstateLoan;

    // Business uses prime + 2.75%, RE uses SBA 504 rate
    sbaBusinessMonthly = calculatePMT(businessLoan, businessRate, businessTermYrs);
    sbaRealEstateMonthly = calculatePMT(realEstateLoan, realEstateRate, realEstateTermYrs);
    annualDebtService = (sbaBusinessMonthly + sbaRealEstateMonthly) * 12;
  } else {
    // Non-SBA: simple single loan
    purchasePrice = Math.max(0, parseFormattedNumber(i.purchasePriceInput));
    const downPaymentPercent = resolveDownPaymentPercent(i.presetDownPaymentPercent);
    const termYears = resolveTermYears(i.presetTermYears, 30);
    const ratePercent = parsePercentageInput(i.interestRateInput, 7.5);

    downPayment = purchasePrice * (downPaymentPercent / 100);
    loanAmount = purchasePrice - downPayment;

    const monthlyPayment = calculatePMT(loanAmount, ratePercent, termYears);
    annualDebtService = monthlyPayment * 12;
  }

  // Property costs are shown in PITI and deducted from cash flow unless NOI
  // explicitly says it already contains them. With the flag absent, retain
  // the legacy behavior for existing callers.
  const hasNoi = selectedNoi > 0;
  // Keep historical behavior for existing callers. New callers can state
  // explicitly whether property expenses are already represented in NOI,
  // independent of whether the NOI is positive, zero, negative, or SBA.
  const noiCoversExpenses = typeof i.noiIncludesPropertyExpenses === 'boolean'
    ? i.noiIncludesPropertyExpenses
    : (!isSba && hasNoi) || isSbaBusinessOnly;
  const annualTaxes = noiCoversExpenses ? 0 : annualTaxesRaw;
  const annualInsurance = noiCoversExpenses ? 0 : annualInsuranceRaw;
  const annualOperatingCosts = annualTaxes + annualInsurance;
  const monthlyPI = annualDebtService / 12;
  const monthlyTaxes = annualTaxes / 12;
  const monthlyInsurance = annualInsurance / 12;
  const monthlyPITI = monthlyPI + monthlyTaxes + monthlyInsurance;

  // Annual cash flow (after debt service, taxes, and insurance)
  const annualCashFlow = selectedNoi - annualDebtService - annualOperatingCosts;

  // Key metrics
  const dscr = annualDebtService > 0 ? selectedNoi / annualDebtService : 0;
  const capRate = purchasePrice > 0 ? (selectedNoi / purchasePrice) * 100 : 0;
  const roi = downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0; // Cash-on-cash return

  return {
    purchasePrice: finiteOutput(purchasePrice),
    downPayment: finiteOutput(downPayment),
    loanAmount: finiteOutput(loanAmount),
    annualDebtService: finiteOutput(annualDebtService),
    sbaBusinessMonthly: finiteOutput(sbaBusinessMonthly),
    sbaRealEstateMonthly: finiteOutput(sbaRealEstateMonthly),
    annualTaxes: finiteOutput(annualTaxes),
    annualInsurance: finiteOutput(annualInsurance),
    annualOperatingCosts: finiteOutput(annualOperatingCosts),
    monthlyPI: finiteOutput(monthlyPI),
    monthlyTaxes: finiteOutput(monthlyTaxes),
    monthlyInsurance: finiteOutput(monthlyInsurance),
    monthlyPITI: finiteOutput(monthlyPITI),
    annualCashFlow: finiteOutput(annualCashFlow),
    dscr: finiteOutput(dscr),
    capRate: finiteOutput(capRate),
    roi: finiteOutput(roi),
    hasNoi,
    noiCoversExpenses,
  };
}

/** SBA ownership rule: real estate is dominant at a 51% share of combined price. */
export function isSbaRealEstateDominant(businessPrice: number, realEstatePrice: number): boolean {
  const business = Number.isFinite(businessPrice) ? Math.max(0, businessPrice) : 0;
  const realEstate = Number.isFinite(realEstatePrice) ? Math.max(0, realEstatePrice) : 0;
  const total = business + realEstate;
  return total > 0 && realEstate / total >= 0.51;
}

export interface BusinessIncomeInputs {
  detailMode: 'simple' | 'detailed';
  revenueAnnual: number;
  operatingExpensesAnnual: number;
  costOfGoodsSoldAnnual: number;
  payrollAnnual: number;
  otherOperatingExpensesAnnual: number;
  ownerSalaryAnnual: number;
  ownerPersonalExpensesAnnual: number;
  oneTimeItemsAnnual: number;
  managerSalaryAnnual: number;
}

export interface BusinessIncomeResult {
  bookOperatingProfit: number;
  sde: number;
  businessOperatingIncome: number;
}

/** Calculate business earnings separately from property expenses and debt service. */
export function computeBusinessIncome(i: BusinessIncomeInputs): BusinessIncomeResult {
  if (i.detailMode === 'simple') {
    const profit = i.revenueAnnual - i.operatingExpensesAnnual;
    return { bookOperatingProfit: profit, sde: profit, businessOperatingIncome: profit };
  }
  const bookOperatingProfit = i.revenueAnnual -
    i.costOfGoodsSoldAnnual -
    i.payrollAnnual -
    i.otherOperatingExpensesAnnual;
  const sde = bookOperatingProfit +
    i.ownerSalaryAnnual +
    i.ownerPersonalExpensesAnnual +
    i.oneTimeItemsAnnual;
  const businessOperatingIncome = sde - i.managerSalaryAnnual;
  return { bookOperatingProfit, sde, businessOperatingIncome };
}

export interface DaycareScenario {
  key: '100_efficient' | '100_comfortable' | '75_efficient' | '75_comfortable';
  label: string;
  capacity: number;
  children: number;
  monthlyRevenue: number;
  annualRevenue: number;
}

export function computeDaycareScenarios(input: {
  buildingSqFt: number;
  revenuePerChildMonthly: number;
}): DaycareScenario[] {
  const sqft = Number.isFinite(input.buildingSqFt) ? Math.max(0, input.buildingSqFt) : 0;
  const revenuePerChild = Number.isFinite(input.revenuePerChildMonthly)
    ? Math.max(0, input.revenuePerChildMonthly)
    : 0;
  const capacities = {
    efficient: Math.floor(sqft / 75),
    comfortable: Math.floor(sqft / 90),
  };
  const scenarios: Array<Omit<DaycareScenario, 'monthlyRevenue' | 'annualRevenue'>> = [
    { key: '100_efficient', label: '100% · Efficient (75 sq ft/child)', capacity: capacities.efficient, children: capacities.efficient },
    { key: '100_comfortable', label: '100% · Comfortable (90 sq ft/child)', capacity: capacities.comfortable, children: capacities.comfortable },
    { key: '75_efficient', label: '75% · Efficient (75 sq ft/child)', capacity: capacities.efficient, children: Math.floor(capacities.efficient * 0.75) },
    { key: '75_comfortable', label: '75% · Comfortable (90 sq ft/child)', capacity: capacities.comfortable, children: Math.floor(capacities.comfortable * 0.75) },
  ];
  return scenarios.map(scenario => {
    const monthlyRevenue = finiteOutput(scenario.children * revenuePerChild);
    return {
      ...scenario,
      monthlyRevenue,
      annualRevenue: finiteOutput(monthlyRevenue * 12),
    };
  });
}

// ── Transparent NOI build-up (Investor · buy-to-lease mode) ────────────────
// NOI is built from a full income/expense statement, never typed. Simple and
// Advanced tiers are VIEWS of this one model — the NOI is identical in both.
// It must never revert to "rent − taxes − insurance".

export interface NoiModelInputs {
  residentialRentAnnual: number;  // gross, before vacancy (from NOI Basis)
  commercialRentAnnual: number;   // only for mixed/commercial property class
  otherIncomeAnnual: number;      // parking / laundry / storage
  vacancyResiPct: number;         // default 5
  vacancyCommPct: number;         // default 10
  annualTaxes: number;            // from record — same value PITIA reuses
  annualInsurance: number;        // estimate — same value PITIA reuses
  managementPctOfEgi: number;     // default 6, imputed even if self-managed
  repairsAnnual: number;
  utilitiesAnnual: number;
  reservesAnnual: number;         // default $250/unit/yr × units
}

export interface NoiModelResult {
  grossIncome: number;
  vacancyLoss: number;
  egi: number;
  management: number;
  totalExpenses: number;
  noi: number;                    // can be negative — display honestly
}

export function computeNoiModel(i: NoiModelInputs): NoiModelResult {
  const pct = (p: number) => Math.min(100, Math.max(0, p || 0)) / 100;
  const resi = Math.max(0, i.residentialRentAnnual || 0);
  const comm = Math.max(0, i.commercialRentAnnual || 0);
  const other = Math.max(0, i.otherIncomeAnnual || 0);
  const grossIncome = resi + comm + other;
  const vacancyLoss = resi * pct(i.vacancyResiPct) + comm * pct(i.vacancyCommPct);
  const egi = grossIncome - vacancyLoss;
  const management = egi * pct(i.managementPctOfEgi);
  const totalExpenses =
    Math.max(0, i.annualTaxes || 0) +
    Math.max(0, i.annualInsurance || 0) +
    management +
    Math.max(0, i.repairsAnnual || 0) +
    Math.max(0, i.utilitiesAnnual || 0) +
    Math.max(0, i.reservesAnnual || 0);
  const noi = egi - totalExpenses;
  return { grossIncome, vacancyLoss, egi, management, totalExpenses, noi };
}

// DSCR-loan ratio (1–4 unit non-QM product): gross market rent ÷ PITIA.
// PITIA taxes & insurance MUST be the same values used in the NOI statement.
export function computeDscrLoanRatio(
  grossRentAnnual: number,
  annualPI: number,
  annualTaxes: number,
  annualInsurance: number,
  annualHoa = 0,
): number {
  const pitia = Math.max(0, annualPI) + Math.max(0, annualTaxes) + Math.max(0, annualInsurance) + Math.max(0, annualHoa);
  return pitia > 0 ? Math.max(0, grossRentAnnual) / pitia : 0;
}

export interface NoiModelSnapshot {
  tier: 'simple' | 'advanced';
  mode: 'investor';
  inputs: NoiModelInputs;
  result: NoiModelResult;
  dscrLoanRatio: number | null;   // null when the 1–4 unit product doesn't apply
  manualOverride: boolean;        // true = user typed NOI directly (T-12 escape)
}

export interface ValuationSnapshot {
  /** False when an income or financing input is unknown; numeric outputs are not evidence. */
  calculationComplete?: boolean;
  selectedNoi: number;
  noiSource: string;
  metrics: ValuationMetrics;
  noiModel?: NoiModelSnapshot | null;
  businessIncomeModel?: {
    detailMode: 'simple' | 'detailed';
    inputs: BusinessIncomeInputs;
    result: BusinessIncomeResult;
  } | null;
  daycareModel?: {
    buildingSqFt: number;
    revenuePerChildMonthly: number;
    scenarios: DaycareScenario[];
  } | null;
  inputSnapshot?: Record<string, unknown>;
}
