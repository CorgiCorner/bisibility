import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  membershipFindFirst: vi.fn(),
  membershipUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    membership: {
      findFirst: mocks.membershipFindFirst,
      update: mocks.membershipUpdate,
    },
  },
}));

import {
  isSetupAcknowledgedAt,
  loadSetupAcknowledgedAt,
  markSetupAcknowledged,
  SETUP_ACKNOWLEDGEMENT_COOKIE,
  serializeSetupAcknowledgements,
} from "./setup-acknowledgement";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const otherRef = "prj_bcdefghijklmnopqrstuvwxy";

describe("setup acknowledgement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.get.mockReturnValue(undefined);
  });

  it("treats a stored timestamp as acknowledged", () => {
    expect(isSetupAcknowledgedAt(new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
    expect(isSetupAcknowledgedAt(null)).toBe(false);
    expect(isSetupAcknowledgedAt(undefined)).toBe(false);
  });

  it("loads acknowledgement from the membership row", async () => {
    const acknowledgedAt = new Date("2026-09-01T00:00:00.000Z");
    mocks.membershipFindFirst.mockResolvedValue({ setupAcknowledgedAt: acknowledgedAt });

    await expect(loadSetupAcknowledgedAt("user-1", projectRef)).resolves.toEqual(acknowledgedAt);
    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      select: { setupAcknowledgedAt: true },
      where: { userId: "user-1", project: { publicId: projectRef } },
    });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it("backfills the membership row from a legacy cookie for this user", async () => {
    mocks.membershipFindFirst
      .mockResolvedValueOnce({ setupAcknowledgedAt: null })
      .mockResolvedValueOnce({ id: "membership-1", setupAcknowledgedAt: null })
      .mockResolvedValueOnce({ id: "membership-2", setupAcknowledgedAt: null })
      .mockResolvedValueOnce({
        setupAcknowledgedAt: new Date("2026-09-02T00:00:00.000Z"),
      });
    mocks.membershipUpdate.mockResolvedValue({});
    mocks.cookieStore.get.mockImplementation((name: string) =>
      name === SETUP_ACKNOWLEDGEMENT_COOKIE
        ? {
            value: serializeSetupAcknowledgements([
              { projectRef, userId: "user-1" },
              { projectRef: otherRef, userId: "user-1" },
              { projectRef, userId: "user-2" },
            ]),
          }
        : undefined,
    );

    await expect(loadSetupAcknowledgedAt("user-1", projectRef)).resolves.toEqual(
      new Date("2026-09-02T00:00:00.000Z"),
    );
    expect(mocks.membershipUpdate).toHaveBeenCalledTimes(2);
  });

  it("persists acknowledgement on the membership row", async () => {
    mocks.membershipFindFirst.mockResolvedValue({ id: "membership-1", setupAcknowledgedAt: null });
    mocks.membershipUpdate.mockResolvedValue({});

    await markSetupAcknowledged("user-1", projectRef);

    expect(mocks.membershipUpdate).toHaveBeenCalledWith({
      data: { setupAcknowledgedAt: expect.any(Date) },
      where: { id: "membership-1" },
    });
  });

  it("is idempotent when acknowledgement already exists", async () => {
    mocks.membershipFindFirst.mockResolvedValue({
      id: "membership-1",
      setupAcknowledgedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    await markSetupAcknowledged("user-1", projectRef);

    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it("isolates acknowledgement by project and user", async () => {
    mocks.membershipFindFirst.mockResolvedValue(null);
    await expect(markSetupAcknowledged("user-1", projectRef)).rejects.toThrow("Project not found.");
  });
});
