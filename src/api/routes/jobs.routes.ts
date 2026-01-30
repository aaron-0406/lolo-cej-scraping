/**
 * Jobs Routes
 *
 * API routes for triggering scraping jobs.
 * Protected by service-to-service authentication.
 */
import { Router } from "express";
import { triggerInitialScrape, triggerPriorityScrape } from "../controllers/jobs.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// All job routes require service authentication
router.use(authMiddleware);

router.post("/initial", triggerInitialScrape);
router.post("/priority", triggerPriorityScrape);

export default router;
