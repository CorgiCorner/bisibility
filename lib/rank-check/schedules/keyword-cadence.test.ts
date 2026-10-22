import { ApiInputError } from "@/lib/api/errors";
import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { setKeywordCadence } from "./keyword-cadence";

vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./service-membership", () => ({}));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({}));

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
        ),
      ).rejects.toBeInstanceOf(ApiInputError);
      expect(access).not.toHaveBeenCalled();
    },
  );
});
