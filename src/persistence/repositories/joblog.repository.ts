/**
 * Job Log Repository
 *
 * CRUD operations for SCRAPE_JOB_LOG records.
 * Tracks execution history for each scraping job.
 */
import { Op } from "sequelize";
import { ScrapeJobLog } from "../db/models";
import { logger } from "../../monitoring/logger";

export type JobStatus = "STARTED" | "COMPLETED" | "FAILED" | "RETRYING";
export type JobType = "INITIAL" | "MONITOR" | "PRIORITY";

/**
 * Log the start of a scraping job.
 *
 * @param data - Job metadata
 * @returns Created job log record
 */
export async function logStart(data: {
  caseFileId: number;
  customerHasBankId: number;
  jobType: JobType;
  attempt: number;
  workerId?: string;
}): Promise<any> {
  return ScrapeJobLog.create({
    caseFileId: data.caseFileId,
    customerHasBankId: data.customerHasBankId,
    jobType: data.jobType,
    status: "STARTED",
    attempt: data.attempt,
    workerId: data.workerId || null,
    startedAt: new Date(),
  });
}

/**
 * Log the completion of a scraping job.
 *
 * @param jobLogId - ID of the job log record to update
 * @param result - Completion data
 */
export async function logComplete(
  jobLogId: number,
  result: {
    durationMs: number;
    binnaclesFound: number;
    changesDetected: number;
  }
): Promise<void> {
  await ScrapeJobLog.update(
    {
      status: "COMPLETED",
      durationMs: result.durationMs,
      binnaclesFound: result.binnaclesFound,
      changesDetected: result.changesDetected,
      completedAt: new Date(),
    },
    { where: { id: jobLogId } }
  );
}

/**
 * Log a failed scraping job.
 *
 * @param jobLogId - ID of the job log record to update
 * @param error - Error details
 */
export async function logFailure(
  jobLogId: number,
  error: {
    durationMs: number;
    errorMessage: string;
    errorCode: string;
    willRetry: boolean;
  }
): Promise<void> {
  await ScrapeJobLog.update(
    {
      status: error.willRetry ? "RETRYING" : "FAILED",
      durationMs: error.durationMs,
      errorMessage: error.errorMessage,
      errorCode: error.errorCode,
      completedAt: new Date(),
    },
    { where: { id: jobLogId } }
  );
}

/**
 * Get job execution statistics for a time period.
 *
 * @param since - Start date for the statistics window
 * @returns Aggregated stats
 */
export async function getStats(since: Date): Promise<{
  total: number;
  completed: number;
  failed: number;
  retrying: number;
  avgDurationMs: number;
}> {
  const jobs = await ScrapeJobLog.findAll({
    where: { startedAt: { [Op.gte]: since } },
    attributes: ["status", "durationMs"],
  });

  const total = jobs.length;
  const completed = jobs.filter((j: any) => j.get("status") === "COMPLETED").length;
  const failed = jobs.filter((j: any) => j.get("status") === "FAILED").length;
  const retrying = jobs.filter((j: any) => j.get("status") === "RETRYING").length;

  const durations = jobs
    .filter((j: any) => j.get("durationMs") != null)
    .map((j: any) => j.get("durationMs") as number);
  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
      : 0;

  return { total, completed, failed, retrying, avgDurationMs };
}
