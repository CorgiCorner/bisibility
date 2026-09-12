import { KNOWN_DATA_INCIDENTS } from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { isoFromFrozenNow } from "@/tests/clock";
import { routerMock } from "@/tests/next-navigation";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsContextCard } from "./SearchInsightsContextCard";
import { SearchInsightsNoDataState } from "./SearchInsightsEmptyStates";
import { SearchInsightsTrustStrip } from "./SearchInsightsTrustStrip";
import { importRunningOwnershipCopy, OWNERSHIP_COPY } from "./search-insights-copy";

const pauseAction = async () => ({ ok: true as const, state: "running" });

const importState: SearchInsightsImportState = {
  plannedRetentionMonths: 16,
  capHitDays: 0,
  cursorDate: "2026-03-14",
  daysDone: 274,
  daysTotal: 488,
  earliestTargetDate: "2025-03-14",
  finalizedThroughDate: "2026-07-08",
  lastProbeAt: "2026-08-28T18:17:00.000Z",
  lastSyncStartedAt: null,
  newestFinalizedDate: "2026-07-08",
  pausedReason: null,
  state: "running",
};

const observabilityFacts = {
  importCoverage: { completed: 93, total: 488 },
  consecutiveDays: 93,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
  lastProbeAt: "2026-08-28T18:17:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 1,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 10,
} satisfies ImportObservabilityFacts;

const matchedWorker = {
  status: "ok" as const,
  temporalIdentityComparison: { detail: "identities match", status: "match" as const },
};
const runningStatusFacts = {
  connectionStatus: "connected" as const,
  observability: observabilityFacts,
  runtime: { workerStatus: matchedWorker },
  state: "running",
};
const completedFacts = {
  ...observabilityFacts,
  readyThrough: {
    ...observabilityFacts.readyThrough,
    d28: { current: true, previous: false },
  },
};

function importStateWithFacts(facts: ImportObservabilityFacts = observabilityFacts) {
  return { ...importState, facts } as SearchInsightsImportState & {
    facts: ImportObservabilityFacts;
  };
}

function renderStrip(overrides: Partial<Parameters<typeof SearchInsightsTrustStrip>[0]> = {}) {
  return render(
    <SearchInsightsTrustStrip
      coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
      deploymentMode="self-host"
      providerAvailabilitySource="metadata"
      providerAvailableThrough="2026-07-08"
      importState={importStateWithFacts()}
      incidents={[]}
      pauseAction={pauseAction}
      projectId="prj_test"
      resumeAction={pauseAction}
      localViewReady
      statusFacts={runningStatusFacts}
      workerStatus={matchedWorker}
      {...overrides}
    />,
  );
}

