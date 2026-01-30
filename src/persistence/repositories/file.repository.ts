/**
 * File Repository
 *
 * CRUD operations for JUDICIAL_BIN_FILE records.
 * Manages file metadata in the database. Actual file uploads
 * to S3 are handled by the S3 client.
 */
import { JudicialBinFile } from "../db/models";
import { logger } from "../../monitoring/logger";

/**
 * Find all files for a binnacle entry.
 */
export async function findByBinnacleId(binnacleId: number): Promise<any[]> {
  return JudicialBinFile.findAll({
    where: { judicialBinnacleId: binnacleId },
    paranoid: false,
  });
}

/**
 * Create a file record after uploading to S3.
 *
 * @param data - File metadata
 * @returns Created file record
 */
export async function create(data: {
  judicialBinnacleId: number;
  size: number;
  nameOriginAws: string;
  originalName: string;
  customerHasBankId: number;
}): Promise<any> {
  const file = await JudicialBinFile.create({
    judicialBinnacleId: data.judicialBinnacleId,
    size: data.size,
    nameOriginAws: data.nameOriginAws,
    originalName: data.originalName,
    customerHasBankId: data.customerHasBankId,
  });

  logger.debug(
    { id: file.get("id"), binnacleId: data.judicialBinnacleId, name: data.originalName },
    "File record created"
  );

  return file;
}

/**
 * Check if a file already exists for a binnacle (by original name).
 */
export async function existsForBinnacle(
  binnacleId: number,
  originalName: string
): Promise<boolean> {
  const count = await JudicialBinFile.count({
    where: {
      judicialBinnacleId: binnacleId,
      originalName,
    },
  });
  return count > 0;
}
