/**
 * CAPTCHA Solver — Strategy Pattern Facade
 *
 * Tries multiple CAPTCHA solving strategies in order until one succeeds.
 * The CEJ website uses different CAPTCHA types depending on load and
 * bot detection level:
 * 1. Normal CAPTCHA (image with digits) — most common
 * 2. hCaptcha — triggered when bot detection increases
 * 3. Audio CAPTCHA — alternative accessibility CAPTCHA
 *
 * Each strategy is a separate class implementing CaptchaSolverStrategy.
 * This facade iterates through them, asking each if it can handle the
 * current page state, and delegates solving to the first one that can.
 */
import { Page } from "puppeteer";
import { CaptchaResult } from "../../shared/types/cej.types";
import { CaptchaUnsolvableError } from "../../shared/errors/captcha.errors";
import { CaptchaFailedError } from "../../shared/errors/scrape.errors";
import { logger } from "../../monitoring/logger";
import { metrics } from "../../monitoring/metrics.collector";

/**
 * Interface that all CAPTCHA solving strategies must implement.
 */
export interface CaptchaSolverStrategy {
  /** Human-readable name for logging */
  name: string;
  /** Check if this strategy can handle the CAPTCHA on the current page */
  canHandle(page: Page): Promise<boolean>;
  /** Attempt to solve the CAPTCHA */
  solve(page: Page): Promise<CaptchaResult>;
}

export class CaptchaSolver {
  private strategies: CaptchaSolverStrategy[];

  constructor(strategies: CaptchaSolverStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * Try each strategy in order until one solves the CAPTCHA.
   * @throws CaptchaFailedError if no strategy succeeds
   */
  async solve(page: Page): Promise<CaptchaResult> {
    for (const strategy of this.strategies) {
      try {
        const canHandle = await strategy.canHandle(page);
        if (!canHandle) continue;

        logger.info({ strategy: strategy.name }, "Attempting CAPTCHA solve");

        const result = await strategy.solve(page);

        if (result.solved) {
          metrics.increment("captcha_solve_total", {
            result: "success",
            strategy: strategy.name,
          });
          logger.info({ strategy: strategy.name }, "CAPTCHA solved successfully");
          return result;
        }

        metrics.increment("captcha_solve_total", {
          result: "failure",
          strategy: strategy.name,
        });
        logger.warn({ strategy: strategy.name }, "CAPTCHA solve returned unsolved");
      } catch (error) {
        metrics.increment("captcha_solve_total", {
          result: "failure",
          strategy: strategy.name,
        });
        logger.warn(
          { strategy: strategy.name, error: (error as Error).message },
          "CAPTCHA strategy threw error"
        );
      }
    }

    throw new CaptchaFailedError("All CAPTCHA strategies exhausted");
  }
}
