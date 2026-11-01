import messages from "@/messages/core/en/email-preferences.json";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: async () => messages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveAnonymousDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/lib/email/notification-unsubscribe", () => ({
  verifyNotificationUnsubscribeToken: mocks.verify,
}));

import Page from "./page";

beforeEach(() => vi.resetAllMocks());
it("renders a confirmation for a valid token without changing preferences", async () => {
  mocks.verify.mockReturnValue(true);
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ token: "opaque" }) }),
  );
  expect(html).toContain("Stop these project emails?");
  expect(html).toContain("Unsubscribe");
  expect(mocks.verify).toHaveBeenCalledWith("opaque");
});
it("does not offer an unsubscribe action for an invalid token", async () => {
  mocks.verify.mockReturnValue(false);
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ token: "bad" }) }),
  );
  expect(html).toContain("This unsubscribe link is invalid");
  expect(html).not.toContain("Unsubscribe</button>");
});
it("renders a success message", async () => {
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ status: "success" }) }),
  );
  expect(html).toContain("You are unsubscribed");
  expect(mocks.verify).not.toHaveBeenCalled();
});
