import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  projectFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUnique: mocks.projectFindUnique } },
}));
vi.mock("./create", () => ({ createNotification: mocks.createNotification }));

import { notifyProviderNeedsReauth } from "./provider-events";

describe("provider reconnect notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindUnique.mockResolvedValue({
      ownerId: "owner_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.createNotification.mockResolvedValue({ id: "notification_1" });
  });

  it("notifies only the project owner with a stable reconnect destination", async () => {
    await notifyProviderNeedsReauth({
      connectionId: "connection_1",
      failedAt: new Date("2026-08-11T10:00:00.000Z"),
      projectId: "project_1",
      provider: "plausible",
    });

    expect(mocks.projectFindUnique).toHaveBeenCalledWith({
      select: { ownerId: true, publicId: true },
      where: { id: "project_1" },
    });
    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "owner_1",
      "project_1",
      "system",
      "Reconnect analytics provider",
      "PLAUSIBLE needs to be reconnected before scheduled analytics sync can resume.",
      expect.objectContaining({
        href: "/app/prj_a00000000000000000000000/integrations",
        provider: "plausible",
      }),
      "provider-needs-reauth:connection_1:2026-08-11T10:00:00.000Z",
    );
  });

  it("does nothing after the project is removed", async () => {
    mocks.projectFindUnique.mockResolvedValue(null);

    await notifyProviderNeedsReauth({
      connectionId: "connection_1",
      failedAt: new Date("2026-08-11T10:00:00.000Z"),
      projectId: "project_1",
      provider: "plausible",
    });

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});
