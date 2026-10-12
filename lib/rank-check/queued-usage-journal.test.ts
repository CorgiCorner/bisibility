import { byokTestJournal } from "@/lib/provider-usage/byok-test-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { beginQueuedTaskUsageJournal } from "./queued-usage-journal";

type LedgerRow = Record<string, unknown> & { id: string };

function fakeLedger(seed: LedgerRow[] = []) {
  return byokTestJournal("dataforseo", seed);
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

    expect(ledger.rows.map((row) => row.correlationId)).toEqual(["qtask_1", "qtask_2"]);
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectionId: "connection_1",
          costCents: 0,
          measurementStatus: "unknown",
          provider: "dataforseo",
          feature: "rank_check",
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
          tag: taskInput(1).attribution.tag,
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
    const update = ledger.table.update.getMockImplementation();
    ledger.table.update.mockImplementation(async (args) => {
      const { where } = args;
      if (where.id === ledger.rows[1]?.id) {
        throw Object.assign(new Error("ledger unavailable"), { code: "P0" });
      }
      if (!update) throw new Error("Missing fixture update");
      return update(args);
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

    expect(ledger.rows.filter((row) => !row.discarded).map((row) => row.id)).toEqual(["unrelated"]);
    await expect(journal.discard()).resolves.toBeUndefined();
  });

  it("discards already-begun rows when a later begin fails", async () => {
    const ledger = fakeLedger();
    ledger.table.createMany.mockRejectedValueOnce(new Error("ledger unavailable"));

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

vi.mock("@/lib/provider-usage/admission-extension", async () => ({
  ownAdmission: (await import("@/lib/provider-usage/byok-test-evidence")).testOwnAdmission,
}));
