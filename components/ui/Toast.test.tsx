import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function ToastTriggers() {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast("Check failed", { tint: "red" })} type="button">
        Show error
      </button>
      <button onClick={() => showToast("Alert created", { tint: "green" })} type="button">
        Show success
      </button>
    </>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("queues feedback and keeps errors visible longer than success messages", () => {
    render(
      <ToastProvider>
        <ToastTriggers />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show error" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));

    expect(screen.getByText("Check failed")).toBeInTheDocument();
    expect(screen.getByText("Alert created")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3200));
    expect(screen.queryByText("Alert created")).not.toBeInTheDocument();
    expect(screen.getByText("Check failed")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4800));
    expect(screen.queryByText("Check failed")).not.toBeInTheDocument();
  });
});
