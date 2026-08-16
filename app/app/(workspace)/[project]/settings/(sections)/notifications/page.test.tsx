import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  NotificationPreferences: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/settings/notifications/NotificationPreferences", () => ({
  NotificationPreferences: mocks.NotificationPreferences,
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/queries/notification-prefs", () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
}));

import NotificationsSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/notifications/page";

describe("NotificationsSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.NotificationPreferences.mockImplementation(
      ({ canEdit, preferences }: { canEdit: boolean; preferences: { email: string } }) => (
        <div
          data-can-edit={String(canEdit)}
          data-notification-email={preferences.email}
          data-testid="notification-page"
        />
      ),
    );
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", publicId: "prj_resolved", writeMode: "active" },
    });
    mocks.getNotificationPreferences.mockResolvedValue({ email: "owner@example.com" });
  });

  it("authorizes the project server-side before rendering notification preferences", async () => {
    render(
      await NotificationsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getNotificationPreferences).toHaveBeenCalledWith("prj_untrusted");
    expect(screen.getByRole("main")).toHaveAttribute("data-project-ref", "prj_resolved");
    expect(screen.getByTestId("notification-page")).toHaveAttribute("data-can-edit", "true");
  });

  it("does not render notification preferences when server access is denied", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      NotificationsSettingsPage({ params: Promise.resolve({ project: "prj_unavailable" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(["migration_hold", "migrated"])(
    "keeps project notification controls read-only while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "member" }] },
        project: { id: "project_1", publicId: "prj_resolved", writeMode },
      });

      render(
        await NotificationsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
      );

      expect(screen.getByTestId("notification-page")).toHaveAttribute("data-can-edit", "false");
    },
  );

  it("does not pass account email actions to notification preferences", async () => {
    render(
      await NotificationsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );

    const [props] = mocks.NotificationPreferences.mock.calls.at(-1) ?? [];

    expect(Object.keys(props ?? {}).sort()).toEqual(["canEdit", "preferences"]);
    expect(props).not.toHaveProperty("confirmAccountEmailChange");
    expect(props).not.toHaveProperty("confirmCurrentAccountEmailVerification");
    expect(props).not.toHaveProperty("requestAccountEmailChange");
    expect(props).not.toHaveProperty("requestCurrentAccountEmailVerification");
  });
});
