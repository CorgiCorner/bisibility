import { randomUUID } from "node:crypto";
import { payloadHash } from "@/lib/ai-tracking/identity";
import type { SuggestionGenerationPreview } from "@/lib/ai-tracking/suggestions/generation-schema";
import { requirePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedTrackingDatabase, trackingProject } from "./fixtures.postgres-test-support";

const mock = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return mock.client;
  },
}));

import type {
  GenerationEvidence,
  GenerationReceipt,
  GenerationResult,
} from "./generation-contract";
import { createPrompt, updatePrompt } from "./prompts";
import {
  claimSuggestionGeneration,
  getSuggestionGeneration,
  persistSuggestionGeneration,
  proveNoDispatch,
  recordGenerationUsageTag,
  startSuggestionGeneration,
  suggestionGenerationRequestHash,
} from "./suggestion-generations";

describe("durable generation data", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let a: Awaited<ReturnType<typeof trackingProject>>;
  let b: Awaited<ReturnType<typeof trackingProject>>;
  let preview: SuggestionGenerationPreview;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
    a = await trackingProject(db.client, "generation-a");
    b = await trackingProject(db.client, "generation-b");
    const inputSnapshot = {
      context: {
        business: "Business bytes\n",
        audience: "Audience",
        products: "Products",
        goals: "Goals",
        agentRules: "Rules",
      },
      competitors: [],
    };
    preview = {
      version: 1,
      inputSnapshot,
      snapshotHash: payloadHash(inputSnapshot),
      configuration: {
        provider: "dataforseo",
        engine: "chat_gpt",
        model: "fixture-model",
        languageCode: "en",
        maxOutputTokens: 256,
        advisoryCostLimitCents: 1,
      },
      estimatedCostCents: 0.1,
      estimateKind: "forecast",
      isGuaranteedMaximum: false,
      credentialConnectionId: requirePublicId(a.connection.publicId, "conn"),
      credentialVersion: "v1",
      budgetRevision: "b1",
      consentRevision: "c1",
      expiresAt: "2027-01-01T00:00:00Z",
      limitations: ["Hypothesis only"],
    };
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  const start = (key: string, value = preview, project = a) => {
    const input = {
      idempotencyKey: key,
      preview: value,
      actorId: project.project.ownerId,
      actorCredential: { id: "fixture-key", kind: "project_key" as const },
      entrySource: "api" as const,
    };
    return startSuggestionGeneration(project.project.id, {
      ...input,
      requestHash: suggestionGenerationRequestHash(input),
    });
  };
  it("serializes idempotency/claim and freezes reviewed context, actor and original attempt", async () => {
    const launched = await Promise.all([start("same"), start("same")]);
    expect(launched.filter((item) => item.created)).toHaveLength(1);
    const row = launched[0].row;
    expect(row.actorCredential).toEqual({ id: "fixture-key", kind: "project_key" });
    expect(await getSuggestionGeneration(b.project.id, row.publicId)).toBeNull();
    await expect(
      start("same", { ...preview, configuration: { ...preview.configuration, model: "other" } }),
    ).rejects.toThrow("conflict");
    await expect(
      db.client.aiTrackingSuggestionGeneration.update({
        where: { id: row.id },
        data: { preview: { changed: true } },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      db.client.aiTrackingSuggestionGeneration.update({
        where: { id: row.id },
        data: { actorId: b.project.ownerId },
      }),
    ).rejects.toThrow("immutable");
    const claims = await Promise.all([
      claimSuggestionGeneration(a.project.id, row.id, row.attemptId),
      claimSuggestionGeneration(a.project.id, row.id, row.attemptId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(start("other-key")).rejects.toThrow("unresolved");
    await proveNoDispatch(a.project.id, row.id, {
      attemptId: row.attemptId,
      expectedState: "claimed",
      reason: "Fixture declined before native admission",
    });
    expect((await start("same")).row.state).toBe("failed");
    expect(await claimSuggestionGeneration(a.project.id, row.id, row.attemptId)).toBeNull();
  });
  it("rejects foreign receipts and retains bounded result, unknown barrier and edited provenance", async () => {
    const row = (await start("paid")).row;
    await claimSuggestionGeneration(a.project.id, row.id, row.attemptId);
    const foreign = await db.client.providerCostEntry.create({
      data: {
        projectId: b.project.id,
        connectionId: b.connection.id,
        feature: "ai_tracking",
        costCents: 0,
        measurementStatus: "unknown",
      },
    });
    await expect(
      db.client.aiTrackingSuggestionGeneration.update({
        where: { id: row.id },
        data: { providerCostEntryId: foreign.id },
      }),
    ).rejects.toThrow();
    await expect(
      recordGenerationUsageTag(a.project.id, row.id, {
        attemptId: row.attemptId,
        expectedState: "claimed",
        usageTag: "foreign",
        receipt: {
          providerCostEntryId: foreign.id,
          connectionId: a.connection.id,
          credentialVersion: "v1",
          amountUsd: null,
          state: "unknown",
        },
      }),
    ).rejects.toThrow("receipt");
    const ledger = await db.client.providerCostEntry.create({
      data: {
        projectId: a.project.id,
        connectionId: a.connection.id,
        feature: "ai_tracking",
        costCents: 0,
        measurementStatus: "unknown",
        correlationId: row.publicId,
      },
    });
    const receipt: GenerationReceipt = {
      providerCostEntryId: ledger.id,
      connectionId: a.connection.id,
      credentialVersion: "v1",
      amountUsd: null,
      state: "unknown",
    };
    expect(
      await recordGenerationUsageTag(a.project.id, row.id, {
        attemptId: row.attemptId,
        expectedState: "claimed",
        usageTag: "fixture-usage",
        receipt,
      }),
    ).toMatchObject({ state: "submission_started", providerCostEntryId: ledger.id });
    expect(
      await recordGenerationUsageTag(a.project.id, row.id, {
        attemptId: row.attemptId,
        expectedState: "claimed",
        usageTag: "replay",
        receipt,
      }),
    ).toBeNull();
    await expect(
      proveNoDispatch(a.project.id, row.id, {
        attemptId: row.attemptId,
        expectedState: "submission_started",
        reason: "Unproven",
      }),
    ).rejects.toThrow("proof");
    const draftId = randomUUID();
    const result: GenerationResult = {
      generationId: row.publicId,
      drafts: [
        {
          draftId,
          text: "Original generated draft\n",
          category: "neutral",
          provenance: "model_generated_hypothesis",
          evidenceIds: [],
          popularity: null,
          accepted: false,
        },
      ],
      costUsd: null,
      costState: "unknown",
      method: "model_generated_hypothesis",
      limitations: ["No measured popularity"],
    };
    const evidence: GenerationEvidence = {
      inputSnapshot: preview.inputSnapshot,
      snapshotHash: preview.snapshotHash,
      configuration: preview.configuration,
      requestedModel: "fixture-model",
      actualModel: "actual-model",
      providerRequestId: "fixture-request",
      answer: "é".repeat(200000),
      credentialVersion: "v1",
      budgetRevision: "b1",
      consentRevision: "c1",
    };
    const completed = await persistSuggestionGeneration(a.project.id, row.id, {
      attemptId: row.attemptId,
      expectedState: "submission_started",
      state: "completed",
      result,
      evidence,
      receipt,
    });
    expect(completed?.state).toBe("completed");
    expect(completed?.evidence).toMatchObject({
      answerTruncated: true,
      actualModel: "actual-model",
    });
    expect(
      Buffer.byteLength((completed?.evidence as { answer: string } | undefined)?.answer ?? ""),
    ).toBeLessThanOrEqual(256 * 1024);
    await expect(start("unknown-new-key")).rejects.toThrow("unresolved");
    await expect(
      db.client.aiTrackingSuggestionGeneration.update({
        where: { id: row.id },
        data: { result: { drafts: [] } },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      createPrompt(b.project.id, {
        text: "Foreign",
        generationReference: { generationId: row.publicId, draftId },
      }),
    ).rejects.toThrow("generation");
    await expect(
      createPrompt(a.project.id, {
        text: "Fake draft",
        generationReference: { generationId: row.publicId, draftId: randomUUID() },
      }),
    ).rejects.toThrow("draft");
    const accepted = await createPrompt(a.project.id, {
      text: "Edited acceptance bytes\n",
      category: "comparative",
      generationReference: { generationId: row.publicId, draftId },
    });
    const edited = await updatePrompt(a.project.id, accepted.id, {
      text: "Edited later\n",
      category: "branded",
    });
    for (const revision of edited.revisions)
      expect(revision).toMatchObject({
        generationId: row.id,
        generationDraftId: draftId,
        provenance: {
          method: "model_generated_hypothesis",
          originalDraft: { text: "Original generated draft\n" },
          measuredPopularity: null,
        },
      });
    expect(await db.client.aiTrackingSample.count({ where: { projectId: a.project.id } })).toBe(0);
    await expect(
      db.client.aiPromptRevision.update({
        where: { id: edited.revisions[0].id },
        data: { provenance: {} },
      }),
    ).rejects.toThrow("immutable");
    await db.client.providerCostEntry.update({
      where: { id: ledger.id },
      data: { measurementStatus: "recorded", costCents: "0.1" },
    });
    expect((await start("settled-new-key")).created).toBe(true);
  });
});
