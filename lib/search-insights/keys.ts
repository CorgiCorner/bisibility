import "server-only";

import { createHash } from "node:crypto";
import { normalizeStoredGscProperty } from "@/lib/providers/analytics/property-id";

// A NUL byte cannot appear in a query string or a URL, so joined parts never collide.
const PART_SEPARATOR = "\u0000";

// Dimension values are long enough to overflow a btree index row, so rows are keyed by this hash.
export function dimensionKeyHash(parts: readonly string[]) {
  return createHash("sha256").update(parts.join(PART_SEPARATOR)).digest("hex");
}

/**
 * The single derivation of the `property` column. Every daily row and every import row is written
 * and read under this string, so a writer that stores the raw connection value instead produces
 * rows no read of the module can find. Null means the stored value is not a property at all.
 */
export function searchInsightsPropertyKey(storedProperty: string): string | null {
  const normalized = normalizeStoredGscProperty(storedProperty);
  return normalized.ok ? normalized.value : null;
}
