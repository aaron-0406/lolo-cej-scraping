/**
 * Dashboard Controller
 *
 * Provides endpoints for the real-time customer scraping timeline dashboard.
 * Returns customer data, job execution stats, and timeline events.
 */
import { Request, Response } from "express";
import { Op } from "sequelize";
import {
  Customer,
  Bank,
  CustomerHasBank,
  ScheduledNotifications,
  JudicialCaseFile,
  ScrapeJobLog,
  ScrapeChangeLog,
} from "../../persistence/db/models";
import { LOGIC_KEYS } from "../../config/constants";
import { initialQueue, monitorQueue, priorityQueue } from "../../queue/queue.config";
import { logger } from "../../monitoring/logger";

/**
 * GET /api/scraping/v1/dashboard/customers
 *
 * Returns active customers with their CHBs and bank names.
 */
export async function getCustomers(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Query customers and their CHBs separately since we only have
    // CHB.belongsTo(Customer) and not the reverse hasMany association.
    const customersRaw = await Customer.findAll({
      where: { isScrapperActive: true, state: 1 },
      attributes: ["id", "companyName"],
      order: [["companyName", "ASC"]],
    });

    const result = [];
    for (const customer of customersRaw) {
      const chbs = await CustomerHasBank.findAll({
        where: { idCustomer: (customer as any).id },
        attributes: ["id", "idBank"],
        include: [
          {
            model: Bank,
            as: "bank",
            attributes: ["id", "name"],
          },
        ],
      });

      result.push({
        id: (customer as any).id,
        companyName: (customer as any).companyName,
        chbs: chbs.map((chb: any) => ({
          id: chb.id,
          bankName: chb.bank?.name || `Bank ${chb.idBank}`,
        })),
      });
    }

    res.json({ customers: result });
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Failed to get customers for dashboard"
    );
    res.status(500).json({ error: "Failed to retrieve customers" });
  }
}

/**
 * GET /api/scraping/v1/dashboard/timeline
 *
 * Returns timeline data grouped by customer-bank.
 * Query params: customerId?, chbId?, hours? (default 24)
 */
