import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  image: vi.fn(),
  publicRead: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/achievements/read", () => ({ readAchievements: m.read }));
vi.mock("@/lib/achievements/image", () => ({ badgeImage: m.image }));
vi.mock("@/lib/achievements/sharing", () => ({ readPublicAchievement: m.publicRead }));
vi.mock("@/lib/achievements/unsubscribe", () => ({ unsubscribeAchievementEmail: m.unsubscribe }));

import { GET as publicImage } from "@/app/(regional)/activity/badge/[token]/image/route";
import { GET as download } from "./badge/[kind]/route";
import { POST as unsubscribe } from "./unsubscribe/route";

describe("achievement route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.session.mockResolvedValue({ user: { id: "owner" } });
    m.image.mockResolvedValue(new Response("image"));
    m.unsubscribe.mockResolvedValue(true);
  });
  it("requires the signed-in owner's earned award for a private image", async () => {
    m.read.mockResolvedValue({ awards: [] });
    expect(
      (
        await download(new Request("https://example.com/api/achievements"), {
          params: Promise.resolve({ kind: "presence" }),
        })
      ).status,
    ).toBe(404);
    expect(m.image).not.toHaveBeenCalled();
    m.read.mockResolvedValue({ awards: [{ kind: "presence", earnedDay: "2026-10-16" }] });
    await download(new Request("https://example.com/api/achievements"), {
      params: Promise.resolve({ kind: "presence" }),
    });
    expect(m.read).toHaveBeenLastCalledWith("owner");
    expect(m.image).toHaveBeenCalledWith("presence", "2026-10-16", true);
  });
  it("a revoked public token never serves a cached image", async () => {
    m.publicRead.mockResolvedValue(null);
    const response = await publicImage(new Request("https://example.com/activity/badge/a/image"), {
      params: Promise.resolve({ token: "a" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(m.image).not.toHaveBeenCalled();
  });
  it("bounds and authenticates category unsubscribe input", async () => {
    expect(
      (
        await unsubscribe(
          new Request("https://example.com/api/achievements/unsubscribe", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(400);
    expect(m.unsubscribe).not.toHaveBeenCalled();
    const response = await unsubscribe(
      new Request("https://example.com/api/achievements/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ token: "signed-example" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(m.unsubscribe).toHaveBeenCalledWith("signed-example");
  });
});
