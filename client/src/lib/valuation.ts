// Pure valuation math shared between the RunDetail calculator UI and the
// report-context save handler, so the numbers saved for the AI report are
// exactly the numbers shown on screen.

export function parseFormattedNumber(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0;
}

// PMT helper - rate is passed as percentage (e.g., 6.0 for 6%)
export function calculatePMT(principal: number, rate: number, years: number): number {
  const monthlyRate = rate / 100 / 12;
  const numPayments = years * 12;
  if (monthlyRate > 0 && principal > 0) {
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  }
  return principal > 0 ? principal / numPayments : 0;
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

    const businessDownPct = Math.max(0, parseFloat(i.sbaBusinessDownPercent) || 10) / 100;
    const businessTermYrs = Math.max(1, parseFloat(i.sbaBusinessTermYears) || 10);
    const businessRate = parseFloat(i.sbaBusinessInterestRate) || 10.25; // Business uses prime + 2.75%
    const realEstateDownPct = Math.max(0, parseFloat(i.sbaRealEstateDownPercent) || 10) / 100;
    const realEstateTermYrs = Math.max(1, parseFloat(i.sbaRealEstateTermYears) || 25);
    const realEstateRate = parseFloat(i.sbaRealEstateInterestRate) || 6.0; // SBA 504 rate

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
    const downPaymentPercent = i.presetDownPaymentPercent || 20;
    const termYears = i.presetTermYears || 30;
    const ratePercent = parseFloat(i.interestRateInput) || 7.5;

    downPayment = purchasePrice * (downPaymentPercent / 100);
    loanAmount = purchasePrice - downPayment;

    const monthlyPayment = calculatePMT(loanAmount, ratePercent, termYears);
    annualDebtService = monthlyPayment * 12;
  }

  // Annual operating costs (taxes + insurance)
  // - SBA business-only: zeroed (factored into lease/NOI from tenant)
  // - Any loan type with NOI filled: zeroed (NOI already nets taxes & insurance)
  // - No NOI (owner-occupied): show PITI breakdown, deduct taxes & insurance from cash flow
  const hasNoi = i.selectedNoi > 0;
  const noiCoversExpenses = !isSba && hasNoi;
  const annualTaxes = (isSbaBusinessOnly || noiCoversExpenses) ? 0 : annualTaxesRaw;
  const annualInsurance = (isSbaBusinessOnly || noiCoversExpenses) ? 0 : annualInsuranceRaw;
  const annualOperatingCosts = annualTaxes + annualInsurance;
  const monthlyPI = annualDebtService / 12;
  const monthlyTaxes = annualTaxes / 12;
  const monthlyInsurance = annualInsurance / 12;
  const monthlyPITI = monthlyPI + monthlyTaxes + monthlyInsurance;

  // Annual cash flow (after debt service, taxes, and insurance)
  const annualCashFlow = i.selectedNoi - annualDebtService - annualOperatingCosts;

  // Key metrics
  const dscr = annualDebtService > 0 ? i.selectedNoi / annualDebtService : 0;
  const capRate = purchasePrice > 0 ? (i.selectedNoi / purchasePrice) * 100 : 0;
  const roi = downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0; // Cash-on-cash return

  return {
    purchasePrice,
    downPayment,
    loanAmount,
    annualDebtService,
    sbaBusinessMonthly,
    sbaRealEstateMonthly,
    annualTaxes,
    annualInsurance,
    annualOperatingCosts,
    monthlyPI,
    monthlyTaxes,
    monthlyInsurance,
    monthlyPITI,
    annualCashFlow,
    dscr,
    capRate,
    roi,
    hasNoi,
    noiCoversExpenses,
  };
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
  selectedNoi: number;
  noiSource: string;
  metrics: ValuationMetrics;
  noiModel?: NoiModelSnapshot | null;
}
