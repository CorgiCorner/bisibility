import { buildCloudWorkspacePackage } from "@/lib/migration/workspace-package";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PackageTransferPanel } from "./PackageTransferPanel";

const mocks = vi.hoisted(() => ({
  downloadWorkspacePackage: vi.fn(async (file: { filename: string }) =>
    file.filename.replace(/\.json$/i, ".zip"),
  ),
}));

vi.mock("./workspace-package-download", () => ({
  downloadWorkspacePackage: mocks.downloadWorkspacePackage,
}));

const jobId = "imp_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";

function packageContent(keyword = "rank tracker", version = 5) {
  return JSON.stringify({
    alert_rules: [],
    competitors: [],
    keywords: [
      {
        device: "desktop",
        id: keywordId,
        keyword,
        location: "United States",
        tags: [],
        target_url: null,
      },
    ],
    notification_preferences: [],
    project_id: projectId,
    saved_views: [],
    version,
  });
}

function renderServerTransfer(overrides: Record<string, unknown> = {}) {
  const actions = {
    exportPackageAction: vi.fn(),
    onStatusRefresh: vi.fn(async () => ({})),
    onTransferEnd: vi.fn(async () => undefined),
    onTransferStart: vi.fn(async () => true),
    serverTransferAction: vi.fn(async () => ({
      completion: { counts: {}, jobId, state: "done" as const },
    })),
  };
  render(
    <PackageTransferPanel
      packageSource="server"
      projectId={projectId}
      rawToken="mig_valid_token_value_123"
      {...actions}
      {...overrides}
    />,
  );
  return actions;
}

function renderSelectedTransfer(overrides: Record<string, unknown> = {}) {
  const actions = {
    exportPackageAction: vi.fn(),
    onStatusRefresh: vi.fn(async () => ({})),
    transferPackageAction: vi.fn(async () => ({
      counts: {},
      jobId,
      state: "done" as const,
    })),
  };
  render(
    <PackageTransferPanel
      projectId={projectId}
      rawToken="mig_valid_token_value_123"
      {...actions}
      {...overrides}
    />,
  );
  return actions;
}

describe("PackageTransferPanel", () => {
  it("downloads the exported manifest as a zip and keeps JSON state for direct transfer", async () => {
    const file = {
      content: packageContent(),
      counts: {
        alertRules: 0,
        competitors: 0,
        keywords: 1,
        notificationPreferences: 0,
        rankChecks: 0,
        savedViews: 0,
      },
      filename: "workspace.json",
      mimeType: "application/json",
    };
    const exportPackageAction = vi.fn(async () => file);
    const actions = renderSelectedTransfer({ exportPackageAction });

    fireEvent.click(screen.getByRole("button", { name: "Export package" }));

    await waitFor(() => expect(mocks.downloadWorkspacePackage).toHaveBeenCalledWith(file));
    expect(await screen.findByText("workspace.zip")).toBeInTheDocument();
    expect(screen.queryByText("workspace.json")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => expect(actions.transferPackageAction).toHaveBeenCalledOnce());
    expect(actions.transferPackageAction).toHaveBeenCalledWith({
      content: file.content,
      filename: file.filename,
      projectId,
      token: "mig_valid_token_value_123",
    });
  });

  it("does not send the import request or release a hold when acquisition fails", async () => {
    const onTransferStart = vi.fn(async () => false);
    const actions = renderServerTransfer({ onTransferStart });

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText("Read-only mode could not be enabled.")).toBeInTheDocument();
    expect(actions.serverTransferAction).not.toHaveBeenCalled();
    expect(actions.onTransferEnd).not.toHaveBeenCalled();
  });

  it("keeps the hold around the request and releases it after completion", async () => {
    const order: string[] = [];
    const onTransferStart = vi.fn(async () => {
      order.push("hold");
      return true;
    });
    const serverTransferAction = vi.fn(async () => {
      order.push("request");
      return { completion: { counts: {}, jobId, state: "done" as const } };
    });
    const onTransferEnd = vi.fn(async () => {
      order.push("release");
    });
    renderServerTransfer({ onTransferEnd, onTransferStart, serverTransferAction });

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    await waitFor(() => expect(onTransferEnd).toHaveBeenCalledOnce());
    expect(order).toEqual(["hold", "request", "release"]);
  });

  it("loads a zip manifest and transfers its JSON content", async () => {
    const content = packageContent("manifest value");
    const bytes = await buildCloudWorkspacePackage(content);
    const file = new File([bytes], "workspace.zip", { type: "application/zip" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => Uint8Array.from(bytes).buffer,
    });
    const actions = renderSelectedTransfer();

    const input = screen.getByLabelText("Upload JSON or ZIP");
    expect(input).toHaveAttribute("accept", "application/json,application/zip,.json,.zip");
    expect(input.closest("label")).toHaveClass(
      "focus-within:outline-2",
      "focus-within:outline-accent-solid",
    );
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Package loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => expect(actions.transferPackageAction).toHaveBeenCalledOnce());
    expect(actions.transferPackageAction).toHaveBeenCalledWith({
      content,
      filename: "workspace.zip",
      projectId,
      token: "mig_valid_token_value_123",
    });
  });

  it("rejects an uploaded legacy JSON package before transfer", async () => {
    const content = packageContent("legacy manifest", 2);
    const bytes = new TextEncoder().encode(content);
    const file = new File([bytes], "legacy-workspace.json", { type: "application/json" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer,
    });
    const actions = renderSelectedTransfer();

    fireEvent.change(screen.getByLabelText("Upload JSON or ZIP"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("Package must use the strict v5 transfer format."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(actions.transferPackageAction).not.toHaveBeenCalled();
  });

  it("does not enable transfer for a truncated zip", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    const file = new File([bytes], "truncated.zip", { type: "application/zip" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => Uint8Array.from(bytes).buffer,
    });
    const actions = renderSelectedTransfer();

    fireEvent.change(screen.getByLabelText("Upload JSON or ZIP"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("Archive is invalid or truncated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(actions.transferPackageAction).not.toHaveBeenCalled();
  });
});
