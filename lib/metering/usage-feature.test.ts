import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { createUsageTables, seedTestUsage } from "./usage.test-fixture";
import { canonicalUsageSql } from "./usage-sql";

vi.mock("./runtime", () => ({ meteringNamespace: () => "default" }));
const db = new PGlite();
beforeEach(async () => {
  await db.exec(
    "DROP TABLE IF EXISTS metering_paid_attempt_context, metering_measurement, metering_receipt, metering_operation",
  );
  await createUsageTables(db);
});
afterAll(async () => {
  await db.close();
});

test("catalog operation identifiers retain their independent business reporting feature", async () => {
  await seedTestUsage(db, {
    id: "catalog",
    feature: "serp.google.organic.live.advanced",
    costCents: 2,
  });
  await db.query(
    "UPDATE metering_paid_attempt_context SET context=context || $1::jsonb WHERE operation_id='catalog'",
    [JSON.stringify({ feature: "rank_check" })],
  );
  const sql = canonicalUsageSql("default");
  const rows = (await db.query<{ id: string; feature: string }>(sql.text, sql.values)).rows;
  expect(rows.find((row) => row.id === "catalog")?.feature).toBe("rank_check");
});

test("historical operations with no separate feature keep their existing projection", async () => {
  await seedTestUsage(db, { id: "historical", feature: "keyword_research", costCents: 2 });
  const sql = canonicalUsageSql("default");
  const rows = (await db.query<{ id: string; feature: string }>(sql.text, sql.values)).rows;
  expect(rows.find((row) => row.id === "historical")?.feature).toBe("keyword_research");
});
