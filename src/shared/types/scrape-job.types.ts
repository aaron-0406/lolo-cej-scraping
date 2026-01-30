/**
 * Scrape Job Types
 *
 * Defines the payload shapes for BullMQ jobs across all three queues:
 * - scrape:initial  → triggered on case file creation
 * - scrape:monitor  → scheduled bulk monitoring
 * - scrape:priority → manual re-scrape requests
 */

/** Job types matching SCRAPE_JOB_LOG.jobType ENUM */
export type JobType = "INITIAL" | "MONITOR" | "PRIORITY";

/** Job status matching SCRAPE_JOB_LOG.status ENUM */
export type JobStatus = "STARTED" | "COMPLETED" | "FAILED" | "RETRYING";

/**
 * Base payload present in all scrape jobs.
 * Contains the minimum data a worker needs to scrape a case file.
 */
export interface BaseScrapeJobPayload {
  /** Primary key of JUDICIAL_CASE_FILE */
  caseFileId: number;
  /** FK to CUSTOMER_HAS_BANK — determines data ownership */
  customerHasBankId: number;
  /** Human-readable case number (e.g., "00123-2024") used to search CEJ */
  numberCaseFile: string;
  /** Job type for logging and behavior branching */
  jobType: JobType;
}

/**
 * Payload for initial scrape jobs.
 * Triggered when lolo-backend creates a new JUDICIAL_CASE_FILE
 * and calls POST /api/scraping/v1/jobs/initial.
 */
export interface InitialScrapeJobPayload extends BaseScrapeJobPayload {
  jobType: "INITIAL";
}

/**
 * Payload for monitoring scrape jobs.
 * Created by the SchedulePlanner in batches before notification deadlines.
 */
export interface MonitorScrapeJobPayload extends BaseScrapeJobPayload {
  jobType: "MONITOR";
  /** ISO timestamp of the notification deadline this job must complete before */
  deadline: string;
}

/**
 * Payload for priority/manual re-scrape jobs.
 * Triggered by admin or user requesting an immediate re-scrape.
 */
export interface PriorityScrapeJobPayload extends BaseScrapeJobPayload {
  jobType: "PRIORITY";
  /** Reason for the manual re-scrape */
  reason: string;
}

/** Union type for all scrape job payloads */
export type ScrapeJobPayload =
  | InitialScrapeJobPayload
  | MonitorScrapeJobPayload
  | PriorityScrapeJobPayload;

/**
 * Batch of case files grouped by CHB for scheduling.
 * The SchedulePlanner produces these and the BatchEnqueuer converts them to jobs.
 */
export interface ScrapeBatch {
  customerHasBankId: number;
  caseFileIds: number[];
  /** BullMQ priority (1 = highest) */
  priority: number;
  /** When the notification is due — used to calculate priority */
  deadline: Date;
}
