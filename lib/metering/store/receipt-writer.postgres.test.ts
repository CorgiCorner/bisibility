import { readFileSync } from "node:fs";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Receipt } from "@usagekit/core";
import { createPostgresStore } from "@usagekit/store-postgres";
import { expect, test } from "vitest";
import { fixture, migration } from "./schema-upgrade.test-fixture";
import { command, receipt, request } from "./test-data";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.resolve("@usagekit/store-postgres")), "utf8"),
);
const [release, prerelease] = version.split("-");
expect(
  release.localeCompare("0.12.0", undefined, { numeric: true }) > 0 ||
    (release === "0.12.0" && prerelease === undefined),
  "This branch requires the published 0.12.0 lockfile; install store-postgres >= 0.12.0",
).toBe(true);

const { appendReceipt } = await import("./records");
const { receiptWrite } = await import("./receipt-write");

test.each([undefined, 4, 8, null] as const)(
  "host and upstream receipt writers store identical rows for money scale %s",
  async (scale) => {
    const f = await fixture();
    try {
      await f.db.exec(await migration());
      const store = await createPostgresStore(f.options);
      const reserved = await store.reserve({
        ...request("writer"),
        settlementPolicy: { requiredUnits: ["requests"], requireMoney: false },
      });
      if (reserved.outcome !== "reserved") throw new Error("Reservation fixture failed");
      const granted = await store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "worker",
        leaseTtlMs: 1000,
      });
      if (!("granted" in granted) || !granted.granted) throw new Error("Dispatch fixture failed");
      const value = {
        ...receipt(),
        cost:
          scale === null
            ? { certainty: "unknown" as const, money: null }
            : {
                certainty: "measured" as const,
                money: {
                  currency: "USD" as const,
                  units: 13n,
                  ...(scale === undefined ? {} : { scale }),
                },
              },
      };
      await store.settle({
        ...command(granted.operation),
        authority: { kind: "lease", leaseId: granted.lease.leaseId },
        receipt: value,
      });
      const select = () => f.db.query("SELECT * FROM metering_receipt");
      const expected = (await select()).rows;
      expect(expected).toHaveLength(1);
      await f.db.exec(
        "DELETE FROM metering_measurement; DELETE FROM metering_event; DELETE FROM metering_receipt",
      );
      const sql = {
        query: async <T>(query: Prisma.Sql) => (await f.db.query<T>(query.text, query.values)).rows,
        execute: async (query: Prisma.Sql) => {
          const mapped = receiptWrite(query);
          if (scale === 4 && mapped.text.startsWith("INSERT INTO metering_receipt"))
            expect(JSON.parse(String(mapped.values[4])).cost.money).not.toHaveProperty("scale");
          return (await f.db.query(mapped.text, mapped.values)).affectedRows ?? 0;
        },
      };
      await appendReceipt(sql, granted.operation, value, 0);
      expect((await select()).rows).toEqual(expected);
      expect(value.cost.money?.scale).toBe(scale === null ? undefined : scale);
    } finally {
      await f.db.close();
    }
  },
);

test("host and upstream writers reject an explicit null money scale before persistence", async () => {
  const f = await fixture();
  try {
    await f.db.exec(await migration());
    const store = await createPostgresStore(f.options);
    const reserved = await store.reserve({ ...request("null-scale") });
    if (reserved.outcome !== "reserved") throw new Error("Reservation fixture failed");
    const granted = await store.markDispatchIntent({
      ...command(reserved.operation),
      holder: "worker",
      leaseTtlMs: 1000,
    });
    if (!("granted" in granted) || !granted.granted) throw new Error("Dispatch fixture failed");
    // Deliberately exercise malformed persisted input beyond the typed Money contract.
    const value = {
      ...receipt(),
      cost: {
        certainty: "measured",
        money: { currency: "USD", units: 13n, scale: null },
      },
    } as unknown as Receipt;
    const before = await f.snapshot();
    await expect(
      store.settle({
        ...command(granted.operation),
        authority: { kind: "lease", leaseId: granted.lease.leaseId },
        receipt: value,
      }),
    ).rejects.toThrow("receipt.cost: invalid value");
    expect(await f.snapshot()).toEqual(before);
    const sql = {
      query: async <T>(query: Prisma.Sql) => (await f.db.query<T>(query.text, query.values)).rows,
      execute: async (query: Prisma.Sql) => {
        const mapped = receiptWrite(query);
        return (await f.db.query(mapped.text, mapped.values)).affectedRows ?? 0;
      },
    };
    await expect(appendReceipt(sql, granted.operation, value, 0)).rejects.toThrow(
      "InvalidInput: money.scale",
    );
    expect(await f.snapshot()).toEqual(before);
    expect(value.cost.money?.scale).toBeNull();
  } finally {
    await f.db.close();
  }
});

test.each([8, null, "4", "8"])(
  "legacy inserts and updates reject conflicting scale %s",
  async (scale) => {
    const f = await fixture();
    try {
      await f.db.exec(await migration());
      const value = {
        ...receipt(),
        cost: {
          certainty: "measured" as const,
          money: { currency: "USD" as const, units: 13n, scale: scale as number },
        },
      };
      await expect(f.seed("legacy", value)).rejects.toThrow(
        "Metering receipt money scale mismatch",
      );
      expect((await f.db.query("SELECT * FROM metering_receipt")).rows).toEqual([]);
      await f.seed("legacy", {
        ...value,
        cost: { certainty: "measured", money: { currency: "USD", units: 13n, scale: 4 } },
      });
      const before = await f.snapshot();
      expect(
        (before.rows[0] as { body: { cost: { money: { scale?: number } } } }).body.cost.money.scale,
      ).toBeUndefined();
      await expect(f.db.exec("UPDATE metering_receipt SET cost_scale=8")).rejects.toThrow(
        "Metering receipt money scale mismatch",
      );
      await expect(
        f.db.exec("UPDATE metering_receipt SET body=jsonb_set(body,'{cost,money,scale}','8')"),
      ).rejects.toThrow("Metering receipt money scale mismatch");
      expect(await f.snapshot()).toEqual(before);
    } finally {
      await f.db.close();
    }
  },
);
