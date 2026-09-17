import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/lib/auth/first-run", () => ({ redirectToSetupIfFirstRun: vi.fn() }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

import { generateMetadata } from "./layout";

describe("the sign-in document title", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["pl", "Zaloguj się"],
    ["ja", "サインイン"],
    ["es-ES", "Iniciar sesión"],
    ["en", "Sign in"],
  ] as const)("follows the resolved request locale (%s)", async (locale, title) => {
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale, timeZone: "UTC" });

    const metadata = await generateMetadata();

    expect(metadata.title).toBe(title);
    expect(metadata.robots).toMatchObject({ follow: false, index: false });
  });

  it("keeps the description and share preview out of English for a Polish viewer", async () => {
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "pl", timeZone: "UTC" });

    const metadata = await generateMetadata();

    expect(metadata.description).not.toContain("one-time email code");
    expect(metadata.openGraph?.title).toBe("Zaloguj się do bisibility");
  });
});
