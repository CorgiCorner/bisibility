import { gzipSync } from "node:zlib";
import { importChunkChecksum } from "@/lib/api/instance-import/session-schemas";
import { Prisma } from "@/lib/generated/prisma/client";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: { findFirst: vi.fn(), update: vi.fn() },
    migrationImportChunk: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
}));

vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawToken = "mig_valid_token_value_12345";
const jobId = "imp_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";
const keywords = [
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
];
const checksum = importChunkChecksum({ kind: "keywords", keywords });
const url = `https://example.com/api/v1/cloud/import/sessions/${jobId}/chunks/1`;

function job(overrides: Record<string, unknown> = {}) {
  return {
    chunkCount: 4,
    chunksImported: 0,
    chunksReceived: 1,
    id: "job_1",
    publicId: jobId,
    progress: 1,
    projectId: "project_1",
    state: "receiving",
    tokenId: "token_1",
    ...overrides,
  };
}

function chunk(overrides: Record<string, unknown> = {}) {
  return {
    checksum,
    keywords,
    kind: "keywords",
    ...overrides,
  };
}

function sectionsChunk(sections: Record<string, unknown>) {
  const payload = { kind: "sections", sections } as const;
  return { ...payload, checksum: importChunkChecksum(payload) };
}

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${rawToken}`,
      "content-type": "application/json",
      ...headers,
    },
    method: "PUT",
  }) as NextRequest;
}

function gzipRequest(body: unknown) {
  return new Request(url, {
    body: gzipSync(Buffer.from(JSON.stringify(body))),
    headers: {
      authorization: `Bearer ${rawToken}`,
      "content-encoding": "gzip",
      "content-type": "application/json",
    },
    method: "PUT",
  }) as NextRequest;
}

function context(index = "1", sessionId = jobId) {
  return { params: Promise.resolve({ index, sessionId }) };
}

async function put(req: NextRequest, routeContext = context()) {
  return (await PUT(req, routeContext)) as Response;
}

describe("PUT /api/v1/cloud/import/sessions/{sessionId}/chunks/{index}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.verifyMigrationToken.mockResolvedValue({
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
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job());
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data }) =>
      Promise.resolve(job({ ...data })),
    );
    mocks.prisma.migrationImportChunk.findUnique.mockResolvedValue(null);
    mocks.prisma.migrationImportChunk.aggregate.mockResolvedValue({ _sum: { bytes: 0 } });
    mocks.prisma.migrationImportChunk.count.mockResolvedValue(2);
    mocks.prisma.migrationImportChunk.create.mockResolvedValue({ id: "chunk_1" });
  });

  it("stores a chunk and advances receive progress", async () => {
    const response = await put(request(chunk()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      chunk_count: 4,
      chunks_received: 2,
      state: "receiving",
    });
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenCalledWith({
      data: { chunksReceived: 2, progress: 25 },
      where: { id: "job_1" },
    });
  });

  it("replays the same checksum without re-storing", async () => {
    mocks.prisma.migrationImportChunk.findUnique.mockResolvedValue({ checksum });

    const response = await put(request(chunk()));

    expect(response.status).toBe(200);
    expect(mocks.prisma.migrationImportChunk.create).not.toHaveBeenCalled();
  });

  it("rejects a different checksum for an existing chunk", async () => {
    mocks.prisma.migrationImportChunk.findUnique.mockResolvedValue({
      checksum: `sha256:${"b".repeat(64)}`,
    });

    const response = await put(request(chunk()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Chunk 1 was already received with different content.",
    });
  });

  it("recovers an equal-checksum retry that races on the unique chunk index", async () => {
    let lookups = 0;
    mocks.prisma.migrationImportChunk.findUnique.mockImplementation(() =>
      Promise.resolve(lookups++ === 0 ? null : { checksum }),
    );
    mocks.prisma.migrationImportChunk.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.8.0",
        code: "P2002",
      }),
    );

    const response = await put(request(chunk()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      chunk_count: 4,
      chunks_received: 2,
      state: "receiving",
    });
  });

  it("maps a different-checksum unique-index race to conflict", async () => {
    let lookups = 0;
    mocks.prisma.migrationImportChunk.findUnique.mockImplementation(() =>
      Promise.resolve(lookups++ === 0 ? null : { checksum: `sha256:${"b".repeat(64)}` }),
    );
    mocks.prisma.migrationImportChunk.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.8.0",
        code: "P2002",
      }),
    );

    const response = await put(request(chunk()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Chunk 1 was already received with different content.",
    });
  });

  it("rejects an out-of-range chunk index", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job({ chunkCount: 1 }));

    const response = await put(request(chunk()), context("2"));

    expect(response.status).toBe(400);
  });

  it.each([
    ["malformed", "not-a-job"],
    ["uppercase", jobId.toUpperCase()],
    ["legacy", "job_1"],
  ])("rejects a %s session ID before lookup", async (_label, sessionId) => {
    const response = await put(request(chunk()), context("1", sessionId));

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["keywords", []],
    ["project_id", "prj_abcdefghijklmnopqrstuvwx"],
    ["version", 4],
    ["unexpected", true],
  ])("rejects %s inside a sections chunk", async (field, value) => {
    const response = await put(request(sectionsChunk({ alert_rules: [], [field]: value })));

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("returns 413 for oversized request bodies", async () => {
    vi.stubEnv("BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES", "64");

    const response = await put(request(chunk()));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Import payload exceeds the maximum allowed size.",
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rejects chunks when the session is not receiving", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job({ state: "importing" }));

    const response = await put(request(chunk()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Import session is not accepting chunks.",
    });
  });

  it("accepts gzip-compressed chunk bodies", async () => {
    const response = await put(gzipRequest(chunk()));

    expect(response.status).toBe(200);
    expect(mocks.prisma.migrationImportChunk.create).toHaveBeenCalledOnce();
  });
});
