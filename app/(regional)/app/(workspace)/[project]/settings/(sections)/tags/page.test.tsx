import { previewTagPageRule, saveTagPageRule } from "@/lib/actions/page-tags";
import { mergeTagResult } from "@/lib/actions/tag-merge";
import { deleteTagResult, renameTagResult } from "@/lib/actions/tags";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverActions = [
  deleteTagResult,
  mergeTagResult,
  previewTagPageRule,
  renameTagResult,
  saveTagPageRule,
];

function isServerActionReference(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  if (serverActions.some((action) => action === fn)) return true;
  const boundName = fn.name.startsWith("bound ") ? fn.name.slice("bound ".length) : "";
  return serverActions.some((action) => action.name === boundName);
}

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  getProjectRole: vi.fn(),
  getSettingsTags: vi.fn(),
  loadCoreMessages: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  sectionProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/components/settings/tags/SettingsTagsSection", () => ({
  SettingsTagsSection: (props: {
    actions: Record<string, unknown>;
    canCreate: boolean;
    canDelete: boolean;
    canEdit: boolean;
    rows: { id: string }[];
  }) => {
    mocks.sectionProps = props;
    return (
      <div
        data-can-create={props.canCreate}
        data-can-delete={props.canDelete}
        data-can-edit={props.canEdit}
        data-tag-count={props.rows.length}
      />
    );
  },
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/tag-settings", () => ({ getSettingsTags: mocks.getSettingsTags }));

import TagsSettingsPage from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/tags/page";

function projectAccess(role: string, writeMode = "active") {
  return {
    actor: { memberships: [{ projectId: "project_1", role }] },
    project: { id: "project_1", publicId: "prj_resolved", writeMode },
  };
}

describe("TagsSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canProjectAction.mockImplementation(
      (role: string | null, action: string) =>
        role === "owner" ||
        role === "admin" ||
        (role === "member" && ["read", "create", "update"].includes(action)),
    );
    mocks.getProjectRole.mockImplementation(
      (actor: { memberships: { projectId: string; role: string }[] }, projectId: string) =>
        actor.memberships.find((membership) => membership.projectId === projectId)?.role ?? null,
    );
    mocks.getSettingsTags.mockResolvedValue({ rows: [{ id: "tag_docs" }], sitemaps: [] });
    mocks.requireReadableProject.mockResolvedValue(projectAccess("member"));
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({});
  });

  it("loads the tags catalog and one row per project tag", async () => {
    render(await TagsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }));
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getSettingsTags).toHaveBeenCalledWith("project_1");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectSettingsShell",
      "projectSettingsTags",
      "projectPages",
    ]);
    const section = document.querySelector("[data-tag-count]");
    expect(section).toHaveAttribute("data-tag-count", "1");
    expect(section).toHaveAttribute("data-can-create", "true");
    expect(section).toHaveAttribute("data-can-edit", "true");
    expect(section).toHaveAttribute("data-can-delete", "false");
  });

  it("lets an admin delete tags", async () => {
    mocks.requireReadableProject.mockResolvedValue(projectAccess("admin"));
    render(await TagsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
    expect(document.querySelector("[data-tag-count]")).toHaveAttribute("data-can-delete", "true");
  });

  it("keeps a viewer from changing tags", async () => {
    mocks.requireReadableProject.mockResolvedValue(projectAccess("viewer"));
    render(await TagsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
    const section = document.querySelector("[data-tag-count]");
    expect(section).toHaveAttribute("data-can-create", "false");
    expect(section).toHaveAttribute("data-can-edit", "false");
    expect(section).toHaveAttribute("data-can-delete", "false");
  });

  it.each(["migration_hold", "migrated"])(
    "keeps tags read-only while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue(projectAccess("admin", writeMode));
      render(await TagsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
      const section = document.querySelector("[data-tag-count]");
      expect(section).toHaveAttribute("data-can-create", "false");
      expect(section).toHaveAttribute("data-can-delete", "false");
    },
  );

  it("passes server action references to the client screen", async () => {
    render(await TagsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
    const props: Record<string, unknown> = mocks.sectionProps ?? {};
    const functions = Object.entries(props).flatMap(([key, value]) => {
      if (typeof value === "function") return [[key, value] as const];
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).flatMap(([child, nested]) =>
        typeof nested === "function" ? ([[`${key}.${child}`, nested]] as const) : [],
      );
    });
    expect(functions.map(([path]) => path).sort()).toEqual([
      "actions.deleteTag",
      "actions.mergeTag",
      "actions.previewRule",
      "actions.renameTag",
      "actions.saveRule",
    ]);
    expect(
      functions.filter(([, fn]) => !isServerActionReference(fn)).map(([path]) => path),
    ).toEqual([]);
  });

  it("rejects an inline closure around a server action", () => {
    const closure = (draft: unknown) => previewTagPageRule("prj_resolved", draft);
    expect(isServerActionReference(closure)).toBe(false);
    expect(isServerActionReference(previewTagPageRule.bind(null, "prj_resolved"))).toBe(true);
  });

  it("does not render when access is denied", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(
      TagsSettingsPage({ params: Promise.resolve({ project: "prj_unavailable" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
