/**
 * Scrape Result Types
 *
 * Shapes for data extracted from the CEJ website by workers.
 * These are "raw" types before normalization to backend schema.
 */

/**
 * A single notification record extracted from a binnacle entry on CEJ.
 * Maps to JUDICIAL_BIN_NOTIFICATION fields after normalization.
 */
export interface RawBinNotification {
  notificationCode: string | null;
  addressee: string | null;
  shipDate: string | null;
  attachments: string | null;
  deliveryMethod: string | null;
  resolutionDate: string | null;
  notificationPrint: string | null;
  sentCentral: string | null;
  centralReceipt: string | null;
  notificationToRecipientOn: string | null;
  chargeReturnedToCourtOn: string | null;
}

/**
 * A single binnacle entry extracted from CEJ.
 * Each entry represents one judicial action/resolution in the case timeline.
 * The index field is the position in the CEJ results table (0 = newest).
 */
export interface RawBinnacleEntry {
  /** Position index in the CEJ results list */
  index: number;
  /** Date of the resolution */
  resolutionDate: string | null;
  /** Date the entry was registered */
  entryDate: string | null;
  /** Resolution description text */
  resolution: string | null;
  /** Type of notification (e.g., "Decreto", "Auto", "Resolución") */
  notificationType: string | null;
  /** Judicial act description */
  acto: string | null;
  /** Number of fojas (pages) */
  fojas: string | null;
  /** Number of folios (sheets) */
  folios: string | null;
  /** Date of the proveído (judicial decree) */
  proveido: string | null;
  /** Summary text (sumilla) */
  sumilla: string | null;
  /** Description entered by court user */
  userDescription: string | null;
  /** Nested notification records for this binnacle entry */
  notifications: RawBinNotification[];
  /** URL to download attached document (if any) */
  urlDownload: string | null;
}

/**
 * Complete scraping result for a single case file.
 * Contains all binnacle entries extracted from CEJ.
 */
export interface ScrapeResult {
  /** The case file ID that was scraped */
  caseFileId: number;
  /** CHB ownership */
  customerHasBankId: number;
  /** Whether the scrape completed successfully */
  success: boolean;
  /** All binnacle entries found on CEJ */
  binnacles: RawBinnacleEntry[];
  /** Total count of binnacles found */
  binnacleCount: number;
  /** Timestamp when scraping started */
  scrapedAt: Date;
  /** Duration of the scrape in milliseconds */
  durationMs: number;
  /** Error message if scrape failed */
  error?: string;
  /** Classified error code if scrape failed */
  errorCode?: string;
}
