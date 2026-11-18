import { beforeEach, expect, test, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: query,
    $transaction: async (work: (tx: { $queryRaw: typeof query }) => unknown) =>
      work({ $queryRaw: query }),
  },
}));
vi.mock("@/lib/achievements/process", () => ({ hasAchievementIntent: async () => false }));
vi.mock("@/lib/local-monitor-recurring/config", () => ({ recurringMonitorsEnabled: () => false }));

import { hasPendingWorkerIntent } from "./pending-probe";

beforeEach(() => query.mockReset());
const text = (sql: { text?: string } | TemplateStringsArray | undefined) =>
  Array.isArray(sql) ? sql.join("") : ((sql as { text?: string } | undefined)?.text ?? "");

test("missing playground migration never disables other intent families", async () => {
  query.mockImplementation(async (sql: { text: string } | undefined) => {
    if (text(sql).includes("model_playground_runs")) throw new Error("relation does not exist");
    return [{ pending: true }];
  });
  expect(await hasPendingWorkerIntent()).toBe(true);
  query.mockImplementation(async (sql: { text: string } | undefined) => {
    if (text(sql).includes("model_playground_runs")) throw new Error("relation does not exist");
    return [{ pending: false }];
  });
  expect(await hasPendingWorkerIntent()).toBe(false);
});

test("separate playground probe still wakes a due run", async () => {
  query.mockImplementation(async (sql: { text: string } | undefined) => [
    { pending: text(sql).includes("model_playground_runs") },
  ]);
  expect(await hasPendingWorkerIntent()).toBe(true);
});
