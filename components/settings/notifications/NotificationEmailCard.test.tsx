import { NotificationEmailCard } from "@/components/settings/notifications/NotificationEmailCard";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const preferences: NotificationPreferencesView = {
  alertEmail: true,
  alertInApp: true,
  alertSlack: false,
  alertWebhook: false,
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
  slackAvailable: false,
  webhookAvailable: false,
};

function renderCard(props: Partial<ComponentProps<typeof NotificationEmailCard>> = {}) {
  const result = render(<NotificationEmailCard preferences={preferences} {...props} />);
  const card = result.container.querySelector<HTMLElement>(
    '[data-notification-card-frame="email"]',
  );
  if (!card) throw new Error("Notification email card was not rendered.");
  return { ...result, card };
}

describe("NotificationEmailCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders verified and unverified states without a production mutation boundary", () => {
    const { unmount } = renderCard();

    const emailInput = screen.getByLabelText<HTMLInputElement>("Notification email");
    const notificationEmailLabel = emailInput.labels?.[0];
    if (!notificationEmailLabel) throw new Error("Notification email label was not rendered.");
    expect(notificationEmailLabel.parentElement?.parentElement).toContainElement(
      screen.getByText("Verified"),
    );
    expect(emailInput).toHaveAttribute("readonly");
    unmount();
    renderCard({ preferences: { ...preferences, emailVerification: "unverified" } });

    const unverifiedInput = screen.getByLabelText<HTMLInputElement>("Notification email");
    const unverifiedLabel = unverifiedInput.labels?.[0];
    if (!unverifiedLabel) throw new Error("Notification email label was not rendered.");
    expect(unverifiedLabel.parentElement?.parentElement).toContainElement(
      screen.getByText("Unverified"),
    );
    expect(
      screen.getByText("No code has been confirmed for this address yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send code" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm email" })).not.toBeInTheDocument();
  });

  it("requests an email change without replacing the persisted email", async () => {
    const requestAccountEmailChange = vi.fn().mockResolvedValue({
      currentEmail: "owner@example.com",
      pendingEmail: "updated@example.com",
      status: "verification_required",
    });
    const confirmAccountEmailChange = vi.fn().mockResolvedValue({
      email: "updated@example.com",
      emailVerification: "verified",
      status: "changed",
    });
    const { card } = renderCard({ confirmAccountEmailChange, requestAccountEmailChange });
    const save = within(card).getByRole("button", { name: "Save" });

    fireEvent.change(screen.getByLabelText("Notification email"), {
      target: { value: "updated@example.com" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(requestAccountEmailChange).toHaveBeenCalledWith({ newEmail: "updated@example.com" }),
    );
    expect(await within(card).findByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Current notification email")).toHaveValue("owner@example.com");
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "New notification email pending confirmation: updated@example.com. Enter its code to confirm the change.",
      ),
    ).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() =>
      expect(confirmAccountEmailChange).toHaveBeenCalledWith({
        code: "123456",
        newEmail: "updated@example.com",
      }),
    );
    expect(screen.getByLabelText("Notification email")).toHaveValue("updated@example.com");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not request or save an invalid notification email", async () => {
    const requestAccountEmailChange = vi.fn();
    const { card } = renderCard({
      confirmAccountEmailChange: vi.fn(),
      requestAccountEmailChange,
    });
    const save = within(card).getByRole("button", { name: "Save" });

    fireEvent.change(screen.getByLabelText("Notification email"), {
      target: { value: "invalid-email" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid notification email.");
    expect(requestAccountEmailChange).not.toHaveBeenCalled();
    expect(within(card).queryByText("Saved")).not.toBeInTheDocument();
  });

  it("does not confirm a malformed verification code", async () => {
    const confirmCurrentAccountEmailVerification = vi.fn();
    renderCard({
      confirmCurrentAccountEmailVerification,
      preferences: { ...preferences, emailVerification: "unverified" },
      requestCurrentAccountEmailVerification: vi.fn(),
    });

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "12ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the 6-digit verification code.",
    );
    expect(confirmCurrentAccountEmailVerification).not.toHaveBeenCalled();
  });

  it("verifies the current unverified email through its distinct boundary", async () => {
    const requestCurrentAccountEmailVerification = vi.fn().mockResolvedValue({
      email: "unverified@example.com",
      status: "verification_required",
    });
    const confirmCurrentAccountEmailVerification = vi.fn().mockResolvedValue({
      email: "unverified@example.com",
      emailVerification: "verified",
      status: "verified",
    });
    renderCard({
      confirmCurrentAccountEmailVerification,
      preferences: {
        ...preferences,
        email: "unverified@example.com",
        emailVerification: "unverified",
      },
      requestCurrentAccountEmailVerification,
    });

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(requestCurrentAccountEmailVerification).toHaveBeenCalledWith({
        email: "unverified@example.com",
      }),
    );
    expect(
      await screen.findByText("If this address can be used, a verification code will arrive."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() =>
      expect(confirmCurrentAccountEmailVerification).toHaveBeenCalledWith({
        code: "123456",
        email: "unverified@example.com",
      }),
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
