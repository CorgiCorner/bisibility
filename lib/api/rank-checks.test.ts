import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueAlertDeliveries: vi.fn(),
  keywordFindFirst: vi.fn(),
  launchSingleRankCheckRun: vi.fn(),
  queryRaw: vi.fn(),
  rankCheckFindFirst: vi.fn(),
  rankCheckFindMany: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    keyword: { findFirst: mocks.keywordFindFirst },
    rankCheck: { findFirst: mocks.rankCheckFindFirst, findMany: mocks.rankCheckFindMany },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/rank-check/runs/launch-single", () => ({
  launchSingleRankCheckRun: mocks.launchSingleRankCheckRun,
}));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDeliveries: mocks.enqueueAlertDeliveries,
}));
vi.mock("@temporalio/client", () => ({ Connection: { connect: vi.fn() } }));

import { getRankCheck, listRankChecks } from "./rank-checks";

const keyword = {
  id: "keyword_1",
  project: { domain: null, isSample: false },
  projectId: "project_1",
  publicId: "kw_a00000000000000000000000",
  text: "rank tracker",
};

function checkRecord(overrides: Record<string, unknown> = {}) {
  return {
    attempts: null,
    billingUnits: 1,
    checkedAt: new Date("2026-09-05T12:00:00.000Z"),
    costCents: 1,
    error: null,
    errorCode: null,
    id: "rank_check_1",
    keyword: { projectId: "project_1", publicId: keyword.publicId },
    position: 3,
    previousPosition: null,
    provider: "serpapi",
    publicId: "check_a00000000000000000000000",
    rankingUrl: null,
    raw: null,
    run: null,
    status: "completed",
    ...overrides,
  } as never;
}

function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    receiptCount: 3,
    unitProvider: "serpapi",
    providerCount: 1,
    recordedCostCents: "1.5",
    recordedUnits: "3",
    scopeId: "rank_check_1",
    unconfirmedCount: 0,
    unmeasuredCount: 0,
    ...overrides,
  };
}

function context(query = "") {
  return {
    auth: { project: { id: "project_1", publicId: "prj_a00000000000000000000000" } },
    headers: new Headers(),
    instance: "https://example.com/api/v1",
    req: new Request(`https://example.com/api${query}`),
    url: new URL(`https://example.com/api${query}`),
  } as never;
}

describe("rank-check API list serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keywordFindFirst.mockResolvedValue(keyword);
    mocks.rankCheckFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("reports ledger actuals for the page in one batched read", async () => {
    mocks.rankCheckFindMany.mockResolvedValue([
      checkRecord(),
      checkRecord({
        id: "rank_check_2",
        publicId: "check_b00000000000000000000000",
        provider: "dataforseo",
        costCents: 0.625,
      }),
    ]);
    mocks.queryRaw.mockResolvedValue([
      ledgerRow(),
      ledgerRow({
        scopeId: "rank_check_2",
        receiptCount: 1,
        unitProvider: "serpapi",
        recordedCostCents: "0.625",
        recordedUnits: "1",
      }),
    ]);

    const response = await listRankChecks(
      context("/keywords/kw_a00000000000000000000000/rank-checks"),
      "kw_a00000000000000000000000",
    );
    const body = await response.json();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const query = mocks.queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain("project_1");
    expect(query.values).toContain("rank_check_1");
    expect(query.values).toContain("rank_check_2");
    expect(body.data[0]).toMatchObject({
      cost_cents: 1.5,
      usage: { quantity: 3, status: "confirmed", unit: "operations" },
    });
    expect(body.data[1]).toMatchObject({
      cost_cents: 0.625,
      usage: { quantity: 0.625, status: "confirmed", unit: "cents" },
    });
  });

  it("keeps an unknown receipt null over stored known values", async () => {
    mocks.rankCheckFindMany.mockResolvedValue([checkRecord({ billingUnits: 3, costCents: 2 })]);
    mocks.queryRaw.mockResolvedValue([
      ledgerRow({
        receiptCount: 2,
        unitProvider: "serpapi",
        recordedCostCents: null,
        recordedUnits: null,
        unconfirmedCount: 1,
      }),
    ]);

    const response = await listRankChecks(
      context("/keywords/kw_a00000000000000000000000/rank-checks"),
      "kw_a00000000000000000000000",
    );
    const body = await response.json();

    expect(body.data[0]).toMatchObject({
      cost_cents: null,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });

  it("preserves measured legacy fields when no receipts exist", async () => {
    mocks.rankCheckFindMany.mockResolvedValue([checkRecord({ billingUnits: 2, costCents: 2 })]);
    mocks.queryRaw.mockResolvedValue([]);

    const response = await listRankChecks(
      context("/keywords/kw_a00000000000000000000000/rank-checks"),
      "kw_a00000000000000000000000",
    );
    const body = await response.json();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(body.data[0]).toMatchObject({
      cost_cents: 2,
      usage: { quantity: 2, status: "confirmed", unit: "operations" },
    });
  });
});

describe("rank-check API detail serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rankCheckFindFirst.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("totals paid partial failures across live and queued correlations", async () => {
    mocks.rankCheckFindFirst.mockResolvedValue(checkRecord({ costCents: 0.625, billingUnits: 1 }));
    mocks.queryRaw.mockResolvedValue([ledgerRow()]);

    const response = await getRankCheck(
      context("/rank-checks/x"),
      "check_a00000000000000000000000",
    );
    const body = await response.json();

    const query = mocks.queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain("project_1");
    expect(body).toMatchObject({
      cost_cents: 1.5,
      usage: { quantity: 3, status: "confirmed", unit: "operations" },
    });
  });

  it("keeps mixed-provider units unconfirmed while summing recorded cost", async () => {
    mocks.rankCheckFindFirst.mockResolvedValue(checkRecord());
    mocks.queryRaw.mockResolvedValue([
      ledgerRow({
        providerCount: 2,
        recordedCostCents: "1.625",
        recordedUnits: "2",
        receiptCount: 2,
        unitProvider: "serpapi",
      }),
    ]);

    const response = await getRankCheck(
      context("/rank-checks/x"),
      "check_a00000000000000000000000",
    );
    const body = await response.json();

    expect(body).toMatchObject({
      cost_cents: 1.625,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });

  it("keeps stored fields when the check predates the ledger", async () => {
    mocks.rankCheckFindFirst.mockResolvedValue(checkRecord({ billingUnits: 2, costCents: 2 }));

    const response = await getRankCheck(
      context("/rank-checks/x"),
      "check_a00000000000000000000000",
    );
    const body = await response.json();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      cost_cents: 2,
      usage: { quantity: 2, status: "confirmed", unit: "operations" },
    });
  });
});
