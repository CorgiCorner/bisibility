import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeState: vi.fn(),
  resetLimits: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/lib/actions/instance-admin-account-actions", () => ({
  resetInstanceAdminAccountLimits: mocks.resetLimits,
  setInstanceAdminAccountDeactivated: mocks.changeState,
}));
vi.mock("@/components/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ConfirmModal: ({
    kind,
    onConfirm,
    open,
  }: {
    kind: string;
    onConfirm: () => void;
    open: boolean;
  }) =>
    open ? (
      <button onClick={onConfirm} type="button">
        Confirm {kind}
      </button>
    ) : null,
  useToast: () => ({ showToast: mocks.showToast }),
}));

import { AdminAccountActions } from "./AdminAccountActions";

describe("AdminAccountActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms deactivation and publishes the returned account state", async () => {
    const onStatusChange = vi.fn();
    mocks.changeState.mockResolvedValue({
      accountStatus: "deactivated",
      message: "Account deactivated.",
      status: "completed",
    });
    render(<AdminAccountActions onStatusChange={onStatusChange} status="active" userId="user_1" />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivateAccount" }));

    await waitFor(() =>
      expect(mocks.changeState).toHaveBeenCalledWith({ deactivated: true, userId: "user_1" }),
    );
    expect(onStatusChange).toHaveBeenCalledWith("deactivated");
    expect(mocks.showToast).toHaveBeenCalledWith("Account deactivated.", { tint: "green" });
  });

  it("renders the reactivation path for a deactivated account", () => {
    render(<AdminAccountActions onStatusChange={vi.fn()} status="deactivated" userId="user_1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reactivate account" }));
    expect(screen.getByRole("button", { name: "Confirm reactivateAccount" })).toBeInTheDocument();
  });

  it("confirms the reset and preserves the rolling-spend message", async () => {
    mocks.resetLimits.mockResolvedValue({
      clearedBuckets: 2,
      message: "Rate limits reset; monthly spend is a rolling window and cannot be reset",
      status: "completed",
    });
    render(<AdminAccountActions onStatusChange={vi.fn()} status="active" userId="user_1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reset rate limits" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm resetAccountLimits" }));

    await waitFor(() => expect(mocks.resetLimits).toHaveBeenCalledWith({ userId: "user_1" }));
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Rate limits reset; monthly spend is a rolling window and cannot be reset",
      { tint: "green" },
    );
  });
});
