import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  db: {
    aiTrackingSchedule: { findMany: vi.fn(), updateMany: vi.fn() },
    aiPrompt: { findMany: vi.fn() },
    aiTrackingRun: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/ai-tracking/admission/launch", () => ({ launchTrackingRun: mocks.launch }));
vi.mock("@/lib/db/public-id-resources", () => ({ makePublicId: () => "public-run" }));

import { planDueTrackingSchedules } from "./sweep";

const now = new Date("2026-10-08T12:00:00Z");
const schedule = {
  id: "schedule",
  projectId: "project",
  cron: "0 12 * * *",
  timezone: "UTC",
  nextRunAt: now,
  configuration: {
    actorId: "actor",
    configurations: [],
    promptIds: ["prompt"],
    credentialConnectionId: "key",
    credentialVersion: "version",
    consentRevision: "consent",
    budgetRevision: "budget",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.aiTrackingSchedule.findMany.mockResolvedValue([schedule]);
  mocks.db.aiTrackingSchedule.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.aiPrompt.findMany.mockResolvedValue([{ id: "prompt" }]);
  mocks.launch.mockResolvedValue({ id: "run" });
});
it("persists a stable occurrence before advancing the schedule cursor", async () => {
  await planDueTrackingSchedules(now);
  expect(mocks.launch).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({
      origin: "scheduled",
      entrySource: "worker",
      plannedAt: now.toISOString(),
      idempotencyKey: "tracking-schedule:schedule:2026-10-08T12:00:00.000Z",
      deadline: "2026-10-11T12:00:00.000Z",
      actorId: "actor",
    }),
  );
  expect(mocks.launch.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.db.aiTrackingSchedule.updateMany.mock.invocationCallOrder[0],
  );
});
it("records no active prompts and missed occurrences as skipped without paid admission", async () => {
  mocks.db.aiPrompt.findMany.mockResolvedValueOnce([]);
  await planDueTrackingSchedules(now);
  expect(mocks.launch).not.toHaveBeenCalled();
  expect(mocks.db.aiTrackingRun.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ state: "skipped" }) }),
  );
  mocks.db.aiTrackingSchedule.findMany.mockResolvedValueOnce([
    { ...schedule, nextRunAt: new Date("2026-10-01T12:00:00Z") },
  ]);
  await planDueTrackingSchedules(now);
  expect(mocks.launch).not.toHaveBeenCalled();
});
it("initializes resumed schedules after now without a missed-run launch", async () => {
  mocks.db.aiTrackingSchedule.findMany.mockResolvedValueOnce([{ ...schedule, nextRunAt: null }]);
  await planDueTrackingSchedules(now);
  expect(mocks.launch).not.toHaveBeenCalled();
  expect(mocks.db.aiTrackingSchedule.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { nextRunAt: new Date("2026-10-09T12:00:00Z") } }),
  );
});
it("concurrent schedule sweeps submit the same idempotency identity", async () => {
  await Promise.all([planDueTrackingSchedules(now), planDueTrackingSchedules(now)]);
  const inputs = mocks.launch.mock.calls.map(([, input]) => input);
  expect(inputs[0]).toEqual(inputs[1]);
});
