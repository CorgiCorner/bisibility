import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  marketing: vi.fn(),
  achievement: vi.fn(),
  notification: vi.fn(),
}));
vi.mock("@/lib/email/marketing-unsubscribe", () => ({
  unsubscribeFromMarketingEmails: mocks.marketing,
}));
vi.mock("@/lib/achievements/unsubscribe", () => ({
  unsubscribeAchievementEmail: mocks.achievement,
}));
vi.mock("@/lib/email/notification-unsubscribe", () => ({
  unsubscribeNotificationEmail: mocks.notification,
}));

import { GET, POST } from "./route";

const url = (stream = "marketing", token = "opaque") =>
  `https://example.com/api/email/unsubscribe/one-click?stream=${stream}&token=${token}`;
const request = (stream = "marketing", token = "opaque", body = "List-Unsubscribe=One-Click") =>
  new Request(url(stream, token), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

describe("one-click unsubscribe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.marketing.mockResolvedValue(true);
    mocks.achievement.mockResolvedValue(true);
    mocks.notification.mockResolvedValue(true);
  });
  it.each(["marketing", "achievement"] as const)(
    "unsubscribes only %s, idempotently",
    async (stream) => {
      expect((await POST(request(stream))).status).toBe(200);
      expect((await POST(request(stream))).status).toBe(200);
      expect(mocks[stream]).toHaveBeenCalledTimes(2);
      expect(mocks[stream === "marketing" ? "achievement" : "marketing"]).not.toHaveBeenCalled();
    },
  );
  it("unsubscribes project notification preferences", async () => {
    expect((await POST(request("notification"))).status).toBe(200);
    expect((await POST(request("notification"))).status).toBe(200);
    expect(mocks.notification).toHaveBeenCalledTimes(2);
    expect(mocks.notification).toHaveBeenCalledWith("opaque");
    expect(GET(new Request(url("notification"))).headers.get("location")).toContain(
      "/email/unsubscribe/notifications?token=opaque",
    );
    expect(mocks.notification).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid tokens and malformed provider requests", async () => {
    mocks.marketing.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(400);
    mocks.marketing.mockClear();
    mocks.marketing.mockResolvedValue(true);
    expect((await POST(request("marketing", "opaque", "wrong=body"))).status).toBe(400);
    expect((await POST(request("unknown"))).status).toBe(400);
    expect(
      (
        await POST(
          request("marketing", "opaque", "List-Unsubscribe=One-Click&List-Unsubscribe=One-Click"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request(url(), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "List-Unsubscribe=One-Click",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it.each(["marketing", "achievement"] as const)(
    "GET redirects %s without changing preferences",
    async (stream) => {
      const response = GET(new Request(url(stream)));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain(
        stream === "marketing" ? "/email/unsubscribe?" : "/activity/unsubscribe?",
      );
      expect(mocks.marketing).not.toHaveBeenCalled();
      expect(mocks.achievement).not.toHaveBeenCalled();
    },
  );
});

describe("one-click form contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.marketing.mockResolvedValue(true);
    mocks.achievement.mockResolvedValue(true);
    mocks.notification.mockResolvedValue(true);
  });
  it.each(["marketing", "achievement", "notification"] as const)(
    "accepts multipart for %s",
    async (stream) => {
      const form = new FormData();
      form.append("List-Unsubscribe", "One-Click");
      expect((await POST(new Request(url(stream), { method: "POST", body: form }))).status).toBe(
        200,
      );
      expect(mocks[stream]).toHaveBeenCalledWith("opaque");
    },
  );
  it.each(["urlencoded", "multipart"] as const)("rejects invalid %s forms", async (encoding) => {
    for (const [values, expected] of [
      [["One-Click", "One-Click"], 400],
      [["wrong"], 400],
      [["One-Click", "x".repeat(5000)], 413],
    ] as const) {
      const form = new FormData();
      for (const value of values) form.append("List-Unsubscribe", value);
      const req =
        encoding === "multipart"
          ? new Request(url(), { method: "POST", body: form })
          : new Request(url(), {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams([...form.entries()] as [string, string][]).toString(),
            });
      expect((await POST(req)).status).toBe(expected);
    }
    expect(mocks.marketing).not.toHaveBeenCalled();
  });
});

it("rejects malformed multipart and file-valued fields before dispatch", async () => {
  const malformed = new Request(url(), {
    method: "POST",
    headers: { "content-type": "multipart/form-data" },
    body: "List-Unsubscribe=One-Click",
  });
  expect((await POST(malformed)).status).toBe(400);
  const form = new FormData();
  form.append("List-Unsubscribe", new Blob(["One-Click"]), "value.txt");
  expect((await POST(new Request(url(), { method: "POST", body: form }))).status).toBe(400);
  expect(mocks.marketing).not.toHaveBeenCalled();
});
