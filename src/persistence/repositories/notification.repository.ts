/**
 * Notification Repository
 *
 * CRUD operations for JUDICIAL_BIN_NOTIFICATION records.
 * Creates notification records linked to binnacle entries.
 */
import { JudicialBinNotification } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find all notifications for a binnacle entry.
 */
export async function findByBinnacleId(binnacleId: number): Promise<any[]> {
  return JudicialBinNotification.findAll({
    where: { idJudicialBinacle: binnacleId },
    paranoid: false,
  });
}

/**
 * Create a new notification record.
 *
 * @param data - Normalized notification fields
 * @returns Created notification record
 */
export async function create(data: Record<string, any>): Promise<any> {
  const notification = await JudicialBinNotification.create(data);
  logger.debug(
    { id: notification.get("id"), binnacleId: data.idJudicialBinacle },
    "Notification created"
  );
  return notification;
}

/**
 * Bulk create notifications for a binnacle entry.
 *
 * @param binnacleId - FK to JUDICIAL_BINNACLE
 * @param notifications - Array of normalized notification data
 * @returns Number of notifications created
 */
export async function bulkCreateForBinnacle(
  binnacleId: number,
  notifications: Record<string, any>[]
): Promise<number> {
  if (notifications.length === 0) return 0;

  const records = notifications.map((n) => ({
    ...n,
    idJudicialBinacle: binnacleId,
  }));

  await JudicialBinNotification.bulkCreate(records);

  logger.debug(
    { binnacleId, count: records.length },
    "Notifications bulk created"
  );

  return records.length;
}
