import { renderWithNotificationSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { notificationPreferencesForMissingRow } from "@/lib/notifications/preference-defaults";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "./NotificationPreferences";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/actions/notification-prefs", () => ({ updateNotificationPreferences: mocks.save }));
const preferences: NotificationPreferencesView = {
  ...notificationPreferencesForMissingRow(),
  alertPush: true,
  alertSlack: false,
  alertWebhook: false,
  slackAvailable: false,
  webhookAvailable: false,
  email: "owner@example.test",
  emailVerification: "verified",
  projectId: "prj_test",
};
describe("UI-2 check notification controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockImplementation(async (values) => ({ ...values, checkInApp: true }));
  });
  it("shows missing-row defaults and removes the legacy check toggle and native selects", () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);
    expect(screen.getByRole("button", { name: "Check notifications" })).toHaveTextContent(
      "Important",
    );
    expect(screen.getByLabelText("Top-N entry or exit")).toHaveValue("10");
    expect(screen.getByLabelText("Minimum position move")).toHaveValue("5");
    expect(screen.getByRole("switch", { name: "Provider incidents In-app" })).toBeChecked();
    expect(screen.queryByRole("switch", { name: "Check notifications In-app" })).toBeNull();
    expect(
      screen.queryByRole("switch", { name: "Check notifications Email" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Check notifications Email is not available")).toBeVisible();
    expect(container.querySelector("select")).toBeNull();
  });
  it("ties the selected explanation to the check row and places the footnote before compact thresholds", () => {
    const { container } = render(<NotificationPreferences canEdit preferences={preferences} />);
    const row = container.querySelector('[data-notification-row="checkComplete"]') as HTMLElement;
    expect(
      within(row).getByText("Manual summaries, significant changes and failures."),
    ).toBeVisible();
    const input = screen.getByLabelText("Top-N entry or exit");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveClass("w-20", "min-h-[34px]");
    const footnote = screen.getByText(/^A dash means/);
    expect(
      footnote.compareDocumentPosition(screen.getByRole("group", { name: "Significant change" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check notifications" }));
    for (const label of ["All", "Important", "None"]) {
      const option = screen.getByRole("menuitem", { name: label });
      expect(option.textContent?.length).toBeGreaterThan(label.length);
    }
  });
  it.each(["0", "101", "1.5", ""])(
    "rejects invalid threshold %s inline without saving",
    async (value) => {
      render(<NotificationPreferences canEdit preferences={preferences} />);
      const input = screen.getByLabelText("Top-N entry or exit");
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Enter a whole number from 1 to 100.",
      );
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
  it.each(["Top-N entry or exit", "Minimum position move"])(
    "saves %s through the shared action with no legacy write",
    async (label) => {
      render(<NotificationPreferences canEdit preferences={preferences} />);
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value: "12" } });
      fireEvent.blur(input);
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("checkInApp");
      expect(mocks.save.mock.calls[0][0]).toHaveProperty(
        label === "Top-N entry or exit" ? "checkNotificationTopN" : "checkNotificationPositionMove",
        12,
      );
      fireEvent.click(screen.getByRole("switch", { name: "Provider incidents In-app" }));
      await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
      expect(mocks.save.mock.calls[1][0]).not.toHaveProperty("checkInApp");
      expect(mocks.save.mock.calls[1][0]).toHaveProperty("providerIncidentInApp", false);
    },
  );
  it.each(["All", "Important", "None"])("saves %s and presents its explanation", async (label) => {
    render(
      <NotificationPreferences
        canEdit
        preferences={{
          ...preferences,
          checkNotificationSetting: label === "Important" ? "all" : "important",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check notifications" }));
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ checkNotificationSetting: label.toLowerCase() }),
      ),
    );
    expect(screen.getByLabelText("Top-N entry or exit")).toHaveProperty(
      "disabled",
      label === "None",
    );
  });
  it("saves None after an invalid draft using the last valid saved thresholds", async () => {
    render(<NotificationPreferences canEdit preferences={preferences} />);
    fireEvent.change(screen.getByLabelText("Top-N entry or exit"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Check notifications" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "None" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          checkNotificationSetting: "none",
        }),
      ),
    );
    expect(screen.getByLabelText("Top-N entry or exit")).toHaveValue("10");
    expect(screen.getByLabelText("Top-N entry or exit")).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
