import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { input as paidInput } from "@/lib/metering/paid-attempt-test-fixture";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { AccountFact } from "@/lib/providers/account-health/adapter";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { assertConnectionRecoveryAdmission } from "./admission";
import { checkDueProviderAccounts } from "./auto-checks";
import { claimAccountCheck } from "./check-claim";
import { finishAccountCheck } from "./check-finish";
import { readConnectionRecovery } from "./read";

const shared = vi.hoisted(() => ({
  db: null as unknown as PrismaClient,
  namespace: "default",
  limit: { success: true, resetAt: 0 },
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "fixture", password: "fixture" }),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => shared.limit,
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
const connectionId = "live-liveowner";
const version = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope) ?? "";
const fetchMock = vi.fn();

beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = fixture.db;
  shared.namespace = fixture.namespace;
  vi.stubGlobal("fetch", fetchMock);
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  if (fixture) await fixture.close();
});
beforeEach(async () => {
  fetchMock.mockReset();
  shared.limit = { success: true, resetAt: 0 };
  await fixture.db.providerConnection.update({
    where: { id: connectionId },
    data: { enabled: true, credentialsEncrypted: liveCredentialEnvelope },
  });
  await fixture.db.providerConnectionRecovery.deleteMany({ where: { connectionId } });
  await fixture.db.providerAccountIncident.deleteMany({ where: { connectionId } });
  const incident = await fixture.db.providerAccountIncident.create({
    data: {
      connectionId,
      credentialVersion: version,
      reason: "legacy_unverified",
      evidenceSource: "legacy_state",
      scope: { kind: "account" },
    },
  });
  await fixture.db.providerConnectionRecovery.create({
    data: {
      connectionId,
      credentialVersion: version,
      accountState: "unknown",
      currentIncidentId: incident.id,
    },
  });
});
async function schedule() {
  await checkDueProviderAccounts();
  const row = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(row.nextCheckAt).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  await fixture.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { nextCheckAt: new Date(Date.now() - 1000) },
  });
  return row;
}
function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
it("schedules and resolves an eligible legacy incident using one free probe", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(
    response(200, {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ balance: 1 }] }],
    }),
  );
  expect(await checkDueProviderAccounts()).toMatchObject({ checked: 1 });
  expect(
    (
      await fixture.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).not.toBeNull();
  expect(
    await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }),
  ).toMatchObject({ accountState: "verified", nextCheckAt: null });
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("converts rejected credentials to an auth incident and stops automatic checks", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(response(401, {}));
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_auth", resolvedAt: null });
  expect(
    await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }),
  ).toMatchObject({ lastProbeOutcome: "provider_auth", nextCheckAt: null });
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("converts a billing failure and follows the billing cadence", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(response(402, {}));
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_billing", resolvedAt: null });
  expect(
    await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }),
  ).toMatchObject({
    accountState: "payment_required",
    lastProbeOutcome: "provider_billing",
    nextCheckAt: expect.any(Date),
  });
});
it("converts a transient legacy probe failure and honors the retry cooldown", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(
    new Response("{}", { status: 503, headers: { "retry-after": "7200" } }),
  );
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_transient", resolvedAt: null });
  const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(recovery).toMatchObject({
    lastProbeOutcome: "provider_transient",
    nextCheckAt: expect.any(Date),
    providerCooldownUntil: expect.any(Date),
  });
  expect(recovery.nextCheckAt?.getTime()).toBeGreaterThanOrEqual(
    recovery.providerCooldownUntil?.getTime() ?? Infinity,
  );
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("converts a provider rate limit to a transient incident and honors the retry hint", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(
    new Response("{}", { status: 429, headers: { "retry-after": "5400" } }),
  );
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({
    reason: "provider_transient",
    evidenceSource: "legacy_probe",
    resolvedAt: null,
  });
  const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(recovery.providerCooldownUntil?.getTime()).toBeGreaterThan(Date.now() + 5_000_000);
  expect(recovery.nextCheckAt?.getTime()).toBeGreaterThanOrEqual(
    recovery.providerCooldownUntil?.getTime() ?? Infinity,
  );
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("converts a local limiter denial to a transient incident without calling the provider", async () => {
  const row = await schedule();
  const resetAt = Date.now() + 3_600_000;
  shared.limit = { success: false, resetAt };
  await checkDueProviderAccounts();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({
    reason: "provider_transient",
    evidenceSource: "legacy_probe",
    resolvedAt: null,
  });
  const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(recovery.providerCooldownUntil?.getTime()).toBe(resetAt);
  expect(recovery.nextCheckAt?.getTime()).toBeGreaterThanOrEqual(resetAt);
});
it.each([0, -0.25])(
  "reclassifies balance %s after a transient legacy probe as billing",
  async (balance) => {
    const row = await schedule();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await checkDueProviderAccounts();
    await fixture.db.providerConnectionRecovery.update({
      where: { connectionId },
      data: { nextCheckAt: new Date(Date.now() - 1000), providerCooldownUntil: null },
    });
    fetchMock.mockResolvedValueOnce(
      response(200, {
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ money: { balance } }] }],
      }),
    );
    await checkDueProviderAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await fixture.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      }),
    ).toMatchObject({ reason: "provider_billing", resolvedAt: null });
    expect(
      await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }),
    ).toMatchObject({ accountState: "payment_required", lastProbeOutcome: "provider_billing" });
  },
);
it("does not reclassify a transient incident that a legacy probe did not record", async () => {
  const row = await schedule();
  await fixture.db.providerAccountIncident.update({
    where: { id: row.currentIncidentId ?? "missing" },
    data: { reason: "provider_transient", evidenceSource: "provider_response" },
  });
  fetchMock.mockResolvedValueOnce(
    response(200, {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ balance: 0 }] }],
    }),
  );
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_transient", resolvedAt: null });
});
it("converts a network failure to a transient incident", async () => {
  const row = await schedule();
  fetchMock.mockRejectedValueOnce(new Error("fixture network failure"));
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_transient", resolvedAt: null });
  expect(
    (await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .nextCheckAt,
  ).toBeInstanceOf(Date);
});
it("ignores the probe result after credentials change", async () => {
  const row = await schedule();
  let finish!: (response: Response) => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  fetchMock.mockImplementationOnce(() => {
    started();
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const check = checkDueProviderAccounts();
  await pending;
  await fixture.db.providerConnection.update({
    where: { id: connectionId },
    data: { credentialsEncrypted: "rotated-fixture" },
  });
  finish(
    response(200, {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ balance: 1 }] }],
    }),
  );
  expect(await check).toMatchObject({ skipped: 1 });
  expect(
    (
      await fixture.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).toBeNull();
});
it("schedules one later check after an inconclusive legacy probe", async () => {
  await schedule();
  fetchMock.mockResolvedValueOnce(response(200, { status_code: 20000, tasks: [] }));
  await checkDueProviderAccounts();
  const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(recovery.lastProbeOutcome).toBe("provider_transient");
  expect(recovery.nextCheckAt?.getTime()).toBeGreaterThan(Date.now());
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not treat a balance below a known minimum as verified", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(response(402, {}));
  await checkDueProviderAccounts();
  await fixture.db.providerAccountIncident.update({
    where: { id: row.currentIncidentId ?? "missing" },
    data: { minimumCapacity: 2, capacityUnit: "usd" },
  });
  await fixture.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { nextCheckAt: new Date(Date.now() - 1000) },
  });
  fetchMock.mockResolvedValueOnce(
    response(200, {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ balance: 1 }] }],
    }),
  );
  await checkDueProviderAccounts();
  expect(
    (
      await fixture.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).toBeNull();
});

