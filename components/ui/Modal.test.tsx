import { MOTION_MODAL_EXIT } from "@/lib/ui/motion";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function renderModal(
  overrides: { onPrimaryAction?: () => void; primaryActionDisabled?: boolean } = {},
) {
  const onClose = vi.fn();
  const onPrimaryAction = overrides.onPrimaryAction ?? vi.fn();
  render(
    <Modal
      onClose={onClose}
      onPrimaryAction={onPrimaryAction}
      open
      primaryActionDisabled={overrides.primaryActionDisabled}
      title="Test modal"
    >
      <button type="button">content</button>
    </Modal>,
  );
  return { onClose, onPrimaryAction, target: () => screen.getByText("content") };
}

describe("Modal keyboard shortcuts", () => {
  it("gives the close button tokenized pointer-only press feedback", () => {
    renderModal();

    const close = screen.getByRole("button", { name: "Close modal" });
    expect(close).toHaveClass("duration-[var(--motion-press)]");
    expect(close).toHaveClass("motion-safe:active:not-focus-visible:scale-[0.97]");
  });

  it("calls onClose on Escape and prevents default", () => {
    const { onClose, target } = renderModal();
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    el.dispatchEvent(event);
    expect(onClose).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("stops Escape propagation so the dialog owner is not re-notified", () => {
    const { onClose, target } = renderModal();
    fireEvent.keyDown(target(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("invokes onPrimaryAction on Cmd+Enter when enabled", () => {
    const { onPrimaryAction, target } = renderModal();
    fireEvent.keyDown(target(), { key: "Enter", metaKey: true });
    expect(onPrimaryAction).toHaveBeenCalledOnce();
  });

  it("invokes onPrimaryAction on Ctrl+Enter when enabled", () => {
    const { onPrimaryAction, target } = renderModal();
    fireEvent.keyDown(target(), { key: "Enter", ctrlKey: true });
    expect(onPrimaryAction).toHaveBeenCalledOnce();
  });

  it("does not invoke onPrimaryAction on Cmd+Enter when disabled", () => {
    const { onPrimaryAction, target } = renderModal({ primaryActionDisabled: true });
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      metaKey: true,
    });
    el.dispatchEvent(event);
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores Cmd+Enter when no primary action is provided", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} open title="No action">
        <button type="button">content</button>
      </Modal>,
    );
    expect(() =>
      fireEvent.keyDown(screen.getByText("content"), { key: "Enter", metaKey: true }),
    ).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores Escape during IME composition (isComposing)", () => {
    const { onClose, target } = renderModal();
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    Object.defineProperty(event, "isComposing", { value: true });
    el.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores Cmd+Enter during IME composition (isComposing)", () => {
    const { onPrimaryAction, target } = renderModal();
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      metaKey: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });
    el.dispatchEvent(event);
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores Ctrl+Enter during IME composition (keyCode 229)", () => {
    const { onPrimaryAction, target } = renderModal();
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ctrlKey: true,
    });
    Object.defineProperty(event, "keyCode", { value: 229 });
    el.dispatchEvent(event);
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores Escape during IME composition (keyCode 229)", () => {
    const { onClose, target } = renderModal();
    const el = target();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    Object.defineProperty(event, "keyCode", { value: 229 });
    el.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not stop propagation during IME composition", () => {
    const { target } = renderModal();
    const outer = document.createElement("div");
    outer.appendChild(target());
    document.body.appendChild(outer);
    const caught = vi.fn();
    outer.addEventListener("keydown", caught);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      metaKey: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });
    target().dispatchEvent(event);
    expect(caught).toHaveBeenCalled();
    document.body.removeChild(outer);
  });
});

describe("Modal exit lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps content mounted during exit and fires onExited only after the transition", () => {
    const onExited = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal onClose={onClose} onExited={onExited} open title="Exit test">
        <button type="button">content</button>
      </Modal>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();

    rerender(
      <Modal onClose={onClose} onExited={onExited} open={false} title="Exit test">
        <button type="button">content</button>
      </Modal>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(onExited).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(MOTION_MODAL_EXIT + 50);
    });

    expect(onExited).toHaveBeenCalledOnce();
  });

  it("does not fire onExited when open remains true", () => {
    const onExited = vi.fn();
    render(
      <Modal onClose={vi.fn()} onExited={onExited} open title="Stay open">
        <button type="button">content</button>
      </Modal>,
    );

    act(() => {
      vi.advanceTimersByTime(MOTION_MODAL_EXIT + 50);
    });

    expect(onExited).not.toHaveBeenCalled();
  });
});

describe("Modal token classes", () => {
  it("applies rounded-card-lg to the dialog paper", () => {
    render(
      <Modal onClose={vi.fn()} open title="Token test">
        <p>body</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("rounded-card-lg");
    expect(dialog).toHaveStyle({ borderRadius: "16px" });
  });

  it("uses numeric spacing utilities for header, content, and footer", () => {
    render(
      <Modal footer={<span>ok</span>} headerDivider onClose={vi.fn()} open title="Token test">
        <p>body</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");

    const header = within(dialog).getByText("Token test").closest("header");
    expect(header).toHaveClass("px-5.5", "py-4.5");

    const content = screen.getByText("body").closest("div");
    expect(content).toHaveClass("px-5.5", "py-4.5");

    const footer = within(dialog).getByText("ok").closest("footer");
    expect(footer).toHaveClass("px-5.5", "py-3.5", "gap-4.5");
  });
});
