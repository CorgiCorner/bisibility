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

import {
  claimSuggestionGeneration,
  persistSuggestionGeneration,
  reconcileSuggestionGeneration,
  recordGenerationUsageTag,
  startSuggestionGeneration,
  suggestionGenerationRequestHash,
} from "./suggestion-generations";

describe("original native generation receipt reconciliation", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  async function fixture(unknown = true, nativeVersion = "original-v1") {
    const project = await trackingProject(db.client, `reconcile-${randomUUID()}`);
    const inputSnapshot = {
      context: { business: "B", audience: "A", products: "P", goals: "G", agentRules: "R" },
      competitors: [],
    };
    const preview: SuggestionGenerationPreview = {
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
      credentialConnectionId: requirePublicId(project.connection.publicId, "conn"),
      credentialVersion: "original-v1",
      budgetRevision: "b1",
      consentRevision: "c1",
      expiresAt: "2027-01-01T00:00:00Z",
      limitations: [],
    };
    const input = {
      preview,
      actorId: project.project.ownerId,
      actorCredential: { kind: "project_key" as const, id: "original-key" },
      entrySource: "api" as const,
    };
    const start = (idempotencyKey: string) =>
      startSuggestionGeneration(project.project.id, {
        ...input,
        idempotencyKey,
        requestHash: suggestionGenerationRequestHash(input),
      });
    const row = (await start("original")).row;
    await claimSuggestionGeneration(project.project.id, row.id, row.attemptId);
    const identity = {
      id: randomUUID(),
      projectId: project.project.id,
      connectionId: project.connection.id,
      provider: "dataforseo",
      feature: "ai_tracking" as const,
      source: "api",
      credentialKind: "project_key",
      credentialId: "original-key",
      correlationId: row.attemptId,
    };
    const ledger = await db.client.providerCostEntry.create({
      data: { ...identity, tag: "original-usage-tag", costCents: 0, measurementStatus: "unknown" },
    });
    await db.client.meteringUsageEvidence.create({
      data: {
        ...identity,
        principal: project.project.ownerId,
        unit: "cents",
        estimate: { credentialVersion: nativeVersion },
        createdAt: new Date(),
      },
    });
    const receipt = {
      providerCostEntryId: ledger.id,
      connectionId: project.connection.id,
      credentialVersion: "original-v1",
      amountUsd: null,
      state: "unknown" as const,
    };
    await recordGenerationUsageTag(project.project.id, row.id, {
      attemptId: row.attemptId,
      expectedState: "claimed",
      usageTag: "original-usage-tag",
      receipt,
    });
    if (unknown)
      await persistSuggestionGeneration(project.project.id, row.id, {
        attemptId: row.attemptId,
        expectedState: "submission_started",
        state: "submission_unknown",
        receipt,
        evidence: {
          inputSnapshot,
          snapshotHash: preview.snapshotHash,
          configuration: preview.configuration,
          credentialVersion: "original-v1",
          budgetRevision: "b1",
          consentRevision: "c1",
          requestedModel: "fixture-model",
          actualModel: null,
          providerRequestId: null,
          answer: "Retained ambiguous response",
          raw: { original: true },
        },
      });
    return { ...project, start, row, ledger };
  }
  it("closes only the original confirmed native receipt, preserves evidence and permits a fresh explicit key", async () => {
    const f = await fixture();
    const before = await db.client.aiTrackingSuggestionGeneration.findUniqueOrThrow({
      where: { id: f.row.id },
    });
    expect(await reconcileSuggestionGeneration(f.project.id, f.row.id)).toBeNull();
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: {
        measurementStatus: "recorded",
        costCents: "0.1234",
        providerRequestId: "confirmed-original",
      },
    });
    const other = await trackingProject(db.client, `foreign-${randomUUID()}`);
    expect(await reconcileSuggestionGeneration(other.project.id, f.row.id)).toBeNull();
    const after = await reconcileSuggestionGeneration(f.project.id, f.row.id);
    expect(after).toMatchObject({
      state: "failed",
      providerCostEntryId: f.ledger.id,
      receipt: {
        state: "confirmed",
        amountUsd: "0.001234",
        credentialVersion: "original-v1",
        providerCostEntryId: f.ledger.id,
      },
    });
    expect(after?.evidence).toEqual(before.evidence);
    expect(after?.result).toEqual(before.result);
    expect(after?.actualModel).toEqual(before.actualModel);
    expect(await f.start("original")).toMatchObject({ created: false, row: { state: "failed" } });
    expect((await f.start("fresh-explicit-key")).created).toBe(true);
    expect(await db.client.aiTrackingRun.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it("blocks forged credential/version/feature substitutions and automatically reconciles only verified native identity", async () => {
    const f = await fixture();
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: { measurementStatus: "recorded", credentialId: "other-key" },
    });
    expect(await reconcileSuggestionGeneration(f.project.id, f.row.id)).toBeNull();
    await expect(f.start("blocked-new-key")).rejects.toMatchObject({
      status: 409,
      reason: "usage_reconciliation_required",
    });
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: { credentialId: "original-key", feature: "ranked_keywords" },
    });
    expect(await reconcileSuggestionGeneration(f.project.id, f.row.id)).toBeNull();
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: { feature: "ai_tracking" },
    });
    await expect(
      db.client.meteringUsageEvidence.update({
        where: { id: f.ledger.id },
        data: { estimate: { credentialVersion: "different-version" } },
      }),
    ).rejects.toThrow("immutable");
    expect((await f.start("verified-new-key")).created).toBe(true);
    expect(
      await db.client.aiTrackingSuggestionGeneration.findUnique({ where: { id: f.row.id } }),
    ).toMatchObject({ state: "failed" });
  });
  it("refuses a confirmed ledger whose native credential version differs from frozen consent", async () => {
    const f = await fixture(true, "different-version");
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: { measurementStatus: "recorded", costCents: 1 },
    });
    expect(await reconcileSuggestionGeneration(f.project.id, f.row.id)).toBeNull();
    await expect(f.start("different-version-new-key")).rejects.toMatchObject({ status: 409 });
  });
  it("keeps active submission_started blocked even if its ledger has a known receipt", async () => {
    const f = await fixture(false);
    await db.client.providerCostEntry.update({
      where: { id: f.ledger.id },
      data: { measurementStatus: "recorded", costCents: 1 },
    });
    expect(await reconcileSuggestionGeneration(f.project.id, f.row.id)).toBeNull();
    await expect(f.start("active-new-key")).rejects.toMatchObject({ status: 409 });
    expect(
      await db.client.aiTrackingSuggestionGeneration.findUnique({ where: { id: f.row.id } }),
    ).toMatchObject({ state: "submission_started" });
  });
});
