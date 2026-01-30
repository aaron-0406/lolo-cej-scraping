/**
 * Scrape Worker
 *
 * The core worker that processes individual scraping jobs.
 * Each job represents one case file to scrape from CEJ.
 *
 * Flow per job:
 * 1. Log job start
 * 2. Acquire browser page from pool
 * 3. Navigate to CEJ and solve CAPTCHA
 * 4. Extract binnacle, notification, and file data
 * 5. Normalize and validate data
 * 6. Detect changes against previous snapshot
 * 7. Persist binnacles, notifications, files to DB
 * 8. Upload files to S3
 * 9. Save snapshot and changelog
 * 10. Update case file status
 * 11. Log job completion
 */
import { Job } from "bullmq";
import { BrowserPool } from "../scraping/browser/browser-pool";
import { PageContext } from "../scraping/browser/page-context";
import { CaptchaSolver } from "../scraping/captcha/captcha-solver";
import { submitCaseFileSearch } from "../scraping/navigators/form-submitter";
import { extractBinnacles } from "../scraping/extractors/binnacle.extractor";
import { extractNotifications } from "../scraping/extractors/notification.extractor";
import { extractFileInfo } from "../scraping/extractors/file.extractor";
import { downloadFile, cleanupDownload } from "../scraping/downloaders/file-downloader";
import { normalizeAllBinnacles, normalizeBinnacleForDB, normalizeNotificationForDB } from "../processing/data-normalizer";
import { validateBinnacleEntries } from "../processing/data-validator";
import { detectChanges } from "../processing/change-detector";
import * as snapshotRepo from "../persistence/repositories/snapshot.repository";
import * as binnacleRepo from "../persistence/repositories/binnacle.repository";
import * as notificationRepo from "../persistence/repositories/notification.repository";
import * as fileRepo from "../persistence/repositories/file.repository";
import * as casefileRepo from "../persistence/repositories/casefile.repository";
import * as jobLogRepo from "../persistence/repositories/joblog.repository";
import * as changelogRepo from "../persistence/repositories/changelog.repository";
import * as s3Client from "../persistence/s3/s3.client";
import { ScrapeResult, RawBinnacleEntry } from "../shared/types/scrape-result.types";
import { ScrapeError } from "../shared/errors/scrape.errors";
import { ERROR_CODES } from "../config/constants";
import { metrics } from "../monitoring/metrics.collector";
import { logger } from "../monitoring/logger";
import { JudicialCaseFile, Client, JudicialBinTypeBinnacle, JudicialBinProceduralStage } from "../persistence/db/models";

/**
 * Process a single scraping job.
 *
 * @param job - BullMQ job containing scrape payload
 * @param browserPool - Shared browser pool
 * @param captchaSolver - CAPTCHA solver instance
 */
