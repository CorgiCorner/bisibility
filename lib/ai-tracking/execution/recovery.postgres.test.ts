import type { CostReceipt, SamplePlan } from "@/lib/ai-tracking/contract";
import {
  isolatedTrackingDatabase,
  trackingProject,
} from "@/lib/ai-tracking/stores/fixtures.postgres-test-support";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return state.client;
  },
}));
vi.mock("@/lib/metering/entry-sync", () => ({
  beginUsageEntry: vi.fn(async () => undefined),
  syncUsageEntry: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: {
    reserve: vi.fn(async () => []),
    fence: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    acknowledge: vi.fn(async () => undefined),
  },
}));

import { TrackingDeadlineError } from "@/lib/ai-tracking/providers/dispatch-error";
import { createPrompt } from "@/lib/ai-tracking/stores/prompts";
import { planTrackingRun } from "@/lib/ai-tracking/stores/runs";
import {
  claimTrackingSample,
  getTrackingSample,
  persistTrackingResult,
  transitionTrackingSample,
} from "@/lib/ai-tracking/stores/samples";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { TrackingDispatchDeniedError, type TrackingExecutionPorts } from "./ports";
import { executeTrackingSample } from "./sample";

let database: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
let fixture: Awaited<ReturnType<typeof trackingProject>>;
beforeAll(async () => {
  database = await isolatedTrackingDatabase();
  state.client = database.client;
  fixture = await trackingProject(database.client, "execution-recovery");
}, 120000);
afterAll(async () => {
  if (database) await database.dispose();
});

