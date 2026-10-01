import { CORRIDOR_KEYWORDS } from "./newsMonitor";

export type PipelineStage = "permitted" | "proposed" | "zoning" | "coverage";

export interface DevelopmentCorridor {
  key: string;
  name: string;
  tier: number;
}

export interface DevelopmentPipelineMetrics {
  unitsUnderConstruction: number | null;
  observedUnitsUnderConstruction: number;
  activePermitCount: number;
  potentialUnits: number;
  potentialAmbiguous: boolean;
  potentialUnitsUnknownAddressCount: number;
  permitUnitsAmbiguous: boolean;
  permitUnitsUnknownAddressCount: number;
  permitUnitsSource: "description";
  invalidDatePermitCount: number;
  commercialProposals: number;
}

interface AddressedRecord {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lon?: number | null;
  units?: number | null;
  unitsAmbiguous?: boolean;
}

export interface PipelinePermit extends AddressedRecord {
  permitNumber?: string;
  issueDate?: string;
}

export interface PipelineDpdApplication extends AddressedRecord {
  id?: string;
  applicationType?: string;
  proposal?: string;
  useType?: string;
}

export interface PipelineZbaCase extends AddressedRecord {
  caseNumber?: string;
  subject?: string;
  applicant?: string;
}

export interface PipelineDevelopment extends AddressedRecord {
  id?: string;
  title?: string;
  stage?: number;
}

export type Annotated<T> = T & {
  corridor: DevelopmentCorridor | null;
  pipelineStage: PipelineStage;
};

export interface DevelopmentPipelineInput {
  permits: PipelinePermit[];
  dpdApplications: PipelineDpdApplication[];
  recentApprovals: PipelineZbaCase[];
  upcomingCases: PipelineZbaCase[];
  developments: PipelineDevelopment[];
  /** Older callers may provide permit-stage records outside the new-construction feed. */
  additionalPermitRecords?: Array<AddressedRecord & { stage?: number; issueDate?: string }>;
  /** Complete ward-scoped display evidence; excluded from nearby arithmetic. */
  zbaEvidenceRecentApprovals?: PipelineZbaCase[];
  zbaEvidenceUpcomingCases?: PipelineZbaCase[];
  now?: number;
}

export interface DevelopmentPipelineResult {
  metrics: DevelopmentPipelineMetrics;
  permits: Array<Annotated<PipelinePermit>>;
  dpdApplications: Array<Annotated<PipelineDpdApplication>>;
  recentApprovals: Array<Annotated<PipelineZbaCase>>;
  upcomingCases: Array<Annotated<PipelineZbaCase>>;
  developments: Array<Annotated<PipelineDevelopment>>;
}

const DIRECTION_ABBREVIATIONS: Record<string, string> = {
  n: "N", north: "N",
  s: "S", south: "S",
  e: "E", east: "E",
  w: "W", west: "W",
};
const ADDRESS_SUFFIXES = new Set([
  "AVENUE", "AVE", "AV", "STREET", "ST", "ROAD", "RD", "BOULEVARD", "BLVD",
  "DRIVE", "DR", "PLACE", "PL", "COURT", "CT", "LANE", "LN", "PARKWAY", "PKWY", "PKY",
]);