export async function processScrapeJob(
  job: Job,
  browserPool: BrowserPool,
  captchaSolver: CaptchaSolver
): Promise<ScrapeResult> {
  const { caseFileId, numberCaseFile, customerHasBankId } = job.data;
  const jobType = job.queueName.includes("initial")
    ? "INITIAL"
    : job.queueName.includes("priority")
      ? "PRIORITY"
      : "MONITOR";
  const startTime = Date.now();
  const workerId = `worker-${process.pid}`;

  // Log job start
  const jobLog = await jobLogRepo.logStart({
    caseFileId,
    customerHasBankId,
    jobType: jobType as any,
    attempt: job.attemptsMade + 1,
    workerId,
  });
  const jobLogId = jobLog.get("id") as number;

  const pageContext = new PageContext(browserPool);

  try {
    logger.info(
      { caseFileId, numberCaseFile, jobType, attempt: job.attemptsMade + 1 },
      "Processing scrape job"
    );

    // Acquire page from browser pool
    const page = await pageContext.open();

    // Look up client name for the "parte" field (required by CEJ data protection)
    let clientName: string | undefined;
    try {
      const caseFile = await JudicialCaseFile.findByPk(caseFileId, {
        include: [{ model: Client, as: "client", attributes: ["name"] }],
      });
      clientName = (caseFile as any)?.client?.name || undefined;
      if (clientName) {
        logger.debug({ caseFileId, clientName }, "Client name resolved for CEJ parte field");
      }
    } catch (err) {
      logger.warn({ caseFileId, error: (err as Error).message }, "Failed to resolve client name");
    }

    // Navigate and solve CAPTCHA
    const formResult = await submitCaseFileSearch(page, numberCaseFile, captchaSolver, clientName);
    if (!formResult.success) {
      throw new ScrapeError(
        `Form submission failed for ${numberCaseFile}`,
        ERROR_CODES.CAPTCHA_FAILED,
        true
      );
    }

    // Extract binnacle data
    const rawBinnacles = await extractBinnacles(page);

    // Extract notifications for each binnacle (pass the 1-based panel index)
    for (let i = 0; i < rawBinnacles.length; i++) {
      rawBinnacles[i].notifications = await extractNotifications(page, rawBinnacles[i].index);
    }

    // Validate entries
    const validBinnacles = validateBinnacleEntries(rawBinnacles);

    // Detect changes
    const previousSnapshot = await snapshotRepo.findLatestByCaseFileId(caseFileId);
    const previousHash = previousSnapshot?.get("contentHash") as string || "";
    const previousData = previousSnapshot?.get("rawData") as any || null;

    const detectionResult = detectChanges(
      validBinnacles,
      previousData ? JSON.parse(typeof previousData === "string" ? previousData : JSON.stringify(previousData)) : null,
      previousHash
    );

    // Fetch lookup data for binnacle creation
    const binnacleTypes = await JudicialBinTypeBinnacle.findAll({
      where: { customerHasBankId },
    });
    const binnacleTypesData = binnacleTypes.map((bt: any) => ({
      id: bt.get("id") as number,
      typeBinnacle: bt.get("typeBinnacle") as string,
    }));

    const proceduralStages = await JudicialBinProceduralStage.findAll({
      where: { customerHasBankId },
      limit: 1,
    });
    const proceduralStageId = proceduralStages.length > 0
      ? (proceduralStages[0].get("id") as number)
      : 1;

    // Persist binnacles to database
    const normalizedForDB = validBinnacles.map((b) =>
      normalizeBinnacleForDB(b, caseFileId, customerHasBankId, binnacleTypesData, proceduralStageId)
    );
    const upsertResult = await binnacleRepo.upsertBinnacles(caseFileId, normalizedForDB);

    // Persist notifications
    const existingBinnacles = await binnacleRepo.findByCaseFileId(caseFileId);
    for (const rawBin of validBinnacles) {
      const dbBinnacle = existingBinnacles.find(
        (b: any) => b.get("index") === rawBin.index
      );
      if (dbBinnacle && rawBin.notifications.length > 0) {
        const binnacleId = dbBinnacle.get("id") as number;
        const normalizedNotifs = rawBin.notifications.map((n) =>
          normalizeNotificationForDB(n, binnacleId)
        );
        await notificationRepo.bulkCreateForBinnacle(binnacleId, normalizedNotifs);
      }
    }

    // Handle file downloads and uploads
    for (const rawBin of validBinnacles) {
      if (rawBin.urlDownload) {
        const dbBinnacle = existingBinnacles.find(
          (b: any) => b.get("index") === rawBin.index
        );
        if (!dbBinnacle) continue;

        const binnacleId = dbBinnacle.get("id") as number;
        const fileInfo = await extractFileInfo(page, rawBin.urlDownload);
        if (fileInfo) {
          const exists = await fileRepo.existsForBinnacle(
            binnacleId,
            fileInfo.originalName || "document"
          );
          if (!exists) {
            const downloaded = await downloadFile(page, fileInfo);
            if (downloaded) {
              const s3Key = await s3Client.uploadFile(
                downloaded.localPath,
                customerHasBankId,
                downloaded.originalName
              );
              await fileRepo.create({
                judicialBinnacleId: binnacleId,
                size: downloaded.size,
                nameOriginAws: s3Key,
                originalName: downloaded.originalName,
                customerHasBankId,
              });
              cleanupDownload(downloaded.localPath);
            }
          }
        }
      }
    }

    // Save snapshot
    const normalizedForHash = normalizeAllBinnacles(validBinnacles);
    await snapshotRepo.upsert({
      caseFileId,
      contentHash: detectionResult.newHash,
      binnacleCount: validBinnacles.length,
      rawData: JSON.stringify(normalizedForHash),
      lastScrapedAt: new Date(),
      lastChangedAt: detectionResult.hasChanges ? new Date() : undefined,
      consecutiveNoChange: detectionResult.hasChanges ? 0 : undefined,
    });

    if (!detectionResult.hasChanges && !detectionResult.isFirstScrape) {
      await snapshotRepo.incrementNoChange(caseFileId);
    }

    // Write changelog
    if (detectionResult.hasChanges && !detectionResult.isFirstScrape) {
      const changeRecords = detectionResult.changes.map((c) => ({
        caseFileId,
        customerHasBankId,
        changeType: c.changeType,
        fieldName: c.fieldName || null,
        oldValue: c.oldValue || null,
        newValue: c.newValue || null,
        detectedAt: c.detectedAt,
        notified: false,
      }));
      await changelogRepo.bulkCreate(changeRecords);
    }

    // Update case file
    await casefileRepo.markScraped(caseFileId, detectionResult.hasChanges);

    const durationMs = Date.now() - startTime;

    // Log completion
    await jobLogRepo.logComplete(jobLogId, {
      durationMs,
      binnaclesFound: validBinnacles.length,
      changesDetected: detectionResult.changes.length,
    });

    // Metrics
    metrics.increment("scrape_jobs_total", { status: "success", jobType });
    metrics.recordDuration(durationMs / 1000);
    if (detectionResult.hasChanges) {
      metrics.increment("changes_detected_total", {
        count: String(detectionResult.changes.length),
      });
    }

    const result: ScrapeResult = {
      caseFileId,
      customerHasBankId,
      success: true,
      binnacles: validBinnacles,
      binnacleCount: validBinnacles.length,
      scrapedAt: new Date(),
      durationMs,
    };

    logger.info(
      {
        caseFileId,
        numberCaseFile,
        durationMs,
        binnacleCount: validBinnacles.length,
        changesDetected: detectionResult.changes.length,
        isFirstScrape: detectionResult.isFirstScrape,
      },
      "Scrape job completed"
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const scrapeError = error instanceof ScrapeError ? error : null;
    const errorCode = scrapeError?.code || ERROR_CODES.UNKNOWN;
    const errorMessage = (error as Error).message;
    const willRetry = scrapeError?.retryable !== false && job.attemptsMade < 2;

    await jobLogRepo.logFailure(jobLogId, {
      durationMs,
      errorMessage,
      errorCode,
      willRetry,
    });

    await snapshotRepo.recordError(caseFileId, errorMessage);

    metrics.increment("scrape_jobs_total", { status: "error", jobType });

    logger.error(
      { caseFileId, numberCaseFile, errorCode, errorMessage, durationMs, willRetry },
      "Scrape job failed"
    );

    throw error;
  } finally {
    await pageContext.close();
  }
}
