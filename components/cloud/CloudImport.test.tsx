import { isoFromFrozenNow } from "@/tests/clock";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudImport } from "./CloudImport";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";

const mocks = vi.hoisted(() => {
  const setJob = vi.fn();
  return {
    setJob,
    useCloudImportJobPoll: vi.fn(() => ({
      job: { id: "imp_abcdefghijklmnopqrstuvwx", progress: 0, state: "idle" },
      setJob,
    })),
  };
});

type TokenCardMockProps = {
  disabled: boolean;
  errorMessage: string | null;
  errorTitle: string;
  issuedToken: IssuedMigrationToken | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  status: string;
};
type NewTokenMockProps = { hasToken?: boolean; onNewToken: () => void };

vi.mock("./use-cloud-import-job", () => ({
  useCloudImportJobPoll: mocks.useCloudImportJobPoll,
}));
vi.mock("./MigrationTokenCard", () => ({
  MigrationTokenCard: (props: TokenCardMockProps) => (
    <div>
      <p>Token status {props.status}</p>
      <p>{props.errorTitle}</p>
      {props.errorMessage ? <p>{props.errorMessage}</p> : null}
      {props.issuedToken?.token ? <p>{props.issuedToken.token}</p> : null}
      <button disabled={props.disabled} onClick={props.onGenerate} type="button">
        Generate
      </button>
      <button disabled={props.disabled} onClick={props.onRegenerate} type="button">
        Regenerate
      </button>
      <button disabled={props.disabled} onClick={props.onRevoke} type="button">
        Revoke
      </button>
    </div>
  ),
}));
vi.mock("./TransferPanel", () => ({
  TransferPanel: (props: NewTokenMockProps) =>
    props.hasToken ? (
      <button onClick={props.onNewToken} type="button">
        New transfer token
      </button>
    ) : null,
}));

const activeTokenId = "ferry_abcdefghijklmnopqrstuvwx";
const issuedTokenId = "ferry_bbcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";

const activeToken: ActiveMigrationToken = {
  createdAt: isoFromFrozenNow({ hours: 13 }),
  createdBy: { email: "owner@example.com", name: "Owner" },
  expiresAt: isoFromFrozenNow({ hours: 14 }),
  id: activeTokenId,
  scope: "full",
  singleUse: true,
};

const issuedToken: IssuedMigrationToken = {
  createdAt: isoFromFrozenNow({ hours: 13 }),
  expiresAt: isoFromFrozenNow({ hours: 14 }),
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
    mintMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    pollJobAction: vi.fn(),
    regenerateMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    revokeMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: {} })),
  };
  const view = render(
    <CloudImport
      activeToken={null}
      canManage
      importJob={issuedToken.importJob}
      projectId={projectId}
      workspaceName="SEO Project"
      {...actions}
      {...overrides}
    />,
  );
  return { ...actions, view };
}

describe("CloudImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders migration state without token or transfer controls below admin", () => {
    renderImport({ activeToken, canManage: false });

    expect(screen.getByText(/Migration controls are available to project admins/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("hides transfer status until a token exists", () => {
    renderImport();

    expect(screen.queryByRole("button", { name: "New transfer token" })).not.toBeInTheDocument();
    expect(mocks.useCloudImportJobPoll).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });

  it("polls the import job while a token is waiting to receive", () => {
    renderImport({ activeToken });

    expect(mocks.useCloudImportJobPoll).toHaveBeenCalledWith(
      expect.objectContaining({ active: true }),
    );
  });

  it("mints and revokes a migration token", async () => {
    const actions = renderImport();
    expect(screen.getByText("Token status none")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Token status created")).toBeInTheDocument();
    expect(actions.mintMigrationTokenAction).toHaveBeenCalledWith({
      projectId,
      scope: "full",
    });
    expect(mocks.setJob).toHaveBeenCalledWith(issuedToken.importJob);

    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    await waitFor(() => expect(revokeButton).toBeEnabled());
    fireEvent.click(revokeButton);
    await waitFor(() =>
      expect(actions.revokeMigrationTokenAction).toHaveBeenCalledWith({
        projectId,
        tokenId: issuedTokenId,
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("stops masking the token once a fresh active token arrives from the server", async () => {
    const { view, ...actions } = renderImport({ activeToken });
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
        workspaceName="SEO Project"
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

  it("uses migration-only fallback copy when an action has no error message", async () => {
    const mintMigrationTokenAction = vi.fn(async () => {
      throw new Error("");
    });
    renderImport({ mintMigrationTokenAction });

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Migration action failed.")).toBeInTheDocument();
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
  });

  it("ignores revoke without a token and resets invalid mint input", () => {
    const actions = renderImport({ projectId: "" });
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(actions.revokeMigrationTokenAction).not.toHaveBeenCalled();
    expect(actions.mintMigrationTokenAction).not.toHaveBeenCalled();
  });
});
