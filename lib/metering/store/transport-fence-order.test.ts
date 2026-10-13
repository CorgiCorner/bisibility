import type { PostgresExecutor } from "@usagekit/store-postgres";
import { expect, test } from "vitest";
import { ensureTimestampContract, requireTimestampContract } from "./timestamp-history";

function executor() {
  const order: string[] = [];
  const tx: PostgresExecutor = {
    async query<T>(statement: Parameters<PostgresExecutor["query"]>[0]) {
      order.push(statement.text);
      if (statement.text.includes("FROM pg_trigger"))
        return [
          {
            tables: [
              "metering_event",
              "metering_history_progress",
              "metering_import",
              "metering_operation",
              "metering_paid_attempt_context",
              "metering_receipt",
            ],
          },
        ] as T[];
      return [];
    },
    async execute(statement) {
      order.push(statement.text);
      return 1;
    },
  };
  return { tx, order };
}
test("cold adoption locks before auditing and writes truthful receipt before marker", async () => {
  const f = executor();
  await ensureTimestampContract(f.tx);
  const at = (value: string) => f.order.findIndex((sql) => sql.includes(value));
  expect(at("pg_advisory_xact_lock")).toBeLessThan(at("LOCK TABLE"));
  expect(at("LOCK TABLE")).toBeLessThan(at("FROM metering_operation o"));
  expect(at("FROM metering_operation o")).toBeLessThan(at("FROM metering_paid_attempt_context a"));
  expect(at("FROM metering_paid_attempt_context a")).toBeLessThan(
    at("INSERT INTO metering_metadata"),
  );
  expect(f.order.filter((sql) => sql.includes("INSERT INTO metering_metadata"))).toHaveLength(2);
});
test("read-only missing marker refuses without adoption locks or writes", async () => {
  const f = executor();
  await expect(requireTimestampContract(f.tx)).rejects.toThrow("prior UTC write adoption");
  expect(f.order.some((sql) => /LOCK TABLE|pg_advisory|INSERT|UPDATE/.test(sql))).toBe(false);
});
