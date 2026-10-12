import { AuthorizationError } from "@/lib/auth/authorize";
import { unstable_rethrow } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  project: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    project: { findFirst: mocks.project },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/provider-ui/state", () => ({
  loadProviderUiState: vi.fn(),
  connectionRevision: vi.fn(),
}));
vi.mock("@/lib/provider-ui/read", () => ({ readProviderUi: vi.fn() }));
vi.mock("@/lib/provider-ui/mutate", () => ({ mutateProviderUi: vi.fn() }));
vi.mock("@/lib/provider-ui/journal", () => ({
  retainCommand: vi.fn(),
  retainedCommand: vi.fn(),
}));

import {
  executeProviderUiAction,
  getProviderUiBindingAction,
  readProviderUiAction,
  reconcileProviderUiAction,
} from "./provider-ui";

const projectId = "prj_a00000000000000000000000";
const command = {
  kind: "rates",
  commandId: "d9817f75-20a4-47ac-a9de-72763d5bb364",
  connectionId: "conn_a00000000000000000000000",
  expectedRevision: "a".repeat(64),
  rates: [{ rateId: "rank_check", price: "6.7891" }],
};
const diagnostic = "private synthetic database endpoint must not escape";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner_1" } });
  mocks.user.mockResolvedValue({
    id: "owner_1",
    role: "owner",
    memberships: [{ projectId: "project_1", role: "owner" }],
  });
  mocks.project.mockResolvedValue({
    id: "project_1",
    publicId: projectId,
    ownerId: "owner_1",
    writeMode: "active",
  });
  mocks.audit.mockResolvedValue({ id: "denial-audit" });
});

describe("provider action infrastructure feedback through real scope and service", () => {
  it.each(["actor lookup", "project scope", "provider transaction"] as const)(
    "sanitizes %s failures as a rejected binding instead of missing permission",
    async (phase) => {
      const error = Object.assign(new Error(diagnostic), { code: "P1001" });
      const failingRead =
        phase === "actor lookup"
          ? mocks.user
          : phase === "project scope"
            ? mocks.project
            : mocks.transaction;
      failingRead.mockRejectedValue(error);

      const binding = getProviderUiBindingAction(projectId);
      await expect(binding).rejects.not.toThrow(diagnostic);
      await expect(binding).rejects.not.toBe(error);
      if (phase !== "provider transaction") expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("returns sanitized unavailable evidence when the real project scope database read fails", async () => {
    mocks.project.mockRejectedValue(Object.assign(new Error(diagnostic), { code: "P1001" }));
    const result = await readProviderUiAction(projectId, { kind: "connections" });
    expect(result).toEqual({ outcome: "unavailable", message: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain(diagnostic);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["execute", "reconcile"] as const)(
    "keeps the original %s command ambiguous when scope verification is unavailable",
    async (operation) => {
      mocks.project.mockRejectedValue(Object.assign(new Error(diagnostic), { code: "P1001" }));
      const result =
        operation === "execute"
          ? await executeProviderUiAction(projectId, command)
          : await reconcileProviderUiAction(projectId, command);
      expect(result).toEqual({
        outcome: "unavailable",
        commandId: command.commandId,
        ambiguous: true,
        message: expect.any(String),
      });
      expect(JSON.stringify(result)).not.toContain(diagnostic);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["unauthenticated", "non-member", "missing project", "service denial"] as const)(
    "keeps known %s refusals forbidden without exposing authorization details",
    async (reason) => {
      if (reason === "unauthenticated") {
        mocks.session.mockRejectedValue(new AuthorizationError("unauthenticated", diagnostic));
      } else if (reason === "non-member") {
        mocks.user.mockResolvedValue({ id: "owner_1", role: "owner", memberships: [] });
      } else if (reason === "missing project") {
        mocks.project.mockResolvedValue(null);
      } else {
        mocks.transaction.mockRejectedValue(new AuthorizationError("forbidden", diagnostic));
      }
      expect(await getProviderUiBindingAction(projectId)).toBeNull();
      expect(await readProviderUiAction(projectId, { kind: "connections" })).toEqual({
        outcome: "forbidden",
      });
      for (const result of [
        await executeProviderUiAction(projectId, command),
        await reconcileProviderUiAction(projectId, command),
      ]) {
        expect(result).toEqual({ outcome: "forbidden", commandId: command.commandId });
      }
      if (reason !== "service denial") expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("preserves framework authentication redirects instead of relabeling them", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    mocks.session.mockRejectedValue(redirect);
    unstable_rethrow.mockImplementation((error: unknown) => {
      if (error === redirect) throw error;
    });
    const actions = [
      () => getProviderUiBindingAction(projectId),
      () => readProviderUiAction(projectId, { kind: "connections" }),
      () => executeProviderUiAction(projectId, command),
      () => reconcileProviderUiAction(projectId, command),
    ];
    for (const action of actions) await expect(action()).rejects.toBe(redirect);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
