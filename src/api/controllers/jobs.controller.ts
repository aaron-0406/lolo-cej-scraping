/**
 * Jobs Controller
 *
 * Handles incoming API requests to trigger scraping jobs.
 * Called by lolo-backend when new case files are created
 * or when users request manual re-scrapes.
 */
import { Request, Response } from "express";
import { enqueueInitial, enqueuePriority } from "../../scheduler/batch-enqueuer";
import { logger } from "../../monitoring/logger";

/**
 * POST /api/scraping/v1/jobs/initial
 *
 * Trigger an initial scrape for a newly created case file.
 * Called by lolo-backend after a JUDICIAL_CASE_FILE is created.
 *
 * Body: { caseFileId, numberCaseFile, customerHasBankId }
 */
export async function triggerInitialScrape(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { caseFileId, numberCaseFile, customerHasBankId } = req.body;

    if (!caseFileId || !numberCaseFile || !customerHasBankId) {
      res.status(400).json({
        error: "Missing required fields: caseFileId, numberCaseFile, customerHasBankId",
      });
      return;
    }

    await enqueueInitial(caseFileId, numberCaseFile, customerHasBankId);

    res.status(202).json({
      message: "Initial scrape job enqueued",
      caseFileId,
      numberCaseFile,
    });
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Failed to trigger initial scrape"
    );
    res.status(500).json({ error: "Failed to enqueue initial scrape job" });
  }
}

/**
 * POST /api/scraping/v1/jobs/priority
 *
 * Trigger a priority re-scrape for an existing case file.
 * Called when a user manually requests a fresh scrape.
 *
 * Body: { caseFileId, numberCaseFile, customerHasBankId }
 */
export async function triggerPriorityScrape(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { caseFileId, numberCaseFile, customerHasBankId } = req.body;

    if (!caseFileId || !numberCaseFile || !customerHasBankId) {
      res.status(400).json({
        error: "Missing required fields: caseFileId, numberCaseFile, customerHasBankId",
      });
      return;
    }

    await enqueuePriority(caseFileId, numberCaseFile, customerHasBankId);

    res.status(202).json({
      message: "Priority scrape job enqueued",
      caseFileId,
      numberCaseFile,
    });
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Failed to trigger priority scrape"
    );
    res.status(500).json({ error: "Failed to enqueue priority scrape job" });
  }
}
