/**
 * Entry Point — lolo-cej-scraping
 *
 * Starts the three main subsystems:
 * 1. API Server — Express endpoints for job triggers and monitoring
 * 2. Scheduler — node-cron planner that enqueues scraping batches
 * 3. Workers — BullMQ workers that process scraping jobs
 *
 * Also initializes database connection and verifies Redis connectivity.
 */
import config from "./config";
import sequelize from "./persistence/db/sequelize";
import "./persistence/db/models"; // Ensure models are registered
import { startServer } from "./api/server";
import { startScheduler } from "./scheduler/scheduler.service";
import { startWorkers, stopWorkers } from "./workers/worker.manager";
import { logger } from "./monitoring/logger";

async function main(): Promise<void> {
  logger.info(
    { env: config.env, port: config.port },
    "Starting lolo-cej-scraping service"
  );

  // 1. Verify database connection
  try {
    await sequelize.authenticate();
    logger.info("Database connection established");
  } catch (error) {
    logger.fatal(
      { error: (error as Error).message },
      "Failed to connect to database — aborting startup"
    );
    process.exit(1);
  }

  // 2. Start API server
  await startServer();

  // 3. Start BullMQ workers
  await startWorkers();

  // 4. Start scheduler
  startScheduler();

  logger.info("All subsystems started — service is ready");
}

// --- Graceful Shutdown ---
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");

  try {
    await stopWorkers();
    await sequelize.close();
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Error during shutdown"
    );
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled rejection");
  process.exit(1);
});

// Start the service
main().catch((error) => {
  logger.fatal({ error: error.message }, "Failed to start service");
  process.exit(1);
});
