import { importChunkChecksum } from "@/lib/api/instance-import/session-schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unwrapActionResult } from "./action-result";
import {
  createRemoteImportSession,
  exportAndTransferChunk,
  finalizeRemoteImportSession,
  planChunkedTransfer,
  transferSectionsChunk,
} from "./instance-migration";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  countKeywordChunks: vi.fn(),
  cookies: vi.fn(),
  exportKeywordChunk: vi.fn(),
  exportSectionsChunk: vi.fn(),
  migrationFetch: vi.fn(),
  prisma: {
    keyword: { count: vi.fn() },
    project: { findFirst: vi.fn() },
    rankCheck: { count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/deployment/deployment", () => ({ isSelfHost: false }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/migration/export-chunks", () => ({
  countKeywordChunks: mocks.countKeywordChunks,
  exportKeywordChunk: mocks.exportKeywordChunk,
  exportSectionsChunk: mocks.exportSectionsChunk,
}));
vi.mock("@/lib/migration/transfer-client", () => ({ migrationFetch: mocks.migrationFetch }));

const token = "mig_valid_token_value_123";
const jobId = "imp_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function expectedChecksum(payload: unknown) {
  return importChunkChecksum(payload as { kind: string; keywords?: unknown; sections?: unknown });
}

describe("instance migration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BISIBILITY_CLOUD_URL", "https://cloud.example.com");
    mocks.cookies.mockResolvedValue({ get: vi.fn() });
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: projectId,
      writeMode: "migration_hold",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("plans a hold-tolerant chunked transfer", async () => {
    mocks.prisma.keyword.count.mockResolvedValue(401);
    mocks.prisma.rankCheck.count.mockResolvedValue(25_000);
    mocks.countKeywordChunks.mockResolvedValue(3);

    const result = await planChunkedTransfer({ projectId });

    expect(result).toEqual({
      chunkCount: 4,
      totalKeywords: 401,
      totalRankChecks: 25_000,
      useSessions: true,
    });
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
      "manage",
      { projectId: "project_1", type: "project" },
    );
  });

  it("rejects raw project IDs and malformed public cursors before lookup", async () => {
    await expect(planChunkedTransfer({ projectId: "project_1" })).rejects.toThrow(
      "Expected a strict prj_ v3 public ID.",
    );
    await expect(
      exportAndTransferChunk({
        cursor: "keyword_1",
        index: 0,
        projectId,
        sessionId: jobId,
        token,
      }),
    ).rejects.toThrow("Expected a strict kw_ v3 public ID.");
    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.exportKeywordChunk).not.toHaveBeenCalled();
  });

  it("creates, transfers, and finalizes a remote import session", async () => {
    const keywords = [{ id: keywordId, keyword: "rank tracker", rankingHistory: [] }];
    mocks.migrationFetch
      .mockResolvedValueOnce(
        jsonResponse(
          {
            chunk_limits: {
              max_body_bytes: 1_000_000,
              max_history_rows: 25_000,
              max_keywords: 500,
            },
            session_id: jobId,
            state: "receiving",
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ chunk_count: 3, chunks_received: 1, state: "receiving" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ chunk_count: 3, chunks_received: 2, state: "receiving" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ counts: { keywords: 1 }, job_id: jobId, state: "done" }),
      );
    mocks.exportKeywordChunk.mockResolvedValue({ done: false, keywords, nextCursor: keywordId });
    mocks.exportSectionsChunk.mockResolvedValue({ source_keyword_ids: { [keywordId]: {} } });

    const session = unwrapActionResult(
      await createRemoteImportSession({
        chunkCount: 3,
        projectId,
        token,
        totals: { keywords: 1, rankChecks: 0 },
      }),
    );
    const keywordResult = unwrapActionResult(
      await exportAndTransferChunk({
        cursor: null,
        index: 0,
        projectId,
        sessionId: session.sessionId,
        token,
      }),
    );
    const sectionResult = unwrapActionResult(
      await transferSectionsChunk({
        index: 1,
        projectId,
        sessionId: session.sessionId,
        token,
      }),
    );
    const finalized = unwrapActionResult(
      await finalizeRemoteImportSession({
        projectId,
        sessionId: session.sessionId,
        token,
      }),
    );

    expect(session).toEqual({
      chunkLimits: { maxBodyBytes: 1_000_000, maxHistoryRows: 25_000, maxKeywords: 500 },
      sessionId: jobId,
    });
    expect(keywordResult).toMatchObject({ chunksReceived: 1, nextCursor: keywordId });
    expect(sectionResult).toEqual({ chunksReceived: 2 });
    expect(finalized).toEqual({ counts: { keywords: 1 }, jobId, state: "done" });

    const [createUrl, createInit] = mocks.migrationFetch.mock.calls[0];
    expect(createUrl).toBe("https://cloud.example.com/api/v1/cloud/import/sessions");
    expect(createInit).toMatchObject({
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
      timeoutMs: 30_000,
    });
    expect(JSON.parse(String(createInit.body))).toEqual({
      chunk_count: 3,
      source_project_id: projectId,
      totals: { keywords: 1, rank_checks: 0 },
      version: 6,
    });

    const [, keywordInit] = mocks.migrationFetch.mock.calls[1];
    const keywordBody = JSON.parse(String(keywordInit.body));
    expect(keywordInit).toMatchObject({ method: "PUT", retries: 2, timeoutMs: 30_000 });
    expect(keywordBody).toEqual({
      checksum: expectedChecksum({ kind: "keywords", keywords }),
      kind: "keywords",
      keywords,
    });
    expect(keywordBody.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    const methods = mocks.migrationFetch.mock.calls.map(([, init]) => ({
      method: init.method,
      retries: init.retries,
    }));
    expect(methods).toEqual([
      { method: "POST", retries: undefined },
      { method: "PUT", retries: 2 },
      { method: "PUT", retries: 2 },
      { method: "POST", retries: undefined },
    ]);
  });

  it("returns a handled result for expected destination rejections", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(
      jsonResponse({ detail: "session already active" }, 409),
    );

    await expect(
      createRemoteImportSession({
        chunkCount: 2,
        projectId,
        token,
        totals: { keywords: 1, rankChecks: 0 },
      }),
    ).resolves.toEqual({
      error: {
        code: "remote_migration_rejected",
        message: "session already active",
        status: 409,
      },
      ok: false,
    });
  });

  it("returns a handled result for a 419 mid-session chunk rejection", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(new Response("not-json", { status: 419 }));
    mocks.exportKeywordChunk.mockResolvedValue({
      done: false,
      keywords: [{ id: keywordId, keyword: "rank tracker", rankingHistory: [] }],
      nextCursor: keywordId,
    });

    await expect(
      exportAndTransferChunk({
        cursor: null,
        index: 0,
        projectId,
        sessionId: jobId,
        token,
      }),
    ).resolves.toEqual({
      error: {
        code: "remote_migration_rejected",
        message: "The migration token was revoked or expired on the destination.",
        status: 419,
      },
      ok: false,
    });
  });

  it("still throws unexpected destination failures during finalize", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));

    await expect(
      finalizeRemoteImportSession({ projectId, sessionId: jobId, token }),
    ).rejects.toThrow("Instance import finalize failed.");
  });

  it("uses a validated target origin for remote sessions", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          chunk_limits: { max_body_bytes: 1_000_000, max_history_rows: 25_000, max_keywords: 500 },
          session_id: jobId,
        },
        201,
      ),
    );

    await createRemoteImportSession({
      chunkCount: 2,
      projectId,
      targetOrigin: "https://target.example.com",
      token,
      totals: { keywords: 1, rankChecks: 0 },
    });

    expect(mocks.migrationFetch.mock.calls[0][0]).toBe(
      "https://target.example.com/api/v1/cloud/import/sessions",
    );
  });

  it("returns handled failures from every session action for an invalid user target", async () => {
    const targetOrigin = "https://target.example.com:3000";
    const expected = {
      error: {
        code: "invalid_migration_target",
        message: "Target URL port must be empty, 80, 443, or 8443.",
        status: 400,
      },
      ok: false,
    };
    const actions = [
      () =>
        createRemoteImportSession({
          chunkCount: 2,
          projectId,
          targetOrigin,
          token,
          totals: { keywords: 1, rankChecks: 0 },
        }),
      () =>
        exportAndTransferChunk({
          cursor: null,
          index: 0,
          projectId,
          sessionId: jobId,
          targetOrigin,
          token,
        }),
      () =>
        transferSectionsChunk({
          index: 1,
          projectId,
          sessionId: jobId,
          targetOrigin,
          token,
        }),
      () =>
        finalizeRemoteImportSession({
          projectId,
          sessionId: jobId,
          targetOrigin,
          token,
        }),
    ];

    for (const action of actions) {
      await expect(action()).resolves.toEqual(expected);
    }
    expect(mocks.migrationFetch).not.toHaveBeenCalled();
    expect(mocks.exportKeywordChunk).not.toHaveBeenCalled();
    expect(mocks.exportSectionsChunk).not.toHaveBeenCalled();
  });

  it("identifies an invalid configured target as an operator configuration problem", async () => {
    vi.stubEnv("BISIBILITY_CLOUD_URL", "https://cloud.example.com:3000");

    await expect(
      createRemoteImportSession({
        chunkCount: 2,
        projectId,
        token,
        totals: { keywords: 1, rankChecks: 0 },
      }),
    ).resolves.toEqual({
      error: {
        code: "invalid_migration_target",
        message:
          "Migration target configuration is invalid. Check BISIBILITY_CLOUD_URL or the site URL. Target URL port must be empty, 80, 443, or 8443.",
        status: 400,
      },
      ok: false,
    });
    expect(mocks.migrationFetch).not.toHaveBeenCalled();
  });
});
