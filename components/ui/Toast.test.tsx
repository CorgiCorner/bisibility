import { MOTION_TOAST_ENTER, MOTION_TOAST_EXIT } from "@/lib/ui/motion";
import useMediaQuery from "@mui/material/useMediaQuery";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

vi.mock("@mui/material/useMediaQuery", () => ({ default: vi.fn(() => false) }));

const BUFFER = 50;
const ENTRY_MS = MOTION_TOAST_ENTER + BUFFER;
const EXIT_MS = MOTION_TOAST_EXIT + BUFFER;

function ToastTriggers({ undoFn }: { undoFn?: () => Promise<void> | void }) {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast("Check failed", { tint: "red" })} type="button">
        Show error
      </button>
      <button onClick={() => showToast("Alert created", { tint: "green" })} type="button">
        Show success
      </button>
      {undoFn ? (
        <button onClick={() => showToast("Added market", { undo: undoFn })} type="button">
          Show undo
        </button>
      ) : null}
    </>
  );
}

function setHidden(value: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value });
}

function outputFor(text: string): HTMLElement {
  const output = screen.getByText(text).closest("output");
  if (!output) throw new Error(`output not found for "${text}"`);
  return output;
}

function deferredUndo() {
  let resolve: () => void = () => {};
  let reject: (e: Error) => void = () => {};
  const fn = vi.fn(
    () =>
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return { fn, resolve: () => resolve(), reject: (e: Error) => reject(e) };
}

function renderToast(undoFn?: () => Promise<void> | void) {
  return render(
    <ToastProvider>
      <ToastTriggers undoFn={undoFn} />
    </ToastProvider>,
  );
}

function fireEnd(node: HTMLElement, property = "opacity"): void {
  node.dispatchEvent(
    new TransitionEvent("transitionend", { bubbles: true, propertyName: property }),
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it("entry completes before visible timer; expiry enters retained exit; fallback removes", () => {
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ENTRY_MS - 10));
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10 + 3200 + BUFFER));
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
  });

  it("transitionend completes exit", () => {
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    act(() => vi.advanceTimersByTime(3200 + BUFFER));
    act(() => fireEnd(outputFor("Alert created")));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
  });

  it("ignores child and transform transitionend events", () => {
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    const output = outputFor("Alert created");
    act(() => {
      fireEnd(screen.getByText("Alert created"));
      fireEnd(output, "transform");
    });
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ENTRY_MS + 3200 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
  });

  it("hover does not pause non-interactive toasts", () => {
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    fireEvent.mouseOver(outputFor("Alert created"), { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(3200 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
  });

  it("hover pauses remaining time for interactive toasts", () => {
    const undoFn = vi.fn(async () => {});
    renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS + 2000));
    const output = outputFor("Added market");
    fireEvent.mouseOver(output, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    fireEvent.mouseOut(output, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(4000 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("preserves hover pause established during entry", () => {
    renderToast(vi.fn(async () => {}));
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    const output = outputFor("Added market");
    fireEvent.mouseOver(output, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(ENTRY_MS + 6000));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    fireEvent.mouseOut(output, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(6000));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("focus nesting: does not resume when focus moves within the same toast", () => {
    const undoFn = vi.fn(async () => {});
    renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    const output = outputFor("Added market");
    const undoButton = screen.getByRole("button", { name: "Undo" });
    fireEvent.focusIn(undoButton);
    fireEvent.focusOut(undoButton, { relatedTarget: output });
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    fireEvent.focusOut(undoButton, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(6000 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("hidden-tab pause including toast shown while hidden", () => {
    const undoFn = vi.fn(async () => {});
    renderToast(undoFn);
    setHidden(true);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    act(() => vi.advanceTimersByTime(6000 + BUFFER));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    setHidden(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(6000 + BUFFER));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("hidden resumes only the remainder, not the full duration", () => {
    renderToast(vi.fn(async () => {}));
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS + 2000));
    setHidden(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    setHidden(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("Undo pending disables action; resolve enters exit", async () => {
    const { fn: undoFn, resolve: resolveUndo } = deferredUndo();
    renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undoFn).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Added market")).toBeInTheDocument();
    await act(async () => resolveUndo());
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
  });

  it("Undo reject replaces with error toast", async () => {
    const { fn: undoFn, reject: rejectUndo } = deferredUndo();
    renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => rejectUndo(new Error("fail")));
    expect(screen.getByText("Undo failed. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Added market")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText("Undo failed. Please try again.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Undo failed. Please try again.")).not.toBeInTheDocument();
  });

  it("Undo sync throw replaces with error toast", async () => {
    const undoFn = vi.fn(() => {
      throw new Error("sync fail");
    });
    renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undoFn).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(screen.getByText("Undo failed. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("unmount clears timers and removes the visibilitychange listener", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { fn: undoFn, resolve: resolveUndo } = deferredUndo();
    const { unmount } = renderToast(undoFn);
    fireEvent.click(screen.getByRole("button", { name: "Show undo" }));
    const visibilityListener = addSpy.mock.calls.find(([type]) => type === "visibilitychange")?.[1];
    expect(visibilityListener).toBeTypeOf("function");
    act(() => vi.advanceTimersByTime(ENTRY_MS));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", visibilityListener);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10_000));
    expect(() => act(() => resolveUndo())).not.toThrow();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("durations and queue behavior: errors outlast success", () => {
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(screen.getByText("Check failed")).toBeInTheDocument();
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ENTRY_MS + 3200 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
    expect(screen.getByText("Check failed")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4800 + BUFFER));
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(screen.queryByText("Check failed")).not.toBeInTheDocument();
  });

  it("reduced motion: no transform and lifecycle completes without transitionend", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    renderToast();
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    const output = outputFor("Alert created");
    expect(output.style.transform).toBe("none");
    expect(output.style.transitionDuration).toBe("0ms");
    act(() => vi.advanceTimersByTime(16));
    act(() => vi.advanceTimersByTime(3199));
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(16));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
  });
});
