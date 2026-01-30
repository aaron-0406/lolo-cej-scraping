/**
 * Data Validator
 *
 * Validates scraped data against expected schemas using Joi.
 * Catches malformed or suspicious data before it reaches the database.
 *
 * Validation runs after normalization but before persistence.
 */
import Joi from "joi";
import { RawBinnacleEntry, ScrapeResult } from "../shared/types/scrape-result.types";
import { ValidationFailedError } from "../shared/errors/scrape.errors";
import { logger } from "../monitoring/logger";

/**
 * Schema for a single binnacle entry.
 */
const binnacleEntrySchema = Joi.object({
  index: Joi.number().integer().min(0).required(),
  resolutionDate: Joi.string().allow(null, ""),
  entryDate: Joi.string().allow(null, ""),
  resolution: Joi.string().allow(null, ""),
  notificationType: Joi.string().allow(null, ""),
  acto: Joi.string().allow(null, ""),
  fojas: Joi.string().allow(null, ""),
  folios: Joi.string().allow(null, ""),
  proveido: Joi.string().allow(null, ""),
  sumilla: Joi.string().allow(null, ""),
  userDescription: Joi.string().allow(null, ""),
  notifications: Joi.array().items(Joi.object()).default([]),
  urlDownload: Joi.string().uri().allow(null, ""),
});

/**
 * Schema for a complete scrape result.
 */
const scrapeResultSchema = Joi.object({
  caseFileId: Joi.number().integer().positive().required(),
  customerHasBankId: Joi.number().integer().positive().required(),
  success: Joi.boolean().required(),
  binnacles: Joi.array().items(binnacleEntrySchema).required(),
  binnacleCount: Joi.number().integer().min(0).required(),
  scrapedAt: Joi.date().required(),
  durationMs: Joi.number().integer().min(0).required(),
  error: Joi.string().allow(null, ""),
  errorCode: Joi.string().allow(null, ""),
});

/**
 * Validate a complete scrape result.
 * Throws ValidationFailedError if the data is invalid.
 *
 * @param result - Scrape result to validate
 * @returns Validated scrape result
 */
export function validateScrapeResult(result: ScrapeResult): ScrapeResult {
  const { error, value } = scrapeResultSchema.validate(result, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    logger.warn(
      { caseFileId: result.caseFileId, validationErrors: details },
      "Scrape result validation failed"
    );
    throw new ValidationFailedError(`Scrape result validation failed: ${details}`);
  }

  return value;
}

/**
 * Validate a single binnacle entry.
 * Returns null if validation fails (lenient mode for individual entries).
 *
 * @param entry - Raw binnacle entry to validate
 * @returns Validated entry or null
 */
export function validateBinnacleEntry(
  entry: RawBinnacleEntry
): RawBinnacleEntry | null {
  const { error, value } = binnacleEntrySchema.validate(entry, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.debug(
      { index: entry.index, errors: error.details.map((d) => d.message) },
      "Binnacle entry validation failed — skipping entry"
    );
    return null;
  }

  return value;
}

/**
 * Validate and filter an array of binnacle entries.
 * Invalid entries are logged and excluded from the result.
 *
 * @param entries - Raw binnacle entries
 * @returns Only valid entries
 */
export function validateBinnacleEntries(
  entries: RawBinnacleEntry[]
): RawBinnacleEntry[] {
  const valid = entries
    .map(validateBinnacleEntry)
    .filter((e): e is RawBinnacleEntry => e !== null);

  if (valid.length < entries.length) {
    logger.warn(
      { total: entries.length, valid: valid.length, dropped: entries.length - valid.length },
      "Some binnacle entries failed validation"
    );
  }

  return valid;
}
