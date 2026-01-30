/**
 * Scheduler Service
 *
 * Top-level scheduler that runs on a node-cron interval.
 * Plans batches and enqueues them for processing.
 *
 * Default interval: every 10 minutes.
 */
import cron from "node-cron";
import { planNextBatch } from "./schedule-planner";
import { enqueueBatches } from "./batch-enqueuer";
import config from "../config";
import { logger } from "../monitoring/logger";

let isRunning = false;

/**
 * Start the scheduler cron job.
 * Runs every N minutes as configured by SCHEDULER_INTERVAL_MINUTES.
 */
export function startScheduler(): void {
  const intervalMinutes = config.schedulerIntervalMinutes;
  const cronExpression = `*/${intervalMinutes} * * * *`;

  logger.info(
    { intervalMinutes, cronExpression },
    "Starting scheduler"
  );

  cron.schedule(cronExpression, async () => {
    if (isRunning) {
      logger.warn("Scheduler cycle already in progress — skipping");
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("Scheduler cycle started");

      // Plan which case files to scrape
      const batches = await planNextBatch();

      if (batches.length === 0) {
        logger.info("No batches planned — nothing to scrape");
        return;
      }

      // Enqueue the planned batches
      const totalEnqueued = await enqueueBatches(batches);

      logger.info(
        {
          durationMs: Date.now() - startTime,
          batchCount: batches.length,
          totalEnqueued,
        },
        "Scheduler cycle completed"
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message, durationMs: Date.now() - startTime },
        "Scheduler cycle failed"
      );
    } finally {
      isRunning = false;
    }
  });
}

/**
 * Run a single scheduler cycle manually (for testing or on-demand).
 */
export async function runOnce(): Promise<number> {
  const batches = await planNextBatch();
  if (batches.length === 0) return 0;
  return enqueueBatches(batches);
}
