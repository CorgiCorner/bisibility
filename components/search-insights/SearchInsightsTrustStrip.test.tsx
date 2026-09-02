import { KNOWN_DATA_INCIDENTS } from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { isoFromFrozenNow } from "@/tests/clock";
import { render, screen } from "@testing-library/react";
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
  consecutiveDays: 93,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
  lastProbeAt: "2026-08-28T18:17:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
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
  runtime: { workerStatus: matchedWorker, workflowStatus: "running" as const },
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
      `${observabilityFacts.qualifyingDays} of ${observabilityFacts.targetDays} finalized days`,
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent("3 of 16 months");
  });
});

describe("SearchInsightsTrustStrip", () => {
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
    expect(screen.getByTestId("freshness-note")).toHaveTextContent(/^checked /);
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
      observabilityFacts.qualifyingDays.toString(),
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
    expect(screen.getByText("Running")).toBeInTheDocument();
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
          runtime: { workerStatus: matchedWorker, workflowStatus: "completed" },
          state: "completed",
        }}
        workerStatus={matchedWorker}
      />,
    );
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Refresh import status").closest("[data-auto-refresh]"),
    ).toHaveAttribute("data-auto-refresh", "inactive");
  });

  it("keeps the full-width import action at the right as a secondary control", () => {
    renderStrip();

    const pause = screen.getByRole("button", { name: "Pause Search Console import" });
    expect(pause).toHaveClass("MuiButton-outlined");
    expect(pause).toHaveClass("shrink-0");

    const row = pause.closest('[data-testid="search-import-line"]');
    expect(row).toHaveClass("flex", "w-full", "items-center", "justify-between");
    expect(row?.lastElementChild).toContainElement(pause);
    expect(screen.getAllByRole("button", { name: "Refresh import status" })).toHaveLength(1);
  });

  it("keeps resume, retry, and reconnect actions secondary in the shared row", () => {
    const { rerender } = renderStrip({
      importState: {
        ...importState,
        pauseStartedAt: "2026-07-09T12:00:00.000Z",
        pausedReason: "user",
        state: "paused",
      },
      statusFacts: { ...runningStatusFacts, pausedReason: "user", state: "paused" },
    });
    expect(screen.getByRole("button", { name: "Resume Search Console import" })).toHaveClass(
      "MuiButton-outlined",
    );

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
    expect(screen.getByRole("button", { name: "Retry Search Console import" })).toHaveClass(
      "MuiButton-outlined",
    );

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
    expect(screen.getByRole("link", { name: "Reconnect Search Console" })).toHaveClass(
      "MuiButton-outlined",
    );
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
    expect(screen.getByText("Paused by you")).toBeInTheDocument();
    expect(screen.getByTestId("freshness-note")).toHaveTextContent(/^checked /);
    const freshness = screen.getByText("Freshness").closest("div");
    expect(freshness?.textContent).not.toMatch(/paused by you|data ends at|Paused on|Resume/i);
    expect(screen.getAllByRole("button", { name: "Resume Search Console import" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Refresh import status" })).toBeInTheDocument();
  });

  it("flags a published provider anomaly beside the freshness fact", () => {
    renderStrip({ incidents: KNOWN_DATA_INCIDENTS });

    expect(screen.getByText("Known Google data issue")).toBeInTheDocument();
  });

  it("renders selector-backed readiness and deep-history progress without another status label", () => {
    const { container, rerender } = renderStrip({ importState: importStateWithFacts() });

    expect(screen.getByTestId("qualifying-progress")).toHaveTextContent(
      `${observabilityFacts.qualifyingDays} of ${observabilityFacts.targetDays} finalized days`,
    );
    expect(screen.getByTestId("deep-history-progress")).toHaveTextContent("3 of 16 months");
    expect(screen.getAllByText("Running")).toHaveLength(1);
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

  it("renders phase A as exactly one fact segment without premature progress", () => {
    const { container } = renderStrip({ providerAvailableThrough: null, importState: null });

    expect(
      screen.getByText("Waiting for the first data from Google · import starting"),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(
        "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0 of 0|about 3 days|completion|first-28/i);
    expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause|Refresh/ })).not.toBeInTheDocument();
  });

  it("keeps startup ownership guidance while finalized sync uses compact status controls", () => {
    const expected =
      "Google only keeps 16 months, so we are copying all of it into your database now. The first 7-day view unlocks as soon as its finalized days are ready; older months keep loading in the background.";
    expect(importRunningOwnershipCopy(16, "self-host")).toBe(expected);
    const { rerender } = renderStrip({ providerAvailableThrough: null });
    expect(screen.getByText(expected)).toBeInTheDocument();

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
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Search Console import" })).toBeInTheDocument();
  });
});

it("renders selector-backed phase C progress alongside separate truthful segments", () => {
  const { container } = renderStrip({
    importState: importStateWithFacts(),
    providerAvailableThrough: null,
  });

  expect(
    screen.getByText(
      `Importing your Google history · ${observabilityFacts.qualifyingDays} of ${observabilityFacts.targetDays} finalized days`,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/last activity/)).toBeInTheDocument();
  expect(screen.queryByText(/about 3 days left/)).not.toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="deep-history"]')).toHaveTextContent(
    "3 of 16 months",
  );
  const freshness = container.querySelector('[data-startup-segment="freshness"]');
  expect(freshness).toBeInstanceOf(HTMLElement);
  expect(tooltipText(freshness as HTMLElement)).toBe(
    "Last checked Aug 28, 11:17 Pacific. Google may adjust recent data until it finalizes.",
  );
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

  expect(
    screen.getByText("Waiting for the first data from Google · importing ~488 days of history"),
  ).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Refresh import status")).not.toBeInTheDocument();
  expect(screen.queryByText(/0 of|last activity|about .*left|not yet/)).not.toBeInTheDocument();
});

