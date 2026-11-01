import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { listNotificationsForScope } from "@/lib/notifications/feed";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { rankRunAccountBlocks } from "@/lib/queries/rank-check-run-account-blocks";
import { rankRunDeferralReasons } from "@/lib/queries/rank-check-run-reasons";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { recordConnectionAccountFailure } from "./account-failure";
import { readMonitoringAccountBlocks } from "./monitoring";
import { readNotSentChecks } from "./not-sent-checks";
import { readConnectionRecovery } from "./read";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, namespace: "default" }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
const connectionId = "live-liveowner";
const runPublicId = makePublicId("rcr");
const credentialVersion = ownCredentialVersion("dataforseo", connectionId, liveCredentialEnvelope);
const fact = { kind: "failure", code: "provider_billing", scope: { kind: "account" } } as const;
const record = () =>
  recordConnectionAccountFailure({
    projectId: "liveowner",
    connectionId,
    provider: "dataforseo",
    credentialVersion,
    fact,
  });

beforeAll(async () => {
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  f = await closeoutPostgresFixture({ live: true, schemaOnly: true });
  shared.db = f.db;
  shared.namespace = f.namespace;
  const location = await f.db.location.create({
    data: {
      kind: "country",
      displayName: "US",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "US",
      canonicalKey: "account-block-view",
    },
  });
  const keyword = await f.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: "liveowner",
      text: "fixture",
      location: "US",
      locationId: location.id,
    },
  });
  const run = await f.db.rankCheckRun.create({
    data: {
      publicId: runPublicId,
      projectId: "liveowner",
      trigger: "scheduled",
      selectionKind: "all",
      selectionSpec: {},
      selectionHash: "fixture",
      status: "completed",
    },
  });
  await f.db.rankCheck.createMany({
    data: [
      {
        id: "view-completed",
        runId: run.id,
        checkedAt: new Date("2026-10-28T10:00:00Z"),
        publicId: makePublicId("check"),
        keywordId: keyword.id,
        provider: "serpapi",
        status: "completed",
        viaFallback: true,
      },
      {
        id: "view-deferred",
        runId: run.id,
        checkedAt: new Date("2026-10-28T10:01:00Z"),
        publicId: makePublicId("check"),
        keywordId: keyword.id,
        provider: "dataforseo",
        status: "deferred",
        deferredReason: "provider_account_blocked",
      },
      {
        id: "view-failed",
        runId: run.id,
        checkedAt: new Date("2026-10-28T10:02:00Z"),
        publicId: makePublicId("check"),
        keywordId: keyword.id,
        provider: "serpapi",
        status: "failed",
      },
    ],
  });
  await record();
  await record();
  const recovery = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  if (!recovery.currentIncidentId || !credentialVersion) throw new Error("Missing incident");
  const attempt = {
    connectionId,
    incidentId: recovery.currentIncidentId,
    refusalKey: recovery.currentIncidentId,
    credentialVersion,
    reason: "account_blocked",
    transportPhase: "not_sent",
  };
  await f.db.providerBlockedAttempt.createMany({
    data: [
      { ...attempt, rankCheckId: "view-completed" },
      { ...attempt, rankCheckId: "view-deferred" },
      { ...attempt, rankCheckId: "view-failed" },
    ],
  });
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs();
  if (f) await f.close();
});

it("deduplicates incident notification through the existing policy", async () => {
  const rows = await f.db.notification.findMany({
    where: { projectId: "liveowner", type: "provider_incident" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.payload).toMatchObject({
    kind: "account_block",
    provider: "DataForSEO",
    reason: "provider_billing",
  });
});
it("counts unsent connection attempts separately from final results and accounting", async () => {
  const view = await readConnectionRecovery("liveowner", connectionId);
  expect(view).toMatchObject({
    reason: "provider_billing",
    checksNotSent: 3,
    currentIncidentChecksNotSent: 3,
    fallbackCompleted: 1,
    fallbackProviders: ["serpapi"],
    unconfirmedRequests: 0,
  });
  const list = await readNotSentChecks("liveowner", connectionId, null);
  expect(list.total).toBe(3);
  expect(list.rows.map((row) => row.outcome).sort()).toEqual(["completed", "deferred", "failed"]);
  expect((await readNotSentChecks("other-project", connectionId, null)).total).toBe(0);
  const blocks = await readMonitoringAccountBlocks("liveowner");
  expect(blocks).toEqual([expect.objectContaining({ provider: "DataForSEO", deferred: 1 })]);
  expect(JSON.stringify({ view, list, blocks })).not.toContain(liveCredentialEnvelope);
});

it("retains resolved incident history while counting a new incident separately", async () => {
  const old = await f.db.providerConnectionRecovery.findUniqueOrThrow({ where: { connectionId } });
  if (!old.currentIncidentId) throw new Error("Missing old incident");
  await f.db.providerAccountIncident.update({
    where: { id: old.currentIncidentId },
    data: { resolvedAt: new Date() },
  });
  await record();
  const current = await f.db.providerConnectionRecovery.findUniqueOrThrow({
    where: { connectionId },
  });
  expect(current.currentIncidentId).not.toBe(old.currentIncidentId);
  const view = await readConnectionRecovery("liveowner", connectionId);
  expect(view).toMatchObject({ checksNotSent: 3, currentIncidentChecksNotSent: 0 });
  expect((await readNotSentChecks("liveowner", connectionId, null)).total).toBe(3);
  expect(
    await f.db.notification.count({ where: { projectId: "liveowner", type: "provider_incident" } }),
  ).toBe(2);
  expect(
    (await readNotSentChecks("liveowner", connectionId, null, new Date("2020-01-01T00:00:00Z")))
      .total,
  ).toBe(0);
});

it("exposes typed run reasons only inside the authorized project", async () => {
  expect((await rankRunDeferralReasons("liveowner", [runPublicId])).get(runPublicId)).toEqual([
    "provider_account_blocked",
  ]);
  expect((await rankRunDeferralReasons("foreign-project", [runPublicId])).size).toBe(0);
});

it("shows only the current open account incident in the notification feed", async () => {
  const rows = await listNotificationsForScope(
    { userId: "closeout-owner", activeProjectId: "liveowner" },
    { openIncidents: true, locale: "en" },
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.title).toContain("DataForSEO");
  expect(rows[0]?.href).toContain("/providers");
});

it("projects connection-specific typed refusals for completed and deferred items", async () => {
  const blocks = await rankRunAccountBlocks("liveowner", ["view-completed", "view-deferred"]);
  expect(blocks.get("view-completed")).toEqual([
    expect.objectContaining({ provider: "DataForSEO", reason: "provider_billing" }),
  ]);
  expect(blocks.get("view-deferred")).toEqual(blocks.get("view-completed"));
  expect((await rankRunAccountBlocks("foreign-project", ["view-completed"])).size).toBe(0);
});
