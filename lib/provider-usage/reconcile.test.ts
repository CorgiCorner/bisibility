import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_USAGE_OVERDUE_THRESHOLD_MS,
  PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY,
  reconcileProviderUsage,
} from "./reconcile";

const mocks = vi.hoisted(() => ({ notifyOps: vi.fn() }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));

const NOW = new Date("2026-09-22T12:00:00.000Z");

type FixtureReceipt = {
  batch: {
    connectionId: string | null;
    credentialId: string | null;
    credentialKind: string | null;
    provider: string;
    projectId: string;
    source: string | null;
    submittedAt: Date | null;
    trigger: string | null;
  };
  costCents: number | null;
  createdAt: Date;
  id: string;
  keywordId: string;
  providerTag: string | null;
  providerTaskId: string | null;
  updatedAt: Date;
};

type UnknownEntry = {
  accounted?: boolean;
  connectionId?: string;
  correlationId?: string;
  costCents?: string | null;
  createdAt: Date;
  id?: string;
  measurementStatus: string;
  providerRequestId?: string;
};

const TASK_ACCEPTED_AT = new Date("2026-09-22T11:30:00.000Z");

function receipt(
  overrides: Partial<Omit<FixtureReceipt, "batch">> & {
    batch?: Partial<FixtureReceipt["batch"]>;
  } = {},
): FixtureReceipt {
  const { batch, ...rest } = overrides;
  return {
    batch: {
      connectionId: "connection_1",
      credentialId: "key_9",
      credentialKind: "project_key",
      provider: "dataforseo",
      projectId: "project_1",
      source: "sdk",
      submittedAt: NOW,
      trigger: "manual",
      ...batch,
    },
    costCents: 0.625,
    createdAt: TASK_ACCEPTED_AT,
    id: "task_1",
    keywordId: "keyword_1",
    providerTag: "app=bisibility;stage=dev;src=sdk;trg=manual;f=rank_check;p=project_1;c=task_1",
    providerTaskId: "09201523-0000-0000-0000-000000000001",
    updatedAt: NOW,
    ...rest,
  };
}

