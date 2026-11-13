import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/achievements/sharing", () => ({ readPublicAchievement: mocks.read }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));

import SharedBadge, { generateMetadata } from "./page";

describe("public achievement badge", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders the 30-day placeholder and keeps the seven-day titles", async () => {
    mocks.read.mockResolvedValue({ kind: "thirty_days", earnedDay: "2026-12-29" });
    const metadata = await generateMetadata({ params: Promise.resolve({ token: "a".repeat(43) }) });
    expect(metadata.title).toBe("30 days of SEO · bisibility");
    const thirty = renderToStaticMarkup(
      await SharedBadge({ params: Promise.resolve({ token: "a".repeat(43) }) }),
    );
    expect(thirty).toContain("30 days of SEO");
    expect(thirty).toContain("2026-12-29");
    expect(thirty).toContain(">30<");
    mocks.read.mockResolvedValue({ kind: "presence", earnedDay: "2026-10-16" });
    const presence = renderToStaticMarkup(
      await SharedBadge({ params: Promise.resolve({ token: "b".repeat(43) }) }),
    );
    expect(presence).toContain("In a good rhythm");
    expect(presence).not.toContain(">30<");
    mocks.read.mockResolvedValue({ kind: "practice", earnedDay: "2026-10-16" });
    const practice = renderToStaticMarkup(
      await SharedBadge({ params: Promise.resolve({ token: "c".repeat(43) }) }),
    );
    expect(practice).toContain("From data to action");
  });
});
