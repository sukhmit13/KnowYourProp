import type { Express, Request, Response } from "express";
import { ilike } from "drizzle-orm";
import { db } from "./db";
import { ardcVerifications, zbaCases } from "../shared/schema";
import { normalizeProName } from "../shared/normalizeProName";
import { cachedProfessionalDirectory } from "./architectRankings";
import { getCachedDebtSnapshot } from "./debtSnapshot";
import { rollUp, type RollUpInput } from "./professionalRecord";

/** No paid calls, persistence, Recorder scraping, or fresh Discovery ranking builds. */
export function registerProfessionalRecordRoutes(app: Express, authorize: (req: Request, res: Response, publicView: boolean) => Promise<{ address: string } | null>) {
  const handler = (publicView: boolean) => async (req: Request, res: Response) => {
    try {
      const run = await authorize(req, res, publicView);
      if (!run) return;
      const input: RollUpInput = req.body ?? {};
      const arrays = [input.permitData?.permits, input.permitData?.olderPermits, input.zoningHistoryData?.items, input.taxAppealData, input.lienData?.documents];
      if (arrays.some(a => a != null && (!Array.isArray(a) || a.length > 5000 || a.some((r: unknown) => !r || typeof r !== "object" || Array.isArray(r))))) {
        return res.status(400).json({ message: "Invalid professional record sources." });
      }
      // Representatives come from property-matched records, never the nearby ward feed.
      const chicago = String(input.city ?? "").toLowerCase() === "chicago" || /,\s*chicago(?:,|\s+il\b|$)/i.test(run.address);
      const street = !chicago ? "" : run.address.split(",")[0].replace(/^\d[\d-]*\s*/, "")
        .replace(/^(N|S|E|W|NORTH|SOUTH|EAST|WEST)\s+/i, "")
        .replace(/\s+(AVE(?:NUE)?|ST(?:REET)?|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|CT|COURT|PL|PLACE)\.?$/i, "")
        .replace(/[%_]/g, "").trim();
      let cases: any[] = [];
      let zbaStatus: "partial" | "unavailable" = "unavailable";
      if (street) {
        try {
          const rows = await db.select().from(zbaCases).where(ilike(zbaCases.propertyAddress, `%${street.split(/\s+/).join("%")}%`));
          const verified = await db.select().from(ardcVerifications);
          const ardcNames = new Set(verified.filter(v => v.isAttorney === true).map(v => normalizeProName(v.representativeNorm)));
          cases = rows.map(c => ({ ...c, ardcVerified: ardcNames.has(normalizeProName(c.representativeRaw)) }));
          // The historic index does not claim exhaustive coverage of all years.
          zbaStatus = "partial";
        } catch (error) {
          console.error("[professional-record] ZBA source unavailable:", error instanceof Error ? error.message : "lookup failed");
        }
      }
      const pin = String(input.lienData?.pin ?? "").replace(/\D/g, "");
      let debtSnapshot = null;
      if (/^\d{14}$/.test(pin)) {
        try {
          const cached = await getCachedDebtSnapshot(pin);
          const sourceDate = input.lienData?.scrapedAt ? Date.parse(input.lienData.scrapedAt) : null;
          // A newly refreshed Recorder index invalidates an older classification.
          if (cached && (sourceDate == null || Number.isFinite(sourceDate) && Date.parse(cached.updatedAt) >= sourceDate)) debtSnapshot = cached.snap;
        }
        catch (error) { console.error("[professional-record] Resolved title snapshot unavailable"); }
      }
      const record = rollUp({
        permitData: input.permitData, zoningHistoryData: input.zoningHistoryData,
        taxAppealData: input.taxAppealData, lienData: input.lienData,
        address: run.address, zbaData: { cases }, debtSnapshot,
        directory: cachedProfessionalDirectory(),
      });
      record.sourceCoverage.zba = { status: zbaStatus };
      return res.json(record);
    } catch (error) {
      console.error("[professional-record]", error);
      return res.status(500).json({ message: "Professional records could not be rolled up." });
    }
  };
  app.post("/api/runs/:id/professional-record", handler(false));
  app.post("/api/public/run/:id/professional-record", handler(true));
}