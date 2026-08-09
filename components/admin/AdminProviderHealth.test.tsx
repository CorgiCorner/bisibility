import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminProviderHealth } from "./AdminProviderHealth";

describe("AdminProviderHealth", () => {
  it("renders provider aggregates without project or connection identifiers", () => {
    const { container } = render(
      <AdminProviderHealth
        rows={[
          {
            failed: 12,
            failureRatePercent: 4.9,
            notRun: 4,
            ok: 941,
            p95AgeMs: 36 * 3_600_000,
            provider: "gsc",
            stale: 63,
          },
          {
            failed: 38,
            failureRatePercent: 28,
            notRun: 2,
            ok: 84,
            p95AgeMs: null,
            provider: "plausible",
            stale: 11,
          },
        ]}
      />,
    );

    expect(screen.getByText("ok 941")).toBeInTheDocument();
    expect(screen.getByText("p95 last success: 36 h")).toBeInTheDocument();
    expect(screen.getByText("p95 last success: -")).toBeInTheDocument();
    expect(screen.getByText("4.9% failed")).toHaveClass("text-green-text");
    expect(screen.getByText("28% failed")).toHaveClass("text-red-text");
    expect(container.querySelector('[data-tone="ok"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tone="failed"]')).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Project ID");
    expect(container).not.toHaveTextContent("Connection ID");
    expect(container).not.toHaveTextContent("project-sensitive-id");
    expect(container).not.toHaveTextContent("connection-sensitive-id");
  });

  it("renders an unknown rate honestly", () => {
    render(
      <AdminProviderHealth
        rows={[
          {
            failed: 0,
            failureRatePercent: null,
            notRun: 2,
            ok: 0,
            p95AgeMs: null,
            provider: "ga4",
            stale: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText("unknown")).toHaveClass("text-fg-muted");
  });
});
