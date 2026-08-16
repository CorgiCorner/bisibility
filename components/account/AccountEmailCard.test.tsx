import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const defaults = { email: "owner@example.com", emailVerified: true } as const;

function renderCard(props: Partial<ComponentProps<typeof AccountEmailCard>> = {}) {
  const result = render(<AccountEmailCard {...defaults} {...props} />);
  const card = result.container.querySelector<HTMLElement>('[data-account-card-frame="email"]');
  if (!card) throw new Error("Account email card was not rendered.");
  return { ...result, card };
}

describe("AccountEmailCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the account email title and never uses notification email wording", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "Account email" })).toBeInTheDocument();
    expect(screen.queryByText("Notification email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notification email")).not.toBeInTheDocument();
  });

  it("renders verified and unverified states without a production mutation boundary", () => {
    const { unmount } = renderCard();

    const emailInput = screen.getByLabelText<HTMLInputElement>("Account email");
    const accountEmailLabel = emailInput.labels?.[0];
    if (!accountEmailLabel) throw new Error("Account email label was not rendered.");
    expect(accountEmailLabel.parentElement?.parentElement).toContainElement(
      screen.getByText("Verified"),
    );
    expect(emailInput).toHaveAttribute("readonly");
    unmount();

    renderCard({ emailVerified: false });

    const unverifiedInput = screen.getByLabelText<HTMLInputElement>("Account email");
    const unverifiedLabel = unverifiedInput.labels?.[0];
    if (!unverifiedLabel) throw new Error("Account email label was not rendered.");
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
    const { card } = renderCard({
      confirmAccountEmailChange,
      requestAccountEmailChange,
    });
    const save = within(card).getByRole("button", { name: "Save" });

    fireEvent.change(screen.getByLabelText("Account email"), {
      target: { value: "updated@example.com" },
    });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(requestAccountEmailChange).toHaveBeenCalledWith({ newEmail: "updated@example.com" }),
    );
    expect(await within(card).findByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Current account email")).toHaveValue("owner@example.com");
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "New account email pending confirmation: updated@example.com. Enter its code to confirm the change.",
      ),
    ).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() =>
      expect(confirmAccountEmailChange).toHaveBeenCalledWith({
        code: "123456",
        newEmail: "updated@example.com",
      }),
    );
    expect(screen.getByLabelText("Account email")).toHaveValue("updated@example.com");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not request or save an invalid account email", async () => {
    const requestAccountEmailChange = vi.fn();
    const { card } = renderCard({
      confirmAccountEmailChange: vi.fn(),
      requestAccountEmailChange,
    });
    const save = within(card).getByRole("button", { name: "Save" });

    fireEvent.change(screen.getByLabelText("Account email"), {
      target: { value: "invalid-email" },
    });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid account email.");
    expect(requestAccountEmailChange).not.toHaveBeenCalled();
    expect(within(card).queryByText("Saved")).not.toBeInTheDocument();
  });

  it("does not confirm a malformed verification code", async () => {
    const confirmCurrentAccountEmailVerification = vi.fn();
    renderCard({
      confirmCurrentAccountEmailVerification,
      emailVerified: false,
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
      email: "unverified@example.com",
      emailVerified: false,
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
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});
