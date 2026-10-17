import type { ExceptionsView, UsageView } from "@usagekit/views";
import type { MeteringAdminData, MeteringAdminSection } from "./admin-types";

/** A section page cannot replace the other section's snapshot or current budgets. */
export function mergeMeteringAdminPage(
  current: MeteringAdminData | null,
  next: MeteringAdminData | null,
  section: MeteringAdminSection,
): MeteringAdminData | null {
  if (!next || !["ok", "empty"].includes(next[section].state)) return null;
  if (!current) return next.budgetsOmitted ? null : next;
  return {
    ...current,
    [section]: next[section],
    references: {
      projects: { ...current.references?.projects, ...next.references?.projects },
      connections: { ...current.references?.connections, ...next.references?.connections },
    },
  };
}

/** Internal placeholders are ignored when merging the explicitly requested section. */
export function omittedAdminUsage(): UsageView {
  return {
    state: "unavailable",
    rows: [],
    units: [],
    groupBy: [],
    nextCursor: null,
    asOf: null,
    watermark: null,
    problem: null,
  };
}
export function omittedAdminExceptions(): ExceptionsView {
  return { state: "unavailable", rows: [], nextCursor: null, asOf: null, problem: null };
}
