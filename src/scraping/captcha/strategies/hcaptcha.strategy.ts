/**
 * hCaptcha Strategy
 *
 * Handles hCaptcha challenges on the Radware anti-bot page
 * (validate.perfdrive.com) or directly on CEJ when bot detection
 * escalates.
 *
 * Uses the CapSolver API with HCaptchaTaskProxyLess task type.
 *
 * Flow:
 * 1. Detect hCaptcha iframe on the page
 * 2. Extract sitekey from the iframe src or data attribute
 * 3. Send sitekey + pageurl to CapSolver
 * 4. Poll for the solution token
 * 5. Inject token into h-captcha-response and g-recaptcha-response
 * 6. Submit the form / trigger the callback
 */
import { Page } from "puppeteer";
import { CaptchaSolverStrategy } from "../captcha-solver";
import { CaptchaResult } from "../../../shared/types/cej.types";
import { CapSolverClient } from "../capsolver.client";
import { logger } from "../../../monitoring/logger";

export class HCaptchaStrategy implements CaptchaSolverStrategy {
  name = "hcaptcha";
  private capSolver: CapSolverClient;

  constructor(capSolver?: CapSolverClient) {
    this.capSolver = capSolver || new CapSolverClient();
  }

  /**
   * Check if the page contains an hCaptcha challenge.
   * Looks for the hCaptcha iframe or the hcaptcha div container.
   */
  async canHandle(page: Page): Promise<boolean> {
    try {
      const hasHCaptcha = await page.evaluate(() => {
        // Check for hCaptcha iframe
        const iframe = document.querySelector('iframe[src*="hcaptcha"]');
        if (iframe) return true;
        // Check for hCaptcha container div
        const div = document.querySelector('.h-captcha, [data-hcaptcha-widget-id]');
        if (div) return true;
        return false;
      });
      return hasHCaptcha;
    } catch {
      return false;
    }
  }

  /**
   * Solve hCaptcha via the CapSolver API and inject the token.
   */
  async solve(page: Page): Promise<CaptchaResult> {
    // Step 1: Extract sitekey
    const sitekey = await this.extractSitekey(page);
    if (!sitekey) {
      logger.warn("hCaptcha: could not extract sitekey from page");
      return { solved: false, strategy: "hcaptcha" };
    }

    const pageurl = page.url();
    logger.info(
      { sitekey: sitekey.substring(0, 12) + "...", pageurl },
      "hCaptcha: extracted sitekey, sending to CapSolver"
    );

    // Step 2: Solve via CapSolver API
    let token: string | null;
    try {
      token = await this.capSolver.solveHCaptcha(sitekey, pageurl);
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        "hCaptcha: CapSolver API error (not a website rejection — the API itself failed)"
      );
      return { solved: false, strategy: "hcaptcha" };
    }

    if (!token) {
      logger.warn("hCaptcha: CapSolver returned no token");
      return { solved: false, strategy: "hcaptcha" };
    }

    logger.info(
      { tokenLength: token.length },
      "hCaptcha: got token from CapSolver, injecting into page"
    );

    // Step 3: Inject token into the page
    const injected = await this.injectToken(page, token);
    if (!injected) {
      logger.warn("hCaptcha: token injection failed — could not find response textarea");
      return { solved: false, strategy: "hcaptcha" };
    }

    // Step 4: Trigger the hCaptcha callback to submit the form
    await this.triggerCallback(page, token);

