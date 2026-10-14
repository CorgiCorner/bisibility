import { generalPreference } from "@/lib/project-surface-preferences/model";
import {
  canonicalViewFixture,
  viewProjectId,
  viewPublicId,
} from "@/lib/saved-views/view-test-fixture";
import { beforeEach, expect, it, vi } from "vitest";
import { loadCompetitorPersonalContext } from "./competitor-personal-context";

const mocks = vi.hoisted(() => ({ read: vi.fn(), views: vi.fn(), preference: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.read }));
vi.mock("./saved-views", () => ({ listSessionSavedViews: mocks.views }));
vi.mock("@/lib/project-surface-preferences/query", () => ({
  getPersonalSurfacePreference: mocks.preference,
}));

const view = {
  ...canonicalViewFixture(),
  surface: "competitors" as const,
  config: {
    surface: "competitors" as const,
    version: 1 as const,
    filters: { excludedKeywordIds: [], position: "all" as const, tag: null },
    scope: { device: "mobile" as const, engine: "google" as const, locationId: "krakow" },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    actor: { id: "user-a" },
    project: { id: "project-db", publicId: viewProjectId },
  });
  mocks.views.mockResolvedValue([view]);
  mocks.preference.mockResolvedValue({
    ...generalPreference(viewProjectId, "competitors"),
    defaultTarget: { kind: "saved_view", viewId: viewPublicId },
  });
});
it("uses owner-projected personal competitor views and their saved default", async () => {
  const result = await loadCompetitorPersonalContext(viewProjectId, {});
  expect(result.activeView).toEqual(view);
  expect(mocks.views).toHaveBeenCalledWith(viewProjectId, "competitors");
  expect(result.personal.privateCreation).toEqual({ canCreatePrivate: true, reason: null });
});
it("respects explicit General and never falls back for an unavailable private link", async () => {
  expect((await loadCompetitorPersonalContext(viewProjectId, { view: "" })).activeView).toBeNull();
  const unavailable = await loadCompetitorPersonalContext(viewProjectId, {
    view: "viw_bbcdefghijklmnopqrstuvwx",
  });
  expect(unavailable.activeView).toBeNull();
  expect(unavailable.unavailable).toBe(true);
  expect(unavailable.requestedViewId).toBe("viw_bbcdefghijklmnopqrstuvwx");
});
it("does not accept another project or surface from a mistaken projection", async () => {
  mocks.views.mockResolvedValue([{ ...view, projectId: "prj_foreign" }]);
  const result = await loadCompetitorPersonalContext(viewProjectId, { view: viewPublicId });
  expect(result.activeView).toBeNull();
  expect(result.unavailable).toBe(true);
});
it("isolates draft identity between members of the same project", async () => {
  const first = await loadCompetitorPersonalContext(viewProjectId, {});
  mocks.read.mockResolvedValue({
    actor: { id: "user-b" },
    project: { id: "project-db", publicId: viewProjectId },
  });
  expect((await loadCompetitorPersonalContext(viewProjectId, {})).personal.scopeKey).not.toBe(
    first.personal.scopeKey,
  );
});
