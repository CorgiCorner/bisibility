import type { ScheduleSpend } from "./review-decision";

/** Isolates existing authorization/store characterizations from the spend admission suite. */
export async function loadNoScheduleSpend() {
  const spend: ScheduleSpend = {
    before: { cadence: null, members: 0, unitCents: 0 },
    after: { cadence: null, members: 0, unitCents: 0 },
    manualToScheduled: false,
    now: new Date(),
    operation: "noop",
    projectDepth: 20,
    providerBefore: null,
    providerAfter: null,
  };
  return { revision: "1", guard: { kind: "none" as const }, spend };
}
