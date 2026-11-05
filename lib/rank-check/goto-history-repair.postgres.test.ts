import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { encryptSecret } from "@/lib/providers/crypto";
import converter from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import heavy from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { gotoHistoryCommandExitCode } from "./goto-history-command";
import { repairGotoHistory } from "./goto-history-repair";
import { preparedRankRecoveryContext } from "./recovery-context";

const refreshOperationIncident = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/provider-evidence/incidents/refresh", () => ({ refreshOperationIncident }));

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>> | undefined;

const now = new Date("2026-11-03T12:00:00.000Z");
const checkedAt = new Date("2026-10-31T12:00:00.000Z");
const credentials = async () => ({ login: "fixture", password: "synthetic" });
let userId = "";
let projectId = "";
let locationId = "";
let connectionId = "";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

const fetchImpl: typeof fetch = async (input, _init) => {
  const url = String(input);
  if (url.includes("task_post") || url.includes("tasks_ready")) throw new Error("paid");
  if (url.includes("goto_url_converter")) return json(converter.response);
  if (url.includes("/task_get/")) {
    const id = decodeURIComponent(url.split("/").at(-1) ?? "");
    const body = structuredClone(heavy);
    const task = body.tasks[0];
    if (task) task.id = id;
    return json(body);
  }
  throw new Error("unexpected request");
};

async function silence() {
  return {
    alerts: await prisma.triggeredAlert.count({ where: { keyword: { projectId } } }),
    digests: await prisma.weeklyDigestSend.count({ where: { projectId } }),
    notifications: await prisma.notification.count({ where: { projectId } }),
  };
}

async function seed(
  text: string,
  runStatus: string,
  extra: { deletedAt?: Date; hash?: string | null; lease?: Date } = {},
) {
  const run = await prisma.rankCheckRun.create({
    data: {
      deletedAt: extra.deletedAt,
      finishedAt: checkedAt,
      projectId,
      publicId: makePublicId("rcr"),
      selectionHash: randomUUID(),
      selectionKind: "single",
      selectionSpec: {},
      status: runStatus,
      trigger: "manual",
    },
  });
  const keyword = await prisma.keyword.create({
    data: { location: "United States", locationId, projectId, publicId: makePublicId("kw"), text },
  });
  const check = await prisma.rankCheck.create({
    data: {
      checkedAt,
      comparisonAllowed: true,
      costCents: "12.5000",
      errorCode: "provider_unresolved_redirects",
      finishedAt: checkedAt,
      keywordId: keyword.id,
      preRecoveryFinishedAt: checkedAt,
      provider: "dataforseo",
      publicId: makePublicId("check"),
      requestedDepth: 20,
      runId: run.id,
      status: "failed",
    },
  });
  const batch = await prisma.queuedRankCheckBatch.create({
    data: {
      claimedAt: checkedAt,
      connectionId,
      id: randomUUID(),
      priority: "normal",
      projectId,
      queueDeadlineAt: checkedAt,
      runId: run.id,
      state: "terminal",
    },
  });
  await prisma.queuedRankCheckTask.create({
    data: {
      batchId: batch.id,
      createdAt: checkedAt,
      id: randomUUID(),
      keywordId: keyword.id,
      persistenceLeaseExpiresAt: extra.lease,
      providerTaskId: randomUUID(),
      rankCheckId: check.id,
      recoveryContextHash:
        extra.hash === undefined
          ? preparedRankRecoveryContext(
              { ...keyword, locationRef: { id: locationId, languageCode: "en" } },
              "site1.example.com",
              20,
            )
          : extra.hash,
      state: "failed",
    },
  });
  await prisma.rankCheckRunItem.create({
    data: {
      finishedAt: checkedAt,
      keywordId: keyword.id,
      rankCheckId: check.id,
      runId: run.id,
      status: "failed",
    },
  });
  return check;
}

