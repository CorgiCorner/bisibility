import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSerpChain } from "./ProjectSerpChain";
import { binding, connection, legacy, mount, providers, reply } from "./project-chain-fixtures";

const host = vi.hoisted(() => ({
  readOnly: false,
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "chain-user" }, session: { id: "chain-session" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/components/shell/ProjectWriteModeProvider", () => ({
  useProjectWriteMode: () => ({
    readOnly: host.readOnly,
    writeMode: host.readOnly ? "migration_hold" : "active",
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  host.readOnly = false;
  host.binding.mockImplementation(async (id: string) => binding(id));
  host.read.mockResolvedValue(reply());
  host.execute.mockImplementation(async (_id, command) => ({
    commandId: command.commandId,
    outcome: "success",
    revision: "new",
  }));
});

describe("project SERP chain adoption", () => {
  it.each(["disconnect", "pause"])(
    "refreshes the fallback after a provider card %s without Reload",
    async (change) => {
      const projectId = `prj_chain_card_${change}`;
      const view = mount(projectId);
      await screen.findByRole("button", { name: "Pause: DataForSEO" });
      host.read.mockResolvedValue(
        reply(
          change === "disconnect"
            ? [connection(1)]
            : [{ ...connection(0), enabled: false }, connection(1)],
          "b".repeat(64),
        ),
      );
      const updated = providers.map((provider, index) =>
        index === 0
          ? {
              ...provider,
              status: change === "disconnect" ? ("ready" as const) : provider.status,
              enabled: false,
              connectionUpdatedAt: "2026-10-13T10:00:00.000Z",
            }
          : provider,
      );
      view.rerender(
        <ProjectSerpChain projectId={projectId} providers={updated} canManageProviders />,
      );
      await waitFor(() => expect(host.read).toHaveBeenCalledTimes(2));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Pause: DataForSEO" })).toBeNull();
        if (change === "disconnect") expect(screen.getAllByRole("listitem")).toHaveLength(1);
        else expect(screen.getByRole("button", { name: "Activate: DataForSEO" })).toBeVisible();
      });
      expect(host.execute).not.toHaveBeenCalled();
    },
  );
  it("fences writes while the project is in a migration hold", async () => {
    host.readOnly = true;
    host.binding.mockImplementation(async (id: string) => ({ ...binding(id), canManage: false }));
    mount("prj_chain_read_only");
    expect(await screen.findByRole("button", { name: "Move up: SerpApi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save fallback order" })).toBeDisabled();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("shows the host order and explanation while omitting disconnected providers", async () => {
    host.read.mockResolvedValue(
      reply([
        connection(1),
        connection(0),
        { ...connection(1), id: "conn_disconnected", status: { state: "unknown" } },
      ]),
    );
    mount("prj_chain_order_display");
    await screen.findByRole("button", { name: "Save fallback order" });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("DataForSEO");
    expect(rows[0]).toHaveTextContent("First provider");
    expect(rows[1]).toHaveTextContent("Fallback #2");
    expect(screen.getByText("2 active")).toBeVisible();
    expect(
      screen.getByText("If a provider fails or is rate-limited, the next active provider is used."),
    ).toBeVisible();
  });

  it("shows connect guidance when the authorized chain is empty", async () => {
    host.read.mockResolvedValue(reply([]));
    mount("prj_chain_empty");
    expect(
      await screen.findByText("Connect a SERP provider above to configure fallback order."),
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
  });

  it("keeps a reordered draft local and submits one complete versioned command on Save", async () => {
    mount("prj_chain_save");
    fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
    expect(legacy.updateProviderSettings).not.toHaveBeenCalled();
    expect(host.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save fallback order" }));
    await waitFor(() => expect(host.execute).toHaveBeenCalledOnce());
    expect(host.execute).toHaveBeenCalledWith("prj_chain_save", {
      kind: "project_chain",
      commandId: expect.any(String),
      expectedRevision: "a".repeat(64),
      entries: [
        { id: connection(1).id, enabled: true, expectedRevision: "2".repeat(64) },
        { id: connection(0).id, enabled: true, expectedRevision: "1".repeat(64) },
      ],
    });
    expect(await screen.findByText("Fallback order saved.")).toBeVisible();
  });

  it("uses shared toggle buttons and preserves paused ordering in the complete command", async () => {
    const paused = {
      ...connection(1),
      id: "conn_pausedabcdefghijklmnopqr",
      label: "Paused provider",
      enabled: false,
      priority: 101,
    };
    host.read.mockResolvedValue(reply([connection(0), connection(1), paused]));
    mount("prj_chain_pause");
    fireEvent.click(await screen.findByRole("button", { name: "Pause: DataForSEO" }));
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save fallback order" }));
    await waitFor(() => expect(host.execute).toHaveBeenCalledOnce());
    expect(host.execute.mock.calls[0][1].entries.map((row: { id: string }) => row.id)).toEqual([
      connection(1).id,
      connection(0).id,
      paused.id,
    ]);
  });

  it("keeps enabled providers ahead of paused rows when moving the fallback order", async () => {
    host.read.mockResolvedValue(reply([connection(0), { ...connection(1), enabled: false }]));
    mount("prj_chain_partition");
    expect(await screen.findByRole("button", { name: "Move up: SerpApi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move down: DataForSEO" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move up: SerpApi" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("DataForSEO");
    expect(screen.getByRole("button", { name: "Save fallback order" })).toBeDisabled();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "shows readers the order with page write access %s",
    async (pageCanManage) => {
      host.binding.mockImplementation(async (id: string) => ({ ...binding(id), canManage: false }));
      mount(`prj_chain_viewer_${pageCanManage}`, pageCanManage);
      expect(await screen.findByText("2 active")).toBeVisible();
      const rows = screen.getAllByRole("listitem");
      expect(rows[0]).toHaveTextContent("DataForSEO");
      expect(rows[0]).toHaveTextContent("First provider");
      expect(rows[1]).toHaveTextContent("SerpApi");
      expect(rows[1]).toHaveTextContent("Fallback #2");
      expect(
        screen.queryAllByRole("button", {
          name: /Move up|Move down|Pause|Save fallback order|Reload order/,
        }),
      ).toHaveLength(0);
      expect(host.execute).not.toHaveBeenCalled();
    },
  );

  it("shows one permission message and no editor when the read is forbidden", async () => {
    host.read.mockResolvedValue({ outcome: "forbidden" });
    mount("prj_chain_forbidden");
    expect(
      await screen.findAllByText("You do not have permission to change provider settings."),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
  });

  it("does not issue provider mutations on mount or explicit stored-order Reload", async () => {
    mount("prj_chain_reload");
    fireEvent.click(await screen.findByRole("button", { name: "Reload order" }));
    await waitFor(() => expect(host.read).toHaveBeenCalledTimes(2));
    expect(host.execute).not.toHaveBeenCalled();
    expect(legacy.testProviderConnection).not.toHaveBeenCalled();
    expect(legacy.updateProviderSettings).not.toHaveBeenCalled();
  });

  it("uses the same empty surface after Reload removes the final provider", async () => {
    const view = mount("prj_chain_last_removed");
    fireEvent.click(await screen.findByRole("button", { name: "Reload order" }));
    await waitFor(() => expect(host.read).toHaveBeenCalledTimes(2));
    host.read.mockResolvedValue(reply([], "b".repeat(64)));
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    expect(
      await screen.findByText("Connect a SERP provider above to configure fallback order."),
    ).toBeVisible();
    expect(view.container.querySelector("ol")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("keeps a failed Reload draft, then rebases explicitly to fresh row revisions", async () => {
    mount("prj_chain_rebase");
    fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
    host.read.mockRejectedValueOnce(new Error("untrusted diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    await screen.findByText("Provider settings could not be confirmed.");
    expect(screen.queryByText("untrusted diagnostic")).toBeNull();
    host.read.mockResolvedValue(
      reply([{ ...connection(0), revision: "3".repeat(64) }, connection(1)], "b".repeat(64)),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move up: SerpApi" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move up: SerpApi" }));
    fireEvent.click(screen.getByRole("button", { name: "Save fallback order" }));
    await waitFor(() => expect(host.execute).toHaveBeenCalledOnce());
    expect(host.execute.mock.calls[0][1]).toMatchObject({
      expectedRevision: "b".repeat(64),
      entries: [expect.anything(), { expectedRevision: "3".repeat(64) }],
    });
  });

  it("fences conflict until an explicit Reload", async () => {
    host.execute.mockImplementation(async (_id, command) => ({
      commandId: command.commandId,
      outcome: "conflict",
      reason: "revision_changed",
    }));
    mount("prj_chain_conflict");
    fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
    fireEvent.click(screen.getByRole("button", { name: "Save fallback order" }));
    await screen.findByText("These settings changed. Reload before editing again.");
    expect(screen.getByRole("button", { name: "Save fallback order" })).toBeDisabled();
    expect(host.execute).toHaveBeenCalledOnce();
  });
});
