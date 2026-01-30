/**
 * Structured Diff Utilities
 *
 * Computes detailed differences between old and new binnacle data.
 * Used when the content hash differs — identifies exactly which
 * binnacles are new, modified, or removed.
 *
 * The diff result feeds into SCRAPE_CHANGE_LOG entries.
 */
import {
  NormalizedBinnacleData,
  ChangeEntry,
  ChangeType,
} from "../types/change.types";

/**
 * Computes structured differences between two sets of normalized binnacle data.
 *
 * Strategy:
 * 1. Build a map of old entries keyed by (resolutionDate + entryDate + index).
 * 2. For each new entry, check if a matching old entry exists.
 * 3. If no match → NEW_BINNACLE.
 * 4. If match exists → compare fields → MODIFIED_BINNACLE for each changed field.
 * 5. Old entries with no match in new data → REMOVED_BINNACLE.
 *
 * @param oldData - Previous snapshot's normalized data
 * @param newData - Newly scraped normalized data
 * @returns Array of detected changes
 */
export function computeStructuredDiff(
  oldData: NormalizedBinnacleData[],
  newData: NormalizedBinnacleData[]
): ChangeEntry[] {
  const changes: ChangeEntry[] = [];
  const now = new Date();

  // Build lookup map from old data using a composite key
  const oldMap = new Map<string, NormalizedBinnacleData>();
  for (const entry of oldData) {
    const key = buildEntryKey(entry);
    oldMap.set(key, entry);
  }

  // Track which old entries were matched
  const matchedOldKeys = new Set<string>();

  // Compare each new entry against old data
  for (const newEntry of newData) {
    const key = buildEntryKey(newEntry);
    const oldEntry = oldMap.get(key);

    if (!oldEntry) {
      // New binnacle not present in previous snapshot
      changes.push({
        changeType: "NEW_BINNACLE",
        detectedAt: now,
        newValue: JSON.stringify(newEntry),
      });
    } else {
      matchedOldKeys.add(key);

      // Compare individual fields for modifications
      const fieldChanges = compareFields(oldEntry, newEntry, now);
      changes.push(...fieldChanges);
    }
  }

  // Check for removed entries (in old but not in new)
  for (const [key, oldEntry] of oldMap) {
    if (!matchedOldKeys.has(key)) {
      changes.push({
        changeType: "REMOVED_BINNACLE",
        detectedAt: now,
        oldValue: JSON.stringify(oldEntry),
      });
    }
  }

  return changes;
}

/**
 * Builds a composite key for a binnacle entry to identify it across snapshots.
 * Uses resolutionDate + entryDate + resolution text as the identity.
 */
function buildEntryKey(entry: NormalizedBinnacleData): string {
  return `${entry.resolutionDate || ""}|${entry.entryDate || ""}|${entry.resolution || ""}`;
}

/**
 * Compares individual fields of two binnacle entries.
 * Returns MODIFIED_BINNACLE changes for each field that differs.
 */
function compareFields(
  oldEntry: NormalizedBinnacleData,
  newEntry: NormalizedBinnacleData,
  detectedAt: Date
): ChangeEntry[] {
  const changes: ChangeEntry[] = [];

  const fieldsToCompare: (keyof NormalizedBinnacleData)[] = [
    "notificationType",
    "acto",
    "fojas",
    "folios",
    "provedioDate",
    "sumilla",
    "userDescription",
    "notificationCount",
  ];

  for (const field of fieldsToCompare) {
    const oldVal = String(oldEntry[field] ?? "");
    const newVal = String(newEntry[field] ?? "");

    if (oldVal !== newVal) {
      changes.push({
        changeType: "MODIFIED_BINNACLE",
        fieldName: field,
        oldValue: oldVal,
        newValue: newVal,
        detectedAt,
      });
    }
  }

  return changes;
}
