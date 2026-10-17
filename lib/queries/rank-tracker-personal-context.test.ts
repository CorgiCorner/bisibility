import { generalPreference } from "@/lib/project-surface-preferences/model";
import {
  canonicalViewFixture,
  viewProjectId,
  viewPublicId,
} from "@/lib/saved-views/view-test-fixture";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  caches: [] as Map<unknown, unknown>[],
  access: vi.fn(),
  views: vi.fn(),
  preference: vi.fn(),
  locations: vi.fn(),
  markets: vi.fn(),
  tags: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: (fn: (key: unknown) => unknown) => {
    const entries = new Map<unknown, unknown>();
    mocks.caches.push(entries);
    return (key: unknown) => {
      if (!entries.has(key)) entries.set(key, fn(key));
      return entries.get(key);
    };
  },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.access }));
vi.mock("./saved-views", () => ({ listSessionSavedViews: mocks.views }));
vi.mock("@/lib/project-surface-preferences/query", () => ({
  getPersonalSurfacePreference: mocks.preference,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.locations },
    projectMarket: { findMany: mocks.markets },
    tag: { findMany: mocks.tags },
  },
}));

import { loadRankTrackerPersonalContext } from "./rank-tracker-personal-context";

function nextRequest() {
  for (const entries of mocks.caches) entries.clear();
}
beforeEach(() => {
  vi.clearAllMocks();
  nextRequest();
  mocks.access.mockResolvedValue({
    actor: { id: "member-a" },
    project: { id: "db-a", publicId: viewProjectId },
  });
  mocks.views.mockResolvedValue([canonicalViewFixture()]);
  mocks.preference.mockResolvedValue({
    ...generalPreference(viewProjectId, "keywords"),
    defaultTarget: { kind: "saved_view", viewId: viewPublicId },
  });
  mocks.locations.mockResolvedValue([{ locationRef: { canonicalKey: "krakow" } }]);
  mocks.markets.mockResolvedValue([]);
  mocks.tags.mockResolvedValue([{ name: "Service" }]);
});
it("shares authorized inputs for distinct page/header params while resolving each URL", async () => {
  const [saved, general] = await Promise.all([
    loadRankTrackerPersonalContext(viewProjectId, {}),
    loadRankTrackerPersonalContext(viewProjectId, { view: "", q: "explicit" }),
  ]);
  expect(saved.activeView?.id).toBe(viewPublicId);
  expect(general.activeView).toBeNull();
  expect(general.state.search).toBe("explicit");
  for (const read of [
    mocks.access,
    mocks.views,
    mocks.preference,
    mocks.locations,
    mocks.markets,
    mocks.tags,
  ])
    expect(read).toHaveBeenCalledTimes(1);
  general.state.filters.tags.push("mutated");
  expect(saved.state.filters.tags).toEqual(["Service"]);
});
it("refreshes member/default and authorization in a separate request", async () => {
  const first = await loadRankTrackerPersonalContext(viewProjectId, {});
  nextRequest();
  mocks.access.mockResolvedValue({
    actor: { id: "member-b" },
    project: { id: "db-a", publicId: viewProjectId },
  });
  mocks.preference.mockResolvedValue(generalPreference(viewProjectId, "keywords"));
  const second = await loadRankTrackerPersonalContext(viewProjectId, {});
  expect(second.activeView).toBeNull();
  expect(second.scopeKey).not.toBe(first.scopeKey);
  expect(mocks.views).toHaveBeenCalledTimes(2);
  nextRequest();
  mocks.access.mockRejectedValue(new Error("forbidden"));
  await expect(loadRankTrackerPersonalContext(viewProjectId, {})).rejects.toThrow("forbidden");
  expect(mocks.views).toHaveBeenCalledTimes(2);
});
it("isolates project inputs within a request", async () => {
  await loadRankTrackerPersonalContext(viewProjectId, {});
  const other = "prj_bbcdefghijklmnopqrstuvwx";
  mocks.access.mockResolvedValue({
    actor: { id: "member-a" },
    project: { id: "db-b", publicId: other },
  });
  mocks.preference.mockResolvedValue(generalPreference(other, "keywords"));
  await loadRankTrackerPersonalContext(other, {});
  expect(mocks.views).toHaveBeenCalledTimes(2);
  expect(mocks.views).toHaveBeenLastCalledWith(other, "keywords");
});
