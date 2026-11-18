import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  member: vi.fn(),
  user: vi.fn(),
  dispatch: vi.fn(),
  policy: vi.fn(),
  idempotency: vi.fn(),
  capability: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.project },
    membership: { findUnique: mocks.member },
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/achievements/api", () => ({
  withPracticeRequest: (_ctx: unknown, _id: unknown, execute: () => unknown) => execute(),
}));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.capability }));
vi.mock("./routes", () => ({ dispatchRoute: mocks.dispatch }));
vi.mock("./operation-policy", () => ({ operationPolicyForRequest: mocks.policy }));
vi.mock("./idempotency", () => ({ withIdempotency: mocks.idempotency }));

import { handleNativeSessionApiRequest } from "./native-session";

const principal = { kind: "native_session" as const, userId: "user", sessionId: "session" };
const request = (method = "GET", project = "prj_test") =>
  new Request("https://app.local/api/v1/projects/prj_test/keywords", {
    method,
    headers: { "x-bisibility-project": project },
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({
    id: "internal",
    publicId: "prj_test",
    name: "Project",
    domain: null,
    ownerId: "owner",
    writeMode: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mocks.member.mockResolvedValue({ role: "member" });
  mocks.user.mockResolvedValue({ deactivatedAt: null });
  mocks.capability.mockReturnValue(true);
  mocks.policy.mockReturnValue({
    operationId: "listKeywords",
    requiredScope: "read",
    projectAccess: "read",
    capability: { action: "read", resourceType: "keyword" },
  });
  mocks.dispatch.mockResolvedValue(new Response("ok"));
  mocks.idempotency.mockImplementation(async (_options, execute) => execute());
});
test("dispatches a fresh member with a dashboard origin and user actor", async () => {
  expect(
    (
      await handleNativeSessionApiRequest(
        request(),
        ["projects", "prj_test", "keywords"],
        principal,
      )
    ).status,
  ).toBe(200);
  const [ctx] = mocks.dispatch.mock.calls[0];
  expect(ctx).toMatchObject({
    actorId: "user",
    actor: { id: "user", memberships: [{ projectId: "internal", role: "member" }] },
    auth: { kind: "native_session" },
    origin: { source: "app", surface: "app", credentialId: null, credentialKind: null },
  });
  expect(ctx.auth).not.toHaveProperty("apiKey");
});
test("rejects forged project scope and revoked membership", async () => {
  expect(
    (
      await handleNativeSessionApiRequest(
        request(),
        ["projects", "prj_other", "keywords"],
        principal,
      )
    ).status,
  ).toBe(404);
  mocks.member.mockResolvedValue(null);
  expect(
    (
      await handleNativeSessionApiRequest(
        request(),
        ["projects", "prj_test", "keywords"],
        principal,
      )
    ).status,
  ).toBe(404);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
test("viewer cannot write and mutating requests use the native idempotency namespace", async () => {
  mocks.policy.mockReturnValue({
    operationId: "addKeywords",
    requiredScope: "write",
    projectAccess: "write",
  });
  mocks.member.mockResolvedValue({ role: "viewer" });
  expect(
    (
      await handleNativeSessionApiRequest(
        request("POST"),
        ["projects", "prj_test", "keywords"],
        principal,
      )
    ).status,
  ).toBe(403);
  mocks.member.mockResolvedValue({ role: "member" });
  expect(
    (
      await handleNativeSessionApiRequest(
        request("POST"),
        ["projects", "prj_test", "keywords"],
        principal,
      )
    ).status,
  ).toBe(200);
  expect(mocks.idempotency.mock.calls[0][0].apiKeyId).toBe("assistant:user");
});
test("refuses account routes", async () => {
  expect((await handleNativeSessionApiRequest(request(), ["me"], principal)).status).toBe(403);
});