describe("historical GoTo repair PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await closeoutPostgresFixture({ schemaOnly: true });
    shared.db = fixture.db;
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: "History",
        publicId: makePublicId("usr"),
      },
    });
    userId = user.id;
    const location = await prisma.location.create({
      data: {
        canonicalKey: randomUUID(),
        countryCode: "US",
        displayName: "United States",
        gl: "us",
        hl: "en",
        kind: "country",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    });
    locationId = location.id;
    const project = await prisma.project.create({
      data: {
        domain: "site1.example.com",
        name: "History",
        ownerId: userId,
        publicId: makePublicId("prj"),
      },
    });
    projectId = project.id;
    const connection = await prisma.providerConnection.create({
      data: {
        kind: "serp",
        projectId,
        provider: "dataforseo",
        publicId: makePublicId("conn"),
        status: "connected",
      },
    });
    connectionId = connection.id;
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (fixture) await fixture.close();
  });

  it("restores the original check once, keeps the ledger cost, and stays silent", async () => {
    const open = await seed("open", "failed");
    const cancelled = await seed("cancelled", "cancelled");
    const deleted = await seed("deleted", "failed", { deletedAt: now });
    const leased = await seed("leased", "failed", { lease: new Date(now.getTime() + 60_000) });
    const drifted = await seed("drifted", "failed", { hash: "ab".repeat(32) });
    const ids = [open.id, cancelled.id, deleted.id, leased.id, drifted.id];
    const before = await silence();
    const preview = await repairGotoHistory({
      checkIds: ids,
      fetch: fetchImpl,
      limit: 10,
      now,
      resolveCredentials: credentials,
    });
    expect(preview).toMatchObject({ mode: "dry-run", providerCalls: 0, restored: 0, writes: 0 });
    vi.stubEnv("PROVIDER_RECOVERY", "observe");
    const observed = await repairGotoHistory({
      apply: true,
      checkIds: ids,
      fetch: fetchImpl,
      limit: 10,
      now,
      resolveCredentials: credentials,
    });
    expect(observed.mode).toBe("dry-run");
    expect(observed.writes).toBe(0);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    const applied = await repairGotoHistory({
      apply: true,
      checkIds: ids,
      fetch: fetchImpl,
      limit: 10,
      now,
      resolveCredentials: credentials,
    });
    const restored = await prisma.rankCheck.findUniqueOrThrow({ where: { id: open.id } });
    expect(applied.restored).toBe(1);
    expect(applied.skipReasons).toMatchObject({ scope_changed: 1 });
    expect(await prisma.rankCheckResultEvidence.count({ where: { rankCheckId: drifted.id } })).toBe(
      0,
    );
    expect(restored.publicId).toBe(open.publicId);
    expect(restored.checkedAt.toISOString()).toBe(checkedAt.toISOString());
    expect(restored.finishedAt?.toISOString()).toBe(checkedAt.toISOString());
    expect(restored.costCents).toBeNull();
    expect(restored.status).toBe("completed");
    expect(restored.position).toBe(2);
    expect(restored.comparisonAllowed).toBe(false);
    expect(restored.recoveryRestoredAt).toEqual(now);
    for (const id of [cancelled.id, deleted.id, leased.id, drifted.id]) {
      const row = await prisma.rankCheck.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("failed");
      expect(row.position).toBeNull();
      expect(Number(row.costCents)).toBe(12.5);
    }
    const again = await repairGotoHistory({
      apply: true,
      checkIds: ids,
      fetch: fetchImpl,
      limit: 10,
      now,
      resolveCredentials: credentials,
    });
    expect(again.restored).toBe(0);
    expect(again.writes).toBe(0);
    expect(await silence()).toEqual(before);
    expect(refreshOperationIncident).not.toHaveBeenCalled();
  });

  it("requalifies an unresolved page without completing it, then does nothing", async () => {
    const check = await seed("unresolved", "failed");
    const unresolved: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("goto_url_converter")) {
        const request = JSON.parse(String(init?.body)) as Array<{ goto_urls: string[] }>;
        return json({
          status_code: 20000,
          tasks: [
            {
              result: request[0]?.goto_urls.map((goto) => ({ goto, url: null })),
              status_code: 20000,
            },
          ],
        });
      }
      return fetchImpl(input, init);
    };
    const first = await repairGotoHistory({
      apply: true,
      checkIds: [check.id],
      fetch: unresolved,
      limit: 5,
      now,
      resolveCredentials: credentials,
    });
    expect(first.requalified).toBe(1);
    expect(first.restored).toBe(0);
    const after = await prisma.rankCheck.findUniqueOrThrow({ where: { id: check.id } });
    expect(after.status).toBe("failed");
    const second = await repairGotoHistory({
      apply: true,
      checkIds: [check.id],
      fetch: unresolved,
      limit: 5,
      now,
      resolveCredentials: credentials,
    });
    expect(second).toMatchObject({
      providerCalls: 0,
      requalified: 0,
      restored: 0,
      unchanged: 1,
      writes: 0,
    });
    expect(refreshOperationIncident).not.toHaveBeenCalled();
  });

  it("skips all unproven original scopes and leaves no restorable envelope", async () => {
    const checks = [];
    for (const field of ["text", "device", "location", "domain", "unchanged"]) {
      const check = await seed(`missing-${field}`, "failed", { hash: null });
      if (field === "text")
        await prisma.keyword.update({ where: { id: check.keywordId }, data: { text: "edited" } });
      if (field === "device")
        await prisma.keyword.update({ where: { id: check.keywordId }, data: { device: "mobile" } });
      if (field === "location")
        await prisma.location.update({ where: { id: locationId }, data: { languageCode: "pl" } });
      if (field === "domain")
        await prisma.project.update({ where: { id: projectId }, data: { domain: "example.org" } });
      const outbound = vi.fn(fetchImpl);
      const result = await repairGotoHistory({
        apply: true,
        checkIds: [check.id],
        fetch: outbound,
        limit: 5,
        now,
        resolveCredentials: credentials,
      });
      expect(result).toMatchObject({ skipped: 1, skipReasons: { scope_unproven: 1 }, writes: 0 });
      expect(outbound).not.toHaveBeenCalled();
      checks.push(check);
      await prisma.location.update({ where: { id: locationId }, data: { languageCode: "en" } });
      await prisma.project.update({
        where: { id: projectId },
        data: { domain: "site1.example.com" },
      });
    }
    for (const check of checks) {
      expect(await prisma.rankCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({
        status: "failed",
        position: null,
      });
      expect(await prisma.rankCheckResultEvidence.count({ where: { rankCheckId: check.id } })).toBe(
        0,
      );
    }
  });

  it("skips incomplete retained evidence without restoring a miss", async () => {
    const check = await seed("incomplete", "failed");
    const task = await prisma.queuedRankCheckTask.findUniqueOrThrow({
      where: { rankCheckId: check.id },
    });
    await prisma.providerPartialEvidence.create({
      data: {
        id: randomUUID(),
        namespace: "default",
        instanceId: "fixture",
        rankCheckId: check.id,
        kind: "unresolved",
        schemaVersion: 2,
        expiresAt: new Date(now.getTime() + 86400000),
        identityHash: "synthetic",
        payloadEncrypted: encryptSecret(
          JSON.stringify({
            version: 2,
            task: {
              id: task.providerTaskId,
              status: { code: 20000 },
              classification: "success",
              results: [],
              organicItems: [],
            },
            raw: { recovery: { completeness: "unresolved" } },
          }),
        ),
      },
    });
    const outbound = vi.fn(fetchImpl);
    const result = await repairGotoHistory({
      apply: true,
      checkIds: [check.id],
      fetch: outbound,
      limit: 5,
      now,
      resolveCredentials: credentials,
    });
    expect(result).toMatchObject({ skipped: 1, skipReasons: { source_incomplete: 1 }, writes: 0 });
    expect(outbound).not.toHaveBeenCalled();
    expect(await prisma.rankCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({
      status: "failed",
      position: null,
    });
    expect(await prisma.rankCheckResultEvidence.count({ where: { rankCheckId: check.id } })).toBe(
      0,
    );
  });

  it.each(["rejection", "http503"])(
    "keeps converter %s failures retryable without a partial marker",
    async (failure) => {
      const check = await seed(`retry-${failure}`, "failed");
      let failed = true;
      const outbound = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).includes("goto_url_converter") && failed) {
          if (failure === "http503") return new Response("unavailable", { status: 503 });
          throw new Error("Synthetic converter failure");
        }
        return fetchImpl(input, init);
      });
      const options = {
        apply: true,
        checkIds: [check.id],
        fetch: outbound,
        limit: 5,
        now,
        resolveCredentials: credentials,
      };
      const first = await repairGotoHistory(options);
      expect(first).toMatchObject({
        failed: 1,
        failureReasons: { conversion_failed: 1 },
        requalified: 0,
        writes: 0,
      });
      expect(gotoHistoryCommandExitCode(first)).toBe(1);
      expect(await prisma.providerPartialEvidence.count({ where: { rankCheckId: check.id } })).toBe(
        0,
      );
      expect(await prisma.rankCheckResultEvidence.count({ where: { rankCheckId: check.id } })).toBe(
        0,
      );
      failed = false;
      expect(await repairGotoHistory(options)).toMatchObject({
        failed: 0,
        restored: 1,
        providerCalls: 2,
        unchanged: 0,
      });
      expect(await prisma.rankCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({
        status: "completed",
        position: 2,
      });
      expect(outbound).toHaveBeenCalledTimes(4);
    },
  );
});
