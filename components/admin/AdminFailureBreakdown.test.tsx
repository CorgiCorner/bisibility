import { buildFailureBreakdown, type FailureBreakdownInput } from "@/lib/ops/instance-admin-health";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminFailureBreakdown } from "./AdminFailureBreakdown";

describe("AdminFailureBreakdown", () => {
  it("renders concentrated project IDs, diffuse counts, times, and the remainder", () => {
    render(
      <AdminFailureBreakdown
        breakdown={{
          groups: [
            {
              count: 203_431,
              errorSummary: "Provider authentication failed",
              firstSeen: "2026-07-14T12:00:00.000Z",
              lastSeen: "2026-07-17T11:56:00.000Z",
              projectCount: 1,
              projectIds: ["project-concentrated"],
              provider: "dataforseo",
            },
            {
              count: 1_204,
              errorSummary: "Provider rate limited",
              firstSeen: "2026-07-17T01:00:00.000Z",
              lastSeen: "2026-07-17T11:58:00.000Z",
              projectCount: 342,
              projectIds: [],
              provider: "serpapi",
            },
          ],
          remainderCount: 2,
        }}
        now="2026-07-17T12:00:00.000Z"
      />,
    );

    expect(screen.getByText("203,431")).toBeInTheDocument();
    expect(screen.getByText("project-concentrated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy project ID" })).toBeInTheDocument();
    expect(screen.getByText("across 342 projects")).toBeInTheDocument();
    expect(screen.getByText(/first seen 3d ago/)).toBeInTheDocument();
    expect(screen.getByText(/last seen 2m ago/)).toBeInTheDocument();
    expect(screen.getByText("and 2 more classes")).toBeInTheDocument();
  });

  it("renders one muted empty-state line", () => {
    const { container } = render(
      <AdminFailureBreakdown
        breakdown={{ groups: [], remainderCount: 0 }}
        now="2026-07-17T12:00:00.000Z"
      />,
    );

    expect(container.children).toHaveLength(1);
    expect(screen.getByText("No failed rank checks in the last 24 hours.")).toHaveClass(
      "text-fg-muted",
    );
  });

  it("renders a custom empty label when provided", () => {
    render(
      <AdminFailureBreakdown
        breakdown={{ groups: [], remainderCount: 0 }}
        emptyLabel="No fallback rank checks in the last 24 hours."
        now="2026-07-17T12:00:00.000Z"
      />,
    );

    expect(screen.getByText("No fallback rank checks in the last 24 hours.")).toBeInTheDocument();
    expect(
      screen.queryByText("No failed rank checks in the last 24 hours."),
    ).not.toBeInTheDocument();
  });

  it("renders the same bounded row count for three and 200k failure inputs", () => {
    const small: FailureBreakdownInput[] = ["a", "b", "c"].map((provider) => ({
      errorSummary: "Provider check failed",
      occurredAt: "2026-07-17T11:00:00.000Z",
      projectId: `project-${provider}`,
      provider,
    }));
    const large = Array.from({ length: 200_000 }, (_, index) => small[index % small.length]);

    const smallRender = render(
      <AdminFailureBreakdown
        breakdown={buildFailureBreakdown(small)}
        now="2026-07-17T12:00:00.000Z"
      />,
    );
    const smallCount = smallRender.container.querySelectorAll("[data-admin-failure-group]").length;
    smallRender.unmount();
    const largeRender = render(
      <AdminFailureBreakdown
        breakdown={buildFailureBreakdown(large)}
        now="2026-07-17T12:00:00.000Z"
      />,
    );

    expect(largeRender.container.querySelectorAll("[data-admin-failure-group]")).toHaveLength(
      smallCount,
    );
  });
});
