import { hashApiKey } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueApiKey, regenerateApiKey } from "./apiKey";

const KEY_OLD = "key_abcdefghijklmnopqrstuvwx";
const KEY_NEW = "key_bbcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    apiKey: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((operations) => Promise.all(operations));

  return {
    authorize: vi.fn(() => ({ actorId: "user_1", projectId: "project_1", role: "admin" })),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("API key actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an issued API key once and stores its selected policy", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.apiKey.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: data.expiresAt,
        id: "key_1",
        name: data.name,
        prefix: data.prefix,
        publicId: KEY_NEW,
      });
    });

    const result = await issueApiKey({
      expiresInDays: 90,
      name: "Automation",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      scope: "write",
    });

    expect(result.raw).toMatch(/^bsb_key_live_/);
    expect(stored?.hashedKey).toBe(hashApiKey(result.raw));
    expect(stored?.hashedKey).not.toContain(result.raw);
    expect(stored?.scopes).toEqual(["read", "write"]);
    expect(stored?.expiresAt).toEqual(new Date("2026-10-24T12:00:00.000Z"));
    expect(result).toMatchObject({ expiresInDays: 90, scope: "write" });
    expect(stored).not.toHaveProperty("raw");
  });

  it.each([
    [30, "2026-08-25T12:00:00.000Z"],
    [90, "2026-10-24T12:00:00.000Z"],
    [365, "2027-07-26T12:00:00.000Z"],
    [null, null],
  ] as const)("restarts the inherited %s-day policy when rolling", async (days, expected) => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const expiresAt =
      days === null ? null : new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      createdAt,
      expiresAt,
      id: "key_old",
      name: "Production",
      revokedAt: null,
      scopes: ["read"],
      publicId: KEY_OLD,
    });
    mocks.prisma.apiKey.update.mockResolvedValue({
      id: "key_old",
      publicId: KEY_OLD,
      revokedAt: new Date(),
    });
    mocks.prisma.apiKey.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date(),
        expiresAt: data.expiresAt,
        id: "key_new",
        name: data.name,
        prefix: data.prefix,
        publicId: KEY_NEW,
      });
    });

    const result = await regenerateApiKey({
      apiKeyId: KEY_OLD,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(stored?.expiresAt).toEqual(expected ? new Date(expected) : null);
    expect(result).toMatchObject({ expiresInDays: days, scope: "read" });
  });

  it.each([
    [
      "staged-expired 30-day key",
      new Date("2026-06-26T12:00:00.000Z"),
      new Date("2026-07-25T12:00:00.000Z"),
      30,
    ],
    [
      "non-offered 45-day window",
      new Date("2026-07-26T12:00:00.000Z"),
      new Date("2026-09-09T12:00:00.000Z"),
      30,
    ],
  ])(
    "restarts the nearest finite policy for a %s",
    async (_, createdAt, expiresAt, expectedDays) => {
      let stored: Record<string, unknown> | undefined;
      mocks.prisma.apiKey.findFirst.mockResolvedValue({
        createdAt,
        expiresAt,
        id: "key_old",
        name: "Production",
        revokedAt: null,
        scopes: ["read"],
        publicId: KEY_OLD,
      });
      mocks.prisma.apiKey.update.mockResolvedValue({
        id: "key_old",
        publicId: KEY_OLD,
        revokedAt: new Date(),
      });
      mocks.prisma.apiKey.create.mockImplementation(({ data }) => {
        stored = data;
        return Promise.resolve({
          createdAt: new Date(),
          expiresAt: data.expiresAt,
          id: "key_new",
          name: data.name,
          prefix: data.prefix,
          publicId: KEY_NEW,
        });
      });

      const result = await regenerateApiKey({
        apiKeyId: KEY_OLD,
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      });

      expect(stored?.expiresAt).toEqual(new Date("2026-08-25T12:00:00.000Z"));
      expect(result).toMatchObject({ expiresInDays: expectedDays, scope: "read" });
    },
  );

  it("revokes the old key and returns a replacement secret once", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      id: "key_old",
      name: "Production",
      revokedAt: null,
      scopes: ["read", "write"],
      publicId: KEY_OLD,
    });
    mocks.prisma.apiKey.update.mockResolvedValue({
      id: "key_old",
      publicId: KEY_OLD,
      revokedAt: new Date(),
    });
    mocks.prisma.apiKey.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "key_new",
        name: data.name,
        prefix: data.prefix,
        publicId: KEY_NEW,
      });
    });

    const result = await regenerateApiKey({
      apiKeyId: KEY_OLD,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { projectId: "project_1", publicId: KEY_OLD, revokedAt: null },
    });
    expect(mocks.prisma.apiKey.update).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: { id: "key_old" },
    });
    expect(result.raw).toMatch(/^bsb_key_live_/);
    expect(stored?.name).toBe("Production");
    expect(stored?.hashedKey).toBe(hashApiKey(result.raw));
    expect(stored?.scopes).toEqual(["read", "write"]);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key.regenerate", targetId: KEY_NEW }),
    );
  });
});
