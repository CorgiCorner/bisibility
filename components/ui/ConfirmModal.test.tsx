import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIRM, ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";

afterEach(() => {
  vi.useRealTimers();
});

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
  it("presses only the destructive action, not Cancel", () => {
    renderConfirmModal("deleteKeyword");

    const confirm = screen.getByRole("button", { name: "Delete keyword" });
    expect(confirm).toHaveClass("duration-[var(--motion-press)]");
    expect(confirm).toHaveClass("motion-safe:active:not-focus-visible:scale-[0.97]");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveClass(
      "motion-safe:active:not-focus-visible:scale-[0.97]",
    );
  });

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

describe("ConfirmModal async lifecycle", () => {
  it("emits success toast only after async confirm resolves", async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      <ToastProvider>
        <ConfirmModal kind="deleteKeyword" onClose={vi.fn()} onConfirm={onConfirm} open />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("Keyword deleted")).not.toBeInTheDocument();

    await act(async () => {
      resolveConfirm();
    });
    expect(screen.getByText("Keyword deleted")).toBeInTheDocument();
  });

  it("emits no success toast on rejection and becomes retryable", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("fail");
    });
    render(
      <ToastProvider>
        <ConfirmModal kind="deleteKeyword" onClose={vi.fn()} onConfirm={onConfirm} open />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await act(async () => {});
    expect(screen.queryByText("Keyword deleted")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The action could not be completed. Try again.",
    );
    expect(screen.getByRole("button", { name: "Delete keyword" })).toBeEnabled();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not close from Escape while confirmation is pending", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <ToastProvider>
        <ConfirmModal kind="deleteKeyword" onClose={onClose} onConfirm={onConfirm} open />
      </ToastProvider>,
    );

    const button = screen.getByRole("button", { name: "Delete keyword" });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks double submit while pending", async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      <ToastProvider>
        <ConfirmModal kind="deleteKeyword" onClose={vi.fn()} onConfirm={onConfirm} open />
      </ToastProvider>,
    );

    const button = screen.getByRole("button", { name: "Delete keyword" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();

    await act(async () => {
      resolveConfirm();
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("ConfirmModal undo", () => {
  it("shows Undo only when onUndo is provided", async () => {
    const { unmount } = render(
      <ToastProvider>
        <ConfirmModal kind="deleteKeyword" onClose={vi.fn()} onConfirm={vi.fn()} open />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await waitFor(() => expect(screen.getByText("Keyword deleted")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Undo", hidden: true })).not.toBeInTheDocument();
    unmount();

    render(
      <ToastProvider>
        <ConfirmModal
          kind="deleteKeyword"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          onUndo={vi.fn()}
          open
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await waitFor(() => expect(screen.getByText("Keyword deleted")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Undo", hidden: true })).toBeInTheDocument();
  });
});

describe("ConfirmModal typed reset", () => {
  it("keeps typed text during close and resets after onExited, then reopening is empty", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ToastProvider>
        <ConfirmModal kind="deleteProject" onClose={vi.fn()} onConfirm={vi.fn()} open />
      </ToastProvider>,
    );

    const input = screen.getByPlaceholderText("acme.dev");
    fireEvent.change(input, { target: { value: "acme.dev" } });
    expect(input).toHaveValue("acme.dev");

    rerender(
      <ToastProvider>
        <ConfirmModal kind="deleteProject" onClose={vi.fn()} onConfirm={vi.fn()} open={false} />
      </ToastProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    rerender(
      <ToastProvider>
        <ConfirmModal kind="deleteProject" onClose={vi.fn()} onConfirm={vi.fn()} open />
      </ToastProvider>,
    );

    expect(screen.getByPlaceholderText("acme.dev")).toHaveValue("");
  });
});

describe("ConfirmModal toast suppression", () => {
  it("supports explicit showConfirmationToast={false}", async () => {
    render(
      <ToastProvider>
        <ConfirmModal
          kind="deleteKeyword"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          open
          showConfirmationToast={false}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete keyword" }));
    await act(async () => {});
    expect(screen.queryByText("Keyword deleted")).not.toBeInTheDocument();
  });
});
