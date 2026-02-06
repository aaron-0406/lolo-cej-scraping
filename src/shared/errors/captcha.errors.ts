/**
 * CAPTCHA-Specific Error Classes
 *
 * Granular errors for the CAPTCHA solving pipeline.
 * Used internally by captcha strategies; workers see CaptchaFailedError.
 */

/** CapSolver API returned an error or timed out */
export class CapSolverApiError extends Error {
  constructor(message: string = "CapSolver API error") {
    super(message);
    this.name = "CapSolverApiError";
  }
}

/** 2Captcha API returned an error or timed out */
export class TwoCaptchaApiError extends Error {
  constructor(message: string = "2Captcha API error") {
    super(message);
    this.name = "TwoCaptchaApiError";
  }
}

/** Anti-Captcha API returned an error or timed out */
export class AntiCaptchaApiError extends Error {
  constructor(message: string = "Anti-Captcha API error") {
    super(message);
    this.name = "AntiCaptchaApiError";
  }
}

/** CAPTCHA image could not be extracted from the page */
export class CaptchaImageExtractionError extends Error {
  constructor(message: string = "Could not extract CAPTCHA image") {
    super(message);
    this.name = "CaptchaImageExtractionError";
  }
}

/** No CAPTCHA strategy was able to handle the page */
export class CaptchaUnsolvableError extends Error {
  constructor(message: string = "No strategy could solve the CAPTCHA") {
    super(message);
    this.name = "CaptchaUnsolvableError";
  }
}
