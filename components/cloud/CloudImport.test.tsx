import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudImport } from "./CloudImport";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  routerRefresh: vi.fn(),
  setJob: vi.fn(),
  writeText: vi.fn(),
}));

type TokenCardMockProps = {
  copied: boolean;
  disabled: boolean;
  errorMessage: string | null;
  errorTitle: string;
  issuedToken: IssuedMigrationToken | null;
  onCopy: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  status: string;
};
type TransferMockProps = {
  onStatusRefresh: () => void;
  onTransferEnd: () => Promise<void>;
  onTransferStart: () => Promise<boolean>;
  onTransferSuccess: () => void;
};
type NewTokenMockProps = { onNewToken: () => void };

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("./use-cloud-import-job", () => ({
  useCloudImportJobPoll: () => ({
    job: { id: "imp_abcdefghijklmnopqrstuvwx", progress: 0, state: "idle" },
    refresh: mocks.refresh,
    setJob: mocks.setJob,
  }),
}));
vi.mock("./MigrationTokenCard", () => ({
  MigrationTokenCard: (props: TokenCardMockProps) => (
    <div>
      <p>Token status {props.status}</p>
      <p>{props.errorTitle}</p>
      {props.errorMessage ? <p>{props.errorMessage}</p> : null}
      {props.issuedToken?.token ? <p>{props.issuedToken.token}</p> : null}
      {props.copied ? <p>Copied</p> : null}
      <button disabled={props.disabled} onClick={props.onGenerate} type="button">
        Generate
      </button>
      <button disabled={props.disabled} onClick={props.onRegenerate} type="button">
        Regenerate
      </button>
      <button disabled={props.disabled} onClick={props.onRevoke} type="button">
        Revoke
      </button>
      <button disabled={props.disabled} onClick={props.onCopy} type="button">
        Copy
      </button>
    </div>
  ),
}));
vi.mock("./PackageTransferPanel", () => ({
  PackageTransferPanel: (props: TransferMockProps) => (
    <div>
      <button onClick={props.onStatusRefresh} type="button">
        Refresh status
      </button>
      <button onClick={props.onTransferStart} type="button">
        Start transfer
      </button>
      <button onClick={props.onTransferEnd} type="button">
        End transfer
      </button>
      <button onClick={props.onTransferSuccess} type="button">
        Complete transfer
      </button>
    </div>
  ),
}));
vi.mock("./TransferPanel", () => ({
  TransferPanel: (props: NewTokenMockProps) => (
    <button onClick={props.onNewToken} type="button">
      New transfer token
    </button>
  ),
}));

const activeTokenId = "ferry_abcdefghijklmnopqrstuvwx";
const issuedTokenId = "ferry_bbcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";

const activeToken: ActiveMigrationToken = {
  createdAt: "2026-07-11T12:00:00.000Z",
  createdBy: { email: "owner@example.com", name: "Owner" },
  expiresAt: "2026-07-11T13:00:00.000Z",
  id: activeTokenId,
  scope: "full",
  singleUse: true,
};

const issuedToken: IssuedMigrationToken = {
  createdAt: "2026-07-11T12:00:00.000Z",
  expiresAt: "2026-07-11T13:00:00.000Z",
  id: issuedTokenId,
  importJob: {
    counts: null,
    createdAt: null,
    error: null,
    finishedAt: null,
    id: "imp_abcdefghijklmnopqrstuvwx",
    progress: 0,
    startedAt: null,
    state: "idle",
  },
  scope: "full",
  singleUse: true,
  token: "mig_new_secret",
};

function renderImport(overrides: Record<string, unknown> = {}) {
  const actions = {
    enableMigrationHoldAction: vi.fn(async () => ({})),
    exportPackageAction: vi.fn(),
    mintMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    pollJobAction: vi.fn(),
    regenerateMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    releaseMigrationHoldAction: vi.fn(async () => ({})),
    revokeMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: {} })),
  };
  render(
    <CloudImport
      activeToken={null}
      canManage
      importJob={issuedToken.importJob}
      projectId={projectId}
      workspaceName="SEO Workspace"
      {...actions}
      {...overrides}
    />,
  );
  return actions;
}

