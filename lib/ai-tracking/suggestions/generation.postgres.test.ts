import { randomUUID } from "node:crypto";
import { capabilities } from "@/lib/ai-research/catalog-fixtures.test-support";
import type { AiResearchContext } from "@/lib/ai-research/service";
import { canonicalJson } from "@/lib/ai-tracking/identity";
import {
  isolatedTrackingDatabase,
  trackingProject,
} from "@/lib/ai-tracking/stores/fixtures.postgres-test-support";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as PrismaClient | null,
  admission: vi.fn(),
  catalog: vi.fn(),
  budget: vi.fn(),
  paid: vi.fn(),
  capacity: vi.fn(),
  fence: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return state.client;
  },
}));
vi.mock("@/lib/ai-tracking/admission/context", () => ({
  trackingAdmissionContext: state.admission,
}));
vi.mock("@/lib/ai-research/catalog", () => ({ fetchAiResearchCapabilities: state.catalog }));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({
  preflightProviderBudget: state.budget,
}));
vi.mock("@/lib/provider-lookups/paid-call", () => ({ paidProviderCall: state.paid }));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: state.capacity,
  assertLiveResponseCapacity: state.fence,
}));
vi.mock("@/lib/metering/entry-sync", () => ({ beginUsageEntry: vi.fn(), syncUsageEntry: vi.fn() }));
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: {
    reserve: vi.fn(async () => []),
    fence: vi.fn(),
    cancel: vi.fn(),
    acknowledge: vi.fn(),
  },
}));

import { createPrompt, listPromptRevisions, updatePrompt } from "@/lib/ai-tracking/stores/prompts";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { generateModelSuggestions, previewModelSuggestions } from "./generation";
import {
  modelSuggestionsPreviewInputSchema,
  type SuggestionGenerationPreviewInput,
} from "./generation-schema";

