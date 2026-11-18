import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { fixture, migration, upstream } from "./schema-upgrade.test-fixture";
import { receipt } from "./test-data";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.resolve("@usagekit/store-postgres")), "utf8"),
);
const [release, prerelease] = version.split("-");
expect(
  release.localeCompare("0.12.0", undefined, { numeric: true }) > 0 ||
    (release === "0.12.0" && prerelease === undefined),
  "This branch requires the published 0.12.0 lockfile; install store-postgres >= 0.12.0",
).toBe(true);

test.each([
  ["modified checksum", "version integer PRIMARY KEY, checksum text NOT NULL", "(1,'modified')"],
  ["NULL checksum", "version integer PRIMARY KEY, checksum text", "(1,NULL)"],
  ["missing primary key", "version integer NOT NULL, checksum text NOT NULL", ""],
  ["nullable version", "version integer, checksum text NOT NULL", "(NULL,'modified')"],
  [
    "stray version 2",
    "version integer PRIMARY KEY, checksum text NOT NULL",
    "(2,'0cdaea0943a153357cb4a1aa4b27a6fd73943410ff06247babe234829b76caee')",
  ],
])("refuses %s before altering receipts", async (_name, columns, row) => {
  const f = await fixture();
  try {
    await f.seed("retained", receipt());
    const before = await f.snapshot();
    await f.db.exec(`CREATE TABLE metering_schema_version(${columns})`);
    if (row) await f.db.exec(`INSERT INTO metering_schema_version VALUES${row}`);
    await expect(f.db.exec(await migration())).rejects.toThrow(
      /Unsupported or modified metering schema/,
    );
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.db.close();
  }
});

test("accepts exactly the upstream {1,2} ledger on rerun without rewriting receipts", async () => {
  const f = await fixture();
  try {
    await f.seed("retained", receipt());
    await f.db.exec(await migration());
    const before = await f.snapshot();
    await f.db.exec(await migration());
    expect(await f.snapshot()).toEqual(before);
    const { schemaMigrations } = await upstream();
    expect(
      (await f.db.query("SELECT * FROM metering_schema_version ORDER BY version")).rows,
    ).toEqual(
      schemaMigrations.map((statements, index) => ({
        version: index + 1,
        checksum: createHash("sha256").update(statements.join("\n")).digest("hex"),
      })),
    );
  } finally {
    await f.db.close();
  }
});

test("accepts an exact version-1 ledger and bootstraps only version 2", async () => {
  const f = await fixture();
  try {
    const { schemaMigrations } = await upstream();
    await f.db.exec(
      "CREATE TABLE metering_schema_version(version integer PRIMARY KEY, checksum text NOT NULL)",
    );
    await f.db.query("INSERT INTO metering_schema_version VALUES(1,$1)", [
      createHash("sha256")
        .update((schemaMigrations[0] ?? []).join("\n"))
        .digest("hex"),
    ]);
    await f.db.exec(await migration());
    expect(
      (await f.db.query("SELECT version FROM metering_schema_version ORDER BY version")).rows,
    ).toEqual([{ version: 1 }, { version: 2 }]);
  } finally {
    await f.db.close();
  }
});

test("refuses a modified version-2 checksum on rerun", async () => {
  const f = await fixture();
  try {
    await f.db.exec(await migration());
    await f.db.exec("UPDATE metering_schema_version SET checksum='modified' WHERE version=2");
    const before = await f.snapshot();
    await expect(f.db.exec(await migration())).rejects.toThrow(
      "Unsupported or modified metering schema history",
    );
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.db.close();
  }
});

test("out-of-range backfill aborts the column, version rows and every receipt mutation", async () => {
  const f = await fixture();
  try {
    await f.seed("valid", {
      ...receipt(),
      cost: { certainty: "measured", money: { currency: "USD", units: 13n, scale: 4 } },
    });
    await f.seed("invalid", {
      ...receipt(),
      cost: { certainty: "measured", money: { currency: "USD", units: 13n, scale: 19 } },
    });
    const before = await f.snapshot();
    await expect(f.db.exec(await migration())).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
    expect(
      (await f.db.query("SELECT to_regclass('metering_schema_version') AS name")).rows,
    ).toEqual([{ name: null }]);
  } finally {
    await f.db.close();
  }
});

test("failure of the last ledger statement leaves no column or version rows", async () => {
  const f = await fixture();
  try {
    await f.seed("retained", receipt());
    const before = await f.snapshot();
    const sql = (await migration()).replace("VALUES (2,", "VALUES (1 / 0,");
    expect(sql).not.toBe(await migration());
    await expect(f.db.exec(sql)).rejects.toThrow("division by zero");
    expect(await f.snapshot()).toEqual(before);
    expect(
      (await f.db.query("SELECT to_regclass('metering_schema_version') AS name")).rows,
    ).toEqual([{ name: null }]);
  } finally {
    await f.db.close();
  }
});

test("resumes after the exact schema-2 column was added before a prior failure", async () => {
  const f = await fixture();
  try {
    const { moneyScaleStatements } = await upstream();
    await f.db.exec(moneyScaleStatements[0] as string);
    await f.db.exec(await migration());
    expect(await f.costColumns()).toEqual([
      { column_default: "4", is_nullable: "NO", data_type: "integer" },
    ]);
  } finally {
    await f.db.close();
  }
});

test("refuses a conflicting existing cost_scale definition", async () => {
  const f = await fixture();
  try {
    await f.db.exec("ALTER TABLE metering_receipt ADD COLUMN cost_scale integer DEFAULT 0");
    const before = await f.snapshot();
    await expect(f.db.exec(await migration())).rejects.toThrow(
      "Unsupported or modified metering cost_scale",
    );
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.db.close();
  }
});
