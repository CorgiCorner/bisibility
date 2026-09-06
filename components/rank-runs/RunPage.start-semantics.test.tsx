import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunPage } from "./RunPage";
import { runPageFixture } from "./RunPageFixtures";

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ operations: [], status: "live" }),
}));

const queuedRun = {
  ...runPageFixture.run,
  counts: {
    cancelled: 0,
    completed: 0,
    deferred: 0,
    failed: 0,
    requested: 1,
    skipped: 0,
    total: 1,
  },
  costCents: 0,
  estimatedCostCents: 1,
  firstNotBefore: "2026-09-04T14:00:00.000Z",
  keywordCount: 1,
  launchedAt: "2026-09-04T00:00:00.000Z",
  nextCheckAt: "2026-09-04T14:00:00.000Z",
  scheduleTiming: "spread across the day",
  startedAt: null,
  startedTargets: 0,
  hasRunningTargets: false,
  status: "queued" as const,
  targetCount: 1,
  trigger: "scheduled" as const,
};

describe("run starts at the first target, not schedule materialization", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a distributed target as queued, with zero starts, a first-check time and estimated cost", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T10:00:00.000Z"));
    render(
      <RunPage {...runPageFixture} run={queuedRun} canMutate projectRef="prj_example" items={[]} />,
    );
    expect(screen.getByText("0 of 1 selected targets started")).toBeVisible();
    expect(screen.getByText("First check in")).toBeVisible();
    expect(screen.getByText("4h")).toBeVisible();
    expect(screen.getByText("spread across the day")).toBeVisible();
    expect(screen.getByText("Estimated cost")).toBeVisible();
    expect(screen.queryByText("Elapsed")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Running" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeEnabled();
  });

  it("measures elapsed time from the first claim and retains it during later gaps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T10:01:00.000Z"));
    render(
      <RunPage
        {...runPageFixture}
        canMutate
        projectRef="prj_example"
        items={[]}
        run={{
          ...queuedRun,
          status: "running",
          firstNotBefore: null,
          startedAt: "2026-09-04T10:00:00.000Z",
          startedTargets: 1,
          counts: { ...queuedRun.counts, completed: 1, total: 2, requested: 2 },
        }}
      />,
    );
    expect(screen.getByText("1 of 2 selected targets started")).toBeVisible();
    expect(screen.getByText("Elapsed")).toBeVisible();
    expect(screen.getByText("1 min 0 s")).toBeVisible();
    expect(screen.getByText("Spent so far")).toBeVisible();
  });

  it("does not add pre-start waiting to a completed single-check duration", () => {
    render(
      <RunPage
        {...runPageFixture}
        canMutate
        projectRef="prj_example"
        items={[]}
        run={{
          ...queuedRun,
          status: "completed",
          outcome: "succeeded",
          firstNotBefore: null,
          nextCheckAt: null,
          startedAt: "2026-09-04T23:00:00.000Z",
          finishedAt: "2026-09-04T23:00:30.000Z",
          startedTargets: 1,
          counts: { ...queuedRun.counts, completed: 1 },
        }}
      />,
    );
    expect(screen.getByText("Duration")).toBeVisible();
    expect(screen.getByText("30 s")).toBeVisible();
  });
});
