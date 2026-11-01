import { makePublicId } from "@/lib/db/public-id";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), find: vi.fn(), check: vi.fn(), page: vi.fn() }));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "viewer" }),
  requireProjectScope: mocks.scope,
  revalidateProviderViews: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findFirstOrThrow: mocks.find } },
}));
vi.mock("@/lib/integrations/provider-recovery/check-account", () => ({
  checkRecoveryAccount: mocks.check,
}));
vi.mock("@/lib/integrations/provider-recovery/not-sent-checks", () => ({
  readNotSentChecks: mocks.page,
}));

import { checkProviderRecoveryAccount, loadProviderAffectedChecks } from "./provider-recovery";

const projectId = makePublicId("prj"),
  connectionId = makePublicId("conn");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockReset();
  mocks.find.mockReset();
});
it("requires manage permission before any account probe or write", async () => {
  mocks.scope.mockRejectedValue(new Error("Forbidden"));
  await expect(checkProviderRecoveryAccount({ projectId, connectionId })).rejects.toThrow(
    "Forbidden",
  );
  expect(mocks.scope).toHaveBeenCalledWith({ id: "viewer" }, "manage", projectId, {
    type: "provider_connection",
  });
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.find).not.toHaveBeenCalled();
});
it("a viewer can read only a connection belonging to the authorized project", async () => {
  mocks.scope.mockResolvedValue({ id: "authorized-project", publicId: projectId });
  mocks.find.mockRejectedValue(new Error("Not found"));
  await expect(
    loadProviderAffectedChecks({
      projectId,
      connectionId,
      cursor: null,
      until: "2026-10-29T12:00:00.000Z",
    }),
  ).rejects.toThrow("Not found");
  expect(mocks.find).toHaveBeenCalledWith({
    where: {
      publicId: connectionId,
      projectId: "authorized-project",
      provider: { in: ["dataforseo", "serpapi"] },
      credentialSource: "own",
    },
    select: { id: true },
  });
  expect(mocks.page).not.toHaveBeenCalled();
  expect(mocks.scope).toHaveBeenCalledWith({ id: "viewer" }, "read", projectId, {
    type: "provider_connection",
  });
});

it("allows a manager to check either supported own-key provider", async () => {
  mocks.scope.mockResolvedValue({ id: "authorized-project", publicId: projectId });
  mocks.find.mockResolvedValue({ id: "connection" });
  mocks.check.mockResolvedValue({ accountState: "unknown", view: null });
  await checkProviderRecoveryAccount({ projectId, connectionId });
  expect(mocks.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        provider: { in: ["dataforseo", "serpapi"] },
        credentialSource: "own",
      }),
    }),
  );
});
