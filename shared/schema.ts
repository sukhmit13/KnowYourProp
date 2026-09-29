
import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const neighborhoodNewsArchive = pgTable("neighborhood_news_archive", {
  neighborhood: text("neighborhood").notNull(),
  urlHash: text("url_hash").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  source: text("source").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.neighborhood, table.urlHash] }),
]);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  isFavorite: boolean("is_favorite").default(false),
  lastProjectType: text("last_project_type"),
  lastRole: text("last_role"),
  lastTransactionType: text("last_transaction_type"),
  lastFreeformDescription: text("last_freeform_description"),
  lastReferralNeeds: text("last_referral_needs").array(),
  reportContext: jsonb("report_context"),
  // Manual property data (user-entered when API doesn't have it)
  manualBuildingSqFt: integer("manual_building_sq_ft"),
  manualLandSqFt: integer("manual_land_sq_ft"),
  manualStories: numeric("manual_stories"),
  sourceListingUrl: text("source_listing_url"), // Original listing URL if pasted
  askingPrice: integer("asking_price"), // Property asking price from listing
  purchasedAt: timestamp("purchased_at"), // Set when a single-report purchase is completed
  insightReportContent: jsonb("insight_report_content"), // Generated 1-pager JSON content
  insightReportGeneratedAt: timestamp("insight_report_generated_at"), // When last generated
  listingData: jsonb("listing_data"), // Scraped MLS details (units, rents) from listing URL
  listingSnapshot: jsonb("listing_snapshot"), // On-demand AI web-search listing lookup (price, remarks, disclosures)
  crimeTakeaway: jsonb("crime_takeaway"), // Cached AI crime "Takeaway" {headline, bullets:[{tone,text}], dataHash}
  crimeTakeawayGeneratedAt: timestamp("crime_takeaway_generated_at"),
  transitTakeaway: jsonb("transit_takeaway"), // Cached AI transit "Takeaway" — same shape as crimeTakeaway
  transitTakeawayGeneratedAt: timestamp("transit_takeaway_generated_at"),
  schoolsTakeaway: jsonb("schools_takeaway"), // Cached AI schools "Takeaway" — same shape as crimeTakeaway
  schoolsTakeawayGeneratedAt: timestamp("schools_takeaway_generated_at"),
  hmdaTakeaway: jsonb("hmda_takeaway"), // Cached AI mortgage-market "Takeaway" — same shape as crimeTakeaway
  hmdaTakeawayGeneratedAt: timestamp("hmda_takeaway_generated_at"),
  newsTakeaway: jsonb("news_takeaway"), // Cached AI news-coverage section {section, articles, dataHash}
  newsTakeawayGeneratedAt: timestamp("news_takeaway_generated_at"),
  neighborhoodNewsTakeaway: jsonb("neighborhood_news_takeaway"), // Cached neighborhood-news section {takeaway, culture, dev, kpis, dataHash}
  neighborhoodNewsTakeawayGeneratedAt: timestamp("neighborhood_news_takeaway_generated_at"),
  peopleTakeaway: jsonb("people_takeaway"), // Cached People Profile takeaway {takeaway:{title,rows,context_note}|null, dataHash}
  peopleTakeawayGeneratedAt: timestamp("people_takeaway_generated_at"),
  label: text("label"), // User-editable scenario label to distinguish duplicate-address runs
  createdAt: timestamp("created_at").defaultNow(),
  userId: text("user_id"), // Owner email — scopes runs per account
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(), // Foreign key to runs
  name: text("name").notNull(),
  projectType: text("project_type").notNull(), // Enum handled in application logic or check constraint
  sponsorType: text("sponsor_type").notNull(),
  projectSize: numeric("project_size").notNull(), // Store as numeric for currency
  
  // Feature checkboxes
  workforceTraining: boolean("workforce_training").default(false),
  reentryHiring: boolean("reentry_hiring").default(false),
  onsiteManufacturing: boolean("onsite_manufacturing").default(false),
  adaptiveReuse: boolean("adaptive_reuse").default(false),
  corridorImprovements: boolean("corridor_improvements").default(false),
  nonprofitAnchor: boolean("nonprofit_anchor").default(false),
  jobCreationFocus: boolean("job_creation_focus").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

