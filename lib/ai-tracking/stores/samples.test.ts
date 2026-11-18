import type { MeasurementState, PersistTrackingResultInput } from "@/lib/ai-tracking/contract";
import type { AiTrackingRun, AiTrackingSample } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

type Run = Pick<AiTrackingRun, "id" | "projectId" | "state" | "reasonCode" | "finishedAt">;
type Sample = Pick<
  AiTrackingSample,
  "id" | "projectId" | "runId" | "attemptId" | "dispatch" | "measurement"
>;
const state = vi.hoisted(() => ({
  run: null as Run | null,
  samples: [] as Sample[],
  usage: vi.fn(),
}));
vi.mock("@/lib/analytics/tracking-run-usage", () => ({ queueTrackingRunUsage: state.usage }));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: async () => [],
    project: { findUnique: async () => ({ id: "project" }) },
    aiTrackingRun: {
      findFirst: async () => ({ ...state.run, competitorSnapshot: [] }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          projectId: string;
          id: string;
          state?: { in: Run["state"][] };
          reasonCode?: string | null;
        };
        data: Partial<Run>;
      }) => {
        const run = state.run;
        if (
          !run ||
          run.id !== where.id ||
          run.projectId !== where.projectId ||
          (where.state !== undefined && !where.state.in.includes(run.state)) ||
          (where.reasonCode !== undefined && run.reasonCode !== where.reasonCode)
        )
          return { count: 0 };
        Object.assign(run, data);
        return { count: 1 };
      },
    },
    aiTrackingSample: {
      findFirst: async ({ where }: { where: Partial<Sample> }) =>
        state.samples.find(
          (sample) =>
            sample.projectId === where.projectId &&
            sample.id === where.id &&
            sample.attemptId === where.attemptId,
        ) ?? null,
      updateMany: async ({ where, data }: { where: Partial<Sample>; data: Partial<Sample> }) => {
        const sample = state.samples.find(
          (sample) =>
            sample.projectId === where.projectId &&
            sample.id === where.id &&
            sample.attemptId === where.attemptId &&
            sample.dispatch === where.dispatch,
        );
        if (!sample) return { count: 0 };
        Object.assign(sample, data);
        return { count: 1 };
      },
      count: async ({ where }: { where: { projectId: string; runId: string } }) =>
        state.samples.filter(
          (sample) =>
            sample.projectId === where.projectId &&
            sample.runId === where.runId &&
            sample.dispatch !== "terminal",
        ).length,
      findMany: async ({ where }: { where: { projectId: string; runId: string } }) =>
        state.samples.filter(
          (sample) => sample.projectId === where.projectId && sample.runId === where.runId,
        ),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        state.samples.find((sample) => sample.id === where.id),
    },
  };
  return {
    prisma: { $transaction: async (work: (transaction: typeof tx) => unknown) => work(tx) },
  };
});

import { persistTrackingResult } from "./samples";

beforeEach(() => {
  state.run = {
    id: "run",
    projectId: "project",
    state: "running",
    reasonCode: null,
    finishedAt: null,
  };
  state.samples = [];
  vi.clearAllMocks();
});

function samples(measurements: MeasurementState[]) {
  state.samples = measurements.map((measurement, index) => ({
    id: `sample-${index}`,
    projectId: "project",
    runId: "run",
    attemptId: `attempt-${index}`,
    dispatch: index === measurements.length - 1 ? "claimed" : "terminal",
    measurement,
  }));
}

async function finish() {
  const sample = state.samples.at(-1);
  if (!sample) throw new Error("Missing sample fixture.");
  const input: PersistTrackingResultInput = {
    attemptId: sample.attemptId,
    expectedDispatch: "claimed",
    measurement: sample.measurement,
    evidence: {
      answerText: null,
      raw: null,
      answerTruncated: false,
      rawTruncated: false,
      searchResults: [],
      requestedLocale: null,
      effectiveLocale: null,
      localeMechanism: null,
      requestedModel: null,
      actualModel: null,
      providerStatus: null,
      observedAt: "2026-10-21T12:00:00Z",
      fetchedAt: "2026-10-21T12:00:00Z",
      recordedSource: "fresh",
    },
    citations: [],
    observations: [],
    receipt: { providerCostEntryId: null, amountUsd: null, state: "unknown" },
  };
  return persistTrackingResult("project", sample.id, input);
}

it.each(["running", "planned"] as const)(
  "finishes an all-unavailable %s run with a reason",
  async (initial) => {
    if (state.run) state.run.state = initial;
    samples(["unavailable", "unavailable"]);

    await finish();

    expect(state.run).toMatchObject({
      state: "blocked",
      reasonCode: "samples_unavailable",
      finishedAt: expect.any(Date),
    });
    expect(state.usage).toHaveBeenCalledExactlyOnceWith("run");
  },
);

it.each(["consent_stale", ""])(
  "preserves an existing blocked-run reason %j",
  async (reasonCode) => {
    if (state.run) state.run.reasonCode = reasonCode;
    samples(["unavailable", "unavailable"]);

    await finish();

    expect(state.run).toMatchObject({ state: "blocked", reasonCode, finishedAt: expect.any(Date) });
  },
);

it.each([
  { measurements: ["answer_present", "aio_not_present"], expected: "completed" },
  { measurements: ["answer_present", "unavailable"], expected: "partial" },
  { measurements: ["partial", "unavailable"], expected: "partial" },
  { measurements: ["failed", "unavailable"], expected: "failed" },
] satisfies { measurements: MeasurementState[]; expected: Run["state"] }[])(
  "keeps $expected runs and their reasons unchanged for $measurements",
  async ({ measurements, expected }) => {
    for (const reasonCode of [null, "consent_stale"]) {
      if (state.run) Object.assign(state.run, { state: "running", reasonCode, finishedAt: null });
      samples(measurements);

      await finish();

      expect(state.run).toMatchObject({
        state: expected,
        reasonCode,
        finishedAt: expect.any(Date),
      });
    }
  },
);

it.each(["cancelled", "completed", "partial", "failed", "blocked", "skipped"] as const)(
  "does not change an already %s run when its last sample finishes",
  async (initial) => {
    if (state.run) state.run.state = initial;
    samples(["unavailable", "unavailable"]);

    await finish();

    expect(state.run).toMatchObject({ state: initial, reasonCode: null, finishedAt: null });
    expect(state.usage).not.toHaveBeenCalled();
  },
);

it("does not finish or assign a reason while another sample remains in progress", async () => {
  samples(["unavailable", "unavailable"]);
  state.samples[0].dispatch = "claimed";

  await finish();

  expect(state.run).toMatchObject({ state: "running", reasonCode: null, finishedAt: null });
  expect(state.usage).not.toHaveBeenCalled();
});
