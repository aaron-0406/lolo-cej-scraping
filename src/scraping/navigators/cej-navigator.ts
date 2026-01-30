/**
 * CEJ Navigator
 *
 * Handles page navigation on the CEJ website.
 * Navigates to the search form, enters case file numbers,
 * and determines the resulting page state after form submission.
 */
import { Page } from "puppeteer";
import { CEJ } from "../../config/constants";
import { PageState } from "../../shared/types/cej.types";
import { CEJUnreachableError, BotDetectedError } from "../../shared/errors/scrape.errors";
import { logger } from "../../monitoring/logger";
import { CaptchaSolver } from "../captcha/captcha-solver";
import config from "../../config";

/**
 * Navigate to the CEJ search form page.
 * If Radware Bot Manager redirects to an anti-bot page, attempts to solve
 * the hCaptcha challenge before retrying navigation.
 *
 * @param page - Puppeteer page instance
 * @param captchaSolver - CAPTCHA solver instance (used to solve hCaptcha on antibot pages)
 * @throws CEJUnreachableError if the page fails to load after retries
 * @throws BotDetectedError if anti-bot page persists after all retries
 */
export async function navigateToCEJ(page: Page, captchaSolver?: CaptchaSolver): Promise<void> {
  const MAX_NAV_RETRIES = 5;

  // Set up dialog handler to auto-dismiss JS alerts (once per page)
  page.on("dialog", async (dialog) => {
    logger.info({ type: dialog.type(), message: dialog.message() }, "JS dialog detected on CEJ");
    await dialog.dismiss().catch(() => {});
  });

  for (let attempt = 0; attempt < MAX_NAV_RETRIES; attempt++) {
    try {
      await page.goto(config.cejBaseUrl, {
        waitUntil: "networkidle2",
        timeout: config.navigationTimeoutMs,
      });

      // Check if Radware redirected us to an anti-bot page (different domain entirely)
      const currentUrl = page.url();
      const cejOrigin = new URL(config.cejBaseUrl).origin;
      if (!currentUrl.startsWith(cejOrigin)) {
        logger.warn(
          { url: currentUrl, attempt: attempt + 1, maxRetries: MAX_NAV_RETRIES },
          "Anti-bot page detected"
        );

        // Try to solve hCaptcha on the antibot page
        if (captchaSolver) {
          logger.info({ attempt: attempt + 1, url: currentUrl }, "Waiting for hCaptcha to load on antibot page");
          try {
            // Wait for hCaptcha iframe or container to appear
            await page.waitForSelector('iframe[src*="hcaptcha"], .h-captcha, [data-sitekey]', {
              timeout: 15000,
            }).catch(async () => {
              const debugInfo = await page.evaluate(() => {
                const iframes = Array.from(document.querySelectorAll("iframe")).map(f => f.src);
                return { url: window.location.href, iframes, bodySnippet: document.body?.innerHTML?.substring(0, 1000) };
              }).catch(() => ({}));
              logger.warn({ attempt: attempt + 1, debugInfo }, "hCaptcha elements not found on antibot page during navigation");
            });

            // Small delay for widget to initialize
            await new Promise((r) => setTimeout(r, 2000));

            const hcaptchaResult = await captchaSolver.solve(page);
            if (hcaptchaResult.solved) {
              logger.info("hCaptcha solved on antibot page, re-navigating to CEJ");
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
          } catch (error) {
            logger.warn(
              { error: (error as Error).message, attempt: attempt + 1 },
              "hCaptcha solve failed on antibot page, will retry navigation"
            );
          }
        }

        // Wait before retrying (increasing delay)
        const delay = 5000 + attempt * 3000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // We're on CEJ — dismiss any popups/modals (GUIA RAPIDA, COMUNICADO, etc.)
      await page.evaluate(
        `(function() {
          var closeButtons = document.querySelectorAll(".close, .closeP, [data-dismiss='modal']");
          for (var i = 0; i < closeButtons.length; i++) {
            closeButtons[i].click();
          }
          var buttons = document.querySelectorAll("button");
          for (var j = 0; j < buttons.length; j++) {
            if ((buttons[j].textContent || "").trim() === "CERRAR") {
              buttons[j].click();
            }
          }
          var backdrops = document.querySelectorAll(".modal-backdrop, .modal.in, .modal.show");
          for (var k = 0; k < backdrops.length; k++) {
            backdrops[k].style.display = "none";
          }
        })()`
      ).catch(() => {});

      await new Promise((r) => setTimeout(r, 500));

      // Verify the search form is present
      await page.waitForSelector(CEJ.SELECTORS.SEARCH_INPUT, {
        timeout: CEJ.WAIT_TIMEOUT_MS,
      });

      logger.info({ attempt: attempt + 1 }, "Successfully navigated to CEJ");
      return;
    } catch (error) {
      if (attempt < MAX_NAV_RETRIES - 1) {
        logger.warn(
          { attempt: attempt + 1, error: (error as Error).message },
          "Navigation attempt failed, retrying"
        );
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw new CEJUnreachableError(`Failed to navigate to CEJ after ${MAX_NAV_RETRIES} attempts: ${(error as Error).message}`);
    }
  }

  throw new BotDetectedError(`Anti-bot page persisted after ${MAX_NAV_RETRIES} navigation attempts`);
}

/**
 * Enter a case file number into the CEJ search form.
 * The new CEJ form splits the case number into 7 separate fields.
 * Format: NNNNN-YYYY-I-DDDD-SS-EE-NN (e.g. 04718-2019-0-1601-JR-CI-09)
 *
 * We use the page's built-in paste handler by dispatching a paste event
 * on the first field, which auto-fills all 7 fields.
 *
 * @param page - Puppeteer page instance
 * @param caseFileNumber - The expediente number to search for
 */
export async function enterCaseFileNumber(
  page: Page,
  caseFileNumber: string,
  clientName?: string
): Promise<void> {
  // Wait for validation elements to be present (like the old working scraper)
  await page.waitForSelector("#mensajeNoExisteExpedientes").catch(() => {});
  await page.waitForSelector("#codCaptchaError").catch(() => {});

  // Log URL before Tab 2 click
  logger.debug({ url: page.url() }, "URL before Tab 2 click");

  // Switch to Tab 2 ("Por Código de Expediente") — critical for form submission
  await page.waitForSelector("#myTab > li:nth-child(2) > a", {
    timeout: CEJ.WAIT_TIMEOUT_MS,
  });
  await page.click("#myTab > li:nth-child(2) > a");

  // Wait for potential page navigation after tab click
  await new Promise((r) => setTimeout(r, 1000));

  // Log URL after Tab 2 click
  logger.debug({ url: page.url() }, "URL after Tab 2 click");

  // Fill the 7 case number fields using locator().fill() for proper event triggering
  const parts = caseFileNumber.split("-");
  if (parts.length === 7) {
    const fields = [
      "cod_expediente",
      "cod_anio",
      "cod_incidente",
      "cod_distprov",
      "cod_organo",
      "cod_especialidad",
      "cod_instancia",
    ];
    for (let i = 0; i < fields.length; i++) {
      await page.locator(`input[id="${fields[i]}"]`).fill(parts[i]);
    }
  }

  // Fill the "parte" field (party name, required by CEJ data protection)
  if (clientName) {
    await page.locator('input[id="parte"]').fill(clientName);
    logger.debug({ clientName }, "Filled parte field with client name");
  }

  // Dismiss any popups/modals that may have appeared during form filling
  await page.evaluate(
    `(function() {
      var closeButtons = document.querySelectorAll(".close, .closeP, [data-dismiss='modal']");
      for (var i = 0; i < closeButtons.length; i++) {
        closeButtons[i].click();
      }
      var buttons = document.querySelectorAll("button");
      for (var j = 0; j < buttons.length; j++) {
        if ((buttons[j].textContent || "").trim() === "CERRAR") {
          buttons[j].click();
        }
      }
      var backdrops = document.querySelectorAll(".modal-backdrop, .modal.in, .modal.show");
      for (var k = 0; k < backdrops.length; k++) {
        backdrops[k].style.display = "none";
      }
      // Remove any overlay that blocks clicks
      document.body.style.overflow = "auto";
      document.body.classList.remove("modal-open");
    })()`
  ).catch(() => {});

  // Small delay for modals to close
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Assess the current page state after CAPTCHA submission.
 * Determines whether results were found, no results, or bot detection occurred.
 *
 * @param page - Puppeteer page instance
 * @returns Current state of the page
 */
export async function assessPageState(page: Page): Promise<PageState> {
  const currentUrl = page.url();
  // Antibot detection: check if we're on a completely different domain (e.g., validate.perfdrive.com)
  // CEJ navigates between busquedaform.html and busquedacodform.html — both are valid CEJ pages.
  const cejOrigin = new URL(config.cejBaseUrl).origin;
  const isAntibotPage = !currentUrl.startsWith(cejOrigin);

  let hasResults = false;
  let hasNoResults = false;
  let hasBinnaclePanel = false;
  let hasCaptchaError = false;

  try {
    // Check both old (#gridRresultados) and new (#divDetalles) results formats
    hasResults = (await page.$(CEJ.SELECTORS.RESULTS_TABLE)) !== null
      || (await page.$(CEJ.SELECTORS.RESULTS_CONTAINER)) !== null;
  } catch { /* element not found */ }

  // Check using getComputedStyle for reliable visibility detection
  try {
    const pageChecks = await page.evaluate(() => {
      const errElement = document.getElementById("mensajeNoExisteExpedientes");
      const errorCaptcha = document.getElementById("codCaptchaError");

      return {
        noResults: errElement ? window.getComputedStyle(errElement).display !== "none" : false,
        captchaError: errorCaptcha ? window.getComputedStyle(errorCaptcha).display !== "none" : false,
      };
    });
    hasNoResults = pageChecks.noResults;
    hasCaptchaError = pageChecks.captchaError;
  } catch { /* element not found */ }

  try {
    hasBinnaclePanel = (await page.$(CEJ.SELECTORS.BINNACLE_PANEL)) !== null
      || (await page.$(CEJ.SELECTORS.BINNACLE_PANEL_NUMBERED)) !== null;
  } catch { /* element not found */ }

  // Also check .alert-warning as fallback
  if (!hasNoResults) {
    try {
      hasNoResults = (await page.$(CEJ.SELECTORS.NO_RESULTS_ALERT)) !== null;
    } catch { /* element not found */ }
  }

  return {
    currentUrl,
    isAntibotPage,
    hasResults,
    hasNoResults,
    hasBinnaclePanel,
    hasCaptchaError,
  };
}

/**
 * Click on a specific result row to navigate to the case file detail view.
 * The detail view contains the binnacle panel with all timeline entries.
 *
 * @param page - Puppeteer page instance
 * @param rowIndex - Index of the result row to click (0-based)
 */
export async function navigateToCaseDetail(
  page: Page,
  rowIndex: number = 0
): Promise<void> {
  try {
    // Primary approach: click #command > button (used by the working old scraper)
    // This button appears on the results page and navigates to the detail view.
    const hasCommandButton = await page.$(CEJ.SELECTORS.RESULTS_BUTTON);

    if (hasCommandButton) {
      logger.info({ rowIndex }, "Clicking #command > button to navigate to detail");
      await page.click(CEJ.SELECTORS.RESULTS_BUTTON);
    } else {
      // Fallback: try clicking result row directly
      const clicked = await page.evaluate((idx) => {
        const newRows = document.querySelectorAll("#divDetalles .divGLRE0");
        if (newRows.length > 0) {
          const row = newRows[idx] as HTMLElement;
          if (row) { row.click(); return "new"; }
        }
        const oldRows = document.querySelectorAll("#gridRresultados tbody tr");
        if (oldRows.length > 0) {
          const row = oldRows[idx] as HTMLElement;
          if (row) { row.click(); return "old"; }
        }
        return "none";
      }, rowIndex);

      logger.info({ rowIndex, format: clicked }, "Clicked result row (fallback)");

      if (clicked === "none") {
        throw new Error("No result rows or command button found");
      }
    }

    // Wait for the numbered binnacle panel to load (CEJ uses #pnlSeguimiento1, #pnlSeguimiento2, etc.)
    // Also wait for possible navigation
    await Promise.race([
      page.waitForSelector(CEJ.SELECTORS.BINNACLE_PANEL_NUMBERED, { timeout: 15000 }).catch(() => {}),
      page.waitForSelector(CEJ.SELECTORS.BINNACLE_PANEL, { timeout: 15000 }).catch(() => {}),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
    ]);

    // Wait for dynamic content to finish loading
    await new Promise((r) => setTimeout(r, 5000));

    logger.info({ rowIndex, url: page.url() }, "Navigated to case detail view");
  } catch (error) {
    logger.warn(
      { rowIndex, error: (error as Error).message },
      "Failed to navigate to case detail"
    );
    throw error;
  }
}
