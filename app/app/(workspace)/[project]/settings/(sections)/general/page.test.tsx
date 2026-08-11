import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  getSettings: vi.fn(),
  getProjectRole: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/settings/general/GeneralSettingsSection", () => ({
  GeneralSettingsSection: (props: {
    canCreateTags: boolean;
    canDeleteTags: boolean;
    canEditProject: boolean;
    project: { name: string };
    tags: { label: string }[];
  }) => (
    <div
      data-can-create-tags={props.canCreateTags}
      data-can-delete-tags={props.canDeleteTags}
      data-can-edit-project={props.canEditProject}
      data-general-project-name={props.project.name}
      data-general-tag-count={props.tags.length}
    />
  ),
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));

import GeneralSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/general/page";

describe("GeneralSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canProjectAction.mockImplementation(
      (role: string | null, action: string) =>
        role === "owner" || role === "admin" || (role === "member" && action !== "delete"),
    );
    mocks.getProjectRole.mockImplementation(
      (actor: { memberships: { projectId: string; role: string }[] }, projectId: string) =>
        actor.memberships.find((membership) => membership.projectId === projectId)?.role ?? null,
    );
    mocks.getSettings.mockResolvedValue({
      project: {
        domain: "example.com",
        name: "Example",
        projectId: "prj_resolved",
        writeMode: "active",
      },
      tags: [{ color: "var(--blue)", label: "brand" }],
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        memberships: [{ projectId: "project_1", role: "member" }],
        role: "viewer",
      },
      project: { id: "project_1", publicId: "prj_resolved" },
    });
  });

  it("loads project data and server-side access before rendering General", async () => {
    render(await GeneralSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }));

    expect(mocks.getSettings).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(screen.getByRole("main")).toHaveAttribute("data-project-ref", "prj_resolved");

    const section = document.querySelector("[data-general-project-name]");
    expect(section).toHaveAttribute("data-general-project-name", "Example");
    expect(section).toHaveAttribute("data-general-tag-count", "1");
    expect(section).toHaveAttribute("data-can-edit-project", "true");
  });

  it("uses a stronger project membership instead of the global role", async () => {
    render(await GeneralSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));

    expect(mocks.getProjectRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: "viewer" }),
      "project_1",
    );
    const section = document.querySelector("[data-general-project-name]");
    expect(section).toHaveAttribute("data-can-edit-project", "true");
    expect(section).toHaveAttribute("data-can-create-tags", "true");
    expect(section).toHaveAttribute("data-can-delete-tags", "false");
  });

  it("does not grant General edits from a stronger global role", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        memberships: [{ projectId: "project_1", role: "viewer" }],
        role: "owner",
      },
      project: { id: "project_1", publicId: "prj_resolved" },
    });

    render(await GeneralSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));

    const section = document.querySelector("[data-general-project-name]");
    expect(section).toHaveAttribute("data-can-edit-project", "false");
    expect(section).toHaveAttribute("data-can-create-tags", "false");
    expect(section).toHaveAttribute("data-can-delete-tags", "false");
  });

  it.each(["migration_hold", "migrated"])(
    "keeps General project and tag mutations read-only while the project is %s",
    async (writeMode) => {
      mocks.getSettings.mockResolvedValue({
        project: {
          domain: "example.com",
          name: "Example",
          projectId: "prj_resolved",
          writeMode,
        },
        tags: [{ color: "var(--blue)", label: "brand" }],
      });

      render(await GeneralSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));

      const section = document.querySelector("[data-general-project-name]");
      expect(section).toHaveAttribute("data-can-edit-project", "false");
      expect(section).toHaveAttribute("data-can-create-tags", "false");
      expect(section).toHaveAttribute("data-can-delete-tags", "false");
    },
  );

  it("does not render General when server-side access is denied", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      GeneralSettingsPage({ params: Promise.resolve({ project: "prj_unavailable" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
