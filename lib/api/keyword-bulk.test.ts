import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { bulkKeywords } from "./keyword-bulk";

const mocks = vi.hoisted(() => ({
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
  const url = new URL("https://example.test/api/v1/keywords/bulk");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method: "POST",
    path: ["keywords", "bulk"],
    req: new Request(url, { body: JSON.stringify(body), method: "POST" }),
    url,
  } as unknown as ApiContext;
}

describe("bulk keyword deletion role gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
