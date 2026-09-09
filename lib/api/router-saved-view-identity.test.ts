import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  authenticate: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    savedView: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.audit,
  writeAuditFailure: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: vi.fn((_ctx, run) => run()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { handleApiRequest } from "@/lib/api/router";

const ref = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const viewRef = "viw_aaaaaaaaaaaaaaaaaaaaaaaa";
const project = {
  id: "project-db-id",
  publicId: ref,
  name: "Example",
  domain: "example.test",
  ownerId: "owner-user",
  writeMode: "active",
};
const path = ["projects", ref, "saved-views", viewRef];
function request() {
  return new Request(`https://example.test/api/v1/${path.join("/")}`, {
    method: "DELETE",
    headers: { authorization: "Bearer bsb_pat_live_fixture" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    kind: "personal_token",
    memberships: [{ projectId: project.id, role: "member" }],
    token: { id: "pat-id", userId: "member-user", scopes: ["read", "write"] },
    user: { id: "member-user" },
  });
  mocks.prisma.project.findUnique.mockResolvedValue(project);
  mocks.prisma.project.findFirst.mockResolvedValue(project);
  mocks.prisma.savedView.findFirst.mockResolvedValue({
    id: "view-db",
    publicId: viewRef,
    createdById: "third-user",
    name: "Third users view",
    surface: "keywords",
  });
  mocks.prisma.savedView.delete.mockResolvedValue({});
});
it("denies a member PAT deleting another user view despite an owner browser session", async () => {
  mocks.session.mockResolvedValue({ user: { id: "owner-user" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    role: "member",
    memberships: [{ projectId: project.id, role: "owner" }],
  });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(403);
  expect(mocks.prisma.savedView.delete).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("control: the same member PAT is denied with a matching member browser session", async () => {
  mocks.session.mockResolvedValue({ user: { id: "member-user" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    role: "member",
    memberships: [{ projectId: project.id, role: "member" }],
  });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(403);
  expect(mocks.prisma.savedView.delete).not.toHaveBeenCalled();
});
it("allows a member PAT to delete its own view without a browser session", async () => {
  mocks.session.mockRejectedValue(new Error("NEXT_REDIRECT"));
  mocks.prisma.savedView.findFirst.mockResolvedValue({
    id: "view-db",
    publicId: viewRef,
    createdById: "member-user",
    name: "Own view",
    surface: "keywords",
  });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(200);
  expect(mocks.prisma.savedView.delete).toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});

it("creates project-key views without attributing them to the project owner", async () => {
  mocks.authenticate.mockResolvedValue({
    kind: "project_key",
    project,
    apiKey: { id: "key", scopes: ["read", "write", "admin"] },
  });
  mocks.prisma.savedView.create.mockImplementation(async ({ data }) => ({
    ...data,
    id: "view-db",
    createdAt: new Date(),
  }));
  const createPath = ["projects", ref, "saved-views"];
  const response = await handleApiRequest(
    new Request(`https://example.test/api/v1/${createPath.join("/")}`, {
      method: "POST",
      headers: { authorization: "Bearer bsb_key_test_fixture" },
      body: JSON.stringify({ name: "API view", config: {} }),
    }),
    createPath,
  );
  expect(response.status).toBe(201);
  expect(mocks.prisma.savedView.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ createdById: null, projectId: project.id }),
    }),
  );
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
  expect(mocks.session).not.toHaveBeenCalled();
});
it("does not delete a saved view on a read-only project", async () => {
  mocks.prisma.project.findUnique.mockResolvedValue({ ...project, writeMode: "migration_hold" });
  mocks.prisma.project.findFirst.mockResolvedValue({ ...project, writeMode: "migration_hold" });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(423);
  expect(mocks.prisma.savedView.delete).not.toHaveBeenCalled();
});
