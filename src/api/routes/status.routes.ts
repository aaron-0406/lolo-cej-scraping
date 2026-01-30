/**
 * Status Routes
 *
 * API routes for monitoring: queue status, health, metrics.
 * Health and metrics endpoints are public (for load balancers).
 * Status endpoint is protected.
 */
import { Router } from "express";
import { getQueueStatus, getHealth, getMetrics } from "../controllers/status.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public endpoints (health checks, metrics scraping)
router.get("/health", getHealth);
router.get("/metrics", getMetrics);

// Protected endpoint
router.get("/status", authMiddleware, getQueueStatus);

export default router;
