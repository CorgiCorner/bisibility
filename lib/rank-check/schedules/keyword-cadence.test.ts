import { ApiInputError } from "@/lib/api/errors";
import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { setKeywordCadence } from "./keyword-cadence";

vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./service-membership", () => ({
  checkScheduleSelect: { id: true },
  mirrorManualToKeywords: vi.fn(),
  mirrorScheduleToKeywords: vi.fn(),
}));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: vi.fn(),
}));

describe("custom cadence admission", () => {
  it.each([
    "0 9 * * 5L",
    "0 9 * * MON",
    "0 9 * * 1#2",
    "0/2 9 * * *",
    "0 9 * * 1/2",
    "0 9 * * */2/3",
    "0 0 9 * * *",
    "0 0 31 2 1",
  ])(
    "rejects an unsupported or impossible paid cadence before transaction I/O: %s",
    async (cronExpression) => {
      const access = vi.fn(() => {
        throw new Error("Transaction I/O was reached");
      });
      const tx = new Proxy({}, { get: access }) as Prisma.TransactionClient;
      await expect(
        setKeywordCadence(
          tx,
          "project",
          ["keyword"],
          {
            frequency: "custom_cron",
            cronExpression,
            timezone: "UTC",
            jitterMinutes: 0,
            nextCheckAt: null,
            serpDepth: undefined,
          },
          "actor",
          "schedule",
        ),
      ).rejects.toBeInstanceOf(ApiInputError);
      expect(access).not.toHaveBeenCalled();
    },
  );
});

describe("frequency shorthand audit", () => {
  const shorthand = {
    cronExpression: null,
    frequency: "weekly" as const,
    jitterMinutes: 60,
    nextCheckAt: null,
    serpDepth: undefined,
    timezone: "UTC",
  };
  const member = {
    archivedAt: null,
    cronExpression: null,
    enabled: true,
    frequency: "daily" as const,
    id: "schedule_current",
    isDefault: false,
    jitterMinutes: 5,
    name: "Timed daily",
    providerPolicy: null,
    publicId: "sch_current",
    serpDepth: 100,
    timeOfDay: "09:00",
    timezone: "Europe/Warsaw",
  };

  function txFor(found: object) {
    return {
      $queryRaw: vi.fn(),
      providerConnection: { findFirst: vi.fn(async () => null) },
      projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 20 })) },
      checkSchedule: { create: vi.fn(), findFirst: vi.fn(async () => found) },
      keyword: {
        findUnique: vi.fn(async () => ({ checkSchedule: member })),
        findMany: vi.fn(async () => [
          {
            checkSchedule: member,
            checkScheduleId: member.id,
            id: "keyword_1",
            publicId: "kw_member",
            schedule: { serpDepth: 100 },
          },
        ]),
        updateMany: vi.fn(),
      },
      keywordSchedule: { updateMany: vi.fn() },
      project: { findUnique: vi.fn(async () => ({ defaults: { timezone: "UTC" } })) },
    } as unknown as Prisma.TransactionClient;
  }

  it("records the existing schedule clock instead of the shorthand input", async () => {
    const found = {
      ...member,
      frequency: "weekly" as const,
      id: "schedule_weekly",
      name: "Weekly, top 100",
      publicId: "sch_weekly",
    };
    const tx = txFor(found);
    await setKeywordCadence(tx, "project", ["keyword_1"], shorthand, "actor", "frequency");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.bulk_set_frequency",
        after: expect.objectContaining({
          checkScheduleId: "sch_weekly",
          schedule: expect.objectContaining({
            frequency: "weekly",
            timeOfDay: "09:00",
            timezone: "Europe/Warsaw",
          }),
        }),
      }),
      tx,
    );
  });

  it("records a reused schedule's null timezone instead of shorthand UTC", async () => {
    const found = {
      ...member,
      frequency: "weekly" as const,
      id: "schedule_weekly",
      publicId: "sch_weekly",
      timeOfDay: null,
      timezone: null,
    };
    const tx = txFor(found);
    await setKeywordCadence(tx, "project", ["keyword_1"], shorthand, "actor", "frequency");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          schedule: expect.objectContaining({ timeOfDay: null, timezone: null }),
        }),
      }),
      tx,
    );
  });
});
