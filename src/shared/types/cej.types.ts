/**
 * CEJ-Specific Types
 *
 * Data structures specific to the CEJ (Consulta de Expedientes Judiciales)
 * website and its DOM structure.
 */

/**
 * Result of a CAPTCHA solve attempt.
 */
export interface CaptchaResult {
  /** Whether the CAPTCHA was solved successfully */
  solved: boolean;
  /** The solution text entered into the CAPTCHA input */
  solution?: string;
  /** Which strategy was used to solve it */
  strategy?: "normal" | "hcaptcha" | "audio";
  /** Whether the case file was found after CAPTCHA solve */
  caseFileFound?: boolean;
  /** Whether bot detection was triggered */
  botDetected?: boolean;
}

/**
 * State of a page after navigation and CAPTCHA solving.
 * Used to determine the next action in the scraping flow.
 */
export interface PageState {
  /** URL of the current page */
  currentUrl: string;
  /** Whether we landed on the antibot page */
  isAntibotPage: boolean;
  /** Whether the results table is visible */
  hasResults: boolean;
  /** Whether the no-results warning is visible */
  hasNoResults: boolean;
  /** Whether the binnacle panel is visible */
  hasBinnaclePanel: boolean;
  /** Whether the CAPTCHA error element is visible (wrong code entered) */
  hasCaptchaError?: boolean;
}

/**
 * File information extracted from a binnacle entry's download link.
 */
export interface ExtractedFileInfo {
  /** Original URL of the file on CEJ */
  url: string;
  /** Original filename from the download */
  originalName: string;
  /** File extension */
  extension: string;
  /** File size in bytes (after download) */
  size: number;
  /** Local path where file is temporarily stored */
  localPath: string;
}
