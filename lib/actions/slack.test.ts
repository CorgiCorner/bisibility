import { decryptSecret } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeSlackOAuthInstall, createSlackInstallState } from "./slack";

const mocks = vi.hoisted(() => ({
  cookieStore: { delete: vi.fn(), get: vi.fn(), set: vi.fn() },
  prisma: {
    project: { findFirst: vi.fn() },
    slackConnection: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  revalidatePath: vi.fn(),
  requireSession: vi.fn(),
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => mocks.cookieStore), headers: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));

function slackResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("Slack OAuth install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.SLACK_CLIENT_ID = "slack_client";
    process.env.SLACK_CLIENT_SECRET = "slack_secret";
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.slackConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.slackConnection.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        channelId: create.channelId,
        channelName: create.channelName,
        enabled: create.enabled,
        id: "slack_1",
        installedById: create.installedById,
        scope: create.scope,
        teamId: create.teamId,
        teamName: create.teamName,
      }),
    );
  });

  it("exchanges the Slack code and stores the encrypted bot token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      slackResponse({
        access_token: "xoxb-token",
        incoming_webhook: { channel: "#alerts", channel_id: "C123" },
        ok: true,
        scope: "chat:write,incoming-webhook",
        team: { id: "T123", name: "Acme" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const redirectUri = "https://app.example.com/api/integrations/slack/callback";
    const state = createSlackInstallState({
      actorId: "user_1",
      projectId: "prj_a00000000000000000000000",
      redirectUri,
      returnPath: "/app/alerts",
    });
    mocks.cookieStore.get.mockReturnValue({ value: state });

    const result = await completeSlackOAuthInstall({ code: "oauth_code", state });

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://slack.com/api/oauth.v2.access",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody.get("client_id")).toBe("slack_client");
    expect(requestBody.get("client_secret")).toBe("slack_secret");
    expect(requestBody.get("code")).toBe("oauth_code");
    expect(requestBody.get("redirect_uri")).toBe(redirectUri);

    const create = mocks.prisma.slackConnection.upsert.mock.calls[0]?.[0].create;
    expect(create).toMatchObject({
      channelId: "C123",
      channelName: "#alerts",
      enabled: true,
      installedById: "user_1",
      projectId: "project_1",
      teamId: "T123",
      teamName: "Acme",
    });
    expect(decryptSecret(create.accessTokenHash)).toBe("xoxb-token");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "slack_connection.create", targetId: "slack_1" }),
    );
    expect(result).toMatchObject({
      channelId: "C123",
      connectionId: "slack_1",
      projectId: "prj_a00000000000000000000000",
    });
  });

  it("does not store a connection when Slack rejects the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(slackResponse({ error: "bad_code", ok: false })),
    );
    const state = createSlackInstallState({
      actorId: "user_1",
      projectId: "prj_a00000000000000000000000",
      redirectUri: "https://app.example.com/api/integrations/slack/callback",
      returnPath: "/app/alerts",
    });
    mocks.cookieStore.get.mockReturnValue({ value: state });

    await expect(completeSlackOAuthInstall({ code: "bad", state })).rejects.toThrow(
      "Slack OAuth exchange failed: bad_code.",
    );
    expect(mocks.prisma.slackConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects when the state cookie does not match the callback state", async () => {
    const state = createSlackInstallState({
      actorId: "user_1",
      projectId: "prj_a00000000000000000000000",
      redirectUri: "https://app.example.com/api/integrations/slack/callback",
      returnPath: "/app/alerts",
    });
    mocks.cookieStore.get.mockReturnValue({ value: "different-state" });

    await expect(completeSlackOAuthInstall({ code: "oauth_code", state })).rejects.toThrow(
      "Slack OAuth state did not match the initiating session.",
    );
    expect(mocks.prisma.slackConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects when the session user does not match the state actor", async () => {
    const state = createSlackInstallState({
      actorId: "user_1",
      projectId: "prj_a00000000000000000000000",
      redirectUri: "https://app.example.com/api/integrations/slack/callback",
      returnPath: "/app/alerts",
    });
    mocks.cookieStore.get.mockReturnValue({ value: state });
    mocks.requireSession.mockResolvedValue({ user: { id: "attacker" } });

    await expect(completeSlackOAuthInstall({ code: "oauth_code", state })).rejects.toThrow(
      "Slack OAuth installer does not match the current session.",
    );
    expect(mocks.prisma.slackConnection.upsert).not.toHaveBeenCalled();
  });
});
