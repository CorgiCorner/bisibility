import TeamSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/team/page";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeamAccess: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({
    activeSection,
    children,
    projectRef,
  }: {
    activeSection: string;
    children: ReactNode;
    projectRef: string;
  }) => (
    <div data-active-section={activeSection} data-project-ref={projectRef}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/settings/team/TeamSettingsContent", () => ({
  TeamSettingsContent: ({
    domain,
    projectId,
    readOnly,
  }: {
    domain: string;
    projectId: string;
    readOnly: boolean;
  }) => (
    <div data-domain={domain} data-project-id={projectId} data-read-only={String(readOnly)}>
      Team content
    </div>
  ),
}));
vi.mock("@/lib/actions/team", () => ({
  changeMemberRole: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
  resendInvite: vi.fn(),
  revokeInvite: vi.fn(),
  transferOwnership: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/queries/team", () => ({ getTeamAccess: mocks.getTeamAccess }));

describe("team settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "owner_1" },
      project: {
        domain: "example.com",
        name: "Example project",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        writeMode: "active",
      },
    });
    mocks.getTeamAccess.mockResolvedValue({
      canAssignAdmin: true,
      canManageTeam: true,
      canTransferOwnership: true,
      members: [],
      pendingInvites: [],
    });
  });

  it("loads the authorized team view into the Team settings shell", async () => {
    render(
      await TeamSettingsPage({
        params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      }),
    );

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.getTeamAccess).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(screen.getByText("Team content").closest("[data-active-section]")).toHaveAttribute(
      "data-active-section",
      "team",
    );
    expect(screen.getByText("Team content")).toHaveAttribute("data-domain", "example.com");
    expect(screen.getByText("Team content")).toHaveAttribute("data-read-only", "false");
  });

  it.each(["migration_hold", "migrated"])(
    "marks every Team mutation control read-only while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "owner_1" },
        project: {
          domain: "example.com",
          name: "Example project",
          publicId: "prj_abcdefghijklmnopqrstuvwx",
          writeMode,
        },
      });

      render(
        await TeamSettingsPage({
          params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
        }),
      );

      expect(screen.getByText("Team content")).toHaveAttribute("data-read-only", "true");
    },
  );
});
