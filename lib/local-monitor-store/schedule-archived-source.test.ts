import { beforeEach, expect, it, vi } from "vitest";
import { LocalMonitorConflictError } from "./model";

const f = vi.hoisted(() => {
  const created = vi.fn();
  const entered = { value: false };
  const monitor = {
    currentRevisionId: "rev_1",
    currentScheduleIntentId: "intent_old",
    id: "monitor_internal",
    publicId: `lmn_${"b".repeat(24)}`,
    state: "active" as const,
    version: 2,
  };
  const previous = { id: "intent_old", mode: "archived", revision: 2 };
  const tx = {
    $queryRaw: async () => [],
    localMonitor: {
      findFirst: async () => monitor,
      update: async () => ({
        currentRevisionId: monitor.currentRevisionId,
        currentScheduleIntentId: "intent_new",
        publicId: monitor.publicId,
        state: "active" as const,
        version: monitor.version + 1,
      }),
    },
    localMonitorScheduleIntent: {
      create: created,
      findFirst: async () => previous,
    },
  };
  return { created, entered, tx };
});
vi.mock("server-only", () => ({}));
vi.mock("./mutation", () => ({
  mutateMonitor: async (input: {
    execute: (tx: unknown, scope: unknown, now: Date) => Promise<unknown>;
  }) => {
    f.entered.value = true;
    const receipt = await input.execute(
      f.tx,
      { actor: { id: "user_1" }, project: { id: "project_internal" } },
      new Date("2026-11-13T20:00:00Z"),
    );
    return { receipt, replayed: false };
  },
}));

import { setLocalMonitorScheduleIntent } from "./schedule";

const actor = { actor: { id: "user_1", memberships: [] } };
const projectId = `prj_${"a".repeat(24)}`;
const paused = {
  consentToken: null,
  expectedScheduleEpoch: null,
  expectedVersion: 2,
  idempotencyKey: "pause-archived",
  mode: "paused" as const,
  monitorId: `lmn_${"b".repeat(24)}`,
  projectId,
  scheduleId: null,
};
const scheduled = {
  consentToken: "consent-token",
  expectedScheduleEpoch: "4",
  expectedVersion: 2,
  idempotencyKey: "approve-archived",
  mode: "scheduled" as const,
  monitorId: `lmn_${"b".repeat(24)}`,
  projectId,
  scheduleId: `sch_${"c".repeat(24)}`,
};

beforeEach(() => {
  f.created.mockReset();
  f.entered.value = false;
});

it("refuses a paused or scheduled intent inside the transaction while the current intent is archived", async () => {
  await expect(
    setLocalMonitorScheduleIntent(paused, actor, { verify: vi.fn() }),
  ).rejects.toBeInstanceOf(LocalMonitorConflictError);
  await expect(
    setLocalMonitorScheduleIntent(scheduled, actor, { verify: vi.fn() }),
  ).rejects.toBeInstanceOf(LocalMonitorConflictError);
  expect(f.entered.value).toBe(true);
  expect(f.created).not.toHaveBeenCalled();
});

it("appends a paused intent from an archived source only when restore is explicit", async () => {
  await setLocalMonitorScheduleIntent(paused, actor, { verify: vi.fn() }, { restore: true });
  expect(f.entered.value).toBe(true);
  expect(f.created).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ mode: "paused", previousRevisionId: "intent_old" }),
    }),
  );
});
