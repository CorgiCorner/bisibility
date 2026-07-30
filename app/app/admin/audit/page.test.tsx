import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuditPage: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/components/admin/AdminAuditTable", () => ({
  AdminAuditTable: ({ filter }: Readonly<{ filter: string }>) => <p>Audit table: {filter}</p>,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/queries/instance-admin-audit", () => ({
  getInstanceAdminAuditPage: mocks.getAuditPage,
}));

import InstanceAdminAuditPage from "./page";

describe("instance admin audit page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the page gate and forwards URL filters and cursors", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "user_admin" } });
    mocks.getAuditPage.mockResolvedValue({ entries: [], filter: "ops", nextCursor: null });

    render(
      await InstanceAdminAuditPage({
        searchParams: Promise.resolve({ cursor: ["cursor_2"], filter: "ops" }),
      }),
    );

    expect(screen.getByText("Audit table: ops")).toBeInTheDocument();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.getAuditPage).toHaveBeenCalledWith({ cursor: "cursor_2", filter: "ops" });
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAuditPage.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not render when the instance-admin gate rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(InstanceAdminAuditPage({})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getAuditPage).not.toHaveBeenCalled();
  });
});
