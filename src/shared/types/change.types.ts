/**
 * Change Detection Types
 *
 * Used by the ChangeDetector and ChangeLogWriter to represent
 * differences between scraping snapshots.
 */

/** Change types matching SCRAPE_CHANGE_LOG.changeType ENUM */
export type ChangeType =
  | "NEW_BINNACLE"
  | "MODIFIED_BINNACLE"
  | "REMOVED_BINNACLE"
  | "NEW_NOTIFICATION"
  | "NEW_FILE";

/**
 * A single detected change in a case file's binnacle data.
 * One scrape can produce multiple ChangeEntry records.
 */
export interface ChangeEntry {
  /** What kind of change was detected */
  changeType: ChangeType;
  /** FK to JUDICIAL_BINNACLE if applicable */
  binnacleId?: number;
  /** Which field changed (for MODIFIED_BINNACLE) */
  fieldName?: string;
  /** Previous value of the field */
  oldValue?: string;
  /** New value of the field */
  newValue?: string;
  /** When the change was detected (ISO timestamp) */
  detectedAt: Date;
}

/**
 * Result of the change detection process for a single case file.
 * Produced by ChangeDetector.detect() after comparing new data against snapshot.
 */
export interface ChangeDetectionResult {
  /** True if this is the first scrape (no previous snapshot exists) */
  isFirstScrape: boolean;
  /** True if any changes were found */
  hasChanges: boolean;
  /** List of individual changes detected */
  changes: ChangeEntry[];
  /** New content hash (SHA-256) of the normalized data */
  newHash: string;
  /** Previous content hash (empty string if first scrape) */
  oldHash: string;
  /** Number of binnacles in the new scrape */
  newBinnacleCount: number;
}

/**
 * Normalized binnacle data used for hashing and comparison.
 * Fields are trimmed, dates normalized, and sorted consistently.
 */
export interface NormalizedBinnacleData {
  index: number;
  resolutionDate: string | null;
  entryDate: string | null;
  resolution: string | null;
  notificationType: string | null;
  acto: string | null;
  fojas: number | null;
  folios: number | null;
  provedioDate: string | null;
  sumilla: string | null;
  userDescription: string | null;
  notificationCount: number;
}
