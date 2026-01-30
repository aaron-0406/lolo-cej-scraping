/**
 * Case File Repository
 *
 * Read and update operations for JUDICIAL_CASE_FILE records.
 * The scraper reads case files to know what to scrape, and updates
 * them after scraping (wasScanned, lastScrapedAt, hasPendingChanges).
 */
import { Op } from "sequelize";
import { JudicialCaseFile, CustomerHasBank, Customer } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find all case files that need scraping for a given CHB.
 * Filters: not archived, scrape enabled, scan valid.
 *
 * @param customerHasBankId - FK to CUSTOMER_HAS_BANK
 * @returns Case files eligible for scraping
 */
export async function findScrapeable(
  customerHasBankId: number
): Promise<any[]> {
  return JudicialCaseFile.findAll({
    where: {
      customerHasBankId,
      isArchived: false,
      scrapeEnabled: true,
      isScanValid: true,
    },
    order: [["createdAt", "ASC"]],
  });
}

/**
 * Find all scrapeable case files across all active CHBs.
 * Joins through CUSTOMER_HAS_BANK → CUSTOMER to check isScrapperActive.
 *
 * @returns All eligible case files with CHB and customer info
 */
export async function findAllScrapeable(): Promise<any[]> {
  return JudicialCaseFile.findAll({
    where: {
      isArchived: false,
      scrapeEnabled: true,
      isScanValid: true,
    },
    include: [
      {
        model: CustomerHasBank,
        as: "customerHasBank",
        required: true,
        include: [
          {
            model: Customer,
            as: "customer",
            required: true,
            where: { isScrapperActive: true, state: 1 },
          },
        ],
      },
    ],
    order: [["createdAt", "ASC"]],
  });
}

/**
 * Find a single case file by ID.
 */
export async function findById(id: number): Promise<any | null> {
  return JudicialCaseFile.findByPk(id);
}

/**
 * Update a case file after successful scraping.
 *
 * @param id - Case file ID
 * @param hasChanges - Whether changes were detected in this scrape
 */
export async function markScraped(
  id: number,
  hasChanges: boolean
): Promise<void> {
  await JudicialCaseFile.update(
    {
      wasScanned: true,
      lastScrapedAt: new Date(),
      hasPendingChanges: hasChanges,
    },
    { where: { id } }
  );
}

/**
 * Clear the pending changes flag after notification dispatch.
 */
export async function clearPendingChanges(id: number): Promise<void> {
  await JudicialCaseFile.update(
    { hasPendingChanges: false },
    { where: { id } }
  );
}
