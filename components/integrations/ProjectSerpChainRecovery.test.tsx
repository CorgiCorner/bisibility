import { focusManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { binding, mount, reply } from "./project-chain-fixtures";

const host = vi.hoisted(() => ({
  readOnly: false,
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: host.session,
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
  host.session.mockReturnValue({
    data: { user: { id: "chain-user" }, session: { id: "chain-session" } },
    isPending: false,
  });
  host.binding.mockImplementation(async (id: string) => binding(id));
  host.read.mockResolvedValue(reply());
});
async function save() {
  fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
  fireEvent.click(screen.getByRole("button", { name: "Save fallback order" }));
}

describe("project-chain recovery", () => {
  it.each([
    ["ambiguous", "project-revision", true, false],
    ["pending", "project-revision", true, false],
    ["ambiguous", "viewer:active", false, false],
    ["pending", "viewer:active", false, false],
    ["ambiguous", "admin:migration_hold", true, true],
    ["pending", "admin:migration_hold", true, true],
  ] as const)(
    "recovers %s after %s changes without replaying the write",
    async (phase, revision, canManage, readOnly) => {
      let finish!: (value: unknown) => void;
      host.execute.mockImplementation(() =>
        phase === "ambiguous"
          ? Promise.reject(new Error("lost acknowledgement"))
          : new Promise((resolve) => {
              finish = resolve;
            }),
      );
      host.reconcile.mockImplementation(async (_id, command) => ({
        commandId: command.commandId,
        outcome: "success",
        revision: "new",
      }));
      const projectId = `prj_chain_${phase}_${revision}`;
      const view = mount(projectId);
      await save();
      await waitFor(() => expect(host.execute).toHaveBeenCalledOnce());
      if (phase === "ambiguous") await screen.findByRole("button", { name: "Check save status" });
      const original = structuredClone(host.execute.mock.calls[0][1]);
      view.unmount();
      host.readOnly = readOnly;
      host.binding.mockImplementation(async (id: string) => ({
        ...binding(id),
        authRevision: revision,
        canManage: canManage && !readOnly,
      }));
      mount(projectId, canManage);
      await screen.findByRole("list", { name: "SERP fallback order" });
      if (canManage)
        expect(screen.getByRole("button", { name: "Save fallback order" })).toBeDisabled();
      else expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
      if (phase === "pending") {
        expect(screen.getByText("Saving order...")).toBeVisible();
        await act(async () => finish({ commandId: original.commandId, outcome: "unavailable" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: "Check save status" }));
      await screen.findByText("Fallback order saved.");
      expect(host.execute).toHaveBeenCalledOnce();
      expect(host.reconcile).toHaveBeenCalledExactlyOnceWith(projectId, original);
      if (canManage) {
        expect(screen.getByRole("button", { name: "Save fallback order" })).toBeDisabled();
        if (readOnly)
          expect(screen.getByRole("button", { name: "Move up: SerpApi" })).toBeDisabled();
      } else {
        expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Move up: SerpApi" })).toBeNull();
      }
    },
  );

  it("does not recover another principal's ambiguous command", async () => {
    host.execute.mockRejectedValue(new Error("lost acknowledgement"));
    const view = mount("prj_chain_other_principal");
    await save();
    await screen.findByRole("button", { name: "Check save status" });
    view.unmount();
    host.session.mockReturnValue({
      data: { user: { id: "other-user" }, session: { id: "other-session" } },
      isPending: false,
    });
    host.binding.mockImplementation(async (id: string) => ({
      ...binding(id),
      principalKey: "other-user",
      authRevision: "viewer:active",
      canManage: false,
    }));
    mount("prj_chain_other_principal", false);
    await screen.findByRole("list", { name: "SERP fallback order" });
    expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check save status" })).toBeNull();
    expect(host.reconcile).not.toHaveBeenCalled();
  });

  it("preserves a reordered draft across failed background reads and recovery", async () => {
    mount("prj_chain_background_draft");
    fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("SerpApi");
    host.read.mockRejectedValue(new Error("temporary read failure"));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("Provider settings could not be confirmed.");
    host.read.mockResolvedValue(reply());
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save fallback order" })).toBeEnabled(),
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("SerpApi");
    expect(host.execute).not.toHaveBeenCalled();
    focusManager.setFocused(undefined);
  });

  it("shows one visible forbidden message when a denied save is followed by a forbidden read", async () => {
    host.execute.mockImplementation(async (_id, command) => ({
      commandId: command.commandId,
      outcome: "forbidden",
    }));
    mount("prj_chain_denied_read_after_save");
    await save();
    await screen.findByText("You do not have permission to change provider settings.");
    host.read.mockResolvedValue({ outcome: "forbidden" });
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    await waitFor(() => expect(host.read).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getAllByText("You do not have permission to change provider settings."),
      ).toHaveLength(1),
    );
    expect(
      screen.getByText("You do not have permission to change provider settings."),
    ).toBeVisible();
    expect(screen.queryByText("Provider settings could not be confirmed.")).toBeNull();
  });

  it("fences the draft when access verification fails during Reload", async () => {
    mount("prj_chain_access_failure");
    fireEvent.click(await screen.findByRole("button", { name: "Move up: SerpApi" }));
    host.binding.mockRejectedValueOnce(new Error("untrusted access diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    await screen.findByText("Provider settings could not be confirmed.");
    expect(screen.queryByText("untrusted access diagnostic")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("reconciles the identical ambiguous command after remount without another write", async () => {
    host.execute.mockRejectedValue(new Error("lost acknowledgement"));
    host.reconcile.mockImplementation(async (_id, command) => ({
      commandId: command.commandId,
      outcome: "success",
      revision: "new",
    }));
    const view = mount("prj_chain_ambiguous");
    await save();
    await screen.findByRole("button", { name: "Check save status" });
    const original = structuredClone(host.execute.mock.calls[0][1]);
    view.unmount();
    mount("prj_chain_ambiguous");
    fireEvent.click(await screen.findByRole("button", { name: "Check save status" }));
    await screen.findByText("Fallback order saved.");
    expect(host.execute).toHaveBeenCalledOnce();
    expect(host.reconcile).toHaveBeenCalledWith("prj_chain_ambiguous", original);
  });

  it("retains a pending submission after remount and prevents another Save", async () => {
    let finish!: (value: unknown) => void;
    host.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount("prj_chain_pending");
    await save();
    await waitFor(() => expect(host.execute).toHaveBeenCalledOnce());
    view.unmount();
    mount("prj_chain_pending");
    expect(await screen.findByRole("button", { name: "Save fallback order" })).toBeDisabled();
    expect(screen.getByText("Saving order...")).toBeVisible();
    finish({
      commandId: host.execute.mock.calls[0][1].commandId,
      outcome: "success",
      revision: "new",
    });
    await screen.findByText("Fallback order saved.");
    expect(host.execute).toHaveBeenCalledOnce();
  });

  it("reconciles after remount even when the first evidence read fails", async () => {
    host.execute.mockRejectedValue(new Error("lost acknowledgement"));
    host.reconcile.mockImplementation(async (_id, command) => ({
      commandId: command.commandId,
      outcome: "success",
      revision: "new",
    }));
    const view = mount("prj_chain_ambiguous_failed_read");
    await save();
    await screen.findByRole("button", { name: "Check save status" });
    const original = structuredClone(host.execute.mock.calls[0][1]);
    view.unmount();
    host.read.mockRejectedValue(new Error("read unavailable"));
    mount("prj_chain_ambiguous_failed_read");
    fireEvent.click(await screen.findByRole("button", { name: "Check save status" }));
    await screen.findByText("Fallback order saved.");
    expect(host.execute).toHaveBeenCalledOnce();
    expect(host.reconcile).toHaveBeenCalledWith("prj_chain_ambiguous_failed_read", original);
  });

  it("reverifies a forbidden write before reloading the draft", async () => {
    host.execute.mockImplementation(async (_id, command) => ({
      commandId: command.commandId,
      outcome: "forbidden",
    }));
    mount("prj_chain_denied_write");
    await save();
    expect(
      await screen.findAllByText("You do not have permission to change provider settings."),
    ).toHaveLength(1);
    host.binding.mockImplementation(async (id: string) => ({
      ...binding(id),
      authRevision: "viewer:active",
      canManage: false,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Reload order" }));
    await waitFor(() => expect(host.binding.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save fallback order" })).toBeNull(),
    );
    expect(host.execute).toHaveBeenCalledOnce();
  });

  it("supports keyboard reorder in reduced motion without automatic persistence", async () => {
    const animate = vi.fn();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    try {
      mount("prj_chain_keyboard");
      const move = await screen.findByRole("button", { name: "Move up: SerpApi" });
      move.focus();
      await userEvent.keyboard("{Enter}");
      expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("SerpApi");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Move down: SerpApi" })).toHaveFocus(),
      );
      expect(screen.getByRole("button", { name: "Save fallback order" })).toBeEnabled();
      expect(animate).not.toHaveBeenCalled();
      expect(host.execute).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "animate", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
      vi.unstubAllGlobals();
    }
  });
});
