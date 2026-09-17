import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  dateFormat: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/components/admin/AdminDashboard", () => ({
  AdminDashboard: () => <div>Admin dashboard</div>,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: mocks.dateFormat,
}));
vi.mock("@/lib/queries/instance-admin", () => ({
  getInstanceAdminDashboard: mocks.dashboard,
}));

import InstanceAdminPage from "./page";

describe("instance admin page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads diagnostics only after the instance-admin gate passes", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "user_admin" } });
    mocks.dashboard.mockResolvedValue({});
    mocks.dateFormat.mockResolvedValue({ resolved: "month_first" });

    await InstanceAdminPage();

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dashboard.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("never queries cross-instance data when the gate rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(InstanceAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