function fixture(
  receipts: FixtureReceipt[],
  unknownEntries: UnknownEntry[] = [],
  options: { concurrentlySettled?: Set<string> } = {},
) {
  const settled = new Set<string>();
  const written: Array<Record<string, unknown>> = [];
  const settings = new Map<string, string>();
  let capturedSql = "";
  let capturedUnknownSql = "";
  const nativeCovered = (connectionId: string | null, providerTaskId: string) =>
    unknownEntries.some(
      (entry) =>
        entry.measurementStatus === "recorded" &&
        entry.providerRequestId === providerTaskId &&
        (entry.connectionId ?? "connection_1") === connectionId,
    );
  const $queryRaw = vi.fn(async (query: { sql: string; values: unknown[] }) => {
    const limit = Number(query.values[0]);
    if (query.sql.includes('"measurementStatus"')) {
      capturedUnknownSql = query.sql;
      return unknownEntries
        .filter((entry) => entry.measurementStatus === "unknown")
        .filter(
          (entry) => (entry.costCents !== undefined && entry.costCents !== null) || entry.accounted,
        )
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, limit)
        .map((entry) => ({
          accounted: entry.accounted ?? false,
          connectionId: entry.connectionId ?? "connection_1",
          costCents: entry.costCents ?? null,
          entryId: entry.id ?? `unknown_${unknownEntries.indexOf(entry)}`,
          providerRequestId: entry.providerRequestId ?? "09201523-0000-0000-0000-000000000099",
        }));
    }
    capturedSql = query.sql;
    return receipts
      .filter(
        (row) =>
          row.providerTaskId !== null &&
          row.costCents !== null &&
          row.providerTag !== null &&
          row.batch.connectionId !== null,
      )
      .filter((row) => !settled.has(`${row.batch.connectionId}:${row.providerTaskId}`))
      .filter((row) => !nativeCovered(row.batch.connectionId, row.providerTaskId as string))
      .sort(
        (left, right) =>
          left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((row) => ({
        billingAt: row.batch.submittedAt ?? row.createdAt,
        connectionId: row.batch.connectionId,
        costCents: String(row.costCents),
        credentialId: row.batch.credentialId,
        credentialKind: row.batch.credentialKind,
        keywordId: row.keywordId,
        projectId: row.batch.projectId,
        provider: row.batch.provider,
        providerRequestId: row.providerTaskId,
        providerTag: row.providerTag,
        source: row.batch.source,
        taskId: row.id,
        trigger: row.batch.trigger,
      }));
  });
  const matchingUnknowns = (where?: { createdAt?: { lt?: Date }; measurementStatus?: string }) => {
    let rows = unknownEntries;
    if (where?.measurementStatus) {
      rows = rows.filter((entry) => entry.measurementStatus === where.measurementStatus);
    }
    const cutoff = where?.createdAt?.lt;
    if (cutoff) {
      rows = rows.filter((entry) => entry.createdAt.getTime() < cutoff.getTime());
    }
    return rows;
  };
  const client = {
    $queryRaw,
    instanceSetting: {
      upsert: vi.fn(
        async (args: {
          create: { key: string; value: string };
          update: { value: string };
          where: { key: string };
        }) => {
          settings.set(args.where.key, args.update.value);
        },
      ),
    },
    providerCostEntry: {
      count: vi.fn(
        async (args: { where?: { createdAt?: { lt?: Date }; measurementStatus?: string } }) =>
          matchingUnknowns(args.where).length,
      ),
      createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of args.data) {
          const key = `${row.connectionId}:${row.providerRequestId}`;
          if (row.providerRequestId != null) {
            if (settled.has(key)) continue;
            if (options.concurrentlySettled?.has(key)) {
              settled.add(key);
              continue;
            }
            settled.add(key);
          }
          written.push(row);
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async (args: { where: { id: string; measurementStatus: string } }) => {
        const victims = unknownEntries.filter(
          (entry) =>
            entry.id === args.where.id && entry.measurementStatus === args.where.measurementStatus,
        );
        for (const victim of victims) {
          unknownEntries.splice(unknownEntries.indexOf(victim), 1);
        }
        return { count: victims.length };
      }),
      findFirst: vi.fn(
        async (args: {
          where?: {
            createdAt?: { lt?: Date };
            measurementStatus?: string;
            connectionId?: string;
            providerRequestId?: string;
            id?: { not: string };
          };
        }) => {
          if (args.where?.providerRequestId)
            return (
              unknownEntries.find(
                (entry) =>
                  entry.providerRequestId === args.where?.providerRequestId &&
                  (entry.connectionId ?? "connection_1") === args.where?.connectionId &&
                  entry.id !== args.where?.id?.not,
              ) ?? null
            );
          const rows = matchingUnknowns(args.where).sort(
            (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
          );
          return rows[0] ? { createdAt: rows[0].createdAt } : null;
        },
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = unknownEntries.find((candidate) => candidate.id === args.where.id);
        if (!entry) throw Object.assign(new Error("Record not found."), { code: "P2025" });
        Object.assign(entry, args.data);
        return entry;
      }),
    },
  };
  return {
    client,
    pendingUnknownSql: () => capturedUnknownSql,
    receiptsSql: () => capturedSql,
    settled,
    settings,
    written,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("provider usage receipt reconciliation", () => {
  it("copies a trusted queued receipt into the ledger with its known charge", async () => {
    const state = fixture([receipt()]);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toEqual({
      hasMore: false,
      lastReconciledAt: NOW.toISOString(),
      overdue: 0,
      reconciled: 1,
      scanned: 1,
      unconfirmed: 0,
    });
    expect(state.written).toHaveLength(1);
    expect(state.written[0]).toEqual(
      expect.objectContaining({
        cached: false,
        connectionId: "connection_1",
        createdAt: NOW,
        correlationId: "task_1",
        costCents: 0.625,
        credentialId: "key_9",
        credentialKind: "project_key",
        failed: false,
        feature: "rank_check",
        keywordId: "keyword_1",
        projectId: "project_1",
        provider: "dataforseo",
        providerRequestId: "09201523-0000-0000-0000-000000000001",
        source: "sdk",
        tag: "app=bisibility;stage=dev;src=sdk;trg=manual;f=rank_check;p=project_1;c=task_1",
        trigger: "manual",
        usageQuantity: 1,
      }),
    );
    expect("measurementStatus" in state.written[0]).toBe(false);
  });

  it("keeps a zero reported cost as a valid recorded charge", async () => {
    const state = fixture([receipt({ costCents: 0 })]);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result.reconciled).toBe(1);
    expect(state.written[0]).toEqual(expect.objectContaining({ costCents: 0, usageQuantity: 1 }));
  });

  it("skips receipts without a provider request id, cost, tag, or connection", async () => {
    const state = fixture([
      receipt({ id: "task_a", providerTaskId: null }),
      receipt({ id: "task_b", costCents: null }),
      receipt({ id: "task_c", providerTag: null }),
      receipt({ id: "task_d", batch: { connectionId: null } }),
    ]);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ reconciled: 0, scanned: 0 });
    expect(state.client.providerCostEntry.createMany).not.toHaveBeenCalled();
  });

  it("filters settled receipts and applies the limit inside the query", async () => {
    const state = fixture([receipt()]);
    await reconcileProviderUsage(state.client as never);
    const sql = state.receiptsSql();
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain('t."providerTaskId" IS NOT NULL');
    expect(sql).toContain('t."costCents" IS NOT NULL');
    expect(sql).toContain('t."providerTag" IS NOT NULL');
    expect(sql).toContain('b."connectionId" IS NOT NULL');
    expect(sql).toContain('COALESCE(b."submittedAt", t."createdAt")');
    expect(sql.indexOf("NOT EXISTS")).toBeLessThan(sql.indexOf("LIMIT"));
    expect(state.client.$queryRaw.mock.calls[0]?.[0]).toMatchObject({ values: [101] });
  });

  it("does not starve later eligible receipts behind the sweep limit", async () => {
    const receipts = [1, 2, 3, 4, 5].map((index) =>
      receipt({
        id: `task_${index}`,
        providerTag: `tag-${index}`,
        providerTaskId: `09201523-0000-0000-0000-00000000000${index}`,
        updatedAt: new Date(NOW.getTime() - index * 60_000),
      }),
    );
    const state = fixture(receipts);
    const first = await reconcileProviderUsage(state.client as never, { limit: 2 });
    expect(first).toMatchObject({ hasMore: true, lastReconciledAt: null, scanned: 2 });
    expect(state.written.map((row) => row.correlationId)).toEqual(["task_5", "task_4"]);
    const second = await reconcileProviderUsage(state.client as never, { limit: 2 });
    expect(second).toMatchObject({ hasMore: true, lastReconciledAt: null, scanned: 2 });
    expect(state.written.map((row) => row.correlationId)).toEqual([
      "task_5",
      "task_4",
      "task_3",
      "task_2",
    ]);
    const third = await reconcileProviderUsage(state.client as never, { limit: 2 });
    expect(third).toMatchObject({
      hasMore: false,
      lastReconciledAt: NOW.toISOString(),
      scanned: 1,
    });
    const fourth = await reconcileProviderUsage(state.client as never, { limit: 2 });
    expect(fourth).toMatchObject({ hasMore: false, scanned: 0 });
    expect(state.written).toHaveLength(5);
    expect(state.client.instanceSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it("drains a backlog larger than one bounded sweep and stamps the watermark once", async () => {
    const receipts = Array.from({ length: 350 }, (_, index) =>
      receipt({
        id: `task_${index + 1}`,
        providerTag: `tag-${index + 1}`,
        providerTaskId: `09201523-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
        updatedAt: new Date(NOW.getTime() - index * 1_000),
      }),
    );
    const state = fixture(receipts);
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const result = await reconcileProviderUsage(state.client as never);
      expect(result).toMatchObject({ hasMore: true, lastReconciledAt: null, scanned: 100 });
    }
    const final = await reconcileProviderUsage(state.client as never);
    expect(final).toMatchObject({
      hasMore: false,
      lastReconciledAt: NOW.toISOString(),
      scanned: 50,
    });
    expect(state.written).toHaveLength(350);
    expect(state.client.providerCostEntry.createMany).toHaveBeenCalledTimes(350);
    expect(state.client.instanceSetting.upsert).toHaveBeenCalledTimes(1);
    expect(state.settings.get(PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY)).toBe(NOW.toISOString());
  });

  it("treats a concurrent duplicate settle as idempotent convergence", async () => {
    const raceKey = "connection_1:09201523-0000-0000-0000-000000000001";
    const state = fixture([receipt()], [], { concurrentlySettled: new Set([raceKey]) });
    const first = await reconcileProviderUsage(state.client as never);
    expect(first).toMatchObject({ reconciled: 1, scanned: 1 });
    expect(state.written).toHaveLength(0);
    expect(state.settled.has(raceKey)).toBe(true);
    const second = await reconcileProviderUsage(state.client as never);
    expect(second).toMatchObject({ reconciled: 0, scanned: 0 });
  });

  it("keeps a repeated sweep idempotent and refreshes the watermark on the empty sweep", async () => {
    const state = fixture([receipt()]);
    await reconcileProviderUsage(state.client as never);
    const second = await reconcileProviderUsage(state.client as never);
    expect(second).toEqual({
      hasMore: false,
      lastReconciledAt: NOW.toISOString(),
      overdue: 0,
      reconciled: 0,
      scanned: 0,
      unconfirmed: 0,
    });
    expect(state.written).toHaveLength(1);
    expect(state.client.instanceSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it("stamps the watermark on an empty sweep so freshness reflects the drained state", async () => {
    const state = fixture([]);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toEqual({
      hasMore: false,
      lastReconciledAt: NOW.toISOString(),
      overdue: 0,
      reconciled: 0,
      scanned: 0,
      unconfirmed: 0,
    });
    expect(state.client.instanceSetting.upsert).toHaveBeenCalledWith({
      create: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY, value: NOW.toISOString() },
      update: { value: NOW.toISOString() },
      where: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY },
    });
  });

  it("records the provider billing timestamp instead of the reconciliation clock", async () => {
    const state = fixture([
      receipt({ id: "task_submitted", providerTaskId: "09201523-0000-0000-0000-000000000010" }),
      receipt({
        batch: { submittedAt: null },
        id: "task_accepted",
        providerTaskId: "09201523-0000-0000-0000-000000000011",
      }),
    ]);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ hasMore: false, reconciled: 2, scanned: 2 });
    expect(state.written.map((row) => [row.correlationId, row.createdAt])).toEqual([
      ["task_accepted", TASK_ACCEPTED_AT],
      ["task_submitted", NOW],
    ]);
  });

  it("settles a pending unknown row once from its trusted recovered queued task", async () => {
    const state = fixture(
      [],
      [
        {
          connectionId: "connection_1",
          correlationId: "task_1",
          costCents: "0.625",
          createdAt: TASK_ACCEPTED_AT,
          id: "entry_1",
          measurementStatus: "unknown",
          providerRequestId: "09201523-0000-0000-0000-000000000001",
        },
      ],
    );
    const first = await reconcileProviderUsage(state.client as never);
    expect(first).toMatchObject({ reconciled: 1, scanned: 1, unconfirmed: 0 });
    expect(state.client.providerCostEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1", measurementStatus: "unknown" },
      data: {
        cached: false,
        costCents: 0.625,
        failed: false,
        measurementStatus: "recorded",
        providerRequestId: "09201523-0000-0000-0000-000000000001",
        usageQuantity: 1,
      },
    });
    expect(
      "createdAt" in (state.client.providerCostEntry.update.mock.calls[0]?.[0].data ?? {}),
    ).toBe(false);
    const second = await reconcileProviderUsage(state.client as never);
    expect(second).toMatchObject({ reconciled: 0, scanned: 0, unconfirmed: 0 });
    expect(state.client.providerCostEntry.createMany).not.toHaveBeenCalled();
  });

  it("removes a phantom pending row once its native receipt already accounts the charge", async () => {
    const state = fixture(
      [],
      [
        {
          accounted: true,
          connectionId: "connection_1",
          correlationId: "task_1",
          costCents: "0.625",
          createdAt: TASK_ACCEPTED_AT,
          id: "entry_1",
          measurementStatus: "unknown",
          providerRequestId: "09201523-0000-0000-0000-000000000001",
        },
      ],
    );
    state.client.providerCostEntry.findFirst.mockResolvedValueOnce({
      id: "native_1",
      measurementStatus: "recorded",
      createdAt: TASK_ACCEPTED_AT,
    });
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ reconciled: 1, scanned: 1, unconfirmed: 0 });
    expect(state.client.providerCostEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "entry_1", measurementStatus: "unknown" },
    });
    expect(state.client.providerCostEntry.update).not.toHaveBeenCalled();
    expect(state.client.providerCostEntry.createMany).not.toHaveBeenCalled();
    expect(state.written).toHaveLength(0);
  });

  it("converges without double counting when the native receipt appears before settlement", async () => {
    const state = fixture(
      [],
      [
        {
          connectionId: "connection_1",
          correlationId: "task_1",
          costCents: "0.625",
          createdAt: TASK_ACCEPTED_AT,
          id: "entry_1",
          measurementStatus: "unknown",
          providerRequestId: "09201523-0000-0000-0000-000000000001",
        },
      ],
    );
    state.client.providerCostEntry.update.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed."), { code: "P2002" }),
    );
    state.client.providerCostEntry.findFirst.mockResolvedValueOnce({
      id: "native_1",
      measurementStatus: "recorded",
      createdAt: TASK_ACCEPTED_AT,
    });
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ reconciled: 1, scanned: 1, unconfirmed: 0 });
    expect(state.client.providerCostEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "entry_1", measurementStatus: "unknown" },
    });
  });

  it("settles a pending unknown before backfilling so a recovered task is charged once", async () => {
    const state = fixture(
      [receipt()],
      [
        {
          connectionId: "connection_1",
          correlationId: "task_1",
          costCents: "0.625",
          createdAt: TASK_ACCEPTED_AT,
          id: "entry_1",
          measurementStatus: "unknown",
          providerRequestId: "09201523-0000-0000-0000-000000000001",
        },
      ],
    );
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ reconciled: 1, scanned: 1 });
    expect(state.client.providerCostEntry.update).toHaveBeenCalledOnce();
    expect(state.client.providerCostEntry.createMany).not.toHaveBeenCalled();
    expect(state.written).toHaveLength(0);
  });

  it("leaves untrusted pending rows for operator review instead of guessing a cost", async () => {
    const state = fixture(
      [],
      [
        {
          connectionId: "connection_1",
          correlationId: "task_1",
          createdAt: TASK_ACCEPTED_AT,
          id: "entry_1",
          measurementStatus: "unknown",
          providerRequestId: "09201523-0000-0000-0000-000000000001",
        },
      ],
    );
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ hasMore: false, reconciled: 0, scanned: 0, unconfirmed: 1 });
    expect(state.client.providerCostEntry.update).not.toHaveBeenCalled();
    expect(state.client.providerCostEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("never rewrites unknown entries as zero and counts them as unconfirmed", async () => {
    const unknownEntries: UnknownEntry[] = [
      {
        createdAt: new Date(NOW.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS - 60_000),
        measurementStatus: "unknown",
      },
      { createdAt: new Date(NOW.getTime() - 5 * 60_000), measurementStatus: "unknown" },
    ];
    const state = fixture([receipt()], unknownEntries);
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ overdue: 1, reconciled: 1, scanned: 1, unconfirmed: 2 });
    expect(mocks.notifyOps).toHaveBeenCalledOnce();
    expect(mocks.notifyOps).toHaveBeenCalledWith({
      dedupeKey: "provider_usage_unconfirmed",
      fields: {
        "Oldest age minutes": 16,
        "Overdue entries": 1,
        "Unconfirmed total": 2,
      },
      kind: "provider_usage_unconfirmed",
      severity: "warning",
      title: expect.stringContaining("1 unconfirmed entries"),
    });
    expect(state.written).toHaveLength(1);
    expect(state.written[0]).toEqual(expect.objectContaining({ costCents: 0.625 }));
    expect(state.written[0].measurementStatus).not.toBe("unknown");
    expect(state.client.providerCostEntry.count).toHaveBeenCalledWith({
      where: { measurementStatus: "unknown" },
    });
  });

  it("holds the overdue boundary at exactly fifteen minutes", async () => {
    const unknownEntries: UnknownEntry[] = [
      {
        createdAt: new Date(NOW.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS),
        measurementStatus: "unknown",
      },
    ];
    const state = fixture([], unknownEntries);
    const exactlyFifteen = await reconcileProviderUsage(state.client as never);
    expect(exactlyFifteen).toMatchObject({ overdue: 0, unconfirmed: 1 });
    expect(mocks.notifyOps).not.toHaveBeenCalled();
    unknownEntries[0] = {
      createdAt: new Date(NOW.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS - 1_000),
      measurementStatus: "unknown",
    };
    const pastBoundary = await reconcileProviderUsage(state.client as never);
    expect(pastBoundary).toMatchObject({ overdue: 1, unconfirmed: 1 });
    expect(mocks.notifyOps).toHaveBeenCalledOnce();
  });

  it("does not notify when every unknown entry is still fresh", async () => {
    const state = fixture(
      [],
      [{ createdAt: new Date(NOW.getTime() - 60_000), measurementStatus: "unknown" }],
    );
    const result = await reconcileProviderUsage(state.client as never);
    expect(result).toMatchObject({ overdue: 0, unconfirmed: 1 });
    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });

  it("persists the reconciliation watermark only after a successful sweep", async () => {
    const state = fixture([receipt()]);
    await reconcileProviderUsage(state.client as never);
    expect(state.client.instanceSetting.upsert).toHaveBeenCalledWith({
      create: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY, value: NOW.toISOString() },
      update: { value: NOW.toISOString() },
      where: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY },
    });
    expect(state.settings.get(PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY)).toBe(NOW.toISOString());
  });

  it("does not update the watermark when the watermark write fails", async () => {
    const state = fixture([receipt()]);
    state.client.instanceSetting.upsert.mockRejectedValue(new Error("settings unavailable"));
    await expect(reconcileProviderUsage(state.client as never)).rejects.toThrow(
      "settings unavailable",
    );
    expect(state.settings.has(PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY)).toBe(false);
  });

  it("does not update the watermark when a receipt settle fails", async () => {
    const state = fixture([receipt()]);
    state.client.providerCostEntry.createMany.mockRejectedValue(new Error("ledger unavailable"));
    await expect(reconcileProviderUsage(state.client as never)).rejects.toThrow(
      "ledger unavailable",
    );
    expect(state.client.instanceSetting.upsert).not.toHaveBeenCalled();
    expect(state.settings.has(PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY)).toBe(false);
  });
});
