/**
 * File Extractor
 *
 * Identifies downloadable files attached to binnacle entries.
 * Returns file metadata (URL, name) without downloading — actual
 * downloading is handled by the FileDownloader.
 */
import { Page } from "puppeteer";
import { ExtractedFileInfo } from "../../shared/types/cej.types";
import { logger } from "../../monitoring/logger";

/**
 * Check if a binnacle entry has a downloadable file attachment.
 *
 * @param page - Current Puppeteer page
 * @param downloadUrl - URL extracted from the binnacle entry
 * @returns File info if a download is available, null otherwise
 */
export async function extractFileInfo(
  page: Page,
  downloadUrl: string | null
): Promise<Partial<ExtractedFileInfo> | null> {
  if (!downloadUrl) return null;

  try {
    // Extract the filename from the URL or page context
    const urlParts = downloadUrl.split("/");
    const originalName = urlParts[urlParts.length - 1] || "document";
    const extension = originalName.split(".").pop() || "pdf";

    return {
      url: downloadUrl,
      originalName,
      extension,
    };
  } catch (error) {
    logger.warn(
      { downloadUrl, error: (error as Error).message },
      "Failed to extract file info"
    );
    return null;
  }
}
