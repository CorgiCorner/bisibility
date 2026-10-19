import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_input, execute) => execute()) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: vi.fn(async () => []) },
    projectDefaults: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/saved-keywords/service", () => ({
  listSavedKeywordRows: mocks.list,
  removeSavedKeywordRows: mocks.remove,
  saveSavedKeywordRows: mocks.save,
}));
const projectId = "prj_a00000000000000000000000";
const savedId = "svkw_a00000000000000000000000";
const base = `projects/${projectId}/saved-keywords`;
async function request(method: string, suffix = "", body?: unknown) {
  const path = base + suffix;
  return handleApiRequest(
    new Request(`https://example.com/api/v1/${path}`, {
      method,
      headers: { authorization: "Bearer bsb_key_live_fixture", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key_1", projectId: "project_1", scopes: ["read", "write"] },
    project: { id: "project_1", publicId: projectId, domain: "example.com", writeMode: "writable" },
  });
  mocks.list.mockResolvedValue([
    {
      publicId: savedId,
      text: "rank tracker",
      location: "US",
      savedAt: "2026-08-01T12:00:00.000Z",
      cpc: null,
      difficulty: null,
      intent: null,
      sourceSeed: null,
      volume: null,
      variantCount: 0,
      trend: [{ year: 2026, month: 7, searchVolume: null }],
    },
  ]);
  mocks.remove.mockResolvedValue({ removedCount: 1 });
  mocks.save.mockResolvedValue({
    savedCount: 1,
    duplicateCount: 1,
    results: [
      { keyword: "rank tracker", status: "created" },
      { keyword: "existing", status: "skipped" },
    ],
  });
});
it("captures the saved keyword page and deletion result through the router", async () => {
  const listed = await request("GET", "?limit=1");
  expect(listed.status).toBe(200);
  expect(await listed.json()).toMatchObject({
    data: [{ id: savedId, cpc: null }],
    meta: { next_cursor: null },
  });
  const deleted = await request("DELETE", `/${savedId}`);
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ removed_count: 1 });
  expect(mocks.remove).toHaveBeenCalledWith(
    { publicIds: [savedId] },
    expect.objectContaining({ projectId: "project_1" }),
  );
});
it("captures saved keyword creation including duplicate outcomes", async () => {
  const response = await request("POST", "", {
    keywords: ["rank tracker", { keyword: "existing", search_volume: 120 }],
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ saved_count: 1, duplicate_count: 1 });
});
it.each(["limit=0", "limit=201", "limit=junk", "cursor=junk"])(
  "rejects invalid page query %s",
  async (query) => {
    expect((await request("GET", `?${query}`)).status).toBe(400);
  },
);
