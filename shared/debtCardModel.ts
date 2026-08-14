// Debt Snapshot — Stage 3 card view-model. PURE function of the resolved
// snapshot (`snap`) — the SAME object the takeaway is generated from, so the
// card and the headline can never contradict each other. No fetches, no
// re-derivation of debt state: only display formatting.

export interface DebtSnapLike {
  current_owner: string | null;
  ownership_acquired: string | null;
  acquired_via: string;
  active: any[];
  cleared_by_sale: any[];
  distress: any[];
  foreclosure_active: boolean;
  liens: any[];
  flags: string[];
  docs_total: number;
  report_estimated_value?: number | null;
  subject_is_commercial?: boolean | null;
  /** Stage 2.5 patch fields (older cached snaps may lack them) */
  anchor?: { date: string | null; source: string } | null;
  non_sale_transfers?: Array<{ doc_number: string; recording_date: string | null; deed_subtype?: string | null; grantor: string | null; grantee: string | null }> | null;
  combined_recorded_debt?: number | null;
}

export interface DebtTile {
  label: string;
  value: string;
  sub: string | null;
  /** visual: neutral | pos (indigo) | warn (marigold tile) | ok (green value) | bad (red) */
  variant: "neutral" | "pos" | "warn" | "ok" | "bad";
  subWas?: string | null; // marigold-highlighted fragment inside sub
}

export interface DebtCardModel {
  hasData: boolean;
  headerBadge: { text: string; tone: "caution" | "good" | "bad" | "neutral" } | null;
  tiles: DebtTile[];
  modification: { docNumber: string; year: string | null; amount: string | null; rate: string | null; maturity: string | null } | null;
  /** Cross-collateral hero strip — render only when blanket==true. Suppresses per-parcel LTV as a stated CONDITION, not a hidden number. */
  crossCollateral: {
    heading: string;
    body: string;
    pins: { label: string; self: boolean }[];
  } | null;
  /** Per-parcel (struck, artifact) vs pooled LTV — render with crossCollateral. */
  poolLtv: {
    perParcelPct: number | null;         // artifact — rendered struck-through
    pooledPct: number | null;            // from snap.pool_ltv (only when every pool pin is valued)
    pooledSub: string | null;            // "$2.95M loan ÷ $3.10M combined value · high for commercial …"
    note: string | null;                 // pool_ltv_note when pooled unavailable
    poolSize: number;
  } | null;
  /** Owner-entity mismatch note — render when a name-indexed lien carries a debtor_flag. */
  ownerNote: { owner: string; other: string } | null;
  /** Multi-lien summary line above the tiles — only when 2+ active liens. */
  stackSummary: { pill: string; text: string } | null;
  /** Secondary active liens (positions 2+), rendered as their own blocks. */
  stack: Array<{
    posLabel: string;                 // "2nd position"
    junior: boolean;                  // junior-lien tag + marigold pos badge
    lender: string;
    recLine: string;                  // "recorded 8/28/2025 · doc 2524011012"
    amount: string;                   // "$198,000"
    maturity: string;                 // "est. 7/1/2055" | "—"
    maturitySub: string;              // "current" | "at maturity now" | ...
    recorded: string;                 // "8/28/2025"
    recordedSub: string;              // "most recent" | "after 2013 sale"
    note: string | null;              // junior-lien explainer (adds, not replaces)
  }>;
  /** Unrecorded-refinance suspicion on an OLDER active lien — confirm payoff. */
  refiSuspect: string | null;
  /** Ownership-anchor explainer — read debt from the anchor sale forward. */
  anchorBlock: { title: string; body: string } | null;
  /** Resolved-distress reassurance strip (green) — dismissed lis pendens etc. */
  resolvedDistress: string | null;
  cleared: { title: string; sub: string; judicial: boolean; rows: { doc: string; who: string; amt: string; status: string }[] } | null;
  lifecycle: {
    recordedLabel: string; maturityLabel: string; pct: number;
    nowLabel: string; atOrPast: boolean; summary: string;
  } | null;
  caveat: string;
}

