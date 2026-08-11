import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MigrateToCloudWizard } from "./MigrateToCloudWizard";

const mocks = vi.hoisted(() => {
  const packageFile = {
    content: JSON.stringify({ keywords: [{ text: "rank tracker" }], rank_checks: [] }),
    counts: {
      alertRules: 0,
      competitors: 0,
      keywords: 1,
      notificationPreferences: 0,
      rankChecks: 0,
      savedViews: 0,
    },
    filename: "bisibility-cloud-import.json",
    mimeType: "application/json",
  };
  return {
    cancelMigration: vi.fn(async () => ({})),
    createCloudMigrationHandoff: vi.fn(async () => ({
      apiImportUrl: "https://bisibility.com/api/v1/cloud/import",
      apiRequest: "POST https://bisibility.com/api/v1/cloud/import",
      cloudImportUrl: "https://bisibility.com/app",
      cloudOnboardingUrl: "https://bisibility.com/cloud/onboarding",
      cloudOrigin: "https://bisibility.com",
      cloudWorkspaceUrl: "https://bisibility.com/app",
      sourceProjectId: "prj_abcdefghijklmnopqrstuvwx",
    })),
    createRemoteImportSession: vi.fn(),
    downloadWorkspacePackage: vi.fn(async (file: { filename: string }) =>
      file.filename.replace(/\.json$/i, ".zip"),
    ),
    exportAndTransferChunk: vi.fn(),
    exportCloudImportPackage: vi.fn(async () => packageFile),
    enableMigrationHold: vi.fn(async () => ({})),
    finalizeRemoteImportSession: vi.fn(),
    markProjectMigrated: vi.fn(async () => ({})),
    getCloudMigrationCompatibility: vi.fn(),
    onClose: vi.fn(),
    packageFile,
    planChunkedTransfer: vi.fn(),
    preflightMigrationTarget: vi.fn(),
    releaseMigrationHold: vi.fn(async () => ({})),
    routerRefresh: vi.fn(),
    transferCloudImportPackage: vi.fn(),
    transferSectionsChunk: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));
vi.mock("@/components/cloud/workspace-package-download", () => ({
  downloadWorkspacePackage: mocks.downloadWorkspacePackage,
}));
vi.mock("@/lib/actions/cloud", () => mocks);
vi.mock("@/lib/actions/instance-migration", () => ({
  createRemoteImportSession: mocks.createRemoteImportSession,
  exportAndTransferChunk: mocks.exportAndTransferChunk,
  finalizeRemoteImportSession: mocks.finalizeRemoteImportSession,
  planChunkedTransfer: mocks.planChunkedTransfer,
  transferSectionsChunk: mocks.transferSectionsChunk,
}));

const publicProjectId = "prj_abcdefghijklmnopqrstuvwx";
const otherPublicProjectId = "prj_zbcdefghijklmnopqrstuvwx";
const publicJobId = "imp_abcdefghijklmnopqrstuvwx";
const retryPublicJobId = "imp_zbcdefghijklmnopqrstuvwx";

function Wizard(props: { direction?: "to-cloud" | "to-self-host"; projectId?: string }) {
  return (
    <MigrateToCloudWizard
      cancelMigration={mocks.cancelMigration}
      defaultTargetOrigin="https://bisibility.com"
      direction={props.direction ?? "to-cloud"}
      domain="example.com"
      enableMigrationHold={mocks.enableMigrationHold}
      markProjectMigrated={mocks.markProjectMigrated}
      onClose={mocks.onClose}
      open
      projectId={props.projectId ?? publicProjectId}
      releaseMigrationHold={mocks.releaseMigrationHold}
    />
  );
}

function renderWizard(direction: "to-cloud" | "to-self-host" = "to-cloud") {
  const view = render(<Wizard direction={direction} />);
  return {
    ...view,
    rerenderProject: (projectId: string) =>
      view.rerender(<Wizard direction={direction} projectId={projectId} />),
  };
}

async function runCompatibilityCheck() {
  fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));
  expect(await screen.findByText("READY")).toBeInTheDocument();
}

