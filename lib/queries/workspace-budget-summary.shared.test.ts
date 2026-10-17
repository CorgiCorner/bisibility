import { Prisma } from "@/lib/generated/prisma/client";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/metering/user-data", () => ({ getProjectMeteringBudgets: read }));

import { loadWorkspaceBudgetSummary } from "./workspace-budget-summary";

it("uses the authorized project Store projection and returns no mixed spend fields", async () => {
  const data = emptyProjectUsage();
  data.status = "available";
  data.connections = [{ connectionId: "conn_public", provider: "serpapi" }];
  read.mockResolvedValue(data);
  const result = await loadWorkspaceBudgetSummary("prj_public");
  expect(read).toHaveBeenCalledWith("prj_public", "header");
  expect(result).toMatchObject({
    eligible: true,
    status: { state: "empty" },
    budgets: { rows: [] },
  });
  expect(result).not.toHaveProperty("recorded");
});

it("preserves a restricted reader's amount-free blocking signal", async () => {
  read.mockResolvedValue({ ...emptyProjectUsage(), status: "restricted", paidWorkBlocked: true });
  expect(await loadWorkspaceBudgetSummary("prj_public")).toMatchObject({
    paidWorkBlocked: true,
    budgets: { state: "forbidden", rows: [] },
  });
});

it.each(["P2024", "P1001"])(
  "hides the header status when project access encounters %s",
  async (code) => {
    read.mockRejectedValueOnce(Object.assign(new Error("database unavailable"), { code }));
    await expect(loadWorkspaceBudgetSummary("prj_public")).resolves.toMatchObject({
      eligible: false,
      paidWorkBlocked: null,
      budgets: { state: "unavailable", rows: [] },
    });
  },
);
it("does not swallow authorization failures", async () => {
  read.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(loadWorkspaceBudgetSummary("prj_public")).rejects.toThrow("Forbidden");
});

it.each(["P2024", "P1001", "P1002", "P1008", "P1017"])(
  "degrades real Prisma connectivity failures %s",
  async (code) => {
    for (const error of [
      new Prisma.PrismaClientInitializationError("Database unavailable", "7.9.1", code),
      new Prisma.PrismaClientKnownRequestError("Database unavailable", {
        code,
        clientVersion: "7.9.1",
      }),
    ]) {
      read.mockRejectedValueOnce(error);
      await expect(loadWorkspaceBudgetSummary("prj_public")).resolves.toMatchObject({
        eligible: false,
        paidWorkBlocked: null,
        budgets: { state: "unavailable", rows: [] },
      });
    }
  },
);
it("does not hide real Prisma programming errors", async () => {
  const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "7.9.1",
  });
  read.mockRejectedValueOnce(error);
  await expect(loadWorkspaceBudgetSummary("prj_public")).rejects.toBe(error);
});
