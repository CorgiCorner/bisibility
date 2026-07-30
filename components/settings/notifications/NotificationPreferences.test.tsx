import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "./NotificationPreferences";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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

  it("keeps spacing between the email identity and delivery table", () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(container.querySelector("fieldset")).toHaveClass("flex", "flex-col", "gap-4");
  });

  it("renders weekly report with only the email toggle enabled", () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(screen.getByText("Weekly report")).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly report Email")).toBeChecked();
    expect(screen.getByLabelText("Weekly report Email")).not.toBeDisabled();
    expect(screen.getByLabelText("Weekly report In-app")).not.toBeChecked();
    expect(screen.getByLabelText("Weekly report In-app")).toBeDisabled();
    expect(screen.getByLabelText("Weekly report Slack")).not.toBeChecked();
    expect(screen.getByLabelText("Weekly report Slack")).toBeDisabled();
    expect(screen.getByLabelText("Weekly report Webhook")).not.toBeChecked();
    expect(screen.getByLabelText("Weekly report Webhook")).toBeDisabled();
  });

  it("submits reportEmail in the payload", async () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);

    fireEvent.click(screen.getByLabelText("Weekly report Email"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "prj_1", reportEmail: false }),
      ),
    );
    expect(await screen.findByText("Notification preferences saved.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps planned Slack and Webhook channels disabled while email remains editable", () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);

    expect(screen.getByLabelText("Alerts Email")).toBeEnabled();
    expect(screen.getByLabelText("Alerts Slack")).toBeDisabled();
    expect(screen.getByLabelText("Alerts Slack")).toBeChecked();
    expect(screen.getByLabelText("Alerts Webhook")).toBeDisabled();
    expect(screen.getByLabelText("Alerts Webhook")).toBeChecked();
    expect(screen.getByLabelText("Slack Planned - not available yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Webhook Planned - not available yet")).toBeInTheDocument();
  });

  it("preserves locked delivery channel values when saving another preference", async () => {
    mocks.updateNotificationPreferences.mockResolvedValue({
      ...preferences,
      checkEmail: true,
    });
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);

    fireEvent.click(screen.getByLabelText("Rank checks Email"));
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalled());
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        alertSlack: true,
        alertWebhook: true,
        checkEmail: true,
      }),
    );
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders preference controls for the %s role at the update threshold",
    (role) => {
      const canEdit = canProjectAction(role, "update", "notification_preference");
      render(<NotificationPreferences canEdit={canEdit} preferences={preferences} />);

      const alertEmail = screen.getByLabelText("Alerts Email");
      if (canEdit) expect(alertEmail).not.toBeDisabled();
      else expect(alertEmail).toBeDisabled();
    },
  );
});
