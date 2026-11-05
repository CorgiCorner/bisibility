import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import converter from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import heavy from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { repairGotoHistory } from "./goto-history-repair";
import { preparedRankRecoveryContext } from "./recovery-context";

vi.mock("@/lib/provider-evidence/incidents/refresh", () => ({
  refreshOperationIncident: vi.fn(async () => undefined),
}));

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>> | undefined;

const now = new Date("2099-11-03T12:00:00.000Z");
const credentials = async () => ({ login: "fixture", password: "synthetic" });
let userId = "";
let projectId = "";
let locationId = "";
let connectionId = "";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

const fetchImpl: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("task_post") || url.includes("tasks_ready")) throw new Error("paid");
  if (url.includes("goto_url_converter")) return json(converter.response);
  if (url.includes("/task_get/")) {
    const body = structuredClone(heavy);
    const task = body.tasks[0];
    if (task) task.id = decodeURIComponent(url.split("/").at(-1) ?? "");
    return json(body);
  }
  throw new Error("unexpected request");
};

async function seed(input: {
  checkedAt: Date;
  errorCode?: string | null;
  raw?: unknown;
  runStatus: string;
  text: string;
}) {
  const run = await prisma.rankCheckRun.create({
    data: {
      finishedAt: input.checkedAt,
      projectId,
      publicId: makePublicId("rcr"),
      selectionHash: randomUUID(),
      selectionKind: "single",
      selectionSpec: {},
      status: input.runStatus,
      trigger: "manual",
    },
  });
  const keyword = await prisma.keyword.create({
    data: {
      location: "United States",
      locationId,
      projectId,
      publicId: makePublicId("kw"),
      text: input.text,
    },
  });
  const check = await prisma.rankCheck.create({
    data: {
      checkedAt: input.checkedAt,
      comparisonAllowed: true,
      errorCode: input.errorCode === undefined ? "provider_unresolved_redirects" : input.errorCode,
      finishedAt: input.checkedAt,
      keywordId: keyword.id,
      preRecoveryFinishedAt: input.checkedAt,
      provider: "dataforseo",
      publicId: makePublicId("check"),
      raw: input.raw ?? undefined,
      requestedDepth: 20,
      runId: run.id,
      status: "failed",
    },
  });
  const providerTaskId = randomUUID();
  const batch = await prisma.queuedRankCheckBatch.create({
    data: {
      claimedAt: input.checkedAt,
      connectionId,
      id: randomUUID(),
      priority: "normal",
      projectId,
      queueDeadlineAt: input.checkedAt,
      runId: run.id,
      state: "terminal",
    },
  });
  await prisma.queuedRankCheckTask.create({
    data: {
      batchId: batch.id,
      createdAt: input.checkedAt,
      id: randomUUID(),
      keywordId: keyword.id,
      providerTaskId,
      rankCheckId: check.id,
      recoveryContextHash: preparedRankRecoveryContext(
        { ...keyword, locationRef: { id: locationId, languageCode: "en" } },
        "example.com",
        20,
      ),
      state: "failed",
    },
  });
  await prisma.rankCheckRunItem.create({
    data: {
      finishedAt: input.checkedAt,
      keywordId: keyword.id,
      rankCheckId: check.id,
      runId: run.id,
      status: "failed",
    },
  });
  return { id: check.id, providerTaskId };
}

describe("historical GoTo preview pagination", () => {
  beforeAll(async () => {
    fixture = await closeoutPostgresFixture({ schemaOnly: true });
    shared.db = fixture.db;
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: "History scan",
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
        domain: "example.com",
        name: "History scan",
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

  it("reaches eligible checks behind more than limit ineligible failures", async () => {
    const limit = 1;
    const ineligible = [];
    for (let index = 0; index < limit + 2; index += 1) {
      ineligible.push(
        await seed({
          checkedAt: new Date(Date.UTC(2099, 9, 20, 0, 0, index)),
          runStatus: "cancelled",
          text: `noise-${index}`,
        }),
      );
    }
    const kept = await seed({
      checkedAt: new Date(Date.UTC(2099, 9, 21, 0, 0, 0)),
      runStatus: "failed",
      text: "kept",
    });
    const later = await seed({
      checkedAt: new Date(Date.UTC(2099, 9, 21, 0, 0, 1)),
      runStatus: "failed",
      text: "later",
    });
    const anomaly = await seed({
      checkedAt: new Date(Date.UTC(2099, 9, 22, 0, 0, 0)),
      errorCode: null,
      raw: {
        normalization: { anomalies: [{ code: "organic_result_unclassifiable", index: 1 }] },
      },
      runStatus: "failed",
      text: "anomaly",
    });
    const preview = await repairGotoHistory({
      fetch: fetchImpl,
      limit,
      now,
      resolveCredentials: credentials,
    });
    expect(preview).toMatchObject({
      eligible: limit,
      examined: 6,
      mode: "dry-run",
      providerCalls: 0,
      truncated: 2,
      writes: 0,
    });
    const allowed = new Set<string>([kept.providerTaskId]);
    const applied = await repairGotoHistory({
      apply: true,
      fetch: async (input, init) => {
        const url = String(input);
        const taskId = decodeURIComponent(url.split("/").at(-1) ?? "");
        if (url.includes("/task_get/") && !allowed.has(taskId)) throw new Error("write cap");
        return fetchImpl(input, init);
      },
      limit,
      now,
      resolveCredentials: credentials,
    });
    expect(applied).toMatchObject({ restored: 1, truncated: 2, writes: 1 });
    const restored = await prisma.rankCheck.findUniqueOrThrow({ where: { id: kept.id } });
    expect(restored.status).toBe("completed");
    for (const row of [...ineligible, later, anomaly]) {
      const stored = await prisma.rankCheck.findUniqueOrThrow({ where: { id: row.id } });
      expect(stored.status).toBe("failed");
      expect(stored.recoveryRestoredAt).toBeNull();
    }
  });
});
