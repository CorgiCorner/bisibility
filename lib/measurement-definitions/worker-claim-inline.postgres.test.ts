import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DefinitionUnavailableError } from "./errors";
import { configureDefinitionPolicy } from "./policy-config";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { assertDefinitionExecutionPermit, claimDefinitionPaidCall } from "./worker-claim";
import { assertDefinitionRunCredential } from "./worker-credential";
import { captureDefinitionItemIntent } from "./worker-intent";

let fixture: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
let keyId: string;
let tokenId: string;
let clientId: string;
beforeAll(async () => {
  fixture = await definitionDatabaseFixture();
  const config = structuredClone(fixture.config);
  config.adapters = [
    {
      providerId: "dataforseo",
      capabilityVersion: "web-serp-v1",
      adapterVersion: "dataforseo-observation-v1",
      nativeFindTargetsIn: "with_subdomains_on_match",
    },
  ];
  const epoch = await fixture.client.query(
    'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
    [fixture.project.project.id],
  );
  await configureDefinitionPolicy(
    fixture.db,
    fixture.project.writerContext,
    {
      projectId: fixture.project.project.publicId,
      expectedPolicyEpoch: epoch.rows[0].epoch,
      config,
    },
    fixture.host.recordMutation,
  );
  await fixture.db.projectDefaults.create({
    data: {
      projectId: fixture.project.project.id,
      frequency: "daily",
      timezone: "UTC",
      serpDepth: 20,
    },
  });
  await fixture.db.projectMarket.create({
    data: {
      publicId: makePublicId("pmkt"),
      projectId: fixture.project.project.id,
      locationId: fixture.observation.location.id,
      status: "active",
    },
  });
  const key = await fixture.db.apiKey.create({
    data: {
      projectId: fixture.project.project.id,
      publicId: makePublicId("key"),
      name: "Synthetic inline key",
      prefix: "synthetic",
      hashedKey: randomUUID(),
      scopes: ["write"],
    },
  });
  keyId = key.id;
  const token = await fixture.db.personalAccessToken.create({
    data: {
      publicId: makePublicId("pat"),
      userId: fixture.project.writer.id,
      name: "Synthetic inline token",
      prefix: "synthetic",
      hashedKey: randomUUID(),
      scopes: ["write"],
    },
  });
  tokenId = token.id;
  clientId = randomUUID();
  await fixture.db.oauthClient.create({
    data: {
      clientId,
      userId: fixture.project.writer.id,
      scopes: ["write"],
      contacts: [],
      redirectUris: ["https://example.com/callback"],
      postLogoutRedirectUris: [],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
    },
  });
  await fixture.db.oauthConsent.create({
    data: { clientId, userId: fixture.project.writer.id, scopes: ["write"] },
  });
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});

async function check(
  options: {
    actor?: boolean | "foreign";
    trigger?: string;
    source?: string;
    kind?: string | null;
    credential?: string | null;
    workflow?: string;
  } = {},
) {
  const keyword = await fixture.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: fixture.project.project.id,
      text: `inline fixture ${randomUUID()}`,
      locationId: fixture.observation.location.id,
      location: "Synthetic",
    },
  });
  const run = await fixture.db.rankCheckRun.create({
    data: {
      publicId: makePublicId("rcr"),
      projectId: keyword.projectId,
      requestedById:
        options.actor === "foreign"
          ? fixture.project.owner.id
          : options.actor
            ? fixture.project.writer.id
            : null,
      trigger: options.trigger ?? "api",
      source: options.source ?? "api",
      credentialKind: options.kind === undefined ? "project_key" : options.kind,
      credentialId: options.credential === undefined ? keyId : options.credential,
      status: "running",
      selectionKind: "single",
      selectionHash: randomUUID(),
      selectionSpec: { v: 1, kind: "single" },
      requestedCount: 1,
    },
  });
  const row = await fixture.db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: keyword.id,
      runId: run.id,
      provider: "dataforseo",
      status: "running",
      attemptCount: 0,
      workflowRunId: options.workflow ?? `inline-${run.publicId}`,
    },
  });
  await fixture.db.rankCheckRunItem.create({
    data: {
      runId: run.id,
      keywordId: keyword.id,
      rankCheckId: row.id,
      status: "running",
      definitionIntent: await fixture.db.$transaction((tx) =>
        captureDefinitionItemIntent(tx, keyword.projectId, keyword.id, 20),
      ),
    },
  });
  return { row, run };
}

