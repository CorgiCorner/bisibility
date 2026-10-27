import { keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    savedView: {
      count: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return {
    session: vi.fn(),
    audit: vi.fn(),
    authenticate: vi.fn(),
    prisma: { ...prisma, $transaction: vi.fn(async (body) => body(prisma)) },
  };
});
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
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
  mocks.prisma.project.findUniqueOrThrow.mockImplementation(async () =>
    mocks.prisma.project.findFirst(),
  );
  mocks.prisma.$queryRaw.mockResolvedValue([{ id: project.id }]);
  mocks.prisma.savedView.count.mockResolvedValue(0);
  mocks.prisma.savedView.findFirst.mockResolvedValue({
    id: "view-db",
    publicId: viewRef,
    createdById: "third-user",
    name: "Third users view",
    surface: "keywords",
    visibility: "project",
    ownerId: null,
    revision: 1,
  });
  mocks.prisma.savedView.deleteMany.mockResolvedValue({ count: 1 });
});
it("denies a member PAT deleting another user view despite an owner browser session", async () => {
  mocks.session.mockResolvedValue({ user: { id: "owner-user" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    role: "member",
    memberships: [{ projectId: project.id, role: "owner" }],
  });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(403);
  expect(mocks.prisma.savedView.deleteMany).not.toHaveBeenCalled();
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
  expect(mocks.prisma.savedView.deleteMany).not.toHaveBeenCalled();
});
it("allows a member PAT to delete its own view without a browser session", async () => {
  mocks.session.mockRejectedValue(new Error("NEXT_REDIRECT"));
  mocks.prisma.savedView.findFirst.mockResolvedValue({
    id: "view-db",
    publicId: viewRef,
    createdById: "member-user",
    name: "Own view",
    surface: "keywords",
    visibility: "project",
    ownerId: null,
    revision: 1,
  });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(200);
  expect(mocks.prisma.savedView.deleteMany).toHaveBeenCalled();
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
  const systemBody = await response.json();
  expect(systemBody.created_by_id).toBeNull();
  expect(mocks.prisma.savedView.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ createdById: null, projectId: project.id }),
    }),
  );
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: null }),
    expect.objectContaining({ savedView: mocks.prisma.savedView }),
  );
  expect(mocks.session).not.toHaveBeenCalled();
});
it("does not delete a saved view on a read-only project", async () => {
  mocks.prisma.project.findUnique.mockResolvedValue({ ...project, writeMode: "migration_hold" });
  mocks.prisma.project.findFirst.mockResolvedValue({ ...project, writeMode: "migration_hold" });
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(423);
  expect(mocks.prisma.savedView.deleteMany).not.toHaveBeenCalled();
});

it("keeps a matching user PAT project-only and never borrows its browser session for private views", async () => {
  mocks.session.mockResolvedValue({ user: { id: "member-user" } });
  mocks.prisma.savedView.findFirst.mockImplementation(async ({ where }) =>
    where.visibility === "project"
      ? null
      : {
          id: "private-view",
          publicId: viewRef,
          createdById: "member-user",
          ownerId: "member-user",
          visibility: "private",
          revision: 1,
          name: "Private sensitive scope",
          surface: "keywords",
        },
  );
  const response = await handleApiRequest(request(), path);
  expect(response.status).toBe(200);
  expect(mocks.prisma.savedView.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: project.id, publicId: viewRef, visibility: "project" },
    }),
  );
  expect(mocks.prisma.savedView.deleteMany).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain("Private sensitive scope");
});

it("returns only the creator public ID on real list responses, including missing creators", async () => {
  const config = keywordViewFixture();
  const row = {
    id: "view-db",
    publicId: viewRef,
    createdById: "private-user-db-id",
    createdBy: { publicId: "usr_aaaaaaaaaaaaaaaaaaaaaaaa" },
    createdAt: new Date("2026-01-07T00:00:00.000Z"),
    name: "View",
    surface: "keywords",
    visibility: "project",
    ownerId: null,
    revision: 1,
    config,
  };
  const listPath = ["projects", ref, "saved-views"];
  for (const field of ["keyword", "researchVolume"] as const) {
    config.sort = { field, direction: "asc" };
    mocks.prisma.savedView.findMany.mockResolvedValue([
      row,
      { ...row, createdById: null, createdBy: null },
      { ...row, createdBy: { publicId: "private-user-db-id" } },
    ]);
    const response = await handleApiRequest(
      new Request(`https://example.test/api/v1/${listPath.join("/")}`, {
        headers: { authorization: "Bearer bsb_pat_live_fixture" },
      }),
      listPath,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((view: { created_by_id: string | null }) => view.created_by_id)).toEqual([
      "usr_aaaaaaaaaaaaaaaaaaaaaaaa",
      null,
      null,
    ]);
    expect(body.data[0].definition.sort.field).toBe(field);
    expect(JSON.stringify(body)).not.toContain("private-user-db-id");
    expect(mocks.prisma.savedView.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { projectId: project.id, surface: "keywords", visibility: "project" },
        select: expect.objectContaining({ createdBy: { select: { publicId: true } } }),
      }),
    );
  }
});

it("attributes a personal-token creation to its public user ID", async () => {
  mocks.prisma.savedView.create.mockImplementation(async ({ data }) => ({
    ...data,
    id: "view-db",
    createdAt: new Date("2026-01-07T00:00:00.000Z"),
    createdBy: { publicId: "usr_aaaaaaaaaaaaaaaaaaaaaaaa" },
  }));
  const createPath = ["projects", ref, "saved-views"];
  const response = await handleApiRequest(
    new Request(`https://example.test/api/v1/${createPath.join("/")}`, {
      method: "POST",
      headers: { authorization: "Bearer bsb_pat_live_fixture" },
      body: JSON.stringify({ name: "User view", config: {} }),
    }),
    createPath,
  );
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.created_by_id).toBe("usr_aaaaaaaaaaaaaaaaaaaaaaaa");
  expect(JSON.stringify(body)).not.toContain("member-user");
  expect(mocks.prisma.savedView.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ createdById: "member-user" }),
      select: expect.objectContaining({ createdBy: { select: { publicId: true } } }),
    }),
  );
});

it("returns a compatible legacy version 1 view through the list route", async () => {
  mocks.prisma.savedView.findMany.mockResolvedValue([
    {
      id: "view-db",
      publicId: viewRef,
      createdById: null,
      createdBy: null,
      createdAt: new Date("2026-01-07T00:00:00.000Z"),
      name: "Legacy view",
      surface: "keywords",
      visibility: "project",
      ownerId: null,
      revision: 1,
      config: { surface: "keywords", version: 1 },
    },
  ]);
  const listPath = ["projects", ref, "saved-views"];
  const response = await handleApiRequest(
    new Request(`https://example.test/api/v1/${listPath.join("/")}`, {
      headers: { authorization: "Bearer bsb_pat_live_fixture" },
    }),
    listPath,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data[0]).toMatchObject({
    created_by_id: null,
    config: { surface: "keywords", version: 1 },
    definition: { surface: "keywords", version: 1 },
  });
});
