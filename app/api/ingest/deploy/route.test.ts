import { resetDeployReplayStateForTests } from "@/lib/ingest/deploy-replay";
import { hashApiKey } from "@/lib/providers/crypto";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  emitSignal: vi.fn(),
  prisma: {
    ingestHook: { findUnique: vi.fn(), update: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  redisConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));

const rawToken = "bih_live_valid_token_value_12345";

function hook(overrides: Record<string, unknown> = {}) {
  return {
    disabled: false,
    id: "hook_1",
    label: "Production deploys",
    project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
    projectId: "project_1",
    publicId: "dwh_a00000000000000000000000",
    ...overrides,
  };
}

function request(
  body: unknown,
  url = "https://example.test/api/ingest/deploy?provider=vercel",
  token = rawToken,
) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  }) as NextRequest;
}

async function post(req: NextRequest) {
  const response = await POST(req);
  if (!response) throw new Error("Expected route response.");
  return response;
}

describe("POST /api/ingest/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDeployReplayStateForTests();
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((limit) =>
      Response.json(
        { status: 429, title: "Rate limited" },
        { headers: limit.headers, status: 429 },
      ),
    );
    mocks.prisma.ingestHook.findUnique.mockResolvedValue(hook());
    mocks.prisma.ingestHook.update.mockResolvedValue(hook({ lastUsedAt: new Date() }));
    mocks.emitSignal.mockResolvedValue({
      id: "signal_1",
      publicId: "sig_b00000000000000000000000",
    });
  });

  it("authenticates a hook token and emits a deploy completed signal", async () => {
    const response = await post(
      request({
        payload: {
          deployment: {
            id: "dpl_123",
            target: "production",
            url: "app-example.vercel.app",
          },
        },
        type: "deployment.succeeded",
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(202);
    expect(mocks.prisma.ingestHook.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashApiKey(rawToken) } }),
    );
    expect(mocks.emitSignal).toHaveBeenCalledWith({
      createdById: null,
      payload: {
        deploymentId: "dpl_123",
        environment: "production",
        provider: "vercel",
      },
      projectId: "project_1",
      source: "deploy",
      type: "deploy.completed",
      url: "https://app-example.vercel.app/",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signal.ingested",
        actorId: null,
        targetId: "sig_b00000000000000000000000",
        targetType: "signal",
      }),
    );
    expect(mocks.prisma.ingestHook.update).toHaveBeenCalledWith({
      data: { lastUsedAt: expect.any(Date) },
      where: { id: "hook_1" },
    });
  });

  it("collapses repeated deployment ids for the same hook within the replay window", async () => {
    const body = { deployment_id: "deploy_replay_1", url: "https://example.com/release" };
    const url = "https://example.test/api/ingest/deploy";

    const first = await post(request(body, url));
    const duplicate = await post(request(body, url));

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toEqual({ duplicate: true, ok: true });
    expect(mocks.emitSignal).toHaveBeenCalledTimes(1);
  });

  it("emits Amplify deploy completed signals from EventBridge events", async () => {
    const response = await post(
      request(
        {
          detail: {
            appId: "d1a2b3c4d5e6f7",
            branchName: "main",
            jobId: "42",
            jobStatus: "SUCCEED",
          },
          "detail-type": "Amplify Deployment Status Change",
          id: "event_1",
          region: "eu-central-1",
          source: "aws.amplify",
          version: "0",
        },
        "https://example.test/api/ingest/deploy?provider=amplify",
      ),
    );

    expect(response.status).toBe(202);
    expect(mocks.emitSignal).toHaveBeenCalledWith({
      createdById: null,
      payload: {
        deploymentId: "42",
        environment: "main",
        provider: "amplify",
      },
      projectId: "project_1",
      source: "deploy",
      type: "deploy.completed",
      url: "https://main.d1a2b3c4d5e6f7.amplifyapp.com/",
    });
  });

  it("accepts query token authentication for generic events", async () => {
    const response = await post(
      new Request(`https://example.test/api/ingest/deploy?token=${rawToken}`, {
        body: JSON.stringify({ deployment_id: "deploy_1", url: "https://example.com" }),
        method: "POST",
      }) as NextRequest,
    );

    expect(response.status).toBe(202);
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { deploymentId: "deploy_1", provider: "generic" },
        url: "https://example.com/",
      }),
    );
  });

  it("always emits into the hook project and ignores body-supplied scope", async () => {
    const response = await post(
      request(
        {
          deployment_id: "deploy_scope_1",
          projectId: "project_2",
          url: "https://example.com/release",
        },
        "https://example.test/api/ingest/deploy",
      ),
    );

    expect(response.status).toBe(202);
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          deploymentId: "deploy_scope_1",
          provider: "generic",
        },
        projectId: "project_1",
      }),
    );
    expect(JSON.stringify(mocks.emitSignal.mock.calls)).not.toContain("project_2");
  });

  it("rejects oversized bodies from the content-length header without reading them", async () => {
    const request = new Request("https://example.test/api/ingest/deploy", {
      body: JSON.stringify({ deployment_id: "deploy_1" }),
      headers: { authorization: `Bearer ${rawToken}`, "content-length": String(512 * 1024) },
      method: "POST",
    }) as NextRequest;
    const text = vi.spyOn(request, "text" as never);

    const response = await post(request);

    expect(response.status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens", async () => {
    mocks.prisma.ingestHook.findUnique.mockResolvedValue(null);

    const response = await post(request({ deployment_id: "deploy_1" }));

    expect(response.status).toBe(401);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("rejects tokens whose hook has been deleted", async () => {
    mocks.prisma.ingestHook.findUnique.mockResolvedValue(null);

    const response = await post(
      request(
        { deployment_id: "deploy_deleted_1" },
        "https://example.test/api/ingest/deploy",
        "bih_live_deleted_token_value_12345",
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("rejects disabled hook tokens at the route boundary", async () => {
    mocks.prisma.ingestHook.findUnique.mockResolvedValue(hook({ disabled: true }));

    const response = await post(
      request({ deployment_id: "deploy_disabled_1" }, "https://example.test/api/ingest/deploy"),
    );

    expect(response.status).toBe(401);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("looks up only the token hash and never echoes token material", async () => {
    const response = await post(
      request({ deployment_id: "deploy_hash_1" }, "https://example.test/api/ingest/deploy"),
    );
    const body = JSON.stringify(await response.json());

    expect(mocks.prisma.ingestHook.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashApiKey(rawToken) },
      }),
    );
    expect(body).not.toContain(rawToken);
    expect(body).not.toContain(hashApiKey(rawToken));
  });

  it("rejects an old token and accepts its in-place replacement", async () => {
    const oldToken = "bih_live_old_token_value_12345";
    const newToken = "bih_live_new_token_value_12345";
    mocks.prisma.ingestHook.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.tokenHash === hashApiKey(newToken) ? hook() : null),
    );

    const url = "https://example.test/api/ingest/deploy";
    const oldResponse = await post(request({ deployment_id: "deploy_old" }, url, oldToken));
    const newResponse = await post(request({ deployment_id: "deploy_new" }, url, newToken));

    expect(oldResponse.status).toBe(401);
    expect(newResponse.status).toBe(202);
    expect(mocks.emitSignal).toHaveBeenCalledTimes(1);
  });

  it("returns 422 for unparseable deploy events", async () => {
    const response = await post(
      request({ hello: "world" }, "https://example.test/api/ingest/deploy"),
    );

    expect(response.status).toBe(422);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("acknowledges known non-success deploy events without creating a signal", async () => {
    const response = await post(request({ type: "deployment.failed" }));

    expect(response.status).toBe(202);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
    expect(mocks.prisma.ingestHook.update).toHaveBeenCalledWith({
      data: { lastUsedAt: expect.any(Date) },
      where: { id: "hook_1" },
    });
  });
});
