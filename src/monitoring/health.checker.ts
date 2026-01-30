/**
 * Health Checker
 *
 * Performs connectivity checks against all external dependencies:
 * - MySQL database
 * - Redis (BullMQ backend)
 * - Browser pool status
 *
 * Exposed via GET /api/scraping/v1/health
 */
import { Sequelize } from "sequelize";
import { Redis } from "ioredis";
import { logger } from "./logger";

interface HealthCheck {
  status: "up" | "down";
  latency?: number;
  error?: string;
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    browserPool: HealthCheck & {
      active?: number;
      available?: number;
      max?: number;
    };
  };
}

const startTime = Date.now();

/**
 * Run all health checks and produce a report.
 *
 * @param sequelize - Sequelize instance for DB check
 * @param redis - IORedis instance for Redis check
 * @param browserPoolStats - Current browser pool stats (optional)
 */
export async function checkHealth(
  sequelize: Sequelize,
  redis: Redis,
  browserPoolStats?: { active: number; available: number; max: number }
): Promise<HealthReport> {
  const dbCheck = await checkDatabase(sequelize);
  const redisCheck = await checkRedis(redis);
  const browserCheck: HealthCheck & {
    active?: number;
    available?: number;
    max?: number;
  } = browserPoolStats
    ? { status: "up", ...browserPoolStats }
    : { status: "down", error: "Browser pool not initialized" };

  // Overall status: unhealthy if any critical service is down
  const allUp = dbCheck.status === "up" && redisCheck.status === "up";
  const status = allUp ? "healthy" : "unhealthy";

  return {
    status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbCheck,
      redis: redisCheck,
      browserPool: browserCheck,
    },
  };
}

async function checkDatabase(sequelize: Sequelize): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    return { status: "up", latency: Date.now() - start };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, "Database health check failed");
    return { status: "down", latency: Date.now() - start, error: msg };
  }
}

async function checkRedis(redis: Redis): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: "up", latency: Date.now() - start };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, "Redis health check failed");
    return { status: "down", latency: Date.now() - start, error: msg };
  }
}