function tooltipText(element: HTMLElement) {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

/**
 * The page renders the strip and the empty card together whenever the finalized window is not
 * open yet, which is exactly the state that used to print each provenance counter twice.
 */
/**
 * The page hands the card a `<Suspense>` element that is truthy whether or not the strip inside it
 * renders anything, so divider ownership has to sit with the strip. These drive the real card and
 * the real strip together, which is the composition that produced the doubled border.
 */
describe("divider ownership", () => {
  function renderInCard(overrides: Partial<Parameters<typeof SearchInsightsTrustStrip>[0]> = {}) {
    return render(
      <SearchInsightsContextCard
        trustStrip={
          <SearchInsightsTrustStrip
            coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
            deploymentMode="self-host"
            importState={importStateWithFacts()}
            incidents={[]}
            localViewReady
            pauseAction={pauseAction}
            projectId="prj_test"
            providerAvailabilitySource="metadata"
            providerAvailableThrough="2026-07-08"
            resumeAction={pauseAction}
            statusFacts={runningStatusFacts}
            workerStatus={matchedWorker}
            {...overrides}
          />
        }
      >
        <span>Sub-bar</span>
      </SearchInsightsContextCard>,
    );
  }

  it("gives the provenance strip exactly one divider", () => {
    renderInCard();

    const strip = screen.getByRole("region", { name: "Data provenance" });
    expect(strip).toHaveClass("border-t");
    expect(strip.parentElement).not.toHaveClass("border-t");
  });

  it("gives the waiting strip exactly one divider", () => {
    const { container } = renderInCard({ providerAvailableThrough: null });

    const strip = screen.getByRole("region", { name: "Data provenance" });
    expect(strip).toHaveClass("border-t");
    // The waiting strip has no divided cells, so the strip's own rule is the only one on screen.
    expect(container.querySelectorAll(".border-t")).toHaveLength(1);
  });

  it("leaves no divider when the strip renders nothing", () => {
    const { container } = renderInCard({
      localViewReady: false,
      providerAvailableThrough: null,
    });

    expect(screen.queryByRole("region", { name: "Data provenance" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".border-t")).toHaveLength(0);
  });
});

describe("strip and empty card together", () => {
  function renderStuckModule() {
    return render(
      <>
        <SearchInsightsTrustStrip
          coverage={{ calculable: false, capHitDays: 0, clicksShare: 0, impressionsShare: 0 }}
          deploymentMode="self-host"
          importState={importStateWithFacts()}
          incidents={[]}
          localViewReady
          pauseAction={pauseAction}
          projectId="prj_test"
          providerAvailabilitySource="metadata"
          providerAvailableThrough="2026-07-08"
          resumeAction={pauseAction}
          statusFacts={runningStatusFacts}
          workerStatus={matchedWorker}
        />
        <SearchInsightsNoDataState
          facts={runningStatusFacts}
          pauseAction={pauseAction}
          projectId="prj_test"
          resumeAction={pauseAction}
          retryAction={pauseAction}
        />
      </>,
    );
  }

  it.each(["qualifying-progress", "deep-history-progress", "freshness-note"])(
    "gives %s exactly one home",
    (testId) => {
      renderStuckModule();

      expect(screen.getAllByTestId(testId)).toHaveLength(1);
    },
  );

  it("keeps the counter values the strip already reported", () => {
    renderStuckModule();

    expect(screen.getByTestId("qualifying-progress")).toHaveTextContent(
      `${observabilityFacts.importCoverage.completed} of ${observabilityFacts.importCoverage.total} finalized days`,
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent("3 of 16 months");
  });
});

describe("SearchInsightsTrustStrip", () => {
  it("uses the waiting strip for d1-only facts while provider availability is pending", () => {
    const firstLookFacts = {
      ...observabilityFacts,
      consecutiveDays: 1,
      qualifyingDays: 1,
      importCoverage: { completed: 1, total: 488 },
      readyThrough: {
        ...observabilityFacts.readyThrough,
        d1: { current: true, previous: false },
        d7: { current: false, previous: false },
      },
    } satisfies ImportObservabilityFacts;

    const { container } = renderStrip({
      importState: importStateWithFacts(firstLookFacts),
      providerAvailableThrough: null,
      statusFacts: { ...runningStatusFacts, observability: firstLookFacts },
    });

    expect(screen.getByRole("region", { name: "Data provenance" })).toBeInTheDocument();
    expect(container.querySelector('[data-startup-segment="fact"]')).toHaveTextContent(
      "Importing · 1 of 488 finalized days",
    );
    expect(screen.queryByTestId("search-import-line")).not.toBeInTheDocument();
  });

  it("renders the import line once the d1-ready view has status facts", () => {
    const firstLookFacts = {
      ...observabilityFacts,
      consecutiveDays: 1,
      qualifyingDays: 1,
      importCoverage: { completed: 1, total: 488 },
      readyThrough: {
        ...observabilityFacts.readyThrough,
        d1: { current: true, previous: false },
        d7: { current: false, previous: false },
      },
    } satisfies ImportObservabilityFacts;

    renderStrip({
      importState,
      localViewReady: true,
      statusFacts: { ...runningStatusFacts, observability: firstLookFacts },
    });

    expect(screen.getByTestId("search-import-line")).toBeInTheDocument();
  });

  it("uses the elevated surface for the full provenance strip", () => {
    renderStrip();

    expect(screen.getByRole("region", { name: "Data provenance" })).toHaveClass("bg-bg-elev");
    expect(screen.getByRole("region", { name: "Data provenance" })).not.toHaveClass("bg-bg-sunken");
  });

  it("uses the elevated surface while startup is waiting", () => {
    renderStrip({ providerAvailableThrough: null });

    expect(screen.getByRole("region", { name: "Data provenance" })).toHaveClass("bg-bg-elev");
    expect(screen.getByRole("region", { name: "Data provenance" })).not.toHaveClass("bg-bg-sunken");
  });

  it("keeps finalized availability distinct from compact freshness", () => {
    renderStrip();

    expect(screen.getByTestId("provider-available-date")).toHaveTextContent("Jul 8");
    expect(screen.getByText(/Final through/)).toBeInTheDocument();
    expect(
      (screen.getByTestId("freshness-note").textContent ?? "").replace(/\s+/g, " ").trim(),
    ).toMatch(/^checked /);
    expect(tooltipText(screen.getByTestId("freshness-note"))).toBe(
      "Last checked Aug 28, 11:17 Pacific. Google may adjust recent data until it finalizes.",
    );
    expect(screen.queryByText(/revisions|, still subject/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finalized through/)).not.toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
  });

  it("separates provider freshness from partial local readiness", () => {
    const { container } = renderStrip({
      coverage: { calculable: false, capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
      importState,
      localViewReady: false,
      providerAvailableThrough: "2026-08-26",
    });

    const date = screen.getByTestId("provider-available-date");
    expect(date).toHaveTextContent("Aug 26");
    expect(date.textContent).toBe("Aug 26");
    expect(date).not.toHaveTextContent("2026");
    expect(date.childNodes).toHaveLength(1);
    expect(date.firstElementChild).toHaveClass("font-sans tabular-nums");
    const availability = screen.getByText("Final through", { exact: false });
    expect(availability).toBeInTheDocument();
    expect(availability.textContent).not.toMatch(/\s{2}/);
    expect(screen.getByTestId("qualifying-progress")).toHaveTextContent(
      observabilityFacts.importCoverage.completed.toString(),
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent(
      observabilityFacts.deepHistoryMonths.target.toString(),
    );
    expect(container.textContent).not.toMatch(
      /Finalized through|imported through|locally finalized/i,
    );
    // Days are imported; only a full window is missing, so the cell must not blame Google.
    expect(
      screen.getByText("Coverage appears once the imported finalized days cover a full window."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /0% \/ 0%|Query text on|about three days|first data|,\s{2}|%.* \/ .*%/i,
    );
    expect(screen.queryByLabelText("Refresh import status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-import-line")).not.toBeInTheDocument();
  });

  it("labels a fallback boundary as an estimate rather than Google metadata", () => {
    const { container } = renderStrip({
      providerAvailabilitySource: "fallback",
      providerAvailableThrough: "2026-08-26",
    });

    expect(container.textContent).toContain("Estimated final through Aug 26");
    expect(container.textContent).not.toContain("Estimated final through Aug 26, 2026");
    expect(container.textContent).not.toMatch(/through\s{2,}Aug|Aug 26\s{2,}/);
  });

  it("renders calculable zero coverage as real data with the dot separator", () => {
    const { container } = renderStrip({
      coverage: { calculable: true, capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
    });

    expect(container.textContent).toContain("Query text on 0% of clicks · 0% of impressions");
    expect(container.textContent).not.toMatch(/0% \/ 0%|%.* \/ .*%/);
  });

  it("names the row ceiling only when a day in the window actually hit it", () => {
    const { rerender } = renderStrip();
    expect(screen.queryByText(/row ceiling/)).not.toBeInTheDocument();

    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 3, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={importState}
        incidents={[]}
        localViewReady
        pauseAction={vi.fn()}
        projectId="prj_1"
        workerStatus="ok"
      />,
    );
    expect(screen.getByText(/row ceiling on 3 days/)).toBeInTheDocument();
  });

  it("claims the database only where the customer owns it", () => {
    const { rerender } = renderStrip();
    expect(screen.getByText(OWNERSHIP_COPY.retention[0])).toBeInTheDocument();

    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="cloud"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={importState}
        incidents={[]}
        localViewReady
        pauseAction={vi.fn()}
        projectId="prj_1"
        workerStatus="ok"
      />,
    );
    expect(screen.getByText(OWNERSHIP_COPY.retention[1])).toBeInTheDocument();
    expect(screen.queryByText(/your database/)).not.toBeInTheDocument();
  });

  it("reports running and completed imports without error copy or complete polling", () => {
    const { rerender } = renderStrip();
    expect(screen.getByText("Importing")).toBeInTheDocument();
    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={{ ...importState, state: "completed" }}
        incidents={[]}
        localViewReady
        pauseAction={pauseAction}
        projectId="prj_test"
        statusFacts={{
          ...runningStatusFacts,
          observability: completedFacts,
          runtime: { workerStatus: matchedWorker },
          state: "completed",
        }}
        workerStatus={matchedWorker}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Refresh import status").closest("[data-auto-refresh]"),
    ).toHaveAttribute("data-auto-refresh", "inactive");
  });

  it("does not schedule refreshes after the local view is ready", () => {
    vi.useFakeTimers();
    renderStrip();

    expect(
      screen.getByLabelText("Refresh import status").closest("[data-auto-refresh]"),
    ).toHaveAttribute("data-auto-refresh", "inactive");
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(90_000));
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("does not expose a legacy action without an exact import target", () => {
    renderStrip();

    const row = screen.getByTestId("search-import-line");
    expect(row).toHaveClass("flex", "w-full", "items-center", "justify-between");
    expect(
      screen.queryByRole("button", { name: /Pause|Resume|Retry Search Console import/ }),
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: "Refresh import status" })).toHaveLength(1);
  });

  it("retains the reconnect link but not legacy mutation controls", () => {
    const { rerender } = renderStrip({
      importState: {
        ...importState,
        pauseStartedAt: "2026-07-09T12:00:00.000Z",
        pausedReason: "user",
        state: "paused",
      },
      statusFacts: { ...runningStatusFacts, pausedReason: "user", state: "paused" },
    });
    expect(
      screen.queryByRole("button", { name: "Resume Search Console import" }),
    ).not.toBeInTheDocument();

    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={{ ...importState, safeError: "Import failed", state: "failed" }}
        incidents={[]}
        localViewReady
        projectId="prj_test"
        retryAction={pauseAction}
        statusFacts={{ ...runningStatusFacts, safeError: "Import failed", state: "failed" }}
        workerStatus={matchedWorker}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Retry Search Console import" }),
    ).not.toBeInTheDocument();

    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={{
          ...importState,
          pausedReason: "needs_reauth",
          safeError: "Reconnect Google",
          state: "paused",
        }}
        incidents={[]}
        localViewReady
        projectId="prj_test"
        statusFacts={{
          ...runningStatusFacts,
          connectionStatus: "needs_reauth",
          pausedReason: "needs_reauth",
          state: "paused",
        }}
        workerStatus={matchedWorker}
      />,
    );
    expect(screen.getByRole("link", { name: "Reconnect Search Console" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );

    rerender(
      <SearchInsightsTrustStrip
        canManageProviders={false}
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={{
          ...importState,
          pausedReason: "needs_reauth",
          safeError: "Reconnect Google",
          state: "paused",
        }}
        incidents={[]}
        localViewReady
        projectId="prj_test"
        statusFacts={{
          ...runningStatusFacts,
          connectionStatus: "needs_reauth",
          pausedReason: "needs_reauth",
          state: "paused",
        }}
        workerStatus={matchedWorker}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Reconnect Search Console" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ask a project admin to connect")).toBeInTheDocument();
  });

  it("shows exact user pause takeover and freshness copy without polling", () => {
    renderStrip({
      importState: {
        ...importState,
        pauseStartedAt: "2026-07-09T12:00:00.000Z",
        pausedReason: "user",
        state: "paused",
      },
      statusFacts: { ...runningStatusFacts, pausedReason: "user", state: "paused" },
    });
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(
      (screen.getByTestId("freshness-note").textContent ?? "").replace(/\s+/g, " ").trim(),
    ).toMatch(/^checked /);
    const freshness = screen.getByText("Freshness").closest("div");
    expect(freshness?.textContent).not.toMatch(/data ends at|Paused on|Resume/i);
    expect(
      screen.queryByRole("button", { name: "Resume Search Console import" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh import status" })).toBeInTheDocument();
  });

  it("flags a published provider anomaly beside the freshness fact", () => {
    renderStrip({ incidents: KNOWN_DATA_INCIDENTS });

    expect(screen.getByText("Known Google data issue")).toBeInTheDocument();
  });

  it("renders selector-backed readiness and deep-history progress without another status label", () => {
    const { container, rerender } = renderStrip({ importState: importStateWithFacts() });

    expect(screen.getByTestId("qualifying-progress")).toHaveTextContent(
      `${observabilityFacts.importCoverage.completed} of ${observabilityFacts.importCoverage.total} finalized days`,
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent("3 of 16 months");
    expect(screen.getAllByText("Importing")).toHaveLength(1);
    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        importState={importStateWithFacts({
          ...observabilityFacts,
          deepHistoryMonths: { completed: 3, target: 12 },
        })}
        incidents={[]}
        localViewReady
        pauseAction={pauseAction}
        projectId="prj_test"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        resumeAction={pauseAction}
        statusFacts={runningStatusFacts}
        workerStatus={matchedWorker}
      />,
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent("3 of 12 months");
    expect(container.textContent).not.toMatch(/Running.*Running/);
  });

  it("announces the first look without adding a date range to the strip", () => {
    const firstLookFacts = {
      ...observabilityFacts,
      consecutiveDays: 2,
      readyThrough: {
        ...observabilityFacts.readyThrough,
        d1: { current: true, previous: false },
        d7: { current: false, previous: false },
      },
      stall: { ...observabilityFacts.stall, expectedDayMs: 300_000 },
    } satisfies ImportObservabilityFacts;
    const { container } = renderStrip({
      importState: importStateWithFacts(firstLookFacts),
      statusFacts: { ...runningStatusFacts, observability: firstLookFacts },
    });

    expect(screen.getByTestId("qualifying-progress")).toHaveTextContent("93 of 488 finalized days");
    expect(container.textContent).not.toMatch(/[A-Z][a-z]{2} \d{1,2} - [A-Z][a-z]{2} \d{1,2}/);
  });

  it("renders phase A as exactly one fact segment without premature progress", () => {
    const { container } = renderStrip({ providerAvailableThrough: null, importState: null });

    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-startup-segment="fact"]')).toHaveLength(1);
    expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/0 of|not yet|about .*left/)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(". ·");
  });

  it("renders waiting for first data as a dedicated sentence only", () => {
    const { container } = renderStrip({
      providerAvailableThrough: null,
      importState: {
        ...importState,
        daysTotal: 0,
        state: "waiting_for_first_data",
      },
    });

    expect(screen.getByText("Waiting for data")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 of 0|about 3 days|completion|first-28/i);
    expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause|Refresh/ })).not.toBeInTheDocument();
  });

  it("keeps startup ownership guidance while finalized sync uses compact status controls", () => {
    const expected = OWNERSHIP_COPY.importRunning[0];
    expect(importRunningOwnershipCopy(16, "self-host")).toBe(expected);
    const { rerender } = renderStrip({ providerAvailableThrough: null });
    expect(screen.queryByText(expected)).not.toBeInTheDocument();

    rerender(
      <SearchInsightsTrustStrip
        coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
        deploymentMode="self-host"
        providerAvailabilitySource="metadata"
        providerAvailableThrough="2026-07-08"
        importState={importState}
        incidents={[]}
        localViewReady
        pauseAction={pauseAction}
        projectId="prj_test"
        resumeAction={pauseAction}
        statusFacts={runningStatusFacts}
        workerStatus={matchedWorker}
      />,
    );
    expect(screen.getByText("Importing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause Search Console import" }),
    ).not.toBeInTheDocument();
  });
});