export const geocodeCache = pgTable("geocode_cache", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(), // Normalized address
  lat: numeric("lat").notNull(),
  lon: numeric("lon").notNull(),
  tractGeoid: text("tract_geoid"),
  zipCode: text("zip_code"),
  tifName: text("tif_name"), // Cached TIF result
  zoning: text("zoning"),    // Cached Zoning result
  communityArea: text("community_area"), // Chicago Community Area name
  opportunityZone: boolean("opportunity_zone").default(false),
  cachedAt: timestamp("cached_at").defaultNow(),
});

// Property Tax Cache
export const propertyTaxCache = pgTable("property_tax_cache", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull().unique(), // 14-digit PIN (no hyphens)
  taxYearMostRecent: integer("tax_year_most_recent"), // null if parsing failed
  totalAnnualTaxAmount: numeric("total_annual_tax_amount"), // null if parsing failed
  paymentStatus: text("payment_status"), // 'current' | 'delinquent' | 'sold' | 'unknown'
  taxYearsJson: jsonb("tax_years_json"), // Array of {year, billed, amountDue}
  treasurerBillUrl: text("treasurer_bill_url").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  lastSuccessfulFetchAt: timestamp("last_successful_fetch_at"),
  treasurerScrapedAt: timestamp("treasurer_scraped_at"),
});

