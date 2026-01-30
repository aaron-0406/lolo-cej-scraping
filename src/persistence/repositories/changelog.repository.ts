/**
 * ChangeLog Repository
 *
 * CRUD operations for SCRAPE_CHANGE_LOG records.
 * Provides queries needed by the notification dispatch system.
 */
import { Op } from "sequelize";
import { ScrapeChangeLog } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find unnotified changes for a set of case files.
 * Used by the notification dispatch cron to collect pending notifications.
 *
 * @param caseFileIds - Array of case file IDs to check
 * @returns Unnotified change log entries grouped by case file
 */
export async function findUnnotifiedByCaseFiles(
  caseFileIds: number[]
): Promise<any[]> {
  return ScrapeChangeLog.findAll({
    where: {
      caseFileId: { [Op.in]: caseFileIds },
      notified: false,
    },
    order: [["detectedAt", "ASC"]],
  });
}

/**
 * Find unnotified changes for a specific CHB (customer has bank).
 * Used by the notification dispatch to scope changes per subscription.
 *
 * @param customerHasBankId - FK to CUSTOMER_HAS_BANK
 * @returns Unnotified change log entries
 */
export async function findUnnotifiedByChb(
  customerHasBankId: number
): Promise<any[]> {
  return ScrapeChangeLog.findAll({
    where: {
      customerHasBankId,
      notified: false,
    },
    order: [["detectedAt", "ASC"]],
  });
}

/**
 * Mark change log entries as notified.
 *
 * @param ids - Change log IDs to mark
 */
export async function markNotified(ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  await ScrapeChangeLog.update(
    { notified: true, notifiedAt: new Date() },
    { where: { id: { [Op.in]: ids } } }
  );

  logger.debug({ count: ids.length }, "Change logs marked as notified");
}

/**
 * Count unnotified changes for a case file.
 */
export async function countUnnotified(caseFileId: number): Promise<number> {
  return ScrapeChangeLog.count({
    where: { caseFileId, notified: false },
  });
}

/**
 * Bulk create change log entries.
 *
 * @param entries - Array of change log data
 * @returns Created records
 */
export async function bulkCreate(
  entries: Record<string, any>[]
): Promise<any[]> {
  return ScrapeChangeLog.bulkCreate(entries);
}
