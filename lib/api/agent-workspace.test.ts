import type { Role } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentReportRoute, agentReportsRoute, projectContextRoute } from "./agent-workspace";
import type { ApiContext } from "./context";
import { errorFromUnknown } from "./error-mapper";
import { decodeCursor, encodeCursor } from "./pagination";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  context: vi.fn(),
  saveContext: vi.fn(),
}));
vi.mock("@/lib/agent-reports/service", () => ({
  createAgentReport: mocks.create,
  getAgentReport: mocks.get,
  listAgentReportPage: mocks.list,
}));
vi.mock("@/lib/project-context/service", () => ({
  getProjectContext: mocks.context,
  saveProjectContext: mocks.saveContext,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn().mockResolvedValue(undefined) }));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const stamp = "2026-10-02T12:00:00.000Z";
const report = {
  id: reportId,
  kind: "prompt_explorer",
  title: "Comparison",
  body: { modelResponse: "synthetic" },
  provenance: { sourceType: "synthetic_prompt_test" },
  createdAt: stamp,
};
const contextBody = {
  business: "Business",
  audience: "Teams",
  products: "Tools",
  goals: "Growth",
  agent_rules: "No credentials",
};

function context(
  method = "GET",
  raw?: string,
  role: Role = "member",
  writeMode = "active",
  query = "",
): ApiContext {
  const req = new Request(
    `https://example.com/api/v1/projects/${projectId}/agent-reports${query}`,
    { method, ...(raw === undefined ? {} : { body: raw }) },
  );
  return {
    actor: { id: "actor", memberships: [{ projectId: "internal1", role }] },
    actorId: "actor",
    auth: {
      project: {
        createdAt: new Date(stamp),
        domain: "example.com",
        id: "internal1",
        name: "Example",
        ownerId: "actor",
        publicId: projectId,
        updatedAt: new Date(stamp),
        writeMode,
      },
      apiKey: {
        id: "key",
        name: "Workspace test",
        prefix: "bsb_key_test_workspace",
        projectId: "internal1",
        scopes: ["read", "write"],
      },
    },
    headers: new Headers(),
    method,
    path: [],
    req,
    url: new URL(req.url),
    instance: "urn:test",
    origin: {
      credentialKind: "project_key",
      credentialId: "key",
      source: "api",
      surface: "programmatic",
    },
  };
}

async function response(ctx: ApiContext, operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return errorFromUnknown(error, ctx.headers, ctx.url);
  }
}

