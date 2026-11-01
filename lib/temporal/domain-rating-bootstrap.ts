import "server-only";

import { ensureSingletonSchedule } from "./bootstrap";

export function ensureDomainRatingSchedule() {
  return ensureSingletonSchedule({
    enabled: true,
    scheduleId: "domain-rating-daily",
    workflowType: "collectDomainRatingsWorkflow",
    // Frequent discovery picks up new connections; persisted claims cap calls at one per UTC day.
    spec: { intervals: [{ every: "1 hour" }] },
    memo: { kind: "domain-rating" },
    note: "Daily domain rating for enabled projects",
  });
}
