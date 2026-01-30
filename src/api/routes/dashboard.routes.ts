/**
 * Dashboard Routes
 *
 * Public endpoints for the monitoring timeline dashboard.
 * No auth middleware — intended for internal monitoring use.
 */
import { Router } from "express";
import { getCustomers, getTimeline } from "../controllers/dashboard.controller";

const router = Router();

router.get("/customers", getCustomers);
router.get("/timeline", getTimeline);

export default router;
