import { afterEach, expect, it, vi } from "vitest";

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
    usage: [],
    budgets: [],
    exceptions: [],
    projects: [],
    disagreements: "0",
    truncated: false,
  });
  const page = await getMeteringAdminPage({ month: "2026-09", project: "project1" });
  expect(page.data?.usage).toEqual([]);
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
