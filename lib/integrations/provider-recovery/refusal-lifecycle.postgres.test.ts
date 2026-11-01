import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { input } from "@/lib/metering/paid-attempt-test-fixture";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordConnectionAccountFailure } from "./account-failure";
import { assertConnectionRecoveryAdmission } from "./admission";
import { checkRecoveryAccount } from "./check-account";
import { recordRankRefusals } from "./refusal-journal";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, namespace: "default" }));
const probe = vi.hoisted(() => vi.fn());
vi.mock("./probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./probe")>()),
  runAccountProbe: probe,
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "test", password: "test" }),
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
const now = new Date("2026-10-28T14:00:00Z");
const connectionId = "live-liveowner";
const version = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope);
const request = input("next", connectionId).reservation;
request.scope.group = "liveowner";
beforeAll(async () => {
  f = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = f.db;
  shared.namespace = f.namespace;
  request.scope.namespace = f.namespace;
  await f.db.providerConnectionRecovery.create({
    data: { connectionId, credentialVersion: version ?? "", accountState: "unknown" },
  });
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});

it("records a legacy account pause using its existing recovery version", async () => {
  const early = new Date(now.getTime() - 3600000);
  const refusal = await f.db
    .$transaction((tx) => assertConnectionRecoveryAdmission(tx, request, version, early))
    .catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(ProviderRecoveryAdmissionError);
  if (!(refusal instanceof ProviderRecoveryAdmissionError)) throw new Error("Missing refusal");
  await recordRankRefusals(f.db, {
    connectionId,
    credentialVersion: version,
    checks: [{ rankCheckId: "legacy-check" }],
    refusal,
  });
  await recordRankRefusals(f.db, {
    connectionId,
    credentialVersion: version,
    checks: [{ rankCheckId: "legacy-check" }],
    refusal,
  });
  const rows = await f.db.providerBlockedAttempt.findMany({
    where: { rankCheckId: "legacy-check" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.incidentId).toBe(rows[0]?.refusalKey);
});

it("keeps a rotated legacy pause separate from the old credential incident", async () => {
  const previous = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: {
      credentialVersion: "rotated-version",
      accountState: "unknown",
      version: { increment: 1 },
    },
  });
  const refusal = await f.db
    .$transaction((tx) =>
      assertConnectionRecoveryAdmission(
        tx,
        request,
        "rotated-version",
        new Date(now.getTime() - 3600000),
      ),
    )
    .catch((error: unknown) => error);
  expect(refusal).toMatchObject({ reason: "account_blocked", incidentId: null });
  if (!(refusal instanceof ProviderRecoveryAdmissionError)) throw new Error("Missing refusal");
  await recordRankRefusals(f.db, {
    connectionId,
    credentialVersion: "rotated-version",
    checks: [{ rankCheckId: "rotated-check" }],
    refusal,
  });
  const row = await f.db.providerBlockedAttempt.findFirstOrThrow({
    where: { rankCheckId: "rotated-check" },
  });
  expect(row.incidentId).not.toBe(previous.currentIncidentId);
  expect(
    (
      await f.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.incidentId ?? "missing" },
      })
    ).credentialVersion,
  ).toBe("rotated-version");
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: {
      credentialVersion: version ?? "",
      accountState: "unknown",
      currentIncidentId: previous.currentIncidentId,
    },
  });
});

it("does not invent a resolution when the legacy state changes before journaling", async () => {
  await f.db.providerAccountIncident.updateMany({
    where: { connectionId },
    data: { resolvedAt: new Date() },
  });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { currentIncidentId: null, accountState: "unknown", version: { increment: 1 } },
  });
  const refusal = await f.db
    .$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, request, version, new Date(now.getTime() - 3600000)),
    )
    .catch((error: unknown) => error);
  if (!(refusal instanceof ProviderRecoveryAdmissionError)) throw new Error("Missing refusal");
  const count = await f.db.providerAccountIncident.count({ where: { connectionId } });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "verified", version: { increment: 1 } },
  });
  await expect(
    recordRankRefusals(f.db, {
      connectionId,
      credentialVersion: version,
      checks: [{ rankCheckId: "stale-legacy-check" }],
      refusal,
    }),
  ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  expect(await f.db.providerAccountIncident.count({ where: { connectionId } })).toBe(count);
});