const fmtMoney = (n: number | null | undefined) =>
  n == null ? null : `$${Math.round(n).toLocaleString("en-US")}`;
const fmtK = (n: number) => (n % 1000 === 0 && n >= 1000 ? `$${n / 1000}K` : `$${n.toLocaleString("en-US")}`);

export function fmtDateUS(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[2]}/${+m[3]}/${m[1]}` : iso;
}
const fmtMonthYear = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2] - 1]} ${m[1]}`;
};
const ord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
/** 14-digit PIN → "13-31-419-021" (unit shown only when non-zero). */
export const fmtPin = (pin: string): string => {
  const d = pin.replace(/\D/g, "");
  if (d.length !== 14) return pin;
  const base = `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 7)}-${d.slice(7, 10)}`;
  return d.slice(10) === "0000" ? base : `${base}-${d.slice(10)}`;
};

export function buildDebtCardModel(snap: DebtSnapLike, todayISO?: string): DebtCardModel {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const primary = snap.active[0] ?? null;
  const judicial = /judicial|receiver|sheriff|foreclos|trustee/i.test(snap.acquired_via ?? "");
  const saleYear = snap.ownership_acquired?.slice(0, 4) ?? null;

  if (!primary) {
    return {
      hasData: snap.docs_total > 0,
      headerBadge: snap.foreclosure_active
        ? { text: "active foreclosure", tone: "bad" }
        : { text: "no active mortgage", tone: "good" },
      tiles: [],
      modification: null,
      crossCollateral: null,
      poolLtv: null,
      ownerNote: ownerNoteBlock(snap),
      stackSummary: null,
      stack: [],
      refiSuspect: null,
      anchorBlock: null,
      resolvedDistress: resolvedDistressLine(snap),
      cleared: clearedBlock(snap, judicial, saleYear),
      lifecycle: null,
      caveat: baseCaveat(snap, judicial, saleYear),
    };
  }

  const gap = !!primary.extraction_gap;
  const atOrPast = primary.maturity_status === "at_maturity" || primary.maturity_status === "past_maturity";
  const est = primary.maturity_source === "estimated";
  const sole = snap.active.length === 1;

  // ---- tiles (spec's card mapping table) ----
  const lender = primary.display_lender ?? primary.lender;
  const idxAmt = primary.index_consideration_amount;
  const amtMismatch = idxAmt != null && primary.effective_amount != null && idxAmt !== primary.effective_amount;
  const rateChanged = primary.original_interest_rate != null && primary.effective_interest_rate != null
    && primary.original_interest_rate !== primary.effective_interest_rate;
  const modYear = primary.modifications?.[0]?.doc_number?.length >= 4
    ? `20${primary.modifications[0].doc_number.slice(0, 2)}` : null;

  const tiles: DebtTile[] = [
    {
      label: "Lender",
      value: gap && !lender ? "— not extracted" : (lender ?? "—"),
      sub: gap && !lender ? "open document to confirm" : null,
      variant: gap && !lender ? "warn" : "neutral",
    },
    {
      label: "Loan Amount",
      value: fmtMoney(primary.effective_amount) ?? "—",
      sub: primary.blanket
        ? "blanket · recorded loan"
        : amtMismatch ? "recorded loan" : "recorded loan · not current balance",
      subWas: primary.blanket ? null : amtMismatch ? `not the ${fmtK(idxAmt!)} index figure` : null,
      variant: "neutral",
    },
    {
      label: "Lien Position",
      value: sole ? "1st · sole active" : `${ord(primary.position ?? 1)} of ${snap.active.length}`,
      sub: gap
        ? "low confidence — extraction gap in record"
        : `record order${saleYear && snap.cleared_by_sale.length ? `, after ${saleYear} sale` : ""}`,
      variant: gap ? "warn" : "pos",
    },
    primary.revolving ? {
      label: "Maturity",
      value: "revolving",
      sub: primary.maturity_note ?? "no fixed maturity, verify",
      variant: "neutral" as const,
    } : {
      label: "Maturity",
      value: (est ? "est. " : "") + (fmtDateUS(primary.effective_maturity_date) ?? "—"),
      sub: primary.maturity_status === "past_maturity" ? "past maturity"
        : primary.maturity_status === "at_maturity" ? "at maturity now"
        : primary.maturity_status === "estimated_balloon_may_have_passed" ? "estimated balloon may have passed — verify"
        : est ? `est. · ${primary.maturity_basis ?? "term estimate"}${primary.maturity_estimate_confidence === "low" ? " · " + (primary.maturity_note ?? "verify") : ""}`
        : primary.maturity_status === "current" ? "current" : "unknown",
      variant: atOrPast || primary.maturity_status === "estimated_balloon_may_have_passed" ? "warn" : "neutral",
    },
    {
      label: "Interest Rate",
      value: primary.effective_interest_rate != null ? `${primary.effective_interest_rate}%` : "—",
      sub: rateChanged ? (modYear ? `modified ${modYear}` : "modified") : null,
      subWas: rateChanged ? `was ${primary.original_interest_rate}%` : null,
      variant: "neutral",
    },
    {
      label: "Recorded",
      value: fmtDateUS(primary.recording_date) ?? "—",
      sub: `mortgage ${primary.doc_number}`,
      variant: "neutral",
    },
    {
      label: "Acquired",
      value: fmtDateUS(snap.ownership_acquired) ?? "—",
      sub: judicial ? "receiver's (judicial) sale" : snap.acquired_via || null,
      variant: "neutral",
    },
    {
      label: "Foreclosure",
      value: snap.foreclosure_active ? "Active filing" : "None active",
      sub: snap.foreclosure_active
        ? "on record — title clouded until resolved"
        : snap.distress.some((d) => d.state === "resolved")
          ? (saleYear ? `pre-${saleYear} filings resolved` : "prior filings resolved")
          : "none on record",
      variant: snap.foreclosure_active ? "bad" : "ok",
    },
  ];

  // ---- modification strip ----
  const mod = primary.modifications?.[0] ?? null;
  const modification = mod ? {
    docNumber: mod.doc_number,
    year: mod.doc_number?.length >= 4 ? `20${mod.doc_number.slice(0, 2)}` : null,
    amount: fmtMoney(mod.new_amount),
    rate: mod.new_interest_rate != null ? `${mod.new_interest_rate}%` : null,
    maturity: fmtDateUS(mod.new_maturity_date),
  } : null;

  // ---- lifecycle runway ----
  let lifecycle: DebtCardModel["lifecycle"] = null;
  if (primary.recording_date && primary.effective_maturity_date) {
    const start = Date.parse(primary.recording_date);
    const end = Date.parse(primary.effective_maturity_date);
    const now = Date.parse(today);
    const pct = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 100;
    const monthsLeft = Math.round((end - now) / (30.44 * 24 * 3600 * 1000));
    lifecycle = {
      recordedLabel: fmtMonthYear(primary.recording_date) ?? "",
      maturityLabel: `${mod ? "Modified maturity" : est ? "Est. maturity" : "Maturity"} ${fmtMonthYear(primary.effective_maturity_date) ?? ""}`,
      pct: Math.round(pct),
      nowLabel: primary.maturity_status === "past_maturity" ? "Now · past maturity"
        : primary.maturity_status === "at_maturity" ? "Now · at maturity" : "Now",
      atOrPast,
      summary: atOrPast
        ? `${mod ? `A ${modification?.year ?? ""} modification extended the loan to ${primary.effective_maturity_date.slice(0, 4)} — now reached. ` : ""}Refinancing risk elevated: due now. Confirm payoff or a further extension; no release is recorded.`
        : monthsLeft > 0
          ? `~${Math.max(1, Math.round(monthsLeft / 12))} year${monthsLeft >= 18 ? "s" : ""} of runway to the ${est ? "estimated " : ""}maturity.`
          : primary.maturity_status === "estimated_balloon_may_have_passed"
            ? "Estimated balloon may already have passed — the date is a term-based estimate, not a recorded maturity. Confirm the actual maturity with the record or lender."
            : "Confirm current status with the lender.",
    };
  }

  // ---- cross-collateral hero + LTV panel (blanket only) ----
  // blanket_pins are the SIBLINGS; the subject renders as "this parcel".
  let crossCollateral: DebtCardModel["crossCollateral"] = null;
  let poolLtv: DebtCardModel["poolLtv"] = null;
  if (primary.blanket) {
    const siblings: string[] = primary.blanket_pins ?? [];
    const poolSize = siblings.length + 1;
    crossCollateral = {
      heading: `Cross-collateralized — this loan spans ${poolSize} parcels`,
      body: "The mortgage is indexed under more than one PIN, so it's secured by a pool of properties, not this parcel alone. Per-parcel leverage isn't meaningful; the loan can only be judged against the combined collateral — and this parcel likely can't be released without satisfying the whole loan.",
      pins: [
        { label: "this parcel", self: true },
        ...siblings.map((p: string) => ({ label: fmtPin(p), self: false })),
      ],
    };
    const perParcelPct = primary.effective_amount && snap.report_estimated_value
      ? Math.round((primary.effective_amount / snap.report_estimated_value) * 100) : null;
    const pooledPct = primary.pool_ltv != null ? Math.round(primary.pool_ltv * 100) : null;
    const high = pooledPct != null && snap.subject_is_commercial && pooledPct > 75;
    poolLtv = {
      perParcelPct,
      pooledPct,
      pooledSub: pooledPct != null && primary.effective_amount && primary.pool_value
        ? `${fmtM(primary.effective_amount)} loan ÷ ${fmtM(primary.pool_value)} combined value${high ? " · high for commercial (norm ~65–75%) — verify" : ""}`
        : null,
      note: primary.pool_ltv_note ?? null,
      poolSize,
    };
  }

  // ---- Stage 2.5: multi-lien stack (positions 2+), refi suspicion, anchor ----
  const combined = snap.combined_recorded_debt ?? null;
  const anchorYear = snap.anchor?.date?.slice(0, 4) ?? saleYear;
  const secondaries = snap.active.slice(1);
  const stack: DebtCardModel["stack"] = secondaries.map((m: any, i: number) => {
    const isLast = i === secondaries.length - 1;
    const junior = m.lien_kind === "junior";
    const mEst = m.maturity_source === "estimated";
    const yearsAfter = m.recording_date && primary.recording_date
      ? Math.max(0, +m.recording_date.slice(0, 4) - +primary.recording_date.slice(0, 4)) : null;
    const sizePct = junior && m.effective_amount && primary.effective_amount
      ? Math.round((m.effective_amount / primary.effective_amount) * 100) : null;
    return {
      posLabel: `${ord(m.position ?? i + 2)} position`,
      junior,
      lender: m.display_lender ?? m.lender ?? "—",
      recLine: [`recorded ${fmtDateUS(m.recording_date) ?? "—"}`,
        m.execution_date ? `exec ${fmtDateUS(m.execution_date)}` : null,
        `doc ${m.doc_number}`].filter(Boolean).join(" · "),
      amount: fmtMoney(m.effective_amount) ?? "—",
      maturity: m.revolving ? "revolving"
        : m.effective_maturity_date ? (mEst ? "est. " : "") + (fmtDateUS(m.effective_maturity_date) ?? "—") : "—",
      maturitySub: m.revolving ? (m.maturity_note ?? "no fixed maturity, verify")
        : m.maturity_status === "past_maturity" ? "past maturity"
        : m.maturity_status === "at_maturity" ? "at maturity now"
        : m.maturity_status === "estimated_balloon_may_have_passed" ? "estimated balloon may have passed — verify"
        : mEst ? `est. · ${m.maturity_basis ?? "term estimate"}${m.maturity_estimate_confidence === "low" ? " · " + (m.maturity_note ?? "verify") : ""}`
        : m.maturity_status === "current" ? "current" : "unknown",
      recorded: fmtDateUS(m.recording_date) ?? "—",
      recordedSub: isLast ? "most recent" : (anchorYear ? `after ${anchorYear} sale` : "recording order"),
      note: junior
        ? `A junior lien, not a refinance. Recorded ${yearsAfter ? `${yearsAfter} year${yearsAfter === 1 ? "" : "s"} after the first` : "after the first"}${sizePct != null ? ` and about ${sizePct}% of its size` : ""}, with no release of the ${primary.recording_date?.slice(0, 4) ?? "earlier"} loan — so it adds to the debt (a second mortgage) rather than replacing it.${combined != null ? ` Combined recorded debt: ${fmtMoney(combined)}.` : ""}`
        : null,
    };
  });
  // ANY active lien flagged refi_suspect gets the warning — not just position 1.
  const refiOlder = snap.active.filter((m: any) => m.refi_suspect);
  const refiYears = refiOlder.map((m: any) => m.recording_date?.slice(0, 4)).filter(Boolean);
  const refiSuspect = refiOlder.length
    ? `May be a refinance — a later loan of similar-or-greater size is recorded with no release of the ${refiYears.length ? refiYears.join(" / ") + " " : ""}loan${refiOlder.length > 1 ? "s" : ""}. Confirm payoff; until then all count as recorded debt.`
    : null;
  const stackSummary: DebtCardModel["stackSummary"] = snap.active.length > 1 ? {
    pill: `${snap.active.length} active mortgages`,
    text: [
      anchorYear ? `Debt read from the ${anchorYear} sale forward` : null,
      combined != null ? `${fmtMoney(combined)} recorded across ${snap.active.length === 2 ? "both" : `all ${snap.active.length}`} liens${stack.some(s => s.junior) ? " (first + junior second)" : ""}` : null,
      "positions by recording order",
    ].filter(Boolean).join(" · "),
  } : null;

  // Ownership-anchor explainer — shown when the anchor actually did work
  // (cleared history) or a later non-sale transfer could mislead.
  const nst = snap.non_sale_transfers ?? [];
  let anchorBlock: DebtCardModel["anchorBlock"] = null;
  if (anchorYear && (nst.length > 0 || snap.cleared_by_sale.length > 0) && snap.anchor?.date) {
    const fromSales = snap.anchor.source === "sales-section";
    let body = fromSales
      ? `Ownership anchor is the most recent real sale from the Sales section — the ${anchorYear} acquisition. Liens recorded before it cleared at closing.`
      : `Ownership anchor is the ${anchorYear} acquisition. Liens recorded before it cleared at closing.`;
    for (const t of nst) {
      const y = t.recording_date?.slice(0, 4);
      const kind = /quit/i.test(t.deed_subtype ?? "") ? "quit-claim" : (t.deed_subtype || "deed transfer");
      body += ` The ${y ? `${y} ` : ""}${kind} is an ownership change, not a sale — the Sales section doesn't count it, so it resets nothing and clears nothing.`;
    }
    anchorBlock = { title: `Read from the ${anchorYear} sale forward`, body };
  }

  return {
    hasData: true,
    headerBadge: snap.foreclosure_active
      ? { text: "active foreclosure", tone: "bad" }
      : primary.blanket
        ? { text: `${snap.active.length} active · cross-collateralized`, tone: "caution" }
        : atOrPast
          ? { text: `${snap.active.length} active · ${primary.maturity_status === "past_maturity" ? "past" : "at"} maturity`, tone: "caution" }
          : snap.active.length > 1 && combined != null
            ? { text: `${snap.active.length} active · ~${fmtApprox(combined)}`, tone: "neutral" }
            : { text: `${snap.active.length} active · no distress`, tone: "good" },
    tiles,
    modification,
    crossCollateral,
    poolLtv,
    ownerNote: ownerNoteBlock(snap),
    stackSummary,
    stack,
    refiSuspect,
    anchorBlock,
    resolvedDistress: resolvedDistressLine(snap),
    cleared: clearedBlock(snap, judicial, saleYear),
    lifecycle,
    caveat: baseCaveat(snap, judicial, saleYear)
      + (mod ? ` Maturity reflects the ${modification?.year ?? "recorded"} modification.` : est ? " Maturity is estimated from loan type, not a recorded date." : "")
      + (primary.blanket
        ? ` This is a blanket loan${primary.pool_ltv != null ? " — the pooled LTV uses this report's value estimates for the pooled parcels" : ""}; confirm the full collateral list and any release terms at title.`
        : "")
      + (snap.active.length > 1 && combined != null
        ? ` The combined ${fmtMoney(combined)} is what was borrowed — paydown since isn't on record.${stack.some(s => s.junior) ? " The later, smaller loan adds to the first rather than replacing it." : ""}`
        : "")
      + (refiSuspect ? " A later similar-size loan with no release of the first may be a refinance — confirm payoff." : "")
      + (nst.length ? ` The ${nst[0].recording_date?.slice(0, 4) ?? "later"} ${/quit/i.test(nst[0].deed_subtype ?? "") ? "quit-claim" : "deed transfer"} is a title transfer, not a sale.` : ""),
  };
}

