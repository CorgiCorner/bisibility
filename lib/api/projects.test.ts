import { createKeywordAfterDefault } from "@/lib/api/keyword-create-test-harness";
import type { DefaultsHostContext } from "@/lib/measurement-settings/host/defaults-authority";
import { PROVIDER_CATALOG, serpProviderCapabilities } from "@/lib/providers/registry";
import { keywordLocation } from "@/lib/test/fixtures/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiScope } from "./auth";
import type { ApiContext, PersonalApiContext } from "./context";
import { resetIdempotencyForTests } from "./idempotency";
import * as projectHandlers from "./projects";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    apiKey: { findFirst: vi.fn() },
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    rankCheck: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
  },
  resolveKeywordLocation: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/metering/project-budget-bootstrap", () => ({
  ensureProjectSpendingBudget: vi.fn(),
}));
vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  envInt: (name: string, fallback: number) => {
    const parsed = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  },
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  makePublicId: vi.fn((prefix: string) =>
    prefix === "kw" ? "kw_b00000000000000000000000" : "prj_b00000000000000000000000",
  ),
  parseActionInput: (_schema: unknown, input: unknown) => input,
}));
vi.mock("@/lib/auth/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/audit")>()),
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-writer-fixture-key-only-000")],
}));
vi.mock("@/lib/measurement-settings/host/defaults", async () => {
  const { projectsDefaultsPortFixture } = await import("./projects-defaults.test-fixture");
  return {
    previewDefaultsHost: (context: DefaultsHostContext, request: unknown) =>
      projectsDefaultsPortFixture(context, request, undefined, true),
    saveDefaultsHost: (context: DefaultsHostContext, request: unknown, review: unknown) =>
      projectsDefaultsPortFixture(context, request, review),
  };
});

