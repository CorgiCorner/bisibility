import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => children,
}));

import AuthLayout from "./layout";

describe("auth locale boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({ auth: {}, shared: {} });
  });

  it("adds only the scoped auth payload beneath the regional document root", async () => {
    await expect(AuthLayout({ children: <div>Sign in</div> })).resolves.toBeTruthy();

    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "auth"]);
  });
});
