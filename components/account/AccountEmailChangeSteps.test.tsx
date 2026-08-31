import { AccountEmailChangeSteps } from "@/components/account/AccountEmailChangeSteps";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

function renderSteps(props: Partial<ComponentProps<typeof AccountEmailChangeSteps>> = {}) {
  const requestAccountEmailChangeCode = vi.fn().mockResolvedValue({
    currentEmail: "owner@example.com",
    status: "verification_required",
  });
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
  const onChanged = vi.fn();
  const result = render(
    <AccountEmailChangeSteps
      confirmAccountEmailChange={confirmAccountEmailChange}
      currentEmail="owner@example.com"
      onChanged={onChanged}
      requestAccountEmailChange={requestAccountEmailChange}
      requestAccountEmailChangeCode={requestAccountEmailChangeCode}
      {...props}
    />,
  );

  return {
    ...result,
    confirmAccountEmailChange,
    onChanged,
    requestAccountEmailChange,
    requestAccountEmailChangeCode,
  };
}

async function reachDetailsStep(
  props: Partial<ComponentProps<typeof AccountEmailChangeSteps>> = {},
) {
  const rendered = renderSteps(props);

  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
  await waitFor(() => expect(rendered.requestAccountEmailChangeCode).toHaveBeenCalledOnce());
  await screen.findByLabelText("Code from your current email");

  return rendered;
}

describe("AccountEmailChangeSteps", () => {
  it("starts by offering a code to the current address only", () => {
    renderSteps();

    expect(screen.getByRole("button", { name: "Change email" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New email address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Code from your current email")).not.toBeInTheDocument();
  });

  it("keeps the initial change email action right-aligned without helper copy", () => {
    renderSteps();

    const actionRow = screen.getByRole("button", { name: "Change email" }).parentElement;
    expect(actionRow).toHaveClass("sm:justify-end");
    expect(
      screen.queryByText(
        "Changing this address starts with a code sent to the address on the account today.",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps confirmation actions responsive with Cancel left and sending right", async () => {
    await reachDetailsStep();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const sendCode = screen.getByRole("button", { name: "Send code to the new address" });
    const actionRow = cancel.parentElement;

    expect(actionRow).toHaveClass("flex", "flex-wrap", "items-center", "gap-2");
    expect(sendCode).toHaveClass("ml-auto");
    expect(actionRow?.firstElementChild).toBe(cancel);
    expect(actionRow?.lastElementChild).toBe(sendCode);
  });

  it("asks for the current code together with the new address", async () => {
    const { requestAccountEmailChange } = await reachDetailsStep();

    expect(screen.getByLabelText("New email address")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Code from your current email"), {
      target: { value: "654321" },
    });
    fireEvent.change(screen.getByLabelText("New email address"), {
      target: { value: "updated@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code to the new address" }));

    await waitFor(() =>
      expect(requestAccountEmailChange).toHaveBeenCalledWith({
        currentCode: "654321",
        newEmail: "updated@example.com",
      }),
    );
  });

  it("never requests a change without a code from the current address", async () => {
    const { requestAccountEmailChange } = await reachDetailsStep();

    fireEvent.change(screen.getByLabelText("New email address"), {
      target: { value: "updated@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code to the new address" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the 6-digit verification code.",
    );
    expect(requestAccountEmailChange).not.toHaveBeenCalled();
  });

  it("confirms the change with the code sent to the new address", async () => {
    const { confirmAccountEmailChange, onChanged } = await reachDetailsStep();

    fireEvent.change(screen.getByLabelText("Code from your current email"), {
      target: { value: "654321" },
    });
    fireEvent.change(screen.getByLabelText("New email address"), {
      target: { value: "updated@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code to the new address" }));

    const newCode = await screen.findByLabelText("Code from your new email");
    expect(screen.getByText(/updated@example.com/)).toBeInTheDocument();

    fireEvent.change(newCode, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm email change" }));

    await waitFor(() =>
      expect(confirmAccountEmailChange).toHaveBeenCalledWith({
        code: "123456",
        newEmail: "updated@example.com",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("updated@example.com"));
    expect(await screen.findByRole("button", { name: "Change email" })).toBeInTheDocument();
  });

  it("surfaces a failed send without advancing", async () => {
    const requestAccountEmailChangeCode = vi
      .fn()
      .mockRejectedValue(new Error("Verification code could not be sent."));
    renderSteps({ requestAccountEmailChangeCode });

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    expect(await screen.findByText("Verification code could not be sent.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Code from your current email")).not.toBeInTheDocument();
  });

  it("locks Cancel while a request is pending so a late reply cannot reopen a step", async () => {
    let finish: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const requestAccountEmailChange = vi.fn().mockReturnValue(pending);
    await reachDetailsStep({ requestAccountEmailChange });

    fireEvent.change(screen.getByLabelText("Code from your current email"), {
      target: { value: "654321" },
    });
    fireEvent.change(screen.getByLabelText("New email address"), {
      target: { value: "updated@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code to the new address" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    expect(requestAccountEmailChange).toHaveBeenCalledOnce();

    finish({
      currentEmail: "owner@example.com",
      pendingEmail: "updated@example.com",
      status: "verification_required",
    });
    await screen.findByLabelText("Code from your new email");
    expect(screen.getByRole("button", { name: "Start over" })).toBeEnabled();
  });
});