it("renders selector progress without an activity placeholder", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: importStateWithFacts({
      ...observabilityFacts,
      consecutiveDays: 2,
      lastActivityAt: null,
    }),
  });

  expect(
    screen.getByText("Importing your Google history · 7 of 10 finalized days"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/last activity|not yet/)).not.toBeInTheDocument();
});

it("preserves a user-paused startup as authoritative", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, pausedReason: "user", state: "paused" },
  });

  expect(screen.getByText("Import paused · resumes only when you say so")).toBeInTheDocument();
  expect(screen.queryByText(/Importing your Google history/)).not.toBeInTheDocument();
});

it("keeps a user pause authoritative when self-host worker liveness is stale", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, pausedReason: "user", state: "paused" },
    workerStatus: "stale",
  });

  expect(screen.getByText("Import paused · resumes only when you say so")).toBeInTheDocument();
  expect(screen.queryByText(/waiting for the background worker/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume Search Console import" })).toBeInTheDocument();
});

it("preserves a completed startup as authoritative", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, state: "completed" },
  });

  expect(screen.getByText("16 months imported, growing daily")).toBeInTheDocument();
  expect(screen.queryByText(/Importing your Google history/)).not.toBeInTheDocument();
});

it("shows the actionable worker notice only for stale self-host liveness", () => {
  renderStrip({ providerAvailableThrough: null, workerStatus: "stale" });
  expect(screen.getAllByText(/waiting for the background worker/)).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Self-hosting guide." })).toHaveAttribute(
    "href",
    "https://bisibility.com/docs/self-hosting/temporal#worker-startup-troubleshooting",
  );
  expect(screen.getByText(/nothing already imported is lost/)).toBeInTheDocument();
});

it("does not expose worker internals in Cloud", () => {
  renderStrip({ deploymentMode: "cloud", providerAvailableThrough: null, workerStatus: "stale" });
  expect(screen.queryByText(/background worker/)).not.toBeInTheDocument();
});