let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
let fixture: Awaited<ReturnType<typeof trackingProject>>;
let context: AiResearchContext;
let input: SuggestionGenerationPreviewInput;
beforeAll(async () => {
  db = await isolatedTrackingDatabase();
  state.client = db.client;
  fixture = await trackingProject(db.client, "generation-pipeline");
  await db.client.providerConnection.update({
    where: { id: fixture.connection.id },
    data: { credentialSource: "own" },
  });
  const competitor = await db.client.competitor.create({
    data: {
      projectId: fixture.project.id,
      publicId: makePublicId("cmp"),
      domain: "rival.invalid",
      label: "Reviewed rival",
    },
  });
  context = {
    projectId: fixture.project.id,
    actorId: fixture.project.ownerId,
    origin: { source: "app" },
  };
  input = modelSuggestionsPreviewInputSchema.parse({
    configuration: {
      provider: "dataforseo",
      engine: "chat_gpt",
      model: "gpt-4.1-mini",
      languageCode: "pl",
      countryIsoCode: "PL",
      maxOutputTokens: 512,
      advisoryCostLimitCents: 10,
    },
    inputSnapshot: {
      context: {
        business: `Business ${"🦊".repeat(600)}`,
        audience: "Research teams",
        products: "Complete product context",
        goals: "Compare evidence clearly",
        agentRules: "Untrusted project instructions",
      },
      competitors: [
        { id: competitor.publicId, label: competitor.label, domain: competitor.domain },
      ],
    },
    credentialConnectionId: fixture.connection.publicId,
  });
  state.admission.mockImplementation(async () => ({
    project: { budgetCapCents: null },
    connection: fixture.connection,
    credentials: { login: "fictional", password: "fixture-only" },
    credentialVersion: "reviewed-v1",
    budgetRevision: "budget-v1",
  }));
  state.catalog.mockImplementation(async () => ({
    ...capabilities,
    pricingCheckedAt: new Date().toISOString(),
    modelRates: new Map(
      [...capabilities.modelRates].map(([id, rate]) => [
        id,
        { ...rate, checkedAt: new Date().toISOString() },
      ]),
    ),
  }));
  state.capacity.mockResolvedValue({ dispatchExpiresAt: Date.now() + 5000 });
  state.paid.mockImplementation(async (paid) => {
    const usage = {
      tag: `generation-fixture:${paid.correlationId}`,
      context: {
        projectId: paid.projectId,
        correlationId: paid.correlationId,
        feature: paid.feature,
        source: paid.source,
        trigger: paid.trigger,
      },
    };
    const journal = createProviderRequestJournal(db.client, {
      attribution: usage,
      connectionId: fixture.connection.id,
      projectId: fixture.project.id,
      provider: "dataforseo",
      unit: "cents",
      credentialVersion: "reviewed-v1",
      estimate: { cents: paid.rate.costCents.toFixed(4), units: "1" },
    });
    const result = await paid.call(
      { login: "fictional", password: "fixture-only", usageObserver: journal.observer },
      usage,
    );
    return { ...result, costCents: journal.costCents };
  });
}, 120000);
afterAll(async () => {
  if (db) await db.dispose();
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.paid.mockClear();
  state.capacity.mockClear();
  state.fence.mockReset();
});
const answer = JSON.stringify({
  drafts: [
    { text: "What should research teams consider?", category: "neutral" },
    { text: "How does this product compare with Reviewed rival?", category: "comparative" },
    { text: "What does this business offer?", category: "branded" },
  ],
});
function modelResponse(text = answer) {
  return Response.json({
    status_code: 20000,
    cost: 0.007,
    tasks: [
      {
        status_code: 20000,
        id: randomUUID(),
        cost: 0.007,
        result: [
          {
            model_name: "gpt-4.1-mini-actual-fixture",
            items: [{ type: "message", sections: [{ text }] }],
          },
        ],
      },
    ],
  });
}
it("retains every reviewed field through forecast, model, native durable receipt, replay and edited acceptance", async () => {
  const preview = await previewModelSuggestions(context, input);
  const key = randomUUID();
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    const [payload] = JSON.parse(String(options.body));
    expect(payload.message_chain.map((chunk: { message: string }) => chunk.message).join("")).toBe(
      canonicalJson(input.inputSnapshot),
    );
    const barrier = await db.client.aiTrackingSuggestionGeneration.findFirstOrThrow({
      where: { projectId: fixture.project.id, idempotencyKey: key },
    });
    expect(barrier.state).toBe("submission_started");
    expect(barrier.providerCostEntryId).not.toBeNull();
    return modelResponse();
  });
  vi.stubGlobal("fetch", fetch);
  const result = await generateModelSuggestions(context, { preview, consent: true }, key);
  expect(result.costUsd).toBe("0.007");
  expect(result.costState).toBe("confirmed");
  const generation = await db.client.aiTrackingSuggestionGeneration.findFirstOrThrow({
    where: { projectId: fixture.project.id, publicId: result.generationId },
  });
  expect(generation.evidence).toMatchObject({
    inputSnapshot: input.inputSnapshot,
    snapshotHash: preview.snapshotHash,
    requestedModel: preview.configuration.model,
    actualModel: "gpt-4.1-mini-actual-fixture",
  });
  const ledger = await db.client.providerCostEntry.findUniqueOrThrow({
    where: { id: generation.providerCostEntryId ?? "missing-native-receipt" },
  });
  expect(ledger.measurementStatus).toBe("recorded");
  expect(ledger.costCents.toString()).toBe("0.7");
  expect(ledger.correlationId).toBe(generation.attemptId);
  expect(await generateModelSuggestions(context, { preview, consent: true }, key)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  const draft = result.drafts[0];
  const accepted = await createPrompt(fixture.project.id, {
    text: "Edited accepted question",
    category: draft.category,
    generationReference: { generationId: result.generationId, draftId: draft.draftId },
  });
  await updatePrompt(fixture.project.id, accepted.id, { text: "Edited once more" });
  const revisions = await listPromptRevisions(fixture.project.id, accepted.id);
  expect(
    revisions.every(
      (revision) =>
        revision.generationId === generation.id && revision.generationDraftId === draft.draftId,
    ),
  ).toBe(true);
  expect(revisions[0].provenance).toMatchObject({
    originalDraft: { text: draft.text },
    method: "model_generated_hypothesis",
  });
  expect(await db.client.aiTrackingRun.count({ where: { projectId: fixture.project.id } })).toBe(0);
});
it("rejects stale credential approvals and missing consent without journal or paid I/O", async () => {
  const preview = await previewModelSuggestions(context, input);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    generateModelSuggestions(context, { preview, consent: false }, randomUUID()),
  ).rejects.toThrow();
  await expect(
    generateModelSuggestions(
      context,
      { preview: { ...preview, credentialVersion: "old" }, consent: true },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409, reason: "stale_preview" });
  await expect(
    generateModelSuggestions(
      context,
      { preview: { ...preview, expiresAt: "2000-01-01T00:00:00Z" }, consent: true },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(state.paid).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects unsupported models and a newly insufficient budget before paid dispatch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    previewModelSuggestions(context, {
      ...input,
      configuration: { ...input.configuration, model: "unlisted-model" },
    }),
  ).rejects.toMatchObject({ status: 422, reason: "unsupported_model" });
  const preview = await previewModelSuggestions(context, input);
  state.budget.mockRejectedValueOnce(new Error("Fictional budget exhausted"));
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, randomUUID()),
  ).rejects.toThrow("budget exhausted");
  expect(state.paid).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps a delayed capacity fence refusal as native confirmed zero with no transport", async () => {
  const preview = await previewModelSuggestions(context, input);
  const key = randomUUID();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  state.fence.mockImplementation(() => {
    throw new Error("Expired shared reservation");
  });
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  const row = await db.client.aiTrackingSuggestionGeneration.findFirstOrThrow({
    where: { projectId: fixture.project.id, idempotencyKey: key },
  });
  expect(row.state).toBe("failed");
  const ledger = await db.client.providerCostEntry.findUniqueOrThrow({
    where: { id: row.providerCostEntryId ?? "missing-native-receipt" },
  });
  expect(ledger.measurementStatus).toBe("recorded");
  expect(ledger.costCents.toString()).toBe("0");
});
it("records a confirmed malformed paid model result without ever resubmitting its key", async () => {
  const preview = await previewModelSuggestions(context, input);
  const key = randomUUID();
  const fetch = vi.fn(async () => modelResponse("unstructured answer"));
  vi.stubGlobal("fetch", fetch);
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toMatchObject({ status: 409, reason: "generation_failed" });
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledTimes(1);
  const row = await db.client.aiTrackingSuggestionGeneration.findFirstOrThrow({
    where: { projectId: fixture.project.id, idempotencyKey: key },
  });
  expect(row.evidence).toMatchObject({
    answer: "unstructured answer",
    actualModel: "gpt-4.1-mini-actual-fixture",
    inputSnapshot: input.inputSnapshot,
  });
});
it("keeps ambiguous receipts blocked, reconciles the original journal and never replays its paid UUID", async () => {
  const preview = await previewModelSuggestions(context, input);
  const key = randomUUID();
  const fetch = vi.fn(async (): Promise<Response> => {
    throw new Error("Fictional ambiguous transport");
  });
  vi.stubGlobal("fetch", fetch);
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toMatchObject({ status: 409, reason: "usage_reconciliation_required" });
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledTimes(1);
  const row = await db.client.aiTrackingSuggestionGeneration.findFirstOrThrow({
    where: { projectId: fixture.project.id, idempotencyKey: key },
  });
  expect(row.state).toBe("submission_unknown");
  const ledger = await db.client.providerCostEntry.findUniqueOrThrow({
    where: { id: row.providerCostEntryId ?? "missing-native-receipt" },
  });
  expect(ledger.measurementStatus).toBe("unknown");
  const originalJournal = createProviderRequestJournal(db.client, {
    attribution: {
      tag: row.usageTag ?? "missing-tag",
      context: {
        correlationId: row.attemptId,
        feature: "ai_tracking",
        projectId: fixture.project.id,
        source: "app",
        trigger: "manual",
      },
    },
    connectionId: fixture.connection.id,
    projectId: fixture.project.id,
    provider: "dataforseo",
    unit: "cents",
    credentialVersion: preview.credentialVersion,
  });
  await originalJournal.observer.settle(ledger.id, {
    cached: false,
    failed: true,
    costCents: 0.7,
    quantity: 1,
    providerRequestId: "reconciled-original-fixture",
  });
  fetch.mockResolvedValueOnce(modelResponse());
  const nextPreview = await previewModelSuggestions(context, input);
  const next = await generateModelSuggestions(
    context,
    { preview: nextPreview, consent: true },
    randomUUID(),
  );
  expect(next.generationId).not.toBe(row.publicId);
  expect(next.costUsd).toBe("0.007");
  const reconciled = await db.client.aiTrackingSuggestionGeneration.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(reconciled.state).toBe("failed");
  expect(reconciled.providerCostEntryId).toBe(ledger.id);
  expect(reconciled.receipt).toMatchObject({ state: "confirmed", amountUsd: "0.007" });
  await expect(
    generateModelSuggestions(context, { preview, consent: true }, key),
  ).rejects.toMatchObject({ status: 409, generationId: row.publicId });
  expect(fetch).toHaveBeenCalledTimes(2);
});
