/**
 * Timezone-Aware Date Utilities
 *
 * All scheduling logic uses America/Lima timezone because
 * notification hours are configured relative to Peru time.
 */
import moment from "moment-timezone";

const TIMEZONE = "America/Lima";

/** Get current time in Lima timezone */
export function nowLima(): moment.Moment {
  return moment().tz(TIMEZONE);
}

/** Format a date for display (DD/MM/YYYY HH:mm) */
export function formatDateTime(date: Date | string): string {
  return moment(date).tz(TIMEZONE).format("DD/MM/YYYY HH:mm");
}

/** Format a date for ISO storage */
export function formatISO(date: Date | string): string {
  return moment(date).tz(TIMEZONE).toISOString();
}

/** Get hours until a target hour (e.g., "09:00") from now */
export function hoursUntil(targetHour: string): number {
  const now = nowLima();
  const target = moment.tz(targetHour, "HH:mm", TIMEZONE);

  // If target hour has already passed today, calculate for tomorrow
  if (target.isBefore(now)) {
    target.add(1, "day");
  }

  return target.diff(now, "hours", true);
}

/** Check if a date is today in Lima timezone */
export function isToday(date: Date | string): boolean {
  const d = moment(date).tz(TIMEZONE);
  const today = nowLima();
  return d.isSame(today, "day");
}

/** Get the start of today in Lima timezone */
export function startOfToday(): Date {
  return nowLima().startOf("day").toDate();
}

/** Calculate days since a given date */
export function daysSince(date: Date | string): number {
  return nowLima().diff(moment(date).tz(TIMEZONE), "days");
}

/** Get the nearest upcoming deadline from an array of "HH:mm" hour strings */
export function nearestDeadline(hours: string[]): Date {
  const now = nowLima();
  let nearest: moment.Moment | null = null;

  for (const h of hours) {
    const target = moment.tz(h, "HH:mm", TIMEZONE);
    if (target.isBefore(now)) {
      target.add(1, "day");
    }
    if (!nearest || target.isBefore(nearest)) {
      nearest = target;
    }
  }

  return (nearest || nowLima().endOf("day")).toDate();
}

/**
 * Normalize a date string from CEJ format to ISO.
 * CEJ uses DD/MM/YYYY format.
 */
export function normalizeCEJDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.trim() === "" || dateStr.trim() === "-") return null;

  const trimmed = dateStr.trim();

  // Try DD/MM/YYYY HH:mm:ss format (CEJ with time)
  const parsedWithTime = moment(trimmed, "DD/MM/YYYY HH:mm:ss", true);
  if (parsedWithTime.isValid()) {
    return parsedWithTime.format("YYYY-MM-DD HH:mm:ss");
  }

  // Try DD/MM/YYYY HH:mm format (CEJ with time, no seconds)
  const parsedWithShortTime = moment(trimmed, "DD/MM/YYYY HH:mm", true);
  if (parsedWithShortTime.isValid()) {
    return parsedWithShortTime.format("YYYY-MM-DD HH:mm:ss");
  }

  // Try DD/MM/YYYY format (CEJ standard date only)
  const parsed = moment(trimmed, "DD/MM/YYYY", true);
  if (parsed.isValid()) {
    return parsed.format("YYYY-MM-DD");
  }

  // Try YYYY-MM-DD (already ISO)
  const parsedISO = moment(trimmed, "YYYY-MM-DD", true);
  if (parsedISO.isValid()) {
    return parsedISO.format("YYYY-MM-DD");
  }

  return null;
}
