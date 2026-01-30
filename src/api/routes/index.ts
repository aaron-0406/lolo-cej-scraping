/**
 * Route Aggregator
 *
 * Mounts all API routes under the /api/scraping/v1 prefix.
 */
import { Router } from "express";
import jobsRoutes from "./jobs.routes";
import dashboardRoutes from "./dashboard.routes";
import statusRoutes from "./status.routes";

const router = Router();

router.use("/jobs", jobsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/", statusRoutes);

export default router;
