import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionBindingFixture } from "@/lib/measurement-definitions/fixtures";
import { encryptSecret } from "@/lib/providers/crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { rankRecoveryContext } from "./recovery-context";
import { decodeRankResult } from "./recovery-evidence";
import { restoreRetainedRankResult } from "./recovery-restore";

const sideEffects = vi.hoisted(() => ({ audit: vi.fn(), item: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: sideEffects.audit,
  requiredPublicAuditId: (value: string) => value,
}));
vi.mock("@/lib/metering/recovery/tokens", () => ({ recoveryInstance: () => "test-instance" }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test-namespace" }));
vi.mock("@/lib/queries/rank-check-run-accounting", () => ({
  rankCheckLedgerActuals: async () => new Map(),
  ledgerActualCostCents: () => null,
  ledgerActualUnits: () => null,
}));
vi.mock("./recovery-run-item", () => ({ recoverRunItem: sideEffects.item }));

beforeEach(() => vi.clearAllMocks());
const now = new Date("2026-10-13T12:00:00Z");
function fixture(bindingId: string | null | undefined) {
  const binding = definitionBindingFixture();
  const keyword = {
    id: binding.keywordId,
    publicId: "kw_synthetic",
    projectId: binding.projectId,
    text: binding.source.target.text,
    device: binding.source.target.device,
    locationRef: { id: binding.source.target.locationId, languageCode: "en" },
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    archivedAt: null,
    project: { domain: binding.source.target.domain ?? "" },
  };
  const body = JSON.stringify({
    version: 1,
    contextHash: rankRecoveryContext(
      {
        ...keyword,
        domain: keyword.project.domain,
        location: keyword.locationRef,
        revision: keyword.updatedAt,
      },
      100,
    ),
    target: {
      keywordId: binding.keywordId,
      projectId: binding.projectId,
      queuedTaskId: null,
      expectedUrlAtCheck: binding.request.targetUrl,
      attempts: [],
    },
    result: {
      definitionBindingId: bindingId,
      rankCheck: {
        keywordId: binding.keywordId,
        provider: binding.request.providerId,
        checkedAt: "2026-10-13T10:00:00Z",
        requestedDepth: 100,
        position: 3,
        previousPosition: null,
        rankingUrl: binding.request.targetUrl,
        normalizationVersion: "v1",
        organicRanks: null,
        raw: null,
        billingUnits: null,
        costCents: null,
        estimatedCostCents: null,
        observation: {
          provider: binding.request.providerId,
          surface: "web_serp",
          engine: "google",
          completeness: "unknown",
          configuredScope: frozenConfiguredScope(binding.source.target),
          effectiveScope: null,
          items: [],
          executedAt: "2026-10-13T10:00:00Z",
          requestPolicy: {
            depth: 100,
            stopOnMatch: true,
            forcedAiOverview: false,
            evidence: {
              version: 1,
              adapterVersion: binding.request.adapterVersion,
              targetRevision: "untrusted-current-target",
              policyRevision: "untrusted-current-policy",
              observedAt: null,
              requestedAt: null,
              completeThrough: { organic_result: null },
            },
          },
        },
      },
    },
  });
  const evidence = {
    schemaVersion: 1,
    identityHash: createHash("sha256").update(body).digest("hex"),
    payloadEncrypted: encryptSecret(body),
    namespace: "test-namespace",
    instanceId: "test-instance",
    createdAt: new Date("2026-10-13T10:00:00Z"),
    expiresAt: new Date("2026-10-14T10:00:00Z"),
  };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (!sql.includes("measurement_execution_bindings")) return [];
      if (sql.includes("LIMIT 1")) return [{ id: binding.id }];
      return values[0] === binding.id ? [binding] : [];
    }),
    rankCheck: {
      findUnique: vi.fn(async () => ({
        keywordId: binding.keywordId,
        publicId: "check_synthetic",
        requestedDepth: 100,
        status: "failed",
        keyword,
        run: null,
        queuedTask: null,
        recoveryResult: evidence,
      })),
      update: vi.fn(),
    },
    keyword: { findUniqueOrThrow: vi.fn(async () => keyword) },
    observationRun: { create: vi.fn(async () => ({ id: "restored-observation" })) },
    rankCheckResultEvidence: { delete: vi.fn(), update: vi.fn() },
  };
  return { binding, evidence, tx };
}

it("restores the encrypted original winning binding through the actual observation guard", async () => {
  const { binding, evidence, tx } = fixture("synthetic-binding-a");
  expect(decodeRankResult(evidence).result.definitionBindingId).toBe(binding.id);
  await expect(
    restoreRetainedRankResult(
      tx as unknown as Prisma.TransactionClient,
      binding.owner.rankCheckId,
      null,
      now,
    ),
  ).resolves.toBe(true);
  expect(tx.observationRun.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      definitionBindingId: binding.id,
      requestPolicy: expect.objectContaining({
        evidence: expect.objectContaining({
          targetRevision: binding.targetRevision,
          policyRevision: binding.policyRevision,
          observedAt: null,
        }),
      }),
    }),
  });
  expect(tx.rankCheckResultEvidence.delete).toHaveBeenCalledOnce();
  expect(sideEffects.item).toHaveBeenCalledOnce();
});
it.each([undefined, null, "foreign-binding"])(
  "refuses missing or foreign original binding %s without consuming evidence",
  async (bindingId) => {
    const { binding, tx } = fixture(bindingId);
    await expect(
      restoreRetainedRankResult(
        tx as unknown as Prisma.TransactionClient,
        binding.owner.rankCheckId,
        null,
        now,
      ),
    ).rejects.toThrow(/winning measurement attempt|Original measurement binding/);
    expect(tx.observationRun.create).not.toHaveBeenCalled();
    expect(tx.rankCheckResultEvidence.delete).not.toHaveBeenCalled();
    expect(sideEffects.item).not.toHaveBeenCalled();
    expect(sideEffects.audit).not.toHaveBeenCalled();
  },
);
