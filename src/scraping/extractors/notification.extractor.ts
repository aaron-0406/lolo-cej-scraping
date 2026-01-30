/**
 * Notification Extractor
 *
 * Extracts notification detail data from binnacle entries on CEJ.
 * Each numbered binnacle panel (#pnlSeguimiento1, etc.) may contain
 * nested notification divs with class .borderinf inside .panel-body.
 */
import { Page } from "puppeteer";
import { RawBinNotification } from "../../shared/types/scrape-result.types";
import { logger } from "../../monitoring/logger";

/**
 * Extract notification records for a specific binnacle entry.
 * Uses the numbered panel approach matching the old working scraper.
 *
 * @param page - Current Puppeteer page
 * @param binnacleIndex - 0-based index (panel number = binnacleIndex + 1 if panels are 1-indexed)
 */
export async function extractNotifications(
  page: Page,
  binnacleIndex: number
): Promise<RawBinNotification[]> {
  try {
    // The binnacle entries use 1-based index for panel IDs
    // but binnacleIndex from the extractor is the array index.
    // We pass the actual panel index stored in the binnacle entry.
    const notifications = await page.evaluate((panelIndex) => {
      // Helper: extract text content after a label within an element
      function extractTextContent(element: Element, label: string): string | null {
        const allElements = Array.from(element.querySelectorAll("*"));
        const labelElement = allElements.find((el) =>
          el.textContent?.includes(label)
        );
        if (labelElement) {
          const textContent = labelElement.textContent || "";
          const labelIdx = textContent.indexOf(label);
          if (labelIdx !== -1) {
            return textContent
              .substring(labelIdx + label.length)
              .trim()
              .split("\n")[0]
              .trim();
          }
        }
        return null;
      }

      function extractNotificationCode(element: Element): string | null {
        const codeElement = element.querySelector("h5.redb");
        if (!codeElement) return null;
        const codeText = codeElement.textContent?.trim().split(" ")[1];
        return codeText !== undefined ? codeText : null;
      }

      const pnlSeguimiento = document.querySelector(
        `#pnlSeguimiento${panelIndex}`
      );
      if (!pnlSeguimiento) return [];

      const notificacionesDivs = pnlSeguimiento.querySelectorAll(
        ".panel-body .borderinf"
      );
      const results: any[] = [];

      notificacionesDivs.forEach((div) => {
        const notificationCode = extractNotificationCode(div);
        if (!notificationCode) return;

        // Get basic notification fields
        const notification: any = {
          notificationCode,
          addressee: extractTextContent(div, "Destinatario:"),
          shipDate: extractTextContent(div, "Fecha de envio:"),
          attachments: extractTextContent(div, "Anexo(s):"),
          deliveryMethod: extractTextContent(div, "Forma de entrega:"),
          resolutionDate: null,
          notificationPrint: null,
          sentCentral: null,
          centralReceipt: null,
          notificationToRecipientOn: null,
          chargeReturnedToCourtOn: null,
        };

        // Try to get additional details from modal
        const btnMasDetalle = div.querySelector(".btnMasDetalle");
        if (btnMasDetalle) {
          const modalId = (btnMasDetalle as HTMLButtonElement).getAttribute(
            "data-target"
          );
          const modal = modalId ? document.querySelector(modalId) : null;
          if (modal) {
            const rd = extractTextContent(modal, "Fecha de Resolución:");
            notification.resolutionDate = rd?.length ? rd : null;
            const np = extractTextContent(modal, "Notificación Impresa el:");
            notification.notificationPrint = np?.length ? np : null;
            const sc = extractTextContent(
              modal,
              "Enviada a la Central de Notificación o Casilla Electrónica:"
            );
            notification.sentCentral = sc?.length ? sc : null;
            const cr = extractTextContent(
              modal,
              "Recepcionada en la central de Notificación el:"
            );
            notification.centralReceipt = cr?.length ? cr : null;
            const ntr = extractTextContent(
              modal,
              "Notificación al destinatario el:"
            );
            notification.notificationToRecipientOn = ntr?.length ? ntr : null;
            const crc = extractTextContent(
              modal,
              "Cargo devuelto al juzgado el:"
            );
            notification.chargeReturnedToCourtOn = crc?.length ? crc : null;
          }
        }

        results.push(notification);
      });

      return results;
    }, binnacleIndex);

    return notifications;
  } catch (error) {
    logger.warn(
      { binnacleIndex, error: (error as Error).message },
      "Failed to extract notifications for binnacle entry"
    );
    return [];
  }
}
