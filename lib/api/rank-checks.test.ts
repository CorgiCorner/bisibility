import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  enqueueAlertDeliveries: vi.fn(),
  keywordFindFirst: vi.fn(),
  launchSingleRankCheckRun: vi.fn(),
  queryRaw: vi.fn(),
  rankCheckFindFirst: vi.fn(),
  rankCheckFindMany: vi.fn(),
  writeAudit: vi.fn(),
  inlineEnabled: vi.fn(),
  runInline: vi.fn(),
  rankCheckFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    keyword: { findFirst: mocks.keywordFindFirst },
    rankCheck: {
      findUniqueOrThrow: mocks.rankCheckFindUnique,
      findFirst: mocks.rankCheckFindFirst,
      findMany: mocks.rankCheckFindMany,
    },
  },
}));
vi.mock("@/lib/rank-check/inline-execution", () => ({
  inlineRankCheckExecutionEnabled: mocks.inlineEnabled,
}));
vi.mock("@/lib/rank-check/runs/inline", () => ({ runInlineRankCheck: mocks.runInline }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/rank-check/runs/launch-single", () => ({
  launchSingleRankCheckRun: mocks.launchSingleRankCheckRun,
}));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDeliveries: mocks.enqueueAlertDeliveries,
}));
vi.mock("@temporalio/client", () => ({ Connection: { connect: vi.fn() } }));

import { getRankCheck, listRankChecks } from "./rank-checks";
import { handleApiRequest } from "./router";

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
    expect(query.values).toContainEqual(expect.arrayContaining(["rank_check_1", "rank_check_2"]));
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

  it("keeps list actuals unknown without Meter receipts", async () => {
    mocks.rankCheckFindMany.mockResolvedValue([checkRecord({ billingUnits: 2, costCents: 2 })]);
    mocks.queryRaw.mockResolvedValue([]);

    const response = await listRankChecks(
      context("/keywords/kw_a00000000000000000000000/rank-checks"),
      "kw_a00000000000000000000000",
    );
    const body = await response.json();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(body.data[0]).toMatchObject({
      cost_cents: null,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });
});

describe("rank-check API router", () => {
  it("serves the keyword check list and a check detail", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: "project_1",
        scopes: ["read"],
      },
      kind: "project_key",
      project: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_a00000000000000000000000",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });
    mocks.keywordFindFirst.mockResolvedValue(keyword);
    mocks.rankCheckFindMany.mockResolvedValue([checkRecord()]);
    mocks.rankCheckFindFirst.mockResolvedValue(checkRecord());
    mocks.queryRaw.mockResolvedValue([ledgerRow()]);
    const get = (path: string) =>
      handleApiRequest(
        new Request(`https://example.com/api/v1${path}`, {
          headers: { Authorization: "Bearer bsb_key_live_test" },
        }),
        path.split("/").filter(Boolean),
      );

    const list = await get(`/keywords/${keyword.publicId}/rank-checks`);
    const detail = await get("/rank-checks/check_a00000000000000000000000");

    expect([list.status, detail.status]).toEqual([200, 200]);
  });
  it.each([false, true])("captures a successful launch with inline=%s", async (inline) => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: { id: "key_1", projectId: "project_1", scopes: ["write"] },
      project: {
        id: "project_1",
        publicId: "prj_a00000000000000000000000",
        domain: "example.com",
        writeMode: "writable",
      },
    });
    mocks.keywordFindFirst.mockResolvedValue(keyword);
    mocks.inlineEnabled.mockReturnValue(inline);
    mocks.launchSingleRankCheckRun.mockResolvedValue({ publicId: "rcr_a00000000000000000000000" });
    mocks.runInline.mockResolvedValue({ rankCheckId: "rank_check_1", provider: "serpapi" });
    mocks.rankCheckFindUnique.mockResolvedValue(checkRecord());
    mocks.queryRaw.mockResolvedValue([ledgerRow()]);
    const path = `keywords/${keyword.publicId}/checks`;
    const response = await handleApiRequest(
      new Request(`https://example.com/api/v1/${path}`, {
        method: "POST",
        headers: { authorization: "Bearer bsb_key_live_test", "content-type": "application/json" },
        body: JSON.stringify({ provider_id: "serpapi", max_cost_cents: 10 }),
      }),
      path.split("/"),
    );
    expect(response.status).toBe(inline ? 201 : 202);
    expect(await response.json()).toMatchObject(
      inline
        ? { id: "check_a00000000000000000000000", cost_cents: 1.5 }
        : { id: "rcr_a00000000000000000000000", status: "queued" },
    );
    expect(mocks.launchSingleRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "serpapi", maxCostCents: 10 }),
    );
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

  it("keeps detail actuals unknown without Meter receipts", async () => {
    mocks.rankCheckFindFirst.mockResolvedValue(checkRecord({ billingUnits: 2, costCents: 2 }));

    const response = await getRankCheck(
      context("/rank-checks/x"),
      "check_a00000000000000000000000",
    );
    const body = await response.json();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      cost_cents: null,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });
});