describe("CloudImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it("renders migration state without token or transfer controls below admin", () => {
    renderImport({ activeToken, canManage: false });

    expect(screen.getByText(/Migration controls are available to workspace admins/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start transfer" })).not.toBeInTheDocument();
  });

  it("mints, copies, refreshes, and revokes a migration token", async () => {
    const actions = renderImport();
    expect(screen.getByText("Token status none")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Token status created")).toBeInTheDocument();
    expect(actions.mintMigrationTokenAction).toHaveBeenCalledWith({
      projectId,
      scope: "full",
    });
    expect(mocks.setJob).toHaveBeenCalledWith(issuedToken.importJob);

    const copyButton = screen.getByRole("button", { name: "Copy" });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);
    expect(mocks.writeText).toHaveBeenCalledWith("mig_new_secret");
    expect(screen.getByText("Copied")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start transfer" }));
    await waitFor(() =>
      expect(actions.enableMigrationHoldAction).toHaveBeenCalledWith({ projectId }),
    );
    fireEvent.click(screen.getByRole("button", { name: "End transfer" }));
    await waitFor(() =>
      expect(actions.releaseMigrationHoldAction).toHaveBeenCalledWith({ projectId }),
    );

    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    await waitFor(() => expect(revokeButton).toBeEnabled());
    fireEvent.click(revokeButton);
    await waitFor(() =>
      expect(actions.revokeMigrationTokenAction).toHaveBeenCalledWith({
        projectId,
        tokenId: issuedTokenId,
      }),
    );
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(3);
  });

  it("stops masking the token once a fresh active token arrives from the server", async () => {
    const actions = {
      enableMigrationHoldAction: vi.fn(async () => ({})),
      exportPackageAction: vi.fn(),
      mintMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
      pollJobAction: vi.fn(),
      regenerateMigrationTokenAction: vi.fn(async () => ({
        ok: true as const,
        value: issuedToken,
      })),
      releaseMigrationHoldAction: vi.fn(async () => ({})),
      revokeMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: {} })),
    };
    const view = render(
      <CloudImport
        activeToken={activeToken}
        canManage
        importJob={issuedToken.importJob}
        projectId={projectId}
        workspaceName="SEO Workspace"
        {...actions}
      />,
    );
    expect(screen.getByText("Token status active")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(actions.revokeMigrationTokenAction).toHaveBeenCalled());
    // The just-revoked token is masked locally until the server catches up.
    expect(screen.getByText("Token status none")).toBeInTheDocument();

    // A new active token minted elsewhere arrives via router.refresh: the mask clears.
    view.rerender(
      <CloudImport
        activeToken={{ ...activeToken, id: "ferry_cbcdefghijklmnopqrstuvwx" }}
        canManage
        importJob={issuedToken.importJob}
        projectId={projectId}
        workspaceName="SEO Workspace"
        {...actions}
      />,
    );
    expect(screen.getByText("Token status active")).toBeInTheDocument();
  });

  it("regenerates from an active token and through the transfer panel", async () => {
    const actions = renderImport({ activeToken });
    expect(screen.getByText("Token status active")).toBeInTheDocument();

    const regenerateButton = screen.getByRole("button", { name: "Regenerate" });
    fireEvent.click(regenerateButton);
    await waitFor(() => expect(actions.regenerateMigrationTokenAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(regenerateButton).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "New transfer token" }));
    await waitFor(() => expect(actions.regenerateMigrationTokenAction).toHaveBeenCalledTimes(2));
  });

  it("clears the issued token immediately after a successful package transfer", async () => {
    renderImport({ activeToken });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("mig_new_secret")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Complete transfer" }));

    expect(await screen.findByText("Token status none")).toBeInTheDocument();
    expect(screen.queryByText("mig_new_secret")).not.toBeInTheDocument();
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("shows mint and revoke failures without losing the active token", async () => {
    const mint = vi.fn(async () => {
      throw new Error("Mint unavailable");
    });
    const revoke = vi.fn(async () => {
      throw new Error("Revoke unavailable");
    });
    renderImport({
      activeToken,
      mintMigrationTokenAction: mint,
      revokeMigrationTokenAction: revoke,
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Mint unavailable")).toBeInTheDocument();
    expect(screen.getByText("Token status error")).toBeInTheDocument();

    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    await waitFor(() => expect(revokeButton).toBeEnabled());
    fireEvent.click(revokeButton);
    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    expect(await screen.findByText("Revoke unavailable")).toBeInTheDocument();
    expect(screen.getByText("Couldn't revoke token")).toBeInTheDocument();
  });

  it("renders a handled read-only token failure without a rejected action", async () => {
    const mintMigrationTokenAction = vi.fn(async () => ({
      error: {
        code: "project_read_only" as const,
        message: "Project is read-only during migration.",
        status: 423 as const,
      },
      ok: false as const,
    }));
    renderImport({ mintMigrationTokenAction });

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Project is read-only during migration.")).toBeVisible();
    expect(mintMigrationTokenAction).toHaveBeenCalledOnce();
  });

  it("disables only token controls with migration guidance while read-only", () => {
    renderImport({ projectReadOnly: true });

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByText(/Migration token controls are unavailable/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start transfer" })).toBeEnabled();
  });

  it("reports a hold acquisition failure and does not enter transfer mode", async () => {
    const enableMigrationHoldAction = vi.fn(async () => {
      throw new Error("Migration hold unavailable. Try again.");
    });
    const actions = renderImport({ enableMigrationHoldAction });

    fireEvent.click(screen.getByRole("button", { name: "Start transfer" }));

    expect(await screen.findByText("Migration hold unavailable. Try again.")).toBeInTheDocument();
    expect(actions.releaseMigrationHoldAction).not.toHaveBeenCalled();
  });

  it("ignores copy and revoke without a token and resets invalid mint input", () => {
    const actions = renderImport({ projectId: "" });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(actions.revokeMigrationTokenAction).not.toHaveBeenCalled();
    expect(actions.mintMigrationTokenAction).not.toHaveBeenCalled();
  });
});
