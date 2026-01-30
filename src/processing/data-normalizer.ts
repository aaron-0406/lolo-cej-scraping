/**
 * Data Normalizer
 *
 * Transforms raw scraped data from CEJ DOM extraction into
 * normalized, consistent formats suitable for:
 * - Database storage (JUDICIAL_BINNACLE schema)
 * - Change detection (NormalizedBinnacleData for hashing)
 *
 * Handles: date format normalization, whitespace trimming,
 * numeric parsing, and null coalescing.
 */
import { RawBinnacleEntry, RawBinNotification } from "../shared/types/scrape-result.types";
import { NormalizedBinnacleData } from "../shared/types/change.types";
import { normalizeCEJDate } from "../shared/utils/date";

/**
 * Normalize a raw binnacle entry for change detection.
 * Produces a consistent representation for hashing.
 *
 * @param raw - Raw binnacle entry from DOM extraction
 * @returns Normalized data for hashing and comparison
 */
export function normalizeBinnacleForDetection(
  raw: RawBinnacleEntry
): NormalizedBinnacleData {
  return {
    index: raw.index,
    resolutionDate: normalizeCEJDate(raw.resolutionDate),
    entryDate: normalizeCEJDate(raw.entryDate),
    resolution: trimOrNull(raw.resolution),
    notificationType: trimOrNull(raw.notificationType),
    acto: trimOrNull(raw.acto),
    fojas: parseIntOrNull(raw.fojas),
    folios: parseIntOrNull(raw.folios),
    provedioDate: normalizeCEJDate(raw.proveido),
    sumilla: trimOrNull(raw.sumilla),
    userDescription: trimOrNull(raw.userDescription),
    notificationCount: raw.notifications?.length || 0,
  };
}

/**
 * Normalize all binnacle entries from a scrape result for change detection.
 *
 * @param rawEntries - Raw binnacle entries from DOM extraction
 * @returns Array of normalized data sorted by index
 */
export function normalizeAllBinnacles(
  rawEntries: RawBinnacleEntry[]
): NormalizedBinnacleData[] {
  return rawEntries
    .map(normalizeBinnacleForDetection)
    .sort((a, b) => a.index - b.index);
}

/**
 * Normalize a raw binnacle entry for database storage.
 * Returns fields matching the JUDICIAL_BINNACLE model schema.
 *
 * @param raw - Raw binnacle entry from DOM extraction
 * @param caseFileId - FK to JUDICIAL_CASE_FILE
 */
export function normalizeBinnacleForDB(
  raw: RawBinnacleEntry,
  caseFileId: number,
  customerHasBankId: number,
  binnacleTypes: { id: number; typeBinnacle: string }[],
  proceduralStageId: number
): Record<string, any> {
  // Determine binnacle type: RESOLUCION if resolutionDate exists, else ESCRITO
  const binnacleType = raw.resolutionDate
    ? binnacleTypes.find((bt) => bt.typeBinnacle === "RESOLUCION")
    : binnacleTypes.find((bt) => bt.typeBinnacle === "ESCRITO");

  return {
    index: raw.index,
    resolutionDate: normalizeCEJDate(raw.resolutionDate),
    entryDate: normalizeCEJDate(raw.entryDate),
    notificationType: trimOrNull(raw.notificationType),
    acto: trimOrNull(raw.acto),
    fojas: parseIntOrNull(raw.fojas),
    folios: parseIntOrNull(raw.folios),
    provedioDate: normalizeCEJDate(raw.proveido),
    sumilla: trimOrNull(raw.sumilla),
    userDescription: trimOrNull(raw.userDescription),
    lastPerformed: trimOrNull(raw.sumilla) ?? "",
    judicialFileCaseId: caseFileId,  // maps to judicial_file_case_id_judicial_file_case
    customerHasBankId,
    binnacleTypeId: binnacleType?.id,
    judicialBinProceduralStageId: proceduralStageId,
    date: new Date(),
    createdBy: "BOT",
    totalTariff: 0,
    tariffHistory: "[]",
  };
}

/**
 * Normalize a raw notification for database storage.
 * Returns fields matching the JUDICIAL_BIN_NOTIFICATION model schema.
 *
 * @param raw - Raw notification from DOM extraction
 * @param binnacleId - FK to JUDICIAL_BINNACLE
 */
export function normalizeNotificationForDB(
  raw: RawBinNotification,
  binnacleId: number
): Record<string, any> {
  return {
    notificationCode: trimOrNull(raw.notificationCode),
    addressee: trimOrNull(raw.addressee),
    shipDate: normalizeCEJDate(raw.shipDate),
    attachments: trimOrNull(raw.attachments),
    deliveryMethod: trimOrNull(raw.deliveryMethod),
    resolutionDate: normalizeCEJDate(raw.resolutionDate),
    notificationPrint: normalizeCEJDate(raw.notificationPrint),
    sentCentral: normalizeCEJDate(raw.sentCentral),
    centralReceipt: normalizeCEJDate(raw.centralReceipt),
    notificationToRecipientOn: normalizeCEJDate(raw.notificationToRecipientOn),
    chargeReturnedToCourtOn: normalizeCEJDate(raw.chargeReturnedToCourtOn),
    idJudicialBinacle: binnacleId,
  };
}

// --- Helpers ---

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseIntOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? null : parsed;
}
