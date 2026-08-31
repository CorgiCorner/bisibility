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
      <div className="MuiModal-root">
        <button
          className="MuiBackdrop-root"
          data-testid="lower-backdrop"
          onClick={onLowerBackdropClick}
          type="button"
        >
          Lower backdrop
        </button>
      </div>
      <div className="MuiModal-root" onKeyDown={onOverlayKeyDown} role="dialog" tabIndex={-1}>
        <button
          className="MuiBackdrop-root"
          data-testid="top-backdrop"
          onClick={onTopBackdropClick}
          type="button"
        >
          Top backdrop
        </button>
        <button data-testid="inside-overlay" type="button">
          Inside overlay
        </button>
      </div>
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

    expect(callbacks.onOverlayKeyDown).toHaveBeenCalledOnce();
    expect(callbacks.onTopBackdropClick).not.toHaveBeenCalled();
  });

  it("uses the topmost backdrop when Escape is pressed outside an overlay", () => {
    const callbacks = renderHarness();

    fireEvent.keyDown(screen.getByTestId("outside-overlay"), { key: "Escape" });

    expect(callbacks.onLowerBackdropClick).not.toHaveBeenCalled();
    expect(callbacks.onTopBackdropClick).toHaveBeenCalledOnce();
  });

  it("closes the palette before considering an open overlay", () => {
    const callbacks = renderHarness({ paletteOpen: true });

    fireEvent.keyDown(screen.getByTestId("inside-overlay"), { key: "Escape" });

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
