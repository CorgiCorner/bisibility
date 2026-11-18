import { generateModelResponse } from "@/lib/providers/model/transport";
import { generation, json } from "@/lib/providers/model/transport.test-support";
import { expect, it, vi } from "vitest";
import { routingCredentials } from "./attempt-provenance.test-support";
import { columnId } from "./contract-fixtures.test-support";
import {
  fitModelResultSources,
  fitsModelResult,
  jsonbTextBytes,
  MODEL_RESULT_BYTES,
} from "./result-budget";
import { generatedResult, largeResult, oversizedCitations } from "./result-budget.test-support";
import { createHarness, present } from "./store.postgres.test-support";
import { modelColumnResultSchema } from "./types";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
const { db, launch, store } = createHarness();

async function prepare() {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  const lease = { ...key, leaseToken: present(claim.leaseToken) };
  const config = generation();
  return { run, config, lease };
}

async function request(value = largeResult(), prepared?: Awaited<ReturnType<typeof prepare>>) {
  const { run, config, lease } = prepared ?? (await prepare());
  config.normalize = () => value;
  config.observer = {
    beforeDispatch: vi.fn(async () => {
      await store.fenceDispatch(lease);
    }),
    settle: vi.fn(async (_key, result) => {
      await store.complete(lease, result);
    }),
  };
  const previousFetch = globalThis.fetch;
  const fetchMock = vi.fn().mockResolvedValue(json());
  vi.stubGlobal("fetch", fetchMock);
  try {
    return { response: await generateModelResponse(config), run, config };
  } finally {
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(config.observer.settle).toHaveBeenCalledOnce();
    vi.stubGlobal("fetch", previousFetch);
  }
}

it("completes the real transport and store with maximum sources truncated once", async () => {
  const value = largeResult();
  value.routingAttemptCredentials = routingCredentials();
  expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
  const { response, run } = await request(value);
  expect(response.state).toBe("completed");
  const sources = present(response.consultedSources);
  expect(sources.truncated).toBe(true);
  expect(sources.sources.length).toBeLessThan(100);
  expect(sources.omitted).toBe(100 - sources.sources.length);
  expect(sources.total).toBe(100);
  for (const key of [
    "answer",
    "citations",
    "usage",
    "providerCost",
    "costEvidence",
    "routingAttemptCredentials",
    "paymentReceipt",
    "rawEvidenceId",
  ] as const)
    expect(response[key]).toEqual(value[key]);
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(response);
});

it.each([true, false])(
  "settles invalid_response once when citations alone cannot fit (sources=%s)",
  async (sources) => {
    const value = oversizedCitations();
    value.routingAttemptCredentials = routingCredentials();
    if (!sources) delete value.consultedSources;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
    const prepared = await prepare();
    await expect(request(value, prepared)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
    });
    const rows = await db.query<{ result: unknown }>(
      'SELECT result FROM model_playground_columns WHERE "runId"=$1',
      [prepared.run.id],
    );
    expect(rows.rows[0].result).toMatchObject({
      state: "unknown",
      failure: "invalid_response",
      answer: null,
      citations: [],
      usage: value.usage,
      providerCost: value.providerCost,
      costEvidence: value.costEvidence,
      routingAttemptCredentials: value.routingAttemptCredentials,
    });
  },
);

it("rejects oversized direct completion before SQL", async () => {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  await store.fenceDispatch({ ...key, leaseToken: claim.leaseToken });
  const query = vi.spyOn(db, "transaction");
  await expect(
    store.complete({ ...key, leaseToken: claim.leaseToken }, largeResult()),
  ).rejects.toThrow("invalid_snapshot");
  expect(query).not.toHaveBeenCalled();
  query.mockRestore();
});

