import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  load: vi.fn(),
  mutate: vi.fn(),
  retained: vi.fn(),
  retain: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/provider-ui/state", () => ({
  loadProviderUiState: mocks.load,
  connectionRevision: vi.fn(),
}));
vi.mock("@/lib/provider-ui/mutate", () => ({ mutateProviderUi: mocks.mutate }));
vi.mock("@/lib/provider-ui/journal", () => ({
  retainedCommand: mocks.retained,
  retainCommand: mocks.retain,
}));
vi.mock("@/lib/provider-ui/read", () => ({ readProviderUi: vi.fn() }));
vi.mock("@/lib/provider-ui/state-rates", () => ({ loadProviderUiRates: vi.fn() }));

import { createProviderUiService } from "./service";

const scope = { actor: { id: "user_1" }, projectPublicId: "prj_a00000000000000000000000" };
const tx = {};
const binding = { canManage: true, scopeKey: "verified-project" };
const state = { binding, revision: "current", connections: [] };
const unavailable = () => Object.assign(new Error("private database detail"), { code: "P1001" });
const service = () => createProviderUiService({ $transaction: mocks.transaction } as never);
const command = {
  kind: "rates",
  commandId: "original-command-1",
  connectionId: "conn_a00000000000000000000000",
  expectedRevision: "a".repeat(64),
  rates: [{ rateId: "rank_check", price: "1.2345" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (run) => run(tx));
  mocks.load.mockResolvedValue(state);
  mocks.retained.mockResolvedValue(null);
  mocks.mutate.mockResolvedValue(null);
});

describe("provider binding read availability", () => {
  it("retries one unavailable snapshot without replaying a command", async () => {
    mocks.transaction.mockRejectedValueOnce(unavailable());
    await expect(service().binding(scope)).resolves.toBe(binding);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(
      tx,
      scope.actor,
      scope.projectPublicId,
      "read",
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
  });

  it("bounds a persistent outage and preserves the sanitized binding failure", async () => {
    mocks.transaction.mockRejectedValue(unavailable());
    await expect(service().binding(scope)).rejects.toThrow(
      "Provider settings could not be confirmed.",
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permission denial", async () => {
    mocks.transaction.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(service().binding(scope)).resolves.toBeNull();
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("does not retry an unknown invariant failure", async () => {
    mocks.transaction.mockRejectedValue(new Error("Provider authority is missing."));
    await expect(service().binding(scope)).rejects.toThrow(
      "Provider settings could not be confirmed.",
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("never retries command execution after an ambiguous persistence failure", async () => {
    mocks.retain.mockRejectedValue(unavailable());
    await expect(service().execute(scope, command)).resolves.toMatchObject({
      outcome: "unavailable",
      ambiguous: true,
      commandId: command.commandId,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.retain).toHaveBeenCalledOnce();
  });

  it("never retries command reconciliation when its state is unavailable", async () => {
    mocks.transaction.mockRejectedValue(unavailable());
    await expect(service().reconcile(scope, command)).resolves.toMatchObject({
      outcome: "unavailable",
      ambiguous: true,
      commandId: command.commandId,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