/** Normalize the direction prefix, but retain its identity in the address key. */
export function normalizeAddrForMatch(addr: string): string {
  const value = addr.toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const rangeMatch = value.match(/^(\d+)\s*[-–]\s*(\d+)\s+(.+)$/);
  const singleMatch = rangeMatch ? null : value.match(/^(\d+)\s+(.+)$/);
  if (!rangeMatch && !singleMatch) {
    return value.replace(/[^A-Z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
  }

  const houseNumber = rangeMatch ? `${rangeMatch[1]}-${rangeMatch[2]}` : singleMatch![1];
  const street = (rangeMatch ? rangeMatch[3] : singleMatch![2])
    .replace(/[^A-Z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = street.split(" ").filter(Boolean);
  const prefix = tokens[0] ? DIRECTION_ABBREVIATIONS[tokens[0].toLowerCase()] : undefined;
  if (prefix) {
    const remainingStreet = tokens.slice(1);
    const nameWords = [...remainingStreet];
    if (nameWords.length && ADDRESS_SUFFIXES.has(nameWords[nameWords.length - 1])) nameWords.pop();
    // Without a street-name word after it, "North" is the street name in
    // "100 North Ave", not a removable directional prefix.
    if (nameWords.length) tokens.splice(0, tokens.length, prefix, ...remainingStreet);
  }
  if (tokens.length && ADDRESS_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return `${houseNumber}${tokens.length ? ` ${tokens.join(" ")}` : ""}`;
}

interface AddressIdentity {
  street: string;
  start: number;
  end: number;
}

function addressIdentity(address: string | null | undefined): AddressIdentity | null {
  if (!address) return null;
  const match = normalizeAddrForMatch(address).match(/^(\d+)(?:-(\d+))?\s+(.+)$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : first;
  return { street: match[3], start: Math.min(first, second), end: Math.max(first, second) };
}

function identityKey(identity: AddressIdentity): string {
  return `${identity.street}|${identity.start}-${identity.end}`;
}

export function addressesMatchForPipeline(first: string | null | undefined, second: string | null | undefined): boolean {
  const a = addressIdentity(first);
  const b = addressIdentity(second);
  return !!a && !!b && a.street === b.street && a.start <= b.end && b.start <= a.end;
}

function createAddressResolver(addresses: Array<string | null | undefined>): (address: string | null | undefined) => string {
  const byStreet = new Map<string, AddressIdentity[]>();
  for (const address of addresses) {
    const identity = addressIdentity(address);
    if (!identity) continue;
    const list = byStreet.get(identity.street) || [];
    list.push(identity);
    byStreet.set(identity.street, list);
  }

  const componentsByStreet = new Map<string, Array<{ start: number; end: number; key: string }>>();
  byStreet.forEach((identities, street) => {
    const ordered = identities.sort((a, b) => a.start - b.start || a.end - b.end);
    let members: AddressIdentity[] = [];
    let componentEnd = -Infinity;
    const saveComponent = () => {
      if (!members.length) return;
      const start = Math.min(...members.map(member => member.start));
      const end = Math.max(...members.map(member => member.end));
      const key = `${street}|${start}-${end}`;
      const components = componentsByStreet.get(street) || [];
      components.push({ start, end, key });
      componentsByStreet.set(street, components);
    };
    for (const identity of ordered) {
      if (members.length && identity.start > componentEnd) {
        saveComponent();
        members = [];
        componentEnd = -Infinity;
      }
      members.push(identity);
      componentEnd = Math.max(componentEnd, identity.end);
    }
    saveComponent();
  });

  return address => {
    const identity = addressIdentity(address);
    if (!identity) return "";
    const component = (componentsByStreet.get(identity.street) || [])
      .find(candidate => identity.start <= candidate.end && candidate.start <= identity.end);
    return component?.key || identityKey(identity);
  };
}

function parseValidPermitIssueDate(issueDate: string | undefined, now: number): number | null {
  if (!issueDate) return null;
  const timestamp = Date.parse(issueDate);
  const datePrefix = issueDate.slice(0, 10);
  const parsedDay = new Date(`${datePrefix}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || Number.isNaN(parsedDay.getTime()) ||
    parsedDay.toISOString().slice(0, 10) !== datePrefix || timestamp > now) return null;
  return timestamp;
}

const STREET_SUFFIXES: Record<string, string> = {
  avenue: "ave", ave: "ave", av: "ave",
  street: "st", st: "st",
  road: "rd", rd: "rd",
  boulevard: "blvd", blvd: "blvd",
  drive: "dr", dr: "dr",
  place: "pl", pl: "pl",
  court: "ct", ct: "ct",
  lane: "ln", ln: "ln",
  parkway: "pkwy", pkwy: "pkwy", pky: "pkwy",
};
const DIRECTION_WORDS = new Set(["n", "north", "s", "south", "e", "east", "w", "west"]);

function streetKey(value: string): { words: string[]; suffix?: string } {
  const tokens = value.toLowerCase().replace(/[.,]/g, "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length && /^\d+(?:-\d+)?$/.test(tokens[0])) tokens.shift();
  if (tokens.length && DIRECTION_WORDS.has(tokens[0])) {
    const remaining = tokens.slice(1);
    const nameWords = [...remaining];
    if (nameWords.length && STREET_SUFFIXES[nameWords[nameWords.length - 1]]) nameWords.pop();
    // Treat a leading direction as an address prefix only when an actual
    // street-name token follows. This preserves North Avenue as a street name.
    if (nameWords.length) tokens.shift();
  }
  const last = tokens[tokens.length - 1];
  const suffix = last ? STREET_SUFFIXES[last] : undefined;
  if (suffix) tokens.pop();
  return { words: tokens, suffix };
}

function addressMatchesCorridorName(address: string, names: string[]): boolean {
  const recordStreet = streetKey(address);
  if (!recordStreet.words.length) return false;
  return names.some(name => {
    const corridorStreet = streetKey(name);
    if (!corridorStreet.words.length) return false;
    if (recordStreet.words.join(" ") !== corridorStreet.words.join(" ")) return false;
    return !corridorStreet.suffix || recordStreet.suffix === corridorStreet.suffix;
  });
}

function distanceToSegmentMeters(
  latitude: number,
  longitude: number,
  line: { lat1: number; lng1: number; lat2: number; lng2: number },
): number {
  const radians = Math.PI / 180;
  const cosine = Math.cos(latitude * radians);
  const x = (longitude - line.lng1) * radians * 6_371_000 * cosine;
  const y = (latitude - line.lat1) * radians * 6_371_000;
  const dx = (line.lng2 - line.lng1) * radians * 6_371_000 * cosine;
  const dy = (line.lat2 - line.lat1) * radians * 6_371_000;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared ? Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared)) : 0;
  return Math.hypot(x - projection * dx, y - projection * dy);
}

/** Corridor classification always requires both a matching street name and geography. */
export function getDevelopmentCorridor(
  address: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): DevelopmentCorridor | null {
  if (!address || latitude == null || longitude == null ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  for (const [key, info] of Object.entries(CORRIDOR_KEYWORDS)) {
    if (!addressMatchesCorridorName(address, info.names)) continue;
    const inBounds = latitude! >= info.lat_min && latitude! <= info.lat_max &&
      longitude! >= info.lng_min && longitude! <= info.lng_max;
    const onDiagonal = !!info.line && distanceToSegmentMeters(latitude!, longitude!, info.line) <= 120;
    if (info.line ? !onDiagonal : !inBounds) continue;
    return {
      key,
      name: info.names[0].replace(/\b\w/g, character => character.toUpperCase()),
      tier: info.tier,
    };
  }
  return null;
}

function recordCoordinates(record: AddressedRecord): [number | null | undefined, number | null | undefined] {
  return [
    record.latitude ?? record.lat,
    record.longitude ?? record.lon,
  ];
}

function annotate<T extends AddressedRecord>(
  records: T[],
  stageForAddress: Map<string, PipelineStage>,
  fallbackStage: PipelineStage,
  resolveAddress: (address: string | null | undefined) => string,
): Array<Annotated<T>> {
  return records.map(record => {
    const [latitude, longitude] = recordCoordinates(record);
    const key = resolveAddress(record.address);
    return {
      ...record,
      corridor: getDevelopmentCorridor(record.address, latitude, longitude),
      pipelineStage: (key && stageForAddress.get(key)) || fallbackStage,
    };
  });
}

function parseZbaUnits(subject = ""): { units?: number; ambiguous: boolean } {
  const values = new Set<number>();
  const expression = /\b(\d[\d,]*)[\s-]*(?:dwelling[\s-]+)?(?:residential\s+)?units?\b/gi;
  for (const match of Array.from(subject.matchAll(expression))) {
    const units = Number(match[1].replace(/,/g, ""));
    if (units >= 1 && units <= 2_000) values.add(units);
  }
  const found = Array.from(values);
  return { units: found.length ? Math.max(...found) : undefined, ambiguous: found.length > 1 };
}

function hasCommercialUse(record: PipelineDpdApplication | PipelineZbaCase): boolean {
  const text = [
    "applicationType" in record ? record.applicationType : "",
    "proposal" in record ? record.proposal : "",
    "subject" in record ? record.subject : "",
    "useType" in record ? record.useType : "",
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(commercial|business|retail|office|restaurant|tavern|bar|hotel|industrial|manufactur(?:ing|e)|mixed[- ]use)\b/.test(text);
}

/**
 * Build the address-level strongest-stage view and metrics. News is deliberately
 * annotation-only: article text never contributes units or proposal counts.
 */
export function buildDevelopmentPipeline(input: DevelopmentPipelineInput): DevelopmentPipelineResult {
  const now = input.now ?? Date.now();
  const cutoff = now - 18 * 30.4375 * 24 * 60 * 60 * 1000;
  const validPermits = input.permits.filter(permit => parseValidPermitIssueDate(permit.issueDate, now) !== null);
  const validAdditionalPermitRecords = (input.additionalPermitRecords || []).filter(record => {
    if (record.issueDate) {
      const issued = parseValidPermitIssueDate(record.issueDate, now);
      return issued !== null;
    }
    return record.stage === 1;
  });
  const permitRecords = [...validPermits, ...validAdditionalPermitRecords];
  const allAddressedRecords: AddressedRecord[] = [
    ...permitRecords,
    ...input.dpdApplications,
    ...input.recentApprovals,
    ...input.upcomingCases,
  ];
  const resolveAddress = createAddressResolver(allAddressedRecords.map(record => record.address));
  const stageForAddress = new Map<string, PipelineStage>();
  const addressPresence = new Map<string, { permit: boolean; dpd: boolean; zba: boolean }>();
  const note = (address: string | null | undefined, source: "permit" | "dpd" | "zba") => {
    if (!address) return;
    const key = resolveAddress(address);
    if (!key) return;
    const presence = addressPresence.get(key) || { permit: false, dpd: false, zba: false };
    presence[source] = true;
    addressPresence.set(key, presence);
    stageForAddress.set(key, presence.permit ? "permitted" : presence.dpd ? "proposed" : presence.zba ? "zoning" : "coverage");
  };

  for (const permit of permitRecords) note(permit.address, "permit");
  for (const application of input.dpdApplications) note(application.address, "dpd");
  for (const approval of [...input.recentApprovals, ...input.upcomingCases]) note(approval.address, "zba");

  const activePermitsByAddress = new Map<string, PipelinePermit[]>();
  const activePermitIds = new Set<string>();
  let invalidDatePermitCount = 0;
  for (const permit of input.permits) {
    const issued = parseValidPermitIssueDate(permit.issueDate, now);
    if (issued === null) {
      invalidDatePermitCount++;
      continue;
    }
    if (issued < cutoff) continue;
    const key = resolveAddress(permit.address);
    if (!key) continue;
    const addressPermits = activePermitsByAddress.get(key) || [];
    addressPermits.push(permit);
    activePermitsByAddress.set(key, addressPermits);
    activePermitIds.add(permit.permitNumber || `${key}|${permit.issueDate || ""}`);
  }
  let observedUnitsUnderConstruction = 0;
  let permitUnitsAmbiguous = false;
  let permitUnitsUnknownAddressCount = 0;
  activePermitsByAddress.forEach(permits => {
    const knownUnits = permits.map(permit => permit.units).filter((units): units is number => Number.isFinite(units) && units! >= 0);
    if (!knownUnits.length) permitUnitsUnknownAddressCount++;
    else observedUnitsUnderConstruction += Math.max(...knownUnits);
    if (permits.some(permit => permit.unitsAmbiguous)) permitUnitsAmbiguous = true;
  });
  const unitsUnderConstruction = permitUnitsUnknownAddressCount > 0
    ? null
    : observedUnitsUnderConstruction;

  const dpdByAddress = new Map<string, PipelineDpdApplication[]>();
  for (const application of input.dpdApplications) {
    const key = resolveAddress(application.address);
    if (!key) continue;
    const records = dpdByAddress.get(key) || [];
    records.push(application);
    dpdByAddress.set(key, records);
  }
  const zbaByAddress = new Map<string, PipelineZbaCase[]>();
  for (const approval of [...input.recentApprovals, ...input.upcomingCases]) {
    const key = resolveAddress(approval.address);
    if (!key) continue;
    const records = zbaByAddress.get(key) || [];
    records.push(approval);
    zbaByAddress.set(key, records);
  }

  let potentialUnits = 0;
  let potentialAmbiguous = false;
  let potentialUnitsUnknownAddressCount = 0;
  const commercialAddresses = new Set<string>();
  const candidateAddresses = new Set<string>();
  dpdByAddress.forEach((_records, key) => candidateAddresses.add(key));
  zbaByAddress.forEach((_records, key) => candidateAddresses.add(key));
  candidateAddresses.forEach(key => {
    const presence = addressPresence.get(key);
    if (presence?.permit) return;
    const records = dpdByAddress.get(key);
    if (records?.length) {
      const knownUnits = records.map(record => record.units).filter((units): units is number => Number.isFinite(units) && units! >= 0);
      if (!knownUnits.length) potentialUnitsUnknownAddressCount++;
      else potentialUnits += Math.max(...knownUnits);
      if (records.some(record => record.unitsAmbiguous)) potentialAmbiguous = true;
      if (records.some(hasCommercialUse)) commercialAddresses.add(key);
      return;
    }

    const approvals = zbaByAddress.get(key) || [];
    const parsedUnits = approvals.map(approval => parseZbaUnits(approval.subject));
    const knownUnits = parsedUnits.map(result => result.units).filter((units): units is number => units !== undefined);
    if (!knownUnits.length) potentialUnitsUnknownAddressCount++;
    else potentialUnits += Math.max(...knownUnits);
    if (parsedUnits.some(result => result.ambiguous)) potentialAmbiguous = true;
    if (approvals.some(hasCommercialUse)) commercialAddresses.add(key);
  });

  return {
    metrics: {
      unitsUnderConstruction,
      observedUnitsUnderConstruction,
      activePermitCount: activePermitIds.size,
      potentialUnits,
      potentialAmbiguous,
      potentialUnitsUnknownAddressCount,
      permitUnitsAmbiguous,
      permitUnitsUnknownAddressCount,
      permitUnitsSource: "description",
      invalidDatePermitCount,
      commercialProposals: commercialAddresses.size,
    },
    permits: annotate(input.permits, stageForAddress, "coverage", resolveAddress),
    dpdApplications: annotate(input.dpdApplications, stageForAddress, "proposed", resolveAddress),
    recentApprovals: annotate(input.zbaEvidenceRecentApprovals || input.recentApprovals, stageForAddress, "zoning", resolveAddress),
    upcomingCases: annotate(input.zbaEvidenceUpcomingCases || input.upcomingCases, stageForAddress, "zoning", resolveAddress),
    developments: annotate(input.developments, stageForAddress, "coverage", resolveAddress),
  };
}