it("matches PostgreSQL bytes and admits only SQL-valid generated result bounds", async () => {
  const { rows } = await db.query<{ predicate: string }>(
    `SELECT pg_get_expr(conbin, conrelid) AS predicate FROM pg_constraint
     WHERE conname='model_playground_result_shape'`,
  );
  let admitted = 0;
  let rejected = 0;
  let plain = 0;
  let routed = 0;
  for (let seed = 0; seed < 64; seed++) {
    const value = generatedResult(seed);
    if (seed % 4 === 0) {
      value.column.providerId = "anthropic";
      value.column.settings.workspaceId = `wrkspc_${"a".repeat(64)}`;
      value.resolvedWorkspaceId = `wrkspc_${"b".repeat(64)}`;
    } else if (seed % 4 === 1) {
      value.column.providerId = "vercel_ai_gateway";
      value.column.settings.allowedProviders = ["bedrock"];
      value.actualProviderId = "anthropic";
      value.routingViolation = "provider_outside_allowed_set";
    }
    if (value.resolvedWorkspaceId || value.routingViolation) routed++;
    else plain++;
    const parsed = modelColumnResultSchema.safeParse(value);
    expect(parsed.error?.issues, `seed ${seed}`).toBeUndefined();
    const fitted = present(fitModelResultSources(value));
    for (const candidate of [value, fitted]) {
      const {
        rows: [actual],
      } = await db.query<{ bytes: number; valid: boolean }>(
        `SELECT octet_length(result::text) AS bytes, ${rows[0].predicate} AS valid
         FROM (SELECT $1::jsonb AS result, ($1::jsonb)->'column' AS config,
         ($1::jsonb)->>'state' AS state) AS candidate`,
        [JSON.stringify(candidate)],
      );
      expect(jsonbTextBytes(candidate)).toBe(actual.bytes);
      if (fitsModelResult(candidate)) {
        admitted++;
        expect(actual.valid).toBe(true);
      } else {
        rejected++;
        expect(actual.valid).toBe(false);
      }
    }
    expect(modelColumnResultSchema.safeParse(fitted).success).toBe(true);
  }
  expect(plain).toBe(32);
  expect(routed).toBe(32);
  expect(admitted).toBeGreaterThan(64);
  expect(rejected).toBeGreaterThan(0);
});

it("matches scalar escaping and number expansion in PostgreSQL", async () => {
  const value = [
    1e21,
    -1e21,
    -1.2e-7,
    Number.MIN_VALUE,
    1.23e22,
    0,
    -0,
    { tiny: 1e-320, large: 1.234567890123456e21, text: '\b\f\r\t\n"\\😀é' },
    true,
    false,
    null,
  ];
  const {
    rows: [row],
  } = await db.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [
    JSON.stringify(value),
  ]);
  expect(jsonbTextBytes(value)).toBe(row.bytes);
});

it("accepts the exact byte boundary and rejects one extra byte", async () => {
  const value = present(fitModelResultSources(largeResult()));
  const sources = present(value.consultedSources);
  let remaining = MODEL_RESULT_BYTES - jsonbTextBytes(value);
  for (const source of sources.sources) {
    const count = Math.min(remaining, 512);
    source.title = "\n".repeat(count) + "a".repeat(512 - count);
    remaining -= count;
  }
  expect(remaining).toBe(0);
  expect(jsonbTextBytes(value)).toBe(MODEL_RESULT_BYTES);
  expect(fitsModelResult(value)).toBe(true);
  const {
    rows: [constraint],
  } = await db.query<{ predicate: string }>(
    "SELECT pg_get_expr(conbin, conrelid) AS predicate FROM pg_constraint WHERE conname='model_playground_result_shape'",
  );
  for (const allowed of [true, false]) {
    const {
      rows: [row],
    } = await db.query<{ valid: boolean; bytes: number }>(
      `SELECT ${constraint.predicate} AS valid, octet_length(result::text) AS bytes FROM
       (SELECT $1::jsonb AS result, ($1::jsonb)->'column' AS config, ($1::jsonb)->>'state' AS state) candidate`,
      [JSON.stringify(value)],
    );
    expect(row.valid).toBe(allowed);
    expect(row.bytes).toBe(jsonbTextBytes(value));
    expect(fitsModelResult(value)).toBe(allowed);
    const source = present(sources.sources.find((source) => source.title?.includes("a")));
    source.title = present(source.title).replace("a", "\n");
  }
});
