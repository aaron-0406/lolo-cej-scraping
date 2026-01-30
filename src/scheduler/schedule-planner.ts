/**
 * Schedule Planner
 *
 * Reads notification schedules from the database and determines
 * which case files need scraping in the current cycle. Uses adaptive
 * frequency to skip stale case files that haven't changed recently.
 *
 * Runs on a node-cron interval (every 10 minutes by default).
 */
import { Op } from "sequelize";
import {
  ScheduledNotifications,
  JudicialCaseFile,
  CustomerHasBank,
  Customer,
  ScrapeSnapshot,
} from "../persistence/db/models";
import { ADAPTIVE_FREQUENCY, LOGIC_KEYS } from "../config/constants";
import { nowLima, daysSince, nearestDeadline } from "../shared/utils/date";
import { calculatePriorityFromMultipleHours } from "./deadline-calculator";
import { logger } from "../monitoring/logger";

export interface PlannedBatch {
  customerHasBankId: number;
  notificationHours: string[];
  caseFiles: PlannedCaseFile[];
  priority: number;
  deadline: Date;
}

export interface PlannedCaseFile {
  caseFileId: number;
  numberCaseFile: string;
  customerHasBankId: number;
  priority: number;
}

/**
 * Plan the next batch of scraping jobs.
 * Queries active notification schedules and their associated case files.
 *
 * @returns Array of planned batches, one per CHB with active notifications
 */
export async function planNextBatch(): Promise<PlannedBatch[]> {
  const batches: PlannedBatch[] = [];

  // Find all active CEJ monitoring notification schedules
  const schedules = await ScheduledNotifications.findAll({
    where: {
      logicKey: LOGIC_KEYS.CEJ_MONITORING,
      state: true,
    },
    include: [
      {
        model: CustomerHasBank,
        as: "customerHasBank",
        required: true,
        include: [
          {
            model: Customer,
            as: "customer",
            required: true,
            where: { isScrapperActive: true, state: 1 },
          },
        ],
      },
    ],
  });

  for (const schedule of schedules) {
    const chbId = schedule.get("customerHasBankId") as number;
    const rawHours = schedule.get("hourTimeToNotify");
    // hourTimeToNotify is now a JSON array of "HH:mm" strings
    const notificationHours: string[] = Array.isArray(rawHours)
      ? rawHours
      : rawHours ? [String(rawHours)] : [];

    // Find case files for this CHB
    const caseFiles = await JudicialCaseFile.findAll({
      where: {
        customerHasBankId: chbId,
        isArchived: false,
        scrapeEnabled: true,
        isScanValid: true,
      },
    });

    // Batch-load all snapshots for this CHB's case files in a single query
    const caseFileIds = caseFiles.map((cf) => cf.get("id") as number);
    const snapshotMap = await loadSnapshotsForCaseFiles(caseFileIds);

    // Filter by adaptive frequency using pre-loaded snapshots
    const eligibleCaseFiles: PlannedCaseFile[] = [];
    for (const cf of caseFiles) {
      const caseFileId = cf.get("id") as number;
      const snapshot = snapshotMap.get(caseFileId) || null;
      if (shouldScrapeNow(caseFileId, cf, snapshot)) {
        eligibleCaseFiles.push({
          caseFileId,
          numberCaseFile: cf.get("numberCaseFile") as string,
          customerHasBankId: chbId,
          priority: calculatePriorityFromMultipleHours(notificationHours),
        });
      }
    }

    if (eligibleCaseFiles.length > 0) {
      const effectiveHours = notificationHours.length > 0 ? notificationHours : ["23:59"];
      batches.push({
        customerHasBankId: chbId,
        notificationHours: effectiveHours,
        caseFiles: eligibleCaseFiles,
        priority: calculatePriorityFromMultipleHours(notificationHours),
        deadline: nearestDeadline(effectiveHours),
      });
    }
  }

  logger.info(
    {
      batchCount: batches.length,
      totalCaseFiles: batches.reduce((sum, b) => sum + b.caseFiles.length, 0),
    },
    "Batch planning complete"
  );

  return batches;
}

/**
 * Batch-load the latest snapshot for each case file in a single query.
 * Returns a Map keyed by caseFileId for O(1) lookup.
 */
async function loadSnapshotsForCaseFiles(
  caseFileIds: number[]
): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  if (caseFileIds.length === 0) return map;

  const snapshots = await ScrapeSnapshot.findAll({
    where: { caseFileId: { [Op.in]: caseFileIds } },
    order: [["createdAt", "DESC"]],
  });

  // Keep only the latest snapshot per caseFileId (first one due to DESC order)
  for (const snap of snapshots) {
    const cfId = snap.get("caseFileId") as number;
    if (!map.has(cfId)) {
      map.set(cfId, snap);
    }
  }

  return map;
}

/**
 * Determine if a case file should be scraped in this cycle
 * based on adaptive frequency rules.
 *
 * Rules:
 * - New case (< 7 days old): always scrape
 * - Active changes (last 7 days): always scrape
 * - Moderate stale (7-30 days no change): once per day
 * - High stale (30-90 days no change): every 3 days
 * - Very stale (90+ days no change): weekly
 */
function shouldScrapeNow(
  caseFileId: number,
  caseFile: any,
  snapshot: any | null
): boolean {
  // New case files are always scraped
  const createdAt = caseFile.get("createdAt") as Date;
  if (daysSince(createdAt) < ADAPTIVE_FREQUENCY.NEW_CASE_MAX_AGE_DAYS) {
    return true;
  }

  if (!snapshot) return true; // Never scraped before

  const lastChangedAt = snapshot.get("lastChangedAt") as Date | null;
  const lastScrapedAt = snapshot.get("lastScrapedAt") as Date;

  // If changes were detected recently, always scrape
  if (lastChangedAt && daysSince(lastChangedAt) < ADAPTIVE_FREQUENCY.ACTIVE_CHANGE_WINDOW_DAYS) {
    return true;
  }

  // Calculate days since last scrape to determine frequency
  const daysSinceLastScrape = daysSince(lastScrapedAt);
  const daysSinceLastChange = lastChangedAt ? daysSince(lastChangedAt) : 999;

  if (daysSinceLastChange > ADAPTIVE_FREQUENCY.HIGH_STALE_DAYS) {
    // Very stale: weekly
    return daysSinceLastScrape >= ADAPTIVE_FREQUENCY.VERY_STALE_SCRAPE_INTERVAL_DAYS;
  }

  if (daysSinceLastChange > ADAPTIVE_FREQUENCY.MODERATE_STALE_DAYS) {
    // High stale: every 3 days
    return daysSinceLastScrape >= ADAPTIVE_FREQUENCY.HIGH_STALE_SCRAPE_INTERVAL_DAYS;
  }

  // Moderate stale: daily
  return daysSinceLastScrape >= ADAPTIVE_FREQUENCY.MODERATE_STALE_SCRAPE_INTERVAL_DAYS;
}
