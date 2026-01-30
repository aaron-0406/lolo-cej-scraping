/**
 * Worker Configuration
 *
 * BullMQ Worker settings for each queue type.
 * Controls concurrency, rate limiting, and connection options.
 */
import { WorkerOptions } from "bullmq";
import { redisConnection } from "../queue/queue.config";
import config from "../config";

/**
 * Base worker options shared across all queues.
 */
const baseWorkerOptions: Partial<WorkerOptions> = {
  connection: redisConnection,
  autorun: true,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * Worker options for the initial scrape queue.
 * Higher concurrency since these are on-demand and time-sensitive.
 */
export const initialWorkerOptions: WorkerOptions = {
  ...baseWorkerOptions,
  concurrency: Math.max(1, Math.floor(config.workerConcurrency / 2)),
} as WorkerOptions;

/**
 * Worker options for the monitor scrape queue.
 * Standard concurrency with rate limiting to avoid overloading CEJ.
 */
export const monitorWorkerOptions: WorkerOptions = {
  ...baseWorkerOptions,
  concurrency: config.workerConcurrency,
  limiter: {
    max: config.rateLimitMax,
    duration: config.rateLimitDurationMs,
  },
} as WorkerOptions;

/**
 * Worker options for the priority scrape queue.
 * Lower concurrency — these are manual re-scrapes, not bulk.
 */
export const priorityWorkerOptions: WorkerOptions = {
  ...baseWorkerOptions,
  concurrency: Math.max(1, Math.floor(config.workerConcurrency / 3)),
} as WorkerOptions;