function unreadableBalance() {
  return response(200, {
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ money: {} }] }],
  });
}

it("schedules another check when a legacy probe cannot read the balance", async () => {
  const row = await schedule();
  fetchMock.mockResolvedValueOnce(unreadableBalance());
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({
    reason: "provider_transient",
    evidenceSource: "legacy_probe",
    resolvedAt: null,
  });
  const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(recovery.lastProbeOutcome).toBe("provider_transient");
  expect(recovery.nextCheckAt?.getTime()).toBeGreaterThan(Date.now());
  await checkDueProviderAccounts();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not convert an unreadable balance on a non-legacy incident into a legacy retry", async () => {
  const row = await schedule();
  await fixture.db.providerAccountIncident.update({
    where: { id: row.currentIncidentId ?? "missing" },
    data: {
      reason: "provider_billing",
      evidenceSource: "provider_response",
      minimumCapacity: 1,
      capacityUnit: "usd",
    },
  });
  fetchMock.mockResolvedValueOnce(unreadableBalance());
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({
    reason: "provider_billing",
    evidenceSource: "provider_response",
    resolvedAt: null,
  });
});

it.each([0, -0.25])(
  "converts legacy balance %s to billing and schedules another check",
  async (balance) => {
    const row = await schedule();
    const checkedAt = Date.now();
    fetchMock.mockResolvedValueOnce(
      response(200, {
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ money: { balance } }] }],
      }),
    );
    await checkDueProviderAccounts();
    expect(
      await fixture.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      }),
    ).toMatchObject({ reason: "provider_billing", resolvedAt: null });
    const recovery = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
      where: { connectionId },
    });
    expect(recovery).toMatchObject({
      accountState: "payment_required",
      lastProbeOutcome: "provider_billing",
      nextCheckAt: expect.any(Date),
      cadenceAttempt: 1,
    });
    expect(recovery.nextCheckAt?.getTime()).toBeGreaterThanOrEqual(checkedAt + 27 * 60_000);
    expect(recovery.nextCheckAt?.getTime()).toBeLessThanOrEqual(Date.now() + 33 * 60_000);
    expect(await readConnectionRecovery("liveowner", connectionId)).toMatchObject({
      state: "billing",
      reason: "provider_billing",
      paused: true,
      capacityUnit: "usd",
      nextCheckAt: recovery.nextCheckAt?.toISOString(),
    });
    await checkDueProviderAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it.each([
  [
    "negative capacity with a different unit",
    { kind: "capacity", value: -1, unit: "searches", scope: { kind: "account" } },
  ],
  [
    "negative capacity with a different scope",
    {
      kind: "capacity",
      value: -1,
      unit: "usd",
      scope: { kind: "capability", capability: "backlinks" },
    },
  ],
  [
    "negative infinite capacity",
    { kind: "capacity", value: -Infinity, unit: "usd", scope: { kind: "account" } },
  ],
  [
    "wrong capacity unit",
    { kind: "capacity", value: 1, unit: "searches", scope: { kind: "account" } },
  ],
  [
    "non-finite capacity",
    { kind: "capacity", value: Infinity, unit: "usd", scope: { kind: "account" } },
  ],
  [
    "different scope",
    {
      kind: "capacity",
      value: 1,
      unit: "usd",
      scope: { kind: "capability", capability: "backlinks" },
    },
  ],
] satisfies [string, AccountFact][])("does not verify %s", async (_name, fact) => {
  const row = await schedule();
  const connection = await fixture.db.providerConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  const input = {
    projectId: "liveowner",
    projectPublicId: "fixture",
    connectionPublicId: connection.publicId,
    actorId: null,
    automatic: true,
  };
  const claim = await claimAccountCheck(input);
  if (claim.status !== "claimed") throw new Error("Expected a probe claim");
  expect(await finishAccountCheck(input, claim, { fact })).toBe("unknown");
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "legacy_unverified", resolvedAt: null });
});

