import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
