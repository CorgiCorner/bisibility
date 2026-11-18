import { readFileSync } from "node:fs";
import type { Receipt } from "@usagekit/core";
import { createPostgresStore, migratePostgresStore } from "@usagekit/store-postgres";
import { expect, test } from "vitest";
import { fixture, migration, upstream } from "./schema-upgrade.test-fixture";
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

test("upgrades host tables and preserves legacy writes with no settlement policy", async () => {
  const f = await fixture();
  const { schema } = f;
  try {
    await expect(createPostgresStore(f.options)).rejects.toMatchObject({
      name: "PostgresSchemaVersionError",
      actualVersion: 0,
      requiredVersion: 2,
    });
    const before = receipt();
    await f.seed("retained", before);
    await f.db.exec(await migration());
    // The package migrator validates both immutable upstream checksums without doing DDL.
    await migratePostgresStore(f.options);
    const store = await createPostgresStore(f.options);
    expect(
      (await store.getOperation({ namespace: "test", principal: "u1", operationId: "retained" }))
        ?.receipts,
    ).toEqual([before]);
    const after = { ...receipt(), id: "old-writer-after-upgrade" };
    await f.seed("retained", after, 1);
    expect(
      (await f.db.query(`SELECT cost_scale FROM ${schema}.metering_receipt ORDER BY sequence`))
        .rows,
    ).toEqual([{ cost_scale: 4 }, { cost_scale: 4 }]);
    const reserved = await store.reserve(request("new-writer"));
    if (reserved.outcome !== "reserved") throw new Error("Reservation fixture failed");
    const granted = await store.markDispatchIntent({
      ...command(reserved.operation),
      holder: "worker",
      leaseTtlMs: 1000,
    });
    if (!("granted" in granted) || !granted.granted) throw new Error("Dispatch fixture failed");
    const settled = await store.settle({
      ...command(granted.operation),
      authority: { kind: "lease", leaseId: granted.lease.leaseId },
      receipt: { ...receipt(), cost: { certainty: "unknown", money: null } },
    });
    expect(settled).toMatchObject({ outcome: "settled", operation: { state: "pending" } });
  } finally {
    await f.db.close();
  }
});

test("adds the version ledger only in the selected non-public schema", async () => {
  const f = await fixture();
  const { schema } = f;
  const neighbor = `${schema}_neighbor`;
  try {
    await f.db.exec(
      `CREATE SCHEMA ${neighbor}; CREATE TABLE ${neighbor}.metering_schema_version(version integer PRIMARY KEY, checksum text); INSERT INTO ${neighbor}.metering_schema_version VALUES(99,'sentinel')`,
    );
    await f.db.exec(`SET search_path TO ${schema},${neighbor}`);
    await f.db.exec(await migration());
    expect((await f.db.query(`SELECT * FROM ${neighbor}.metering_schema_version`)).rows).toEqual([
      { version: 99, checksum: "sentinel" },
    ]);
    expect(
      (await f.db.query(`SELECT version FROM ${schema}.metering_schema_version ORDER BY version`))
        .rows,
    ).toEqual([{ version: 1 }, { version: 2 }]);
    await migratePostgresStore(f.options);
  } finally {
    await f.db.close();
  }
});

test("preserves stored precision and canonicalizes only explicit legacy scale", async () => {
  const f = await fixture();
  const { schema } = f;
  try {
    await f.seed("scale", {
      ...receipt(),
      id: "legacy",
      cost: { certainty: "measured", money: { currency: "USD", units: 13n, scale: 4 } },
    });
    await f.seed(
      "scale",
      {
        ...receipt(),
        id: "fine",
        cost: { certainty: "measured", money: { currency: "USD", units: 13n, scale: 8 } },
      },
      1,
    );
    await f.db.exec(await migration());
    expect(
      (
        await f.db.query(
          `SELECT receipt_id,cost_scale,body->'cost'->'money'->>'scale' AS json_scale FROM ${schema}.metering_receipt ORDER BY sequence`,
        )
      ).rows,
    ).toEqual([
      { receipt_id: "legacy", cost_scale: 4, json_scale: null },
      { receipt_id: "fine", cost_scale: 8, json_scale: "8" },
    ]);
    await expect(
      f.db.query(`UPDATE ${schema}.metering_receipt SET cost_scale=19`),
    ).rejects.toThrow();
  } finally {
    await f.db.close();
  }
});

test("refuses unknown history before altering receipts", async () => {
  const f = await fixture();
  const { schema } = f;
  try {
    await f.db.exec(
      "CREATE TABLE metering_schema_version(version integer PRIMARY KEY, checksum text NOT NULL); INSERT INTO metering_schema_version VALUES(1,'modified')",
    );
    await expect(f.db.exec(await migration())).rejects.toThrow(
      "Unsupported or modified metering schema history",
    );
    expect(
      (
        await f.db.query(
          "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema=$1 AND table_name='metering_receipt' AND column_name='cost_scale'",
          [schema],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await f.db.close();
  }
});

test("never commits its caller's transaction", async () => {
  const f = await fixture();
  const { schema } = f;
  try {
    await f.db.exec("BEGIN");
    await f.db.exec(await migration());
    await f.db.exec("ROLLBACK");
    expect(
      (await f.db.query("SELECT to_regclass('metering_schema_version') AS name")).rows,
    ).toEqual([{ name: null }]);
    expect(
      (
        await f.db.query(
          "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema=$1 AND table_name='metering_receipt' AND column_name='cost_scale'",
          [schema],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await f.db.close();
  }
});

test("host schema 2 equals the installed library statements for every stored money shape", async () => {
  const host = await fixture();
  const library = await fixture();
  try {
    const base = receipt();
    for (const [sequence, scale] of [undefined, null, "8", 4, 8].entries()) {
      const value = {
        ...base,
        id: `money-${sequence}`,
        cost: {
          certainty: "measured" as const,
          money: {
            currency: "USD" as const,
            units: 13n,
            ...(scale === undefined ? {} : { scale: scale as number }),
          },
        },
      };
      await host.seed("scale", value, sequence);
      await library.seed("scale", value, sequence);
    }
    const noMoney = {
      ...base,
      id: "no-money",
      cost: { certainty: "unknown" as const, money: null },
    };
    await host.seed("scale", noMoney, 5);
    await library.seed("scale", noMoney, 5);
    const missingMoney = {
      ...base,
      id: "missing-money",
      cost: { certainty: "unknown" },
    } as Receipt;
    await host.seed("scale", missingMoney, 6);
    await library.seed("scale", missingMoney, 6);
    const before = await host.snapshot();
    expect(await library.snapshot()).toEqual(before);
    const { moneyScaleStatements } = await upstream();
    for (const statement of moneyScaleStatements) await library.db.exec(statement);
    await host.db.exec(await migration());
    expect(await host.snapshot()).toEqual(await library.snapshot());
    expect((await host.snapshot()).rows).toHaveLength(7);
  } finally {
    await host.db.close();
    await library.db.close();
  }
});
