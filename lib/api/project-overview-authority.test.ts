import { beforeEach, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { getProjectOverview } from "./project-overview";

const projectId = "prj_a00000000000000000000000";
const mocks = vi.hoisted(() => ({ report: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/rank-history/export-host", () => ({
  historyExportReportOptions: mocks.report,
}));
vi.mock("@/lib/queries/overview-data", () => ({ loadOverviewMetricData: mocks.load }));

function context(kind: "project_key" | "personal_token" | "oauth_client"): ApiContext {
  const req = new Request(
    `https://api.example.com/api/v1/projects/${projectId}/overview?range=90d`,
  );
  return {
    actor: {
      id: "actor_1",
      memberships: [{ projectId: "project_1", role: kind === "project_key" ? "admin" : "viewer" }],
    },
    actorId: kind === "project_key" ? null : "actor_1",
    auth: {
      apiKey: {
        id: "credential_1",
        name: "Synthetic read key",
        prefix: "synthetic",
        projectId: "project_1",
        scopes: ["read"],
      },
      project: {
        id: "project_1",
        ownerId: "actor_1",
        publicId: projectId,
        name: "Synthetic project",
        domain: "example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    origin: {
      credentialKind: kind,
      credentialId: "credential_1",
      source: "api",
      surface: "programmatic",
    },
    headers: new Headers(),
    req,
    url: new URL(req.url),
    method: "GET",
    path: ["projects", projectId, "overview"],
    instance: "urn:test:overview",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.report.mockImplementation((authority, asOf) => ({ context: authority, asOf }));
  mocks.load.mockImplementation(async (_project, _filters, _at, options) => {
    if (!options?.report) throw new Error("API overview must not use a browser session fallback.");
    return {
      keywords: [],
      keywordVolumes: new Map(),
      projectDefaults: null,
      latestCheck: null,
      filteredKeywordCount: 0,
      addedThisMonth: 0,
    };
  });
});

it.each(["project_key", "personal_token", "oauth_client"] as const)(
  "binds overview reporting to the authenticated %s credential",
  async (kind) => {
    const ctx = context(kind);
    const response = await getProjectOverview(ctx, projectId);
    expect(response.status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith(
      {
        actor: ctx.actor,
        transport: kind === "project_key" ? "project_key" : "personal_token",
        credentialId: "credential_1",
        credential: { kind, id: "credential_1" },
      },
      expect.any(Date),
      90,
    );
    expect(mocks.load).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ range: "90d" }),
      expect.any(Date),
      { report: mocks.report.mock.results[0]?.value },
    );
  },
);

it("refuses a foreign project before creating or reading a report", async () => {
  const response = await getProjectOverview(context("project_key"), "prj_b00000000000000000000000");
  expect(response?.status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();
  expect(mocks.load).not.toHaveBeenCalled();
});
