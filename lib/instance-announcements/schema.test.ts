import { describe, expect, it } from "vitest";
import { announcementContentSchema, isAnnouncementHref } from "./schema";

describe("announcement content", () => {
  it.each(["", "https://status.example.com/incident?id=1", "http://example.com", "/app/settings"])(
    "accepts an optional safe URL: %s",
    (url) => {
      expect(isAnnouncementHref(url)).toBe(true);
    },
  );
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "/\\example.com",
    "https://user:pass@example.com",
    "https://example.com\n",
    "https://example.com/\u0000",
    "https://example.com/\u001f",
    "https://example.com/\u007f",
    "not a url",
    "ftp://example.com",
  ])("rejects an unsafe URL: %s", (url) => {
    expect(isAnnouncementHref(url)).toBe(false);
  });
  it("trims content and rejects empty or oversized messages", () => {
    const content = { title: " Notice ", message: " Update ", href: "", linkLabel: "" };
    expect(announcementContentSchema().parse(content)).toEqual({
      ...content,
      title: "Notice",
      message: "Update",
    });
    expect(announcementContentSchema().safeParse({ ...content, message: " " }).success).toBe(false);
    expect(
      announcementContentSchema().safeParse({ ...content, title: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      announcementContentSchema().safeParse({ ...content, message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});
