import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordConnectionAccountFailure } from "./account-failure";
import { checkRecoveryAccount } from "./check-account";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, probe: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "default" }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "fixture", password: "fixture" }),
}));
vi.mock("./probe", async (original) => ({
  ...(await original<typeof import("./probe")>()),
  runAccountProbe: shared.probe,
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let publicId: string;
const connectionId = "live-liveowner";
const version = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope);
const input = () => ({
  projectId: "liveowner",
  projectPublicId: "unused",
  connectionPublicId: publicId,
  actorId: "closeout-owner",
});
const failure = (code: "provider_billing" | "provider_account_restricted") =>
  recordConnectionAccountFailure({
    connectionId,
    projectId: "liveowner",
    provider: "dataforseo",
    credentialVersion: version,
    fact: { kind: "failure", code, scope: { kind: "account" } },
    minimumCapacity: 0.01,
    capacityUnit: "usd",
  });
beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = fixture.db;
  publicId = (
    await fixture.db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })
  ).publicId;
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs();
  if (fixture) await fixture.close();
});
it("persists provider cooldown across incidents and enforces it for manual checks", async () => {
  await failure("provider_billing");
  await fixture.db.providerConnectionRecovery.update({
    where: { connectionId },
    data: { nextCheckAt: new Date(Date.now() - 1000) },
  });
  const before = Date.now();
  shared.probe.mockResolvedValueOnce({
    fact: {
      kind: "failure",
      code: "provider_rate_limited",
      scope: { kind: "account" },
      retryAfterMs: 7_200_000,
    },
  });
  await checkRecoveryAccount({ ...input(), actorId: null, automatic: true });
  const first = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(first.providerCooldownUntil?.getTime()).toBeGreaterThanOrEqual(before + 7_200_000);
  await failure("provider_account_restricted");
  const next = await fixture.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(next.currentIncidentId).not.toBe(first.currentIncidentId);
  expect(next.providerCooldownUntil).toEqual(first.providerCooldownUntil);
  expect(next.nextCheckAt?.getTime()).toBeGreaterThanOrEqual(
    first.providerCooldownUntil?.getTime() ?? 0,
  );
  shared.probe.mockClear();
  expect((await checkRecoveryAccount(input())).accountState).toBe("cooldown");
  expect(shared.probe).not.toHaveBeenCalled();
  await fixture.db.providerConnection.update({
    where: { id: connectionId },
    data: { credentialsEncrypted: "replacement-envelope" },
  });
  shared.probe.mockResolvedValueOnce({
    fact: { kind: "not_verified", scope: { kind: "account" } },
  });
  await checkRecoveryAccount(input());
  expect(shared.probe).toHaveBeenCalledOnce();
  expect(
    (await fixture.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } }))
      .providerCooldownUntil,
  ).toBeNull();
});
