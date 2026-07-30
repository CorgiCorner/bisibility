import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AdminOpsActions", () => ({
  AdminOpsActions: () => <div data-testid="admin-ops-actions" />,
}));

import { AdminDashboard } from "./AdminDashboard";

const heartbeat = {
  inspectionErrors: 0,
  issueSchedules: [],
  missedCatchupTotal: 0,
  nextActionAt: null,
  recentActions: 3,
  scheduleIssues: [],
  schedules: 8,
  skippedOverlapTotal: 0,
};

const baseData = {
  availability: {
    dataSources: true,
    opsDelivery: true,
    opsEvents: true,
    presence: true,
    rankChecks: true,
    stats: true,
    worker: true,
  },
  generatedAt: "2026-07-17T12:00:00.000Z",
  ops: {
    configured: true,
    enabled: true,
    events: [],
    undeliveredCount: 0,
  },
  rank24h: {
    deferred: 0,
    failed: 0,
    failureBreakdown: { groups: [], remainderCount: 0 },
    fallbackBreakdown: { groups: [], remainderCount: 0 },
    lagP50Ms: null,
    lagP95Ms: null,
    scheduled: 0,
    stuck: 0,
    succeeded: 0,
  },
  rank7d: {
    deferred: 0,
    failed: 0,
    lagP50Ms: null,
    lagP95Ms: null,
    scheduled: 0,
    stuck: 0,
    succeeded: 0,
  },
  stats: {
    activeProviderConnectionsByKind: [
      { count: 3, kind: "analytics" },
      { count: 1, kind: "serp" },
    ],
    keywords: 3,
    projects: 3,
    providerUsage: [
      {
        billableUnits: 12,
        checks: 3,
        provider: "serpapi",
        providerLabel: "SerpAPI",
        rateBasis: "Production plan equivalent",
        referenceCostCents: 12,
        referenceCostKnown: true,
      },
      {
        billableUnits: 1,
        checks: 1,
        provider: "dataforseo",
        providerLabel: "DataForSEO",
        rateBasis: "Live depth pricing",
        referenceCostCents: 0.2,
        referenceCostKnown: true,
      },
    ],
    users: 1,
  },
  providerHealth: [],
  presence: null,
  temporal: {
    bootstrapErrors: [],
    collectedAt: "2026-07-17T11:55:00.000Z",
    heartbeat,
    status: "ok",
  },
  worker: {
    appliedMigration: "20260724220000_instance_settings",
    bundledMigration: "20260724220000_instance_settings",
    environment: "production",
    heartbeatAgeMs: 0,
    heartbeatState: "fresh",
    lastSeenAt: "2026-07-17T12:00:00.000Z",
    release: "worker-image-sha",
    schedulerMode: "legacy",
    schemaComparison: "ok",
    status: "ok",
  },
} satisfies InstanceAdminDashboard;

describe("AdminDashboard", () => {
  it("shows worker release and schema agreement details", () => {
    render(<AdminDashboard data={baseData} />);

    const worker = screen.getByRole("region", { name: "Worker" });
    expect(within(worker).getByText("worker-image-sha")).toBeInTheDocument();
    expect(within(worker).getByText("In sync")).toBeInTheDocument();
    expect(within(worker).getAllByText("20260724220000_instance_settings")).toHaveLength(2);
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
    expect(within(rows[1] as HTMLElement).getByText("SerpAPI")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("12", { selector: "td" })).toBeInTheDocument();
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
    render(<AdminDashboard data={baseData} />);

    const ops = screen.getByRole("region", { name: "Ops events" });
    expect(within(ops).getByTestId("admin-ops-actions")).toBeInTheDocument();
    expect(within(ops).queryByText("Undelivered")).not.toBeInTheDocument();
    expect(within(ops).queryByText("Slack")).not.toBeInTheDocument();
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
    render(
      <AdminDashboard
        data={{
          ...baseData,
          temporal: {
            bootstrapErrors: [],
            collectedAt: null,
            heartbeat: null,
            status: "unavailable",
          },
        }}
      />,
    );

    const temporal = screen.getByRole("region", { name: "Temporal" });
    expect(
      within(temporal).getByText(
        /Snapshot unavailable.*worker has not published Temporal data\. Values above are unknown, not zero\./,
      ),
    ).toBeInTheDocument();
    expect(within(temporal).getAllByText("-")).toHaveLength(7);
    expect(within(temporal).queryByText("Never")).not.toBeInTheDocument();
  });

  it("renders stale Temporal snapshots as unknown while preserving their collection time", () => {
    render(
      <AdminDashboard
        data={{
          ...baseData,
          temporal: {
            bootstrapErrors: [],
            collectedAt: "2026-07-17T11:20:00.000Z",
            heartbeat,
            status: "stale",
          },
        }}
      />,
    );

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
