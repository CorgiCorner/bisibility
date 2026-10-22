import type { Prisma } from "@/lib/generated/prisma/client";
import { formatQuantity } from "@usagekit/core";
import { expect, test } from "vitest";
import { reservePaidAttempts } from "./admission";
import { input, paidFixture } from "./paid-attempt-test-fixture";
import type { PaidAttemptInput } from "./paid-attempt-types";
import {
  projectFundingBudgetId,
  projectFundingBudgetScopes,
  selectProjectLimit,
} from "./project-funding-budgets";
import { putProjectFundingLimit, splitProjectFundingLimits } from "./project-funding-split";
import { putSpendingBudget, readSpendingBudgets } from "./spending-limit-store";
import { projectSpendingBudget } from "./spending-limits";
import { status } from "./store/budgets";
import { createSql } from "./store/host-sql";

const platform = (): PaidAttemptInput => {
  const request = input();
  return {
    ...request,
    reservation: {
      ...request.reservation,
      fundingSource: "platform",
      estimateSource: "manual",
      estimate: [{ unit: "cents", value: 0n, scale: 4 }],
    },
    platformQuote: {
      estimate: [
        { unit: "cents", value: 20000n, scale: 4 },
        { unit: "requests", value: 1n, scale: 0 },
        { unit: "customer_cents", value: 30000n, scale: 4 },
      ],
      estimateSource: "measured",
      costOwner: "provider",
      creditAccountRef: "wallet",
      customerPriceVersion: "host-policy",
      platformPools: ["pool"],
    },
  };
};
const scopes = [
  { kind: "group" as const, namespace: "test", group: "project" },
  ...projectFundingBudgetScopes("test", "project"),
];

async function setup() {
  const f = await paidFixture();
  await f.run((tx) => putSpendingBudget(tx, projectSpendingBudget("test", "project", "100", 1)));
  const reserve = (attempt: PaidAttemptInput) =>
    f.run((tx) => reservePaidAttempts(tx, [attempt], f.options));
  const used = (funding: "byok" | "platform") =>
    f.run(async (tx: Prisma.TransactionClient) => {
      const budgets = await readSpendingBudgets(tx, "test", scopes, "read");
      const { budget } = selectProjectLimit(budgets, "project", funding);
      if (!budget) return null;
      const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
      const current = await status(sql, budget, f.clock.now());
      return {
        id: budget.id,
        limit: budget.limit ? formatQuantity(budget.limit) : null,
        used: current.used ? formatQuantity(current.used) : null,
        reserved: current.reserved ? formatQuantity(current.reserved) : null,
      };
    });
  return { f, reserve, used };
}

test("split moves the shared cap to your keys and counts this month's your-key work", async () => {
  const { f, reserve, used } = await setup();
  try {
    await reserve(input());
    await reserve(platform());
    expect(await used("byok")).toMatchObject({ id: "project:project:monthly", used: "0" });

    const split = await f.run((tx) =>
      splitProjectFundingLimits(tx, "test", "project", f.clock.now()),
    );
    expect(split).toMatchObject({
      outcome: "split",
      groupVersion: 2,
      limit: "100",
      backfill: { amount: "2", operations: 1 },
      creditsBackfill: { amount: "3", operations: 1 },
    });
    expect(
      await f.run((tx) => splitProjectFundingLimits(tx, "test", "project", f.clock.now())),
    ).toEqual({ outcome: "already_split", projectId: "project" });

    // Open reservations count as used: they never settle into the new budget.
    expect(await used("byok")).toEqual({
      id: projectFundingBudgetId("byok", "project"),
      limit: "100",
      used: "2",
      reserved: "0",
    });
    expect(await used("platform")).toEqual({
      id: projectFundingBudgetId("platform", "project"),
      limit: null,
      used: "3",
      reserved: "0",
    });
    const group = await f.run((tx) => readSpendingBudgets(tx, "test", [scopes[0]], "read"));
    expect(group.find((b) => b.id === "project:project:monthly")?.limit).toBeNull();

    await reserve(input());
    expect(await used("byok")).toMatchObject({ used: "2", reserved: "2" });
  } finally {
    await f.close();
  }
});

test("each funding limit blocks only its own source", async () => {
  const { f, reserve, used } = await setup();
  try {
    await reserve(platform());
    await f.run((tx) => splitProjectFundingLimits(tx, "test", "project", f.clock.now()));

    const credits = await f.run((tx) =>
      putProjectFundingLimit(tx, "test", "project", "platform", "5", f.clock.now()),
    );
    expect(credits.before).toMatchObject({ version: 1, limit: null });
    expect(credits.backfill).toBeNull();
    expect(await used("platform")).toMatchObject({ limit: "5", used: "3" });

    await expect(reserve(platform())).rejects.toThrow();
    await reserve(input());

    await f.run((tx) => putProjectFundingLimit(tx, "test", "project", "byok", "3"));
    await expect(reserve(input())).rejects.toThrow();
    await f.run((tx) => putProjectFundingLimit(tx, "test", "project", "platform", null));
    await reserve(platform());
    expect(await used("platform")).toMatchObject({ limit: null, used: "3", reserved: "3" });
  } finally {
    await f.close();
  }
});

test("funding limits cannot be set before the project is split", async () => {
  const { f } = await setup();
  try {
    await expect(
      f.run((tx) => putProjectFundingLimit(tx, "test", "project", "platform", "5")),
    ).rejects.toThrow("Project funding limits are not split");
  } finally {
    await f.close();
  }
});
