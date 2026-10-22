import { AdminTwoFactorRequiredError } from "@/lib/auth/admin-dangerous-action";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.session }));
vi.mock("@/lib/instance-announcements/store", () => ({
  createInstanceAnnouncement: mocks.create,
  changeInstanceAnnouncement: mocks.change,
}));

import { mutateInstanceAnnouncement } from "./instance-announcements";

const content = { title: "Notice", message: "Temporary issue", href: "", linkLabel: "" };
const identity = {
  id: "168337b6-c5e8-4787-a422-07ca4f693f32",
  revision: "868ff1da-17ec-4f41-9e80-09dfb19e2bc5",
};

describe("announcement actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin" } });
  });
  it.each(["create", "update", "toggle", "delete"])(
    "requires instance admin for %s before accessing storage",
    async (kind) => {
      mocks.session.mockResolvedValue(null);
      expect(await mutateInstanceAnnouncement({ kind, content, identity })).toEqual({
        status: "forbidden",
      });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.change).not.toHaveBeenCalled();
    },
  );
  it("validates links and identities server-side", async () => {
    expect(
      await mutateInstanceAnnouncement({
        kind: "create",
        content: { ...content, href: "javascript:alert(1)" },
      }),
    ).toEqual({ status: "invalid" });
    expect(
      await mutateInstanceAnnouncement({
        kind: "delete",
        identity: { id: "unsafe", revision: "unsafe" },
      }),
    ).toEqual({ status: "invalid" });
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves the admin identity and storage conflict result", async () => {
    mocks.change.mockResolvedValue({ status: "conflict" });
    expect(await mutateInstanceAnnouncement({ kind: "update", identity, content })).toEqual({
      status: "conflict",
    });
    expect(mocks.change).toHaveBeenCalledWith("admin", identity, { content });
  });
  it("returns a safe error when storage fails", async () => {
    mocks.create.mockRejectedValue(new Error("private database details"));
    expect(await mutateInstanceAnnouncement({ kind: "create", content })).toEqual({
      status: "unavailable",
    });
  });
  it("refuses the dangerous operation when the admin has no enabled 2FA", async () => {
    dangerousActionGuard.mockRejectedValueOnce(new AdminTwoFactorRequiredError("test_action"));
    expect(await mutateInstanceAnnouncement({ kind: "create", content: {} })).toMatchObject({
      status: "two_factor_required",
    });
  });
});

const dangerousActionGuard = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/auth/admin-dangerous-action", async (original) => ({
  ...(await original<typeof import("@/lib/auth/admin-dangerous-action")>()),
  requireAdminTwoFactorForDangerousAction: dangerousActionGuard,
}));
