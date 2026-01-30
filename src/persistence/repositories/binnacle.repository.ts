/**
 * Binnacle Repository
 *
 * CRUD operations for JUDICIAL_BINNACLE records.
 * Creates new binnacle entries from scraped data and updates existing ones.
 */
import { Op } from "sequelize";
import { JudicialBinnacle } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find all existing binnacles for a case file.
 */
export async function findByCaseFileId(caseFileId: number): Promise<any[]> {
  return JudicialBinnacle.findAll({
    where: { judicialFileCaseId: caseFileId },
    order: [["index", "ASC"]],
    paranoid: false,
  });
}

/**
 * Find a binnacle by its composite key (caseFileId + index).
 */
export async function findByIndex(
  caseFileId: number,
  index: number
): Promise<any | null> {
  return JudicialBinnacle.findOne({
    where: { judicialFileCaseId: caseFileId, index },
  });
}

/**
 * Create a new binnacle record.
 *
 * @param data - Normalized binnacle fields
 * @returns Created binnacle record
 */
export async function create(data: Record<string, any>): Promise<any> {
  const binnacle = await JudicialBinnacle.create(data);
  logger.debug(
    { id: binnacle.get("id"), caseFileId: data.judicialFileCaseId, index: data.index },
    "Binnacle created"
  );
  return binnacle;
}

/**
 * Update an existing binnacle record.
 *
 * @param id - Binnacle ID
 * @param data - Fields to update
 */
export async function update(
  id: number,
  data: Record<string, any>
): Promise<void> {
  await JudicialBinnacle.update(data, { where: { id } });
}

/**
 * Upsert binnacles for a case file using bulk operations.
 * Fetches all existing binnacles once, then separates into creates and updates.
 *
 * @param caseFileId - FK to JUDICIAL_CASE_FILE
 * @param normalizedEntries - Array of normalized binnacle data
 * @returns Object with counts of created and updated entries
 */
export async function upsertBinnacles(
  caseFileId: number,
  normalizedEntries: Record<string, any>[]
): Promise<{ created: number; updated: number }> {
  // Single query to load all existing binnacles for this case file
  const existing = await findByCaseFileId(caseFileId);
  const existingByIndex = new Map<number, any>();
  for (const b of existing) {
    existingByIndex.set(b.get("index") as number, b);
  }

  const toCreate: Record<string, any>[] = [];
  const toUpdate: { id: number; data: Record<string, any> }[] = [];

  for (const entry of normalizedEntries) {
    const match = existingByIndex.get(entry.index);
    if (match) {
      toUpdate.push({ id: match.get("id") as number, data: entry });
    } else {
      toCreate.push({ ...entry, judicialFileCaseId: caseFileId });
    }
  }

  // Bulk create new entries
  if (toCreate.length > 0) {
    await JudicialBinnacle.bulkCreate(toCreate);
  }

  // Batch update existing entries (Sequelize doesn't support bulk update
  // with different values per row, so we use Promise.all for parallelism)
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(({ id, data }) =>
        JudicialBinnacle.update(data, { where: { id } })
      )
    );
  }

  logger.info(
    { caseFileId, created: toCreate.length, updated: toUpdate.length, total: normalizedEntries.length },
    "Binnacles upserted"
  );

  return { created: toCreate.length, updated: toUpdate.length };
}
