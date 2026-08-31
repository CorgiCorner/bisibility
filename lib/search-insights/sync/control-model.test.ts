import { describe, expect, it } from "vitest";
import { resolveSearchBackfillPresentation } from "./control-model";

const base = {
  completedDays: 7,
  connectionStatus: "connected" as const,
  deploymentMode: "self-host" as const,
  firstViewReady: false,
  state: "running",
  waiting: false,
  workerStatus: {
    status: "ok" as const,
    temporalIdentityComparison: { detail: "identities match", status: "match" as const },
  },
};

describe("resolveSearchBackfillPresentation", () => {
  it.each([
    ["running", {}, "running", "pause", true],
    ["partial", { completedDays: 3 }, "running", "pause", true],
    [
      "paused known",
      { pauseStartedAt: "2026-08-27T12:00:00.000Z", pausedReason: "user", state: "paused" },
      "paused_user",
      "resume",
      false,
    ],
    [
      "paused unknown",
      { pauseStartedAt: null, pausedReason: "user", state: "paused" },
      "paused_user",
      "resume",
      false,
    ],
    [
      "paused beats stale worker",
      {
        pausedReason: "user",
        state: "paused",
        workerStatus: {
          status: "stale",
          temporalIdentityComparison: { detail: "stale", status: "match" },
        },
      },
      "paused_user",
      "resume",
      false,
    ],
    [
      "reauth beats pause",
      { connectionStatus: "needs_reauth", pausedReason: "user", state: "paused" },
      "needs_reauth",
      "reconnect",
      false,
    ],
    ["quota", { pausedReason: "rate_limited", state: "paused" }, "quota", null, false],
    [
      "reauth marker",
      { pausedReason: "needs_reauth", state: "paused" },
      "needs_reauth",
      "reconnect",
      false,
    ],
    ["error", { safeError: "Provider unavailable.", state: "failed" }, "error", "retry", false],
    ["done", { firstViewReady: true, state: "completed" }, "done", null, false],
    [
      "self-host worker",
      {
        workerStatus: {
          status: "stale",
          temporalIdentityComparison: { detail: "app and worker differ", status: "mismatch" },
        },
      },
      "waiting_worker",
      null,
      false,
    ],
    [
      "cloud worker",
      {
        deploymentMode: "cloud",
        workerStatus: {
          status: "stale",
          temporalIdentityComparison: { detail: "secret worker detail", status: "mismatch" },
        },
      },
      "waiting_worker",
      null,
      false,
    ],
    ["observability wait", { waiting: true }, "starting", null, false],
    ["queued", { state: "queued" }, "queued", null, true],
    ["starting", { state: "created" }, "starting", null, false],
  ] as const)("resolves %s", (_name, overrides, kind, action, polling) => {
    expect(resolveSearchBackfillPresentation({ ...base, ...overrides })).toMatchObject({
      action,
      kind,
      polling,
    });
  });

  it("uses exact actor-neutral pause copy with and without a date", () => {
    expect(
      resolveSearchBackfillPresentation({
        ...base,
        pauseStartedAt: "2026-08-27T12:00:00.000Z",
        pausedReason: "user",
        state: "paused",
      }),
    ).toMatchObject({
      description: "7 of 28 finalized days are imported.",
      supportingText:
        "Paused on Aug 27, 2026. New finalized days will not be imported until you resume sync.",
      title: "Backfill paused",
    });
    const unknown = resolveSearchBackfillPresentation({
      ...base,
      pauseStartedAt: null,
      pausedReason: "user",
      state: "paused",
    });
    expect(unknown.supportingText).toBe(
      "New finalized days will not be imported until you resume sync.",
    );
    expect(unknown.supportingText).not.toContain("unknown");
    expect(unknown.supportingText).not.toContain("by you");
  });

  it("keeps cloud worker copy deployment-neutral", () => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      deploymentMode: "cloud",
      workerStatus: {
        status: "stale",
        temporalIdentityComparison: { detail: "namespace task queue", status: "mismatch" },
      },
    });
    expect(`${model.title} ${model.supportingText}`).not.toMatch(
      /worker|temporal|namespace|queue|restart|self-host/i,
    );
  });

  it("does not claim running from progress or settings alone", () => {
    const model = resolveSearchBackfillPresentation({
      ...base,
      completedDays: 12,
      state: null,
    });
    expect(model.kind).toBe("starting");
    expect(`${model.title} ${model.supportingText}`).not.toMatch(/running|in progress/i);
  });
});
