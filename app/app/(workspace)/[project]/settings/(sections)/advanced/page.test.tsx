import type { AdvancedSettingsContentProps } from "@/components/settings/advanced/AdvancedSettingsContent";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  advancedContent: vi.fn((props: AdvancedSettingsContentProps) => (
    <div data-deployment={props.deployment} data-project={props.project.projectId}>
      advanced
    </div>
  )),
  canProjectAction: vi.fn(),
  canReadProjectAudit: vi.fn(),
  configuredMigrationTargetOrigin: vi.fn(() => "https://cloud.example.com"),
  deploymentMode: vi.fn(),
  getAuditLogView: vi.fn(),
  getProjectRole: vi.fn(),
  getSelfHostMigrationState: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/settings/advanced/AdvancedSettingsContent", () => ({
  AdvancedSettingsContent: mocks.advancedContent,
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/cloud", () => ({ exportCloudImportPackage: vi.fn() }));
vi.mock("@/lib/actions/project-write-mode", () => ({
  cancelMigration: vi.fn(),
  enableMigrationHold: vi.fn(),
  markProjectMigrated: vi.fn(),
  reactivateProject: vi.fn(),
  releaseMigrationHold: vi.fn(),
}));
vi.mock("@/lib/actions/self-host-migration", () => ({
  rollbackSelfHostMigration: vi.fn(),
  startSelfHostMigration: vi.fn(),
}));
vi.mock("@/app/app/(workspace)/[project]/settings/actions", () => ({
  deleteWorkspace: vi.fn(),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({
  canProjectAction: mocks.canProjectAction,
  canReadProjectAudit: mocks.canReadProjectAudit,
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/migration/target-origin", () => ({
  configuredMigrationTargetOrigin: mocks.configuredMigrationTargetOrigin,
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/queries/audit", () => ({ getAuditLogView: mocks.getAuditLogView }));
vi.mock("@/lib/queries/self-host-migration", () => ({
  getSelfHostMigrationState: mocks.getSelfHostMigrationState,
}));

import AdvancedSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/advanced/page";

const activeMigration = {
  autoReleasesAt: null,
  canRollback: false,
  startedAt: null,
  writeMode: "active",
};

describe("AdvancedSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [] },
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example project",
        publicId: "prj_story",
        writeMode: "active",
      },
    });
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.canProjectAction.mockReturnValue(true);
    mocks.canReadProjectAudit.mockReturnValue(true);
    mocks.getAuditLogView.mockResolvedValue({ authorized: true, entries: [] });
    mocks.getSelfHostMigrationState.mockResolvedValue(activeMigration);
  });

  it("loads the hosted migration state and real server actions for an owner", async () => {
    mocks.deploymentMode.mockReturnValue("cloud");
    render(await AdvancedSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(screen.getByRole("main")).toContainElement(screen.getByText("advanced"));
    expect(mocks.getSelfHostMigrationState).toHaveBeenCalledWith("prj_story");
    const props = mocks.advancedContent.mock.calls[0]?.[0];
    expect(props).toMatchObject({
      canDeleteProject: true,
      canManageMigration: true,
      deployment: "cloud",
      migration: activeMigration,
    });
    expect(props.actions.startHostedMigration).toEqual(expect.any(Function));
    expect(props.actions.rollbackHostedMigration).toEqual(expect.any(Function));
  });

  it("never loads or exposes the hosted Move contract on self-host", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    render(await AdvancedSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.getSelfHostMigrationState).not.toHaveBeenCalled();
    const props = mocks.advancedContent.mock.calls[0]?.[0];
    expect(props.deployment).toBe("self-host");
    expect(props.migration).toBeNull();
    expect(props.actions.startHostedMigration).toBeUndefined();
    expect(props.actions.rollbackHostedMigration).toBeUndefined();
  });

  it("does not pass destructive or migration mutations to a viewer", async () => {
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getProjectRole.mockReturnValue("viewer");
    mocks.canProjectAction.mockReturnValue(false);
    mocks.canReadProjectAudit.mockReturnValue(false);
    render(await AdvancedSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.getAuditLogView).not.toHaveBeenCalled();
    const props = mocks.advancedContent.mock.calls[0]?.[0];
    expect(props.actions.deleteProject).toBeUndefined();
    expect(props.actions.startHostedMigration).toBeUndefined();
    expect(props.actions.rollbackHostedMigration).toBeUndefined();
  });

  it.each(["migration_hold", "migrated"])(
    "hides project deletion but preserves migration recovery while the project is %s",
    async (writeMode) => {
      mocks.deploymentMode.mockReturnValue("cloud");
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "user_1", memberships: [] },
        project: {
          domain: "example.com",
          id: "project_1",
          name: "Example project",
          publicId: "prj_story",
          writeMode,
        },
      });

      render(await AdvancedSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

      const props = mocks.advancedContent.mock.calls[0]?.[0];
      expect(props.canDeleteProject).toBe(false);
      expect(props.actions.deleteProject).toBeUndefined();
      expect(props.actions.rollbackHostedMigration).toEqual(expect.any(Function));
    },
  );
});