it("journals accounting refusals once per check without inventing an incident", async () => {
  if (!version) throw new Error("Missing credential fixture");
  const incidentCount = await f.db.providerAccountIncident.count({ where: { connectionId } });
  const input = {
    connectionId,
    credentialVersion: version,
    checks: [{ rankCheckId: "recovery-check-2" }, { rankCheckId: "recovery-check-3" }],
    refusal: new ProviderRecoveryAdmissionError("accounting_review", { kind: "account" }),
  };
  await recordRankRefusals(f.db, input);
  await recordRankRefusals(f.db, input);
  const rows = await f.db.providerBlockedAttempt.findMany({
    where: { refusalKey: `accounting:${version}` },
  });
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.incidentId === null)).toBe(true);
  expect(await f.db.providerAccountIncident.count({ where: { connectionId } })).toBe(incidentCount);
  await recordRankRefusals(f.db, { ...input, credentialVersion: "rotated-version" });
  expect(
    await f.db.providerBlockedAttempt.count({
      where: { connectionId, rankCheckId: "recovery-check-2" },
    }),
  ).toBe(2);
});

it("limits a typed restriction to its declared capability", async () => {
  await f.db.providerAccountIncident.updateMany({
    where: { connectionId },
    data: { resolvedAt: new Date() },
  });
  await recordConnectionAccountFailure({
    connectionId,
    projectId: "liveowner",
    provider: "dataforseo",
    credentialVersion: version,
    fact: {
      kind: "failure",
      code: "provider_account_restricted",
      scope: { kind: "capability", capability: "rank_check" },
    },
  });
  const early = new Date(now.getTime() - 3600000);
  await expect(
    f.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, request, version, early, "rank_check"),
    ),
  ).rejects.toMatchObject({
    reason: "account_blocked",
    scope: { kind: "capability", capability: "rank_check" },
  });
  await expect(
    f.db.$transaction((tx) =>
      assertConnectionRecoveryAdmission(tx, request, version, early, "backlinks"),
    ),
  ).resolves.toBeUndefined();
});

it("extends, resolves only at sufficient capacity, then creates a new incident", async () => {
  await f.db.providerAccountIncident.updateMany({
    where: { connectionId },
    data: { resolvedAt: new Date() },
  });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "verified", currentIncidentId: null },
  });
  const failure = {
    connectionId,
    projectId: "liveowner",
    provider: "dataforseo",
    credentialVersion: version,
    fact: { kind: "failure", code: "provider_billing", scope: { kind: "account" } },
    minimumCapacity: 0.01,
    capacityUnit: "usd",
  } as const;
  await recordConnectionAccountFailure(failure);
  const first = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  await recordConnectionAccountFailure(failure);
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .currentIncidentId,
  ).toBe(first.currentIncidentId);
  const connection = await f.db.providerConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  const check = () =>
    checkRecoveryAccount({
      projectId: "liveowner",
      projectPublicId: "project",
      connectionPublicId: connection.publicId,
      actorId: "closeout-owner",
    });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "verified" },
  });
  probe.mockResolvedValueOnce({ fact: { kind: "not_verified", scope: { kind: "account" } } });
  expect((await check()).view).toMatchObject({ paused: true });
  expect(
    (
      await f.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: first.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).toBeNull();
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { accountState: "payment_required", lastManualCheckAt: null },
  });
  probe.mockResolvedValueOnce({
    fact: { kind: "capacity", value: 0.001, unit: "usd", scope: { kind: "account" } },
  });
  await check();
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .accountState,
  ).toBe("payment_required");
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { lastManualCheckAt: null },
  });
  probe.mockResolvedValueOnce({
    fact: { kind: "capacity", value: 0.02, unit: "usd", scope: { kind: "account" } },
  });
  await check();
  const resolved = await f.db.providerAccountIncident.findUniqueOrThrow({
    where: { id: first.currentIncidentId ?? "missing" },
  });
  expect(resolved.resolvedAt).not.toBeNull();
  await recordConnectionAccountFailure(failure);
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .currentIncidentId,
  ).not.toBe(first.currentIncidentId);
  expect(
    (await f.db.providerAccountIncident.findUniqueOrThrow({ where: { id: resolved.id } }))
      .resolvedAt,
  ).not.toBeNull();
});
