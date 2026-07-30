import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIndexNowPayload,
  chunkIndexNowUrls,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
  submitToIndexNow,
} from "./indexnow";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function configureIndexNow() {
  vi.stubEnv("SITE_URL", "https://example.com");
  vi.stubEnv("INDEXNOW_KEY", "0000000000000000");
}

describe("IndexNow", () => {
  it("builds a canonical, deduplicated payload", () => {
    configureIndexNow();

    expect(
      buildIndexNowPayload(["/alternatives", "https://example.com/alternatives", "/faq"]),
    ).toEqual({
      host: "example.com",
      key: "0000000000000000",
      keyLocation: "https://example.com/indexnow-key.txt",
      urlList: ["https://example.com/alternatives", "https://example.com/faq"],
    });
  });

  it("rejects empty and foreign-host URL lists", () => {
    configureIndexNow();

    expect(() => buildIndexNowPayload([])).toThrow(/at least one URL/);
    expect(() => buildIndexNowPayload(["https://other.example/faq"])).toThrow(
      /must belong to https:\/\/example.com/,
    );
  });

  it("chunks URL lists at the 10,000 URL boundary", () => {
    const urls = Array.from({ length: INDEXNOW_MAX_URLS + 1 }, (_, index) => `/page-${index}`);

    expect(chunkIndexNowUrls(urls).map((chunk) => chunk.length)).toEqual([10_000, 1]);
  });

  it("does not call fetch when the key is unset", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(submitToIndexNow(["https://example.com/"])).resolves.toEqual({
      ok: false,
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty submission when the key is configured", async () => {
    configureIndexNow();

    await expect(submitToIndexNow([])).rejects.toThrow("at least one URL");
  });

  it("submits each chunk and returns the response status", async () => {
    configureIndexNow();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await expect(submitToIndexNow(["/", "/alternatives"])).resolves.toEqual({
      ok: true,
      status: 202,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      INDEXNOW_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
