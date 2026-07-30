import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div data-admin-shell>{children}</div>,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: mocks.requireAdmin,
}));

import InstanceAdminLayout from "./layout";

describe("instance admin layout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gates every nested route before rendering the shared shell", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin_1" } });

    const result = await InstanceAdminLayout({ children: <p>Admin route</p> });

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(result)).toContain("data-admin-shell");
    expect(renderToStaticMarkup(result)).toContain("Admin route");
  });

  it("does not render nested content when the shared gate rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(InstanceAdminLayout({ children: <p>Hidden admin route</p> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
