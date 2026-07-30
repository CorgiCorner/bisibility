import { beforeEach, describe, expect, it, vi } from "vitest";
import { markProviderNeedsReauth } from "./auth-state";

const mocks = vi.hoisted(() => ({
  notifyOps: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));

describe("markProviderNeedsReauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyOps.mockResolvedValue(undefined);
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
    expect(mocks.notifyOps).toHaveBeenCalledOnce();
  });
});
