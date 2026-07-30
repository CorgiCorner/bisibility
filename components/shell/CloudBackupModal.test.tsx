import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudBackupModal } from "./CloudBackupModal";
import { consumePendingKeywordCommandAction } from "./keyword-command-actions";

const mocks = vi.hoisted(() => ({
  downloadWorkspacePackage: vi.fn(),
  exportPackage: vi.fn(),
  onClose: vi.fn(),
  onExportSuccess: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/settings/migration/MigrateToCloudExportPackage", () => ({
  exportActiveCloudImportPackage: mocks.exportPackage,
}));
vi.mock("@/components/cloud/workspace-package-download", () => ({
  downloadWorkspacePackage: mocks.downloadWorkspacePackage,
}));

const packageFile = {
  content: "{}",
  counts: {
    alertRules: 2,
    competitors: 3,
    keywords: 248,
    notificationPreferences: 1,
    rankChecks: 412_000,
    savedViews: 4,
  },
  filename: "bisibility-cloud-import-prj_1.json",
  mimeType: "application/json",
};

const defaultProps = {
  counts: packageFile.counts,
  lastExport: {
    exportedAt: "2026-07-19T12:00:00.000Z",
  },
  now: "2026-07-25T12:00:00.000Z",
  onClose: mocks.onClose,
  onExportSuccess: mocks.onExportSuccess,
  open: true,
  projectId: "project_1",
  projectRef: "prj_1",
  projectName: "acme.dev",
} as const;

function includedRow(label: string) {
  return screen.getByText(label).parentElement?.parentElement;
}

describe("CloudBackupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumePendingKeywordCommandAction();
    history.replaceState(null, "", "/app/prj_1/overview");
    mocks.exportPackage.mockResolvedValue(packageFile);
  });

  it("puts export recency in the modal header and keeps every count in Included", () => {
    render(<CloudBackupModal {...defaultProps} />);

    const exportChip = screen.getByTestId("cloud-backup-export-status");
    expect(exportChip).toHaveTextContent(/^Last export 6d ago$/);
    expect(exportChip).not.toHaveTextContent(
      /\b\d[\d,]*\s+(?:keywords?|rows?|records?|items?|sections?)\b/i,
    );
    expect(exportChip.closest("h2")).toBe(
      screen.getByRole("heading", { name: /Export workspace data/i }),
    );
    expect(screen.getByRole("radio", { name: /Workspace package/i })).toBeChecked();
    expect(includedRow("Keywords & tags")).toHaveTextContent("248");
    expect(includedRow("Rank history")).toHaveTextContent("412,000");
    expect(includedRow("Competitors")).toHaveTextContent("3");
    expect(includedRow("Alert rules")).toHaveTextContent("2");
    expect(includedRow("Saved views")).toHaveTextContent("4");
    expect(includedRow("Notification preferences")).toHaveTextContent("1");
    expect(includedRow("Workspace details")?.children).toHaveLength(2);
  });

  it("renders a sensible state when the workspace has never exported", () => {
    render(<CloudBackupModal {...defaultProps} lastExport={null} />);

    expect(screen.getByTestId("cloud-backup-export-status")).toHaveTextContent("Never exported");
  });

  it("renders zero for every empty countable package section", () => {
    render(
      <CloudBackupModal
        {...defaultProps}
        counts={{
          alertRules: 0,
          competitors: 0,
          keywords: 0,
          notificationPreferences: 0,
          rankChecks: 0,
          savedViews: 0,
        }}
      />,
    );

    expect(includedRow("Keywords & tags")).toHaveTextContent("0");
    expect(includedRow("Rank history")).toHaveTextContent("0");
    expect(includedRow("Competitors")).toHaveTextContent("0");
    expect(includedRow("Alert rules")).toHaveTextContent("0");
    expect(includedRow("Saved views")).toHaveTextContent("0");
    expect(includedRow("Notification preferences")).toHaveTextContent("0");
  });

  it("exports and downloads a full package successfully", async () => {
    const now = new Date().toISOString();
    render(<CloudBackupModal {...defaultProps} now={now} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    await waitFor(() =>
      expect(mocks.exportPackage).toHaveBeenCalledWith({ projectId: "project_1" }),
    );
    expect(mocks.downloadWorkspacePackage).toHaveBeenCalledWith(packageFile);
    expect(mocks.onExportSuccess).toHaveBeenCalledWith({
      exportedAt: expect.any(String),
    });
    const exportChip = screen.getByTestId("cloud-backup-export-status");
    expect(exportChip).toHaveTextContent(/^Last export just now$/);
    expect(exportChip).not.toHaveTextContent(
      /\b\d[\d,]*\s+(?:keywords?|rows?|records?|items?|sections?)\b/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Package exported and downloaded.");
  });

  it("surfaces package export failures through the shared action error", async () => {
    mocks.exportPackage.mockRejectedValueOnce(new Error("Workspace export is unavailable."));
    render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace export is unavailable.");
    expect(mocks.downloadWorkspacePackage).not.toHaveBeenCalled();
  });

  it("hands CSV off to the established keyword export flow", async () => {
    render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("radio", { name: /Keyword table/i }));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/app/prj_1/keywords?action=export"),
    );
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.exportPackage).not.toHaveBeenCalled();
  });
});