it("renders selector-backed phase C progress alongside separate truthful segments", () => {
  const { container } = renderStrip({
    importState: importStateWithFacts(),
    providerAvailableThrough: null,
  });

  expect(container.querySelector('[data-startup-segment="fact"]')).toHaveTextContent(
    `Importing · ${observabilityFacts.importCoverage.completed} of ${observabilityFacts.importCoverage.total} finalized days`,
  );
  expect(screen.queryByText(/last activity/)).not.toBeInTheDocument();
  expect(screen.queryByText(/about 3 days left/)).not.toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="deep-history"]')).toBeNull();
  expect(container.querySelector('[data-startup-segment="freshness"]')).toBeNull();
  expect(screen.getByLabelText("Refresh import status")).toBeInTheDocument();
  expect(screen.queryByText("Coverage shows once the first days arrive.")).not.toBeInTheDocument();
  expect(screen.queryByText(/no day yet/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Query text on/)).not.toBeInTheDocument();
});

it("renders phase B from the truthful total without progress, heartbeat, or ETA", () => {
  const { container } = renderStrip({
    providerAvailableThrough: null,
    importState,
    statusFacts: { ...runningStatusFacts, observability: undefined },
  });

  expect(screen.getByText("Importing")).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
  expect(screen.getByLabelText("Refresh import status")).toBeInTheDocument();
  expect(screen.queryByText(/0 of|last activity|about .*left|not yet/)).not.toBeInTheDocument();
});

