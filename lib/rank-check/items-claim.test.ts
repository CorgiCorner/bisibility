import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RANK_CHECK_ITEM_CLAIM_LEASE_MS,
  RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS,
} from "./dispatcher-constants";
import { claimDueRankCheckItems } from "./items-claim";

const mocks = vi.hoisted(() => ({
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));

const now = new Date("2026-09-02T08:00:00.000Z");

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null as Date | null,
    claimAttempts: 0,
    claimExpiresAt: null,
    device: "desktop",
    domain: "example.com",
    dueAt: new Date("2026-09-02T07:00:00.000Z"),
    id: "item_1",
    keywordId: "keyword_1",
    keywordPublicId: "kw_abcdefghijklmnopqrstuvwx",
    locationId: "location_1",
    marketActive: true,
    projectId: "project_1",
    requestedCount: 1,
    runId: "run_1",
    runPublicId: "rcr_abcdefghijklmnopqrstuvwx",
    status: "queued",
    ...overrides,
  };
}

function sqlText(query: unknown) {
  return String((query as { sql?: string })?.sql ?? "").replace(/\s+/g, " ");
}

function database(rows: ReturnType<typeof candidate>[], claimed: unknown[], reclaimed: unknown[]) {
  const queries: unknown[] = [];
  const tx = {
    $queryRaw: vi.fn(async (query: unknown) => {
      queries.push(query);
      const sql = sqlText(query);
      if (sql.includes("WITH eligible_items")) return rows;
      if (sql.includes("AND status = 'queued'")) return claimed;
      return reclaimed;
    }),
    auditLog: { create: vi.fn() },
    rankCheckRun: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    rankCheckRunItem: {
      groupBy: vi.fn(async () =>
        reclaimed.some((item) => (item as { status?: string }).status === "blocked")
          ? [
              {
                _count: { _all: 1 },
                _sum: { actualCostCents: null },
                keywordId: "keyword_1",
                status: "blocked",
              },
            ]
          : [],
      ),
    },
  };
  return {
    queries,
    tx,
    value: { $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
  };
}

describe("dispatcher run-item claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS", "25");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("claims due scheduled items with one queued-to-running CAS", async () => {
    const db = database([candidate()], [{ claimAttempts: 1, id: "item_1", status: "running" }], []);

    await expect(claimDueRankCheckItems({ now }, db.value as never)).resolves.toMatchObject({
      claimed: 1,
      groups: [
        {
          keywordIds: ["keyword_1"],
          runId: "run_1",
          runItemIds: ["item_1"],
        },
      ],
    });

    const select = sqlText(db.queries[0]);
    expect(select).toContain("FOR UPDATE OF run, item, keyword SKIP LOCKED");
    expect(select).toContain("run.status IN ('queued', 'running')");
    expect(db.tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: { startedAt: now, status: "running" },
      where: { id: "run_1", status: "queued" },
    });
    expect(select).not.toContain('run."selectionKind"');
    expect(select).toContain("item.status = 'queued'");
    expect(select).toContain('item."notBefore" IS NOT NULL');
    const update = sqlText(db.queries[1]);
    expect(update).toContain("WHERE id = ANY");
    expect(update).toContain("AND status = 'queued'");
    expect(update).toContain('"claimAttempts" = "claimAttempts" + 1');
  });

  it("lets exactly one of two concurrent transactions buy work", async () => {
    let status = "queued";
    let lockedBy: symbol | null = null;
    let entered = 0;
    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const shared = candidate();
    const concurrentDatabase = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const owner = Symbol("transaction");
        const tx = {
          $queryRaw: async (query: unknown) => {
            const sql = sqlText(query);
            if (sql.includes("WITH eligible_items")) {
              entered += 1;
              const selected = status === "queued" && lockedBy === null ? [shared] : [];
              if (selected.length > 0) lockedBy = owner;
              if (entered === 2) openGate();
              await gate;
              return selected;
            }
            if (
              sql.includes("AND status = 'queued'") &&
              lockedBy === owner &&
              status === "queued"
            ) {
              status = "running";
              return [{ claimAttempts: 1, id: "item_1", status }];
            }
            return [];
          },
          auditLog: { create: vi.fn() },
          rankCheckRun: { update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
        };
        try {
          return await callback(tx);
        } finally {
          if (lockedBy === owner) lockedBy = null;
        }
      },
    };

    const claims = await Promise.all([
      claimDueRankCheckItems({ now }, concurrentDatabase as never),
      claimDueRankCheckItems({ now }, concurrentDatabase as never),
    ]);
    const rankChecks: string[] = [];
    const queuedTasks: string[] = [];
    const providerFacingCreate = vi.fn();
    for (const claim of claims) {
      for (const itemId of claim.groups.flatMap((group) => group.runItemIds ?? [])) {
        rankChecks.push(`rank_${itemId}`);
        queuedTasks.push(`task_${itemId}`);
        providerFacingCreate(itemId);
      }
    }

    expect(claims.map((claim) => claim.claimed).sort()).toEqual([0, 1]);
    expect(rankChecks).toEqual(["rank_item_1"]);
    expect(queuedTasks).toEqual(["task_item_1"]);
    expect(providerFacingCreate).toHaveBeenCalledOnce();
  });

  it("keeps the first start when a later target or lease is claimed", async () => {
    const db = database([candidate()], [{ claimAttempts: 1, id: "item_1", status: "running" }], []);
    const run = { status: "queued", startedAt: null as Date | null };
    db.tx.rankCheckRun.updateMany.mockImplementation(async (...args: unknown[]) => {
      const { data, where } = args[0] as { data: typeof run; where: { status: string } };
      if (run.status !== where.status) return { count: 0 };
      Object.assign(run, data);
      return { count: 1 };
    });
    await claimDueRankCheckItems({ now }, db.value as never);
    await claimDueRankCheckItems({ now: new Date(now.getTime() + 60_000) }, db.value as never);
    expect(run).toEqual({ status: "running", startedAt: now });
  });

  it("does not start a run when no due target is claimed", async () => {
    const db = database([], [], []);
    expect(await claimDueRankCheckItems({ now }, db.value as never)).toMatchObject({ claimed: 0 });
    expect(db.tx.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });

  it("hard-excludes paid linked items from lease reclaim", async () => {
    const expired = candidate({
      claimAttempts: 1,
      claimExpiresAt: new Date("2026-09-02T07:00:00.000Z"),
      status: "running",
    });
    const db = database([expired], [], [{ claimAttempts: 2, id: "item_1", status: "running" }]);

    await claimDueRankCheckItems({ now }, db.value as never);

    const select = sqlText(db.queries[0]);
    const reclaim = sqlText(db.queries[1]);
    expect(select.match(/item\."rankCheckId" IS NULL/g)).toHaveLength(2);
    expect(reclaim).toContain('AND "rankCheckId" IS NULL');
    expect(reclaim).toContain('AND "claimExpiresAt" <');
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.item_reclaimed",
        after: expect.objectContaining({ claimAttempts: 2, reason: "lease_expired" }),
      }),
      db.tx,
    );
  });

  it("blocks a claim lost beyond the bounded reclaim limit", async () => {
    const expired = candidate({
      claimAttempts: RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS,
      claimExpiresAt: new Date("2026-09-02T07:00:00.000Z"),
      status: "running",
    });
    const db = database(
      [expired],
      [],
      [
        {
          claimAttempts: RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS + 1,
          id: "item_1",
          status: "blocked",
        },
      ],
    );

    await expect(claimDueRankCheckItems({ now }, db.value as never)).resolves.toMatchObject({
      claimed: 0,
    });

    const reclaim = sqlText(db.queries[1]);
    expect(reclaim).toContain("THEN 'blocked'");
    expect(reclaim).toContain("THEN 'claim_lost'");
    expect(reclaim).toContain('"finishedAt" = CASE');
    expect(db.tx.rankCheckRun.update).toHaveBeenCalledWith({
      data: { skippedCount: { increment: 1 } },
      where: { id: "run_1" },
    });
    expect(db.tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "failed", status: "completed" }),
      where: { id: "run_1", status: "running" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          claimAttempts: RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS + 1,
          reason: "claim_lost",
        }),
      }),
      db.tx,
    );
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
  });

  it("uses the named five-minute lease", async () => {
    const db = database([candidate()], [{ claimAttempts: 1, id: "item_1", status: "running" }], []);

    await claimDueRankCheckItems({ now }, db.value as never);

    const values = (db.queries[1] as { values: unknown[] }).values;
    expect(values).toContainEqual(new Date(now.getTime() + RANK_CHECK_ITEM_CLAIM_LEASE_MS));
  });

  it("selects scheduled due items without allowing immediate run items", async () => {
    const db = database([], [], []);

    await expect(claimDueRankCheckItems({ now }, db.value as never)).resolves.toMatchObject({
      claimed: 0,
    });
    const select = sqlText(db.queries[0]);
    expect(select).toContain('item."notBefore" IS NOT NULL');
    expect(select).not.toContain('item."notBefore" IS NULL OR');
    expect(select).not.toContain('run."selectionKind"');
  });
});
