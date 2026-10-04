import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { bulkKeywords } from "./keyword-bulk";

const mocks = vi.hoisted(() => ({
  items: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => unknown) =>
      fn({
        $queryRaw: vi.fn(),
        keyword: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
        rankCheckRunItem: { findMany: mocks.items },
      }),
    keyword: {
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
    keywordTag: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: vi.fn(),
}));

const keywordId = "kw_a00000000000000000000000";

function context(role: "admin" | "member", body: unknown) {
  const url = new URL("https://example.com/api/v1/keywords/bulk");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method: "POST",
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: ["keywords", "bulk"],
    req: new Request(url, { body: JSON.stringify(body), method: "POST" }),
    url,
  } as unknown as ApiContext;
}

describe("bulk keyword deletion role gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([{ id: "keyword_1", publicId: keywordId }]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("refuses a member deleting keywords, matching the app's delete/keyword rule", async () => {
    const response = await bulkKeywords(
      context("member", { keyword_ids: [keywordId], operation: "delete" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: 403, title: "Forbidden" });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("protects a check already in flight through the same lifecycle as the app", async () => {
    mocks.items.mockResolvedValue([
      {
        id: "item_1",
        keywordId: "keyword_1",
        runId: "run_1",
        status: "running",
        rankCheckId: "check_1",
        run: { publicId: "rcr_active" },
      },
    ]);
    await expect(
      bulkKeywords(context("admin", { keyword_ids: [keywordId], operation: "delete" })),
    ).rejects.toThrow("still checking");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("lets an admin delete keywords", async () => {
    const response = await bulkKeywords(
      context("admin", { keyword_ids: [keywordId], operation: "delete" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["keyword_1"] } },
    });
  });
});
