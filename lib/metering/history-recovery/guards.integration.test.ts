import type { Budget } from "@usagekit/core";
import { expect, test } from "vitest";
import { currentBudgets, saveBudget } from "../store/budgets";
import { createSql, Prisma } from "../store/host-sql";
import { hydrate, operationRow } from "../store/records";
import { manifestIdentity, planHistoricalResolution } from "./plan";
import { historicalResolutionReceipt } from "./receipt";
import { applyHistoricalResolution, previewHistoricalResolution } from "./service";
import { readHistoricalResolutionSnapshot } from "./snapshot";
import { centsBudget, historyFixture } from "./test-fixture";

test.each(["any", "programmatic"])(
  "unknown units cannot be omitted with an unlimited %s tag budget",
  async (surface) => {
    const budget: Budget = {
      ...centsBudget(),
      id: "quota",
      scope: { kind: "tag", namespace: "test", tag: "own:dataforseo:connection" },
      unit: "units",
      limit: null,
      surface: surface as Budget["surface"],
    };
    const f = await historyFixture();
    try {
      const op = f.ops[0]!;
      const tag = op.scope.tags![0]!;
      await f.run((tx) =>
        saveBudget(createSql(tx, f.counters), {
          ...budget,
          scope: { kind: "tag", namespace: "test", tag },
        }),
      );
      await expect(
        f.run((tx) => previewHistoricalResolution(tx, f.manifest), true),
      ).rejects.toThrow("Unknown units");
    } finally {
      await f.close();
    }
  },
);

test("measured values cannot be overwritten and unknown cost needs explicit evidence", async () => {
  const f = await historyFixture([{}, { measurementStatus: "unknown" }]);
  try {
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "unknown cost",
    );
    f.manifest.operations[1]!.costCents = "0";
    f.manifest.operations[0]!.costCents = "9";
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "must be preserved",
    );
    f.manifest.operations[0]!.costCents = "1.2345";
    await expect(
      f.run((tx) => previewHistoricalResolution(tx, f.manifest), true),
    ).resolves.toHaveProperty("planHash");
    f.manifest.recordedAt = "2026-10-10T00:00:00.000Z";
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "precede",
    );
  } finally {
    await f.close();
  }
});

test("SerpApi quota requires observed units; apply refuses a budget changed since preview", async () => {
  const f = await historyFixture([{ provider: "serpapi" }]);
  try {
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "Unknown units",
    );
    const item = f.manifest.operations[0]!;
    item.units = "2";
    item.omitUnknownUnits = false;
    const plan = await f.run((tx) => previewHistoricalResolution(tx, f.manifest), true);
    await f.run((tx) => saveBudget(createSql(tx, f.counters), centsBudget()));
    await expect(
      f.run((tx) => applyHistoricalResolution(tx, f.manifest, plan.planHash)),
    ).rejects.toThrow("Preview changed");
    const fresh = await f.run((tx) => previewHistoricalResolution(tx, f.manifest), true);
    await f.run((tx) => applyHistoricalResolution(tx, f.manifest, fresh.planHash));
  } finally {
    await f.close();
  }
});

test("read-only preview never writes; native proof, scope tampering, and cross-database approval fail closed", async () => {
  const f = await historyFixture();
  try {
    const original = await f.run(
      (tx) => readHistoricalResolutionSnapshot(tx, f.manifest, manifestIdentity(f.manifest)),
      true,
    );
    const now = new Date();
    const fingerprint = planHistoricalResolution(original, f.manifest, now).planHash;
    const altered = structuredClone(original);
    altered.identity.database = "different-database";
    expect(planHistoricalResolution(altered, f.manifest, now).planHash).not.toBe(fingerprint);
    altered.entries[0]!.nativeProof = true;
    expect(() => planHistoricalResolution(altered, f.manifest, now)).toThrow("native proof");
    const scope = structuredClone(original);
    scope.entries[0]!.operation.scope.principal = "other";
    expect(() => planHistoricalResolution(scope, f.manifest, now)).toThrow("untouched");
    const binding = structuredClone(original);
    binding.entries[0]!.binding = true;
    expect(() => planHistoricalResolution(binding, f.manifest, now)).toThrow("untouched");
    await f.run(async (tx) => {
      await previewHistoricalResolution(tx, f.manifest);
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM metering_command`;
      expect(row?.n).toBe(0n);
    }, true);
    // SQL-backed native proof, not only a fabricated snapshot flag.
    await f.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO queued_rank_check_batches VALUES('batch','connection','project','dataforseo')`;
      await tx.$executeRaw`INSERT INTO queued_rank_check_tasks(id,"providerTaskId","costCents","batchId","providerTag") VALUES('task','native','1','batch',';cs=own;')`;
      await tx.$executeRaw`UPDATE metering_operation SET input=jsonb_set(jsonb_set(input,'{correlationId}','"task"'::jsonb),'{operation}','"rank_check"'::jsonb)`;
    });
    const withNative = await f.run(
      (tx) => readHistoricalResolutionSnapshot(tx, f.manifest, manifestIdentity(f.manifest)),
      true,
    );
    expect(withNative.entries[0]?.nativeProof).toBe(true);
  } finally {
    await f.close();
  }
});

