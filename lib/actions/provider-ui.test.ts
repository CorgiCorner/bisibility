import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "verified-user", memberships: [] },
  getActionActor: vi.fn(),
  requireProjectScope: vi.fn(),
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/provider-ui/service", () => ({ providerUiService: mocks }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));

import {
  executeProviderUiAction,
  getProviderUiBindingAction,
  readProviderUiAction,
  reconcileProviderUiAction,
} from "./provider-ui";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActionActor.mockResolvedValue(mocks.actor);
  mocks.requireProjectScope.mockResolvedValue({ id: "internal-project" });
});
describe("provider UI action authorization", () => {
  it("derives a read binding from the verified actor, allowing readonly project access", async () => {
    mocks.binding.mockResolvedValue({ scopeKey: "trusted" });
    expect(await getProviderUiBindingAction("project-public")).toEqual({ scopeKey: "trusted" });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      mocks.actor,
      "read",
      "project-public",
      { type: "provider_connection" },
      { allowReadOnly: true },
    );
    expect(mocks.binding).toHaveBeenCalledWith({
      actor: mocks.actor,
      projectPublicId: "project-public",
    });
  });
  it("reconciliation needs current read access; execute needs manage access", async () => {
    const command = { commandId: "original-command", kind: "rates" };
    await executeProviderUiAction("project-public", command);
    expect(mocks.requireProjectScope).toHaveBeenLastCalledWith(
      mocks.actor,
      "manage",
      "project-public",
      { type: "provider_connection" },
      { allowReadOnly: true },
    );
    await reconcileProviderUiAction("project-public", command);
    expect(mocks.requireProjectScope).toHaveBeenLastCalledWith(
      mocks.actor,
      "read",
      "project-public",
      { type: "provider_connection" },
      { allowReadOnly: true },
    );
    expect(mocks.reconcile).toHaveBeenCalledWith(
      { actor: mocks.actor, projectPublicId: "project-public" },
      command,
    );
  });
  it("authentication failure invokes no provider management service", async () => {
    mocks.getActionActor.mockRejectedValue(new AuthorizationError("unauthenticated"));
    expect(await getProviderUiBindingAction("p")).toBeNull();
    expect(await readProviderUiAction("p", { kind: "connections" })).toEqual({
      outcome: "forbidden",
    });
    expect(await executeProviderUiAction("p", { commandId: "original-command" })).toEqual({
      outcome: "forbidden",
      commandId: "original-command",
    });
    expect(await reconcileProviderUiAction("p", { commandId: "original-command" })).toEqual({
      outcome: "forbidden",
      commandId: "original-command",
    });
    for (const call of [mocks.binding, mocks.read, mocks.execute, mocks.reconcile])
      expect(call).not.toHaveBeenCalled();
  });
});
