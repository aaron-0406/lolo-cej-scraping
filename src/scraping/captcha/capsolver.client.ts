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
   * Tries multiple task types in order: Enterprise, Turbo, then standard.
   *
   * Returns the solution token to inject into h-captcha-response,
   * or null if solving failed.
   */
  async solveHCaptcha(sitekey: string, pageurl: string): Promise<string | null> {
    // Log API key status for debugging
    if (!this.apiKey || this.apiKey.length === 0) {
      logger.error("CapSolver: API key is NOT configured (CAPTCHA_API_KEY env var missing)");
      throw new CapSolverApiError("CapSolver API key not configured");
    }
    logger.debug(
      { keyPrefix: this.apiKey.substring(0, 8) + "...", keyLength: this.apiKey.length },
      "CapSolver: using API key"
    );

    // Try different task types - Radware may use hCaptcha Enterprise
    const taskTypes = [
      "HCaptchaEnterpriseTaskProxyLess",
      "HCaptchaTurboTask",
      "HCaptchaTaskProxyLess",
    ];

    for (const taskType of taskTypes) {
      try {
        logger.info(
          { sitekey: sitekey.substring(0, 12) + "...", pageurl, taskType },
          "CapSolver: submitting hCaptcha"
        );

        const response = await axios.post(
          `${API_URL}/createTask`,
          {
            clientKey: this.apiKey,
            task: {
              type: taskType,
              websiteURL: pageurl,
              websiteKey: sitekey,
              userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Safari/537.36",
            },
          },
          { timeout: 30000 }
        );

        if (response.data.errorId !== 0) {
          const errorCode = response.data.errorCode || "UNKNOWN";
          // If this task type is not supported, try the next one
          if (errorCode === "ERROR_INVALID_TASK_DATA") {
            logger.warn(
              { taskType, errorCode },
              "CapSolver: task type not supported, trying next"
            );
            continue;
          }
          this.logApiError(response.data, "hCaptcha submit");
          return null;
        }

        const taskId = response.data.taskId;
        logger.info({ taskId, taskType }, "CapSolver: hCaptcha submitted, polling for solution");

        // Poll for solution (hCaptcha takes 20-60s typically)
        const result = await this.pollHCaptchaResult(taskId);
        if (result) {
          return result;
        }
      } catch (error: any) {
        // Extract detailed error info from axios
        const responseData = error.response?.data;
        const statusCode = error.response?.status;
        const errorCode = responseData?.errorCode;

        // If this task type is not supported, try the next one
        if (statusCode === 400 && errorCode === "ERROR_INVALID_TASK_DATA") {
          logger.warn(
            { taskType, errorCode },
            "CapSolver: task type not supported, trying next"
          );
          continue;
        }

        const msg = error.message || "Unknown error";
        logger.error(
          {
            error: msg,
            statusCode,
            responseData,
            taskType,
            sitekey: sitekey.substring(0, 12) + "...",
          },
          "CapSolver: hCaptcha request failed"
        );
        // Don't throw yet, try next task type
      }
    }

    // All task types failed
    throw new CapSolverApiError("hCaptcha solve failed: all task types exhausted");
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
