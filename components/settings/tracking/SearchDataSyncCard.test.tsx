import {
  SearchDataSyncCard,
  type SearchSyncMetrics,
} from "@/components/settings/tracking/SearchDataSyncCard";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import {
  resolveSearchSyncControl,
  type SearchSyncControlFacts,
} from "@/lib/search-insights/sync/control-model";
import { searchSyncPreflightEstimate } from "@/lib/settings/search-sync-config";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/lib/actions/presence-settings", () => ({
  updateSearchSyncSettings: vi.fn(),
}));
vi.mock("@/lib/actions/search-insights", () => ({
  pauseSearchInsightsImport: vi.fn(),
  resumeSearchInsightsImport: vi.fn(),
  retrySearchInsightsImport: vi.fn(),
}));
vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
}));

const observabilityFacts = {
  consecutiveDays: 7,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 20 * 60_000,
    expectedDayMs: 3 * 60_000,
    nextRequestInMs: 10 * 60_000,
    silenceMs: 10 * 60_000,
    thresholdMs: 30 * 60_000,
  },
  targetDays: 28,
} satisfies ImportObservabilityFacts;
const runningStatusFacts = {
  connectionStatus: "connected" as const,
  observability: observabilityFacts,
  queue: {},
  runtime: {
    workerStatus: {
      status: "ok" as const,
      temporalIdentityComparison: { detail: "identities match", status: "match" as const },
    },
  },
  state: "running",
} satisfies SearchSyncControlFacts;
const metrics = {
  ...runningStatusFacts,
  firstDataDate: null,
  firstDataDateLabel: null,
  lastQuotaPausedAt: null,
  newestFinalizedDate: null,
  plannedRemaining: 1200,
  requestsToday: 28,
} satisfies SearchSyncMetrics;