it("preserves a known billing incident when credentials are rejected", async () => {
  const row = await schedule();
  await fixture.db.providerAccountIncident.update({
    where: { id: row.currentIncidentId ?? "missing" },
    data: {
      reason: "provider_billing",
      evidenceSource: "provider_response",
      minimumCapacity: 1,
      capacityUnit: "usd",
    },
  });
  fetchMock.mockResolvedValueOnce(response(401, {}));
  await checkDueProviderAccounts();
  expect(
    await fixture.db.providerAccountIncident.findUniqueOrThrow({
      where: { id: row.currentIncidentId ?? "missing" },
    }),
  ).toMatchObject({ reason: "provider_billing", resolvedAt: null });
  expect(
    (await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .nextCheckAt,
  ).toBeNull();
});

it("keeps the deferred batch sealed and admits a future scheduled occurrence", async () => {
  const row = await schedule();
  const location = await fixture.db.location.create({
    data: {
      kind: "country",
      displayName: "Fixture",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "Fixture",
      secondaryGeoName: "",
      canonicalKey: "legacy-probe-fixture",
    },
  });
  const keyword = await fixture.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: "liveowner",
      text: "example",
      location: "Fixture",
      locationId: location.id,
    },
  });
  const check = await fixture.db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: keyword.id,
      provider: "dataforseo",
      status: "deferred",
      deferredReason: "provider_account_blocked",
      trigger: "scheduled",
    },
  });
  const batch = await fixture.db.queuedRankCheckBatch.create({
    data: {
      id: "legacy-batch-fixture",
      projectId: "liveowner",
      connectionId,
      priority: "high",
      source: "app",
      trigger: "scheduled",
      state: "deferred",
      claimedAt: new Date(),
      queueDeadlineAt: new Date(),
      tasks: {
        create: {
          id: "legacy-task-fixture",
          keywordId: keyword.id,
          rankCheckId: check.id,
          state: "deferred",
        },
      },
    },
  });
  await fixture.db.providerBlockedAttempt.create({
    data: {
      rankCheckId: check.id,
      connectionId,
      credentialVersion: version,
      incidentId: row.currentIncidentId,
      refusalKey: row.currentIncidentId ?? "missing",
      reason: "account_blocked",
      transportPhase: "not_sent",
    },
  });
  const nextCheck = await fixture.db.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: keyword.id,
      provider: "dataforseo",
      status: "running",
      trigger: "scheduled",
      checkedAt: new Date(Date.now() + 60_000),
      scheduledAt: new Date(Date.now() + 60_000),
    },
  });
  const next = paidInput("next-scheduled-fixture", connectionId).reservation;
  next.scope.group = "liveowner";
  next.scope.namespace = fixture.namespace;
  next.scope.providerCredentialVersion = version;
  expect(nextCheck.trigger).toBe("scheduled");
  await expect(
    fixture.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, next, version, new Date()),
    ),
  ).rejects.toMatchObject({ reason: "account_blocked" });
  fetchMock.mockResolvedValueOnce(
    response(200, {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ balance: 1 }] }],
    }),
  );
  await checkDueProviderAccounts();
  expect(
    await fixture.db.queuedRankCheckBatch.findUniqueOrThrow({ where: { id: batch.id } }),
  ).toMatchObject({ state: "deferred" });
  expect(await fixture.db.rankCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({
    status: "deferred",
    deferredReason: "provider_account_blocked",
  });
  await expect(
    fixture.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, next, version, new Date()),
    ),
  ).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
