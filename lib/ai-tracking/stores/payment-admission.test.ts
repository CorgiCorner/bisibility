import { aiOwnPaymentQuote, readAiPaymentConsent } from "@/lib/ai-research/payment";
import type { SerpProvider } from "@/lib/providers/types";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlanTrackingRunInput } from "../contract";
import { planTrackingRun } from "./runs";
import { createSchedule } from "./schedules";

const state = vi.hoisted(() => ({
  runs: new Map<string, any>(),
  schedules: new Map<string, any>(),
  samples: vi.fn(),
}));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: async () => [],
    project: {
      findUnique: async () => ({ id: "project" }),
      findUniqueOrThrow: async () => ({
        id: "project",
        publicId: "prj_public",
        name: "Acme",
        domain: "acme.com",
      }),
    },
    providerConnection: { findFirst: async () => ({ id: "connection" }) },
    competitor: { findMany: async () => [] },
    aiPrompt: {
      findMany: async () => [
        {
          id: "prompt",
          archivedAt: null,
          pausedAt: null,
          topic: null,
          revisions: [{ id: "revision", text: "question", textHash: "hash", category: "neutral" }],
        },
      ],
    },
    aiTrackingRun: {
      findUnique: async ({ where }: any) =>
        where.id
          ? (state.runs.get(where.id) ?? null)
          : ([...state.runs.values()].find(
              (row) => row.idempotencyKey === where.projectId_idempotencyKey?.idempotencyKey,
            ) ?? null),
      findUniqueOrThrow: async ({ where }: any) => state.runs.get(where.id),
      create: async ({ data }: any) => {
        state.runs.set(data.id, data);
        return data;
      },
    },
    aiTrackingSample: { createMany: state.samples },
    aiTrackingSchedule: {
      findUnique: async ({ where }: any) => state.schedules.get(where.id) ?? null,
      create: async ({ data }: any) => {
        state.schedules.set(data.id, data);
        return data;
      },
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: any) => fn(tx) } };
});
beforeEach(() => {
  state.runs.clear();
  state.schedules.clear();
  vi.clearAllMocks();
});
const source = {
  project: { id: "project", ownerId: "owner" },
  connection: {
    id: "connection",
    publicId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
    provider: "dataforseo",
    credentialSource: "own" as const,
    credentialsEncrypted: "fictional-cipher",
  },
  provider: {
    id: "dataforseo",
    label: "DataForSEO",
    payment: { unit: { kind: "currency", code: "USD" }, basis: "provider_cost" },
  } as SerpProvider,
};
function input(scope: "manual" | "recurring"): PlanTrackingRunInput {
  const quote = aiOwnPaymentQuote({
    source,
    actorId: "actor",
    entrySource: "app",
    feature: "ai_tracking",
    definition: ["fixture"],
    scope,
    estimatedCostCents: 0.2,
  });
  return {
    actorId: "actor",
    idempotencyKey: "first",
    promptIds: ["prompt"],
    configurations: [
      {
        provider: "dataforseo",
        engine: "chat_gpt",
        source: "model_api",
        endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
        model: "gpt-4.1-mini",
        parameters: {},
      },
    ],
    credentialConnectionId: "connection",
    credentialVersion: "credential",
    budgetRevision: "budget",
    consentRevision: "consent",
    origin: "manual",
    entrySource: "app",
    deadline: new Date(Date.now() + 60000).toISOString(),
    paymentScope: scope,
    paymentConsent: quote.accept({ quoteToken: quote.payment.quoteToken }, true),
  };
}
it("does not admit a second manual run by changing only the idempotency key", async () => {
  const approved = input("manual");
  const run = await planTrackingRun("project", approved);
  await expect(
    planTrackingRun("project", { ...approved, idempotencyKey: "second" }),
  ).rejects.toThrow("payment_already_executed");
  expect(state.runs.size).toBe(1);
  expect(state.samples).toHaveBeenCalledTimes(1);
  const retained = readAiPaymentConsent(
    (run.launchPayload as { paymentConsent: unknown }).paymentConsent,
  );
  expect(retained.executionId).toBe(run.id);
});
it("makes replay of a new recurring admission one concrete schedule", async () => {
  const approved = {
    name: "Daily",
    cron: "0 7 * * *",
    timezone: "UTC",
    enabled: true,
    configuration: input("recurring"),
  };
  const first = await createSchedule("project", approved),
    again = await createSchedule("project", approved);
  expect(again.id).toBe(first.id);
  expect(state.schedules.size).toBe(1);
  const consent = readAiPaymentConsent(
    (first.configuration as { paymentConsent: unknown }).paymentConsent,
  );
  expect(consent.recurringScheduleId).toBe(first.id);
  expect(consent.executionId).toBeUndefined();
  await expect(createSchedule("project", { ...approved, cron: "0 8 * * *" })).rejects.toThrow(
    "payment_already_executed",
  );
});