it.each(["api", "sdk", "cli", "mcp"])(
  "claims an inline %s project-key run with no user impersonation",
  async (source) => {
    const owned = await check({ source });
    const permit = await fixture.db.$transaction((tx) =>
      claimDefinitionPaidCall(tx, owned.row.id, true),
    );
    expect(permit).not.toBeNull();
    if (!permit) throw new Error("Expected the owned inline permit.");
    assertDefinitionExecutionPermit(permit);
    expect(permit?.principal).toMatchObject({
      actorId: null,
      credentialKind: "project_key",
      credentialId: keyId,
      trigger: "api",
    });
    expect(permit?.workflowRunId).toBe(`inline-${owned.run.publicId}`);
    expect(
      await fixture.db.$transaction((tx) => claimDefinitionPaidCall(tx, owned.row.id, true)),
    ).toBeNull();
  },
);
it("keeps a user-backed manual inline run claimable", async () => {
  const owned = await check({ actor: true, trigger: "manual", kind: null, credential: null });
  const permit = await fixture.db.$transaction((tx) =>
    claimDefinitionPaidCall(tx, owned.row.id, true),
  );
  expect(permit?.principal.actorId).toBe(fixture.project.writer.id);
});
it.each(["personal_token", "oauth_client"])(
  "claims an inline %s with its original user credential",
  async (kind) => {
    const credential = kind === "personal_token" ? tokenId : clientId;
    const owned = await check({ actor: true, kind, credential });
    const permit = await fixture.db.$transaction(async (tx) => {
      await assertDefinitionRunCredential(tx, owned.run.projectId, owned.run);
      return claimDefinitionPaidCall(tx, owned.row.id, true);
    });
    expect(permit?.principal).toMatchObject({
      actorId: fixture.project.writer.id,
      credentialKind: kind,
      credentialId: credential,
      trigger: "api",
    });
    expect(
      await fixture.db.$transaction((tx) => claimDefinitionPaidCall(tx, owned.row.id, true)),
    ).toBeNull();
  },
);
it.each(["project_key", "personal_token", "oauth_client"])(
  "refuses a manual run carrying a valid %s credential instead of app-session ownership",
  async (kind) => {
    const credential =
      kind === "project_key" ? keyId : kind === "personal_token" ? tokenId : clientId;
    const owned = await check({ actor: true, trigger: "manual", kind, credential });
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertDefinitionRunCredential(tx, owned.run.projectId, owned.run);
        return claimDefinitionPaidCall(tx, owned.row.id, true);
      }),
    ).rejects.toThrow(DefinitionUnavailableError);
  },
);
it.each(["personal_token", "oauth_client"])(
  "refuses the original %s credential without that actor's grant",
  async (kind) => {
    const credential = kind === "personal_token" ? tokenId : clientId;
    const owned = await check({ actor: "foreign", kind, credential });
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertDefinitionRunCredential(tx, owned.run.projectId, owned.run);
        return claimDefinitionPaidCall(tx, owned.row.id, true);
      }),
    ).rejects.toThrow(DefinitionUnavailableError);
  },
);
it.each([
  { actor: true, trigger: "manual", kind: null, credential: "orphan-fixture" },
  { actor: true, trigger: "manual", kind: "personal_token", credential: null },
  { actor: true, trigger: "manual", kind: "project_key", credential: null },
  { actor: true, kind: null, credential: null },
  { actor: true, kind: "project_key" },
  { actor: true, kind: "personal_token", credential: null },
  { actor: true, kind: "oauth_client", credential: "" },
  { actor: true, kind: "unknown" },
  { actor: true, kind: "personal_token", source: "app" },
  { actor: true, kind: "oauth_client", source: "worker" },
  { kind: null, credential: null },
  { credential: null },
  { credential: "" },
  { kind: "personal_token" },
  { kind: "oauth_client" },
  { source: "app" },
  { source: "worker" },
  { trigger: "manual" },
  { trigger: "scheduled" },
  { workflow: "foreign-inline-workflow" },
])(
  "refuses unsupported or foreign inline ownership %j without issuing an execution permit",
  async (options) => {
    const owned = await check(options);
    await expect(
      fixture.db.$transaction((tx) => claimDefinitionPaidCall(tx, owned.row.id, true)),
    ).rejects.toThrow(DefinitionUnavailableError);
    const after = await fixture.db.rankCheck.findUniqueOrThrow({ where: { id: owned.row.id } });
    expect(after).toMatchObject({
      attemptCount: 0,
      definitionExecutionToken: null,
      definitionExecutionPrincipal: null,
    });
  },
);
