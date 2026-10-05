export interface CompetitorHistoryInput {
  name: string;
  address: string;
  projectUse: string;
  licenseNumber?: string;
}

export interface CompetitorHistoryResult {
  classification: "additional" | "replacement" | "unknown";
  firstLicenseDate: string | null;
  previousBusinesses: string[];
  detail: string;
  sourceUrl: string;
  checkedAt: string;
}