it("renders selector progress without an activity placeholder", () => {
  const { container } = renderStrip({
    providerAvailableThrough: null,
    importState: importStateWithFacts({
      ...observabilityFacts,
      consecutiveDays: 2,
      lastActivityAt: null,
    }),
  });

  expect(container.querySelector('[data-startup-segment="fact"]')).toHaveTextContent(
    "Importing · 93 of 488 finalized days",
  );
  expect(screen.queryByText(/last activity|not yet/)).not.toBeInTheDocument();
});

it("preserves a user-paused startup as authoritative", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, pausedReason: "user", state: "paused" },
  });

  expect(screen.getByText("Paused")).toBeInTheDocument();
  expect(screen.queryByText(/Importing/)).not.toBeInTheDocument();
});

it("keeps a user pause authoritative when self-host worker liveness is stale", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, pausedReason: "user", state: "paused" },
    workerStatus: "stale",
  });

  expect(screen.getByText("Paused")).toBeInTheDocument();
  expect(screen.queryByText(/worker|restart/i)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Resume Search Console import" }),
  ).not.toBeInTheDocument();
});

it("preserves a completed startup as authoritative", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, state: "completed" },
  });

  expect(screen.getByText("Completed")).toBeInTheDocument();
  expect(screen.queryByText(/Importing/)).not.toBeInTheDocument();
});

it("shows Delayed without a worker restart claim for confirmed stale runtime facts", () => {
  renderStrip({ providerAvailableThrough: null, workerStatus: "stale" });
  expect(screen.getByText("Delayed")).toBeInTheDocument();
  expect(screen.queryByText(/restart|pickup|60 seconds/i)).not.toBeInTheDocument();
});

it("keeps the same Delayed projection in Cloud", () => {
  renderStrip({ deploymentMode: "cloud", providerAvailableThrough: null, workerStatus: "stale" });
  expect(screen.getByText("Delayed")).toBeInTheDocument();
});
