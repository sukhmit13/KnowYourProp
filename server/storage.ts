import { manualPropertyColumns } from "./manualPropertyPatch";

import { db } from "./db";
import {
  runs, scenarios, geocodeCache, compareHistory, propertyTaxCache, lienCache,
  chatMessages, pinLookupCache,
  type Run, type Scenario, type GeocodeCache, type CompareHistory, type ChatMessage,
  type CreateRunRequest, type CreateScenarioRequest,
  type RunWithScenarios
} from "@shared/schema";
import { eq, desc, inArray, and, sql } from "drizzle-orm";

export interface ManualPropertyData {
  manualBuildingSqFt: number | null;
  manualLandSqFt: number | null;
  manualStories: number | null;
  sourceListingUrl: string | null;
  askingPrice: number | null;
}

export interface FunnelAnswersData {
  role: string | null;
  transactionType: string | null;
  projectType: string | null;
  freeformDescription: string | null;
  referralNeeds: string[] | null;
}

export interface ReportContextData {
  projectType: string | null;
  funnelAnswers: FunnelAnswersData;
  manualProperty: ManualPropertyData;
  valuation: {
    purchasePrice: number | null;
    noiOption: string | null;
    manualNoi: number | null;
    loanType: string | null;
    interestRate: number | null;
    annualTaxes: number | null;
    annualInsurance: number | null;
    // Full-fidelity inputs (rental & SBA paths) — optional for backward compat
    grossIncome?: number | null;
    rentalNoiOption?: string | null;
    sbaBusinessPrice?: number | null;
    sbaRealEstatePrice?: number | null;
    sbaBusinessDownPercent?: number | null;
    sbaBusinessTermYears?: number | null;
    sbaBusinessInterestRate?: number | null;
    sbaRealEstateDownPercent?: number | null;
    sbaRealEstateTermYears?: number | null;
    sbaRealEstateInterestRate?: number | null;
    // Snapshot of the metrics exactly as rendered in the calculator at save time
    computed?: {
      purchasePrice: number | null;
      selectedNoi: number | null;
      noiSource: string | null;
      downPayment: number | null;
      loanAmount: number | null;
      annualDebtService: number | null;
      annualCashFlow: number | null;
      dscr: number | null;
      capRate: number | null;
      roi: number | null;
    } | null;
  };
  submittedAt: string;
  locked: boolean;
}

export interface IStorage {
  // Runs
  getRuns(userId: string): Promise<Run[]>;
  getRun(id: number): Promise<RunWithScenarios | undefined>;
  getRunsByIds(ids: number[]): Promise<Run[]>;
  createRun(run: CreateRunRequest & { userId?: string }): Promise<Run>;
  createRunWithAutoLabel(run: CreateRunRequest & { userId?: string }): Promise<Run>;
  deleteRun(id: number): Promise<void>;
  deleteAllRuns(userId: string): Promise<void>;
  toggleFavoriteRun(id: number): Promise<Run | undefined>;
  updateRunProjectType(id: number, projectType: string | null): Promise<Run | undefined>;
  updateRunLabel(id: number, label: string | null): Promise<Run | undefined>;
  findRecentListingSnapshotForAddress(userId: string, address: string, excludeRunId: number, maxAgeMs: number): Promise<any | null>;
  updateRunFunnelAnswers(id: number, data: FunnelAnswersData): Promise<Run | undefined>;
  updateRunManualProperty(id: number, data: Partial<ManualPropertyData>): Promise<Run | undefined>;
  updateRunReportContext(id: number, data: ReportContextData): Promise<Run | undefined>;
  markRunAsPurchased(id: number): Promise<Run | undefined>;
  decrementTrialReport(userId: number): Promise<void>;

  // Scenarios
  createScenario(scenario: CreateScenarioRequest): Promise<Scenario>;
  deleteScenario(id: number): Promise<void>;

  // Geocode Cache
  getGeocode(address: string): Promise<GeocodeCache | undefined>;
  getGeocodeAnyAge(address: string): Promise<GeocodeCache | undefined>;
  cacheGeocode(data: Omit<GeocodeCache, "id" | "cachedAt">): Promise<GeocodeCache>;

  // Compare History
  getCompareHistory(userId: string): Promise<CompareHistory[]>;
  saveCompareHistory(runIds: number[], addresses: string[], projectTypes?: (string | null)[], userId?: string): Promise<CompareHistory>;
  deleteCompareHistory(id: number): Promise<void>;
  clearCompareHistory(userId: string): Promise<void>;

