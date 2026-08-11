import { CloudImportTokenError } from "@/lib/api/cloud-import";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    migrationImportChunk: { deleteMany: vi.fn() },
    project: { findUnique: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawToken = "mig_valid_token_value_12345";
const jobId = "imp_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const sourceProjectId = "prj_bbcdefghijklmnopqrstuvwx";
const url = "https://example.com/api/v1/cloud/import/sessions";

function job(overrides: Record<string, unknown> = {}) {
  return {
    chunkCount: null,
    chunksImported: 0,
    chunksReceived: 0,
    counts: null,
    createdAt: new Date("2026-07-08T20:00:00.000Z"),
    error: null,
    finishedAt: null,
    id: "job_1",
    publicId: jobId,
    manifest: null,
    progress: 0,
    projectId: "project_1",
    startedAt: null,
    state: "idle",
    tokenId: "token_1",
    updatedAt: new Date("2026-07-08T20:00:00.000Z"),
    ...overrides,
  };
}

function request(body: unknown, headers: HeadersInit = { authorization: `Bearer ${rawToken}` }) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  }) as NextRequest;
}

async function post(body: unknown, headers?: HeadersInit) {
  return (await POST(request(body, headers))) as Response;
}

describe("POST /api/v1/cloud/import/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyMigrationToken.mockResolvedValue({
      createdById: "user_1",
      id: "token_1",
      projectId: "project_1",
      projectPublicId: projectId,
      publicId: "ferry_abcdefghijklmnopqrstuvwx",
      singleUse: true,
    });
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((limit) =>
      Response.json({ status: 429 }, { headers: limit.headers, status: 429 }),
    );
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValueOnce(null).mockResolvedValue(job());
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(job({ ...data, id: where.id })),
    );
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(job({ ...data, id: "job_created" })),
    );
    mocks.prisma.migrationImportChunk.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("creates a receiving import session", async () => {
    const response = await post({
      chunk_count: 4,
      source_project_id: sourceProjectId,
      totals: { keywords: 3 },
      version: 6,
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      chunk_limits: {
        max_body_bytes: 8_388_608,
        max_history_rows: 25_000,
        max_keywords: 500,
      },
      session_id: jobId,
      state: "receiving",
    });
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chunkCount: 4, progress: 1, state: "receiving" }),
      }),
    );
  });

  it("rejects a live session for the same token", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockReset();
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job({ state: "receiving" }));

    const response = await post({
      chunk_count: 2,
      source_project_id: sourceProjectId,
      version: 6,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "An import session is already active for this token.",
    });
  });

  it("allows exactly one concurrent session creation without overwriting its manifest", async () => {
    let manifest: unknown = null;
    let state = "idle";
    let transaction = Promise.resolve();
    mocks.prisma.$transaction.mockImplementation((callback) => {
      const result = transaction.then(() => callback(mocks.prisma));
      transaction = result.catch(() => undefined);
      return result;
    });
    mocks.prisma.cloudImportJob.findFirst.mockImplementation(({ where }) => {
      if ("state" in where) {
        return Promise.resolve(state === "receiving" ? job({ manifest, state }) : null);
      }
      return Promise.resolve(state === "idle" ? job({ manifest, state }) : null);
    });
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) => {
      state = data.state ?? state;
      if ("manifest" in data) manifest = data.manifest;
      return Promise.resolve(job({ ...data, id: where.id, manifest, state }));
    });

    const bodies = [
      { chunk_count: 2, source_project_id: sourceProjectId, version: 6 },
      { chunk_count: 3, source_project_id: sourceProjectId, version: 6 },
    ];
    const responses = await Promise.all(bodies.map((body) => post(body)));
    const statuses = responses.map((response) => response.status);
    const success = statuses.indexOf(201);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
    expect(manifest).toMatchObject({ chunk_count: bodies[success]?.chunk_count });
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenCalledTimes(2);
  });

  it("rejects a session whose source project is the destination project", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "project_1",
      publicId: projectId,
    });

    const response = await post({
      chunk_count: 2,
      source_project_id: projectId,
      version: 6,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/self_import",
    });
    expect(mocks.prisma.cloudImportJob.create).not.toHaveBeenCalled();
  });

  it("returns 401 when no migration token is supplied", async () => {
    const response = await post(
      { chunk_count: 2, source_project_id: sourceProjectId, version: 6 },
      {},
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rejects a migration token supplied in the request body", async () => {
    const response = await post(
      {
        chunk_count: 2,
        source_project_id: sourceProjectId,
        token: rawToken,
        version: 6,
      },
      {},
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns 419 for expired migration tokens", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(
      new CloudImportTokenError("Migration token is expired."),
    );

    const response = await post({
      chunk_count: 2,
      source_project_id: sourceProjectId,
      version: 6,
    });

    expect(response.status).toBe(419);
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("does not classify an expired database operation as token expiry", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(new Error("Database transaction expired."));

    const response = await post({
      chunk_count: 2,
      source_project_id: sourceProjectId,
      version: 6,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Instance import failed.",
      status: 500,
    });
  });

  it("emits a session-create audit with the token creator", async () => {
    const response = await post({
      chunk_count: 2,
      source_project_id: sourceProjectId,
      version: 6,
    });

    expect(response.status).toBe(201);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cloud_import.session_create",
        actorId: "user_1",
        projectId: "project_1",
        targetId: expect.any(String),
      }),
      mocks.prisma,
    );
  });

  it("rejects a session without source_project_id", async () => {
    const response = await post({ chunk_count: 2, version: 6 });

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
  });
});
