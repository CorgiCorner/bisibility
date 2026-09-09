import { Modal } from "@/components/ui/Modal";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { handleShellKeyDown } from "./command-keyboard";

type ShellKeyboardHarnessProps = {
  closePalette: () => void;
  onLowerBackdropClick: () => void;
  onOverlayKeyDown: () => void;
  onTopBackdropClick: () => void;
  paletteOpen?: boolean;
  togglePalette: () => void;
};

function ShellKeyboardHarness({
  closePalette,
  onLowerBackdropClick,
  onOverlayKeyDown,
  onTopBackdropClick,
  paletteOpen = false,
  togglePalette,
}: Readonly<ShellKeyboardHarnessProps>) {
  return (
    <div
      onKeyDownCapture={(event) =>
        handleShellKeyDown(event, { closePalette, paletteOpen, togglePalette })
      }
    >
      <button data-testid="outside-overlay" type="button">
        Outside overlay
      </button>
      {!paletteOpen ? (
        <>
          <Modal title="Lower panel" open onClose={onLowerBackdropClick}>
            <span>Lower panel body</span>
          </Modal>
          <Modal title="Top panel" open onClose={onTopBackdropClick}>
            <div>
              <button data-testid="inside-overlay" type="button" onKeyDown={onOverlayKeyDown}>
                Inside overlay
              </button>
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}

function renderHarness(overrides: Partial<ShellKeyboardHarnessProps> = {}) {
  const callbacks = {
    closePalette: vi.fn(),
    onLowerBackdropClick: vi.fn(),
    onOverlayKeyDown: vi.fn(),
    onTopBackdropClick: vi.fn(),
    togglePalette: vi.fn(),
  };
  render(<ShellKeyboardHarness {...callbacks} {...overrides} />);
  return { ...callbacks, ...overrides };
}

describe("handleShellKeyDown", () => {
  it("leaves Escape inside an overlay for the overlay to handle", () => {
    const callbacks = renderHarness();

    fireEvent.keyDown(screen.getByTestId("inside-overlay"), { key: "Escape" });

    expect(callbacks.onOverlayKeyDown).not.toHaveBeenCalled();
    expect(callbacks.onTopBackdropClick).toHaveBeenCalledOnce();
  });

  it("lets the topmost overlay handle Escape even when focus is outside it", () => {
    const callbacks = renderHarness();

    fireEvent.keyDown(screen.getByTestId("outside-overlay"), { key: "Escape" });

    expect(callbacks.onLowerBackdropClick).not.toHaveBeenCalled();
    expect(callbacks.onTopBackdropClick).toHaveBeenCalledOnce();
  });

  it("closes the palette before considering an open overlay", () => {
    const callbacks = renderHarness({ paletteOpen: true });

    fireEvent.keyDown(screen.getByTestId("outside-overlay"), { key: "Escape" });

    expect(callbacks.closePalette).toHaveBeenCalledOnce();
    expect(callbacks.onTopBackdropClick).not.toHaveBeenCalled();
  });

  it("toggles the palette with Cmd or Ctrl+K", () => {
    const callbacks = renderHarness();
    const outsideOverlay = screen.getByTestId("outside-overlay");

    fireEvent.keyDown(outsideOverlay, { key: "k", metaKey: true });
    fireEvent.keyDown(outsideOverlay, { ctrlKey: true, key: "k" });

    expect(callbacks.togglePalette).toHaveBeenCalledTimes(2);
  });
});
