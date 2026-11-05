import { NotificationPreferences } from "@/components/settings/notifications/NotificationPreferences";
import { NotificationsLoading } from "@/components/settings/notifications/NotificationsLoading";
import {
  notificationSettingsFeatureTestMessages,
  renderWithNotificationSettingsMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  alertPush: true,
  alertSlack: true,
  alertWebhook: true,
  checkEmail: false,
  checkInApp: true,
  checkNotificationSetting: "important",
  checkNotificationTopN: 10,
  checkNotificationPositionMove: 5,
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
const polishNotificationMessages = {
  ...notificationSettingsFeatureTestMessages,
  projectSettingsNotifications: {
    channels: {
      ...notificationSettingsFeatureTestMessages.projectSettingsNotifications.channels,
      alertFired: "Wysłany alert",
      email: "E-mail",
      inApp: "W aplikacji",
      title: "Kanały",
      unavailable: "{label} jest niedostępny",
    },
    delivery: {
      ...notificationSettingsFeatureTestMessages.projectSettingsNotifications.delivery,
      deliveredTo: "Powiadomienia są dostarczane na <address>{email}</address>.",
      title: "Adres dostawy",
    },
  },
};

describe("NotificationPreferences", () => {
  it("does not offer unsupported check/import email or transactional-invite email switches", () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);
    for (const name of ["Check notifications Email", "Import finished Email", "Invite Email"]) {
      expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("switch", { name: "Alert fired Email" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Weekly report Email" })).toBeEnabled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateNotificationPreferences.mockImplementation(async (values) => values);
  });

  it("renders the channels card and the read-only delivery-address card", () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(container.querySelectorAll('[data-settings-card-frame="settled"]')).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delivery address" })).toBeInTheDocument();
    expect(screen.queryByText("Digest and reports")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notification email")).not.toBeInTheDocument();
    const deliveryAddressCopy = screen.getByText("owner@example.com").closest("p");
    expect(deliveryAddressCopy).toHaveTextContent(
      "Notifications are delivered to owner@example.com.",
    );

    const deliveryAddressCard = screen
      .getByRole("heading", { name: "Delivery address" })
      .closest("[data-settings-card]");
    if (!deliveryAddressCard) throw new Error("Delivery address card was not rendered.");
    expect(deliveryAddressCard).toHaveClass("min-h-auto");
    expect(deliveryAddressCard).not.toHaveClass("min-h-[184px]");

    const cardActions = deliveryAddressCard.querySelector<HTMLElement>(
      "[data-settings-card-actions]",
    );
    if (!cardActions) throw new Error("Delivery address actions were not rendered.");

    const manageEmailAction = within(cardActions).getByRole("link", { name: "Manage email" });
    expect(manageEmailAction).toHaveAttribute("href", "/app/account");
    expect(manageEmailAction).toHaveAttribute("data-slot", "button");
    expect(manageEmailAction).toHaveAttribute("data-variant", "secondary");
    expect(manageEmailAction).toHaveAttribute("data-size", expect.stringMatching(/^(xs|sm)$/));
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

  it("sends only the changed personal field", async () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);
    fireEvent.click(screen.getByLabelText("Alert fired Email"));
    await waitFor(() =>
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({
        projectId: "prj_1",
        alertEmail: false,
      }),
    );
  });

  it("shows the returned persisted value after a failed save", async () => {
    mocks.updateNotificationPreferences.mockResolvedValue({ ...preferences, saveFailed: true });
    render(<NotificationPreferences canEdit preferences={preferences} />);
    fireEvent.click(screen.getByLabelText("Alert fired Email"));
    expect(
      await screen.findByText("Save status could not be confirmed. Showing the saved preferences."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Alert fired Email")).toBeChecked();
  });

  it("prevents another change while a save is pending", async () => {
    let resolveSave: (value: typeof preferences) => void = () => {};
    mocks.updateNotificationPreferences.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<NotificationPreferences canEdit preferences={preferences} />);
    fireEvent.click(screen.getByLabelText("Alert fired Email"));
    await waitFor(() => expect(screen.getByLabelText("Alert fired Email")).toBeDisabled());
    resolveSave({ ...preferences, alertEmail: false });
    await waitFor(() => expect(screen.getByLabelText("Alert fired Email")).toBeEnabled());
  });

  it("shows the refetched preferences after an unknown save", async () => {
    mocks.updateNotificationPreferences.mockRejectedValue(new Error("response lost"));
    const { rerender } = render(<NotificationPreferences canEdit preferences={preferences} />);
    fireEvent.click(screen.getByLabelText("Alert fired Email"));
    expect(
      await screen.findByText("Save status could not be confirmed. Showing the saved preferences."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Alert fired Email")).toBeEnabled();
    expect(screen.getByLabelText("Alert fired Email")).toBeChecked();
    expect(routerMock.refresh).toHaveBeenCalled();

    rerender(
      <NotificationPreferences canEdit preferences={{ ...preferences, alertEmail: false }} />,
    );

    await waitFor(() => expect(screen.getByLabelText("Alert fired Email")).not.toBeChecked());
    expect(screen.getByLabelText("Alert fired Email")).toBeEnabled();
  });

  it("uses the injected locale for event labels, unavailable cells, and the delivery sentence", () => {
    renderWithFeatureMessages(<NotificationPreferences canEdit preferences={preferences} />, {
      locale: "pl",
      messages: polishNotificationMessages,
    });

    expect(screen.getByRole("heading", { name: "Kanały" })).toBeInTheDocument();
    expect(screen.getByLabelText("Wysłany alert E-mail")).toBeChecked();
    expect(screen.getByLabelText("Weekly report W aplikacji jest niedostępny")).toHaveTextContent(
      "–",
    );
    expect(screen.getByText("Adres dostawy")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com").closest("p")).toHaveTextContent(
      "Powiadomienia są dostarczane na owner@example.com.",
    );
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