// Property Tax Fetch Log (for rate limiting)
export const propertyTaxFetchLog = pgTable("property_tax_fetch_log", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

// West Town tax-delinquency pilot. This is intentionally separate from the
// one-off property tax cache: it stores the bounded parcel universe, durable
// scan queue, and historical Treasurer observations used by Market Discovery.
export const westTownTaxParcels = pgTable("west_town_tax_parcels", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull().unique("west_town_tax_parcels_pin_key"),
  address: text("address"),
  city: text("city"),
  zipCode: text("zip_code"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  communityAreaNumber: integer("community_area_number").notNull().default(24),
  seedSource: text("seed_source").notNull().default("cook_county_assessor"),
  queueStatus: text("queue_status").notNull().default("pending"), // pending | in_progress | retry_wait | checked | unknown
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at"),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastError: text("last_error"),
  currentStatus: text("current_status"), // current | delinquent | sold | unknown; only Treasurer-confirmed statuses are shown as confirmed
  currentAmountDue: numeric("current_amount_due"),
  oldestUnpaidYear: integer("oldest_unpaid_year"),
  taxYearsJson: jsonb("tax_years_json"),
  statusSource: text("status_source").notNull().default("pilot_scan"), // pilot_scan
  treasurerBillUrl: text("treasurer_bill_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const westTownTaxSnapshots = pgTable("west_town_tax_snapshots", {
  id: serial("id").primaryKey(),
  parcelId: integer("parcel_id").notNull(),
  pin: text("pin").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  outcome: text("outcome").notNull(), // current | delinquent | sold | unknown | error
  amountDue: numeric("amount_due"),
  oldestUnpaidYear: integer("oldest_unpaid_year"),
  taxYearsJson: jsonb("tax_years_json"),
  treasurerBillUrl: text("treasurer_bill_url").notNull(),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at").defaultNow(),
});

export const westTownTaxPilotSettings = pgTable("west_town_tax_pilot_settings", {
  id: integer("id").primaryKey(), // single row: 1
  scanEnabled: boolean("scan_enabled").notNull().default(false),
  universeSeededAt: timestamp("universe_seeded_at"),
  lastScannerStartedAt: timestamp("last_scanner_started_at"),
  lastActivityAt: timestamp("last_activity_at"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lien / Recorder of Deeds Cache
export const lienCache = pgTable("lien_cache", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull().unique(), // 14-digit PIN (no hyphens)
  documentsJson: jsonb("documents_json"), // Array of LienDocument
  scrapedAt: timestamp("scraped_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  ownerName: text("owner_name"), // Owner name extracted from sale history / assessor
  ownerLiensJson: jsonb("owner_liens_json"), // Array of LienDocument (personal liens against owner)
  ownerLienScrapedAt: timestamp("owner_lien_scraped_at"),
  legalDescriptionPinsJson: jsonb("legal_description_pins_json"), // [{pin, address}] from most recent deed
  deedGrantor: text("deed_grantor"), // Seller (grantor) from most recent deed detail page
  deedGrantee: text("deed_grantee"), // Buyer (grantee) from most recent deed detail page
});

// Recorder Document Extraction Cache — one row per recorded instrument.
// Recorder docs are immutable, so an extraction is cached forever by document number.
export const recorderDocCache = pgTable("recorder_doc_cache", {
  docNumber: text("doc_number").primaryKey(), // recorder document number, verbatim
  extraction: jsonb("extraction").notNull(), // structured ExtractedRecorderDoc JSON
  textSource: text("text_source").notNull(), // 'text-layer' | 'ocr'
  createdAt: timestamp("created_at").defaultNow(),
});

// PIN Lookup Cache (address to PIN mapping)
export const pinLookupCache = pgTable("pin_lookup_cache", {
  id: serial("id").primaryKey(),
  addressHash: text("address_hash").notNull().unique(),
  normalizedAddress: text("normalized_address").notNull(),
  pin: text("pin"),
  confidence: text("confidence").notNull().default('none'),
  source: text("source").default('none'),
  propertyType: text("property_type"),
  commercialData: jsonb("commercial_data"),
  cachedAt: timestamp("cached_at").defaultNow(),
});

// Chat Messages (persistent AI chat history per run per user)
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof insertChatMessageSchema._type;

// Property Memory Context (canonical evidence layer, one per run)
// The `context` JSONB column holds the full PropertyContext object —
// see shared/propertyContext.ts for its shape, Zod schemas, and docs.
export const propertyContexts = pgTable("property_contexts", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().unique(), // report_id = run ID
  propertyId: text("property_id").notNull(), // PIN when available, else normalized address
  canonicalPropertyKey: text("canonical_property_key"), // optional grouping key across runs
  context: jsonb("context").notNull(), // full PropertyContext object
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPropertyContextSchema = createInsertSchema(propertyContexts).omit({ id: true, createdAt: true, updatedAt: true });
export type PropertyContextRow = typeof propertyContexts.$inferSelect;
export type InsertPropertyContextRow = z.infer<typeof insertPropertyContextSchema>;

// === RELATIONS ===

export const runsRelations = relations(runs, ({ many }) => ({
  scenarios: many(scenarios),
}));

export const scenariosRelations = relations(scenarios, ({ one }) => ({
  run: one(runs, {
    fields: [scenarios.runId],
    references: [runs.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertRunSchema = createInsertSchema(runs).omit({ id: true, createdAt: true, userId: true });
export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true, createdAt: true });
export const insertGeocodeCacheSchema = createInsertSchema(geocodeCache).omit({ id: true, cachedAt: true });
export const insertPropertyTaxCacheSchema = createInsertSchema(propertyTaxCache).omit({ id: true, fetchedAt: true });
export const insertPropertyTaxFetchLogSchema = createInsertSchema(propertyTaxFetchLog).omit({ id: true, fetchedAt: true });
export const insertPinLookupCacheSchema = createInsertSchema(pinLookupCache).omit({ id: true, cachedAt: true });
export const insertLienCacheSchema = createInsertSchema(lienCache).omit({ id: true, fetchedAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Run = typeof runs.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type PropertyTaxCache = typeof propertyTaxCache.$inferSelect;
export type PropertyTaxFetchLog = typeof propertyTaxFetchLog.$inferSelect;
export type PinLookupCache = typeof pinLookupCache.$inferSelect;

export type CreateRunRequest = z.infer<typeof insertRunSchema>;
export type CreateScenarioRequest = z.infer<typeof insertScenarioSchema>;

export type RunWithScenarios = Run & { scenarios: Scenario[] };

// Geocoding Response
export interface LocationFacts {
  lat: number;
  lon: number;
  tractGeoid: string | null;
  zipCode: string | null;
  tifName: string | null;
  zoning: string | null;
  communityArea: string | null;
  ward: string | null;
  alderman: string | null;
  aldermanUrl: string | null;
  aldermanPhone: string | null;
  aldermanEmail: string | null;
  aldermanWardOffice: string | null;
  aldermanYearsInOffice?: string | null;
  aldermanAttendance?: string | null;
  aldermanCouncilmaticUrl?: string | null;
  opportunityZone: boolean;
  /** ADU eligibility zone: 'Zoning-Eligible', an RS pilot-area label, or null/undefined when not eligible */
  aduZone?: string | null;
  aduZoneDisplay?: string | null;
  aduZoneLimitations?: string | null;
  formattedAddress: string;
  city?: 'chicago' | 'philadelphia';
}

// Childcare Access Data
export interface ChildcareAccessData {
  zipCode: string;
  childrenUnder5: number;
  licensedSlots: number;
  centerSlots: number;
  familyHomeSlots: number;
  childrenPerSlot: number | null;
  status: 'desert' | 'underserved' | 'adequate' | 'unknown';
  statusLabel: string;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

// Zoning Information
export interface ZoningInfo {
  code: string;
  name: string;
  category: 'residential' | 'business' | 'commercial' | 'manufacturing' | 'downtown' | 'special';
  description: string;
  allowedUses: string[];
  maxFAR: number | null;
  maxHeight: string | null;
  parkingMin: string | null;
  minLotAreaPerUnit: number | null;
  residentialAllowed: boolean;
  commercialAllowed: boolean;
  industrialAllowed: boolean;
}

export interface GeocodeRequest {
  address: string;
}

// SBIF Eligibility Data
export interface SbifEligibilityResult {
  tif: {
    inTif: boolean;
    districtName: string | null;
  };
  sbif: {
    authorized: boolean;
    status: 'open' | 'upcoming' | 'not_scheduled' | 'unknown';
    statusLabel: string;
    verificationUrl: string;
    notes: string | null;
  };
  lastUpdated: string | null;
}

// NMTC Eligibility Data
export interface NmtcDistressDetails {
  povertyRate: number | null;
  pctMedianFamilyIncome: number | null;
  unemploymentRate: number | null;
  unemploymentRateRatio: number | null;
  povertyPopulation: number | null;
  metroDesignation: string | null;
  highMigration: boolean;
  censusTractFips: string | null;
  povertyRateQualified: boolean;
  medianIncomeQualified: boolean;
  ratioQualified: boolean;
}

export type NmtcDistressLevel = 'deep_distress' | 'severe_distress' | 'eligible' | 'high_migration' | 'not_qualified' | 'unknown';

export interface NmtcEligibilityResult {
  eligible: boolean;
  status: 'qualified' | 'not_qualified' | 'unknown';
  statusLabel: string;
  distressLevel: NmtcDistressLevel;
  distressLabel: string;
  distressDetails: NmtcDistressDetails | null;
  source: string;
  verificationUrl: string;
  lastChecked: string;
}

// Property Tax Data
export interface TaxYearEntry {
  year: number;
  billed: number;
  installment1: number;
  installment2: number;
  amountDue: number;
  status: 'paid' | 'partial' | 'unpaid' | 'unknown';
}

export interface PropertyTaxResult {
  pin: string;
  taxYearMostRecent: number | null;
  treasurerBillUrl: string;
  fetchedAt: string;
  isStale: boolean;
  source: 'cook_county_assessor' | 'cook_county_treasurer';
  assessorUrl?: string;
  error?: string;
  // Tax bill data from Cook County Treasurer (via scraper)
  totalAnnualTaxAmount: number | null;
  paymentStatus: 'current' | 'delinquent' | 'sold' | 'unknown' | null;
  taxYears: TaxYearEntry[];
  treasurerScrapedAt: string | null;
  // Mailing owner name from Cook County Treasurer (most current — reflects $0 deed transfers)
  mailingOwnerName: string | null;
  // Building characteristics from Cook County Assessor
  landSquareFeet: number | null;
  buildingSquareFeet: number | null;
  buildingType: string | null;
  buildingUse: string | null;
  apartments: string | null;
  basement: string | null;
  attic: string | null;
  yearBuilt: number | null;
  stories: number | null;
  propertyClass: string | null;
  // Set when building characteristics came from a sibling parcel (multi-lot property)
  coParcelPin?: string;
  coParcelAddress?: string;
}

// Lien / Recorder of Deeds Types
export interface LienDocument {
  documentNumber: string;
  documentType: string;
  recordedDate: string;
  grantor: string;
  grantee: string;
  amount: number;
  category: 'mortgage' | 'release' | 'lien' | 'deed' | 'foreclosure' | 'litigation' | 'other'
    | 'judgment' | 'federal_tax' | 'state_tax' | 'mechanic' | 'support' | 'other_lien';
  // For RELEASE documents: which document numbers this release clears (from "Prior Documents" on detail page)
  releasesDocNumbers?: string[];
  // For LIEN/MORTGAGE documents: true if a release document explicitly references this document
  isReleased?: boolean;
  // Heuristic: lien/mortgage is over 2 years old with no release on record — statistically unlikely to be enforced
  isProbablyCleared?: boolean;
  // True when the grantor is a water department (City utility)
  isWaterDept?: boolean;
  // Maturity date scraped from mortgage document text
  maturityDate?: string;
  // Direct URL to the Cook County Recorder document detail page
  viewLink?: string;
}

export interface OwnerLienDocument extends LienDocument {
  category: 'judgment' | 'federal_tax' | 'state_tax' | 'mechanic' | 'support' | 'other_lien';
}

export interface LienResult {
  pin: string;
  isStale: boolean;
  scrapedAt: string | null;
  fetchedAt: string;
  recorderUrl: string;
  documents: LienDocument[];
  // Derived summaries
  mortgages: LienDocument[];
  liens: LienDocument[];
  releases: LienDocument[];
  deeds: LienDocument[];
  foreclosures: LienDocument[];
  litigation: LienDocument[];
  other: LienDocument[];
  // Active status (liens not offset by releases)
  activeLienCount: number;
  activeMortgageCount: number;
  /** Count of active (non-released) lis pendens / litigation filings */
  activeListPendensCount: number;
  /** Count of active water-department liens */
  waterDeptLienCount: number;
  hasForeclosure: boolean;
  overallStatus: 'clear' | 'has_liens' | 'has_foreclosure' | 'unknown';
  /** True when the scrape itself failed — absence of data is NOT the same as clean title */
  searchFailed?: boolean;
  // Owner name search results
  ownerName: string | null;
  ownerLiens: LienDocument[];
  ownerLienScrapedAt: string | null;
  ownerLienIsStale: boolean;
  // Co-parcel PINs extracted from the "Legal Description and Subdivision" table on the most recent deed
  legalDescriptionPins: Array<{ pin: string; address: string }>;
  // Grantor (seller) and grantee (buyer) from the most recent deed detail page
  deedGrantor: string | null;
  deedGrantee: string | null;
  error?: string;
}

// PIN Lookup Result
export interface PinLookupResult {
  pin: string | null;
  source: 'assessor_api' | 'assessor_api+commercial' | 'commercial_api' | 'exempt_api' | 'geo_fallback' | 'cache' | 'none';
  confidence: 'high' | 'medium' | 'low' | 'none';
  error?: string;
  propertyType?: string;
  nearestAddress?: string;
  note?: string;
  commercialData?: {
    bldgSf?: number;
    landSf?: number;
    yearBuilt?: number;
    marketValue?: number;
    propertyTypeUse?: string;
  };
  characteristicsData?: {
    yearBuilt?: number;
    buildingSf?: number;
    landSf?: number;
    bedrooms?: number;
    rooms?: number;
    fullBaths?: number;
    halfBaths?: number;
    fireplaces?: number;
    buildingType?: string;
    constructionQuality?: string;
    use?: string;
    garageSize?: string;
    garageConstruction?: string;
    garageAttached?: boolean;
    basement?: string;
    basementFinish?: string;
    atticType?: string;
    atticFinish?: string;
    exteriorWall?: string;
    roofConstruction?: string;
    heating?: string;
    airConditioning?: string;
    repairCondition?: string;
    porch?: string;
    propertyClass?: string;
    assessmentYear?: string;
  };
  saleHistory?: {
    saleDate: string;
    salePrice: number;
    sellerName: string;
    buyerName: string;
    deedType: string;
    docNo: string;
    year: string;
  }[];
  appealHistory?: {
    taxYear: string;
    appealType: string;
    appealReason: string;
    assessorLandValue: number;
    assessorImprovementValue: number;
    assessorTotalValue: number;
    borLandValue: number;
    borImprovementValue: number;
    borTotalValue: number;
    result: string;
    changeReason: string;
    attorneyFirstName?: string;
    attorneyLastName?: string;
    attorneyFirmName?: string;
    appellant: string;
  }[];
  assessedValues?: {
    year: string;
    propertyClass: string;
    mailedLand: number;
    mailedBuilding: number;
    mailedTotal: number;
    certifiedLand: number;
    certifiedBuilding: number;
    certifiedTotal: number;
    boardLand?: number;
    boardBuilding?: number;
    boardTotal?: number;
  }[];
  exemptionHistory?: {
    year: string;
    homeowner: number | null;
    senior: number | null;
    seniorFreeze: number | null;
    disabledPersons: number | null;
    disabledVeterans: number | null;
    returningVeterans: number | null;
    longtimeHomeowner: number | null;
    homeImprovement: number | null;
  }[];
}

// === CONSTANTS ===
export const PROJECT_TYPES = [
  "Commercial Development",
  "Industrial",
  "Mixed-Use",
  "Affordable Housing",
  "Market-Rate Housing",
  "Retail",
  "Community Facility",
  "Other",
] as const;

export const SPONSOR_TYPES = ["Unknown", "Nonprofit", "For-profit"] as const;

// === COMPARE HISTORY TABLE ===

export const compareHistory = pgTable("compare_history", {
  id: serial("id").primaryKey(),
  runIds: jsonb("run_ids").notNull().$type<number[]>(), // Array of run IDs that were compared
  addresses: jsonb("addresses").notNull().$type<string[]>(), // Array of addresses for display even if runs are deleted
  projectTypes: jsonb("project_types").$type<(string | null)[]>(), // Array of project uses for each run
  createdAt: timestamp("created_at").defaultNow(),
  userId: text("user_id"), // Owner email — scopes compare history per account
});

// === ZBA (Zoning Board of Appeals) TABLES ===

// ZBA Cases - individual case records from ZBA resolution PDFs
export const zbaCases = pgTable("zba_cases", {
  id: serial("id").primaryKey(),
  decisionDate: timestamp("decision_date"),
  caseId: text("case_id"), // application number if present
  ward: integer("ward"), // derived from property_address if not in text
  propertyAddress: text("property_address"),
  applicantName: text("applicant_name"),
  representativeRaw: text("representative_raw"), // raw "Appearance:" line
  representativeNorm: text("representative_norm"), // normalized name for grouping
  outcome: text("outcome").notNull(), // APPROVED, DENIED, WITHDRAWN, CONTINUED, OTHER
  pdfUrl: text("pdf_url").notNull(),
  rawCaseText: text("raw_case_text"), // for debugging
  createdAt: timestamp("created_at").defaultNow(),
});

// Rep Verifications - user-set verification status (NOT scraped from IARDC)
export const repVerifications = pgTable("rep_verifications", {
  representativeNorm: text("representative_norm").primaryKey(),
  status: text("status").notNull().default('unknown'), // verified_attorney, not_attorney, unknown
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ZBA Index Runs - track admin refresh operations
export const zbaIndexRuns = pgTable("zba_index_runs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default('pending'), // pending, processing, completed, failed
  pdfsProcessed: integer("pdfs_processed").default(0),
  casesExtracted: integer("cases_extracted").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ARDC Verification Cache - caches IARDC attorney lookup results
export const ardcVerifications = pgTable("ardc_verifications", {
  representativeNorm: text("representative_norm").primaryKey(),
  isAttorney: boolean("is_attorney"), // true = found in ARDC, false = not found, null = error/not checked
  ardcNumber: text("ardc_number"), // ARDC registration number if found
  checkedAt: timestamp("checked_at").defaultNow(),
});

// === ZBA SCHEMAS ===
export const insertCompareHistorySchema = createInsertSchema(compareHistory).omit({ id: true, createdAt: true });
export const insertZbaCaseSchema = createInsertSchema(zbaCases).omit({ id: true, createdAt: true });
export const insertRepVerificationSchema = createInsertSchema(repVerifications).omit({ updatedAt: true });
export const insertZbaIndexRunSchema = createInsertSchema(zbaIndexRuns).omit({ id: true, createdAt: true, completedAt: true });

// === ZBA TYPES ===
export type CompareHistory = typeof compareHistory.$inferSelect;
export type ZbaCase = typeof zbaCases.$inferSelect;
export type RepVerification = typeof repVerifications.$inferSelect;
export type ZbaIndexRun = typeof zbaIndexRuns.$inferSelect;

export type CreateZbaCaseRequest = z.infer<typeof insertZbaCaseSchema>;

// ZBA Outcome types
export const ZBA_OUTCOMES = ['APPROVED', 'DENIED', 'WITHDRAWN', 'CONTINUED', 'OTHER'] as const;
export type ZbaOutcome = typeof ZBA_OUTCOMES[number];

// Rep Verification Status types
export const REP_VERIFICATION_STATUSES = ['verified_attorney', 'not_attorney', 'unknown'] as const;
export type RepVerificationStatus = typeof REP_VERIFICATION_STATUSES[number];

// === PRE-TITLE CHECK CACHE TABLE ===

export const preTitleCheckCache = pgTable("pre_title_check_cache", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull().unique(),
  addressHash: text("address_hash").notNull(),
  
  // Property Tax Status
  propertyTaxData: jsonb("property_tax_data").$type<PreTitlePropertyTaxData | null>(),
  propertyTaxCheckedAt: timestamp("property_tax_checked_at"),
  
  // Liens and Mortgages
  liensData: jsonb("liens_data").$type<PreTitleLiensData | null>(),
  liensCheckedAt: timestamp("liens_checked_at"),
  
  // Foreclosure Status
  foreclosureData: jsonb("foreclosure_data").$type<PreTitleForeclosureData | null>(),
  foreclosureCheckedAt: timestamp("foreclosure_checked_at"),
  
  // Water Bill Status
  waterBillData: jsonb("water_bill_data").$type<PreTitleWaterBillData | null>(),
  waterBillCheckedAt: timestamp("water_bill_checked_at"),
  
  // Ownership History
  ownershipData: jsonb("ownership_data").$type<PreTitleOwnershipData | null>(),
  ownershipCheckedAt: timestamp("ownership_checked_at"),
  
  // Overall verdict (calculated)
  verdict: jsonb("verdict").$type<PreTitleVerdict | null>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPreTitleCheckCacheSchema = createInsertSchema(preTitleCheckCache).omit({ id: true, createdAt: true, updatedAt: true });
export type PreTitleCheckCache = typeof preTitleCheckCache.$inferSelect;

// Pre-Title Check Types
export interface PreTitlePropertyTaxData {
  status: 'current' | 'delinquent' | 'tax_sale' | 'unknown';
  totalOwed: number;
  currentYearPaid: boolean;
  priorYearPaid: boolean;
  taxSaleStatus: 'none' | 'pending' | 'sold';
  error?: boolean;
  message?: string;
  manualCheckUrl: string;
}

export interface PreTitleLiensData {
  activeLiens: PreTitleLien[];
  releasedLiens: PreTitleLien[];
  mortgages: PreTitleMortgage[];
  totalActiveLienAmount: number;
  hasJudgmentLien: boolean;
  hasTaxLien: boolean;
  hasMechanicLien: boolean;
  error?: boolean;
  message?: string;
  manualCheckUrl: string;
}

export interface PreTitleLien {
  type: string;
  category: 'judgment' | 'mechanic' | 'tax' | 'hoa' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  amount: number | null;
  recordedDate: string;
  creditor: string;
}

export interface PreTitleMortgage {
  lender: string;
  amount: number | null;
  recordedDate: string;
  documentNumber: string;
}

export interface PreTitleForeclosureData {
  hasActiveForeclosure: boolean;
  hasRecentForeclosure: boolean;
  activeCases: PreTitleForeclosureCase[];
  closedCases: PreTitleForeclosureCase[];
  error?: boolean;
  message?: string;
  manualCheckUrl: string;
}

export interface PreTitleForeclosureCase {
  caseNumber: string;
  filedDate: string;
  status: 'active' | 'pending' | 'closed' | 'dismissed';
  plaintiff: string;
}

export interface PreTitleWaterBillData {
  found: boolean;
  balance: number;
  isDelinquent: boolean;
  lastBillDate: string | null;
  error?: boolean;
  message?: string;
  manualCheckUrl: string;
}

export interface PreTitleOwnershipData {
  currentOwner: string | null;
  currentOwnerSince: string | null;
  totalTransfers: number;
  transfers: PreTitleOwnershipTransfer[];
  redFlags: PreTitleRedFlag[];
  error?: boolean;
  message?: string;
  manualCheckUrl: string;
}

export interface PreTitleOwnershipTransfer {
  date: string;
  grantor: string;
  grantee: string;
  documentType: string;
  salePrice: number | null;
}

export interface PreTitleRedFlag {
  flag: string;
  detail: string;
  impact: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface PreTitleVerdict {
  status: 'financeable' | 'difficult' | 'not_financeable';
  score: number;
  title: string;
  message: string;
  issues: PreTitleIssue[];
}

export interface PreTitleIssue {
  severity: 'critical' | 'high' | 'medium' | 'info';
  category: string;
  message: string;
  impact: string;
}

// Representative summary for API response
export interface RepresentativeSummary {
  representativeNorm: string;
  representativeDisplay: string;
  totalCases: number;
  approvedCount: number;
  deniedCount: number;
  withdrawnCount: number;
  otherCount: number;
  approvalRate: number | null; // null if < 5 cases
  verificationStatus: RepVerificationStatus;
  likelyAttorneyHeuristic: 'likely_attorney' | 'likely_not_attorney' | null;
  mostRecentCaseDate: string | null; // ISO date string of most recent case
  isSelfRep: boolean; // true if likely self-represented (applicant = representative)
  isVerifiedAttorney: boolean | null; // null = not checked, true = verified attorney, false = not found in ARDC
}

// ZBA Monthly PDF Cache - persists scraped approvals/upcoming to survive server restarts
export const zbaMonthlyCache = pgTable("zba_monthly_cache", {
  id: serial("id").primaryKey(),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
  approvalsJson: text("approvals_json").notNull(),
  upcomingJson: text("upcoming_json").notNull(),
});

// Ward/City summary response
export interface ZbaSummaryResponse {
  representatives: RepresentativeSummary[];
  totalCases: number;
  totalRepresentatives: number;
  selfRepCaseCount: number;
}

// === USERS TABLE (for auth + Stripe payment tracking) ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Nullable: users who sign up via Google OAuth have no password.
  passwordHash: text("password_hash"),
  // Google OAuth subject id (stable per Google account), set when the user
  // signs in with Google. Email/password users have null here.
  googleId: text("google_id").unique(),
  plan: text("plan").notNull().default("free"), // 'free' | 'subscriber'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialReportsRemaining: integer("trial_reports_remaining"),
  // Single active session per account: rotated on every login, so a login on
  // one device invalidates the Bearer token held by any other device.
  sessionToken: text("session_token"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
