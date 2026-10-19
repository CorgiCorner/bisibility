import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  preference: vi.fn(),
  anonymous: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionReference: mocks.session }));
vi.mock("@/lib/queries/account", () => ({ getLocalePreferenceForUser: mocks.preference }));
vi.mock("@/i18n/request-locale.server", () => ({ getAnonymousLocalePreference: mocks.anonymous }));
vi.mock("@/i18n/catalog-loader.server", () => ({
  loadCoreMessages: async () => ({ shared: {} }),
}));

import { resolveRegionalDocumentLocale } from "./document-locale.server";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user_1" } });
  mocks.preference.mockResolvedValue({ locale: "fr" });
  mocks.anonymous.mockResolvedValue({ locale: "en" });
});

describe("regional document preference availability", () => {
  it("uses the persisted preference while the database is available", async () => {
    await expect(resolveRegionalDocumentLocale()).resolves.toMatchObject({ locale: "fr" });
    expect(mocks.anonymous).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error("Database unavailable"), { code: "P1001" }),
    new Error("timeout exceeded when trying to connect"),
  ])(
    "renders with anonymous display preference when the profile read is unavailable",
    async (error) => {
      mocks.preference.mockRejectedValue(error);
      await expect(resolveRegionalDocumentLocale()).resolves.toMatchObject({ locale: "en" });
      expect(mocks.preference).toHaveBeenCalledExactlyOnceWith("user_1");
      expect(mocks.anonymous).toHaveBeenCalledOnce();
    },
  );

  it("preserves an unknown profile failure instead of masking an invariant defect", async () => {
    const error = Object.assign(new Error("Schema mismatch"), { code: "P2021" });
    mocks.preference.mockRejectedValue(error);
    await expect(resolveRegionalDocumentLocale()).rejects.toBe(error);
    expect(mocks.anonymous).not.toHaveBeenCalled();
  });

  it("does not turn an unrecognized session failure into an anonymous preference", async () => {
    const error = new Error("Session signature invariant failed");
    mocks.session.mockRejectedValue(error);
    await expect(resolveRegionalDocumentLocale()).rejects.toBe(error);
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.anonymous).not.toHaveBeenCalled();
  });
});
