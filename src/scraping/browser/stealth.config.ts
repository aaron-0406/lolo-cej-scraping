/**
 * Browser Configuration
 *
 * Configures puppeteer-extra for browser automation on CEJ.
 * CAPTCHA solving is handled directly via the CapSolver REST API
 * (no puppeteer plugin needed). No stealth plugin is used — the old
 * working scraper (lolo-backend-scraping) works without it.
 * No custom user agents are set — using the default Puppeteer UA
 * avoids fingerprint mismatches that trigger Radware Bot Manager.
 */
import puppeteer from "puppeteer-extra";

/**
 * Initialize Puppeteer (no plugins needed — CapSolver uses REST API directly).
 * Must be called once before launching any browsers.
 */
export function initStealthPuppeteer(): typeof puppeteer {
  return puppeteer;
}

/**
 * Chrome launch arguments matching the old working scraper.
 * Minimal args to avoid detection while keeping memory usage low.
 * --disable-blink-features=AutomationControlled removes the
 * "navigator.webdriver" flag that Radware Bot Manager checks.
 */
export const LAUNCH_ARGS: string[] = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
  "--disable-gpu",
];
