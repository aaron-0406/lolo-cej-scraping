/**
 * Worker Manager
 *
 * Creates and manages BullMQ Worker instances for all three queues.
 * Connects workers to the shared BrowserPool and CaptchaSolver.
 */
import { Worker, Job } from "bullmq";
import { QUEUE_NAMES } from "../config/constants";
import { BrowserPool } from "../scraping/browser/browser-pool";
import { CaptchaSolver } from "../scraping/captcha/captcha-solver";
import { NormalCaptchaStrategy } from "../scraping/captcha/strategies/normal-captcha.strategy";
import { HCaptchaStrategy } from "../scraping/captcha/strategies/hcaptcha.strategy";
import { AudioCaptchaStrategy } from "../scraping/captcha/strategies/audio-captcha.strategy";
import { CapSolverClient } from "../scraping/captcha/capsolver.client";
import { processScrapeJob } from "./scrape.worker";
import {
  initialWorkerOptions,
  monitorWorkerOptions,
  priorityWorkerOptions,
} from "./worker.config";
import config from "../config";
import { logger } from "../monitoring/logger";

let browserPool: BrowserPool | null = null;
let captchaSolver: CaptchaSolver | null = null;
const workers: Worker[] = [];

/**
 * Initialize the browser pool and CAPTCHA solver.
 */
async function initSharedResources(): Promise<void> {
  browserPool = new BrowserPool(config.browserPoolSize, config.maxPagesPerBrowser);
  const capSolverClient = new CapSolverClient();
  captchaSolver = new CaptchaSolver([
    new AudioCaptchaStrategy(),              // Try audio first (free, instant, reads code from #deleteSound)
    new NormalCaptchaStrategy(capSolverClient), // Fallback to CapSolver image solving
    new HCaptchaStrategy(capSolverClient),     // hCaptcha via CapSolver API
  ]);

  logger.info(
    { poolSize: config.browserPoolSize, maxPages: config.maxPagesPerBrowser },
    "Browser pool initialized"
  );
}

/**
 * Create a job processor function bound to shared resources.
 */
function createProcessor() {
  return async (job: Job) => {
    if (!browserPool || !captchaSolver) {
      throw new Error("Worker resources not initialized");
    }
    return processScrapeJob(job, browserPool, captchaSolver);
  };
}

/**
 * Start all BullMQ workers.
 * Creates one worker per queue, each with its own concurrency settings.
 */
export async function startWorkers(): Promise<void> {
  await initSharedResources();

  const processor = createProcessor();

  // Initial scrape worker
  const initialWorker = new Worker(
    QUEUE_NAMES.INITIAL,
    processor,
    initialWorkerOptions
  );
  setupWorkerEvents(initialWorker, "initial");
  workers.push(initialWorker);

  // Monitor scrape worker
  const monitorWorker = new Worker(
    QUEUE_NAMES.MONITOR,
    processor,
    monitorWorkerOptions
  );
  setupWorkerEvents(monitorWorker, "monitor");
  workers.push(monitorWorker);

  // Priority scrape worker
  const priorityWorker = new Worker(
    QUEUE_NAMES.PRIORITY,
    processor,
    priorityWorkerOptions
  );
  setupWorkerEvents(priorityWorker, "priority");
  workers.push(priorityWorker);

  logger.info(
    { workerCount: workers.length },
    "All workers started"
  );
}

/**
 * Set up event handlers for a worker.
 */
function setupWorkerEvents(worker: Worker, name: string): void {
  worker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, queue: name, caseFileId: job.data.caseFileId },
      "Job completed"
    );
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        queue: name,
        caseFileId: job?.data?.caseFileId,
        error: error.message,
        attemptsMade: job?.attemptsMade,
      },
      "Job failed"
    );
  });

  worker.on("error", (error) => {
    logger.error({ queue: name, error: error.message }, "Worker error");
  });
}

/**
 * Gracefully shut down all workers and the browser pool.
 */
export async function stopWorkers(): Promise<void> {
  logger.info("Stopping all workers...");

  for (const worker of workers) {
    await worker.close();
  }
  workers.length = 0;

  if (browserPool) {
    await browserPool.drain();
    browserPool = null;
  }

  logger.info("All workers stopped");
}

/**
 * Get the browser pool stats (for health checks).
 */
export function getBrowserPoolStats(): any {
  return browserPool?.getStats() || { total: 0, available: 0, inUse: 0 };
}
