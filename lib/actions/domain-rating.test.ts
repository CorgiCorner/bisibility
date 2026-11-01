import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { setDomainRatingTracking } from "./domain-rating";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "p1", publicId: "prj_one" });
  mocks.read.mockResolvedValue({ domainRatingEnabled: true });
  mocks.transaction.mockImplementation((callback) =>
    callback({ project: { findUniqueOrThrow: mocks.read, update: mocks.update } }),
  );
});
describe("domain rating settings authorization", () => {
  it("authorizes provider management, saves false and audits without deleting history", async () => {
    expect(await setDomainRatingTracking({ projectId: "prj_one", enabled: false })).toEqual({
      ok: true,
    });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "manage", "prj_one", {
      type: "provider_connection",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { domainRatingEnabled: false },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { enabled: true },
        after: { enabled: false },
        targetId: "prj_one",
      }),
      expect.anything(),
    );
  });
  it("denies viewers and other project users before writing", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(
      setDomainRatingTracking({ projectId: "prj_other", enabled: false }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects string booleans", async () => {
    await expect(
      setDomainRatingTracking({ projectId: "prj_one", enabled: "false" }),
    ).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