export async function getTimeline(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const customerId = req.query.customerId
      ? parseInt(req.query.customerId as string, 10)
      : undefined;
    const chbId = req.query.chbId
      ? parseInt(req.query.chbId as string, 10)
      : undefined;
    const hours = req.query.hours
      ? parseInt(req.query.hours as string, 10)
      : 24;

    const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get active schedules with CEJ_MONITORING logic key
    const scheduleWhere: any = {
      logicKey: LOGIC_KEYS.CEJ_MONITORING,
      state: true,
    };
    if (chbId) {
      scheduleWhere.customerHasBankId = chbId;
    }

    const schedules = await ScheduledNotifications.findAll({
      where: scheduleWhere,
      include: [
        {
          model: CustomerHasBank,
          as: "customerHasBank",
          attributes: ["id", "idCustomer", "idBank"],
          include: [
            {
              model: Customer,
              as: "customer",
              attributes: ["id", "companyName", "isScrapperActive"],
              where: {
                isScrapperActive: true,
                state: 1,
                ...(customerId ? { id: customerId } : {}),
              },
            },
            {
              model: Bank,
              as: "bank",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
    });

    const timeline = [];

    for (const schedule of schedules) {
      const sched = schedule as any;
      const chb = sched.customerHasBank;
      if (!chb || !chb.customer) continue;

      const currentChbId = chb.id;

      // Count case files for this CHB
      const totalCaseFiles = await JudicialCaseFile.count({
        where: {
          customerHasBankId: currentChbId,
          isScanValid: true,
          deletedAt: null,
        },
      });

      // Query job logs for this CHB within the time window
      const jobLogs = await ScrapeJobLog.findAll({
        where: {
          customerHasBankId: currentChbId,
          startedAt: { [Op.gte]: sinceDate },
        },
        order: [["startedAt", "DESC"]],
        limit: 200,
      });

      // Aggregate stats
      let jobsCompleted = 0;
      let jobsFailed = 0;
      let jobsInProgress = 0;
      let jobsRetrying = 0;
      let totalDuration = 0;
      let durationCount = 0;
      let totalChanges = 0;

      const recentFailures: any[] = [];
      const timelineEvents: any[] = [];

      for (const job of jobLogs) {
        const j = job as any;
        switch (j.status) {
          case "COMPLETED":
            jobsCompleted++;
            break;
          case "FAILED":
            jobsFailed++;
            break;
          case "STARTED":
            jobsInProgress++;
            break;
          case "RETRYING":
            jobsRetrying++;
            break;
        }

        if (j.durationMs != null) {
          totalDuration += j.durationMs;
          durationCount++;
        }

        totalChanges += j.changesDetected || 0;

        // Collect recent failures (top 10)
        if (j.status === "FAILED" && recentFailures.length < 10) {
          recentFailures.push({
            caseFileId: j.caseFileId,
            errorCode: j.errorCode,
            errorMessage: j.errorMessage,
            attempt: j.attempt,
            durationMs: j.durationMs,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
            workerId: j.workerId,
          });
        }

        // Timeline events (top 50)
        if (timelineEvents.length < 50) {
          timelineEvents.push({
            status: j.status,
            jobType: j.jobType,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
            durationMs: j.durationMs,
            caseFileId: j.caseFileId,
            changesDetected: j.changesDetected,
            errorCode: j.errorCode,
            errorMessage: j.errorMessage,
            attempt: j.attempt,
            workerId: j.workerId,
          });
        }
      }

      // Count unnotified changes
      const pendingNotifications = await ScrapeChangeLog.count({
        where: {
          customerHasBankId: currentChbId,
          notified: false,
        },
      });

      // Parse schedule info
      let notificationHours: number[] = [];
      try {
        const hourData = sched.hourTimeToNotify;
        if (Array.isArray(hourData)) {
          notificationHours = hourData;
        } else if (typeof hourData === "string") {
          notificationHours = JSON.parse(hourData);
        }
      } catch {
        notificationHours = [];
      }

      let daysToNotify: number[] = [];
      try {
        const dayData = sched.daysToNotify;
        if (Array.isArray(dayData)) {
          daysToNotify = dayData;
        } else if (typeof dayData === "string") {
          daysToNotify = JSON.parse(dayData);
        }
      } catch {
        daysToNotify = [];
      }

      // Find the most recent job timestamp for this CHB
      const lastJobAt = jobLogs.length > 0 ? (jobLogs[0] as any).startedAt : null;

      // Find the first completed job to determine if the scheduled run actually executed
      const firstStarted = jobLogs.length > 0
        ? (jobLogs[jobLogs.length - 1] as any).startedAt
        : null;

      timeline.push({
        customerHasBankId: currentChbId,
        customerName: chb.customer.companyName,
        bankName: chb.bank?.name || `Bank ${chb.idBank}`,
        notificationSchedule: {
          hours: notificationHours,
          daysToNotify,
        },
        stats: {
          totalCaseFiles,
          jobsCompleted,
          jobsFailed,
          jobsInProgress,
          jobsRetrying,
          totalChanges,
          totalJobs: jobLogs.length,
          avgDurationMs:
            durationCount > 0 ? Math.round(totalDuration / durationCount) : null,
          pendingNotifications,
          lastJobAt,
          firstJobAt: firstStarted,
        },
        recentFailures,
        timelineEvents,
      });
    }

    // Get BullMQ queue counts
    const [initialCounts, monitorCounts, priorityCounts] = await Promise.all([
      initialQueue.getJobCounts().catch(() => ({})),
      monitorQueue.getJobCounts().catch(() => ({})),
      priorityQueue.getJobCounts().catch(() => ({})),
    ]);

    const queueStats = {
      initial: initialCounts,
      monitor: monitorCounts,
      priority: priorityCounts,
    };

    res.json({ timeline, queueStats, generatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error(
      { error: (error as Error).message, stack: (error as Error).stack },
      "Failed to get timeline data"
    );
    res.status(500).json({ error: "Failed to retrieve timeline data" });
  }
}
