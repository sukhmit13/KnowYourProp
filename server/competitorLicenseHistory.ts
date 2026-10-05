import type { CompetitorHistoryInput } from "../shared/competitorHistory";
import { classifyCompetitorHistory, normalizeHistoryAddress, unknownHistory, type HistoryLicense } from "./competitorHistoryClassification";

const ENDPOINT = "https://data.cityofchicago.org/resource/r5kz-chrr.json";
const TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; rows: HistoryLicense[] }>();
const pending = new Map<string, Promise<HistoryLicense[]>>();
const failures = new Map<string, { expires: number; message: string }>();
let active = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>(resolve => waiters.push(resolve));
  else active++;
  try { return await fn(); }
  finally {
    const next = waiters.shift();
    if (next) next(); else active--;
  }
}

export async function fetchCompetitorAddressHistory(address: string): Promise<HistoryLicense[]> {
  const parsed = normalizeHistoryAddress(address);
  if (!parsed.number || !parsed.streetWords.length) throw new Error("A complete street address is required.");
  const key = parsed.building;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.rows;
  const failed = failures.get(key);
  if (failed && failed.expires > Date.now()) throw new Error(failed.message);
  if (pending.has(key)) return pending.get(key)!;
  if (waiters.length > 80) throw new Error("License history lookup is busy. Try again shortly.");
  const job = withSlot(async () => {
    const rows: HistoryLicense[] = [];
    const safe = (value: string) => value.replace(/'/g, "''").replace(/[%_]/g, "");
    const where = `upper(city)='CHICAGO' AND upper(address) like '${safe(parsed.number)} %${safe(parsed.streetWords.join(" "))}%'`;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({
        "$where": where, "$limit": "500", "$offset": String(page * 500),
        "$order": "date_issued ASC, id ASC",
        "$select": "id,address,doing_business_as_name,legal_name,account_number,license_number,license_description,business_activity,license_start_date,date_issued,expiration_date,license_status",
      });
      const response = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`City license history is unavailable (HTTP ${response.status}).`);
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("City license history returned an invalid response.");
      }
      rows.push(...data);
      if (data.length < 500) {
        if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
        cache.set(key, { rows, expires: Date.now() + TTL });
        failures.delete(key);
        return rows;
      }
    }
    throw new Error("The location's history exceeds the lookup limit; no addition/replacement classification was made.");
  });
  pending.set(key, job);
  try { return await job; }
  catch (error) {
    if (failures.size >= 1000) failures.delete(failures.keys().next().value!);
    failures.set(key, { expires: Date.now() + 60000, message: error instanceof Error ? error.message : "License history unavailable." });
    throw error;
  }
  finally { pending.delete(key); }
}

export async function getCompetitorLicenseHistory(input: CompetitorHistoryInput) {
  const city = input.address.split(",")[1]?.trim();
  if (city && !/^chicago(?:\s+il)?$/i.test(city)) return unknownHistory("City of Chicago license history does not cover this address.");
  try {
    const rows = await fetchCompetitorAddressHistory(input.address);
    return classifyCompetitorHistory(input, rows);
  } catch (error) {
    return unknownHistory(error instanceof Error ? error.message : "City license history could not be retrieved.");
  }
}
