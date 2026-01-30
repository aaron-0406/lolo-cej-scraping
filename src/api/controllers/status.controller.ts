/**
 * Status Controller
 *
 * Provides queue status, health check, and metrics endpoints.
 */
import { Request, Response } from "express";
import { initialQueue, monitorQueue, priorityQueue } from "../../queue/queue.config";
import { checkHealth } from "../../monitoring/health.checker";
import { metrics } from "../../monitoring/metrics.collector";
import { getBrowserPoolStats } from "../../workers/worker.manager";
import sequelize from "../../persistence/db/sequelize";
import { redisConnection } from "../../queue/queue.config";
import { logger } from "../../monitoring/logger";

/**
 * GET /api/scraping/v1/status
 *
 * Returns the current status of all queues.
 */
export async function getQueueStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const [initialCounts, monitorCounts, priorityCounts] = await Promise.all([
      initialQueue.getJobCounts(),
      monitorQueue.getJobCounts(),
      priorityQueue.getJobCounts(),
    ]);

    res.json({
      queues: {
        initial: initialCounts,
        monitor: monitorCounts,
        priority: priorityCounts,
      },
      browserPool: getBrowserPoolStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Failed to get queue status"
    );
    res.status(500).json({ error: "Failed to retrieve queue status" });
  }
}

/**
 * GET /api/scraping/v1/health
 *
 * Health check endpoint for load balancers and monitoring.
 */
export async function getHealth(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const health = await checkHealth(sequelize, redisConnection, getBrowserPoolStats());

    const statusCode = health.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: (error as Error).message,
    });
  }
}

/**
 * GET /api/scraping/v1/metrics
 *
 * Prometheus-compatible metrics endpoint.
 */
export async function getMetrics(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const metricsOutput = metrics.format();
    res.set("Content-Type", "text/plain");
    res.send(metricsOutput);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
}
