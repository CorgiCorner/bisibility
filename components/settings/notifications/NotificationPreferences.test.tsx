import { NotificationPreferences } from "@/components/settings/notifications/NotificationPreferences";
import { NotificationsLoading } from "@/components/settings/notifications/NotificationsLoading";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("@/lib/actions/notification-prefs", () => ({
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));

const preferences: NotificationPreferencesView = {
  alertEmail: true,
  alertInApp: true,
  alertSlack: true,
  alertWebhook: true,
  checkEmail: false,
  checkInApp: true,
  email: "owner@example.com",
  emailVerification: "verified",
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  projectId: "prj_1",
  reportEmail: true,
  slackAvailable: true,
  webhookAvailable: true,
};

describe("NotificationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateNotificationPreferences.mockImplementation(async (values) => values);
  });

  it("renders the channels card and the read-only delivery-address card", () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(container.querySelectorAll('[data-settings-card-frame="settled"]')).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delivery address" })).toBeInTheDocument();
    expect(screen.queryByText("Digest & reports")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notification email")).not.toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage your account email" })).toHaveAttribute(
      "href",
      "/app/account",
    );
  });

  it("renders the reference three-column matrix with Weekly report email-only", () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(screen.getByText("Weekly report")).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly report Email")).toBeChecked();
    expect(screen.getByLabelText("Weekly report Email")).not.toBeDisabled();
    expect(screen.getByLabelText("Weekly report In-app is not available")).toHaveTextContent("–");
    expect(screen.queryByRole("switch", { name: "Weekly report In-app" })).not.toBeInTheDocument();
    expect(screen.queryByText("Slack")).not.toBeInTheDocument();
    expect(screen.queryByText("Webhook")).not.toBeInTheDocument();
  });

  it("writes channel changes immediately without showing a Save control", async () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);
    const channelCard = container.querySelector<HTMLElement>(
      '[data-notification-card-frame="channels"]',
    );
    if (!channelCard) throw new Error("Channels card was not rendered.");

    fireEvent.click(screen.getByLabelText("Weekly report Email"));

    await waitFor(() =>
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "prj_1", reportEmail: false }),
      ),
    );
    expect(within(channelCard).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("keeps unavailable cells as reference dashes without planned channel columns", () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(screen.getByLabelText("Alert fired Email")).toBeEnabled();
    expect(screen.getByLabelText("Weekly report In-app is not available")).toHaveTextContent("–");
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });

  it("preserves non-rendered delivery channel values when writing another preference", async () => {
    mocks.updateNotificationPreferences.mockResolvedValue({ ...preferences, checkEmail: true });
    render(<NotificationPreferences canEdit preferences={preferences} />);

    fireEvent.click(screen.getByLabelText("Check complete Email"));

    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalled());
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        alertSlack: true,
        alertWebhook: true,
        checkEmail: true,
      }),
    );
  });

  it("restores the previous value and reports an immediate-write failure", async () => {
    mocks.updateNotificationPreferences.mockRejectedValue(new Error("write failed"));
    render(<NotificationPreferences canEdit preferences={preferences} />);

    const checkEmail = screen.getByLabelText("Check complete Email");
    expect(checkEmail).not.toBeChecked();
    fireEvent.click(checkEmail);

    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalled());
    expect(await screen.findByText("write failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Check complete Email")).not.toBeChecked();
  });

  it("uses the same geometry marker for the channels card and its loader", () => {
    const { container } = render(
      <>
        <NotificationPreferences canEdit preferences={preferences} />
        <NotificationsLoading />
      </>,
    );

    const channelsCard = container.querySelector(
      '[data-notification-card-frame="channels"] [data-settings-card-frame="settled"]',
    );
    const channelsLoader = container.querySelector('[data-notification-loading-frame="channels"]');

    expect(channelsCard).toHaveClass("min-h-[414px]", "sm:min-h-[380px]");
    expect(channelsLoader).toHaveClass("min-h-[414px]", "sm:min-h-[380px]");
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders preference controls for the %s role at the update threshold",
    (role) => {
      const canEdit = canProjectAction(role, "update", "notification_preference");
      render(<NotificationPreferences canEdit={canEdit} preferences={preferences} />);

      const alertEmail = screen.getByLabelText("Alert fired Email");
      if (canEdit) expect(alertEmail).not.toBeDisabled();
      else expect(alertEmail).toBeDisabled();
    },
  );
});
