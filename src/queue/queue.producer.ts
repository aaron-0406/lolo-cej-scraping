/**
 * Queue Producer
 *
 * Provides methods to enqueue scrape jobs onto the BullMQ queues.
 * Used by:
 * - API controllers (initial + priority jobs)
 * - SchedulePlanner (monitor batch jobs)
 *
 * Job IDs follow the pattern: {type}-{caseFileId}-{YYYYMMDD}
 * This ensures deduplication — the same case file won't be queued
 * twice on the same day.
 */
import { initialQueue, monitorQueue, priorityQueue } from "./queue.config";
import { PRIORITY } from "../config/constants";
import {
  InitialScrapeJobPayload,
  MonitorScrapeJobPayload,
  PriorityScrapeJobPayload,
} from "../shared/types/scrape-job.types";
import { logger } from "../monitoring/logger";
import { nowLima } from "../shared/utils/date";

/**
 * Enqueue an initial scrape job (high priority).
 * Called when lolo-backend creates a new JUDICIAL_CASE_FILE.
 */
export async function enqueueInitialScrape(
  payload: InitialScrapeJobPayload
): Promise<string> {
  const jobId = `initial-${payload.caseFileId}-${nowLima().format("YYYYMMDD")}`;

  await initialQueue.add(jobId, payload, {
    priority: PRIORITY.CRITICAL,
    jobId, // Deduplication: same ID won't be added twice
  });

  logger.info(
    { jobId, caseFileId: payload.caseFileId, queue: "scrape:initial" },
    "Initial scrape job enqueued"
  );

  return jobId;
}

/**
 * Enqueue a batch of monitor scrape jobs.
 * Called by the SchedulePlanner every 10 minutes.
 */
export async function enqueueMonitorBatch(
  caseFiles: Array<{
    caseFileId: number;
    customerHasBankId: number;
    numberCaseFile: string;
  }>,
  priority: number,
  deadline: Date
): Promise<string[]> {
  const jobIds: string[] = [];
  const dateStr = nowLima().format("YYYYMMDD");

  for (const cf of caseFiles) {
    const jobId = `monitor-${cf.caseFileId}-${dateStr}`;

    const payload: MonitorScrapeJobPayload = {
      caseFileId: cf.caseFileId,
      customerHasBankId: cf.customerHasBankId,
      numberCaseFile: cf.numberCaseFile,
      jobType: "MONITOR",
      deadline: deadline.toISOString(),
    };

    await monitorQueue.add(jobId, payload, {
      priority,
      jobId, // Deduplication
    });

    jobIds.push(jobId);
  }

  logger.info(
    { count: jobIds.length, priority, queue: "scrape:monitor" },
    "Monitor batch enqueued"
  );

  return jobIds;
}

/**
 * Enqueue a priority re-scrape job.
 * Called when a user or admin manually requests a re-scrape.
 */
export async function enqueuePriorityScrape(
  payload: PriorityScrapeJobPayload
): Promise<string> {
  const jobId = `priority-${payload.caseFileId}-${Date.now()}`;

  await priorityQueue.add(jobId, payload, {
    priority: PRIORITY.CRITICAL,
    jobId,
  });

  logger.info(
    { jobId, caseFileId: payload.caseFileId, reason: payload.reason, queue: "scrape:priority" },
    "Priority scrape job enqueued"
  );

  return jobId;
}
