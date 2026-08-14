// Assemblage detection — PURE, deterministic. No fetches, no LLM.
//
// Trigger discipline (safety-critical):
//   • Anchor on SHARED ACQUISITION, never a bare owner-name match.
//   • Both tests must pass: (1) shared acquisition — same deed doc number
//     appears in both parcels' sale histories (or the co-parcel linkage was
//     itself established via a shared deed), AND (2) adjacency — sequential
//     PIN or adjacent street address on the same block.
//   • Common control across an entity line (personal ↔ LLC/trust) is
//     INFERRED, never asserted: "likely — confirm". Only an identical named
//     owner on both parcels yields "exact".
//
// The takeaway is TEMPLATED here (not LLM-generated) so the confidence
// language can never be over-asserted by a model.

export type EntityType = 'personal' | 'llc' | 'trust';

export interface AssemblageSale {
  saleDate: string;
  salePrice: number;
  sellerName: string;
  buyerName: string;
  deedType: string;
  docNo: string;
  year: string;
}

export interface AssemblageParcelInput {
  pin: string;                // any format; normalized internally
  address: string;            // short street address, e.g. "522 N Claremont Ave"
  owner: string | null;
  saleHistory: AssemblageSale[];
  debtSummary?: string | null; // e.g. "UWM $712,500 + 2nd" | null
}

export interface AssemblageInput {
  subject: AssemblageParcelInput;
  coParcel: AssemblageParcelInput;
  /** matchReason from the related-parcels linkage, e.g. "Same deed (Doc #...)" */
  matchReason?: string | null;
  zoning?: string | null;
  combinedFrontageFt?: number | null;
  /**
   * Debt scope of the SUBJECT parcel, from its resolved Debt Snapshot:
   *  - 'single_pin' — snapshot resolved, no blanket/cross-collateral loan
   *  - 'blanket'    — snapshot resolved, a recorded loan spans multiple PINs
   *  - 'unknown'    — no resolved snapshot; make no cross-collateralization claim
   */
  subjectDebtScope?: 'single_pin' | 'blanket' | 'unknown';
}

export interface AssemblageMember {
  pin: string;                 // dashed display format
  address: string;
  role: 'subject' | 'companion';
  owner: string | null;
  owner_entity_type: EntityType;
  current_debt_summary: string | null;
}

export interface Assemblage {
  is_assemblage: true;
  members: AssemblageMember[];
  combined_frontage_ft: number | null;
  zoning: string | null;
  acquired_together: { year: number | null; price: number | null; doc_number: string };
  separated: boolean;
  separated_year: number | null;
  common_control: 'likely' | 'exact' | 'unclear';
  confidence_note: string;
  debt_scope: 'single_pin' | 'blanket' | 'unknown';
}

// ---------- helpers ----------

export function normalizePin(pin: string): string {
  return (pin || '').replace(/\D/g, '');
}

export function formatPin(pin: string): string {
  const p = normalizePin(pin);
  return p.length === 14 ? p.replace(/(\d{2})(\d{2})(\d{3})(\d{3})(\d{4})/, '$1-$2-$3-$4-$5') : pin;
}

export function classifyEntity(owner: string | null | undefined): EntityType {
  const o = (owner || '').toUpperCase();
  if (/\bL\.?\s?L\.?\s?C\b|\bLLC\b|\bSERIES\b|\bL\.?L\.?C\.?\b/.test(o)) return 'llc';
  if (/\bTRUST(EE)?\b|\bTR\b\.?$/.test(o)) return 'trust';
  return 'personal';
}

