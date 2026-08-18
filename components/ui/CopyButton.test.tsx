import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("./Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const RESET_DELAY = 1200;

function copyPressRules(button: Element) {
  const css = Array.from(document.querySelectorAll("style[data-emotion]"))
    .map((style) => style.textContent ?? "")
    .join("\n");

  const classes = Array.from(button.classList).filter((className) => className.startsWith("css-"));

  return Array.from(css.matchAll(/[^{}]+\{[^{}]*\}/g))
    .map((match) => match[0])
    .filter((rule) =>
      classes.some((className) => rule.includes(`${className}:active:not(:focus-visible)`)),
    );
}

describe("CopyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses tokenized pointer press feedback with focus and disabled guards", () => {
    render(<CopyButton label="Copy ID" text="abc123" />);

    const rules = copyPressRules(screen.getByRole("button", { name: "Copy ID" }));
    expect(rules.some((rule) => rule.includes("scale(0.97)"))).toBe(true);
    expect(rules.every((rule) => rule.includes(":not(.Mui-disabled)"))).toBe(true);
    expect(document.head.textContent).toContain("@media (prefers-reduced-motion: no-preference)");
  });

  it("does not show Copied before the clipboard promise resolves, then does after", async () => {
    let resolveWriteText!: () => void;
    mocks.writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWriteText = resolve;
      }),
    );

    render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    expect(screen.queryByRole("button", { name: "Copied!" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeInTheDocument();

    await act(async () => {
      resolveWriteText();
    });

    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("shows the error path and never Copied when the clipboard promise rejects", async () => {
    mocks.writeText.mockRejectedValue(new Error("denied"));

    render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    expect(screen.queryByRole("button", { name: "Copied!" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Copy failed",
      expect.objectContaining({ tint: "red" }),
    );
  });

  it("shows the error path and never Copied when the Clipboard API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    expect(screen.queryByRole("button", { name: "Copied!" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Copy failed",
      expect.objectContaining({ tint: "red" }),
    );
  });

  it("clears the copied reset timer on unmount", async () => {
    mocks.writeText.mockResolvedValue(undefined);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    const resetIndex = setTimeoutSpy.mock.calls.findIndex((args) => args[1] === RESET_DELAY);
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    const resetTimerId = setTimeoutSpy.mock.results[resetIndex].value;

    expect(clearTimeoutSpy).not.toHaveBeenCalledWith(resetTimerId);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(resetTimerId);
  });

  it("does not leak multiple reset timers on rapid retry", async () => {
    mocks.writeText.mockResolvedValue(undefined);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copied!" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copied!" }));
    });

    const resetTimerIds = setTimeoutSpy.mock.calls
      .map((args, i) => ({ delay: args[1], id: setTimeoutSpy.mock.results[i].value }))
      .filter((x) => x.delay === RESET_DELAY)
      .map((x) => x.id);

    expect(resetTimerIds.length).toBe(3);

    const clearedIds = new Set(clearTimeoutSpy.mock.calls.map((call) => call[0]));
    const pendingCount = resetTimerIds.filter((id) => !clearedIds.has(id)).length;

    expect(pendingCount).toBe(1);
  });

  it("does not schedule a reset timer, toast, or setState after unmount during a pending clipboard write", async () => {
    let resolveWriteText!: () => void;
    mocks.writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWriteText = resolve;
      }),
    );

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const { unmount } = render(<CopyButton label="Copy ID" text="abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    });

    const scheduledBeforeUnmount = setTimeoutSpy.mock.calls.filter(
      (args) => args[1] === RESET_DELAY,
    ).length;

    unmount();

    await act(async () => {
      resolveWriteText();
    });

    const scheduledAfterUnmount = setTimeoutSpy.mock.calls
      .slice(scheduledBeforeUnmount)
      .filter((args) => args[1] === RESET_DELAY).length;

    expect(scheduledAfterUnmount).toBe(0);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("tracks tooltip content across idle, copied, and error states", async () => {
    mocks.writeText.mockResolvedValue(undefined);
    render(<CopyButton label="Copy ID" text="abc123" />);

    const button = screen.getByRole("button", { name: "Copy ID" });
    fireEvent.mouseOver(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy ID");

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copied!");
  });

  it("shows the visible tooltip as Copy failed when the clipboard rejects", async () => {
    mocks.writeText.mockRejectedValue(new Error("denied"));
    render(<CopyButton label="Copy ID" text="abc123" />);

    const button = screen.getByRole("button", { name: "Copy ID" });
    fireEvent.mouseOver(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy ID");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("button", { name: "Copy failed" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy failed");
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Copy failed",
      expect.objectContaining({ tint: "red" }),
    );
  });

  it("opens the tooltip from keyboard focus", () => {
    render(<CopyButton label="Copy ID" text="abc123" />);

    const button = screen.getByRole("button", { name: "Copy ID" });
    const realMatches = button.matches.bind(button);
    button.matches = ((selector: string) =>
      selector === ":focus-visible" ? true : realMatches(selector)) as typeof button.matches;
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy ID");
  });
});
