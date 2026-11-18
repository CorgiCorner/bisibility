import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { bulkKeywords } from "./keyword-bulk";

const mocks = vi.hoisted(() => ({
  items: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  writeAudit: vi.fn(),
  setCadence: vi.fn(),
  txFindMany: vi.fn(),
  findMembership: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
async function findKeywords(
  args: {
    select?: { checkSchedule?: unknown };
    where: unknown;
  },
  load: typeof mocks.findMany,
) {
  const rows = await load(args);
  if (!args.select?.checkSchedule) return rows;
  return Promise.all(
    rows.map(async (row: { id: string }) => {
      const membership = await mocks.findMembership({ where: { id: row.id } });
      const schedule = membership?.checkSchedule;
      return {
        ...row,
        checkSchedule: schedule
          ? {
              publicId: "sch_a00000000000000000000000",
              timezone: "UTC",
              jitterMinutes: 60,
              timeOfDay: null,
              ...schedule,
            }
          : null,
      };
    }),
  );
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => unknown) =>
      fn({
        $queryRaw: vi.fn(),
        keyword: {
          findMany: (args: Parameters<typeof findKeywords>[0]) =>
            findKeywords(
              args,
              args.select?.checkSchedule
                ? vi.fn(mocks.findMany.getMockImplementation())
                : mocks.txFindMany,
            ),
          findUnique: mocks.findMembership,
          deleteMany: mocks.deleteMany,
        },
        projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
        providerConnection: { findFirst: vi.fn(async () => null) },
        rankCheckRunItem: { findMany: mocks.items },
      }),
    keyword: {
      deleteMany: mocks.deleteMany,
      findMany: (args: Parameters<typeof findKeywords>[0]) =>
        findKeywords(
          args,
          args.select?.checkSchedule
            ? vi.fn(mocks.findMany.getMockImplementation())
            : mocks.findMany,
        ),
      updateMany: mocks.updateMany,
    },
    projectDefaults: { findUnique: async () => ({ serpDepth: 100 }) },
    providerConnection: { findFirst: async () => null },
    keywordTag: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.setCadence,
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: vi.fn(),
}));

const keywordId = "kw_a00000000000000000000000";

function context(role: "admin" | "member", body: unknown) {
  const url = new URL("https://example.com/api/v1/keywords/bulk");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method: "POST",
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: ["keywords", "bulk"],
    req: new Request(url, { body: JSON.stringify(body), method: "POST" }),
    url,
  } as unknown as ApiContext;
}

