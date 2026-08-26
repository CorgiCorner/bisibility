import { beforeEach, describe, expect, it, vi } from "vitest";
import { markProviderNeedsReauth } from "./auth-state";

const mocks = vi.hoisted(() => ({
  notifyOps: vi.fn(),
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    providerConnection: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  },
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));

describe("markProviderNeedsReauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyOps.mockResolvedValue(undefined);
    mocks.findUnique.mockResolvedValue({ id: "connection_1", status: "connected" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $queryRaw: mocks.queryRaw,
        providerConnection: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
      }),
    );
  });

  it("flips a connected provider and emits the transition event once", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const input = {
      connectionId: "connection_1",
      projectId: "project_1",
      provider: "gsc",
    };

    await expect(markProviderNeedsReauth(input)).resolves.toBe(true);
    await expect(markProviderNeedsReauth(input)).resolves.toBe(false);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { status: "needs_reauth" },
      where: { id: "connection_1", status: "connected" },
    });
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateMany.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.notifyOps).toHaveBeenCalledOnce();
  });

  it("ignores a superseded auth failure for a replacement connection", async () => {
    mocks.findUnique.mockResolvedValue({ id: "connection_replacement", status: "connected" });

    await expect(
      markProviderNeedsReauth({
        connectionId: "connection_old",
        projectId: "project_1",
        provider: "gsc",
      }),
    ).resolves.toBe(false);

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });

  it("can suppress the per-event ops error for user-actionable traffic failures", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      markProviderNeedsReauth({
        connectionId: "connection_1",
        notifyOps: false,
        projectId: "project_1",
        provider: "plausible",
      }),
    ).resolves.toBe(true);

    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });
});
