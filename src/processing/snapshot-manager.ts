/**
 * Snapshot Manager
 *
 * Manages SCRAPE_SNAPSHOT records — the stored state of a case file's
 * binnacle data from each successful scrape. Snapshots enable change
 * detection by providing the "before" state for comparison.
 *
 * Each case file has at most one active snapshot (the most recent).
 * When a new snapshot is created, the previous one is kept for audit
 * but the latest is always used for comparison.
 */
import { Op } from "sequelize";
import { NormalizedBinnacleData } from "../shared/types/change.types";
import { normalizeAllBinnacles } from "./data-normalizer";
import { computeHash } from "../shared/utils/hash";
import { RawBinnacleEntry } from "../shared/types/scrape-result.types";
import { logger } from "../monitoring/logger";

// Model will be initialized via sequelize — imported dynamically to avoid circular deps
let ScrapeSnapshot: any = null;

/**
 * Initialize the snapshot manager with the Sequelize model.
 * Must be called after models are set up.
 */
export function initSnapshotManager(model: any): void {
  ScrapeSnapshot = model;
}

/**
 * Get the most recent snapshot for a case file.
 *
 * @param caseFileId - FK to JUDICIAL_CASE_FILE
 * @returns Snapshot data or null if no previous snapshot exists
 */
export async function getLatestSnapshot(
  caseFileId: number
): Promise<{
  hash: string;
  normalizedData: NormalizedBinnacleData[];
  snapshotId: number;
} | null> {
  if (!ScrapeSnapshot) {
    logger.warn("SnapshotManager not initialized — returning null");
    return null;
  }

  const snapshot = await ScrapeSnapshot.findOne({
    where: { judicialCaseFileId: caseFileId },
    order: [["createdAt", "DESC"]],
  });

  if (!snapshot) return null;

  return {
    hash: snapshot.contentHash,
    normalizedData: snapshot.normalizedData,
    snapshotId: snapshot.id,
  };
}

/**
 * Save a new snapshot after a successful scrape.
 *
 * @param caseFileId - FK to JUDICIAL_CASE_FILE
 * @param rawBinnacles - Raw binnacle data from the scrape
 * @param contentHash - Pre-computed SHA-256 hash of the normalized data
 * @param binnacleCount - Total count of binnacles
 * @returns Created snapshot record
 */
export async function saveSnapshot(
  caseFileId: number,
  rawBinnacles: RawBinnacleEntry[],
  contentHash: string,
  binnacleCount: number
): Promise<any> {
  if (!ScrapeSnapshot) {
    logger.warn("SnapshotManager not initialized — cannot save snapshot");
    return null;
  }

  const normalizedData = normalizeAllBinnacles(rawBinnacles);

  const snapshot = await ScrapeSnapshot.create({
    judicialCaseFileId: caseFileId,
    contentHash,
    normalizedData: JSON.stringify(normalizedData),
    binnacleCount,
  });

  logger.info(
    { caseFileId, snapshotId: snapshot.id, binnacleCount },
    "Snapshot saved"
  );

  return snapshot;
}