  // Tax Cache
  clearTaxCache(): Promise<number>;

  // Lien Cache
  clearLienCache(): Promise<number>;

  // Chat Messages
  getChatMessages(runId: number, userId: string): Promise<ChatMessage[]>;
  saveChatMessage(runId: number, userId: string, role: 'user' | 'assistant', content: string): Promise<ChatMessage>;

  // PIN lookup
  getPinForAddress(normalizedAddress: string): Promise<string | null>;

  // Insight Report
  saveCrimeTakeaway(id: number, content: object): Promise<void>;
  saveTransitTakeaway(id: number, content: object): Promise<void>;
  saveSchoolsTakeaway(id: number, content: object): Promise<void>;
  saveHmdaTakeaway(id: number, content: object): Promise<void>;
  saveNewsTakeaway(id: number, content: object): Promise<void>;
  saveNeighborhoodNewsTakeaway(id: number, content: object): Promise<void>;
  savePeopleTakeaway(id: number, content: object): Promise<void>;
  saveInsightReport(id: number, content: object): Promise<Run | undefined>;
  getInsightReport(id: number): Promise<{ content: object; generatedAt: Date } | null>;
}

export class DatabaseStorage implements IStorage {
  async getRuns(userId: string): Promise<Run[]> {
    // Case-insensitive: runs.user_id stores emails whose casing can differ
    // from the logged-in account's email (legacy duplicate accounts).
    return await db.select().from(runs).where(sql`LOWER(${runs.userId}) = ${userId.toLowerCase()}`).orderBy(desc(runs.createdAt));
  }

  async getRun(id: number): Promise<RunWithScenarios | undefined> {
    const run = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (run.length === 0) return undefined;

    const runScenarios = await db.select().from(scenarios).where(eq(scenarios.runId, id)).orderBy(desc(scenarios.createdAt));

    return { ...run[0], scenarios: runScenarios };
  }

  async createRun(runData: CreateRunRequest & { userId?: string }): Promise<Run> {
    const [newRun] = await db.insert(runs).values(runData).returning();
    return newRun;
  }

