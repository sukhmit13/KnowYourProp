// runStore.ts
// Replaces the per-run memory context.
// Stores evidence + computed values WITH lineage. Never stores conclusions or prose,
// so an error in one run cannot launder itself into a later run as "context".

import crypto from "crypto";
import type { Provenanced } from "./provenance";

export interface RunProvenance {
  runId: string;
  evidenceHash: string;
  projectType: string | null;
  createdAt: string;
  facts: Record<string, Provenanced<unknown>>;
}

/* ---------- keying ---------- */

export function hashEvidence(evidence: unknown): string {
  const canonical = JSON.stringify(evidence, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
  return crypto.createHash("sha256").update(canonical ?? "").digest("hex").slice(0, 16);
}

/** Project type is part of the key — this is what stops stale use-specific context. */
export function cacheKey(runId: string, evidenceHash: string, projectType: string | null) {
  return `prov:${runId}:${evidenceHash}:${projectType ?? "none"}`;
}

/* ---------- the no-prose guard ---------- */

const BANNED_KEY =
  /(narrative|prose|summary|takeaway|ourTake|card|headline|conclusion|recommendation|reportHtml|reportText|insight)/i;
const MAX_LEN = 300; // raw source strings only, never paragraphs

export function assertNoProse(facts: Record<string, Provenanced<unknown>>) {
  for (const [key, rec] of Object.entries(facts)) {
    if (BANNED_KEY.test(key)) {
      throw new Error(`[PROVENANCE] refusing to store conclusion-shaped key: ${key}`);
    }
    const raw = rec.kind === "quoted" ? rec.source?.raw : undefined;
    if (typeof raw === "string" && raw.length > MAX_LEN) {
      throw new Error(
        `[PROVENANCE] raw too long for ${key} (${raw.length}) — store the field, not the passage`,
      );
    }
    if (typeof rec.value === "string" && rec.value.length > MAX_LEN) {
      throw new Error(`[PROVENANCE] value too long for ${key} — looks like prose`);
    }
  }
}

/* ---------- storage (swap Map for Replit DB / Postgres) ---------- */

export interface Store {
  get(key: string): Promise<RunProvenance | null>;
  set(key: string, run: RunProvenance): Promise<void>;
}

export class MemoryStore implements Store {
  private m = new Map<string, RunProvenance>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async set(key: string, run: RunProvenance) {
    this.m.set(key, run);
  }
}

export async function saveRun(store: Store, run: RunProvenance): Promise<void> {
  assertNoProse(run.facts); // throws loudly if prose sneaks in
  await store.set(cacheKey(run.runId, run.evidenceHash, run.projectType), run);
}

export async function loadRun(
  store: Store,
  runId: string,
  evidence: unknown,
  projectType: string | null,
): Promise<RunProvenance | null> {
  const hash = hashEvidence(evidence);
  // Hash mismatch or project-type change = stale. Returns null; rebuild from source.
  return store.get(cacheKey(runId, hash, projectType));
}

export function newRun(
  runId: string,
  evidence: unknown,
  projectType: string | null,
  facts: Record<string, Provenanced<unknown>>,
): RunProvenance {
  return {
    runId,
    evidenceHash: hashEvidence(evidence),
    projectType,
    createdAt: new Date().toISOString(),
    facts,
  };
}

/*
MIGRATION (do NOT delete memory first):

1. Add this file. Leave the memory module untouched.
2. Behind USE_PROVENANCE=true, build `facts` during extraction and call saveRun().
   Whatever assertNoProse() throws on is exactly what your memory context was carrying.
3. Add PROMPT PATCH #7 (PROVENANCE CONTRACT).
4. Stop injecting memory into the payload when the flag is on.
5. Generate both properties flag-on and flag-off, and diff.
6. Once clean: remove the memory read, then the memory write, then the module.
*/
