import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePreferences } from "./actions";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
  persistDateFormatPreference: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/queries/account", () => ({
  persistDateFormatPreference: mocks.persistDateFormatPreference,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));

describe("updatePreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.cookies.mockResolvedValue({ delete: mocks.deleteCookie, set: mocks.setCookie });
    mocks.persistDateFormatPreference.mockResolvedValue({
      changed: true,
      previousFormat: "auto",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });
  });

  it("persists date format on the user, audits the change, and keeps the other prefs in cookies", async () => {
    await expect(
      updatePreferences({
        dateFormat: "day_first",
        density: "comfortable",
        landing: "rank-tracker",
        language: "de",
        theme: "dark",
        timezone: "America/New_York",
      }),
    ).resolves.toEqual({
      dateFormat: "day_first",
      density: "comfortable",
      landing: "rank-tracker",
      theme: "dark",
    });

    expect(mocks.persistDateFormatPreference).toHaveBeenCalledWith("user_1", "day_first");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.date_format.update",
        after: { dateFormat: "day_first" },
        before: { dateFormat: "auto" },
        targetId: "usr_abcdefghijklmnopqrstuvwx",
        targetType: "user",
      }),
    );
    expect(mocks.setCookie.mock.calls.map(([name]) => name)).toEqual([
      "theme",
      "pref_density",
      "pref_landing",
    ]);
    expect(mocks.deleteCookie.mock.calls.map(([name]) => name)).toEqual([
      "pref_date_format",
      "pref_timezone",
      "pref_language",
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/account/preferences");
  });

  it("skips the user write and audit when date format is unchanged", async () => {
    mocks.persistDateFormatPreference.mockResolvedValue({
      changed: false,
      previousFormat: "auto",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });

    await updatePreferences({
      dateFormat: "auto",
      density: "standard",
      landing: "dashboard",
      theme: "system",
    });

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
