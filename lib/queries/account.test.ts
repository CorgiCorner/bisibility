import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccount, getPreferences } from "./account";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  prisma: {
    account: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("account queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(dateFromFrozenNow({ hours: 13 }));
    mocks.requireSession.mockResolvedValue({
      session: { id: "session_current" },
      user: { email: "fallback@example.com", id: "user-ABC_1234567890", name: "Fallback" },
    });
    mocks.prisma.account.findMany.mockResolvedValue([
      { password: null, providerId: "github" },
      { password: "stored-password-hash", providerId: "credential" },
    ]);
    mocks.prisma.user.findUnique.mockResolvedValue({
      email: "person@example.com",
      emailVerified: true,
      hasPasswordCredential: true,
      image: "avatar.png",
      name: "Person",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
      twoFactorEnabled: true,
    });
    mocks.prisma.session.findMany.mockResolvedValue([
      {
        id: "session_current",
        ipAddress: " 127.0.0.1 ",
        publicId: "sid_abcdefghijklmnopqrstuvwx",
        updatedAt: dateFromFrozenNow({ hours: 12, minutes: 59, seconds: 45 }),
        userAgent: "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537",
      },
      {
        id: "session_hour",
        ipAddress: "",
        publicId: "sid_bbcdefghijklmnopqrstuvwx",
        updatedAt: dateFromFrozenNow({ hours: 11, minutes: 30 }),
        userAgent: "Firefox/120 Windows",
      },
      {
        id: "session_day",
        ipAddress: null,
        publicId: "sid_cccdefghijklmnopqrstuvwx",
        updatedAt: new Date("2026-07-09T12:00:00.000Z"),
        userAgent: null,
      },
    ]);
  });

  it("builds the account view with provider and session labels", async () => {
    const account = await getAccount();

    expect(account).toMatchObject({
      email: "person@example.com",
      emailVerified: true,
      name: "Person",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
      twoFactorEnabled: true,
    });
    expect(account.connectedAccounts).toEqual([
      { connected: true, detail: "Connected to GitHub", provider: "github" },
      {
        connected: false,
        detail: "Not connected. Sign-in is by email code today.",
        provider: "google",
      },
    ]);
    expect(account.sessions).toEqual([
      expect.objectContaining({
        createdLabel: "active just now",
        current: true,
        device: "Chrome on macOS",
        location: "127.0.0.1",
      }),
      expect.objectContaining({
        createdLabel: "active 2h ago",
        device: "Firefox on Windows",
        location: "Unknown location",
      }),
      expect.objectContaining({
        createdLabel: "active 2d ago",
        device: "Unknown device",
      }),
    ]);
  });

  it("fails closed when the user row with its public ID is absent", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.account.findMany.mockResolvedValue([]);
    mocks.prisma.session.findMany.mockResolvedValue([]);

    await expect(getAccount()).rejects.toThrow("Public ID migration is incomplete.");
  });

  it("parses the four browser preferences and ignores stale timezone and language cookies", async () => {
    const values: Record<string, string> = {
      pref_density: "compact",
      pref_language: "de",
      pref_timezone: "America/New_York",
      theme: "dark",
    };
    mocks.cookies.mockResolvedValue({ get: vi.fn((key: string) => ({ value: values[key] })) });

    await expect(getPreferences()).resolves.toEqual({
      dateFormat: "iso",
      density: "compact",
      landing: "dashboard",
      theme: "dark",
    });
  });
});
