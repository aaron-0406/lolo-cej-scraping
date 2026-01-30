/**
 * Form Submitter
 *
 * Orchestrates the complete flow of searching for a case file on CEJ:
 * 1. Navigate to CEJ search page
 * 2. Enter case file number
 * 3. Solve CAPTCHA
 * 4. Click CONSULTAR and wait for results
 * 5. Navigate to case detail if found
 *
 * This is the high-level coordinator used by ScrapeWorker.
 */
import { Page } from "puppeteer";
import { CaptchaSolver } from "../captcha/captcha-solver";
import {
  navigateToCEJ,
  enterCaseFileNumber,
  assessPageState,
  navigateToCaseDetail,
} from "./cej-navigator";
import { PageState, CaptchaResult } from "../../shared/types/cej.types";
import {
  CaptchaFailedError,
  BotDetectedError,
  InvalidCaseNumberError,
} from "../../shared/errors/scrape.errors";
import { CEJ } from "../../config/constants";
import { logger } from "../../monitoring/logger";

export interface FormSubmissionResult {
  /** Whether the case file was found and we navigated to the detail view */
  success: boolean;
  /** Page state after submission */
  pageState: PageState;
  /** CAPTCHA solving result */
  captchaResult?: CaptchaResult;
}

/**
 * Submit a case file search on CEJ.
 * Handles the full flow: navigate → enter number → solve CAPTCHA → check results.
 *
 * @param page - Puppeteer page instance
 * @param caseFileNumber - The expediente number to search
 * @param captchaSolver - CAPTCHA solver instance
 * @returns Submission result with page state
 * @throws CaptchaFailedError if CAPTCHA cannot be solved
 * @throws BotDetectedError if antibot page is shown
 * @throws InvalidCaseNumberError if no results found for the case number
 */
