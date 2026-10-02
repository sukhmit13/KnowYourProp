import React from "react";

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
  conventional: { label: "Conventional", down: 20, term: 30 },
  fha_va: { label: "FHA / VA", down: 5, term: 30 },
  sba_business: { label: "SBA · business only", down: 10, term: 10 },
  sba_biz_re: { label: "SBA · business + real estate", down: 10, term: 25 },
};

interface Props {
  value: ValuationInputState;
  onChange: (next: ValuationInputState) => void;
  onSavePrice?: () => void;
  savePending?: boolean;
  rateDate?: string | null;
  fhaRateNote?: boolean;
  incomeSummary?: string;
}

function Field({ label, value, onChange, prefix, suffix, locked = false, id }: {
  label: string; value: string; onChange?: (value: string) => void; prefix?: string; suffix?: string; locked?: boolean; id: string;
}) {
  return <label className="kyp-field" htmlFor={id}>
    <span>{label}</span>
    <span className={`kyp-inprefix ${suffix ? "suf" : ""}`}>
      {prefix && <span className="fx">{prefix}</span>}
      <input id={id} className="kyp-input" inputMode="decimal" value={value} readOnly={locked}
        onChange={(event) => onChange?.(event.currentTarget.value)} />
      {suffix && <span className="fx">{suffix}</span>}
    </span>
  </label>;
}

export function ValuationInputs({ value, onChange, onSavePrice, savePending, rateDate, fhaRateNote, incomeSummary }: Props) {
  const update = (key: keyof ValuationInputState, next: string) => onChange({ ...value, [key]: next });
  const isSba = value.loanType.startsWith("sba_");
  const isCombined = value.loanType === "sba_biz_re";
  const preset = LOAN_PRESETS[value.loanType];
  return <>
  <label className="kyp-field" htmlFor="valuation-loan-path"><span>Financing path</span>
    <select id="valuation-loan-path" aria-label="Financing path" className="kyp-input" value={value.loanType}
      onChange={(event) => onChange({ ...value, loanType: event.currentTarget.value as ValuationLoanType })}>
      {Object.entries(LOAN_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
    </select>
  </label>
   <div className={`kyp-calcgrid${incomeSummary == null ? " two" : ""}`} data-testid="valuation-input-grid">
    <div className="kyp-calccol">
      <div className="ch">Purchase</div>
      {isSba ? <>
        <Field id="valuation-business-price" label="Business purchase price" value={value.businessPrice} prefix="$" onChange={(v) => update("businessPrice", v)} />
        {isCombined && <Field id="valuation-real-estate-price" label="Real estate price" value={value.realEstatePrice} prefix="$" onChange={(v) => update("realEstatePrice", v)} />}
      </> : <Field id="valuation-purchase-price" label="Purchase price" value={value.purchasePrice} prefix="$" onChange={(v) => update("purchasePrice", v)} />}
      <button type="button" className="kyp-btn" onClick={onSavePrice} disabled={savePending || !onSavePrice}>
        {savePending ? "Saving…" : "Save price only"}
      </button>
    </div>
    <div className="kyp-calccol">
      <div className="ch">Financing</div>
      {isSba ? <>
        <div className="kyp-calccol">
          <div className="ch">Business note</div>
          <Field id="sba-business-down" label="Down payment" value={value.businessDown} suffix="%" onChange={(v) => update("businessDown", v)} />
          <Field id="sba-business-term" label="Term" value={value.businessTerm} suffix="yr" onChange={(v) => update("businessTerm", v)} />
          <Field id="sba-business-rate" label="Rate" value={value.businessRate} suffix="%" onChange={(v) => update("businessRate", v)} />
        </div>
        {isCombined && <div className="kyp-calccol">
          <div className="ch">Real estate note</div>
          <Field id="sba-re-down" label="Down payment" value={value.realEstateDown} suffix="%" onChange={(v) => update("realEstateDown", v)} />
          <Field id="sba-re-term" label="Term" value={value.realEstateTerm} suffix="yr" onChange={(v) => update("realEstateTerm", v)} />
          <Field id="sba-re-rate" label="Rate" value={value.realEstateRate} suffix="%" onChange={(v) => update("realEstateRate", v)} />
        </div>}
      </> : <>
        <div className="kyp-blocks two">
          {(["conventional", "fha_va"] as const).map((loanType) => <button type="button" key={loanType}
            aria-pressed={value.loanType === loanType} className={`kyp-block ${value.loanType === loanType ? "ind" : "wash"}`}
            onClick={() => onChange({ ...value, loanType })}>
            <span className="bl">{LOAN_PRESETS[loanType].label}</span><span className="bd">{LOAN_PRESETS[loanType].down}% down · 30-year term</span>
          </button>)}
        </div>
        <Field id="valuation-rate" label="Annual interest rate" value={value.interestRate} suffix="%" onChange={(v) => update("interestRate", v)} />
        <span className="kyp-lock">Preset · {preset.down}% down · {preset.term}-yr term</span>
      </>}
    </div>
     {incomeSummary != null && <div className="kyp-calccol"><div className="ch">Operating income</div><p className="kyp-calcsub">{incomeSummary}</p><p className="kyp-calchelp">Read from the Income → NOI statement below; this is not a second input.</p></div>}
  </div>
  </>;
}