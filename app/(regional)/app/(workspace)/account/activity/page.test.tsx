import en from "@/messages/core/en/account.json";
import es from "@/messages/core/es-ES/account.json";
import ja from "@/messages/core/ja/account.json";
import pl from "@/messages/core/pl/account.json";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), session: vi.fn(), locale: "en" }));
vi.mock("@/components/account/AccountShell", () => ({
  AccountShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/achievements/AchievementsPanel", () => ({
  AchievementsPanel: () => <p>achievement-panel</p>,
}));
vi.mock("@/lib/achievements/read", () => ({ readAchievements: mocks.read }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({
    locale: mocks.locale,
    timeZone: "UTC",
    messages: { shared: {} },
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    throw new Error("MISSING_MESSAGE: the root request only provides shared");
  },
}));

import ActivityPage from "./page";

const catalogs = { en, "es-ES": es, ja, pl };
describe("activity server messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
  });
  for (const [locale, messages] of Object.entries(catalogs)) {
    it(`loads real ${locale} disabled copy independently of the root client provider`, async () => {
      mocks.locale = locale;
      mocks.read.mockResolvedValue(null);
      const html = renderToStaticMarkup(await ActivityPage());
      expect(html).toContain(messages.account.achievements.disabled);
      expect(html).not.toContain("account.achievements");
      expect(mocks.read).toHaveBeenCalledWith("user_1");
    });
    it(`loads real ${locale} error copy independently of the root client provider`, async () => {
      mocks.locale = locale;
      mocks.read.mockRejectedValue(new Error("read unavailable"));
      const html = renderToStaticMarkup(await ActivityPage());
      expect(html).toContain(messages.account.achievements.error);
      expect(html).toContain('role="status"');
    });
  }
  it("preserves authorization before reading activity", async () => {
    mocks.session.mockRejectedValue(new Error("authentication required"));
    await expect(ActivityPage()).rejects.toThrow("authentication required");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