export async function submitCaseFileSearch(
  page: Page,
  caseFileNumber: string,
  captchaSolver: CaptchaSolver,
  clientName?: string
): Promise<FormSubmissionResult> {
  const MAX_ANTIBOT_RETRIES = 2;

  for (let antibotAttempt = 0; antibotAttempt <= MAX_ANTIBOT_RETRIES; antibotAttempt++) {
    if (antibotAttempt > 0) {
      logger.info(
        { caseFileNumber, attempt: antibotAttempt + 1 },
        "Retrying full search flow after antibot resolution"
      );
    }

    logger.info({ caseFileNumber, hasClientName: !!clientName }, "Starting case file search on CEJ");

    // Capture browser console errors for diagnostics
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        logger.warn({ text: msg.text() }, "Browser console error");
      }
    });
    page.on("pageerror", (err) => {
      logger.warn({ error: err.message }, "Browser page JS error");
    });

    // Step 1: Navigate to CEJ (passes captchaSolver so it can solve hCaptcha if antibot appears)
    await navigateToCEJ(page, captchaSolver);

    // Step 2: Enter case file number and party name
    await enterCaseFileNumber(page, caseFileNumber, clientName);

    // Step 3: Solve CAPTCHA (strategies only fill in the CAPTCHA code, they don't click CONSULTAR)
    const captchaResult = await captchaSolver.solve(page);
    if (!captchaResult.solved) {
      throw new CaptchaFailedError(
        `CAPTCHA solve failed for ${caseFileNumber} (strategy: ${captchaResult.strategy || "none"})`
      );
    }

    // Step 4: Click CONSULTAR and wait for results
    // Native form submission navigates the page (like the old working scraper).
    // Use Promise.all to avoid race between click and navigation.
    logger.info(
      { caseFileNumber, strategy: captchaResult.strategy, url: page.url() },
      "Clicking CONSULTAR"
    );

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch((err) => {
        logger.warn({ error: (err as Error).message }, "Navigation after CONSULTAR timed out or failed");
      }),
      page.click(CEJ.SELECTORS.SEARCH_BUTTON),
    ]);

    logger.debug({ caseFileNumber, url: page.url() }, "URL after CONSULTAR navigation");

    // Wait for any result indicator to appear on the results page.
    // The results page may load content dynamically via AJAX.
    try {
      await page.waitForFunction(
        () => {
          // Check for results (old table format or new div format)
          const resultsTable = document.querySelector("#gridRresultados");
          if (resultsTable) return true;
          const resultsContainer = document.querySelector("#divDetalles");
          if (resultsContainer) return true;
          // Check for "no results" message (visible)
          const noResults = document.getElementById("mensajeNoExisteExpedientes");
          if (noResults && window.getComputedStyle(noResults).display !== "none") return true;
          // Check for CAPTCHA error (visible)
          const captchaErr = document.getElementById("codCaptchaError");
          if (captchaErr && window.getComputedStyle(captchaErr).display !== "none") return true;
          // Check for binnacle panel (numbered or generic)
          const binnacle = document.querySelector("#pnlSeguimiento") || document.querySelector("#pnlSeguimiento1");
          if (binnacle) return true;
          // Check for any alert-warning
          const alert = document.querySelector(".alert-warning");
          if (alert) return true;
          return false;
        },
        { timeout: 15000 }
      );
    } catch {
      logger.warn({ caseFileNumber, url: page.url() }, "No result elements appeared within 15s");
    }

    // Step 5: Assess page state
    let pageState = await assessPageState(page);

    // If still nothing after waiting, dump page body for diagnostics
    if (!pageState.hasResults && !pageState.hasNoResults && !pageState.hasCaptchaError && !pageState.isAntibotPage && !pageState.hasBinnaclePanel) {
      try {
        const diagnostics = await page.evaluate(() => {
          const body = document.body?.innerHTML?.substring(0, 5000) || "";
          const allIds = Array.from(document.querySelectorAll("[id]")).map(el => el.id).slice(0, 50);
          const tables = document.querySelectorAll("table").length;
          const alerts = Array.from(document.querySelectorAll(".alert, .alert-warning, .alert-danger")).map(
            el => ({ class: el.className, text: (el as HTMLElement).innerText?.substring(0, 200), display: window.getComputedStyle(el).display })
          );
          return { url: window.location.href, title: document.title, allIds, tables, alerts, bodySnippet: body };
        });
        logger.error(
          { caseFileNumber, ...diagnostics },
          "Page diagnostics after failed CONSULTAR (no result state detected)"
        );
      } catch (e) {
        logger.error({ error: (e as Error).message }, "Failed to dump page diagnostics");
      }
    }

    // Handle antibot: solve hCaptcha and retry the full flow
    if (pageState.isAntibotPage) {
      if (antibotAttempt < MAX_ANTIBOT_RETRIES) {
        logger.warn(
          { caseFileNumber, currentUrl: pageState.currentUrl, attempt: antibotAttempt + 1, maxRetries: MAX_ANTIBOT_RETRIES },
          "Antibot page detected after CONSULTAR, waiting for hCaptcha to load"
        );
        try {
          // Wait for the antibot page to fully load and render hCaptcha
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});

          // Wait for hCaptcha iframe or container to appear
          await page.waitForSelector('iframe[src*="hcaptcha"], .h-captcha, [data-sitekey]', {
            timeout: 15000,
          }).catch(async () => {
            // Log what's actually on the page for debugging
            const debugInfo = await page.evaluate(() => {
              const iframes = Array.from(document.querySelectorAll("iframe")).map(f => f.src);
              const forms = document.querySelectorAll("form").length;
              const buttons = Array.from(document.querySelectorAll("input[type='submit'], button[type='submit']")).map(
                b => (b as HTMLElement).className
              );
              return { url: window.location.href, iframes, forms, buttons, bodySnippet: document.body?.innerHTML?.substring(0, 1000) };
            }).catch(() => ({}));
            logger.warn({ caseFileNumber, debugInfo }, "hCaptcha elements not found on antibot page");
          });

          // Small delay for widget to initialize
          await new Promise((r) => setTimeout(r, 2000));

          const hcaptchaResult = await captchaSolver.solve(page);
          if (hcaptchaResult.solved) {
            logger.info({ caseFileNumber }, "hCaptcha solved after CONSULTAR antibot, retrying search");
            await new Promise((r) => setTimeout(r, 3000));
            continue; // Retry the full flow
          }
          logger.warn({ caseFileNumber }, "hCaptcha solve returned unsolved after CONSULTAR antibot");
        } catch (error) {
          logger.warn(
            { caseFileNumber, error: (error as Error).message },
            "hCaptcha solve failed after CONSULTAR antibot"
          );
        }
      }
      throw new BotDetectedError("Antibot page detected after CAPTCHA solve");
    }

    if (pageState.hasCaptchaError) {
      throw new CaptchaFailedError(
        `CAPTCHA code was rejected by CEJ for ${caseFileNumber}`
      );
    }

    if (pageState.hasNoResults) {
      throw new InvalidCaseNumberError(
        `No results found for case file: ${caseFileNumber}`
      );
    }

    // Step 6: Navigate to case detail if results found
    if (pageState.hasResults) {
      logger.info({ caseFileNumber, url: page.url() }, "Results found, navigating to case detail");
      await navigateToCaseDetail(page);
      const detailState = await assessPageState(page);
      logger.info(
        { caseFileNumber, url: page.url(), hasBinnaclePanel: detailState.hasBinnaclePanel, hasResults: detailState.hasResults },
        "Detail page state after navigation"
      );

      return {
        success: detailState.hasBinnaclePanel,
        pageState: detailState,
        captchaResult,
      };
    }

    // If binnacle panel is already visible (direct navigation)
    if (pageState.hasBinnaclePanel) {
      return {
        success: true,
        pageState,
        captchaResult,
      };
    }

    logger.warn(
      { caseFileNumber, pageState },
      "Unexpected page state after form submission"
    );

    return {
      success: false,
      pageState,
      captchaResult,
    };
  }

  // Should not reach here, but TypeScript needs a return
  throw new BotDetectedError("Antibot page persisted after all retries");
}
