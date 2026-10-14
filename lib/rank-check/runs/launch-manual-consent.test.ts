import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSelectionSpec } from "./selection";

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  assertOperationAccess: vi.fn(),
  assertProviderAllocationAvailable: vi.fn(),
  connect: vi.fn(),
  estimatedCost: vi.fn(),
  lockSelectionRows: vi.fn(),
  loadProviderChain: vi.fn(),
  publishWorkerIntent: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  },
  resolveSelection: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    auditLog: { create: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { create: vi.fn(), findUnique: vi.fn() },
    rankCheckRunItem: { createMany: vi.fn() },
  },
  verifyToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-manual-consent-key-012345")],
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: mocks.assertOperationAccess,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudgetAvailable,
  isBudgetExhaustedError: (error: { code?: string }) => error?.code === "budget_exhausted",
}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError: class extends Error {},
}));
vi.mock("@/lib/rank-check/default-cost", () => ({
  estimatedRankCheckCostCents: mocks.estimatedCost,
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: mocks.publishWorkerIntent,
}));
vi.mock("@temporalio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@temporalio/client")>();
  return { ...actual, Connection: { ...actual.Connection, connect: mocks.connect } };
});
vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    lockRunSelectionKeywords: mocks.lockSelectionRows,
    resolveRunSelection: mocks.resolveSelection,
  };
});
vi.mock("./preview-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./preview-token")>();
  return { ...actual, verifyPreviewToken: mocks.verifyToken };
});

vi.mock("@/lib/measurement-definitions/host-policy-snapshot", async () => {
  const { hostDefinitionAdapters } = await import("@/lib/measurement-definitions/host-adapters");
  const { RANK_REPORT_CALENDAR_CONFIGURATION } = await import("@/lib/rank-reports/host-policy");
  return {
    readHostPolicySnapshot: async () => ({
      state: "ready",
      policyEpoch: "1",
      config: {
        version: 1,
        definitionVersion: "web-organic-v1",
        forcedAiOverview: false,
        adapters: hostDefinitionAdapters(),
        freshness: {
          configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
          manualTtlMs: null,
          cadenceGraceMs: null,
        },
      },
    }),
  };
});
vi.mock("@/lib/measurement-definitions/worker-intent", () => ({
  captureDefinitionItemIntents: vi.fn(async () => new Map()),
}));

import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { verifiedManualConsent } from "@/lib/measurement-settings/host/reviewed-consent";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { launchRankCheckRun } from "./launch";

const project = { domain: "example.com", id: "project_1", isSample: false };
const spec: RunSelectionSpec = {
  kind: "selected" as const,
  keywordIds: ["kw_abcdefghijklmnopqrstuvwx", "kw_bcdefghijklmnopqrstuvwxy"],
  v: 1 as const,
};
const input = {
  actorId: "user_1",
  idempotencyKey: "request-0001",
  origin: APP_REQUEST_ORIGIN,
  previewToken: "signed-token",
  project,
  spec,
  trigger: "manual" as const,
};

function keyword(id: string, text: string, status = "completed") {
  return {
    archivedAt: null as Date | null,
    id,
    locationId: "location_active",
    queuedRankCheckTasks: [],
    rankCheckRunItems: [],
    rankChecks: [{ status }],
    device: "desktop",
    locationRef: { kind: "country", countryCode: "US", languageCode: "en" },
    schedule: { serpDepth: 50 },
    text,
  };
}

describe("canonical manual consent audit", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyToken.mockReset();
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "polling", ok: true });
    mocks.resolveSelection.mockResolvedValue({
      keywordIds: ["keyword_1", "keyword_2"],
      selectionHash: "a".repeat(64),
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.tx.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.rankCheckRun.findUnique.mockResolvedValue(null);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("keyword_1", "one"),
      keyword("keyword_2", "two"),
    ]);
    mocks.lockSelectionRows.mockImplementation(async (_tx, _projectId, keywordIds) =>
      [keyword("keyword_1", "one"), keyword("keyword_2", "two")].filter(({ id }) =>
        keywordIds.includes(id),
      ),
    );
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 25, id: "connection_1", provider: "dataforseo" },
    ]);
    mocks.estimatedCost.mockReturnValue(25);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.tx.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue(null);
    mocks.tx.rankCheckRun.create.mockResolvedValue({ id: "run_1" });
    mocks.tx.rankCheckRunItem.createMany.mockResolvedValue({ count: 2 });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it("retains verified manual consent in the canonical audit after native checks", async () => {
    const actual = await vi.importActual<typeof import("./preview-token")>("./preview-token");
    mocks.verifyToken.mockImplementation((token, expected, now) =>
      token === "signed-token" ? undefined : actual.verifyPreviewToken(token, expected, now),
    );
    const now = new Date();
    const binding = {
      projectId: project.id,
      actorId: "user_1",
      providerId: "dataforseo",
      depth: 20 as const,
      selection: { targetIds: ["PRIVATE-TARGET"] },
      source: {
        sourceHash: "d".repeat(64),
        manual: {
          targetIds: ["PRIVATE-TARGET"],
          estimates: [
            {
              providerId: "dataforseo",
              unit: "cents",
              quantity: "12.5000",
              unknownTargets: 0,
              certainty: "estimate",
            },
          ],
        },
      },
    };
    const consent = verifiedManualConsent(
      signSettingsQuote("manual", binding, now).token,
      binding,
      now,
    );
    const assertAdmission = vi.fn(async () => consent);
    await launchRankCheckRun(input, { assertAdmission });
    expect(assertAdmission).toHaveBeenCalledWith(mocks.tx);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.launch",
        after: expect.objectContaining({
          consent: expect.objectContaining({
            confirmed: true,
            purpose: "manual",
            outcome: "measurement_queued",
            nativeEstimates: [
              {
                providerId: "dataforseo",
                unit: "cents",
                quantity: "12.5000",
                unknownTargets: 0,
                certainty: "estimate",
              },
            ],
          }),
        }),
      }),
      mocks.tx,
    );
    expect(mocks.assertBudgetAvailable).toHaveBeenCalled();
    expect(mocks.verifyToken).toHaveBeenCalled();
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("PRIVATE-TARGET");
    expect(mocks.writeAudit.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.assertBudgetAvailable.mock.invocationCallOrder[0],
    );
  });
  it("does not accept caller-created consent or add an audit on admission failure", async () => {
    await expect(
      launchRankCheckRun(input, {
        assertAdmission: async () =>
          ({ purpose: "manual", confirmed: true }) as ReturnType<typeof verifiedManualConsent>,
      }),
    ).rejects.toThrow("verified_manual_consent_required");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("keeps legacy void admission unchanged and never audits a denied launch", async () => {
    await launchRankCheckRun(input, { assertAdmission: async () => undefined });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.not.objectContaining({ consent: expect.anything() }),
      }),
      mocks.tx,
    );
    mocks.writeAudit.mockClear();
    await expect(
      launchRankCheckRun(
        { ...input, idempotencyKey: "new-denied" },
        {
          assertAdmission: async () => {
            throw new Error("fresh_actor_denied");
          },
        },
      ),
    ).rejects.toThrow("fresh_actor_denied");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