describe("bulk keyword deletion role gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([{ id: "keyword_1", publicId: keywordId }]);
    mocks.txFindMany.mockResolvedValue([{ id: "keyword_1", publicId: keywordId }]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("refuses a member deleting keywords, matching the app's delete/keyword rule", async () => {
    const response = await bulkKeywords(
      context("member", { keyword_ids: [keywordId], operation: "delete" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: 403, title: "Forbidden" });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("protects a check already in flight through the same lifecycle as the app", async () => {
    mocks.items.mockResolvedValue([
      {
        id: "item_1",
        keywordId: "keyword_1",
        runId: "run_1",
        status: "running",
        rankCheckId: "check_1",
        run: { publicId: "rcr_active" },
      },
    ]);
    await expect(
      bulkKeywords(context("admin", { keyword_ids: [keywordId], operation: "delete" })),
    ).rejects.toThrow("still checking");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("lets an admin delete keywords", async () => {
    const response = await bulkKeywords(
      context("admin", { keyword_ids: [keywordId], operation: "delete" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["keyword_1"] } },
    });
  });
});

describe("bulk keyword frequency", () => {
  const active = "kw_b00000000000000000000000";
  const unchanged = "kw_c00000000000000000000000";
  const archived = "kw_d00000000000000000000000";
  const otherProject = "kw_e00000000000000000000000";
  const missing = "kw_f00000000000000000000000";
  const rows = [
    { id: "active", publicId: active, projectId: "project_1", archivedAt: null },
    { id: "unchanged", publicId: unchanged, projectId: "project_1", archivedAt: null },
    { id: "archived", publicId: archived, projectId: "project_1", archivedAt: new Date() },
    { id: "other", publicId: otherProject, projectId: "project_2", archivedAt: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    const lookup = ({
      where,
    }: {
      where: { publicId: { in: string[] }; projectId: string; archivedAt?: null };
    }) =>
      rows.filter(
        (row) =>
          where.publicId.in.includes(row.publicId) &&
          row.projectId === where.projectId &&
          (where.archivedAt !== null || row.archivedAt === null),
      );
    mocks.findMany.mockImplementation(lookup);
    mocks.txFindMany.mockImplementation(lookup);
    mocks.findMembership.mockResolvedValue({
      checkSchedule: {
        frequency: "daily",
        enabled: true,
        archivedAt: null,
        cronExpression: null,
        serpDepth: null,
      },
    });
    mocks.setCadence.mockImplementation(
      async (_tx, _projectId, ids: string[]) =>
        new Map(ids.filter((id) => id === "active" || id === "unchanged").map((id) => [id, null])),
    );
  });

  it("reports only processed active keywords, preserving order and duplicates", async () => {
    const ids = [archived, active, otherProject, unchanged, missing, active];
    const response = await bulkKeywords(
      context("member", { keyword_ids: ids, operation: "set_frequency", frequency: "daily" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      operation: "set_frequency",
      results: [
        { keyword_id: archived, status: "not_found" },
        { keyword_id: active, status: "updated" },
        { keyword_id: otherProject, status: "not_found" },
        { keyword_id: unchanged, status: "updated" },
        { keyword_id: missing, status: "not_found" },
        { keyword_id: active, status: "updated" },
      ],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.txFindMany).toHaveBeenCalledOnce();
    expect(mocks.txFindMany).toHaveBeenCalledWith({
      select: { id: true, publicId: true },
      where: { publicId: { in: ids }, projectId: "project_1", archivedAt: null },
    });
    expect(mocks.setCadence).toHaveBeenCalledOnce();
    expect(mocks.setCadence.mock.calls[0][2]).toEqual(["active", "unchanged"]);
    expect(mocks.setCadence.mock.calls[0][5]).toBe("frequency");
  });

  it.each([
    ["new membership", null, { frequency: "monthly" }],
    [
      "disabled membership",
      {
        frequency: "weekly",
        enabled: false,
        archivedAt: null,
        cronExpression: null,
        serpDepth: 20,
      },
      { frequency: "weekly" },
    ],
    [
      "monthly to weekly",
      {
        frequency: "monthly",
        enabled: true,
        archivedAt: null,
        cronExpression: null,
        serpDepth: 20,
      },
      { frequency: "weekly" },
    ],
    [
      "cron change",
      {
        frequency: "custom_cron",
        enabled: true,
        archivedAt: null,
        cronExpression: "0 1 * * *",
        serpDepth: 20,
      },
      { schedule: { frequency: "custom_cron", cron_expression: "0 2 * * *" } },
    ],
    [
      "depth growth",
      { frequency: "daily", enabled: true, archivedAt: null, cronExpression: null, serpDepth: 20 },
      { schedule: { frequency: "daily", serp_depth: 50 } },
    ],
  ])("requires review for %s", async (_name, checkSchedule, cadence) => {
    mocks.findMembership.mockResolvedValue({ checkSchedule });
    const response = await bulkKeywords(
      context("member", { keyword_ids: [active], operation: "set_frequency", ...cadence }),
    );
    expect(response.status).toBe(428);
    expect(mocks.setCadence).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a mixed bulk increase before changing any membership", async () => {
    mocks.findMembership.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      checkSchedule: {
        frequency: where.id === "active" ? "weekly" : "daily",
        enabled: true,
        archivedAt: null,
        cronExpression: null,
        serpDepth: null,
      },
    }));
    const response = await bulkKeywords(
      context("member", {
        keyword_ids: [unchanged, active],
        operation: "set_frequency",
        frequency: "daily",
      }),
    );
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({
      code: "schedule_review_required",
      detail: "This change may increase recurring spend. Review it in the web app for now.",
    });
    expect(mocks.setCadence).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("pauses an active daily membership through the cost gate", async () => {
    const response = await bulkKeywords(
      context("member", {
        keyword_ids: [active],
        operation: "set_frequency",
        frequency: "paused",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.setCadence).toHaveBeenCalledOnce();
    expect(mocks.setCadence.mock.calls[0][2]).toEqual(["active"]);
    expect(mocks.setCadence.mock.calls[0][3]).toMatchObject({ frequency: "paused" });
    expect(mocks.setCadence.mock.calls[0][5]).toBe("frequency");
  });

  it("does not report a keyword that cadence processing skipped", async () => {
    mocks.setCadence.mockResolvedValue(new Map([["active", null]]));
    const response = await bulkKeywords(
      context("member", {
        keyword_ids: [active, unchanged],
        operation: "set_frequency",
        frequency: "daily",
      }),
    );
    expect(await response.json()).toEqual({
      operation: "set_frequency",
      results: [
        { keyword_id: active, status: "updated" },
        { keyword_id: unchanged, status: "not_found" },
      ],
    });
  });
});
