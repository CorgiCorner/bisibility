import { importChunkChecksum } from "@/lib/api/instance-import/session-schemas";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createKeywords: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    alertRule: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    alertRuleTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
    cloudImportJob: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    migrationImportChunk: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    migrationToken: { updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
    rankCheck: { createMany: vi.fn(), findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));
vi.mock("@/lib/api/keyword-create", () => ({ createKeywords: mocks.createKeywords }));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawToken = "mig_valid_token_value_12345";
const jobId = "imp_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";
const ruleId = "alr_abcdefghijklmnopqrstuvwx";
const url = `https://example.com/api/cloud/import/sessions/${jobId}/finalize`;

function project() {
  return {
    createdAt: new Date("2026-07-08T20:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "owner_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
    updatedAt: new Date("2026-07-08T20:00:00.000Z"),
    writeMode: "active",
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    chunkCount: 1,
    chunksImported: 0,
    chunksReceived: 1,
    counts: null,
    createdAt: new Date("2026-07-08T20:00:00.000Z"),
    error: null,
    finishedAt: null,
    id: "job_1",
    publicId: jobId,
    progress: 50,
    projectId: "project_1",
    startedAt: new Date("2026-07-08T20:00:00.000Z"),
    state: "receiving",
    tokenId: "token_1",
    ...overrides,
  };
}

function keywordChunk(overrides: Record<string, unknown> = {}) {
  const payload = {
    keywords: [
      {
        device: "desktop",
        id: keywordId,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: [
          {
            checkedAt: "2026-07-08T20:00:00.000Z",
            normalizationVersion: "v1",
            position: 3,
            previousPosition: null,
            provider: "dataforseo",
            rankingUrl: null,
            requestedDepth: 100,
          },
        ],
        tags: [],
      },
    ],
  };
  return {
    bytes: 300,
    checksum: importChunkChecksum({ kind: "keywords", ...payload }),
    id: "chunk_kw",
    importedAt: null,
    index: 0,
    jobId: "job_1",
    kind: "keywords",
    payload,
    receivedAt: new Date("2026-07-08T20:01:00.000Z"),
    ...overrides,
  };
}

function sectionsChunk() {
  const payload = {
    sections: {
      alert_rules: [
        {
          channels: ["email"],
          condition_type: "threshold",
          id: ruleId,
          name: "Top 3",
          target_type: "keyword",
          targets: [{ keyword_id: keywordId, type: "keyword" }],
          threshold_position: 3,
        },
      ],
      source_keyword_ids: {
        [keywordId]: { device: "desktop", location: "United States", text: "rank tracker" },
      },
    },
  };
  return {
    bytes: 300,
    checksum: importChunkChecksum({ kind: "sections", ...payload }),
    id: "chunk_sections",
    importedAt: null,
    index: 1,
    jobId: "job_1",
    kind: "sections",
    payload,
    receivedAt: new Date("2026-07-08T20:02:00.000Z"),
  };
}

function request(body?: unknown) {
  return new Request(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      authorization: `Bearer ${rawToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method: "POST",
  }) as NextRequest;
}

async function post(body?: unknown, sessionId = jobId) {
  return (await POST(request(body), { params: Promise.resolve({ sessionId }) })) as Response;
}

describe("POST /api/cloud/import/sessions/{sessionId}/finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyMigrationToken.mockResolvedValue({
      createdById: "user_1",
      id: "token_1",
      projectId: "project_1",
      projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
      publicId: "ferry_abcdefghijklmnopqrstuvwx",
      singleUse: true,
    });
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((limit) =>
      Response.json({ status: 429 }, { headers: limit.headers, status: 429 }),
    );
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.project.findUnique.mockResolvedValue(project());
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job());
    mocks.prisma.cloudImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(job({ ...data, id: where.id })),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "keyword_1", location: "United States", text: "rank tracker" },
    ]);
    mocks.createKeywords.mockResolvedValue(Response.json({ created: 1, skipped: 0 }));
    mocks.prisma.rankCheck.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.migrationImportChunk.update.mockResolvedValue({ id: "chunk_kw" });
    mocks.prisma.migrationImportChunk.deleteMany.mockResolvedValue({ count: 1 });
    // Finalize lists chunk metadata first, then loads each payload row by id.
    mocks.prisma.migrationImportChunk.findUniqueOrThrow.mockImplementation(async ({ where }) => {
      const listed = (await (mocks.prisma.migrationImportChunk.findMany.mock.results.at(-1)
        ?.value ?? [])) as { id: string }[];
      const row = listed.find((chunk) => chunk.id === where.id);
      if (!row) throw new Error(`Chunk ${where.id} not found.`);
      return row;
    });
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    mocks.prisma.alertRule.create.mockResolvedValue({ id: "rule_1" });
    mocks.prisma.alertRule.update.mockResolvedValue({ id: "rule_1" });
    mocks.prisma.alertRuleTarget.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.alertRuleTarget.createMany.mockResolvedValue({ count: 1 });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("rejects finalize while chunks are missing", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job({ chunkCount: 2 }));
    mocks.prisma.migrationImportChunk.count.mockResolvedValueOnce(1);

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ detail: "Missing 1 chunk(s)." });
  });

  it("rejects unknown finalize body fields", async () => {
    const response = await post({ token: rawToken });

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", "not-a-job"],
    ["uppercase", jobId.toUpperCase()],
    ["legacy", "job_1"],
  ])("rejects a %s session ID before lookup", async (_label, sessionId) => {
    const response = await post(undefined, sessionId);

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a second finalizer that loses the optimistic lock", async () => {
    mocks.prisma.cloudImportJob.findFirst
      .mockResolvedValueOnce(job({ chunkCount: 2 }))
      .mockResolvedValueOnce(job({ chunkCount: 2, state: "importing" }));
    mocks.prisma.migrationImportChunk.count.mockResolvedValueOnce(2);
    mocks.prisma.cloudImportJob.updateMany.mockResolvedValue({ count: 0 });

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Import session is already finalizing.",
    });
  });

  it("skips imported chunks on crash resume without duplicating history", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(
      job({ counts: { history: 1, history_received: 1, keywords: 1 }, progress: 99 }),
    );
    mocks.prisma.migrationImportChunk.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mocks.prisma.migrationImportChunk.findMany.mockResolvedValue([
      keywordChunk({ importedAt: new Date("2026-07-08T20:05:00.000Z") }),
    ]);

    const response = await post();

    expect(response.status).toBe(200);
    expect(mocks.prisma.rankCheck.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.migrationToken.updateMany).toHaveBeenCalledOnce();
  });

  it("imports chunks in order, aggregates counts, consumes the token, and deletes chunks", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job({ chunkCount: 2 }));
    mocks.prisma.migrationImportChunk.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    mocks.prisma.migrationImportChunk.findMany.mockResolvedValue([keywordChunk(), sectionsChunk()]);

    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      counts: {
        alert_rules: 1,
        history: 1,
        history_received: 1,
        keywords: 1,
        keywords_created: 1,
        keywords_skipped: 0,
      },
      job_id: jobId,
      state: "done",
    });
    expect(mocks.prisma.alertRuleTarget.createMany).toHaveBeenCalledWith({
      data: [{ keywordId: "keyword_1", ruleId: "rule_1" }],
    });
    expect(mocks.prisma.migrationToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { consumedAt: null, id: "token_1" } }),
    );
    expect(mocks.prisma.migrationImportChunk.deleteMany).toHaveBeenCalledWith({
      where: { jobId: "job_1" },
    });
  });

  it("marks failed imports and deletes chunks", async () => {
    mocks.prisma.migrationImportChunk.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.prisma.migrationImportChunk.findMany.mockResolvedValue([keywordChunk()]);
    mocks.prisma.rankCheck.createMany.mockRejectedValueOnce(new Error("history insert failed"));

    const response = await post();

    expect(response.status).toBe(500);
    expect(mocks.prisma.migrationToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "failed" }) }),
    );
    expect(mocks.prisma.migrationImportChunk.deleteMany).toHaveBeenCalledWith({
      where: { jobId: "job_1" },
    });
  });
});