test("applied replay preserves later corrections and makes no command/event/budget writes", async () => {
  const f = await historyFixture([{ measurementStatus: "unknown" }]);
  try {
    f.manifest.operations[0]!.costCents = "1";
    const plan = await f.run((tx) => previewHistoricalResolution(tx, f.manifest), true);
    await f.run((tx) => applyHistoricalResolution(tx, f.manifest, plan.planHash));
    await f.run((tx) => saveBudget(createSql(tx, f.counters), centsBudget()));
    const counts = () =>
      f.run(
        (tx) => tx.$queryRaw<{ commands: bigint; events: bigint; budgets: bigint }[]>`
    SELECT (SELECT count(*) FROM metering_command) AS commands,(SELECT count(*) FROM metering_event) AS events,
      (SELECT count(*) FROM metering_budget) AS budgets`,
        true,
      );
    const before = await counts();
    await f.run(async (tx) => {
      await tx.$executeRaw`UPDATE metering_operation SET version=version+1`;
    });
    expect(
      (await f.run((tx) => applyHistoricalResolution(tx, f.manifest, plan.planHash))).replayed,
    ).toBe(true);
    expect(await counts()).toEqual(before);
    await f.run(async (tx) => {
      const sql = createSql(tx, f.counters);
      const op = await hydrate(sql, (await operationRow(sql, "test", f.ops[0]!.operationId))!);
      expect(op.version).toBe(3);
      expect(await currentBudgets(sql, "test")).toHaveLength(3);
      await tx.$executeRaw(Prisma.sql`UPDATE metering_command SET input_hash='corrupt'`);
    });
    await expect(
      f.run((tx) => applyHistoricalResolution(tx, f.manifest, plan.planHash)),
    ).rejects.toThrow("does not match");
  } finally {
    await f.close();
  }
});

test("already retained native receipt does not trap recovery; newly available proof takes precedence", async () => {
  const f = await historyFixture();
  try {
    const receiptId = f.manifest.operations[0]!.receiptId;
    await f.run(
      (tx) => tx.$executeRaw`INSERT INTO metering_usage_evidence
      (id,namespace,principal,"projectId","connectionId",provider,feature,source,"correlationId",unit,estimate,"createdAt","receiptId")
      VALUES('legacy-0','test','historical-unattributed:project','project','connection','dataforseo','ranked_keywords','app','correlation','cents','{}'::jsonb,'2026-10-01T00:00:00Z',${receiptId})`,
    );
    await expect(
      f.run((tx) => previewHistoricalResolution(tx, f.manifest), true),
    ).resolves.toHaveProperty("planHash");
    await f.run(
      (tx) => tx.$executeRaw`UPDATE metering_usage_evidence SET "receiptId"='new-native-proof'`,
    );
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "native proof",
    );
  } finally {
    await f.close();
  }
});

test("estimated units cannot be attested as omitted unknown units", async () => {
  const f = await historyFixture();
  try {
    const op = f.ops[0]!;
    const original = {
      ...op.receipts[0]!,
      measurements: op.receipts[0]!.measurements.map((m) =>
        m.unit === "units"
          ? {
              unit: "units",
              certainty: "estimated" as const,
              quantity: { unit: "units", value: 2n, scale: 0 },
            }
          : m,
      ),
    };
    expect(() =>
      historicalResolutionReceipt(op, original, f.manifest.operations[0]!, f.manifest, {
        databaseRole: "operator",
        requiresUnits: false,
        receiptId: "resolution",
        planHash: "hash",
        manifestHash: "hash",
        databaseIdentityHash: "hash",
      }),
    ).toThrow("Unknown units need evidence");
  } finally {
    await f.close();
  }
});

test("old queued tags do not strand operator recovery; only recoverable native BYOK proof wins", async () => {
  const f = await historyFixture([{ feature: "rank_check", correlationId: "task" }]);
  try {
    await f.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO queued_rank_check_batches VALUES('batch','connection','project','dataforseo')`;
      await tx.$executeRaw`INSERT INTO queued_rank_check_tasks(id,"providerTaskId","costCents","batchId","providerTag")
        VALUES('task','native',1,'batch','legacy-tag')`;
    });
    await expect(
      f.run((tx) => previewHistoricalResolution(tx, f.manifest), true),
    ).resolves.toHaveProperty("planHash");
    await f.run(
      (tx) => tx.$executeRaw`UPDATE queued_rank_check_tasks SET "providerTag"=';cs=own;'`,
    );
    await expect(f.run((tx) => previewHistoricalResolution(tx, f.manifest), true)).rejects.toThrow(
      "native proof",
    );
    await f.run(
      (tx) =>
        tx.$executeRaw`UPDATE queued_rank_check_batches SET "connectionId"='other-connection'`,
    );
    await expect(
      f.run((tx) => previewHistoricalResolution(tx, f.manifest), true),
    ).resolves.toHaveProperty("planHash");
  } finally {
    await f.close();
  }
});
