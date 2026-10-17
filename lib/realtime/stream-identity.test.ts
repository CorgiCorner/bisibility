import { notFound, redirect } from "@/tests/next-navigation";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  user: vi.fn(),
  project: vi.fn(),
  deleteSessions: vi.fn(),
  demoActor: vi.fn(),
  canRead: vi.fn(),
  feed: vi.fn(),
  operations: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/auth/test-auth-extension", () => ({ assertTestAuthSession: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    project: { findUnique: mocks.project },
    session: { deleteMany: mocks.deleteSessions },
  },
}));
vi.mock("@/lib/demo/identity", () => ({ loadConfiguredDemoActor: mocks.demoActor }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("./stream-access", () => ({ canReadStream: mocks.canRead }));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: async () => ({ resolved: "month_first" }),
}));
vi.mock("@/lib/notifications/feed", () => ({
  getNotificationFeedForScope: mocks.feed,
  notificationFeedSignature: JSON.stringify,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  notificationRealtimeRedisConfigured: () => true,
  subscribeToNotificationEvents: mocks.subscribe,
  subscribeToOperationEvents: mocks.subscribe,
}));
vi.mock("@/lib/rank-check/runs/snapshot", () => ({ readOperationSnapshot: mocks.operations }));

import { GET } from "./stream-route";

const publicId = "prj_abcdefghijklmnopqrstuvwx";
const session = { session: { id: "session_1" }, user: { id: "user_1" } };
const active = { deactivatedAt: null };
const actor = { role: "member", memberships: [{ projectId: "project_1", role: "owner" }] };
const request = () =>
  new Request(`https://example.com/api/realtime/stream?project=${publicId}`) as NextRequest;

async function expectRetry(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(await response.text()).toBe("retry: 15000\n\n");
  expect(mocks.feed).not.toHaveBeenCalled();
  expect(mocks.operations).not.toHaveBeenCalled();
  expect(mocks.subscribe).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.user.mockImplementation(async ({ select }) => (select.role ? actor : active));
  mocks.project.mockResolvedValue({ id: "project_1", publicId, isSample: false });
  mocks.canRead.mockResolvedValue(true);
  mocks.feed.mockResolvedValue({ items: [], unreadCount: 0 });
  mocks.operations.mockResolvedValue([]);
  mocks.subscribe.mockReturnValue({ close: vi.fn(), ready: Promise.resolve() });
  redirect.mockImplementation(() => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
  });
  notFound.mockImplementation(() => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("stream identity with real session and project authorization", () => {
  it.each(["session", "active account", "actor", "project"])(
    "retries after an unavailable %s read without delivering data",
    async (stage) => {
      const failure = new Error("timeout exceeded when trying to connect");
      if (stage === "session") mocks.getSession.mockRejectedValue(failure);
      if (stage === "active account") mocks.user.mockRejectedValue(failure);
      if (stage === "actor")
        mocks.user.mockResolvedValueOnce(active).mockRejectedValueOnce(failure);
      if (stage === "project") mocks.project.mockRejectedValueOnce(failure);
      await expectRetry(await GET(request()));
      expect(redirect).not.toHaveBeenCalled();
      expect(notFound).not.toHaveBeenCalled();
      if (stage === "session") expect(mocks.getSession).toHaveBeenCalledTimes(2);
      if (stage === "active account") expect(mocks.user).toHaveBeenCalledTimes(2);

      mocks.getSession.mockResolvedValue(session);
      mocks.user.mockImplementation(async ({ select }) => (select.role ? actor : active));
      const healthy = await GET(request());
      expect(healthy.status).toBe(200);
      expect(mocks.feed).toHaveBeenCalledOnce();
      await healthy.body?.cancel();
    },
  );

  it.each(["missing session", "missing user", "deactivated", "revoked session"])(
    "keeps confirmed %s terminal",
    async (denial) => {
      if (denial === "missing session") mocks.getSession.mockResolvedValue(null);
      if (denial === "missing user") mocks.user.mockResolvedValue(null);
      if (denial === "deactivated") mocks.user.mockResolvedValue({ deactivatedAt: new Date() });
      if (denial === "revoked session") mocks.canRead.mockResolvedValue(false);
      const response = await GET(request());
      expect(response.status).toBe(401);
      expect(mocks.feed).not.toHaveBeenCalled();
      expect(mocks.subscribe).not.toHaveBeenCalled();
    },
  );

  it("keeps revoked membership and missing projects terminal", async () => {
    mocks.user.mockResolvedValueOnce(active).mockResolvedValueOnce({ ...actor, memberships: [] });
    expect((await GET(request())).status).toBe(404);
    mocks.project.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.feed).not.toHaveBeenCalled();
  });

  it("keeps demo database errors retryable without bypassing the configured actor", async () => {
    vi.stubEnv("DEMO_MODE", "editable");
    vi.stubEnv("DEMO_OWNER_ID", "usr_zyxwvutsrqponmlkjihgfedc");
    vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
    vi.stubEnv("DEMO_PROJECT_ID", publicId);
    try {
      mocks.demoActor.mockRejectedValueOnce(new Error("Synthetic database failure"));
      await expectRetry(await GET(request()));
      mocks.demoActor.mockResolvedValueOnce(null);
      expect((await GET(request())).status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
