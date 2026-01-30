/**
 * Changelog Writer
 *
 * Writes detected changes to the SCRAPE_CHANGE_LOG table.
 * These records are later consumed by lolo-backend's notification
 * dispatch cron job to create user-facing messages.
 *
 * Each ChangeEntry becomes one row in SCRAPE_CHANGE_LOG.
 */
import { ChangeEntry, ChangeDetectionResult } from "../shared/types/change.types";
import { logger } from "../monitoring/logger";

// Model initialized after sequelize setup
let ScrapeChangeLog: any = null;

/**
 * Initialize the changelog writer with the Sequelize model.
 */
export function initChangelogWriter(model: any): void {
  ScrapeChangeLog = model;
}

/**
 * Write all detected changes for a case file to SCRAPE_CHANGE_LOG.
 *
 * @param caseFileId - FK to JUDICIAL_CASE_FILE
 * @param customerHasBankId - FK to CUSTOMER_HAS_BANK (for notification routing)
 * @param detectionResult - Output from change detector
 * @returns Number of changelog records created
 */
export async function writeChanges(
  caseFileId: number,
  customerHasBankId: number,
  detectionResult: ChangeDetectionResult
): Promise<number> {
  if (!ScrapeChangeLog) {
    logger.warn("ChangelogWriter not initialized — cannot write changes");
    return 0;
  }

  if (!detectionResult.hasChanges || detectionResult.changes.length === 0) {
    return 0;
  }

  const records = detectionResult.changes.map((change: ChangeEntry) => ({
    judicialCaseFileId: caseFileId,
    customerHasBankId,
    changeType: change.changeType,
    fieldName: change.fieldName || null,
    oldValue: change.oldValue || null,
    newValue: change.newValue || null,
    detectedAt: change.detectedAt,
    notified: false,
  }));

  await ScrapeChangeLog.bulkCreate(records);

  logger.info(
    {
      caseFileId,
      changeCount: records.length,
      changeTypes: [...new Set(records.map((r: any) => r.changeType))],
    },
    "Change log entries written"
  );

  return records.length;
}

/**
 * Mark change log entries as notified after they've been
 * included in a notification message.
 *
 * @param changeLogIds - Array of SCRAPE_CHANGE_LOG IDs to mark
 */
export async function markAsNotified(changeLogIds: number[]): Promise<void> {
  if (!ScrapeChangeLog || changeLogIds.length === 0) return;

  await ScrapeChangeLog.update(
    { notified: true },
    { where: { id: changeLogIds } }
  );

  logger.debug(
    { count: changeLogIds.length },
    "Change log entries marked as notified"
  );
}
