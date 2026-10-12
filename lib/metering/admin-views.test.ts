import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  usage: vi.fn(),
  operations: vi.fn(),
  connections: vi.fn(),
  projects: vi.fn(),
  sql: vi.fn(),
  budgets: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerConnection: { findMany: m.connections },
    project: { findMany: m.projects },
    $queryRaw: m.sql,
  },
}));
vi.mock("./runtime", () => ({
  meteringNamespace: () => "n",
  meteringRuntime: async () => ({
    meter: { usage: m.usage, listOperations: m.operations, applicableBudgets: m.budgets },
  }),
}));

import { readMeteringAdmin } from "./admin-data";

beforeEach(() => {
  vi.clearAllMocks();
  m.connections.mockResolvedValue([]);
  m.projects.mockResolvedValue([]);
  m.sql.mockResolvedValue([]);
  m.usage.mockResolvedValue({
    outcome: "ok",
    value: { rows: [], watermark: "w", asOf: "2026-10-01T00:00:00Z", nextCursor: "usage-next" },
  });
  m.operations.mockResolvedValue({
    outcome: "ok",
    value: { operations: [], asOf: "2026-10-01T00:00:00Z", nextCursor: "exception-next" },
  });
});
it("returns shared pages, preserves empty exception pagination and reads exposure before the selected month", async () => {
  const data = await readMeteringAdmin({ month: "2026-09", project: "p" });
  expect(data.usage).toMatchObject({ state: "empty", nextCursor: "usage-next" });
  expect(data.exceptions).toMatchObject({ state: "ok", nextCursor: "exception-next" });
  expect(m.operations).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ from: "1970-01-01T00:00:00.000Z" }),
  );
  expect(m.sql).not.toHaveBeenCalled();
  expect(data).not.toHaveProperty("disagreements");
});

it("reads current project budgets even without a retained provider connection", async () => {
  m.projects.mockResolvedValue([{ id: "p", ownerId: "owner" }]);
  m.budgets.mockResolvedValue({ outcome: "ok", value: [] });
  await readMeteringAdmin({ month: "2026-09", project: "p" });
  expect(m.budgets).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ scope: expect.objectContaining({ group: "p", principal: "owner" }) }),
  );
});
it("uses a complete hypothetical operation scope for project budget reads", async () => {
  m.projects.mockResolvedValue([{ id: "p", ownerId: "owner" }]);
  m.budgets.mockResolvedValue({ outcome: "ok", value: [] });
  await readMeteringAdmin({ month: "2026-09", project: "p" });
  for (const [, query] of m.budgets.mock.calls)
    expect(query.scope.connection).toEqual(expect.any(String));
});
