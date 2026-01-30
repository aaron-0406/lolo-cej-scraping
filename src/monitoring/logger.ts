/**
 * Structured Logger (Pino)
 *
 * All modules import { logger } from this file instead of using console.log.
 * Produces JSON logs in production and pretty-printed logs in development.
 *
 * Every log entry includes:
 * - service: "lolo-cej-scraping" (for log aggregation)
 * - pid: process ID (for multi-worker debugging)
 * - Contextual fields passed as the first argument object
 */
import pino from "pino";
import config from "../config";

export const logger = pino({
  level: config.logLevel,
  // In development, use pino-pretty for human-readable output
  transport:
    config.env === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  // Base fields included in every log entry
  base: {
    service: "lolo-cej-scraping",
    pid: process.pid,
  },
});