describe("SearchDataSyncCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a truthful connect action when Search Console is disconnected", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={{ ...metrics, connectionStatus: "not_connected", state: null }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
    expect(screen.getByText("Reconnect Search Console to continue importing.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      expect.stringContaining("provider=gsc"),
    );
    expect(
      screen.queryByRole("button", { name: /Pause Search Console sync/i }),
    ).not.toBeInTheDocument();
  });

  it("does not offer an active Search Console connect action to a read-only viewer", () => {
    render(
      <SearchDataSyncCard
        canEdit={false}
        metrics={{ ...metrics, connectionStatus: "not_connected", state: null }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("16 months")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).not.toBeInTheDocument();
    expect(screen.queryByText("Connect Search Console")).not.toBeInTheDocument();
    expect(screen.getByText("Ask a project admin to connect")).toBeInTheDocument();
  });

  it("renders the same title and supporting text as the shared resolver", () => {
    const control = resolveSearchSyncControl(runningStatusFacts);
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText(control.status)).toBeInTheDocument();
    expect(screen.getByText(control.supportingText ?? "")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Search Console sync" })).toHaveTextContent(
      control.actionLabel ?? "",
    );
  });

  it("renders a resolver-driven paused state", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={{ ...metrics, pausedReason: "user", state: "paused" }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(
      screen.getByText("Resume when you are ready to continue importing."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Search Console sync" })).toHaveTextContent(
      "Resume",
    );
  });
  it("shows settings, live metrics, and shared quota rationale", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Search data sync")).toBeInTheDocument();
    const importDepth = screen.getByRole("button", { name: "Import depth" });
    const importSpeed = screen.getByRole("button", { name: "Import speed" });
    const settingsFieldset = importDepth.closest("fieldset");
    const form = settingsFieldset?.closest("form");
    const formContent = form?.parentElement;
    const card = formContent?.closest("[data-settings-card]");
    expect(card).toHaveClass("p-5");
    expect(formContent).toHaveClass("mt-3");
    expect(formContent).not.toHaveClass("mt-5");
    expect(form).toHaveClass("-mx-5");
    expect(settingsFieldset).toHaveClass("grid", "grid-cols-1", "gap-4", "px-4");
    expect(settingsFieldset).not.toHaveClass("p-5", "px-5", "sm:grid-cols-2");
    expect(importDepth.closest("[data-settings-field-width]")).not.toHaveClass("max-w-[340px]");
    expect(importSpeed.closest("[data-settings-field-width]")).not.toHaveClass("max-w-[340px]");
    expect(importDepth).toHaveClass("mt-1.5", "w-full");
    expect(importSpeed).toHaveClass("mt-1.5", "w-full");
    expect(
      screen.getByText(searchSyncPreflightEstimate({ pace: "normal", retentionMonths: 16 })),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sync pace")).not.toBeInTheDocument();
    expect(screen.queryByText("Normal")).not.toBeInTheDocument();
    expect(screen.queryByText("Gentle")).not.toBeInTheDocument();
    expect(screen.getByText("requests in current window: 28")).toBeInTheDocument();
    expect(screen.getByText("configured pace: 42 request sets/hour")).toBeInTheDocument();
    expect(screen.getByText("planned remaining: 1,200")).toBeInTheDocument();
    expect(screen.getByText(/shared with other tools/i)).toBeInTheDocument();
  });

  it("does not add a second provider-limit status surface", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={{
          ...metrics,
          lastQuotaPausedAt: "Aug 12",
          pausedReason: "rate_limited",
          state: "paused",
        }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Waiting for Google")).toBeInTheDocument();
    expect(
      screen.getByText("Google will resume the import automatically when its limit allows."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/quota Aug 12/i)).not.toBeInTheDocument();
  });

  it("shows the clamped history helper only when the selected floor predates first data", async () => {
    const clampedMetrics = {
      ...metrics,
      firstDataDate: "2026-05-12",
      firstDataDateLabel: "May 12, 2026",
      newestFinalizedDate: "2026-08-29",
    };
    render(
      <SearchDataSyncCard
        canEdit
        metrics={clampedMetrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "This property's Google history starts May 12, 2026 - deeper retention has nothing more to import.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import depth" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "3 months" }));
    expect(
      screen.queryByText(/deeper retention has nothing more to import/i),
    ).not.toBeInTheDocument();
  });

  it("previews an unsaved pace change while keeping the configured pace persisted", async () => {
    const updateSettings = vi.fn(async () => ({}));
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={updateSettings}
      />,
    );
    expect(
      screen.getByText(searchSyncPreflightEstimate({ pace: "normal", retentionMonths: 16 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Increasing depth extends the running import; decreasing depth keeps what is already imported.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import depth" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "6 months" }));
    fireEvent.click(screen.getByRole("button", { name: "Import speed" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reduced" }));
    expect(
      screen.getByText(searchSyncPreflightEstimate({ pace: "gentle", retentionMonths: 6 })),
    ).toBeInTheDocument();
    expect(screen.getByText("configured pace: 42 request sets/hour")).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.queryByText("Gentle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        projectId: "prj_1",
        retentionMonths: 6,
        pace: "gentle",
      }),
    );
  });

  it.each([
    ["pause", metrics, "Pause Search Console sync"],
    [
      "resume",
      { ...metrics, pausedReason: "user", state: "paused" } satisfies SearchSyncMetrics,
      "Resume Search Console sync",
    ],
    [
      "retry",
      {
        ...metrics,
        safeError: "Retry after fixing the connection.",
        state: "failed",
      } satisfies SearchSyncMetrics,
      "Retry Search Console sync",
    ],
  ] as const)(
    "runs the resolver-driven %s action",
    async (transition, actionMetrics, actionName) => {
      const action = vi.fn(async () => ({ ok: true as const, state: "running" }));
      render(
        <SearchDataSyncCard
          canEdit
          metrics={actionMetrics}
          pace="normal"
          pauseAction={action}
          projectId="prj_1"
          retentionMonths={16}
          resumeAction={action}
          retryAction={action}
          updateSettings={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: actionName }));
      await waitFor(() => expect(action).toHaveBeenCalledWith({ projectId: "prj_1", transition }));
      expect(routerMock.refresh).toHaveBeenCalled();
    },
  );
});
