import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectSavedKeywords,
  deleteProjectSavedKeyword,
  listProjectSavedKeywords,
} from "./saved-keywords";

const mocks = vi.hoisted(() => ({
  findDefaults: vi.fn(),
  findKeywords: vi.fn(),
  listSaved: vi.fn(),
  removeSaved: vi.fn(),
  saveRows: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.findKeywords },
    projectDefaults: { findUnique: mocks.findDefaults },
  },
}));
vi.mock("@/lib/saved-keywords/service", () => ({
  listSavedKeywordRows: mocks.listSaved,
  removeSavedKeywordRows: mocks.removeSaved,
  saveSavedKeywordRows: mocks.saveRows,
}));

function context(method = "GET", body?: unknown) {
  const url = new URL(
    "https://example.com/api/v1/projects/prj_a00000000000000000000000/saved-keywords",
  );
  return {
    actorId: null,
    auth: {
      project: {
        id: "project_1",
        publicId: "prj_a00000000000000000000000",
      },
    },
    headers: new Headers(),
    instance: url.pathname,
    method,
    path: [],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    }),
    url,
  } as never;
}

describe("saved keyword API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDefaults.mockResolvedValue(null);
    mocks.findKeywords.mockResolvedValue([]);
    mocks.listSaved.mockResolvedValue([]);
    mocks.removeSaved.mockResolvedValue({ removedCount: 1 });
    mocks.saveRows.mockResolvedValue({
      duplicateCount: 1,
      results: [
        { keyword: "new keyword", status: "created" },
        { keyword: "tracked keyword", status: "skipped" },
      ],
      savedCount: 1,
    });
  });

  it("saves bare strings and metric snapshots without creating tracked keywords", async () => {
    const response = await createProjectSavedKeywords(
      context("POST", {
        keywords: ["new keyword", { keyword: "tracked keyword", search_volume: 120 }],
      }),
      "prj_a00000000000000000000000",
    );

    expect(mocks.saveRows).toHaveBeenCalledWith(
      [
        { keyword: "new keyword", location: "US", variantCount: 0 },
        expect.objectContaining({
          keyword: "tracked keyword",
          location: "US",
          searchVolume: 120,
        }),
      ],
      {
        actorId: null,
        projectId: "project_1",
        projectPublicId: "prj_a00000000000000000000000",
      },
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      duplicate_count: 1,
      saved_count: 1,
    });
  });

  it("returns public resources and project-scoped deletion results", async () => {
    mocks.listSaved.mockResolvedValue([
      {
        cpc: null,
        difficulty: null,
        intent: null,
        location: "US",
        publicId: "svkw_a00000000000000000000000",
        savedAt: "2026-08-01T12:00:00.000Z",
        sourceSeed: null,
        text: "new keyword",
        trend: [],
        variantCount: 0,
        volume: null,
      },
    ]);

    const listResponse = await listProjectSavedKeywords(context(), "prj_a00000000000000000000000");
    await expect(listResponse.json()).resolves.toMatchObject({
      data: [
        {
          id: "svkw_a00000000000000000000000",
          saved_at: "2026-08-01T12:00:00.000Z",
        },
      ],
    });

    const deleteResponse = await deleteProjectSavedKeyword(
      context("DELETE"),
      "svkw_a00000000000000000000000",
      "prj_a00000000000000000000000",
    );
    await expect(deleteResponse.json()).resolves.toEqual({ removed_count: 1 });
    expect(mocks.removeSaved).toHaveBeenCalledWith(
      { publicIds: ["svkw_a00000000000000000000000"] },
      expect.objectContaining({ projectId: "project_1" }),
    );
  });

  it("rejects a project outside the API key scope", async () => {
    const response = await listProjectSavedKeywords(context(), "prj_other");

    expect(response.status).toBe(403);
    expect(mocks.listSaved).not.toHaveBeenCalled();
  });
});
