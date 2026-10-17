import { afterEach, expect, it, vi } from "vitest";
import { adminUsageFixture } from "./shared-view-fixtures";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), audit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.guard }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("./admin-data", () => ({ readMeteringAdmin: mocks.read }));

import { getMeteringAdminPage } from "./admin-service";

afterEach(() => vi.resetAllMocks());
it("denies a non-admin before any metering read or audit", async () => {
  mocks.guard.mockRejectedValue(new Error("not found"));
  await expect(getMeteringAdminPage({})).rejects.toThrow("not found");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("audits the verified administrator before reading identifiers and totals", async () => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  mocks.read.mockResolvedValue({
    usage: { state: "empty", rows: [], nextCursor: null },
    budgets: [],
    exceptions: { state: "empty", rows: [], nextCursor: null },
    projects: [],
    truncated: false,
  });
  const page = await getMeteringAdminPage({ month: "2026-09", project: "project1" });
  expect(page.data?.usage.rows).toEqual([]);
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin1" }));
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: "admin1",
      action: "instance_admin.metering_viewed",
      after: { month: "2026-09", project: "project1" },
    }),
  );
  expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.read.mock.invocationCallOrder[0] ?? 0,
  );
});
it("database unavailability is distinct from a verified empty ledger", async () => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.read.mockRejectedValue(new Error("secret-connection-string db unavailable"));
  expect((await getMeteringAdminPage({})).data).toBeNull();
  expect(errorLog).toHaveBeenCalledWith("[metering] admin data unavailable", {
    month: expect.stringMatching(/^\d{4}-\d{2}$/),
    projectSelected: false,
  });
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret-connection-string");
  errorLog.mockRestore();
});
it("rejects invalid filters instead of widening the selected scope", async () => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  await expect(getMeteringAdminPage({ month: "2026-99" })).rejects.toThrow(
    "Invalid metering filter",
  );
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects foreign or changed-query cursor envelopes before reading", async () => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  await expect(
    getMeteringAdminPage({ month: "2026-09", project: "p1", usageCursor: "not-a-valid-envelope" }),
  ).rejects.toThrow("Invalid metering cursor");
  expect(mocks.read).not.toHaveBeenCalled();
});

it("reauthenticates and audits both sealed pagination positions without resetting either", async () => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  mocks.read.mockResolvedValue({
    usage: { state: "ok", rows: [], nextCursor: "usage-offset" },
    exceptions: { state: "ok", rows: [], nextCursor: "exception-offset" },
    budgets: [],
    projects: [],
    truncated: false,
  });
  const first = await getMeteringAdminPage({ month: "2026-09", project: "project1" });
  const next = await getMeteringAdminPage({
    month: "2026-09",
    project: "project1",
    usageCursor: first.data?.usage.nextCursor ?? undefined,
    exceptionCursor: first.data?.exceptions.nextCursor ?? undefined,
  });
  expect(next.data).not.toBeNull();
  expect(mocks.guard).toHaveBeenCalledTimes(2);
  expect(mocks.audit).toHaveBeenCalledTimes(2);
  expect(mocks.read).toHaveBeenLastCalledWith(
    expect.objectContaining({
      usageCursor: "usage-offset",
      exceptionCursor: "exception-offset",
      exceptionTo: mocks.read.mock.calls[0][0].exceptionTo,
    }),
  );
  expect(mocks.audit.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.read.mock.invocationCallOrder[1] ?? 0,
  );
});

it.each([
  { project: ["p1"] },
  { month: ["2026-09"] },
  { project: 123 },
  { month: {} },
  null,
  [],
  { usageCursor: ["cursor"] },
  { extra: "unexpected" },
])("rejects malformed raw input before audit and data reads: %j", async (input) => {
  mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
  await expect(getMeteringAdminPage(input as never)).rejects.toThrow("Invalid metering filter");
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each(["usage", "exceptions"] as const)(
  "passes an explicit %s section to the reader",
  async (section) => {
    mocks.guard.mockResolvedValue({ user: { id: "admin1" } });
    mocks.read.mockResolvedValue(adminUsageFixture());
    await getMeteringAdminPage({ month: "2026-10", section });
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({ section, includeBudgets: false }),
    );
  },
);