async function planned(key: string) {
  const prompt = await createPrompt(fixture.project.id, { text: "Exact recovery prompt" });
  const run = await planTrackingRun(fixture.project.id, {
    actorId: fixture.project.ownerId,
    idempotencyKey: key,
    promptIds: [prompt.id],
    configurations: [
      {
        provider: "dataforseo",
        source: "model_api",
        engine: "chat_gpt",
        endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
        model: "gpt-test-model",
        parameters: { max_output_tokens: 512 },
      },
    ],
    credentialConnectionId: fixture.connection.id,
    credentialVersion: "immutable-version",
    budgetRevision: "budget",
    consentRevision: "consent",
    origin: "manual",
    entrySource: "api",
    deadline: "2027-01-01T00:00:00Z",
  });
  return run.samples[0].plan as unknown as SamplePlan;
}
function journal(plan: SamplePlan) {
  return createProviderRequestJournal(database.client, {
    attribution: {
      context: {
        correlationId: plan.attemptId,
        feature: "ai_tracking",
        projectId: plan.projectId,
        source: plan.entrySource,
        trigger: plan.origin,
      },
      tag: `tracking-fixture:${plan.attemptId}`,
    },
    connectionId: plan.credentialConnectionId,
    projectId: plan.projectId,
    provider: plan.provider,
    credentialVersion: plan.credentialVersion,
    queued: true,
    unit: "cents",
    estimate: { cents: "1.0200", units: "1" },
  });
}
function ports(plan: SamplePlan, submit: () => Promise<unknown>) {
  const result = {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        id: `task-${plan.attemptId}`,
        cost: 0,
        result: [
          {
            money_spent: 0.003,
            items: [{ type: "message", sections: [{ text: "A retained answer" }] }],
          },
        ],
      },
    ],
  };
  const value: TrackingExecutionPorts = {
    load: async () => {
      const sample = await getTrackingSample(plan.projectId, plan.sampleId);
      return sample
        ? {
            plan,
            dispatch: sample.dispatch,
            providerTaskId: sample.providerTaskId,
            receipt: sample.receipt as unknown as CostReceipt,
            cancelled: false,
          }
        : null;
    },
    claim: async () =>
      Boolean(await claimTrackingSample(plan.projectId, plan.sampleId, plan.attemptId)),
    transition: async (_plan, expectedDispatch, nextDispatch, providerTaskId, receipt) =>
      Boolean(
        await transitionTrackingSample(plan.projectId, plan.sampleId, {
          attemptId: plan.attemptId,
          expectedDispatch,
          nextDispatch,
          providerTaskId,
          receipt,
        }),
      ),
    prepare: async () => ({
      observer: journal(plan).observer,
      submit: async () => {
        await submit();
        return {
          status_code: 20000,
          tasks: [{ status_code: 20100, id: `task-${plan.attemptId}`, cost: 0.0102 }],
        };
      },
    }),
    collect: vi.fn(async () => result),
    settle: async (_plan, receipt, failed, taskId) =>
      journal(plan).observer.settle(receipt.providerCostEntryId ?? "missing", {
        cached: false,
        costCents: receipt.amountUsd === null ? null : Number(receipt.amountUsd) * 100,
        quantity: receipt.amountUsd === null ? null : 1,
        failed,
        providerRequestId: taskId,
      }),
    persist: vi.fn(async (_plan, input) =>
      Boolean(await persistTrackingResult(plan.projectId, plan.sampleId, input)),
    ),
  };
  return value;
}
it("replacement worker GET reuses real provider ledger and native proof after settlement-before-result crash", async () => {
  const plan = await planned("journal-recovery");
  const post = vi.fn(async () => undefined);
  const first = ports(plan, post);
  await executeTrackingSample(first, plan.projectId, plan.sampleId);
  const deposit = await database.client.providerCostEntry.findFirstOrThrow({
    where: { correlationId: plan.attemptId },
  });
  expect(deposit.costCents.toString()).toBe("1.02");
  vi.mocked(first.persist).mockRejectedValueOnce(new Error("crash after real journal settlement"));
  await expect(executeTrackingSample(first, plan.projectId, plan.sampleId)).rejects.toThrow(
    /crash/,
  );
  const proof = await database.client.meteringUsageEvidence.findUniqueOrThrow({
    where: { id: deposit.id },
  });
  const replacement = ports(plan, post);
  expect(await executeTrackingSample(replacement, plan.projectId, plan.sampleId)).toBe("terminal");
  expect(post).toHaveBeenCalledTimes(1);
  expect(first.collect).toHaveBeenCalledTimes(1);
  expect(replacement.collect).toHaveBeenCalledTimes(1);
  const entries = await database.client.providerCostEntry.findMany({
    where: { correlationId: plan.attemptId },
  });
  expect(entries).toHaveLength(1);
  expect(entries[0].id).toBe(deposit.id);
  expect(entries[0].costCents.toString()).toBe("0.32");
  expect(entries[0].usageQuantity?.toString()).toBe("1");
  expect(
    (await database.client.meteringUsageEvidence.findUniqueOrThrow({ where: { id: deposit.id } }))
      .proofVersion,
  ).toBe(proof.proofVersion);
  const retained = await getTrackingSample(plan.projectId, plan.sampleId);
  expect(retained?.providerCostEntryId).toBe(deposit.id);
  expect(retained?.dispatch).toBe("terminal");
});
it("ambiguous POST retains real unknown usage and replacement never repeats the paid call", async () => {
  const plan = await planned("journal-unknown");
  const post = vi.fn(async () => {
    throw new TypeError("response lost");
  });
  expect(await executeTrackingSample(ports(plan, post), plan.projectId, plan.sampleId)).toBe(
    "submission_unknown",
  );
  expect(await executeTrackingSample(ports(plan, post), plan.projectId, plan.sampleId)).toBe(
    "submission_unknown",
  );
  expect(post).toHaveBeenCalledTimes(1);
  const entries = await database.client.providerCostEntry.findMany({
    where: { correlationId: plan.attemptId },
  });
  expect(entries).toHaveLength(1);
  expect(entries[0].measurementStatus).toBe("unknown");
  await expect(journal(plan).observer.begin({ attemptKey: plan.attemptId })).rejects.toThrow(
    /Reconcile/,
  );
});
it.each(["revocation", "deadline"])(
  "%s after the barrier proves zero in the real journal without a POST",
  async (kind) => {
    const plan = await planned(`journal-${kind}`);
    const post = vi.fn(async () => undefined);
    const execution = ports(plan, post);
    execution.prepare = async () => ({
      observer: journal(plan).observer,
      submit: async () => {
        if (kind === "deadline") throw new TrackingDeadlineError();
        throw new TrackingDispatchDeniedError(new Error("Actor membership was revoked."));
      },
    });
    expect(await executeTrackingSample(execution, plan.projectId, plan.sampleId)).toBe("blocked");
    expect(post).not.toHaveBeenCalled();
    const entry = await database.client.providerCostEntry.findFirstOrThrow({
      where: { correlationId: plan.attemptId },
    });
    expect(entry.measurementStatus).toBe("recorded");
    expect(entry.costCents.toString()).toBe("0");
    expect(entry.usageQuantity?.toString()).toBe("0");
    const retained = await getTrackingSample(plan.projectId, plan.sampleId);
    expect(retained?.dispatch).toBe("terminal");
    expect(retained?.receipt).toEqual({
      providerCostEntryId: entry.id,
      amountUsd: "0",
      state: "confirmed",
    });
  },
);
it("a stale attempt or old dispatch state cannot advance a claimed sample", async () => {
  const plan = await planned("journal-stale-cas");
  await claimTrackingSample(plan.projectId, plan.sampleId, plan.attemptId);
  expect(
    await transitionTrackingSample(plan.projectId, plan.sampleId, {
      attemptId: "stale-attempt",
      expectedDispatch: "claimed",
      nextDispatch: "submission_started",
    }),
  ).toBeNull();
  expect((await getTrackingSample(plan.projectId, plan.sampleId))?.dispatch).toBe("claimed");
  expect(
    await transitionTrackingSample(plan.projectId, plan.sampleId, {
      attemptId: plan.attemptId,
      expectedDispatch: "planned",
      nextDispatch: "claimed",
    }),
  ).toBeNull();
});
