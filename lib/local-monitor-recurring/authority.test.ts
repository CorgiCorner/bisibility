import { prisma } from "@/lib/db/prisma";
import type { MonitorJob } from "@/lib/local-monitor-worker/contracts";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertRecurringWorkerAuthority } from "./authority";
import { approval, now, policy } from "./recurring.test-fixture";

const f = vi.hoisted(() => ({
  approval: vi.fn(),
  current: vi.fn(),
  calendar: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
vi.mock("./repository", () => ({ loadRecurringApproval: f.approval }));
vi.mock("./config", () => ({ recurringMonitorsEnabled: f.enabled }));
vi.mock("@/lib/local-monitor-launch/snapshot", () => ({ currentMonitorLaunchSnapshot: f.current }));
vi.mock("@/lib/local-monitor-store/references", () => ({ loadMonitorCalendar: f.calendar }));
const definition = { immutable: "typed captured source provided by the real snapshot port" };
const current = {
  monitor: { id: "db-monitor", version: 2 },
  revision: { id: policy.revisionId },
  intent: { id: "scheduled-intent", mode: "scheduled" },
  connectionStamp: policy.connectionStamp,
  definition,
};
const {
  actorId,
  internalProjectId,
  connectionStamp,
  definitionHash,
  calendar,
  maximumPerOccurrenceCents,
  maximumTotalCents,
  maximumOccurrences,
  validUntil,
  catchUp,
  scheduleId,
  expectedScheduleEpoch,
  ...command
} = policy;
const job: MonitorJob = {
  id: "job",
  publicId: "lmj_abcdefghijklmnopqrstuvwx",
  projectId: "db-project",
  monitorId: "db-monitor",
  actorId: "actor",
  command: { ...command, expectedVersion: 2, scheduleIntentId: "scheduled-intent" },
  bodyHash: "a".repeat(64),
  keyHash: "b".repeat(64),
  connectionStamp: policy.connectionStamp,
  consentDigest: approval.approvalDigest,
  approvedAt: now,
  expiresAt: new Date(policy.quote.expiresAt),
  runId: null,
  pollIntervalMs: 30000,
  collectionDeadline: new Date("2026-10-13T12:00:00Z"),
  state: "running",
  reason: null,
  leaseToken: "token",
  leaseVersion: 1,
  leaseExpiresAt: new Date("2026-10-12T12:05:00Z"),
  version: 1,
  origin: "scheduled",
  recurringApprovalId: "approval",
  recurringOccurrenceKey: "2026-10-12",
};
const scope = { actor: { id: "actor" }, project: { id: "db-project", publicId: policy.projectId } };
// Get trusted project context through its typed exported port in production; this test invokes it through a mock.
const context = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: context.scope }));

import { localProjectScope } from "@/lib/local-monitoring-store/access";

async function verify(value = job) {
  return prisma.$transaction(async (tx) =>
    assertRecurringWorkerAuthority(
      tx,
      await localProjectScope(tx, { actor: { id: "actor" } }, policy.projectId, "create"),
      value,
      now,
    ),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  context.scope.mockResolvedValue(scope);
  f.enabled.mockReturnValue(true);
  f.approval.mockResolvedValue({
    ...approval,
    snapshot: { ...policy, definitionHash: localDigest(definition) },
  });
  f.current.mockResolvedValue(current);
  f.calendar.mockResolvedValue(policy.calendar);
});
describe("current recurring first-send proof", () => {
  it("accepts only the persisted approval/calendar/source/custody and exact target taskset", async () => {
    await expect(verify()).resolves.toBeUndefined();
    expect(f.approval).toHaveBeenCalledWith(expect.anything(), "approval");
  });
  it.each([
    { intent: { id: "paused-intent", mode: "paused" } },
    { connectionStamp: "f".repeat(64) },
    { monitor: { id: "db-monitor", version: 3 } },
    { definition: { immutable: "changed" } },
  ])("blocks changed current authority %j", async (delta) => {
    f.current.mockResolvedValue({ ...current, ...delta });
    await expect(verify()).rejects.toThrow();
  });
  it("disallows runtime disabled and expired approvals without extending quotes", async () => {
    f.enabled.mockReturnValue(false);
    await expect(verify()).rejects.toThrow();
    f.enabled.mockReturnValue(true);
    f.approval.mockResolvedValue({ ...approval, validUntil: now });
    await expect(verify()).rejects.toThrow();
  });
  it("cannot apply another approval or cheaper different-scope quote", async () => {
    await expect(verify({ ...job, recurringApprovalId: null })).rejects.toThrow();
    await expect(
      verify({ ...job, command: { ...job.command, targetIds: ["lmt_bbbbbbbbbbbbbbbbbbbbbbbb"] } }),
    ).rejects.toThrow();
  });
  it("does not add recurring authority requirements to manual jobs", async () => {
    f.enabled.mockReturnValue(false);
    await expect(
      verify({ ...job, origin: "manual", recurringApprovalId: null, recurringOccurrenceKey: null }),
    ).resolves.toBeUndefined();
    expect(f.approval).not.toHaveBeenCalled();
  });
});
