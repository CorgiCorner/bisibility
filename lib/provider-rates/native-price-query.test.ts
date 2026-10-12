import { createUsageTables } from "@/lib/metering/usage.test-fixture";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, expect, test } from "vitest";
import { loadNativeMeasuredPrice, nativePriceQuery } from "./native-price-query";
import type { NativePriceBinding, NativePriceSample } from "./native-price-samples";

const binding: NativePriceBinding = {
  namespace: "prices",
  principal: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "dataforseo",
  providerCredentialVersion: "v1",
  fundingSource: "byok",
};
const operation = "serp.google.organic.live.advanced";
const options = { depth: "100" };
const now = new Date("2026-10-11T12:00:00Z");
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

async function seed(
  id: string,
  input: { options?: unknown; source?: string; proof?: unknown; corrected?: boolean } = {},
) {
  const requestOptions = input.options ?? options;
  await db.query("INSERT INTO metering_operation VALUES($1,$2,$3,$1,$4,'settled',$5)", [
    id,
    binding.namespace,
    binding.principal,
    JSON.stringify({
      scope: {
        group: binding.projectId,
        connection: binding.connectionId,
        providerCredentialVersion: "v1",
      },
      fundingSource: "byok",
      provider: binding.provider,
      operation,
    }),
    now,
  ]);
  await db.query("INSERT INTO metering_paid_attempt_context VALUES($1,$2,$3,$4,NULL,NULL)", [
    binding.namespace,
    id,
    binding.principal,
    JSON.stringify({
      requestPricing: input.proof ?? {
        version: 1,
        provider: binding.provider,
        operation,
        options: requestOptions,
      },
    }),
  ]);
  await db.query("INSERT INTO metering_receipt VALUES($1,$2,$1,0,$3,$4,'measured',15500)", [
    `receipt-${id}`,
    id,
    JSON.stringify({ source: input.source ?? "dispatch", cached: false, failed: false }),
    now,
  ]);
  if (input.corrected)
    await db.query("INSERT INTO metering_receipt VALUES($1,$2,$1,1,$3,$4,'unknown',NULL)", [
      `correction-${id}`,
      id,
      JSON.stringify({ source: "dispatch", cached: false, failed: false }),
      now,
    ]);
}

async function read(policy = binding) {
  const sql = nativePriceQuery(policy, operation, options, now);
  return (await db.query<NativePriceSample>(sql.text, sql.values)).rows;
}

test("selects native exact request prices and respects latest corrections, provenance and scope", async () => {
  await seed("matching");
  await seed("shallow", { options: { depth: "10" } });
  await seed("legacy", { proof: { feature: "rank_check" } });
  await seed("import", { source: "import" });
  await seed("corrected", { corrected: true });
  await seed("mismatched-proof", {
    proof: { version: 1, provider: binding.provider, operation, options: { depth: "10" } },
  });
  expect((await read()).map((row) => row.operationId)).toEqual(["matching"]);
  expect((await read())[0]?.costCents).toBe("1.5500");
  expect(await read({ ...binding, fundingSource: "platform" })).toEqual([]);
  for (const field of [
    "namespace",
    "principal",
    "projectId",
    "connectionId",
    "provider",
    "providerCredentialVersion",
  ] as const) {
    expect(await read({ ...binding, [field]: "foreign" })).toEqual([]);
  }
});

test("loads the exact native median from SQL without accounting writes", async () => {
  for (let index = 0; index < 5; index += 1) await seed(`measured-${index}`);
  const client = {
    $queryRaw: async (sql: { text: string; values: unknown[] }) =>
      (await db.query(sql.text, sql.values)).rows,
  };
  const price = await loadNativeMeasuredPrice(
    client as Parameters<typeof loadNativeMeasuredPrice>[0],
    binding,
    operation,
    options,
    now,
  );
  expect(price).toEqual({
    quantity: { unit: "cents", value: 155n, scale: 2 },
    samples: 5,
    basis: "call",
    checkedAt: now.toISOString(),
  });
});
