/**
 * Custom Error Classes for Scraping Operations
 *
 * Each error class maps to an ERROR_CODE in constants.ts.
 * Workers use these to classify failures for retry decisions
 * and SCRAPE_JOB_LOG entries.
 */

/**
 * Base class for all scraping errors.
 * Includes an error code for classification in job logs.
 */
export class ScrapeError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean = true) {
    super(message);
    this.name = "ScrapeError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** CAPTCHA could not be solved after all strategies were tried */
export class CaptchaFailedError extends ScrapeError {
  constructor(message: string = "CAPTCHA solve failed") {
    super(message, "CAPTCHA_FAILED", true);
    this.name = "CaptchaFailedError";
  }
}

/** CEJ website is unreachable (network error, DNS, timeout) */
export class CEJUnreachableError extends ScrapeError {
  constructor(message: string = "CEJ website unreachable") {
    super(message, "CEJ_UNREACHABLE", true);
    this.name = "CEJUnreachableError";
  }
}

/** CEJ detected bot activity and redirected to antibot page */
export class BotDetectedError extends ScrapeError {
  constructor(message: string = "Bot detection triggered") {
    super(message, "BOT_DETECTED", true);
    this.name = "BotDetectedError";
  }
}

/** Case number does not exist on CEJ (404 equivalent) */
export class InvalidCaseNumberError extends ScrapeError {
  constructor(caseNumber: string) {
    super(
      `Case number not found on CEJ: ${caseNumber}`,
      "INVALID_CASE_NUMBER",
      false // Do NOT retry — mark isScanValid = false
    );
    this.name = "InvalidCaseNumberError";
  }
}

/** Puppeteer browser crashed or became unresponsive */
export class BrowserCrashError extends ScrapeError {
  constructor(message: string = "Browser crashed") {
    super(message, "BROWSER_CRASH", true);
    this.name = "BrowserCrashError";
  }
}

/** Data extracted from CEJ failed schema validation */
export class ValidationFailedError extends ScrapeError {
  constructor(message: string = "Data validation failed") {
    super(message, "VALIDATION_FAILED", false);
    this.name = "ValidationFailedError";
  }
}

/** Page or navigation timed out */
export class TimeoutError extends ScrapeError {
  constructor(message: string = "Page timeout") {
    super(message, "TIMEOUT", true);
    this.name = "TimeoutError";
  }
}
