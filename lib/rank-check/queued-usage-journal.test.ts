import type { PrismaClient } from "@/lib/generated/prisma/client";
import { byokTestEvidence } from "@/lib/provider-usage/byok-test-evidence";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { beginQueuedTaskUsageJournal } from "./queued-usage-journal";

type LedgerRow = Record<string, unknown> & { id: string };

function matchesWhere(row: LedgerRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("notIn" in value) return !(value as { notIn: unknown[] }).notIn.includes(row[key]);
      if ("in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
      if ("not" in value) return row[key] !== (value as { not: unknown }).not;
    }
    if (value === null) return row[key] == null;
    return row[key] === value;
  });
}

function fakeLedger(seed: LedgerRow[] = []) {
  const rows: LedgerRow[] = seed.map((row) => ({ ...row }));
  const table = {
    createMany: vi.fn(async ({ data }: { data: LedgerRow[] }) => {
      for (const entry of data) rows.push({ ...entry });
      return { count: data.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const victims = rows.filter((row) => matchesWhere(row, where));
      for (const victim of victims) rows.splice(rows.indexOf(victim), 1);
      return { count: victims.length };
    }),
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => matchesWhere(row, where)) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: LedgerRow }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw Object.assign(new Error("Record not found."), { code: "P2025" });
      Object.assign(row, data);
      return row;
    }),
  };
  const db = {
    ...byokTestEvidence("dataforseo"),
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(rows);
      const evidenceSnapshot = structuredClone(db.rows);
      try {
        return await run(db);
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        db.rows.splice(0, db.rows.length, ...evidenceSnapshot);
        throw error;
      }
    }),
    providerCostEntry: {
      ...table,
      updateMany: vi.fn(async (args: Parameters<typeof table.update>[0]) => {
        await table.update(args);
        return { count: 1 };
      }),
    },
  };
  return { db: db as unknown as PrismaClient, rows, table };
}

function taskInput(index: number) {
  return {
    attribution: {
      context: {
        correlationId: `qtask_${index}`,
        feature: "rank_check" as const,
        projectId: "project_1",
        source: "app" as const,
        trigger: "scheduled" as const,
      },
      tag: `app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_${index}`,
    } satisfies ProviderRequestAttribution,
    correlationId: `qtask_${index}`,
    keywordId: `keyword_${index}`,
  };
}

function begin(ledger: ReturnType<typeof fakeLedger>, count = 2) {
  return beginQueuedTaskUsageJournal({
    client: ledger.db,
    connectionId: "connection_1",
    projectId: "project_1",
    tasks: Array.from({ length: count }, (_, index) => taskInput(index + 1)),
  });
}

describe("beginQueuedTaskUsageJournal", () => {
  it("begins one durable unknown row per queued task under its own attribution", async () => {
    const ledger = fakeLedger();
    await begin(ledger, 2);

    expect(ledger.rows.map((row) => [row.correlationId, row.keywordId])).toEqual([
      ["qtask_1", "keyword_1"],
      ["qtask_2", "keyword_2"],
    ]);
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectionId: "connection_1",
          costCents: 0,
          measurementStatus: "unknown",
          provider: "dataforseo",
          tag: "app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_1",
        }),
      ]),
    );
  });

  it("settles accepted receipts with the native id and quantity one", async () => {
    const ledger = fakeLedger();
    const journal = await begin(ledger, 1);

    await journal.settle({
      accepted: [
        {
          correlationId: "qtask_1",
          costCents: 1.2,
          providerTaskId: "provider_1",
          tag: "app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_1",
        },
      ],
      failed: [],
      unknown: [],
    });

    expect(ledger.rows).toEqual([
      expect.objectContaining({
        costCents: 1.2,
        failed: false,
        measurementStatus: "recorded",
        providerRequestId: "provider_1",
        usageQuantity: 1,
      }),
    ]);
  });

  it("settles charged failed receipts and leaves missing costs unknown", async () => {
    const ledger = fakeLedger();
    const journal = await begin(ledger, 2);

    await journal.settle({
      accepted: [],
      failed: [
        { correlationId: "qtask_1", costCents: 0.6, message: "rejected" },
        { correlationId: "qtask_2", costCents: null, message: "rejected without cost" },
      ],
      unknown: [],
    });

    expect(ledger.rows.find((row) => row.correlationId === "qtask_1")).toEqual(
      expect.objectContaining({ costCents: 0.6, failed: true, measurementStatus: "recorded" }),
    );
    expect(ledger.rows.find((row) => row.correlationId === "qtask_2")).toEqual(
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    );
  });

  it("keeps earlier known receipts when a later settlement fails", async () => {
    const ledger = fakeLedger();
    const journal = await begin(ledger, 2);
    ledger.table.update.mockImplementation(async ({ where, data }) => {
      if (where.id === ledger.rows[1]?.id) {
        throw Object.assign(new Error("ledger unavailable"), { code: "P0" });
      }
      Object.assign(ledger.rows.find((row) => row.id === where.id) ?? {}, data);
      return ledger.rows[0];
    });

    await expect(
      journal.settle({
        accepted: [
          { correlationId: "qtask_1", costCents: 1.2, providerTaskId: "provider_1", tag: "t1" },
          { correlationId: "qtask_2", costCents: 1.2, providerTaskId: "provider_2", tag: "t2" },
        ],
        failed: [],
        unknown: [],
      }),
    ).rejects.toThrow();
    expect(ledger.rows.find((row) => row.correlationId === "qtask_1")).toEqual(
      expect.objectContaining({ measurementStatus: "recorded", providerRequestId: "provider_1" }),
    );
    expect(ledger.rows.find((row) => row.correlationId === "qtask_2")).toEqual(
      expect.objectContaining({ measurementStatus: "unknown" }),
    );
  });

  it("discards only its own pending rows when the batch is known not sent", async () => {
    const ledger = fakeLedger([
      { connectionId: "connection_1", id: "unrelated", measurementStatus: "unknown" },
    ]);
    const journal = await begin(ledger, 2);

    await journal.discard();

    expect(ledger.rows.map((row) => row.id)).toEqual(["unrelated"]);
    await expect(journal.discard()).resolves.toBeUndefined();
  });

  it("discards already-begun rows when a later begin fails", async () => {
    const ledger = fakeLedger();
    ledger.table.createMany.mockImplementation(async ({ data }) => {
      if (data[0]?.correlationId === "qtask_2") throw new Error("ledger unavailable");
      ledger.rows.push({ ...data[0] });
      return { count: 1 };
    });

    await expect(begin(ledger, 2)).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(ledger.rows).toHaveLength(0);
  });

  it("refuses to begin when an unresolved pending row exists for a correlation", async () => {
    const ledger = fakeLedger([
      {
        connectionId: "connection_1",
        correlationId: "qtask_1",
        id: "stale",
        measurementStatus: "unknown",
        projectId: "project_1",
      },
    ]);

    await expect(begin(ledger, 2)).rejects.toThrow();
    expect(ledger.rows.map((row) => row.id)).toEqual(["stale"]);
  });
});
