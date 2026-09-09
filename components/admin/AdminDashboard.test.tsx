import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  baseData,
  disabledTemporal,
  staleTemporal,
  unavailableTemporal,
  withTemporal,
} from "./admin-dashboard-test-fixtures";

vi.mock("@/components/admin/AdminOpsActions", () => ({
  AdminOpsActions: () => <div data-testid="admin-ops-actions" />,
}));

import { AdminDashboard } from "./AdminDashboard";

describe("AdminDashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows worker release and schema agreement details", () => {
    render(<AdminDashboard data={baseData} />);

    const worker = screen.getByRole("region", { name: "Worker" });
    expect(within(worker).getByText("worker-image-sha")).toBeInTheDocument();
    expect(within(worker).getByText("In sync")).toBeInTheDocument();
    expect(within(worker).getAllByText("20260724220000_instance_settings")).toHaveLength(2);
  });

  it("does not expose Temporal identity comparison in the dashboard", () => {
    render(
      <AdminDashboard
        data={{
          ...baseData,
          worker: {
            ...baseData.worker,
            temporalIdentityComparison: {
              detail:
                "app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries",
              status: "mismatch",
            },
          },
        }}
      />,
    );

    const worker = screen.getByRole("region", { name: "Worker" });
    expect(within(worker).queryByText("Temporal identity")).not.toBeInTheDocument();
    expect(within(worker).queryByText("Different queues")).not.toBeInTheDocument();
    expect(
      within(worker).queryByText(
        "app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders split, data-driven connection labels", () => {
    render(<AdminDashboard data={baseData} />);

    const stats = screen.getByRole("region", { name: "Instance stats" });
    const analytics = within(stats).getByText("Analytics connections").parentElement;
    const serp = within(stats).getByText("SERP connections").parentElement;
    expect(within(analytics as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(within(serp as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(stats).queryByText("Active connections")).not.toBeInTheDocument();
  });

  it("breaks monthly SERP usage down by provider using reference costs", () => {
    render(<AdminDashboard data={baseData} />);

    const table = screen.getByRole("table", { name: "SERP usage this month by provider" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText("SerpApi")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("12")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("$0.12")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("$0.002")).toBeInTheDocument();
    expect(screen.queryByText("Estimated provider spend (month)")).not.toBeInTheDocument();
    expect(screen.getByText(/User-entered costs are ignored/)).toBeInTheDocument();
  });

  it("renders a fallback breakdown section beside the failure breakdown", () => {
    render(
      <AdminDashboard
        data={{
          ...baseData,
          rank24h: {
            ...baseData.rank24h,
            fallbackBreakdown: {
              groups: [
                {
                  count: 5,
                  errorSummary: "Provider request timed out",
                  firstSeen: "2026-07-17T01:00:00.000Z",
                  lastSeen: "2026-07-17T11:00:00.000Z",
                  projectCount: 1,
                  projectIds: ["project_1"],
                  provider: "dataforseo",
                },
              ],
              remainderCount: 0,
            },
          },
        }}
      />,
    );

    const ranks = screen.getByRole("region", { name: "Rank checks" });
    expect(within(ranks).getByText("Fallbacks (24h)")).toBeInTheDocument();
    expect(within(ranks).getByText("Failures (24h)")).toBeInTheDocument();
    expect(
      within(ranks).getByText(
        "Checks that failed after exhausting all providers. Grouped by provider and summarized reason.",
      ),
    ).toBeInTheDocument();
    expect(within(ranks).queryByText("Failure breakdown")).not.toBeInTheDocument();
    expect(within(ranks).getByText("5")).toBeInTheDocument();
    expect(within(ranks).getByText("dataforseo")).toBeInTheDocument();
  });

  it("shows a fallback-specific empty state when there are no fallbacks", () => {
    render(<AdminDashboard data={baseData} />);

    const ranks = screen.getByRole("region", { name: "Rank checks" });
    expect(
      within(ranks).getByText("No fallback rank checks in the last 24 hours."),
    ).toBeInTheDocument();
  });

  it("keeps Ops event actions above the event list without duplicate status tiles", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1_200);
    render(
      <AdminDashboard
        data={{
          ...baseData,
          ops: {
            ...baseData.ops,
            events: [
              {
                attempts: 1,
                createdAt: "2026-07-17T12:00:00.000Z",
                deliveredAt: "2026-07-17T12:00:04.000Z",
                kind: "worker_started",
                severity: "info",
              },
            ],
          },
        }}
      />,
    );

    const ops = screen.getByRole("region", { name: "Ops events" });
    expect(within(ops).getByTestId("admin-ops-actions")).toBeInTheDocument();
    expect(within(ops).queryByText("Undelivered")).not.toBeInTheDocument();
    expect(within(ops).queryByText("Slack")).not.toBeInTheDocument();
    const table = within(ops).getByRole("table", { name: "Recent operational events" });
    expect(table.style.getPropertyValue("--dt-table-width")).toBe("1200px");
  });

  it("shows deferred URL-presence counts from the latest budget event", () => {
    render(
      <AdminDashboard
        data={{
          ...baseData,
          presence: {
            affectedProjects: 2,
            deferred: 7,
            occurredAt: "2026-07-17T10:30:00.000Z",
          },
        }}
      />,
    );

    const presence = screen.getByRole("region", { name: "URL presence" });
    expect(within(presence).getByText("Deferred URLs").parentElement).toHaveTextContent("7");
    expect(within(presence).getByText("Affected projects").parentElement).toHaveTextContent("2");
  });

  it("renders unavailable Temporal metrics as hyphens with an explicit unknown-state note", () => {
    render(<AdminDashboard data={withTemporal(unavailableTemporal)} />);

    const temporal = screen.getByRole("region", { name: "Temporal" });
    expect(
      within(temporal).getByText(
        /Snapshot unavailable.*worker has not published Temporal data\. Values above are unknown, not zero\./,
      ),
    ).toBeInTheDocument();
    expect(within(temporal).getAllByText("-")).toHaveLength(7);
    expect(within(temporal).queryByText("Never")).not.toBeInTheDocument();
  });

  it("distinguishes a disabled scheduler from a failed worker or Temporal service", () => {
    render(
      <AdminDashboard
        data={withTemporal(disabledTemporal, {
          ...baseData.worker,
          schedulerDriver: "none",
          status: "unknown",
        })}
      />,
    );

    expect(
      screen.getByText(/Scheduled worker is disabled for this topology\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Temporal scheduling is disabled for this topology."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Snapshot unavailable/)).not.toBeInTheDocument();
  });

  it("renders stale Temporal snapshots as unknown while preserving their collection time", () => {
    render(<AdminDashboard data={withTemporal(staleTemporal)} />);

    const temporal = screen.getByRole("region", { name: "Temporal" });
    expect(within(temporal).getByText(/^As of \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(temporal).getByText("Temporal snapshot stale")).toBeInTheDocument();
    expect(within(temporal).getAllByText("-")).toHaveLength(6);
    expect(within(temporal).queryByText("Never")).not.toBeInTheDocument();
  });

  it("renders explicit unknown states for independently unavailable sections", () => {
    render(
      <AdminDashboard
        data={{
          ...baseData,
          availability: {
            dataSources: false,
            opsDelivery: false,
            opsEvents: false,
            presence: false,
            rankChecks: false,
            stats: false,
            worker: false,
          },
        }}
      />,
    );

    expect(screen.getByText(/Worker diagnostics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Rank-check diagnostics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Data-source diagnostics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/URL-presence diagnostics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Delivery diagnostics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Operational event history is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Instance statistics are unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Delivery: unknown")).toHaveAttribute("data-tone", "unknown");
  });
});
