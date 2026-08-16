import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CONFIRM, ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";

function renderConfirmModal(kind: ConfirmModalProps["kind"], onConfirm = vi.fn()) {
  render(
    <ToastProvider>
      <ConfirmModal kind={kind} onClose={vi.fn()} onConfirm={onConfirm} open />
    </ToastProvider>,
  );
  return onConfirm;
}

describe("instance-admin confirmation copy", () => {
  it("documents account state and rolling-spend consequences", () => {
    expect(CONFIRM.deactivateAccount.body).toContain("revoke every session");
    expect(CONFIRM.deactivateAccount.body).toContain("pause scheduled checks");
    expect(CONFIRM.reactivateAccount.body).toContain("reconverge");
    expect(CONFIRM.resetAccountLimits.body).toContain(
      "Monthly spend is a rolling window and cannot be reset",
    );
  });
});

describe("ConfirmModal keyboard shortcut", () => {
  it("confirms on Cmd+Enter when the action is enabled", () => {
    const onConfirm = renderConfirmModal("deleteKeyword");
    fireEvent.keyDown(screen.getByRole("button", { name: "Delete keyword" }), {
      key: "Enter",
      metaKey: true,
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("confirms on Ctrl+Enter when the action is enabled", () => {
    const onConfirm = renderConfirmModal("deleteKeyword");
    fireEvent.keyDown(screen.getByRole("button", { name: "Delete keyword" }), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not confirm on Cmd+Enter when the type guard is unmet", () => {
    render(
      <ToastProvider>
        <ConfirmModal kind="deleteProject" onClose={vi.fn()} onConfirm={vi.fn()} open />
      </ToastProvider>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Delete project" }), {
      key: "Enter",
      metaKey: true,
    });
    expect(screen.getByRole("button", { name: "Delete project" })).toBeDisabled();
  });
});
