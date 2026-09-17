import { emailPreferencesFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveAnonymousDocumentLocale: vi.fn(),
  verifyMarketingUnsubscribeToken: vi.fn(),
}));

vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveAnonymousDocumentLocale: mocks.resolveAnonymousDocumentLocale,
}));
vi.mock("@/lib/email/marketing-unsubscribe", () => ({
  verifyMarketingUnsubscribeToken: mocks.verifyMarketingUnsubscribeToken,
}));

import EmailUnsubscribePage, { generateMetadata } from "./page";

describe("EmailUnsubscribePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCoreMessages.mockResolvedValue(emailPreferencesFeatureTestMessages);
    mocks.resolveAnonymousDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.verifyMarketingUnsubscribeToken.mockReturnValue({ email: "owner@example.com" });
  });

  it("loads only anonymous email-preference messages for a valid unsubscribe request", async () => {
    const page = await EmailUnsubscribePage({
      searchParams: Promise.resolve({ token: "unsubscribe_example_token" }),
    });

    const markup = renderToStaticMarkup(page);

    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["emailPreferences"]);
    expect(mocks.verifyMarketingUnsubscribeToken).toHaveBeenCalledWith("unsubscribe_example_token");
    expect(markup).toContain("Stop founder check-ins?");
    expect(markup).toContain("Unsubscribe");
  });

  it("does not expose a control when the request token is invalid", async () => {
    mocks.verifyMarketingUnsubscribeToken.mockReturnValue(null);
    const page = await EmailUnsubscribePage({
      searchParams: Promise.resolve({ token: "invalid" }),
    });

    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("This unsubscribe link is invalid");
    expect(markup).not.toContain("Unsubscribe</button>");
  });

  it("passes an injected non-English accessible docs label to the real shared page", async () => {
    const messages = structuredClone(emailPreferencesFeatureTestMessages);
    messages.emailPreferences.page.docsLink = "Wiecej pomocy w dokumentacji";
    mocks.loadCoreMessages.mockResolvedValue(messages);
    mocks.resolveAnonymousDocumentLocale.mockResolvedValue({ locale: "pl", timeZone: "UTC" });

    const page = await EmailUnsubscribePage({
      searchParams: Promise.resolve({ status: "success" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain(">Wiecej pomocy w dokumentacji<");
    expect(markup).not.toContain(">Still stuck? Read the docs<");
  });

  it("generates noindex metadata from the anonymous request locale", async () => {
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { follow: false, index: false },
      title: "Email preferences",
    });
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["emailPreferences"]);
  });
});
