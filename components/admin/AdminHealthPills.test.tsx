import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminHealthPills } from "./AdminHealthPills";

const providers = [
  {
    failed: 1,
    failureRatePercent: 5,
    notRun: 0,
    ok: 19,
    p95AgeMs: 1_000,
    provider: "gsc",
    stale: 0,
  },
  {
    failed: 2,
    failureRatePercent: 20,
    notRun: 0,
    ok: 8,
    p95AgeMs: 1_000,
    provider: "ga4",
    stale: 0,
  },
  {
    failed: 3,
    failureRatePercent: 20.1,
    notRun: 0,
    ok: 12,
    p95AgeMs: 1_000,
    provider: "plausible",
    stale: 0,
  },
];

describe("AdminHealthPills", () => {
  it("uses shared rate thresholds and operation labels", () => {
    render(
      <AdminHealthPills
        checkFailureRatePercent={4.9}
        providerHealth={providers}
        undeliveredCount={1}
        workerStatus="unknown"
      />,
    );

    const health = screen.getByLabelText("Operations health");
    expect(within(health).getByText("Worker unknown")).toHaveAttribute("data-tone", "unknown");
    expect(within(health).getByText("Checks: 4.9% failed")).toHaveAttribute("data-tone", "ok");
    expect(within(health).getByText("gsc: 5% failed")).toHaveAttribute("data-tone", "stale");
    expect(within(health).getByText("ga4: 20% failed")).toHaveAttribute("data-tone", "stale");
    expect(within(health).getByText("plausible: 20.1% failed")).toHaveAttribute(
      "data-tone",
      "failed",
    );
    expect(within(health).getByText("1 undelivered")).toHaveAttribute("data-tone", "stale");
  });

  it("shows only the worst provider in compact mode", () => {
    render(
      <AdminHealthPills
        checkFailureRatePercent={null}
        compact
        providerHealth={providers}
        undeliveredCount={0}
        workerStatus="ok"
      />,
    );

    expect(screen.getByText("plausible: 20.1% failed")).toBeInTheDocument();
    expect(screen.queryByText("gsc: 5% failed")).not.toBeInTheDocument();
    expect(screen.getByText("Checks: unknown")).toHaveAttribute("data-tone", "unknown");
    expect(screen.getByText("0 undelivered")).toHaveAttribute("data-tone", "ok");
  });

  it("distinguishes unavailable delivery diagnostics from zero undelivered events", () => {
    render(
      <AdminHealthPills
        checkFailureRatePercent={null}
        providerHealth={[]}
        undeliveredCount={null}
        workerStatus="unknown"
      />,
    );

    expect(screen.getByText("Delivery: unknown")).toHaveAttribute("data-tone", "unknown");
    expect(screen.queryByText("0 undelivered")).not.toBeInTheDocument();
  });
});
