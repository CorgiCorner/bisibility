import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateAuditTarget, writeAudit, writeAuditFailure } from "./audit";
import { hashIpAddress } from "./request-context";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  prisma: {
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

function mockHeaders() {
  mocks.headers.mockResolvedValue(
    new Headers({
      "user-agent": "Vitest",
      "x-correlation-id": "corr_1",
      "x-forwarded-for": "10.0.0.1, 198.51.100.23",
    }),
  );
}

const publicId = (prefix: string) => `${prefix}_abcdefghijklmnopqrstuvwx`;
const addressableTargets = [
  ["alert_rule", "alr", "Alert rule"],
  ["api_key", "key", "API key"],
  ["cloud_import_job", "imp", "Cloud import job"],
  ["competitor", "cmp", "Competitor"],
  ["ingest_hook", "dwh", "Ingest hook"],
  ["invite", "inv", "Invite"],
  ["keyword", "kw", "Keyword"],
  ["keyword_schedule", "kw", "Keyword schedule"],
  ["membership", "mbr", "Membership"],
  ["migration_token", "ferry", "Migration token"],
  ["notification", "ntf", "Notification"],
  ["personal_access_token", "pat", "Personal access token"],
  ["project", "prj", "Project"],
  ["project_defaults", "prj", "Project defaults"],
  ["provider_connection", "conn", "Provider connection"],
  ["rank_check", "check", "Rank-check"],
  ["saved_keyword", "svkw", "Saved keyword"],
  ["saved_view", "viw", "Saved view"],
  ["session", "sid", "Session"],
  ["signal", "sig", "Signal"],
  ["sitemap_monitor", "prj", "Sitemap monitor"],
  ["tag", "tag", "Tag"],
  ["triggered_alert", "al", "Triggered alert"],
  ["user", "usr", "User"],
  ["webhook_endpoint", "we", "Webhook endpoint"],
] as const;

describe("writeAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_VERSION = "1.2.3";
    process.env.AUDIT_IP_HMAC_SECRET = "audit-secret";
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    mockHeaders();
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    process.env.APP_VERSION = undefined;
    process.env.AUDIT_IP_HMAC_SECRET = undefined;
  });

  it("persists request metadata and success status without raw IP", async () => {
    await writeAudit({
      action: "keyword.add",
      actorId: "user_1",
      after: { keyword: "rank tracker" },
      projectId: "project_1",
      targetId: publicId("kw"),
      targetType: "keyword",
    });

    const data = mocks.prisma.auditLog.create.mock.calls[0]?.[0].data;

    expect(data).toMatchObject({
      action: "keyword.add",
      actorId: "user_1",
      appVersion: "1.2.3",
      correlationId: "corr_1",
      sourceIpHash: hashIpAddress("198.51.100.23", "audit-secret"),
      sourceIpMasked: "198.51.100.0",
      status: "success",
      targetId: publicId("kw"),
      userAgent: "Vitest",
    });
    expect(JSON.stringify(data)).not.toContain("198.51.100.23");
  });

  it("persists failed audit entries with a sanitized reason", async () => {
    await writeAuditFailure({
      action: "authorization.update.forbidden",
      actorId: "user_1",
      projectId: "project_1",
      statusReason: "forbidden",
      targetId: publicId("prj"),
      targetType: "project",
    });

    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          statusReason: "forbidden",
        }),
      }),
    );
  });

  it("serializes only declared fields and keeps status-reason redaction independent", async () => {
    await writeAudit({
      action: "keyword.update",
      actorId: "user_1",
      after: {
        apiKey: "secret",
        count: 4n,
        targetUrl: "https://user:pass@example.com/hook?token=secret",
        text: "rank tracker",
        unsupported: Symbol("x"),
      },
      before: null,
      requestContext: {
        appVersion: "explicit",
        correlationId: "corr_explicit",
        sourceIpHash: null,
        sourceIpMasked: null,
        userAgent: "test",
      },
      statusReason: "Bearer very-secret-token",
      targetId: publicId("kw"),
      targetType: "keyword",
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: {
          targetUrl: "https://example.com/hook",
          text: "rank tracker",
        },
        appVersion: "explicit",
        before: expect.anything(),
        statusReason: "[redacted]",
      }),
    });
  });

  it("writes no payload fields for an undeclared action", async () => {
    await writeAudit({
      action: "audit.new_producer",
      actorId: "user_1",
      after: { target: "postgresql://user:pass@example.com/database" },
      targetId: publicId("prj"),
      targetType: "project",
    });

    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "audit.new_producer",
        after: undefined,
      }),
    });
  });

  it("keeps declared manual-note content needed after deletion", async () => {
    await writeAudit({
      action: "signal.note_removed",
      actorId: "user_1",
      before: {
        payload: { note: "Investigated and resolved." },
        severity: "info",
      },
      targetId: publicId("sig"),
      targetType: "signal",
    });

    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: {
          payload: { note: "Investigated and resolved." },
          severity: "info",
        },
      }),
    });
  });

  it.each(addressableTargets)(
    "requires a strict %s public target ID",
    (targetType, prefix, resource) => {
      const after = targetType === "rank_check" ? { keywordId: publicId("kw") } : undefined;
      expect(() =>
        validateAuditTarget({ after, targetId: publicId(prefix), targetType }),
      ).not.toThrow();
      expect(() => validateAuditTarget({ after, targetId: publicId("audit"), targetType })).toThrow(
        `${resource} audit targets require a public ${prefix}_ ID.`,
      );
    },
  );

  it.each(["authentication", "authorization", "instance_ops", "slack_connection", "system"])(
    "allows declared non-addressable %s targets",
    (targetType) => {
      expect(() => validateAuditTarget({ targetId: "opaque-resource", targetType })).not.toThrow();
    },
  );

  it("rejects unknown target types instead of silently accepting raw identities", () => {
    expect(() =>
      validateAuditTarget({ targetId: "opaque-resource", targetType: "unknown_resource" }),
    ).toThrow('Audit target type "unknown_resource" has no declared identity policy.');
  });

  it("rejects internal or mismatched ids before writing linkable entity audits", async () => {
    await expect(
      writeAudit({
        action: "keyword.add",
        actorId: "user_1",
        targetId: "internal_keyword_1",
        targetType: "keyword",
      }),
    ).rejects.toThrow("Keyword audit targets require a public kw_ ID.");
    await expect(
      writeAudit({
        action: "rank_check.completed",
        actorId: null,
        after: { keywordId: "internal_keyword_1" },
        targetId: publicId("check"),
        targetType: "rank_check",
      }),
    ).rejects.toThrow("Rank-check audit targets require a public kw_ ID.");
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
