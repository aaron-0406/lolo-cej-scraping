/**
 * Audio CAPTCHA Strategy
 *
 * Handles audio-based CAPTCHA challenges on CEJ.
 * Matches the exact flow of the old working scraper (lolo-backend-scraping):
 * 1. Scroll to #btnRepro and click it
 * 2. Wait 5 seconds for CEJ JS to populate #1zirobotz0
 * 3. Read the CAPTCHA code from #1zirobotz0 (primary) or #deleteSound > input (fallback)
 * 4. Wait 4 seconds (old scraper timing)
 * 5. Fill #codigoCaptcha with the code (do NOT overwrite #1zirobotz0)
 *
 * The CONSULTAR click and result verification is handled by form-submitter.ts
 */
import { Page } from "puppeteer";
import { CaptchaSolverStrategy } from "../captcha-solver";
import { CaptchaResult } from "../../../shared/types/cej.types";
import { CEJ } from "../../../config/constants";
import { logger } from "../../../monitoring/logger";

export class AudioCaptchaStrategy implements CaptchaSolverStrategy {
  name = "audio";

  async canHandle(page: Page): Promise<boolean> {
    try {
      const audioBtn = await page.$(CEJ.SELECTORS.CAPTCHA_AUDIO_BTN);
      return audioBtn !== null;
    } catch {
      return false;
    }
  }

  async solve(page: Page): Promise<CaptchaResult> {
    try {
      // Scroll to the audio button and click it (matching old working scraper pattern)
      await page.locator(CEJ.SELECTORS.CAPTCHA_AUDIO_BTN).scroll({
        scrollTop: -30,
      }).then(async () => {
        await page.locator(CEJ.SELECTORS.CAPTCHA_AUDIO_BTN).click();
      });
      logger.info("Clicked #btnRepro audio button");

      // Wait 5 seconds for CEJ JavaScript to populate the hidden field
      await new Promise((r) => setTimeout(r, 5000));

      // Read the CAPTCHA code — try #1zirobotz0 FIRST (like old working scraper),
      // then fall back to #deleteSound > input
      const captchaCode = await page.evaluate(() => {
        // Primary: read from #1zirobotz0 (old working scraper reads this)
        const antibotField = document.getElementById("1zirobotz0") as HTMLInputElement;
        if (antibotField) {
          const val = antibotField.value;
          if (val && val !== "null" && val !== "NULL" && val.length >= 3) {
            return val;
          }
        }
        // Fallback: read from #deleteSound > input
        const el = document.getElementById("deleteSound");
        if (el) {
          const input = el.querySelector("input") as HTMLInputElement;
          if (input) {
            const val = input.value;
            if (val && val !== "null" && val !== "NULL" && val.length >= 3) {
              return val;
            }
          }
        }
        return null;
      });

      if (!captchaCode) {
        logger.warn("No valid CAPTCHA code found in #1zirobotz0 or #deleteSound after clicking audio button");
        return { solved: false, strategy: "audio" };
      }

      logger.info({ codeLength: captchaCode.length, code: captchaCode }, "CAPTCHA code extracted from audio");

      // Wait 4 seconds before filling (matching old scraper's timing exactly)
      await new Promise((r) => setTimeout(r, 4000));

      // Fill the CAPTCHA code into the input field
      // IMPORTANT: Do NOT overwrite #1zirobotz0 — the old working scraper never does this.
      // CEJ's JS already set #1zirobotz0 correctly when audio played.
      await page.locator('input[id="codigoCaptcha"]').fill(captchaCode);

      logger.info("Audio CAPTCHA code filled into #codigoCaptcha, returning to form-submitter for submission");

      return {
        solved: true,
        solution: captchaCode,
        strategy: "audio",
      };
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "Audio CAPTCHA solve failed"
      );
      return { solved: false, strategy: "audio" };
    }
  }
}
