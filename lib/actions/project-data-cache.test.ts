import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUniqueOrThrow: mocks.find },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ project: { updateMany: mocks.update } }),
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/project-data-cache/store", () => ({
  listProjectDataCache: mocks.list,
  removeProjectDataCache: mocks.remove,
}));

import {
  deleteProjectDataCache,
  readProjectDataCache,
  saveProjectDataCache,
} from "./project-data-cache";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "user" });
  mocks.scope.mockResolvedValue({ id: "internal", publicId: "prj_public" });
  mocks.find.mockResolvedValue({ lookupCacheTtlSeconds: 3600, providerConnections: [] });
});
it("reads only the server-resolved project and its shared TTL", async () => {
  mocks.list.mockResolvedValue({ available: true, entries: [], cursor: "0" });
  expect(await readProjectDataCache({ projectId: "prj_public" })).toMatchObject({
    ttlSeconds: 3600,
  });
  expect(mocks.scope).toHaveBeenCalledWith({ id: "user" }, "read", "prj_public", {
    type: "project",
  });
  expect(mocks.list).toHaveBeenCalledWith("internal", "0", 3600, expect.any(Object));
});
it("checks mutation authorization again before deleting, including revoked members", async () => {
  mocks.scope.mockRejectedValue(new Error("forbidden"));
  await expect(deleteProjectDataCache({ projectId: "prj_public", token: "entry" })).rejects.toThrow(
    "forbidden",
  );
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("preserves conflicting settings and rejects invalid TTLs", async () => {
  mocks.update.mockResolvedValue({ count: 0 });
  expect(
    await saveProjectDataCache({
      projectId: "prj_public",
      ttlSeconds: 86400,
      expectedTtlSeconds: 3600,
    }),
  ).toEqual({ kind: "conflict" });
  expect(mocks.audit).not.toHaveBeenCalled();
  await expect(
    saveProjectDataCache({ projectId: "prj_public", ttlSeconds: 0, expectedTtlSeconds: null }),
  ).rejects.toThrow();
});
it("saves with compare-and-swap and an audit without raw keywords or cache values", async () => {
  mocks.update.mockResolvedValue({ count: 1 });
  expect(
    await saveProjectDataCache({
      projectId: "prj_public",
      ttlSeconds: 86400,
      expectedTtlSeconds: 3600,
    }),
  ).toMatchObject({ kind: "saved" });
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: "internal", lookupCacheTtlSeconds: 3600 },
    data: { lookupCacheTtlSeconds: 86400 },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "settings.data_cache.update",
      before: { ttlSeconds: 3600 },
      after: { ttlSeconds: 86400 },
    }),
    expect.anything(),
  );
});
