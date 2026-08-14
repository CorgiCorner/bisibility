import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePreferences } from "./actions";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));

describe("updatePreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.cookies.mockResolvedValue({ delete: mocks.deleteCookie, set: mocks.setCookie });
  });

  it("writes only the four visible preferences and ignores stale removed fields", async () => {
    await expect(
      updatePreferences({
        dateFormat: "long",
        density: "comfortable",
        landing: "keywords",
        language: "de",
        theme: "dark",
        timezone: "America/New_York",
      }),
    ).resolves.toEqual({
      dateFormat: "long",
      density: "comfortable",
      landing: "keywords",
      theme: "dark",
    });

    expect(mocks.setCookie.mock.calls.map(([name]) => name)).toEqual([
      "theme",
      "pref_date_format",
      "pref_density",
      "pref_landing",
    ]);
    expect(mocks.deleteCookie.mock.calls.map(([name]) => name)).toEqual([
      "pref_timezone",
      "pref_language",
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/account/preferences");
  });
});
