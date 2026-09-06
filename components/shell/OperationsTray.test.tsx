import { quietChipVariants } from "@/components/ui";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext, type AppRealtimeValue } from "@/lib/realtime/useAppRealtime";
import { rankTrackerTabPath } from "@/lib/routing/app-path";
import { rankTrackerRunsPath } from "@/lib/routing/rank-tracker-runs-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OperationsTray,
  operationPresentationFor,
  operationsTrayPaperSx,
  operationsTrayPillClassName,
  operationsTrayPopoverOrigins,
} from "./OperationsTray";

const actions = vi.hoisted(() => ({
  pause: vi.fn(),
  resume: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("@/lib/actions/search-insights", () => ({
  pauseSearchInsightsImport: actions.pause,
  resumeSearchInsightsImport: actions.resume,
  retrySearchInsightsImport: actions.retry,
}));

const rankCheck: OperationSnapshot = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 126,
    deferred: 0,
    failed: 2,
    requested: 700,
    skipped: 0,
    total: 700,
  },
  estimatedCostCents: 0,
  etaSeconds: 240,
  finishedAt: null,
  id: "rcr_example",
  keywordCount: 350,
  kind: "rank_check",
  outcome: null,
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  provider: "serpapi",
  providerLabel: "SerpApi",
  selectionKind: "filter",
  snapshotAt: "2026-09-03T12:00:00.000Z",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "running",
  targetCount: 700,
  trigger: "manual",
};

function renderTray(
  operations: OperationSnapshot[],
  status: AppRealtimeValue["status"] = "live",
  defaultOpen = true,
) {
  return render(
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status }}>
      <OperationsTray defaultOpen={defaultOpen} projectRef="prj_example" />
    </AppRealtimeContext.Provider>,
  );
}

