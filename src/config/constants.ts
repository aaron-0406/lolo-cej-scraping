/**
 * Application Constants
 *
 * Static values that don't change per environment.
 * Includes CEJ website selectors, queue names, priority levels,
 * adaptive frequency thresholds, and error codes.
 */

// --- Queue Names ---
// BullMQ queue identifiers. Each queue handles a different job type.
export const QUEUE_NAMES = {
  /** On-demand scraping triggered when a new case file is created */
  INITIAL: "scrape-initial",
  /** Scheduled monitoring cycle - bulk scraping before notification hour */
  MONITOR: "scrape-monitor",
  /** Manual re-scrape requests from users or admin */
  PRIORITY: "scrape-priority",
} as const;

// --- Job Priority Levels ---
// BullMQ processes lower numbers first.
export const PRIORITY = {
  CRITICAL: 1, // < 1 hour until deadline, initial scrapes, manual re-scrapes
  HIGH: 2, // < 3 hours until deadline
  MEDIUM: 3, // < 6 hours until deadline
  LOW: 5, // > 6 hours until deadline
} as const;

// --- Adaptive Scraping Frequency ---
// Controls how often a case file is scraped based on change history.
// Cases with no recent changes are scraped less frequently to save resources.
export const ADAPTIVE_FREQUENCY = {
  /** Case file created less than 7 days ago → scrape every cycle */
  NEW_CASE_MAX_AGE_DAYS: 7,
  /** Changes within this window → scrape every cycle */
  ACTIVE_CHANGE_WINDOW_DAYS: 7,
  /** No changes for 7-30 days → once per day */
  MODERATE_STALE_DAYS: 30,
  /** No changes for 30-90 days → every 3 days */
  HIGH_STALE_DAYS: 90,
  /** No changes for 90+ days → weekly */
  VERY_STALE_SCRAPE_INTERVAL_DAYS: 7,
  HIGH_STALE_SCRAPE_INTERVAL_DAYS: 3,
  MODERATE_STALE_SCRAPE_INTERVAL_DAYS: 1,
} as const;

// --- CEJ Website Configuration ---
export const CEJ = {
  BASE_URL: "https://cej.pj.gob.pe/cej/forms/busquedaform.html",
  /** Selectors used by Puppeteer to interact with the CEJ website */
  SELECTORS: {
    SEARCH_INPUT: "#cod_expediente",
    SEARCH_BUTTON: "#consultarExpedientes",
    CAPTCHA_IMAGE: "#captcha_image",
    CAPTCHA_INPUT: "#codigoCaptcha",
    CAPTCHA_AUDIO_BTN: "#btnRepro",
    CAPTCHA_ANTIBOT_FIELD: "#1zirobotz0",
    RESULTS_TABLE: "#gridRresultados",
    RESULTS_CONTAINER: "#divDetalles",
    RESULTS_ROW: ".divGLRE0",
    RESULTS_BUTTON: "#command > button",
    BINNACLE_PANEL: "#pnlSeguimiento",
    BINNACLE_PANEL_NUMBERED: "#pnlSeguimiento1",
    NO_RESULTS: "#mensajeNoExisteExpedientes",
    CAPTCHA_ERROR: "#codCaptchaError",
    NO_RESULTS_ALERT: ".alert-warning",
    ANTIBOT_REDIRECT: "/cej/forms/antibot",
    TAB_CODE_SEARCH: "#myTab > li:nth-child(2) > a",
  },
  /** Maximum wait time for page elements */
  WAIT_TIMEOUT_MS: 10000,
} as const;

// --- Error Codes ---
// Classified error types for SCRAPE_JOB_LOG entries and retry decisions.
export const ERROR_CODES = {
  CAPTCHA_FAILED: "CAPTCHA_FAILED",
  CEJ_UNREACHABLE: "CEJ_UNREACHABLE",
  BOT_DETECTED: "BOT_DETECTED",
  INVALID_CASE_NUMBER: "INVALID_CASE_NUMBER",
  BROWSER_CRASH: "BROWSER_CRASH",
  DB_CONNECTION_ERROR: "DB_CONNECTION_ERROR",
  S3_UPLOAD_FAILED: "S3_UPLOAD_FAILED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  OUT_OF_MEMORY: "OUT_OF_MEMORY",
  TIMEOUT: "TIMEOUT",
  UNKNOWN: "UNKNOWN",
} as const;

// --- Retry Configuration ---
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BACKOFF_TYPE: "exponential" as const,
  INITIAL_DELAY_MS: 30000, // 30 seconds
} as const;

// --- Change Detection ---
export const CHANGE_TYPES = {
  NEW_BINNACLE: "NEW_BINNACLE",
  MODIFIED_BINNACLE: "MODIFIED_BINNACLE",
  REMOVED_BINNACLE: "REMOVED_BINNACLE",
  NEW_NOTIFICATION: "NEW_NOTIFICATION",
  NEW_FILE: "NEW_FILE",
} as const;

// --- Notification Logic Keys ---
// Used to identify which scheduled notification config drives CEJ monitoring.
export const LOGIC_KEYS = {
  CEJ_MONITORING: "key-judicial-cej-monitoring",
} as const;
