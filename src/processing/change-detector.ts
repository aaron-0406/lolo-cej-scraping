/**
 * Change Detector
 *
 * Compares newly scraped binnacle data against the most recent snapshot
 * to determine if any changes occurred. Uses a two-phase strategy:
 *
 * 1. Fast path: Compare SHA-256 content hashes. If equal → no changes.
 * 2. Slow path: If hashes differ, compute structured diff to identify
 *    exactly which binnacles are new, modified, or removed.
 *
 * This avoids the expensive structured diff for the majority of scrapes
 * where nothing has changed.
 */
import { RawBinnacleEntry } from "../shared/types/scrape-result.types";
import {
  ChangeDetectionResult,
  NormalizedBinnacleData,
} from "../shared/types/change.types";
import { normalizeAllBinnacles } from "./data-normalizer";
import { computeHash } from "../shared/utils/hash";
import { computeStructuredDiff } from "../shared/utils/diff";
import { logger } from "../monitoring/logger";

/**
 * Detect changes between a new scrape and the previous snapshot.
 *
 * @param newBinnacles - Newly scraped raw binnacle entries
 * @param previousSnapshot - Previous snapshot's normalized data (null if first scrape)
 * @param previousHash - Previous snapshot's content hash (empty string if first scrape)
 * @returns Change detection result with hash and diff details
 */
export function detectChanges(
  newBinnacles: RawBinnacleEntry[],
  previousSnapshot: NormalizedBinnacleData[] | null,
  previousHash: string
): ChangeDetectionResult {
  // Normalize new data
  const normalizedNew = normalizeAllBinnacles(newBinnacles);
  const newHash = computeHash(normalizedNew);

  // First scrape — no previous snapshot to compare against
  if (!previousSnapshot || previousSnapshot.length === 0) {
    logger.info(
      { binnacleCount: normalizedNew.length },
      "First scrape — no previous snapshot"
    );
    return {
      isFirstScrape: true,
      hasChanges: true,
      changes: [],
      newHash,
      oldHash: "",
      newBinnacleCount: normalizedNew.length,
    };
  }

  // Fast path: hash comparison
  if (newHash === previousHash) {
    logger.debug("Content hash unchanged — no changes detected");
    return {
      isFirstScrape: false,
      hasChanges: false,
      changes: [],
      newHash,
      oldHash: previousHash,
      newBinnacleCount: normalizedNew.length,
    };
  }

  // Slow path: structured diff
  logger.info(
    { oldHash: previousHash, newHash },
    "Content hash changed — computing structured diff"
  );
  const changes = computeStructuredDiff(previousSnapshot, normalizedNew);

  return {
    isFirstScrape: false,
    hasChanges: changes.length > 0,
    changes,
    newHash,
    oldHash: previousHash,
    newBinnacleCount: normalizedNew.length,
  };
}
