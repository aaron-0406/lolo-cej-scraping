/**
 * Content Hashing Utilities
 *
 * Used by the ChangeDetector to compute SHA-256 hashes of normalized
 * binnacle data. Hash comparison is the first step in change detection —
 * if hashes match, no detailed diff is needed (fast path).
 */
import crypto from "crypto";
import { NormalizedBinnacleData } from "../types/change.types";

/**
 * Computes a SHA-256 hash of an array of normalized binnacle entries.
 *
 * The data is JSON-stringified with sorted keys to ensure deterministic output
 * regardless of property insertion order. Entries are sorted by index.
 *
 * @param data - Normalized binnacle entries to hash
 * @returns 64-character hex string (SHA-256)
 */
export function computeHash(data: NormalizedBinnacleData[]): string {
  // Sort entries by index for consistent ordering
  const sorted = [...data].sort((a, b) => a.index - b.index);

  // JSON.stringify with sorted keys for deterministic output
  const serialized = JSON.stringify(sorted, Object.keys(sorted[0] || {}).sort());

  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

/**
 * Computes a SHA-256 hash of an arbitrary string.
 * Used for hashing individual field values during diff comparison.
 */
export function hashString(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
