import {
  renderWithShellMessages as render,
  renderWithFeatureMessages,
  shellFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudBackupModal } from "./CloudBackupModal";

const preparedPolishShellMessages = {
  ...shellFeatureTestMessages,
  shell: {
    ...shellFeatureTestMessages.shell,
    backup: {
      ...shellFeatureTestMessages.shell.backup,
      errors: {
        ...shellFeatureTestMessages.shell.backup.errors,
        keywordLimit: "Pakiet może zawierać do {limit, number} słów kluczowych.",
      },
      exportError: "Nie udało się wyeksportować pakietu.",
      exportPackage: "Eksportuj pakiet",
      included: "W pakiecie",
      lastExport: {
        ...shellFeatureTestMessages.shell.backup.lastExport,
        justNow: "Ostatni eksport przed chwilą",
        never: "Nigdy nie eksportowano",
      },
      sections: {
        ...shellFeatureTestMessages.shell.backup.sections,
        keywords: {
          ...shellFeatureTestMessages.shell.backup.sections.keywords,
          label: "Słowa kluczowe i tagi",
        },
      },
      success: "Pakiet wyeksportowano i pobrano.",
      title: "Eksport danych projektu",
    },
  },
};

const mocks = vi.hoisted(() => ({
  downloadWorkspacePackage: vi.fn(),
  exportPackage: vi.fn(),
  onClose: vi.fn(),
  onExportSuccess: vi.fn(),
}));

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
  projectName: "example.com",
} as const;

function includedRow(label: string) {
  return screen.getByText(label).parentElement?.parentElement;
}

describe("CloudBackupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState(null, "", "/app/prj_1/overview");
    mocks.exportPackage.mockResolvedValue(packageFile);
  });

  it("puts export recency in the modal header and keeps every count in Included", () => {
    render(<CloudBackupModal {...defaultProps} />);

    const exportChip = screen.getByTestId("cloud-backup-export-status");
    expect((exportChip.textContent ?? "").replace(/\s+/g, " ").trim()).toMatch(
      /^Last export 6d ago$/,
    );
    expect((exportChip.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(
      /\b\d[\d,]*\s+(?:keywords?|rows?|records?|items?|sections?)\b/i,
    );
    expect(exportChip.closest("h2")).toBe(
      screen.getByRole("heading", { name: /Export project data/i }),
    );
    expect(includedRow("Keywords and tags")).toHaveTextContent("248");
    expect(includedRow("Rank history")).toHaveTextContent("412,000");
    expect(includedRow("Competitors")).toHaveTextContent("3");
    expect(includedRow("Alert rules")).toHaveTextContent("2");
    expect(includedRow("Saved views")).toHaveTextContent("4");
    expect(includedRow("Notification preferences")).toHaveTextContent("1");
    expect(includedRow("Project details")?.children).toHaveLength(2);
  });

  it("omits format choices from the package-only export modal", () => {
    render(<CloudBackupModal {...defaultProps} />);

    expect(screen.queryByText(/^Format$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(".csv")).not.toBeInTheDocument();
    expect(screen.queryByText("Project package")).not.toBeInTheDocument();
    expect(screen.queryByText("Keyword table")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export package" })).toBeInTheDocument();
  });

  it("renders a sensible state when the project has never exported", () => {
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

    expect(includedRow("Keywords and tags")).toHaveTextContent("0");
    expect(includedRow("Rank history")).toHaveTextContent("0");
    expect(includedRow("Competitors")).toHaveTextContent("0");
    expect(includedRow("Alert rules")).toHaveTextContent("0");
    expect(includedRow("Saved views")).toHaveTextContent("0");
    expect(includedRow("Notification preferences")).toHaveTextContent("0");
  });

  it("uses a prepared non-English shell payload for an empty backup", () => {
    renderWithFeatureMessages(
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
        lastExport={null}
      />,
      { locale: "pl", messages: preparedPolishShellMessages },
    );

    expect(screen.getByText("Eksport danych projektu")).toBeInTheDocument();
    expect(screen.getByText("W pakiecie")).toBeInTheDocument();
    expect(screen.getByTestId("cloud-backup-export-status")).toHaveTextContent(
      "Nigdy nie eksportowano",
    );
    expect(includedRow("Słowa kluczowe i tagi")).toHaveTextContent("0");
  });

  it("keeps known limits and unknown failures localized in the prepared shell payload", async () => {
    mocks.exportPackage.mockRejectedValueOnce(
      new Error("Instance import package downloads currently support up to 1200 keywords."),
    );
    const { unmount } = renderWithFeatureMessages(<CloudBackupModal {...defaultProps} />, {
      locale: "pl",
      messages: preparedPolishShellMessages,
    });

    fireEvent.click(screen.getByRole("button", { name: "Eksportuj pakiet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Pakiet może zawierać do ${new Intl.NumberFormat("pl").format(1200)} słów kluczowych.`,
    );

    const diagnostic = "Project export is unavailable. provider=internal";
    mocks.exportPackage.mockRejectedValueOnce(new Error(diagnostic));
    unmount();
    renderWithFeatureMessages(<CloudBackupModal {...defaultProps} />, {
      locale: "pl",
      messages: preparedPolishShellMessages,
    });
    fireEvent.click(screen.getByRole("button", { name: "Eksportuj pakiet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się wyeksportować pakietu.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(diagnostic);
  });

  it("keeps successful backup feedback in the prepared shell payload", async () => {
    renderWithFeatureMessages(
      <CloudBackupModal {...defaultProps} now={new Date().toISOString()} />,
      {
        locale: "pl",
        messages: preparedPolishShellMessages,
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Eksportuj pakiet" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Pakiet wyeksportowano i pobrano.");
    expect(screen.getByTestId("cloud-backup-export-status")).toHaveTextContent(
      "Ostatni eksport przed chwilą",
    );
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
    expect((exportChip.textContent ?? "").replace(/\s+/g, " ").trim()).toMatch(
      /^Last export just now$/,
    );
    expect((exportChip.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(
      /\b\d[\d,]*\s+(?:keywords?|rows?|records?|items?|sections?)\b/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Package exported and downloaded.");
  });

  it("keeps unknown package export diagnostics out of the shell", async () => {
    const diagnostic = "Project export is unavailable. provider=internal";
    mocks.exportPackage.mockRejectedValueOnce(new Error(diagnostic));
    render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Instance import package export failed.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(diagnostic);
    expect(mocks.downloadWorkspacePackage).not.toHaveBeenCalled();
  });

  it("explains a recognized package size limit without showing its server diagnostic", async () => {
    mocks.exportPackage.mockRejectedValueOnce(
      new Error("Instance import package downloads currently support up to 1200 keywords."),
    );
    render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This package can include up to 1,200 keywords.",
    );
    expect(mocks.downloadWorkspacePackage).not.toHaveBeenCalled();
  });

  it("keeps stale deployments and server digest references actionable in the export dialog", async () => {
    mocks.exportPackage.mockRejectedValueOnce(new Error("Failed to find Server Action"));
    const { unmount } = render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bisibility was updated while this page was open. Refresh the app to continue.",
    );

    const digest = Object.assign(new Error("Server Components render failed"), {
      digest: "digest_abc",
    });
    mocks.exportPackage.mockRejectedValueOnce(digest);
    unmount();
    render(<CloudBackupModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check failed on our side (ref digest_abc). Retry in a moment.",
    );
  });
});
