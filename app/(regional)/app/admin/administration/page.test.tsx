import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminAdministration: vi.fn(),
  listAnnouncements: vi.fn(),
  getAdministration: vi.fn(),
  mailSettings: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/components/admin/AdminAdministration", () => ({
  AdminAdministration: (props: Record<string, unknown>) => {
    mocks.adminAdministration(props);
    return <p>Administration dashboard</p>;
  },
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/email/instance-mail-store", () => ({
  loadInstanceMailSettingsView: mocks.mailSettings,
}));
vi.mock("@/lib/queries/instance-admin-administration", () => ({
  getInstanceAdminAdministration: mocks.getAdministration,
}));

vi.mock("@/components/admin/AdminAnnouncements", () => ({
  AdminAnnouncements: () => <p>User announcements</p>,
}));
vi.mock("@/lib/instance-announcements/store", () => ({
  listInstanceAnnouncements: mocks.listAnnouncements,
}));

import InstanceAdministrationPage from "./page";

describe("instance administration page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAnnouncements.mockResolvedValue([]);
  });

  it("passes the page gate before loading administration data", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "user_admin" } });
    mocks.mailSettings.mockResolvedValue(null);
    mocks.getAdministration.mockResolvedValue({
      growth: {},
      mailerConfigured: false,
      topConsumption: [],
    });

    render(await InstanceAdministrationPage());

    expect(screen.getByText("Administration dashboard")).toBeInTheDocument();
    expect(screen.getByText("User announcements")).toBeInTheDocument();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listAnnouncements.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.getAdministration).toHaveBeenCalledOnce();
    expect(mocks.adminAdministration).toHaveBeenCalledWith(
      expect.objectContaining({ showMailerWarning: true }),
    );
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAdministration.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not render when the instance-admin gate rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(InstanceAdministrationPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getAdministration).not.toHaveBeenCalled();
    expect(mocks.listAnnouncements).not.toHaveBeenCalled();
  });
});
