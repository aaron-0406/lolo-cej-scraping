/**
 * 2Captcha API Client
 *
 * Handles communication with the 2Captcha service for solving
 * hCaptcha challenges. Uses human workers to solve CAPTCHAs.
 *
 * API docs: https://2captcha.com/2captcha-api
 *
 * Flow:
 * 1. POST to in.php with method=hcaptcha, sitekey, pageurl
 * 2. Receive task ID in format "OK|taskId"
 * 3. Poll res.php until solution is ready
 * 4. Receive token in format "OK|token"
 */
import axios from "axios";
import config from "../../config";
import { logger } from "../../monitoring/logger";
import { TwoCaptchaApiError } from "../../shared/errors/captcha.errors";

const API_BASE = "https://2captcha.com";
const POLL_INTERVAL_MS = 5000; // 2Captcha recommends 5 seconds between polls
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max wait (human workers need more time)

export class TwoCaptchaClient {
  private apiKey: string;

  constructor(apiKey: string = config.twoCaptchaApiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Check if the 2Captcha API key is configured.
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Solve an hCaptcha challenge via the 2Captcha API.
   *
   * Returns the solution token to inject into h-captcha-response,
   * or null if solving failed.
   */
  async solveHCaptcha(sitekey: string, pageurl: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn("2Captcha: API key not configured");
      return null;
    }

    try {
      // Step 1: Submit the hCaptcha task
      logger.info(
        { sitekey: sitekey.substring(0, 12) + "...", pageurl },
        "2Captcha: submitting hCaptcha"
      );

      const submitResponse = await axios.get(`${API_BASE}/in.php`, {
        params: {
          key: this.apiKey,
          method: "hcaptcha",
          sitekey,
          pageurl,
          json: 1,
        },
        timeout: 30000,
      });

      const submitData = submitResponse.data;

      if (submitData.status !== 1) {
        this.logApiError(submitData, "hCaptcha submit");
        return null;
      }

      const taskId = submitData.request;
      logger.info(
        { taskId },
        "2Captcha: hCaptcha submitted, polling for solution (human workers)"
      );

      // Step 2: Poll for the solution
      return await this.pollResult(taskId);
    } catch (error: any) {
      const msg = error.message || "Unknown error";
      logger.error(
        { error: msg, sitekey: sitekey.substring(0, 12) + "..." },
        "2Captcha: hCaptcha request failed"
      );
      throw new TwoCaptchaApiError(msg);
    }
  }

  /**
   * Poll 2Captcha for the hCaptcha solution.
   * Human workers typically take 20-60 seconds.
   */
  private async pollResult(taskId: string): Promise<string | null> {
    // Wait initial 10 seconds before first poll (2Captcha recommendation)
    await new Promise((resolve) => setTimeout(resolve, 10000));

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      try {
        const response = await axios.get(`${API_BASE}/res.php`, {
          params: {
            key: this.apiKey,
            action: "get",
            id: taskId,
            json: 1,
          },
          timeout: 10000,
        });

        const data = response.data;

        if (data.status === 1) {
          // Solution ready
          const token = data.request as string;
          logger.info(
            { taskId, tokenLength: token.length },
            "2Captcha: hCaptcha solved successfully"
          );
          return token;
        }

        if (data.request === "CAPCHA_NOT_READY") {
          // Still processing
          if (i > 0 && i % 6 === 0) {
            logger.debug(
              { taskId, elapsed: `${10 + (i * POLL_INTERVAL_MS) / 1000}s` },
              "2Captcha: still waiting for hCaptcha solution"
            );
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          continue;
        }

        // Error occurred
        this.logApiError(data, "hCaptcha poll");
        return null;
      } catch (error) {
        logger.warn(
          { taskId, error: (error as Error).message },
          "2Captcha: poll request failed, retrying"
        );
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }

    logger.warn(
      { taskId, maxWait: `${10 + (MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s` },
      "2Captcha: hCaptcha polling timed out"
    );
    return null;
  }

  /**
   * Log 2Captcha API errors with context.
   */
  private logApiError(data: any, context: string): void {
    const errorCode = data.request || data.error_text || "UNKNOWN";

    const errorMessages: Record<string, string> = {
      ERROR_WRONG_USER_KEY: "invalid API key",
      ERROR_KEY_DOES_NOT_EXIST: "API key does not exist",
      ERROR_ZERO_BALANCE: "zero balance — add funds",
      ERROR_NO_SLOT_AVAILABLE: "no workers available, try again later",
      ERROR_CAPTCHA_UNSOLVABLE: "captcha could not be solved",
      ERROR_BAD_DUPLICATES: "too many duplicate requests",
      IP_BANNED: "IP address is banned",
      ERROR_SITEKEY: "invalid sitekey",
      ERROR_PAGEURL: "invalid page URL",
    };

    const message = errorMessages[errorCode] || `unknown error: ${errorCode}`;
    logger.warn({ errorCode, response: data }, `2Captcha: ${context} — ${message}`);
  }
}