describe("workspace REST boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(report);
    mocks.get.mockResolvedValue(report);
    mocks.list.mockResolvedValue({ reports: [report], hasMore: false });
    mocks.saveContext.mockImplementation((_project, input) =>
      Promise.resolve({ ...input, updatedAt: stamp }),
    );
  });
  it.each([
    "null",
    "[]",
    "42",
    "{}",
    "{invalid",
    JSON.stringify({ ...contextBody, goals: "x".repeat(4001) }),
  ])("rejects malformed context with a 400", async (raw) => {
    const ctx = context("PATCH", raw);
    expect((await response(ctx, () => projectContextRoute(ctx, projectId))).status).toBe(400);
    expect(mocks.saveContext).not.toHaveBeenCalled();
  });
  it("preserves report producer keys and snakeizes context metadata", async () => {
    const ctx = context(
      "POST",
      JSON.stringify({
        kind: "external_analysis",
        title: report.title,
        body: report.body,
        provenance: report.provenance,
      }),
    );
    const saved = await agentReportsRoute(ctx, projectId);
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual({ ...report, createdAt: undefined, created_at: stamp });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "internal1",
        actorId: "actor",
        body: { modelResponse: "synthetic" },
      }),
    );
    const update = context("PATCH", JSON.stringify(contextBody));
    const contextResult = await projectContextRoute(update, projectId);
    expect(await contextResult.json()).toEqual({ ...contextBody, updated_at: stamp });
  });
  it.each([
    "null",
    "[]",
    "{bad",
    JSON.stringify({ kind: "audit", title: "Audit", body: { text: "é".repeat(140000) } }),
    JSON.stringify({
      kind: "audit",
      title: "Audit",
      body: {},
      provenance: { value: "x".repeat(33000) },
    }),
  ])("rejects malformed or oversized report", async (raw) => {
    const ctx = context("POST", raw);
    expect((await response(ctx, () => agentReportsRoute(ctx, projectId))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects oversized request text before storage", async () => {
    const ctx = context("POST", JSON.stringify({ text: "x".repeat(330000) }));
    const result = await response(ctx, () => agentReportsRoute(ctx, projectId));
    expect(result.status).toBe(400);
    expect((await result.json()).detail).toContain("320 KiB");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["site_audit", "ai_visibility", "prompt_explorer", "SITE_AUDIT"])(
    "does not let external reports forge producer kind %s",
    async (kind) => {
      const ctx = context("POST", JSON.stringify({ kind, title: "Forged result", body: {} }));
      expect((await response(ctx, () => agentReportsRoute(ctx, projectId))).status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("does not read foreign project reports or accept internal report IDs", async () => {
    const ctx = context();
    expect((await agentReportRoute(ctx, "prj_bcdefghijklmnopqrstuvwxy", reportId)).status).toBe(
      403,
    );
    expect(mocks.get).not.toHaveBeenCalled();
    expect(
      (await response(ctx, () => agentReportRoute(ctx, projectId, "internal-id"))).status,
    ).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue(null);
    expect((await agentReportRoute(ctx, projectId, reportId)).status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith({ projectId: "internal1", reportId });
  });
  it.each(["viewer", "auditor"] as Role[])("rejects %s mutations before storage", async (role) => {
    const ctx = context("PATCH", JSON.stringify(contextBody), role);
    expect((await response(ctx, () => projectContextRoute(ctx, projectId))).status).toBe(403);
    const reportCtx = context(
      "POST",
      JSON.stringify({ kind: "audit", title: "Audit", body: {} }),
      role,
    );
    expect((await response(reportCtx, () => agentReportsRoute(reportCtx, projectId))).status).toBe(
      403,
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.saveContext).not.toHaveBeenCalled();
  });
  it.each(["migration_hold", "migrated"])("rejects %s writes", async (writeMode) => {
    const ctx = context("PATCH", JSON.stringify(contextBody), "owner", writeMode);
    expect((await response(ctx, () => projectContextRoute(ctx, projectId))).status).toBe(423);
    const reportCtx = context(
      "POST",
      JSON.stringify({ kind: "audit", title: "Audit", body: {} }),
      "owner",
      writeMode,
    );
    expect((await response(reportCtx, () => agentReportsRoute(reportCtx, projectId))).status).toBe(
      423,
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.saveContext).not.toHaveBeenCalled();
  });
  it("uses stable timestamp and public ID cursor ties", async () => {
    mocks.list.mockResolvedValue({ reports: [report], hasMore: true });
    const ctx = context("GET", undefined, "viewer", "active", "?limit=1");
    const first = await agentReportsRoute(ctx, projectId);
    const cursor = (await first.json()).meta.next_cursor;
    expect(decodeCursor(cursor, "agr")).toEqual({ public_id: reportId, t: stamp, v: 3 });
    const nextCtx = context(
      "GET",
      undefined,
      "viewer",
      "active",
      `?kind=prompt_explorer&limit=1&cursor=${cursor}`,
    );
    await agentReportsRoute(nextCtx, projectId);
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "prompt_explorer",
        limit: 1,
        projectId: "internal1",
        after: expect.objectContaining({ id: reportId, createdAt: stamp }),
      }),
    );
  });
  it.each(["project", "kind", "timestamp"])(
    "rejects a cursor from another %s",
    async (mismatch) => {
      mocks.get.mockResolvedValue(
        mismatch === "project"
          ? null
          : {
              ...report,
              ...(mismatch === "kind"
                ? { kind: "site_audit" }
                : { createdAt: "2026-10-01T12:00:00.000Z" }),
            },
      );
      const cursor = encodeCursor({ publicId: reportId, timestamp: new Date(stamp) }, "agr");
      const ctx = context(
        "GET",
        undefined,
        "viewer",
        "active",
        `?kind=prompt_explorer&cursor=${cursor}`,
      );
      const result = await response(ctx, () => agentReportsRoute(ctx, projectId));
      expect(result.status).toBe(400);
      expect((await result.json()).type).toContain("invalid_cursor");
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );
});
