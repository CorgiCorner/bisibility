import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_ID = "project_1";
const SECRET_KEY = Buffer.alloc(32, 7).toString("base64");

type KeywordRow = {
  archivedAt: Date | null;
  id: string;
  locationId: string;
  publicId: string;
  queuedRankCheckTasks: Array<{ state: string }>;
  rankCheckRunItems: Array<{ status: string }>;
  rankChecks: Array<{ status: string }>;
  schedule: { serpDepth: number | null } | null;
  text: string;
};

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  assertProviderAllocationAvailable: vi.fn(),
  estimatedCost: vi.fn(),
  keywordRows: [] as unknown[],
  loadProviderChain: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  tx: {
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { create: vi.fn() },
    rankCheckRunItem: { createMany: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/providers/registry", () => ({ PROVIDER_CATALOG: [] }));
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
vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    // The real lock issues FOR UPDATE raw SQL. It reads rows by id alone, so the transaction
    // still has to apply the runnable predicate itself.
    lockRunSelectionKeywords: async (_tx: unknown, _projectId: string, keywordIds: string[]) =>
      (mocks.keywordRows as KeywordRow[]).filter(({ id }) => keywordIds.includes(id)),
  };
});

import { KEYWORD_ARCHIVED_REASON, MARKET_INACTIVE_REASON } from "@/lib/rank-check/runnable-reasons";
import { launchSingleRankCheckRun } from "./launch-single";
import { PreviewTokenError } from "./preview-token";

const project = { domain: "example.com", id: PROJECT_ID, isSample: false };
const input = {
  actorId: "user_1",
  keywordId: KEYWORD_PUBLIC_ID as `kw_${string}`,
  project,
  trigger: "manual" as const,
};

function keywordRow(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return {
    archivedAt: null,
    id: "keyword_1",
    locationId: "location_active",
    publicId: KEYWORD_PUBLIC_ID,
    queuedRankCheckTasks: [],
    rankCheckRunItems: [],
    rankChecks: [],
    schedule: { serpDepth: 50 },
    text: "corgi grooming",
    ...overrides,
  };
}

type KeywordWhere = {
  archivedAt?: null;
  id?: { in: string[] };
  locationId?: { in: string[] };
  publicId?: { in: string[] };
};

function matchesWhere(row: KeywordRow, where: KeywordWhere) {
  if (where.archivedAt === null && row.archivedAt !== null) return false;
  if (where.locationId && !where.locationId.in.includes(row.locationId)) return false;
  if (where.id && !where.id.in.includes(row.id)) return false;
  if (where.publicId && !where.publicId.in.includes(row.publicId)) return false;
  return true;
}

describe("launchSingleRankCheckRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BISIBILITY_SECRETS_KEY = SECRET_KEY;
    mocks.keywordRows = [keywordRow()];
    mocks.prisma.keyword.findMany.mockImplementation(
      async ({ select, where }: { select: Record<string, unknown>; where: KeywordWhere }) => {
        const rows = (mocks.keywordRows as KeywordRow[]).filter((row) => matchesWhere(row, where));
        // The selection resolver asks only for internal IDs; every other caller reads the row.
        return Object.keys(select).length === 1 ? rows.map(({ id }) => ({ id })) : rows;
      },
    );
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.tx.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRun.findFirst.mockResolvedValue(null);
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.rankCheckRun.create.mockResolvedValue({ id: "run_1" });
    mocks.tx.rankCheckRunItem.createMany.mockResolvedValue({ count: 1 });
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 25, id: "connection_1", provider: "provider-a" },
    ]);
    mocks.estimatedCost.mockReturnValue(25);
    mocks.assertBudgetAvailable.mockResolvedValue({ capCents: 5_000, spentCents: 0 });
  });

  afterEach(() => {
    delete process.env.BISIBILITY_SECRETS_KEY;
  });

  it("launches a runnable single check with a preview its own launch accepts", async () => {
    await expect(launchSingleRankCheckRun(input)).resolves.toMatchObject({
      estimatedCostCents: 25,
      keywordCount: 1,
      status: "queued",
      targetCount: 1,
    });

    expect(mocks.tx.rankCheckRunItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ keywordId: "keyword_1", status: "queued" })],
    });
  });

  it("names the paused market instead of a preview-token failure or a check in progress", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.tx.projectMarket.findMany.mockResolvedValue([]);

    const launched = await launchSingleRankCheckRun(input).catch((error: unknown) => error);

    expect(launched).not.toBeInstanceOf(PreviewTokenError);
    expect(launched).toMatchObject({
      message: "Every selected keyword is in a market that is not active.",
      outcome: "nothing_to_run",
      reason: MARKET_INACTIVE_REASON,
    });
    expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
    expect(mocks.tx.rankCheckRunItem.createMany).not.toHaveBeenCalled();
  });

  it("names the same reason when the market row was removed rather than paused", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_other" }]);
    mocks.tx.projectMarket.findMany.mockResolvedValue([{ locationId: "location_other" }]);

    await expect(launchSingleRankCheckRun(input)).resolves.toMatchObject({
      outcome: "nothing_to_run",
      reason: MARKET_INACTIVE_REASON,
    });
    expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
  });

  it("names the archived keyword instead of a preview-token failure", async () => {
    mocks.keywordRows = [keywordRow({ archivedAt: new Date("2026-09-01T05:00:00.000Z") })];

    const launched = await launchSingleRankCheckRun(input).catch((error: unknown) => error);

    expect(launched).not.toBeInstanceOf(PreviewTokenError);
    expect(launched).toMatchObject({
      message: "Every selected keyword has been archived.",
      outcome: "nothing_to_run",
      reason: KEYWORD_ARCHIVED_REASON,
    });
    expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
  });

  // The criterion that catches a change drawn too broadly: a runnable keyword held back only by a
  // check already in flight must keep the answer it has always had.
  // `rankCheckRunItems` is deliberately absent here: the preview's own in-progress test does not
  // read it, so such a row still fails preview-token verification. That divergence predates this
  // change and is not what these cases are about.
  it.each([
    ["a queued provider task", { queuedRankCheckTasks: [{ state: "queued" }] }],
    ["a running rank check", { rankChecks: [{ status: "running" }] }],
  ] satisfies Array<[string, Partial<KeywordRow>]>)(
    "still reports a check already in progress for %s",
    async (_label, overrides) => {
      mocks.keywordRows = [keywordRow(overrides)];

      await expect(launchSingleRankCheckRun(input)).resolves.toEqual({
        message: "All selected keywords already have rank checks in progress.",
        outcome: "nothing_to_run",
        reason: "already_in_progress",
      });
      expect(mocks.tx.rankCheckRun.create).not.toHaveBeenCalled();
    },
  );

  it("carries the preview's reason when the launch has no row left to judge", async () => {
    // The preview resolves and excludes the keyword; the launch then finds nothing to lock, so its
    // own verdict is the "already in progress" fallback. The preview knows better and wins.
    const paused = keywordRow();
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.findMany.mockImplementation(
      async ({ select, where }: { select: Record<string, unknown>; where: KeywordWhere }) => {
        const rows = [paused].filter((row) => matchesWhere(row, where));
        return Object.keys(select).length === 1 ? rows.map(({ id }) => ({ id })) : rows;
      },
    );
    mocks.keywordRows = [];

    await expect(launchSingleRankCheckRun(input)).resolves.toMatchObject({
      outcome: "nothing_to_run",
      reason: MARKET_INACTIVE_REASON,
    });
  });
});
