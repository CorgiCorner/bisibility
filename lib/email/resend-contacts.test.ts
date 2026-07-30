import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWaitlistSegmentId, syncWaitlistContact } from "./resend-contacts";

describe("resolveWaitlistSegmentId", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("RESEND_SEGMENT_CLOUD", "segment_cloud");
    vi.stubEnv("RESEND_SEGMENT_EARLY_ADOPTERS", "segment_early_adopters");
    vi.stubEnv("RESEND_SEGMENT_GENERAL", "segment_general");
  });

  it.each([
    ["featured_company", "segment_early_adopters"],
    ["cloud_waitlist", "segment_cloud"],
    ["cloud_pricing", "segment_cloud"],
    ["landing_capture", "segment_general"],
    ["changelog", "segment_general"],
  ] as const)("maps %s to its configured segment", (source, expected) => {
    expect(resolveWaitlistSegmentId(source)).toBe(expected);
  });

  it("returns null when the mapped segment is not configured", () => {
    vi.stubEnv("RESEND_SEGMENT_GENERAL", "  ");

    expect(resolveWaitlistSegmentId("landing_capture")).toBeNull();
  });
});

describe("syncWaitlistContact", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("RESEND_API_KEY", "resend_test");
    vi.stubEnv("RESEND_SEGMENT_CLOUD", "segment_cloud");
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
  });

  it("skips contact sync when the API key is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await syncWaitlistContact({
      cloudPrice: null,
      email: "person@example.com",
      source: "cloud_waitlist",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("[waitlist] contact sync skipped"));
  });

  it("warns and resolves when the API returns a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      syncWaitlistContact({
        cloudPrice: null,
        email: "repeat@example.com",
        source: "cloud_waitlist",
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("status 409"));
  });

  it("warns and resolves when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      syncWaitlistContact({
        cloudPrice: null,
        email: "person@example.com",
        source: "cloud_waitlist",
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("[waitlist] contact sync failed.", expect.any(Error));
  });

  it("posts the mapped segment and waitlist properties", async () => {
    await syncWaitlistContact({
      cloudPrice: "$19/mo",
      email: "buyer@example.com",
      source: "cloud_pricing",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/contacts",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer resend_test",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(payload).toEqual({
      email: "buyer@example.com",
      properties: { cloud_price: "$19/mo", source: "cloud_pricing" },
      segments: [{ id: "segment_cloud" }],
      unsubscribed: false,
    });
  });
});