function normOwner(name: string | null | undefined): string {
  return (name || '')
    .toUpperCase()
    .replace(/[.,'"]/g, '')
    .replace(/\b(THE|AN?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Adjacency test 1: contiguous PIN — same area/subarea/block, parcel number ±1. */
export function pinsAreSequential(pinA: string, pinB: string): boolean {
  const a = normalizePin(pinA), b = normalizePin(pinB);
  if (a.length !== 14 || b.length !== 14) return false;
  if (a.slice(0, 7) !== b.slice(0, 7)) return false; // area(2)+subarea(2)+block(3)
  const pa = parseInt(a.slice(7, 10), 10), pb = parseInt(b.slice(7, 10), 10);
  if (isNaN(pa) || isNaN(pb)) return false;
  return Math.abs(pa - pb) === 1;
}

/** Adjacency test 2: adjacent street address on the same block (same street, small number gap). */
export function addressesAreAdjacent(addrA: string, addrB: string): boolean {
  const parse = (addr: string) => {
    const m = (addr || '').toUpperCase().replace(/[.,]/g, '').match(/^(\d+)\s+([NSEW])\s+(\S+)/);
    return m ? { num: parseInt(m[1], 10), dir: m[2], street: m[3] } : null;
  };
  const a = parse(addrA), b = parse(addrB);
  if (!a || !b) return false;
  if (a.dir !== b.dir || a.street !== b.street) return false;
  const diff = Math.abs(a.num - b.num);
  // Chicago lots step street numbers by 2–8 per lot; same block ≈ within 10.
  return diff > 0 && diff <= 10;
}

const saleYear = (s: AssemblageSale): number | null => {
  if (s.saleDate) {
    const y = new Date(s.saleDate).getFullYear();
    if (!isNaN(y)) return y;
  }
  const y = parseInt(s.year, 10);
  return isNaN(y) ? null : y;
};

// ---------- detection ----------

export function detectAssemblage(input: AssemblageInput): Assemblage | null {
  const { subject, coParcel, matchReason } = input;
  if (!subject?.pin || !coParcel?.pin) return null;

  // ---- Test 1: SHARED ACQUISITION (gate — owner-name match alone NEVER triggers) ----
  const subjDocs = new Map<string, AssemblageSale>();
  for (const s of subject.saleHistory || []) {
    if (s.docNo) subjDocs.set(s.docNo.trim(), s);
  }
  let sharedSale: AssemblageSale | null = null;
  let sharedDoc: string | null = null;
  for (const s of coParcel.saleHistory || []) {
    const d = (s.docNo || '').trim();
    if (d && subjDocs.has(d)) {
      const cand = subjDocs.get(d)!;
      // keep the EARLIEST shared conveyance as the acquisition anchor
      if (!sharedSale || (saleYear(cand) ?? 9999) < (saleYear(sharedSale) ?? 9999)) {
        sharedSale = cand;
        sharedDoc = d;
      }
    }
  }
  // Fallback: matchReason names a specific shared doc number — accept ONLY if that
  // doc actually appears in one of the sale histories (never trust the bare string).
  if (!sharedDoc && matchReason?.startsWith('Same deed')) {
    const dm = matchReason.match(/Doc\s*#\s*([A-Z0-9-]+)/i);
    const claimed = dm?.[1]?.trim();
    if (claimed) {
      const inCo = (coParcel.saleHistory || []).find(s => (s.docNo || '').trim() === claimed);
      const inSubj = subjDocs.get(claimed);
      if (inCo || inSubj) {
        sharedDoc = claimed;
        sharedSale = inSubj ?? inCo ?? null;
      }
    }
  }
  if (!sharedDoc) return null; // no VERIFIED shared acquisition → NOT an assemblage

  // ---- Test 2: ADJACENCY ----
  const adjacent =
    pinsAreSequential(subject.pin, coParcel.pin) ||
    addressesAreAdjacent(subject.address, coParcel.address);
  if (!adjacent) return null;

  const acquiredYear = sharedSale ? saleYear(sharedSale) : null;

  // ---- Enrichment: separation event (each PIN later conveyed to different grantees) ----
  let separated = false;
  let separatedYear: number | null = null;
  if (acquiredYear != null) {
    const laterConveyances = (hist: AssemblageSale[]) =>
      (hist || []).filter(s => (saleYear(s) ?? 0) > acquiredYear && s.docNo !== sharedDoc);
    const subjLater = laterConveyances(subject.saleHistory);
    const coLater = laterConveyances(coParcel.saleHistory);
    for (const a of subjLater) {
      for (const b of coLater) {
        const ya = saleYear(a), yb = saleYear(b);
        if (ya == null || yb == null) continue;
        if (Math.abs(ya - yb) <= 1 && normOwner(a.buyerName) !== normOwner(b.buyerName)) {
          separated = true;
          separatedYear = Math.min(ya, yb);
          break;
        }
      }
      if (separated) break;
    }
  }

  // ---- Common control (confidence discipline) ----
  const so = normOwner(subject.owner), co = normOwner(coParcel.owner);
  let commonControl: Assemblage['common_control'];
  if (so && co && so === co) {
    commonControl = 'exact'; // identical named owner on both — only case that drops the hedge
  } else if (so && co) {
    commonControl = 'likely'; // anchored on shared acquisition; entity line can't be proven
  } else {
    commonControl = 'unclear';
  }
  const entityLine =
    classifyEntity(subject.owner) !== classifyEntity(coParcel.owner) ||
    classifyEntity(subject.owner) !== 'personal' ||
    classifyEntity(coParcel.owner) !== 'personal';
  // Across an entity line, NEVER exact — recorder data can't prove LLC/trust membership.
  if (commonControl === 'exact' && entityLine && classifyEntity(subject.owner) !== classifyEntity(coParcel.owner)) {
    commonControl = 'likely';
  }

  const confidenceNote =
    commonControl === 'exact'
      ? 'Identical named owner on both parcels.'
      : commonControl === 'likely'
        ? (entityLine
            ? 'LLC/trust membership is not in the public record — confirm identity.'
            : 'Common ownership is inferred from the shared acquisition — confirm identity.')
        : 'Current ownership of one parcel could not be resolved — confirm.';

  const member = (p: AssemblageParcelInput, role: 'subject' | 'companion'): AssemblageMember => ({
    pin: formatPin(p.pin),
    address: p.address,
    role,
    owner: p.owner || null,
    owner_entity_type: classifyEntity(p.owner),
    current_debt_summary: p.debtSummary ?? null,
  });

  return {
    is_assemblage: true,
    members: [member(subject, 'subject'), member(coParcel, 'companion')],
    combined_frontage_ft: input.combinedFrontageFt ?? null,
    zoning: input.zoning ?? null,
    acquired_together: {
      year: acquiredYear,
      price: sharedSale && sharedSale.salePrice > 0 ? sharedSale.salePrice : null,
      doc_number: sharedDoc,
    },
    separated,
    separated_year: separatedYear,
    common_control: commonControl,
    confidence_note: confidenceNote,
    debt_scope: input.subjectDebtScope ?? 'unknown',
  };
}

// ---------- deterministic takeaway (templated — never LLM) ----------

export interface AssemblageTakeaway {
  headline: string;
  rows: Array<{ tone: 'good' | 'caution' | 'neutral'; html: string; chip?: string }>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtPrice = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${n.toLocaleString('en-US')}`;

export function buildAssemblageTakeaway(a: Assemblage): AssemblageTakeaway {
  const subject = a.members.find(m => m.role === 'subject')!;
  const companion = a.members.find(m => m.role === 'companion')!;
  const compShort = esc(companion.address.split(',')[0]);
  const yr = a.acquired_together.year;
  const frontage = a.combined_frontage_ft ? `~${a.combined_frontage_ft}-ft` : 'multi-lot';
  const hedge =
    a.common_control === 'exact' ? 'under the same owner'
    : a.common_control === 'likely' ? 'likely still one owner'
    : 'current common control unclear — confirm';

  const headline = a.separated
    ? `One half of a ${frontage} assemblage — acquired with its neighbor${yr ? ` in ${yr}` : ''}, split in ${a.separated_year}, but ${hedge}.`
    : `One half of a ${frontage} assemblage — acquired with ${compShort}${yr ? ` in ${yr}` : ''}, ${hedge}.`;

  const rows: AssemblageTakeaway['rows'] = [];

  rows.push({
    tone: 'good',
    html: `<b>Two adjacent lots, bought together.</b> ${esc(subject.address.split(',')[0])} and ${compShort} were conveyed in the <b>same${yr ? ` ${yr}` : ''} transaction</b>${a.acquired_together.price ? ` (${fmtPrice(a.acquired_together.price)} for both)` : ''}${a.combined_frontage_ft ? ` — ~${a.combined_frontage_ft} ft of combined frontage` : ''}.`,
  });

  if (a.separated) {
    const subjEnt = subject.owner_entity_type === 'personal' ? 'personally' : `to a ${subject.owner_entity_type === 'llc' ? 'LLC' : 'trust'}`;
    const compEnt = companion.owner_entity_type === 'personal' ? 'personally' : `to ${companion.owner_entity_type === 'llc' ? 'an LLC' : 'a trust'}`;
    if (a.common_control === 'exact') {
      rows.push({
        tone: 'neutral',
        html: `<b>Separated in ${a.separated_year}</b> into two PINs — both still held by <b>${esc(subject.owner || '')}</b>.`,
      });
    } else if (a.common_control === 'unclear') {
      rows.push({
        tone: 'caution',
        html: `<b>Separated in ${a.separated_year}; current common control is unclear.</b> ${esc(a.confidence_note)}`,
        chip: 'Confirm',
      });
    } else {
      rows.push({
        tone: 'caution',
        html: `<b>Separated in ${a.separated_year}, likely same owner.</b> Contemporaneous conveyances split them — this parcel${subject.owner ? ` to <b>${esc(subject.owner)}</b>` : ''} ${subjEnt}, the neighbor ${compEnt}. Recorder data can't prove control across the entity line, so treat common ownership as strongly indicated, not certain.`,
        chip: 'Confirm',
      });
    }
  } else if (a.common_control === 'likely') {
    rows.push({
      tone: 'caution',
      html: `<b>Common control is inferred, not proven.</b> ${esc(a.confidence_note)}`,
      chip: 'Confirm',
    });
  } else if (a.common_control === 'unclear') {
    rows.push({
      tone: 'caution',
      html: `<b>Current common control is unclear.</b> ${esc(a.confidence_note)}`,
      chip: 'Confirm',
    });
  }

  // Debt row — claim only what the subject's resolved Debt Snapshot supports.
  if (a.debt_scope === 'blanket') {
    rows.push({
      tone: 'caution',
      html: `A recorded loan on this parcel <b>spans multiple PINs</b> — see the cross-collateral note in the Debt Snapshot. The companion's own financing is not aggregated here.`,
    });
  } else if (a.debt_scope === 'single_pin') {
    rows.push({
      tone: 'neutral',
      html: `This parcel's recorded debt is <b>single-PIN</b> — no cross-collateralized loan appears on its record. The companion's financing is tracked under its own PIN and is not aggregated here.`,
    });
  } else {
    rows.push({
      tone: 'neutral',
      html: `Debt in this report is shown <b>for this PIN only</b>; the companion parcel's financing is not evaluated or aggregated here.`,
    });
  }

  return { headline, rows };
}
