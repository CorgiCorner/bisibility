import { renderWithCloudImportMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudImport } from "./CloudImport";
import type { ActiveMigrationToken, CloudImportJobData, IssuedMigrationToken } from "./cloud-token";

// Keep the real import component and polling hook; only replace presentation controls.
vi.mock("./MigrationTokenCard", () => ({
  MigrationTokenCard: (props: {
    disabled: boolean;
    onGenerate: () => void;
    onRegenerate: () => void;
    onRevoke: () => void;
  }) => (
    <div>
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
vi.mock("./TransferPanel", () => ({ TransferPanel: () => null }));

const initialJob: CloudImportJobData = {
  counts: null,
  createdAt: null,
  error: null,
  finishedAt: null,
  id: "imp_abcdefghijklmnopqrstuvwx",
  progress: 0,
  startedAt: null,
  state: "idle",
};
const activeToken: ActiveMigrationToken = {
  createdAt: "2026-07-20T12:00:00.000Z",
  createdBy: { email: "owner@example.com", name: "Owner" },
  expiresAt: "2026-07-20T13:00:00.000Z",
  id: "ferry_abcdefghijklmnopqrstuvwx",
  scope: "full",
  singleUse: true,
};
const issuedToken: IssuedMigrationToken = {
  ...activeToken,
  id: "ferry_bbcdefghijklmnopqrstuvwx",
  importJob: initialJob,
  token: "migration_fixture",
};

async function renderExhaustedImport() {
  const actions = {
    mintMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    pollJobAction: vi.fn().mockRejectedValue(new TypeError("Load failed")),
    regenerateMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: issuedToken })),
    revokeMigrationTokenAction: vi.fn(async () => ({ ok: true as const, value: {} })),
  };
  render(
    <CloudImport
      activeToken={activeToken}
      canManage
      importJob={initialJob}
      projectId="prj_abcdefghijklmnopqrstuvwx"
      workspaceName="Example project"
      {...actions}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(actions.pollJobAction).toHaveBeenCalledTimes(3);
  expect(screen.getByText("The action could not be completed.")).toBeVisible();
  return actions;
}

describe("CloudImport polling lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("removes an exhausted polling error when the idle transfer token is revoked", async () => {
    const actions = await renderExhaustedImport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.queryByText("The action could not be completed.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(actions.pollJobAction).toHaveBeenCalledTimes(3);
    expect(actions.revokeMigrationTokenAction).toHaveBeenCalledOnce();
    expect(actions.mintMigrationTokenAction).not.toHaveBeenCalled();
    expect(actions.regenerateMigrationTokenAction).not.toHaveBeenCalled();
  });

  it.each(["Generate", "Regenerate"])(
    "restarts exhausted polling after %s even when the idle job is unchanged",
    async (action) => {
      const actions = await renderExhaustedImport();
      actions.pollJobAction.mockResolvedValue({ ...initialJob, state: "receiving" });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: action }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(actions.pollJobAction).toHaveBeenCalledTimes(4);
      expect(screen.queryByText("The action could not be completed.")).not.toBeInTheDocument();
      expect(actions.mintMigrationTokenAction).toHaveBeenCalledTimes(action === "Generate" ? 1 : 0);
      expect(actions.regenerateMigrationTokenAction).toHaveBeenCalledTimes(
        action === "Regenerate" ? 1 : 0,
      );
      expect(actions.revokeMigrationTokenAction).not.toHaveBeenCalled();
    },
  );
});
