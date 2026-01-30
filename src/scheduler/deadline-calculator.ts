/**
 * Deadline Calculator
 *
 * Calculates job priority based on how close the notification
 * deadline (hourTimeToNotify) is. Jobs closer to their deadline
 * get higher priority in the BullMQ queue.
 *
 * Priority levels (BullMQ processes lower numbers first):
 *   CRITICAL (1) — < 1 hour until deadline
 *   HIGH (2)     — < 3 hours until deadline
 *   MEDIUM (3)   — < 6 hours until deadline
 *   LOW (5)      — > 6 hours or no deadline
 */
import { PRIORITY } from "../config/constants";
import { hoursUntil } from "../shared/utils/date";

/**
 * Calculate BullMQ priority for a scraping job based on
 * hours remaining until the notification deadline.
 *
 * @param notificationHour - The configured notification hour (HH:mm format)
 * @returns BullMQ priority number (lower = higher priority)
 */
export function calculatePriority(notificationHour: string | null): number {
  if (!notificationHour) return PRIORITY.LOW;

  const hours = hoursUntil(notificationHour);

  if (hours < 1) return PRIORITY.CRITICAL;
  if (hours < 3) return PRIORITY.HIGH;
  if (hours < 6) return PRIORITY.MEDIUM;

  return PRIORITY.LOW;
}

/**
 * Calculate BullMQ priority based on the nearest upcoming hour
 * from an array of notification hours.
 *
 * @param hours - Array of "HH:mm" strings
 * @returns BullMQ priority number (lower = higher priority)
 */
export function calculatePriorityFromMultipleHours(hours: string[]): number {
  if (!hours || hours.length === 0) return PRIORITY.LOW;

  const minHours = Math.min(...hours.map((h) => hoursUntil(h)));

  if (minHours < 1) return PRIORITY.CRITICAL;
  if (minHours < 3) return PRIORITY.HIGH;
  if (minHours < 6) return PRIORITY.MEDIUM;

  return PRIORITY.LOW;
}

/**
 * Calculate priority for an initial (on-demand) scrape.
 * Initial scrapes always get CRITICAL priority since they're
 * triggered when a new case file is created and the user
 * expects immediate results.
 */
export function calculateInitialPriority(): number {
  return PRIORITY.CRITICAL;
}

/**
 * Calculate priority for a manual re-scrape request.
 * Manual re-scrapes get HIGH priority since a user explicitly requested it.
 */
export function calculateManualPriority(): number {
  return PRIORITY.HIGH;
}