    // Step 5: Wait for page navigation / form submission
    try {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });
      logger.info("hCaptcha: page navigated after token injection");
    } catch {
      // Navigation may not happen if the callback triggers an AJAX request instead
      logger.debug("hCaptcha: no navigation after injection (may be AJAX-based)");
    }

    // Step 6: Check if we're still on the anti-bot page
    const currentUrl = page.url();
    const stillBlocked = currentUrl.includes("validate.perfdrive.com") ||
                         currentUrl.includes("/antibot");

    if (stillBlocked) {
      logger.warn(
        { url: currentUrl },
        "hCaptcha: token was solved by CapSolver but REJECTED by the website — " +
        "the site did not accept the token (IP mismatch, expired, or additional checks)"
      );
      return { solved: false, strategy: "hcaptcha" };
    }

    logger.info("hCaptcha: solved and accepted by website");
    return { solved: true, strategy: "hcaptcha" };
  }

  /**
   * Extract the hCaptcha sitekey from the page.
   * Checks multiple locations where the sitekey can be found.
   */
  private async extractSitekey(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      // Method 1: data-sitekey attribute on the hCaptcha div
      const div = document.querySelector('.h-captcha[data-sitekey], [data-sitekey]');
      if (div) {
        const key = div.getAttribute("data-sitekey");
        if (key) return key;
      }

      // Method 2: from the hCaptcha iframe src URL
      const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement;
      if (iframe?.src) {
        const match = iframe.src.match(/sitekey=([a-f0-9-]+)/i);
        if (match) return match[1];
      }

      // Method 3: from any script tag that sets the sitekey
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const text = script.textContent || "";
        const match = text.match(/sitekey["':\s]+["']([a-f0-9-]+)["']/i);
        if (match) return match[1];
      }

      return null;
    });
  }

  /**
   * Inject the solved token into the page's hCaptcha response fields.
   * hCaptcha uses both h-captcha-response and g-recaptcha-response textareas.
   */
  private async injectToken(page: Page, token: string): Promise<boolean> {
    return page.evaluate((tok) => {
      let injected = false;

      // Inject into all h-captcha-response textareas
      document.querySelectorAll('textarea[name="h-captcha-response"]').forEach((el) => {
        (el as HTMLTextAreaElement).value = tok;
        injected = true;
      });

      // Inject into g-recaptcha-response textareas (some implementations use this too)
      document.querySelectorAll('textarea[name="g-recaptcha-response"]').forEach((el) => {
        (el as HTMLTextAreaElement).value = tok;
        injected = true;
      });

      // If no textareas found, try to create one (some pages lazy-create them)
      if (!injected) {
        const form = document.querySelector("form");
        if (form) {
          const textarea = document.createElement("textarea");
          textarea.name = "h-captcha-response";
          textarea.style.display = "none";
          textarea.value = tok;
          form.appendChild(textarea);
          injected = true;
        }
      }

      return injected;
    }, token);
  }

  /**
   * Trigger the hCaptcha JavaScript callback after injecting the token.
   * This tells the page that the CAPTCHA was solved, which typically
   * enables form submission or triggers an automatic POST.
   */
  private async triggerCallback(page: Page, token: string): Promise<void> {
    try {
      await page.evaluate((tok) => {
        // Try to find and call the hCaptcha onVerify callback
        // Method 1: Direct hcaptcha API (if loaded)
        if (typeof (window as any).hcaptcha !== "undefined") {
          try {
            const widgetIds = (window as any).hcaptcha.getAllResponse?.();
            if (widgetIds) return;
          } catch {}
        }

        // Method 2: Find the callback from the data attribute
        const div = document.querySelector(".h-captcha[data-callback]");
        if (div) {
          const callbackName = div.getAttribute("data-callback");
          if (callbackName && typeof (window as any)[callbackName] === "function") {
            (window as any)[callbackName](tok);
            return;
          }
        }

        // Method 3: Click the Radware antibot submit button (matches old scraper)
        const submitBtn = document.querySelector(
          "input.btn.btn-success.btn-sm"
        ) as HTMLElement;
        if (submitBtn) {
          submitBtn.click();
          return;
        }

        // Method 4: Submit the containing form directly
        const form = document.querySelector("form");
        if (form) {
          form.submit();
        }
      }, token);
    } catch (error) {
      logger.debug(
        { error: (error as Error).message },
        "hCaptcha: callback trigger had an error (may be expected if page navigated)"
      );
    }
  }
}