async function continueToTransfer() {
  await runCompatibilityCheck();
  const button = screen.getByRole("button", { name: /continue/i });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  // Enabling read-only mode is a dangerous action gated by an explicit confirm.
  expect(await screen.findByText("Pause writes and rank checks?")).toBeInTheDocument();
  expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pause writes and continue" }));
  expect(await screen.findByText(/Transfer to/)).toBeInTheDocument();
  // Wait for the confirm dialog to fully unmount so queries hit the wizard again.
  await waitFor(() =>
    expect(screen.queryByText("Pause writes and rank checks?")).not.toBeInTheDocument(),
  );
}

describe("MigrateToCloudWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancelMigration.mockResolvedValue({});
    mocks.enableMigrationHold.mockResolvedValue({});
    mocks.releaseMigrationHold.mockResolvedValue({});
    mocks.getCloudMigrationCompatibility.mockResolvedValue({
      appVersion: "1.2.3",
      appVersionSource: "package.json",
      cloudOrigin: "https://bisibility.com",
      data: { keywords: 1, rankChecks: 2 },
      limits: { pushMaxKeywords: 500, sessionsRequired: false },
      schema: { count: 12, latest: "20260708010000_source" },
    });
    mocks.preflightMigrationTarget.mockResolvedValue({
      appVersion: "1.2.3",
      latestMigration: "20260708010000_target",
      origin: "https://bisibility.com",
      reachable: true,
      sameInstance: false,
      schemaVersionsSupported: [5],
      sourceDeploymentMode: "self-host",
      supportsSessions: true,
    });
    mocks.planChunkedTransfer.mockResolvedValue({
      chunkCount: 2,
      totalKeywords: 1,
      totalRankChecks: 2,
      useSessions: false,
    });
    mocks.transferCloudImportPackage.mockResolvedValue({
      ok: true,
      value: {
        counts: { history: 2, keywords: 1 },
        jobId: publicJobId,
        state: "done",
      },
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:cloud-import"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it("does not allow leaving Check before a successful current check", () => {
    renderWizard();

    expect(screen.getByText("REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("renders a configured target failure inline without reclassifying the default as user input", async () => {
    const message =
      "Migration target configuration is invalid. Check BISIBILITY_CLOUD_URL or the site URL. Target URL port must be empty, 80, 443, or 8443.";
    mocks.preflightMigrationTarget.mockResolvedValueOnce({
      error: { code: "invalid_migration_target", message, status: 400 },
      ok: false,
    });
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mocks.preflightMigrationTarget).toHaveBeenCalledWith({ projectId: publicProjectId });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("renders a rejected user target inline with the validator reason", async () => {
    const message = "Target URL port must be empty, 80, 443, or 8443.";
    mocks.preflightMigrationTarget.mockResolvedValueOnce({
      error: { code: "invalid_migration_target", message, status: 400 },
      ok: false,
    });
    renderWizard();
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://target.example.com:3000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mocks.preflightMigrationTarget).toHaveBeenCalledWith({
      projectId: publicProjectId,
      targetOrigin: "https://target.example.com:3000",
    });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("blocks incompatible destinations instead of treating counts as decorative", async () => {
    mocks.getCloudMigrationCompatibility.mockResolvedValueOnce({
      appVersion: "1.2.3",
      appVersionSource: "package.json",
      cloudOrigin: "https://bisibility.com",
      data: { keywords: 401, rankChecks: 25_001 },
      limits: { pushMaxKeywords: 500, sessionsRequired: true },
      schema: { count: 12, latest: "20260708010000_source" },
    });
    mocks.preflightMigrationTarget.mockResolvedValueOnce({
      appVersion: "1.0.0",
      latestMigration: null,
      reachable: true,
      reason: "Target instance is too old for chunked sessions - upgrade it.",
      schemaVersionsSupported: [1, 2],
      supportsSessions: false,
    });
    renderWizard("to-self-host");
    fireEvent.change(screen.getByLabelText("Self-host URL"), {
      target: { value: "https://target.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect((await screen.findAllByText("BLOCKED")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("blocks a reachable target that lacks the required package protocol", async () => {
    mocks.preflightMigrationTarget.mockResolvedValueOnce({
      appVersion: "1.0.0",
      latestMigration: "legacy",
      reachable: true,
      schemaVersionsSupported: [1],
      supportsSessions: false,
    });
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(
      await screen.findByText(/doesn't support the transfer format this project needs/i),
    ).toBeInTheDocument();
    expect(screen.getByText("MIG-104")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("blocks a reachable target when protocol versions are missing", async () => {
    mocks.preflightMigrationTarget.mockResolvedValueOnce({
      appVersion: "1.0.0",
      latestMigration: null,
      reachable: true,
      schemaVersionsSupported: null,
      supportsSessions: false,
    });
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Run compatibility check/i }));

    expect(
      await screen.findByText(/didn't report which import formats it supports/i),
    ).toBeInTheDocument();
    expect(screen.getByText("MIG-103")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
  });

  it("invalidates compatibility after the destination URL changes", async () => {
    renderWizard("to-self-host");
    const input = screen.getByLabelText("Self-host URL");
    fireEvent.change(input, { target: { value: "https://one.example.com" } });
    await runCompatibilityCheck();

    fireEvent.change(input, { target: { value: "https://two.example.com" } });

    expect(screen.getByText("REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("uses one edited to-cloud destination for the check and transfer", async () => {
    renderWizard();
    const input = screen.getByLabelText("Destination URL");
    expect(input).toHaveValue("https://bisibility.com");
    expect(screen.getByText(/Prefilled from this instance's configuration/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "https://target.example.com" } });
    await continueToTransfer();
    expect(mocks.preflightMigrationTarget).toHaveBeenCalledWith({
      projectId: publicProjectId,
      targetOrigin: "https://target.example.com",
    });

    fireEvent.change(screen.getByLabelText("Migration token"), {
      target: { value: "mig_123456789012345678901234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Transfer$/ }));
    await waitFor(() =>
      expect(mocks.transferCloudImportPackage).toHaveBeenCalledWith(
        expect.objectContaining({ targetOrigin: "https://target.example.com" }),
      ),
    );
  });

  it("invalidates compatibility after the active project changes", async () => {
    const view = renderWizard();
    await runCompatibilityCheck();

    view.rerenderProject(otherPublicProjectId);

    expect(screen.getByText("REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("rejects a compatibility result older than five minutes", async () => {
    renderWizard();
    await runCompatibilityCheck();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5 * 60_000 + 1);

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText("Run a current compatibility check before continuing."),
    ).toBeInTheDocument();
    expect(screen.getByText("REQUIRED")).toBeInTheDocument();
    expect(mocks.enableMigrationHold).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it("runs Push as Check, Transfer, Done and renders confirmed job counts", async () => {
    renderWizard();
    await continueToTransfer();
    expect(screen.queryByText("Export package")).not.toBeInTheDocument();
    expect(mocks.enableMigrationHold).toHaveBeenCalledWith({ projectId: publicProjectId });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Migration token"), {
      target: { value: "mig_123456789012345678901234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Transfer$/ }));
    await waitFor(() => expect(mocks.transferCloudImportPackage).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.releaseMigrationHold).toHaveBeenCalledWith({ projectId: publicProjectId }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("hosted instance import complete")).toBeInTheDocument();
    expect(screen.getByText(`Import job ${publicJobId}`)).toBeInTheDocument();
    expect(screen.getByText("keywords: 1")).toBeInTheDocument();
    expect(screen.getByText("history: 2")).toBeInTheDocument();
    expect(screen.getByText("Writes are active on this source project.")).toBeInTheDocument();
  });

  it("keeps Download pending until export and explicit external confirmation", async () => {
    renderWizard();
    await continueToTransfer();
    expect(
      screen.getByText(
        "Choose a direct push or move the project package manually through the hosted instance import page.",
      ),
    ).toBeInTheDocument();
    const downloadMode = screen.getByRole("radio", { name: /Download/ });
    fireEvent.click(downloadMode);
    expect(downloadMode).toBeChecked();

    expect(await screen.findByText("Step 2 · Export the project package")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upload the downloaded project package there and paste the migration token from step 1 when asked. The destination validates the token, schema, package counts and target compatibility before import.",
      ),
    ).toBeInTheDocument();
    const confirmation = screen.getByRole("checkbox", { name: /await confirmation/i });
    expect(confirmation).toBeDisabled();
    expect(
      screen.getByText("Export the project package before confirming the manual upload."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/JSON package/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Export$/ }));
    await waitFor(() => expect(mocks.exportCloudImportPackage).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.downloadWorkspacePackage).toHaveBeenCalledWith(mocks.packageFile),
    );
    expect(screen.getByText("bisibility-cloud-import.zip")).toBeInTheDocument();
    expect(screen.queryByText("bisibility-cloud-import.json")).not.toBeInTheDocument();
    expect(
      screen.getByText("Package exported and downloaded. Upload it on the destination instance."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    expect(confirmation).toBeEnabled();
    fireEvent.click(confirmation);
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Awaiting external confirmation")).toBeInTheDocument();
    expect(screen.queryByText(/import complete/i)).not.toBeInTheDocument();
  });

  it("asks how to handle the migration hold before closing mid-flow", async () => {
    renderWizard();
    await continueToTransfer();
    fireEvent.click(screen.getByLabelText("Close sheet"));

    expect(await screen.findByText("Migration in progress")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep read-only and close" }));
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
    expect(mocks.releaseMigrationHold).not.toHaveBeenCalled();
  });

  it("offers no resume-writes shortcut after the hold starts", async () => {
    renderWizard();
    await continueToTransfer();

    expect(screen.queryByRole("button", { name: /resume writes/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only mode is on/)).toBeInTheDocument();
  });

  it("releases a failed transfer and reacquires the hold before retrying", async () => {
    mocks.transferCloudImportPackage
      .mockRejectedValueOnce(new Error("Destination rejected the transfer."))
      .mockResolvedValueOnce({
        ok: true,
        value: {
          counts: { history: 2, keywords: 1 },
          jobId: retryPublicJobId,
          state: "done",
        },
      });
    renderWizard();
    await continueToTransfer();
    fireEvent.change(screen.getByLabelText("Migration token"), {
      target: { value: "mig_123456789012345678901234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Transfer$/ }));
    expect(await screen.findAllByText("Destination rejected the transfer.")).toHaveLength(2);
    await waitFor(() => expect(mocks.releaseMigrationHold).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Read-only mode is on/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Transfer$/ }));
    await waitFor(() => expect(mocks.enableMigrationHold).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.transferCloudImportPackage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.releaseMigrationHold).toHaveBeenCalledTimes(2));
  });

  it("keeps the hold visible and explains a terminal release failure", async () => {
    mocks.releaseMigrationHold.mockRejectedValueOnce(new Error("Release unavailable."));
    renderWizard();
    await continueToTransfer();
    fireEvent.change(screen.getByLabelText("Migration token"), {
      target: { value: "mig_123456789012345678901234" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Transfer$/ }));

    expect(
      await screen.findByText(
        "Transfer ended, but read-only mode could not be released. Use Cancel migration to retry.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Read-only mode is on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("terminalizes the transfer through the cancel-migration confirmation", async () => {
    renderWizard();
    await continueToTransfer();
    fireEvent.click(screen.getByRole("button", { name: "Cancel migration" }));

    expect(await screen.findByText("Cancel this migration?")).toBeInTheDocument();
    expect(mocks.cancelMigration).not.toHaveBeenCalled();
    const confirmButtons = screen.getAllByRole("button", { name: "Cancel migration" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() =>
      expect(mocks.cancelMigration).toHaveBeenCalledWith({ projectId: publicProjectId }),
    );
    expect(mocks.releaseMigrationHold).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.onClose).toHaveBeenCalledTimes(1));
    // The recovery card is server-rendered, so cancel must refresh to reflect reality.
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });
});
