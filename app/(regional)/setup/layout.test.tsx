import { OtpInput } from "@/components/auth/OtpInput";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import authMessages from "@/messages/core/en/auth.json";
import setupMessages from "@/messages/core/en/setup.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));

import SetupLocaleLayout from "./layout";

describe("setup locale boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue(
      mergeMessageCatalogs(sharedMessages, authMessages, setupMessages),
    );
  });

  it("provides the auth and setup dependencies used by SetupWizard without broadening the regional root", async () => {
    const tree = await SetupLocaleLayout({
      children: <OtpInput onChange={vi.fn()} value={["", "", "", "", "", ""]} />,
    });

    expect(renderToStaticMarkup(tree)).toContain('aria-label="Code"');
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "auth",
      "setup",
      "instanceAdmin",
      "account",
    ]);
  });
});
