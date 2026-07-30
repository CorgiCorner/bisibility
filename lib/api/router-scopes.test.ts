import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  dispatchAccountRoute: vi.fn(),
  dispatchRoute: vi.fn(),
  resolvePersonalProjectScope: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./account-routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./account-routes")>()),
  dispatchAccountRoute: mocks.dispatchAccountRoute,
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("./personal-scope", () => ({
  resolvePersonalProjectScope: mocks.resolvePersonalProjectScope,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./routes", () => ({
  dispatchRoute: mocks.dispatchRoute,
}));

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function request(method: string, path: string) {
  return new Request(`https://example.test/api/v1${path}`, {
    headers: { authorization: "Bearer bsb_key_live_test_key" },
    method,
  });
}

describe("API key scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dispatchAccountRoute.mockResolvedValue(undefined);
    mocks.dispatchRoute.mockResolvedValue(undefined);
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Read only",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["read"],
      },
      project,
    });
  });

  it("rejects writes for read-only API keys before dispatch", async () => {
    const response = await handleApiRequest(request("POST", "/signals"), ["signals"]);

    expect(response.status).toBe(403);
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("allows the POST keyword lookup with read scope during migration hold", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Read only",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["read"],
      },
      project: { ...project, writeMode: "migration_hold" },
    });
    mocks.dispatchRoute.mockResolvedValue(Response.json({ data: [] }));

    const response = await handleApiRequest(request("POST", "/projects/prj_1/keyword-matches"), [
      "projects",
      "prj_1",
      "keyword-matches",
    ]);

    expect(response.status).toBe(200);
    expect(mocks.dispatchRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: ["projects", "prj_1", "keyword-matches"],
      }),
    );
  });

  it("allows signal ingestion for write-scope API keys", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Write",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["write"],
      },
      project,
    });
    mocks.dispatchRoute.mockResolvedValue(new Response(null, { status: 201 }));

    const response = await handleApiRequest(request("POST", "/signals"), ["signals"]);

    expect(response.status).toBe(201);
    expect(mocks.dispatchRoute).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: ["signals"] }),
    );
  });

  it("requires write scope for paid ranked-keyword suggestion reads", async () => {
    const response = await handleApiRequest(
      request("GET", "/projects/prj_1/ranked-keyword-suggestions"),
      ["projects", "prj_1", "ranked-keyword-suggestions"],
    );

    expect(response.status).toBe(403);
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("requires admin scope for team mutations and passes an explicit API actor", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Write only",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["write"],
      },
      project,
    });
    const denied = await handleApiRequest(
      request("PATCH", "/projects/prj_1/team/members/member_1"),
      ["projects", "prj_1", "team", "members", "member_1"],
    );
    expect(denied.status).toBe(403);

    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Admin",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project: { ...project, ownerId: "owner_1" },
    });
    mocks.dispatchRoute.mockResolvedValue(new Response(null, { status: 200 }));
    const allowed = await handleApiRequest(
      request("PATCH", "/projects/prj_1/team/members/member_1"),
      ["projects", "prj_1", "team", "members", "member_1"],
    );

    expect(allowed.status).toBe(200);
    expect(mocks.dispatchRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          id: "owner_1",
          memberships: [{ projectId: "project_1", role: "owner" }],
        },
        actorId: null,
      }),
    );
  });

  it("rejects project creation for project-scoped API keys before dispatch", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Admin",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project,
    });

    const response = await handleApiRequest(request("POST", "/projects"), ["projects"]);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      detail: "Project-scoped API keys cannot create projects.",
      title: "Forbidden",
    });
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("explains that project keys cannot access account routes", async () => {
    const response = await handleApiRequest(request("GET", "/me"), ["me"]);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "This route requires a personal access token.",
      title: "Not found",
    });
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("keeps the generic not-found detail for unknown routes", async () => {
    const response = await handleApiRequest(request("GET", "/unknown"), ["unknown"]);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Route not found.",
      title: "Not found",
    });
  });

  it("keeps personal-token account routing unchanged", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "personal_token",
      memberships: [],
      token: {
        id: "pat_1",
        name: "CLI",
        prefix: "bsb_pat_live_",
        scopes: ["read"],
        userId: "user_1",
      },
      user: { email: "owner@example.com", id: "user_1", name: "Owner" },
    });
    mocks.dispatchAccountRoute.mockResolvedValue(Response.json({ id: "user_1" }, { status: 200 }));

    const response = await handleApiRequest(request("GET", "/me"), ["me"]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "user_1" });
    expect(mocks.dispatchAccountRoute).toHaveBeenCalledWith(
      expect.objectContaining({ path: ["me"] }),
    );
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("requires admin scope for deleting a project", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Write only",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["write"],
      },
      project,
    });

    const response = await handleApiRequest(request("DELETE", "/projects/prj_1"), [
      "projects",
      "prj_1",
    ]);

    expect(response.status).toBe(403);
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("rejects writes while the authenticated project is read-only", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Admin",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project: { ...project, writeMode: "migration_hold" },
    });

    const response = await handleApiRequest(request("POST", "/signals"), ["signals"]);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toMatchObject({
      title: "Project read-only",
      type: expect.stringContaining("project_read_only"),
    });
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });

  it("allows a write PAT to create projects through the account router", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "personal_token",
      memberships: [],
      token: {
        id: "pat_1",
        name: "CLI",
        prefix: "bsb_pat_live_",
        scopes: ["read", "write"],
        userId: "user_1",
      },
      user: { email: "owner@example.com", id: "user_1", name: "Owner" },
    });
    mocks.dispatchAccountRoute.mockResolvedValue(new Response(null, { status: 201 }));

    const response = await handleApiRequest(request("POST", "/projects"), ["projects"]);

    expect(response.status).toBe(201);
    expect(mocks.dispatchAccountRoute).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.objectContaining({ kind: "personal_token" }) }),
    );
  });

  it("requires the owner membership before a PAT can delete a project", async () => {
    mocks.authenticateBearer.mockResolvedValue({
      kind: "personal_token",
      memberships: [{ projectId: project.id, role: "admin" }],
      token: {
        id: "pat_1",
        name: "CLI",
        prefix: "bsb_pat_live_",
        scopes: ["read", "write", "admin"],
        userId: "user_1",
      },
      user: { email: "admin@example.com", id: "user_1", name: "Admin" },
    });
    mocks.resolvePersonalProjectScope.mockResolvedValue({
      auth: {
        apiKey: {
          id: "pat_1",
          name: "CLI",
          prefix: "bsb_pat_live_",
          projectId: project.id,
          scopes: ["read", "write", "admin"],
        },
        project,
      },
      role: "admin",
    });

    const response = await handleApiRequest(request("DELETE", "/projects/prj_1"), [
      "projects",
      "prj_1",
    ]);

    expect(response.status).toBe(403);
    expect(mocks.dispatchRoute).not.toHaveBeenCalled();
  });
});
