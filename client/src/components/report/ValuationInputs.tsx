import React, { useContext } from "react";
import { formatNumberInput } from "@/lib/valuation";
import { ValuationTag } from "./ValuationLedger";
import { SectionNumberContext } from "./AccordionSection";

export type ValuationLoanType = "conventional" | "fha_va" | "sba_business" | "sba_biz_re";

export interface ValuationInputState {
  loanType: ValuationLoanType;
  purchasePrice: string;
  businessPrice: string;
  realEstatePrice: string;
  interestRate: string;
  businessDown: string;
  businessTerm: string;
  businessRate: string;
  realEstateDown: string;
  realEstateTerm: string;
  realEstateRate: string;
}

export const LOAN_PRESETS: Record<ValuationLoanType, { label: string; down: number; term: number }> = {
  conventional: { label: "Conventional · 20% Down, 30 Years", down: 20, term: 30 },
  fha_va: { label: "FHA / VA · 5% Down, 30 Years", down: 5, term: 30 },
  sba_business: { label: "SBA · Business Only", down: 10, term: 10 },
  sba_biz_re: { label: "SBA · Business + Real Estate", down: 10, term: 25 },
};

interface Props {
  value: ValuationInputState;
  onChange: (next: ValuationInputState) => void;
  onSavePrice?: () => void;
  savePending?: boolean;
  hasNoi: boolean;
  noiValue: string;
  monthlyPayment: string;
  showPropertyCosts: boolean;
  annualTaxes?: string;
  annualInsurance?: string;
  onTaxesChange?: (value: string) => void;
  onInsuranceChange?: (value: string) => void;
  taxesTag?: React.ReactNode;
  insuranceTag?: React.ReactNode;
  listingPricePrefill?: boolean;
}

function Field({ label, value, onChange, prefix, suffix, locked = false, id, tag, placeholder }: {
  label: string; value: string; onChange?: (value: string) => void; prefix?: string; suffix?: string;
  locked?: boolean; id: string; tag?: React.ReactNode; placeholder?: string;
}) {
  return <label className="kyp-field" htmlFor={id}>
    <span>{label} {tag}</span>
    <span className={`kyp-inprefix ${suffix ? "suf" : ""}`}>
      {prefix && <span className="fx">{prefix}</span>}
      <input id={id} className="kyp-input num" inputMode="decimal" value={value} placeholder={placeholder}
        readOnly={locked} onChange={(event) => onChange?.(formatNumberInput(event.currentTarget.value))} />
      {suffix && <span className="fx">{suffix}</span>}
    </span>
  </label>;
}

export function ValuationInputs({
  value, onChange, onSavePrice, savePending, hasNoi, noiValue, monthlyPayment, showPropertyCosts,
  annualTaxes = "", annualInsurance = "", onTaxesChange, onInsuranceChange,
  taxesTag, insuranceTag, listingPricePrefill = false,
}: Props) {
  const sectionNumber = useContext(SectionNumberContext);
  const sectionPrefix = sectionNumber == null ? "valuation" : String(sectionNumber).padStart(2, "0");
  const readoutTarget = `#valuation-subsection-${sectionPrefix}-2`;
  const update = (key: keyof ValuationInputState, next: string) => onChange({ ...value, [key]: formatNumberInput(next) });
  const isSba = value.loanType.startsWith("sba_");
  const isCombined = value.loanType === "sba_biz_re";
  const preset = LOAN_PRESETS[value.loanType];
  const groups = isSba ? [
    { head: "Purchase", columns: isCombined ? 2 : 1, fields: <>
      <Field id="valuation-business-price" label="Business purchase price" value={value.businessPrice} prefix="$" onChange={(v) => update("businessPrice", v)} />
      {isCombined && <Field id="valuation-real-estate-price" label="Real estate price" value={value.realEstatePrice} prefix="$" tag={listingPricePrefill ? <ValuationTag kind="est">From listing</ValuationTag> : undefined} onChange={(v) => update("realEstatePrice", v)} />}
    </> },
    { head: "Financing", columns: isCombined ? 3 : 3, fields: <>
      <Field id="sba-business-down" label="Business down payment" value={value.businessDown} suffix="%" onChange={(v) => update("businessDown", v)} />
      <Field id="sba-business-term" label="Business term" value={value.businessTerm} suffix="yr" onChange={(v) => update("businessTerm", v)} />
      <Field id="sba-business-rate" label="Business rate" value={value.businessRate} suffix="%" onChange={(v) => update("businessRate", v)} />
      {isCombined && <>
        <Field id="sba-re-down" label="Real estate down payment" value={value.realEstateDown} suffix="%" onChange={(v) => update("realEstateDown", v)} />
        <Field id="sba-re-term" label="Real estate term" value={value.realEstateTerm} suffix="yr" onChange={(v) => update("realEstateTerm", v)} />
        <Field id="sba-re-rate" label="Real estate rate" value={value.realEstateRate} suffix="%" onChange={(v) => update("realEstateRate", v)} />
      </>}
    </> },
  ] : [
    { head: "Purchase & financing", columns: 3, fields: <>
      <Field id="valuation-purchase-price" label="Purchase price" value={value.purchasePrice} prefix="$" tag={listingPricePrefill ? <ValuationTag kind="est">From listing</ValuationTag> : undefined} onChange={(v) => update("purchasePrice", v)} />
      <Field id="valuation-down-payment" label="Down payment" value={String(preset.down)} suffix="%" locked />
      <Field id="valuation-rate" label="Annual interest rate" value={value.interestRate} suffix="%" onChange={(v) => update("interestRate", v)} />
    </> },
    ...(showPropertyCosts ? [{
      head: "Property costs", columns: 2, fields: <>
        <Field id="valuation-county-tax" label="Annual property taxes · Cook County" value={annualTaxes} prefix="$" tag={taxesTag} onChange={onTaxesChange} />
        <Field id="valuation-building-insurance" label="Annual building insurance" value={annualInsurance} prefix="$" tag={insuranceTag} onChange={onInsuranceChange} />
      </>,
    }] : []),
  ];
  return <>
    <div className="kyp-selectrow">
      <label className="kyp-field" htmlFor="valuation-loan-path"><span>Financing path</span>
        <select id="valuation-loan-path" aria-label="Financing path" className="kyp-input kyp-select" value={value.loanType}
          onChange={(event) => onChange({ ...value, loanType: event.currentTarget.value as ValuationLoanType })}>
          {Object.entries(LOAN_PRESETS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <div className="kyp-dealgrid" data-testid="valuation-input-grid">
      {groups.map((group) => {
        const count = group.columns;
        return <div className="kyp-dealgroup" key={group.head}>
          <div className="ch">{group.head}</div>
          <div className={`kyp-dealfields ${count >= 3 ? "three" : count === 2 ? "two" : "one"}`}>{group.fields}</div>
        </div>;
      })}
    </div>
    <div className="kyp-readout">
      <span className="rl">{hasNoi ? "NOI" : "Monthly payment"}</span>
      <span className="rv">{hasNoi ? noiValue : monthlyPayment}</span>
      <span className="rn">{hasNoi ? "per year at these inputs · " : "principal, interest, taxes and insurance · "}
        <a href={readoutTarget}>built in {sectionPrefix}.2 below</a>
      </span>
      <button type="button" className="kyp-btn ghost" onClick={onSavePrice} disabled={savePending || !onSavePrice}>
        {savePending ? "Saving…" : "Save to this run"}
      </button>
    </div>
    <div className="kyp-lock">Preset · {preset.down}% down · {preset.term}-year term</div>
  </>;
}
