import { prisma } from "@/lib/db/prisma";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { decryptSecret } from "@/lib/providers/crypto";
import { dataForSeoOrganicDecision } from "@/lib/providers/serp/dataforseo-payload";
import converterFixture from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import sourceFixture from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import { claimQueuedPersistenceLease } from "./queued-persistence-lease";
import {
  QueuedSourceEvidenceError,
  readQueuedSource,
  retainQueuedSource,
  withQueuedSourceEvidence,
} from "./queued-source-evidence";
import { collectQueuedSource } from "./queued-source-result";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "./queued-source-schema";

const mocks = vi.hoisted(() => ({
  credentials: { login: "fixture-login", password: "fixture-password" },
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn(async () => {}) }));
vi.mock("@/lib/measurement-definitions/worker-collection", () => ({
  retainedQueuedDefinition: async () => ({
    id: "binding",
    request: { domain: "site18.example.com", depth: 20 },
  }),
}));
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: { assertRetrieval: async () => false },
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => mocks.credentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
  writeCooldown: () => {},
}));
vi.mock("./queued-hosted-results", () => ({
  queuedHostedRecovery: async () => null,
  explicitQueuedGetCostCents: () => 0,
}));

const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");
const url = process.env.METERING_TEST_DATABASE_URL;

async function claimedTask() {
  const fixture = await recoveryFixture({ queued: true });
  const taskId = fixture.identity.queuedTaskId as string;
  const lease = await prisma.$transaction((tx) => claimQueuedPersistenceLease(taskId, tx));
  if (!lease) throw new Error("Fixture lease was not claimed.");
  const providerTaskId = `native-provider-${taskId}`;
  await prisma.queuedRankCheckTask.update({ where: { id: taskId }, data: { providerTaskId } });
  const task = {
    id: taskId,
    providerTaskId,
    rankCheckId: fixture.check.id,
    keywordId: fixture.keyword.id,
    recoveryContextHash: null,
    keyword: { projectId: fixture.project.id },
    batch: {
      connection: { id: fixture.connection.id, credentialSource: "own", credentialsEncrypted: "x" },
    },
  };
  return { fixture, lease, task };
}

function sourceResponse(providerTaskId: string, title?: string) {
  const response = structuredClone(sourceFixture);
  response.tasks[0].id = providerTaskId;
  if (title) response.tasks[0].result[0].items[0].title = title;
  Object.assign(response.tasks[0].data, { login: "fixture-login", password: "fixture-password" });
  return response;
}

function stubProvider(providerTaskId: string, title?: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("goto_url_converter")
      ? new Response(JSON.stringify(converterFixture.response), { status: 200 })
      : new Response(JSON.stringify(sourceResponse(providerTaskId, title)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const evidenceReason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof QueuedSourceEvidenceError ? error.reason : error),
  );

describe.skipIf(!url)("queued source evidence on the migrated schema", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", KEY_A);
    mocks.credentials = { login: "fixture-login", password: "fixture-password" };
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => prisma.$disconnect());

  it("retains the source once, replays it after a crash and survives a keyring rotation", async () => {
    const { lease, task } = await claimedTask();
    const fetchMock = stubProvider(task.providerTaskId);
    const signal = new AbortController().signal;

    expect(await collectQueuedSource(task as never, lease, signal)).toBe("pending");
    const captured = await prisma.providerPartialEvidence.findMany({
      where: { rankCheckId: task.rankCheckId },
    });
    expect(captured).toEqual([
      expect.objectContaining({
        kind: "unresolved",
        schemaVersion: QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION,
        returnedDepth: null,
      }),
    ]);
    expect(captured[0].payloadEncrypted).not.toContain("SYNTHGOTO001");
    const retained = JSON.parse(decryptSecret(captured[0].payloadEncrypted));
    expect(retained.data.tasks[0].data).not.toHaveProperty("login");
    expect(retained.data.tasks[0].data).not.toHaveProperty("password");

    // Conversion is its own pass and keeps its progress beside the source.
    expect(await collectQueuedSource(task as never, lease, signal)).toBe("pending");
    expect(
      await prisma.providerPartialEvidence.count({ where: { rankCheckId: task.rankCheckId } }),
    ).toBe(2);

    // The primary key rotates; the retained source and its binding remain valid.
    vi.stubEnv("BISIBILITY_SECRETS_KEY", KEY_B);
    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", KEY_A);
    const replay = await collectQueuedSource(task as never, lease, signal);
    if (replay === "pending") throw new Error("Unexpected pending source.");
    expect(dataForSeoOrganicDecision(replay.items, "site18.example.com", 20)).toMatchObject({
      outcome: "match",
      position: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("converter")),
    ).toHaveLength(1);
  });

  it("classifies deterministic source failures as permanent and store failures as transient", async () => {
    const { lease, task } = await claimedTask();
    const fetchMock = stubProvider(task.providerTaskId);
    const signal = new AbortController().signal;
    expect(await collectQueuedSource(task as never, lease, signal)).toBe("pending");
    const [row] = await prisma.providerPartialEvidence.findMany({
      where: { rankCheckId: task.rankCheckId },
    });
    const retained = JSON.parse(decryptSecret(row.payloadEncrypted));

    // Credentials edited mid-flight no longer match the retained binding.
    mocks.credentials = { login: "fixture-login", password: "changed-password" };
    expect(await evidenceReason(collectQueuedSource(task as never, lease, signal))).toBe(
      "identity_mismatch",
    );
    expect(fetchMock).toHaveBeenCalledOnce();

    expect(
      await evidenceReason(retainQueuedSource(retained.identity, { other: true }, lease)),
    ).toBe("conflict");
    expect(
      await evidenceReason(
        retainQueuedSource(retained.identity, { body: "x".repeat(4 * 1024 * 1024) }, lease),
      ),
    ).toBe("oversize");
    await expect(
      retainQueuedSource(retained.identity, retained.data, { ...lease, owner: "other" }),
    ).rejects.toBeInstanceOf(RankCheckClosedBeforePersistenceError);

    await prisma.providerPartialEvidence.update({
      where: { id: row.id },
      data: { identityHash: "tampered" },
    });
    expect(await evidenceReason(readQueuedSource(retained.identity))).toBe("unreadable");

    // The foreign key to the check is enforced; that failure is not deterministic for the task.
    const orphan = { ...retained.identity, rankCheckId: "missing-check", taskId: "orphan" };
    expect(
      await evidenceReason(withQueuedSourceEvidence(() => retainQueuedSource(orphan, {}, lease))),
    ).toBe("store_unavailable");
  });

  it("fails closed on a secret in the source but retains an echoed account login", async () => {
    const secret = await claimedTask();
    stubProvider(secret.task.providerTaskId, "Synthetic fixture-password title");
    const signal = new AbortController().signal;
    // The response stays in memory so usage can settle before the check fails.
    const unretained = await collectQueuedSource(secret.task as never, secret.lease, signal);
    if (unretained === "pending") throw new Error("Unexpected pending source.");
    expect(unretained.evidenceFailure?.reason).toBe("credential_echo");
    expect(
      await prisma.providerPartialEvidence.count({
        where: { rankCheckId: secret.task.rankCheckId },
      }),
    ).toBe(0);

    const login = await claimedTask();
    stubProvider(login.task.providerTaskId, "Contact fixture-login for help");
    expect(await collectQueuedSource(login.task as never, login.lease, signal)).toBe("pending");
    expect(
      await prisma.providerPartialEvidence.count({
        where: { rankCheckId: login.task.rankCheckId },
      }),
    ).toBe(1);
  });
});
