import assert from "node:assert/strict";
import test from "node:test";
import { verifyMigrationDiff } from "./migration-diff.mjs";

const expected = {
  name: "provider_incidents_project_cause_current", unique: true, valid: true, ready: true,
  columns: ["projectId", "cause"], predicate: '("retiredAt" IS NULL)', method: "btree",
  keyCount: 2, attributeCount: 2, hasExpressions: false,
};
function fixture(rows) {
  const queries = [];
  let captured = false;
  return {
    queries,
    captured: () => captured,
    run: () => verifyMigrationDiff({ DIRECT_URL: "postgresql://fixture:fixture@127.0.0.1/fixture?schema=owned_fixture" }, {
      createClient: () => ({ connect: async () => {}, end: async () => {}, query: async (sql, values) => { queries.push({ sql, values }); return { rows }; } }),
      verifyAdditional: async () => "",
      capture: () => { captured = true; return { status: 0, stdout: "-- This is an empty migration." }; },
    }),
  };
}
test("validates SQL-owned incident uniqueness even when Prisma reports empty drift", async () => {
  const f = fixture([expected]);
  await f.run();
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /pg_catalog\.pg_index/);
  assert.equal(f.queries[0].values[0], "owned_fixture");
  assert.equal(f.captured(), true);
});
test("rejects missing, legacy full uniqueness and malformed current partial indexes before diff", async () => {
  const variants = [[], [expected, expected], [{ ...expected, name: "provider_incidents_project_cause" }],
    ...Object.entries({ unique: false, valid: false, ready: false, columns: ["cause", "projectId"], predicate: null,
      method: "hash", keyCount: 1, attributeCount: 3, hasExpressions: true,
    }).map(([key, value]) => [{ ...expected, [key]: value }]),
  ];
  for (const rows of variants) {
    const f = fixture(rows);
    await assert.rejects(f.run(), /incident.*index/i);
    assert.equal(f.captured(), false);
  }
});
