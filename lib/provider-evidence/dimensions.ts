export const TRAY_RECENT_WINDOW_MS = 15 * 60 * 1000;
export const PROVIDER_INCIDENT_OPEN_SLOT = "open";

export type StoredCostCertaintyMapping = {
  accounting: "measured" | "unknown" | null;
  exhaustionStatus: "not_applicable" | "pending" | null;
};

/** Maps the receipt certainty that is already stored. Anything else stays unclassified. */
export function mapStoredCostCertainty(certainty: string): StoredCostCertaintyMapping {
  if (certainty === "measured")
    return { accounting: "measured", exhaustionStatus: "not_applicable" };
  if (certainty === "unknown") return { accounting: "unknown", exhaustionStatus: "pending" };
  return { accounting: null, exhaustionStatus: null };
}

export function trayDismissalExpiresAt(finishedAt: Date) {
  return new Date(finishedAt.getTime() + TRAY_RECENT_WINDOW_MS);
}
