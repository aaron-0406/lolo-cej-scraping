/**
 * Binnacle Extractor
 *
 * Parses binnacle (case timeline) data from the CEJ website DOM.
 * Extracts structured data from numbered panels (#pnlSeguimiento1, #pnlSeguimiento2, etc.)
 * after clicking the #command > button on the results page.
 *
 * The CEJ displays each binnacle entry in its own numbered panel with
 * label-based fields (e.g., "Fecha de Resolución:", "Acto:", etc.).
 */
import { Page } from "puppeteer";
import { RawBinnacleEntry } from "../../shared/types/scrape-result.types";
import { CEJ } from "../../config/constants";
import { logger } from "../../monitoring/logger";

/**
 * Extract all binnacle entries from the current page.
 * Assumes the page is already on the case file detail view
 * after clicking #command > button.
 *
 * Uses numbered panels (#pnlSeguimiento1, #pnlSeguimiento2, ...)
 * matching the actual CEJ DOM structure.
 */
export async function extractBinnacles(page: Page): Promise<RawBinnacleEntry[]> {
  try {
    // Wait for the first numbered binnacle panel or the generic panel
    await Promise.race([
      page.waitForSelector(CEJ.SELECTORS.BINNACLE_PANEL_NUMBERED, {
        timeout: CEJ.WAIT_TIMEOUT_MS,
      }).catch(() => {}),
      page.waitForSelector(CEJ.SELECTORS.BINNACLE_PANEL, {
        timeout: CEJ.WAIT_TIMEOUT_MS,
      }).catch(() => {}),
    ]);

    // Additional wait for all panels to render
    await new Promise((r) => setTimeout(r, 3000));

    // Extract binnacle data from numbered panels (matching old scraper approach)
    const binnacles = await page.evaluate(() => {
      const results: any[] = [];
      let index = 1;

      // Helper: extract text content after a label within an element
      function extractTextContent(element: Element, label: string): string | null {
        const allElements = Array.from(element.querySelectorAll("*"));
        const labelElement = allElements.find((el) =>
          el.textContent?.includes(label)
        );
        if (labelElement) {
          const textContent = labelElement.textContent || "";
          const labelIndex = textContent.indexOf(label);
          if (labelIndex !== -1) {
            return textContent
              .substring(labelIndex + label.length)
              .trim()
              .split("\n")[0]
              .trim();
          }
        }
        return null;
      }

      // Helper: get download link from a panel
      function getEnlaceDescarga(element: Element): string | null {
        const enlace = element.querySelector(".dBotonDesc a.aDescarg");
        return enlace ? (enlace as HTMLAnchorElement).href : null;
      }

      while (true) {
        const pnlSeguimiento = document.querySelector(
          `#pnlSeguimiento${index}`
        );

        if (!pnlSeguimiento) {
          break;
        }

        const data = {
          index,
          resolutionDate: extractTextContent(pnlSeguimiento, "Fecha de Resolución:"),
          entryDate: extractTextContent(pnlSeguimiento, "Fecha de Ingreso:"),
          resolution: extractTextContent(pnlSeguimiento, "Resolución:") ?? "",
          notificationType:
            extractTextContent(pnlSeguimiento, "Tipo de Notificación:") === "Acto:"
              ? ""
              : extractTextContent(pnlSeguimiento, "Tipo de Notificación:"),
          acto: extractTextContent(pnlSeguimiento, "Acto:"),
          fojas: extractTextContent(pnlSeguimiento, "Fojas:"),
          folios: extractTextContent(pnlSeguimiento, "Folios:"),
          proveido: extractTextContent(pnlSeguimiento, "Proveido:"),
          sumilla: extractTextContent(pnlSeguimiento, "Sumilla:"),
          userDescription: extractTextContent(pnlSeguimiento, "Descripción de Usuario:"),
          notifications: [] as any[],
          urlDownload: getEnlaceDescarga(pnlSeguimiento),
        };

        results.push(data);
        index++;
      }

      // Fallback: try the old table-based approach if no numbered panels found
      if (results.length === 0) {
        const rows = document.querySelectorAll(
          "#pnlSeguimiento table tbody tr"
        );
        rows.forEach((row, idx) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 6) return;

          results.push({
            index: idx + 1,
            resolutionDate: cells[0]?.textContent?.trim() || null,
            entryDate: cells[1]?.textContent?.trim() || null,
            resolution: cells[2]?.textContent?.trim() || null,
            notificationType: cells[3]?.textContent?.trim() || null,
            acto: cells[4]?.textContent?.trim() || null,
            fojas: cells[5]?.textContent?.trim() || null,
            folios: cells[6]?.textContent?.trim() || null,
            proveido: cells[7]?.textContent?.trim() || null,
            sumilla: cells[8]?.textContent?.trim() || null,
            userDescription: cells[9]?.textContent?.trim() || null,
            notifications: [],
            urlDownload: null,
          });
        });
      }

      return results;
    });

    logger.info({ count: binnacles.length }, "Binnacle entries extracted");
    return binnacles;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      "Failed to extract binnacles"
    );
    return [];
  }
}
