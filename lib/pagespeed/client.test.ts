import { describe, expect, it, vi } from "vitest";
import { fetchPageSpeed, PageSpeedError } from "./client";
import { fieldPayload, labPayload, originPayload } from "./client.fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchPageSpeed", () => {
  it("prefers field data and keeps the lab blocking time", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(fieldPayload));
    const reading = await fetchPageSpeed("https://example.com/docs", "mobile", {
      apiKey: "test-key",
      fetch: fetchMock,
    });
    expect(reading).toMatchObject({
      cls: 0.02,
      inpMs: 120,
      lcpMs: 2100,
      source: "field",
      totalBlockingTimeMs: 180,
    });
    const called = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(called.searchParams.get("strategy")).toBe("mobile");
    expect(called.searchParams.get("category")).toBe("performance");
    expect(called.searchParams.get("url")).toBe("https://example.com/docs");
    expect(called.searchParams.get("key")).toBe("test-key");
  });

  it("falls through to origin data when the URL has no field metrics", async () => {
    const reading = await fetchPageSpeed("https://example.com/", "desktop", {
      apiKey: "test-key",
      fetch: vi.fn(async () => jsonResponse(originPayload)),
    });
    expect(reading).toMatchObject({ cls: 0.12, inpMs: 240, lcpMs: 3100, source: "origin" });
  });

  it("uses the lab estimate and does not store blocking time as INP", async () => {
    const reading = await fetchPageSpeed("https://example.com/", "mobile", {
      apiKey: "test-key",
      fetch: vi.fn(async () => jsonResponse(labPayload)),
    });
    expect(reading).toMatchObject({
      cls: 0.04,
      inpMs: null,
      lcpMs: 2400,
      source: "lab",
      totalBlockingTimeMs: 180,
    });
  });

  it.each([
    [429, "quota"],
    [400, "invalid_key"],
    [403, "invalid_key"],
    [500, "unreachable"],
  ] as const)("maps HTTP %s to %s without the key", async (status, code) => {
    const error = await fetchPageSpeed("https://example.com/", "mobile", {
      apiKey: "test-key",
      fetch: vi.fn(async () => jsonResponse({ error: { message: "test-key" } }, status)),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PageSpeedError);
    expect(error).toMatchObject({ code, message: code });
    expect(String(error)).not.toContain("test-key");
  });

  it("reports an unreachable host when the request fails", async () => {
    await expect(
      fetchPageSpeed("https://example.com/", "mobile", {
        apiKey: "test-key",
        fetch: vi.fn(async () => {
          throw new Error("https://example.com/?key=test-key");
        }),
      }),
    ).rejects.toMatchObject({ code: "unreachable", message: "unreachable" });
  });

  it("rejects a successful body that has none of the documented metrics", async () => {
    await expect(
      fetchPageSpeed("https://example.com/", "mobile", {
        apiKey: "test-key",
        fetch: vi.fn(async () => jsonResponse({ loadingExperience: { metrics: {} } })),
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
