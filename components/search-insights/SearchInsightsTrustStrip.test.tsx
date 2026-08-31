import { KNOWN_DATA_INCIDENTS } from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { isoFromFrozenNow } from "@/tests/clock";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsTrustStrip } from "./SearchInsightsTrustStrip";
import { importRunningOwnershipCopy, OWNERSHIP_COPY } from "./search-insights-copy";

const pauseAction = async () => ({ ok: true as const, state: "running" });

const importState: SearchInsightsImportState = {
  completedDays: 28,
  etaLabel: "about 3 days left (finishes ~Mon)",
  firstViewReady: true,
  lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
  plannedRetentionMonths: 16,
  waiting: false,
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

function renderStrip(overrides: Partial<Parameters<typeof SearchInsightsTrustStrip>[0]> = {}) {
  return render(
    <SearchInsightsTrustStrip
      coverage={{ calculable: true, capHitDays: 0, clicksShare: 62, impressionsShare: 41 }}
      deploymentMode="self-host"
      providerAvailabilitySource="metadata"
      providerAvailableThrough="2026-07-08"
      importState={importState}
      incidents={[]}
      pauseAction={pauseAction}
      projectId="prj_test"
      resumeAction={pauseAction}
      localViewReady
      workerStatus="ok"
      {...overrides}
    />,
  );
}

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

  it("states the finalized day, the freshness probe and the coverage in one place", () => {
    renderStrip();

    expect(screen.getByTestId("provider-available-date")).toHaveTextContent("Jul 8");
    expect(
      screen.getByText(
        "Fresh data through Aug 28, 11:17 Pacific. Google may still adjust these numbers before they finalize.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google data available through/)).toBeInTheDocument();
    expect(screen.queryByText(/revisions|, still subject/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finalized through/)).not.toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
  });

  it("separates provider freshness from partial local readiness", () => {
    const { container } = renderStrip({
      coverage: { calculable: false, capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
      importState: { ...importState, completedDays: 7, firstViewReady: false },
      localViewReady: false,
      providerAvailableThrough: "2026-08-26",
    });

    const date = screen.getByTestId("provider-available-date");
    expect(date).toHaveTextContent("Aug 26");
    expect(date.textContent).toBe("Aug 26");
    expect(date).not.toHaveTextContent("2026");
    expect(date.childNodes).toHaveLength(1);
    expect(date.firstElementChild).toHaveClass("font-mono");
    const availability = screen.getByText("Google data available through", { exact: false });
    expect(availability).toBeInTheDocument();
    expect(availability.textContent).not.toMatch(/\s{2}/);
    expect(screen.getByText("7 of 28 days imported for the first view")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Finalized through|imported through|locally finalized/i,
    );
    expect(
      screen.getByText("Coverage appears once the first finalized days are imported."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /0% \/ 0%|Query text on|about three days|first data|16 month|,\s{2}|%.* \/ .*%/i,
    );
    expect(screen.queryByLabelText("Refresh import status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-import-line")).not.toBeInTheDocument();
  });

  it("labels a fallback boundary as an estimate rather than Google metadata", () => {
    const { container } = renderStrip({
      providerAvailabilitySource: "fallback",
      providerAvailableThrough: "2026-08-26",
    });

    expect(container.textContent).toContain("Estimated Google data availability through Aug 26");
    expect(container.textContent).not.toContain(
      "Estimated Google data availability through Aug 26, 2026",
    );
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

  it("reports running and completed imports without error copy", () => {
    const { rerender } = renderStrip();
    expect(screen.getByText("Backfill in progress")).toBeInTheDocument();
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
        workerStatus="ok"
      />,
    );
    expect(screen.getByText("16 months imported, growing daily")).toBeInTheDocument();
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
        workerStatus="ok"
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
        workerStatus="ok"
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
    });
    expect(screen.getByText("Backfill paused")).toBeInTheDocument();
    expect(screen.getByText(/Fresh data through/)).toBeInTheDocument();
    const freshness = screen.getByText("Freshness").closest("div");
    expect(freshness?.textContent).not.toMatch(/paused by you|data ends at|Paused on|Resume/i);
    expect(screen.getAllByRole("button", { name: "Resume Search Console import" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Refresh import status" })).toBeInTheDocument();
  });

  it("flags a published provider anomaly beside the freshness fact", () => {
    renderStrip({ incidents: KNOWN_DATA_INCIDENTS });

    expect(screen.getByText("Known Google data issue")).toBeInTheDocument();
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

  it("keeps startup ownership guidance while finalized sync uses compact status controls", () => {
    const expected =
      "Google only keeps 16 months, so we are copying all of it into your database now. The first 28-day view unlocks as soon as its finalized days are ready; older months keep loading in the background.";
    expect(importRunningOwnershipCopy(16, "self-host")).toBe(expected);
    const { rerender } = renderStrip({ providerAvailableThrough: null });
    const startupDescription = screen
      .getByRole("region", { name: "Data provenance" })
      .querySelector("[aria-describedby]");
    expect(startupDescription).not.toBeNull();
    expect(
      document.getElementById(startupDescription?.getAttribute("aria-describedby") ?? ""),
    ).toHaveTextContent(expected);

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
        workerStatus="ok"
      />,
    );
    expect(screen.getByText("Backfill in progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Search Console import" })).toBeInTheDocument();
  });
});

it("renders phase C fact, activity, ETA, progress, and heartbeat as separate truthful segments", () => {
  const { container } = renderStrip({ providerAvailableThrough: null });

  expect(screen.getByText("Importing your Google history · 28 of ~488 days")).toBeInTheDocument();
  expect(screen.getByText(/last activity/)).toBeInTheDocument();
  expect(screen.getByText(/about 3 days left/)).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).toBeInTheDocument();
  expect(screen.getByLabelText("Refresh import status")).toBeInTheDocument();
  expect(screen.queryByText("Coverage shows once the first days arrive.")).not.toBeInTheDocument();
  expect(screen.queryByText(/no day yet|Pacific/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Query text on/)).not.toBeInTheDocument();
});

it("renders phase B from the truthful total without progress, heartbeat, or ETA", () => {
  const { container } = renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, completedDays: 0, lastActivityAt: null },
  });

  expect(
    screen.getByText("Waiting for the first data from Google · importing ~488 days of history"),
  ).toBeInTheDocument();
  expect(container.querySelector('[data-startup-segment="progress"]')).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Refresh import status")).not.toBeInTheDocument();
  expect(screen.queryByText(/0 of|last activity|about .*left|not yet/)).not.toBeInTheDocument();
});

it("renders phase C without an activity placeholder when completed days are the fallback", () => {
  renderStrip({
    providerAvailableThrough: null,
    importState: { ...importState, completedDays: 2, etaLabel: null, lastActivityAt: null },
  });

  expect(screen.getByText("Importing your Google history · 2 of ~488 days")).toBeInTheDocument();
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
