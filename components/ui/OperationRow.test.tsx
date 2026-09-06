import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationRow, type OperationRowProps } from "./OperationRow";

const operation = {
  action: "cancel",
  actor: null,
  completed: 126,
  counts: null,
  deferred: 0,
  etaSeconds: null,
  failed: 0,
  href: null,
  meta: "350 keywords by filter",
  nextCheckAt: null,
  now: "2026-09-02T10:00:00.000Z",
  provider: "DataForSEO",
  resumeDate: null,
  showBar: true,
  state: "running",
  stateLine: null,
  status: null,
  title: "Manual rank check",
  total: 700,
  unit: "checks",
  variant: "inline",
} satisfies OperationRowProps;

function renderOperation(overrides: Partial<OperationRowProps> = {}) {
  return render(<OperationRow {...operation} {...overrides} />);
}

describe("OperationRow", () => {
  afterEach(() => vi.useRealTimers());

  it("renders a provider result sentence with a real ETA", () => {
    renderOperation({ etaSeconds: 240 });

    expect(screen.getByText("DataForSEO is returning results - ~4 min left.")).toBeInTheDocument();
  });

  it("ends the provider result sentence after results when no ETA is available", () => {
    renderOperation();

    expect(screen.getByText("DataForSEO is returning results.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });

  it("does not promise a start within a minute before a target is claimed", () => {
    renderOperation({ state: "queued" });

    expect(screen.getByText("Waiting for the first check to start.")).toBeInTheDocument();
  });

  it("keeps the future spread state distinct from the provider queue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    renderOperation({ nextCheckAt: "2026-09-02T12:00:00.000Z" });

    expect(screen.getByText("Next check in 2h")).toBeInTheDocument();
  });

  it("names the first check while the run is still queued", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    renderOperation({ state: "queued", nextCheckAt: "2026-09-02T14:00:00.000Z" });
    expect(screen.getByText("First check in 4h")).toBeInTheDocument();
  });

  it("does not invent an actor or resume date when operation data omits them", () => {
    const { rerender } = renderOperation({ resumeDate: null, state: "budget" });
    expect(
      screen.getByText("Monthly cap reached - remaining items are skipped."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Oct 1|Anna/)).not.toBeInTheDocument();

    rerender(<OperationRow {...operation} actor={null} state="cancelled" />);
    expect(screen.getByText("Cancelled - what completed first is kept.")).toBeInTheDocument();
    expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
  });

  it("never renders a bare count, including a custom count", () => {
    const { rerender } = renderOperation({ completed: 12, total: 20, unit: "targets" });
    expect(screen.getByText("12 / 20 targets")).toBeInTheDocument();

    rerender(
      <OperationRow {...operation} completed={12} counts="12 / 20" total={20} unit="targets" />,
    );
    expect(screen.getByText("12 / 20 targets")).toBeInTheDocument();
  });

  it("clamps inconsistent progress values to the total", () => {
    renderOperation({ completed: 8, deferred: 5, failed: 4, total: 10 });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  });

  it("keeps action and destination explicit", () => {
    const onAction = vi.fn();
    renderOperation({ href: "/runs/rcr_123", onAction });

    fireEvent.click(screen.getByRole("button", { name: "Cancel Manual rank check" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Manual rank check/ })).toHaveAttribute(
      "href",
      "/runs/rcr_123",
    );
  });

  it("hydrates a ticking relative value from the server instant without a warning", async () => {
    const markup = renderToString(
      <OperationRow {...operation} nextCheckAt="2026-09-02T12:00:00.000Z" />,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;

    await act(async () => {
      root = hydrateRoot(
        container,
        <OperationRow {...operation} nextCheckAt="2026-09-02T12:00:00.000Z" />,
      );
    });

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/hydration/i));
    await act(async () => root.unmount());
    consoleError.mockRestore();
  });
});