/** "~$910K" / "~$1.2M" badge form for combined recorded debt. */
const fmtApprox = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 10_000) * 10}K`;

function resolvedDistressLine(snap: DebtSnapLike): string | null {
  if (snap.foreclosure_active) return null;
  const resolved = (snap.distress ?? []).filter((d: any) => d.state === "resolved"
    && (d.doc_type === "lis_pendens" || d.doc_type === "foreclosure"));
  if (!resolved.length) return null;
  const newest = resolved[resolved.length - 1];
  const y = newest.recording_date?.slice(0, 4);
  const label = newest.doc_type === "lis_pendens" ? "lis pendens" : "foreclosure filing";
  return `${y ? `${y} ` : ""}${label} — resolved. No active foreclosure or litigation on title.`;
}

function ownerNoteBlock(snap: DebtSnapLike): DebtCardModel["ownerNote"] {
  if (!snap.current_owner) return null;
  const flagged = (snap.liens ?? []).find((L: any) => L.debtor_flag && L.debtor_name);
  return flagged ? { owner: snap.current_owner, other: flagged.debtor_name } : null;
}

function clearedBlock(snap: DebtSnapLike, judicial: boolean, saleYear: string | null) {
  if (!snap.cleared_by_sale.length) return null;
  return {
    title: judicial
      ? `Cleared by the ${saleYear ?? ""} receiver's sale`.replace("  ", " ")
      : `Cleared by the ${saleYear ?? ""} sale`.replace("  ", " "),
    sub: judicial
      ? "Recorded but never released. A judicial sale extinguishes the prior owner's liens by court order — shown for history, not counted against current title."
      : "Recorded but never released. A title insurer would have required payoff at closing — shown for history; confirm at title.",
    judicial,
    rows: snap.cleared_by_sale.map((m: any) => ({
      doc: `Mtg · ${m.recording_date?.slice(0, 4) ?? m.doc_number}`,
      who: [m.lender, m.borrower].filter(Boolean).join(" — ") || m.doc_number,
      amt: m.amount != null ? `$${Math.round(m.amount).toLocaleString("en-US")}` : "—",
      status: /extinguish/i.test(m.status ?? "") ? "Extinguished" : "Presumed paid",
    })),
  };
}

function baseCaveat(snap: DebtSnapLike, judicial: boolean, saleYear: string | null): string {
  let c = "Amounts are the recorded loan, not the current balance. Position is inferred from recording order of unreleased liens";
  c += saleYear && snap.cleared_by_sale.length ? ` after the ${saleYear} sale.` : ".";
  if (snap.cleared_by_sale.length) {
    c += judicial
      ? ' "Cleared by sale" reflects a judicial sale\u2019s extinguishment of prior-owner liens — no recorded release exists for them, so confirm at title.'
      : ' "Cleared by sale" loans have no recorded release — presumed paid at closing; confirm at title.';
  }
  return c;
}
