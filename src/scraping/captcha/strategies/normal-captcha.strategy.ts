/**
 * Normal CAPTCHA Strategy
 *
 * Handles the standard image-based CAPTCHA on CEJ.
 * Extracts the CAPTCHA image as base64, sends it to the CapSolver API,
 * and enters the solved text into the input field.
 *
 * Also sets the #1zirobotz0 anti-bot hidden field to match the CAPTCHA code,
 * matching the behavior of the working old scraper.
 */
import { Page } from "puppeteer";
import { CaptchaSolverStrategy } from "../captcha-solver";
import { CaptchaResult } from "../../../shared/types/cej.types";
import { CapSolverClient } from "../capsolver.client";
import { CEJ } from "../../../config/constants";
import { logger } from "../../../monitoring/logger";

export class NormalCaptchaStrategy implements CaptchaSolverStrategy {
  name = "normal";
  private capSolver: CapSolverClient;

  constructor(capSolver: CapSolverClient) {
    this.capSolver = capSolver;
  }

  /**
   * Check if the page has a standard CAPTCHA image element.
   */
  async canHandle(page: Page): Promise<boolean> {
    try {
      const captchaImg = await page.$(CEJ.SELECTORS.CAPTCHA_IMAGE);
      return captchaImg !== null;
    } catch {
      return false;
    }
  }

  /**
   * Extract the CAPTCHA image as base64.
   * First tries fetching via the page context (preserves cookies),
   * then falls back to canvas rendering if the image loaded in DOM.
   */
  private async extractCaptchaBase64(page: Page): Promise<string | null> {
    // Get the CAPTCHA image src URL
    const captchaSrc = await page.$eval(CEJ.SELECTORS.CAPTCHA_IMAGE, (el: any) => {
      return el.src;
    }).catch(() => null);

    if (!captchaSrc) return null;

    // Method 1: Fetch the image via page context (preserves session cookies)
    const fetched = await page.evaluate(
      `(async function() {
        try {
          var response = await fetch(${JSON.stringify(captchaSrc)}, { credentials: "include" });
          if (!response.ok) return null;
          var blob = await response.blob();
          return await new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onloadend = function() {
              var result = reader.result;
              resolve(result ? result.split(",")[1] : null);
            };
            reader.onerror = function() { resolve(null); };
            reader.readAsDataURL(blob);
          });
        } catch(e) {
          return null;
        }
      })()`
    ) as string | null;

    if (fetched) return fetched;

    // Method 2: Try canvas rendering if image has loaded in the DOM
    const canvasResult = await page.$eval(CEJ.SELECTORS.CAPTCHA_IMAGE, (img: any) => {
      if (!img.naturalWidth || img.naturalWidth === 0) return null;
      const canvas = img.ownerDocument.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    }).catch(() => null);

    if (canvasResult) return canvasResult;

    logger.warn({ captchaSrc }, "CAPTCHA image could not be fetched or rendered");
    return null;
  }

  /**
   * Solve the CAPTCHA by:
   * 1. Extracting the CAPTCHA image as base64
   * 2. Sending to CapSolver API
   * 3. Typing the solution into the input field
   * 4. Setting the #1zirobotz0 anti-bot hidden field
   *
   * The CONSULTAR click and result verification is handled by form-submitter.ts
   */
  async solve(page: Page): Promise<CaptchaResult> {
    const imageBase64 = await this.extractCaptchaBase64(page);

    if (!imageBase64) {
      return { solved: false };
    }

    // Send to CapSolver API for solving
    const solution = await this.capSolver.solveNormalCaptcha(imageBase64);

    if (!solution) {
      return { solved: false };
    }

    // Type the solution into the CAPTCHA input
    await page.locator(`input[id="codigoCaptcha"]`).fill(solution);

    // Set the #1zirobotz0 anti-bot hidden field to match the CAPTCHA code
    await page.evaluate((code: string) => {
      const antibotField = document.getElementById("1zirobotz0") as HTMLInputElement;
      if (antibotField) {
        antibotField.value = code;
      }
    }, solution);

    logger.info({ solution }, "CAPTCHA solution typed and 1zirobotz0 field set, returning to form-submitter for submission");

    return {
      solved: true,
      solution,
      strategy: "normal",
    };
  }
}
