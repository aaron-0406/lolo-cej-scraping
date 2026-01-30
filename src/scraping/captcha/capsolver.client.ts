/**
 * CapSolver API Client
 *
 * Handles communication with the CapSolver service for solving
 * image-based CAPTCHAs and hCaptcha challenges. Uses the CapSolver
 * REST API (createTask / getTaskResult pattern).
 *
 * API docs: https://docs.capsolver.com
 */
import axios from "axios";
import config from "../../config";
import { logger } from "../../monitoring/logger";
import { CapSolverApiError } from "../../shared/errors/captcha.errors";

const API_URL = "https://api.capsolver.com";
const POLL_INTERVAL_MS = 3000;
const NORMAL_MAX_POLL_ATTEMPTS = 20; // 60 seconds max
const HCAPTCHA_MAX_POLL_ATTEMPTS = 40; // 120 seconds max

export class CapSolverClient {
  private apiKey: string;

  constructor(apiKey: string = config.captchaApiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Submit a normal (image) CAPTCHA for solving.
   * Returns the solved text or null if solving failed.
   */
  async solveNormalCaptcha(imageBase64: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${API_URL}/createTask`,
        {
          clientKey: this.apiKey,
          task: {
            type: "ImageToTextTask",
            body: imageBase64,
            case: false, // case insensitive — we uppercase the result for CEJ
          },
        },
        { timeout: 30000 }
      );

      if (response.data.errorId !== 0) {
        this.logApiError(response.data, "normal CAPTCHA submit");
        return null;
      }

      const taskId = response.data.taskId;

      // If CapSolver returned the solution immediately (common for image CAPTCHAs)
      if (response.data.solution?.text) {
        return (response.data.solution.text as string).toUpperCase();
      }

      // Poll for result
      return await this.pollResult(taskId, NORMAL_MAX_POLL_ATTEMPTS);
    } catch (error) {
      throw new CapSolverApiError((error as Error).message);
    }
  }

  /**
   * Solve an hCaptcha challenge via the CapSolver API.
   *
   * Returns the solution token to inject into h-captcha-response,
   * or null if solving failed.
   */
  async solveHCaptcha(sitekey: string, pageurl: string): Promise<string | null> {
    try {
      logger.info(
        { sitekey: sitekey.substring(0, 12) + "...", pageurl },
        "CapSolver: submitting hCaptcha"
      );

      const response = await axios.post(
        `${API_URL}/createTask`,
        {
          clientKey: this.apiKey,
          task: {
            type: "HCaptchaTaskProxyLess",
            websiteURL: pageurl,
            websiteKey: sitekey,
          },
        },
        { timeout: 30000 }
      );

      if (response.data.errorId !== 0) {
        this.logApiError(response.data, "hCaptcha submit");
        return null;
      }

      const taskId = response.data.taskId;
      logger.info({ taskId }, "CapSolver: hCaptcha submitted, polling for solution");

      // Poll for solution (hCaptcha takes 20-60s typically)
      return await this.pollHCaptchaResult(taskId);
    } catch (error) {
      const msg = (error as Error).message;
      logger.error({ error: msg }, "CapSolver: hCaptcha request failed (network/timeout)");
      throw new CapSolverApiError(`hCaptcha solve failed: ${msg}`);
    }
  }

  /**
   * Poll CapSolver for the image CAPTCHA solution.
   */
  private async pollResult(
    taskId: string,
    maxAttempts: number = NORMAL_MAX_POLL_ATTEMPTS
  ): Promise<string | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await axios.post(
        `${API_URL}/getTaskResult`,
        {
          clientKey: this.apiKey,
          taskId,
        },
        { timeout: 10000 }
      );

      if (response.data.errorId !== 0) {
        logger.warn({ response: response.data }, "CapSolver poll error");
        return null;
      }

      if (response.data.status === "ready") {
        // CEJ CAPTCHAs use uppercase letters
        return (response.data.solution.text as string).toUpperCase();
      }

      // status === "processing" — keep polling
    }

    logger.warn({ taskId }, "CapSolver polling timed out");
    return null;
  }

  /**
   * Poll CapSolver for hCaptcha solution.
   * hCaptcha typically takes 20-60 seconds.
   * Returns the raw token string (not uppercased — hCaptcha tokens are case-sensitive).
   */
  private async pollHCaptchaResult(taskId: string): Promise<string | null> {
    for (let i = 0; i < HCAPTCHA_MAX_POLL_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await axios.post(
        `${API_URL}/getTaskResult`,
        {
          clientKey: this.apiKey,
          taskId,
        },
        { timeout: 10000 }
      );

      if (response.data.errorId !== 0) {
        logger.warn(
          { taskId, response: response.data },
          "CapSolver: hCaptcha poll returned error"
        );
        return null;
      }

      if (response.data.status === "ready") {
        const token = response.data.solution.gRecaptchaResponse as string;
        logger.info(
          { taskId, tokenLength: token.length },
          "CapSolver: hCaptcha solved successfully"
        );
        return token;
      }

      // Still processing
      if (i > 0 && i % 6 === 0) {
        logger.debug(
          { taskId, elapsed: `${(i * POLL_INTERVAL_MS) / 1000}s` },
          "CapSolver: still waiting for hCaptcha solution"
        );
      }
    }

    logger.warn(
      { taskId, maxWait: `${(HCAPTCHA_MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s` },
      "CapSolver: hCaptcha polling timed out"
    );
    return null;
  }

  /**
   * Log CapSolver API errors with context.
   */
  private logApiError(data: any, context: string): void {
    const errorCode = data.errorCode || "UNKNOWN";
    const errorDescription = data.errorDescription || "";

    if (errorCode === "ERROR_KEY_DOES_NOT_EXIST" || errorCode === "ERROR_WRONG_USER_KEY") {
      logger.error({ errorCode }, `CapSolver: invalid API key (${context})`);
    } else if (errorCode === "ERROR_ZERO_BALANCE") {
      logger.error({ errorCode }, `CapSolver: zero balance — add funds (${context})`);
    } else if (errorCode === "ERROR_NO_SLOT_AVAILABLE") {
      logger.warn({ errorCode }, `CapSolver: no workers available (${context})`);
    } else {
      logger.warn(
        { errorCode, errorDescription, response: data },
        `CapSolver: ${context} rejected`
      );
    }
  }
}
