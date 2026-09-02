import { describe, expect, it } from "vitest";
import {
  isSetupComplete,
  resolveSetupProgress,
  SETUP_STEP_DEFINITIONS,
  type SetupContext,
} from "./setup-steps";

const scheduledAt = new Date("2026-09-01T06:00:00.000Z");

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    completedCheckCount: 0,
    inFlightBatch: null,
    keywordCount: 0,
    keywordIds: [],
    project: {
      exists: true,
      name: "Example project",
      publicRef: "prj_abcdefghijklmnopqrstuvwx",
    },
    providerExists: false,
    schedule: { mode: "manual" },
    ...overrides,
  };
}

function stateFor(id: (typeof SETUP_STEP_DEFINITIONS)[number]["id"], ctx: SetupContext) {
  const step = SETUP_STEP_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Missing setup step ${id}.`);
  return step.resolve(ctx);
}

describe("setup step definitions", () => {
  it("keeps four stable ids, display order, titles, and video references", () => {
    expect(
      SETUP_STEP_DEFINITIONS.map(({ id, title, videoRef }) => ({ id, title, videoRef })),
    ).toEqual([
      { id: "create_project", title: "Create your project", videoRef: "create-project" },
      { id: "add_keywords", title: "Track your first keywords", videoRef: "add-keywords" },
      { id: "connect_source", title: "Connect a data source", videoRef: "connect-source" },
      { id: "first_check", title: "Run your first rank check", videoRef: "first-check" },
    ]);
  });

  it("resolves create_project from explicit project existence", () => {
    expect(stateFor("create_project", context())).toEqual({ family: "done" });
    expect(
      stateFor(
        "create_project",
        context({ project: { exists: false, name: null, publicRef: null } }),
      ),
    ).toEqual({
      cta: { id: "create_project", label: "Create project" },
      family: "action",
    });
  });

  it("resolves add_keywords from the authoritative count", () => {
    expect(stateFor("add_keywords", context({ keywordCount: 1 }))).toEqual({ family: "done" });
    expect(stateFor("add_keywords", context())).toEqual({
      cta: { id: "add_keywords", label: "Add keywords" },
      family: "action",
    });
  });

  it("resolves connect_source from a connected provider", () => {
    expect(stateFor("connect_source", context({ providerExists: true }))).toEqual({
      family: "done",
    });
    expect(stateFor("connect_source", context())).toEqual({
      cta: { id: "connect_source", label: "Connect data source" },
      family: "action",
    });
  });

  it("marks first_check done after the first completed check", () => {
    expect(stateFor("first_check", context({ completedCheckCount: 1 }))).toEqual({
      family: "done",
    });
  });

  it("lets completed first_check beat an in-flight batch and schedule", () => {
    expect(
      stateFor(
        "first_check",
        context({
          completedCheckCount: 1,
          inFlightBatch: {
            completed: 2,
            rankCheckIds: ["check_abcdefghijklmnopqrstuvwx"],
            total: 5,
          },
          providerExists: true,
          schedule: { mode: "scheduled", nextRunAt: scheduledAt, timezone: "Europe/Warsaw" },
        }),
      ),
    ).toEqual({ family: "done" });
  });

  it("blocks first_check without a provider before considering batch or schedule", () => {
    expect(
      stateFor(
        "first_check",
        context({
          inFlightBatch: { completed: 0, rankCheckIds: [], total: 4 },
          schedule: { mode: "scheduled", nextRunAt: scheduledAt, timezone: "UTC" },
        }),
      ),
    ).toEqual({
      family: "blocked",
      reason: "Needs a data source first",
      unblockedBy: "connect_source",
    });
  });

  it("reports canonical in-flight progress before schedule state", () => {
    expect(
      stateFor(
        "first_check",
        context({
          inFlightBatch: {
            completed: 2,
            rankCheckIds: ["check_abcdefghijklmnopqrstuvwx"],
            total: 5,
          },
          providerExists: true,
          schedule: { mode: "scheduled", nextRunAt: scheduledAt, timezone: "UTC" },
        }),
      ),
    ).toEqual({ family: "running", progress: { completed: 2, total: 5 } });
  });

  it("keeps an active zero-task batch running", () => {
    expect(
      stateFor(
        "first_check",
        context({
          inFlightBatch: { completed: 0, rankCheckIds: [], total: 0 },
          providerExists: true,
        }),
      ),
    ).toEqual({ family: "running", progress: { completed: 0, total: 0 } });
  });

  it("blocks a first check until keywords exist", () => {
    expect(stateFor("first_check", context({ providerExists: true }))).toEqual({
      family: "blocked",
      reason: "Needs keywords first",
      unblockedBy: "add_keywords",
    });
  });

  it("offers a manual first check action", () => {
    expect(stateFor("first_check", context({ keywordCount: 1, providerExists: true }))).toEqual({
      cta: { id: "run_first_check", label: "Run first check" },
      family: "action",
    });
  });

  it("waits for a scheduled run with typed time data and an accelerator", () => {
    expect(
      stateFor(
        "first_check",
        context({
          keywordCount: 1,
          providerExists: true,
          schedule: { mode: "scheduled", nextRunAt: scheduledAt, timezone: "Europe/Warsaw" },
        }),
      ),
    ).toEqual({
      accelerate: { id: "run_first_check", label: "Run it now instead" },
      family: "waiting",
      when: { nextRunAt: scheduledAt, timezone: "Europe/Warsaw" },
    });
  });

  it("derives completed count from the resolved list", () => {
    const progress = resolveSetupProgress(
      context({ completedCheckCount: 1, keywordCount: 3, providerExists: true }),
    );
    expect(progress.doneCount).toBe(4);
    expect(progress.settledCount).toBe(4);
    expect(progress.completed).toBe(true);
    expect(progress.steps).toHaveLength(4);
  });

  it("treats four done and one skipped as completed", () => {
    const steps = [
      { state: { family: "done" as const } },
      { state: { family: "done" as const } },
      { state: { family: "done" as const } },
      { state: { family: "done" as const } },
      { state: { family: "skipped" as const } },
    ];
    expect(isSetupComplete(steps)).toBe(true);
    expect(
      isSetupComplete([
        ...steps.slice(0, 4),
        { state: { family: "blocked", reason: "x", unblockedBy: "first_check" } },
      ]),
    ).toBe(false);
  });

  it("keeps authored user-visible strings free of U+2014", () => {
    const contexts = [
      context({ project: { exists: false, name: null, publicRef: null } }),
      context(),
      context({ providerExists: true }),
      context({
        providerExists: true,
        schedule: { mode: "scheduled", nextRunAt: scheduledAt, timezone: "UTC" },
      }),
    ];
    const authored = [
      ...SETUP_STEP_DEFINITIONS.flatMap((step) => [step.id, step.title, step.videoRef]),
      ...contexts.flatMap((ctx) =>
        resolveSetupProgress(ctx).steps.flatMap(({ state }) => JSON.stringify(state)),
      ),
    ].join(" ");
    expect(authored).not.toContain("\u2014");
  });
});
