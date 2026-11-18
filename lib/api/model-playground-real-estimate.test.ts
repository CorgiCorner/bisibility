import "./model-playground-real.test-helpers";
import { modelPlaygroundRuntimeBindings } from "@/lib/model-playground/runtime-factory";
import { expect, it, vi } from "vitest";
import { realServiceHarness, seams } from "./model-playground-real.test-helpers";
import { modelPlaygroundCreateSchema } from "./model-playground-schemas";
import { camelizeKeys } from "./surface";

const h = realServiceHarness();
const readAuth = () => ({
  ...h.auth,
  apiKey: { ...h.auth.apiKey, scopes: ["read"] },
});
const bindingFields = [
  "quote_id",
  "preview_id",
  "quote_token",
  "expires_at",
  "config_hash",
  "account_digest",
  "credential_version",
  "capability_version",
  "budget",
];

/** Every table in the fixture schema: model playground, payment, metering and budget rows. */
async function rowCounts() {
  return (await tableSnapshot()).counts;
}

/** Row count and content digest of every table, so an UPDATE or insert-then-delete shows up. */
async function tableSnapshot() {
  const tables = await h.sql.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  const digests: Record<string, string> = {};
  for (const { name } of tables.rows) {
    const row = (
      await h.sql.query<{ n: string; digest: string }>(
        `SELECT count(*) AS n, md5(coalesce(string_agg(t::text, ',' ORDER BY t::text), '')) AS digest
         FROM "${name}" t`,
      )
    ).rows[0];
    counts[name] = Number(row.n);
    digests[name] = row.digest;
  }
  return { counts, digests };
}

function expectNoBindingFields(value: Record<string, unknown>) {
  expect(Object.keys(value).sort()).toEqual([
    "budget_available",
    "estimated_at",
    "forecasts",
    "version",
  ]);
  // Budget is yes/no only: no amount, limit or usage figure.
  expect(typeof value.budget_available).toBe("boolean");
  const text = JSON.stringify(value);
  for (const field of bindingFields) expect(text).not.toContain(`"${field}"`);
}

it("gives a read key an estimate through the real service without writing or probing", async () => {
  const before = await tableSnapshot();
  const response = await h.request("POST", "runs/estimate", h.input, "ignored-key", readAuth());
  expect(response.status).toBe(200);
  const data = (await response.json()).data;
  expect(data).toMatchObject({
    version: 1,
    budget_available: true,
    forecasts: [
      {
        column_id: h.input.columns[0].columnId,
        money: { amount: null, certainty: "unknown" },
        complete: false,
      },
    ],
  });
  expectNoBindingFields(data);
  expect(await tableSnapshot()).toEqual(before);
  expect(seams.provider).not.toHaveBeenCalled();
  expect(h.calls).toHaveLength(0);
  // An estimate is not a quote: create rejects its body shape.
  expect(
    modelPlaygroundCreateSchema.safeParse({
      ...(camelizeKeys(data) as object),
      consent: "non_guaranteed_estimate_v1",
    }).success,
  ).toBe(false);
  const create = await h.request(
    "POST",
    "runs",
    {
      ...(camelizeKeys(data) as object),
      consent: "non_guaranteed_estimate_v1",
    },
    "estimate-as-quote",
  );
  expect(create.status).toBe(400);
  expect(await tableSnapshot()).toEqual(before);
});

it("uses a catalog cached by an earlier read without a second provider call", async () => {
  expect((await h.request("GET", h.catalogPath(), undefined, undefined, readAuth())).status).toBe(
    200,
  );
  const probes = seams.provider.mock.calls.length;
  const before = await tableSnapshot();
  // The valuation runs only when the production runtime's cache peek finds the catalog.
  const binding = h.context.columns[0];
  modelPlaygroundRuntimeBindings.valuation = () => ({
    policy: binding.binding.policy,
    rateCard: binding.binding.rateCard,
    forecast: { ...binding.forecast, amount: "0.25" },
    advisory: { cents: "25", basis: "rate_card" },
  });
  try {
    const response = await h.request("POST", "runs/estimate", h.input, undefined, readAuth());
    expect(response.status).toBe(200);
    expect((await response.json()).data.forecasts).toEqual([
      expect.objectContaining({
        column_id: h.input.columns[0].columnId,
        money: expect.objectContaining({ amount: "0.25", certainty: "estimated" }),
        complete: true,
      }),
    ]);
  } finally {
    delete modelPlaygroundRuntimeBindings.valuation;
  }
  expect(seams.provider.mock.calls.length).toBe(probes);
  expect(await tableSnapshot()).toEqual(before);
});

it("estimates on a read-only project while preview stays refused", async () => {
  await h.sql.query("UPDATE projects SET \"writeMode\"='migration_hold'");
  const held = {
    ...h.auth,
    project: { ...h.project, writeMode: "migration_hold" },
  };
  const before = await tableSnapshot();
  const estimate = await h.request("POST", "runs/estimate", h.input, undefined, {
    ...held,
    apiKey: { ...held.apiKey, scopes: ["read"] },
  });
  expect(estimate.status).toBe(200);
  expect((await h.request("POST", "runs/preview", h.input, undefined, held)).status).toBe(423);
  expect(await tableSnapshot()).toEqual(before);
});

it("keeps the write-scope preview binding and stored", async () => {
  const before = await rowCounts();
  const quoteId = await h.preview();
  const after = await rowCounts();
  expect(quoteId).toBeTruthy();
  expect(after.model_playground_payment_quotes).toBe(before.model_playground_payment_quotes + 1);
  expect(after.model_playground_previews).toBe(before.model_playground_previews + 1);
  expect((await h.request("POST", "runs/preview", h.input, undefined, readAuth())).status).toBe(
    403,
  );
});

it("never records an acted activity for the estimate", async () => {
  const { recordApiAction } = await import("./activity");
  const { modelPlaygroundPolicies } = await import("./model-playground-registry");
  const activity = await import("@/lib/activity/record-extension");
  const record = vi.spyOn(activity, "recordUserActivity").mockImplementation(() => undefined);
  const seen = {
    userId: "u",
    email: "user@example.com",
    channel: "api" as const,
    interactive: true,
  };
  recordApiAction(
    seen,
    "POST",
    {
      ...modelPlaygroundPolicies.estimateModelPlaygroundRun,
      operationId: "estimateModelPlaygroundRun",
    },
    "read",
  );
  expect(record).not.toHaveBeenCalled();
  recordApiAction(
    seen,
    "POST",
    {
      ...modelPlaygroundPolicies.previewModelPlaygroundRun,
      operationId: "previewModelPlaygroundRun",
    },
    "write",
  );
  expect(record).toHaveBeenCalledWith({ ...seen, kind: "acted" });
});
