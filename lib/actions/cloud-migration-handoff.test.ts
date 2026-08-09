import packageJson from "@/package.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unwrapActionFailureResult } from "./action-result";
import {
  createCloudMigrationHandoff,
  getCloudMigrationCompatibility,
  preflightMigrationTarget,
  transferCloudImportPackage,
} from "./cloud";

const originalAppVersion = process.env.APP_VERSION;
const originalCloudUrl = process.env.BISIBILITY_CLOUD_URL;
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const sourceProjectId = "prj_bbcdefghijklmnopqrstuvwx";

function packageContent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    alert_rules: [],
    competitors: [],
    keywords: [],
    notification_preferences: [],
    project_id: sourceProjectId,
    saved_views: [],
    version: 6,
    ...overrides,
  });
}

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    code: "forbidden" | "unauthenticated";

    constructor(code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.code = code;
      this.name = "AuthorizationError";
    }
  }

  return {
    AuthorizationError,
    authorize: vi.fn(),
    cookies: vi.fn(),
    migrationFetch: vi.fn(),
    notifyCloudImportDone: vi.fn(),
    prisma: {
      $queryRaw: vi.fn(),
      keyword: { count: vi.fn() },
      project: { findFirst: vi.fn() },
      rankCheck: { count: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
    writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failed_1" })),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/deployment/deployment", () => ({ isSelfHost: false }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/migration/transfer-client", () => ({ migrationFetch: mocks.migrationFetch }));
vi.mock("@/lib/notifications/events", () => ({
  notifyCloudImportDone: mocks.notifyCloudImportDone,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));

function restoreEnv(key: "APP_VERSION" | "BISIBILITY_CLOUD_URL", value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = value;
}

function mockActor() {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role: "admin" }],
    role: "member",
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: projectId,
  });
}

describe("cloud migration handoff actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "project_1" })) });
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.rankCheck.count.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv("APP_VERSION", originalAppVersion);
    restoreEnv("BISIBILITY_CLOUD_URL", originalCloudUrl);
  });

  it("reports compatibility from app env, applied migrations, and project counts", async () => {
    process.env.APP_VERSION = "1.8.7-test";
    mocks.prisma.$queryRaw.mockResolvedValue([
      { migration_name: "20260619023000_init" },
      { migration_name: "20260628234220_two_factor" },
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(24);
    mocks.prisma.rankCheck.count.mockResolvedValue(512);

    const result = await getCloudMigrationCompatibility({ projectId });

    expect(result).toEqual({
      appVersion: "1.8.7-test",
      appVersionSource: "APP_VERSION",
      cloudOrigin: "https://bisibility.com",
      data: { keywords: 24, rankChecks: 512 },
      limits: { pushMaxKeywords: 50_000, sessionsRequired: false },
      schema: { count: 2, latest: "20260628234220_two_factor" },
    });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.rankCheck.count).toHaveBeenCalledWith({
      where: {
        keyword: { projectId: "project_1" },
        status: "completed",
      },
    });
  });

  it("falls back to package metadata and an empty migration summary", async () => {
    restoreEnv("APP_VERSION", undefined);
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("migration table unavailable"));

    await expect(getCloudMigrationCompatibility({ projectId })).resolves.toMatchObject({
      appVersion: packageJson.version,
      appVersionSource: "package.json",
      schema: { count: 0, latest: null },
    });
  });

  it("builds the handoff on the canonical Cloud origin", async () => {
    const result = unwrapActionFailureResult(await createCloudMigrationHandoff({ projectId }));

    expect(result).toMatchObject({
      apiImportUrl: "https://bisibility.com/api/cloud/import",
      cloudOrigin: "https://bisibility.com",
      cloudWorkspaceUrl: "https://bisibility.com/app",
      sourceProjectId: projectId,
    });
    expect(result.cloudImportUrl).toBe("https://bisibility.com/app");
    expect(result.apiRequest).toContain("POST https://bisibility.com/api/cloud/import");
    expect(result.apiRequest).toContain("Authorization: Bearer mig_...");
  });

  it("builds a direct handoff for an explicit self-host target", async () => {
    const result = unwrapActionFailureResult(
      await createCloudMigrationHandoff({
        projectId,
        targetOrigin: "https://target.example.com",
      }),
    );

    expect(result.cloudImportUrl).toBe("https://target.example.com/app");
    expect(result.cloudOnboardingUrl).toBe(result.cloudImportUrl);
    expect(result.cloudOrigin).toBe("https://target.example.com");
  });

  it("transfers a package to an explicit destination with the pasted token", async () => {
    mocks.migrationFetch.mockResolvedValue(
      new Response(JSON.stringify({ job_id: "imp_abcdefghijklmnopqrstuvwx", state: "done" }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    const result = await transferCloudImportPackage({
      content: packageContent(),
      filename: "dump.json",
      projectId,
      targetOrigin: "https://target.example.com",
      token: "mig_valid_token_value_12345",
    });

    expect(result).toEqual({
      ok: true,
      value: { counts: {}, jobId: "imp_abcdefghijklmnopqrstuvwx", state: "done" },
    });
    expect(mocks.migrationFetch).toHaveBeenCalledWith(
      "https://target.example.com/api/cloud/import",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer mig_valid_token_value_12345",
        }),
        method: "POST",
      }),
    );
    const [, init] = mocks.migrationFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(JSON.parse(packageContent()));
    expect(init.headers).toEqual({
      Authorization: "Bearer mig_valid_token_value_12345",
      "Content-Type": "application/json",
    });
  });

  it("returns handled action failures for expected remote rejections", async () => {
    const base = { filename: "dump.json", projectId, token: "mig_valid_token_value_12345" };
    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Migration token is invalid or expired." }), {
        status: 419,
      }),
    );

    await expect(
      transferCloudImportPackage({ ...base, content: packageContent() }),
    ).resolves.toEqual({
      error: {
        code: "remote_migration_rejected",
        message: "Migration token is invalid or expired.",
        status: 419,
      },
      ok: false,
    });
  });

  it("still throws malformed inputs and unexpected remote failures", async () => {
    const base = { filename: "dump.json", projectId, token: "mig_valid_token_value_12345" };
    await expect(transferCloudImportPackage({ ...base, content: "{x" })).rejects.toThrow(
      "Instance import package must be valid JSON.",
    );

    mocks.migrationFetch.mockResolvedValueOnce(new Response("not-json", { status: 502 }));
    await expect(
      transferCloudImportPackage({ ...base, content: packageContent() }),
    ).rejects.toThrow("Instance import failed.");

    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Unexpected destination failure." }), { status: 502 }),
    );
    await expect(
      transferCloudImportPackage({ ...base, content: packageContent() }),
    ).rejects.toThrow("Unexpected destination failure.");
  });

  it("maps known destination statuses without a JSON detail to handled results", async () => {
    const base = { filename: "dump.json", projectId, token: "mig_valid_token_value_12345" };
    mocks.migrationFetch.mockResolvedValueOnce(new Response("not-json", { status: 419 }));
    await expect(
      transferCloudImportPackage({ ...base, content: packageContent() }),
    ).resolves.toEqual({
      error: {
        code: "remote_migration_rejected",
        message: "The migration token was revoked or expired on the destination.",
        status: 419,
      },
      ok: false,
    });

    mocks.migrationFetch.mockResolvedValueOnce(new Response("not-json", { status: 423 }));
    await expect(
      transferCloudImportPackage({ ...base, content: packageContent() }),
    ).resolves.toEqual({
      error: {
        code: "remote_migration_rejected",
        message: "The destination project is locked while another migration finishes.",
        status: 423,
      },
      ok: false,
    });
  });

  it("returns handled failures from every action for invalid user target origins", async () => {
    const cases = [
      ["not a url", "Target URL must be an absolute URL."],
      ["http://target.example.com", "Target URL protocol must be https."],
      ["https://127.0.0.1", "Target URL host must not be localhost or a private network address."],
      ["https://user:pass@example.com", "Target URL must not include credentials."],
      [
        "https://target.example.com/path",
        "Target URL must be an origin without a path, query, or hash.",
      ],
    ] as const;

    for (const [targetOrigin, reason] of cases) {
      const expected = {
        error: { code: "invalid_migration_target", message: reason, status: 400 },
        ok: false,
      };
      await expect(createCloudMigrationHandoff({ projectId, targetOrigin })).resolves.toEqual(
        expected,
      );
      await expect(
        transferCloudImportPackage({
          content: "{}",
          filename: "dump.json",
          projectId,
          targetOrigin,
          token: "mig_valid_token_value_12345",
        }),
      ).resolves.toEqual(expected);
      await expect(preflightMigrationTarget({ projectId, targetOrigin })).resolves.toEqual(
        expected,
      );
    }
    expect(mocks.migrationFetch).not.toHaveBeenCalled();
  });

  it("identifies an invalid configured target as an operator configuration problem", async () => {
    process.env.BISIBILITY_CLOUD_URL = "https://cloud.example.com:3000";

    await expect(createCloudMigrationHandoff({ projectId })).resolves.toEqual({
      error: {
        code: "invalid_migration_target",
        message:
          "Migration target configuration is invalid. Check BISIBILITY_CLOUD_URL or the site URL. Target URL port must be empty, 80, 443, or 8443.",
        status: 400,
      },
      ok: false,
    });
  });

  it("maps target compatibility preflight responses", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          app_version: "1.2.3",
          latest_migration: "20260708010000_target",
          schema_versions_supported: [6],
        }),
        { status: 200 },
      ),
    );

    await expect(
      preflightMigrationTarget({ projectId, targetOrigin: "https://target.example.com" }),
    ).resolves.toEqual({
      appVersion: "1.2.3",
      latestMigration: "20260708010000_target",
      origin: "https://target.example.com",
      reachable: true,
      sameInstance: false,
      schemaVersionsSupported: [6],
      sourceDeploymentMode: "cloud",
      supportsSessions: true,
    });
    expect(mocks.migrationFetch).toHaveBeenLastCalledWith(
      "https://target.example.com/api/cloud/import/compatibility",
      expect.objectContaining({ method: "GET", timeoutMs: 10_000 }),
    );

    mocks.migrationFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reachable: true,
      reason: "Target instance does not support strict v6 migration packages.",
      supportsSessions: false,
    });

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.migrationFetch.mockRejectedValueOnce(timeout);
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reachable: false,
      reason: "Target compatibility check timed out.",
      supportsSessions: false,
    });
  });

  it("maps incompatible, malformed, and unreachable preflight responses", async () => {
    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Maintenance" }), { status: 503 }),
    );
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reachable: true,
      reason: "Maintenance",
      supportsSessions: false,
    });

    mocks.migrationFetch.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reason: "Target compatibility check failed with HTTP 502.",
    });

    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ schema_versions_supported: "invalid" }), { status: 200 }),
    );
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reason: "Target returned an unexpected compatibility response.",
    });

    mocks.migrationFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          app_version: null,
          latest_migration: null,
          schema_versions_supported: [1, 2],
        }),
        { status: 200 },
      ),
    );
    await expect(preflightMigrationTarget({ projectId })).resolves.toEqual({
      appVersion: null,
      latestMigration: null,
      origin: "https://bisibility.com",
      reachable: true,
      sameInstance: false,
      schemaVersionsSupported: [1, 2],
      sourceDeploymentMode: "cloud",
      supportsSessions: false,
    });

    mocks.migrationFetch.mockRejectedValueOnce("network unavailable");
    await expect(preflightMigrationTarget({ projectId })).resolves.toMatchObject({
      reachable: false,
      reason: "Target instance could not be reached.",
    });
  });
});