describe("OperationsTray", () => {
  afterEach(() => vi.useRealTimers());

  it("anchors the popover below the trigger with the notification-menu gap", () => {
    expect(operationsTrayPopoverOrigins).toEqual({
      anchorOrigin: { horizontal: "right", vertical: "bottom" },
      transformOrigin: { horizontal: "right", vertical: "top" },
    });
    expect(operationsTrayPaperSx.marginTop).toBe("8px");
  });

  it("uses the shared spend-chip height and tokenized elevated paper", () => {
    expect(quietChipVariants({ size: "sm" })).toContain("h-[22px]");
    expect(operationsTrayPillClassName).toContain("h-[22px]");
    const { rerender } = renderTray([], "live", false);
    expect(screen.getByRole("link", { name: "Runs" })).toHaveClass("h-[22px]");

    rerender(
      <AppRealtimeContext.Provider
        value={{ notifications: null, operations: [rankCheck], status: "live" }}
      >
        <OperationsTray defaultOpen={false} projectRef="prj_example" />
      </AppRealtimeContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "1 running operations, open activity" })).toHaveClass(
      "h-[22px]",
    );
    expect(operationsTrayPaperSx).toMatchObject({
      backgroundColor: "var(--bg-elev)",
      border: "1px solid var(--border)",
      borderRadius: UI_RADIUS_ROLES.card,
      boxShadow: "none",
    });
  });

  it("keeps Runs available as a link when idle without opening the tray", () => {
    renderTray([], "live", false);

    const runs = screen.getByRole("link", { name: "Runs" });
    expect(runs).toHaveAttribute("href", rankTrackerTabPath("prj_example", "runs"));
    runs.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(runs);

    expect(screen.queryByRole("dialog", { name: "Activity" })).not.toBeInTheDocument();
  });

  it("excludes a skipped occurrence from operations", () => {
    renderTray([
      {
        ...rankCheck,
        finishedAt: "2026-09-05T06:05:00.000Z",
        plannedFor: "2026-09-05T06:00:00.000Z",
        startedAt: null,
        status: "cancelled",
      },
    ]);

    expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Activity" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-operation-row]")).toBeNull();
  });

  it("implements the pill idle, active, and attention plan criterion", () => {
    const { rerender } = renderTray([], "live", false);
    expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();

    rerender(
      <AppRealtimeContext.Provider
        value={{ notifications: null, operations: [rankCheck], status: "live" }}
      >
        <OperationsTray defaultOpen projectRef="prj_example" />
      </AppRealtimeContext.Provider>,
    );
    expect(
      screen.getByRole("button", { hidden: true, name: "1 running operations, open activity" }),
    ).toHaveTextContent("1running");
    expect(
      screen
        .getByRole("button", { hidden: true, name: "1 running operations, open activity" })
        .querySelector(".bg-blue"),
    ).toBeInTheDocument();

    rerender(
      <AppRealtimeContext.Provider
        value={{
          notifications: null,
          operations: [
            {
              id: "import_1",
              kind: "gsc_import",
              progress: { done: 1, total: 4 },
              state: "paused",
            },
          ],
          status: "live",
        }}
      >
        <OperationsTray defaultOpen projectRef="prj_example" />
      </AppRealtimeContext.Provider>,
    );
    expect(
      screen.getByRole("button", { hidden: true, name: "1 waiting operations, open activity" }),
    ).toHaveTextContent("1waiting");
  });

  it("renders the provider-labelled running check from the snapshot", () => {
    renderTray([rankCheck]);

    expect(screen.getByRole("dialog", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("Manual run · 350 keywords by filter")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /128 of 700 targets processed/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("128 / 700 targets")).toBeInTheDocument();
    expect(screen.getByText("SerpApi is returning results - ~4 min left.")).toBeInTheDocument();
    expect(screen.queryByText(/DataForSEO is returning results/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manual run/ })).toHaveAttribute(
      "href",
      rankTrackerRunsPath("prj_example", rankCheck.id),
    );
  });

  it.each([
    ["completed", "succeeded", "Succeeded", "positive"],
    ["completed", "partial", "Partial", "attention"],
    ["completed", "failed", "Failed", "critical"],
    ["completed", "deferred", "Deferred", "attention"],
    ["completed", null, "Not confirmed", "neutral"],
    ["cancelled", null, "Cancelled", "neutral"],
    ["queued", null, "Queued", "info"],
    ["running", null, "Running", "info"],
    ["cancelling", null, "Cancelling", "neutral"],
  ] as const)("renders one %s/%s badge in the tray", (status, outcome, label, tone) => {
    renderTray([{ ...rankCheck, outcome, status }]);

    const row = document.querySelector("[data-operation-row]");
    expect(row).not.toBeNull();
    const badge = within(row as HTMLElement)
      .getByText(label)
      .closest("[data-status-chip-tone]");
    expect(badge).toHaveAttribute("data-status-chip-tone", tone);
  });

  it("pluralizes rank-check scope and omits the repeating single-keyword selection", () => {
    const single = operationPresentationFor(
      {
        ...rankCheck,
        keywordCount: 1,
        selectionKind: "single",
      },
      "prj_example",
    );
    const multiple = operationPresentationFor({ ...rankCheck, keywordCount: 2 }, "prj_example");

    expect(single.meta).toBe("1 keyword");
    expect(single.meta).not.toContain("one keyword");
    expect(multiple.meta).toBe("2 keywords by filter");
  });

  it("shows when a running run is waiting for its next check", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    renderTray([{ ...rankCheck, nextCheckAt: "2026-09-02T12:00:00.000Z" }]);

    expect(screen.getByText("Next check in 2h")).toBeInTheDocument();
  });

  it("closes the tray when its trigger is removed after operations drain", () => {
    const view = renderTray([rankCheck]);
    expect(screen.getByRole("dialog", { name: "Activity" })).toBeInTheDocument();

    view.rerender(
      <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status: "live" }}>
        <OperationsTray defaultOpen projectRef="prj_example" />
      </AppRealtimeContext.Provider>,
    );

    expect(screen.queryByRole("dialog", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();
  });

  it("omits the realtime transport chip so progress rows carry the live signal", () => {
    renderTray([rankCheck], "live");
    expect(screen.queryByRole("status", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Polling" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Offline" })).not.toBeInTheDocument();
  });

  it.each([
    ["queued", "worker", "pause"],
    ["running", "worker", "pause"],
    ["waiting_for_first_data", "worker", "pause"],
    ["paused", "worker", "resume"],
    ["completed", "succeeded", ""],
    ["failed", "failed", "retry"],
  ] as const)("adapts gsc_import %s completely", (state, operationState, action) => {
    const presentation = operationPresentationFor(
      {
        id: "import_1",
        kind: "gsc_import",
        progress: { done: 2, total: 16 },
        state,
      },
      "prj_example",
    );

    expect(presentation).toMatchObject({
      action,
      state: operationState,
      title: "Search Console import",
      unit: "days",
    });
  });

  it("calls the authorized GSC pause action from the tray", async () => {
    actions.pause.mockResolvedValue({ ok: true, state: "paused" });
    renderTray([
      { id: "import_1", kind: "gsc_import", progress: { done: 2, total: 16 }, state: "running" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console import" }));
    await vi.waitFor(() =>
      expect(actions.pause).toHaveBeenCalledWith({ projectId: "prj_example", transition: "pause" }),
    );
  });
});
