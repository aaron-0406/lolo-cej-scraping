/**
 * Batch Enqueuer
 *
 * Takes planned batches from the SchedulePlanner and creates
 * BullMQ jobs for each case file. Handles deduplication to
 * avoid queuing the same case file twice in one cycle.
 */
import { PlannedBatch } from "./schedule-planner";
import {
  enqueueMonitorBatch,
  enqueueInitialScrape,
  enqueuePriorityScrape,
} from "../queue/queue.producer";
import { logger } from "../monitoring/logger";

/**
 * Enqueue all planned batches as BullMQ monitor jobs.
 *
 * @param batches - Planned batches from schedule planner
 * @returns Total number of jobs enqueued
 */
export async function enqueueBatches(
  batches: PlannedBatch[]
): Promise<number> {
  let totalEnqueued = 0;

  for (const batch of batches) {
    const jobPayloads = batch.caseFiles.map((cf) => ({
      caseFileId: cf.caseFileId,
      numberCaseFile: cf.numberCaseFile,
      customerHasBankId: cf.customerHasBankId,
    }));

    const enqueued = await enqueueMonitorBatch(jobPayloads, batch.priority, batch.deadline);
    totalEnqueued += enqueued.length;
  }

  logger.info(
    { totalEnqueued, batchCount: batches.length },
    "Batches enqueued"
  );

  return totalEnqueued;
}

/**
 * Enqueue a single initial scrape job (triggered when a new case file is created).
 *
 * @param caseFileId - The newly created case file ID
 * @param numberCaseFile - The case file number
 * @param customerHasBankId - The CHB ID
 */
export async function enqueueInitial(
  caseFileId: number,
  numberCaseFile: string,
  customerHasBankId: number
): Promise<void> {
  await enqueueInitialScrape({
    caseFileId,
    numberCaseFile,
    customerHasBankId,
    jobType: "INITIAL",
  });

  logger.info(
    { caseFileId, numberCaseFile },
    "Initial scrape job enqueued"
  );
}

/**
 * Enqueue a priority re-scrape job (triggered manually by user).
 *
 * @param caseFileId - The case file ID to re-scrape
 * @param numberCaseFile - The case file number
 * @param customerHasBankId - The CHB ID
 */
export async function enqueuePriority(
  caseFileId: number,
  numberCaseFile: string,
  customerHasBankId: number
): Promise<void> {
  await enqueuePriorityScrape({
    caseFileId,
    numberCaseFile,
    customerHasBankId,
    jobType: "PRIORITY",
    reason: "Manual re-scrape request",
  });

  logger.info(
    { caseFileId, numberCaseFile },
    "Priority scrape job enqueued"
  );
}
