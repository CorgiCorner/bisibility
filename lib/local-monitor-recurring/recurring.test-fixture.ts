import { requirePublicId } from "@/lib/db/public-id-resources";
import { command, now } from "@/lib/local-monitor-launch/launch.test-fixture";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { RecurringApprovalSnapshot } from "./schema";

export { now };
export const calendar = {
  scheduleId: "schedule-db",
  publicId: requirePublicId("sch_abcdefghijklmnopqrstuvwx", "sch"),
  measurementEpoch: "5",
  frequency: "daily" as const,
  cronExpression: null,
  timeOfDay: "14:00",
  timezone: "Europe/Warsaw",
  jitterMinutes: 0,
  serpDepth: null,
  providerPolicy: null,
};
const { consentToken, ...manual } = command;
export const policy: RecurringApprovalSnapshot = {
  ...manual,
  expectedVersion: 1,
  actorId: "actor",
  internalProjectId: "db-project",
  connectionStamp: "b".repeat(64),
  definitionHash: "d".repeat(64),
  calendar,
  scheduleId: calendar.publicId,
  expectedScheduleEpoch: "5",
  maximumPerOccurrenceCents: "0.06",
  maximumTotalCents: "0.12",
  maximumOccurrences: 2,
  validUntil: "2026-11-01T00:00:00.000Z",
  catchUp: "skip_elapsed",
  quote: {
    ...manual.quote,
    nativeEstimates: [
      { unit: "cents", amount: "0.06" },
      { unit: "USD", amount: "0.0006" },
    ],
  },
};
export const approval = {
  id: "approval",
  projectId: "db-project",
  monitorId: "db-monitor",
  scheduleIntentId: "scheduled-intent",
  definitionRevisionId: policy.revisionId,
  monitorVersion: 2,
  actorId: "actor",
  snapshot: policy,
  contentHash: localDigest(policy),
  approvalDigest: "a".repeat(64),
  approvedAt: new Date("2026-10-11T12:00:00Z"),
  validUntil: new Date(policy.validUntil),
};
