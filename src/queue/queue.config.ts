/**
 * BullMQ Queue Configuration
 *
 * Defines the three scraping queues and their default job options.
 * All queues share the same Redis connection.
 *
 * Queue architecture:
 * - scrape:initial  → High priority, triggered on case file creation
 * - scrape:monitor  → Scheduled bulk monitoring before notification deadlines
 * - scrape:priority → Manual re-scrape requests from users/admin
 *
 * Rate limiting is centralized in Redis — all workers across all
 * machines share the same rate limit, preventing CEJ from being overwhelmed.
 */
import { Queue, QueueOptions } from "bullmq";
import IORedis from "ioredis";
import config from "../config";
import { QUEUE_NAMES, RETRY_CONFIG } from "../config/constants";
import { logger } from "../monitoring/logger";

/**
 * Shared Redis connection for all queues.
 * Using IORedis with maxRetriesPerRequest: null as required by BullMQ.
 */
export const redisConnection = new IORedis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on("connect", () => {
  logger.info({ host: config.redisHost, port: config.redisPort }, "Redis connected");
});

redisConnection.on("error", (err) => {
  logger.error({ error: err.message }, "Redis connection error");
});

/** Shared queue options */
const baseQueueOptions: Partial<QueueOptions> = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RETRY_CONFIG.MAX_ATTEMPTS,
    backoff: {
      type: RETRY_CONFIG.BACKOFF_TYPE,
      delay: RETRY_CONFIG.INITIAL_DELAY_MS,
    },
    removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
    removeOnFail: false, // Keep all failed jobs for analysis
  },
};

// --- Queue Instances ---

/** Shared rate limiter — all queues hit the same CEJ website */
const sharedLimiter = {
  max: config.rateLimitMax,
  duration: config.rateLimitDurationMs,
};

/** Initial scrape queue — triggered when a new case file is created */
export const initialQueue = new Queue(QUEUE_NAMES.INITIAL, {
  ...baseQueueOptions,
  limiter: sharedLimiter,
} as QueueOptions);

/**
 * Monitor queue — bulk scheduled scraping before notification deadlines.
 * Rate-limited to prevent overwhelming the CEJ website.
 */
export const monitorQueue = new Queue(QUEUE_NAMES.MONITOR, {
  ...baseQueueOptions,
  limiter: sharedLimiter,
} as QueueOptions);

/** Priority queue — manual re-scrape requests, always high priority */
export const priorityQueue = new Queue(QUEUE_NAMES.PRIORITY, {
  ...baseQueueOptions,
  limiter: sharedLimiter,
} as QueueOptions);

/** Map of queue name to queue instance for programmatic access */
export const queues = {
  [QUEUE_NAMES.INITIAL]: initialQueue,
  [QUEUE_NAMES.MONITOR]: monitorQueue,
  [QUEUE_NAMES.PRIORITY]: priorityQueue,
};