const project = {
  writeMode: "active",
  isSample: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "user_1",
  publicId: "prj_a00000000000000000000000",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const serpCatalogId = PROVIDER_CATALOG.find((item) => item.kind === "serp")?.id ?? "";
const fullSerpCatalogId =
  PROVIDER_CATALOG.find(
    (item) => item.kind === "serp" && serpProviderCapabilities(item.id)?.backlinks,
  )?.id ?? "";
const analyticsCatalogId = PROVIDER_CATALOG.find((item) => item.kind === "analytics")?.id ?? "";

function providerConnectionRow(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    kind: "serp",
    priority: 0,
    provider: serpCatalogId,
    status: "connected",
    ...overrides,
  };
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: "Bearer bsb_key_live_test_key",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

async function call(method: string, path: string, body?: unknown) {
  return handleApiRequest(
    request(method, path, body),
    path.split("?")[0].split("/").filter(Boolean),
  );
}

function context(
  method: string,
  path: string,
  body?: unknown,
  scopes: readonly ApiScope[] = ["admin"],
): ApiContext {
  const req = request(method, path, body);
  return {
    auth: {
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes,
      },
      project,
    },
    headers: new Headers(),
    instance: `urn:bisibility:api:v1:${path}`,
    method,
    origin: {
      credentialId: "key_1",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: path.split("/").filter(Boolean),
    req,
    url: new URL(req.url),
  };
}

async function reviewedContext(body: object) {
  const path = `/projects/${project.publicId}/defaults`;
  const previewContext = context("PATCH", `${path}?preview_only=true`, body);
  const response = await projectHandlers.updateProjectDefaults(previewContext, project.publicId);
  expect(response.status).toBe(200);
  const preview = await response.json();
  return context("PATCH", path, {
    ...body,
    review: {
      expected_revision: preview.expected_revision,
      expected_source_hash: preview.expected_source_hash,
      preview_token: preview.preview_token,
      idempotency_key: "synthetic-reviewed-project-defaults",
      confirmed: true,
    },
  });
}
async function callReviewedDefaults(body: object) {
  const reviewed = await reviewedContext(body);
  return call("PATCH", `/projects/${project.publicId}/defaults`, await reviewed.req.json());
}

function personalContext(body: unknown): PersonalApiContext {
  const req = request("POST", "/projects", body);
  return {
    auth: {
      kind: "personal_token",
      memberships: [],
      token: {
        id: "pat_1",
        name: "CLI",
        prefix: "bsb_pat_live_",
        publicId: "pat_a00000000000000000000000",
        scopes: ["read", "write"],
        userId: "user_1",
      },
      user: {
        email: "owner@example.com",
        id: "user_1",
        name: "Owner",
        publicId: "usr_a00000000000000000000000",
      },
    },
    headers: new Headers(),
    instance: "urn:bisibility:api:v1:/projects",
    method: "POST",
    path: ["projects"],
    req,
    url: new URL(req.url),
  };
}

const getProjectDefaults = (
  projectHandlers as unknown as {
    getProjectDefaults: (ctx: ApiContext, projectId: string) => Promise<Response>;
  }
).getProjectDefaults;

describe("project write API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetIdempotencyForTests();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      scopes: ["admin"],
      revokedAt: null,
      expiresAt: null,
    });
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(project);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project,
    });
    mocks.prisma.project.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...project,
        ...data,
        id: "project_2",
        publicId: "prj_b00000000000000000000000",
      }),
    );
    mocks.prisma.project.count.mockResolvedValue(0);
    mocks.prisma.project.findUnique.mockResolvedValue(project);
    mocks.prisma.project.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...project, ...data }),
    );
    mocks.prisma.project.delete.mockResolvedValue(project);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "desktop",
        id: "kw_1",
        location: "United States",
        locationRef: keywordLocation(),
        text: "rank tracker",
      },
      {
        device: "desktop",
        id: "kw_2",
        location: "US",
        locationRef: keywordLocation(),
        text: "seo tool",
      },
      {
        device: "mobile",
        id: "kw_3",
        location: "Germany",
        locationRef: keywordLocation({
          canonicalKey: "DE",
          countryCode: "DE",
          displayName: "Germany",
        }),
        text: "rank tracker",
      },
    ]);
    mocks.prisma.keyword.updateMany.mockResolvedValue({ count: 1 });
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "DE",
        cityName: null,
        countryCode: "DE",
        displayName: "Germany",
        id: "loc_de",
        kind: "country",
      },
      warning: null,
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        id: "defaults_1",
        lastCheckedAt: null,
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        ...create,
      }),
    );
    mocks.writeAudit.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires explicit reviewed consent before defaults mutations", async () => {
    const response = await call("PATCH", `/projects/${project.publicId}/defaults`, {
      frequency: "daily",
      jitter_minutes: 60,
      timezone: "UTC",
    });
    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      details: { reason: "preview_required" },
    });
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.resolveKeywordLocation).not.toHaveBeenCalled();
  });

  it("rejects a forged reviewed quote before writing defaults", async () => {
    const ctx = await reviewedContext({ frequency: "daily", jitter_minutes: 60, timezone: "UTC" });
    const body = await ctx.req.json();
    body.review.preview_token = "forged-quote";
    const response = await call("PATCH", `/projects/${project.publicId}/defaults`, body);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      details: { reason: "preview_mismatch" },
    });
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a defaults credential identity mismatch before preview or mutation", async () => {
    const ctx = context("PATCH", `/projects/${project.publicId}/defaults`, {
      frequency: "daily",
      jitter_minutes: 60,
      timezone: "UTC",
    });
    const mismatched = { ...ctx, origin: { ...ctx.origin, credentialId: "other-key" } };
    await expect(
      projectHandlers.updateProjectDefaults(mismatched, project.publicId),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.resolveKeywordLocation).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a reviewed write after the project key was revoked in the database", async () => {
    const reviewed = await reviewedContext({
      country: "DE",
      device: "mobile",
      frequency: "daily",
    });
    mocks.prisma.$transaction.mockClear();
    mocks.prisma.$queryRaw.mockClear();
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      scopes: ["admin"],
      revokedAt: new Date(),
      expiresAt: null,
    });
    const response = await call(
      "PATCH",
      `/projects/${project.publicId}/defaults`,
      await reviewed.req.json(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: "https://bisibility.com/problems/forbidden",
      status: 403,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
    expect(
      mocks.prisma.$queryRaw.mock.calls.some(
        ([parts]) =>
          Array.isArray(parts) &&
          parts.join("?").includes("FROM api_keys") &&
          parts.join("?").includes("FOR SHARE"),
      ),
    ).toBe(true);
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("updates a project and its defaults for scoped project keys", async () => {
    const patched = await call("PATCH", "/projects/prj_a00000000000000000000000", {
      name: "Renamed",
    });
    const defaults = await callReviewedDefaults({
      country: "DE",
      cron_expression: null,
      device: "mobile",
      frequency: "manual",
      jitter_minutes: 0,
      serp_stop_on_match: false,
      timezone: "UTC",
    });

    expect([patched.status, defaults.status]).toEqual([200, 200]);
    await expect(patched.json()).resolves.toMatchObject({
      id: "prj_a00000000000000000000000",
      name: "Renamed",
    });
    await expect(defaults.json()).resolves.toMatchObject({
      country: "Germany",
      device: "mobile",
      frequency: "manual",
      project_id: "prj_a00000000000000000000000",
      serp_stop_on_match: false,
    });
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.project.create).not.toHaveBeenCalled();
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ serpStopOnMatch: false }),
        update: expect.objectContaining({ serpStopOnMatch: false }),
      }),
    );
  });

  it("denies a project API key the project deletion", async () => {
    const deleted = await call("DELETE", "/projects/prj_a00000000000000000000000");

    expect(deleted.status).toBe(403);
    expect(mocks.prisma.project.delete).not.toHaveBeenCalled();
  });

  it("deletes projects and records the audit entry in one transaction", async () => {
    // Deletion is owner-only at the router, so the handler is exercised directly here.
    const deleted = await projectHandlers.deleteProject(
      context("DELETE", "/projects/prj_a00000000000000000000000"),
      "prj_a00000000000000000000000",
    );

    expect(deleted.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.project.delete).toHaveBeenCalledWith({ where: { id: "project_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.delete",
        targetId: "prj_a00000000000000000000000",
      }),
      mocks.prisma,
    );
  });

  it("allows personal-token project creation exactly at the configured limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "2");
    mocks.prisma.project.count.mockResolvedValue(1);

    const response = await projectHandlers.createProjectForUser(
      personalContext({ domain: "example.com", name: "Example" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.project.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.project.count).toHaveBeenCalledWith({
      where: { isSample: false, ownerId: "user_1" },
    });
  });

  it("preserves the personal-token 403 response at the configured project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "1");
    mocks.prisma.project.count.mockResolvedValue(1);

    const response = await projectHandlers.createProjectForUser(
      personalContext({ domain: "example.com", name: "Example" }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      detail: "Project limit reached for this account.",
      status: 403,
      title: "Forbidden",
      type: "https://bisibility.com/problems/forbidden",
    });
    expect(mocks.prisma.project.create).not.toHaveBeenCalled();
  });

  it("updates schedule-only defaults without moving keyword markets", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "mobile",
        id: "kw_1",
        location: "Germany",
        locationRef: keywordLocation({
          canonicalKey: "DE",
          countryCode: "DE",
          displayName: "Germany",
        }),
        text: "rank tracker",
      },
      {
        device: "mobile",
        id: "kw_2",
        location: "DE",
        locationRef: keywordLocation({
          canonicalKey: "DE",
          countryCode: "DE",
          displayName: "Germany",
        }),
        text: "seo tool",
      },
      {
        device: "desktop",
        id: "kw_3",
        location: "United States",
        locationRef: keywordLocation(),
        text: "rank checker",
      },
    ]);

    const defaults = await callReviewedDefaults({
      frequency: "weekly",
      jitter_minutes: 30,
      timezone: "Europe/Berlin",
    });

    expect(defaults.status).toBe(200);
    await expect(defaults.json()).resolves.toMatchObject({
      country: "Germany",
      device: "mobile",
      frequency: "weekly",
      timezone: "Europe/Berlin",
    });
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          market: expect.objectContaining({ country: "Germany", device: "mobile" }),
        }),
      }),
      mocks.prisma,
    );
  });

  it("resolves and persists a location_key-only default market patch", async () => {
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "US/Texas/Austin",
        cityName: "Austin",
        countryCode: "US",
        displayName: "Austin, Texas, United States",
        id: "loc_austin",
        kind: "city",
      },
      warning: null,
    });

    const defaults = await callReviewedDefaults({
      frequency: "daily",
      jitter_minutes: 60,
      location_key: "US/Texas/Austin",
      timezone: "UTC",
    });

    expect(defaults.status).toBe(200);
    await expect(defaults.json()).resolves.toMatchObject({
      city: "Austin, Texas, United States",
      country: "United States",
      device: "desktop",
      location_key: "US/Texas/Austin",
    });
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          city: "Austin, Texas, United States",
          country: "United States",
          device: "desktop",
          locationKey: "US/Texas/Austin",
        }),
        update: expect.objectContaining({
          city: "Austin, Texas, United States",
          country: "United States",
          device: "desktop",
          locationKey: "US/Texas/Austin",
        }),
      }),
    );
  });

  it("persists city default markets through canonical location keys without relabeling keywords", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: "Austin, Texas, United States",
      country: "United States",
      cronExpression: null,
      device: "desktop",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "US/Texas/Austin",
      nextCheckAt: null,
      projectId: "project_1",
      timezone: "UTC",
    });
    const austinRef = {
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin, Texas, United States",
      kind: "city",
    };
    const dallasRef = {
      canonicalKey: "US/Texas/Dallas",
      cityName: "Dallas",
      countryCode: "US",
      displayName: "Dallas, Texas, United States",
      kind: "city",
    };
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "desktop",
        id: "kw_1",
        location: "Austin, Texas, United States",
        locationRef: austinRef,
        text: "rank tracker",
      },
      {
        device: "desktop",
        id: "kw_2",
        location: "Austin, Texas, United States",
        locationRef: austinRef,
        text: "seo tool",
      },
      {
        device: "mobile",
        id: "kw_3",
        location: "Dallas, Texas, United States",
        locationRef: dallasRef,
        text: "rank tracker",
      },
    ]);
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        ...dallasRef,
        id: "loc_dallas",
      },
      warning: null,
    });

    const defaults = await callReviewedDefaults({
      device: "mobile",
      frequency: "daily",
      jitter_minutes: 60,
      location_key: "US/Texas/Dallas",
      timezone: "UTC",
    });

    expect(defaults.status).toBe(200);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith({
      select: expect.objectContaining({
        locationRef: expect.anything(),
      }),
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
  });

  it("rejects defaults market patches that omit country or device", async () => {
    const defaults = await call("PATCH", "/projects/prj_a00000000000000000000000/defaults", {
      country: "Germany",
      frequency: "daily",
    });

    expect(defaults.status).toBe(400);
    await expect(defaults.json()).resolves.toMatchObject({
      errors: {
        fieldErrors: expect.objectContaining({
          device: expect.arrayContaining([expect.any(String)]),
        }),
        formErrors: [],
      },
      title: "Validation failed",
    });
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
  });

  it("returns stored project defaults with explicit market provenance", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: null,
      country: "Germany",
      cronExpression: null,
      device: "mobile",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "DE",
      nextCheckAt: null,
      projectId: "project_1",
      serpDepth: 100,
      serpStopOnMatch: true,
      timezone: "UTC",
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    const response = await getProjectDefaults(
      context("GET", "/projects/prj_a00000000000000000000000/defaults"),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      country: "Germany",
      device: "mobile",
      location_key: "DE",
      serp_depth: 100,
      source: "explicit",
    });
  });

  it("returns derived defaults without creating a defaults row", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "mobile",
        id: "kw_1",
        location: "Germany",
        locationRef: keywordLocation({
          canonicalKey: "DE",
          countryCode: "DE",
          displayName: "Germany",
        }),
        text: "rank tracker",
      },
      {
        device: "mobile",
        id: "kw_2",
        location: "DE",
        locationRef: keywordLocation({
          canonicalKey: "DE",
          countryCode: "DE",
          displayName: "Germany",
        }),
        text: "seo tool",
      },
    ]);

    const response = await getProjectDefaults(
      context("GET", "/projects/prj_a00000000000000000000000/defaults"),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      country: "Germany",
      cron_expression: null,
      device: "mobile",
      frequency: "daily",
      jitter_minutes: 60,
      last_checked_at: null,
      next_check_at: null,
      serp_depth: 100,
      serp_stop_on_match: true,
      source: "derived",
      timezone: "UTC",
    });
    await expect(
      mocks.prisma.projectDefaults.findUnique({ where: { projectId: "project_1" } }),
    ).resolves.toBeNull();
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("updates the default market without relabeling existing keywords", async () => {
    const existing = {
      device: "desktop",
      id: "kw_1",
      location: "United States",
      locationId: "loc_us",
      text: "rank tracker",
    };
    mocks.prisma.keyword.findMany.mockResolvedValue([existing]);

    const response = await projectHandlers.updateProjectDefaults(
      await reviewedContext({
        country: "DE",
        device: "mobile",
        frequency: "daily",
        jitter_minutes: 60,
        timezone: "UTC",
      }),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          country: "Germany",
          device: "mobile",
          locationKey: "DE",
        }),
      }),
    );
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(existing.locationId).toBe("loc_us");
  });

  it("uses the changed API default market for a keyword created later", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: null,
      country: "United States",
      device: "desktop",
      locationKey: "US",
    });

    const response = await projectHandlers.updateProjectDefaults(
      await reviewedContext({
        country: "DE",
        device: "mobile",
        frequency: "daily",
        jitter_minutes: 60,
        timezone: "UTC",
      }),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    const defaults = mocks.prisma.projectDefaults.upsert.mock.calls[0]?.[0]?.update;
    mocks.resolveKeywordLocation.mockClear();
    const created = await createKeywordAfterDefault(defaults);

    expect(created.response.status).toBe(201);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "DE", kind: "city" },
    });
    expect(created.createdRows).toMatchObject([{ device: "mobile", locationId: "loc_de" }]);
  });

  it("forbids reading defaults through an API key scoped to another project", async () => {
    const response = await getProjectDefaults(
      context("GET", "/projects/prj_other/defaults"),
      "prj_other",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "API key is not scoped to this project.",
    });
    expect(mocks.prisma.projectDefaults.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("keeps GET and PATCH defaults responses byte-compatible apart from source", async () => {
    const stored = {
      city: null,
      country: "Germany",
      cronExpression: null,
      device: "mobile",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "DE",
      nextCheckAt: null,
      projectId: "project_1",
      serpDepth: 100,
      serpStopOnMatch: true,
      timezone: "UTC",
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    };
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(stored);
    mocks.prisma.projectDefaults.upsert.mockResolvedValue(stored);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    const getResponse = await getProjectDefaults(
      context("GET", "/projects/prj_a00000000000000000000000/defaults"),
      "prj_a00000000000000000000000",
    );
    const patchResponse = await projectHandlers.updateProjectDefaults(
      await reviewedContext({
        frequency: "daily",
        jitter_minutes: 60,
        timezone: "UTC",
      }),
      "prj_a00000000000000000000000",
    );
    const { source: getSource, ...getBody } = await getResponse.json();
    const { source: patchSource, ...patchBody } = await patchResponse.json();

    expect(getSource).toBe("explicit");
    expect(patchSource).toBe("explicit");
    expect(JSON.stringify(getBody)).toBe(JSON.stringify(patchBody));
  });

  it("routes GET project defaults to the read handler", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: null,
      country: "Germany",
      cronExpression: null,
      device: "mobile",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "DE",
      nextCheckAt: null,
      projectId: "project_1",
      serpDepth: 100,
      serpStopOnMatch: true,
      timezone: "UTC",
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    const response = await call("GET", "/projects/prj_a00000000000000000000000/defaults");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      country: "Germany",
      source: "explicit",
    });
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
  });

  it("returns project readiness with provider_disabled for a disabled connection", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      providerConnectionRow({ enabled: false, provider: serpCatalogId }),
    ]);

    const response = await projectHandlers.getProject(
      context("GET", "/projects/prj_a00000000000000000000000"),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "prj_a00000000000000000000000",
      readiness: {
        serp: { available: false, primary_provider: null, reason: "provider_disabled" },
        token_scope: "write",
        write_mode: "active",
      },
    });
  });

  it("gates write-only areas for read-scope keys while read areas stay available", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      providerConnectionRow({ provider: fullSerpCatalogId }),
      providerConnectionRow({ kind: "analytics", provider: analyticsCatalogId }),
    ]);

    const response = await projectHandlers.getProject(
      context("GET", "/projects/prj_a00000000000000000000000", undefined, ["read"]),
      "prj_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      readiness: {
        backlinks: { available: true, reason: null },
        domain_overview: { available: true, reason: null },
        keyword_research: { available: true, reason: null },
        search_performance: { available: true, reason: null },
        serp: {
          available: false,
          primary_provider: fullSerpCatalogId,
          reason: "token_read_only",
        },
        token_scope: "read",
      },
    });
  });

  it("lists project write routes in openapi", async () => {
    const body = await (await call("GET", "/openapi.json")).json();

    expect(body.paths).toMatchObject({
      "/projects": {
        get: expect.objectContaining({ operationId: "listProjects" }),
        post: expect.objectContaining({ operationId: "createProject" }),
      },
      "/projects/{project_id}": {
        delete: expect.objectContaining({ operationId: "deleteProject" }),
        patch: expect.objectContaining({ operationId: "updateProject" }),
      },
      "/projects/{project_id}/defaults": {
        get: expect.objectContaining({
          operationId: "getProjectDefaults",
        }),
        patch: expect.objectContaining({
          operationId: "updateProjectDefaults",
          requestBody: expect.objectContaining({
            content: expect.objectContaining({
              "application/json": expect.objectContaining({
                schema: { $ref: "#/components/schemas/ProjectDefaultsPatch" },
              }),
            }),
          }),
        }),
      },
    });
    expect(body.components.schemas.ProjectDefaults.required).toEqual(
      expect.arrayContaining(["country", "device"]),
    );
    expect(body.components.schemas.ProjectDefaults.properties.device.description).toContain(
      "Persisted default device",
    );
    expect(body.components.schemas.ProjectDefaults.properties.location_key.description).toContain(
      "Persisted canonical location key",
    );
    expect(body.components.schemas.ProjectDefaults.properties.serp_stop_on_match).toMatchObject({
      type: "boolean",
    });
    expect(body.components.schemas.ProjectDefaults.properties.serp_depth).toMatchObject({
      enum: [10, 20, 50, 100],
      type: "integer",
    });
    expect(body.components.schemas.ProjectDefaults.properties.source).toMatchObject({
      enum: ["derived", "explicit", "fallback"],
      type: "string",
    });
    expect(
      body.components.schemas.ProjectDefaultsPatch.properties.location_key.description,
    ).toContain("Updates the default market");
    expect(
      body.components.schemas.ProjectDefaultsPatch.properties.serp_stop_on_match,
    ).toMatchObject({ type: "boolean" });
    expect(body.components.schemas.ProjectDefaultsPatch.required).not.toEqual(
      expect.arrayContaining(["country", "device"]),
    );
  });
});
