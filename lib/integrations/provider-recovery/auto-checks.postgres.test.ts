import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordConnectionAccountFailure } from "./account-failure";
import { checkDueProviderAccounts } from "./auto-checks";
import { checkRecoveryAccount } from "./check-account";

const shared = vi.hoisted(() => ({
  db: null as unknown as PrismaClient,
  namespace: "default",
  probe: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "test", password: "test" }),
}));
vi.mock("./probe", async (original) => ({
  ...(await original<typeof import("./probe")>()),
  runAccountProbe: shared.probe,
}));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let publicId: string;
const connectionId = "live-liveowner";
const version = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope);
const ready = { fact: { kind: "capacity", value: 1, unit: "usd", scope: { kind: "account" } } };
const notVerified = { fact: { kind: "not_verified", scope: { kind: "account" } } };
const input = () => ({
  projectId: "liveowner",
  projectPublicId: "unused",
  connectionPublicId: publicId,
  actorId: "closeout-owner",
});
async function block(code: "provider_billing" | "provider_auth" | "provider_account_restricted") {
  await recordConnectionAccountFailure({
    connectionId,
    projectId: "liveowner",
    provider: "dataforseo",
    credentialVersion: version,
    fact: { kind: "failure", code, scope: { kind: "account" } },
    minimumCapacity: 0.01,
    capacityUnit: "usd",
  });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { lastManualCheckAt: null, nextCheckAt: new Date(Date.now() - 1000) },
  });
  return f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } });
}
function delayedProbe() {
  let start!: () => void;
  let finish!: (value: unknown) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  shared.probe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
        start();
      }),
  );
  return { started, finish: (value: unknown) => finish(value) };
}
beforeAll(async () => {
  f = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = f.db;
  shared.namespace = f.namespace;
  publicId = (await f.db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } }))
    .publicId;
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs();
  if (f) await f.close();
});

it("deduplicates concurrent automatic and manual checks and preserves financial history", async () => {
  const row = await block("provider_billing");
  const tables = [
    "metering_operation",
    "metering_receipt",
    "metering_budget_usage",
    "rank_checks",
    "keyword_schedules",
    "provider_blocked_attempts",
  ];
  const snapshot = async () => {
    const rows = [];
    for (const table of tables)
      rows.push(
        (
          await f.client.query(
            `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM ${table} t`,
          )
        ).rows,
      );
    return rows;
  };
  const history = await snapshot();
  const pending = delayedProbe();
  const automatic = checkRecoveryAccount({ ...input(), actorId: null, automatic: true });
  await pending.started;
  const manual = await checkRecoveryAccount(input());
  expect(manual.accountState).toBe("checking");
  expect(shared.probe).toHaveBeenCalledTimes(1);
  pending.finish(ready);
  expect((await automatic).accountState).toBe("verified");
  expect(
    (
      await f.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: row.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).not.toBeNull();
  expect(await snapshot()).toEqual(history);
  expect(
    await f.db.auditLog.count({
      where: { action: "provider.recovery_account_checked", actorId: null, targetId: publicId },
    }),
  ).toBe(1);
});

it("ignores a late result after a new incident and reclaims an expired lease", async () => {
  await block("provider_billing");
  shared.probe.mockClear();
  const pending = delayedProbe();
  const old = checkRecoveryAccount(input());
  await pending.started;
  const newer = await block("provider_account_restricted");
  expect((await checkRecoveryAccount(input())).accountState).toBe("checking");
  expect(shared.probe).toHaveBeenCalledTimes(1);
  pending.finish(ready);
  expect((await old).accountState).toBe("stale");
  expect(
    (
      await f.db.providerAccountIncident.findUniqueOrThrow({
        where: { id: newer.currentIncidentId ?? "missing" },
      })
    ).resolvedAt,
  ).toBeNull();
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: {
      probeId: "crashed",
      leaseOwner: "crashed",
      leaseExpiresAt: new Date(Date.now() - 1000),
      lastManualCheckAt: null,
    },
  });
  shared.probe.mockResolvedValueOnce({ ...notVerified, timedOut: true });
  expect((await checkRecoveryAccount(input())).accountState).toBe("unknown");
  const current = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(current.probeId).not.toBeNull();
  expect(current.currentIncidentId).toBe(newer.currentIncidentId);
  expect((await checkRecoveryAccount(input())).accountState).toBe("checking");
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });
  expect((await checkRecoveryAccount(input())).accountState).toBe("cooldown");
});

it("initializes a previously unscheduled incident after a crashed manual lease", async () => {
  await block("provider_billing");
  const now = Date.now();
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: {
      nextCheckAt: null,
      cadenceAttempt: 0,
      checkedAt: new Date(now - 180_000),
      lastManualCheckAt: new Date(now - 120_000),
      probeId: "crashed",
      leaseOwner: "crashed",
      leaseExpiresAt: new Date(now - 60_000),
    },
  });
  shared.probe.mockClear();
  await checkDueProviderAccounts();
  const row = await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } });
  expect(row.nextCheckAt).not.toBeNull();
  expect(row.leaseOwner).toBeNull();
  expect(shared.probe).not.toHaveBeenCalled();
});

it("preserves a billing incident and stops polling after invalid credentials", async () => {
  const row = await block("provider_billing");
  shared.probe.mockClear();
  const allowManual = () =>
    f.db.providerConnectionRecovery.update({
      where: { connectionId },
      data: { lastManualCheckAt: null },
    });
  await allowManual();
  shared.probe.mockResolvedValueOnce({
    fact: { kind: "failure", code: "provider_auth", scope: { kind: "account" } },
  });
  await checkRecoveryAccount(input());
  const authPause = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(authPause).toMatchObject({
    accountState: "payment_required",
    currentIncidentId: row.currentIncidentId,
    lastProbeOutcome: "provider_auth",
    nextCheckAt: null,
  });
  await allowManual();
  shared.probe.mockResolvedValueOnce(notVerified);
  await checkRecoveryAccount(input());
  expect(
    await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }),
  ).toMatchObject({ lastProbeOutcome: "provider_auth", nextCheckAt: null });
  shared.probe.mockClear();
  await checkDueProviderAccounts();
  expect(shared.probe).not.toHaveBeenCalled();
  await block("provider_auth");
  shared.probe.mockClear();
  await checkDueProviderAccounts();
  expect(shared.probe).not.toHaveBeenCalled();
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .nextCheckAt,
  ).toBeNull();
});

it("discards late results after disconnect or credential rotation", async () => {
  await block("provider_billing");
  const first = delayedProbe();
  const disconnected = checkRecoveryAccount(input());
  await first.started;
  await f.db.providerConnection.update({ where: { id: connectionId }, data: { enabled: false } });
  await checkDueProviderAccounts();
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .nextCheckAt,
  ).toBeNull();
  first.finish(ready);
  expect((await disconnected).accountState).toBe("stale");
  await f.db.providerConnection.update({ where: { id: connectionId }, data: { enabled: true } });
  await f.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { probeId: null, leaseOwner: null, leaseExpiresAt: null, lastManualCheckAt: null },
  });
  const second = delayedProbe();
  const rotated = checkRecoveryAccount(input());
  await second.started;
  await f.db.providerConnection.update({
    where: { id: connectionId },
    data: { credentialsEncrypted: "replacement" },
  });
  second.finish(ready);
  expect((await rotated).accountState).toBe("stale");
  expect(
    (await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .accountState,
  ).not.toBe("verified");
});
