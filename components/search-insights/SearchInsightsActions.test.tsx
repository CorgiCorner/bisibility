import { ToastProvider } from "@/components/ui/Toast";
import { SYNC_NOW_COOLDOWN_MS } from "@/lib/search-insights/constants";
import { FROZEN_NOW_MS } from "@/tests/clock";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SVGProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsActions } from "./SearchInsightsActions";

const mocks = vi.hoisted(() => ({
  downloadTextFile: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));
vi.mock("@/lib/ui/download", () => ({ downloadTextFile: mocks.downloadTextFile }));
vi.mock("@phosphor-icons/react/dist/csr/ArrowClockwise", () => ({
  ArrowClockwiseIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg data-testid="arrow-clockwise-icon" {...props} />
  ),
}));

const runningImport = {
  capHitDays: 0,
  cursorDate: "2026-03-14",
  daysDone: 120,
  daysTotal: 480,
  earliestTargetDate: "2025-03-14",
  finalizedThroughDate: "2026-07-08",
  lastProbeAt: null,
  lastSyncStartedAt: null,
  newestFinalizedDate: "2026-07-08",
  pausedReason: null,
  state: "running",
};

function renderActions(overrides: Partial<Parameters<typeof SearchInsightsActions>[0]> = {}) {
  const exportAction = vi.fn().mockResolvedValue({
    csv: "query,clicks\nrank tracker,12",
    filename: "search-insights-queries-example-com-2026-06-11-2026-07-08.csv",
    rows: 1,
    truncated: false,
  });
  const syncAction = vi.fn().mockResolvedValue({ status: "queued" });
  render(
    <ToastProvider>
      <SearchInsightsActions
        exportAction={exportAction}
        importState={null}
        hasProperty
        period="28"
        projectId="prj_1"
        queryCount={1284}
        syncAction={syncAction}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { exportAction, syncAction };
}

describe("SearchInsightsActions", () => {
  beforeEach(() => {
    mocks.downloadTextFile.mockReset();
    mocks.track.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders export and sync as secondary actions", () => {
    renderActions();

    for (const button of [
      screen.getByRole("button", { name: /Export CSV \(1,284 rows\)/ }),
      screen.getByRole("button", { name: "Sync now" }),
    ]) {
      expect(button).toHaveAttribute("data-variant", "secondary");
      expect(button).not.toHaveAttribute("data-variant", "ghost");
    }
  });

  it("renders refresh and sync for an active populated view", () => {
    renderActions();

    expect(screen.getByRole("button", { name: "Refresh stored insights" })).toHaveTextContent(
      "Refresh",
    );
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });

  it("renders refresh but not sync for an archived read-only view", () => {
    renderActions({ readOnly: true });

    expect(screen.getByRole("button", { name: "Refresh stored insights" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("refreshes stored data locally without starting a sync", async () => {
    const { syncAction } = renderActions({ readOnly: true });

    await userEvent.click(screen.getByRole("button", { name: "Refresh stored insights" }));

    expect(routerMock.refresh).toHaveBeenCalledOnce();
    expect(syncAction).not.toHaveBeenCalled();
  });

  it("uses the manual refresh icon and secondary small action contract", () => {
    renderActions();

    const button = screen.getByRole("button", { name: "Refresh stored insights" });
    expect(button).toHaveAttribute("data-variant", "secondary");
    expect(button).toHaveAttribute("data-size", expect.stringMatching(/^(xs|sm)$/));
    expect(button).not.toHaveAttribute("data-variant", "ghost");
    expect(button).toContainElement(screen.getByTestId("arrow-clockwise-icon"));
  });

  it("keeps export first, refresh second, and sync last", () => {
    renderActions();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Export CSV (1,284 rows)",
      "Refresh",
      "Sync now",
    ]);
  });

  it.each([
    ["active", false],
    ["read-only", true],
  ] as const)(
    "hydrates the %s action bar with Refresh in server and client markup",
    async (_, readOnly) => {
      const exportAction = vi.fn().mockResolvedValue({
        csv: "query,clicks",
        filename: "queries.csv",
        rows: 1,
        truncated: false,
      });
      const syncAction = vi.fn().mockResolvedValue({ status: "queued" });
      const actions = (
        <ToastProvider>
          <SearchInsightsActions
            exportAction={exportAction}
            importState={null}
            hasProperty
            period="28"
            projectId="prj_1"
            queryCount={1284}
            readOnly={readOnly}
            syncAction={syncAction}
          />
        </ToastProvider>
      );
      const serverMarkup = renderToString(actions);
      const container = document.createElement("div");
      container.innerHTML = serverMarkup;
      document.body.appendChild(container);

      expect(serverMarkup).toContain('aria-label="Refresh stored insights"');
      expect(container.querySelector('[aria-label="Refresh stored insights"]')).toHaveTextContent(
        "Refresh",
      );

      const recoverable: unknown[] = [];
      const consoleErrors: unknown[][] = [];
      const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
        consoleErrors.push(args);
      });
      let root: ReturnType<typeof hydrateRoot> | undefined;

      try {
        await act(async () => {
          root = hydrateRoot(container, actions, {
            onRecoverableError: (error) => recoverable.push(error),
          });
        });

        expect(container.querySelector('[aria-label="Refresh stored insights"]')).toHaveTextContent(
          "Refresh",
        );
        expect(recoverable.map(String)).toEqual([]);
        expect(consoleErrors.map((args) => String(args[0]))).toEqual([]);
      } finally {
        consoleError.mockRestore();
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );

  it("names the row count on the export button and downloads what the action returns", async () => {
    const { exportAction } = renderActions();

    const button = screen.getByRole("button", { name: /Export CSV \(1,284 rows\)/ });
    await userEvent.click(button);

    expect(exportAction).toHaveBeenCalledWith({ period: "28", projectId: "prj_1" });
    await waitFor(() =>
      expect(mocks.downloadTextFile).toHaveBeenCalledWith(
        "query,clicks\nrank tracker,12",
        "search-insights-queries-example-com-2026-06-11-2026-07-08.csv",
        "text/csv;charset=utf-8",
      ),
    );
    expect(mocks.track).toHaveBeenCalledWith("search_insights_csv_exported", { rows: 1 });
  });

  it("says the file stopped short when the window holds more than the export cap", async () => {
    renderActions({
      exportAction: vi.fn().mockResolvedValue({
        csv: "query,clicks",
        filename: "queries.csv",
        rows: 50_000,
        truncated: true,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

    expect(await screen.findByText(/50,000 busiest queries of this window/)).toBeInTheDocument();
  });

  it("stands down while the backfill already holds the queue", () => {
    renderActions({ importState: { ...runningImport, plannedRetentionMonths: 6 } });

    const button = screen.getByRole("button", { name: "Sync now" });
    expect(button).toBeDisabled();
    expect(button.closest("span")).toHaveAttribute("aria-describedby", expect.any(String));
    expect(document.body).toHaveTextContent("The 6-month import is still running");
  });

  it("disables sync until a Search Console property is selected", () => {
    renderActions({ hasProperty: false });

    const button = screen.getByRole("button", { name: "Sync now" });
    expect(button).toBeDisabled();
    expect(button.closest("span")).toHaveAttribute("aria-describedby", expect.any(String));
    expect(document.body).toHaveTextContent("Connect a Search Console property first.");
  });

  it("re-enables after its own cooldown expires", async () => {
    vi.useFakeTimers();
    const now = new Date(FROZEN_NOW_MS);
    vi.setSystemTime(now);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await act(async () => undefined);

    const button = screen.getByRole("button", { name: "Sync now" });
    expect(button).toBeDisabled();

    vi.setSystemTime(new Date(now.getTime() + SYNC_NOW_COOLDOWN_MS));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByRole("button", { name: /Sync now/ })).toBeEnabled();
  });

  it("says so when the sync action itself fails instead of swallowing the rejection", async () => {
    renderActions({ syncAction: vi.fn().mockRejectedValue(new Error("network is away")) });

    await userEvent.click(screen.getByRole("button", { name: /Sync now/ }));

    expect(await screen.findByText("network is away")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeEnabled();
  });

  it("keeps the button live and explains itself when syncing is not available", async () => {
    renderActions({ syncAction: vi.fn().mockResolvedValue({ status: "unavailable" }) });

    await userEvent.click(screen.getByRole("button", { name: /Sync now/ }));

    expect(
      await screen.findByText(
        "Syncing is not available yet. Nothing already imported is affected.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeEnabled();
  });
});
