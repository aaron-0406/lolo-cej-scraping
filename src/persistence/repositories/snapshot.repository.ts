/**
 * Snapshot Repository
 *
 * CRUD operations for SCRAPE_SNAPSHOT records.
 * Manages snapshot lifecycle: create new, retrieve latest, update counters.
 */
import { ScrapeSnapshot } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Get the latest snapshot for a case file.
 */
export async function findLatestByCaseFileId(
  caseFileId: number
): Promise<any | null> {
  return ScrapeSnapshot.findOne({
    where: { caseFileId },
    order: [["createdAt", "DESC"]],
  });
}

/**
 * Create or update a snapshot for a case file.
 * Uses upsert since each case file has at most one active snapshot.
 *
 * @param data - Snapshot data
 * @returns Created or updated snapshot
 */
export async function upsert(data: {
  caseFileId: number;
  contentHash: string;
  binnacleCount: number;
  rawData: any;
  lastScrapedAt: Date;
  lastChangedAt?: Date | null;
  scrapeCount?: number;
  consecutiveNoChange?: number;
  errorCount?: number;
  lastError?: string | null;
}): Promise<any> {
  const existing = await findLatestByCaseFileId(data.caseFileId);

  if (existing) {
    await existing.update({
      contentHash: data.contentHash,
      binnacleCount: data.binnacleCount,
      rawData: data.rawData,
      lastScrapedAt: data.lastScrapedAt,
      lastChangedAt: data.lastChangedAt ?? existing.get("lastChangedAt"),
      scrapeCount: (existing.get("scrapeCount") as number) + 1,
      consecutiveNoChange: data.consecutiveNoChange ?? 0,
      errorCount: data.errorCount ?? 0,
      lastError: data.lastError ?? null,
    });
    return existing;
  }

  return ScrapeSnapshot.create({
    caseFileId: data.caseFileId,
    contentHash: data.contentHash,
    binnacleCount: data.binnacleCount,
    rawData: data.rawData,
    lastScrapedAt: data.lastScrapedAt,
    lastChangedAt: data.lastChangedAt || null,
    scrapeCount: 1,
    consecutiveNoChange: data.consecutiveNoChange ?? 0,
    errorCount: 0,
    lastError: null,
  });
}

/**
 * Increment the consecutive no-change counter for a snapshot.
 */
export async function incrementNoChange(caseFileId: number): Promise<void> {
  const snapshot = await findLatestByCaseFileId(caseFileId);
  if (snapshot) {
    await snapshot.increment("consecutiveNoChange");
  }
}

/**
 * Record an error on the snapshot.
 */
export async function recordError(
  caseFileId: number,
  errorMessage: string
): Promise<void> {
  const snapshot = await findLatestByCaseFileId(caseFileId);
  if (snapshot) {
    await snapshot.update({
      lastError: errorMessage,
      errorCount: (snapshot.get("errorCount") as number) + 1,
    });
  }
}
