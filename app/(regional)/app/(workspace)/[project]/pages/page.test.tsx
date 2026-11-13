import { loadExistingVsNewAction, takePageSnapshotAction } from "@/lib/actions/page-snapshot";
import {
  loadPageTags,
  previewTagPageRule,
  removeTagFromPages,
  saveTagPageRule,
  setManualPageTags,
} from "@/lib/actions/page-tags";
import { checkSelectedPageVitalsAction } from "@/lib/actions/page-vitals";
import {
  addManualProjectPagesAction,
  loadProjectPagesAction,
  refreshProjectPagesAction,
} from "@/lib/actions/pages";
import { loadPagesCompareAction } from "@/lib/actions/pages-compare";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectPagesPage from "./page";

const serverActions = [
  addManualProjectPagesAction,
  checkSelectedPageVitalsAction,
  loadExistingVsNewAction,
  loadPageTags,
  loadPagesCompareAction,
  loadProjectPagesAction,
  previewTagPageRule,
  refreshProjectPagesAction,
  removeTagFromPages,
  saveTagPageRule,
  setManualPageTags,
  takePageSnapshotAction,
];

function isServerActionReference(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  if (serverActions.some((action) => action === fn)) return true;
  const boundName = fn.name.startsWith("bound ") ? fn.name.slice("bound ".length) : "";
  return serverActions.some((action) => action.name === boundName);
}

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  loadCoreMessages: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/pages/ProjectPagesScreen", () => ({
  ProjectPagesScreen: ({ canWrite }: { canWrite: boolean }) => (
    <div data-can-write={String(canWrite)}>Pages</div>
  ),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/challenge-report/feature", () => ({
  projectSeoChallengeEnabled: async () => false,
}));
vi.mock("@/lib/challenge-report/project-challenge", () => ({
  readProjectChallenge: async () => null,
}));
vi.mock("@/lib/pages/screen", () => ({ loadProjectPagesScreen: mocks.load }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));

describe("ProjectPagesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveProjectAccess.mockResolvedValue({ publicId: "prj_1" });
    mocks.load.mockResolvedValue({
      list: { counts: { all: 1, listed: 1, notListed: 0 }, rows: [], total: 1 },
      sources: [],
    });
  });

  it("loads the registry and syncs an empty list for a member", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", writeMode: "active" },
    });
    const page = await ProjectPagesPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve({ q: "docs" }),
    });
    expect(page.props.children.props.children[1].props.canWrite).toBe(true);
    expect(mocks.load).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ search: "docs" }),
      { syncIfEmpty: true },
    );
  });

  it("does not sync for a viewer", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "viewer" }] },
      project: { id: "project_1", writeMode: "active" },
    });
    const page = await ProjectPagesPage({ params: Promise.resolve({ project: "prj_1" }) });
    expect(page.props.children.props.children[1].props.canWrite).toBe(false);
    expect(mocks.load).toHaveBeenCalledWith("project_1", expect.any(Object), {
      syncIfEmpty: false,
    });
  });

  it.each(["all", "by-tag", "existing-vs-new", "compare"])(
    "passes the URL query and loaded panels for %s",
    async (tab) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { memberships: [{ projectId: "project_1", role: "member" }] },
        project: { id: "project_1", writeMode: "active" },
      });
      const view = {
        compare: null,
        comparison: { selected: "clicks" },
        list: { counts: { all: 2 }, rows: [], total: 2 },
        snapshot: { id: "snapshot_1" },
        sources: [],
        tags: { tagCount: 1 },
      };
      mocks.load.mockResolvedValue(view);
      const page = await ProjectPagesPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          annotation: "sig_1",
          changed: "tag_changed",
          cmetric: "clicks",
          conv: "ga4",
          dir: "asc",
          metric: "sessions",
          page: "2",
          q: "docs",
          sort: "path",
          span: "28",
          tab,
          tag: "tag_1",
          unchanged: "tag_control",
        }),
      });
      const props = page.props.children.props.children[1].props;
      expect(props.initialQuery).toMatchObject({
        annotation: "sig_1",
        changed: "tag_changed",
        compareMetric: "clicks",
        conv: "ga4",
        dir: "asc",
        metric: "sessions",
        page: 2,
        search: "docs",
        sort: "path",
        tab,
        tag: "tag_1",
        unchanged: "tag_control",
      });
      expect(mocks.load).toHaveBeenCalledWith("project_1", props.initialQuery, {
        syncIfEmpty: true,
      });
      expect(props.initialList).toBe(view.list);
      expect(props.initialTags).toBe(view.tags);
      expect(props.initialSnapshot).toBe(view.snapshot);
      expect(props.initialComparison).toBe(view.comparison);
      expect(props.initialCompare).toBe(view.compare);
    },
  );

  it("passes server action references to the client screen", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", writeMode: "active" },
    });
    const page = await ProjectPagesPage({ params: Promise.resolve({ project: "prj_1" }) });
    const props = page.props.children.props.children[1].props as Record<string, unknown>;
    const functions = Object.entries(props).flatMap(([key, value]) => {
      if (typeof value === "function") return [[key, value] as const];
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).flatMap(([child, nested]) =>
        typeof nested === "function" ? ([[`${key}.${child}`, nested]] as const) : [],
      );
    });
    expect(functions.map(([path]) => path).sort()).toEqual([
      "actions.addManual",
      "actions.checkVitals",
      "actions.load",
      "actions.loadCompare",
      "actions.loadComparison",
      "actions.loadTags",
      "actions.previewRule",
      "actions.refresh",
      "actions.removeFromPages",
      "actions.saveRule",
      "actions.setManual",
      "actions.takeSnapshot",
    ]);
    expect(
      functions.filter(([, fn]) => !isServerActionReference(fn)).map(([path]) => path),
    ).toEqual([]);
  });
});
