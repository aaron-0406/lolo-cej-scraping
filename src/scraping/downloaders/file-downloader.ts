/**
 * File Downloader
 *
 * Downloads attached documents from CEJ binnacle entries.
 * Files are downloaded to a temporary local directory and then
 * uploaded to S3 by the FileRepository.
 */
import { Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { ExtractedFileInfo } from "../../shared/types/cej.types";
import { logger } from "../../monitoring/logger";
import config from "../../config";

const DOWNLOAD_DIR = path.join(os.tmpdir(), "lolo-cej-downloads");

/**
 * Ensure the download directory exists.
 */
function ensureDownloadDir(): void {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
}

/**
 * Download a file from a binnacle entry's download URL.
 *
 * Uses Puppeteer's CDP session to intercept the download and
 * save it to a local temporary directory.
 *
 * @param page - Puppeteer page instance
 * @param fileInfo - Partial file info with URL and name
 * @returns Complete file info with local path and size, or null if download failed
 */
export async function downloadFile(
  page: Page,
  fileInfo: Partial<ExtractedFileInfo>
): Promise<ExtractedFileInfo | null> {
  if (!fileInfo.url) return null;

  ensureDownloadDir();
  const localFilename = `${uuidv4()}.${fileInfo.extension || "pdf"}`;
  const localPath = path.join(DOWNLOAD_DIR, localFilename);

  try {
    // Set up CDP download behavior
    const client = await page.createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: DOWNLOAD_DIR,
    });

    // Navigate to the download URL
    const response = await page.goto(fileInfo.url, {
      waitUntil: "networkidle2",
      timeout: config.pageTimeoutMs,
    });

    if (!response || !response.ok()) {
      logger.warn(
        { url: fileInfo.url, status: response?.status() },
        "File download HTTP error"
      );
      return null;
    }

    // Read the response buffer and write to local file
    const buffer = await response.buffer();
    fs.writeFileSync(localPath, buffer);

    const stats = fs.statSync(localPath);

    logger.debug(
      { url: fileInfo.url, localPath, size: stats.size },
      "File downloaded successfully"
    );

    return {
      url: fileInfo.url,
      originalName: fileInfo.originalName || "document",
      extension: fileInfo.extension || "pdf",
      size: stats.size,
      localPath,
    };
  } catch (error) {
    logger.warn(
      { url: fileInfo.url, error: (error as Error).message },
      "File download failed"
    );
    // Clean up partial download
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    return null;
  }
}

/**
 * Clean up a temporary downloaded file after it has been uploaded to S3.
 *
 * @param localPath - Path to the temporary file
 */
export function cleanupDownload(localPath: string): void {
  try {
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } catch (error) {
    logger.warn(
      { localPath, error: (error as Error).message },
      "Failed to cleanup downloaded file"
    );
  }
}
