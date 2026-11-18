import { expect, it } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { createHarness } from "./store.postgres.test-support";
import { modelColumnResultSchema } from "./types";

const { db, store, launch, snapshot } = createHarness();
// Synthetic observed workspace and eligibility evidence.
function workspace() {
  const value = result();
  value.column.providerId = "anthropic";
  value.column.settings.workspaceId = "wrkspc_RequestedSynthetic";
  value.resolvedWorkspaceId = "wrkspc_ObservedSynthetic";
  return value;
}
function gateway() {
  const value = result();
  value.column.providerId = "vercel_ai_gateway";
  value.column.settings.allowedProviders = ["bedrock"];
  value.actualProviderId = "anthropic";
  value.routingViolation = "provider_outside_allowed_set";
  return value;
}
async function sqlValid(value: unknown) {
  const {
    rows: [constraint],
  } = await db.query<{ predicate: string }>(
    "SELECT pg_get_expr(conbin, conrelid) AS predicate FROM pg_constraint WHERE conname='model_playground_result_shape'",
  );
  const {
    rows: [row],
  } = await db.query<{ valid: boolean }>(
    `SELECT ${constraint.predicate} AS valid FROM (SELECT $1::jsonb AS result, ($1::jsonb)->'column' AS config, ($1::jsonb)->>'state' AS state) candidate`,
    [JSON.stringify(value)],
  );
  return row.valid;
}
it.each([workspace, gateway])(
  "admits documented routing evidence and old rows without changing their state",
  async (fixture) => {
    expect(await sqlValid(result())).toBe(true);
    const value = fixture();
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
    expect(await sqlValid(value)).toBe(true);
  },
);
it("keeps SQL and contract routing rules in agreement with positive controls", async () => {
  const a = workspace();
  const b = gateway();
  const invalid = [
    { ...a, resolvedWorkspaceId: "invalid" },
    { ...a, resolvedWorkspaceId: "wrkspc_a\n" },
    { ...a, resolvedWorkspaceId: { id: "wrkspc_a" } },
    { ...a, column: { ...a.column, providerId: "openai" } },
    {
      ...b,
      column: { ...b.column, settings: { ...b.column.settings, allowedProviders: ["Bedrock"] } },
    },
    {
      ...b,
      column: {
        ...b.column,
        settings: { ...b.column.settings, allowedProviders: ["not-a-documented-provider"] },
      },
    },
    { ...a, resolvedWorkspaceId: `wrkspc_${"a".repeat(65)}` },
    { ...b, resolvedWorkspaceId: null },
    { ...a, routingViolation: "provider_outside_allowed_set" },
    { ...b, routingViolation: "provider said secret" },
    { ...b, routingViolation: null },
    { ...b, actualProviderId: "bedrock" },
    { ...b, actualProviderId: null },
    { ...b, column: { ...b.column, settings: { ...b.column.settings, allowedProviders: [] } } },
    {
      ...b,
      column: {
        ...b.column,
        settings: { ...b.column.settings, allowedProviders: ["bedrock", "bedrock"] },
      },
    },
  ];
  for (const value of invalid) {
    expect(await sqlValid(a)).toBe(true);
    expect(await sqlValid(b)).toBe(true);
    expect(modelColumnResultSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    expect(await sqlValid(value), JSON.stringify(value)).toBe(false);
  }
});

it.each([workspace, gateway])(
  "round-trips frozen settings and observed routing through the real store",
  async (fixture) => {
    const value = fixture();
    await db.query(
      `DELETE FROM provider_connections WHERE "projectId"='project-a' AND provider=$1 AND "publicId"<>$2`,
      [value.column.providerId, value.column.connectionId],
    );
    await db.query('UPDATE provider_connections SET provider=$1 WHERE "publicId"=$2', [
      value.column.providerId,
      value.column.connectionId,
    ]);
    const frozen = snapshot();
    frozen.input.columns = [value.column];
    const run = await launch(frozen);
    const key = { projectId: "project-a", runId: run.id, columnId: value.column.columnId };
    const claim = await store.claim({ ...key, leaseSeconds: 60 });
    if (!claim?.leaseToken) throw new Error("Missing claim");
    const lease = { ...key, leaseToken: claim.leaseToken };
    await store.fenceDispatch(lease);
    await store.complete(lease, value);
    expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
  },
);
