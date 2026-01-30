/**
 * Browser Pool
 *
 * Manages a fixed pool of Puppeteer browser instances to avoid the
 * overhead of launching a new Chromium process per scraping job.
 *
 * Key behaviors:
 * - Each browser is recycled after maxPagesPerBrowser pages (prevents memory leaks)
 * - Pool size is capped at maxSize to bound memory usage
 * - acquire() blocks until a browser is available
 * - drain() gracefully shuts down all browsers
 *
 * Architecture decision: One PAGE per job, not one BROWSER per job.
 * Multiple pages can share a browser instance, which is much more
 * memory-efficient than launching separate browser processes.
 */
import { Browser } from "puppeteer";
import { initStealthPuppeteer, LAUNCH_ARGS } from "./stealth.config";
import config from "../../config";
import { logger } from "../../monitoring/logger";

// Initialize puppeteer-extra with reCAPTCHA plugin (no stealth — matches old working scraper)
const puppeteer = initStealthPuppeteer();

interface PooledBrowser {
  browser: Browser;
  /** Number of pages opened on this browser since last recycle */
  pageCount: number;
  /** Whether this browser is currently in use by a worker */
  inUse: boolean;
}

export class BrowserPool {
  private pool: PooledBrowser[] = [];
  private maxSize: number;
  private maxPagesPerBrowser: number;
  private waitQueue: Array<(browser: Browser) => void> = [];

  constructor(
    maxSize: number = config.browserPoolSize,
    maxPagesPerBrowser: number = config.maxPagesPerBrowser
  ) {
    this.maxSize = maxSize;
    this.maxPagesPerBrowser = maxPagesPerBrowser;
  }

  /**
   * Acquire a browser from the pool.
   * If all browsers are in use, waits until one is released.
   * If pool is not at max capacity, launches a new browser.
   */
  async acquire(): Promise<Browser> {
    // Try to find an available browser
    const available = this.pool.find((pb) => !pb.inUse);
    if (available) {
      available.inUse = true;
      available.pageCount++;

      // Recycle if page count exceeded
      if (available.pageCount >= this.maxPagesPerBrowser) {
        logger.info(
          { pageCount: available.pageCount },
          "Browser reached max pages, recycling"
        );
        await this.recycle(available);
        return available.browser;
      }

      return available.browser;
    }

    // If pool is not full, launch a new browser
    if (this.pool.length < this.maxSize) {
      const browser = await this.launchBrowser();
      const pooled: PooledBrowser = { browser, pageCount: 1, inUse: true };
      this.pool.push(pooled);
      return browser;
    }

    // Pool is full and all browsers in use — wait for one to be released
    return new Promise<Browser>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a browser back to the pool after a job completes.
   */
  async release(browser: Browser): Promise<void> {
    const pooled = this.pool.find((pb) => pb.browser === browser);
    if (pooled) {
      pooled.inUse = false;

      // If there are waiting workers, give them this browser
      if (this.waitQueue.length > 0) {
        const resolve = this.waitQueue.shift()!;
        pooled.inUse = true;
        pooled.pageCount++;
        resolve(pooled.browser);
      }
    }
  }

  /**
   * Close and replace a browser instance (memory cleanup).
   */
  private async recycle(pooled: PooledBrowser): Promise<void> {
    try {
      await pooled.browser.close();
    } catch (error) {
      logger.warn("Failed to close browser during recycle");
    }
    pooled.browser = await this.launchBrowser();
    pooled.pageCount = 0;
  }

  /**
   * Gracefully close all browsers. Called during shutdown.
   */
  async drain(): Promise<void> {
    logger.info({ poolSize: this.pool.length }, "Draining browser pool");
    for (const pooled of this.pool) {
      try {
        await pooled.browser.close();
      } catch (error) {
        // Ignore close errors during shutdown
      }
    }
    this.pool = [];
    this.waitQueue = [];
  }

  /** Get current pool statistics for health checks */
  getStats(): { active: number; available: number; max: number } {
    return {
      active: this.pool.filter((pb) => pb.inUse).length,
      available: this.pool.filter((pb) => !pb.inUse).length,
      max: this.maxSize,
    };
  }

  /**
   * Launch a new Puppeteer browser with optimized settings.
   * Chromium args are tuned for container/server environments.
   */
  private async launchBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      headless: true,
      args: LAUNCH_ARGS,
      defaultViewport: { width: 1280, height: 720 },
      timeout: config.navigationTimeoutMs,
      slowMo: 5, // Small delay between Puppeteer actions (matches old working scraper)
    });

    // Override HeadlessChrome UA to avoid Radware detection.
    // Puppeteer v23 new headless mode sets "HeadlessChrome/131.0.0.0" by default,
    // which Radware immediately blocks. Replace with matching Chrome version.
    const version = await browser.version();
    const chromeVersion = version.replace("HeadlessChrome", "Chrome");
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${chromeVersion} Safari/537.36`;

    browser.on("targetcreated", async (target) => {
      const page = await target.page();
      if (page) {
        await page.setUserAgent(userAgent).catch(() => {});
        // Minimal anti-detection patches to bypass Radware Bot Manager
        // without using the full stealth plugin (which breaks jQuery form submission).
        await page.evaluateOnNewDocument(() => {
          // Remove webdriver flag
          Object.defineProperty(navigator, "webdriver", { get: () => undefined });
          // Fake plugins (headless Chrome has empty plugins array)
          Object.defineProperty(navigator, "plugins", {
            get: () => [1, 2, 3, 4, 5],
          });
          // Fake languages
          Object.defineProperty(navigator, "languages", {
            get: () => ["es-PE", "es", "en"],
          });
          // Add chrome runtime object (missing in headless)
          (window as any).chrome = { runtime: {} };
        }).catch(() => {});
      }
    });

    logger.info({ chromeVersion }, "New browser instance launched");
    return browser;
  }
}
