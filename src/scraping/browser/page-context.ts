/**
 * Page Context
 *
 * Wraps the lifecycle of a Puppeteer page for a single scraping job.
 * Ensures pages are always closed after use, even on errors.
 *
 * Usage:
 *   const ctx = new PageContext(browserPool);
 *   try {
 *     const page = await ctx.open();
 *     // ... scrape ...
 *   } finally {
 *     await ctx.close();
 *   }
 */
import { Browser, Page } from "puppeteer";
import { BrowserPool } from "./browser-pool";
import config from "../../config";
import { logger } from "../../monitoring/logger";

export class PageContext {
  private browserPool: BrowserPool;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(browserPool: BrowserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Acquire a browser from the pool and open a new page.
   * Sets default timeouts and navigation settings.
   */
  async open(): Promise<Page> {
    this.browser = await this.browserPool.acquire();
    this.page = await this.browser.newPage();

    // Set timeouts
    this.page.setDefaultTimeout(config.pageTimeoutMs);
    this.page.setDefaultNavigationTimeout(config.navigationTimeoutMs);

    // Block unnecessary resources to speed up page loads.
    // IMPORTANT: Do NOT block images or stylesheets — CEJ's JavaScript depends on
    // Captcha.jpg loading successfully. Blocking it causes the CONSULTAR click
    // to silently fail (the search AJAX never fires).
    await this.page.setRequestInterception(true);
    this.page.on("request", (request) => {
      const type = request.resourceType();
      if (["font", "media"].includes(type)) {
        logger.debug({ url: request.url(), type }, "Blocked resource");
        request.abort();
      } else {
        request.continue();
      }
    });

    // Log failed requests to identify blocked critical resources
    this.page.on("requestfailed", (request) => {
      logger.warn({
        url: request.url(),
        type: request.resourceType(),
        error: request.failure()?.errorText,
      }, "Request failed");
    });

    return this.page;
  }

  /**
   * Close the page and release the browser back to the pool.
   * Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch (error) {
        logger.warn("Failed to close page");
      }
      this.page = null;
    }

    if (this.browser) {
      await this.browserPool.release(this.browser);
      this.browser = null;
    }
  }
}
