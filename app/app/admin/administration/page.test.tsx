import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdministration: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/components/admin/AdminAdministration", () => ({
  AdminAdministration: () => <p>Administration dashboard</p>,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/queries/instance-admin-administration", () => ({
  getInstanceAdminAdministration: mocks.getAdministration,
}));

import InstanceAdministrationPage from "./page";

describe("instance administration page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the page gate before loading administration data", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "user_admin" } });
    mocks.getAdministration.mockResolvedValue({ growth: {}, topConsumption: [] });

    render(await InstanceAdministrationPage());

    expect(screen.getByText("Administration dashboard")).toBeInTheDocument();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.getAdministration).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAdministration.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not render when the instance-admin gate rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(InstanceAdministrationPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getAdministration).not.toHaveBeenCalled();
  });
});
