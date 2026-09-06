import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";

const realtime = vi.hoisted(() => ({ operations: [] as object[] }));

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ notifications: null, operations: realtime.operations, status: "live" }),
}));

function renderPage(overrides: Partial<ComponentProps<typeof RunPage>> = {}) {
  return render(<RunPage {...runPageFixture} canMutate projectRef="prj_example" {...overrides} />);
}

describe("RunPage", () => {
  afterEach(() => {
    realtime.operations = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("implements four slots", () => {
    renderPage();
    for (const label of ["Selection", "Provider", "Spent so far", "Elapsed"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a compact run ID in the header while retaining the full copy value and tooltip", () => {
    const run = { ...runPageFixture.run, id: "rcr_9d2e41abcdef" };
    renderPage({ run });

    expect(screen.getByText("rcr_9d2e41").parentElement).toHaveAttribute("title", run.id);
    expect(screen.getByRole("button", { name: `Copy run ID ${run.id}` })).toBeInTheDocument();
  });

  it("keeps counts in targets", () => {
    renderPage();
    expect(screen.getByText("253 of 694 selected targets started")).toBeInTheDocument();
    expect(screen.getByLabelText("Run progress: 252 of 694 targets processed")).toBeInTheDocument();
  });

  it("uses current target counters for a cancelled planned run", () => {
    renderPage({
      items: [
        {
          ...runPageFixture.items[0],
          finishedAt: "2026-09-04T22:00:00.000Z",
          id: "cancelled-before-send",
          startedAt: null,
          status: "cancelled",
        },
      ],
      run: {
        ...runPageFixture.run,
        counts: {
          cancelled: 1,
          completed: 0,
          deferred: 0,
          failed: 0,
          requested: 1,
          skipped: 0,
          total: 1,
        },
        finishedAt: "2026-09-04T22:00:00.000Z",
        keywordCount: 1,
        startedTargets: 0,
        outcome: null,
        startedAt: null,
        status: "cancelled",
        targetCount: 20,
      },
    });

    expect(screen.getByText("1 keyword · 1 target")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 selected targets started")).toBeInTheDocument();
    expect(screen.getByLabelText("Run progress: 1 of 1 targets processed")).toBeInTheDocument();
    const header = screen.getByRole("heading", { name: "Manual run" }).closest("section");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText("Duration")).toBeInTheDocument();
    expect(within(header as HTMLElement).getAllByText("-")).toHaveLength(2);
    const counters = within(screen.getByLabelText("Run counters"));
    expect(counters.getByText("Cancelled")).toBeInTheDocument();
    expect(counters.getByText("stopped before sending")).toBeInTheDocument();
    expect(screen.getByText("1 keyword · 1 target")).toBeInTheDocument();
  });

  it("renders elapsed time as a duration and formats the start time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T14:24:12.000Z"));
    renderPage();

    expect(screen.getByText("4 min 12 s")).toBeInTheDocument();
    expect(screen.getByText("Started Aug 31, 14:20")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-31T14:20:00.000Z")).toBeNull();
  });

  it("implements a skipped filter with reasons", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "6 skipped before start" }));
    expect(screen.getByText("Paused target - resumes when you unpause it")).toBeInTheDocument();
    expect(
      screen.getByText("Off-catalog pair - Arabic is not offered for Belgium"),
    ).toBeInTheDocument();
  });

  it("uses live vs audit ordering", () => {
    const { unmount } = renderPage();
    const liveRows = within(screen.getByRole("table")).getAllByRole("link");
    expect(liveRows[0]).toHaveTextContent("zeta cms");
    unmount();
    renderPage({
      run: { ...runPageFixture.run, outcome: "succeeded", status: "completed" },
    });
    const auditRows = within(screen.getByRole("table")).getAllByRole("link");
    expect(auditRows[0]).toHaveTextContent("alpha cms");
  });

  it("opens a Cancel run dialog that names the three fates", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Cancel run" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this run?" });
    expect(dialog).toHaveTextContent("have not been sent stop immediately");
    expect(dialog).toHaveTextContent("already with the provider finish and are billed");
    expect(dialog).toHaveTextContent("Completed targets and their results are kept");
    expect(dialog).toHaveTextContent("442 targets may still be with the provider.");
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
  ] as const)(
    "renders exactly one %s/%s run badge with the %s tone",
    (status, outcome, label, tone) => {
      renderPage({ run: { ...runPageFixture.run, outcome, status } });

      const header = screen.getByRole("heading", { name: "Manual run" }).closest("section");
      expect(header).not.toBeNull();
      const badges = within(header as HTMLElement).getAllByRole("status");
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveAttribute("aria-label", label);
      expect(badges[0]).toHaveAttribute("data-status-chip-tone", tone);
    },
  );

  it.each(RUN_STATUSES)("shows Cancel run for active runs and blocked manual runs", (status) => {
    const outcome = status === "completed" ? "succeeded" : null;
    renderPage({ run: { ...runPageFixture.run, outcome, status } });

    const cancel = screen.queryByRole("button", { name: "Cancel run" });
    if (status === "queued" || status === "running" || status === "blocked") {
      expect(cancel).toBeEnabled();
    } else {
      expect(cancel).toBeNull();
    }
  });

  it("has no context slot", () => {
    renderPage();
    expect(screen.queryByText("Context")).toBeNull();
  });

  it("renders planned state on the same template", () => {
    renderPage({
      run: {
        ...runPageFixture.run,
        costCents: 0,
        launchedAt: null,
        plannedFor: "2026-09-01T06:00:00.000Z",
        requestedBy: null,
        status: "planned",
        trigger: "scheduled",
      },
    });
    expect(screen.getByRole("heading", { name: "Targets in this run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument();
    expect(screen.getByText("350 keywords · 694 targets")).toBeInTheDocument();
    expect(screen.getByText("set when planned")).toBeInTheDocument();
  });

  it("renders a skipped occurrence without actions or sent targets", () => {
    renderPage({
      items: [],
      run: {
        ...runPageFixture.run,
        costCents: 151,
        counts: {
          cancelled: 0,
          completed: 0,
          deferred: 0,
          failed: 0,
          requested: 24,
          skipped: 0,
          total: 24,
        },
        finishedAt: "2026-09-05T06:05:00.000Z",
        keywordCount: 24,
        launchedAt: null,
        outcome: null,
        plannedFor: "2026-09-05T06:00:00.000Z",
        requestedBy: null,
        skippedBy: { name: "Anna Kowalska" },
        startedAt: null,
        status: "cancelled",
        targetCount: 24,
        trigger: "scheduled",
      },
    });

    expect(screen.getByRole("status", { name: "Skipped" })).toBeInTheDocument();
    expect(screen.getByText(/Skipped by Anna Kowalska on Sep 5, 06:05/)).toBeInTheDocument();
    expect(screen.getByText("Nothing was sent.")).toBeInTheDocument();
    expect(screen.getByText("nothing billed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  });

  it("shows the next queued check for a running run", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    renderPage({ run: { ...runPageFixture.run, nextCheckAt: "2026-09-02T12:00:00.000Z" } });

    expect(screen.getByText("Next check in 2h")).toBeInTheDocument();
  });

  it("refreshes persisted detail after the active realtime run exits", async () => {
    realtime.operations = [
      {
        ...runPageFixture.run,
        etaSeconds: null,
        snapshotAt: runPageFixture.now,
      },
    ];
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          ...runPageFixture.run,
          finishedAt: "2026-08-31T14:30:00.000Z",
          outcome: "succeeded",
          status: "completed",
        },
      }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetch);
    const view = renderPage();
    expect(screen.getByRole("status", { name: "Running" })).toBeInTheDocument();

    realtime.operations = [];
    view.rerender(<RunPage {...runPageFixture} canMutate projectRef="prj_example" />);

    await screen.findByRole("status", { name: "Succeeded" });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "/api/rank-check-runs/rcr_9d2e41?project=prj_example",
    );
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
  });

  it.each([
    ["failed", { deferred: 0, failed: 2 }, "Retry 2 failed targets"],
    ["deferred", { deferred: 2, failed: 0 }, "Retry 2 deferred targets"],
  ] as const)("offers the design retry action for a %s terminal run", (outcome, counts, label) => {
    renderPage({
      run: {
        ...runPageFixture.run,
        counts: { ...runPageFixture.run.counts, ...counts },
        outcome,
        status: "completed",
      },
    });

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("explains a blocked manual run and offers retry or cancellation", () => {
    renderPage({
      run: {
        ...runPageFixture.run,
        blockedReason: "temporal_unavailable",
        startedAt: null,
        status: "blocked",
      },
    });

    expect(
      screen.getByRole("heading", { name: "Waiting for the background worker" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The background worker isn't reachable right now. The run starts on its own once it reconnects.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry now" })).toHaveAttribute(
      "title",
      "The background worker isn't reachable right now. The run starts on its own once it reconnects.",
    );
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip once" })).toBeNull();
    expect(screen.queryByText("temporal_unavailable")).toBeNull();
  });

  it("keeps an item-specific blocked reason when the run is blocked", () => {
    renderPage({
      items: [
        ...runPageFixture.items,
        {
          ...runPageFixture.items[0],
          id: "queued-budget",
          rankCheck: null,
          status: "queued",
        },
      ],
      run: {
        ...runPageFixture.run,
        blockedReason: "budget_exhausted",
        status: "blocked",
      },
    });

    const targets = within(screen.getByRole("table", { name: "Targets in this run" }));
    expect(targets.getByText("Paused target - resumes when you unpause it")).toBeInTheDocument();
    expect(targets.getByText("Budget reached")).toBeInTheDocument();
  });

  it("names the stopped market on a cancelled target instead of printing its reason code", () => {
    renderPage({
      items: [
        {
          ...runPageFixture.items[0],
          blockedReason: "market_inactive",
          finishedAt: "2026-08-31T14:23:00.000Z",
          id: "cancelled-market",
          rankCheck: null,
          status: "cancelled",
        },
      ],
    });

    const targets = within(screen.getByRole("table", { name: "Targets in this run" }));
    expect(targets.getByRole("columnheader", { name: "Note" })).toBeInTheDocument();
    expect(targets.getByText("Market not active")).toBeInTheDocument();
    expect(targets.queryByText("market_inactive")).toBeNull();
  });

  it("keeps scheduled-run controls for a blocked occurrence", () => {
    renderPage({
      run: {
        ...runPageFixture.run,
        blockedReason: "temporal_unavailable",
        launchedAt: null,
        plannedFor: "2026-09-05T06:00:00.000Z",
        startedAt: null,
        status: "blocked",
        trigger: "scheduled",
      },
    });

    expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip once" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
  });

  it("links a self-hosted worker block to Worker status", () => {
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <RunPage
          {...runPageFixture}
          canMutate
          projectRef="prj_example"
          run={{ ...runPageFixture.run, blockedReason: "temporal_unavailable", status: "blocked" }}
        />
      </DeploymentModeProvider>,
    );

    expect(screen.getByRole("link", { name: "Worker status" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
  });
});
