import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(async () => new Map()),
  checkSchedule: { findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
  itemFindMany: vi.fn(),
  usageGroups: vi.fn().mockResolvedValue([]),
  ledgerRaw: vi.fn(),
  loadProviderChain: vi.fn(),
  monthlySpend: vi.fn(),
  budgetCap: vi.fn().mockImplementation(async (_project: string, spentCents: number) => ({
    capCents: 777,
    spentCents,
  })),
  raw: vi.fn(),
  projectMarket: { findMany: vi.fn() },
  runCount: vi.fn(),
  runFindFirst: vi.fn(),
  runFindMany: vi.fn(),
  scheduleKeywords: vi.fn(),
  unitCost: vi.fn(),
}));

vi.mock("@/lib/queries/rank-check-run-account-blocks", () => ({
  rankRunAccountBlocks: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/rank-check/runs/budget-presentation", () => ({
  projectRunBudgetAmounts: mocks.budgetCap,
}));
vi.mock("@/lib/provider-evidence/projection/read", () => ({ readCheckEvidence: mocks.evidence }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheck: { groupBy: mocks.usageGroups },
    $queryRaw: (query: unknown) => {
      const text = Array.isArray((query as { strings?: string[] }).strings)
        ? (query as { strings: string[] }).strings.join(" ")
        : String(query);
      return text.includes("metering_operation") ? mocks.ledgerRaw(query) : mocks.raw(query);
    },
    auditLog: mocks.auditLog,
    checkSchedule: mocks.checkSchedule,
    rankCheckRun: {
      count: mocks.runCount,
      findFirst: mocks.runFindFirst,
      findMany: mocks.runFindMany,
    },
    keyword: { findMany: mocks.scheduleKeywords },
    projectMarket: mocks.projectMarket,
    rankCheckRunItem: { findMany: mocks.itemFindMany },
  },
}));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({ unitCostCentsFor: mocks.unitCost }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestMonthlySpendCents: mocks.monthlySpend,
}));

export const runIds = [
  "rcr_a00000000000000000000000",
  "rcr_b00000000000000000000000",
  "rcr_c00000000000000000000000",
];

export function run(publicId: string, launchedAt: Date | null, plannedFor: Date | null = null) {
  return {
    _count: { items: 0 },
    blockedReason: null,
    cancelledCount: 0,
    checkSchedule: null,
    completedCount: 1,
    costCents: 10,
    deferredCount: 0,
    estimatedCostCents: 10,
    failedCount: 0,
    finishedAt: null,
    id: `db_${publicId}`,
    items: [],
    keywordCount: 1,
    launchedAt,
    orchestrationWorkflowId: `rank-check-run-${publicId}`,
    outcome: null,
    parentRelation: null,
    parentRun: null,
    plannedFor,
    project: { budgetCapCents: 5_000, defaults: { serpDepth: 20 } },
    projectId: "project_1",
    publicId,
    requestedBy: {
      email: "user@example.com",
      image: "https://example.com/user.png",
      name: "User",
    },
    requestedCount: 1,
    selectionKind: "all",
    selectionSpec: { kind: "all", v: 1 },
    skippedCount: 0,
    startedAt: null,
    status: plannedFor ? "planned" : "completed",
    targetCount: 1,
    totalCount: 1,
    trigger: plannedFor ? "scheduled" : "manual",
  };
}

export function item(id: string, createdAt: Date) {
  return {
    actualCostCents: null,
    blockedReason: null,
    createdAt,
    estimatedCostCents: 5,
    finishedAt: null,
    id,
    keyword: {
      device: "desktop",
      locationRef: { languageLabel: "Polish" },
      location: "Poland",
      publicId: "kw_a00000000000000000000000",
      text: id,
    },
    notBefore: null,
    rankCheck: null,
    startedAt: null,
    status: "failed",
  };
}

export { mocks };
export function setupRankRunQueryMocks() {
  vi.clearAllMocks();
  mocks.ledgerRaw.mockResolvedValue([]);
  mocks.usageGroups.mockResolvedValue([]);
  mocks.loadProviderChain.mockResolvedValue([
    { costPerCheckCents: 2, provider: "serpapi", rateContext: { entries: [] } },
  ]);
  mocks.auditLog.findMany.mockResolvedValue([]);
  mocks.unitCost.mockReturnValue(2);
  mocks.scheduleKeywords.mockResolvedValue([]);
  mocks.projectMarket.findMany.mockResolvedValue([{ locationId: "market_1" }]);
  mocks.monthlySpend.mockResolvedValue(0);
}
