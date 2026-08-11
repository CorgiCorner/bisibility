import {
  AdvancedSettingsContent,
  type AdvancedSettingsContentProps,
} from "@/components/settings/advanced/AdvancedSettingsContent";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadWorkspacePackage: vi.fn(async () => "project-backup.zip"),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/components/cloud/workspace-package-download", () => ({
  downloadWorkspacePackage: mocks.downloadWorkspacePackage,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const packageFile = {
  content: "{}",
  counts: {
    alertRules: 0,
    competitors: 0,
    keywords: 2,
    notificationPreferences: 0,
    rankChecks: 4,
    savedViews: 0,
  },
  filename: "project-backup.json",
  mimeType: "application/json",
};

const activeMigration = {
  autoReleasesAt: null,
  canRollback: false,
  startedAt: null,
  writeMode: "active" as const,
};

const heldMigration = {
  autoReleasesAt: "2026-08-10T14:30:00.000Z",
  canRollback: true,
  startedAt: "2026-08-09T08:30:00.000Z",
  writeMode: "migration_hold" as const,
};

function hostedProps(): AdvancedSettingsContentProps {
  return {
    actions: {
      deleteProject: vi.fn(async () => ({
        hasRemainingWorkspace: false,
        id: "prj_story",
        nextProjectPublicId: null,
      })),
      exportBackup: vi.fn(async () => packageFile),
      rollbackHostedMigration: vi.fn(async () => activeMigration),
      startHostedMigration: vi.fn(async () => ({
        migration: heldMigration,
        packageFile,
      })),
    },
    auditEntries: [],
    canDeleteProject: true,
    canManageMigration: true,
    deployment: "cloud" as const,
    migration: activeMigration,
    project: {
      domain: "example.com",
      name: "Example project",
      projectId: "prj_story",
      writeMode: "active" as const,
    },
  };
}

describe("AdvancedSettingsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps backup export separate from the hosted migration hold", async () => {
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} />);

    expect(
      screen.getByText(
        "Keywords, retained history, tags, competitors, alerts, saved views and notification preferences.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/project details/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download data export" }));

    await waitFor(() =>
      expect(props.actions.exportBackup).toHaveBeenCalledWith({ projectId: "prj_story" }),
    );
    expect(props.actions.startHostedMigration).not.toHaveBeenCalled();
    expect(mocks.downloadWorkspacePackage).toHaveBeenCalledWith(packageFile);
  });

  it("starts the hosted move only after confirming its read-only hold", async () => {
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Move to self-host" }));
    expect(props.actions.startHostedMigration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Make read-only and export" }));

    await waitFor(() =>
      expect(props.actions.startHostedMigration).toHaveBeenCalledWith({ projectId: "prj_story" }),
    );
    expect(await screen.findByText(/eligible for automatic release/i)).toHaveTextContent(
      "Aug 10, 2026, 14:30 UTC",
    );
  });

  it("rolls back only through the hosted rollback action", async () => {
    const props = hostedProps();
    props.migration = heldMigration;
    render(<AdvancedSettingsContent {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Roll back migration" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume writes" }));

    await waitFor(() =>
      expect(props.actions.rollbackHostedMigration).toHaveBeenCalledWith({
        projectId: "prj_story",
      }),
    );
    expect(props.actions.exportBackup).not.toHaveBeenCalled();
  });

  it("hides hosted-only Move and backup actions on self-hosted deployments", () => {
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} deployment="self-host" migration={null} />);

    expect(screen.getByText("Migrate to Cloud")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to self-host" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download backup" })).not.toBeInTheDocument();
  });

  it("keeps deletion confirmation inside a guarded modal", async () => {
    const user = userEvent.setup();
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} />);

    expect(screen.queryByLabelText("Type example.com to confirm deletion")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog", { name: "Confirm project deletion" });
    const input = within(dialog).getByLabelText("Type example.com to confirm deletion");
    expect(within(dialog).getByRole("button", { name: "Delete project" })).toBeDisabled();
    await user.type(input, "example.com");
    await user.click(within(dialog).getByRole("button", { name: "Delete project" }));

    await waitFor(() =>
      expect(props.actions.deleteProject).toHaveBeenCalledWith({
        confirmText: "example.com",
        projectId: "prj_story",
      }),
    );
  });

  it("uses the project ID inside the modal when no domain is set", async () => {
    const user = userEvent.setup();
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} project={{ ...props.project, domain: "" }} />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(
      within(screen.getByRole("dialog", { name: "Confirm project deletion" })).getByLabelText(
        "Type prj_story to confirm deletion",
      ),
    ).toBeInTheDocument();
  });
});
