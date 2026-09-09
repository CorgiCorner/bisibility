import {
  AdvancedSettingsContent,
  type AdvancedSettingsContentProps,
} from "@/components/settings/advanced/AdvancedSettingsContent";
import { ToastProvider } from "@/components/ui/Toast";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadWorkspacePackage: vi.fn(async () => "project-backup.zip"),
}));

vi.mock("@/components/cloud/workspace-package-download", () => ({
  downloadWorkspacePackage: mocks.downloadWorkspacePackage,
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

function hostedProps(): AdvancedSettingsContentProps {
  return {
    actions: {
      deleteProject: vi.fn(async () => ({
        hasRemainingWorkspace: false,
        id: "prj_story",
        nextProjectPublicId: null,
      })),
      exportBackup: vi.fn(async () => packageFile),
    },
    auditEntries: [],
    canDeleteProject: true,
    canManageMigration: true,
    deployment: "cloud" as const,
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

  it("keeps backup export on hosted deployments without a move-to-self-host card", async () => {
    const props = hostedProps();
    render(
      <ToastProvider>
        <AdvancedSettingsContent {...props} />
      </ToastProvider>,
    );

    expect(
      screen.getByText(
        "Keywords, retained history, tags, competitors, alerts, saved views and notification preferences.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Writes stay active")).not.toBeInTheDocument();
    expect(screen.queryByText(/Project writes were not changed/)).not.toBeInTheDocument();
    expect(screen.queryByText("Move to self-host")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to self-host" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download data export" }));

    await waitFor(() =>
      expect(props.actions.exportBackup).toHaveBeenCalledWith({ projectId: "prj_story" }),
    );
    expect(mocks.downloadWorkspacePackage).toHaveBeenCalledWith(packageFile);
    const successToast = await screen.findByText("Project data exported.");
    expect(successToast.closest("output")).toHaveAttribute("data-toast-severity", "success");
    expect(screen.queryByText(/Project writes were not changed/)).not.toBeInTheDocument();

    const exportButton = screen.getByRole("button", { name: "Download data export" });
    expect(exportButton).toBeEnabled();
    fireEvent.click(exportButton);
    await waitFor(() => expect(props.actions.exportBackup).toHaveBeenCalledTimes(2));
    expect(mocks.downloadWorkspacePackage).toHaveBeenCalledTimes(2);
  });

  it("uses naturally sized cards with full-width right-aligned action rows", () => {
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} />);

    for (const [role, name] of [
      ["link", "Open audit log"],
      ["button", "Download data export"],
      ["button", "Delete project"],
    ] as const) {
      const actionRow = screen.getByRole(role, { name }).parentElement;
      expect(actionRow).toHaveClass("-mx-5", "px-5", "justify-end", "border-t");
    }

    for (const name of ["Audit log", "Export project data", "Danger zone"]) {
      const card = screen.getByRole("region", { name });
      expect(card.className).not.toMatch(/(?:^|\s)(?:sm:|lg:)?h-\[/);
    }
  });

  it("shows a generic transfer card on self-hosted deployments", () => {
    const props = hostedProps();
    render(<AdvancedSettingsContent {...props} deployment="self-host" />);

    expect(screen.getByRole("region", { name: "Transfer project" })).toBeInTheDocument();
    expect(
      screen.getByText(/Move this project to another Bisibility instance/),
    ).toBeInTheDocument();
    expect(screen.queryByText("This project")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Provider credentials, API keys, billing information, and user passwords are not transferred/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer project" })).toBeInTheDocument();
    expect(screen.queryByText("Migrate to Cloud")).not.toBeInTheDocument();
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