  // Creates a run and, if the same user already has runs for this address, auto-assigns
  // a "Scenario N" label. Count + insert happen inside one transaction holding a
  // per-user+address advisory lock, so concurrent creates can't produce duplicate numbers.
  async createRunWithAutoLabel(runData: CreateRunRequest & { userId?: string }): Promise<Run> {
    if (runData.label || !runData.address || !runData.userId) {
      return this.createRun(runData);
    }
    const userLower = runData.userId.toLowerCase();
    const addrLower = runData.address.toLowerCase();
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userLower + '|' + addrLower}))`);
      const rows = await tx.select({ id: runs.id })
        .from(runs)
        .where(sql`LOWER(${runs.userId}) = ${userLower} AND LOWER(${runs.address}) = ${addrLower}`);
      const values = rows.length > 0 ? { ...runData, label: `Scenario ${rows.length + 1}` } : runData;
      const [newRun] = await tx.insert(runs).values(values).returning();
      return newRun;
    });
  }

  async deleteRun(id: number): Promise<void> {
    await db.delete(scenarios).where(eq(scenarios.runId, id)); // Delete scenarios first
    await db.delete(runs).where(eq(runs.id, id));
  }

  async deleteAllRuns(userId: string): Promise<void> {
    // Delete scenarios for this user's runs first, then delete the runs
    const userRuns = await db.select({ id: runs.id }).from(runs).where(sql`LOWER(${runs.userId}) = ${userId.toLowerCase()}`);
    if (userRuns.length > 0) {
      const runIds = userRuns.map(r => r.id);
      await db.delete(scenarios).where(inArray(scenarios.runId, runIds));
    }
    await db.delete(runs).where(sql`LOWER(${runs.userId}) = ${userId.toLowerCase()}`);
  }

  async toggleFavoriteRun(id: number): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run) return undefined;
    
    const [updated] = await db.update(runs)
      .set({ isFavorite: !run.isFavorite })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async updateRunLabel(id: number, label: string | null): Promise<Run | undefined> {
    const [updated] = await db.update(runs)
      .set({ label })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async findRecentListingSnapshotForAddress(userId: string, address: string, excludeRunId: number, maxAgeMs: number): Promise<any | null> {
    const rows = await db.select({ id: runs.id, listingSnapshot: runs.listingSnapshot })
      .from(runs)
      .where(sql`LOWER(${runs.userId}) = ${userId.toLowerCase()} AND LOWER(${runs.address}) = ${address.toLowerCase()} AND ${runs.id} <> ${excludeRunId} AND ${runs.listingSnapshot} IS NOT NULL`)
      .orderBy(desc(runs.createdAt));
    const now = Date.now();
    for (const row of rows) {
      const snap = row.listingSnapshot as any;
      const checkedAt = snap?.checkedAt ? new Date(snap.checkedAt).getTime() : NaN;
      if (!isNaN(checkedAt) && now - checkedAt < maxAgeMs) return snap;
    }
    return null;
  }

  async updateRunProjectType(id: number, projectType: string | null): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run) return undefined;
    
    const [updated] = await db.update(runs)
      .set({ lastProjectType: projectType, lastFreeformDescription: null })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async updateRunFunnelAnswers(id: number, data: FunnelAnswersData): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run) return undefined;

    const [updated] = await db.update(runs)
      .set({
        lastProjectType: data.projectType,
        lastRole: data.role,
        lastTransactionType: data.transactionType,
        lastFreeformDescription: data.freeformDescription,
        lastReferralNeeds: data.referralNeeds,
      })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async updateRunManualProperty(id: number, data: Partial<ManualPropertyData>): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run) return undefined;
    const columns = manualPropertyColumns(data);
    if (Object.keys(columns).length === 0) return run;
    
    const [updated] = await db.update(runs)
      .set(columns)
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async updateRunReportContext(id: number, data: ReportContextData): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run) return undefined;

    const [updated] = await db.update(runs)
      .set({ reportContext: data as any })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async markRunAsPurchased(id: number): Promise<Run | undefined> {
    const [updated] = await db.update(runs)
      .set({ purchasedAt: new Date() })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async decrementTrialReport(userId: number): Promise<void> {
    await db.execute(
      sql`UPDATE users SET trial_reports_remaining = trial_reports_remaining - 1 WHERE id = ${userId} AND trial_reports_remaining > 0`
    );
  }

  async createScenario(scenarioData: CreateScenarioRequest): Promise<Scenario> {
    const [newScenario] = await db.insert(scenarios).values(scenarioData).returning();
    return newScenario;
  }

  async deleteScenario(id: number): Promise<void> {
    await db.delete(scenarios).where(eq(scenarios.id, id));
  }

  async getGeocode(address: string): Promise<GeocodeCache | undefined> {
    // Check if cache entry exists and is less than 7 days old
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [entry] = await db.select()
      .from(geocodeCache)
      .where(eq(geocodeCache.address, address))
      .limit(1);

    if (entry && entry.cachedAt && entry.cachedAt > sevenDaysAgo) {
      return entry;
    }
    return undefined;
  }

  // Returns the cached geocode row regardless of age. Used by the report
  // evidence builder, where a stale row (zoning, coordinates, community area)
  // is still valid — treating staleness as absence caused reports to mark
  // zoning/transit/demographics as extraction failures.
  async getGeocodeAnyAge(address: string): Promise<GeocodeCache | undefined> {
    const [entry] = await db.select()
      .from(geocodeCache)
      .where(eq(geocodeCache.address, address))
      .limit(1);
    return entry;
  }

  async cacheGeocode(data: Omit<GeocodeCache, "id" | "cachedAt">): Promise<GeocodeCache> {
    // Upsert cache
    const existing = await db.select().from(geocodeCache).where(eq(geocodeCache.address, data.address)).limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(geocodeCache)
        .set({ ...data, cachedAt: new Date() })
        .where(eq(geocodeCache.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(geocodeCache).values(data).returning();
      return inserted;
    }
  }

  async getRunsByIds(ids: number[]): Promise<Run[]> {
    if (ids.length === 0) return [];
    return await db.select().from(runs).where(inArray(runs.id, ids));
  }

  async getCompareHistory(userId: string): Promise<CompareHistory[]> {
    return await db.select().from(compareHistory)
      .where(sql`LOWER(${compareHistory.userId}) = ${userId.toLowerCase()}`)
      .orderBy(desc(compareHistory.createdAt)).limit(20);
  }

  async saveCompareHistory(runIds: number[], addresses: string[], projectTypes?: (string | null)[], userId?: string): Promise<CompareHistory> {
    // Check for duplicate - same run IDs in any order for this user
    const sortedRunIds = [...runIds].sort((a, b) => a - b);
    const existing = userId
      ? await db.select().from(compareHistory).where(sql`LOWER(${compareHistory.userId}) = ${userId.toLowerCase()}`).orderBy(desc(compareHistory.createdAt)).limit(20)
      : await db.select().from(compareHistory).orderBy(desc(compareHistory.createdAt)).limit(20);
    
    // Check if this exact comparison already exists in recent history
    const existingEntry = existing.find(entry => {
      const entrySortedIds = [...(entry.runIds as number[])].sort((a, b) => a - b);
      return entrySortedIds.length === sortedRunIds.length && 
             entrySortedIds.every((id, i) => id === sortedRunIds[i]);
    });
    
    if (existingEntry) {
      // Update existing entry with latest project uses if provided
      if (projectTypes) {
        const [updated] = await db.update(compareHistory)
          .set({ projectTypes, createdAt: new Date() })
          .where(eq(compareHistory.id, existingEntry.id))
          .returning();
        return updated;
      }
      return existingEntry;
    }
    
    const [entry] = await db.insert(compareHistory)
      .values({ runIds, addresses, projectTypes: projectTypes || [], userId: userId || null })
      .returning();
    return entry;
  }

  async updateCompareHistoryProjectTypes(id: number, projectTypes: (string | null)[]): Promise<CompareHistory | null> {
    const [updated] = await db.update(compareHistory)
      .set({ projectTypes })
      .where(eq(compareHistory.id, id))
      .returning();
    return updated || null;
  }

  async deleteCompareHistory(id: number): Promise<void> {
    await db.delete(compareHistory).where(eq(compareHistory.id, id));
  }

  async clearCompareHistory(userId: string): Promise<void> {
    await db.delete(compareHistory).where(sql`LOWER(${compareHistory.userId}) = ${userId.toLowerCase()}`);
  }

  async clearTaxCache(): Promise<number> {
    const deleted = await db.delete(propertyTaxCache).returning();
    return deleted.length;
  }

  async clearLienCache(): Promise<number> {
    const deleted = await db.delete(lienCache).returning();
    return deleted.length;
  }

  async getChatMessages(runId: number, userId: string): Promise<ChatMessage[]> {
    return await db.select().from(chatMessages)
      .where(and(eq(chatMessages.runId, runId), eq(chatMessages.userId, userId)))
      .orderBy(chatMessages.createdAt);
  }

  async saveChatMessage(runId: number, userId: string, role: 'user' | 'assistant', content: string): Promise<ChatMessage> {
    const [msg] = await db.insert(chatMessages)
      .values({ runId, userId, role, content })
      .returning();
    return msg;
  }

  async getPinForAddress(addressHash: string): Promise<string | null> {
    const rows = await db.select({ pin: pinLookupCache.pin })
      .from(pinLookupCache)
      .where(eq(pinLookupCache.addressHash, addressHash))
      .limit(1);
    return rows[0]?.pin ?? null;
  }

  async updateRunListingData(id: number, data: object): Promise<Run | undefined> {
    const [updated] = await db.update(runs)
      .set({ listingData: data as any })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async updateRunListingSnapshot(id: number, data: object): Promise<Run | undefined> {
    const [updated] = await db.update(runs)
      .set({ listingSnapshot: data as any })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async saveCrimeTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ crimeTakeaway: content, crimeTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveTransitTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ transitTakeaway: content, transitTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveSchoolsTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ schoolsTakeaway: content, schoolsTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveHmdaTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ hmdaTakeaway: content, hmdaTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveNewsTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ newsTakeaway: content, newsTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveNeighborhoodNewsTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ neighborhoodNewsTakeaway: content, neighborhoodNewsTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async savePeopleTakeaway(id: number, content: object): Promise<void> {
    await db.update(runs)
      .set({ peopleTakeaway: content, peopleTakeawayGeneratedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async saveInsightReport(id: number, content: object): Promise<Run | undefined> {
    const [updated] = await db.update(runs)
      .set({ insightReportContent: content, insightReportGeneratedAt: new Date() })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async getInsightReport(id: number): Promise<{ content: object; generatedAt: Date } | null> {
    const [row] = await db.select({
      insightReportContent: runs.insightReportContent,
      insightReportGeneratedAt: runs.insightReportGeneratedAt,
    }).from(runs).where(eq(runs.id, id)).limit(1);
    if (!row?.insightReportContent || !row.insightReportGeneratedAt) return null;
    return { content: row.insightReportContent as object, generatedAt: row.insightReportGeneratedAt };
  }
}

export const storage = new DatabaseStorage();
